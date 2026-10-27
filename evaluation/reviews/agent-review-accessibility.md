# Agent review — Accessibility (GAG + Xbox AG categories, WCAG 2.1 AA overlay)

Reviewer: independent agent. Live checks on the test build (port 4296, headless
Chromium) plus code reading. The repo's own axe runs (WCAG 2.1 A/AA, zero
critical/serious) were not re-run; findings below are from manual inspection and
are things axe cannot see.

## Perception

| # | Severity | Finding |
|---|---|---|
| A1 | Major | **Text mode shows "Flyover description: undefined" in Module 1.** `src/learning/course.js:83` reads `shot.audioDescription`, but `content/cinematics.json` uses the field name `description`. Verified live: `#textmode` innerText contains "Flyover description: undefined" (`screenshots/textmode-m1.png`). Screen-reader / no-WebGL learners lose the S1 visual description entirely. Fix: `shot.description`. |
| A2 | Major | **The 3D camera has no keyboard control and no on-screen rotate/zoom buttons.** Orbit is bound to pointer events only (`src/scenes/muir-inlet.js:224-246`); the `scene.step()` keyboard helper (`src/scenes/muir-inlet.js:249`) is never called by any UI, and the promised "on-screen button equivalents" (`src/core/input.js:7-8`) were never built. Keyboard-only users can jump between 4 preset viewpoints but cannot orbit/zoom. Violates the repo's own standards §5.3–5.4, GAG "input" and Xbox AG input-flexibility categories; WCAG 2.1.1 is only mitigated by text mode, not for 3D exploration itself. |
| A3 | Major | **Cinematic refusal is invisible.** When the pre-check is open, clicking "Play the flyover" does nothing visible; the refusal ("Finish the questions first…") goes only to the hidden aria-live region (`src/main.js:107-111`; verified live). Sighted low-vision users see a dead button. Show an inline visible message, and reconsider whether the un-graded pre-check should count as an "assessment" at all. |
| A4 | Minor | Skip link `<a class="skip-link" href="#textmode">` (`index.html:11`) targets an element with the `hidden` attribute — clicking it moves nothing while text mode is closed. Make it toggle text mode on, or target the main content. |
| A5 | Minor | All captions of a shot are rendered as one block at shot start (`src/cinematics/shot-player.js:78`), so the caption does not track the narration moments; acceptable at 15–25 s but a timed caption track would match the "captions" requirement more literally. |
| A6 | Pass | Photos: every photo carries detailed, evidence-focused alt text (`content/modules.json` anchors) plus date/photographer/licence captions — better than most. Swipe compare stacks two alts; time slider alt swaps per date. |
| A7 | Pass | Rate chart is `role="img"` with `title` + `desc` describing every point, arrow meaning and the absence of a connecting line, plus a full data table (`src/systems/measure-terminus.js:87-112`). Colour is never the only cue (arrows + text labels + table). |
| A8 | Pass | No colour-only cues found: correct/incorrect options change border colour but feedback text states "Correct./Not quite." (`src/learning/assess.js:37-38`); measurement markers are yellow/blue but are always driven by labelled sliders and shortcut buttons. |
| A9 | Pass | High-contrast and text-size settings exist and apply (`src/styles/site.css:31-40`, `src/ui/settings.js:131-137`); light/dark follows the system. The small muted text (credits, source lines at 0.78–0.8 rem) is the lowest-contrast text; fine in normal theme, check AA in light mode with the muted grey (#4c5666 on white passes, on `--bg` #f5f6f8 it also passes). |

## Motor

| # | Severity | Finding |
|---|---|---|
| A10 | Pass | Every tool is keyboard operable with sensible steps, verified live: measurement sliders step 100 m (PageUp/Down 1 km — `End`/`Home` produced 36.40 km), time slider steps by date, swipe in 10 % steps with 0/50/100 preset buttons, evidence sort and succession ordering are radio groups and Earlier/Later buttons (no drag anywhere). |
| A11 | Pass | Pointer alternative for orbit is *not* provided (A2 is the gap), but no task requires dragging; all task controls are buttons/sliders. Touch: canvas has `touch-action: none` and drag orbit; pinch zoom is not implemented. |
| A12 | Pass | Dialogs trap and restore focus (`src/a11y/focus.js`); the Skip button of a cinematic receives focus on open (`src/main.js:125`); module changes move focus to the module heading. |
| A13 | Minor | On module change the whole panel re-renders; keyboard users returning to a module start from the top. Acceptable for short modules, but a "resume position" would reduce repeated scrolling in Module 5 (the longest). |

## Cognitive

| # | Severity | Finding |
|---|---|---|
| A14 | Pass | Points of interest: the viewpoint bar lists 4 named landmarks ("Lower Muir Inlet", "Muir Glacier (published coordinate)", "Riggs Glacier…"), each a labelled button — an acceptable POI list for a scene whose only other interactables are driven from the HTML panel. |
| A15 | Pass | No time pressure anywhere; nothing flashes; cinematics skippable from the first frame (Esc verified); text mode pauses the 3D loop (`src/main.js:134`). |
| A16 | Pass | Learning record is local-only with a "My progress" dialog: view, download JSON, clear (`src/ui/progress.js`), matching the standards' privacy requirement. |
| A17 | Minor | Audio settings (Master/Voice/Ambient volume, Mute) control nothing because the app has no audio; a learner toggling "Mute all audio" sees a dead control. Remove or hide until audio exists. |
| A18 | Minor | The photo-opacity control with 0/50/100 steps required by plan §11 exists only as the 2D swipe presets; the 3D photo overlay was not built (documented deviation). Parity is preserved in 2D. |

## Text-mode parity spot-check (3 objectives, end-to-end)

- **Objective 2 (M2):** same renderer renders alignment note, swipe compare (keyboard range + presets), change tags with per-tag "why" in text mode (`src/learning/course.js:102-127`). Structurally verified; live-verified M2 renders in panel and the shared path.
- **Objective 3 (M3):** live-verified in text mode — time slider with aria-valuetext, both measure widgets, rate tasks, chart + data table all present (`screenshots/textmode-m3.png`), no "undefined" strings.
- **Objective 5 (M4):** same renderer as the panel (radio predict, ordering buttons, explain textarea). Structurally verified.
- Parity gap found: the M1 flyover text description is broken by the A1 bug, so Objective 1's instruction is degraded in text mode only.

## Bottom line
The overlay work is genuinely strong (native controls, aria-valuetext, live regions, focus management, local-only record, reduced-motion stills). The three majors (A1 text-mode bug, A2 camera access, A3 invisible refusal) are all small, specific fixes.
