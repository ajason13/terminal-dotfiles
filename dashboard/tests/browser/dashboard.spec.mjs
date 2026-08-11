import { expect, test } from '@playwright/test';
import config from '../../routes/route-config.mjs';
import cypress from '../../routes/cypress-run.route.mjs';
import ridge from '../../routes/ridge-pass.route.mjs';
import { compileRoutes } from '../../scripts/lib/route-compiler.mjs';
import { getTrack } from '../../src/track-catalog.mjs';

const COMPILED = compileRoutes(config, [ridge, cypress], '0'.repeat(64));
const TRACK_SCHEDULES = new Map(COMPILED.schedules.map((item) => [item.route.id, item]));
const CYPRESS_TRACK = getTrack('cypress-run');
const CYPRESS_MOBILE_HEADINGS = TRACK_SCHEDULES.get('cypress-run').mobileStaticHeadings;
const BREAKPOINT_WIDTHS = [759, 760, 959, 960];
const BREAKPOINT_COURSES = ['ridge-pass', 'cypress-run'];
const ROUTE_LAP_MS = 64_000;
const NEUTRAL_REFERENCE_CASES = Object.freeze([
  Object.freeze({
    id: 'ridge-pass',
    title: 'Ridge Pass',
    references: Object.freeze({
      'desktop-chromium': Object.freeze(['desktop-ridge-pass.png', 'desktop.png']),
      'mobile-chromium': Object.freeze(['mobile-ridge-pass.png', 'mobile.png']),
    }),
  }),
  Object.freeze({
    id: 'cypress-run',
    title: 'Cypress Run',
    references: Object.freeze({
      'desktop-chromium': Object.freeze(['desktop-cypress-run.png']),
      'mobile-chromium': Object.freeze(['mobile-cypress-run.png']),
    }),
  }),
]);
const NEUTRAL_REFERENCE_VIEWPORTS = Object.freeze({
  'desktop-chromium': Object.freeze({ width: 1440, height: 900 }),
  'mobile-chromium': Object.freeze({ width: 390, height: 844 }),
});
const NEUTRAL_TRAVERSAL_MS = 16_000;
const NEUTRAL_SMOKE_FRACTION = 0.4;

function syntheticFixtureSnapshot() {
  return {
    schemaVersion: 1,
    generatedAt: '2026-08-07T12:00:00.000Z',
    sessions: Array.from({ length: 16 }, (_, index) => ({
      id: `breakpoint-fixture-${String(index + 1).padStart(2, '0')}`,
      displayName: `Breakpoint fixture ${String(index + 1).padStart(2, '0')}`,
      status: index % 2 === 0 ? 'active' : 'thinking',
      lastActivityAt: '2026-08-07T12:00:00.000Z',
      permissionState: 'not_required',
      progress: (index + 0.25) / 16,
      phase: 'Synthetic breakpoint geometry',
    })),
  };
}

function syntheticLiveSnapshot() {
  const observedAt = new Date().toISOString();
  return {
    schemaVersion: 2,
    source: { kind: 'tmux_oneshot', collectorVersion: '1.0.0' },
    observedAt,
    sessions: Array.from({ length: 16 }, (_, index) => ({
      id: `tmux-${index.toString(16).padStart(32, '0')}`,
      displayName: `Breakpoint live ${String(index + 1).padStart(2, '0')}`,
      status: index % 2 === 0 ? 'active' : 'thinking',
      activity: { kind: 'observed', at: observedAt },
      permissionState: 'unknown',
      confidence: 'medium',
      provenance: index % 2 === 0 ? 'tmux_title_working' : 'tmux_title_thinking',
    })),
  };
}

function phaseLattice(trackId, profileName) {
  // Every retained compiled frame is a global freeze point. At each point the
  // sixteen wrappers keep their production four-second negative delays, so the
  // one traversal covers the complete simultaneously phased route population.
  return TRACK_SCHEDULES.get(trackId)[profileName].frames.map((frame) => (
    Number(frame.percent) / 100 * ROUTE_LAP_MS
  ));
}

async function openBreakpointPage(browser, mode) {
  const context = await browser.newContext({
    viewport: { width: BREAKPOINT_WIDTHS[0], height: 900 },
    ...(mode === 'reduced-motion' ? { reducedMotion: 'reduce' } : {}),
  });
  if (mode === 'register-property-fallback') {
    await context.addInitScript(() => {
      Object.defineProperty(CSS, 'registerProperty', {
        configurable: true,
        value: undefined,
      });
    });
  }
  const fixture = syntheticFixtureSnapshot();
  await context.route('**/src/fixture-sessions.mjs', (route) => route.fulfill({
    contentType: 'text/javascript',
    body: `export const FIXTURE_SNAPSHOT = ${JSON.stringify(fixture)};`,
  }));
  const page = await context.newPage();
  const diagnostics = watchBrowserDiagnostics(page);
  await page.goto('http://127.0.0.1:43917/');
  await expect(page.locator('#snapshot-summary')).toContainText('16 sessions');
  await expect(page.locator('.vehicle-anchor')).toHaveCount(16);
  return { context, page, diagnostics };
}

async function freezeRouteAnimations(page, phaseMs) {
  await page.locator('.vehicle-anchor').evaluateAll((wrappers, time) => {
    for (const wrapper of wrappers) {
      const traversal = wrapper.getAnimations().find((animation) => (
        (animation.animationName ?? '').includes('traverse')
      ));
      if (traversal) {
        traversal.pause();
        traversal.currentTime = time;
      }
    }
  }, phaseMs);
}

