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
