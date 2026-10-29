/**
 * Accessibility: axe on the HTML overlay (menus, HUD, dialogs, text mode).
 * Gate: zero critical or serious issues (push gate in CI).
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('overlay UI has no critical or serious axe issues', async ({ page }) => {
  // v2: the living scene keeps headless swiftshader busy, so five axe scans need more than 60 s.
  test.setTimeout(240_000);
  await page.goto('/');
  await expect(page.locator('canvas, [data-webgl-fallback]').first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500); // let the menu/HUD settle

  const scan = async (label) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('canvas')
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    if (bad.length) console.log(`axe violations (${label}):`, JSON.stringify(bad, null, 2));
    expect(bad, label).toEqual([]);
  };

  await scan('initial view');

  // Settings dialog
  await page.getByRole('button', { name: 'Settings' }).click();
  await scan('settings dialog');
  await page.keyboard.press('Escape');

  // Menu dialog
  await page.getByRole('button', { name: 'Menu' }).click();
  await scan('menu dialog');
  await page.keyboard.press('Escape');

  // Text mode
  await page.getByRole('button', { name: /text mode/i }).first().click();
  await scan('text mode');

  // My progress dialog (from text mode the header is still present)
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'My progress' }).click();
  await scan('progress dialog');
});

// Task screens: every module, in the 3D task panel and in text mode, including
// answered states (feedback visible) for the tool-heavy modules.
for (const mode of ['panel', 'text']) {
  test(`task screens (${mode}) have no critical or serious axe issues`, async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#task-panel .module-title')).toBeVisible({ timeout: 20_000 });
    test.setTimeout(150_000);
    // Headless software WebGL starves the main thread; pause the 3D loop (DOM is unchanged).
    await page.waitForFunction(() => !!window.__TEST__, null, { timeout: 20_000 });
    await page.evaluate(() => window.__TEST__.engine?.pause());
    if (mode === 'text') await page.getByRole('button', { name: 'Text mode' }).first().click();
    const root = mode === 'text' ? '#textmode' : '#task-panel';
    const scan = async (label) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .exclude('canvas')
        .analyze();
      const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      if (bad.length) console.log(`axe violations (${label}):`, JSON.stringify(bad, null, 2));
      expect(bad, label).toEqual([]);
    };
    const tabs = page.locator('.module-nav button');
    for (let i = 0; i < 5; i++) {
      await tabs.nth(i).click();
      await expect(page.locator(`${root} .module-title`)).toContainText(`${i + 1}.`);
      await scan(`${mode} module ${i + 1}`);
    }
    // Module 3 answered: measurement + rate feedback, rate chart.
    await tabs.nth(2).click();
    const r = page.locator(root);
    await r.locator('section.measure').first().getByRole('button', { name: 'Check measurement' }).click();
    await r.locator('.rate-task').first().locator('input').fill('0.33');
    await r.locator('.rate-task').first().getByRole('button', { name: 'Check' }).click();
    await scan(`${mode} module 3 answered`);
    // Module 4 after the prediction is locked (observe section visible).
    await tabs.nth(3).click();
    await r.locator('input[name="poe-predict"]').first().check();
    await r.getByRole('button', { name: 'Lock in my prediction' }).click();
    await scan(`${mode} module 4 observe`);
    // Module 5 evidence sort checked.
    await tabs.nth(4).click();
    await r.getByRole('button', { name: 'Check my sort' }).click();
    await scan(`${mode} module 5 sorted`);
  });
}

// Review A1: the in-world tool states were never scanned (the terrain readout
// was 1.09:1). Scan Module 3 with the measuring line on after a drag-equivalent,
// and with the photo spot open.
test('in-world tool states (measuring line on, photo spot open) have no critical or serious axe issues', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => localStorage.setItem('glacier-time-machine:quality', 'low'));
  await page.goto('/');
  await page.waitForFunction(() => window.__TEST__?.world, null, { timeout: 120_000 });
  const scan = async (label) => {
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('canvas')
      .analyze();
    const bad = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    if (bad.length) console.log(`axe violations (${label}):`, JSON.stringify(bad, null, 2));
    expect(bad, label).toEqual([]);
  };
  await page.locator('.module-nav button').nth(2).click();
  const tool = page.locator('[data-action="measure-tool"]');
  await tool.click();
  await expect(tool).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.__TEST__.world.setMeasure(2000, 12000));
  await expect(page.locator('.terrain-measure-out')).toContainText('km');
  const ratio = await page.evaluate(() => {
    const el = document.querySelector('.terrain-measure-out');
    const lum = (c) => {
      const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((v) => {
        const s = +v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const cs = getComputedStyle(el);
    const a = lum(cs.color), b = lum(cs.backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  await page.evaluate(() => window.__TEST__.engine?.pause());
  await scan('module 3, measuring line on');
  await page.evaluate(() => window.__TEST__.engine?.resume());
  await tool.click();
  await page.getByRole('button', { name: 'Photo spot, approximate (1941 print)' }).click();
  await expect(page.locator('.photo-spot')).toBeVisible();
  await page.evaluate(() => window.__TEST__.engine?.pause());
  await scan('photo spot open');
});
