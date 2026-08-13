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

test('the pit divides into tmux-session bays, newest-first inside each', async ({ page }) => {
  await expect(page.locator('#pit-heading')).toHaveText('Pit');
  await expect(page.locator('#pit .pit-bay-label')).toHaveText([
    'canary', 'dotfiles', 'e2e', 'Unassigned',
  ]);
  await expect(page.locator('#pit .pit-bay-count')).toHaveText(['5', '0', '5', '2']);

  const lane = await page.locator('#pit-lane').boundingBox();
  const stage = await page.locator('#map-stage').boundingBox();
  expect(lane.y).toBeGreaterThan(stage.y);

  // Within each bay, DOM order must be descending lastActivityAt.
  const perBay = await page.locator('#pit .pit-bay-mount').evaluateAll((mounts) => mounts.map(
    (mount) => [...mount.querySelectorAll('.activity-time')]
      .map((el) => Date.parse(el.getAttribute('datetime'))),
  ));
  for (const times of perBay) {
    expect(times).toEqual([...times].sort((a, b) => b - a));
  }
});

test('an all-on-track session shows an empty bay rather than vanishing', async ({ page }) => {
  const dotfiles = page.locator('#pit .pit-bay', { has: page.locator('.pit-bay-label', { hasText: 'dotfiles' }) });
  await expect(dotfiles.locator('.pit-vehicle')).toHaveCount(0);
  const mount = dotfiles.locator('.pit-bay-mount');
  await expect(mount).toBeVisible();
  // The generated ::after content is what actually reads "Clear" to a sighted user.
  const generated = await mount.evaluate((el) => getComputedStyle(el, '::after').content);
  expect(generated).toContain('Clear');
});

test('parked (pit) cars mount inside a pit bay, not on the stage', async ({ page }) => {
  const pitCars = page.locator('#pit .pit-vehicle');
  const count = await pitCars.count();
  expect(count).toBeGreaterThan(0); // fixtures populate pit pools
  const strays = await page.locator('#vehicle-layer .pit-vehicle').count();
  expect(strays).toBe(0);
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

test('pit tooltips stay within the viewport', async ({ page }) => {
  const clipped = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const wrapper of document.querySelectorAll('#pit .pit-vehicle')) {
      wrapper.querySelector('.session-car').focus();
      const r = wrapper.querySelector('.session-tooltip').getBoundingClientRect();
      if (r.left < -0.5 || r.right > vw + 0.5) bad.push({ id: wrapper.dataset.sessionId, left: r.left, right: r.right });
      wrapper.querySelector('.session-car').blur();
    }
    return bad;
  });
  expect(clipped, JSON.stringify(clipped)).toEqual([]);
});

test('route tooltips stay fully on-screen (both axes) at any point along the lap', async ({ page }) => {
  await page.locator('#track-select').selectOption('ridge-pass');
  await expect(page.locator('.vehicle-anchor').first()).toBeVisible();

  // Freeze every car at a deterministic lap phase, then focus each (which fires
  // the clamp handler and pauses the car) and check its tooltip stays on-screen.
  // The tooltip's own `transition: transform 120ms ease` means the shift the
  // clamp handler just set is still mid-animation on the very next frame, so
  // wait for that transition to settle before reading the rect.
  const sweepAtPhase = (phaseMs) => page.evaluate(async (T) => {
    const vw = document.documentElement.clientWidth;
    // The stage clips (overflow: hidden) both axes; it spans the viewport width
    // but only part of its height, so vertical bounds come from the stage rect.
    const stage = document.querySelector('#map-stage').getBoundingClientRect();
    const anchors = [...document.querySelectorAll('.vehicle-anchor')];
    for (const w of anchors) {
      for (const a of w.getAnimations()) { a.currentTime = T; a.pause(); }
    }
    const bad = [];
    for (const w of anchors) {
      const tooltip = w.querySelector('.session-tooltip');
      w.querySelector('.session-car').focus();
      // getAnimations() must run synchronously right after focus() to flush style and
      // register the transform transition; do not reorder this away from the focus call.
      await Promise.all(tooltip.getAnimations().map((a) => a.finished.catch(() => {})));
      const r = tooltip.getBoundingClientRect();
      if (r.left < -0.5 || r.right > vw + 0.5 || r.top < stage.top - 0.5 || r.bottom > stage.bottom + 0.5) {
        bad.push({
          id: w.dataset.sessionId, phase: T, vw,
          left: Math.round(r.left), right: Math.round(r.right),
          top: Math.round(r.top), bottom: Math.round(r.bottom),
          stageTop: Math.round(stage.top), stageBottom: Math.round(stage.bottom),
        });
      }
      w.querySelector('.session-car').blur();
    }
    return bad;
  }, phaseMs);

  // Two kinds of phase matter. Sub-slot offsets (2000/6000, not multiples of the
  // 4s per-slot delay) place cars at intermediate points along the path. Half/quarter
  // lap offsets (16000/32000/48000) move each car FAR from its slot, so a car whose
  // up/down direction is chosen from its real position must be re-evaluated there -
  // the case a static slot-derived direction gets wrong (opens up while near the top).
  for (const phase of [0, 2000, 6000, 16000, 32000, 48000]) {
    const bad = await sweepAtPhase(phase);
    expect(bad, JSON.stringify(bad)).toEqual([]);
  }
});

