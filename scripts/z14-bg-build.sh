#!/bin/bash
# z14 фоновая сборка — запускается из martin/run.sh через setsid
# ВАЖНО: этот скрипт работает независимо от Martin process-group
cd /home/runner/workspace

TOOLS=./tools
TMP_MBT=data/spb-lo-z14-build.mbtiles
TMP_PMT=data/spb-lo-z14-build.pmtiles
FINAL=data/spb-lo.pmtiles
GEOJSON=data/spb-lo-filtered.geojsonseq
LOG=data/z14-build.log

exec >> "$LOG" 2>&1
echo "[z14-bg] === Started: $(date) PID=$$"
echo "[z14-bg] Source: $(du -sh $GEOJSON | cut -f1)"

# Не запускать если уже идёт сборка
if pgrep -f "z14-bg-build.sh" | grep -v "^$$\$" > /dev/null 2>&1; then
  echo "[z14-bg] Another build already running — exiting"
  exit 0
fi

rm -f "$TMP_MBT" "$TMP_PMT"

echo "[z14-bg] Starting tippecanoe z5→z14..."
tippecanoe -o "$TMP_MBT" \
  -z14 -Z5 \
  --no-tile-size-limit \
  --no-feature-limit \
  --simplification=4 \
  --buffer=4 \
  -y building \
  -y "building:levels" \
  -y min_height \
  -y highway \
  -y bridge \
  -y tunnel \
  -y covered \
  -y waterway \
  -y natural \
  -y water \
  -y landuse \
  -y name \
  -y "name:ru" \
  -y "addr:housenumber" \
  -y "addr:street" \
  -y place \
  -y railway \
  -y station \
  -y subway \
  -y network \
  -y cycleway \
  -y bicycle \
  -y footway \
  -y crossing \
  -y ref \
  --force \
  -l osm \
  "$GEOJSON"

EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "[z14-bg] ERROR: tippecanoe exit=$EXIT_CODE"
  exit 1
fi
echo "[z14-bg] tippecanoe done: $(ls -lh $TMP_MBT | awk '{print $5}')"

echo "[z14-bg] Converting MBTiles→PMTiles..."
$TOOLS/pmtiles convert "$TMP_MBT" "$TMP_PMT"

echo "[z14-bg] Fixing PMTiles header (mvt+gzip)..."
cat > /tmp/z14_hdr.json << 'EOF'
{"tile_compression":"gzip","tile_type":"mvt","bounds":[27.5,58.3,36.5,61.5],"center":[30.316,59.939,14],"minzoom":5,"maxzoom":14}
EOF
$TOOLS/pmtiles edit --header-json /tmp/z14_hdr.json "$TMP_PMT"

SZ=$(ls -lh "$TMP_PMT" | awk '{print $5}')
echo "[z14-bg] PMTiles OK: $SZ"
$TOOLS/pmtiles show "$TMP_PMT"

echo "[z14-bg] Replacing live file atomically..."
mv "$TMP_PMT" "$FINAL"
rm -f "$TMP_MBT" "${TMP_MBT}-journal"

echo "[z14-bg] Done: $(date)"
echo "[z14-bg] Restarting Martin for z14 tiles..."
pkill -f "martin --config" 2>/dev/null || true
