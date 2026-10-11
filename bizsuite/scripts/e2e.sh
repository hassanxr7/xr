#!/usr/bin/env bash
# Fresh demo database + server + browser smoke test. Needs Playwright (PW_MODULE) and Chromium.
set -e
cd "$(dirname "$0")/.."
D=${E2E_DIR:-/tmp/bizsuite-e2e}; PORT=${E2E_PORT:-3111}; rm -rf "$D"; mkdir -p "$D"
for p in $(ps aux | grep "[s]rc/server.js" | awk '{print $2}'); do kill $p 2>/dev/null || true; done; sleep 1
DATA_DIR=$D PORT=$PORT BACKUP_AUTO=0 node --disable-warning=ExperimentalWarning src/server.js > "$D/server.log" 2>&1 &
SRV=$!; trap "kill $SRV 2>/dev/null" EXIT
for i in $(seq 1 30); do curl -sf localhost:$PORT/api/health >/dev/null && break; sleep 0.5; done
BASE=http://localhost:$PORT node scripts/e2e-smoke.mjs
