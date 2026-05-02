#!/bin/bash
# API server startup: DB setup + bootstrap.
# The actual HTTP server (port 8080) is managed by the
# "artifacts/api-server: API Server" workflow which runs start-api-artifact.sh.
# This script handles one-time setup so the Project workflow stays clean.
set -euo pipefail
cd /home/runner/workspace

export PORT=${PORT:-8080}
export NODE_ENV=development

# ── 1. pnpm dependencies ─────────────────────────────────────────────
echo "[api] Checking dependencies..."
pnpm install --frozen-lockfile --prefer-offline 2>/dev/null \
  || pnpm install --frozen-lockfile
echo "[api] Dependencies OK."

# ── 2. Database setup ─────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[api] WARNING: DATABASE_URL not set — skipping DB setup."
else
  echo "[api] Initialising PostgreSQL extensions and tables…"

  psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis;"            2>/dev/null || true
  psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS h3_postgis CASCADE;" 2>/dev/null || true

  psql "$DATABASE_URL" << 'SQL'
CREATE TABLE IF NOT EXISTS pois (
  id            SERIAL PRIMARY KEY,
  type          TEXT        NOT NULL,
  title         TEXT        NOT NULL,
  description   TEXT,
  address       TEXT,
  geom          geometry    NOT NULL,
  h3_r9         h3index,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courier_routes (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  description   TEXT,
  geom          geometry    NOT NULL,
  distance_m    DOUBLE PRECISION,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pois_geom_idx           ON pois           USING GIST(geom);
CREATE INDEX IF NOT EXISTS courier_routes_geom_idx  ON courier_routes USING GIST(geom);
CREATE INDEX IF NOT EXISTS pois_h3_r9_idx          ON pois(h3_r9);
SQL

  echo "[api] Database OK."
fi

# ── 3. Start GIS data pipeline in background ──────────────────────────
(bash scripts/bootstrap.sh >> /tmp/bootstrap.log 2>&1) &
echo "[api] GIS data pipeline running in background. Logs: /tmp/bootstrap.log"

# ── 4. Wait for the artifact API server to come up on port 8080 ──────
echo "[api] Waiting for API server on port $PORT (started by artifact workflow)..."
HEX=$(printf "%04X" "$PORT")
for i in $(seq 1 60); do
  if awk -v hex="$HEX" \
    'NR>1{split($2,a,":");if(toupper(a[2])==hex && $4=="0A"){found=1;exit}} END{exit !found}' \
    /proc/net/tcp /proc/net/tcp6 2>/dev/null; then
    echo "[api] API server is up on port $PORT."
    break
  fi
  sleep 2
done

# Stay alive so this workflow keeps running
exec tail -f /dev/null
