#!/bin/bash
# Starts the Vite dev server for courier-map on PORT (default 5000).
# Uses fuser to free the port first so restarts are clean.
# Called by the "Web App" workflow directly.
set -euo pipefail
cd /home/runner/workspace

PORT=${PORT:-5000}
export PORT

echo "[webapp] Checking dependencies..."
pnpm install --frozen-lockfile --prefer-offline 2>/dev/null || pnpm install

# Free the port (clean restart)
fuser -k ${PORT}/tcp 2>/dev/null || true
sleep 0.5

echo "[webapp] Starting Vite on port $PORT..."
exec pnpm --filter @workspace/courier-map exec vite \
  --port "$PORT" \
  --host 0.0.0.0 \
  --strictPort
