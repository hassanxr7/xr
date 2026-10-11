#!/usr/bin/env bash
# Fresh demo DB + server + exhaustive browser sweep (English + Somali, all roles). Needs Playwright (PW_MODULE) and Chromium (CHROMIUM).
set -e
cd "$(dirname "$0")/.."
D=${E2E_DIR:-/tmp/bizsuite-sweep}; PORT=${E2E_PORT:-3556}
node scripts/ui-strings.mjs "$D-strings.json" 2>/dev/null || { mkdir -p "$(dirname "$D")"; node scripts/ui-strings.mjs "$D-strings.json"; }
scripts/devserver.sh start "$D" "$PORT"; trap "scripts/devserver.sh stop $PORT" EXIT
UI_STRINGS="$D-strings.json" BASE=http://localhost:$PORT node scripts/e2e-sweep.mjs "$@"
