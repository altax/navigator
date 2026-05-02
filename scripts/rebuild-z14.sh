#!/bin/bash
# Пересборка PMTiles с z5-z14 — максимальная детализация для навигации.
# Запускается в фоне, не мешает текущему Martin (z12).
# Атрибутная фильтрация (-y) сокращает размер тайлов на 80%+.

set -e
cd /home/runner/workspace

TOOLS=./tools
TMP_MBT=data/spb-lo-build.mbtiles
TMP_PMT=data/spb-lo-build.pmtiles
FINAL=data/spb-lo.pmtiles
LOG=data/rebuild-z14.log
GEOJSON=data/spb-lo-filtered.geojsonseq

echo "[rebuild-z14] Started: $(date)" | tee "$LOG"
echo "[rebuild-z14] Source: $(du -sh $GEOJSON | cut -f1)" | tee -a "$LOG"

rm -f "$TMP_MBT" "$TMP_PMT"

# Собираем с ПОЛНЫМ набором зумов z5-z14.
# --no-tile-size-limit  — никаких ограничений на размер тайла
# --no-feature-limit    — никаких ограничений на число фич
# --simplification=2    — минимальное упрощение геометрии (макс детализация)
# --buffer=8            — запас по краям тайла для плавных стыков
# --detect-shared-borders — объединяет границы соседних зданий
# -y ...                — оставляем ТОЛЬКО атрибуты, нужные для рендеринга
#                         (строки без этих атрибутов => тайлы на 80% меньше)
tippecanoe -o "$TMP_MBT" -z14 -Z5 \
  --no-tile-size-limit \
  --no-feature-limit \
  --simplification=2 \
  --buffer=8 \
  --detect-shared-borders \
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
  "$GEOJSON" 2>&1 | tee -a "$LOG"

echo "[rebuild-z14] tippecanoe done, converting to PMTiles..." | tee -a "$LOG"

# Конвертируем SQLite→PMTiles
$TOOLS/pmtiles convert "$TMP_MBT" "$TMP_PMT" 2>&1 | tee -a "$LOG"

# Устанавливаем правильный заголовок: tile_type=mvt, compression=gzip, z14
cat > /tmp/pmtiles_z14_header.json << 'HEOF'
{"tile_compression":"gzip","tile_type":"mvt","bounds":[27.5,58.3,36.5,61.5],"center":[30.316,59.939,14],"minzoom":5,"maxzoom":14}
HEOF
$TOOLS/pmtiles edit --header-json /tmp/pmtiles_z14_header.json "$TMP_PMT" 2>&1 | tee -a "$LOG"

SZ=$(ls -lh "$TMP_PMT" | awk '{print $5}')
echo "[rebuild-z14] PMTiles ready: $SZ — replacing live file..." | tee -a "$LOG"

# Атомарно заменяем рабочий файл (mv на той же FS — атомарен)
mv "$TMP_PMT" "$FINAL"
rm -f "$TMP_MBT" "${TMP_MBT}-journal"

echo "[rebuild-z14] Done: $(date)" | tee -a "$LOG"
$TOOLS/pmtiles show "$FINAL" 2>&1 | tee -a "$LOG"

# Перезапускаем Martin чтобы он подхватил новые z14-тайлы
# Убиваем текущий процесс — Replit-workflow его перезапустит автоматически
pkill -f "martin --config" 2>/dev/null || true
echo "[rebuild-z14] Martin restarted for z14 tiles." | tee -a "$LOG"
