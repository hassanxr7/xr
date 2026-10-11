#!/usr/bin/env bash
# usage: scripts/devserver.sh start <dir> <port> | stop <port>   (fresh demo DB per start; pid kept in /tmp/bizsuite-<port>.pid)
cd "$(dirname "$0")/.."
case "$1" in
  start) rm -rf "$2"; mkdir -p "$2"; DATA_DIR="$2" PORT="$3" BACKUP_AUTO=0 node --disable-warning=ExperimentalWarning src/server.js > "$2/server.log" 2>&1 & echo $! > /tmp/bizsuite-$3.pid
         for i in $(seq 1 40); do curl -sf localhost:$3/api/health >/dev/null && echo "up on $3" && exit 0; sleep 0.5; done; echo "failed to start"; cat "$2/server.log"; exit 1;;
  stop) [ -f /tmp/bizsuite-$2.pid ] && kill $(cat /tmp/bizsuite-$2.pid) 2>/dev/null; rm -f /tmp/bizsuite-$2.pid;;
esac
