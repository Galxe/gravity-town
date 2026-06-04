#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$DIR/.frontend.pid"

if [[ ! -f "$PIDFILE" ]]; then
    echo "No pidfile found, frontend not running (or started outside this script)."
    exit 0
fi

PID="$(cat "$PIDFILE")"
if kill -0 "$PID" 2>/dev/null; then
    echo "Stopping frontend (PID $PID)..."
    kill "$PID"
    for i in {1..10}; do
        kill -0 "$PID" 2>/dev/null || break
        sleep 0.5
    done
    if kill -0 "$PID" 2>/dev/null; then
        echo "Force killing..."
        kill -9 "$PID" 2>/dev/null || true
    fi
    echo "Frontend stopped."
else
    echo "Process $PID not running, cleaning up pidfile."
fi

rm -f "$PIDFILE"
