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

async function animationState(locator) {
  return locator.evaluate((element) => ({
    name: getComputedStyle(element).animationName,
    playState: getComputedStyle(element).animationPlayState,
  }));
}

async function center(locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.diagnostics = watchBrowserDiagnostics(page);
  await page.goto('/');
  await expect(page.locator('#snapshot-summary')).toContainText('24 sessions');
});

test.afterEach(async ({}, testInfo) => {
  expect(testInfo.diagnostics, 'browser console warnings/errors').toEqual([]);
});

test('fixtures render a nonblank, framed, horizontally safe dashboard', async ({ page }) => {
  await expect(page.locator('h1')).toHaveText('Night Pass Session Map');
  await expect(page.locator('#source-label')).toHaveText('Fixtures · Night sector');
  await expect(page.locator('.session-car')).toHaveCount(24);
  await expect(page.locator('#map-stage')).toBeVisible();

  for (const course of ['ridge-pass', 'cypress-run']) {
    await page.locator('#track-select').selectOption(course);
    const layout = await page.evaluate(() => {
      const stage = document.querySelector('#map-stage').getBoundingClientRect();
      const routeCars = [...document.querySelectorAll('.vehicle-anchor .session-car')]
        .map((element) => element.getBoundingClientRect());
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
        stage: { left: stage.left, right: stage.right, width: stage.width, height: stage.height },
        clippedRouteCars: routeCars.filter((box) => (
          box.left < stage.left - 0.5
          || box.right > stage.right + 0.5
          || box.top < stage.top - 0.5
          || box.bottom > stage.bottom + 0.5
        )).length,
      };
    });

    expect(layout.documentWidth, course).toBe(layout.viewportWidth);
    expect(layout.stage.width, course).toBeGreaterThan(300);
    expect(layout.stage.height, course).toBeGreaterThan(500);
    expect(layout.stage.left, course).toBeGreaterThanOrEqual(0);
    expect(layout.stage.right, course).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.clippedRouteCars, course).toBe(0);
  }
});

test('native course selection switches Ridge Pass and Cypress Run', async ({ page }) => {
  const selector = page.locator('#track-select');
  await selector.selectOption('cypress-run');
  await expect(page.locator('#dashboard-root')).toHaveAttribute('data-track-id', 'cypress-run');
  await expect(page.locator('#map-heading')).toHaveText('Cypress Run');
  await expect(page.locator('#track-status')).toHaveText('Active course: Cypress Run · Manual');

  await selector.selectOption('ridge-pass');
  await expect(page.locator('#dashboard-root')).toHaveAttribute('data-track-id', 'ridge-pass');
  await expect(page.locator('#map-heading')).toHaveText('Ridge Pass');
  await expect(page.locator('#track-status')).toHaveText('Active course: Ridge Pass · Manual');
});

test('active route motion pauses and resumes for hover, focus, and pin', async ({ page }) => {
  const wrapper = page.locator('.vehicle-anchor.state-active').first();
  const button = wrapper.locator('.session-car');
  const nestedMotion = wrapper.locator('.car-motion');
  const initial = await center(wrapper);

  await expect.poll(async () => distance(initial, await center(wrapper)), {
    message: 'active route car should move',
    timeout: 2_500,
  }).toBeGreaterThan(1);

  // The target is intentionally moving, so bypass Playwright's stability wait.
  // A forced real pointer move still exercises the browser's :hover cascade.
  await wrapper.hover({ force: true });
  await expect.poll(async () => (await animationState(wrapper)).playState).toBe('paused');
  await expect.poll(async () => (await animationState(nestedMotion)).playState).toBe('paused');
  const hoverPoint = await center(wrapper);
  await page.waitForTimeout(350);
  expect(distance(hoverPoint, await center(wrapper))).toBeLessThan(0.75);

  await page.mouse.move(1, 1);
  await expect.poll(async () => (await animationState(wrapper)).playState).toBe('running');

  await button.focus();
  await expect.poll(async () => (await animationState(wrapper)).playState).toBe('paused');
  await expect.poll(async () => (await animationState(nestedMotion)).playState).toBe('paused');
  await page.locator('#track-select').focus();
  await expect.poll(async () => (await animationState(wrapper)).playState).toBe('running');

  await button.focus();
  await button.press('Enter');
  await expect(wrapper).toHaveAttribute('data-pinned', 'true');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#track-select').focus();
  await page.mouse.move(1, 1);
  await expect.poll(async () => (await animationState(wrapper)).playState).toBe('paused');
  await expect.poll(async () => (await animationState(nestedMotion)).playState).toBe('paused');

  await page.keyboard.press('Escape');
  await expect(wrapper).not.toHaveAttribute('data-pinned', 'true');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(async () => (await animationState(wrapper)).playState).toBe('running');
  const resumed = await center(wrapper);
  await expect.poll(async () => distance(resumed, await center(wrapper)), {
    message: 'route car should resume after Escape',
    timeout: 2_500,
  }).toBeGreaterThan(1);
});

test('prefers-reduced-motion disables route and nested car animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('#snapshot-summary')).toContainText('24 sessions');

  const wrapper = page.locator('.vehicle-anchor.state-active').first();
  const nestedMotion = wrapper.locator('.car-motion');
  await expect.poll(async () => (await animationState(wrapper)).name).toBe('none');
  await expect.poll(async () => (await animationState(nestedMotion)).name).toBe('none');

  const first = await center(wrapper);
  await page.waitForTimeout(350);
  expect(distance(first, await center(wrapper))).toBeLessThan(0.25);
});
