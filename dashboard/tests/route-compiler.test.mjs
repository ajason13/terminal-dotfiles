import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import config from '../routes/route-config.mjs';
import cypress from '../routes/cypress-run.route.mjs';
import lantern from '../routes/lantern-coil.route.mjs';
import ridge from '../routes/ridge-pass.route.mjs';
import {
  GENERATED_ROUTE_GEOMETRY,
  GENERATED_TRACK_INPUT,
} from '../src/generated/route-geometry.mjs';
import {
  checkArtifacts,
  run,
  sourceDigest,
  validateRouteFileNames,
  writeArtifacts,
} from '../scripts/compile-routes.mjs';
import {
  adaptiveSimpson,
  cubicArcLength,
  cubicDerivative,
  cubicPoint,
  parseCubicPath,
  pathMetrics,
  pointAtDistance,
} from '../scripts/lib/svg-cubic-path.mjs';
import {
  auditAnchorTargets,
  applyCornerDrift,
  buildCornerProbeStream,
  CORNER_POLICY,
  compileRoutes,
  cornersForRegions,
  detectCourseCorners,
  driftMagnitudeForStrength,
  generateAnchors,
  generateSchedule,
  generateStaticHeadings,
  headingForDerivative,
  mergeScheduleCandidates,
  roundFour,
  selectCornerRegions,
  serializeFour,
  smoothstep,
  speedGroupForChord,
  unwrapHeadings,
  validateSources,
} from '../scripts/lib/route-compiler.mjs';
import { LEGACY_ROUTE_MIGRATION } from './fixtures/legacy-route-migration.mjs';

const clone = (value) => structuredClone(value);
let cachedCompilation;
const compile = () => {
  cachedCompilation ??= compileRoutes(config, [ridge, cypress, lantern], '0'.repeat(64));
  return cachedCompilation;
};
const syntheticCircle = () => {
  const k = 110.45695;
  return [
    { p0: { x: 500, y: 180 }, p1: { x: 500 + k, y: 180 }, p2: { x: 700, y: 380 - k }, p3: { x: 700, y: 380 } },
    { p0: { x: 700, y: 380 }, p1: { x: 700, y: 380 + k }, p2: { x: 500 + k, y: 580 }, p3: { x: 500, y: 580 } },
    { p0: { x: 500, y: 580 }, p1: { x: 500 - k, y: 580 }, p2: { x: 300, y: 380 + k }, p3: { x: 300, y: 380 } },
    { p0: { x: 300, y: 380 }, p1: { x: 300, y: 380 - k }, p2: { x: 500 - k, y: 180 }, p3: { x: 500, y: 180 } },
  ];
};

test('checked-in config and routes validate with fixed cubic and segment mappings', () => {
  const validated = validateSources(config, [ridge, cypress, lantern]);
  assert.deepEqual(validated.map(({ cubics }) => cubics.length), [15, 21, 16]);
  assert.deepEqual(ridge.segments.map(({ curveCount }) => curveCount), [1, 5, 2, 2, 4, 1]);
  assert.deepEqual(cypress.segments.map(({ curveCount }) => curveCount), [1, 4, 3, 4, 4, 5]);
  assert.deepEqual(lantern.segments.map(({ curveCount }) => curveCount), [1, 2, 2, 3, 4, 4]);
});

test('Lantern Coil pins source identity, locators, medium-speed geometry, and open spacing', () => {
  assert.equal(lantern.id, 'lantern-coil');
  assert.equal(lantern.title, 'Lantern Coil');
  assert.deepEqual(lantern.segments.map(({ anchors }) => (
    anchors.map(({ at, lateralOffset }) => [at, lateralOffset])
  )), [
    [[0, 0], [0.651, 0]],
    [[0.158, 0], [0.498, 0], [0.838, 0]],
    [[0.2, 0], [0.582, 0], [0.964, 0]],
    [[0.269, 0], [0.566, 0], [0.863, 0]],
    [[0.16, 0], [0.456, 0], [0.752, 0]],
    [[0.075, 0], [1, 0]],
  ]);
  const cubics = parseCubicPath(lantern.path, config.viewBox);
  const metrics = pathMetrics(cubics);
  const output = compile();
  const schedule = output.schedules.find(({ route }) => route.id === lantern.id);
  assert.equal(schedule.desktop.frames.length, 528);
  assert.equal(schedule.mobile.frames.length, 528);
  assert.ok(schedule.desktop.metrics.total > output.schedules[0].desktop.metrics.total);
  assert.ok(schedule.desktop.metrics.total < output.schedules[1].desktop.metrics.total);
  assert.ok(schedule.mobile.metrics.total > output.schedules[0].mobile.metrics.total);
  assert.ok(schedule.mobile.metrics.total < output.schedules[1].mobile.metrics.total);

  const flattened = cubics.flatMap((cubic, cubicIndex) => (
    Array.from({ length: 33 }, (_, index) => cubicPoint(cubic, index / 32))
      .slice(cubicIndex === 0 ? 0 : 1)
  ));
  const orientation = (a, b, c) => (
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
  );
  for (let first = 0; first < flattened.length - 1; first += 1) {
    for (let second = first + 2; second < flattened.length - 1; second += 1) {
      const a = flattened[first];
      const b = flattened[first + 1];
      const c = flattened[second];
      const d = flattened[second + 1];
      const intersects = orientation(a, b, c) * orientation(a, b, d) < 0
        && orientation(c, d, a) * orientation(c, d, b) < 0;
      assert.equal(intersects, false, `flattened segments ${first}/${second} intersect`);
    }
  }

  const samples = Array.from({ length: 1025 }, (_, index) => (
    pointAtDistance(cubics, metrics, metrics.total * index / 1024).point
  ));
  for (const profile of config.profiles) {
    let minimum = Infinity;
    for (let first = 0; first < samples.length; first += 1) {
      for (let second = first + 82; second < samples.length; second += 1) {
        minimum = Math.min(minimum, Math.hypot(
          (samples[second].x - samples[first].x) * profile.width / config.viewBox.width,
          (samples[second].y - samples[first].y) * profile.height / config.viewBox.height,
        ));
      }
    }
    assert.ok(minimum >= profile.targetDiameter, `${profile.id} nonlocal spacing ${minimum}`);
  }
});

test('Lantern Coil pins five positive drift envelopes, responsive peaks, and zero-yaw gaps', () => {
  const item = compile().schedules.find(({ route }) => route.id === lantern.id);
  assert.deepEqual(item.cornerAnalysis.corners.map(({ sign, apex }) => [sign, apex.fraction]), [
    [1, 0.072265625], [1, 0.421875], [1, 0.693359375],
    [1, 0.880859375], [1, 0.98046875],
  ]);
  assert.deepEqual(item.desktop.corners.map(({ peakYaw }) => peakYaw), [
    34.0332, 30.7834, 33.1415, 40.164, 19.1235,
  ]);
  assert.deepEqual(item.mobile.corners.map(({ peakYaw }) => peakYaw), [
    19.8528, 18.6834, 20.1688, 23.8153, 25.0196,
  ]);
  assert.equal(item.desktop.frames.filter(({ driftYaw }) => driftYaw === '0').length, 359);
  assert.equal(item.mobile.frames.filter(({ driftYaw }) => driftYaw === '0').length, 303);
  for (const profileName of ['desktop', 'mobile']) {
    const schedule = item[profileName];
    schedule.corners.forEach((corner) => {
      assert.equal(schedule.frames[corner.entryFrameIndex].driftYaw, '0');
      assert.equal(schedule.frames[corner.exitFrameIndex].driftYaw, '0');
    });
    for (let index = 1; index < schedule.corners.length; index += 1) {
      assert.ok(schedule.frames.slice(
        schedule.corners[index - 1].exitFrameIndex,
        schedule.corners[index].entryFrameIndex + 1,
      ).some(({ driftYaw }) => driftYaw === '0'));
    }
  }
});

test('closed schema rejects missing and extra keys at every source depth', () => {
  for (const mutate of [
    (cfg) => { cfg.extra = true; },
    (cfg) => { delete cfg.viewBox; },
    (cfg, routes) => { routes[0].extra = true; },
    (cfg, routes) => { delete routes[0].path; },
    (cfg, routes) => { routes[0].segments[0].extra = true; },
    (cfg, routes) => { delete routes[0].segments[0].cssClass; },
    (cfg, routes) => { routes[0].segments[0].anchors[0].extra = true; },
    (cfg, routes) => { delete routes[0].segments[0].anchors[0].at; },
  ]) {
    const cfg = clone(config);
    const routes = [clone(ridge), clone(cypress), clone(lantern)];
    mutate(cfg, routes);
    assert.throws(() => validateSources(cfg, routes), /unsupported or missing keys/);
  }
});