async function breakpointLayout(page) {
  return page.evaluate(() => {
    const serialize = (value) => ({
      left: value.left, right: value.right, top: value.top, bottom: value.bottom,
      width: value.width, height: value.height,
    });
    const stage = document.querySelector('#map-stage').getBoundingClientRect();
    const targets = [...document.querySelectorAll('.vehicle-anchor')]
      .sort((left, right) => Number(left.dataset.routeSlot) - Number(right.dataset.routeSlot))
      .map((wrapper) => ({
        slot: Number(wrapper.dataset.routeSlot),
        target: serialize(wrapper.querySelector('.session-car').getBoundingClientRect()),
        opacity: Number(getComputedStyle(wrapper).opacity),
      }));
    return {
      stage: serialize(stage),
      targets,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
}

async function focusExpansions(page) {
  const wrappers = page.locator('.vehicle-anchor');
  const result = [];
  for (let index = 0; index < await wrappers.count(); index += 1) {
    const wrapper = wrappers.nth(index);
    const button = wrapper.locator('.session-car');
    await button.focus();
    // Programmatic focus can retain pointer modality. A non-activating key event
    // makes this the keyboard focus state whose complete exterior we are auditing.
    await button.press('Shift');
    result.push(await wrapper.evaluate((element) => {
      const buttonStyle = getComputedStyle(element.querySelector('.session-car'));
      const outline = parseFloat(buttonStyle.outlineWidth)
        + parseFloat(buttonStyle.outlineOffset);
      const pseudo = getComputedStyle(element, '::after');
      const pseudoInset = Math.max(...[
        pseudo.left, pseudo.right, pseudo.top, pseudo.bottom,
      ].map((value) => -parseFloat(value)).filter(Number.isFinite));
      return {
        slot: Number(element.dataset.routeSlot),
        expansion: buttonStyle.outlineStyle !== 'none' && Number.isFinite(outline)
          ? outline
          : Number.isFinite(pseudoInset) ? pseudoInset : 0,
      };
    }));
  }
  await page.locator('#track-select').focus();
  return result;
}

async function auditBreakpointGeometry(page, {
  width, course, sourceState, mode, phases,
}) {
  const expansions = new Map((await focusExpansions(page)).map((item) => (
    [item.slot, item.expansion]
  )));
  expect([...expansions.values()].every((value) => value > 0),
    `${width}/${course}/${sourceState}/${mode} visible focus exterior ${JSON.stringify([...expansions])}`)
    .toBe(true);
  const result = await page.evaluate(async ({ auditPhases, focusBySlot }) => {
    const expansionsBySlot = new Map(focusBySlot);
    const wrappers = [...document.querySelectorAll('.vehicle-anchor')];
    const traversals = wrappers.map((wrapper) => wrapper.getAnimations().find((animation) => (
      (animation.animationName ?? '').includes('traverse')
    )));
    const rect = (element) => {
      const value = element.getBoundingClientRect();
      return {
        left: value.left, right: value.right, top: value.top, bottom: value.bottom,
        width: value.width, height: value.height,
      };
    };
    let minimumFocus = { value: Infinity };
    let firstOverlap = null;
    let firstOverflow = null;
    for (const phase of auditPhases) {
      for (const traversal of traversals) {
        if (traversal) {
          traversal.pause();
          traversal.currentTime = phase;
        }
      }
      // Reading layout flushes the deterministic currentTime writes; no wall-clock wait is used.
      const stage = rect(document.querySelector('#map-stage'));
      const targets = wrappers.map((wrapper) => ({
        id: wrapper.dataset.sessionId,
        slot: Number(wrapper.dataset.routeSlot),
        opacity: Number(getComputedStyle(wrapper).opacity),
        rect: rect(wrapper.querySelector('.session-car')),
      })).filter((item) => item.opacity > 0.001);
      const overflow = document.documentElement.scrollWidth
        - document.documentElement.clientWidth;
      if (overflow !== 0 && firstOverflow === null) firstOverflow = { phase, overflow };
      for (const target of targets) {
        const expansion = expansionsBySlot.get(target.slot);
        const edges = {
          left: target.rect.left - expansion - stage.left,
          right: stage.right - target.rect.right - expansion,
          top: target.rect.top - expansion - stage.top,
          bottom: stage.bottom - target.rect.bottom - expansion,
        };
        const limiting = Object.entries(edges).reduce((best, item) => (
          item[1] < best[1] ? item : best
        ));
        if (limiting[1] < minimumFocus.value) {
          minimumFocus = {
            value: limiting[1], phase, id: target.id, slot: target.slot,
            rect: target.rect, stage, focusExpansion: expansion,
            limitingEdge: limiting[0], edgeClearances: edges,
          };
        }
      }
      for (let first = 0; first < targets.length && firstOverlap === null; first += 1) {
        for (let second = first + 1; second < targets.length; second += 1) {
          const left = targets[first];
          const right = targets[second];
          const overlap = {
            horizontal: Math.min(left.rect.right, right.rect.right)
              - Math.max(left.rect.left, right.rect.left),
            vertical: Math.min(left.rect.bottom, right.rect.bottom)
              - Math.max(left.rect.top, right.rect.top),
          };
          if (overlap.horizontal > 0.01 && overlap.vertical > 0.01) {
            firstOverlap = {
              phase, pair: [left.id, right.id], slots: [left.slot, right.slot],
              rectangles: [left.rect, right.rect], overlap,
            };
            break;
          }
        }
      }
    }
    return { minimumFocus, firstOverlap, firstOverflow };
  }, { auditPhases: phases, focusBySlot: [...expansions] });
  const prefix = { width, course, sourceState, mode, phaseCount: phases.length };
  return [
    ...(result.minimumFocus.value < -0.01
      ? [{ kind: 'focus-clearance', ...prefix, ...result.minimumFocus }] : []),
    ...(result.firstOverlap ? [{ kind: 'target-overlap', ...prefix, ...result.firstOverlap }] : []),
    ...(result.firstOverflow ? [{ kind: 'document-overflow', ...prefix, ...result.firstOverflow }] : []),
  ];
}

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

async function prepareNeutralReferenceState(page, testInfo, course) {
  const expectedViewport = NEUTRAL_REFERENCE_VIEWPORTS[testInfo.project.name];
  const references = course.references[testInfo.project.name];
  expect(expectedViewport, `${testInfo.project.name} neutral reference viewport`).toBeTruthy();
  expect(references, `${testInfo.project.name}/${course.id} neutral reference inventory`)
    .toBeTruthy();
  const context = `${expectedViewport.width}x${expectedViewport.height}/${course.id}`
    + `/references=${references.join(',')}`;

  const interacted = page.locator(
    '.session-car:focus, .vehicle-anchor[data-pinned="true"] .session-car, '
      + '.pit-vehicle[data-pinned="true"] .session-car',
  ).first();
  if (await interacted.count()) {
    await interacted.focus();
    await page.keyboard.press('Escape');
  }
  const disclosure = page.locator('.legend-disclosure');
  if (await disclosure.getAttribute('open') !== null) {
    await disclosure.locator('summary').focus();
    await disclosure.locator('summary').press('Enter');
  }
  await page.locator('#track-select').selectOption(course.id);
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement?.matches?.('.session-car')) document.activeElement.blur();
    if (document.activeElement?.matches?.('.legend-disclosure summary')) {
      document.activeElement.blur();
    }
  });

  const settled = await page.evaluate(async ({
    expectedCourse, expectedTitle, traversalMs, smokeFraction,
  }) => {
    const root = document.querySelector('#dashboard-root');
    // Force selected-course style resolution before enumerating CSS Animations.
    getComputedStyle(root).getPropertyValue('display');
    const animations = document.getAnimations();
    for (const animation of animations) {
      animation.pause();
      const name = animation.animationName ?? '';
      if (name.includes('-traverse-')) {
        animation.currentTime = traversalMs;
      } else if (name.includes('smoke')) {
        animation.effect.updateTiming({ delay: 0 });
        animation.currentTime = animation.effect.getTiming().duration * smokeFraction;
      } else {
        animation.currentTime = 0;
      }
    }
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });

    const violations = [];
    const check = (condition, precondition, actual) => {
      if (!condition) violations.push(`${precondition}: ${JSON.stringify(actual)}`);
    };
    const viewport = {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    };
    const selector = document.querySelector('#track-select');
    const visibleArt = [...document.querySelectorAll('.course-art')]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden'
          && Number(style.opacity) !== 0;
      })
      .map((element) => element.dataset.trackArt);
    check(root?.dataset.trackId === expectedCourse, 'dashboard course identity', {
      actual: root?.dataset.trackId, expected: expectedCourse,
    });
    check(document.querySelector('#map-heading')?.textContent === expectedTitle,
      'map heading course identity', document.querySelector('#map-heading')?.textContent);
    check(document.querySelector('#track-status')?.textContent
      === `Active course: ${expectedTitle} · Manual`, 'track status course identity',
      document.querySelector('#track-status')?.textContent);
    check(selector?.value === expectedCourse, 'native selector course identity', selector?.value);
    check(visibleArt.length === 1 && visibleArt[0] === expectedCourse,
      'single visible course art', visibleArt);

    const sourceControls = document.querySelector('#source-controls');
    const sourceFile = document.querySelector('#snapshot-file');
    check(document.querySelector('#source-label')?.textContent === 'Fixtures · Night sector',
      'fixture source label', document.querySelector('#source-label')?.textContent);
    check(document.querySelector('#snapshot-summary')?.textContent === '24 sessions',
      'fixture session summary', document.querySelector('#snapshot-summary')?.textContent);
    check(document.querySelectorAll('.session-car').length === 24,
      'fixture session control population', document.querySelectorAll('.session-car').length);
    check(Boolean(sourceControls) && sourceControls.getAttribute('aria-busy') === null,
      'source region not busy', sourceControls?.getAttribute('aria-busy'));
    check(document.querySelector('#source-age')?.textContent === '',
      'empty source age', document.querySelector('#source-age')?.textContent);
    check(document.querySelector('#source-notice')?.textContent === '',
      'empty source notice', document.querySelector('#source-notice')?.textContent);
    check(sourceFile?.disabled === false && sourceFile?.files?.length === 0,
      'no live import in progress', {
        disabled: sourceFile?.disabled, files: sourceFile?.files?.length,
      });
    check(document.querySelector('#go-live')?.disabled === true,
      'live polling unavailable', document.querySelector('#go-live')?.disabled);

    const legend = document.querySelector('.legend-disclosure');
    check(legend?.open === false, 'legend disclosure closed', legend?.open);
    for (const overflowId of ['overflow-notice', 'pit-overflow']) {
      const notice = document.querySelector(`#${overflowId}`);
      check(notice?.hidden === true && notice?.textContent === '',
        `${overflowId} neutral and hidden`, {
          hidden: notice?.hidden, text: notice?.textContent,
        });
    }

    const sessionButtons = [...document.querySelectorAll('.session-car')];
    check(!document.activeElement?.matches?.('.session-car'),
      'no session control is active element', document.activeElement?.dataset?.sessionId);
    check(sessionButtons.every((button) => !button.matches(':focus, :focus-visible')),
      'no focused session control', sessionButtons.filter((button) => (
        button.matches(':focus, :focus-visible')
      )).map((button) => button.dataset.sessionId));
    check(sessionButtons.every((button) => !button.matches(':hover')),
      'no hovered session control', sessionButtons.filter((button) => (
        button.matches(':hover')
      )).map((button) => button.dataset.sessionId));
    check(sessionButtons.every((button) => button.getAttribute('aria-pressed') === 'false'),
      'all session controls unpressed', sessionButtons.filter((button) => (
        button.getAttribute('aria-pressed') !== 'false'
      )).map((button) => ({
        id: button.dataset.sessionId, pressed: button.getAttribute('aria-pressed'),
      })));
    const pinned = [...document.querySelectorAll(
      '.vehicle-anchor[data-pinned="true"], .pit-vehicle[data-pinned="true"]',
    )].map((wrapper) => wrapper.dataset.sessionId);
    check(pinned.length === 0, 'no pinned route or pit wrapper', pinned);

    const visibleTooltips = [...document.querySelectorAll('.session-tooltip')]
      .map((tooltip) => {
        const style = getComputedStyle(tooltip);
        return {
          id: tooltip.id, visibility: style.visibility, opacity: Number(style.opacity),
        };
      }).filter((tooltip) => tooltip.visibility !== 'hidden' || tooltip.opacity !== 0);
    check(visibleTooltips.length === 0, 'all tooltips computed hidden at zero opacity',
      visibleTooltips);
    check(document.querySelectorAll('.invalid-snapshot').length === 0,
      'no rejected snapshot state', document.querySelectorAll('.invalid-snapshot').length);
    check(document.querySelectorAll('.application-failure').length === 0,
      'no application failure state', document.querySelectorAll('.application-failure').length);

    const expectedTraversalName = `${expectedCourse}-traverse-${viewport.width <= 759
      ? 'mobile' : 'desktop'}`;
    const movingWrappers = [...document.querySelectorAll(
      '.vehicle-anchor.state-active, .vehicle-anchor.state-thinking',
    )];
    for (const wrapper of movingWrappers) {
      const traversals = wrapper.getAnimations().filter((animation) => (
        (animation.animationName ?? '').includes('-traverse-')
      ));
      check(traversals.length === 1 && traversals[0].animationName === expectedTraversalName,
        `session ${wrapper.dataset.sessionId} traversal identity`,
        traversals.map((animation) => animation.animationName));
      const smoke = wrapper.querySelector('.car-atmosphere').getAnimations({ subtree: true })
        .filter((animation) => (animation.animationName ?? '').includes('smoke'));
      const atmosphereDisplay = getComputedStyle(
        wrapper.querySelector('.car-atmosphere'),
      ).display;
      check(atmosphereDisplay === 'none' || smoke.length > 0,
        `session ${wrapper.dataset.sessionId} smoke identity`,
        smoke.map((animation) => animation.animationName));
    }
    const animationStates = document.getAnimations().map((animation) => {
      const name = animation.animationName ?? '(unnamed)';
      const duration = animation.effect.getTiming().duration;
      const expectedTime = name.includes('-traverse-')
        ? traversalMs
        : name.includes('smoke') ? duration * smokeFraction : 0;
      return {
        name,
        pseudo: animation.effect.pseudoElement ?? null,
        playState: animation.playState,
        currentTime: animation.currentTime,
        expectedTime,
      };
    });
    check(animationStates.length > 0, 'Web Animations present', animationStates.length);
    for (const state of animationStates) {
      check(state.playState === 'paused', `animation ${state.name} paused`, state);
      check(typeof state.currentTime === 'number'
        && Math.abs(state.currentTime - state.expectedTime) <= 0.01,
        `animation ${state.name} deterministic currentTime`, state);
    }
    return { violations, viewport, animationStates };
  }, {
    expectedCourse: course.id,
    expectedTitle: course.title,
    traversalMs: NEUTRAL_TRAVERSAL_MS,
    smokeFraction: NEUTRAL_SMOKE_FRACTION,
  });

  expect(page.viewportSize(), `${context}/Playwright viewport`).toEqual(expectedViewport);
  expect(settled.viewport, `${context}/document viewport`).toEqual(expectedViewport);
  expect(settled.violations, `${context}/neutral preconditions`).toEqual([]);
  return settled;
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

