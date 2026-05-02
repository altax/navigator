#!/bin/bash
set -euo pipefail
cd /home/runner/workspace

PMTILES=data/spb-lo.pmtiles
GEOJSON=data/spb-lo-filtered.geojsonseq
OSM_PBF=data/spb-lo-filtered.osm.pbf

# Build PMTiles if missing or just header (≤ 64KB)
NEED_BUILD=false
if [ ! -f "$PMTILES" ]; then NEED_BUILD=true; fi
if [ -f "$PMTILES" ] && [ "$(stat -c%s "$PMTILES")" -lt 65536 ]; then NEED_BUILD=true; fi

if [ "$NEED_BUILD" = "true" ]; then
  # Wait up to 10 min for bootstrap to finish generating GeoJSON
  WAIT=0
  while [ ! -f "$GEOJSON" ] || [ "$(stat -c%s "$GEOJSON")" -lt 1000000 ]; do
    if [ "$WAIT" -ge 600 ]; then
      echo "[martin/run.sh] ERROR: $GEOJSON still not ready after 10 min" >&2
      exit 1
    fi
    echo "[martin/run.sh] Waiting for $GEOJSON to be ready (bootstrap generating data)… ${WAIT}s"
    sleep 15
    WAIT=$((WAIT + 15))
  done

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
