#!/bin/bash
# API server startup: DB setup + build + run.
# The heavy GIS data pipeline (bootstrap.sh) runs in the background
# so the API server starts immediately without waiting for downloads.
set -euo pipefail
cd /home/runner/workspace

export PORT=${PORT:-8080}
export NODE_ENV=development

# ── 1. pnpm dependencies ─────────────────────────────────────────────
echo "[api] Checking dependencies..."
pnpm install --frozen-lockfile --prefer-offline 2>/dev/null \
  || pnpm install --frozen-lockfile
echo "[api] Dependencies OK."

# ── 2. Database setup only (fast — skips GIS data pipeline) ──────────
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

# ── 3. Start GIS data pipeline in the background ─────────────────────
# bootstrap.sh handles OSM download, GeoJSON export, fonts, and GraphHopper JAR.
# It is idempotent — safe to run when data already exists (fast no-op).
# Run in its own subshell so it doesn't block the API server.
(bash scripts/bootstrap.sh >> /tmp/bootstrap.log 2>&1) &
echo "[api] GIS data pipeline running in background. Logs: /tmp/bootstrap.log"

# ── 4. Build and start the API server immediately ─────────────────────
echo "[api] Building API server…"
cd artifacts/api-server
pnpm run build
echo "[api] Starting API server on port $PORT…"
exec node --enable-source-maps ./dist/index.mjs
