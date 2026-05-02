#!/bin/bash
cd /home/runner/workspace

PMTILES=data/spb-lo.pmtiles
GEOJSON=data/spb-lo-filtered.geojsonseq
TOOLS=./tools

# ── Проверка валидности PMTiles ─────────────────────────────────────────────
# Файл считается валидным если:
#  1) размер > 30 МБ (незавершённые файлы меньше)
#  2) начинается с "PMTiles" (не SQLite/MBTiles)
pmtiles_valid() {
  local f="$1"
  [ -f "$f" ] || return 1
  local sz; sz=$(stat -c%s "$f" 2>/dev/null) || return 1
  [ "$sz" -gt 30000000 ] || return 1
  local magic; magic=$(head -c 7 "$f" 2>/dev/null | od -c | awk 'NR==1{print $2$3$4$5$6$7$8}')
  [ "$magic" = "PMTiles" ] || return 1
  return 0
}

# ── Конвертация MBTiles→PMTiles если tippecanoe записал SQLite файл ──────────
convert_if_sqlite() {
  local f="$1"
  [ -f "$f" ] || return 0
  local magic; magic=$(head -c 6 "$f" 2>/dev/null | od -c | awk 'NR==1{print $2$3$4$5$6$7}')
  if [ "$magic" = "SQLite" ]; then
    echo "[martin/run.sh] Detected SQLite/MBTiles format — converting to PMTiles…"
    local tmp="${f}.pmtiles_tmp"
    if $TOOLS/pmtiles convert "$f" "$tmp" 2>&1; then
      # Устанавливаем правильные метаданные (тип тайлов = mvt, сжатие = gzip)
      cat > /tmp/pmtiles_fix_header.json << 'HEOF'
{"tile_compression":"gzip","tile_type":"mvt","bounds":[27.5,58.3,36.5,61.5],"center":[30.316,59.939,12]}
HEOF
      $TOOLS/pmtiles edit --header-json /tmp/pmtiles_fix_header.json "$tmp" 2>&1
      mv "$tmp" "$f"
      echo "[martin/run.sh] Converted OK: $(ls -lh $f | awk '{print $5}')"
    else
      echo "[martin/run.sh] ERROR: conversion failed" >&2
      rm -f "$tmp"
    fi
  fi
}

if pmtiles_valid "$PMTILES"; then
  echo "[martin/run.sh] PMTiles OK: $(ls -lh $PMTILES | awk '{print $5}')"
else
  echo "[martin/run.sh] PMTiles missing/incomplete — starting build pipeline…"

  # Если tippecanoe уже запущен — ждём его завершения (до 60 минут)
  if pgrep tippecanoe > /dev/null 2>&1; then
    echo "[martin/run.sh] tippecanoe already running — waiting for it to finish…"
    for i in $(seq 1 360); do
      sleep 10
      if ! pgrep tippecanoe > /dev/null 2>&1; then
        echo "[martin/run.sh] tippecanoe exited — checking result…"
        convert_if_sqlite "$PMTILES"
        break
      fi
      if [ $((i % 6)) -eq 0 ]; then
        sz=$(stat -c%s "$PMTILES" 2>/dev/null | awk '{printf "%.0fM", $1/1048576}')
        echo "[martin/run.sh] Still building… ${sz:-?}"
      fi
    done
  fi

  # Пересобираем если всё ещё невалидно
  if ! pmtiles_valid "$PMTILES"; then
    rm -f "$PMTILES" "${PMTILES}-journal" "${PMTILES}.pmtiles_tmp"

    # Ждём GeoJSON
    WAIT=0
    while true; do
      sz=$(stat -c%s "$GEOJSON" 2>/dev/null || echo 0)
      [ "$sz" -gt 1000000 ] && break
      if [ "$WAIT" -ge 600 ]; then
        echo "[martin/run.sh] ERROR: $GEOJSON not ready after 10 min" >&2
        exit 1
      fi
      echo "[martin/run.sh] Waiting for GeoJSON… ${WAIT}s"
      sleep 15
      WAIT=$((WAIT + 15))
    done

    echo "[martin/run.sh] Building PMTiles (z5-z14, no tile size limit)…"
    tippecanoe -o "$PMTILES" -z14 -Z5 \
      --drop-densest-as-needed \
      --no-feature-limit \
      --no-tile-size-limit \
      --simplification=4 \
      --force -l osm "$GEOJSON" 2>&1

    EXIT_CODE=$?
    if [ $EXIT_CODE -ne 0 ]; then
      echo "[martin/run.sh] ERROR: tippecanoe failed (exit=$EXIT_CODE)" >&2
      exit 1
    fi

    # tippecanoe v2.78 может записать SQLite (MBTiles), конвертируем
    convert_if_sqlite "$PMTILES"

    if ! pmtiles_valid "$PMTILES"; then
      echo "[martin/run.sh] ERROR: invalid PMTiles after build" >&2
      exit 1
    fi
    echo "[martin/run.sh] PMTiles built: $(ls -lh $PMTILES | awk '{print $5}')"
  fi
fi

# ── Запуск фоновой сборки z14 если текущие тайлы ограничены z12 ─────────────
CURRENT_MAXZOOM=$($TOOLS/pmtiles show "$PMTILES" 2>/dev/null | grep "max zoom" | awk '{print $NF}')
if [ "${CURRENT_MAXZOOM:-0}" -lt 14 ] && ! pgrep -f "z14-bg-build.sh" > /dev/null 2>&1; then
  echo "[martin/run.sh] PMTiles maxzoom=${CURRENT_MAXZOOM:-?} < 14 — launching background z14 rebuild..."
  echo "[martin/run.sh] Martin will serve z12 tiles now; auto-restarts with z14 when done (~30-60 min)"
  chmod +x scripts/z14-bg-build.sh
  setsid bash scripts/z14-bg-build.sh &
  disown $!
  echo "[martin/run.sh] z14 build started, log: data/z14-build.log"
fi

# Ждём шрифты
WAIT_FONTS=0
while true; do
  sz=$(stat -c%s "data/fonts/NotoSans-Regular.ttf" 2>/dev/null || echo 0)
  [ "$sz" -gt 10000 ] && break
  if [ "$WAIT_FONTS" -ge 300 ]; then
    echo "[martin/run.sh] WARNING: fonts not ready — starting anyway"
    break
  fi
  echo "[martin/run.sh] Waiting for fonts… ${WAIT_FONTS}s"
  sleep 10
  WAIT_FONTS=$((WAIT_FONTS + 10))
done

echo "[martin/run.sh] Starting Martin tile server on :3000…"
fuser -k 3000/tcp 2>/dev/null || true
sleep 1
exec $TOOLS/martin --config stack/martin/config.yaml
