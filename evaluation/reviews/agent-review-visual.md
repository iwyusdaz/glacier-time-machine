# Agent review — Visual quality (per quality preset)

Reviewer: independent agent (did not build the repo). All screenshots in
`evaluation/reviews/screenshots/`. Inspected headless (software WebGL) against a
`VITE_TEST_HOOKS=1` build served from `tmp/review-build` on port 4296, viewport
1280x800.

**Method caveat (important):** in this headless environment the QualityManager's
warm-up benchmark drops the engine to the Low preset within ~20 s
(`src/core/quality.js:88-105`, `src/core/engine.js:95-103`), so screenshots labelled
"high/ultra" in the first pass actually show Low. Per-preset geometry differences
(LOD/stride, `src/scenes/muir-inlet.js:29-39`) could not be judged fairly from
screenshots; the findings below are from Low/Medium rendering plus code reading.
Headless software GL also makes frame-rate and AA conclusions unreliable — judge 3D
quality cautiously and re-check headed before release.

## Findings

| # | Severity | Where | Issue | Fix |
|---|---|---|---|---|
| V1 | Major | `src/ui/shell.js:35` + `src/main.js:176-197`; visible in every screenshot (e.g. `m1-default-module1.png`, `textmode-m1.png`) | The HUD block (viewpoint buttons + long Copernicus credits paragraph, `.scene-credits`) is appended to `.hud` and renders as a floating white box that **overlaps and obscures the top of the task panel** — the module title ("1. River of ice"), the objective line and intro text are partially hidden behind it in 3D mode and in text mode. It also covers the S3 cinematic button ("skippable" clipped, `m3-measure-feedback.png`). | Move the viewpoint bar + credits into a dedicated strip below the module nav (or inside the panel top), and cap the credits with a "Credits" disclosure; never let HUD float over the panel. |
| V2 | Major | `src/core/engine.js:20-21` vs `src/core/quality.js` presets; `package.json` deps | `antialias: false` and no SMAA/MSAA/bloom/AO pass is ever created — the `post: [...]` preset fields are declarative only, and `postprocessing`/`n8ao` are installed but never imported. Every preset renders raw, un-antialiased geometry (visible stair-stepping on ridge lines in `m2-swipe.png`). | Either implement the SMAA/AO passes on Medium+ as the presets promise, or remove the unused deps and fix the comments/preset fields. |
| V3 | Major | `src/scenes/muir-inlet.js:72,120` + `src/core/quality.js:86` | Quality preset does not rebuild the terrain: `lodForPreset`/`strideForPreset` run once at load, and `quality.restore()` is dead code (never called). Consequences verified live: selecting Ultra in Settings applies instantly to shadows only (mesh stays Low/Medium density), and after reload the stored `ultra` is ignored (engine = default, then auto-drops). **Ultra's 30 m LOD0 grid is unreachable through the UI.** | Call `quality.restore()` at startup, and rebuild the terrain mesh (or reload the scene) when the preset changes. |
| V4 | Major | `m2-swipe.png`, `m3-slider-2004.png` | The DEM is a hard-edged floating slab: at the "Lower Muir Inlet" viewpoint the cut edges of the heightfield and the abrupt end of the water plane are clearly visible against the sky background, breaking the "real place" illusion. | Extend the water plane beyond the DEM footprint; blend/feather the terrain boundary into the sky/fog, or choose viewpoints/camera limits that keep the slab edge out of frame. |
| V5 | Minor | `src/scenes/muir-inlet.js:314-321`; visible in `s1-playing.png`, `m4-poe.png` | Procedural palette produces contour-band artefacts: hard colour steps (green→tan at 450 m, white above 1100 m) read as elevation contour bands on valley sides, and steep low slopes go uniformly tan. | Smooth the elevation thresholds (e.g. lerp over ±75 m bands) and add slope-based variation/noise. |
| V6 | Minor | `src/scenes/muir-inlet.js:314-321` vs terrain-meta | Present-day low-elevation glacier surfaces (Copernicus DSM is a 2011–2015 surface; Muir Glacier's remaining tongue sits near sea level) get `C_VEG`/till colours because colour is keyed to elevation only — today's ice reads as vegetated land. The in-app label ("procedural approximation, not imagery") covers honesty but not the visual mislead. | Key a distinct ice colour to flat+low areas inside the glacier valleys, or desaturate the valley-floor green. |
| V7 | Minor | `m3-rate-chart.png` | The "2004: >7 km" point label is clipped at the right edge of the SVG viewBox (`src/systems/measure-terminus.js:101` places text at `cx + 9` with no width margin for the last point). | Anchor the last label `text-anchor="end"` or extend the viewBox right margin. |
| V8 | Minor | `public/photos/muir-1941-hd.jpg`, `muir-2004-hd.jpg` | Two unused ~280 KB photos are shipped but never referenced by `content/` or `src/` (the app uses the `-A/-B/-C` files). Wasted bytes, unclear provenance naming. | Remove from `public/photos/` or reference them deliberately. |
| V9 | Minor | `s1-playing.png`, `s1-reduced-motion-still.png` | During a cinematic the header, module nav, HUD and credits remain fully visible on top of the frame; the skip button is also far from the caption bar. | Dim/hide chrome during playback (keep Skip), restore afterwards. |
| V10 | Pass | — | Sea level is plausible: water plane at +1.5 m over a DSM whose inlet reads ~0 m (`src/scenes/muir-inlet.js:159-178`); shoreline in `m1-default-module1.png` looks correct, no water over ridges. Landmark spot checks in `public/data/terrain-meta.json` (inlet 0.0 m, Muir Glacier coord 28.2 m, Riggs 962.8 m) are plausible for a DSM. | Keep. |
| V11 | Pass | `m3-measure-feedback.png` | Markers and the orange measurement path render and stay on the surface; keyboard End/Home moved markers correctly (36.40 km readout). | Keep. |
| V12 | Pass | all screenshots | Text contrast in the overlay is good; settings/menu dialogs render cleanly (`settings-dialog.png`, `menu-dialog.png`). | Keep. |

## Per-preset summary
- **Low (headless baseline):** legible, but V1 overlap and V4 slab edges dominate; soft output from 0.75 resolution scale. No broken textures (procedural only).
- **Medium:** same as Low + declared SMAA/bloom never actually render (V2).
- **High / Ultra:** could not be faithfully screenshot headless (auto-drop, V3); code shows they would differ only in shadow size unless V3 is fixed.
