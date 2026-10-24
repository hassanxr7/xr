#!/usr/bin/env bash
# ITrackZen backup: PostgreSQL dump + Odoo file store + manifest with checksums. Optional encryption and off-site copy.
# Settings: /etc/itrackzen/backup.env  (override with BACKUP_ENV=/path/to/file)
set -euo pipefail
ENV_FILE="${BACKUP_ENV:-/etc/itrackzen/backup.env}"
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE" >&2; exit 2; }
# shellcheck disable=SC1090
set -a; source <(grep -vE '^\s*;|^\s*#|^\s*$' "$ENV_FILE"); set +a
: "${DB_NAME:?}" "${BACKUP_DIR:?}" "${FILESTORE_DIR:?}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"; KEEP_MONTHLY="${KEEP_MONTHLY:-12}"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dest="${BACKUP_DIR:?}/$stamp"
mkdir -p "$dest"; chmod 750 "$dest"
log() { echo "[$(date -u +%FT%TZ)] $*"; }
trap 'rc=$?; if [[ $rc -ne 0 ]]; then log "BACKUP FAILED (exit $rc)"; mv "$dest" "$dest.FAILED" 2>/dev/null || true; fi' EXIT

log "database dump"
pg_dump --format=custom --no-owner --no-acl --file="$dest/db.dump" "$DB_NAME"

log "file store"
if [[ -d "$FILESTORE_DIR" ]]; then
  tar -C "$(dirname "$FILESTORE_DIR")" -czf "$dest/filestore.tar.gz" "$(basename "$FILESTORE_DIR")"
else
  log "no file store at $FILESTORE_DIR (nothing attached yet)"; tar -czf "$dest/filestore.tar.gz" --files-from /dev/null
fi

log "manifest"
psql -qAt "$DB_NAME" > "$dest/counts.txt" <<'SQL'
select 'res_users|'||count(*) from res_users where active
union all select 'res_partner|'||count(*) from res_partner
union all select 'stock_lot|'||count(*) from stock_lot
union all select 'itz_vehicle|'||count(*) from itz_vehicle
union all select 'itz_installation|'||count(*) from itz_installation
union all select 'itz_subscription|'||count(*) from itz_subscription
union all select 'sale_order|'||count(*) from sale_order
union all select 'account_move|'||count(*) from account_move
union all select 'account_payment|'||count(*) from account_payment
union all select 'ir_attachment|'||count(*) from ir_attachment
union all select 'itz_audit_log|'||count(*) from itz_audit_log
order by 1;
SQL
{
  echo "{"
  echo "  \"created_utc\": \"$stamp\","
  echo "  \"database\": \"$DB_NAME\","
  echo "  \"odoo\": \"$(psql -qAt "$DB_NAME" -c "select latest_version from ir_module_module where name='base'")\","
  echo "  \"itz_modules\": \"$(psql -qAt "$DB_NAME" -c "select string_agg(name||' '||latest_version, ', ' order by name) from ir_module_module where name like 'itz_%' and state='installed'")\","
  echo "  \"host\": \"$(hostname)\""
  echo "}"
} > "$dest/manifest.json"
( cd "$dest" && sha256sum db.dump filestore.tar.gz counts.txt manifest.json > SHA256SUMS )

if [[ -n "${GPG_PASSPHRASE_FILE:-}" && -f "${GPG_PASSPHRASE_FILE}" ]]; then
  log "encrypting (AES-256)"
  for f in db.dump filestore.tar.gz; do
    gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-file "$GPG_PASSPHRASE_FILE" --symmetric --cipher-algo AES256 -o "$dest/$f.gpg" "$dest/$f"
    shred -u "${dest:?}/${f:?}" 2>/dev/null || unlink "${dest:?}/${f:?}"
  done
  ( cd "$dest" && unlink SHA256SUMS && sha256sum db.dump.gpg filestore.tar.gz.gpg counts.txt manifest.json > SHA256SUMS )
fi

if [[ -n "${OFFSITE_RSYNC:-}" ]]; then
  log "off-site copy to $OFFSITE_RSYNC"
  rsync -a --delete-after "$BACKUP_DIR/" "$OFFSITE_RSYNC" || { log "OFF-SITE COPY FAILED"; exit 3; }
fi

log "pruning: keep $RETENTION_DAYS days, plus the first backup of each of the last $KEEP_MONTHLY months"
keep_months="$(for i in $(seq 0 "$KEEP_MONTHLY"); do date -u -d "-$i month" +%Y%m; done)"
for d in "${BACKUP_DIR:?}"/2*T*Z; do
  [[ -d "$d" ]] || continue
  name="$(basename "$d")"; month="${name:0:6}"
  age_days=$(( ( $(date -u +%s) - $(date -u -d "${name:0:4}-${name:4:2}-${name:6:2}" +%s) ) / 86400 ))
  [[ $age_days -le $RETENTION_DAYS ]] && continue
  first_of_month="$(ls -d "$BACKUP_DIR/${month}"*T*Z 2>/dev/null | head -1)"
  if grep -q "$month" <<<"$keep_months" && [[ "$d" == "$first_of_month" ]]; then continue; fi
  rm -rf -- "${d:?}"
done
find "${BACKUP_DIR:?}" -maxdepth 1 -name '*.FAILED' -mtime +7 -exec rm -rf -- {} +

trap - EXIT
log "backup OK: $dest ($(du -sh "$dest" | cut -f1))"
echo "$dest"
