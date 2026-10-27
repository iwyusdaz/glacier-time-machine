/**
 * Functional: module navigation + keyboard playability smoke.
 * Phase B extends this with a scripted playthrough of the core path
 * (menu -> modules -> one full objective -> assessment) via window.__TEST__.
 */
import { test, expect } from '@playwright/test';

test('menu opens and closes by keyboard', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Menu' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#menu-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-dialog')).not.toBeVisible();
});

test('all module tabs are reachable and activate by keyboard', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(800);
  const tabs = page.locator('.module-nav button');
  const count = await tabs.count();
  expect(count).toBe(5);
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).focus();
    await page.keyboard.press('Enter');
    await expect(tabs.nth(i)).toHaveAttribute('aria-current', 'page');
  }
});
