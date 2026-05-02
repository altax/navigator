#!/bin/bash
set -euo pipefail
cd /home/runner/workspace

PMTILES=data/spb-lo.pmtiles
GEOJSON=data/spb-lo-filtered.geojsonseq

# Build PMTiles if missing or just header (≤ 64KB)
NEED_BUILD=false
if [ ! -f "$PMTILES" ]; then NEED_BUILD=true; fi
if [ -f "$PMTILES" ] && [ "$(stat -c%s "$PMTILES")" -lt 65536 ]; then NEED_BUILD=true; fi

if [ "$NEED_BUILD" = "true" ]; then
  if [ ! -f "$GEOJSON" ]; then
    echo "[martin/run.sh] ERROR: $GEOJSON missing — extract via osmium first" >&2
    sleep 5
    exit 1
  fi
  echo "[martin/run.sh] Building $PMTILES from $GEOJSON via tippecanoe…"
  rm -f "$PMTILES"
  tippecanoe -o "$PMTILES" -z14 -Z6 \
    --drop-densest-as-needed \
    --extend-zooms-if-still-dropping \
    --no-feature-limit --no-tile-size-limit \
    --force -l osm "$GEOJSON"
  echo "[martin/run.sh] PMTiles built: $(ls -lh $PMTILES | awk '{print $5}')"
fi

echo "[martin/run.sh] Starting Martin tile server on :3000…"
exec ./tools/martin --config stack/martin/config.yaml
