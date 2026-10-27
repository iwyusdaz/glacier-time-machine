# Agent review — Realism matrix and cinematic budget

Reviewer: independent agent. Verified against `design/realism-matrix.md`,
`design/shot-list.md`, `content/cinematics.json`, `src/cinematics/shot-player.js`,
`src/main.js` (playCinematic) and live behaviour (screenshots `s1-playing.png`,
`s1-reduced-motion-still.png`, `s1-blocked-state.png`).

## A. Realism matrix audit

| Element (matrix) | Claimed | Observed | Verdict |
|---|---|---|---|
| Terrain (Copernicus GLO-30, true scale) | High, learning cue | 1 unit = 1 m, UTM 8N, no vertical exaggeration; meta + spot checks in `public/data/terrain-meta.json` | Serves the cue; pass |
| Surface colour | Low, labelled | Procedural elevation+slope palette; labelled in the always-visible credits line (`src/scenes/muir-inlet.js:300-304`) and in poster alt | Honest, but two visual problems survive the label: contour-band artefacts and present-day glacier ice coloured as vegetation (see visual review V5/V6) |
| Draped imagery per date | Not built | Correctly declared **not built** in matrix, STATUS.md, DECISIONS.md #9 | Honest deviation; the time slider uses the USGS photos instead — acceptable, but the plan's headline "scrub through decades of imagery" (README one-liner, `package.json:4` description) now over-promises what the app does |
| Historic photos | High | Real USGS 1941/1950/2004 photos with date/photographer/licence captions | Pass |
| Photos aligned in 3D | Not built | `modules.json m2.alignmentNote` says so in-app; S2 caption says "near, not at" | Honest; pass |
| Water | Medium | Flat sea-level plane, no waves; matches "no decorative waves during tasks" | Pass (edge-of-slab issue V4 is a rendering, not a matrix, problem) |
| Haze | Low in tasks | `THREE.Fog` 30–140 km only | Pass |
| Measurement path | Medium | Orange tube on a DEM lowest-cost route; labelled "a ruler, not a record of where the ice front was" in S3 caption and under every measure widget (`content/flowline.json:3`) | Pass — the honesty label is present at all three places a learner meets the path |
| Wildlife, boats, simulated future ice | None | Absent | Pass — no seductive details found in scene or content |

**Decorative-realism check:** nothing decorative was found. The only realism elements are the terrain, water, HDRI sky and fog, all of which either carry the evidence (terrain/path) or are neutral lighting. One caveat: the Kloofendal HDRI is a South African overcast sky lighting an Alaskan fjord (DECISIONS.md #6 acknowledges this); it is credited as lighting only, which is defensible, but a learner comparing the 3D sky with the 2004 photo's weather may notice the mismatch. Minor.

## B. Cinematic budget verification

- **Total duration:** S1 25 s + S2 15 s + S3 15 s = **55 s ≤ 90 s**; each shot ≤ 25 s. Enforced by `tests/unit/logic.test.js` (`cinematicBudget`). PASS.
- **Purpose tags:** every shot has one ("orient + motivate", "reveal", "explain") shown in the player progress line ("Shot 1 of 1 — purpose: orient + motivate", seen in `s1-playing.png`). PASS. Note: the top-level `purpose` for s1 is "orient" while the shot says "orient + motivate"; the player uses the shot-level tag. Cosmetic only.
- **Skippable from first frame:** Skip button is focused on open (`src/main.js:125`) and Esc works; verified live. PASS.
- **Captions:** all captions render in a bottom bar (`s1-playing.png`); captions + description are also read via an aria-live polite region. Caveat 1: all captions of a shot appear at once rather than synced to the camera moments — acceptable for 15–25 s shots, but "captions" here is really one paragraph; a timed caption track would be better. Minor. Caveat 2: there is **no narration audio at all**, so "captions for narration and meaningful sound" is trivially met; the "Voice/Ambient volume" sliders in Settings (`src/ui/settings.js:88-90`) control nothing — dead settings. Minor/major borderline: dead controls undermine trust.
- **Text description (audio-description substitute):** `shot.description` is placed in a visually-hidden live element and shown as text in text mode. **BUG:** `src/learning/course.js:83` reads `shot.audioDescription`, which does not exist in `content/cinematics.json` (the field is `description`), so text mode Module 1 renders "Flyover description: undefined" (verified live; `textmode-m1.png`). MAJOR a11y/content bug — the S1 text description is lost exactly where it is most needed.
- **Reduced motion:** every shot has a `reducedMotion.stills` block; the player shows stills with per-still captions when reduced motion is on (verified live, `s1-reduced-motion-still.png`; system preference or Settings toggle). PASS.
- **Never during assessment:** `playCinematic` refuses while `state.assessing` is true (`src/main.js:107-111`). Verified live — and this is also a **usability failure**: in Module 1 the un-answered 5-question pre-check keeps `assessing` true, so the flyover button silently does nothing (no visible message; the refusal is only sent to the aria-live region). A "not graded" pre-check blocking the module's orient cinematic until all 5 items are answered is the wrong trade — see heuristics review H3. MAJOR (combined).
- **Replayable from the menu:** shots replay via per-module buttons, but the Menu dialog has no cinematic replay entry; if a learner leaves Module 1 they cannot replay S1 without going back (module buttons do allow this, so effectively replayable). Minor.
- **Data-driven:** all three shots are fully defined in `content/cinematics.json` with paths, easing, captions, reduced-motion stills. PASS.

## C. Shot-content vs terrain accuracy
- S1 path/camera check out against terrain-meta: the target equals the Muir Glacier place-name coordinate in scene coordinates (x −8767, z −9022 = meta landmark). The S1 description says "flies low up a long fjord between snow-capped ridges", but the camera runs at 2600→1800 m altitude — above most ridge tops (max DEM 2150 m). Reword the description or lower the path. Minor.
- S3 shows the path from 14–16 km altitude; the orange tube (radius 60 m) is visible. Pass.
- During playback the scene HUD/credits stay on top of the frame (visual review V9). Minor.

## Severity summary
- Major: `audioDescription` undefined in text mode M1 (course.js:83); silent cinematic refusal during pre-check (main.js:107-111, no visible feedback); dead audio volume controls (settings.js:87-90) in an app with no audio.
- Minor: captions not timed; purpose tag mismatch ("orient" vs "orient + motivate"); S1 "low flight" wording vs 1.8–2.6 km altitude; no menu replay entry; chrome not dimmed during playback.