test('identity, uniqueness, primitive, locator, and fixed mapping boundaries fail closed', () => {
  for (const mutate of [
    (cfg) => { cfg.trackOrder[0] = '../ridge'; },
    (cfg) => { cfg.trackOrder[1] = cfg.trackOrder[0]; },
    (cfg, routes) => { routes[0].id = 'other'; },
    (cfg, routes) => { routes[1].artId = routes[0].artId; },
    (cfg, routes) => { routes[1].mobileAnimationName = routes[0].desktopAnimationName; },
    (cfg, routes) => { routes[0].segments[0].curveCount = 2; },
    (cfg, routes) => { routes[0].segments[0].anchors[0].at = NaN; },
    (cfg, routes) => { routes[0].segments[0].anchors[0].lateralOffset = 28; },
    (cfg, routes) => { routes[0].segments[0].anchors[1].at = 0; },
  ]) {
    const cfg = clone(config);
    const routes = [clone(ridge), clone(cypress), clone(lantern)];
    mutate(cfg, routes);
    assert.throws(() => validateSources(cfg, routes));
  }
});

test('segment cssClass references are unique across the complete catalog', () => {
  const routes = [clone(ridge), clone(cypress), clone(lantern)];
  routes[1].segments[0].cssClass = routes[0].segments[0].cssClass;
  assert.throws(() => validateSources(clone(config), routes), /segments\[0\] is duplicated/);
});

test('closed source graph rejects hidden, symbolic, accessor, prototype, and primitive attacks', () => {
  const cases = [
    (cfg) => Object.defineProperty(cfg, 'hidden', { value: true }),
    (cfg, routes) => Object.defineProperty(routes[0], 'hidden', { value: true }),
    (cfg, routes) => Object.defineProperty(routes[0].segments[0], 'hidden', { value: true }),
    (cfg, routes) => Object.defineProperty(routes[0].segments[0].anchors[0], 'hidden', { value: true }),
    (cfg) => Object.defineProperty(cfg.profiles[0], 'hidden', { value: true }),
    (cfg) => { cfg[Symbol('extra')] = true; },
    (cfg) => Object.defineProperty(cfg.trackOrder, '0', { get: () => 'ridge-pass' }),
    (cfg) => Object.defineProperty(cfg.profiles, 'hidden', { value: true }),
    (cfg, routes) => Object.defineProperty(routes[0], 'title', { get: () => 'Ridge Pass' }),
    (cfg, routes) => { routes[0].title = () => 'Ridge Pass'; },
    (cfg, routes) => { routes[0].segments[0].anchors[0].lateralOffset = 0n; },
    (cfg, routes) => Object.setPrototypeOf(routes[0], { inherited: true }),
    (cfg) => Object.setPrototypeOf(cfg.profiles, { inherited: true }),
  ];
  for (const mutate of cases) {
    const cfg = clone(config);
    const routes = [clone(ridge), clone(cypress)];
    mutate(cfg, routes);
    assert.throws(() => validateSources(cfg, routes));
  }
});

test('route filename set rejects missing and orphan sources', () => {
  const current = ['cypress-run.route.mjs', 'lantern-coil.route.mjs', 'ridge-pass.route.mjs'];
  assert.doesNotThrow(() => validateRouteFileNames(config.trackOrder, current));
  assert.throws(() => validateRouteFileNames(config.trackOrder, current.slice(1)), /missing or extra/);
  assert.throws(() => validateRouteFileNames(
    config.trackOrder,
    [...current, 'orphan.route.mjs'],
  ), /missing or extra/);
});

test('strict parser accepts only explicit uppercase M/C and pinned separators and numbers', () => {
  const box = { width: 1000, height: 760 };
  assert.equal(parseCubicPath('M0 0 C0,0 10,10 20,20', box).length, 1);
  assert.equal(parseCubicPath('M 0\t0\nC 0 0 10 10 20 20', box).length, 1);
  for (const path of [
    'm0 0 c0 0 10 10 20 20',
    'M0 0 C0 0 10 10 20 20 30 30 40 40 50 50',
    'M0 0 C0 0 10 10 20 20z',
    'M0 0 Q0 0 20 20',
    'M0 0 S0 0 20 20',
    'M0 0 C0 0 10 10 20 20,',
    'M0 0 C0,,0 10 10 20 20',
    'M0 0 C+0 0 10 10 20 20',
    'M0 0 C.0 0 10 10 20 20',
    'M0 0 C00 0 10 10 20 20',
    'M0 0 C0e0 0 10 10 20 20',
    'M0 0 CNaN 0 10 10 20 20',
    'M0 0 C0 0 10 10 1001 20',
  ]) assert.throws(() => parseCubicPath(path, box), path);
});

test('cubic math, adaptive integration, and distance inversion honor boundary tangents', () => {
  const line = parseCubicPath('M0 0 C3 0 7 0 10 0 C10 4 10 6 10 10', {
    width: 20, height: 20,
  });
  assert.deepEqual(cubicPoint(line[0], 0), { x: 0, y: 0 });
  assert.deepEqual(cubicPoint(line[0], 1), { x: 10, y: 0 });
  assert.deepEqual(cubicDerivative(line[1], 0), { x: 0, y: 12 });
  assert.ok(Math.abs(cubicArcLength(line[0]) - 10) < 1e-7);
  const metrics = pathMetrics(line);
  assert.deepEqual(pointAtDistance(line, metrics, 0).point, { x: 0, y: 0 });
  assert.deepEqual(pointAtDistance(line, metrics, metrics.total).point, { x: 10, y: 10 });
  const boundary = pointAtDistance(line, metrics, metrics.lengths[0]);
  assert.equal(boundary.cubicIndex, 1);
  assert.deepEqual(boundary.derivative, { x: 0, y: 12 });
  assert.ok(Math.abs(adaptiveSimpson((x) => x * x, 0, 1) - 1 / 3) < 1e-7);
  assert.throws(() => adaptiveSimpson((x) => x ** 4, 0, 1, 1e-20, 0), /did not converge/);
});

test('zero derivative anchors fail instead of inventing a normal', () => {
  const route = clone(ridge);
  const cubics = parseCubicPath(route.path, config.viewBox);
  cubics[0].p1 = { ...cubics[0].p0 };
  assert.throws(() => generateAnchors(route, cubics, config), /zero derivative/);
});

test('responsive heading math aligns the negative-Y car axis and fails closed', () => {
  const square = { width: 1000, height: 760 };
  assert.equal(headingForDerivative({ x: 1, y: 0 }, square, config), 90);
  assert.equal(headingForDerivative({ x: 0, y: 1 }, square, config), -180);
  assert.equal(headingForDerivative({ x: -1, y: 0 }, square, config), -90);
  assert.equal(headingForDerivative({ x: 1, y: 1 }, square, config), 135);
  assert.notEqual(
    headingForDerivative({ x: 1, y: 1 }, config.profiles[0], config),
    headingForDerivative({ x: 1, y: 1 }, config.profiles[1], config),
  );
  assert.throws(
    () => headingForDerivative({ x: 1e-12, y: 0 }, square, config),
    /must exceed 1e-9/,
  );
  assert.throws(() => headingForDerivative({ x: NaN, y: 1 }, square, config), /finite/);
});

test('heading unwrapping chooses the nearest equivalent and rejects ambiguous reversals', () => {
  assert.deepEqual(unwrapHeadings([179, -179, -178]), [179, 181, 182]);
  assert.deepEqual(unwrapHeadings([-179, 179, 178]), [-179, -181, -182]);
  assert.throws(() => unwrapHeadings([0, 180]), /ambiguous 180-degree/);
  assert.throws(() => unwrapHeadings([0, 180 - 1e-9]), /ambiguous 180-degree/);
  assert.throws(() => unwrapHeadings([0, 180 + 1e-9]), /ambiguous 180-degree/);
  assert.throws(() => unwrapHeadings([0, 180 - 2e-9]), /serializes to a 180-degree/);
  assert.throws(() => unwrapHeadings([0, 180 + 2e-9]), /serializes to a 180-degree/);
  assert.doesNotThrow(() => unwrapHeadings([0, 180 - 0.00006]));
  assert.doesNotThrow(() => unwrapHeadings([0, 180 + 0.00006]));
  assert.throws(() => unwrapHeadings([0, 179.99996]), /serializes to a 180-degree/);
  assert.equal(serializeFour(-0), '0');
  assert.equal(serializeFour(-12.34567), '-12.3457');
});

