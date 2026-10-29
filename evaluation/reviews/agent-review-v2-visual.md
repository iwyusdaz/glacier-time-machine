# Agent review — v2.0.0 visual realism and cue salience (Glacier Time Machine)

Agent review (AI reviewer). Build: `main @ 123e912`, built with `VITE_TEST_HOOKS=1` into a temporary folder and served with `vite preview`. Chromium headless on **SwiftShader** (software WebGL, about 0.7 fps on Medium). Colour, filtering and grade verdicts are cautious: a GPU render will be sharper and the sepia shift may read differently. Low and Medium were set through `localStorage` (`glacier-time-machine:quality`), as in `tests/v2.spec.js`. Screenshots: `evaluation/reviews/screenshots/v2-*.png`.

## What works (verified)

| Item | Result |
|---|---|
| Sentinel-2 drape | Loads on Low and Medium (1620 × 2202 JPEG, `scene.drape` set). Overview and oblique views read as a real fjord: green lower slopes, snowfields, grey-green water. I saw no seams or tile joins inside the DEM footprint (`v2-medium-m1-default.png`, `v2-medium-inlet-2004.png`). |
| Budget (headless probe) | 33 draw calls on Low and Medium. Drawn triangles at the default view: 814 k on Low, 924 k on Medium (under the 1.5 M budget). |
| Typography | Computed: headings and photo captions `"Playfair Display"`, body, buttons and tooltips `Inter`, readouts/time-label year/credits `"JetBrains Mono"`. Plain font switches every role to `system-ui` (measurement readouts to `ui-monospace`). |
| Calving cliff | At 1941 the drawn tongue ends in a cliff at the waterline (`v2-medium-front-1941-close.png`; front ground height 0 m). |
| Poster vs alt text | `public/poster-2.0.0.jpg` matches `showcase.json` `poster.alt`: 1950 setting, 2024 Sentinel-2 drape named, illustrative ice tongue at the fjord head, blue ring on the right slope, low cloud on far peaks. Honest. |
| No photo backdrop | HDRI is sky and light only. Photo-spot rocks and shrubs are real Poly Haven meshes on the DEM. |

