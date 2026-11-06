/**
 * axe-core checks (0 critical or serious) on the v3 states: title, practice,
 * each module, an open map callout, the change list, rate chart, plant order,
 * card sort and confidence drawers, Go to, the menu and text mode.
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { ready } from './helpers.js';
async function scan(page, label) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const bad = r.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
  expect(bad.map((v) => `${label}: ${v.id} (${v.impact}) ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}
test('axe: 0 critical/serious on every v3 state', async ({ page }) => {
  test.setTimeout(300_000);
  await page.addInitScript(() => localStorage.clear());
  await ready(page);
  await scan(page, 'title');
  await page.getByRole('button', { name: /^start$/i }).click();
  await scan(page, 'practice');
  await page.getByRole('button', { name: /skip practice/i }).click();
  await page.waitForTimeout(1500);
  await scan(page, 'm1');
  await page.evaluate(() => window.__TEST__.inspect.open('muir-terminus'));
  await page.waitForTimeout(800);
  await scan(page, 'info card');
  await page.keyboard.press('Escape');
  for (const i of [1, 2, 3, 4]) {
    await page.evaluate((n) => window.__TEST__.app.goModule(n), i);
    await page.waitForTimeout(2200);
    await scan(page, `m${i + 1}`);
  }
  const L = (fn) => page.evaluate(fn);
  await L(() => window.__TEST__.lessons._openTags(null));
  await page.waitForTimeout(500);
  await scan(page, 'change list drawer');
  await L(() => window.__TEST__.lessons._rateChart(null));
  await page.waitForTimeout(500);
  await scan(page, 'rate chart drawer');
  await L(() => window.__TEST__.lessons._openOrder(null));
  await page.waitForTimeout(500);
  await scan(page, 'plant order drawer');
  await L(() => window.__TEST__.shell.openDrawer({ title: 'Card sort', key: 'm5-sort', render: (b) => window.__TEST__.lessons._sort(b) }));
  await page.waitForTimeout(500);
  await scan(page, 'card sort drawer');
  await L(() => window.__TEST__.shell.openDrawer({ title: 'Confidence statement', key: 'm5-confidence', render: (b) => window.__TEST__.lessons._confidence(b) }));
  await page.waitForTimeout(500);
  await scan(page, 'confidence drawer');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="goto"]').click();
  await scan(page, 'go to');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="menu"]').click();
  await scan(page, 'menu');
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__TEST__.ui.toggleTextMode());
  await page.waitForTimeout(1200);
  await scan(page, 'text mode');
});