test('corner policy pins the canonical detector, thresholds, envelope, and yaw cap', () => {
  assert.deepEqual(CORNER_POLICY, {
    baseIntervals: 512,
    halfWindowIntervals: 6,
    tangentProbesPerBaseInterval: 4,
    maximumContinuousProbeTurn: 90,
    windowTurnThreshold: 15,
    stepTurnEpsilon: 0.05,
    broadLobeTotalTurn: 30,
    prominenceValleyRatio: 0.5,
    discontinuousJoinThreshold: 45,
    minimumDriftYaw: 15,
    maximumDriftYaw: 42,
  });
});

test('broad fallback admits disjoint lobes and rejects same-sign or opposite-sign endpoint contact', () => {
  const make = (windowTurns) => [0, 10, 20, 30, 40].map((heading, index) => ({
    heading,
    windowTurn: windowTurns[index] ?? 0,
  }));
  assert.deepEqual(selectCornerRegions(make([])).broad, [{ start: 0, end: 4, sign: 1 }]);
  for (const endpointTurn of [15, -15]) {
    const selected = selectCornerRegions(make([0, 0, 0, 0, endpointTurn]));
    assert.equal(selected.threshold.length, 1);
    assert.deepEqual(selected.broad, []);
  }
  const adjacent = selectCornerRegions(make([0, 0, 0, 0, 15]));
  assert.deepEqual(adjacent.broad, []);
  const bPlusOne = selectCornerRegions([
    { heading: 0, windowTurn: 0 },
    { heading: 10, windowTurn: 0 },
    { heading: 20, windowTurn: 0 },
    { heading: 30, windowTurn: 0 },
    { heading: 30, windowTurn: 15 },
  ]);
  assert.deepEqual(bPlusOne.broad, [{ start: 0, end: 3, sign: 1 }]);
  assert.deepEqual(bPlusOne.threshold, [{ start: 4, end: 4, sign: 1 }]);
});

test('broad-only endpoint regions fail with deterministic route context instead of TypeError', () => {
  const candidate = (heading, index) => ({
    kind: 'base',
    index,
    canonicalDistance: index,
    heading,
    windowTurn: 0,
  });
  for (const [id, headings] of [
    ['start-guard', [0, 10, 20, 30, 40, 40]],
    ['end-guard', [0, 0, 10, 20, 30, 40]],
  ]) {
    const candidates = headings.map(candidate);
    const selected = selectCornerRegions(candidates);
    assert.equal(selected.threshold.length, 0);
    assert.equal(selected.broad.length, 1);
    assert.throws(
      () => cornersForRegions({ id }, candidates, selected.regions, new Map(), 1),
      (error) => error instanceof RangeError
        && error.message === `${id} corner region is missing an outer guard candidate`,
    );
  }
});

test('synthetic straight, near-zero, broad, left, right, and sign-transition signals classify generically', () => {
  const items = (headings, windows) => headings.map((heading, index) => ({
    heading,
    windowTurn: windows[index] ?? 0,
  }));
  assert.deepEqual(selectCornerRegions(items([0, 0, 0], [])).regions, []);
  assert.deepEqual(selectCornerRegions(items([0, 0.049, 0.098], [])).regions, []);
  assert.deepEqual(
    selectCornerRegions(items([0, 10, 20, 30, 40], [])).regions,
    [{ start: 0, end: 4, sign: 1 }],
  );
  assert.deepEqual(
    selectCornerRegions(items([0, 0, 0, 0, 0], [0, 15, 16, 0, 0])).threshold,
    [{ start: 1, end: 2, sign: 1 }],
  );
  assert.deepEqual(
    selectCornerRegions(items([0, 0, 0, 0, 0], [0, -15, -16, 0, 0])).threshold,
    [{ start: 1, end: 2, sign: -1 }],
  );
  assert.deepEqual(
    selectCornerRegions(items([0, 0, 0, 0, 0], [0, 18, 0, -18, 0])).threshold,
    [{ start: 1, end: 1, sign: 1 }, { start: 3, end: 3, sign: -1 }],
  );
});

test('distributed turns above 180 unwrap with sign while concentrated turns fail closed', () => {
  const circle = syntheticCircle();
  const metrics = pathMetrics(circle);
  const stream = buildCornerProbeStream(
    { id: 'distributed' },
    circle,
    metrics,
    [{ canonicalDistance: 0 }, { canonicalDistance: metrics.total }],
    { id: 'canonical', width: 1000, height: 760 },
    config,
  );
  const canonicalTurn = stream.probes.at(-1).heading - stream.probes[0].heading;
  assert.ok(Math.abs(canonicalTurn) > 300);
  const responsive = buildCornerProbeStream(
    { id: 'distributed' },
    circle,
    metrics,
    [{ canonicalDistance: 0 }, { canonicalDistance: metrics.total }],
    config.profiles[1],
    config,
  );
  const responsiveTurn = responsive.probes.at(-1).heading - responsive.probes[0].heading;
  assert.ok(Math.abs(responsiveTurn) > 300);
  assert.equal(Math.sign(responsiveTurn), Math.sign(canonicalTurn));

  const concentrated = [{
    p0: { x: 500, y: 185.2303448275862 },
    p1: { x: 790.4092404481066, y: 224.7517533967522 },
    p2: { x: 607.4797997751646, y: 189.98107221553056 },
    p3: { x: 501.4848990605608, y: 212.8679361831803 },
  }];
  const concentratedMetrics = pathMetrics(concentrated);
  assert.throws(() => buildCornerProbeStream(
    { id: 'concentrated' },
    concentrated,
    concentratedMetrics,
    [{ canonicalDistance: 0 }, { canonicalDistance: concentratedMetrics.total }],
    { id: 'canonical', width: 1000, height: 760 },
    config,
  ), /under-samples a continuous turn/);
  assert.throws(() => buildCornerProbeStream(
    { id: 'concentrated' },
    concentrated,
    concentratedMetrics,
    [{ canonicalDistance: 0 }, { canonicalDistance: concentratedMetrics.total }],
    config.profiles[1],
    config,
  ), /concentrated\/mobile corner probe \d+ under-samples a continuous turn/);
});

test('neutral equality, one-neutral bridging, and exact broad activation boundaries are executable', () => {
  const make = (headings) => headings.map((heading) => ({ heading, windowTurn: 0 }));
  assert.deepEqual(
    selectCornerRegions(make([0, 0.05, 10, 20, 30])).broad,
    [{ start: 0, end: 4, sign: 1 }],
  );
  assert.deepEqual(
    selectCornerRegions(make([0, 10, 10.049, 20.049, 30.049])).broad,
    [{ start: 0, end: 4, sign: 1 }],
  );
  assert.deepEqual(
    selectCornerRegions(make([0, 10, 20, 30])).broad,
    [{ start: 0, end: 3, sign: 1 }],
  );
  assert.deepEqual(selectCornerRegions(make([0, 10, 20, 29.9999])).broad, []);
});

test('prominence equality, plateau, earlier ties, and exact join promotion select deterministic apexes', () => {
  const candidates = (turns, boundaryAt = -1) => turns.map((windowTurn, index) => ({
    kind: index === boundaryAt ? 'boundary' : 'base',
    index: index === boundaryAt ? 7 : index,
    canonicalDistance: index * 10,
    windowTurn,
  }));
  const region = [{ start: 1, end: 5, sign: 1 }];
  const exactValley = candidates([0, 15, 20, 10, 20, 15, 0]);
  const split = cornersForRegions({ id: 'prominence' }, exactValley, region, new Map(), 6);
  assert.deepEqual(split.map(({ entryIndex, apexIndex, exitIndex }) => (
    [entryIndex, apexIndex, exitIndex]
  )), [[0, 2, 3], [3, 4, 6]]);

  const aboveValley = candidates([0, 15, 20, 10.0001, 20, 15, 0]);
  const tied = cornersForRegions({ id: 'tie' }, aboveValley, region, new Map(), 6);
  assert.equal(tied.length, 1);
  assert.equal(tied[0].apexIndex, 2);

  const plateau = candidates([0, 15, 20, 20, 15, 14, 0]);
  assert.equal(
    cornersForRegions({ id: 'plateau' }, plateau, region, new Map(), 6)[0].apexIndex,
    2,
  );

  const joinCandidates = candidates([0, 15, 30, 20, 15, 14, 0], 3);
  const promoted = cornersForRegions(
    { id: 'join' },
    joinCandidates,
    region,
    new Map([[7, 45]]),
    15,
  );
  assert.equal(promoted[0].apexIndex, 3);
  assert.equal(promoted[0].forcedBoundaryIndex, 7);
  const below = cornersForRegions(
    { id: 'join-below' },
    joinCandidates,
    region,
    new Map([[7, 44.9999]]),
    15,
  );
  assert.equal(below[0].apexIndex, 2);
  assert.equal(below[0].forcedBoundaryIndex, null);
});

