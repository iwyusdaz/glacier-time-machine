/**
 * Functional: keyboard navigation + scripted playthrough of the core path
 * (menu -> modules -> one full objective -> assessment) in BOTH the 3D task
 * panel and text mode. Needs a build with VITE_TEST_HOOKS=1 (window.__TEST__).
 */
import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/');
  await expect(page.locator('#task-panel .module-title')).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => !!window.__TEST__, null, { timeout: 20_000 });
}

test('menu opens and closes by keyboard', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Menu' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-dialog')).not.toBeVisible();
});

test('all module tabs are reachable and activate by keyboard', async ({ page }) => {
  await ready(page);
  const tabs = page.locator('.module-nav button');
  expect(await tabs.count()).toBe(5);
  for (let i = 0; i < 5; i++) {
    await tabs.nth(i).focus();
    await page.keyboard.press('Enter');
    await expect(tabs.nth(i)).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#task-panel .module-title')).toContainText(`${i + 1}.`);
  }
});

/** Objective 3 end to end: time slider -> measurement -> rate -> check item. */
async function playObjective3(page, root) {
  const r = page.locator(root);
  // Time slider: keyboard steps through the three verified dates only.
  const slider = r.locator('#ts-range');
  await slider.focus();
  await expect(slider).toHaveAttribute('aria-valuetext', /August 13, 1941/);
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', /August 4, 1950.*more than 3 km/);
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', /August 31, 2004.*more than 7 km/);
  await expect(r.locator('.note.conflict')).toContainText('Field - 1950');
  // Measurement 1: full path via the marker shortcuts.
  const m1 = r.locator('section.measure').first();
  await m1.getByRole('button', { name: /A to path start/ }).click();
  await m1.getByRole('button', { name: /B to path end/ }).click();
  await m1.getByRole('button', { name: 'Check measurement' }).click();
  await expect(m1.locator('.feedback')).toContainText('Correct.');
  // Measurement 2: B at 7 km by keyboard (Home, then 70 steps of 100 m).
  const m2 = r.locator('section.measure').nth(1);
  await m2.getByRole('button', { name: /A to path start/ }).click();
  const b = m2.locator('input[type=range]').nth(1);
  await b.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 70; i++) await page.keyboard.press('ArrowRight');
  await m2.getByRole('button', { name: 'Check measurement' }).click();
  await expect(m2.locator('.feedback')).toContainText('Correct.');
  // Rate calculations.
  const tasks = r.locator('.rate-task');
  await tasks.nth(0).locator('input').fill('0.33');
  await tasks.nth(0).getByRole('button', { name: 'Check' }).click();
  await expect(tasks.nth(0).locator('.feedback')).toContainText('lower bound');
  await tasks.nth(1).locator('input').fill('0.11');
  await tasks.nth(1).getByRole('button', { name: 'Check' }).click();
  await expect(tasks.nth(1).locator('.feedback')).toContainText('Correct.');
  // Rate chart data table holds only the verified periods.
  await expect(r.locator('section.rate tbody tr')).toHaveCount(2);
  // Embedded check item.
  await r.getByRole('button', { name: /at least about 0.11 km\/yr/ }).click();
  await expect(r.locator('.assessment-item .feedback').last()).toContainText('Correct.');
}

