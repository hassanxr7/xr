#!/usr/bin/env bash
# Prove that the newest backup can really be restored: restore it into a temporary database, compare the record counts
# with the manifest, check that the file store matches the attachments, then remove the temporary database.
# Run monthly (see docs/BACKUP-AND-RESTORE.md). Exit code 0 = restore verified.
set -euo pipefail
ENV_FILE="${BACKUP_ENV:-/etc/itrackzen/backup.env}"
set -a; source <(grep -vE '^\s*;|^\s*#|^\s*$' "$ENV_FILE"); set +a
HERE="$(cd "$(dirname "$0")" && pwd)"
RESTORE="${RESTORE_BIN:-$(command -v itz-restore || echo "$HERE/restore.sh")}"
latest="$(ls -d "${BACKUP_DIR:?}"/2*T*Z 2>/dev/null | tail -1)"
[[ -n "$latest" ]] || { echo "no backup found in $BACKUP_DIR" >&2; exit 2; }
TMPDB="itz_restore_check_$$"
fail=0
cleanup() { dropdb --if-exists "$TMPDB" >/dev/null 2>&1 || true; local d; d="$(dirname "$FILESTORE_DIR")/$TMPDB"; [[ -d "$d" && "$d" == *"/itz_restore_check_"* ]] && rm -rf -- "${d:?}"; return 0; }
trap cleanup EXIT
echo "Verifying restore of $latest"
BACKUP_ENV="$ENV_FILE" "$RESTORE" "$latest" "$TMPDB" --neutralize

while IFS='|' read -r table expected; do
  where=""; [[ "$table" == res_users ]] && where="where active"
  actual="$(psql -qAt "$TMPDB" -c "select count(*) from $table $where")"
  if [[ "$actual" == "$expected" ]]; then echo "  ok    $table = $actual"; else echo "  FAIL  $table: backup says $expected, restored $actual"; fail=1; fi
done < "$latest/counts.txt"

# every stored attachment must have its file in the restored file store
missing=0; checked=0
while IFS= read -r path; do
  [[ -z "$path" ]] && continue
  checked=$((checked+1))
  [[ -f "$(dirname "$FILESTORE_DIR")/$TMPDB/$path" ]] || missing=$((missing+1))
done < <(psql -qAt "$TMPDB" -c "select store_fname from ir_attachment where store_fname is not null limit 500")
if [[ $missing -eq 0 ]]; then echo "  ok    file store: $checked attachments checked, none missing"; else echo "  FAIL  file store: $missing of $checked attachment files are missing"; fail=1; fi

# the application must start on the restored data
if [[ -n "${ODOO_BIN:-}" ]]; then
  # shellcheck disable=SC2086
  if out="$($ODOO_BIN shell -c "$ODOO_CONF" -d "$TMPDB" --no-http <<< "print('USERS', env['res.users'].search_count([])); print('OWNER', bool(env.ref('itz_base.group_itz_owner').users)); print('OPEN_JOBS', env['itz.installation'].search_count([('state','in',('scheduled','in_progress'))]))" 2>&1 | grep -E '^(USERS|OWNER|OPEN_JOBS)')"; then
    echo "$out" | sed 's/^/  ok    odoo starts: /'
  else echo "  FAIL  Odoo could not open the restored database"; fail=1; fi
fi
if [[ $fail -eq 0 ]]; then echo "RESTORE VERIFIED"; else echo "RESTORE CHECK FAILED"; exit 1; fi
