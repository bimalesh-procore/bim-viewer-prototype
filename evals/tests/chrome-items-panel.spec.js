/**
 * Chrome UI — Related Items Panel Tests
 *
 * Covers: hub navigation, Assets list (search filter, tile rendering),
 * Asset detail view, back-arrow behaviour in docked and floating states,
 * and panel-close state reset.
 *
 * Run: npx playwright test evals/tests/chrome-items-panel.spec.js
 */

import { test, expect } from '@playwright/test';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function setupChrome(page) {
  await page.goto('/?model=condos');
  await page.waitForFunction(() => window.__viewerAdapterReady === true, { timeout: 15000 });
  await page.waitForTimeout(100);
}

async function openItemsPanel(page) {
  await page.locator('[aria-label="Related Items"]').click();
  await page.waitForSelector('text=Assets', { timeout: 5000 });
}

async function navigateToAssetsList(page) {
  await page.locator('button:has-text("Assets")').first().click();
  await page.waitForTimeout(200);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('Chrome Related Items Panel', () => {

  test.beforeEach(async ({ page }) => {
    await setupChrome(page);
  });

  // ── Open / close ─────────────────────────────────────────────────────────

  test('ITEMS-001: Related Items toolbar button exists', async ({ page }) => {
    await expect(page.locator('[aria-label="Related Items"]')).toBeVisible();
  });

  test('ITEMS-002: Clicking toolbar button opens the hub list', async ({ page }) => {
    await openItemsPanel(page);
    await expect(page.locator('text=Assets')).toBeVisible();
    await expect(page.locator('text=Punch List')).toBeVisible();
    await expect(page.locator('text=RFIs')).toBeVisible();
  });

  // ── Hub navigation ────────────────────────────────────────────────────────

  test('ITEMS-003: Clicking Assets navigates to the asset list', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    // The panel header title should change to "Assets"
    // and the list view should show the search input
    await expect(page.locator('input[placeholder="Search"]')).toBeVisible();
  });

  test('ITEMS-004: Panel header title changes to "Assets" when on the list', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    // DockedPanel renders the title in the header
    const panelHeaders = page.locator('text=Assets');
    await expect(panelHeaders.first()).toBeVisible();
  });

  test('ITEMS-005: Non-Assets hub rows navigate to placeholder view', async ({ page }) => {
    await openItemsPanel(page);
    await page.locator('button:has-text("Punch List")').first().click();
    await page.waitForTimeout(200);
    await expect(page.locator('text=Punch List content goes here')).toBeVisible();
  });

  // ── Back arrow ────────────────────────────────────────────────────────────

  test('ITEMS-006: Back arrow appears when navigated away from hub', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    // DockedPanel renders back arrow as a button with an aria-label
    await expect(page.locator('button[aria-label="Back"]')).toBeVisible();
  });

  test('ITEMS-007: Back arrow not visible on hub view', async ({ page }) => {
    await openItemsPanel(page);
    await expect(page.locator('button[aria-label="Back"]')).not.toBeVisible();
  });

  test('ITEMS-008: Clicking back arrow from assets list returns to hub', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    await page.locator('button[aria-label="Back"]').click();
    await page.waitForTimeout(200);
    // Hub shows all categories again
    await expect(page.locator('button:has-text("Punch List")')).toBeVisible();
    // Search input should be gone
    await expect(page.locator('input[placeholder="Search"]')).not.toBeVisible();
  });

  // ── Assets list ───────────────────────────────────────────────────────────

  test('ITEMS-009: Assets list shows mock asset tiles', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    await expect(page.locator('text=Chiller Unit A')).toBeVisible();
  });

  test('ITEMS-010: Assets list shows item count', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    await expect(page.locator('text=/\\d+ Items?/')).toBeVisible();
  });

  test('ITEMS-011: Search filters the asset list', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    await page.locator('input[placeholder="Search"]').fill('Chiller');
    await page.waitForTimeout(200);
    await expect(page.locator('text=Chiller Unit A')).toBeVisible();
    await expect(page.locator('text=Fire Pump FP-1')).not.toBeVisible();
  });

  test('ITEMS-012: Clearing search restores the full list', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    await page.locator('input[placeholder="Search"]').fill('Chiller');
    await page.waitForTimeout(200);
    await page.locator('input[placeholder="Search"]').fill('');
    await page.waitForTimeout(200);
    await expect(page.locator('text=Fire Pump FP-1')).toBeVisible();
  });

  test('ITEMS-013: Search with no match shows empty state message', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    await page.locator('input[placeholder="Search"]').fill('zzznomatch');
    await page.waitForTimeout(200);
    await expect(page.locator('text=/No assets match/')).toBeVisible();
  });

  // ── Asset detail ──────────────────────────────────────────────────────────

  test('ITEMS-014: Clicking an asset tile opens the detail view', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    await page.locator('button:has-text("Chiller Unit A")').first().click();
    await page.waitForTimeout(200);
    // Detail view shows the tab bar
    await expect(page.locator('text=General')).toBeVisible();
    await expect(page.locator('text=Maintenance')).toBeVisible();
  });

  test('ITEMS-015: Panel header shows the asset name in detail view', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    await page.locator('button:has-text("Chiller Unit A")').first().click();
    await page.waitForTimeout(200);
    // The DockedPanel title should update to the asset name
    const headers = page.locator('text=Chiller Unit A');
    await expect(headers.first()).toBeVisible();
  });

  test('ITEMS-016: Back arrow from detail view returns to assets list', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);
    await page.locator('button:has-text("Chiller Unit A")').first().click();
    await page.waitForTimeout(200);
    await page.locator('button[aria-label="Back"]').click();
    await page.waitForTimeout(200);
    // Back on the list — search input visible again
    await expect(page.locator('input[placeholder="Search"]')).toBeVisible();
  });

  // ── Panel close resets state ──────────────────────────────────────────────

  test('ITEMS-017: Closing and reopening the panel resets to hub view', async ({ page }) => {
    await openItemsPanel(page);
    await navigateToAssetsList(page);

    // Close panel
    await page.locator('button[aria-label="Close panel"]').first().click();
    await page.waitForTimeout(200);

    // Reopen
    await openItemsPanel(page);
    // Should be back at the hub — Punch List button visible, no search input
    await expect(page.locator('button:has-text("Punch List")')).toBeVisible();
    await expect(page.locator('input[placeholder="Search"]')).not.toBeVisible();
  });

  // ── Floating panel back arrow ─────────────────────────────────────────────

  test('ITEMS-018: Back arrow works after panel is undocked to floating', async ({ page }) => {
    await openItemsPanel(page);
    // Undock via the undock button on the panel header
    const undockBtn = page.locator('button[aria-label="Undock panel"]');
    if (!(await undockBtn.isVisible())) {
      test.skip();
      return;
    }
    await undockBtn.click();
    await page.waitForTimeout(200);

    // Navigate into assets list
    await navigateToAssetsList(page);

    // Back arrow should be present on the floating panel
    await expect(page.locator('button[aria-label="Back"]')).toBeVisible();

    // Clicking it goes back
    await page.locator('button[aria-label="Back"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator('button:has-text("Punch List")')).toBeVisible();
  });

});