test('drift magnitude floor, linear scaling, cap, smoothstep, and finite boundary are exact', () => {
  assert.equal(driftMagnitudeForStrength(0), 15);
  assert.equal(driftMagnitudeForStrength(15), 15);
  assert.equal(driftMagnitudeForStrength(52.5), 28.5);
  assert.equal(driftMagnitudeForStrength(90), 42);
  assert.equal(driftMagnitudeForStrength(900), 42);
  assert.throws(() => driftMagnitudeForStrength(NaN), /finite/);
  assert.equal(smoothstep(0), 0);
  assert.equal(smoothstep(0.5), 0.5);
  assert.equal(smoothstep(1), 1);
});

test('responsive start/end windows clamp to route endpoints and missing probes fail contextually', () => {
  const cubics = syntheticCircle();
  const canonicalMetrics = pathMetrics(cubics);
  const unit = canonicalMetrics.total / 512;
  const frame = (canonicalDistance) => ({
    canonicalDistance,
    percent: serializeFour(98.8 * canonicalDistance / canonicalMetrics.total),
    driftYaw: '0',
    driftUprightYaw: '0',
  });
  const apply = (id, distances, apexInCandidates = true) => {
    const frames = distances.map(frame);
    const [entry, apex, exit] = distances.map((canonicalDistance, index) => ({
      kind: 'base',
      index,
      canonicalDistance,
    }));
    const candidates = apexInCandidates ? [entry, apex, exit] : [entry, exit];
    return applyCornerDrift(
      { id },
      cubics,
      frames,
      config.profiles[0],
      config,
      {
        canonicalMetrics,
        candidates,
        corners: [{
          sign: 1,
          entry,
          apex,
          exit,
          entryIndex: 0,
          apexIndex: 1,
          exitIndex: 2,
          forcedBoundaryIndex: null,
        }],
      },
    );
  };
  for (const [id, distances] of [
    ['start-window', [0, 2 * unit, 10 * unit]],
    ['end-window', [canonicalMetrics.total - 10 * unit,
      canonicalMetrics.total - 2 * unit, canonicalMetrics.total]],
  ]) {
    const result = apply(id, distances);
    assert.equal(result.frames[0].driftYaw, '0');
    assert.ok(Number(result.frames[1].driftYaw) > 0);
    assert.equal(result.frames[2].driftYaw, '0');
  }
  assert.throws(
    () => apply('missing-window', [0, 2.125 * unit, 10 * unit], false),
    /missing-window\/desktop corner 1 window end is missing a responsive tangent probe/,
  );
});

test('compiled canonical detector reproduces exact generic Ridge and Cypress topology', () => {
  const expected = new Map([
    ['ridge-pass', [
      [-1, 29, 35, 36], [1, 66, 81, 95], [-1, 116, 137, 153],
      [1, 175, 182, 191], [-1, 193, 194, 199], [1, 246, 'boundary-8', 265],
      [-1, 341, 359, 385], [1, 446, 454, 467],
    ]],
    ['cypress-run', [
      [1, 51, 66, 76], [-1, 79, 89, 99], [1, 130, 142, 172],
      [-1, 212, 225, 235], [-1, 235, 247, 259], [1, 302, 325, 340],
      [1, 440, 454, 463], [1, 475, 486, 496],
    ]],
    ['lantern-coil', [
      [1, 24, 37, 54], [1, 186, 216, 232], [1, 331, 355, 371],
      [1, 434, 451, 484], [1, 494, 502, 507],
    ]],
  ]);
  for (const route of [ridge, cypress, lantern]) {
    const analysis = detectCourseCorners(
      route,
      parseCubicPath(route.path, config.viewBox),
      config,
    );
    assert.equal(analysis.candidates.filter(({ kind }) => kind === 'base').length, 513);
    assert.deepEqual(analysis.corners.map((corner) => [
      corner.sign,
      corner.entry.index,
      corner.apex.kind === 'boundary' ? `boundary-${corner.apex.index}` : corner.apex.index,
      corner.exit.index,
    ]), expected.get(route.id));
  }
});

test('responsive projection preserves route-turn sign and emits bounded visual yaw', () => {
  const expected = new Map([
    ['ridge-pass/desktop', [
      '5.5961/6.7539/6.9469', '12.9289/15.6305/18.332',
      '22.5773/26.4367/29.4286', '33.7695/35.3133/36.857',
      '37.243/37.4359/38.4008', '47.2773/48.5111/50.9438',
      '65.8023/69.0828/73.907', '85.8711/87.4148/90.1164',
    ]],
    ['ridge-pass/mobile', [
      '5.5961/6.7539/6.9469', '11.9641/15.4375/18.1717',
      '21.6125/26.2437/29.6368', '33.1906/34.3484/36.4711',
      '36.857/37.243/38.4008', '47.8562/49.2289/52.1016',
      '65.8023/70.0477/76.0297', '86.8359/88.1867/90.3094',
    ]],
    ['cypress-run/desktop', [
      '10.4203/13.3148/14.8586', '15.4375/16.9812/19.1039',
      '25.2789/27.7875/32.9977', '41.1023/43.8039/45.3477',
      '45.3477/47.2773/49.593', '58.4695/62.5219/65.4164',
      '85.6781/88.3797/89.9234', '91.8531/93.5898/95.5195',
    ]],
    ['cypress-run/mobile', [
      '7.9117/10.6133/13.7008', '14.6656/17.5602/19.2969',
      '24.1211/26.2437/33.7695', '39.9445/42.4531/45.3477',
      '45.3477/49.0141/51.1367', '57.6977/63.4867/66.1883',
      '81.8187/84.7133/87.4148', '91.2742/94.5547/96.2914',
    ]],
    ['lantern-coil/desktop', [
      '4.4383/6.5609/9.4555', '36.0852/41.2953/43.9969',
      '64.0656/68.3109/71.2055', '83.9414/87.0289/93.2039',
      '95.3266/96.8703/97.8352',
    ]],
    ['lantern-coil/mobile', [
      '5.7891/9.2625/13.8937', '35.5063/43.225/47.2773',
      '63.4867/69.4688/73.3281', '83.3625/87.2219/93.9758',
      '95.3266/96.6773/97.6422',
    ]],
  ]);
  for (const item of compile().schedules) {
    for (const profileName of ['desktop', 'mobile']) {
      const schedule = item[profileName];
      assert.deepEqual(schedule.corners.map((corner) => [
        schedule.frames[corner.entryFrameIndex].percent,
        schedule.frames[corner.apexFrameIndex].percent,
        schedule.frames[corner.exitFrameIndex].percent,
      ].join('/')), expected.get(`${item.route.id}/${profileName}`));
      for (const corner of schedule.corners) {
        const entry = schedule.frames[corner.entryFrameIndex];
        const apex = schedule.frames[corner.apexFrameIndex];
        const exit = schedule.frames[corner.exitFrameIndex];
        assert.equal(entry.driftYaw, '0');
        assert.equal(exit.driftYaw, '0');
        assert.equal(Math.sign(Number(apex.driftYaw)), corner.sign);
        assert.equal(Math.sign(corner.peakYaw), corner.sign);
        assert.ok(Math.abs(Number(apex.driftYaw)) >= 15);
        assert.ok(Math.abs(Number(apex.driftYaw)) <= 42);
        const entryHalf = schedule.frames.slice(
          corner.entryFrameIndex,
          corner.apexFrameIndex + 1,
        ).map((frame) => Math.abs(Number(frame.driftYaw)));
        const exitHalf = schedule.frames.slice(
          corner.apexFrameIndex,
          corner.exitFrameIndex + 1,
        ).map((frame) => Math.abs(Number(frame.driftYaw)));
        entryHalf.slice(1).forEach((value, index) => {
          assert.ok(value >= entryHalf[index], 'entry-to-apex yaw must be monotonic');
        });
        exitHalf.slice(1).forEach((value, index) => {
          assert.ok(value <= exitHalf[index], 'apex-to-exit yaw must be monotonic');
        });
      }
      schedule.frames.forEach((frame) => {
        assert.equal(frame.driftUprightYaw, serializeFour(-Number(frame.driftYaw)));
      });
      schedule.frames.forEach((frame, frameIndex) => {
        if (Number(frame.driftYaw) === 0) return;
        const owners = schedule.corners.filter((corner) => (
          frameIndex > corner.entryFrameIndex && frameIndex < corner.exitFrameIndex
        ));
        assert.equal(owners.length, 1);
        assert.equal(Math.sign(Number(frame.driftYaw)), owners[0].sign);
      });
      for (let index = 1; index < schedule.corners.length; index += 1) {
        const previous = schedule.corners[index - 1];
        const current = schedule.corners[index];
        schedule.frames.slice(
          previous.exitFrameIndex,
          current.entryFrameIndex + 1,
        ).forEach((frame) => assert.equal(frame.driftYaw, '0'));
      }
      const adjacentYawDeltas = schedule.frames.slice(1).map((frame, index) => (
        Math.abs(Number(frame.driftYaw) - Number(schedule.frames[index].driftYaw))
      ));
      assert.ok(Math.max(...adjacentYawDeltas) < 45);
      const corner = schedule.corners.find((item) => (
        item.apexFrameIndex - item.entryFrameIndex > 2
      ));
      const frameIndex = corner.entryFrameIndex + 1;
      const frame = schedule.frames[frameIndex];
      const entryDistance = schedule.frames[corner.entryFrameIndex].canonicalDistance;
      const apexDistance = schedule.frames[corner.apexFrameIndex].canonicalDistance;
      const t = (frame.canonicalDistance - entryDistance) / (apexDistance - entryDistance);
      assert.equal(
        Number(frame.driftYaw),
        roundFour(corner.peakYaw * smoothstep(t)),
      );
    }
  }
});

