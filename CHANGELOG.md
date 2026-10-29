# Changelog

## 2.0.0 (2026-10-29)

Release gate: v2 agent-review revisions V2-11 to V2-22, including the critical invisible measuring readout (A1). Also fixed: the in-world measuring line now grades through "Check measurement"; year rings at the dated fronts; the "2024 ground imagery" label plus past-year vegetation muting; a Module 3 ice-fronts viewpoint; Low-preset life scaling. Headed Apple M1: Medium 60 fps, 43 draw calls, 9.4 MB before first interaction. Posters and trailer re-recorded from the revised scene.

- Real Sentinel-2 L2A true-colour drape (6 August 2024, AWS open data, fetched anonymously by `scripts/fetch-sentinel2.sh`) on the unchanged Copernicus terrain; procedural colours kept only as the load-failure fallback.
- Living scene (all illustrative): ice tongue with crevasse normals and a calving cliff, instanced icebergs, conifers on older ground and shrubs on newer ground, Poly Haven CC0 rocks/shrubs/driftwood at the photo spot (merged), low cloud with moving cloud shadows, snow drift, birds, an occasional calving slab, water swell. Calm mode in Module 3 and during graded sets; reduced motion stops it.
- Time slider is a living transition: ice front placed only at the three dated anchors from the published minimum retreat, forest and grade (cool modern to warm sepia) follow; the 3D view says "Between dated anchors: illustrative, not measured".
- In-world interaction: glacier-blue viewpoint rings with camera glide, hover tooltips, WASD pan; photo spot with the 1941 print swiped against today's view; measuring line dragged along the valley on the terrain (tool owns the pointer). Buttons and the v1 widgets/text mode remain the keyboard and text paths.
- Art bible, self-hosted Playfair Display / Inter / JetBrains Mono (OFL) with Plain-font setting, glacier-blue HUD theme (contrast unit-tested), shared v2 core.
- Known gaps: Poly Haven fir/pine trees too large to ship (procedural conifers instead), no 3D photo alignment (camera station unverified), no dated terminus history between anchors.

## 1.0.0 (unreleased, pending tag)

- Real-scale Muir Inlet terrain from Copernicus GLO-30 (UTM 8N), Poly Haven CC0 sky, preset views.
- Five modules from `content/*.json`: glacier flow; same-viewpoint 1941/2004 swipe and change tagging; time slider over the three dated USGS photos, measurement on a DEM-derived valley path, lower-bound rate chart with data table; predict-observe-explain with the NPS succession sequence; claim-vs-evidence sort, confidence statement and rubric self-check.
- Pre, post and transfer items (transfer scenario constructed for teaching).
- Cinematics S1–S3 (55 s total), captioned, skippable, reduced-motion stills, blocked during assessment.
- Text mode with full parity; axe-clean task screens; local-only learning record.
- Build contract: relative base, showcase.json, poster from the real scene, attribution export, sub-path test.
- Known gaps: no imagery drape, no 3D photo alignment, no dated terminus history (all documented).
