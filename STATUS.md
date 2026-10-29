# Status

Builder report, 2026-10-27. Statuses: done / partial / not done (reason) / not possible (reason).

## Plan 06 §14 Final Quality Checklist

| Item | Status |
|---|---|
| Every dataset listed with its license, source and date | done (research/data-sources.md, ATTRIBUTION.md, public/attribution.json) |
| Alignment and measurement validation reports present | partial: design/data-measurement-validation.md covers DEM, path and rates; camera-alignment report not possible (station unsolved, sources row 26) |
| Every objective in text mode and assessment | done (shared renderer; functional "text mode parity" test) |
| Cinematics ≤ 90 s, skippable, captioned | done (55 s, unit + functional tests) |
| Performance budgets met | done (orchestrator, headed Apple M1, 2026-10-27): Medium 60 fps (budget ≥ 55), 4 draw calls, 199k triangles, menu interactive 0.15 s, 2.47 MB before first interaction; Ultra 6.35M triangles at 55.8 fps via dynamic resolution; High 46.9 fps (`evaluation/results/perf-2026-10-27.json`) |
| Release v1.0.0 with archive, checksum, showcase.json; sub-path test passes | partial: showcase.json valid, sub-path passes, release workflow present; tagging is the orchestrator's job |
| README: play link, trailer, realism rationale, data credits, evaluation notice | done (trailer is a placeholder; link pending deployment) |

## Plan §2 success criteria

| Criterion | Status |
|---|---|
| 3D terrain from real elevation data, imagery draped | partial: real Copernicus terrain; no imagery drape (no keyless series sourced; procedural colours labelled) |
| 1941 and 2004 photos aligned to the 3D camera | not done: shown side by side / swipe; camera solve UNVERIFIED |
| Time slider across available dates, keyless | done for the three dated USGS photos |
| Terminus measurement along a flowline; rate with uncertainty | partial: measurement on a DEM valley path (not terminus marks); rates as lower bounds |
| POE; succession module; causes-and-uncertainty module | done |
| Final evidence-based explanation with rubric | done (self-check, exemplar; not auto-graded) |
| Text mode parity; performance budgets | parity done; budgets not measured here |
| Build contract (08 §5) | done except the tag |
| All verification and reviews; ≥ 5 revisions documented | done(agent review): seven agent review reports in `evaluation/reviews/`; 18 revisions from them logged in DECISIONS.md's revision log (R1–R18, ≥ 5 met many times over); 17 build-time decisions documented earlier |

## Agent review revisions (2026-10-27)

Seven reports (accessibility, heuristics, visual, expert-style + honesty audit, cognitive walkthrough, multimedia principles, realism/cinematics). Verdict: ready after fixes — 0 critical, 9 major, ~22 minor. All 9 majors addressed: R1 (text-mode description bug), R2 (pre-check cinematic block + visible guards), R3 (HUD overlap), R4 (quality presets never applied/persisted), R5 (unshipped source register), R6 (terminus coloured as vegetation + contour bands), R7 (DEM slab edges), R8 (declared-but-missing post effects + dead audio controls), R9 (no keyboard camera). Minors: R10–R18. Full finding → change → evidence table: DECISIONS.md "Revision log — agent review". Verification screenshots: `evaluation/revisions/`.

## Open items

