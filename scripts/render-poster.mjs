#!/usr/bin/env node
/**
 * Render the release poster (1200x630, webp + jpg, each <= 200 KB) from the
 * REAL scene: serves dist/ (built with VITE_TEST_HOOKS=1), loads it in headless
 * Chromium, stages a hero view of the Copernicus terrain with the measurement
 * path, hides the HTML overlay and screenshots the page.
 *
 * Usage: VITE_TEST_HOOKS=1 npm run build && node scripts/render-poster.mjs
 */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(root, 'dist');
const VERSION = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (!existsSync(join(DIST, 'index.html'))) { console.error('dist/index.html missing: run the build first'); process.exit(1); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.hdr': 'application/octet-stream', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = createServer((req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  const file = join(DIST, rel);
  if (!existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4187, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
try {
  await page.goto('http://127.0.0.1:4187/', { waitUntil: 'load', timeout: 60_000 });
  await page.waitForFunction(() => window.__TEST__?.scene, null, { timeout: 90_000 });
  await page.evaluate(() => {
    const t = window.__TEST__;
    t.engine.quality.setPreset?.('high');
    const s = t.scene;
    s.setPathVisible(true);
    // Hero: from the south-east over lower Muir Inlet, looking up the fjord (north-west).
    s.orbit.target.set(-1500, 200, -2500);
    Object.assign(s.orbit.spherical, { radius: 26000, theta: 0.75, phi: 1.2 });
    s.orbit.update();
    for (const sel of ['.app-header', '.module-nav', '.hud', '#overlays', '.skip-link', '#task-panel', '#cinematic-host']) {
      const el = document.querySelector(sel);
      if (el) el.style.display = 'none';
    }
  });
  await page.waitForTimeout(6000);
  for (const [type, quality] of [['webp', 80], ['jpeg', 84]]) {
    const ext = type === 'jpeg' ? 'jpg' : type;
    const out = join(root, 'public', `poster-${VERSION}.${ext}`);
    await page.screenshot({ path: out, type, quality });
    const kb = Math.round(statSync(out).size / 1024);
    console.log(`poster-${VERSION}.${ext}: ${kb} KB`);
    if (kb > 200) throw new Error(`${ext} over the 200 KB budget`);
  }
} finally {
  await browser.close();
  server.close();
}
console.log('poster rendered from the real scene');
