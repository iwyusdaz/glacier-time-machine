# Results

Builder run, 2026-10-27, macOS arm64, Node 22, headless Chromium (Playwright 1.64.1):

- `npx vitest run`: 6 files, 39 tests passed.
- `npx playwright test` (build with `VITE_TEST_HOOKS=1`): functional 4 passed, a11y 3 passed (0 critical/serious axe issues).
- Release build + `SLUG=glacier-time-machine npx playwright test tests/sub-path.spec.js`: 1 passed.
- `node scripts/validate-showcase.mjs 1.0.0`: valid.
- Poster: 1200x630, jpg 53 KB, webp 25 KB (`scripts/render-poster.mjs`).

Test reports are not committed (they live in the gitignored `tmp/`).
