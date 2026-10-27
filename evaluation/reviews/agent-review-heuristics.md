# Agent review — Heuristic evaluation (Nielsen 10 + game playability)

Reviewer: independent agent. Evidence: live inspection of the test build
(port 4296, headless Chromium, screenshots in `evaluation/reviews/screenshots/`)
plus code reading. Ratings: pass / concern / fail, per UI mode.

## Nielsen's heuristics

| # | Heuristic | 3D UI | Text mode | Evidence and notes |
|---|---|---|---|---|
| 1 | Visibility of system status | **Concern** | Pass | Good: module nav `aria-current`, polite announcements on module/viewpoint/slider changes, live measure readout (`src/systems/measure-terminus.js:34-45`). Concern: (a) the cinematic refusal is invisible (`src/main.js:107-111`, verified live — dead button during the pre-check); (b) changing the quality preset updates shadows only, with no indication the terrain mesh is unchanged, and the saved preset silently reverts on reload (`src/core/quality.js:86` never called). |
| 2 | Match with the real world | Pass | Pass | Vocabulary is honest and concrete ("a ruler, not a record of where the ice front was"; "place-name coordinate"). Minor: "(sources 29, 30)" row references are meaningless to a learner who cannot open `research/sources.md` (not shipped in the build; `src/ui/dom.js:19-22`). |
| 3 | User control and freedom | Concern | Pass | Free module navigation, cinematic Skip (button + Esc, verified), "Restart module". No whole-course restart; the Module-4 prediction cannot be changed after "Lock in my prediction" (inputs disabled, no undo — `src/learning/course-late.js:30-44`); acceptable for POE but a "change my prediction" affordance before observing would reduce anxiety. |
| 4 | Consistency and standards | Pass | Pass | Native controls used throughout (range inputs, fieldsets, dialogs); one renderer guarantees the panel and text mode behave identically; dialog pattern uniform. |
| 5 | Error prevention | Pass | Pass | Shortcut buttons constrain marker placement to the path; numeric answers parsed leniently (comma decimal, `src/learning/logic.js:16-18`); tolerances (±600 m / ±300 m / 0.02) are humane; no destructive actions. |
| 6 | Recognition rather than recall | **Concern** | Concern | The objective line is restated at the top of every module (good), but the HUD credits/viewpoint box **obscures the module title, objective and intro** in both modes at 1280×800 (all screenshots; worst in `textmode-m1.png`). The learner must recall the goal from whatever text survives the overlap. |
| 7 | Flexibility and efficiency | Pass | Pass | Marker shortcut buttons, PageUp/Down = 1 km, slider keyboard steps, preset swipe buttons (0/50/100). Good acceleration for expert users. |
| 8 | Aesthetic and minimalist design | **Concern** | Pass | No decorative 3D elements (no wildlife/boats/waves) — commendable restraint. But the floating HUD box (V1), the hard-edged DEM slab at close viewpoints (V4) and dead audio controls (settings) add visual noise the content does not need. |
| 9 | Help users recognize and recover errors | Pass | Pass | Every scored action returns explanatory feedback naming the answer and the reason ("You measured 36.40 km; aim for about 36.4 km…"), rate feedback re-derives the division; wrong tags each get a "why". |
| 10 | Help and documentation | **Concern** | Concern | No in-app help, no controls legend, no key-binding list (moot for the camera, which has no keyboard bindings at all — see accessibility A2); the teacher guide exists only in the repo. First-run guidance is limited to module intros. |

## Game playability heuristics

| # | Heuristic | 3D UI | Text mode | Notes |
|---|---|---|---|---|
| P1 | Clear goals | Pass | Pass | Every module states its objective verbatim; each task has a one-sentence prompt with explicit success criteria (tolerances stated in feedback). |
| P2 | Immediate, explanatory feedback | Pass | Pass | Verified: tag feedback per tag (`m3-measure-feedback.png` for measure), rate feedback, sequence feedback showing the NPS order, sort feedback per card. |
| P3 | Challenge/skill balance | Pass | Pass | The 7 km scale task with a 300 m tolerance is trivially passable via 100 m steps (intended — it is a scale exercise); the full-path task is guided by shortcut buttons. No frustration spike found. |
| P4 | No unnecessary friction | **Fail (one spot)** | Pass | The Module-1 pre-check (5 unanswered questions) silently disables the flyover button until all five are answered — verified live (`s1-blocked-state.png` shows panel still up, nothing visible happens). This is the module's orient+motivate moment, gated behind an un-graded quiz with no visible explanation. Everything else flows. |
| P5 | Progress visibility | Concern | Concern | Per-set summaries exist ("N of 5 correct"), but module nav buttons never show completion; "My progress" (Menu) is count-based, not objective-based. In a 5-module course a learner cannot see at a glance which modules are done. |

## Worst offenders (cross-mode)
1. Silent cinematic block during the pre-check (P4/H1) — `src/main.js:107-111` + `src/learning/course.js:45` (`itemSet` sets `assessing` on render).
2. HUD overlap hiding module titles/objectives (H6) — `src/main.js:176-197`.
3. Quality preset that cannot be persisted or applied to geometry (H1) — `src/core/quality.js:86`, `src/scenes/muir-inlet.js:72,120`.
4. Meaningless source-row references for learners (H2) — `src/ui/dom.js:19-22`.
5. No help/controls documentation in-app (H10).
