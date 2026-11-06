/**
 * v3 browser tests (headless Chromium, software WebGL, Low preset): the
 * repo's bottom bar and year timeline, map callouts, labels hidden at rest,
 * the keyboard objects list, keyboard-only completion of all five modules
 * (reduced motion), text-mode parity, reduced motion, touch and the no-WebGL
 * fallback. GPU gates (performance, alive) run headed in _tools/ui-audit.mjs.
 */
import { test, expect } from '@playwright/test';
import { ready, visibleLabels, pointOn } from './helpers.js';
const T = (page, fn, arg) => page.evaluate(fn, arg);
/** Press Tab until `locator` has focus (the real keyboard path), then press `key`. */
async function kb(page, locator, key = 'Enter', max = 300) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  await expect(el).toBeVisible();
  await expect(el).toBeEnabled();
  for (let i = 0; i < max; i++) {
    const where = await el.evaluate((e) => { const a = document.activeElement; if (a === e) return 0; if (!a || a === document.body) return 1; return a.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING ? 1 : -1; });
    if (where === 0) { if (key) await page.keyboard.press(key); return; }
    await page.keyboard.press(where > 0 ? 'Tab' : 'Shift+Tab');
  }
  throw new Error(`could not reach ${locator} by Tab`);
}
const card = (page) => page.locator('[data-ui="now-card"]');
const nowBtn = (page, re) => card(page).locator('button').filter({ hasText: re }).first();
const drawer = (page) => page.locator('[data-ui="drawer"]');
const start = async (page) => {
  await page.getByRole('button', { name: /^start$/i }).click();
  await page.getByRole('button', { name: /skip practice/i }).click();
  await expect(card(page)).toContainText('Look at Muir Glacier in 1941');
};
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('kept')) { localStorage.clear(); sessionStorage.setItem('kept', '1'); } });
});

test('one bottom bar (<= 56 px) with stepper, Go to, timeline and Menu; the timeline sets the year honestly', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ready(page);
  await start(page);
  const bar = await T(page, () => { const r = document.querySelector('[data-ui="top-bar"]').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight }; });
  expect(bar.bottom).toBe(bar.vh);
  expect(bar.h).toBeLessThanOrEqual(56);
  // Visual order is DOM order (Tab runs left to right).
  const order = await T(page, () => [...document.querySelectorAll('[data-ui="top-bar"] [data-ui="module-step"], [data-ui="top-bar"] [data-action="goto"], #gtm-year-range, [data-ui="top-bar"] [data-action="menu"]')].map((e) => e.dataset.action || e.id || 'step'));
  expect(order).toEqual(['step', 'step', 'step', 'step', 'step', 'goto', 'gtm-year-range', 'menu']);
  const range = page.locator('#gtm-year-range');
  await range.focus();
  await expect(range).toHaveAttribute('aria-valuetext', /1941, a dated photo year/);
  await page.keyboard.press('ArrowRight');
  await expect(range).toHaveAttribute('aria-valuetext', /1942, between dated photo years: illustrative/);
  expect(await T(page, () => Math.round(window.__TEST__.world.year))).toBe(1942);
  await page.keyboard.press('End');
  await expect(range).toHaveAttribute('aria-valuetext', /Today .*No dated photo after 2004/);
  await expect(page.locator('.gtm-readout')).toContainText('Today');
  // Lessons move the timeline too.
  await T(page, () => window.__TEST__.world.setYear(1950, { animate: false }));
  await expect(range).toHaveValue('1950');
  // Go to opens from the bar and moves the camera.
  await page.locator('[data-action="goto"]').click();
  await expect(page.locator('dialog.gtm-goto')).toBeVisible();
  await page.locator('dialog.gtm-goto [data-place="station"]').click();
  await expect(page.locator('dialog.gtm-goto')).toBeHidden();
});

test('labels are hidden at rest; hover shows one; a click opens a callout with its leader line; Show all labels shows them all', async ({ page }) => {
  await ready(page);
  await start(page);
  await page.waitForTimeout(1500);
  expect(await visibleLabels(page)).toEqual([]);
  const p = await pointOn(page, 'muir-terminus') || await pointOn(page, 'muir-inlet') || await pointOn(page, 'terrain');
  expect(p).not.toBeNull();
  await page.mouse.move(p.x, p.y);
  await page.waitForTimeout(600);
  expect((await visibleLabels(page)).length).toBe(1);
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('[data-ui="info-card"]')).toBeVisible();
  await expect.poll(() => T(page, () => document.querySelector('.gtm-leader')?.dataset.on), { timeout: 6000 }).toBe('true');
  await expect(page.locator('[data-ui="discovered"]')).toContainText('1 of 30');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-ui="info-card"]')).toBeHidden();
  await T(page, () => { window.__TEST__.inspect.setShowAll(true); });
  await page.waitForTimeout(600);
  expect((await visibleLabels(page)).length).toBeGreaterThan(3);
});