test('a hovered lower-course tooltip measures its full content before clamping', async ({ page }) => {
  await page.setViewportSize({ width: 1996, height: 1092 });
  await page.reload();
  await page.locator('#track-select').selectOption('cypress-run');
  const wrapper = page.locator('.vehicle-anchor[data-session-id="route-cinder"]');
  const tooltip = wrapper.locator('.session-tooltip');
  const measurement = await wrapper.evaluate((element) => {
    const route = element.getAnimations().find((animation) => (
      (animation.animationName ?? '').includes('traverse')
    ));
    route.pause();
    let bottomTime = 0;
    let bottom = -Infinity;
    for (let time = 0; time < 64000; time += 1000) {
      route.currentTime = time;
      const value = element.getBoundingClientRect().bottom;
      if (value > bottom) {
        bottom = value;
        bottomTime = time;
      }
    }
    route.currentTime = bottomTime;
    return {
      bottomTime,
      hiddenHeight: element.querySelector('.session-tooltip').offsetHeight,
    };
  });
  await wrapper.hover({ force: true });
  await expect(tooltip).toBeVisible();
  await tooltip.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {})));
  });

  const bounds = await tooltip.evaluate((element) => {
    const tip = element.getBoundingClientRect();
    const stage = document.querySelector('#map-stage').getBoundingClientRect();
    return {
      visibleHeight: element.offsetHeight,
      inlineContentVisibility: element.style.contentVisibility,
      openUp: element.parentElement.classList.contains('tooltip-up'),
      tipTop: tip.top,
      tipBottom: tip.bottom,
      stageTop: stage.top,
      stageBottom: stage.bottom,
    };
  });
  expect(measurement.bottomTime).toBeGreaterThanOrEqual(0);
  expect(measurement.hiddenHeight).toBeLessThan(bounds.visibleHeight);
  expect(bounds.inlineContentVisibility).toBe('');
  expect(bounds.openUp).toBe(true);
  expect(bounds.tipTop).toBeGreaterThanOrEqual(bounds.stageTop + 7.5);
  expect(bounds.tipBottom).toBeLessThanOrEqual(bounds.stageBottom - 7.5);
});

test('mobile pit tooltips never overlap: pinning one suppresses others on focus', async ({ page }) => {
  test.skip(page.viewportSize().width > 759, 'mobile docked-tooltip project only');
  const cars = page.locator('#pit .pit-vehicle');
  const pinned = cars.nth(0).locator('.session-car');
  const other = cars.nth(1).locator('.session-car');

  await pinned.press('Enter');
  await expect(cars.nth(0)).toHaveAttribute('data-pinned', 'true');
  await other.focus();

  const visibleCount = await page.locator('#pit .session-tooltip').evaluateAll((els) => (
    els.filter((el) => getComputedStyle(el).visibility === 'visible').length
  ));
  expect(visibleCount).toBe(1);
});

