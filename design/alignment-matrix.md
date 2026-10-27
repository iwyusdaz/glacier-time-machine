# Alignment matrix

Every objective has instruction, practice with feedback and an assessment. The 3D panel and text mode both have all of them (same renderer: `src/learning/course.js`).

| Objective | Instruction | Practice + feedback | Pre | Post | Transfer | Text mode |
|---|---|---|---|---|---|---|
| 1 Glacier flow, terminus | NPS facts (rows 29–34), S1 flyover (or its text description) | Module 1 check item | pre-1 | post-1 | — | Yes |
| 2 Repeat-photo changes | Swipe compare 1941/2004, captions with alt text | Change tagging, per-tag "why" | pre-2 | post-2 | — | Yes (same tags, photos with alt text) |
| 3 Measure + rate + uncertainty | Time slider (3 verified dates), rate chart + data table | Two measurements, two rate calculations, lower-bound item | pre-3 | post-3 | tr-1 | Yes (sliders, buttons, data table) |
| 4 Multiple causes, limits | Evidence cards, gaps note, exemplar | Evidence sort with per-card "why"; rubric self-check | pre-4 | post-4 | tr-2 | Yes |
| 5 Predict + justify | 1950 photo, NPS succession sequence (rows 37–39) | POE predict/observe, ordering, explanation | pre-5 | post-5 | tr-3 | Yes |

Assessment items: `content/items.json`. Cards: `content/evidence-cards.json`. The transfer scenario (fictional "Glacier X") is labelled constructed for teaching purposes. Free-text answers are never auto-graded.
