# Agent review — Expert-style reviews (plan 06 section 10) + honesty/data audit

All sections are "Agent review — simulated persona". File/line references are to
`glacier-time-machine/` unless noted. Verified numbers were traced through
`research/sources.md` (row numbers used below) and `research/data-sources.md`.

---

## Persona 1: Glaciologist / physical geographer (simulated)

### What is right (checked, not padded)
- The quantitative spine is exactly the USGS caption set and nothing else: 1941–1950 ">3 km retreat, >100 m thinning" (row 9), by 2004 ">7 km northwest, out of the field of view" (row 11), Riggs "as much as 600 m / >250 m" (row 12), retreat since the mid-1700s with maximum >50 km (row 5), maximum advance ~1750 (row 17). Every instance in `content/modules.json`, `content/items.json`, `content/evidence-cards.json` traces to one of these rows. No fabricated terminus positions, no interpolated dates, no invented rates. This is unusually disciplined for a climate change piece.
- Rates are consistently presented as lower bounds with "at least" arrows, no connecting line, and a table whose column is literally "Average rate (lower bound)" (`src/systems/measure-terminus.js:76-112`). `post-3` correctly explains that a 0.11 km/yr average with a ≥0.33 km/yr early minimum implies a non-constant rate. Excellent.
- The pre-1941 history and tidewater dynamics are given equal weight with climate in the exemplar, `post-4`, and evidence cards `c-only-warming`/`c-no-climate`; both one-cause extremes are marked too strong. Matches the evidence.
- The succession order (moss → Dryas → alder → spruce → hemlock, with cottonwood inside the Dryas stage) matches NPS rows 37–39, and the app explicitly refuses to state stage durations (row 40 is UNVERIFIED and respected).

### Issues
| # | Severity | Finding |
|---|---|---|
| G1 | Major | The terrain colours put **ice nowhere it should be and vegetation where ice is**: `surfaceColour()` (`src/scenes/muir-inlet.js:314-321`) colours everything below 450 m as vegetation/till. The committed Copernicus DSM is a 2011–2015 surface, so the surviving Muir Glacier tongue (DEM height 28.2 m at the published coordinate, `public/data/terrain-meta.json`) renders as green vegetated land, while snow-white is applied above 1100 m on bare ridges. A learner asked to predict succession (Module 4) sees "green" where the glacier is today. The credits label ("procedural approximation") covers the honesty rule but not the physical mislead. Fix: colour by surface plausibility (flat+low inside glacier valleys → ice; use slope and the trimline band), or desaturate the low-elevation green. |
| G2 | Major | The "Muir Glacier place-name coordinate" (GNIS/Wikipedia label point, row 23) is used as the path end and as the Module-3 task anchor. The app is honest about it (`content/flowline.json:4`: "a place-name coordinate, not a dated terminus"; `terrain-meta.json` labels the source), but a GNIS label point can sit anywhere in the feature; measuring 36.44 km "from Muir Inlet to Muir Glacier" against it bakes an unquantified position uncertainty into the headline measurement. State the uncertainty (the register gives none) or phrase the task as "between these two published coordinates", which it already half-does in `flowline.json` but not in the task prompt (`content/modules.json` m3-inlet). |
| G3 | Minor | Elevation thresholds are physically arbitrary: permanent snow/ice at 1100 m and bare at 450 m do not match Glacier Bay's actual snowline gradient (wetter west, drier interior) and produce contour-band artefacts. Cosmetic given the label, but see visual review V5. |
| G4 | Minor | The M2 heading says "same viewpoint", which is correct, but the 3D scene beside it shows a modern view from an unrelated camera; the app says so (`alignmentNote`), yet the visual juxtaposition invites "stand where Field stood" reading that the README one-liner ("Stand where a glaciologist stood in 1941, line up his photograph with the real 3D landscape") still promises. The one-liner over-promises the unbuilt camera solve. Reword README/`package.json` description until Phase B. |
| G5 | Minor | `public/data/terrain-meta.json:12` asserts `"verticalDatum": "EGM2008 geoid heights (Copernicus DEM vertical reference)"` as fact, while `research/data-sources.md:30-32` marks the vertical reference UNVERIFIED (product handbook never opened). A shipped public artifact should not assert what the register flags; either open and cite the handbook or annotate the field. |
| G6 | Pass | Sea level, water plane (+1.5 m over a ~0 m DSM inlet), spot-check heights (0.0 / 28.2 / 962.8 m) and the >50 km vs 36 km path consistency argument in `design/data-measurement-validation.md` are all plausible and honestly framed ("a consistency check, not a validation against a terminus record"). |