test('the route-overflow notice keeps z-index 12 and the map heading names the course', async ({ page }) => {
  // auto mode picks the course by wall-clock workday window; select explicitly so this assertion is deterministic
  await page.locator('#track-select').selectOption('ridge-pass');
  await expect(page.locator('#map-heading')).toHaveText('Ridge Pass');
  const z = await page.locator('#overflow-notice').evaluate((el) => getComputedStyle(el).zIndex);
  expect(z).toBe('12');
});

test('work-ref badges render on a route and a pit car, tooltip shows the ref', async ({ page }) => {
  await page.locator('#track-select').selectOption('ridge-pass');

  const routeWrapper = page.locator('.vehicle-anchor').filter({
    has: page.locator('.session-car[data-session-id="route-bracken"]'),
  });
  await expect(routeWrapper.locator('.car-badge')).toHaveText('PR#42');
  await expect(routeWrapper.locator('.car-badge')).toHaveAttribute('aria-hidden', 'true');

  const pitWrapper = page.locator('#pit .pit-vehicle').filter({
    has: page.locator('.session-car[data-session-id="idle-pine"]'),
  });
  await expect(pitWrapper.locator('.car-badge')).toHaveText('PR#63');

  // Focus the pit car (stationary; no animation to freeze) and read its tooltip.
  await pitWrapper.locator('.session-car').focus();
  const tooltip = pitWrapper.locator('.session-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('strong')).toHaveText('fixture pass');
  await expect(tooltip).toContainText('Jira: BB-410 · PR #63');
  // The pruned location line must not come back.
  await expect(tooltip).not.toContainText('Pit position');
});

test('a bare-ref window name shows the ref as the tooltip heading, with no ref line', async ({ page }) => {
  await page.locator('#track-select').selectOption('ridge-pass');
  const wrapper = page.locator('#pit .pit-vehicle').filter({
    has: page.locator('.session-car[data-session-id="idle-quartz"]'),
  });
  await wrapper.locator('.session-car').focus();
  const tooltip = wrapper.locator('.session-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('strong')).toHaveText('BB-325');
  await expect(tooltip).not.toContainText('Jira:');
});

test('a route car heading strips the pane suffix and the ref line joins ticket and label', async ({ page }) => {
  await page.locator('#track-select').selectOption('ridge-pass');
  const routeWrapper = page.locator('.vehicle-anchor').filter({
    has: page.locator('.session-car[data-session-id="route-ember"]'),
  });
  await routeWrapper.locator('.session-car').focus();
  const tooltip = routeWrapper.locator('.session-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('strong')).toHaveText('verifying output');
  await expect(tooltip).toContainText('Jira: BB-511');
  // The pane suffix stripped from the heading must not resurface elsewhere in the tooltip.
  await expect(tooltip).not.toContainText('pane 2');
});

test('mobile keeps the pit full-width and never overflows horizontally', async ({ page }) => {
  test.skip(page.viewportSize().width > 759, 'mobile project only');
  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBe(0);
  const stage = await page.locator('#map-stage').boundingBox();
  expect(stage.height).toBeGreaterThan(500); // stage stays the hero within the chrome budget
  await expect(page.locator('#pit')).toBeVisible();
  const cols = await page.locator('#pit .pit-bay-mount').first()
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(cols).toBeGreaterThanOrEqual(1); // auto-fill wrapping grid
});

test('the lane stays capped and the page never scrolls vertically', async ({ page }) => {
  const cap = await page.locator('#pit-lane').evaluate((el) => {
    const limit = parseFloat(getComputedStyle(el).maxHeight);
    return { height: el.getBoundingClientRect().height, limit };
  });
  expect(cap.height).toBeLessThanOrEqual(cap.limit + 1);
  const overflows = await page.evaluate(() => (
    document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
  ));
  expect(overflows).toBe(false);
});

test('a docked pit tooltip is fully in-viewport and unclipped by the scrolling lane', async ({ page }) => {
  const car = page.locator('#pit .pit-vehicle .session-car').first();
  await car.focus();
  const tooltip = page.locator('#pit .pit-vehicle').first().locator('.session-tooltip');
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  // The lane's own top edge must not crop it: fixed positioning is what allows this.
  const laneTop = (await page.locator('#pit-lane').boundingBox()).y;
  expect(box.y).toBeLessThan(laneTop);
  await expect(tooltip).toHaveCSS('position', 'fixed');
});
