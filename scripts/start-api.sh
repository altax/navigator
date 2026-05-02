#!/bin/bash
# Unified API server startup: bootstrap + build + run.
# Called by both the legacy "API Server" workflow and
# the "artifacts/api-server: API Server" artifact workflow.
set -euo pipefail
cd /home/runner/workspace

export PORT=${PORT:-8080}
export NODE_ENV=development

bash scripts/bootstrap.sh

echo "[api] Building and starting API server on port $PORT…"
cd artifacts/api-server
pnpm run build
exec node --enable-source-maps ./dist/index.mjs
