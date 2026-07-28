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

test('generated geometry hydrates and responsive animation cascade stays exact', async ({ page }) => {
  const mobile = page.viewportSize().width <= 759;
  for (const course of ['ridge-pass', 'cypress-run']) {
    await page.locator('#track-select').selectOption(course);
    const art = page.locator(`#${course}-art`);
    const centerline = art.locator(`#${course}-centerline`);
    await expect(centerline).toHaveAttribute('d', /^M.+ C/);
    await expect(art.locator('.route-centerlines path')).toHaveCount(6);
    const indexes = await art.locator('.route-centerlines path').evaluateAll((paths) => (
      paths.map((path) => path.getAttribute('data-route-segment-index'))
    ));
    expect(indexes).toEqual(['0', '1', '2', '3', '4', '5']);

    const wrappers = page.locator('.vehicle-anchor.state-active, .vehicle-anchor.state-thinking');
    const computed = await wrappers.evaluateAll((elements) => elements.map((element) => {
      const style = getComputedStyle(element);
      return {
        name: style.animationName,
        duration: style.animationDuration,
        timing: style.animationTimingFunction,
        delay: style.animationDelay,
        slot: Number(element.dataset.routeSlot),
      };
    }));
    const suffix = mobile ? 'mobile' : 'desktop';
    expect(computed[0].name).toBe(`${course}-traverse-${suffix}`);
    expect(computed[0].duration).toBe('64s');
    expect(computed[0].timing).toBe('linear');
    expect(computed.every((item) => Number.parseFloat(item.delay) === -item.slot * 4)).toBe(true);
  }
});

test('generated route sweep keeps visible targets aligned, separated, and contained', async ({ page }) => {
  for (const course of ['ridge-pass', 'cypress-run']) {
    await page.locator('#track-select').selectOption(course);
    const results = await page.evaluate(async ({ courseId }) => {
      const samples = [0, 1234, 7777, 15999, 31888, 47999, 63000];
      const stage = document.querySelector('#map-stage');
      const centerline = document.querySelector(`#${courseId}-centerline`);
      const wrappers = [...document.querySelectorAll(
        '.vehicle-anchor.state-active, .vehicle-anchor.state-thinking',
      )];
      const stageBox = stage.getBoundingClientRect();
      const routeLength = centerline.getTotalLength();
      const screenPoint = (distanceAlong) => {
        const point = centerline.getPointAtLength(distanceAlong);
        return {
          x: stageBox.left + point.x / 1000 * stageBox.width,
          y: stageBox.top + point.y / 760 * stageBox.height,
        };
      };
      const distanceToRoute = (x, y) => {
        let bestIndex = 0;
        let bestDistance = Infinity;
        const divisions = 512;
        for (let index = 0; index <= divisions; index += 1) {
          const point = screenPoint(routeLength * index / divisions);
          const distance = Math.hypot(x - point.x, y - point.y);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestIndex = index;
          }
        }
        let low = routeLength * Math.max(0, bestIndex - 1) / divisions;
        let high = routeLength * Math.min(divisions, bestIndex + 1) / divisions;
        for (let iteration = 0; iteration < 28; iteration += 1) {
          const first = low + (high - low) / 3;
          const second = high - (high - low) / 3;
          const a = screenPoint(first);
          const b = screenPoint(second);
          if (Math.hypot(x - a.x, y - a.y) < Math.hypot(x - b.x, y - b.y)) high = second;
          else low = first;
        }
        const point = screenPoint((low + high) / 2);
        return Math.hypot(x - point.x, y - point.y);
      };
      let maximumRouteDistance = 0;
      let minimumSeparation = Infinity;
      let clipped = 0;
      for (const sample of samples) {
        for (const wrapper of wrappers) {
          const animation = wrapper.getAnimations()[0];
          animation.pause();
          animation.currentTime = sample;
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const visible = wrappers.map((wrapper) => {
          const box = wrapper.getBoundingClientRect();
          return {
            left: box.left, right: box.right, top: box.top, bottom: box.bottom,
            x: box.left + box.width / 2,
            y: box.top + box.height / 2,
            opacity: Number(getComputedStyle(wrapper).opacity),
          };
        }).filter(({ opacity }) => opacity > 0);
        for (const target of visible) {
          maximumRouteDistance = Math.max(
            maximumRouteDistance,
            distanceToRoute(target.x, target.y),
          );
          if (target.left < stageBox.left - 0.01 || target.right > stageBox.right + 0.01
            || target.top < stageBox.top - 0.01 || target.bottom > stageBox.bottom + 0.01) clipped += 1;
        }
        for (let first = 0; first < visible.length; first += 1) {
          for (let second = first + 1; second < visible.length; second += 1) {
            minimumSeparation = Math.min(minimumSeparation, Math.hypot(
              visible[first].x - visible[second].x,
              visible[first].y - visible[second].y,
            ));
          }
        }
      }
      return {
        maximumRouteDistance,
        minimumSeparation,
        clipped,
        targetDiameter: innerWidth <= 759 ? 44 : 52,
      };
    }, { courseId: course });
    expect(results.maximumRouteDistance, `${course} centerline alignment`).toBeLessThanOrEqual(1);
    expect(results.minimumSeparation, `${course} target separation`)
      .toBeGreaterThanOrEqual(results.targetDiameter);
    expect(results.clipped, `${course} target containment`).toBe(0);
  }
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
