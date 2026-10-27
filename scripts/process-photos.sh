#!/usr/bin/env bash
# process-photos.sh — USGS repeat photographs (public domain) -> web JPEGs.
# Output: public/photos/*.jpg, each <= 300 KB, sRGB, metadata stripped, no
# retouching (resize + recompress only). Requires ImageMagick 7 (`magick`).
#
#   muir-1941-A.jpg     photo A, W. O. Field, August 13, 1941   (MuirRiggs-1941.jpg)
#   muir-1950-B.jpg     photo B, W. O. Field, August 4, 1950    (MuirRiggs-1950.jpg)
#   muir-2004-C.jpg     photo C, B. F. Molnia, August 31, 2004  (MuirRiggs-2004.jpg)
# The hd pair (muir-1941-hd/muir-2004-hd, from the 17447 px before/after scan) is
# NOT shipped: the 3D photo-alignment overlay is Phase B (visual review V8 — two
# unused ~280 KB photos were shipped but never referenced). Re-add these two
# convert_one lines when the overlay lands; the hd pair shares one 16:9 framing,
# which is what the overlay would align.
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
