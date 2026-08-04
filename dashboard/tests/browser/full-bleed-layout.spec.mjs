import { expect, test } from '@playwright/test';

function watchBrowserDiagnostics(page) {
  const diagnostics = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      diagnostics.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => diagnostics.push(`pageerror: ${error.message}`));
  return diagnostics;
}

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.diagnostics = watchBrowserDiagnostics(page);
  await page.goto('/');
  await expect(page.locator('#snapshot-summary')).toContainText('24 sessions');
});

test.afterEach(async ({}, testInfo) => {
  expect(testInfo.diagnostics, 'browser console warnings/errors').toEqual([]);
});

test('the header is one slim bar with the essentials', async ({ page }) => {
  test.skip(page.viewportSize().width <= 759, 'mobile bar height is Task 5 scope');
  const bar = page.locator('.dashboard-bar');
  const box = await bar.boundingBox();
  expect(box.height).toBeLessThanOrEqual(64); // slim on desktop
  await expect(page.locator('.dashboard-bar h1')).toHaveText('Night Pass Session Map');
  await expect(page.locator('.dashboard-bar #track-select')).toBeVisible();
  await expect(page.locator('.dashboard-bar #go-live')).toBeVisible();
  await expect(page.locator('.dashboard-bar #snapshot-summary')).toBeVisible();
});

test('the legend is folded behind a disclosure until opened', async ({ page }) => {
  const legend = page.locator('.legend-disclosure .state-legend');
  await expect(legend).toBeHidden();
  await page.locator('.legend-disclosure summary').click();
  await expect(legend).toBeVisible();
  await expect(page.locator('.legend-disclosure .state-legend li')).toHaveCount(7);
});

test('the pit lane is a row of four labeled bays below the stage', async ({ page }) => {
  const bays = page.locator('.pit-bay');
  await expect(bays).toHaveCount(4);
  const stage = await page.locator('#map-stage').boundingBox();
  const lane = await page.locator('#pit-lane').boundingBox();
  expect(lane.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1); // lane sits below the stage
  for (const label of ['Service Bay', 'Permission Checkpoint', 'Pit Stop']) {
    await expect(page.locator('.pit-bay header h2', { hasText: label })).toBeVisible();
  }
});

test('parked (pit) cars mount inside a pit bay, not on the stage', async ({ page }) => {
  const pitCars = page.locator('.pit-mount .pit-vehicle, .unknown-mount .pit-vehicle');
  const count = await pitCars.count();
  expect(count).toBeGreaterThan(0); // fixtures populate pit pools
  const strays = await page.locator('#vehicle-layer .pit-vehicle').count();
  expect(strays).toBe(0);
});
