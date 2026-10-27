#!/usr/bin/env bash
# process-dem.sh — Copernicus GLO-30 tiles -> Muir Inlet heightfields for the app.
#
# Steps (one GDAL job at a time):
#   1. mosaic the four 1x1 degree COG tiles (gdalbuildvrt)
#   2. crop to the Muir Inlet area of interest and reproject to UTM zone 8N
#      (EPSG:32608, metres), resampling to 30 m (LOD0) and 60 m (LOD1)
#   3. encode each LOD as a 16-bit grayscale PNG with a shared linear encoding
#      elev_m = elevMin + v / 65535 * (elevMax - elevMin)   (no nodata value)
#   4. write public/data/terrain-meta.json (bounds, CRS, resolution, min/max,
#      encoding, attribution) and a hillshade preview into data/work/ (gitignored)
#
# 1 unit = 1 metre. No vertical exaggeration anywhere in this pipeline.
# Copernicus DEM is a surface model (DSM): glacier and water surfaces are the
# surface at acquisition time (TanDEM-X, 2011-2015), not bedrock or bathymetry.
set -euo pipefail
cd "$(dirname "$0")/.."

RAW=data/raw
WORK=data/work
OUT=public/data
mkdir -p "$WORK" "$OUT"

# Area of interest (WGS84 degrees). Covers Muir Inlet from its mouth to beyond
# the present Muir Glacier terminus, plus Riggs and McBride glaciers and the
# ridges on both sides. Chosen from the Wikipedia/GNIS coordinates of Muir Inlet
# (58.868 N, 136.088 W), Muir Glacier (59.105 N, 136.382 W) and Riggs Glacier
# (59.169 N, 136.244 W) with margin; see research/data-sources.md.
LON_W=-136.50
LON_E=-135.95
LAT_S=58.83
LAT_N=59.22
DST_SRS=EPSG:32608

TILES=(
  "$RAW/cop30_N58_00_W137_00.tif"
  "$RAW/cop30_N58_00_W136_00.tif"
  "$RAW/cop30_N59_00_W137_00.tif"
  "$RAW/cop30_N59_00_W136_00.tif"
)
for t in "${TILES[@]}"; do
  [ -f "$t" ] || { echo "missing $t — run: bash scripts/fetch-data.sh" >&2; exit 1; }
done

echo "[1/4] mosaic"
gdalbuildvrt -q -overwrite "$WORK/cop30-mosaic.vrt" "${TILES[@]}"

echo "[2/4] crop + reproject to $DST_SRS"
gdalwarp -q -overwrite -te_srs EPSG:4326 -te $LON_W $LAT_S $LON_E $LAT_N \
  -t_srs "$DST_SRS" -tr 30 30 -tap -r bilinear -ot Float32 \
  "$WORK/cop30-mosaic.vrt" "$WORK/dem-l0-f32.tif"
# LOD1 from LOD0 (same grid origin, 2x2 average)
gdalwarp -q -overwrite -tr 60 60 -r average -ot Float32 \
  "$WORK/dem-l0-f32.tif" "$WORK/dem-l1-f32.tif"

STATS=$(gdalinfo -stats "$WORK/dem-l0-f32.tif" 2>/dev/null \
  | grep -oE 'Minimum=[-0-9.e+]+, Maximum=[-0-9.e+]+' | head -1)
VMIN=$(echo "$STATS" | sed -E 's/Minimum=([-0-9.e+]+),.*/\1/')
VMAX=$(echo "$STATS" | sed -E 's/.*, Maximum=([-0-9.e+]+)/\1/')
LO=$(python3 -c "import math; print(math.floor(float('$VMIN')) - 1)")
HI=$(python3 -c "import math; print(math.ceil(float('$VMAX')) + 1)")
echo "  elevation range $VMIN .. $VMAX m -> encoding [$LO, $HI]"

echo "[3/4] encode 16-bit PNG heightfields"
for L in 0 1; do
  gdal_translate -q -ot UInt16 -scale "$LO" "$HI" 0 65535 -of PNG -co ZLEVEL=9 \
    "$WORK/dem-l$L-f32.tif" "$OUT/muir-height-l$L.png"
  rm -f "$OUT/muir-height-l$L.png.aux.xml"