## Persona 2: Secondary earth-science teacher (simulated)

### What is right
- Evidence-first sequencing matches NGSS data-analysis practice: observations → measurement with uncertainty → multiple causes → confidence statement; alignment matrix maps all five objectives to pre/practice/post/transfer; parallel pre/post forms are genuine paraphrases, not clones.
- The sensitive-topic handling is built into the mechanics, not a disclaimer: distractor tags (`taller`, `cause`) punish over-reading; `post-4` marks both extremes wrong; the rubric's "Multiple causes" level 3 requires "retreat began around 1750"; gaps (no climate records, fjord depth, calving) are stated as gaps in-app, not just in the teacher guide.
- Free text is never auto-graded; the transfer scenario is labelled "Constructed for teaching purposes… not data about any real glacier" both in `content/items.json` and in-app (`.note.constructed`).
- `design/teacher-guide.md` gives realistic timings, discussion prompts (including the Field-1950 date-conflict discussion), and a privacy note that matches the actual behaviour (localStorage only, "My progress" view/download/clear).

### Issues
| # | Severity | Finding |
|---|---|---|
| T1 | Major | In-app source citations point to a file students cannot open: every feedback, caption and card ends with "Source: research/sources.md row N" (`src/ui/dom.js:19-22`), but `research/` is not shipped in the build and the line is not a link. For the target audience the evidence chain is unreachable in-app. Ship a rendered source register (or per-row URLs) in `public/` and link the row numbers. |
| T2 | Major | The Module-1 pre-check silently blocks the flyover cinematic until all 5 questions are answered (`state.assessing` is set by `itemSet`, `src/main.js:107-111`; verified live — click does nothing visible). A teacher demoing "River of ice" would click "Play the flyover", nothing would happen, and there is no visible explanation (the refusal is only an aria-live announcement). Either exempt formative pre-checks from the cinematic guard or show the message visibly. |
| T3 | Minor | The time slider ticks (1941 / 1950 / 2004) are evenly spaced (`src/systems/time-slider.js:31`, `<ol>` items) while the underlying intervals are 9 vs 54 years. For a data-literacy course an even-spaced time axis is a teachable wrong-model; add a note or space ticks proportionally. |
| T4 | Minor | "Restart module" exists but there is no "restart the whole course" and no persistent progress indicator in the module nav (completion state lives only in "My progress"). For a 45–60 min lesson split over two class periods, a per-module "done" marker on the nav buttons would help. |
| T5 | Minor | The teacher guide asserts "Answers are stored only in this browser… Nothing is sent anywhere" — correct today, but the guide should also say the learning record is unencrypted localStorage and clearable, which the "My progress" dialog does. Half-true as written. |
| T6 | Pass | Class period timings (8/8/15/8/15 min) are plausible for the actual task load; Modules 1–2 standalone path works (no dependencies backwards). |

---

## Honesty and data audit (cross-cutting)

### 1. Number trace — every in-app number
| In-app number | Location | Source (with URL) | Verdict |
|---|---|---|---|
| 1941-08-13, W. O. Field | modules.json y1941 | row 1 → usgs.gov/media/images/muir-and-riggs-glaciers-muir-inlet-alaska-1941 | OK |
| >3 km retreat, >100 m thinning, 1941–1950 | anchors y1950, rate tasks, chart, cards e-3km | row 9 → .../muir-and-riggs-glaciers-muir-inlet-alaska-1950 | OK |
| 1950-08-04 | anchors y1950 | row 8 | OK |
| >7 km northwest by 2004 | anchors y2004, m3-scale task, chart, exemplar | row 11 → .../muir-and-riggs-glaciers-muir-inlet-alaska-2004 | OK |
| 2004-08-31, Bruce Molnia | anchors y2004 | row 10 | OK |
| Riggs "up to 600 m" retreat, ">250 m" thinning | y2004 caption, tag riggs-retreat | row 12 | OK ("as much as" preserved as "up to") |
| Retreat since mid-1700s / about 1750; max >50 km; >1 km thickness lost | pre-4, m3-inlet note, exemplar, card e-1750 | rows 5, 17 → USGS 1941 record + nps.gov/glba/learn/nature/glaciers.htm | OK |
| ≥0.33 and ≥0.11 km/yr | rate tasks, chart table, course.js:156-157 | derived from rows 9/11, always labelled "lower bound"/"at least" | OK |
| Trimline ↔ 1941 ice thickness | tag trimline, post-2 | row 13 | OK |
| Seawater undermining fronts; calving blocks "up to 200 feet" | card e-calving | row 19 | OK (imperial unit kept as published) |
| Snowfall/topography/climate factors | card e-factors, exemplar | row 18 | OK |
| Succession sequence (no durations) | m4 | rows 37–39 → nps.gov/glba/learn/nature/succession.htm | OK |
| Glacier X numbers (1.2 km / 20 yr) | items.transfer | labelled constructed, not real | OK |
| 36.44 km path length, 0.0/28.2/962.8 m DEM spot heights | terrain-meta.json, validation doc | computed from the committed DEM; landmark coords from rows 23–25 | OK |
| **No untraceable number found in learner-facing content.** Unused verified facts (11% less ice, 95% thinning, 200-year-old ice — rows 20, 21, 35) are correctly left out. | | | |

