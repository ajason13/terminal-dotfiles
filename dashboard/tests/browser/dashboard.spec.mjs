import { expect, test } from '@playwright/test';
import config from '../../routes/route-config.mjs';
import cypress from '../../routes/cypress-run.route.mjs';
import ridge from '../../routes/ridge-pass.route.mjs';
import { compileRoutes } from '../../scripts/lib/route-compiler.mjs';

const COMPILED = compileRoutes(config, [ridge, cypress], '0'.repeat(64));
const TRACK_SCHEDULES = new Map(COMPILED.schedules.map((item) => [item.route.id, item]));

function angleDistance(first, second) {
  return Math.abs(((first - second + 180) % 360 + 360) % 360 - 180);
}

function expectedHeadingAt(frames, percent) {
  let right = frames.findIndex((frame) => Number(frame.percent) >= percent);
  if (right <= 0) return Number(frames[0].heading);
  const before = frames[right - 1];
  const after = frames[right];
  const mix = (percent - Number(before.percent))
    / (Number(after.percent) - Number(before.percent));
  return Number(before.heading) + (Number(after.heading) - Number(before.heading)) * mix;
}

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

async function pseudoAnimationState(locator, pseudo) {
  return locator.evaluate((element, pseudoElement) => {
    const style = getComputedStyle(element, pseudoElement);
    return {
      name: style.animationName,
      playState: style.animationPlayState,
      display: style.display,
      opacity: style.opacity,
    };
  }, pseudo);
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
  await expect(page.locator('.car-atmosphere')).toHaveCount(24);
  const hierarchy = await page.locator('.vehicle-anchor').first().evaluate((wrapper) => ({
    firstClass: wrapper.children[0]?.className,
    secondClass: wrapper.children[1]?.className,
    atmosphereText: wrapper.children[0]?.textContent,
    atmosphereAria: wrapper.children[0]?.getAttribute('aria-hidden'),
    atmospherePointer: getComputedStyle(wrapper.children[0]).pointerEvents,
    buttonTransform: getComputedStyle(wrapper.children[1]).transform,
  }));
  expect(hierarchy).toEqual({
    firstClass: 'car-atmosphere',
    secondClass: 'session-car',
    atmosphereText: '',
    atmosphereAria: 'true',
    atmospherePointer: 'none',
    buttonTransform: 'none',
  });
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
  test.setTimeout(60_000);
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
  const assertLayers = async (wrapper, expected) => {
    const states = await wrapper.evaluate((element) => ({
      wrapper: getComputedStyle(element).animationPlayState,
      driftName: getComputedStyle(element.querySelector('.car-motion')).animationName,
      before: getComputedStyle(
        element.querySelector('.car-atmosphere'), '::before',
      ).animationPlayState,
      after: getComputedStyle(
        element.querySelector('.car-atmosphere'), '::after',
      ).animationPlayState,
    }));
    expect(states).toEqual({
      wrapper: expected, driftName: 'none', before: expected, after: expected,
    });
  };
  for (const trackId of ['ridge-pass', 'cypress-run']) {
    await page.locator('#track-select').selectOption(trackId);
    const wrapper = page.locator('.vehicle-anchor.state-active').first();
    const button = wrapper.locator('.session-car');
    const initial = await center(wrapper);
    await expect.poll(async () => distance(initial, await center(wrapper)), {
      message: `${trackId} active route car should move`,
      timeout: 2_500,
    }).toBeGreaterThan(1);
    await assertLayers(wrapper, 'running');

    // Forced pointer movement bypasses stability waiting on the moving target.
    await wrapper.hover({ force: true });
    await expect.poll(async () => {
      const value = await animationState(wrapper);
      return value.playState;
    }).toBe('paused');
    await assertLayers(wrapper, 'paused');
    const hoverPoint = await center(wrapper);
    await page.waitForTimeout(250);
    expect(distance(hoverPoint, await center(wrapper))).toBeLessThan(0.75);

    await page.mouse.move(1, 1);
    await expect.poll(async () => (await animationState(wrapper)).playState).toBe('running');
    await assertLayers(wrapper, 'running');

    await button.focus();
    await expect.poll(async () => (await animationState(wrapper)).playState).toBe('paused');
    await assertLayers(wrapper, 'paused');
    await page.locator('#track-select').focus();
    await expect.poll(async () => (await animationState(wrapper)).playState).toBe('running');
    await assertLayers(wrapper, 'running');

    await button.focus();
    await button.press('Enter');
    await expect(wrapper).toHaveAttribute('data-pinned', 'true');
    await page.locator('#track-select').focus();
    await page.mouse.move(1, 1);
    await assertLayers(wrapper, 'paused');

    await page.keyboard.press('Escape');
    await expect(wrapper).not.toHaveAttribute('data-pinned', 'true');
    await expect.poll(async () => (await animationState(wrapper)).playState).toBe('running');
    await assertLayers(wrapper, 'running');
    const resumed = await center(wrapper);
    await expect.poll(async () => distance(resumed, await center(wrapper)), {
      message: `${trackId} should resume after Escape`,
      timeout: 2_500,
    }).toBeGreaterThan(1);
  }
});

