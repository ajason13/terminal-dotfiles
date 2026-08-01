import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_TRACK_ID, TRACK_CATALOG, getTrack, validateTrackCatalog,
} from '../src/track-catalog.mjs';
import {
  TRACK_WORKDAY_CLOSE_MINUTES, TRACK_WORKDAY_MIDPOINT_MINUTES,
  TRACK_WORKDAY_OPEN_MINUTES, TRACK_WORKDAY_WINDOWS_PER_DAY, autoTrackAt,
  createTrackSelectionController, localTrackSlot, nextTrackBoundary,
} from '../src/track-selection.mjs';
import { allocateSessions } from '../src/track-layout.mjs';
import { createSourceController } from '../src/source-controller.mjs';

const INDEX = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const BASE_STYLES = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const ROUTE_STYLES = readFileSync(new URL('../generated/route-motion.css', import.meta.url), 'utf8');
const STYLES = `${ROUTE_STYLES}\n${BASE_STYLES}`;
const CYPRESS_SOURCE = readFileSync(
  new URL('../routes/cypress-run.route.mjs', import.meta.url), 'utf8',
);
const LANTERN_SOURCE = readFileSync(
  new URL('../routes/lantern-coil.route.mjs', import.meta.url), 'utf8',
);
const SOURCES = [
  'app.mjs', 'render-dashboard.mjs', 'source-controller.mjs',
  'track-catalog.mjs', 'track-layout.mjs', 'track-selection.mjs',
].map((name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8')).join('\n');

const cloneCatalog = () => TRACK_CATALOG.map((track) => ({
  ...track,
  segments: [...track.segments],
  routeAnchors: track.routeAnchors.map((anchor) => ({ ...anchor })),
}));

test('catalog has exact deeply frozen three-track definitions and capacity', () => {
  assert.equal(DEFAULT_TRACK_ID, 'ridge-pass');
  assert.deepEqual(TRACK_CATALOG.map(({ id, title }) => [id, title]), [
    ['ridge-pass', 'Ridge Pass'], ['cypress-run', 'Cypress Run'],
    ['lantern-coil', 'Lantern Coil'],
  ]);
  assert.equal(Object.isFrozen(TRACK_CATALOG), true);
  for (const track of TRACK_CATALOG) {
    assert.equal(Object.isFrozen(track), true);
    assert.equal(Object.isFrozen(track.segments), true);
    assert.equal(Object.isFrozen(track.routeAnchors), true);
    assert.equal(track.routeAnchors.every(Object.isFrozen), true);
    assert.deepEqual(track.routeAnchors.map(({ id }) => id),
      Array.from({ length: 16 }, (_, index) => `R${String(index + 1).padStart(2, '0')}`));
    assert.deepEqual(track.segments.map((segment) => (
      track.routeAnchors.filter((anchor) => anchor.poolLabel === segment).length
    )), [2, 3, 3, 3, 3, 2]);
  }
  assert.deepEqual(getTrack('cypress-run').segments, [
    'Launch Line', 'North Nineties', 'East Hairpin',
    'Drop Chute', 'South Hairpin', 'West Switchback',
  ]);
  assert.deepEqual(getTrack('lantern-coil').segments, [
    'Ember Gate', 'Outer Lantern', 'Prism Rise',
    'Halo Crest', 'Inner Coil', 'Dawn Chute',
  ]);
  assert.throws(() => getTrack('missing'), /Unknown track ID/);
});

test('Lantern Coil has the exact open-spiral source and distinct rain-garden art', () => {
  assert.match(LANTERN_SOURCE, /M183\.779 529\.409 C165\.135 504\.06 65\.478 425\.334 71\.914 377\.312/);
  assert.match(LANTERN_SOURCE, /C438\.706 431\.209 420\.209 408\.733 411\.182 402\.975/);
  const start = INDEX.indexOf('id="lantern-coil-art"');
  const lanternArt = INDEX.slice(start, INDEX.indexOf('</svg>', start));
  for (const cue of [
    'lantern-water-terraces', 'lantern-pools', 'lantern-inlay-arcs',
    'lantern-reeds', 'lantern-retaining-rings',
  ]) assert.match(lanternArt, new RegExp(`class="[^\"]*${cue}`));
  for (const excluded of [
    'ridge-shadow', 'terrain-contours', 'drift-paved-apron', 'drift-tire-barriers',
    'drift-cones', 'drift-clip-markers', 'drift-service-grid', 'drift-skid-arcs',
  ]) assert.doesNotMatch(lanternArt, new RegExp(excluded));
});

test('Cypress Run is a full-map mixed technical course with nineties and vertical chutes', () => {
  const start = INDEX.indexOf('id="cypress-run-art"');
  const end = INDEX.indexOf('</svg>', start);
  const cypress = INDEX.slice(start, end);
  for (const cue of [
    'drift-paved-apron', 'drift-service-grid', 'drift-floodlight-pools',
    'drift-lane-islands', 'drift-ninety-boxes', 'drift-skid-arcs',
    'drift-apex-rings',
    'drift-tire-barriers', 'drift-cones', 'drift-clip-markers',
  ]) {
    assert.match(cypress, new RegExp(`class="[^"]*${cue}`));
  }
  for (const name of [
    'LAUNCH LINE', 'NORTH NINETIES', 'EAST HAIRPIN',
    'DROP CHUTE', 'SOUTH HAIRPIN', 'WEST SWITCHBACK',
  ]) {
    assert.match(cypress, new RegExp(`>${name}<`));
  }
  assert.match(CYPRESS_SOURCE, /C540 125 545 150 545 185 C545 230 560 270 605 270/);
  assert.match(CYPRESS_SOURCE, /C468 463 465 495 465 525 C465 560 470 590 515 605/);
  assert.match(CYPRESS_SOURCE, /C95 695 70 665 72 620 C74 575 70 530 72 500/);
  assert.ok((cypress.match(/M\d+ \d+ C/g) ?? []).length >= 6, 'hairpin and apex skid cues');
  const clipGroup = cypress.match(/class="drift-clip-markers">([\s\S]*?)<\/g>/)?.[1] ?? '';
  assert.ok((clipGroup.match(/M/g) ?? []).length >= 8, 'ninety and hairpin clip markers');
  for (const cue of [
    'ridge-shadow', 'valley-line', 'terrain-contours', 'forest-boundary',
    'tree-line', 'cliff-boundary', 'retaining-wall',
    'CYPRESS CROWN', 'GRANITE LADDER', 'RAINCUT TRAVERSE',
    'BASIN SWEEP', 'FERN CHICANE', 'SOUTH GATE',
    'LAUNCH LANE', 'OUTER ARC', 'EAST CLIPPING ZONE',
    'INFIELD LINK', 'GRAND CAROUSEL', 'RETURN STRAIGHT',
    'LAUNCH PIN', 'NORTH HAIRPINS', 'WEST HAIRPIN',
    'CENTER PINS', 'SOUTH HAIRPINS', 'FINISH PIN',
  ]) {
    assert.doesNotMatch(cypress, new RegExp(cue));
  }
});

test('catalog rejects closed-key, reference, coordinate, order, and membership failures', () => {
  const cases = [
    (value) => { value.pop(); },
    (value) => { value[0].extra = true; },
    (value) => { value[0].artId = value[1].artId; },
    (value) => { value[0].desktopAnimationName = value[1].mobileAnimationName; },
    (value) => { value[0].centerlineId = 'Unsafe_ID'; },
    (value) => { value[0].segments[0] = ''; },
    (value) => { value[0].routeAnchors[0].id = 'R02'; },
    (value) => { value[0].routeAnchors[0].x = NaN; },
    (value) => { value[0].routeAnchors[0].y = 761; },
    (value) => { value[0].routeAnchors[0].poolLabel = 'Elsewhere'; },
    (value) => { value[0].routeAnchors[2].poolLabel = value[0].segments[0]; },
  ];
  for (const mutate of cases) {
    const input = cloneCatalog();
    mutate(input);
    assert.throws(() => validateTrackCatalog(input));
  }
});

test('local workday slots change at 08:30 and 12:30 without after-hours churn', () => {
  assert.equal(TRACK_WORKDAY_OPEN_MINUTES, 510);
  assert.equal(TRACK_WORKDAY_MIDPOINT_MINUTES, 750);
  assert.equal(TRACK_WORKDAY_CLOSE_MINUTES, 990);
  assert.equal(TRACK_WORKDAY_WINDOWS_PER_DAY, 2);
  const opening = new Date(2026, 6, 26, 8, 30);
  const midpoint = new Date(2026, 6, 26, 12, 30);
  const closing = new Date(2026, 6, 26, 16, 30);
  for (const exact of [opening, midpoint]) {
    const before = new Date(exact.getTime() - 1);
    const after = new Date(exact.getTime() + 1);
    assert.equal(localTrackSlot(exact), localTrackSlot(after));
    assert.equal(localTrackSlot(exact), localTrackSlot(before) + 1);
    assert.notEqual(autoTrackAt(exact).id, autoTrackAt(before).id);
  }
  assert.equal(localTrackSlot(closing), localTrackSlot(new Date(closing.getTime() - 1)));
  assert.equal(localTrackSlot(closing), localTrackSlot(new Date(2026, 6, 26, 23, 59)));
  assert.equal(localTrackSlot(new Date(2026, 6, 27, 8, 29, 59, 999)), localTrackSlot(closing));
  assert.notEqual(autoTrackAt(new Date(2026, 6, 27, 8, 30)).id, autoTrackAt(closing).id);

  const slots = Array.from({ length: 12 }, (_, index) => {
    const day = 26 + Math.floor(index / 2);
    return autoTrackAt(new Date(2026, 6, day, index % 2 === 0 ? 8 : 12, 30)).id;
  });
  assert.equal(slots.every((id, index) => index === 0 || id !== slots[index - 1]), true);
  assert.deepEqual(new Set(slots), new Set(['ridge-pass', 'cypress-run', 'lantern-coil']));
});

test('next boundary targets only opening or midpoint across exact boundaries and rollover', () => {
  const cases = [
    [new Date(2026, 6, 26, 8, 29, 59, 999), [2026, 6, 26, 8, 30]],
    [new Date(2026, 6, 26, 8, 30), [2026, 6, 26, 12, 30]],
    [new Date(2026, 6, 26, 12, 29, 59, 999), [2026, 6, 26, 12, 30]],
    [new Date(2026, 6, 26, 12, 30), [2026, 6, 27, 8, 30]],
    [new Date(2026, 6, 26, 16, 29, 59, 999), [2026, 6, 27, 8, 30]],
    [new Date(2026, 6, 26, 16, 30), [2026, 6, 27, 8, 30]],
    [new Date(2026, 6, 26, 23, 59, 59, 999), [2026, 6, 27, 8, 30]],
  ];
  for (const [date, expected] of cases) {
    const boundary = nextTrackBoundary(date);
    assert.deepEqual([
      boundary.getFullYear(), boundary.getMonth(), boundary.getDate(),
      boundary.getHours(), boundary.getMinutes(),
    ], expected);
    assert.ok(boundary > date);
  }
});

class FakeTarget extends EventTarget {
  constructor() {
    super();
    this.value = '';
    this.textContent = '';
    this.visibilityState = 'visible';
    this.attributes = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  getAttribute(name) { return this.attributes.get(name); }
}

test('Auto controller owns one one-shot timeout, catches up, supports handle 0, manual, and teardown', () => {
  const selector = new FakeTarget();
  const status = new FakeTarget();
  const liveRegion = new FakeTarget();
  const documentRef = new FakeTarget();
  const windowRef = new FakeTarget();
  const applied = [];
  const timers = new Map();
  const cleared = [];
  let handle = 0;
  let clock = new Date(2026, 6, 26, 8, 30);
  const controller = createTrackSelectionController({
    selector, status, liveRegion, documentRef, windowRef,
    now: () => new Date(clock),
    applyTrack: (track) => applied.push(track.id),
    onFatal: assert.fail,
    setTimeoutFn: (callback, delay) => {
      const id = handle++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeoutFn: (id) => {
      cleared.push(id);
      timers.delete(id);
    },
  });
  controller.start();
  assert.equal(controller.mode, 'auto');
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 4 * 60 * 60 * 1000);
  assert.match(status.textContent, /Active course: .+ · Auto · workday schedule · next change/);
  clock = new Date(2026, 6, 26, 12, 30);
  windowRef.dispatchEvent(new Event('focus'));
  assert.equal(timers.size, 1);
  assert.equal([...timers.values()][0].delay, 20 * 60 * 60 * 1000);
  assert.equal(cleared.includes(0), true);
  assert.match(liveRegion.textContent, /Course changed to/);
  selector.value = 'ridge-pass';
  selector.dispatchEvent(new Event('change'));
  assert.equal(controller.mode, 'manual');
  assert.equal(timers.size, 0);
  selector.value = 'auto';
  selector.dispatchEvent(new Event('change'));
  assert.equal(timers.size, 1);
  documentRef.visibilityState = 'hidden';
  documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(timers.size, 1);
  documentRef.visibilityState = 'visible';
  documentRef.dispatchEvent(new Event('visibilitychange'));
  assert.equal(timers.size, 1);
  windowRef.dispatchEvent(new Event('pageshow'));
  assert.equal(timers.size, 1);
  controller.destroy();
  controller.destroy();
  assert.equal(timers.size, 0);
  assert.ok(applied.length >= 2);
});

test('timer scheduling and callback failures route fatal without rescheduling', () => {
  for (const failure of ['schedule', 'callback']) {
    const selector = new FakeTarget();
    const failures = [];
    let callback;
    let clock = new Date(2026, 6, 26, 8, 30);
    const controller = createTrackSelectionController({
      selector,
      status: new FakeTarget(),
      liveRegion: new FakeTarget(),
      documentRef: new FakeTarget(),
      windowRef: new FakeTarget(),
      now: () => new Date(clock),
      applyTrack: failure === 'callback'
        ? (track) => {
          if (callback) throw new Error(`failed ${track.id}`);
        }
        : () => {},
      onFatal: (error) => failures.push(error),
      setTimeoutFn: (fn) => {
        if (failure === 'schedule') throw new Error('timer failed');
        callback = fn;
        return 1;
      },
      clearTimeoutFn() {},
    });
    controller.start();
    if (failure === 'callback') {
      clock = new Date(2026, 6, 26, 12, 30);
      callback();
    }
    assert.equal(failures.length, 1);
    controller.destroy();
  }
});

test('manual, timeout, visibility, pageshow, and focus apply failures tear down without reschedule', () => {
  for (const trigger of ['manual', 'timeout', 'visibilitychange', 'pageshow', 'focus']) {
    const selector = new FakeTarget();
    const documentRef = new FakeTarget();
    const windowRef = new FakeTarget();
    const timers = new Map();
    const failures = [];
    let nextHandle = 0;
    let clock = new Date(2026, 6, 26, 8, 30);
    let started = false;
    let controller;
    controller = createTrackSelectionController({
      selector,
      status: new FakeTarget(),
      liveRegion: new FakeTarget(),
      documentRef,
      windowRef,
      now: () => new Date(clock),
      applyTrack: () => {
        if (started) throw new Error(`${trigger} apply failed`);
      },
      onFatal: (error) => {
        failures.push(error);
        controller.destroy();
      },
      setTimeoutFn: (callback) => {
        const handle = nextHandle++;
        timers.set(handle, callback);
        return handle;
      },
      clearTimeoutFn: (handle) => timers.delete(handle),
    });
    controller.start();
    started = true;
    clock = new Date(2026, 6, 26, 12, 30);
    if (trigger === 'manual') {
      selector.value = controller.currentTrack.id === 'ridge-pass' ? 'cypress-run' : 'ridge-pass';
      selector.dispatchEvent(new Event('change'));
    } else if (trigger === 'timeout') {
      const [handle, callback] = [...timers.entries()][0];
      timers.delete(handle);
      callback();
    } else if (trigger === 'visibilitychange') {
      documentRef.visibilityState = 'visible';
      documentRef.dispatchEvent(new Event('visibilitychange'));
    } else {
      windowRef.dispatchEvent(new Event(trigger));
    }
    assert.equal(failures.length, 1, trigger);
    assert.equal(timers.size, 0, trigger);
  }
});

test('same-track catch-up and mode-only changes do not announce', () => {
  const selector = new FakeTarget();
  const liveRegion = new FakeTarget();
  const windowRef = new FakeTarget();
  let clock = new Date(2026, 6, 26, 8, 30);
  const controller = createTrackSelectionController({
    selector,
    status: new FakeTarget(),
    liveRegion,
    documentRef: new FakeTarget(),
    windowRef,
    now: () => new Date(clock),
    applyTrack() {},
    onFatal: assert.fail,
    setTimeoutFn: () => 1,
    clearTimeoutFn() {},
  });
  controller.start();
  assert.equal(liveRegion.textContent, '');
  windowRef.dispatchEvent(new Event('focus'));
  assert.equal(liveRegion.textContent, '');
  selector.value = controller.currentTrack.id;
  selector.dispatchEvent(new Event('change'));
  assert.equal(liveRegion.textContent, '');
  selector.value = 'auto';
  selector.dispatchEvent(new Event('change'));
  assert.equal(liveRegion.textContent, '');
  clock = new Date(2026, 6, 26, 12, 30);
  windowRef.dispatchEvent(new Event('pageshow'));
  assert.match(liveRegion.textContent, /Course changed to/);
  controller.destroy();
});

test('authorized triggers correct forward and backward clock jumps with one timeout', () => {
  const selector = new FakeTarget();
  const documentRef = new FakeTarget();
  const windowRef = new FakeTarget();
  const timers = new Map();
  let handle = 0;
  let clock = new Date(2026, 6, 26, 8, 30);
  const controller = createTrackSelectionController({
    selector,
    status: new FakeTarget(),
    liveRegion: new FakeTarget(),
    documentRef,
    windowRef,
    now: () => new Date(clock),
    applyTrack() {},
    onFatal: assert.fail,
    setTimeoutFn: (callback) => {
      const id = handle++;
      timers.set(id, callback);
      return id;
    },
    clearTimeoutFn: (id) => timers.delete(id),
  });
  controller.start();
  for (const [next, target, event] of [
    [new Date(2026, 6, 27, 16, 30), documentRef, 'visibilitychange'],
    [new Date(2026, 6, 25, 8, 29), windowRef, 'pageshow'],
    [new Date(2026, 6, 28, 12, 30), windowRef, 'focus'],
  ]) {
    clock = next;
    documentRef.visibilityState = 'visible';
    target.dispatchEvent(new Event(event));
    assert.equal(controller.currentTrack.id, autoTrackAt(clock).id);
    assert.equal(timers.size, 1);
  }
  clock = new Date(2026, 6, 24, 8, 30);
  const [id, callback] = [...timers.entries()][0];
  timers.delete(id);
  callback();
  assert.equal(controller.currentTrack.id, autoTrackAt(clock).id);
  assert.equal(timers.size, 1);
  controller.destroy();
});

test('local next-boundary elapsed delay reflects spring and fall DST', () => {
  const previous = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles';
  try {
    const spring = new Date(2026, 2, 7, 16, 30);
    const fall = new Date(2026, 9, 31, 16, 30);
    const springBoundary = nextTrackBoundary(spring);
    const fallBoundary = nextTrackBoundary(fall);
    assert.deepEqual([springBoundary.getHours(), springBoundary.getMinutes()], [8, 30]);
    assert.deepEqual([fallBoundary.getHours(), fallBoundary.getMinutes()], [8, 30]);
    assert.equal(springBoundary.getTime() - spring.getTime(), 15 * 60 * 60 * 1000);
    assert.equal(fallBoundary.getTime() - fall.getTime(), 17 * 60 * 60 * 1000);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test('allocation stays track-specific while parked placement and 17th overflow stay unchanged', () => {
  const sessions = Array.from({ length: 17 }, (_, index) => ({
    id: `s-${String(index).padStart(2, '0')}`,
    mapCode: `S${String(index + 1).padStart(2, '0')}`,
    status: 'active',
    progress: index < 16 ? index / 15 : undefined,
  }));
  for (const track of TRACK_CATALOG) {
    const placements = allocateSessions(sessions, track);
    assert.equal(placements.filter(({ overflow }) => overflow).length, 1);
    assert.deepEqual(placements.filter(({ overflow }) => !overflow).map(({ locationLabel }) => (
      locationLabel.split(', Route Slot')[0]
    )), track.segments.flatMap((segment, index) => (
      Array([2, 3, 3, 3, 3, 2][index]).fill(segment)
    )));
  }
});

test('source setTrack forwards independently during deferred validation and destroy', async () => {
  const fileInput = new FakeTarget();
  fileInput.files = [];
  fileInput.disabled = false;
  fileInput.setAttribute = () => {};
  fileInput.removeAttribute = () => {};
  const region = new FakeTarget();
  region.setAttribute = () => {};
  region.removeAttribute = () => {};
  const pending = {};
  const tracks = [];
  const controller = createSourceController({
    fileInput,
    resetButton: new FakeTarget(),
    importRegion: region,
    sourceLabel: new FakeTarget(),
    sourceAge: new FakeTarget(),
    sourceNotice: new FakeTarget(),
    readFixtures: async () => ({ kind: 'fixture' }),
    readFile: () => new Promise((resolve) => { pending.resolve = resolve; }),
    render: (value, track) => ({
      setTrack: (next) => tracks.push(next.id),
      destroy() {},
      clearInteraction() {},
    }),
    initialTrack: getTrack('ridge-pass'),
    windowRef: new FakeTarget(),
  });
  await controller.start();
  const transition = controller.selectFile({ size: 1 });
  controller.setTrack(getTrack('cypress-run'));
  assert.deepEqual(tracks, ['cypress-run']);
  controller.destroy();
  controller.setTrack(getTrack('ridge-pass'));
  assert.deepEqual(tracks, ['cypress-run']);
  pending.resolve({ kind: 'live', observedAt: new Date().toISOString() });
  assert.equal(await transition, false);
});

test('application render failure is fatal and never mislabeled as live rejection', async () => {
  const fileInput = new FakeTarget();
  fileInput.files = [];
  const sourceNotice = new FakeTarget();
  const failures = [];
  let renderCount = 0;
  const controller = createSourceController({
    fileInput,
    resetButton: new FakeTarget(),
    importRegion: new FakeTarget(),
    sourceLabel: new FakeTarget(),
    sourceAge: new FakeTarget(),
    sourceNotice,
    readFixtures: async () => ({ kind: 'fixture' }),
    readFile: async () => ({ kind: 'live', observedAt: '2026-07-26T17:00:00Z' }),
    render: () => {
      renderCount += 1;
      if (renderCount === 2) throw new Error('application commit failed');
      return { destroy() {}, clearInteraction() {}, setTrack() {} };
    },
    onFatal: (error) => failures.push(error),
    windowRef: new FakeTarget(),
  });
  await controller.start();
  assert.equal(await controller.selectFile({ size: 1 }), false);
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /application commit failed/);
  assert.notEqual(sourceNotice.textContent, 'Live snapshot rejected; showing fixtures.');
  controller.destroy();
});

test('source and track axes stay independent across live, validating, rejection, reset, and destroy', async () => {
  const fileInput = new FakeTarget();
  fileInput.files = [];
  const pending = [];
  const renders = [];
  let fixtureEpoch = 0;
  const controller = createSourceController({
    fileInput,
    resetButton: new FakeTarget(),
    importRegion: new FakeTarget(),
    sourceLabel: new FakeTarget(),
    sourceAge: new FakeTarget(),
    sourceNotice: new FakeTarget(),
    readFixtures: async () => ({ kind: 'fixture', epoch: ++fixtureEpoch }),
    readFile: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    render: (value, track) => {
      const record = { value, track: track.id, switches: [] };
      renders.push(record);
      return {
        setTrack: (next) => {
          record.track = next.id;
          record.switches.push(next.id);
        },
        destroy() {},
        clearInteraction() {},
      };
    },
    initialTrack: getTrack('ridge-pass'),
    setIntervalFn: () => 1,
    clearIntervalFn() {},
    windowRef: new FakeTarget(),
  });
  await controller.start();
  assert.equal(renders.at(-1).track, 'ridge-pass');

  const live = controller.selectFile({ size: 1 });
  controller.setTrack(getTrack('cypress-run'));
  pending[0].resolve({ kind: 'live', observedAt: '2026-07-26T17:00:00Z' });
  assert.equal(await live, true);
  assert.equal(controller.mode, 'live');
  assert.equal(renders.at(-1).track, 'cypress-run');

  const rejected = controller.selectFile({ size: 1 });
  controller.setTrack(getTrack('ridge-pass'));
  pending[1].reject(new Error('invalid snapshot'));
  assert.equal(await rejected, false);
  assert.equal(controller.mode, 'rejected_fixtures');
  assert.equal(renders.at(-1).track, 'ridge-pass');

  controller.setTrack(getTrack('cypress-run'));
  await controller.reset();
  assert.equal(controller.mode, 'fixtures');
  assert.equal(renders.at(-1).track, 'cypress-run');
  controller.destroy();
  controller.setTrack(getTrack('ridge-pass'));
  assert.equal(renders.at(-1).track, 'cypress-run');
});

test('static SVG/CSS references are unique, scoped, and API protected boundaries remain closed', () => {
  const ids = [...INDEX.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const track of TRACK_CATALOG) {
    assert.equal((INDEX.match(new RegExp(`id="${track.artId}"`, 'g')) ?? []).length, 1);
    assert.equal((INDEX.match(new RegExp(`id="${track.centerlineId}"`, 'g')) ?? []).length, 1);
    assert.match(INDEX, new RegExp(`id="${track.centerlineId}"[^>]*fill="none"`));
    for (const name of [track.desktopAnimationName, track.mobileAnimationName]) {
      assert.equal((STYLES.match(new RegExp(`@keyframes ${name}\\s*\\{`, 'g')) ?? []).length, 1);
      assert.equal((STYLES.match(new RegExp(`animation(?:-name)?:\\s*${name}`, 'g')) ?? []).length, 1);
    }
  }
  assert.match(INDEX, /data-track-id="ridge-pass"/);
  assert.equal((INDEX.match(/id="track-select"/g) ?? []).length, 1);
  assert.deepEqual([...INDEX.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]), [
    'auto', 'ridge-pass', 'cypress-run', 'lantern-coil',
  ]);
  assert.doesNotMatch(SOURCES, /localStorage|sessionStorage|document\.cookie|requestAnimationFrame|requestIdleCallback|serviceWorker|history\.(?:push|replace)State|fetch\(/);
  assert.doesNotMatch(SOURCES, /setInterval\s*\(/);
  assert.equal((SOURCES.match(/setTimeoutFn\(/g) ?? []).length, 1);
});

test('all three tracks keep sixteen mobile anchors separated and generated schedules have fixed counts', () => {
  for (const track of TRACK_CATALOG) {
    for (let left = 0; left < track.routeAnchors.length; left += 1) {
      for (let right = left + 1; right < track.routeAnchors.length; right += 1) {
        const a = track.routeAnchors[left];
        const b = track.routeAnchors[right];
        const distance = Math.hypot((a.x - b.x) * 0.372, (a.y - b.y) * (580 / 760));
        assert.ok(distance >= 44, `${track.id} ${a.id}/${b.id}: ${distance}`);
      }
    }
  }
  for (const [name, scaleX, scaleY] of [
    ['cypress-run-traverse-desktop', 11.6, 6.82],
    ['cypress-run-traverse-mobile', 3.72, 5.8],
    ['lantern-coil-traverse-desktop', 11.6, 6.82],
    ['lantern-coil-traverse-mobile', 3.72, 5.8],
  ]) {
    const block = STYLES.slice(STYLES.indexOf(`@keyframes ${name}`));
    const expectedCount = name.startsWith('cypress') ? 533 : 528;
    const points = [...block.matchAll(
      /(?:^|\n)\s*(?:\d+(?:\.\d+)?)% \{ left: ([\d.]+)%; top: ([\d.]+)%/g,
    )].slice(0, expectedCount).map((match) => [
      Number(match[1]) * scaleX,
      Number(match[2]) * scaleY,
    ]);
    assert.equal(points.length, expectedCount);
  }
});

test('all static anchors and visible waypoints contain the complete route target', () => {
  for (const [viewport, width, height, diameter] of [
    ['desktop', 1160, 682, 52],
    ['mobile', 372, 580, 44],
  ]) {
    const radius = diameter / 2;
    for (const track of TRACK_CATALOG) {
      for (const anchor of track.routeAnchors) {
        const centerX = anchor.x / 1000 * width;
        const centerY = anchor.y / 760 * height;
        assert.ok(centerX >= radius && centerX <= width - radius,
          `${viewport} ${track.id} ${anchor.id} horizontal edge`);
        assert.ok(centerY >= radius && centerY <= height - radius,
          `${viewport} ${track.id} ${anchor.id} vertical edge`);
      }
      const animationName = viewport === 'desktop'
        ? track.desktopAnimationName : track.mobileAnimationName;
      const start = STYLES.indexOf(`@keyframes ${animationName}`);
      const next = STYLES.indexOf('@keyframes ', start + 12);
      const block = STYLES.slice(start, next < 0 ? undefined : next);
      const visible = [...block.matchAll(
        /(?:^|\n)\s*(\d+(?:\.\d+)?)% \{ left: ([\d.]+)%; top: ([\d.]+)%/g,
      )].filter((match) => Number(match[1]) <= 98.8);
      assert.ok(visible.length >= 65, `${animationName} visible waypoints`);
      for (const [, percent, left, top] of visible) {
        const centerX = Number(left) / 100 * width;
        const centerY = Number(top) / 100 * height;
        assert.ok(centerX >= radius && centerX <= width - radius,
          `${animationName} ${percent}% horizontal edge`);
        assert.ok(centerY >= radius && centerY <= height - radius,
          `${animationName} ${percent}% vertical edge`);
      }
    }
  }
});
