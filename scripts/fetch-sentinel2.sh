#!/usr/bin/env bash
# Sentinel-2 L2A true-colour drape for the Muir Inlet terrain (v2.0.0).
#
# Source: the public, anonymous AWS open-data bucket `sentinel-cogs`
# (Sentinel-2 L2A Cloud-Optimised GeoTIFFs, registry.opendata.aws/sentinel-2-l2a-cogs),
# scene found with the open Earth Search STAC API (no account, no key):
#   S2B_8VML_20240806_0_L2A, 2024-08-06 20:38 UTC, cloud cover 0.13 %, MGRS 8VML.
# Only the window that matches the DEM footprint is read via GDAL /vsicurl/
# (HTTP range requests on the 20 m overview), so the download is a few MB.
#
# The TCI product is already in EPSG:32608 (UTM 8N), the same CRS as the DEM,
# so no reprojection is needed: the window is the DEM bounds from
# public/data/terrain-meta.json (413400 E .. 445800 E, 6521490 N .. 6565530 N).
#
# Attribution (required): "Contains modified Copernicus Sentinel data 2024".
set -euo pipefail
cd "$(dirname "$0")/.."

FREE_KB=$(df -k / | awk 'NR==2 {print $4}')
if [ "$FREE_KB" -lt 29785156 ]; then # 30.5 GB (decimal) in KiB
  echo "Disk guard: less than 30.5 GB free; not downloading." >&2
  exit 2
fi

SCENE="S2B_8VML_20240806_0_L2A"
URL="https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/8/V/ML/2024/8/${SCENE}/TCI.tif"
RAW=data/raw/sentinel2
OUT=public/data/muir-s2-20240806.jpg
mkdir -p "$RAW"

export GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR
export CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.tif
# 20 m window read (the COG's first overview), cropped exactly to the DEM bounds.
gdal_translate -q -projwin 413400 6565530 445800 6521490 -tr 20 20 -r average \
  -co COMPRESS=DEFLATE "/vsicurl/${URL}" "$RAW/${SCENE}-muir-20m.tif"

# Web JPEG (sRGB 8-bit, as delivered by the TCI product). No contrast stretch
# (documented in ATTRIBUTION.md); no retouching or compositing.
magick "$RAW/${SCENE}-muir-20m.tif" -strip -quality 84 \
  -sampling-factor 4:2:0 "$OUT"
ls -l "$OUT"
