#!/usr/bin/env bash
# Sentinel-2 L2A true-colour window at the native 10 m resolution (v3 S4), the
# source for the imagery inside the streamed terrain tiles
# (scripts/build-terrain-tiles.mjs). Same scene and bucket as the v2 drape
# (scripts/fetch-sentinel2.sh): S2B_8VML_20240806_0_L2A, 2024-08-06, cloud 0.13 %.
#
# Licence check first: the Earth Search STAC collection must still point its
# licence link at the Copernicus Sentinel Data Legal Notice (free, full and open;
# attribution "Contains modified Copernicus Sentinel data 2024"), and the item must
# exist with the same TCI href. Anything else stops the script before download.
#
# Output (gitignored): data/raw/sentinel2/S2B_8VML_20240806_0_L2A-muir-10m.tif,
# the DEM footprint (413400..445800 E, 6521490..6565530 N, EPSG:32608), 3240x4404 px.
set -euo pipefail
cd "$(dirname "$0")/.."
FREE_KB=$(df -k / | awk 'NR==2 {print $4}')
if [ "$FREE_KB" -lt 29785156 ]; then # 30.5 GB (decimal) in KiB
  echo "Disk guard: less than 30.5 GB free; not downloading." >&2
  exit 2
fi
SCENE="S2B_8VML_20240806_0_L2A"
STAC=https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a
URL="https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/8/V/ML/2024/8/${SCENE}/TCI.tif"
RAW=data/raw/sentinel2
OUT="$RAW/${SCENE}-muir-10m.tif"
mkdir -p "$RAW"

# --- licence check (collection licence link + item href) ---
LIC=$(curl -fsSL "$STAC" | python3 -c "import json,sys; d=json.load(sys.stdin); print(' '.join(l['href'] for l in d.get('links',[]) if l.get('rel')=='license'))")
case "$LIC" in
  *Sentinel_Data_Legal_Notice*) echo "licence ok: $LIC" ;;
  *) echo "licence check FAILED: collection licence link is '$LIC'" >&2; exit 3 ;;
esac
HREF=$(curl -fsSL "$STAC/items/$SCENE" | python3 -c "import json,sys; print(json.load(sys.stdin)['assets']['visual']['href'])")
if [ "$HREF" != "$URL" ]; then
  echo "item check FAILED: visual href is '$HREF', expected '$URL'" >&2
  exit 3
fi

if [ -f "$OUT" ] && [ "${1:-}" != "--force" ]; then
  echo "have $OUT"
  exit 0
fi
export GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR
export CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.tif
# Native 10 m window (no resampling: the window edges fall on the 10 m grid).
gdal_translate -q -projwin 413400 6565530 445800 6521490 \
  -co COMPRESS=DEFLATE -co TILED=YES "/vsicurl/${URL}" "$OUT"
gdalinfo "$OUT" | grep -E "Size is|Pixel Size"
