/**
 * v2 living scene + in-world interaction (test build, VITE_TEST_HOOKS=1).
 * Covers: >= 5 ambient systems alive, calm mode, reduced motion, ring glide with
 * hover tooltip, measuring tool owning the pointer (world disabled), time-slider
 * living transition with the "illustrative, not measured" label, photo spot.
 */
import { test, expect } from '@playwright/test';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

async function open(page) {
  await page.addInitScript(() => localStorage.setItem('glacier-time-machine:quality', 'low'));
  await page.goto('/');
  await page.waitForFunction(() => window.__TEST__?.world, null, { timeout: 90_000 });
}

const camPos = (page) => page.evaluate(() => window.__TEST__.engine.camera.position.toArray());
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('v2: at least five ambient systems run, and calm mode slows them', async ({ page }) => {
  await open(page);
  const sys = await page.evaluate(() => window.__TEST__.dressing.lifeSystems());
  expect(sys.length).toBeGreaterThanOrEqual(5);
  const sample = () => page.evaluate(() => {
    const d = window.__TEST__.dressing;
    return { berg: d.bergState[0].s, cloud: d.cloudDrift, bird: d.birdT, swell: d.swell.offset.x, calm: d.life.calmFactor };
  });
  const a = await sample();
  await page.waitForTimeout(1500);
  const b = await sample();
  expect(b.berg).not.toBe(a.berg);
  expect(b.cloud).toBeGreaterThan(a.cloud);
  expect(b.bird).toBeGreaterThan(a.bird);
  expect(b.swell).toBeGreaterThan(a.swell);
  // calving can be triggered (visual only) when the drawn front meets the water
  await page.evaluate(() => window.__TEST__.dressing.setYear(1941));
  expect(await page.evaluate(() => window.__TEST__.dressing.triggerCalving())).toBe(true);
  // Module 3 (focused measuring tasks) is calm: ~30 % speed, never frozen.
  await page.locator('.module-nav button').nth(2).click();
  await page.waitForTimeout(1500);
  const c = await sample();
  expect(c.calm).toBeLessThan(0.45);
  expect(c.calm).toBeGreaterThan(0.2);
  await page.waitForTimeout(800);
  expect((await sample()).cloud).toBeGreaterThan(c.cloud);
});

test('v2 reduced motion: ambient life converges to a stop and time changes snap', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page);
  await page.waitForTimeout(1200);
  const s1 = await page.evaluate(() => [window.__TEST__.dressing.bergState[0].s, window.__TEST__.dressing.cloudDrift, window.__TEST__.dressing.life.calmFactor]);
  await page.waitForTimeout(1000);
  const s2 = await page.evaluate(() => [window.__TEST__.dressing.bergState[0].s, window.__TEST__.dressing.cloudDrift]);
  expect(await page.evaluate(() => window.__TEST__.dressing.life.reducedMotion)).toBe(true);
  expect(Math.abs(s2[0] - s1[0])).toBeLessThan(0.5);
  expect(Math.abs(s2[1] - s1[1])).toBeLessThan(0.5);
  await page.locator('.module-nav button').nth(2).click();
  const range = page.locator('#task-panel #ts-range');
  await range.focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__TEST__.dressing.year)).toBe(1950);
  await expect(page.locator('.time-label')).toContainText('1950');
  await expect(page.locator('.time-label')).toContainText('not surveyed');
});

test('v2: time slider drives the living transition, labelled illustrative between anchors', async ({ page }) => {
  await open(page);
  await page.locator('.module-nav button').nth(2).click();
  await page.waitForTimeout(300);
  const range = page.locator('#task-panel #ts-range');
  await range.focus();
  await page.keyboard.press('End'); // to 2004
  await page.waitForTimeout(300);
  await expect(page.locator('.time-label')).toContainText('Between dated anchors: illustrative, not measured');
  const mid = await page.evaluate(() => window.__TEST__.dressing.year);
  expect(mid).toBeGreaterThan(1941);
  expect(mid).toBeLessThan(2004);
  expect(await page.evaluate(() => window.__TEST__.dressing.past)).toBeGreaterThan(0);
  await page.waitForFunction(() => window.__TEST__.dressing.year === 2004, null, { timeout: 30_000 });
  await expect(page.locator('.time-label')).toContainText('2004: dated anchor');
  expect(await page.evaluate(() => window.__TEST__.dressing.past)).toBe(0);
});

test('v2: hover a viewpoint ring shows its tooltip, clicking glides the camera there', async ({ page }) => {
  await open(page);
  await page.click('[data-action="toggle-drawer"]'); // collapse the panel so the scene is open
  await page.evaluate(() => window.__TEST__.scene.setViewpoint('overview'));
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const T = window.__TEST__;
    const cam = T.engine.camera;
    const rect = T.engine.canvas.getBoundingClientRect();
    for (const id of ['vp-inlet', 'vp-muir', 'vp-riggs', 'vp-photo']) {
      const e = T.world.world.items.get(id);
      const v = e.object3d.getWorldPosition(e.object3d.position.clone()).project(cam);
      const x = rect.left + (v.x * 0.5 + 0.5) * rect.width, y = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
      if (x < rect.left + 20 || x > rect.right - 20 || y < rect.top + 20 || y > rect.bottom - 20) continue;
      const pick = T.world.world._pickAtClient(x, y);
      if (pick?.entry.id === id) return { id, x, y, dest: e.cameraPos.toArray(), label: e.label };
    }
    return null;
  });
  expect(r).not.toBeNull();
  await page.mouse.move(r.x - 4, r.y - 4);
  await page.mouse.move(r.x, r.y);
  await expect(page.locator('.v2-world-tooltip')).toBeVisible();
  await expect(page.locator('.v2-world-tooltip')).toContainText(r.label.slice(0, 20));
  const start = await camPos(page);
  await page.mouse.click(r.x, r.y);
  await page.waitForFunction(() => !window.__TEST__.world.world.glide, null, { timeout: 30_000 });
  const end = await camPos(page);
  expect(dist(end, start)).toBeGreaterThan(100);
  expect(dist(end, r.dest)).toBeLessThan(dist(start, r.dest));
});

test('v2: the terrain measuring line owns the pointer (world disabled, no tooltips) and reads out a distance', async ({ page }) => {
  await open(page);
  const btn = page.locator('[data-action="measure-tool"]');
  await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__TEST__.world.world.enabled)).toBe(false);
  expect(await page.evaluate(() => window.__TEST__.scene.toolOwnsPointer)).toBe(true);
  await page.evaluate(() => window.__TEST__.world.setMeasure(2000, 12000));
  await expect(page.locator('.terrain-measure-out')).toContainText('10.0 km');
  await page.mouse.move(300, 500);
  await page.mouse.move(320, 520);
  await expect(page.locator('.v2-world-tooltip')).toBeHidden();
  await btn.click();
  expect(await page.evaluate(() => window.__TEST__.world.world.enabled)).toBe(true);
});

test('v2: photo spot holds the 1941 print against today\'s view, with keyboard presets', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Photo spot (1941 print)' }).click();
  const spot = page.locator('.photo-spot');
  await expect(spot).toBeVisible();
  await expect(spot.locator('img.print')).toHaveAttribute('alt', /1941 print/);
  await expect(spot.locator('#ps-range')).toBeFocused();
  await spot.getByRole('button', { name: 'All 1941' }).click();
  await expect(spot.locator('#ps-range')).toHaveAttribute('aria-valuetext', /100% shows the 1941 print/);
  await page.keyboard.press('Escape');
  await expect(spot).toBeHidden();
});
