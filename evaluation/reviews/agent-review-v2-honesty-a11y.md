# Agent review — v2.0.0 honesty and accessibility (Glacier Time Machine)

Agent review (AI reviewer). Automated axe is not a substitute for testing with assistive technology or for an expert accessibility review. Build `main @ 123e912` (test hooks), `vite preview`, Chromium headless with SwiftShader. axe-core via `@axe-core/playwright`, tags wcag2a/aa/21a/21aa, `canvas` excluded. Pixel contrast for in-world cues was sampled from software-rendered screenshots, so treat it as indicative.

## axe (wcag2a/aa, 21a/aa; canvas excluded)

| State | Critical/serious |
|---|---|
| M1 initial (pre-check) | 0 |
| M3 (time slider, measure widgets, rate tasks) | 0 |
| **M3, "Measuring line on the terrain" on, after a drag** | **1 serious: `color-contrast` `.terrain-measure-out` 1.09:1** (A1) |
| Photo spot open | 0 |
| HUD drawer collapsed | 0 (panel `inert` + `aria-hidden`) |
| M5 graded post-check (fresh load) | 0 |
| M5 after a Hide → Show drawer cycle | 1 serious `.module-title` 1.35:1, transient (A5) |
| Text mode M3, M5 | 0 |

The repo's `tests/a11y.spec.js` does not scan the measure-tool or photo-spot states.

**Collapsed drawer and Tab.** After "Hide panel", 40 Tab presses cycled header → module nav → scene bar → credits → wrap. None reached the 26 controls inside `#task-panel`. Verified.

## Honesty checks (verified)

| Check | Result |
|---|---|
| Front only at dated anchors | `frontForYear` (`systems/time-front.js:36-54`) returns the anchor placement for 1941, 1950 and 2004, with `measured: false` always. Probe: 1941 s = 29.44 km, 2004 s = 36.44 km (= path end), matching −7 km/−4 km/0 from the lower bounds (DECISIONS V2-7). The slider is `step=1` over the three anchors only, so it never rests between them. |
| "Between dated anchors: illustrative, not measured" | Shown on the 3D view during every transition ("1947. Between dated anchors…", `v2-medium-m3-transition-mid.png`). At anchors the label reads "…position illustrative, not surveyed". It never claims to be measured. Under reduced motion transitions snap, so no between state is ever drawn. |
| Sentinel-2 / Copernicus attribution | `ATTRIBUTION.md` row 9, `public/attribution.json` (lines 67-72), and the in-app credits ("contains modified Copernicus Sentinel data 2024"). DEM credit row 1 is intact. |
| 1941 photo citation | Photo spot: "13 August 1941. Photograph by W. O. Field (USGS, public domain)". Time-slider figcaption and the text-mode M2 caption pair are intact. |
| Photo spot approximate | Ring label "Photo spot (approximate)…" and a panel note: the camera station is unverified, so the views will not line up. |
| Illustrative labels | Credits and hover labels mark the ice, bergs, forest, clouds and birds as illustrative. "Muir/Riggs Glacier (published coordinate)". |

