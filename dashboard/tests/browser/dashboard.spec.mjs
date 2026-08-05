import { expect, test } from '@playwright/test';
import config from '../../routes/route-config.mjs';
import cypress from '../../routes/cypress-run.route.mjs';
import lantern from '../../routes/lantern-coil.route.mjs';
import ridge from '../../routes/ridge-pass.route.mjs';
import { compileRoutes } from '../../scripts/lib/route-compiler.mjs';
import { getTrack } from '../../src/track-catalog.mjs';
import { browserFixturePayloads } from '../generate-browser-fixtures.mjs';

const COMPILED = compileRoutes(config, [ridge, cypress, lantern], '0'.repeat(64));
const TRACK_SCHEDULES = new Map(COMPILED.schedules.map((item) => [item.route.id, item]));
const CYPRESS_TRACK = getTrack('cypress-run');
const CYPRESS_MOBILE_HEADINGS = TRACK_SCHEDULES.get('cypress-run').mobileStaticHeadings;
const UPDATE_SCREENSHOTS = process.env.DASHBOARD_UPDATE_SCREENSHOTS === '1';

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

function quadEdgeLengths(quad) {
  return [
    Math.hypot(quad[2] - quad[0], quad[3] - quad[1]),
    Math.hypot(quad[4] - quad[2], quad[5] - quad[3]),
    Math.hypot(quad[6] - quad[4], quad[7] - quad[5]),
    Math.hypot(quad[0] - quad[6], quad[1] - quad[7]),
  ];
}

function quadPoints(quad) {
  return [
    { x: quad[0], y: quad[1] },
    { x: quad[2], y: quad[3] },
    { x: quad[4], y: quad[5] },
    { x: quad[6], y: quad[7] },
  ];
}

