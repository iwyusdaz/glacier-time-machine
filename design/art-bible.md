# Art Bible — Glacier Time Machine v2.0.0 ("Muir Inlet, then and now")

## 1. Mood

Cold, vast and quiet: blue ice, grey-green fjord water, low cloud on the peaks.
The ground truth is real data and stays untouched: the Copernicus GLO-30 surface
model at true scale (no vertical exaggeration) and, new in v2, a real Sentinel-2
true-colour image draped over it. Everything added in v2 (ice surface detail,
icebergs, trees, clouds, birds, the 1941 ice tongue) sits on top of the data and
is labelled as illustrative where it is not measured.

## 2. Palette (plan 09 §4.6)

| Role | Hex | Usage |
|---|---|---|
| Glacier blue | `#7FB7D6` | HUD accent, hover outline, viewpoint rings, links |
| Deep ice | `#2C6E91` | Ice cliff shadow tint, active module tab, crevasse depth |
| Slate | `#3F4A52` | Panel borders, rock tint; dark slate `#0F1924` for HUD surfaces |
| Moraine brown | `#7A6A55` | Fresh moraine and recently exposed rock |
| Spruce | `#2F4F3A` | Spruce/fir crowns on older ground |
| Measure orange | `#FF8A2A` | Measurement path and markers (kept from v1: the learning cue) |

Text contrast (checked by `tests/unit/case-theme.test.js`): `#EDF5FA` on `#0F1924`
about 16:1; glacier blue `#7FB7D6` on `#0F1924` about 8:1; `#EDF5FA` on slate
`#3F4A52` about 8:1. All above 4.5:1.

## 3. Grade and light

- `applyCaseGrade('glacier-time-machine')`: AgX tone mapping, case exposure, cool
  exponential fog (the v1 linear haze is replaced). No sky dome: the Poly Haven
  overcast HDRI stays as sky + image-based light.
- Cool modern grade (default). When the time slider shows 1941 or 1950 the scene
  grade warms toward sepia (a CSS-free, in-scene grade: fog colour, exposure,
  sun colour and terrain tint lerp together), so the past reads as "archive".
- The "LUT" for this case is the pair of grade end-points in
  `src/scenes/muir-grade.js` (cool modern, warm sepia archive); it is applied as
  parameter lerps rather than a `.cube` file, which keeps Low preset free of post.
- No depth of field outside cinematics. No bloom.

## 4. Typography

| Role | Variable | Face | Usage |
|---|---|---|---|
| Display | `--font-display` | Playfair Display 600/700 | App title, module headings, historic photo captions |
| Body | `--font-body` | Inter 400/600 | Instructions, tasks, controls, tooltips |
| Accent | `--font-accent` | JetBrains Mono 400/600 | Measurements, coordinates, distance read-outs |

All self-hosted WOFF2, Latin subset, `font-display: swap`, SIL OFL 1.1 (fetched by
`../_tools/fetch-case-fonts.mjs` from the Fontsource packages). The header "Plain
font" button (saved per browser) switches every role to the system sans-serif.

## 5. Environment and models

| Item | Source | Notes |
|---|---|---|
| Terrain | Copernicus GLO-30 DSM (v1) | Unchanged, true scale |
| Surface imagery | Sentinel-2 L2A TCI, 2024-08-06 (S2B_8VML), 20 m | AWS open data `sentinel-cogs`, anonymous window read (`scripts/fetch-sentinel2.sh`). "Contains modified Copernicus Sentinel data 2024" |
| Modern glacier ice | Imagery + procedural crevasse normal map | Ice is where the 2024 image shows it; the crevasse normals are procedural |
| Calving front, icebergs | Procedural (this project) | Ice cliff at the modern Muir terminus area and a handful of merged/instanced bergs; illustrative |
| 1941 / 1950 ice tongue | Procedural, along the DEM valley path | Front position only at the verified anchors (see §7) |
| Spruce / fir trees | Procedural instanced conifers (this project) | Poly Haven `fir_tree_01` / `pine_tree_01` were fetched but are 457 MB / 905 MB GLBs: over the download budget, deleted (DECISIONS v2) |
| Shrubs, rocks, boulders | Poly Haven CC0: `wild_rooibos_bush`, `dry_branches_medium_01`, `rock_07`, `rock_09`, `boulder_01` | Shrubs on newer ground, boulders on moraine at the photo spot |
| Low cloud layer | Procedural sprite clusters (merged) | Over the high peaks |

## 6. Ambient life (calm mode during tasks; reduced motion freezes all)

1. Icebergs drift slowly down the inlet and turn.
2. Water swell (normal-map scroll on the fjord surface).
3. Cloud shadows cross the peaks (moving shadow-blob layer on the terrain).
4. Snow drift on the high ground (particle volume near the summits).
5. Birds over the water (instanced gull silhouettes on looping splines).
6. Occasional calving event at the ice cliff: a slab drops and a splash ring spreads
   (visual only; the project is silent per owner decision 9).

## 7. Time slider as a living transition (honesty rule)

- The ice front is placed ONLY at the three verified anchors: 1941 (ice fills the
  valley at the photo station), 1950 (more than 3 km retreat), 2004 (more than 7 km
  retreat, out of view). Distances are the published lower bounds, applied along
  the DEM valley path; they are not surveyed terminus positions.
- Between anchors the transition is animated for readability and the screen says
  "Between dated anchors: illustrative, not measured".
- Forest on older ground fades in with time; shrubs on newly exposed ground follow.
  Both are illustrative of succession, not mapped vegetation.

## 8. In-world interaction

- Glacier-blue viewpoint rings at the inlet, the photo spot, Muir and Riggs; click to
  glide. WASD pans, arrows rotate, +/- zoom (v1 controls kept), hover tooltips.
- Photo spot: the 1941 print held up in the view; a swipe slider wipes it against
  today's 3D view. Keyboard: slider + preset buttons; text mode keeps the photo swipe.
- Measuring line: drag along the valley on the terrain (snaps to the DEM path); the
  distance reads out in JetBrains Mono. Keyboard: the v1 measure widget (sliders)
  stays the parity path in the panel and in text mode.

## 9. References (look-matching only, nothing shipped unless listed in ATTRIBUTION.md)

| Reference | Licence | Use |
|---|---|---|
| USGS repeat photographs of Muir and Riggs Glaciers 1941/1950/2004 (already shipped, ATTRIBUTION rows 2-6) | Public domain | Ice colour, trimline, vegetation look |
| NPS Glacier Bay photo gallery, https://www.nps.gov/glba/learn/photosmultimedia/ | NPS photos mostly public domain (not shipped) | Fjord water colour, iceberg shapes |
| Sentinel-2 scene itself | Copernicus Sentinel data licence (free, attribution) | Shipped as the drape |
