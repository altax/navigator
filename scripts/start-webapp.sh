#!/bin/bash
# Starts the Next.js dev server and pre-compiles the main page before Replit
# marks the workflow ready. This prevents the 502 "first-request timeout" that
# happens when the proxy hits an uncompiled page on a fresh import.
set -euo pipefail
cd /home/runner/workspace

PORT=5000
export PORT

echo "[webapp] Starting Next.js on port $PORT…"
pnpm --filter @workspace/courier-map run dev &
NEXT_PID=$!

echo "[webapp] Waiting for port $PORT to open…"
WAITED=0
while ! curl -sf "http://127.0.0.1:$PORT/" -o /dev/null --max-time 1 2>/dev/null; do
  sleep 1
  WAITED=$((WAITED + 1))
  if [ "$WAITED" -ge 120 ]; then
    echo "[webapp] ERROR: port $PORT never opened after 120s — giving up"
    kill "$NEXT_PID" 2>/dev/null || true
    exit 1
  fi
done

echo "[webapp] Port open after ${WAITED}s — pre-compiling main page…"
# This curl triggers Next.js to compile the route so the first real browser
# request returns instantly instead of waiting 3-4s and getting a 502.
curl -sf "http://127.0.0.1:$PORT/" -o /dev/null --max-time 30 2>/dev/null && \
  echo "[webapp] Warmup done — app is ready." || \
  echo "[webapp] Warmup curl failed (non-fatal)."

wait "$NEXT_PID"
