# Agent review — v2.0.0 motion load (Glacier Time Machine)

Agent review (AI reviewer). Build `main @ 123e912` (test hooks), Chromium headless on SwiftShader. The frame delta is capped at 0.1 s (`core/engine.js:122`), so on this renderer (about 0.7 fps) motion runs much slower than wall-clock time. Calm-mode easing (~0.35 s time constant) also takes several real seconds to settle. Motion was judged from `window.__TEST__.dressing` state deltas and screenshot byte comparisons, not from watching animation. The headed "is it alive" capture remains for the orchestrator.

## What works (verified)

| Item | Result |
|---|---|
| ≥ 5 ambient systems live | `lifeSystems()` lists 6. State advanced between samples for iceberg drift (`bergState[].s`), cloud drift and the cloud-shadow offset (`cloudDrift`), birds (`birdT`) and water swell (`swell.offset`). Two full-motion screenshots 1 s apart differ. `triggerCalving()` returns true at 1941. |
| Calm mode in Module 3 | `life.calm === true`. The calm factor was easing toward 0.30 (0.83 after 2.5 s headless; the repo test shows 0.2–0.45). Motion never freezes. Ring pulse is scaled to 0.3 (`in-world-interaction.js:504-510`). |
| Calm during graded sets | M5 with the post-check rendered: `state.assessing === true`, `life.calm === true`. The scene is at 2004, where the drawn front is on land (32 m), so no calving can fire. The time label is hidden outside M3 (`main.js:132`). Nothing moved in a distracting way during assessment. |
| Calm while the measuring line is on | `syncCalm` runs on tool toggle (`main.js:282`); `calm === true`. |
| Reduced motion freezes everything | With `prefers-reduced-motion: reduce`: `cloudDrift`, `birdT` and `swell.offset.x` are all 0, and the berg position was unchanged across samples. **Screenshots at t = 4 s and t = 5 s are byte-identical.** The pair at 3 s → 4 s differed; I believe this is late load or shadow-map settling, but I did not verify it. Time-slider changes snap (`muir-world.js:156-157`). Glides snap (`in-world-interaction.js:346`). |

## Findings

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| M1 | major | **The photo-spot comparison is not calm.** `openPhotoSpot` sets `this.tool = 'photo'` (`muir-world.js:222`) but never calls `syncCalm`. `syncCalm` is only called from module change, `setAssessing` and the measure toggle (`main.js:90, 101, 133, 282`). Probe: with the photo spot open, `tool: 'photo'` and `life.calm === false`. This is the most focused visual-comparison task in the app. | probe `photoCalm {tool: "photo", calm: false}` | Pass a `onToolChange` callback into `MuirWorld` and call it from `openPhotoSpot` and `closePhotoSpot` (or make `syncCalm` a method `world.setTool()` invokes). |
| M2 | major | **Low does not reduce life counts.** Low and Medium build exactly the same dressing: 1400 trees, 900 shrubs, 160 cloud puffs, 900 snow particles, 14 bergs, 18 birds. Plan §2.5 says "Low preset: life systems at reduced counts". Low still draws about 814 k triangles at the default view; about 506 k of those are the merged photo-spot props (`boulder_01` alone 198 k), sub-pixel at 52 km. | probe `counts`; triangle census by mesh | Read `engine.quality.name` in `MuirDressing` and halve the trees, shrubs, clouds and snow on Low. Hide `photoProps` beyond about 3 km, or use a decimated LOD. |
| M3 | minor | **Calving is dormant in 4 of 5 modules.** Outside M3 the year is forced to 2004 (`main.js:132`), where the front is on land and `triggerCalving()` returns false (`muir-dressing.js:506`). Only 5 systems are live there. In M3 at 1941/1950, calving fires every 18–38 s of calm time, right at the front the learner is reading. It is relevant motion, but it competes with the cue. | probe `m5.calvingPossible: false` | Add a small calving face at the modern 2004 ice (where the 2024 image shows it meets water). In M3 under calm, suppress calving while the slider transition runs. |
| M4 | minor | **The HUD drawer transition ignores reduced motion.** The 0.28 s slide and fade (`v2/hud-shell.css:52, 60`) has no `prefers-reduced-motion` override, and neither does the time-label transition. | grep: no `prefers-reduced-motion` rule in `hud-shell.css` or `case-hud.css` | Add `@media (prefers-reduced-motion: reduce) { #task-panel, … { transition: none } }`, also keyed to the in-app toggle (`MotionPrefs`). |
| M5 | minor | **Clouds dim but birds do not under calm.** Clouds drop opacity in calm (`cloudsOpacity`, `:621`). Birds (dark, 9 m, flapping) keep full contrast over the water, just slower. | `muir-dressing.js:450-484` | Scale bird alpha or count with `calmFactor`, as the clouds already do. |
| M6 | minor | **Snow drift not visually confirmed.** The particle volume exists (900 points, size 26) near the highest summit. I could not see it in any Low or Medium frame at the default views. | — | Check in the headed capture; if it is invisible, move it to the ridge in the M1/M3 framing or raise opacity. |

## Top fixes (ranked)

1. M1: calm mode for the photo spot.
2. M2: reduce counts on Low and LOD the photo-spot props.
3. M3: calving where the 2024 ice meets the water, and none during slider transitions.
4. M4: reduced-motion overrides for the CSS transitions.

**Verdict (motion): ready after fixes.** Calm and reduced motion are sound in the graded states. The gaps are the photo spot and Low scaling.
