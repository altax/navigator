#!/bin/bash
# "Web App" relay — part of the Project parallel workflow.
# Installs deps and waits. The actual Next.js server is owned
# by the "artifacts/courier-map: web" artifact workflow.
set -euo pipefail
cd /home/runner/workspace

echo "[webapp-relay] Installing workspace dependencies..."
pnpm install --frozen-lockfile --prefer-offline 2>/dev/null || pnpm install --frozen-lockfile
echo "[webapp-relay] Dependencies ready — Next.js managed by artifact workflow."

# Stay alive so the Project workflow keeps reporting "running".
exec sleep infinity
