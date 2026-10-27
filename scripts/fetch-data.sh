#!/usr/bin/env bash
# fetch-data.sh — re-download every raw source into data/raw/ (gitignored).
# All sources are keyless (no account, no API key):
#   - Copernicus DEM GLO-30 Public COGs from the AWS Open Data bucket
#     s3://copernicus-dem-30m (https://registry.opendata.aws/copernicus-dem/)
#   - USGS repeat photographs of Muir and Riggs Glaciers (public domain), from
#     the files linked on the USGS media pages listed in research/data-sources.md
#   - the source web pages themselves (for licence / caption verification)
#
# Usage:
#   bash scripts/fetch-data.sh            # download anything missing
#   bash scripts/fetch-data.sh --force    # re-download everything
#   bash scripts/fetch-data.sh --verify   # compare local sizes with remote Content-Length
set -euo pipefail
cd "$(dirname "$0")/.."

RAW=data/raw
mkdir -p "$RAW/photos" "$RAW/pages"
MODE="${1:-}"

COP=https://copernicus-dem-30m.s3.amazonaws.com
USGS=https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public

# local-path|url  (one per line)
MANIFEST=$(cat <<EOF
cop30_N58_00_W136_00.tif|$COP/Copernicus_DSM_COG_10_N58_00_W136_00_DEM/Copernicus_DSM_COG_10_N58_00_W136_00_DEM.tif
cop30_N58_00_W137_00.tif|$COP/Copernicus_DSM_COG_10_N58_00_W137_00_DEM/Copernicus_DSM_COG_10_N58_00_W137_00_DEM.tif
cop30_N59_00_W136_00.tif|$COP/Copernicus_DSM_COG_10_N59_00_W136_00_DEM/Copernicus_DSM_COG_10_N59_00_W136_00_DEM.tif
cop30_N59_00_W137_00.tif|$COP/Copernicus_DSM_COG_10_N59_00_W137_00_DEM/Copernicus_DSM_COG_10_N59_00_W137_00_DEM.tif
photos/MuirRiggs-1941.jpg|$USGS/MuirRiggs-1941.jpg
photos/MuirRiggs-1950.jpg|$USGS/MuirRiggs-1950.jpg
photos/MuirRiggs-2004.jpg|$USGS/MuirRiggs-2004.jpg
photos/Field1950.jpg|$USGS/Molnia%20-%20Fig%2017A%20-%20Field%20-%201950.jpg
photos/muir1941.jpg|$USGS/media/images/muir1950.jpg
photos/muir2004.jpg|$USGS/media/images/muir2004.jpg
pages/muir-and-riggs-glaciers-muir-inlet-alaska-1941.html|https://www.usgs.gov/media/images/muir-and-riggs-glaciers-muir-inlet-alaska-1941
pages/muir-and-riggs-glaciers-muir-inlet-alaska-1950.html|https://www.usgs.gov/media/images/muir-and-riggs-glaciers-muir-inlet-alaska-1950
pages/muir-and-riggs-glaciers-muir-inlet-alaska-2004.html|https://www.usgs.gov/media/images/muir-and-riggs-glaciers-muir-inlet-alaska-2004
pages/muir-and-riggs-glaciers-retreat-between-1941-2004.html|https://www.usgs.gov/media/before-after/muir-and-riggs-glaciers-retreat-between-1941-2004
pages/muir-glacier-glacier-bay-national-monument-1941.html|https://www.usgs.gov/media/images/muir-glacier-glacier-bay-national-monument-1941
pages/muir1950jpg.html|https://www.usgs.gov/media/images/muir1950jpg
pages/muir2004jpg.html|https://www.usgs.gov/media/images/muir2004jpg
pages/aws-registry.html|https://registry.opendata.aws/copernicus-dem/
pages/cop-readme.html|https://copernicus-dem-30m.s3.amazonaws.com/readme.html
pages/cop-dem-ds.html|https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM
pages/nasa-muir.html|https://science.nasa.gov/earth/muir-glacier-melt-alaska/
pages/nps-glacier-bay-glaciers.html|https://www.nps.gov/glba/learn/nature/glaciers.htm
pages/ngss-ess2.html|https://www.nextgenscience.org/pe/hs-ess2-2-earths-systems
pages/ngss-ess3.html|https://www.nextgenscience.org/pe/hs-ess3-5-earth-and-human-activity
EOF
)

fail=0
while IFS='|' read -r rel url; do
  [ -z "$rel" ] && continue
  dest="$RAW/$rel"
  if [ "$MODE" = "--verify" ]; then
    remote=$(curl -sIL "$url" | tr -d '\r' | awk 'tolower($1)=="content-length:"{v=$2} END{print v}')
    localsz=$( [ -f "$dest" ] && stat -f %z "$dest" 2>/dev/null || stat -c %s "$dest" 2>/dev/null || echo missing)
    case "$rel" in
      pages/*) status="page (dynamic HTML; size not compared)";;
      *) if [ "$remote" = "$localsz" ]; then status=MATCH; else status="DIFF"; fail=1; fi;;
    esac
    printf '%-58s local=%-10s remote=%-10s %s\n' "$rel" "$localsz" "${remote:-?}" "$status"
    continue
  fi
  if [ -f "$dest" ] && [ "$MODE" != "--force" ]; then
    echo "have  $rel"
    continue
  fi
  echo "fetch $rel"
  curl -fsSL --retry 3 -o "$dest.part" "$url"
  mv "$dest.part" "$dest"
done <<< "$MANIFEST"

exit $fail