- Camera solve for the White Thunder Ridge station; then a 3D photo overlay with opacity steps 0/50/100 (R13's removed hd photos are staged for it).
- Keyless imagery per date and a verified terminus history, if found.
- Sources for fjord depth, calving and regional climate (currently stated as gaps).
- `sensitive-topic-approach.md` is folded into the teacher guide; split out if reviewers want it separate.
- N8AO/MSAA composer quality was confirmed rendering on the Mac GPU during the orchestrator pass (2026-10-27); a per-preset screenshot re-judgement is still open.
- Remaining review minors, accepted for now: timed caption tracks, in-app help/controls legend, per-module nav completion markers, trimline annotation on the 2004 photo, Module 5 segmenting, menu cinematic-replay entry, S1 "low flight" wording (DECISIONS.md revision log tail).

## v2.0.0 (plan 09 §8 acceptance checklist), 2026-10-29

| §8 item | Status |
|---|---|
| Art bible: palette, three fonts, LUT, references with licences | done: `design/art-bible.md` (grade end-points in `src/scenes/muir-grade.js` stand in for a `.cube` LUT, DECISIONS V2-6) |
| No photo backdrops within ~30 m; props grounded; no unlit cut-outs | done for the photo-spot props (Poly Haven rocks/shrubs set on the DEM, merged); HDRI is sky/light only. Contact-shadow decals are off for the photo-spot props (scale: the camera is never within 30 m of them except at the photo spot) |
| ≥ 5 ambient-life systems; calm mode and reduced motion | done: iceberg drift, water swell, cloud drift + cloud shadows, snow drift, birds, calving event (6). Calm in Module 3 and during graded sets; reduced motion stops them. Tested in `tests/v2.spec.js`. The headed "is it alive" capture is for the orchestrator |
| Every learning action in-world with keyboard and text-mode equivalents; tests cover both | partial (corrected after review I2; it was marked done while the in-world line was ungraded). In-world now: viewpoint rings (buttons in the scene bar); photo-spot swipe (slider + presets; text mode keeps the v1 photo swipe); the M3 dated years via year rings at each front, driving the same time slider (DECISIONS V2-18); the M3 measurement via the terrain measuring line, which fills the task's marker sliders that "Check measurement" grades (V2-17). Sliders remain the keyboard/text equivalent. Still panel-only: the rate calculations, the M2 change tags, M4 predict-observe-explain and M5 claim/evidence sort and confidence (forms by design) |
| Learning cues stay most salient (agent visual review on Low/Medium) | deferred: agent reviews in progress |
| Fonts self-hosted, subset, Plain-font, contrast ≥ 4.5:1 | done (`tests/unit/case-theme.test.js`) |
| Budgets on Medium (headed); first interaction ≤ 15 MB; per file ≤ 20 MB; total ≤ 60 MB | headless probe (swiftshader, `window.__TEST__.engine.renderer.info.render.calls`): Medium 31-33 draw calls (budget 220). Release dist 14.6 MB total (all of it, including the 2.0 MB Ultra-only 30 m heightmap, so first interaction is under 15 MB); largest file 3.1 MB (`boulder_01` GLB); every file < 20 MB. Headed GPU fps is for the orchestrator |
| Honesty labels intact | done: imagery credited; ice/forest/bergs/clouds labelled illustrative; "Between dated anchors: illustrative, not measured" on screen; photo spot labelled approximate (camera station unverified) |
| Agent reviews, ≥ 5 revisions, v2.0.0 released, trailer + posters, showcase re-pin, live checks | posters re-rendered from the v2 scene (done); reviews, revisions, trailer, tag, re-pin and live checks: deferred to the orchestrator |

Plan §4.6 items deferred, with reasons:
- Poly Haven `fir_tree_01` / `pine_tree_01`: fetched, 457 MB and 905 MB GLBs, over budget and under the disk threshold; deleted. Procedural instanced conifers instead (DECISIONS V2-4).
- Boat/kayaker for scale and boat/drone piloting: not built in the time box; the camera glide + WASD covers moving up the inlet.
- Survey markers dropped on the terrain beyond the two measuring-line markers: not built.
- Calving sound: none (owner decision 9, visuals only).
- Moraine/fresh rock where ice retreated: shown by the real 2024 imagery (bare grey ground near the modern ice); no extra modelled moraine.

v2 review revisions (2026-10-29): DECISIONS V2-11..V2-22 (A1, H2, A2, I4/H1/I5, M1, H4/M4, H5, V3/H3, I1/I2, I3, V1, M2/V12, V5, A3). Deferred: V2 ice tongue, V4 cloud billboards, V6 forest clustering and the remaining minors. Headless Medium draw calls 32-37 (budget 220).

v2 verification before the review revisions (2026-10-29): vitest 66/66; Playwright functional 4/4, a11y 3/3 (the overlay scan needed a longer timeout under the v2 scene and passed alone), v2 6/6 (run in groups because headless frames are slow), sub-path 1/1; `validate-showcase.mjs 2.0.0` valid. Not tagged.