test('prefers-reduced-motion disables traversal, compiled drift, and smoke', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('#snapshot-summary')).toContainText('24 sessions');

  for (const trackId of ['ridge-pass', 'cypress-run']) {
    await page.locator('#track-select').selectOption(trackId);
    const wrapper = page.locator('.vehicle-anchor.state-active').first();
    const nestedMotion = wrapper.locator('.car-motion');
    const atmosphere = wrapper.locator('.car-atmosphere');
    await expect.poll(async () => (await animationState(wrapper)).name).toBe('none');
    await expect.poll(async () => (await animationState(nestedMotion)).name).toBe('none');
    for (const pseudo of ['::before', '::after']) {
      await expect.poll(async () => (
        await pseudoAnimationState(atmosphere, pseudo)
      ).name).toBe('none');
      await expect.poll(async () => (
        await pseudoAnimationState(atmosphere, pseudo)
      ).opacity).toBe('0');
    }
    expect(await wrapper.evaluate((element) => (
      getComputedStyle(element).getPropertyValue('--route-heading').trim()
    ))).not.toBe('0deg');
    const first = await center(wrapper);
    await page.waitForTimeout(250);
    expect(distance(first, await center(wrapper))).toBeLessThan(0.25);
  }
});

test('registered headings match every retained boundary, seven samples, and midpoint arcs', async ({
  page,
}) => {
  const profileName = page.viewportSize().width <= 759 ? 'mobile' : 'desktop';
  for (const trackId of ['ridge-pass', 'cypress-run']) {
    await page.locator('#track-select').selectOption(trackId);
    const frames = TRACK_SCHEDULES.get(trackId)[profileName].frames;
    const percentages = [
      ...[0, 1234, 7777, 15999, 31888, 47999, 63000].map((time) => time / 640),
      ...frames.filter(({ kind }) => kind === 'boundary').map(({ percent }) => Number(percent)),
    ];
    const midpointIndex = Math.floor(frames.length / 3);
    const midpoint = (
      Number(frames[midpointIndex].percent) + Number(frames[midpointIndex + 1].percent)
    ) / 2;
    percentages.push(midpoint);
    const expected = percentages.map((percent) => ({
      percent,
      heading: expectedHeadingAt(frames, percent),
    }));
    const measured = await page.locator(
      '.vehicle-anchor[data-route-slot="0"].state-active, '
        + '.vehicle-anchor[data-route-slot="0"].state-thinking',
    ).first().evaluate((wrapper, samples) => {
      const route = wrapper.getAnimations().find((animation) => (
        (animation.animationName ?? '').includes('traverse')
      ));
      route.pause();
      return samples.map(({ percent }) => {
        route.currentTime = percent / 100 * 64000;
        const angle = wrapper.querySelector('.car-angle');
        const matrix = new DOMMatrixReadOnly(getComputedStyle(angle).transform);
        return {
          heading: Number.parseFloat(
            getComputedStyle(wrapper).getPropertyValue('--route-heading'),
          ),
          transformAngle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
        };
      });
    }, expected);
    measured.forEach((actual, index) => {
      expect(angleDistance(actual.heading, expected[index].heading),
        `${trackId}/${profileName}/${expected[index].percent}% registered heading`)
        .toBeLessThanOrEqual(0.25);
      expect(angleDistance(actual.transformAngle, expected[index].heading),
        `${trackId}/${profileName}/${expected[index].percent}% forward axis`)
        .toBeLessThanOrEqual(0.25);
    });
  }
});

