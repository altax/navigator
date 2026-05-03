#!/bin/bash
# Starts all services: Martin, GraphHopper, API server (background) + Web App (foreground).
set -euo pipefail
cd /home/runner/workspace

# Kill any previous instances on their ports cleanly
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 8080/tcp 2>/dev/null || true
fuser -k 5000/tcp 2>/dev/null || true
sleep 0.5

# Start background services
bash stack/martin/run.sh >> /tmp/martin.log 2>&1 &
bash stack/graphhopper/run.sh >> /tmp/graphhopper.log 2>&1 &
bash scripts/start-api.sh >> /tmp/api.log 2>&1 &

# Start web app in foreground (this is what Replit's webview watches)
exec bash scripts/start-webapp.sh