## Findings

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| V1 | major | **The glacier front, the main cue, is not salient in Module 3.** M3 opens on the 52 km `overview` (`main.js:30`, `MODULE_VIEW[2]`) with the panel covering the right third. The 1941, 1950 and 2004 fronts (s = 29.4, 32.4 and 36.4 km along the path) differ by a few pixels at this distance. No viewpoint frames the 1941 to 2004 stretch: `muir` targets the 2004 path end, and `inlet` cannot see the ice at all (`v2-medium-inlet-1941.png` matches `-2004.png`). | `v2-medium-m3-1941.png`, `v2-medium-m3-transition-mid.png` | Add a "front" viewpoint (target about s = 33 km, radius 10–12 km, looking up-valley). Glide to it when the time slider changes. Mark the front with a dark-edged line across the valley and a JetBrains Mono year tag. |
| V2 | major | **The ice tongue reads as a flat sheet, not a glacier.** It is a 13 × 64 ribbon (`muir-dressing.js:157-158`) with a fixed 2.2 km width (`:200`, `halfW = 1100`), uniform white, and ruler-straight edges. Draped over the valley walls it looks like translucent white panels (`v2-medium-muirvp-1941.png`). Dark blotches show through its surface, most likely terrain poking through the coarse grid (cause not confirmed). Crevasse normals cannot be seen beyond about 2 km. The 1941 print shows heavily crevassed ice that fills the valley wall to wall. | `v2-medium-front-1941-close.png`, `v2-medium-muirvp-1941.png` | Fit the width per row to the valley (cast rays sideways to where the ground rises above the ice surface). Raise the column count to about 33. Add an albedo/roughness variation texture plus bluer cliff and crevasse tint (`#2C6E91`), so the ice reads from 5–10 km. |
| V3 | major | **The 2024 forest stays on the ground in 1941 and 1950.** The drape is the 2024 image at every year; `applyGrade` only tints it (`muir-inlet.js:175-184`, `muir-grade.js:8`). The sepia 1941 scene shows green forested slopes, while the print's own alt text says "slopes are bare rock with no vegetation". The credits name the 2024 image, but the time label does not. A learner can read the green as 1941 vegetation. See also H3 in the honesty report. | `v2-medium-m3-1941.png`, `v2-medium-inlet-1941.png` | For past years, desaturate the drape toward moraine brown `#7A6A55` on ground the ice uncovered after that year (along-path rank, as already used for trees). Add "Ground imagery is 2024 at every year" to the time label. |
| V4 | major | **Low cloud looks like hovering faceted lenses.** The puffs are 10 × 6-segment spheres scaled to 900–2200 × 140–260 m (`muir-dressing.js:367-376`). They show hard polygon silhouettes, and where they cut the terrain they read as flat translucent slabs. | `v2-medium-muirvp-1941.png` (top right, slabs over the slopes), `v2-medium-inlet-2004.png` | Use camera-facing sprites with the existing `softDiscTexture()` (`:79`), or fade by depth near terrain intersections. Keep them above the peaks (y > peak + 250). |
| V5 | major | **The scene reads as a diorama slab floating in grey.** Module 1's default view shows the DEM's straight cut edge, a cyan rim line and grey void across the lower third (`v2-medium-m1-default.png`, `v2-low-ring-hover.png`). This is the remaining "greenscreen/model on a table" cue. | skirt `muir-inlet.js:264-312` | Extend the water plane and skirt well beyond the frame and let fog take the edge. Or frame the M1/M5 views so the cut edge is off-screen. |
| V6 | major | **Procedural conifers read as noise, not forest.** 1400 single 18 m cones (`muir-dressing.js:300-319`) spread over the full 32 × 44 km. They are invisible at overview, and from 1.5 km they show as scattered dark pins on a green drape that already shows the forest (`v2-medium-forest-close.png`). The 900 shrubs (2–6 m half-domes) are invisible at every viewpoint I tried. The succession change "forest appears/disappears" cannot be seen. The Poly Haven trees were dropped for size, which is a fair reason (DECISIONS V2-4). | `v2-medium-forest-close.png` | Cluster the trees into dense stands on the older ground near the viewpoints, and add 2–3 crown tiers with colour variation. Alternatively drop per-tree geometry at range and show succession as a drape-tint band (V3). Drop the shrubs or move them next to the photo spot. |
| V7 | minor | **Icebergs are plausible in scale but read as popcorn.** 14 flat-shaded icosahedra, 12–57 m across, all at y = 1.5 (`:229-268`). They look like white lumps with no waterline darkening or blue underwater tint (`v2-medium-bergs-close.png`). Grounding (on water only) is correct. | `muir-dressing.js:235-238` | Flatten the tops, add a blue-green underwater skirt and a faint foam ring, and vary the heading tilt. |
| V8 | minor | **The sepia past grade is barely visible.** The mean colour of the scene area moves from (122, 134, 136) in 2004 to (117, 124, 123) in 1941. The 1941 and 2004 inlet frames look alike. Cautious verdict on SwiftShader. | `muir-grade.js:7-8` | Push the archive end further (tint `#E6CFA8`, a lower blue channel in the fog). Or add a light sepia CSS filter overlay on the canvas only for anchors ≤ 1950 (off in High Contrast). |
| V9 | minor | **The photo-spot "today" half is a blurred close hillside.** The camera sits 120 m above the 445 m ridge (`muir-world.js:77`). The 20 m Sentinel texels are magnified into smears, and the valley the print shows is mostly hidden behind the near slope. The comparison is honestly labelled approximate, but it does not compare the same scene. | `v2-medium-photo-spot.png` vs `v2-medium-photo-spot-all1941.png` | Raise the camera (+400 m), aim at the 1941 front, and narrow the FOV to match the print. |
| V10 | minor | The time label overlaps the module heading ("3. Measure it") and the photo-spot panel's print at 1440 px. It is centred on the full stage and sits on top (z-index 4). | `case-hud.css:57-72`, `v2-medium-m3-1941.png` | Centre it in the canvas area left of the panel (offset by the panel width), or dock it above the time slider. |
| V11 | minor | Long prose is set in the accent mono: `.ts-stat` sentences and the credits paragraph (`case-hud.css:43`). The plan's readability rule keeps body text in the body face. | `v2-medium-m3-entry.png` | Keep only numbers and coordinates in JetBrains Mono (wrap them in `<span class="num">`). Set the sentences in Inter. |
| V12 | minor | Photo-spot props cost about 506 k triangles (merged `boulder_01` alone 198 k) and are drawn at the default 52 km view, where they are sub-pixel. See motion report M2. | `muir-dressing.js:556-578` | Hide `photoProps` unless the camera is within about 3 km; decimate the boulder. |

## Cue salience (Low and Medium)

| Cue | Verdict |
|---|---|
| Glacier front position | **Not salient** (V1, V2). A small strip at overview. |
| Measuring line | **Salient by hue.** The wide orange ribbon and tall markers stand out on Low and Medium (`v2-low-measure-line.png`). Its luminance contrast with the water is only about 1.1:1, and its readout is near-invisible (honesty/a11y report A1). |
| 1941 photo comparison | **The print itself is strong** (large, sepia, captioned). The live half is weak (V9), and the time label overlaps the panel (V10). |

## Top fixes (ranked)

1. V1: a front-framing viewpoint plus a front marker in Module 3.
2. V3: stop showing the 2024 forest as the 1941 ground, or label it on the time label.
3. V2: give the ice tongue a valley-fitted width and visible ice texture.
4. V4 and V5: soft clouds; hide the slab edge.
5. V6: forest stands that read as forest, or show succession through the drape tint.

**Verdict (visual): ready after fixes.** Nothing here blocks learning on its own, but the §8 "learning cues stay the most salient element" item is not met for the glacier front.