test('route reset milestones preserve position, heading, opacity, and upright markings', async ({
  page,
}) => {
  const profileName = page.viewportSize().width <= 759 ? 'mobile' : 'desktop';
  for (const trackId of ['ridge-pass', 'cypress-run']) {
    await page.locator('#track-select').selectOption(trackId);
    const frames = TRACK_SCHEDULES.get(trackId)[profileName].frames;
    const first = frames[0];
    const final = frames.at(-1);
    const expected = [
      { percent: 98.8, frame: final, opacity: 1 },
      { percent: 99.2, frame: final, opacity: 0 },
      { percent: 99.6, frame: first, opacity: 0 },
      { percent: 100, frame: first, opacity: 1 },
    ];
    const actual = await page.locator(
      '.vehicle-anchor[data-route-slot="0"].state-active, '
        + '.vehicle-anchor[data-route-slot="0"].state-thinking',
    ).first().evaluate((wrapper, milestones) => {
      const route = wrapper.getAnimations().find((animation) => (
        (animation.animationName ?? '').includes('traverse')
      ));
      const motion = wrapper.querySelector('.car-motion');
      route.pause();
      motion.getAnimations()[0]?.pause();
      return milestones.map(({ percent }) => {
        route.currentTime = percent / 100 * 64000;
        const style = getComputedStyle(wrapper);
        const matrixAngle = (element) => {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
          return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
        };
        const heading = Number.parseFloat(style.getPropertyValue('--route-heading'));
        const glyph = wrapper.querySelector('.car-glyph');
        const code = wrapper.querySelector('.car-code');
        const carAngle = matrixAngle(wrapper.querySelector('.car-angle'));
        const driftAngle = matrixAngle(motion);
        return {
          left: Number.parseFloat(style.left),
          top: Number.parseFloat(style.top),
          heading,
          opacity: Number(style.opacity),
          visibility: style.visibility,
          glyphNet: carAngle + driftAngle + matrixAngle(glyph),
          codeNet: carAngle + driftAngle + matrixAngle(code),
        };
      });
    }, expected);
    const stage = await page.locator('#map-stage').boundingBox();
    expected.forEach((milestone, index) => {
      expect(Math.abs(actual[index].left - Number(milestone.frame.left) / 100 * stage.width))
        .toBeLessThanOrEqual(0.1);
      expect(Math.abs(actual[index].top - Number(milestone.frame.top) / 100 * stage.height))
        .toBeLessThanOrEqual(0.1);
      expect(angleDistance(actual[index].heading, Number(milestone.frame.heading)))
        .toBeLessThanOrEqual(0.01);
      expect(actual[index].opacity).toBeCloseTo(milestone.opacity, 3);
      expect(actual[index].visibility).toBe('visible');
      expect(angleDistance(actual[index].glyphNet, 0)).toBeLessThanOrEqual(0.25);
      expect(angleDistance(actual[index].codeNet, 0)).toBeLessThanOrEqual(0.25);
    });
  }
});