## Findings

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| A1 | **critical** | **The terrain measuring readout is invisible.** It is `#edf5fa` text (`styles/case-hud.css:120-124`) on the near-white scene bar: 1.09:1. axe reports it as serious, which breaks the repo's own zero-serious gate. Sighted users cannot read the measured distance, the tool's only output (`v2-low-measure-line.png`, the faint mono line under the tool button). | axe; screenshot | Set `.terrain-measure-out { color: #14212b; }` (the scene bar's text colour), or give it the dark HUD surface. Add the measure-tool-on and photo-spot states to `tests/a11y.spec.js`. |
| H1 | major | **The time label can lie about the 3D state.** Opening the photo spot forces `setYear(2004)` (`scenes/muir-world.js:215`) but leaves the label and slider alone. With the slider at 1941, the screen says "1941: dated anchor (USGS repeat photograph)…" over the 2004 ice. This persists after closing. | probe: `{year: 2004, label: "1941: dated anchor…", slider: "0"}` | Restore the year on close, or update label and slider together (see interaction I4). Add a unit/e2e check that `label` year equals `dressing.year`. |
| H2 | major | **The panel's honesty notes now contradict the 3D view.** `systems/time-slider.js:64` says "No terminus positions in between have been verified, so none are shown", yet the 3D animates in-between fronts. `content/modules.json:21` (`terrainNote`) says the 3D landscape "does not change with the time slider", but ice, forest and grade now change. The rate chart note (`modules.json:53`) remains correct. | M3 panel text (probe `sliderNotes`) | Reword: "Only these three dates are dated evidence. The 3D view animates between them for readability; in-between positions are illustrative, not measured." Change `terrainNote` to "The elevation model and ground imagery are modern (DEM 2021, image 2024) and do not change; the ice tongue, forest and colour grade are illustrative." |
| H3 | major | **2024 vegetation shown as the 1941 ground without a label.** The Sentinel-2 drape is the same at every year and only tinted (`scenes/muir-inlet.js:175-184`). The 1941 scene shows green forested slopes, while the 1941 print's alt text says "bare rock with no vegetation". The time label says "dated anchor (USGS repeat photograph)" and does not mention the imagery date. A learner can read modern forest as 1941 evidence, which contradicts the M4 succession lesson. | `v2-medium-m3-1941.png`, `v2-medium-inlet-1941.png` | Add "Ground image: 2024 at every year" to `timeLabel()` (`time-front.js:84-90`). Better: tint newly uncovered ground toward moraine `#7A6A55` for past years (visual V3). |
| A2 | major (code read; not tested with a screen reader) | **Live-region flooding.** `.time-label` is `role="status"` (`muir-world.js:97`). `_showLabel` rewrites it on every frame of a transition (`:131-132, 161-169`), which can announce dozens of interim years ("1943… 1944…"). `.terrain-measure-out` is `aria-live="polite"` and is rewritten on every `pointermove` during a drag (`:278, 295`). The slider already announces the anchor through `announce()`. | code | Mark the visual label `aria-hidden="true"`, or write to it only when the transition ends. During the drag, update the readout with `aria-live="off"` and announce once on `pointerup` (`:279` already does). |
| A3 | major (indicative, software render) | **In-world cues miss 3:1 non-text contrast against the water.** The viewpoint ring pixels sampled at about (149,177,190) on water at about (147,168,179) give about 1.1:1 (`v2-low-ring-hover.png`: the inlet ring is barely visible). The orange path (213,153,103) on water (140,161,170) gives about 1.1:1 luminance contrast. It is visible by hue only, so it fails for colour-vision deficiency. Button and slider equivalents exist, so this is not a blocker. | screenshots + pixel sampling | Draw rings and path with a dark `#0F1924` halo/outline under a light core (≥ 3:1 against both water and snow). Give the measure markers a white outline. |
| H4 | minor | **The archival print is recoloured, and so is "today".** `.photo-spot-print img { filter: sepia(0.35) }` (`case-hud.css:101-108`) tints the black-and-white USGS print and also the live 2024 render (`.live` does not reset `filter`). Evidence should be shown as published, and the "today" half should not look aged. | CSS | Remove the filter, or apply it only as a frame or mat. If kept, add "(display tint added)" to the caption. |
| H5 | minor | The scene-bar button reads "Photo spot (1941 print)" without "approximate" (`main.js:261`); the ring label has it. | — | "Photo spot, approximate (1941 print)". |
| A4 | minor | The collapsed drawer leaves a 2.4 rem strip of panel at opacity 0.18. Its heading ("1. River of ice") is visible at about 1.3:1 and cannot be operated (`v2/hud-shell.css:49-50`). It is inert, so axe passes it, but it looks like a broken control. | `v2-medium-inlet-1941.png` bottom right | Use `visibility: hidden` for the panel and keep only the "Show panel" button. Or render the strip as a full-contrast handle that toggles the drawer. |
| A5 | minor (unconfirmed) | After Hide → Show panel, axe flagged `.module-title` at 1.35:1. The panel was still mid-way through its opacity transition (0.18 → 1) under SwiftShader, and a fresh-load M5 scan is clean. This is likely a headless timing artefact, but it is worth re-checking headed. | probe | Re-scan headed. Drop the opacity fade under reduced motion (motion M4). |
| A6 | minor | Closing the photo spot drops focus to `<body>` (interaction I5). | probe | Return focus to the invoker. |

## Contrast spot checks (HUD text, computed)

| Pair | Ratio (approx.) |
|---|---|
| Time label `#edf5fa` on `rgba(15,25,36,.92)`, year `#7fb7d6` | ≈ 15:1, ≈ 8:1 |
| Tooltip `#f8fafc` on `#11161d` | ≈ 17:1 |
| Photo-spot note and label `#b2c7d6` on `#0f1924` | ≈ 10:1 |
| Scene hint, notes `#3f4a52` on white-ish panel | ≈ 9:1 |
| **Terrain readout `#edf5fa` on `#fefeff`** | **1.09:1 (A1)** |

## Top fixes (ranked)

1. A1: readout colour (a one-line CSS fix) and an a11y spec for the tool states.
2. H1: keep the label, slider and 3D year in sync across the photo spot.
3. H2 and H3: reword the two stale notes; label the drape as 2024 at every year.
4. A2: stop per-frame live-region writes.
5. A3: dark halos on rings and the measuring path.

**Verdict (honesty and a11y): ready after fixes.** A1 must be fixed before tagging. The anchor-only front placement, the "illustrative, not measured" label, the Sentinel-2 attribution, the 1941 citation and the approximate photo-spot labelling are all intact.