test('core path in the 3D panel: menu -> module 3 objective -> assessment', async ({ page }) => {
  test.setTimeout(150_000);
  await ready(page);
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: 'Resume' }).click();
  // Module 1 pre-check: answer all five; summary appears.
  const pre = page.locator('#task-panel [data-set="pre"]');
  for (const id of ['pre-1', 'pre-2', 'pre-3', 'pre-4', 'pre-5']) {
    await pre.locator(`[data-item-id="${id}"] .choice-btn`).first().click();
  }
  await expect(pre.locator('.set-summary')).toContainText('of 5 correct');
  // Cinematic: refused during an assessment; otherwise plays, captioned, Esc skips.
  await page.evaluate(() => { window.__TEST__.state.assessing = true; });
  expect(await page.evaluate(() => window.__TEST__.playCinematic('s1-flyover'))).toBe(false);
  await page.evaluate(() => { window.__TEST__.state.assessing = false; });
  if (await page.evaluate(() => !!window.__player)) {
    await page.getByRole('button', { name: /Play the flyover/ }).click();
    await expect(page.locator('.cinematic-overlay')).toBeVisible();
    await expect(page.locator('.cinematic-caption')).toContainText('Muir Inlet');
    await page.keyboard.press('Escape');
    await expect(page.locator('.cinematic-overlay')).toBeHidden();
    await expect(page.locator('#task-panel')).toBeVisible();
  }
  // Headless Chromium renders WebGL in software; pause the 3D loop so the
  // DOM task steps are not starved (app logic is identical; see evaluation/METHODS.md).
  await page.evaluate(() => window.__TEST__.engine?.pause());
  // Module 3, full objective.
  await page.locator('.module-nav button').nth(2).click();
  await playObjective3(page, '#task-panel');
  // Module 5 assessment: evidence sort + post-check.
  await page.locator('.module-nav button').nth(4).click();
  const cards = await page.evaluate(() => window.__TEST__.content.cards.cards.map((c) => [c.id, c.category]));
  for (const [id, cat] of cards) await page.locator(`#task-panel [data-card="${id}"] input[value="${cat}"]`).check();
  await page.getByRole('button', { name: 'Check my sort' }).click();
  await expect(page.locator('#task-panel .evidence-sort .feedback').first()).toContainText(`${cards.length} of ${cards.length}`);
  const items = await page.evaluate(() => window.__TEST__.content.items.post.map((i) => [i.id, i.options.find((o) => o.id === i.correct).text]));
  for (const [id, text] of items) await page.locator(`#task-panel [data-item-id="${id}"]`).getByRole('button', { name: text, exact: true }).click();
  await expect(page.locator('#task-panel [data-set="post"] .set-summary')).toContainText('5 of 5 correct');
  const n = await page.evaluate(() => window.__TEST__.record.events.filter((e) => e.verb.display['en-US'] === 'answered').length);
  expect(n).toBeGreaterThan(15);
});

test('text mode parity: the same objective and assessment decisions', async ({ page }) => {
  await ready(page);
  await page.locator('.module-nav button').nth(2).click();
  await page.getByRole('button', { name: 'Text mode' }).first().click();
  await expect(page.locator('#textmode')).toBeVisible();
  await expect(page.locator('#task-panel')).toBeHidden();
  await expect(page.locator('#textmode .textmode-title')).toContainText('3. Measure it');
  await playObjective3(page, '#textmode');
  // POE in text mode (module 4): predict, observe, order.
  await page.locator('.module-nav button').nth(3).click();
  await page.locator('#textmode input[name="poe-predict"][value="shrubs"]').check();
  await page.getByRole('button', { name: 'Lock in my prediction' }).click();
  await expect(page.locator('#textmode .poe-result')).toContainText('matches');
  const want = await page.evaluate(() => window.__TEST__.content.modules.modules[3].succession.stages.map((s) => s.id));
  for (let target = 0; target < want.length; target++) {
    for (let guard = 0; guard < 6; guard++) {
      const order = await page.locator('#textmode .seq-list li').evaluateAll((els) => els.map((e) => e.dataset.stage));
      if (order.indexOf(want[target]) === target) break;
      await page.locator(`#textmode .seq-list li[data-stage="${want[target]}"] button[data-dir="up"]`).click();
    }
  }
  await page.getByRole('button', { name: 'Check order' }).click();
  await expect(page.locator('#textmode .poe-observe .feedback').last()).toContainText('the order NPS describes');
  // Module 2 change tags in text mode.
  await page.locator('.module-nav button').nth(1).click();
  const tags = await page.evaluate(() => window.__TEST__.content.modules.modules[1].changeTags.filter((t) => t.correct).map((t) => t.id));
  for (const id of tags) await page.locator(`#textmode input[name="change-tag"][value="${id}"]`).check();
  await page.getByRole('button', { name: 'Check my tags' }).click();
  await expect(page.locator('#textmode .change-tags .feedback').first()).toContainText('5 of 5');
});