test('outer region landmarks skip inserted boundaries while forced apexes retain them', () => {
  const analysis = compile().schedules[0].cornerAnalysis;
  const passLadder = analysis.corners[1];
  const boundaryThree = analysis.candidates.find(({ kind, index }) => (
    kind === 'boundary' && index === 3
  ));
  assert.equal(passLadder.exit.kind, 'base');
  assert.equal(passLadder.exit.index, 95);
  assert.ok(boundaryThree.canonicalDistance < passLadder.exit.canonicalDistance);
  assert.equal(analysis.corners[5].apex.kind, 'boundary');
  assert.equal(analysis.corners[5].apex.index, 8);
});

test('responsive landmark projection rejects collapse and overlapping envelopes', () => {
  const cubics = parseCubicPath(ridge.path, config.viewBox);
  const item = compile().schedules[0];
  assert.throws(() => applyCornerDrift(
    ridge,
    cubics,
    [item.desktop.frames[0], item.desktop.frames.at(-1)],
    config.profiles[0],
    config,
    item.cornerAnalysis,
  ), /projected corner landmarks collapse/);

  const overlapping = {
    ...item.cornerAnalysis,
    corners: item.cornerAnalysis.corners.slice(0, 2).map((corner) => ({ ...corner })),
  };
  overlapping.corners[0].exit = overlapping.corners[1].apex;
  overlapping.corners[0].exitIndex = overlapping.corners[1].apexIndex;
  assert.throws(() => applyCornerDrift(
    ridge,
    cubics,
    item.desktop.frames,
    config.profiles[0],
    config,
    overlapping,
  ), /projected corner envelopes overlap/);
});

test('static headings come from responsive source locators in exact slot order', () => {
  for (const route of [ridge, cypress, lantern]) {
    const cubics = parseCubicPath(route.path, config.viewBox);
    const desktop = generateStaticHeadings(route, cubics, config.profiles[0], config);
    const mobile = generateStaticHeadings(route, cubics, config.profiles[1], config);
    assert.equal(desktop.length, 16);
    assert.equal(mobile.length, 16);
    assert.equal(desktop.some((heading, index) => heading.heading !== mobile[index].heading), true);
    for (const headings of [desktop, mobile]) {
      headings.forEach(({ heading, uprightHeading }) => {
        assert.equal(Number(heading) + Number(uprightHeading), 0);
      });
    }
  }
});

test('frame and slot derivatives use outgoing start/boundary/final and map-space locators', () => {
  const output = compile();
  for (const [routeIndex, route] of [ridge, cypress, lantern].entries()) {
    const cubics = parseCubicPath(route.path, config.viewBox);
    for (const [profileName, profile] of [
      ['desktop', config.profiles[0]], ['mobile', config.profiles[1]],
    ]) {
      const frames = output.schedules[routeIndex][profileName].frames;
      assert.deepEqual(frames[0].derivative, cubicDerivative(cubics[0], 0));
      assert.deepEqual(frames.at(-1).derivative, cubicDerivative(cubics.at(-1), 1));
      for (let boundary = 1; boundary < cubics.length; boundary += 1) {
        const frame = frames.find(({ kind, index }) => kind === 'boundary' && index === boundary);
        assert.deepEqual(frame.derivative, cubicDerivative(cubics[boundary], 0));
      }

      const expected = [];
      let curveOffset = 0;
      for (const segment of route.segments) {
        const segmentCubics = cubics.slice(curveOffset, curveOffset + segment.curveCount);
        const metrics = pathMetrics(segmentCubics);
        for (const locator of segment.anchors) {
          const derivative = locator.at === 1
            && curveOffset + segment.curveCount < cubics.length
            ? cubicDerivative(cubics[curveOffset + segment.curveCount], 0)
            : pointAtDistance(segmentCubics, metrics, metrics.total * locator.at).derivative;
          expected.push(serializeFour(headingForDerivative(derivative, profile, config)));
        }
        curveOffset += segment.curveCount;
      }
      assert.deepEqual(
        output.schedules[routeIndex][`${profileName}StaticHeadings`]
          .map(({ heading }) => heading),
        expected,
      );

      const changedOffsets = clone(route);
      changedOffsets.segments.forEach((segment) => segment.anchors.forEach((anchor) => {
        anchor.lateralOffset = anchor.lateralOffset === 27 ? -27 : 27;
      }));
      assert.deepEqual(
        generateStaticHeadings(changedOffsets, cubics, profile, config),
        output.schedules[routeIndex][`${profileName}StaticHeadings`],
      );
      assert.equal(expected.some((heading, slot) => {
        const anchor = output.trackInput[routeIndex].routeAnchors[slot];
        const nearest = frames.reduce((best, frame) => (
          Math.hypot(Number(frame.left) * 10 - anchor.x, Number(frame.top) * 7.6 - anchor.y)
            < Math.hypot(Number(best.left) * 10 - anchor.x, Number(best.top) * 7.6 - anchor.y)
            ? frame : best
        ));
        return heading !== nearest.heading;
      }), true, `${route.id}/${profileName} static headings must not come from nearest frames`);
    }
  }
});

test('heading failures include bounded route/profile/frame or slot context', () => {
  const profile = config.profiles[0];
  const zeroStart = [{
    p0: { x: 100, y: 100 }, p1: { x: 100, y: 100 },
    p2: { x: 300, y: 100 }, p3: { x: 500, y: 100 },
  }];
  assert.throws(
    () => generateSchedule({ id: 'synthetic' }, zeroStart, profile, config),
    /synthetic\/desktop heading frame 0 scaled derivative magnitude/,
  );

  const reversal = [
    {
      p0: { x: 100, y: 100 }, p1: { x: 200, y: 100 },
      p2: { x: 400, y: 100 }, p3: { x: 500, y: 100 },
    },
    {
      p0: { x: 500, y: 100 }, p1: { x: 400, y: 100 },
      p2: { x: 300, y: 100 }, p3: { x: 200, y: 100 },
    },
  ];
  assert.throws(
    () => generateSchedule({ id: 'synthetic' }, reversal, profile, config),
    /synthetic\/desktop heading \d+ has an ambiguous 180-degree reversal/,
  );

  const locators = Array.from({ length: 16 }, (_, index) => ({
    at: index / 15, lateralOffset: 0,
  }));
  assert.throws(() => generateStaticHeadings({
    id: 'synthetic',
    segments: [{ curveCount: 1, anchors: locators }],
  }, zeroStart, profile, config), /synthetic\/desktop slot 0 scaled derivative magnitude/);
  assert.throws(
    () => headingForDerivative({ x: Infinity, y: 0 }, profile, config, 'ridge-pass/mobile frame 7'),
    /ridge-pass\/mobile frame 7 derivative x must be finite/,
  );
});

