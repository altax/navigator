#!/bin/bash
set -euo pipefail
cd /home/runner/workspace

JAR=data/graphhopper-web-10.0.jar
PBF=data/spb-lo.osm.pbf
GRAPH_DIR=data/graphhopper/spb-lo-ebike-gh
CONFIG=stack/graphhopper/config-ebike.yml

if [ ! -f "$JAR" ]; then
  echo "[gh/run.sh] ERROR: $JAR missing" >&2
  sleep 5
  exit 1
fi
if [ ! -f "$PBF" ]; then
  echo "[gh/run.sh] ERROR: $PBF missing" >&2
  sleep 5
  exit 1
fi

if [ ! -d "$GRAPH_DIR" ] || [ ! -f "$GRAPH_DIR/properties" ]; then
  echo "[gh/run.sh] Building GraphHopper graph from $PBF (this can take 10-20 min)…"
  rm -rf "$GRAPH_DIR"
  java -Xmx2g -jar "$JAR" import "$CONFIG"
  echo "[gh/run.sh] Graph built."
fi

echo "[gh/run.sh] Starting GraphHopper server on :8000…"
exec java -Xmx1500m -jar "$JAR" server "$CONFIG"
