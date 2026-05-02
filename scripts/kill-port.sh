#!/bin/bash
# Kill all processes listening on a given TCP port.
# Usage: bash scripts/kill-port.sh <port>
PORT=$1
[ -z "$PORT" ] && { echo "Usage: $0 <port>"; exit 1; }

HEX=$(printf "%04X" "$PORT")

# Find inode from /proc/net/tcp and /proc/net/tcp6
INODES=$(awk -v hex="$HEX" '
  NR>1 {
    split($2, a, ":"); if (toupper(a[2]) == hex && $4 == "0A") print $10
  }
' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u)

[ -z "$INODES" ] && exit 0

for inode in $INODES; do
  for pid in $(ls /proc/ 2>/dev/null | grep -E '^[0-9]+$'); do
    if ls -la /proc/$pid/fd 2>/dev/null | grep -q "socket:\[$inode\]"; then
      echo "[kill-port] Killing PID $pid (port $PORT, inode $inode)"
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
done

sleep 0.5