test('all pre-heading schedule percentages, positions, and visible opacity are pinned', () => {
  const expected = new Map([
    ['ridge-pass/desktop', '998956742b19fdfe29773145cb7e72aeb79d040c06dc800837dc652abb987bb9'],
    ['ridge-pass/mobile', '4a52fd7029bf9719db251c8d74217afbef532a4c7e7861d572d49e155a29787f'],
    ['cypress-run/desktop', '6b9cd28c7def47fdf88ed2a232fb02650f4de75941d061e685719f75c876f2e3'],
    ['cypress-run/mobile', '9accf028b75799d3b85214236fcd6bfc68844ed9ac4bfc8d95fcf905c486e1e9'],
    ['lantern-coil/desktop', '844bf7abf6ac9351d8364088a755f55359f4e0de06a8d51715bab387fbd0caed'],
    ['lantern-coil/mobile', '9d0a08fb506dcfd420fab30a554f038e72f5a7233bf7ea214111c84392ffcf23'],
  ]);
  for (const item of compile().schedules) {
    for (const profileName of ['desktop', 'mobile']) {
      const frames = item[profileName].frames.map((frame, index, all) => [
        frame.percent,
        frame.left,
        frame.top,
        index === 0 || index === all.length - 1 ? 1 : null,
      ]);
      const digest = createHash('sha256').update(JSON.stringify(frames)).digest('hex');
      assert.equal(digest, expected.get(`${item.route.id}/${profileName}`));
    }
  }
});

test('generated anchors preserve IDs, capacities, labels, angle and migration tolerance', () => {
  const output = compile();
  output.trackInput.forEach((track, trackIndex) => {
    const legacy = LEGACY_ROUTE_MIGRATION.anchors[track.id];
    assert.deepEqual(track.routeAnchors.map(({ id }) => id),
      Array.from({ length: 16 }, (_, index) => `R${String(index + 1).padStart(2, '0')}`));
    assert.deepEqual(track.segments.map((segment) => (
      track.routeAnchors.filter(({ poolLabel }) => poolLabel === segment).length
    )), [2, 3, 3, 3, 3, 2]);
    assert.equal(track.routeAnchors.every(({ angle }) => angle === 0), true);
    if (!legacy) return;
    track.routeAnchors.forEach((anchor, index) => {
      assert.ok(Math.hypot(
        anchor.x - legacy[index][0],
        anchor.y - legacy[index][1],
      ) <= 0.5);
    });
  });
});

test('anchor target audit rejects clipping and pairwise separation failures', () => {
  assert.throws(() => auditAnchorTargets([
    { id: 'R01', x: 0, y: 100 },
  ], config, 'synthetic'), /clipped/);
  assert.throws(() => auditAnchorTargets([
    { id: 'R01', x: 100, y: 100 },
    { id: 'R02', x: 101, y: 101 },
  ], config, 'synthetic'), /overlap/);
});

test('base-plus-boundary schedules have exact current counts and pinned audits', () => {
  const output = compile();
  for (const [trackIndex, expected] of [[0, 527], [1, 533]]) {
    for (const profile of ['desktop', 'mobile']) {
      const schedule = output.schedules[trackIndex][profile];
      assert.equal(schedule.frames.length, expected);
      assert.ok(schedule.maximumDeviation <= 0.5);
      assert.equal(schedule.groupLengths.length, 64);
      const mean = schedule.groupLengths.reduce((sum, value) => sum + value, 0) / 64;
      assert.ok((Math.max(...schedule.groupLengths) - Math.min(...schedule.groupLengths))
        / mean * 100 <= 5);
      assert.equal(schedule.frames[0].percent, '0');
      assert.equal(schedule.frames.at(-1).percent, '98.8');
      assert.equal(schedule.frames.filter(({ kind }) => kind === 'base').length, 513);
      assert.equal(schedule.frames.filter(({ kind }) => kind === 'boundary').length, expected - 513);
    }
  }
  const ridgeDesktop = output.schedules[0].desktop;
  const formerFailure = ridgeDesktop.frames.find(({ kind, index }) => (
    kind === 'boundary' && index === 8
  ));
  assert.equal(formerFailure.percent, serializeFour(98.8 * 251.3936 / 512));
});

test('Ridge boundary 8 preserves authored and preceding-frame profile turns', () => {
  const output = compile();
  const cubics = parseCubicPath(ridge.path, config.viewBox);
  const shortestTurn = (first, second) => Math.abs(
    ((second - first + 180) % 360 + 360) % 360 - 180,
  );
  for (const [profileName, profile, expected] of [
    ['desktop', config.profiles[0], {
      percent: '48.5111', previousPercent: '48.4352',
      authored: 117.871578, preceding: 118.186960,
    }],
    ['mobile', config.profiles[1], {
      percent: '49.2289', previousPercent: '49.207',
      authored: 64.613624, preceding: 64.701536,
    }],
  ]) {
    const frames = output.schedules[0][profileName].frames;
    const boundaryIndex = frames.findIndex((frame) => (
      frame.kind === 'boundary' && frame.index === 8
    ));
    const boundary = frames[boundaryIndex];
    const previous = frames[boundaryIndex - 1];
    assert.equal(boundary.percent, expected.percent);
    assert.equal(previous.percent, expected.previousPercent);
    const incoming = headingForDerivative(cubicDerivative(cubics[7], 1), profile, config);
    const outgoing = headingForDerivative(cubicDerivative(cubics[8], 0), profile, config);
    assert.ok(Math.abs(shortestTurn(incoming, outgoing) - expected.authored) <= 0.0001);
    assert.ok(Math.abs(
      shortestTurn(
        headingForDerivative(previous.derivative, profile, config),
        outgoing,
      ) - expected.preceding,
    ) <= 0.0001);
  }
});

test('Ridge desktop base-only interval 251 reproduces the audited blocker', () => {
  const cubics = parseCubicPath(ridge.path, config.viewBox);
  const profile = config.profiles[0];
  const scale = { x: profile.width / 1000, y: profile.height / 760 };
  const metrics = pathMetrics(cubics, scale);
  const baseFrame = (index) => {
    const point = pointAtDistance(cubics, metrics, metrics.total * index / 512).point;
    return {
      percent: Number(serializeFour(98.8 * index / 512)),
      left: Number(serializeFour(point.x / 10)),
      top: Number(serializeFour(point.y / 7.6)),
    };
  };
  const first = baseFrame(251);
  const second = baseFrame(252);
  let maximum = 0;
  for (let eighth = 0; eighth <= 8; eighth += 1) {
    const mix = eighth / 8;
    const timeline = first.percent + (second.percent - first.percent) * mix;
    const exact = pointAtDistance(cubics, metrics, metrics.total * timeline / 98.8).point;
    const x = (first.left + (second.left - first.left) * mix) / 100 * profile.width;
    const y = (first.top + (second.top - first.top) * mix) / 100 * profile.height;
    maximum = Math.max(maximum, Math.hypot(x - exact.x * scale.x, y - exact.y * scale.y));
  }
  assert.ok(maximum > 0.5, `base-only interval unexpectedly measured ${maximum}px`);
  assert.ok(compile().schedules[0].desktop.maximumDeviation <= 0.5);
});

