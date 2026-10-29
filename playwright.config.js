import { defineConfig } from '@playwright/test';

// testMatch is restricted to *.spec.js so vitest's unit tests (*.test.js)
// are never picked up by the Playwright runner.
export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.js/,
  // 180 s: the living v2 scene is slow on software WebGL; one functional test
  // ran at 57.6 s locally against the old 60 s limit.
  timeout: 180_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4186',
    trace: 'retain-on-failure',
  },
  webServer: {
    // --host 127.0.0.1: vite preview otherwise may bind ::1 only.
    command: 'npm run preview -- --port 4186 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4186',
    // Never reuse: another repo's preview server on a shared port would be tested by mistake.
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  outputDir: 'tmp/test-results',
});