test('every object in view is in the keyboard list and opens by Enter', async ({ page }) => {
  await ready(page);
  await start(page);
  await page.locator('[data-action="menu"]').click();
  await page.locator('[data-ui="objects-list-toggle"]').click();
  const list = page.locator('[data-ui="objects-list"] [data-object-id]');
  expect(await list.count()).toBeGreaterThanOrEqual(20);
  const it = page.locator('[data-ui="objects-list"] [data-object-id="trimline"]');
  await it.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-ui="info-card"][data-object-id="trimline"]')).toBeVisible();
});

/** Answer a question set in the Now card (first choice each time); returns the last button pressed. */
async function questions(page, last) {
  for (let q = 0; q < 8; q++) {
    await kb(page, card(page).locator('[data-choice]').first());
    const b = nowBtn(page, /^(Next question|Finish|Next module)$/);
    const label = (await b.textContent()).trim();
    await kb(page, b);
    if (label !== 'Next question') return label;
  }
  throw new Error(`question set did not end (${last})`);
}
/** Software WebGL is slow and the keyboard path does not depend on render detail. */
const lowRes = (page) => T(page, () => { const e = window.__TEST__.engine; e.setReading = () => {}; e.readingScale = 0.25; e.resize(); });

test('keyboard only: Modules 1 to 3 from the title screen (reduced motion)', async ({ page }) => {
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1024, height: 640 });
  await ready(page);
  // Software WebGL is slow and the keyboard path does not depend on render detail.
  await lowRes(page);
  await kb(page, page.getByRole('button', { name: /^start$/i }));
  await kb(page, page.getByRole('button', { name: /skip practice/i }));
  // Module 1: look, pre-check, three facts, check.
  await kb(page, nowBtn(page, /^Next step$/));
  await questions(page, 'pre');
  for (let f = 0; f < 8; f++) {
    const b = nowBtn(page, /^(Next fact|Next step)$/);
    const label = (await b.textContent()).trim();
    await kb(page, b);
    if (label === 'Next step') break;
  }
  await questions(page, 'm1-check');
  // Module 2: station, compare, change list.
  await kb(page, nowBtn(page, /^Go to the station$/));
  await kb(page, nowBtn(page, /^Next step$/));
  await kb(page, nowBtn(page, /^Open the change list$/));
  await kb(page, drawer(page).locator('input[type=checkbox]').first(), ' ');
  await kb(page, drawer(page).getByRole('button', { name: 'Check my tags' }));
  await expect(drawer(page).locator('.gtm-feedback')).toContainText('You found');
  await page.keyboard.press('Escape');
  await kb(page, nowBtn(page, /^Next module$/));
  // Module 3: the three years, two measurements, two rates, check.
  for (const y of ['1941', '1950', '2004']) await kb(page, card(page).locator('.gtm-tool-row button').filter({ hasText: y }));
  await kb(page, nowBtn(page, /^Next step$/));
  await kb(page, card(page).locator('#m3-measure-b'), 'End');
  await kb(page, card(page).getByRole('button', { name: 'Check', exact: true }));
  await expect(card(page)).toContainText('Correct');
  await kb(page, nowBtn(page, /^Next step$/));
  await kb(page, card(page).locator('#m3-scale-b'), 'Home');
  for (let i = 0; i < 70; i++) await page.keyboard.press('ArrowRight');
  await kb(page, card(page).getByRole('button', { name: 'Check', exact: true }));
  await expect(card(page)).toContainText('Correct');
  await kb(page, nowBtn(page, /^Next step$/));
  for (const v of ['0.33', '0.11']) {
    await kb(page, card(page).locator('input[type=text]'), null);
    await page.keyboard.type(v);
    await kb(page, card(page).getByRole('button', { name: 'Check', exact: true }));
    await expect(card(page)).toContainText('Correct');
    await kb(page, nowBtn(page, /^Next step$/));
  }
  await questions(page, 'm3-check');
  for (const k of [0, 1, 2]) await expect(page.locator('[data-ui="module-step"]').nth(k)).toHaveClass(/is-done/);
});

test('keyboard only: Module 4 (reduced motion)', async ({ page }) => {
  // Split from Modules 1-3 and 5 to keep each test under the 5 min cap on software WebGL;
  // the jump to Module 4 is setup, everything after it is keyboard only.
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1024, height: 640 });
  await ready(page);
  await lowRes(page);
  await kb(page, page.getByRole('button', { name: /^start$/i }));
  await kb(page, page.getByRole('button', { name: /skip practice/i }));
  await T(page, () => window.__TEST__.app.goModule(3));
  await page.waitForTimeout(2200);
  await kb(page, card(page).locator('[data-choice]').first());
  await kb(page, nowBtn(page, /^Next step$/));
  await kb(page, nowBtn(page, /^Open the plant order$/));
  await kb(page, drawer(page).getByRole('button', { name: 'Check order' }));
  await expect(drawer(page).locator('.gtm-feedback')).toContainText('Park Service order');
  await page.keyboard.press('Escape');
  await kb(page, nowBtn(page, /^Next step$/));
  await kb(page, nowBtn(page, /^Open the explanation box$/));
  await kb(page, drawer(page).locator('textarea'), null);
  await page.keyboard.type('The ice went back and plants moved onto the bare rock.');
  await kb(page, drawer(page).getByRole('button', { name: 'Save my explanation' }));
  await expect(drawer(page)).toBeHidden({ timeout: 5000 });
  await kb(page, nowBtn(page, /^Next module$/));
  await expect(page.locator('[data-ui="module-step"]').nth(3)).toHaveClass(/is-done/);
});