**Numbers with no source: none found in learner-facing content.** The only unflagged assertion is the vertical-datum string in the shipped `terrain-meta.json` (G5 above).

### 2. Required honesty labels
- Field1950.jpg date conflict: **flagged in-app** — "Date conflict: …" block with the full note is rendered under the Module-3 time slider (`src/systems/time-slider.js:52`, `content/modules.json conflictNote`), same in text mode; the file is not shipped in `public/photos/` and is used as neither a date point nor a photo. PASS.
- Procedural surface colours: labelled "procedural approximation (elevation and slope), not imagery" in the always-rendered credits line (`src/scenes/muir-inlet.js:300-304`) and in poster alt. PASS on honesty; the label's placement (small text in the overlapping HUD box, see visual V1) weakens it. The Module-3 `terrainNote` says the terrain "does not change with the time slider" but does not repeat the procedural-colour caveat exactly where learners compare photos to terrain. Minor.
- DEM "valley path": labelled at all three contact points — S3 caption ("a ruler, not a record of where the ice front was"), under every measure widget (`flowline.label`), and in the teacher guide. PASS.
- Rate chart lower bounds: title, SVG desc, figcaption and table column all say minimum/lower bound; arrows, no connecting line. PASS.

### 3. Data pipeline faithfulness
- `scripts/fetch-data.sh`: keyless manifest (4 Copernicus COG tiles, 6 USGS photos, 25 verification pages), `--verify` compares Content-Length; `data/raw/` is gitignored and `git ls-files data/` is empty — **raw data never committed. PASS.**
- `scripts/process-dem.sh`: 4-tile mosaic → crop WGS84 136.50–135.95 W / 58.83–59.22 N → EPSG:32608 at 30 m (`-tap`, bilinear) + 60 m average LOD → 16-bit linear PNG. Cross-checking `public/data/terrain-meta.json`: 1080×1468 px @ 30 m = 32,400 × 44,040 m = exactly the UTM bounds; elevation encoding [−9, 2151] brackets the computed stats (−7.33, 2149.84) with ~3.3 cm quantisation, well under DEM accuracy; CRS, resolution and range are faithfully recorded, and the decoder (`src/systems/terrain-data.js:22-36`) inverts the exact encoder formula. **Faithful.**
- Known, documented limitations: it is a DSM (ice/vegetation surfaces at acquisition), not bedrock or bathymetry — stated in the script header, data-sources.md and visible to learners via the terrain note. Good.
- **Gap:** the NPS succession page (`research/sources.md` rows 37–39, saved as `data/raw/pages/nps-succession-2.html`) is **missing from the fetch manifest**, so a fresh clone cannot re-download one of the two NPS sources the course leans on; `data-sources.md`'s "re-downloaded by scripts/fetch-data.sh" claim does not hold for it. Add it to the manifest. (The NPS glaciers page *is* in the manifest.)

### 4. Compliance / claims hygiene
- No learning-gain or "tested with learners" claims anywhere (README evaluation notice correctly says agent reviews "in progress" and learner testing pending — though it should be updated to "complete" once these reviews land).
- No compliance claims; licences state what the sources say (USGS "Public Domain", Copernicus free licence + verbatim DLR/Airbus notice, Poly Haven CC0). ATTRIBUTION.md and `public/attribution.json` cover the sky, photos and DEM.
- The one over-claim found is the README/`package.json` one-liner ("Stand where a glaciologist stood… line up his photograph with the real 3D landscape") describing the unbuilt alignment feature (G4).
