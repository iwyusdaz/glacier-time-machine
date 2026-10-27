#!/usr/bin/env bash
# process-photos.sh — USGS repeat photographs (public domain) -> web JPEGs.
# Output: public/photos/*.jpg, each <= 300 KB, sRGB, metadata stripped, no
# retouching (resize + recompress only). Requires ImageMagick 7 (`magick`).
#
#   muir-1941-A.jpg     photo A, W. O. Field, August 13, 1941   (MuirRiggs-1941.jpg)
#   muir-1950-B.jpg     photo B, W. O. Field, August 4, 1950    (MuirRiggs-1950.jpg)
#   muir-2004-C.jpg     photo C, B. F. Molnia, August 31, 2004  (MuirRiggs-2004.jpg)
#   muir-1941-hd.jpg    1941 photo from the 17447 px before/after scan (muir1950.jpg on USGS)
#   muir-2004-hd.jpg    2004 photo from the 17447 px before/after scan (muir2004.jpg)
# The hd pair shares one 16:9 framing (USGS before/after slider), which is what the
# rephotography overlay aligns; A/B/C give the three-date sequence.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC=data/raw/photos
OUT=public/photos
mkdir -p "$OUT"
MAX_KB=290

convert_one() { # src dest width
  magick "$SRC/$1" -auto-orient -colorspace sRGB -resize "${3}x>" -strip \
    -sampling-factor 4:2:0 -interlace JPEG -define jpeg:extent=${MAX_KB}kb "$OUT/$2"
  local kb=$(( $(wc -c < "$OUT/$2") / 1024 ))
  [ "$kb" -le 300 ] || { echo "$2 is ${kb} KB (> 300)" >&2; exit 1; }
  echo "$2  $(magick identify -format '%wx%h' "$OUT/$2")  ${kb} KB"
}

convert_one MuirRiggs-1941.jpg muir-1941-A.jpg 1600
convert_one MuirRiggs-1950.jpg muir-1950-B.jpg 1600
convert_one MuirRiggs-2004.jpg muir-2004-C.jpg 1600
convert_one muir1941.jpg       muir-1941-hd.jpg 1920
convert_one muir2004.jpg       muir-2004-hd.jpg 1920
