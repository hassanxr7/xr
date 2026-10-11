#!/usr/bin/env bash
# Fresh demo DB + server + browser smoke test of the key workflows. Needs Playwright (PW_MODULE) and Chromium (CHROMIUM).
set -e
cd "$(dirname "$0")/.."
D=${E2E_DIR:-/tmp/bizsuite-e2e}; PORT=${E2E_PORT:-3111}
scripts/devserver.sh start "$D" "$PORT"; trap "scripts/devserver.sh stop $PORT" EXIT   # only this server is stopped afterwards
BASE=http://localhost:$PORT node scripts/e2e-smoke.mjs
