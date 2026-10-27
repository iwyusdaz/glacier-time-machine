# Status

Builder report, 2026-10-27. Statuses: done / partial / not done (reason) / not possible (reason).

## Plan 06 §14 Final Quality Checklist

| Item | Status |
|---|---|
| Every dataset listed with its license, source and date | done (research/data-sources.md, ATTRIBUTION.md, public/attribution.json) |
| Alignment and measurement validation reports present | partial: design/data-measurement-validation.md covers DEM, path and rates; camera-alignment report not possible (station unsolved, sources row 26) |
| Every objective in text mode and assessment | done (shared renderer; functional "text mode parity" test) |
| Cinematics ≤ 90 s, skippable, captioned | done (55 s, unit + functional tests) |
| Performance budgets met | not done here (headed GPU runs are serialized by the orchestrator) |
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
- Headed GPU performance + visual pass (orchestrator-serialized): confirm N8AO/MSAA composer quality on real hardware (implemented and rendering headless, R8) and re-judge preset screenshots.
- Remaining review minors, accepted for now: timed caption tracks, in-app help/controls legend, per-module nav completion markers, trimline annotation on the 2004 photo, Module 5 segmenting, menu cinematic-replay entry, S1 "low flight" wording (DECISIONS.md revision log tail).
