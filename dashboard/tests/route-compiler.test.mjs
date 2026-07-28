import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import config from '../routes/route-config.mjs';
import cypress from '../routes/cypress-run.route.mjs';
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
  compileRoutes,
  generateAnchors,
  mergeScheduleCandidates,
  serializeFour,
  speedGroupForChord,
  validateSources,
} from '../scripts/lib/route-compiler.mjs';
import { LEGACY_ROUTE_MIGRATION } from './fixtures/legacy-route-migration.mjs';

const clone = (value) => structuredClone(value);
let cachedCompilation;
const compile = () => {
  cachedCompilation ??= compileRoutes(config, [ridge, cypress], '0'.repeat(64));
  return cachedCompilation;
};

test('checked-in config and routes validate with fixed cubic and segment mappings', () => {
  const validated = validateSources(config, [ridge, cypress]);
  assert.deepEqual(validated.map(({ cubics }) => cubics.length), [15, 21]);
  assert.deepEqual(ridge.segments.map(({ curveCount }) => curveCount), [1, 5, 2, 2, 4, 1]);
  assert.deepEqual(cypress.segments.map(({ curveCount }) => curveCount), [1, 4, 3, 4, 4, 5]);
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
    const routes = [clone(ridge), clone(cypress)];
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
    const routes = [clone(ridge), clone(cypress)];
    mutate(cfg, routes);
    assert.throws(() => validateSources(cfg, routes));
  }
});

test('segment cssClass references are unique across the complete catalog', () => {
  const routes = [clone(ridge), clone(cypress)];
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
  const current = ['cypress-run.route.mjs', 'ridge-pass.route.mjs'];
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
  const second = compileRoutes(config, [ridge, cypress], '0'.repeat(64));
  assert.equal(first.mjs, second.mjs);
  assert.equal(first.css, second.css);
  assert.match(first.mjs, /^\/\/ @generated by dashboard\/scripts\/compile-routes\.mjs/);
  assert.match(first.css, /^\/\* @generated by dashboard\/scripts\/compile-routes\.mjs/);
  assert.doesNotMatch(`${first.mjs}${first.css}`, /Users\/|timestamp|sourceMappingURL|https?:\/\//);
  assert.equal(first.mjs.endsWith('\n'), true);
  assert.equal(first.css.endsWith('\n'), true);
  assert.equal((first.css.match(/99\.2% \{/g) ?? []).length, 4);
  assert.equal((first.css.match(/99\.6% \{/g) ?? []).length, 4);
  assert.equal((first.css.match(/100% \{/g) ?? []).length, 4);
  assert.equal(serializeFour(-0), '0');
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
  const output = compileRoutes(config, [ridge, cypress], sourceDigest([
    { path: 'routes/route-config.mjs', contents: readFileSync(new URL('../routes/route-config.mjs', import.meta.url)) },
    { path: 'routes/ridge-pass.route.mjs', contents: readFileSync(new URL('../routes/ridge-pass.route.mjs', import.meta.url)) },
    { path: 'routes/cypress-run.route.mjs', contents: readFileSync(new URL('../routes/cypress-run.route.mjs', import.meta.url)) },
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
  assert.equal((index.match(/data-route-segment-index="[0-5]"/g) ?? []).length, 12);
  for (const route of [ridge, cypress]) {
    assert.match(index, new RegExp(`id="${route.centerlineId}" fill="none"\\s*/>`));
    assert.doesNotMatch(index, new RegExp(`id="${route.centerlineId}"[^>]*\\sd=`));
  }
  assert.doesNotMatch(baseCss, /@keyframes (?:ridge-pass|cypress-run)-traverse/);
  assert.doesNotMatch(baseCss, /animation(?:-name)?:\s*(?:ridge-pass|cypress-run)-traverse/);
  assert.match(baseCss, /\.vehicle-anchor\s*\{[\s\S]*animation:\s*none !important/);
});
