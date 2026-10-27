# Agent review — Cognitive walkthrough (core learning path)

Reviewer: independent agent. Persona from plan 06 §3: **Tariq, 16** — a student
who has seen glacier photos but cannot explain how scientists measure change.
Method: step through the full path in the 3D panel (same renderers serve text
mode), asking at each step: (1) will he know what to do? (2) will he see
progress? (3) will he get usable feedback? Every "no" is logged. Live-verified on
the test build; screenshots in `evaluation/reviews/screenshots/`.

## Step log

| Step | Know what to do? | See progress? | Usable feedback? | Notes |
|---|---|---|---|---|
| 1. Arrive at app (Module 1) | Yes | Yes | n/a | Lands directly in Module 1 with the panel open; module buttons labelled "1. River of ice" … "5. Why, and how sure?" are obvious. **But** the module title/objective/intro are partially hidden behind the floating HUD credits box (`screenshots/m1-default-module1.png`) — his first read of the goal is visually broken. |
| 2. Pre-check (5 questions) | Yes ("not graded" label) | Partial — the summary only appears after the 5th answer | Yes — every option explains why, right or wrong | `content/items.json` pre items; `screenshots/m1-default-module1.png`. Minor: he cannot see "2 of 5 answered" while going. |
| 3. Play the flyover | **NO** | **NO** | **NO** | With the pre-check unanswered, the button silently does nothing (verified live: panel stays, no message; `s1-blocked-state.png`). Tariq's most likely first click after skimming the quiz is a dead button. Only after answering all 5 does it play (`s1-playing.png`). **Worst step in the path.** |
| 4. Flyover itself | Yes | Yes ("Shot 1 of 1 — purpose: orient + motivate") | Yes — captions state the three ideas | Captions render as one block; fine. |
| 5. Read "How a glacier moves" | Yes | n/a | n/a | Four plain-language facts, each tagged "(sources 29, 30)" — **meaningless to him**: the cited register is not in the build. He learns to ignore the citation lines, which undermines the evidence-first goal this course is built on. |
| 6. Module 1 check item | Yes | n/a | Yes | Single item with why-feedback. |
| 7. Module 2: compare photos | Yes — "Compare them with the slider" | n/a | Yes — swipe presets + percent aria-valuetext | `screenshots/m2-swipe.png`. Alignment note honestly says photos are "next to the 3D model, not projected onto it". |
| 8. Tag the changes | Yes (checkboxes + one button) | n/a | Yes — per-tag verdicts incl. distractors ("not supported", "correctly left out") | Strong step; distractor "The mountains are taller" catches the classic misread. |
| 9. Module 3: time slider | Yes — labelled, arrow keys | Yes — photo + stat swap | Yes — "a minimum, from the USGS caption" wording; date-conflict note visible | `screenshots/m3-slider-2004.png`. Tick spacing is even while intervals are 9 vs 54 years — he may read time as proportional (minor). |
| 10. Measure task 1 | **Mostly** | Yes — live distance readout | Yes — tolerance + the honest note ("not where the terminus was") | The prompt says "Put marker A at Muir Inlet" but markers move via sliders; the "A to path start" shortcut rescues it. The 3D markers are thin 900 m cylinders — findable at the module's preset view. |
| 11. Rate calculations | Yes — input + Check | n/a | Yes — wrong answers show the division and the lower-bound meaning | Good recovery support. |
| 12. Rate chart | Yes | n/a | Yes — arrows mean "at least", no line, table duplicates values | Minor: "2004: >7 km" label clipped at the SVG edge. |
| 13. Module 4: Predict | Yes — radio + Lock button | Yes — Observe section appears | **Partial NO** — clicking Lock with nothing selected announces "Choose a prediction first" to the hidden live region only (`src/learning/course-late.js:31`); visibly nothing happens | Same invisible-feedback pattern as step 3. |
| 14. Observe | Yes | Yes — section reveals, focus moves to its heading | Yes — compares his prediction with the photo | Good. |
| 15. Order succession stages | Yes — Earlier/Later buttons | n/a | Yes — exact or "N of 5 in the NPS order" + the correct order | No timing stated (honest). |
| 16. Explain | Yes — optional textarea | Yes — "Saved on this device only" | Yes | Not auto-graded (stated). |
| 17. Module 5: sort 11 cards | Yes — radios per card | Partial — must scroll a long panel | Yes — per-card verdicts with why | The longest module (sort + confidence + rubric + 5 post items + 3 transfer items) is one scroll; a segment break would help. |
| 18. Confidence statement + rubric | Yes — prompt names the gaps | Yes | Yes — "not a grade" stated; exemplar in a `<details>` | Strong step; exemplar models citing gaps. |
| 19. Post-check + transfer | Yes | Partial | Yes | Transfer scenario is labelled "Constructed for teaching purposes… not data about any real glacier" — Tariq is unlikely to mistake it. |
| 20. Finish | — | **Partial NO** — no completion state; module nav never marks modules done; nothing marks the course complete | — | He ends on the transfer items with no wrap-up screen or "what you can now do" summary. |

## Summary of the "no" answers
1. **Step 3 (critical for the persona):** flyover silently blocked by the unanswered pre-check — no visible message, no progress hint, no feedback. Fix: exempt formative pre-checks from the assessment guard or show the guard message visibly near the button.
2. **Step 13:** "Choose a prediction first" is announce-only; add visible inline text.
3. **Steps 1/5:** HUD overlap obscures the objective; citation row numbers point outside the build.
4. **Step 20:** no end-of-course completion state or summary.
5. Minor frictions: no per-question progress inside item sets; even-spaced time ticks; long unsegmented Module 5.

The core loop (compare → tag → measure → rate → predict → argue causes) is otherwise well-scaffolded: every step has a visible control, a stated prompt, and explanatory feedback — the walkthrough failures are about silent guards and obscured headers, not about the learning design.
