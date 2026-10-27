# Decisions

| # | Decision | Alternatives | Rationale |
|---|---|---|---|
| 1 | Copernicus DEM GLO-30 Public (AWS Open Data) for elevation | USGS 3DEP via The National Map | One keyless S3 source with a clear global licence and a required attribution notice; 30 m covers the whole inlet in four tiles. It is a surface model (ice/water surfaces at acquisition time), noted in research/data-sources.md. |
| 2 | UTM zone 8N (EPSG:32608), 30 m LOD0 + 60 m LOD1, 16-bit linear PNG | Geographic coordinates; Float32 binary; terrain tiles | Metric CRS gives 1 unit = 1 m directly; 16-bit over a 2160 m range is about 3.3 cm per step, far finer than the DEM accuracy; PNG decodes with the existing dependency-free decoder. |
| 3 | Preset mesh strides (Low 180 m, Medium 120 m, High 60 m, Ultra 30 m) | Always full resolution | The full 30 m mesh (about 3 M triangles) stalled headless software GL; the strides keep the same real-scale geometry with fewer vertices. |
| 4 | Static shadow map (rendered once per preset change) | Per-frame shadows | Terrain and sun are static during tasks; cuts GPU work with no visual change. |
| 5 | Procedural surface colours (elevation + slope), labelled in-app | Ship without colour; use un-sourced imagery | Imagery drape is Phase B. The approximation is labelled as such in the credits line and is not used as evidence. |
| 6 | Poly Haven "Kloofendal Overcast (Pure Sky)" HDRI | Other Poly Haven skies; procedural sky | CC0, neutral overcast light suits a rainy fjord; it is a South African sky and is credited as lighting only. |
| 7 | No decoder plugin (vite-plugin-decoders.js not copied) | Copy it now | Phase A loads no glTF/KTX2/Draco. Add it in Phase B if KTX2 imagery is adopted. |
| 8 | Viewpoints only at published coordinates | Guess the White Thunder Ridge station | The station position is UNVERIFIED until the Phase B camera solve; guessing it would present an approximation as data. |
| 9 | Time slider over the three dated USGS photos only (1941, 1950, 2004); no imagery drape | Landsat/Sentinel series via STAC; interpolate terminus positions | No keyless co-registered imagery or dated terminus history was verified in the time box. Inventing intermediate positions would present a model as data. **Plan deviation** (plan §5.2, §8 Phase 3.2). |
| 10 | Measure on a DEM-derived valley path (lowest-cost route between two published coordinates), not on dated terminus marks | Hand-drawn flowline; marks at guessed terminus positions | Reproducible from the committed DEM (`scripts/compute-flowline.mjs`) and honestly labelled as a ruler. Tasks are a full-path measurement and a 7 km scale check. **Plan deviation** (plan §5.2 Module 3). |
| 11 | Rates shown as lower bounds with "at least" arrows; no line joins the points | Single exact values; a fitted line | The captions say "more than"; a line would imply measured positions in between. |
| 12 | Shots re-scoped: S2 descends toward the photo area with a "near, not at" caption; S3 shows the measurement path | Plan's aligned-photo reveal and imagery time-lapse | Both need the camera solve / imagery. Total 55 s, within ≤ 90 s. |
| 13 | One renderer per module for the 3D panel and text mode | Separate text-mode content | Parity by construction; one set of tests covers both. |
| 14 | Primary succession from NPS "Plant Succession in Pictures" (order only, no durations) | Drop the topic; cite secondary sources | The NPS page was opened and saved (sources rows 37–39). It gives the sequence but not timing, so no durations are stated. |
| 15 | Claim cards are constructed for teaching; evidence cards cite sources | All cards from sources | Claims are what people say; labelled constructed in-app. |
| 16 | Headless tests pause the 3D loop before DOM task steps | Longer timeouts only | Software WebGL in headless Chromium starved the main thread (clicks timed out). Pausing does not change app logic. Documented in evaluation/METHODS.md. |
| 17 | Course content in the task panel over the 3D view, preset views per module, free orbit still available | Full-screen tasks | Keeps the real terrain visible as context while tasks stay in semantic HTML. |
