# Agent review — Mayer's multimedia principles checklist

Reviewer: independent agent. Evidence from the actual content (`content/*.json`),
renderers (`src/learning/course.js`, `course-late.js`), systems
(`src/systems/*`), scene (`src/scenes/muir-inlet.js`) and live screenshots in
`evaluation/reviews/screenshots/`.

| Principle | Verdict | Evidence |
|---|---|---|
| **Coherence** (exclude seductive details) | **Pass, with two small violations** | The realism discipline is real: no wildlife, boats, waves, particles or simulated future ice anywhere in the scene or content (matrix and code agree). Violations: (1) dead audio controls (Master/Voice/Ambient volume, Mute) in Settings (`src/ui/settings.js:86-90`) are settings for sounds that do not exist — extraneous UI; (2) two unused ~280 KB photos shipped in `public/photos/` (`muir-1941-hd.jpg`, `muir-2004-hd.jpg`). Also the overlapping HUD box (visual review V1) is visual clutter over the content itself. |
| **Signaling** | **Pass** | The measurement path is a high-contrast orange tube with a stated purpose; markers A/B are colour+shape distinct and driven from labelled controls; the rate chart arrows signal "at least"; module objective lines and section headings structure every panel; distractor feedback explicitly flags over-reading. Missed opportunity (not a violation): the historic photos are un-annotated — the trimline that `post-2` asks about is never pointed out on the actual 2004 photo, so the learner must find it unaided; an outline/arrow overlay on the photo (toggleable) would be a cheap, high-value signal. |
| **Redundancy** (no on-screen text duplicating narration) | **Pass by circumstance** | There is no narration audio at all, so no text-narration duplication; captions carry the cinematic text. Nothing is said twice in the same modality except the chart+table pair, which is a deliberate accessibility redundancy (correct). |
| **Spatial contiguity** | **Pass** | Captions sit directly under their photos; alt text is in the DOM with the image; feedback renders immediately under the control that triggered it; the chart and its data table are adjacent; source lines attach to the claim they support. |
| **Temporal contiguity** | **Pass, one nit** | The time slider updates photo, caption, retreat stat and source line together (`src/systems/time-slider.js:38-47`); POE shows prediction → observation in the correct order with observation hidden until locked. Nit: cinematic captions all appear at shot start rather than synchronized to the camera moments (`src/cinematics/shot-player.js:78`). |
| **Segmenting** | **Concern** | Five modules with clear boundaries is good segmentation; Module 1 sequences pre-check → flyover → facts → check appropriately. Concern: Module 5 stacks the 11-card sort, confidence statement, rubric self-check, exemplar, 5 post-check items and 3 transfer items in one continuous panel scroll with no interstitial or section pacing; a learner loses the "small chunks with control" structure here. |
| **Pre-training** | **Pass** | Module 1 teaches the concepts the later tasks require (terminus vs flow, tidewater, calving) before Module 2/3 use them; the "How a glacier moves" facts precede the check item; measurement vocabulary ("path", "markers") is introduced in the task prompts. |
| **Modality** | **Gap (accepted design choice, should be documented)** | The course is text-only by design; Mayer's modality principle (narration + visuals beats text alone for novice learners) is unaddressed — no audio channel exists, and the dead volume controls suggest audio was planned but cut. For the reading-proficient 9–12/intro-undergrad audience this is defensible, and text-only is accessibility-positive; but the choice should be stated in `design/` (it currently appears nowhere) and the dead controls removed. |
| **Learner control** | **Pass** | Learner controls pace (free module navigation), playback (Skip from first frame, verified), the time slider, swipe position with presets, marker positions with shortcuts, and mode (text mode with parity). Cinematics are opt-in per module (button), never auto-played — the strongest possible learner control. |

## Violation list (actionable)
1. Dead audio settings — remove or hide until audio exists (`src/ui/settings.js:86-90`).
2. Module 5 needs segmenting (sub-step reveals or an interstitial) — `src/learning/course-late.js:80-112`.
3. HUD clutter overlapping module content — `src/main.js:176-197` (cross-ref visual V1).
4. Unused shipped photos — `public/photos/muir-*-hd.jpg`.

## What the design gets right (worth keeping)
- Evidence captions under every photograph with date/photographer/licence — exemplary spatial contiguity for an evidence-literacy course.
- The "at least" arrows on the rate chart are signalling done exactly right: the graphic encodes the epistemic status of the data, not just the values.
- The POE flow (predict locked → observe revealed → explain) enforces the generate-then-evaluate order the principle is about.