test('neutral reference preconditions settle before any future capture', async ({
  page,
}, testInfo) => {
  for (const course of NEUTRAL_REFERENCE_CASES) {
    const settled = await prepareNeutralReferenceState(page, testInfo, course);
    testInfo.annotations.push({
      type: 'neutral-reference-state',
      description: JSON.stringify({
        viewport: settled.viewport,
        course: course.id,
        references: course.references[testInfo.project.name],
        animations: settled.animationStates.length,
      }),
    });
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

test('layout boundaries preserve all course targets, controls, and transform isolation', async ({
  page,
}) => {
  if (page.viewportSize().width < 1000) return;
  for (const width of [759, 760, 959, 960, 961]) {
    await page.setViewportSize({ width, height: 900 });
    for (const trackId of ['ridge-pass', 'cypress-run']) {
      await page.locator('#track-select').selectOption(trackId);
      if (width === 961) {
        const button = page.locator('.vehicle-anchor .session-car').first();
        await button.focus();
        await button.press('Shift');
      }
      const result = await page.evaluate((selected) => {
        const stage = document.querySelector('#map-stage').getBoundingClientRect();
        const selector = document.querySelector('#track-select').getBoundingClientRect();
        const status = document.querySelector('#track-status').getBoundingClientRect();
        const routeButtons = [...document.querySelectorAll('.vehicle-anchor .session-car')];
        const targets = routeButtons.map((element) => element.getBoundingClientRect());
        const firstButton = routeButtons[0];
        const firstBody = document.querySelector('.vehicle-anchor .car-body');
        const buttonStyle = getComputedStyle(firstButton);
        const bodyStyle = getComputedStyle(firstBody);
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
          firstTarget: firstButton.getBoundingClientRect().toJSON(),
          firstBody: firstBody.getBoundingClientRect().toJSON(),
          firstBodyStyle: { width: bodyStyle.width, height: bodyStyle.height },
          firstStyle: {
            borderRadius: buttonStyle.borderRadius,
            clipPath: buttonStyle.clipPath,
            outlineStyle: buttonStyle.outlineStyle,
            outlineWidth: buttonStyle.outlineWidth,
            outlineOffset: buttonStyle.outlineOffset,
            boxShadow: buttonStyle.boxShadow,
          },
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
      if (width === 961) {
        expect(result.firstTarget.width, `${width}/${trackId} route target width`).toBe(52);
        expect(result.firstTarget.height, `${width}/${trackId} route target height`).toBe(52);
        expect(result.firstBodyStyle.width, `${width}/${trackId} route body width`).toBe('32px');
        expect(result.firstBodyStyle.height, `${width}/${trackId} route body height`).toBe('48px');
        expect(result.firstStyle.borderRadius, `${width}/${trackId} rounded square`).toBe('12px');
        expect(result.firstStyle.clipPath, `${width}/${trackId} no circle clip`).toBe('none');
        expect(result.firstStyle.outlineStyle, `${width}/${trackId} desktop focus style`).toBe('solid');
        expect(result.firstStyle.outlineWidth, `${width}/${trackId} desktop focus width`).toBe('4px');
        expect(result.firstStyle.outlineOffset, `${width}/${trackId} desktop focus offset`).toBe('4px');
        expect(result.firstStyle.boxShadow, `${width}/${trackId} desktop focus shadow`)
          .not.toBe('none');
      }
      await page.locator('#track-select').focus();
    }
  }
});

test('breakpoint pairs preserve phased focus clearance and target separation', async ({
  browser,
  page,
}) => {
  test.setTimeout(420_000);
  // One project owns this width matrix; running it again from the mobile project
  // would repeat identical browser contexts without adding geometry coverage.
  if (page.viewportSize().width < 1000) return;

  const live = syntheticLiveSnapshot();
  const geometryFailures = [];
  for (const mode of ['normal-motion', 'reduced-motion', 'register-property-fallback']) {
    const opened = await openBreakpointPage(browser, mode);
    try {
      for (const width of BREAKPOINT_WIDTHS) {
        await opened.page.setViewportSize({ width, height: 900 });
        for (const course of BREAKPOINT_COURSES) {
          await opened.page.locator('#track-select').selectOption(course);
          const profileName = width <= 759 ? 'mobile' : 'desktop';
          const phases = mode === 'normal-motion' ? phaseLattice(course, profileName) : [0];
          await freezeRouteAnimations(opened.page, 0);
          const fixtureLayout = await breakpointLayout(opened.page);
          geometryFailures.push(...await auditBreakpointGeometry(opened.page, {
            width,
            course,
            sourceState: 'synthetic-fixture',
            mode,
            phases,
          }));

          await opened.page.locator('#snapshot-file').setInputFiles({
            name: 'synthetic-breakpoint-live.json',
            mimeType: 'application/json',
            buffer: Buffer.from(JSON.stringify(live)),
          });
          await expect(opened.page.locator('#source-label'))
            .toHaveText('Live · one-shot tmux observation');
          await expect(opened.page.locator('.vehicle-anchor')).toHaveCount(16);
          await freezeRouteAnimations(opened.page, 0);
          const liveLayout = await breakpointLayout(opened.page);
          const layoutsMatch = JSON.stringify(liveLayout) === JSON.stringify(fixtureLayout);
          if (!layoutsMatch) {
            test.info().annotations.push({
              type: 'breakpoint-live-resweep',
              description: JSON.stringify({
                width, course, mode,
                fixtureStage: fixtureLayout.stage,
                liveStage: liveLayout.stage,
              }),
            });
            // Pixel geometry changed with the source state, so the fixture sweep
            // cannot stand in for live: repeat it instead of assuming equivalence.
            geometryFailures.push(...await auditBreakpointGeometry(opened.page, {
              width,
              course,
              sourceState: 'synthetic-live',
              mode,
              phases,
            }));
          }

          await opened.page.locator('#reset-source').click();
          await expect(opened.page.locator('#source-label')).toHaveText('Fixtures · Night sector');
          await expect(opened.page.locator('.vehicle-anchor')).toHaveCount(16);
        }
      }
      expect(opened.diagnostics, `${mode} browser console warnings/errors`).toEqual([]);
    } finally {
      await opened.context.close();
    }
  }
  expect(geometryFailures, JSON.stringify(geometryFailures)).toEqual([]);
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

  for (const name of ['body', 'tooltip']) {
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
  expect(transformed.stacking.wrapperZ).toBe('30');
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

test('cars omit visual code and glyph overlays while retaining complete accessible status', async ({
  page,
}) => {
  await expect(page.locator('.vehicle-anchor .car-code, .vehicle-anchor .car-glyph, '
    + '.pit-vehicle .car-code, .pit-vehicle .car-glyph')).toHaveCount(0);
  for (const selector of ['.vehicle-anchor .session-car', '.pit-vehicle .session-car']) {
    const button = page.locator(selector).first();
    const wrapper = button.locator('..');
    const tooltip = wrapper.locator('.session-tooltip');
    const status = (await wrapper.getAttribute('data-status')).replaceAll('_', ' ');
    await expect(button).toHaveAttribute('aria-describedby', await tooltip.getAttribute('id'));
    await expect(button).toHaveAttribute('aria-label', new RegExp(status, 'i'));
    await expect(tooltip).toHaveAttribute('role', 'tooltip');
    await expect(tooltip).toContainText(new RegExp(status, 'i'));
  }
});

test('inspected route and pit cars own the top stacking layer', async ({ page }) => {
  await page.locator('#track-select').selectOption('ridge-pass');
  const wrapper = page.locator('.vehicle-anchor.state-active').first();
  const button = wrapper.locator('.session-car');
  await button.focus();
  await expect(wrapper.locator('.session-tooltip')).toBeVisible();
  const routeStacking = await wrapper.evaluate((owner) => {
    const buttonNode = owner.querySelector('.session-car');
    const tooltip = owner.querySelector('.session-tooltip');
    const other = [...document.querySelectorAll('.vehicle-anchor')].find((node) => node !== owner);
    other.style.animation = 'none';
    other.style.transform = 'translate(-50%, -50%)';
    const layer = document.querySelector('#vehicle-layer').getBoundingClientRect();
    const placeOtherAt = ({ x, y }) => {
      other.style.left = `${x - layer.left}px`;
      other.style.top = `${y - layer.top}px`;
    };
    const center = (node) => {
      const box = node.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };
    const buttonCenter = center(buttonNode);
    placeOtherAt(buttonCenter);
    const controlHit = buttonNode.contains(document.elementFromPoint(buttonCenter.x, buttonCenter.y));
    const tooltipCenter = center(tooltip);
    placeOtherAt(tooltipCenter);
    tooltip.style.pointerEvents = 'auto';
    const tooltipHit = tooltip.contains(document.elementFromPoint(tooltipCenter.x, tooltipCenter.y));
    tooltip.style.removeProperty('pointer-events');
    return {
      ownerZ: getComputedStyle(owner).zIndex,
      otherZ: getComputedStyle(other).zIndex,
      controlHit,
      tooltipHit,
    };
  });
  expect(routeStacking).toEqual({ ownerZ: '30', otherZ: '3', controlHit: true, tooltipHit: true });

  const pit = page.locator('.pit-vehicle').first();
  await pit.locator('.session-car').focus();
  await expect(pit.locator('.session-tooltip')).toBeVisible();
  expect(await pit.evaluate((element) => getComputedStyle(element).zIndex)).toBe('30');
});

test('all top sprites face measured route travel while previews and pit placement stay stable', async ({
  page,
}) => {
  await page.locator('#track-select').selectOption('ridge-pass');
  const profile = page.viewportSize().width <= 759 ? 'mobile' : 'desktop';
  const frames = TRACK_SCHEDULES.get('ridge-pass')[profile].frames;
  const frameIndex = frames.findIndex((frame, index) => (
    index < frames.length - 1
      && frame.driftYaw === '0'
      && frames[index + 1].driftYaw === '0'
      && (frame.left !== frames[index + 1].left || frame.top !== frames[index + 1].top)
  ));
  const sample = { start: frames[frameIndex], end: frames[frameIndex + 1] };
  const result = await page.locator(
    '.vehicle-anchor.state-active, .vehicle-anchor.state-thinking',
  ).first().evaluate((wrapper, { start, end }) => {
    const route = wrapper.getAnimations().find((animation) => (
      (animation.animationName ?? '').includes('traverse')
    ));
    const sprite = wrapper.querySelector('.car-sprite[data-car-view="top"]');
    const matrixAngle = (element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    };
    const center = (element) => {
      const box = element.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };
    route.pause();
    route.currentTime = Number(start.percent) / 100 * 64000;
    const from = center(wrapper);
    const totalAngle = matrixAngle(wrapper.querySelector('.car-angle'))
      + matrixAngle(wrapper.querySelector('.car-motion'))
      + matrixAngle(sprite);
    route.currentTime = Number(end.percent) / 100 * 64000;
    const to = center(wrapper);
    const movement = { x: to.x - from.x, y: to.y - from.y };
    const distance = Math.hypot(movement.x, movement.y);
    const radians = totalAngle * Math.PI / 180;
    const nativeY = sprite.dataset.carNativeTopNose === 'down' ? 1 : -1;
    // Carry the audited native pixel nose through the actual image, drift, and
    // route transforms, then compare it with measured forward displacement.
    const nose = { x: -nativeY * Math.sin(radians), y: nativeY * Math.cos(radians) };
    return {
      distance,
      alignment: (nose.x * movement.x + nose.y * movement.y) / distance,
      wrapperAngle: matrixAngle(wrapper),
      routeHeading: getComputedStyle(wrapper).getPropertyValue('--route-heading').trim(),
    };
  }, sample);
  expect(result.distance).toBeGreaterThan(1);
  expect(result.alignment).toBeGreaterThan(0.95);
  expect(result.routeHeading).toMatch(/-?\d+(?:\.\d+)?deg/);
  expect(angleDistance(result.wrapperAngle, 0)).toBeLessThanOrEqual(0.01);

  const artAngles = await page.locator('.session-car').evaluateAll((buttons) => {
    const angle = (element) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    };
    return buttons.map((button) => ({
      model: button.dataset.carModel,
      native: button.querySelector('.car-sprite').dataset.carNativeTopNose,
      correction: Number(button.querySelector('.car-sprite').dataset.carTopCorrection),
      top: angle(button.querySelector('.car-sprite[data-car-view="top"]')),
      preview: angle(button.parentElement.querySelector('.vehicle-preview-image')),
    }));
  });
  expect(new Set(artAngles.map(({ model }) => model)).size).toBe(8);
  const expectedOrientation = {
    coupe: ['down', 180], hatchback: ['down', 180], sedan: ['up', 0], wagon: ['up', 0],
    roadster: ['up', 0], rally: ['down', 180], fastback: ['up', 0], utility: ['up', 0],
  };
  for (const { model, native, correction, top } of artAngles) {
    expect([native, correction]).toEqual(expectedOrientation[model]);
    expect(angleDistance(top, correction)).toBeLessThanOrEqual(0.01);
    const nativeY = native === 'down' ? 1 : -1;
    expect(nativeY * Math.cos(top * Math.PI / 180)).toBeLessThan(-0.999);
  }
  expect(artAngles.every(({ preview }) => angleDistance(preview, 0) <= 0.01)).toBe(true);

  const pit = page.locator('.pit-vehicle');
  const pitBefore = await pit.evaluateAll((wrappers) => wrappers.map((wrapper) => {
    const box = wrapper.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }));
  await page.waitForTimeout(200);
  const pitAfter = await pit.evaluateAll((wrappers) => wrappers.map((wrapper) => {
    const box = wrapper.getBoundingClientRect();
    const sprite = wrapper.querySelector('.car-sprite[data-car-view="top"]');
    const matrix = new DOMMatrixReadOnly(getComputedStyle(sprite).transform);
    const topAngle = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    const nativeY = sprite.dataset.carNativeTopNose === 'down' ? 1 : -1;
    return {
      model: wrapper.dataset.carModel,
      x: box.left + box.width / 2,
      y: box.top + box.height / 2,
      canonicalNoseY: nativeY * Math.cos(topAngle * Math.PI / 180),
      wrapperAnimation: getComputedStyle(wrapper).animationName,
      angleAnimation: getComputedStyle(wrapper.querySelector('.car-angle')).animationName,
    };
  }));
  expect(new Set(pitAfter.map(({ model }) => model)).size).toBe(8);
  pitAfter.forEach((item, index) => {
    expect(distance(pitBefore[index], item)).toBeLessThan(0.1);
    expect(item.canonicalNoseY).toBeLessThan(-0.999);
    expect(item.wrapperAnimation).toBe('none');
    expect(item.angleAnimation).toBe('none');
  });
});

test('vehicle previews match their cars across hover, focus, pinning, and responsive containment', async ({
  page,
}) => {
  const catalog = await page.locator('.session-car').evaluateAll((buttons) => ({
    models: new Set(buttons.map((button) => button.dataset.carModel)).size,
    liveries: new Set(buttons.map((button) => button.dataset.carLivery)).size,
    topSources: new Set(buttons.map((button) => button.querySelector('.car-sprite').currentSrc)).size,
    modelCounts: Object.fromEntries(buttons.reduce((counts, button) => {
      counts.set(button.dataset.carModel, (counts.get(button.dataset.carModel) ?? 0) + 1);
      return counts;
    }, new Map())),
    loaded: buttons.every((button) => {
      const image = button.querySelector('.car-sprite');
      return image.complete && image.naturalWidth === 32 && image.naturalHeight === 48;
    }),
  }));
  expect(catalog.models).toBe(8);
  expect(catalog.liveries).toBe(3);
  expect(catalog.topSources).toBe(8);
  expect(Object.values(catalog.modelCounts)).toEqual(Array(8).fill(3));
  expect(catalog.loaded).toBe(true);

  const wrapper = page.locator('.vehicle-anchor.state-active').first();
  const button = wrapper.locator('.session-car');
  const tooltip = wrapper.locator('.session-tooltip');
  const preview = tooltip.locator('.vehicle-preview');
  const matching = async () => wrapper.evaluate((element) => {
    const car = element.querySelector('.session-car');
    const top = car.querySelector('.car-sprite');
    const tip = element.querySelector('.session-tooltip');
    const art = tip.querySelector('.vehicle-preview');
    const image = art.querySelector('.vehicle-preview-image');
    const topStyle = getComputedStyle(top);
    const imageStyle = getComputedStyle(image);
    return {
      model: [car.dataset.carModel, top.dataset.carModel, tip.dataset.carModel,
        art.dataset.carModel, image.dataset.carModel],
      livery: [car.dataset.carLivery, top.dataset.carLivery, tip.dataset.carLivery,
        art.dataset.carLivery, image.dataset.carLivery],
      view: [car.dataset.carView, tip.dataset.carView, art.dataset.carView,
        image.dataset.carView],
      signature: [car.dataset.carSignature, top.dataset.carSignature,
        tip.dataset.carSignature, art.dataset.carSignature, image.dataset.carSignature],
      previewAria: art.getAttribute('aria-hidden'),
      imageAria: image.getAttribute('aria-hidden'),
      imageAlt: image.getAttribute('alt'),
      imageDraggable: image.draggable,
      focusables: art.querySelectorAll('button, a, input, select, textarea, [tabindex]').length,
      text: tip.querySelector('.vehicle-preview-text').textContent,
      previewAnimations: art.getAnimations({ subtree: true }).length,
      renderedView: image.dataset.carView,
      renderedSignature: image.dataset.carSignature,
      previewSource: new URL(image.currentSrc).pathname,
      topSource: new URL(top.currentSrc).pathname,
      previewLoaded: image.complete && image.naturalWidth === 48 && image.naturalHeight === 32,
      topLoaded: top.complete && top.naturalWidth === 32 && top.naturalHeight === 48,
      previewSize: [Number.parseFloat(imageStyle.width), Number.parseFloat(imageStyle.height)],
      topSize: [Number.parseFloat(topStyle.width), Number.parseFloat(topStyle.height)],
      imageRendering: [topStyle.imageRendering, imageStyle.imageRendering],
      pointerEvents: [topStyle.pointerEvents, imageStyle.pointerEvents],
      legacySvgCounts: [
        car.querySelectorAll('.car-silhouette svg').length,
        art.querySelectorAll('svg').length,
      ],
      legacyArtworkCount: element.querySelectorAll(
        '.car-overlay, .car-livery, .car-centerline, .car-headlamp, '
          + '.vehicle-preview-overlay, .vehicle-preview-livery',
      ).length,
    };
  });

  // Focus freezes the moving route target long enough to place the pointer on
  // it deterministically; moving focus away then proves hover alone holds it.
  await button.focus();
  await wrapper.hover({ force: true });
  await page.locator('#track-select').focus();
  await expect(tooltip).toBeVisible();
  let state = await matching();
  expect(new Set(state.model).size).toBe(1);
  expect(new Set(state.livery).size).toBe(1);
  expect(new Set(state.view).size).toBe(1);
  expect(new Set(state.signature).size).toBe(1);
  expect(state.previewAria).toBe('true');
  expect(state.imageAria).toBe('true');
  expect(state.imageAlt).toBe('');
  expect(state.imageDraggable).toBe(false);
  expect(state.focusables).toBe(0);
  expect(state.text).toMatch(/^Vehicle preview: .+, (side|front|rear) view$/);
  expect(state.previewAnimations).toBe(0);
  expect(state.renderedView).toBe(state.view[0]);
  expect(state.renderedSignature).toBe(state.signature[0]);
  expect(state.previewSource).toMatch(
    new RegExp(`/${state.model[0]}-${state.view[0]}\\.png$`),
  );
  expect(state.topSource).toMatch(new RegExp(`/${state.model[0]}-top\\.png$`));
  expect(state.previewLoaded).toBe(true);
  expect(state.topLoaded).toBe(true);
  expect(state.previewSize).toEqual([96, 64]);
  expect(state.topSize).toEqual(page.viewportSize().width <= 960 ? [24, 36] : [32, 48]);
  expect(state.imageRendering).toEqual(['pixelated', 'pixelated']);
  expect(state.pointerEvents).toEqual(['none', 'none']);
  expect(state.legacySvgCounts).toEqual([0, 0]);
  expect(state.legacyArtworkCount).toBe(0);


  await page.mouse.move(1, 1);
  await expect(tooltip).toBeHidden();
  await button.focus();
  await expect(tooltip).toBeVisible();
  const containment = await wrapper.evaluate((element) => {
    const rect = (node) => node.getBoundingClientRect();
    const tip = rect(element.querySelector('.session-tooltip'));
    const stage = rect(document.querySelector('#map-stage'));
    return {
      insideStage: tip.top >= stage.top - 1 && tip.bottom <= stage.bottom + 1,
      insideViewport: tip.left >= 0 && tip.right <= innerWidth && tip.top >= 0 && tip.bottom <= innerHeight,
    };
  });
  expect(containment).toEqual({ insideStage: true, insideViewport: true });
  await page.locator('#track-select').focus();
  await expect(tooltip).toBeHidden();

  await wrapper.hover({ force: true });
  await button.dispatchEvent('click', { detail: 1 });
  await expect(wrapper).toHaveAttribute('data-pinned', 'true');
  await page.locator('#track-select').focus();
  await page.mouse.move(1, 1);
  await expect(tooltip).toBeVisible();
  state = await matching();
  expect(new Set(state.model).size).toBe(1);
  await page.keyboard.press('Escape');
  await expect(wrapper).not.toHaveAttribute('data-pinned', 'true');
  await expect(tooltip).toBeHidden();

  if (page.viewportSize().width <= 759) {
    const pit = page.locator('.pit-vehicle').first();
    await pit.locator('.session-car').focus();
    await expect(pit.locator('.session-tooltip')).toBeVisible();
    const pitContained = await pit.locator('.session-tooltip').evaluate((element) => {
      const value = element.getBoundingClientRect();
      return value.left >= 0 && value.right <= innerWidth && value.top >= 0 && value.bottom <= innerHeight;
    });
    expect(pitContained).toBe(true);
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

test('route reset milestones preserve position, heading, and opacity without car overlays', async ({
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
        return {
          left: Number.parseFloat(style.left),
          top: Number.parseFloat(style.top),
          heading,
          opacity: Number(style.opacity),
          visibility: style.visibility,
          overlays: wrapper.querySelectorAll('.car-glyph, .car-code').length,
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
      expect(actual[index].overlays).toBe(0);
    });
  }
});

test('every compiled corner has signed zero-peak-zero yaw and clear body bounds', async ({ page }) => {
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
            return {
              ...input,
              yaw,
              inverse,
              motionAngle: angleOf(motion),
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