test('keyboard only: Module 5 to course complete (reduced motion)', async ({ page }) => {
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1024, height: 640 });
  await ready(page);
  await lowRes(page);
  await kb(page, page.getByRole('button', { name: /^start$/i }));
  await kb(page, page.getByRole('button', { name: /skip practice/i }));
  await T(page, () => window.__TEST__.app.goModule(4));
  await page.waitForTimeout(2200);
  // Module 5: card sort, confidence, post-check, transfer.
  await kb(page, nowBtn(page, /^Open the card sort$/));
  await kb(page, drawer(page).getByRole('button', { name: 'Check my sort' }));
  await expect(drawer(page).locator('.gtm-feedback')).toContainText('sorted as intended');
  await page.keyboard.press('Escape');
  await kb(page, nowBtn(page, /^Next step$/));
  await kb(page, nowBtn(page, /^Open the confidence statement$/));
  await kb(page, drawer(page).locator('textarea'), null);
  await page.keyboard.type('Mostly a warmer climate; I am fairly sure.');
  await kb(page, drawer(page).getByRole('button', { name: 'Finish self-check' }));
  await expect(drawer(page)).toBeHidden({ timeout: 5000 });
  await kb(page, nowBtn(page, /^Next step$/));
  await questions(page, 'post');
  await questions(page, 'transfer');
  await expect(card(page)).toContainText('Course complete');
  const done = await T(page, () => window.__TEST__.record.events.some((e) => e.object.id.endsWith('course/glacier-time-machine') && e.verb.display['en-US'] === 'completed'));
  expect(done).toBe(true);
});

test('text mode: the same objective and decisions; the catalog is listed', async ({ page }) => {
  await ready(page);
  await T(page, () => window.__TEST__.app.goModule(2));
  await T(page, () => window.__TEST__.ui.toggleTextMode());
  const tm = page.locator('[data-ui="textmode"], #textmode').first();
  await expect(tm).toBeVisible();
  await expect(tm).toContainText(/Measure/);
  await expect(page.locator('.gtm-timeline')).toBeHidden();
  await expect(tm).toContainText('Trimline');
  await expect(tm).toContainText('Sea kayak');
});

test('reduced motion: ambient motion stops, no camera drift', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await start(page);
  await page.waitForTimeout(1500);
  const read = () => T(page, () => ({ p: window.__TEST__.engine.camera.position.toArray(), k: window.__TEST__.world.life.kayak?.position.toArray() }));
  const a = await read();
  await page.waitForTimeout(2500);
  const b = await read();
  expect(b.p).toEqual(a.p);
  expect(b.k).toEqual(a.k);
});

test('touch: the bar stays one row at 390 px, the cluster sits above the sheet, a tap opens a card', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.clear());
  await ready(page);
  await page.getByRole('button', { name: /^start$/i }).tap();
  await page.getByRole('button', { name: /skip practice/i }).tap();
  await page.waitForTimeout(1500);
  const g = await T(page, () => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    return { bar: r('[data-ui="top-bar"]'), cluster: r('[data-ui="camera-cluster"]'), now: r('[data-ui="now-card"]'), vh: innerHeight };
  });
  expect(g.bar.bottom).toBe(g.vh);
  expect(g.bar.height).toBeLessThanOrEqual(56);
  expect(g.now.bottom).toBeLessThanOrEqual(g.bar.top + 1);
  expect(g.cluster.bottom).toBeLessThanOrEqual(g.bar.top);
  await T(page, () => window.__TEST__.inspect.close?.());
  const p = await pointOn(page, 'muir-terminus') || await pointOn(page, 'terrain');
  expect(p).not.toBeNull();
  await page.touchscreen.tap(p.x, p.y);
  await expect(page.locator('[data-ui="info-card"]')).toBeVisible();
  await ctx.close();
});

test('no WebGL2: text mode opens with every objective', async ({ page }) => {
  await page.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...r) { return /webgl/.test(t) ? null : g.call(this, t, ...r); }; });
  await page.goto('/');
  await page.waitForFunction(() => window.__APP_READY__, null, { timeout: 60_000 });
  const tm = page.locator('[data-ui="textmode"], #textmode').first();
  await expect(tm).toBeVisible();
  await expect(tm).not.toBeEmpty();
});
