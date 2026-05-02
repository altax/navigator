#!/bin/bash
# Bootstrap script — runs automatically on fresh Replit import or any start.
# Idempotent: safe to run repeatedly, skips steps that are already done.
set -euo pipefail

cd /home/runner/workspace

echo "[bootstrap] ── Courier Map Setup ───────────────────────────────"

# ── 1. pnpm dependencies ─────────────────────────────────────────────
# Fast no-op when node_modules already exist; installs on fresh import.
echo "[bootstrap] Installing pnpm workspace dependencies…"
pnpm install --frozen-lockfile --prefer-offline 2>/dev/null \
  || pnpm install --frozen-lockfile
echo "[bootstrap] Dependencies OK."

# ── 2. Database setup ────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[bootstrap] WARNING: DATABASE_URL not set — skipping DB setup."
else
  echo "[bootstrap] Initialising PostgreSQL extensions and tables…"

  # PostGIS must come before h3_postgis (CASCADE handles it but be explicit)
  psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis;"        2>/dev/null || true
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

CREATE INDEX IF NOT EXISTS pois_geom_idx          ON pois           USING GIST(geom);
CREATE INDEX IF NOT EXISTS courier_routes_geom_idx ON courier_routes USING GIST(geom);
CREATE INDEX IF NOT EXISTS pois_h3_r9_idx         ON pois(h3_r9);
SQL

  echo "[bootstrap] Database OK."
fi

# ── 3. Data files check ───────────────────────────────────────────────
# All binary data files are committed to git (PMTiles, OSM PBF, GH graph,
# fonts, JAR). If they're missing it means git clone was incomplete.
MISSING=0
for f in data/spb-lo.pmtiles data/spb-lo.osm.pbf data/graphhopper-web-10.0.jar \
          data/fonts/NotoSans-Bold.ttf data/fonts/NotoSans-Regular.ttf; do
  if [ ! -f "$f" ]; then
    echo "[bootstrap] WARNING: missing $f — map may not work correctly."
    MISSING=$((MISSING + 1))
  fi
done

if [ "$MISSING" -eq 0 ]; then
  echo "[bootstrap] Data files OK."
fi

echo "[bootstrap] ── Setup complete! Services will start now. ─────────"
