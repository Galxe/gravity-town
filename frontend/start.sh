#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$DIR/.frontend.pid"

CONFIG="${1:-localhost}"
PORT="${2:-3000}"
HOST="${3:-0.0.0.0}"

if [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
    echo "Frontend already running (PID $(cat "$PIDFILE")), port $PORT"
    echo "Run ./stop.sh to stop it first."
    exit 1
fi

echo "Starting frontend (config=$CONFIG, host=$HOST, port=$PORT)..."
cd "$DIR"
APP_CONFIG="$CONFIG" nohup npm run dev -- -H "$HOST" -p "$PORT" > "$DIR/.frontend.log" 2>&1 &
echo $! > "$PIDFILE"
echo "Frontend started (PID $(cat "$PIDFILE")), log: .frontend.log"
