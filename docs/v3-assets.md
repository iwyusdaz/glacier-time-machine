# v3 assets (plan 10 S4)

Staged 2026-10-31 for the v3.0.0 build (plan 10 §6.6). Nothing here is wired into
the app yet; S6 loads it. Rebuild everything with `npm run data:v3` (needs GDAL,
ImageMagick and toktx 4.4.2, see `../TOOLS.md`). Licences: ATTRIBUTION.md rows 19–28.
Formats follow `_templates/spikes/RESULTS.md` ("Asset formats S4 should use").

| Asset | Files | Bytes | Load tier | Notes |
|---|---|---|---|---|
| Streamed terrain | `public/tiles/muir/tileset.json`, `public/tiles/muir/<L>/<x>_<y>.glb` (341 tiles) | 30.8 MB total, mean 90 KB, largest 107 KB | After the first click, only the tiles in view (3d-tiles-renderer, errorTarget 8 px per RESULTS.md) | Copernicus GLO-30 at ~30 m leaf spacing, true scale; Sentinel-2 2024 image inside each tile (10 m at the leaves). Frame: rotate `tiles.group` by −π/2 about X to land in the v2 scene frame (x east, y up, z south, origin = DEM grid centre). `build-meta.json` records counts and errors |
| Detail textures (CC0) | `public/assets/textures/<id>_{diff,nor,arm}.ktx2`, `manifest.json` | 7.3 MB | Streamed (High/Ultra or close-up) | snow_field_aerial, aerial_rocks_02, rock_face, gravel_ground_01, mossy_rock. Normals are RGB = XYZ (OpenGL), no swizzle. `realWorldSizeM` gives the tile size |
| Procedural textures | `crevasse_field_{diff,nor,arm}.ktx2`, `water_normal.ktx2`, `cloud_atlas.ktx2`, `procedural-manifest.json` | 1.4 MB | First load is fine (small) | Crevasse tile = 200 m, v axis = flow. Cloud atlas 4 × 2 sprites; alpha doubles as the cloud-shadow mask (soft cloud billboard carry-over) |
| Models | `public/assets/models/v3/*.glb`, `manifest.json` | 0.5 MB | First load | Real size, pivot at base or waterline. Trees and alder have LOD0 (≤ 4.7k tris) and LOD1 (≤ 100 tris); bake impostors from LOD0. `manifest.json` lists triangles, bounding boxes per node, animatable nodes (kayak `paddle`/`paddler`, flag `flag-cloth`/`flag-panel`) and the catalog id each model serves |
| Forest placement | `public/data/forest-instances.bin` + `.json` | 0.48 MB | First load | 30,177 instances (spruce, hemlock, alder) in 260 stands where the 2024 image shows vegetation; `s` per instance keeps the v2 "older ground first" rule. Layout in the `.json` |
| Object catalog | `content/objects.json` | — | Copied to `public/content/` by `sync-content.mjs` | 30 objects in the main scene, plan §4.1 fields, sources from `research/sources.md` |

All v3 files together are about 40 MB, under plan 09's "total streamed per app
≤ 60 MB" even if every tile were fetched. A single view loads only the tiles in view
(tens of tiles, a few MB).