test('legacy paths and every visible legacy schedule frame stay within migration deltas', () => {
  const output = compile();
  for (const [trackIndex, source] of [ridge, cypress].entries()) {
    const generated = output.geometry[trackIndex];
    const legacyCubics = parseCubicPath(LEGACY_ROUTE_MIGRATION.paths[source.id], config.viewBox);
    const generatedCubics = parseCubicPath(generated.centerlineD, config.viewBox);
    assert.deepEqual(generatedCubics, legacyCubics);
    let offset = 0;
    generated.segmentPaths.forEach((segment, segmentIndex) => {
      const segmentCubics = parseCubicPath(segment.d, config.viewBox);
      assert.deepEqual(
        segmentCubics,
        legacyCubics.slice(offset, offset + source.segments[segmentIndex].curveCount),
      );
      offset += source.segments[segmentIndex].curveCount;
    });
    for (const [profileName, width, height] of [
      ['desktop', 1160, 682],
      ['mobile', 372, 580],
    ]) {
      const current = output.schedules[trackIndex][profileName].frames;
      const legacy = LEGACY_ROUTE_MIGRATION.schedules[`${source.id}-${profileName}`];
      for (const frame of legacy) {
        let right = current.findIndex((candidate) => Number(candidate.percent) >= frame.percent);
        if (right < 1) right = 1;
        const before = current[right - 1];
        const after = current[right];
        const mix = (frame.percent - Number(before.percent))
          / (Number(after.percent) - Number(before.percent));
        const left = Number(before.left) + (Number(after.left) - Number(before.left)) * mix;
        const top = Number(before.top) + (Number(after.top) - Number(before.top)) * mix;
        assert.ok(Math.hypot(
          (left - frame.left) / 100 * width,
          (top - frame.top) / 100 * height,
        ) <= 0.75, `${source.id}/${profileName}/${frame.percent}% migration delta`);
      }
    }
  }
});

test('candidate collision precedence retains a boundary at an every-eighth milestone', () => {
  const items = [
    { kind: 'base', index: 0, fraction: 0, percent: '0' },
    { kind: 'base', index: 8, fraction: 8 / 512, percent: '1.5438' },
    { kind: 'boundary', index: 1, fraction: 8 / 512, percent: '1.5438' },
    { kind: 'base', index: 512, fraction: 1, percent: '98.8' },
  ];
  const merged = mergeScheduleCandidates(items);
  assert.equal(merged[1].kind, 'boundary');
  assert.equal(merged[1].index, 1);
});

test('chords adjacent to a base milestone enter the correct speed groups', () => {
  const milestones = Array.from({ length: 65 }, (_, index) => serializeFour(98.8 * index / 64));
  assert.equal(speedGroupForChord('1.4', milestones[1], milestones), 0);
  assert.equal(speedGroupForChord(milestones[1], '1.7', milestones), 1);
  assert.throws(() => speedGroupForChord('1.4', '1.7', milestones), /crosses/);
});

test('serialized boundary endpoint and multi-boundary collisions are rejected separately', () => {
  const endpoints = [
    { kind: 'base', index: 0, fraction: 0, percent: '0' },
    { kind: 'boundary', index: 1, fraction: 0.0000001, percent: '0' },
    { kind: 'base', index: 512, fraction: 1, percent: '98.8' },
  ];
  assert.throws(() => mergeScheduleCandidates(endpoints), /endpoint 0%/);
  endpoints[1] = { kind: 'boundary', index: 1, fraction: 0.9999999, percent: '98.8' };
  assert.throws(() => mergeScheduleCandidates(endpoints), /endpoint 98.8%/);
  assert.throws(() => mergeScheduleCandidates([
    endpoints[0],
    { kind: 'boundary', index: 1, fraction: 0.5, percent: '49.4' },
    { kind: 'boundary', index: 2, fraction: 0.50000001, percent: '49.4' },
    endpoints[2],
  ]), /multiple boundaries/);
});