test('every compiled corner has signed zero-peak-zero yaw, clear body bounds, and upright markings', async ({ page }) => {
  const profileName = page.viewportSize().width <= 759 ? 'mobile' : 'desktop';
  for (const trackId of ['ridge-pass', 'cypress-run']) {
    await page.locator('#track-select').selectOption(trackId);
    const schedule = TRACK_SCHEDULES.get(trackId)[profileName];
    const samples = schedule.corners.flatMap((corner, cornerIndex) => [
      { cornerIndex, phase: 'entry', percent: Number(schedule.frames[corner.entryFrameIndex].percent) },
      { cornerIndex, phase: 'apex', percent: Number(schedule.frames[corner.apexFrameIndex].percent) },
      { cornerIndex, phase: 'exit', percent: Number(schedule.frames[corner.exitFrameIndex].percent) },
    ]);
    const results = await page.locator(
      '.vehicle-anchor[data-route-slot="0"].state-active, '
        + '.vehicle-anchor[data-route-slot="0"].state-thinking',
    ).first().evaluate((wrapper, inputs) => {
          const route = wrapper.getAnimations().find((animation) => (
            (animation.animationName ?? '').includes('traverse')
          ));
          const motion = wrapper.querySelector('.car-motion');
          route.pause();
          const angleOf = (element) => {
            const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
            return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
          };
          return inputs.map((input) => {
            route.currentTime = input.percent / 100 * 64000;
            const style = getComputedStyle(wrapper);
            const yaw = Number.parseFloat(style.getPropertyValue('--drift-yaw'));
            const inverse = Number.parseFloat(
              style.getPropertyValue('--drift-upright-yaw'),
            );
            const total = angleOf(wrapper.querySelector('.car-angle')) + angleOf(motion);
            return {
              ...input,
              yaw,
              inverse,
              motionAngle: angleOf(motion),
              glyphNet: total + angleOf(wrapper.querySelector('.car-glyph')),
              codeNet: total + angleOf(wrapper.querySelector('.car-code')),
              buttonTransform: getComputedStyle(wrapper.querySelector('.session-car')).transform,
              tooltipAngle: angleOf(wrapper.querySelector('.session-tooltip')),
              motionAnimation: getComputedStyle(motion).animationName,
            };
          });
        }, samples);
    const apexBodies = await page.evaluate(async (apexPercents) => {
      const stageBox = document.querySelector('#map-stage').getBoundingClientRect();
      const wrappers = [...document.querySelectorAll(
        '.vehicle-anchor.state-active, .vehicle-anchor.state-thinking',
      )];
      const results = [];
      for (const percent of apexPercents) {
        for (const wrapper of wrappers) {
          const route = wrapper.getAnimations().find((animation) => (
            (animation.animationName ?? '').includes('traverse')
          ));
          route.pause();
          route.currentTime = percent / 100 * 64000;
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const bodies = wrappers.map((wrapper) => {
          const box = wrapper.querySelector('.car-body').getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            opacity: Number(getComputedStyle(wrapper).opacity),
          };
        }).filter(({ opacity }) => opacity > 0);
        let clipped = 0;
        let overlaps = 0;
        for (const body of bodies) {
          if (body.left < stageBox.left - 0.01 || body.right > stageBox.right + 0.01
            || body.top < stageBox.top - 0.01 || body.bottom > stageBox.bottom + 0.01) {
            clipped += 1;
          }
        }
        for (let first = 0; first < bodies.length; first += 1) {
          for (let second = first + 1; second < bodies.length; second += 1) {
            const horizontal = Math.min(bodies[first].right, bodies[second].right)
              - Math.max(bodies[first].left, bodies[second].left);
            const vertical = Math.min(bodies[first].bottom, bodies[second].bottom)
              - Math.max(bodies[first].top, bodies[second].top);
            if (horizontal > 0.01 && vertical > 0.01) overlaps += 1;
          }
        }
        results.push({ clipped, overlaps });
      }
      return results;
    }, schedule.corners.map((corner) => (
      Number(schedule.frames[corner.apexFrameIndex].percent)
    )));
    results.forEach((result) => {
        const corner = schedule.corners[result.cornerIndex];
        expect(Math.abs(result.yaw + result.inverse)).toBeLessThanOrEqual(0.01);
        expect(angleDistance(result.motionAngle, result.yaw)).toBeLessThanOrEqual(0.25);
        expect(angleDistance(result.glyphNet, 0)).toBeLessThanOrEqual(0.25);
        expect(angleDistance(result.codeNet, 0)).toBeLessThanOrEqual(0.25);
        expect(result.buttonTransform).toBe('none');
        expect(angleDistance(result.tooltipAngle, 0)).toBeLessThanOrEqual(0.01);
        expect(result.motionAnimation).toBe('none');
        if (result.phase === 'apex') {
          expect(Math.sign(result.yaw)).toBe(corner.sign);
          expect(Math.abs(result.yaw)).toBeGreaterThanOrEqual(15);
          expect(Math.abs(result.yaw)).toBeLessThanOrEqual(42);
        } else {
          expect(Math.abs(result.yaw)).toBeLessThanOrEqual(0.01);
        }
    });
    apexBodies.forEach((result, cornerIndex) => {
      expect(result.clipped,
        `${trackId}/${profileName} corner ${cornerIndex + 1} body containment`).toBe(0);
      expect(result.overlaps,
        `${trackId}/${profileName} corner ${cornerIndex + 1} visual body overlap`).toBe(0);
    });
    const broad = schedule.corners.reduce((best, corner) => (
      Math.abs(corner.peakYaw) < Math.abs(best.peakYaw) ? corner : best
    ));
    const tight = schedule.corners.reduce((best, corner) => (
      Math.abs(corner.peakYaw) > Math.abs(best.peakYaw) ? corner : best
    ));
    expect(Math.abs(tight.peakYaw)).toBeGreaterThan(Math.abs(broad.peakYaw));
    const straightFrame = schedule.frames.find((frame, index) => (
      frame.driftYaw === '0' && index > 8 && schedule.corners.every((corner) => (
        index < corner.entryFrameIndex || index > corner.exitFrameIndex
      ))
    ));
    const straightYaw = await page.locator(
      '.vehicle-anchor[data-route-slot="0"].state-active, '
        + '.vehicle-anchor[data-route-slot="0"].state-thinking',
    ).first().evaluate((wrapper, percent) => {
      const route = wrapper.getAnimations().find((animation) => (
        (animation.animationName ?? '').includes('traverse')
      ));
      route.pause();
      route.currentTime = percent / 100 * 64000;
      return Number.parseFloat(getComputedStyle(wrapper).getPropertyValue('--drift-yaw'));
    }, Number(straightFrame.percent));
    expect(Math.abs(straightYaw)).toBeLessThanOrEqual(0.01);
  }
});

