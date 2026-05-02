#!/bin/bash
# Run this script ONCE before pushing to GitHub to stop tracking large
# generated GIS files that were previously stored via Git LFS.
# These files are re-generated automatically by scripts/bootstrap.sh.
set -euo pipefail

echo "[git_untrack] Removing large generated data files from git index..."

FILES=(
  "data/spb-lo-filtered.osm.pbf"
  "data/spb-lo-filtered.geojsonseq"
  "data/spb-lo.pmtiles"
  "data/spb-lo.osm.pbf"
  "data/northwest-fed.osm.pbf"
  "data/graphhopper-web-10.0.jar"
  "data/graphhopper"
  "data/fonts"
)

for f in "${FILES[@]}"; do
  if git --no-optional-locks ls-files --error-unmatch "$f" &>/dev/null 2>&1; then
    git rm -r --cached "$f" 2>/dev/null || true
    echo "[git_untrack] Removed: $f"
  else
    echo "[git_untrack] Already untracked: $f"
  fi
done

echo ""
echo "[git_untrack] Done. Now run:"
echo "  git add .gitignore .gitattributes scripts/"
echo "  git commit -m 'chore: stop tracking large generated GIS data in git'"
echo "  git push"
echo ""
echo "After push, any fresh import will auto-generate all data via bootstrap.sh."
