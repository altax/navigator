#!/bin/bash
# Starts the Next.js dev server on PORT (default 5000).
# Uses fuser to free the port first so restarts are clean.
# Called by the artifact workflow "artifacts/courier-map: web".
set -euo pipefail
cd /home/runner/workspace

PORT=${PORT:-5000}
export PORT

# Ensure workspace dependencies are installed
echo "[webapp] Checking dependencies..."
pnpm install --frozen-lockfile --prefer-offline 2>/dev/null || pnpm install --frozen-lockfile

# Free the port (clean restart)
fuser -k ${PORT}/tcp 2>/dev/null || true
sleep 1

echo "[webapp] Starting Next.js on port $PORT..."
cd artifacts/courier-map
node_modules/.bin/next dev -p "$PORT" -H 0.0.0.0 &
NEXT_PID=$!
cd /home/runner/workspace

echo "[webapp] Waiting for port $PORT to open..."
WAITED=0
while ! curl -sf "http://127.0.0.1:$PORT/" -o /dev/null --max-time 1 2>/dev/null; do
  sleep 1
  WAITED=$((WAITED + 1))
  if [ "$WAITED" -ge 120 ]; then
    echo "[webapp] ERROR: port $PORT never opened after 120s"
    kill "$NEXT_PID" 2>/dev/null || true
    exit 1
  fi
done

echo "[webapp] Port open after ${WAITED}s — pre-compiling main page..."
curl -sf "http://127.0.0.1:$PORT/" -o /dev/null --max-time 30 2>/dev/null && \
  echo "[webapp] Warmup done — app is ready." || \
  echo "[webapp] Warmup curl failed (non-fatal)."

wait "$NEXT_PID"