test('registration capability matrix fails static and reuses cached success or failure', async ({
  browser,
  page,
}) => {
  const scenarios = [
    { id: 'missing', missing: true, success: false },
    { id: 'failure-1', failure: 0, success: false },
    { id: 'failure-2', failure: 1, success: false },
    { id: 'failure-3', failure: 2, success: false },
    { id: 'failure-4', failure: 3, success: false },
    { id: 'collision', failure: 0, collision: true, success: false },
    { id: 'success', success: true },
  ];
  for (const scenario of scenarios) {
    const context = await browser.newContext({ viewport: page.viewportSize() });
    const matrixPage = await context.newPage();
    const diagnostics = watchBrowserDiagnostics(matrixPage);
    await matrixPage.addInitScript((settings) => {
      window.__routeRegistrationCalls = [];
      const native = CSS.registerProperty?.bind(CSS);
      if (settings.missing) {
        Object.defineProperty(CSS, 'registerProperty', {
          configurable: true, value: undefined,
        });
      } else {
        CSS.registerProperty = (descriptor) => {
          const index = window.__routeRegistrationCalls.length;
          window.__routeRegistrationCalls.push(structuredClone(descriptor));
          if (index === settings.failure) {
            if (settings.collision) {
              throw new DOMException('synthetic collision', 'InvalidModificationError');
            }
            throw new Error(`synthetic registration failure ${index + 1}`);
          }
          native(descriptor);
        };
      }
    }, scenario);
    await matrixPage.goto('http://127.0.0.1:43917/');
    await expect(matrixPage.locator('#snapshot-summary')).toContainText('24 sessions');
    const result = await matrixPage.evaluate(async () => {
      const root = document.querySelector('#dashboard-root');
      const before = window.__routeRegistrationCalls.length;
      const secondRoot = document.createElement('div');
      secondRoot.setAttribute('data-route-angle-motion', 'stale');
      const { initializeRouteAngleMotion } = await import(
        './src/route-motion-capability.mjs'
      );
      let returned;
      let threw = false;
      try {
        returned = initializeRouteAngleMotion(secondRoot, CSS);
      } catch {
        threw = true;
      }
      const route = getComputedStyle(
        document.querySelector('.vehicle-anchor.state-active'),
      ).animationName;
      const drift = getComputedStyle(
        document.querySelector('.vehicle-anchor.state-active .car-motion'),
      ).animationName;
      const smoke = getComputedStyle(
        document.querySelector('.vehicle-anchor.state-active > .car-atmosphere'),
        '::before',
      ).animationName;
      return {
        calls: window.__routeRegistrationCalls,
        callsBeforeCached: before,
        callsAfterCached: window.__routeRegistrationCalls.length,
        enabled: root.getAttribute('data-route-angle-motion'),
        secondEnabled: secondRoot.getAttribute('data-route-angle-motion'),
        returned,
        threw,
        route,
        drift,
        smoke,
        staticHeading: getComputedStyle(
          document.querySelector('.vehicle-anchor[data-route-slot]'),
        ).getPropertyValue('--route-heading').trim(),
      };
    });
    expect(result.threw, scenario.id).toBe(false);
    expect(result.enabled, scenario.id).toBe(scenario.success ? 'enabled' : null);
    expect(result.secondEnabled, scenario.id).toBe(scenario.success ? 'enabled' : null);
    expect(result.returned, scenario.id).toBe(scenario.success);
    expect(result.callsAfterCached, scenario.id).toBe(result.callsBeforeCached);
    expect(result.calls.length, scenario.id).toBe(scenario.missing ? 0 : 4);
    if (!scenario.missing) {
      expect(result.calls.map(({ name }) => name)).toEqual([
        '--route-heading',
        '--route-upright-heading',
        '--drift-yaw',
        '--drift-upright-yaw',
      ]);
    }
    if (scenario.success) {
      expect(result.route).toContain('traverse');
      expect(result.drift).toBe('none');
      expect(result.smoke).toBe('active-smoke-left');
    } else {
      expect(result.route).toBe('none');
      expect(result.drift).toBe('none');
      expect(result.smoke).toBe('none');
      expect(result.staticHeading).not.toBe('0deg');
    }
    expect(diagnostics, scenario.id).toEqual([]);
    await context.close();
  }
});

