#!/usr/bin/env bash
# Restores a SMSBridge Postgres backup produced by scripts/backup.sh.
# This REPLACES the current database contents.
#
# Usage: ./scripts/restore.sh path/to/smsbridge-<timestamp>.sql.gz
set -euo pipefail

cd "$(dirname "$0")/.."
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 path/to/backup.sql.gz" >&2
  exit 1
fi
if [ ! -f .env ]; then
  echo "deployment/.env not found. Copy .env.example to .env first." >&2
  exit 1
fi
set -a
source .env
set +a

echo "This will REPLACE all data in database '${POSTGRES_DB}' with the contents of:"
echo "  ${BACKUP_FILE}"
read -r -p "Type 'restore' to continue: " CONFIRM
if [ "$CONFIRM" != "restore" ]; then
  echo "Aborted."
  exit 1
fi

echo "Stopping the API so it can't write during restore..."
docker compose stop api

echo "Dropping and recreating '${POSTGRES_DB}'..."
docker compose exec -T postgres psql -U "${POSTGRES_USER}" -d postgres \
  -c "DROP DATABASE IF EXISTS \"${POSTGRES_DB}\";" \
  -c "CREATE DATABASE \"${POSTGRES_DB}\" OWNER \"${POSTGRES_USER}\";"

echo "Restoring from ${BACKUP_FILE}..."
gunzip -c "${BACKUP_FILE}" | docker compose exec -T postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

echo "Restarting the API (this also re-applies any migrations newer than the backup)..."
docker compose up -d api

echo "Restore complete."
