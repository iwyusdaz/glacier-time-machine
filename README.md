> **Evaluation status:** Automated unit, functional and accessibility testing is complete, and agent-based design reviews are complete (seven reports under `evaluation/reviews/`; the revisions they triggered are logged in `DECISIONS.md`). Headed-GPU performance testing is still to come, so performance conclusions are preliminary. No real learners have tested this yet. No physical phone testing has been done (mobile was checked with device emulation). See `evaluation/METHODS.md`.

# Glacier Time Machine

Explore the real 3D landscape of Muir Inlet, Alaska, compare USGS repeat photographs from 1941, 1950 and 2004, measure distances on the terrain, calculate retreat rates as lower bounds, predict what grows on newly exposed ground, and judge how sure we can be about the causes.

**Play:** https://immersive-learning-showcase.vercel.app/play/glacier-time-machine/ (pending deployment)

**Trailer:** placeholder. A short captioned trailer will be added before release.

## Problem

Students see glacier "before and after" photos often but rarely practise how scientists measure change, how large the uncertainty is, or why one cause is too simple. On a charged topic, a lesson has to be evidence-first.

## Audience

Grades 9–12 earth and environmental science, introductory undergraduate geoscience, adult museum visitors (Modules 1–2 work as a 10-minute path). 45–60 minutes.

## Approach

Five modules, each in the 3D view's task panel and in text mode (same renderer, same decisions):

1. **River of ice:** pre-check, 25 s flyover over the real terrain, how glaciers move (NPS).
2. **Same place, different time:** swipe the 1941 and 2004 USGS photos; tag the changes (with distractors).
3. **Measure it:** time slider over the three dated photos; measure on a valley path computed from the elevation model; compute rates from the published "more than" figures as lower bounds; rate chart plus data table.
4. **What came next:** predict-observe-explain; order the NPS primary-succession stages.
5. **Why, and how sure?:** sort claims from evidence; write a confidence statement; rubric self-check; post-check; transfer to a fictional glacier (constructed for teaching purposes).

## Key design decisions

- **Only verified numbers.** 1941–1950: more than 3 km of retreat and 100 m of thinning. By 2004: more than 7 km northwest. Riggs Glacier: up to 600 m of retreat and more than 250 m of thinning. Retreat began in the mid-1700s. No terminus positions between the dates are shown, because none are verified.
- **Rates are lower bounds.** "At least 0.33 km/yr" (1941–1950) and "at least 0.11 km/yr" (1941–2004), shown with "at least" arrows and no connecting line.
- **Multiple causes.** Pre-1941 retreat, tidewater calving, snowfall and topography alongside climate trends. Both one-cause extremes are marked too strong.
- **Honest labels.** Surface colours are procedural, not imagery. The measurement path is a ruler, not a flowline. One USGS file has a date conflict (`Field - 1950` is dated 1941 on its record), so it is flagged in-app and not used.
- Full log: `DECISIONS.md`. Plan deviations (no imagery drape, no 3D photo alignment, no dated terminus history) are in `STATUS.md`.

## Realism rationale

The terrain is real (Copernicus GLO-30 at true scale) because the place, its scale and the viewpoint are the evidence. Decorative detail (waves, wildlife, boats) is left out during tasks. See `design/realism-matrix.md`.

## Evidence and evaluation

Run by the builder (headless): unit (39), functional playthrough in both modes (4), axe across all task screens (3, zero critical/serious), sub-path build (1). Agent design reviews: in progress, not yet run. No learner data exists. See `evaluation/METHODS.md` and `design/data-measurement-validation.md`.

## Accessibility

Full text mode, keyboard-operable slider, measurement, sorting and ordering (no drag and drop), alt text on every photo, chart with data table, captioned and skippable cinematics with reduced-motion stills. See `design/accessibility-plan.md`.

## Data credits

- Terrain: produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.
- Photographs: W. O. Field (1941, 1950) and Bruce F. Molnia (2004), USGS, public domain.
- Facts: USGS photo records, NPS Glacier Bay pages, NGSS (see `research/sources.md`).
- Sky: Kloofendal Overcast (Pure Sky) by Greg Zaal, Poly Haven, CC0.
- Full list: `ATTRIBUTION.md` and `public/attribution.json`.

## Next steps

Camera solve and a 3D photo overlay; keyless imagery per date; a verified terminus history; sources for fjord depth, calving and regional climate; real learner testing.

## Tools

three.js 0.186.1, Vite 8.3.5, Playwright 1.64.1, axe-core, vitest, GDAL 3.13.3 (data pipeline).

## Authorship

AI-assisted: built by an AI coding agent working from a human-written plan, with every fact checked against a source opened and logged in `research/`. Human review is pending.

## License

Code MIT (`LICENSE`), content CC BY 4.0 (`LICENSE-CONTENT`). Third-party assets keep their own licences (`ATTRIBUTION.md`).
