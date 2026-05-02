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

  echo "[bootstrap] Database OK."
fi

# ── 3. GIS data pipeline ─────────────────────────────────────────────
#
# Large GIS files (>100 MB) cannot be committed to GitHub directly, so they
# are excluded from the repository (.gitignore) and generated here on first
# run after a fresh import. Each step is skipped if its output already
# exists and is a real file (not a tiny LFS pointer stub).
#
# Pipeline:
#   Geofabrik (NW Federal District, ~600 MB)
#     └─> osmium extract (bbox SPb+LO)  ──> data/spb-lo-filtered.osm.pbf
#           └─> osmium export (GeoJSON)  ──> data/spb-lo-filtered.geojsonseq
#                 └─> tippecanoe          ──> data/spb-lo.pmtiles  [martin/run.sh]
#           └─> GraphHopper import        ──> data/graphhopper/spb-lo-ebike-gh/  [gh/run.sh]

# Helper: true if file exists AND is at least min_bytes large.
# LFS pointer stubs are exactly 134 bytes — they always fail this check.
is_valid() {
  local f="$1"
  local min_bytes="${2:-1048576}"   # default 1 MB
  [ -f "$f" ] && [ "$(stat -c%s "$f")" -ge "$min_bytes" ]
}

OSM_PBF=data/spb-lo-filtered.osm.pbf
GEOJSON=data/spb-lo-filtered.geojsonseq
NW_TMP=/tmp/nw-fed-district.osm.pbf

# ── 3a. Ensure spb-lo-filtered.osm.pbf ───────────────────────────────
if ! is_valid "$OSM_PBF" 10000000; then
  echo "[bootstrap] $OSM_PBF missing or invalid — fetching OSM data from Geofabrik…"

  # Download NW Federal District to /tmp (skipped if already there from a
  # previous interrupted attempt, saving time on retry).
  if ! is_valid "$NW_TMP" 100000000; then
    echo "[bootstrap] Downloading NW Federal District (≈600 MB) — please wait…"
    curl -L --fail --retry 3 --retry-delay 10 \
         --progress-bar \
         -o "$NW_TMP" \
         "https://download.geofabrik.de/russia/northwestern-fed-district-latest.osm.pbf"
    echo "[bootstrap] Download complete: $(du -sh "$NW_TMP" | cut -f1)"
  else
    echo "[bootstrap] Using cached $NW_TMP ($(du -sh "$NW_TMP" | cut -f1))"
  fi

  echo "[bootstrap] Extracting SPb+LO area (bbox 27.5,58.3,36.5,61.5)…"
  osmium extract \
    --bbox "27.5,58.3,36.5,61.5" \
    --strategy smart \
    --overwrite \
    -o "$OSM_PBF" \
    "$NW_TMP"
  echo "[bootstrap] Extraction done: $(du -sh "$OSM_PBF" | cut -f1)"

  # Free disk space — the large source file is no longer needed.
  rm -f "$NW_TMP"
  echo "[bootstrap] $OSM_PBF ready."
fi

# ── 3b. Generate GeoJSON sequence for Martin tile server ─────────────
if ! is_valid "$GEOJSON" 1000000; then
  echo "[bootstrap] $GEOJSON missing or invalid — generating from $OSM_PBF…"
  osmium export \
    --geometry-types=linestring,polygon,point \
    --output-format=geojsonseq \
    --overwrite \
    -o "$GEOJSON" \
    "$OSM_PBF"
  echo "[bootstrap] GeoJSON ready: $(du -sh "$GEOJSON" | cut -f1)"
fi

# ── 3c. PMTiles ───────────────────────────────────────────────────────
# Built automatically by stack/martin/run.sh using tippecanoe.
# Nothing to do here — martin/run.sh waits for GEOJSON if needed.

# ── 3d. GraphHopper JAR ───────────────────────────────────────────────
GH_JAR=data/graphhopper-web-10.0.jar
GH_VERSION="10.0"
if ! is_valid "$GH_JAR" 10000000; then
  echo "[bootstrap] $GH_JAR missing — downloading GraphHopper $GH_VERSION…"
  curl -L --fail --retry 3 \
    --progress-bar \
    -o "$GH_JAR" \
    "https://github.com/graphhopper/graphhopper/releases/download/$GH_VERSION/graphhopper-web-$GH_VERSION.jar"
  echo "[bootstrap] GraphHopper JAR ready: $(du -sh "$GH_JAR" | cut -f1)"
fi

# ── 3e. Map fonts ─────────────────────────────────────────────────────
mkdir -p data/fonts
for FONT in NotoSans-Regular.ttf NotoSans-Bold.ttf; do
  if [ ! -f "data/fonts/$FONT" ]; then
    echo "[bootstrap] Downloading font $FONT…"
    curl -L --fail --retry 3 --silent \
      -o "data/fonts/$FONT" \
      "https://github.com/notofonts/latin-greek-cyrillic/raw/main/fonts/NotoSans/hinted/ttf/$FONT" \
    || curl -L --fail --retry 3 --silent \
         -o "data/fonts/$FONT" \
         "https://github.com/notofonts/noto-fonts/raw/main/hinted/ttf/NotoSans/$FONT" \
    || echo "[bootstrap] WARNING: could not download $FONT — map labels may be missing."
  fi
done

echo "[bootstrap] Data files OK."
echo "[bootstrap] ── Setup complete! Services will start now. ─────────"
