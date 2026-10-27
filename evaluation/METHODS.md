# Evaluation methods

## What was run (by the builder agent, 2026-10-27)

| Method | Tool | Result | Can show | Cannot show |
|---|---|---|---|---|
| Unit tests | vitest 5.0.5, `npx vitest run` | 39 passed | Rate maths, scoring, measurement path, content rules (cinematic budget, objective coverage, every cited source row exists and is not UNVERIFIED), DEM encoding and spot checks | Whether learners understand anything |
| Functional playthrough | Playwright 1.64.1, headless Chromium, build with `VITE_TEST_HOOKS=1` | 4 passed | Menu, keyboard module navigation, the core path in the 3D panel (pre-check, cinematic block during assessment, skip, Module 3 full objective, evidence sort, post-check) and the same decisions in text mode | Visual quality, real GPU performance, touch |
| Accessibility | @axe-core/playwright 4.14.0, WCAG 2.1 A/AA tags | 3 passed, 0 critical/serious | Overlay, dialogs, all five modules in panel and text mode, answered states | Screen-reader experience with real assistive tech; full WCAG conformance |
| Sub-path build | `tests/sub-path.spec.js` on a release build | 1 passed | Works under `/play/glacier-time-machine/`, no failed requests or console errors | Production CDN behaviour |
| Data validation | `design/data-measurement-validation.md` | Recorded | DEM spot checks, path length, rate arithmetic | Terminus positions (none verified) |

Headless note: Chromium in CI renders WebGL in software, which starves the main thread. The panel playthrough and the task-screen axe scans pause the 3D render loop (`engine.pause()`) before the DOM steps. The app's logic and DOM are unchanged by this.

## Not done

- No real learners have used it. No learning gains are claimed.
- No physical phone testing; no headed GPU performance runs or Lighthouse (the orchestrator runs those later).
- Agent design reviews (seven reports: accessibility, heuristics, visual quality, expert-style + honesty/data audit, cognitive walkthrough, multimedia principles, realism/cinematics) ran in 2026-10-27 and are under `reviews/`; the revisions they triggered are in `DECISIONS.md` ("Revision log — agent review"). Headless screenshots could not judge 3D visual quality faithfully (software WebGL), so headed visual checks remain outstanding.

Raw outputs from future runs go in `results/`. Protocol templates for real playtests are in `human-protocol/`.
