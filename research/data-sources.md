# Data sources

Every dataset the build uses or was evaluated for. All are keyless (no account, no
API key). Raw files live in `data/raw/` (gitignored) and are re-downloaded by
`scripts/fetch-data.sh`; `bash scripts/fetch-data.sh --verify` compares local
sizes with the remote `Content-Length` (all 10 binaries matched on 2026-10-27).

Access date for everything below: **2026-10-27**.

## 1. Elevation: Copernicus DEM GLO-30 Public

| Field | Value |
|---|---|
| Dataset | Copernicus DEM GLO-30 Public (COP-DEM_GLO-30-DGED, 2021 release), Cloud Optimized GeoTIFF |
| Tiles | `Copernicus_DSM_COG_10_N58_00_W136_00_DEM`, `..._N58_00_W137_00_DEM`, `..._N59_00_W136_00_DEM`, `..._N59_00_W137_00_DEM` |
| Download | `https://copernicus-dem-30m.s3.amazonaws.com/<tile>/<tile>.tif` (AWS Open Data, "No AWS account required") |
| Registry page | https://registry.opendata.aws/copernicus-dem/ |
| Bucket readme | https://copernicus-dem-30m.s3.amazonaws.com/readme.html |
| Licence page | https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM |
| Licence | "The GLO-30 and GLO-90 datasets are available worldwide with a free license." (Copernicus Data Space page). AWS registry: "available on a free basis for the general public under the terms and conditions of the Licence". |
| Required notice (modified data) | "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved" (verbatim from the Copernicus Data Space page). Shown in-app, in ATTRIBUTION.md and in `public/data/terrain-meta.json`. |
| Citation (AWS) | "Copernicus Digital Elevation Model (DEM) was accessed on 2026-10-27 from https://registry.opendata.aws/copernicus-dem." |
| Nature | Digital **surface** model (includes ice and vegetation surfaces). Ocean areas have height ~0 (readme). |
| Status | VERIFIED (licence text and notice read on the saved pages) |

Processing: `scripts/process-dem.sh` (GDAL 3.13.3). Mosaic -> crop to WGS84
136.50–135.95 W, 58.83–59.22 N -> reproject to EPSG:32608 (UTM 8N) at 30 m
(LOD0, 1080x1468) and 60 m (LOD1, 540x734) -> 16-bit PNG with linear encoding
(-9 .. 2151 m). Bounds, CRS, resolution and min/max are in `public/data/terrain-meta.json`.

The DEM surface vertical reference (EGM2008) is stated in Copernicus product
documentation that was **not** among the saved pages: UNVERIFIED in this repo
until the product handbook is opened and cited.

### Spot checks (logged by the pipeline into terrain-meta.json `landmarks`)

| Point | Coordinate source | DEM value | Plausibility |
|---|---|---|---|
| Muir Inlet | Wikipedia infobox, 58.867806 N 136.088417 W | 0.0 m | Water surface at sea level: consistent |
| Muir Glacier | Wikipedia infobox, 59.10472 N 136.38222 W | 28.2 m | Low valley floor/terminus area: plausible |
| Riggs Glacier | Wikipedia infobox, 59.16889 N 136.24361 W | 962.8 m | Up-glacier point: plausible |

The hillshade preview (`data/work/hillshade-l0.png`, not committed) shows the
fjord of Muir Inlet running from the south-east corner to the north-west, with the
side valleys of Riggs and McBride glaciers on the east. Phase B: add a formal
validation report under `evaluation/results/`.

## 2. Repeat photographs (USGS, public domain)

| Local file | Download URL | USGS record | Date / photographer on record | Licence on record |
|---|---|---|---|---|
| photos/MuirRiggs-1941.jpg (1800x1190) | https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/MuirRiggs-1941.jpg | https://www.usgs.gov/media/images/muir-and-riggs-glaciers-muir-inlet-alaska-1941 | August 13, 1941; caption ends "(W.O. Field)" | "Public Domain." |
| photos/MuirRiggs-1950.jpg (1800x1193) | .../s3fs-public/MuirRiggs-1950.jpg | https://www.usgs.gov/media/images/muir-and-riggs-glaciers-muir-inlet-alaska-1950 | August 4, 1950; "(W.O. Field)" | "Public Domain." |
| photos/MuirRiggs-2004.jpg (1800x1193) | .../s3fs-public/MuirRiggs-2004.jpg | https://www.usgs.gov/media/images/muir-and-riggs-glaciers-muir-inlet-alaska-2004 | August 31, 2004; "(Bruce Molnia)" | "Public Domain." |
| photos/muir1941.jpg (17447x9764) | .../s3fs-public/media/images/muir1950.jpg | https://www.usgs.gov/media/images/muir1950jpg | "1941 (approx.)"; title "...Alaska - 1941"; caption "(W.O. Field)" | "Public Domain." |
| photos/muir2004.jpg (17447x9764) | .../s3fs-public/media/images/muir2004.jpg | https://www.usgs.gov/media/images/muir2004jpg | "2004 (approx.)"; By Office of Communications | "Public Domain." |
| photos/Field1950.jpg (3297x1845) | .../s3fs-public/Molnia%20-%20Fig%2017A%20-%20Field%20-%201950.jpg | https://www.usgs.gov/media/images/muir-glacier-glacier-bay-national-monument-1941 | Record date "August 1, 1941"; file name says "Field - 1950" | "Public Domain." |

Notes:
- The USGS file named `muir1950.jpg` shows the **1941** scene (its record is titled
  "...1941" and the image is the glacier-filled view). We save it as `muir1941.jpg`.
- `Field1950.jpg` has conflicting dates (record: August 1, 1941; file name: 1950).
  Visually it is the glacier-filled 1941-type view. Treat its date as UNVERIFIED;
  the app does not use it as a dated data point.
- NASA's page credits the 1941 image "courtesy of the National Snow and Ice Data
  Center and Glacier Bay National Park and Preserve Archive"; that credit is
  repeated in ATTRIBUTION.md.

Processing: `scripts/process-photos.sh` (resize + recompress, metadata stripped,
no retouching) -> `public/photos/`.

## 3. Imagery for the time slider (not yet sourced)

The plan asks for draped satellite imagery per date from keyless sources (e.g.
Landsat / Sentinel-2 via open STAC catalogs, NASA Earth Observatory images).
**Not yet downloaded in Phase A.** Gap recorded for Phase B.

## 4. Terminus-position history (not yet sourced)

No published table of Muir Glacier terminus positions by date has been opened yet.
The only retreat figures currently verified are the caption statements in
`research/sources.md` (">3 km" 1941–1950, ">7 km" by 2004, Riggs "as much as 600 m").
Any other terminus date or position is UNVERIFIED until a USGS/NPS source is cited.

## 5. Sources tried and not usable

| Source | Result |
|---|---|
| NPS pages saved as nps-muir-inlet.html, nps-succession.html, nps-tidewater.html | All three returned "Requested Page Not Found (404)" when saved; the URLs used were not recorded, so they are not in `fetch-data.sh`. Succession and tidewater sources still needed. |
| Wikipedia "White Thunder Ridge" | No article exists. The vantage point description comes from the USGS captions only. |
| USGS 3DEP | Not used; Copernicus GLO-30 chosen (single keyless S3 source, global licence). See DECISIONS.md (Phase B). |