function centeredQuadPoints(quad) {
  const points = quadPoints(quad);
  const center = {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
  return points.map((point) => ({ x: point.x - center.x, y: point.y - center.y }));
}

function focusExteriorQuad(wrapperQuad, focus) {
  const [topLeft, topRight, bottomRight, bottomLeft] = quadPoints(wrapperQuad);
  return [
    topLeft.x + focus.insetLeft, topLeft.y + focus.insetTop,
    topRight.x - focus.insetRight, topRight.y + focus.insetTop,
    bottomRight.x - focus.insetRight, bottomRight.y - focus.insetBottom,
    bottomLeft.x + focus.insetLeft, bottomLeft.y - focus.insetBottom,
  ];
}

async function contentQuad(cdp, expression) {
  const evaluated = await cdp.send('Runtime.evaluate', {
    expression,
    objectGroup: 'item-4-quads',
  });
  const objectId = evaluated.result.objectId;
  expect(objectId, expression).toBeTruthy();
  try {
    const result = await cdp.send('DOM.getContentQuads', { objectId });
    expect(result.quads.length, expression).toBeGreaterThan(0);
    return result.quads[0];
  } finally {
    await cdp.send('Runtime.releaseObject', { objectId });
  }
}

async function auditStaticCypress(page, mode) {
  await page.locator('#track-select').selectOption('cypress-run');
  const result = await page.evaluate(async ({ anchors, headings }) => {
    const stage = document.querySelector('#map-stage');
    const art = document.querySelector('#cypress-run-art');
    const layer = document.querySelector('#vehicle-layer');
    const source = layer.querySelector('.vehicle-anchor');
    while (layer.querySelectorAll('.vehicle-anchor').length < 16) {
      const clone = source.cloneNode(true);
      layer.append(clone);
    }
    const wrappers = [...layer.querySelectorAll('.vehicle-anchor')].slice(0, 16);
    wrappers.forEach((wrapper, index) => {
      const anchor = anchors[index];
      wrapper.dataset.routeSlot = String(index);
      wrapper.dataset.sessionId = `item-4-static-${index}`;
      wrapper.style.setProperty('--vehicle-x', `${anchor.x / 10}%`);
      wrapper.style.setProperty('--vehicle-y', `${anchor.y / 7.6}%`);
      wrapper.style.setProperty('--route-heading', `${headings[index].heading}deg`);
      wrapper.style.setProperty(
        '--route-upright-heading',
        `${headings[index].uprightHeading}deg`,
      );
      wrapper.style.setProperty('--drift-yaw', '0deg');
      wrapper.style.setProperty('--drift-upright-yaw', '0deg');
      wrapper.querySelector('.session-car').dataset.sessionId = `item-4-static-${index}`;
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const stageBox = stage.getBoundingClientRect();
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left, right: value.right, top: value.top, bottom: value.bottom,
        width: value.width, height: value.height,
        x: value.left + value.width / 2, y: value.top + value.height / 2,
      };
    };
    const edge = (box, inset = 0) => Math.min(
      box.left - inset - stageBox.left,
      stageBox.right - (box.right + inset),
      box.top - inset - stageBox.top,
      stageBox.bottom - (box.bottom + inset),
    );
    const angleOf = (element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    };
    const samples = [];
    for (const [index, wrapper] of wrappers.entries()) {
      const button = wrapper.querySelector('.session-car');
      button.focus({ preventScroll: true });
      const target = rect(button);
      const body = rect(wrapper.querySelector('.car-body'));
      const expected = new DOMPoint(anchors[index].x, anchors[index].y)
        .matrixTransform(art.getScreenCTM());
      const atmosphere = wrapper.querySelector('.car-atmosphere');
      samples.push({
        id: anchors[index].id,
        target,
        body,
        stage: {
          left: stageBox.left, right: stageBox.right,
          top: stageBox.top, bottom: stageBox.bottom,
        },
        targetClearance: edge(target),
        focusClearance: edge(target, 3),
        bodyStageClearance: edge(body),
        alignment: Math.hypot(target.x - expected.x, target.y - expected.y),
        heading: angleOf(wrapper.querySelector('.car-angle')),
        expectedHeading: Number(headings[index].heading),
        glyphNet: angleOf(wrapper.querySelector('.car-angle'))
          + angleOf(wrapper.querySelector('.car-motion'))
          + angleOf(wrapper.querySelector('.car-glyph')),
        codeNet: angleOf(wrapper.querySelector('.car-angle'))
          + angleOf(wrapper.querySelector('.car-motion'))
          + angleOf(wrapper.querySelector('.car-code')),
        routeAnimation: getComputedStyle(wrapper).animationName,
        driftAnimation: getComputedStyle(wrapper.querySelector('.car-motion')).animationName,
        smokeAnimations: ['::before', '::after'].map((pseudo) => (
          getComputedStyle(atmosphere, pseudo).animationName
        )),
        smokeOpacity: ['::before', '::after'].map((pseudo) => (
          Number(getComputedStyle(atmosphere, pseudo).opacity)
        )),
      });
    }
    let minimumSeparation = Infinity;
    let targetOverlaps = 0;
    let bodyOverlaps = 0;
    for (let first = 0; first < samples.length; first += 1) {
      for (let second = first + 1; second < samples.length; second += 1) {
        minimumSeparation = Math.min(minimumSeparation, Math.hypot(
          samples[first].target.x - samples[second].target.x,
          samples[first].target.y - samples[second].target.y,
        ));
        const overlaps = (left, right) => (
          Math.min(left.right, right.right) - Math.max(left.left, right.left) > 0.01
          && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 0.01
        );
        if (overlaps(samples[first].target, samples[second].target)) targetOverlaps += 1;
        if (overlaps(samples[first].body, samples[second].body)) bodyOverlaps += 1;
      }
    }
    return {
      samples,
      minimumSeparation,
      targetOverlaps,
      bodyOverlaps,
      minimumTarget: samples.reduce((best, item) => (
        item.targetClearance < best.targetClearance ? item : best
      )),
      minimumFocus: samples.reduce((best, item) => (
        item.focusClearance < best.focusClearance ? item : best
      )),
    };
  }, {
    anchors: CYPRESS_TRACK.routeAnchors,
    headings: CYPRESS_MOBILE_HEADINGS,
  });

  expect(result.samples).toHaveLength(16);
  expect(result.minimumTarget.targetClearance, `${mode}/${result.minimumTarget.id}`)
    .toBeGreaterThanOrEqual(12);
  expect(result.minimumFocus.focusClearance, `${mode}/${result.minimumFocus.id}`)
    .toBeGreaterThanOrEqual(9);
  expect(result.minimumSeparation, mode).toBeGreaterThanOrEqual(44);
  expect(result.targetOverlaps, mode).toBe(0);
  expect(result.bodyOverlaps, mode).toBe(0);
  for (const sample of result.samples) {
    expect(sample.target.width, `${mode}/${sample.id} width`).toBeCloseTo(44, 1);
    expect(sample.target.height, `${mode}/${sample.id} height`).toBeCloseTo(44, 1);
    expect(sample.bodyStageClearance, JSON.stringify({
      mode,
      id: sample.id,
      body: sample.body,
      stage: sample.stage,
    })).toBeGreaterThanOrEqual(-0.01);
    expect(sample.alignment, `${mode}/${sample.id} CTM anchor`).toBeLessThanOrEqual(0.1);
    expect(angleDistance(sample.heading, sample.expectedHeading),
      `${mode}/${sample.id} heading`).toBeLessThanOrEqual(0.25);
    expect(angleDistance(sample.glyphNet, 0), `${mode}/${sample.id} glyph`)
      .toBeLessThanOrEqual(0.25);
    expect(angleDistance(sample.codeNet, 0), `${mode}/${sample.id} code`)
      .toBeLessThanOrEqual(0.25);
    expect(sample.routeAnimation, `${mode}/${sample.id} route`).toBe('none');
    expect(sample.driftAnimation, `${mode}/${sample.id} drift`).toBe('none');
    expect(sample.smokeAnimations, `${mode}/${sample.id} smoke`).toEqual(['none', 'none']);
    expect(sample.smokeOpacity.every((opacity) => opacity === 0),
      `${mode}/${sample.id} smoke opacity`).toBe(true);
  }
  return result;
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

  for (const course of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
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

test('native course selection exposes and switches all three stable courses', async ({ page }) => {
  const selector = page.locator('#track-select');
  await expect(selector.locator('option')).toHaveCount(4);
  await selector.selectOption('cypress-run');
  await expect(page.locator('#dashboard-root')).toHaveAttribute('data-track-id', 'cypress-run');
  await expect(page.locator('#map-heading')).toHaveText('Cypress Run');
  await expect(page.locator('#track-status')).toHaveText('Active course: Cypress Run · Manual');

  await selector.selectOption('lantern-coil');
  await expect(page.locator('#dashboard-root')).toHaveAttribute('data-track-id', 'lantern-coil');
  await expect(page.locator('#map-heading')).toHaveText('Lantern Coil');
  await expect(page.locator('#track-status')).toHaveText('Active course: Lantern Coil · Manual');

  await selector.selectOption('ridge-pass');
  await expect(page.locator('#dashboard-root')).toHaveAttribute('data-track-id', 'ridge-pass');
  await expect(page.locator('#map-heading')).toHaveText('Ridge Pass');
  await expect(page.locator('#track-status')).toHaveText('Active course: Ridge Pass · Manual');
});

test('layout boundaries preserve all course targets, controls, and transform isolation', async ({
  page,
}) => {
  if (page.viewportSize().width < 1000) return;
  for (const width of [759, 760, 959, 960]) {
    await page.setViewportSize({ width, height: 900 });
    for (const trackId of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
      await page.locator('#track-select').selectOption(trackId);
      const result = await page.evaluate((selected) => {
        const stage = document.querySelector('#map-stage').getBoundingClientRect();
        const selector = document.querySelector('#track-select').getBoundingClientRect();
        const status = document.querySelector('#track-status').getBoundingClientRect();
        const targets = [...document.querySelectorAll('.vehicle-anchor .session-car')]
          .map((element) => element.getBoundingClientRect());
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          clipped: targets.filter((box) => box.left < stage.left - 0.5
            || box.right > stage.right + 0.5 || box.top < stage.top - 0.5
            || box.bottom > stage.bottom + 0.5).length,
          overlap: !(selector.right <= status.left || status.right <= selector.left
            || selector.bottom <= status.top || status.bottom <= selector.top),
          visibleArt: [...document.querySelectorAll('.course-art')]
            .filter((element) => getComputedStyle(element).display !== 'none')
            .map((element) => element.dataset.trackArt),
          layerTransform: getComputedStyle(document.querySelector('#vehicle-layer')).transform,
          selected,
        };
      }, trackId);
      expect(result.overflow, `${width}/${trackId}`).toBe(0);
      expect(result.clipped, `${width}/${trackId}`).toBe(0);
      expect(result.overlap, `${width}/${trackId}`).toBe(false);
      expect(result.visibleArt, `${width}/${trackId}`).toEqual([trackId]);
      expect(result.layerTransform === 'none', `${width}/${trackId}`).toBe(
        !(width <= 759 && trackId === 'cypress-run'),
      );
    }
  }
});

test('prepares the neutral Lantern Coil reference for this viewport', async ({ page }) => {
  await page.locator('#track-select').selectOption('lantern-coil');
  await page.evaluate(async () => {
    for (const animation of document.getAnimations({ subtree: true })) {
      animation.pause();
      await animation.ready;
      animation.currentTime = animation.animationName?.includes('traverse')
        ? 16000
        : animation.effect?.getTiming().duration * 0.4 || 0;
    }
    document.activeElement?.blur();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  if (UPDATE_SCREENSHOTS) {
    const mobile = page.viewportSize().width === 390;
    await page.screenshot({
      path: `tests/screenshots/${mobile ? 'mobile' : 'desktop'}-lantern-coil.png`,
      fullPage: mobile,
    });
  }
});

test('fresh synthetic live mode preserves all three course identities and controls', async ({
  page,
}) => {
  const payload = browserFixturePayloads().valid;
  await page.locator('#snapshot-file').setInputFiles({
    name: 'lantern-live.json',
    mimeType: 'application/json',
    buffer: Buffer.from(`${JSON.stringify(payload)}\n`),
  });
  await expect(page.locator('#source-label')).toHaveText('Live · one-shot tmux observation');
  // 1 active (route) + 5 non-active (pit, well under the 18-car pit capacity so none overflow).
  await expect(page.locator('.session-car')).toHaveCount(6);
  for (const trackId of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
    await page.locator('#track-select').selectOption(trackId);
    await expect(page.locator('#dashboard-root')).toHaveAttribute('data-track-id', trackId);
    await expect(page.locator('#source-label')).toHaveText('Live · one-shot tmux observation');
    await expect(page.locator('.session-car')).toHaveCount(6);
  }
});

test('Lantern Coil audits every retained frame and sixteen static route slots', async ({ page }) => {
  test.setTimeout(120_000);
  const profileName = page.viewportSize().width <= 759 ? 'mobile' : 'desktop';
  const schedule = TRACK_SCHEDULES.get('lantern-coil')[profileName];
  await page.locator('#track-select').selectOption('lantern-coil');
  const sweep = await page.evaluate(async (frames) => {
    const stage = document.querySelector('#map-stage').getBoundingClientRect();
    const wrappers = [...document.querySelectorAll('.vehicle-anchor')];
    const animations = wrappers.map((wrapper) => wrapper.getAnimations().find((animation) => (
      animation.animationName?.includes('lantern-coil-traverse')
    )));
    animations.forEach((animation) => animation.pause());
    let minimumEdge = Infinity;
    let minimumSeparation = Infinity;
    let clipped = 0;
    let overlaps = 0;
    for (const frame of frames) {
      animations.forEach((animation) => { animation.currentTime = Number(frame.percent) / 100 * 64000; });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const visible = wrappers.filter((wrapper) => Number(getComputedStyle(wrapper).opacity) > 0.5)
        .map((wrapper) => wrapper.querySelector('.session-car').getBoundingClientRect());
      visible.forEach((box) => {
        const edge = Math.min(
          box.left - stage.left, stage.right - box.right,
          box.top - stage.top, stage.bottom - box.bottom,
        );
        minimumEdge = Math.min(minimumEdge, edge);
        if (edge < -0.5) clipped += 1;
      });
      for (let first = 0; first < visible.length; first += 1) {
        for (let second = first + 1; second < visible.length; second += 1) {
          const a = visible[first];
          const b = visible[second];
          const separation = Math.hypot(
            a.x + a.width / 2 - b.x - b.width / 2,
            a.y + a.height / 2 - b.y - b.height / 2,
          );
          minimumSeparation = Math.min(minimumSeparation, separation);
          if (separation < Math.max(a.width, b.width) - 0.5) overlaps += 1;
        }
      }
    }
    return { minimumEdge, minimumSeparation, clipped, overlaps };
  }, schedule.frames);
  expect(sweep.clipped).toBe(0);
  expect(sweep.overlaps).toBe(0);
  expect(sweep.minimumEdge).toBeGreaterThanOrEqual(-0.5);
  expect(sweep.minimumSeparation).toBeGreaterThanOrEqual(profileName === 'mobile' ? 44 : 52);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const capacity = await page.evaluate(async ({ anchors, headings }) => {
    const layer = document.querySelector('#vehicle-layer');
    const source = layer.querySelector('.vehicle-anchor');
    while (layer.querySelectorAll('.vehicle-anchor').length < 16) layer.append(source.cloneNode(true));
    const wrappers = [...layer.querySelectorAll('.vehicle-anchor')].slice(0, 16);
    wrappers.forEach((wrapper, index) => {
      wrapper.dataset.routeSlot = String(index);
      wrapper.style.setProperty('--vehicle-x', `${anchors[index].x / 10}%`);
      wrapper.style.setProperty('--vehicle-y', `${anchors[index].y / 7.6}%`);
      wrapper.style.setProperty('--route-heading', `${headings[index].heading}deg`);
      wrapper.style.setProperty('--route-upright-heading', `${headings[index].uprightHeading}deg`);
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const stage = document.querySelector('#map-stage').getBoundingClientRect();
    const boxes = wrappers.map((wrapper) => wrapper.querySelector('.session-car').getBoundingClientRect());
    const edges = boxes.map((box) => Math.min(
      box.left - stage.left, stage.right - box.right,
      box.top - stage.top, stage.bottom - box.bottom,
    ));
    let separation = Infinity;
    for (let first = 0; first < boxes.length; first += 1) {
      for (let second = first + 1; second < boxes.length; second += 1) {
        separation = Math.min(separation, Math.hypot(
          boxes[first].x + boxes[first].width / 2 - boxes[second].x - boxes[second].width / 2,
          boxes[first].y + boxes[first].height / 2 - boxes[second].y - boxes[second].height / 2,
        ));
      }
    }
    return { minimumEdge: Math.min(...edges), separation, count: boxes.length };
  }, {
    anchors: getTrack('lantern-coil').routeAnchors,
    headings: TRACK_SCHEDULES.get('lantern-coil')[`${profileName}StaticHeadings`],
  });
  expect(capacity.count).toBe(16);
  expect(capacity.minimumEdge).toBeGreaterThanOrEqual(-0.5);
  expect(capacity.separation).toBeGreaterThanOrEqual(profileName === 'mobile' ? 44 : 52);
  test.info().annotations.push({
    type: 'lantern-clearance',
    description: JSON.stringify({ profileName, sweep, capacity }),
  });
});

test('mobile Cypress scale switches without replacing focused pinned route controls', async ({
  page,
}) => {
  if (page.viewportSize().width > 759) return;
  const selector = page.locator('#track-select');
  await selector.selectOption('cypress-run');
  const wrapper = page.locator('.vehicle-anchor.state-active').first();
  const button = wrapper.locator('.session-car');
  const identity = await button.getAttribute('data-session-id');
  await button.focus();
  await button.press('Enter');
  await expect(wrapper).toHaveAttribute('data-pinned', 'true');
  await expect(wrapper.locator('.session-tooltip')).toBeVisible();
  await expect(button).toBeFocused();
  const cypressTransforms = await page.evaluate(() => ({
    art: getComputedStyle(document.querySelector('#cypress-run-art')).transform,
    layer: getComputedStyle(document.querySelector('#vehicle-layer')).transform,
    wrapper: getComputedStyle(document.querySelector('.vehicle-anchor.state-active')).transform,
  }));
  expect(cypressTransforms.art).not.toBe('none');
  expect(cypressTransforms.layer).not.toBe('none');
  expect(cypressTransforms.wrapper).toContain('1.06383');

  await selector.selectOption('ridge-pass');
  await expect(button).toBeFocused();
  await expect(wrapper).toHaveAttribute('data-pinned', 'true');
  await expect(wrapper.locator('.session-tooltip')).toBeVisible();
  await expect(button).toHaveAttribute('data-session-id', identity);
  const ridgeTransforms = await page.evaluate(() => ({
    art: getComputedStyle(document.querySelector('#ridge-pass-art')).transform,
    layer: getComputedStyle(document.querySelector('#vehicle-layer')).transform,
    wrapper: getComputedStyle(document.querySelector('.vehicle-anchor.state-active')).transform,
  }));
  expect(ridgeTransforms.art).toBe('none');
  expect(ridgeTransforms.layer).toBe('none');
  expect(ridgeTransforms.wrapper).not.toContain('1.06383');

  await selector.selectOption('cypress-run');
  await expect(button).toBeFocused();
  await expect(wrapper).toHaveAttribute('data-pinned', 'true');
  await expect(wrapper.locator('.session-tooltip')).toBeVisible();
  await expect(button).toHaveAttribute('data-session-id', identity);
  await page.keyboard.press('Escape');
  await expect(wrapper).not.toHaveAttribute('data-pinned', 'true');
});

test('generated geometry hydrates and responsive animation cascade stays exact', async ({ page }) => {
  const mobile = page.viewportSize().width <= 759;
  for (const course of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
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
  test.setTimeout(120_000);
  for (const course of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
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
        const transformed = new DOMPoint(point.x, point.y).matrixTransform(
          centerline.getScreenCTM(),
        );
        return {
          x: transformed.x,
          y: transformed.y,
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

test('Cypress mobile retained frames keep every phased target clear and CTM-aligned', async ({
  page,
}) => {
  test.setTimeout(120_000);
  if (page.viewportSize().width > 759) return;
  await page.locator('#track-select').selectOption('cypress-run');
  const frames = TRACK_SCHEDULES.get('cypress-run').mobile.frames;
  const result = await page.evaluate(async (serializedFrames) => {
    const stage = document.querySelector('#map-stage');
    const centerline = document.querySelector('#cypress-run-centerline');
    const wrappers = [...document.querySelectorAll(
      '.vehicle-anchor.state-active, .vehicle-anchor.state-thinking',
    )];
    const stageRect = () => stage.getBoundingClientRect();
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left, right: value.right, top: value.top, bottom: value.bottom,
        width: value.width, height: value.height,
        x: value.left + value.width / 2,
        y: value.top + value.height / 2,
      };
    };
    const overlap = (first, second) => (
      Math.min(first.right, second.right) - Math.max(first.left, second.left) > 0.01
      && Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 0.01
    );
    const edgeClearance = (target, stageBox) => {
      const edges = {
        left: target.left - stageBox.left,
        right: stageBox.right - target.right,
        top: target.top - stageBox.top,
        bottom: stageBox.bottom - target.bottom,
      };
      const edge = Object.entries(edges).reduce((best, item) => (
        item[1] < best[1] ? item : best
      ));
      return { edge: edge[0], value: edge[1], edges };
    };
    const timeline = [
      ...serializedFrames.map((frame) => ({
        percent: Number(frame.percent),
        left: Number(frame.left),
        top: Number(frame.top),
      })),
      {
        percent: 99.2,
        left: Number(serializedFrames.at(-1).left),
        top: Number(serializedFrames.at(-1).top),
      },
      {
        percent: 99.6,
        left: Number(serializedFrames[0].left),
        top: Number(serializedFrames[0].top),
      },
      {
        percent: 100,
        left: Number(serializedFrames[0].left),
        top: Number(serializedFrames[0].top),
      },
    ];
    const scheduledPoint = (percent) => {
      let right = timeline.findIndex((frame) => frame.percent >= percent);
      if (right <= 0) right = 1;
      const before = timeline[right - 1];
      const after = timeline[right];
      const mix = after.percent === before.percent
        ? 0
        : (percent - before.percent) / (after.percent - before.percent);
      const source = new DOMPoint(
        (before.left + (after.left - before.left) * mix) * 10,
        (before.top + (after.top - before.top) * mix) * 7.6,
      );
      return source.matrixTransform(centerline.getScreenCTM());
    };
    const routeLength = centerline.getTotalLength();
    const routeCtm = centerline.getScreenCTM();
    const routePoint = (distanceAlong) => {
      const point = centerline.getPointAtLength(distanceAlong);
      return new DOMPoint(point.x, point.y).matrixTransform(routeCtm);
    };
    const coarseDivisions = 2048;
    const coarseRoute = Array.from({ length: coarseDivisions + 1 }, (_, index) => ({
      distanceAlong: routeLength * index / coarseDivisions,
      point: routePoint(routeLength * index / coarseDivisions),
    }));
    const nearestRouteDistance = (x, y) => {
      let winningIndex = 0;
      let winningSquaredDistance = Infinity;
      for (const [index, candidate] of coarseRoute.entries()) {
        const deltaX = x - candidate.point.x;
        const deltaY = y - candidate.point.y;
        const squaredDistance = deltaX * deltaX + deltaY * deltaY;
        if (squaredDistance < winningSquaredDistance) {
          winningIndex = index;
          winningSquaredDistance = squaredDistance;
        }
      }
      let low = coarseRoute[Math.max(0, winningIndex - 1)].distanceAlong;
      let high = coarseRoute[Math.min(coarseDivisions, winningIndex + 1)].distanceAlong;
      for (let iteration = 0; iteration < 18; iteration += 1) {
        const first = low + (high - low) / 3;
        const second = high - (high - low) / 3;
        const a = routePoint(first);
        const b = routePoint(second);
        if (Math.hypot(x - a.x, y - a.y) < Math.hypot(x - b.x, y - b.y)) high = second;
        else low = first;
      }
      const point = routePoint((low + high) / 2);
      return Math.hypot(x - point.x, y - point.y);
    };
    let minimumClearance = { value: Infinity };
    let minimumSeparation = { value: Infinity };
    let maximumScheduledError = { value: 0 };
    let maximumRouteError = { value: 0 };
    const targetClipping = { count: 0, first: null };
    const bodyClipping = { count: 0, first: null };
    const targetOverlaps = { count: 0, first: null };
    const bodyOverlaps = { count: 0, first: null };

    for (const [frameIndex, emitted] of serializedFrames.entries()) {
      for (const wrapper of wrappers) {
        const animation = wrapper.getAnimations().find((item) => (
          (item.animationName ?? '').includes('traverse')
        ));
        animation.pause();
        animation.currentTime = Number(emitted.percent) / 100 * 64000;
      }
      const stageBox = stageRect();
      const visible = wrappers.map((wrapper) => {
        const target = rect(wrapper.querySelector('.session-car'));
        const body = rect(wrapper.querySelector('.car-body'));
        const animation = wrapper.getAnimations().find((item) => (
          (item.animationName ?? '').includes('traverse')
        ));
        const progress = animation.effect.getComputedTiming().progress;
        return {
          wrapper,
          slot: Number(wrapper.dataset.routeSlot),
          opacity: Number(getComputedStyle(wrapper).opacity),
          percent: progress === null ? null : progress * 100,
          target,
          body,
        };
      }).filter((item) => item.opacity > 0.001 && item.percent !== null);

      for (const item of visible) {
        const scheduled = scheduledPoint(item.percent);
        const scheduledError = Math.hypot(
          item.target.x - scheduled.x,
          item.target.y - scheduled.y,
        );
        const routeError = nearestRouteDistance(item.target.x, item.target.y);
        if (scheduledError > maximumScheduledError.value) {
          maximumScheduledError = {
            value: scheduledError, frameIndex, emitted: emitted.percent,
            slot: item.slot, percent: item.percent, target: item.target,
          };
        }
        if (routeError > maximumRouteError.value) {
          maximumRouteError = {
            value: routeError, frameIndex, emitted: emitted.percent,
            slot: item.slot, percent: item.percent, target: item.target,
          };
        }
        if (item.slot === 0) {
          const clearance = edgeClearance(item.target, stageBox);
          if (clearance.value < minimumClearance.value) {
            minimumClearance = {
              ...clearance, frameIndex, emitted: emitted.percent,
              slot: item.slot, percent: item.percent, target: item.target, stage: stageBox.toJSON(),
            };
          }
        }
        if (item.target.left < stageBox.left - 0.01
          || item.target.right > stageBox.right + 0.01
          || item.target.top < stageBox.top - 0.01
          || item.target.bottom > stageBox.bottom + 0.01) {
          targetClipping.count += 1;
          targetClipping.first ??= {
            frameIndex, emitted: emitted.percent, slot: item.slot,
            percent: item.percent, target: item.target, stage: stageBox.toJSON(),
          };
        }
        if (item.body.left < stageBox.left - 0.01
          || item.body.right > stageBox.right + 0.01
          || item.body.top < stageBox.top - 0.01
          || item.body.bottom > stageBox.bottom + 0.01) {
          bodyClipping.count += 1;
          bodyClipping.first ??= {
            frameIndex, emitted: emitted.percent, slot: item.slot,
            percent: item.percent, body: item.body, stage: stageBox.toJSON(),
          };
        }
      }
      for (let first = 0; first < visible.length; first += 1) {
        for (let second = first + 1; second < visible.length; second += 1) {
          const separation = Math.hypot(
            visible[first].target.x - visible[second].target.x,
            visible[first].target.y - visible[second].target.y,
          );
          if (separation < minimumSeparation.value) {
            minimumSeparation = {
              value: separation, frameIndex, emitted: emitted.percent,
              pair: [visible[first].slot, visible[second].slot],
              rectangles: [visible[first].target, visible[second].target],
            };
          }
          if (overlap(visible[first].target, visible[second].target)) {
            targetOverlaps.count += 1;
            targetOverlaps.first ??= {
              frameIndex, emitted: emitted.percent,
              pair: [visible[first].slot, visible[second].slot],
              rectangles: [visible[first].target, visible[second].target],
            };
          }
          if (overlap(visible[first].body, visible[second].body)) {
            bodyOverlaps.count += 1;
            bodyOverlaps.first ??= {
              frameIndex, emitted: emitted.percent,
              pair: [visible[first].slot, visible[second].slot],
              rectangles: [visible[first].body, visible[second].body],
            };
          }
        }
      }
    }
    return {
      frameCount: serializedFrames.length,
      minimumClearance,
      minimumFocusClearance: minimumClearance.value - 3,
      minimumSeparation,
      maximumScheduledError,
      maximumRouteError,
      targetClipping,
      bodyClipping,
      targetOverlaps,
      bodyOverlaps,
      documentOverflow: document.documentElement.scrollWidth
        - document.documentElement.clientWidth,
    };
  }, frames);

  expect(result.frameCount).toBe(533);
  expect(result.minimumClearance.value, JSON.stringify(result.minimumClearance))
    .toBeGreaterThanOrEqual(12);
  expect(result.minimumFocusClearance, JSON.stringify(result.minimumClearance))
    .toBeGreaterThanOrEqual(9);
  expect(result.minimumSeparation.value, JSON.stringify(result.minimumSeparation))
    .toBeGreaterThanOrEqual(44);
  expect(result.maximumScheduledError.value, JSON.stringify(result.maximumScheduledError))
    .toBeLessThanOrEqual(0.1);
  expect(result.maximumRouteError.value, JSON.stringify(result.maximumRouteError))
    .toBeLessThanOrEqual(1);
  expect(result.targetClipping.count, JSON.stringify(result.targetClipping.first)).toBe(0);
  expect(result.bodyClipping.count, JSON.stringify(result.bodyClipping.first)).toBe(0);
  expect(result.targetOverlaps.count, JSON.stringify(result.targetOverlaps.first)).toBe(0);
  expect(result.bodyOverlaps.count, JSON.stringify(result.bodyOverlaps.first)).toBe(0);
  expect(result.documentOverflow).toBe(0);
  test.info().annotations.push({
    type: 'item-4-measurement',
    description: JSON.stringify({
      minimumClearance: result.minimumClearance,
      minimumSeparation: result.minimumSeparation,
      maximumScheduledError: result.maximumScheduledError,
      maximumRouteError: result.maximumRouteError,
    }),
  });
});

test('Cypress mobile counter-transform preserves content quads, focus, puff, and stacking', async ({
  page,
}) => {
  if (page.viewportSize().width > 759) return;
  await page.locator('#track-select').selectOption('cypress-run');
  const wrapper = page.locator('.vehicle-anchor.state-thinking').first();
  const button = wrapper.locator('.session-car');
  await wrapper.evaluate(async (element) => {
    const route = element.getAnimations().find((item) => (
      (item.animationName ?? '').includes('traverse')
    ));
    route.pause();
    route.currentTime = 16000;
    for (const animation of element.querySelector('.car-atmosphere')
      .getAnimations({ subtree: true })) {
      animation.pause();
      animation.effect.updateTiming({ delay: 0 });
      animation.currentTime = animation.effect.getTiming().duration * 0.4;
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await button.focus();
  await button.press('Enter');
  await expect(wrapper).toHaveAttribute('data-pinned', 'true');
  await expect(wrapper.locator('.session-tooltip')).toBeVisible();

  const cdp = await page.context().newCDPSession(page);
  const expressions = {
    wrapper: 'document.querySelector(".vehicle-anchor.state-thinking")',
    body: 'document.querySelector(".vehicle-anchor.state-thinking .car-body")',
    glyph: 'document.querySelector(".vehicle-anchor.state-thinking .car-glyph")',
    code: 'document.querySelector(".vehicle-anchor.state-thinking .car-code")',
    tooltip: 'document.querySelector(".vehicle-anchor.state-thinking .session-tooltip")',
  };
  const capture = async () => {
    const quads = {};
    for (const [name, expression] of Object.entries(expressions)) {
      quads[name] = await contentQuad(cdp, expression);
    }
    const pseudo = await wrapper.evaluate((element) => {
      const atmosphere = element.querySelector('.car-atmosphere');
      const pseudoStyle = getComputedStyle(atmosphere, '::before');
      const matrices = [
        getComputedStyle(document.querySelector('#vehicle-layer')).transform,
        getComputedStyle(element).transform,
        getComputedStyle(atmosphere).transform,
        pseudoStyle.transform,
      ].map((value) => new DOMMatrixReadOnly(value === 'none' ? undefined : value));
      const product = matrices.reduce((value, matrix) => value.multiply(matrix));
      const width = Number.parseFloat(pseudoStyle.width);
      const height = Number.parseFloat(pseudoStyle.height);
      const corners = [
        new DOMPoint(0, 0), new DOMPoint(width, 0),
        new DOMPoint(width, height), new DOMPoint(0, height),
      ].map((point) => point.matrixTransform(product));
      const edges = corners.map((point, index) => {
        const next = corners[(index + 1) % corners.length];
        return Math.hypot(next.x - point.x, next.y - point.y);
      });
      return {
        edges,
        scale: [Math.hypot(product.a, product.b), Math.hypot(product.c, product.d)],
        opacity: Number(pseudoStyle.opacity),
        pointerEvents: pseudoStyle.pointerEvents,
        playState: atmosphere.getAnimations({ subtree: true }).find((item) => (
          item.effect.pseudoElement === '::before'
        ))?.playState,
      };
    });
    const stacking = await wrapper.evaluate((element) => {
      const focus = getComputedStyle(element, '::after');
      return {
        layerTransform: getComputedStyle(document.querySelector('#vehicle-layer')).transform,
        wrapperTransform: getComputedStyle(element).transform,
        wrapperSize: [
          element.getBoundingClientRect().width,
          element.getBoundingClientRect().height,
        ],
        buttonSize: [
          element.querySelector('.session-car').getBoundingClientRect().width,
          element.querySelector('.session-car').getBoundingClientRect().height,
        ],
        focus: {
          insetTop: Number.parseFloat(focus.top),
          insetRight: Number.parseFloat(focus.right),
          insetBottom: Number.parseFloat(focus.bottom),
          insetLeft: Number.parseFloat(focus.left),
          borderTop: Number.parseFloat(focus.borderTopWidth),
          borderRight: Number.parseFloat(focus.borderRightWidth),
          borderBottom: Number.parseFloat(focus.borderBottomWidth),
          borderLeft: Number.parseFloat(focus.borderLeftWidth),
        },
        wrapperZ: getComputedStyle(element).zIndex,
        tooltipZ: getComputedStyle(element.querySelector('.session-tooltip')).zIndex,
        overflowZ: getComputedStyle(document.querySelector('#overflow-notice')).zIndex,
        hit: element.querySelector('.session-car').contains(document.elementFromPoint(
          element.getBoundingClientRect().x + element.getBoundingClientRect().width / 2,
          element.getBoundingClientRect().y + element.getBoundingClientRect().height / 2,
        )),
      };
    });
    return { quads, pseudo, stacking };
  };

  const transformed = await capture();
  await page.addStyleTag({
    content: `
      .dashboard-root[data-track-id="cypress-run"] #cypress-run-art,
      .dashboard-root[data-track-id="cypress-run"] #vehicle-layer {
        transform: none !important;
      }
      .dashboard-root[data-track-id="cypress-run"] .vehicle-anchor {
        transform: translate(-50%, -50%) !important;
      }
    `,
  });
  const unscaled = await capture();
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: 'item-4-quads' });

  for (const name of ['body', 'glyph', 'code', 'tooltip']) {
    const actual = quadEdgeLengths(transformed.quads[name]);
    const baseline = quadEdgeLengths(unscaled.quads[name]);
    actual.forEach((edge, index) => {
      expect(Math.abs(edge - baseline[index]), `${name} edge ${index}`).toBeLessThanOrEqual(0.1);
    });
  }
  const wrapperEdges = quadEdgeLengths(transformed.quads.wrapper);
  wrapperEdges.forEach((edge) => expect(edge).toBeCloseTo(44, 1));
  for (const captureResult of [transformed, unscaled]) {
    const wrapperPoints = quadPoints(captureResult.quads.wrapper);
    expect(Math.abs(wrapperPoints[0].y - wrapperPoints[1].y)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(wrapperPoints[1].x - wrapperPoints[2].x)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(wrapperPoints[2].y - wrapperPoints[3].y)).toBeLessThanOrEqual(0.1);
    expect(Math.abs(wrapperPoints[3].x - wrapperPoints[0].x)).toBeLessThanOrEqual(0.1);
    expect(captureResult.stacking.focus).toEqual({
      insetTop: -3,
      insetRight: -3,
      insetBottom: -3,
      insetLeft: -3,
      borderTop: 3,
      borderRight: 3,
      borderBottom: 3,
      borderLeft: 3,
    });
  }
  const transformedFocus = focusExteriorQuad(
    transformed.quads.wrapper,
    transformed.stacking.focus,
  );
  const unscaledFocus = focusExteriorQuad(unscaled.quads.wrapper, unscaled.stacking.focus);
  const transformedFocusEdges = quadEdgeLengths(transformedFocus);
  const unscaledFocusEdges = quadEdgeLengths(unscaledFocus);
  transformedFocusEdges.forEach((edge, index) => {
    expect(Math.abs(edge - 50), `focus exterior edge ${index}`).toBeLessThanOrEqual(0.1);
    expect(Math.abs(edge - unscaledFocusEdges[index]),
      `focus exterior comparison edge ${index}`).toBeLessThanOrEqual(0.1);
  });
  const transformedFocusVertices = centeredQuadPoints(transformedFocus);
  const unscaledFocusVertices = centeredQuadPoints(unscaledFocus);
  transformedFocusVertices.forEach((vertex, index) => {
    expect(Math.abs(vertex.x - unscaledFocusVertices[index].x),
      `focus exterior vertex ${index} x`).toBeLessThanOrEqual(0.1);
    expect(Math.abs(vertex.y - unscaledFocusVertices[index].y),
      `focus exterior vertex ${index} y`).toBeLessThanOrEqual(0.1);
  });
  transformed.pseudo.edges.forEach((edge, index) => {
    expect(Math.abs(edge - unscaled.pseudo.edges[index])).toBeLessThanOrEqual(0.1);
  });
  transformed.pseudo.scale.forEach((scale, index) => {
    expect(Math.abs(scale - unscaled.pseudo.scale[index])).toBeLessThanOrEqual(0.1);
  });
  expect(transformed.pseudo.opacity).toBeCloseTo(0.08, 2);
  expect(transformed.pseudo.pointerEvents).toBe('none');
  expect(transformed.pseudo.playState).toBe('paused');
  transformed.stacking.wrapperSize.forEach((edge) => (
    expect(Math.abs(edge - 44)).toBeLessThanOrEqual(0.1)
  ));
  transformed.stacking.buttonSize.forEach((edge) => (
    expect(Math.abs(edge - 44)).toBeLessThanOrEqual(0.1)
  ));
  expect(transformed.stacking.wrapperZ).toBe('3');
  expect(transformed.stacking.tooltipZ).toBe('20');
  expect(transformed.stacking.overflowZ).toBe('12');
  expect(transformed.stacking.hit).toBe(true);
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
  for (const trackId of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
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

  for (const trackId of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
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

test('all sixteen Cypress mobile static anchors stay clear in reduced motion and fallback', async ({
  browser,
  page,
}) => {
  if (page.viewportSize().width > 759) return;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('#snapshot-summary')).toContainText('24 sessions');
  const reduced = await auditStaticCypress(page, 'reduced-motion');

  const context = await browser.newContext({ viewport: page.viewportSize() });
  const fallbackPage = await context.newPage();
  const diagnostics = watchBrowserDiagnostics(fallbackPage);
  await fallbackPage.addInitScript(() => {
    Object.defineProperty(CSS, 'registerProperty', {
      configurable: true,
      value: undefined,
    });
  });
  await fallbackPage.goto('http://127.0.0.1:43917/');
  await expect(fallbackPage.locator('#snapshot-summary')).toContainText('24 sessions');
  const fallback = await auditStaticCypress(fallbackPage, 'failed-capability');
  expect(diagnostics).toEqual([]);
  await context.close();

  for (const measured of [reduced, fallback]) {
    test.info().annotations.push({
      type: 'item-4-static-measurement',
      description: JSON.stringify({
        minimumTarget: {
          id: measured.minimumTarget.id,
          value: measured.minimumTarget.targetClearance,
        },
        minimumFocus: {
          id: measured.minimumFocus.id,
          value: measured.minimumFocus.focusClearance,
        },
        minimumSeparation: measured.minimumSeparation,
      }),
    });
  }
});

test('registered headings match every retained boundary, seven samples, and midpoint arcs', async ({
  page,
}) => {
  const profileName = page.viewportSize().width <= 759 ? 'mobile' : 'desktop';
  for (const trackId of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
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
  for (const trackId of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
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
  for (const trackId of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
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

test('every Cypress mobile corner landmark audits all visible phased cars', async ({ page }) => {
  if (page.viewportSize().width > 759) return;
  await page.locator('#track-select').selectOption('cypress-run');
  const schedule = TRACK_SCHEDULES.get('cypress-run').mobile;
  for (const [cornerIndex, corner] of schedule.corners.entries()) {
    for (const [phase, frameIndex] of Object.entries({
      entry: corner.entryFrameIndex,
      apex: corner.apexFrameIndex,
      exit: corner.exitFrameIndex,
    })) {
      const emitted = schedule.frames[frameIndex];
      await test.step(`corner ${cornerIndex + 1} ${phase}`, async () => {
        const measured = await page.evaluate(({ frames, percent }) => {
          const wrappers = [...document.querySelectorAll(
            '.vehicle-anchor.state-active, .vehicle-anchor.state-thinking',
          )];
          const timeline = [
            ...frames.map((frame) => ({
              percent: Number(frame.percent),
              yaw: Number(frame.driftYaw),
            })),
            { percent: 99.2, yaw: Number(frames.at(-1).driftYaw) },
            { percent: 99.6, yaw: Number(frames[0].driftYaw) },
            { percent: 100, yaw: Number(frames[0].driftYaw) },
          ];
          const expectedYaw = (value) => {
            let right = timeline.findIndex((frame) => frame.percent >= value);
            if (right <= 0) right = 1;
            const before = timeline[right - 1];
            const after = timeline[right];
            const mix = after.percent === before.percent
              ? 0
              : (value - before.percent) / (after.percent - before.percent);
            return before.yaw + (after.yaw - before.yaw) * mix;
          };
          const angle = (element) => {
            const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
            return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
          };
          for (const wrapper of wrappers) {
            const route = wrapper.getAnimations().find((item) => (
              (item.animationName ?? '').includes('traverse')
            ));
            route.pause();
            route.currentTime = percent / 100 * 64000;
          }
          return wrappers.map((wrapper) => {
            const route = wrapper.getAnimations().find((item) => (
              (item.animationName ?? '').includes('traverse')
            ));
            const progress = route.effect.getComputedTiming().progress;
            const style = getComputedStyle(wrapper);
            const motion = wrapper.querySelector('.car-motion');
            const total = angle(wrapper.querySelector('.car-angle')) + angle(motion);
            return {
              slot: Number(wrapper.dataset.routeSlot),
              opacity: Number(style.opacity),
              percent: progress === null ? null : progress * 100,
              yaw: Number.parseFloat(style.getPropertyValue('--drift-yaw')),
              inverse: Number.parseFloat(style.getPropertyValue('--drift-upright-yaw')),
              glyphNet: total + angle(wrapper.querySelector('.car-glyph')),
              codeNet: total + angle(wrapper.querySelector('.car-code')),
              buttonTransform: getComputedStyle(
                wrapper.querySelector('.session-car'),
              ).transform,
            };
          }).filter((item) => item.opacity > 0.001 && item.percent !== null)
            .map((item) => ({ ...item, expectedYaw: expectedYaw(item.percent) }));
        }, { frames: schedule.frames, percent: Number(emitted.percent) });
        expect(measured.length).toBeGreaterThan(0);
        for (const car of measured) {
          expect(angleDistance(car.yaw, car.expectedYaw),
            `corner ${cornerIndex + 1}/${phase}/slot ${car.slot} yaw`)
            .toBeLessThanOrEqual(0.25);
          expect(Math.abs(car.yaw + car.inverse)).toBeLessThanOrEqual(0.01);
          expect(angleDistance(car.glyphNet, 0)).toBeLessThanOrEqual(0.25);
          expect(angleDistance(car.codeNet, 0)).toBeLessThanOrEqual(0.25);
          expect(car.buttonTransform).toBe('none');
        }
        const landmarkCar = measured.find(({ slot }) => slot === 0);
        expect(landmarkCar).toBeTruthy();
        if (phase === 'apex') {
          expect(Math.sign(landmarkCar.yaw)).toBe(corner.sign);
          expect(Math.abs(landmarkCar.yaw)).toBeGreaterThanOrEqual(15);
          expect(Math.abs(landmarkCar.yaw)).toBeLessThanOrEqual(42);
        } else {
          expect(Math.abs(landmarkCar.yaw)).toBeLessThanOrEqual(0.01);
        }
      });
    }
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
  for (const trackId of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
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
