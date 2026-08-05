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

test('the pit lane reflows to fill its width when the unknown bay is empty', async ({ page }) => {
  // fixtures have no unclassified sessions, so the fourth bay collapses
  await expect(page.locator('.pit-hold')).toBeHidden();

  const lane = page.locator('#pit-lane');
  const laneBox = await lane.boundingBox();
  const paddingRight = await lane.evaluate((element) => (
    Number.parseFloat(getComputedStyle(element).paddingRight)
  ));
  const laneContentRight = laneBox.x + laneBox.width - paddingRight;

  const bays = page.locator('.pit-bay');
  let rightmostVisibleEdge = -Infinity;
  for (const bay of await bays.all()) {
    if (!(await bay.isVisible())) continue;
    const box = await bay.boundingBox();
    rightmostVisibleEdge = Math.max(rightmostVisibleEdge, box.x + box.width);
  }
  // the visible bays must reach the lane's right edge; no leftover empty track
  expect(rightmostVisibleEdge).toBeGreaterThanOrEqual(laneContentRight - 3);
});

test('focusing a route car shows its tooltip and does not resize the stage; Escape clears the pin', async ({ page }) => {
  await page.locator('#track-select').selectOption('ridge-pass');
  const stage = page.locator('#map-stage');
  const before = (await stage.boundingBox()).height;
  const wrapper = page.locator('.vehicle-anchor').first();
  const button = wrapper.locator('.session-car');
  await button.focus();
  // The tooltip is the detail affordance (no persistent readout strip).
  await expect(wrapper.locator('.session-tooltip')).toBeVisible();
  // Regression: populating car detail must not reflow the stage (the hover-jitter loop).
  const after = (await stage.boundingBox()).height;
  expect(Math.abs(after - before)).toBeLessThanOrEqual(0.5);
  await button.press('Enter');            // pin
  await expect(page.locator('.vehicle-anchor[data-pinned="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');    // clear pin
  await expect(page.locator('.vehicle-anchor[data-pinned="true"]')).toHaveCount(0);
});

test('pit tooltips stay within the viewport, including the leftmost bay', async ({ page }) => {
  test.skip(page.viewportSize().width <= 759, 'desktop side-opening tooltips only');
  const clipped = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const wrapper of document.querySelectorAll('.pit-vehicle')) {
      wrapper.querySelector('.session-car').focus();
      const r = wrapper.querySelector('.session-tooltip').getBoundingClientRect();
      if (r.left < -0.5 || r.right > vw + 0.5) {
        bad.push({ bay: wrapper.closest('.pit-bay')?.className, left: r.left, right: r.right });
      }
      wrapper.querySelector('.session-car').blur();
    }
    return bad;
  });
  expect(clipped, JSON.stringify(clipped)).toEqual([]);
});

test('the route-overflow notice keeps z-index 12 and the map heading names the course', async ({ page }) => {
  // auto mode picks the course by wall-clock workday window; select explicitly so this assertion is deterministic
  await page.locator('#track-select').selectOption('ridge-pass');
  await expect(page.locator('#map-heading')).toHaveText('Ridge Pass');
  const z = await page.locator('#overflow-notice').evaluate((el) => getComputedStyle(el).zIndex);
  expect(z).toBe('12');
});

test('mobile stacks the bar, uses a 2x2 pit lane, and never overflows horizontally', async ({ page }) => {
  test.skip(page.viewportSize().width > 759, 'mobile project only');
  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBe(0);
  const stage = await page.locator('#map-stage').boundingBox();
  expect(stage.height).toBeGreaterThan(500); // stage stays the hero within the chrome budget
  const columns = await page.locator('#pit-lane').evaluate((el) => (
    getComputedStyle(el).gridTemplateColumns.split(' ').length
  ));
  expect(columns).toBe(2); // 2x2 bays on mobile
});
