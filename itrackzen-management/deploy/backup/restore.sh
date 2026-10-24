#!/usr/bin/env bash
# Restore an ITrackZen backup into a database.
#   itz-restore <backup-folder> <target-database> [--neutralize] [--force]
# --neutralize  switches off outgoing email, scheduled jobs and the integrations in the restored copy (use for tests and staging)
# --force       drop the target database first if it exists
set -euo pipefail
ENV_FILE="${BACKUP_ENV:-/etc/itrackzen/backup.env}"
set -a; source <(grep -vE '^\s*;|^\s*#|^\s*$' "$ENV_FILE"); set +a
SRC="${1:-}"; TARGET="${2:-}"; shift 2 || true
NEUTRALIZE=0; FORCE=0
for a in "$@"; do case "$a" in --neutralize) NEUTRALIZE=1;; --force) FORCE=1;; *) echo "unknown option $a" >&2; exit 1;; esac; done
[[ -d "$SRC" && -n "$TARGET" ]] || { echo "usage: itz-restore <backup-folder> <target-database> [--neutralize] [--force]"; exit 1; }
[[ "$TARGET" != "$DB_NAME" || $FORCE -eq 1 ]] || { echo "refusing to overwrite the live database $DB_NAME without --force"; exit 1; }
log() { echo "[$(date -u +%FT%TZ)] $*"; }

log "checking files"
( cd "$SRC" && sha256sum --quiet -c SHA256SUMS ) || { echo "CHECKSUM MISMATCH: this backup is damaged" >&2; exit 4; }

tmp="$(mktemp -d)"; trap 'rm -rf -- "${tmp:?}"' EXIT
dump="$SRC/db.dump"; fs="$SRC/filestore.tar.gz"
if [[ -f "$SRC/db.dump.gpg" ]]; then
  [[ -f "${GPG_PASSPHRASE_FILE:-}" ]] || { echo "backup is encrypted: GPG_PASSPHRASE_FILE is not set" >&2; exit 5; }
  log "decrypting"
  gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$GPG_PASSPHRASE_FILE" -d -o "$tmp/db.dump" "$SRC/db.dump.gpg"
  gpg --batch --quiet --pinentry-mode loopback --passphrase-file "$GPG_PASSPHRASE_FILE" -d -o "$tmp/filestore.tar.gz" "$SRC/filestore.tar.gz.gpg"
  dump="$tmp/db.dump"; fs="$tmp/filestore.tar.gz"
fi

if psql -lqt postgres | cut -d'|' -f1 | grep -qw "$TARGET"; then
  [[ $FORCE -eq 1 || "$TARGET" != "$DB_NAME" ]] || exit 1
  log "dropping existing $TARGET"; dropdb "$TARGET"
fi
log "creating $TARGET and loading the dump"
createdb "$TARGET"
pg_restore --no-owner --no-acl --exit-on-error -d "$TARGET" "$dump"

data_dir="$(dirname "$FILESTORE_DIR")"
log "restoring file store into $data_dir/$TARGET"
mkdir -p "${data_dir:?}"
# Extract in a scratch folder first: the archive contains the ORIGINAL database name as its folder, and extracting it
# straight into the data folder would overwrite the live file store when restoring a copy next to the live system.
scratch="$tmp/fs"; mkdir -p "$scratch"
tar -C "$scratch" -xzf "$fs"
src_name="$(ls -1 "$scratch" | sed -n '1p')"
if [[ -n "$src_name" ]]; then
  [[ -d "${data_dir:?}/${TARGET:?}" ]] && rm -rf -- "${data_dir:?}/${TARGET:?}"
  mv "$scratch/$src_name" "${data_dir:?}/${TARGET:?}"
else
  mkdir -p "${data_dir:?}/${TARGET:?}"      # the backup had no attachments yet
fi
chown -R "$(stat -c %u:%g "$data_dir")" "${data_dir:?}/${TARGET:?}" 2>/dev/null || true

if [[ $NEUTRALIZE -eq 1 ]]; then
  log "neutralizing (no emails, no scheduled jobs, integrations off)"
  # shellcheck disable=SC2086
  $ODOO_BIN neutralize -c "$ODOO_CONF" -d "$TARGET" >/dev/null
  psql -qAt "$TARGET" -c "update itz_platform_config set mode='disabled'; update itz_website_config set enabled=false" >/dev/null 2>&1 || true
fi
log "restore OK -> database $TARGET"
