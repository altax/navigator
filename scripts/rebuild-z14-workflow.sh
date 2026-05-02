#!/bin/bash
# Пересборка PMTiles z5-z14 как Replit workflow.
# Запускается отдельным workflow и не мешает Martin (z12 продолжает работать).
cd /home/runner/workspace

TOOLS=./tools
TMP_MBT=data/spb-lo-build.mbtiles
TMP_PMT=data/spb-lo-build.pmtiles
FINAL=data/spb-lo.pmtiles
GEOJSON=data/spb-lo-filtered.geojsonseq

echo "[z14-build] Started: $(date)"
echo "[z14-build] Source: $(du -sh $GEOJSON | cut -f1), $(wc -l < $GEOJSON) features"

rm -f "$TMP_MBT" "$TMP_PMT"

echo "[z14-build] Running tippecanoe z5→z14 (no tile-size-limit, attribute-filtered)..."
echo "[z14-build] Estimated time: 30-60 minutes for 4.9M features"

# Ключевые настройки:
# --no-tile-size-limit     — убираем ограничение размера тайла (иначе обрезает до z12)
# --no-feature-limit       — убираем ограничение числа фич
# --simplification=4       — лёгкое упрощение (память vs детализация)
# -y ...                   — только нужные атрибуты (сокращает тайлы на 80%)
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
  echo "[z14-build] ERROR: tippecanoe failed (exit=$EXIT_CODE)" >&2
  exit 1
fi

SZ=$(ls -lh "$TMP_MBT" | awk '{print $5}')
echo "[z14-build] tippecanoe OK: $SZ"

# Конвертируем SQLite→PMTiles (tippecanoe v2.78 пишет SQLite)
echo "[z14-build] Converting MBTiles→PMTiles..."
$TOOLS/pmtiles convert "$TMP_MBT" "$TMP_PMT"

# Устанавливаем корректный заголовок (tile_type=mvt, compression=gzip)
cat > /tmp/pmtiles_z14.json << 'EOF'
{"tile_compression":"gzip","tile_type":"mvt","bounds":[27.5,58.3,36.5,61.5],"center":[30.316,59.939,14],"minzoom":5,"maxzoom":14}
EOF
$TOOLS/pmtiles edit --header-json /tmp/pmtiles_z14.json "$TMP_PMT"

SZ2=$(ls -lh "$TMP_PMT" | awk '{print $5}')
echo "[z14-build] PMTiles ready: $SZ2"
$TOOLS/pmtiles show "$TMP_PMT"

# Атомарно заменяем рабочий файл
mv "$TMP_PMT" "$FINAL"
rm -f "$TMP_MBT" "${TMP_MBT}-journal"

echo "[z14-build] Done: $(date)"
echo "[z14-build] Restarting Martin to serve z14 tiles..."

# Убиваем текущий Martin — Replit workflow перезапустит его через run.sh
pkill -f "martin --config" 2>/dev/null || true

# Workflow должен продолжать работать (иначе он перезапустится)
echo "[z14-build] Build complete — sleeping forever (workflow keepalive)"
exec sleep infinity
