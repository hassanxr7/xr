#!/usr/bin/env bash
# Dumps the SMSBridge Postgres database to a timestamped, gzip-compressed
# SQL file. Run this from the deployment/ directory (or pass its path).
#
# Usage: ./scripts/backup.sh [output-directory]
#
# This backs up the database only. It does not on its own encrypt the
# backup file or ship it offsite -- see deployment/README.md's "Backups"
# section for how to add encryption (age/gpg) and offsite rotation, and for
# how backup retention relates to the app's own message-retention setting
# (a message the app has "deleted" can still be sitting in an old backup
# until that backup itself expires/rotates -- that is expected, not a bug).
set -euo pipefail

cd "$(dirname "$0")/.."
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"

if [ ! -f .env ]; then
  echo "deployment/.env not found. Copy .env.example to .env first." >&2
  exit 1
fi
set -a
source .env
set +a

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT_FILE="$OUT_DIR/smsbridge-${TIMESTAMP}.sql.gz"

echo "Dumping database '${POSTGRES_DB}' to ${OUT_FILE} ..."
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" | gzip > "${OUT_FILE}"
echo "Done: ${OUT_FILE} ($(du -h "${OUT_FILE}" | cut -f1))"
