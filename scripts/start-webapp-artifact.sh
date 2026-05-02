#!/bin/bash
# Artifact workflow Vite dev server — port 19218 (Replit artifact expected port).
set -euo pipefail
cd /home/runner/workspace

PORT=19218
export PORT

# Kill anything on this port using inode lookup in /proc/net/tcp
HEX=$(printf "%04X" "$PORT")
INODES=$(awk -v hex="$HEX" 'NR>1{split($2,a,":");if(toupper(a[2])==hex && $4=="0A")print $10}' \
  /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u)
if [ -n "$INODES" ]; then
  for inode in $INODES; do
    for pid in $(ls /proc/ 2>/dev/null | grep -E '^[0-9]+$'); do
      ls -la /proc/$pid/fd 2>/dev/null | grep -q "socket:\[$inode\]" && \
        kill -9 "$pid" 2>/dev/null && echo "[webapp-artifact] Killed PID $pid (port $PORT)" || true
    done
  done
  sleep 1
fi

echo "[webapp-artifact] Starting Vite on port $PORT..."
exec pnpm --filter @workspace/courier-map exec vite \
  --port "$PORT" \
  --host 0.0.0.0 \
  --strictPort
