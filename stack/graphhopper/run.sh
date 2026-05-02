#!/bin/bash
set -euo pipefail
cd /home/runner/workspace

JAR=data/graphhopper-web-10.0.jar
PBF=data/spb-lo-filtered.osm.pbf
GRAPH_DIR=data/graphhopper/spb-lo-ebike-gh
CONFIG=stack/graphhopper/config-ebike.yml

# Helper: true if file exists AND is at least min_bytes large.
# LFS pointer stubs are exactly 134 bytes — they fail this check.
is_valid() {
  local f="$1"
  local min_bytes="${2:-1048576}"
  [ -f "$f" ] && [ "$(stat -c%s "$f")" -ge "$min_bytes" ]
}

if ! is_valid "$JAR" 10000000; then
  echo "[gh/run.sh] ERROR: $JAR missing or invalid" >&2
  sleep 5
  exit 1
fi

# Wait up to 15 min for bootstrap to finish downloading/generating OSM data.
WAIT=0
while ! is_valid "$PBF" 10000000; do
  if [ "$WAIT" -ge 900 ]; then
    echo "[gh/run.sh] ERROR: $PBF still not ready after 15 min — bootstrap may have failed" >&2
    exit 1
  fi
  echo "[gh/run.sh] Waiting for $PBF (bootstrap downloading OSM data)… ${WAIT}s"
  sleep 15
  WAIT=$((WAIT + 15))
done

# Check if the routing graph is valid.
# After a GitHub import without LFS, the 'edges' file is a tiny 134-byte stub.
# Detect this and rebuild the graph from the OSM PBF.
EDGES="$GRAPH_DIR/edges"
NEED_BUILD=false
if [ ! -d "$GRAPH_DIR" ] || [ ! -f "$GRAPH_DIR/properties" ]; then
  NEED_BUILD=true
fi
if [ -f "$EDGES" ] && [ "$(stat -c%s "$EDGES")" -lt 1000000 ]; then
  echo "[gh/run.sh] edges file appears to be an LFS stub — rebuilding graph."
  NEED_BUILD=true
fi

if [ "$NEED_BUILD" = "true" ]; then
  echo "[gh/run.sh] Building GraphHopper graph from $PBF (this can take 10-20 min)…"
  rm -rf "$GRAPH_DIR"
  java -Xmx2g -jar "$JAR" import "$CONFIG"
  echo "[gh/run.sh] Graph built."
fi

echo "[gh/run.sh] Starting GraphHopper server on :8000…"
exec java -Xmx1500m -jar "$JAR" server "$CONFIG"