done

echo "[4/4] metadata + hillshade preview"
gdaldem hillshade -q -z 1 "$WORK/dem-l0-f32.tif" "$WORK/hillshade-l0.png" -of PNG

python3 - "$WORK" "$OUT" "$LO" "$HI" "$VMIN" "$VMAX" "$DST_SRS" "$LON_W" "$LAT_S" "$LON_E" "$LAT_N" <<'PY'
import json, subprocess, sys
work, out, lo, hi, vmin, vmax, srs, lon_w, lat_s, lon_e, lat_n = sys.argv[1:]

def info(path):
    return json.loads(subprocess.check_output(['gdalinfo', '-json', path]))

def to_utm(lon, lat):
    r = subprocess.run(['gdaltransform', '-s_srs', 'EPSG:4326', '-t_srs', srs, '-output_xy'],
                       input=f'{lon} {lat}\n', capture_output=True, text=True, check=True)
    x, y = map(float, r.stdout.split()[:2])
    return x, y

lods = []
for L in (0, 1):
    i = info(f'{work}/dem-l{L}-f32.tif')
    w, h = i['size']
    gt = i['geoTransform']
    lods.append({
        'file': f'muir-height-l{L}.png',
        'width': w, 'height': h,
        'mPerPx': abs(gt[1]),
        # pixel-edge bounds in UTM metres
        'bounds': {'west': gt[0], 'north': gt[3], 'east': gt[0] + w * gt[1], 'south': gt[3] + h * gt[5]},
    })

def sample(lon, lat):
    x, y = to_utm(lon, lat)
    r = subprocess.run(['gdallocationinfo', '-valonly', '-geoloc', f'{work}/dem-l0-f32.tif', str(x), str(y)],
                       capture_output=True, text=True)
    v = r.stdout.strip()
    return x, y, (round(float(v), 1) if v else None)

b = lods[0]['bounds']
landmarks = []
for name, lon, lat in [
    ('Muir Inlet (Wikipedia/GNIS coordinate)', -136.0884167, 58.8678056),
    ('Muir Glacier (Wikipedia/GNIS coordinate)', -136.3822222, 59.1047222),
    ('Riggs Glacier (Wikipedia/GNIS coordinate)', -136.2436111, 59.1688889),
]:
    x, y, z = sample(lon, lat)
    landmarks.append({'name': name, 'lon': lon, 'lat': lat, 'utmE': round(x, 1), 'utmN': round(y, 1),
                      'localX': round(x - b['west'], 1), 'localY': round(b['north'] - y, 1), 'demElevM': z})

meta = {
    'dataset': 'Copernicus DEM GLO-30 Public (DSM), tiles N58/N59 W136/W137',
    'attribution': 'produced using Copernicus WorldDEM-30 \u00a9 DLR e.V. 2010-2014 and \u00a9 Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved',
    'crs': srs, 'crsName': 'WGS 84 / UTM zone 8N',
    'aoiWgs84': {'west': float(lon_w), 'south': float(lat_s), 'east': float(lon_e), 'north': float(lat_n)},
    'verticalDatum': 'EGM2008 geoid heights (Copernicus DEM vertical reference)',
    'units': 'metres; 1 scene unit = 1 m; no vertical exaggeration',
    'encoding': {'type': 'linear-uint16', 'elevMin': int(lo), 'elevMax': int(hi), 'nodata': None,
                 'formula': 'elev_m = elevMin + v / 65535 * (elevMax - elevMin)'},
    'stats': {'min': round(float(vmin), 2), 'max': round(float(vmax), 2)},
    'rowOrder': 'row 0 = north edge; column 0 = west edge',
    'lods': lods,
    'landmarks': landmarks,
    'generatedBy': 'scripts/process-dem.sh',
}
with open(f'{out}/terrain-meta.json', 'w') as f:
    json.dump(meta, f, indent=2)
    f.write('\n')
print(json.dumps({'lods': [(l['width'], l['height'], l['mPerPx']) for l in lods], 'landmarks': landmarks}, indent=1))
PY

ls -la "$OUT"