test('generated serialization is deterministic, owned, precise and reset-stable', () => {
  const first = compile();
  const second = compileRoutes(config, [ridge, cypress, lantern], '0'.repeat(64));
  assert.equal(first.mjs, second.mjs);
  assert.equal(first.css, second.css);
  assert.match(first.mjs, /^\/\/ @generated by dashboard\/scripts\/compile-routes\.mjs/);
  assert.match(first.css, /^\/\* @generated by dashboard\/scripts\/compile-routes\.mjs/);
  assert.doesNotMatch(`${first.mjs}${first.css}`, /Users\/|timestamp|sourceMappingURL|https?:\/\//);
  assert.equal(first.mjs.endsWith('\n'), true);
  assert.equal(first.css.endsWith('\n'), true);
  assert.equal((first.css.match(/99\.2% \{/g) ?? []).length, 6);
  assert.equal((first.css.match(/99\.6% \{/g) ?? []).length, 6);
  assert.equal((first.css.match(/100% \{/g) ?? []).length, 6);
  assert.equal((first.css.match(/vehicle-anchor\[data-route-slot="\d+"\]/g) ?? []).length, 96);
  assert.equal((first.css.match(/--route-heading:/g) ?? []).length, 3290);
  assert.equal((first.css.match(/--drift-yaw:/g) ?? []).length, 3194);
  assert.doesNotMatch(first.css, /@property\s+--/);
  for (const item of first.schedules) {
    for (const profileName of ['desktop', 'mobile']) {
      const frames = item[profileName].frames;
      frames.forEach((frame) => {
        assert.equal(Number(frame.heading) + Number(frame.uprightHeading), 0);
      });
    }
  }
  assert.equal(serializeFour(-0), '0');
  const normalizedNonYawCss = first.css
    .replace(/sources-sha256: [0-9a-f]{64}/, 'sources-sha256: <digest>')
    .replace(
      /--drift-yaw: -?\d+(?:\.\d+)?deg; --drift-upright-yaw: -?\d+(?:\.\d+)?deg;/g,
      '--drift-yaw: <yaw>; --drift-upright-yaw: <inverse>;',
    );
  assert.equal(
    createHash('sha256').update(normalizedNonYawCss).digest('hex'),
    'eff7c90d4e365a7d90ff5fa9c54fd0b29f1a04b7550d7472cab279cd6576bfbb',
  );
});

test('generated slot selectors and every frame declaration have exact order and reset headings', () => {
  const output = compile();
  const selectorPattern = /\.dashboard-root\[data-track-id="([^"]+)"\] \.vehicle-anchor\[data-route-slot="(\d+)"\]/g;
  const selectors = [...output.css.matchAll(selectorPattern)].map((match) => ({
    track: match[1], slot: Number(match[2]),
  }));
  assert.equal(selectors.length, 96);
  for (const track of ['ridge-pass', 'cypress-run', 'lantern-coil']) {
    assert.deepEqual(
      selectors.filter((item) => item.track === track).map(({ slot }) => slot),
      [...Array.from({ length: 16 }, (_, index) => index),
        ...Array.from({ length: 16 }, (_, index) => index)],
    );
  }

  for (const item of output.schedules) {
    for (const [profileName, animationName] of [
      ['desktop', item.route.desktopAnimationName],
      ['mobile', item.route.mobileAnimationName],
    ]) {
      const start = output.css.indexOf(`@keyframes ${animationName} {`);
      const end = output.css.indexOf('\n}\n', start);
      const declarations = output.css.slice(start, end)
        .split('\n')
        .filter((line) => /^\s+\d/.test(line));
      const frames = item[profileName].frames;
      assert.equal(declarations.length, frames.length + 3);
      declarations.forEach((line) => {
        assert.equal((line.match(/left:/g) ?? []).length, 1);
        assert.equal((line.match(/top:/g) ?? []).length, 1);
        assert.equal((line.match(/--route-heading:/g) ?? []).length, 1);
        assert.equal((line.match(/--route-upright-heading:/g) ?? []).length, 1);
        assert.equal((line.match(/--drift-yaw:/g) ?? []).length, 1);
        assert.equal((line.match(/--drift-upright-yaw:/g) ?? []).length, 1);
        assert.ok(line.indexOf('left:') < line.indexOf('top:'));
        assert.ok(line.indexOf('top:') < line.indexOf('--route-heading:'));
        assert.ok(line.indexOf('--route-heading:') < line.indexOf('--route-upright-heading:'));
        assert.ok(line.indexOf('--route-upright-heading:') < line.indexOf('--drift-yaw:'));
        assert.ok(line.indexOf('--drift-yaw:') < line.indexOf('--drift-upright-yaw:'));
        if (line.includes('opacity:')) {
          assert.ok(line.indexOf('--drift-upright-yaw:') < line.indexOf('opacity:'));
        }
      });
      const first = frames[0];
      const final = frames.at(-1);
      for (const [percent, frame, opacity] of [
        ['98.8', final, '1'], ['99.2', final, '0'],
        ['99.6', first, '0'], ['100', first, '1'],
      ]) {
        const line = declarations.find((value) => value.trimStart().startsWith(`${percent}%`));
        assert.match(line, new RegExp(
          `--route-heading: ${frame.heading}deg; `
            + `--route-upright-heading: ${frame.uprightHeading}deg; `
            + `--drift-yaw: ${frame.driftYaw}deg; `
            + `--drift-upright-yaw: ${frame.driftUprightYaw}deg; opacity: ${opacity};`,
        ));
      }
    }
  }
});

test('source digest is order, delimiter, line-ending, and byte sensitive', () => {
  const base = [
    { path: 'a', contents: Buffer.from('one\n') },
    { path: 'b', contents: Buffer.from('two\n') },
  ];
  const digest = sourceDigest(base);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(sourceDigest([...base].reverse()), digest);
  assert.notEqual(sourceDigest([{ ...base[0], contents: Buffer.from('one\r\n') }, base[1]]), digest);
  assert.notEqual(sourceDigest([{ path: 'a\0one', contents: Buffer.from('\ntwo\n') }]), digest);
});

test('checked-in generated exports are exact and deeply frozen', () => {
  for (const value of [GENERATED_TRACK_INPUT, GENERATED_ROUTE_GEOMETRY]) {
    assert.equal(Object.isFrozen(value), true);
    const visit = (item) => {
      if (!item || typeof item !== 'object') return;
      assert.equal(Object.isFrozen(item), true);
      Object.values(item).forEach(visit);
    };
    visit(value);
  }
  assert.deepEqual(Object.keys(GENERATED_TRACK_INPUT[0]), [
    'id', 'title', 'artId', 'centerlineId', 'desktopAnimationName',
    'mobileAnimationName', 'segments', 'routeAnchors',
  ]);
  assert.deepEqual(Object.keys(GENERATED_TRACK_INPUT[0].routeAnchors[0]),
    ['id', 'poolLabel', 'x', 'y', 'angle']);
});

test('artifact check detects drift without writing', async () => {
  const files = new Map([['one', 'a'], ['two', 'b']]);
  let writes = 0;
  const io = {
    readFile: async (path) => {
      if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return files.get(path);
    },
    writeFile: async () => { writes += 1; },
  };
  let errors = '';
  let output = '';
  assert.equal(await checkArtifacts({ mjs: 'a', css: 'b' }, {
    io,
    targets: [{ path: 'one', key: 'mjs' }, { path: 'two', key: 'css' }],
    write: (value) => { output += value; },
    writeError: (value) => { errors += value; },
  }), 0);
  assert.equal(output, 'routes: generated artifacts are current\n');
  files.set('two', 'drift');
  assert.equal(await checkArtifacts({ mjs: 'a', css: 'b' }, {
    io,
    targets: [{ path: 'one', key: 'mjs' }, { path: 'two', key: 'css' }],
    write() {},
    writeError: (value) => { errors += value; },
  }), 1);
  assert.equal(writes, 0);
  assert.match(errors, /two/);
  files.delete('one');
  errors = '';
  assert.equal(await checkArtifacts({ mjs: 'a', css: 'b' }, {
    io,
    targets: [{ path: 'one', key: 'mjs' }, { path: 'two', key: 'css' }],
    write() {},
    writeError: (value) => { errors += value; },
  }), 1);
  assert.match(errors, /one/);
});

test('artifact write reports the exact up-to-date success message', async () => {
  let output = '';
  const io = { readFile: async (path) => (path === 'one' ? 'a' : 'b') };
  assert.equal(await writeArtifacts({ mjs: 'a', css: 'b' }, {
    io,
    targets: [{ path: 'one', key: 'mjs' }, { path: 'two', key: 'css' }],
    write: (value) => { output += value; },
  }), 0);
  assert.equal(output, 'routes: up to date\n');
});

test('CLI usage and preparation failures return 64 and 2', async () => {
  assert.equal(await run([], { writeError() {} }), 64);
  assert.equal(await run(['--write', '--check'], { writeError() {} }), 64);
  assert.equal(await run(['--other'], { writeError() {} }), 64);
  assert.equal(await run(['--check'], {
    io: { readFile: async () => { throw new Error('synthetic read failure'); } },
    writeError() {},
  }), 2);
});

test('staging failure leaves both committed artifacts unchanged', async () => {
  const files = new Map([['one', 'old-a'], ['two', 'old-b']]);
  let stages = 0;
  const io = {
    readFile: async (path) => files.get(path),
    writeFile: async (path, value) => {
      stages += 1;
      if (stages === 2) throw Object.assign(new Error('stage failed'), { code: 'EIO' });
      files.set(path, value);
    },
    rename: async () => assert.fail('rename must not begin after staging failure'),
    rm: async (path) => { files.delete(path); },
  };
  await assert.rejects(() => writeArtifacts({ mjs: 'new-a', css: 'new-b' }, {
    io,
    targets: [{ path: 'one', key: 'mjs' }, { path: 'two', key: 'css' }],
    pid: 8,
    write() {},
  }), /stage failed/);
  assert.equal(files.get('one'), 'old-a');
  assert.equal(files.get('two'), 'old-b');
  assert.equal([...files.keys()].some((path) => path.endsWith('.tmp')), false);
});

test('failed second install rename restores both committed artifacts', async () => {
  const files = new Map([['one', 'old-a'], ['two', 'old-b']]);
  let installRenames = 0;
  const io = {
    readFile: async (path) => {
      if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return files.get(path);
    },
    writeFile: async (path, value) => {
      if (files.has(path)) throw Object.assign(new Error('exists'), { code: 'EEXIST' });
      files.set(path, value);
    },
    rename: async (from, to) => {
      if (from.endsWith('.tmp')) {
        installRenames += 1;
        if (installRenames === 2) throw Object.assign(new Error('rename failed'), { code: 'EIO' });
      }
      if (!files.has(from)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      files.set(to, files.get(from));
      files.delete(from);
    },
    rm: async (path) => { files.delete(path); },
  };
  await assert.rejects(() => writeArtifacts({ mjs: 'new-a', css: 'new-b' }, {
    io,
    targets: [{ path: 'one', key: 'mjs' }, { path: 'two', key: 'css' }],
    pid: 7,
    write() {},
  }), /rename failed/);
  assert.equal(files.get('one'), 'old-a');
  assert.equal(files.get('two'), 'old-b');
  assert.equal([...files.keys()].some((path) => /\.(?:tmp|bak)$/.test(path)), false);
});

test('generated artifacts match the checked-in bytes', () => {
  const output = compileRoutes(config, [ridge, cypress, lantern], sourceDigest([
    { path: 'routes/route-config.mjs', contents: readFileSync(new URL('../routes/route-config.mjs', import.meta.url)) },
    { path: 'routes/ridge-pass.route.mjs', contents: readFileSync(new URL('../routes/ridge-pass.route.mjs', import.meta.url)) },
    { path: 'routes/cypress-run.route.mjs', contents: readFileSync(new URL('../routes/cypress-run.route.mjs', import.meta.url)) },
    { path: 'routes/lantern-coil.route.mjs', contents: readFileSync(new URL('../routes/lantern-coil.route.mjs', import.meta.url)) },
  ]));
  assert.equal(readFileSync(new URL('../src/generated/route-geometry.mjs', import.meta.url), 'utf8'), output.mjs);
  assert.equal(readFileSync(new URL('../generated/route-motion.css', import.meta.url), 'utf8'), output.css);
});

test('HTML and base CSS contain placeholders and preserve generated-first cascade ownership', () => {
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const baseCss = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const generatedLink = index.indexOf('./generated/route-motion.css');
  const baseLink = index.indexOf('./styles.css');
  assert.ok(generatedLink >= 0 && baseLink > generatedLink);
  assert.equal((index.match(/data-route-segment-index="[0-5]"/g) ?? []).length, 18);
  for (const route of [ridge, cypress, lantern]) {
    assert.match(index, new RegExp(`id="${route.centerlineId}" fill="none"\\s*/>`));
    assert.doesNotMatch(index, new RegExp(`id="${route.centerlineId}"[^>]*\\sd=`));
  }
  assert.doesNotMatch(baseCss, /@keyframes (?:ridge-pass|cypress-run|lantern-coil)-traverse/);
  assert.doesNotMatch(baseCss, /animation(?:-name)?:\s*(?:ridge-pass|cypress-run|lantern-coil)-traverse/);
  assert.match(baseCss, /\.vehicle-anchor\s*\{[\s\S]*animation:\s*none !important/);
});
