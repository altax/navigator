#!/bin/bash
# Starts the Vite dev server for the artifact workflow (port 5001).
# Runs independently from the main Web App workflow (port 5000).
set -euo pipefail
cd /home/runner/workspace

PORT=5001
export PORT

echo "[webapp-artifact] Checking dependencies..."
pnpm install --frozen-lockfile --prefer-offline 2>/dev/null || pnpm install

fuser -k ${PORT}/tcp 2>/dev/null || true
sleep 0.3

echo "[webapp-artifact] Starting Vite on port $PORT..."
exec pnpm --filter @workspace/courier-map exec vite \
  --port "$PORT" \
  --host 0.0.0.0 \
  --strictPort
