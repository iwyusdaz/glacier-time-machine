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
| All verification and reviews; ≥ 5 revisions documented | partial: 17 decisions and re-scopes documented in DECISIONS.md (≥ 5 met); agent reviews have not run yet (added by the orchestrator) |

## Open items

- Camera solve for the White Thunder Ridge station; then a 3D photo overlay with opacity steps 0/50/100.
- Keyless imagery per date and a verified terminus history, if found.
- Sources for fjord depth, calving and regional climate (currently stated as gaps).
- `sensitive-topic-approach.md` is folded into the teacher guide; split out if reviewers want it separate.
