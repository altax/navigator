#!/bin/bash
# Artifact API workflow — the authoritative API server on port 8080.
# Kills any existing process on 8080 before starting.
set -euo pipefail
cd /home/runner/workspace

export PORT=8080
export NODE_ENV=development

# Kill anything on port 8080 via inode lookup
HEX=$(printf "%04X" "$PORT")
INODES=$(awk -v hex="$HEX" \
  'NR>1{split($2,a,":");if(toupper(a[2])==hex && $4=="0A")print $10}' \
  /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u)
if [ -n "$INODES" ]; then
  for inode in $INODES; do
    for pid in $(ls /proc/ 2>/dev/null | grep -E '^[0-9]+$'); do
      ls -la /proc/$pid/fd 2>/dev/null | grep -q "socket:\[$inode\]" \
        && kill -9 "$pid" 2>/dev/null \
        && echo "[api-artifact] Killed PID $pid (port $PORT)" || true
    done
  done
  sleep 1
fi

# DB setup
if [ -n "${DATABASE_URL:-}" ]; then
  psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis;" 2>/dev/null || true
  psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS h3_postgis CASCADE;" 2>/dev/null || true
  psql "$DATABASE_URL" << 'SQL' 2>/dev/null || true
CREATE TABLE IF NOT EXISTS pois (
  id SERIAL PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL,
  description TEXT, address TEXT, geom geometry NOT NULL, h3_r9 h3index,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS courier_routes (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  geom geometry NOT NULL, distance_m DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pois_geom_idx ON pois USING GIST(geom);
CREATE INDEX IF NOT EXISTS courier_routes_geom_idx ON courier_routes USING GIST(geom);
CREATE INDEX IF NOT EXISTS pois_h3_r9_idx ON pois(h3_r9);
SQL
fi

echo "[api-artifact] Building API server..."
cd artifacts/api-server
pnpm run build
echo "[api-artifact] Starting API server on port $PORT..."
exec node --enable-source-maps ./dist/index.mjs