test('atmosphere geometry, envelopes, mobile policy, hit testing, and bounds stay exact', async ({
  page,
}) => {
  const mobile = page.viewportSize().width <= 759;
  const tables = {
    active: {
      before: {
        size: mobile ? 0 : 5, duration: mobile ? 0 : 1600, delay: 0,
        frames: [[0, 0, 0.65, 0], [-1, 4, 1, 0.22], [-2, 10, 1.35, 0]],
      },
      after: {
        size: mobile ? 0 : 4, duration: mobile ? 0 : 1600, delay: -800,
        frames: [[0, 0, 0.65, 0], [1, 4, 1, 0.22], [2, 10, 1.35, 0]],
      },
    },
    thinking: {
      before: mobile ? {
        size: 3, duration: 3200, delay: 0,
        frames: [[0, 0, 0.75, 0], [-0.5, 2, 0.9, 0.08], [-1, 4, 1.05, 0]],
      } : {
        size: 4, duration: 2400, delay: 0,
        frames: [[0, 0, 0.7, 0], [-0.75, 3, 0.9, 0.14], [-1.5, 7, 1.2, 0]],
      },
      after: {
        size: mobile ? 0 : 4, duration: mobile ? 0 : 2400, delay: -1200,
        frames: [[0, 0, 0.7, 0], [0.75, 3, 0.9, 0.14], [1.5, 7, 1.2, 0]],
      },
    },
  };
  for (const trackId of ['ridge-pass', 'cypress-run']) {
    await page.locator('#track-select').selectOption(trackId);
    for (const state of ['active', 'thinking']) {
      const wrapper = page.locator(`.vehicle-anchor.state-${state}`).first();
      const atmosphere = wrapper.locator('.car-atmosphere');
      await wrapper.evaluate(async (element) => {
        const route = element.getAnimations().find((animation) => (
          (animation.animationName ?? '').includes('traverse')
        ));
        route.pause();
        await route.ready;
        route.currentTime = 16000;
        const motion = element.querySelector('.car-motion');
        for (const animation of motion.getAnimations()) {
          animation.pause();
          await animation.ready;
          animation.currentTime = 0;
        }
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
      });
      const initial = await wrapper.evaluate((element) => {
        const box = (node) => {
          const value = node.getBoundingClientRect();
          return [value.x, value.y, value.width, value.height];
        };
        return {
          wrapper: box(element),
          button: box(element.querySelector('.session-car')),
          atmosphere: box(element.querySelector('.car-atmosphere')),
          atmosphereDisplay: getComputedStyle(
            element.querySelector('.car-atmosphere'),
          ).display,
        };
      });
      if (mobile && state === 'active') {
        expect(initial.atmosphereDisplay).toBe('none');
        for (const pseudo of ['::before', '::after']) {
          expect((await pseudoAnimationState(atmosphere, pseudo)).display).toBe('block');
        }
        await wrapper.evaluate((element) => {
          element.querySelector('.session-car').focus({ preventScroll: true });
        });
        const focused = await wrapper.evaluate((element) => {
          const box = (node) => {
            const value = node.getBoundingClientRect();
            return [value.x, value.y, value.width, value.height];
          };
          const button = element.querySelector('.session-car');
          return {
            wrapper: box(element),
            button: box(button),
            atmosphere: box(element.querySelector('.car-atmosphere')),
            focused: document.activeElement === button,
          };
        });
        expect(focused.button).toEqual(focused.wrapper);
        expect(focused.atmosphere).toEqual([0, 0, 0, 0]);
        expect(focused.focused).toBe(true);
        continue;
      }

      for (const pseudoName of ['before', 'after']) {
        const expected = tables[state][pseudoName];
        const pseudo = `::${pseudoName}`;
        const base = await atmosphere.evaluate((element, pseudoElement) => {
          const style = getComputedStyle(element, pseudoElement);
          return {
            display: style.display,
            width: Number.parseFloat(style.width),
            height: Number.parseFloat(style.height),
            duration: Number.parseFloat(style.animationDuration) * 1000,
            delay: Number.parseFloat(style.animationDelay) * 1000,
            pointerEvents: style.pointerEvents,
          };
        }, pseudo);
        if (expected.size === 0) {
          expect(base.display).toBe('none');
          continue;
        }
        expect(base.display).toBe('block');
        expect(base.width).toBe(expected.size);
        expect(base.height).toBe(expected.size);
        expect(base.duration).toBe(expected.duration);
        expect(base.delay).toBe(expected.delay);
        expect(base.pointerEvents).toBe('none');

        for (const [frameIndex, fraction] of [0, 0.4, 1].entries()) {
          const measured = await atmosphere.evaluate(async (element, input) => {
            const animation = element.getAnimations({ subtree: true }).find((item) => (
              item.effect.pseudoElement === input.pseudo
            ));
            animation.pause();
            animation.effect.updateTiming({ delay: 0 });
            const timing = animation.effect.getTiming();
            const fraction = input.fraction === 0
              ? 1e-4
              : input.fraction === 1 ? 1 - 1e-7 : input.fraction;
            animation.currentTime = timing.duration * fraction;
            await new Promise((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(resolve));
            });
            const style = getComputedStyle(element, input.pseudo);
            const matrix = new DOMMatrixReadOnly(style.transform);
            const atmosphereBox = element.getBoundingClientRect();
            const stageBox = document.querySelector('#map-stage').getBoundingClientRect();
            const heading = new DOMMatrixReadOnly(getComputedStyle(element).transform);
            const originY = innerWidth <= 759 ? 16 : 20;
            const localX = matrix.e + Number.parseFloat(style.width) / 2;
            const localY = originY + matrix.f + Number.parseFloat(style.height) / 2;
            const rotatedX = heading.a * localX + heading.c * localY;
            const rotatedY = heading.b * localX + heading.d * localY;
            const centerX = atmosphereBox.x + atmosphereBox.width / 2 + rotatedX;
            const centerY = atmosphereBox.y + atmosphereBox.height / 2 + rotatedY;
            const hit = document.elementFromPoint(centerX, centerY);
            const intersectionWidth = Math.max(0, Math.min(
              stageBox.right, centerX + matrix.a * Number.parseFloat(style.width) / 2,
            ) - Math.max(
              stageBox.left, centerX - matrix.a * Number.parseFloat(style.width) / 2,
            ));
            const intersectionHeight = Math.max(0, Math.min(
              stageBox.bottom, centerY + matrix.d * Number.parseFloat(style.height) / 2,
            ) - Math.max(
              stageBox.top, centerY - matrix.d * Number.parseFloat(style.height) / 2,
            ));
            return {
              scaleX: matrix.a,
              scaleY: matrix.d,
              translateX: matrix.e,
              translateY: matrix.f,
              opacity: Number(style.opacity),
              playState: animation.playState,
              hitAtmosphere: hit === element,
              intersectionWidth,
              intersectionHeight,
              documentOverflow: document.documentElement.scrollWidth
                - document.documentElement.clientWidth,
            };
          }, { pseudo, fraction });
          const [x, y, scale, opacity] = expected.frames[frameIndex];
          expect(measured.scaleX).toBeCloseTo(scale, 3);
          expect(measured.scaleY).toBeCloseTo(scale, 3);
          expect(measured.translateX).toBeCloseTo(-expected.size / 2 + x, 1);
          expect(measured.translateY).toBeCloseTo(-expected.size / 2 + y, 1);
          expect(measured.opacity).toBeCloseTo(opacity, 3);
          expect(measured.playState).toBe('paused');
          expect(measured.hitAtmosphere).toBe(false);
          expect(measured.documentOverflow).toBe(0);
          if (fraction === 0.4) {
            expect(measured.intersectionWidth).toBeGreaterThanOrEqual(2);
            expect(measured.intersectionHeight).toBeGreaterThanOrEqual(2);
          }
        }
      }
      await wrapper.evaluate((element) => {
        element.querySelector('.session-car').focus({ preventScroll: true });
      });
      const final = await wrapper.evaluate((element) => {
        const box = (node) => {
          const value = node.getBoundingClientRect();
          return [value.x, value.y, value.width, value.height];
        };
        const button = element.querySelector('.session-car');
        return {
          wrapper: box(element),
          button: box(button),
          focused: document.activeElement === button,
        };
      });
      expect(final.button).toEqual(final.wrapper);
      expect(final.focused).toBe(true);
    }
  }
});
