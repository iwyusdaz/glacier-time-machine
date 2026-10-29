# Agent review — v2.0.0 interaction (Glacier Time Machine)

Agent review (AI reviewer). Build `main @ 123e912` with `VITE_TEST_HOOKS=1`, `vite preview`, Playwright Chromium headless on SwiftShader (about 0.7 fps). Frame time is capped at 0.1 s (`core/engine.js:122`), so glides and calm-mode easing take far longer in wall-clock time than on a GPU. I drove the UI with real mouse and keyboard events and read state through `window.__TEST__`. I did not run the repo's own Playwright suites in this pass.

## What works (verified)

| Item | Result |
|---|---|
| Viewpoint rings and hover | Hovering the inlet ring shows the tooltip "Viewpoint: lower Muir Inlet — Click to glide here" (Inter, `#f8fafc` on `#11161d`). The cursor changes to `pointer` (`v2-low-ring-hover.png`). |
| Glide | A ring click starts an eased glide (camera 25889 → 25832 → 25612 z over the first frames). `goRing('muir')` completes: camera at the ring's `cameraPos`, OrbitController target synced to the destination (`muir-world.js:102-112`). |
| WASD | Holding `W` for 4 s (focus off form fields) moved the orbit target 1.9 km on the ground. It is blocked during a glide, by design (`muir-world.js:135`). |
| Measuring line owns the pointer | While on: `world.enabled === false`, `site.toolOwnsPointer === true`, crosshair cursor. A canvas drag drew a 17.5 km along-path line (16.0 km straight) and the **camera did not move** (orbit drag gated, `muir-inlet.js:389`). Hovering a ring shows **no** tooltip, and clicking a ring **does not glide**. WASD stays inert (`world.enabled` gate, `muir-world.js:135`). Arrow keys still rotate the view, which is reasonable. Turning the tool off restores `enabled === true`. |
| Photo-spot swipe | The ring or the "Photo spot (1941 print)" button opens the panel with focus on `#ps-range`. Presets All 1941 / Half / All today work. `aria-valuetext` is set. Escape closes it (`v2-medium-photo-spot*.png`). |
| Time slider → 3D | Arrow keys on `#ts-range` animate the living scene, with the label passing through "1947. Between dated anchors: illustrative, not measured." |
| Text-mode equivalents | Text mode M3 has the time slider and both measure-widget slider pairs; M2 has the 1941/2004 swipe with citations. axe is clean (honesty/a11y report). |

## Findings

| # | Sev | Finding | Evidence | Fix |
|---|---|---|---|---|
| I1 | major | **The in-world measuring line is not connected to the graded measuring task.** The drag calls `setMeasure` (`muir-world.js:291-297`), which sets the site markers and a readout only. "Check measurement" in the panel reads its own slider values (`systems/measure-terminus.js:53-62`, `course.js:144-148`). So the in-world tool is an ungraded toy: dragging the line does not move the panel markers and is never logged to the learning record. | Code and probe: after the drag, `#m3-inlet-a/b` values were unchanged | Have the drag write sA/sB into the active task's sliders (dispatch `input`), so "Check measurement" grades what was drawn. Log `interacted` with source `in-world`. |
| I2 | major | **§8 "every learning action doable in-world" is not met, and STATUS.md:51 marks it "done".** See the rating below: no graded action can be done in the scene. | — | Correct STATUS. Do I1, and add an in-world year handle (I3). |
| I3 | major | **The ice has no in-world time control.** Hovering the ice says "Use the time slider in Module 3" (`muir-world.js:81`). The plan's "living transition" is driven only from the panel slider. | — | Make clicking the ice or front marker step to the next dated anchor (snap to anchors only), with the panel slider kept in sync. |
| I4 | major | **Opening the photo spot silently resets the scene to 2004** (`muir-world.js:215`). It does not move the slider or the label: with the slider at 1941 the label still reads "1941: dated anchor…" while the 3D shows the 2004 ice, and this persists after closing. Honesty impact in H1. | probe: `afterPhoto {year: 2004, label: "1941: dated anchor…", slider: "0"}` | Remember the year on open and restore it on close. Or call `goYear(2004)` plus `_showLabel` and sync `#ts-range`. |
| I5 | minor | **Escape or "Put the print away" drops focus to `<body>`** (`muir-world.js:206, 234-239`). | probe: `focus: BODY` | Store the invoker (ring button or the last focused element) and restore focus on close. |
| I6 | minor | **Only the photo-spot ring has a glide button.** The inlet, Muir and Riggs rings map to the v1 viewpoint buttons, which cut (`setViewpoint`) to different framings rather than the ring's glide destination (`main.js:244-263`). This is a functional equivalent, not the same view. | — | Route those buttons through `world.goRing(key)`, or add "Glide to …" buttons. |
| I7 | minor | **The measuring tool is offered in every module** (`main.js:268-284`). In M1, M2, M4 and M5 it shows the path and a line with no task. | — | Disable it outside M3, or show "Measuring tasks are in Module 3". |
| I8 | minor (code read, not run) | Clicking the ice, bergs or forest (registered without `cameraPos`, `muir-world.js:81-83`) makes the shared manager glide to 2.2 m from the hit point (`in-world-interaction.js` `_onCanvasClick`). `_syncOrbit` then clamps the radius to 1500 m, which produces a jump. | — | Give these items explicit `cameraPos`/`cameraTarget` framings, or `onClick` only. |
| I9 | minor | Mouse-wheel zoom is not gated while the measure tool is on (`muir-inlet.js` wheel handler). It is harmless, but it is inconsistent with "tool owns the pointer". | — | Leave it (zoom helps aiming), and document it in the tool hint. |

## §8 "every learning action doable in-world": rating

| Learning action | In-world today | Keyboard / text |
|---|---|---|
| M1 pre-check, flyover | Panel; cinematic button | yes / yes |
| M2 compare 1941 and 2004 photos | Panel swipe. The in-world photo spot compares the 1941 print with a 2024-imagery render, not the 2004 photo | yes / yes |
| M2 tag the changes | Panel checkboxes | yes / yes |
| M3 step through the dated years | Panel slider drives the 3D; no in-world handle (I3) | yes / yes |
| M3 measure retreat | In-world drag exists but is ungraded (I1) | sliders / yes |
| M3 calculate a rate | Panel | yes / yes |
| M4 predict-observe-explain | Panel | yes / yes |
| M5 claim/evidence sort, confidence | Panel | yes / yes |

**About 0 of 8 graded actions can be completed in-world.** Two have ungraded or exploratory in-world counterparts (measure, photo spot), plus navigation. Keyboard and text-mode parity is good. The in-world half of §8 is **unmet (major)**. Boat/drone piloting and survey markers are openly deferred (DECISIONS V2-10).

## Top fixes (ranked)

1. I1: wire the terrain line into the graded measure task.
2. I4: keep the year, slider and label consistent across the photo spot.
3. I3: an in-world way to step the ice between dated anchors.
4. I2: correct STATUS.md:51.
5. I5 and I6: focus return; matching glide buttons.

**Verdict (interaction): ready after fixes.**
