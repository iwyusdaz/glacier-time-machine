# Shot list (content/cinematics.json)

Total 55 s (budget ≤ 90 s; each shot ≤ 25 s, checked by `tests/unit/logic.test.js`). Every shot is captioned, has a text description, is skippable from the first frame (Skip button and Esc) and has a reduced-motion version (still frames with per-still captions). The app refuses to start a cinematic while an assessment item set is open.

| Shot | Purpose | Duration | Description | Reduced motion |
|---|---|---|---|---|
| S1 Up Muir Inlet | orient + motivate | 25 s | Low flight up the fjord toward the Muir Glacier place-name coordinate | 3 stills |
| S2 Same place, different time | reveal | 15 s | Descends over the east shore toward the Muir/Riggs valleys; caption says the 3D camera is near, not at, the photo station | 2 stills |
| S3 The measurement path | explain | 15 s | High pass over the inlet showing the orange path; caption: "a ruler, not a record of where the ice front was" | 1 still |

Plan deviation: the plan's S2 (photo fades in aligned to 3D) and S3 (imagery time-lapse) need the camera solve and an imagery series, neither of which exists yet. The shots were re-scoped to what is honest (DECISIONS.md #12). In the app, S1 is launched from Module 1; S2 and S3 are defined in content and reachable via `playCinematic`, and are wired to buttons in a later revision (STATUS.md).
