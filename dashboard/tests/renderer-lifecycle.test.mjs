import assert from 'node:assert/strict';
import { setMaxListeners } from 'node:events';
import test from 'node:test';

import {
  applyApplicationTrack, createApplicationFatalHandler, preflightDocument, startDashboard,
} from '../src/app.mjs';
import { GENERATED_ROUTE_GEOMETRY } from '../src/generated/route-geometry.mjs';
import { LIVE_CONSTANTS } from '../src/live-constants.mjs';
import { renderDashboard } from '../src/render-dashboard.mjs';
import { normalizeSnapshot } from '../src/session-contract.mjs';
import { TRACK_CATALOG, getTrack } from '../src/track-catalog.mjs';
import { createTrackSelectionController } from '../src/track-selection.mjs';
import { dashboardRoot, FakeDocument, FakeElement } from './dom-fake.mjs';

setMaxListeners(100);

const snapshot = () => normalizeSnapshot({
  schemaVersion: 1,
  generatedAt: '2026-07-26T17:00:00Z',
  sessions: [
    {
      id: 'route',
      displayName: 'Route Session',
      status: 'active',
      lastActivityAt: '2026-07-26T16:59:00Z',
      permissionState: 'not_required',
      progress: 0,
    },
    {
      id: 'parked',
      displayName: 'Parked Session',
      status: 'idle',
      lastActivityAt: '2026-07-26T16:59:00Z',
      permissionState: 'not_required',
    },
  ],
});

function keydown(key) {
  const event = new Event('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'key', { value: key });
  return event;
}

const routeSession = (id, overrides = {}) => ({
  id,
  displayName: `Route ${id}`,
  status: 'active',
  lastActivityAt: '2026-07-26T16:59:00Z',
  permissionState: 'not_required',
  progress: 0,
  ...overrides,
});

const routeSnapshot = (sessions, generatedAt = '2026-07-26T17:00:00Z') => normalizeSnapshot({
  schemaVersion: 1,
  generatedAt,
  sessions,
});

function findCar(root, id) {
  return root.querySelectorAll('.session-car').find((button) => button.dataset.sessionId === id);
}

const pitSession = (id, status, overrides = {}) => ({
  id,
  displayName: `Pit ${id}`,
  status,
  lastActivityAt: '2026-07-26T16:59:00Z',
  permissionState: status === 'waiting_for_permission' ? 'requested' : 'not_required',
  ...(status === 'error' ? { errorSummary: 'x' } : {}),
  ...overrides,
});

const overflowingSnapshot = (count) => normalizeSnapshot({
  schemaVersion: 1,
  generatedAt: '2026-07-26T17:00:00Z',
  sessions: Array.from({ length: count }, (unused, index) => ({
    id: `idle-${index}`,
    displayName: `Idle Session ${index}`,
    status: 'idle',
    lastActivityAt: '2026-07-26T16:59:00Z',
    permissionState: 'not_required',
  })),
});

test('tooltip shows the stripped bold label and Jira/PR lines for a route car', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('ref', { displayName: 'BB-228 PR#42 route tooltip' }),
  ]), root, getTrack('ridge-pass'));
  const wrapper = findCar(root, 'ref').parentElement;
  const tooltip = wrapper.querySelector('.session-tooltip');
  assert.match(tooltip.children[0].textContent, /^S\d+ · route tooltip$/);
  assert.match(tooltip.textContent, /Jira: BB-228/);
  assert.match(tooltip.textContent, /PR #42/);
});

test('tooltip omits ref lines when the name has no tokens', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('plain', { displayName: 'Aoba' }),
  ]), root, getTrack('ridge-pass'));
  const tooltip = findCar(root, 'plain').parentElement.querySelector('.session-tooltip');
  assert.match(tooltip.children[0].textContent, /^S\d+ · Aoba$/);
  assert.doesNotMatch(tooltip.textContent, /Jira:|PR #/);
});

test('replaceTooltip renders new ref lines on a live update()', () => {
  const { root } = dashboardRoot();
  const controller = renderDashboard(routeSnapshot([
    routeSession('ref', { displayName: 'Aoba' }),
  ]), root, getTrack('ridge-pass'));
  controller.update(routeSnapshot([
    routeSession('ref', { displayName: 'BB-305 PR#9 renamed' }),
  ], '2026-07-26T17:00:05Z'));
  const tooltip = findCar(root, 'ref').parentElement.querySelector('.session-tooltip');
  assert.match(tooltip.textContent, /Jira: BB-305/);
  assert.match(tooltip.textContent, /PR #9/);
  controller.destroy();
});

test('a route car with a PR shows a PR#-precedence badge, aria-hidden', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('ref', { displayName: 'BB-228 PR#42 route tooltip' }),
  ]), root, getTrack('ridge-pass'));
  const wrapper = findCar(root, 'ref').parentElement;
  const badge = wrapper.querySelector('.car-badge');
  assert.ok(badge, 'badge exists');
  assert.equal(badge.textContent, 'PR#42');
  assert.equal(badge.getAttribute('aria-hidden'), 'true');
});

test('a route car with only a ticket shows the ticket badge', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('t', { displayName: 'BB-305 combined pit' }),
  ]), root, getTrack('ridge-pass'));
  const badge = findCar(root, 't').parentElement.querySelector('.car-badge');
  assert.equal(badge.textContent, 'BB-305');
});

test('a car with no ref has no badge element', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('plain', { displayName: 'Aoba' }),
  ]), root, getTrack('ridge-pass'));
  assert.equal(findCar(root, 'plain').parentElement.querySelector('.car-badge'), null);
});

test('a pit car also gets a badge on its .pit-vehicle wrapper', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    pitSession('parked', 'idle', { displayName: 'BB-410 PR#63 fixture pass' }),
  ]), root, getTrack('ridge-pass'));
  const wrapper = findCar(root, 'parked').parentElement;
  assert.ok(wrapper.classList.contains('pit-vehicle'), 'session parked in the pit');
  assert.equal(wrapper.querySelector('.car-badge').textContent, 'PR#63');
});

test('update() adds a badge when a ref appears and removes it when it disappears', () => {
  const { root } = dashboardRoot();
  const controller = renderDashboard(routeSnapshot([
    routeSession('ref', { displayName: 'Aoba' }),
  ]), root, getTrack('ridge-pass'));
  assert.equal(findCar(root, 'ref').parentElement.querySelector('.car-badge'), null);

  controller.update(routeSnapshot([
    routeSession('ref', { displayName: 'BB-9 PR#1 named now' }),
  ], '2026-07-26T17:00:05Z'));
  assert.equal(findCar(root, 'ref').parentElement.querySelector('.car-badge').textContent, 'PR#1');

  controller.update(routeSnapshot([
    routeSession('ref', { displayName: 'name gone' }),
  ], '2026-07-26T17:00:10Z'));
  assert.equal(findCar(root, 'ref').parentElement.querySelector('.car-badge'), null);
  controller.destroy();
});

test('overflow renders a calm collapsed parked summary, not the error boilerplate', () => {
  const { root } = dashboardRoot();
  renderDashboard(overflowingSnapshot(20), root, getTrack('ridge-pass'));

  const notice = root.querySelector('#pit-overflow');
  assert.equal(notice.hidden, false);
  const toggle = notice.querySelector('.overflow-toggle');
  assert.ok(toggle, 'collapsed summary toggle is present');
  assert.match(toggle.textContent, /^\d+ parked · over pit capacity \(\d+ slots?\)$/);

  const items = notice.querySelectorAll('.overflow-item');
  const parkedCount = Number(toggle.textContent.match(/^(\d+) parked/)[1]);
  assert.ok(parkedCount > 0, 'some sessions overflowed the pit');
  assert.equal(items.length, parkedCount);
  for (const item of items) assert.match(item.textContent, /^S\d+ Idle Session \d+$/);

  // The verbose per-session error boilerplate must be gone from the notice.
  const rendered = [toggle.textContent, ...items.map((item) => item.textContent)].join(' ');
  assert.equal(rendered.includes('Map capacity exceeded'), false);
  assert.equal(rendered.includes('Permission state unknown'), false);
});

test('update() reuses a persisting route car element in place so its CSS animation is not restarted', () => {
  const { root } = dashboardRoot();
  const initial = routeSnapshot([
    routeSession('alpha', { progress: 0 }),
    routeSession('bravo', { progress: 0.25 }),
    routeSession('charlie', { progress: 0.5 }),
  ]);
  const controller = renderDashboard(initial, root, getTrack('ridge-pass'));
  const before = findCar(root, 'alpha');
  assert.ok(before, 'alpha car exists before update');

  const next = routeSnapshot([
    routeSession('alpha', { progress: 0 }),
    routeSession('bravo', { progress: 0.25 }),
    routeSession('charlie', { progress: 0.5 }),
  ], '2026-07-26T17:00:05Z');
  controller.update(next);

  const after = findCar(root, 'alpha');
  assert.ok(Object.is(before, after), 'the persisting route car element is reused, not recreated');
  controller.destroy();
});

test('update() creates a car for an added session and removes the car for a dropped session', () => {
  const { root } = dashboardRoot();
  const initial = routeSnapshot([
    routeSession('alpha', { progress: 0 }),
    routeSession('bravo', { progress: 0.25 }),
  ]);
  const controller = renderDashboard(initial, root, getTrack('ridge-pass'));
  const bravoBefore = findCar(root, 'bravo');
  assert.ok(bravoBefore);
  assert.equal(findCar(root, 'delta'), undefined);

  const next = routeSnapshot([
    routeSession('bravo', { progress: 0.25 }),
    routeSession('delta', { progress: 0.75 }),
  ]);
  controller.update(next);

  assert.equal(findCar(root, 'alpha'), undefined, 'the dropped session no longer has a car');
  const bravoAfter = findCar(root, 'bravo');
  assert.ok(Object.is(bravoBefore, bravoAfter), 'the persisting session keeps its element');
  const deltaAfter = findCar(root, 'delta');
  assert.ok(deltaAfter, 'the added session gets a new car');
  controller.destroy();
});

test('update() reflects a status change in place without recreating the element', () => {
  const { root } = dashboardRoot();
  const initial = routeSnapshot([routeSession('alpha', { progress: 0, status: 'active' })]);
  const controller = renderDashboard(initial, root, getTrack('ridge-pass'));
  const before = findCar(root, 'alpha');
  const wrapperBefore = before.parentElement;
  assert.ok(wrapperBefore.classList.contains('state-active'));

  const next = routeSnapshot([routeSession('alpha', { progress: 0, status: 'thinking' })]);
  controller.update(next);

  const after = findCar(root, 'alpha');
  assert.ok(Object.is(before, after), 'the element is reused across the status change');
  const wrapperAfter = after.parentElement;
  assert.equal(wrapperAfter.dataset.status, 'thinking');
  assert.ok(wrapperAfter.classList.contains('state-thinking'), 'state class updated in place');
  assert.equal(wrapperAfter.classList.contains('state-active'), false, 'stale state class removed');
  assert.match(after.getAttribute('aria-label'), /Thinking/);
  controller.destroy();
});

test('update() still renders the overflow notice for the current snapshot', () => {
  const { root } = dashboardRoot();
  const controller = renderDashboard(routeSnapshot([routeSession('alpha')]), root, getTrack('ridge-pass'));
  assert.equal(root.querySelector('#pit-overflow').hidden, true);

  controller.update(overflowingSnapshot(20));

  const notice = root.querySelector('#pit-overflow');
  assert.equal(notice.hidden, false);
  assert.ok(notice.querySelector('.overflow-toggle'), 'overflow toggle renders after update()');
  controller.destroy();
});

test('update() keeps a pinned car pinned when it persists across the update', () => {
  const { root } = dashboardRoot();
  const initial = routeSnapshot([
    routeSession('alpha', { progress: 0 }),
    routeSession('bravo', { progress: 0.25 }),
  ]);
  const controller = renderDashboard(initial, root, getTrack('ridge-pass'));
  const alphaButton = findCar(root, 'alpha');
  alphaButton.focus();
  alphaButton.dispatchEvent(keydown('Enter'));
  assert.equal(alphaButton.getAttribute('aria-pressed'), 'true');
  assert.equal(alphaButton.parentElement.dataset.pinned, 'true');

  const next = routeSnapshot([
    routeSession('alpha', { progress: 0 }),
    routeSession('bravo', { progress: 0.25 }),
  ], '2026-07-26T17:00:05Z');
  controller.update(next);

  const alphaAfter = findCar(root, 'alpha');
  assert.ok(Object.is(alphaButton, alphaAfter));
  assert.equal(alphaAfter.getAttribute('aria-pressed'), 'true');
  assert.equal(alphaAfter.parentElement.dataset.pinned, 'true');
  controller.destroy();
});

test('update() re-sorts the pit so a freshly active session moves to the front', () => {
  const { root } = dashboardRoot();
  const t = (m) => `2026-08-05T10:${String(m).padStart(2, '0')}:00Z`;
  const build = (oldAt) => normalizeSnapshot({
    schemaVersion: 1,
    generatedAt: '2026-08-05T11:00:00Z',
    sessions: [
      { id: 'old', displayName: 'Old', status: 'complete', lastActivityAt: oldAt, permissionState: 'not_required' },
      { id: 'mid', displayName: 'Mid', status: 'idle', lastActivityAt: t(20), permissionState: 'not_required' },
      { id: 'run', displayName: 'Run', status: 'complete', lastActivityAt: t(30), permissionState: 'not_required' },
    ],
  });
  const view = renderDashboard(build(t(10)), root, getTrack('ridge-pass'));
  const idsAt = () => root.querySelector('#pit').children.map((el) => el.dataset.sessionId);
  assert.deepEqual(idsAt(), ['run', 'mid', 'old']); // newest-first at mount

  view.update(build(t(45))); // 'old' fires a fresh response and jumps to newest
  assert.deepEqual(idsAt(), ['old', 'run', 'mid']);
});

test('update() re-sort keeps a pinned pit car pinned', () => {
  const { root } = dashboardRoot();
  const t = (m) => `2026-08-05T10:${String(m).padStart(2, '0')}:00Z`;
  const build = (aAt) => normalizeSnapshot({
    schemaVersion: 1,
    generatedAt: '2026-08-05T11:00:00Z',
    sessions: [
      { id: 'a', displayName: 'A', status: 'complete', lastActivityAt: aAt, permissionState: 'not_required' },
      { id: 'b', displayName: 'B', status: 'idle', lastActivityAt: t(20), permissionState: 'not_required' },
    ],
  });
  const view = renderDashboard(build(t(10)), root, getTrack('ridge-pass'));
  const idsAt = () => root.querySelector('#pit').children.map((el) => el.dataset.sessionId);
  assert.deepEqual(idsAt(), ['b', 'a']);              // b newest at mount

  findCar(root, 'b').dispatchEvent(keydown('Enter')); // pin b
  view.update(build(t(30)));                          // a jumps ahead of b
  assert.deepEqual(idsAt(), ['a', 'b']);               // re-sorted AND b's pin survives the move

  const pinned = root.querySelector('#pit').children.filter((el) => el.dataset.pinned === 'true');
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0].dataset.sessionId, 'b');
});

test('renderer setTrack preserves identity, focus, pin, parked placement, and updates accessibility', () => {
  const { documentRef, root } = dashboardRoot();
  const controller = renderDashboard(snapshot(), root, getTrack('ridge-pass'));
  const buttons = root.querySelectorAll('.session-car');
  const routeButton = buttons.find((button) => button.dataset.sessionId === 'route');
  const parkedButton = buttons.find((button) => button.dataset.sessionId === 'parked');
  const routeWrapper = routeButton.parentElement;
  const parkedWrapper = parkedButton.parentElement;
  const parkedStyle = new Map(parkedWrapper.style.values);
  const ridgeX = routeWrapper.style.getPropertyValue('--vehicle-x');

  routeButton.focus();
  routeButton.dispatchEvent(keydown('Enter'));
  assert.equal(routeButton.getAttribute('aria-pressed'), 'true');
  assert.equal(routeWrapper.dataset.pinned, 'true');

  controller.setTrack(getTrack('cypress-run'));

  assert.equal(root.querySelectorAll('.session-car').find((button) => (
    button.dataset.sessionId === 'route'
  )), routeButton);
  assert.equal(documentRef.activeElement, routeButton);
  assert.equal(routeButton.getAttribute('aria-pressed'), 'true');
  assert.equal(routeWrapper.dataset.pinned, 'true');
  assert.notEqual(routeWrapper.style.getPropertyValue('--vehicle-x'), ridgeX);
  assert.match(routeButton.getAttribute('aria-label'), /Launch Line/);
  assert.match(routeWrapper.querySelector('.session-tooltip').textContent, /Launch Line/);
  assert.deepEqual(parkedWrapper.style.values, parkedStyle);
  assert.equal(root.dataset.trackId, 'cypress-run');
  assert.equal(root.querySelector('#map-heading').textContent, 'Cypress Run');
  controller.destroy();
});

test('Auto startup applies art and heading before deferred fixture render resolves', () => {
  const documentRef = new FakeDocument();
  const root = new FakeElement('div', documentRef);
  root.dataset.trackId = 'ridge-pass';
  const mapHeading = new FakeElement('h2', documentRef);
  mapHeading.textContent = 'Ridge Pass';
  const selector = new FakeElement('select', documentRef);
  const status = new FakeElement('span', documentRef);
  const liveRegion = new FakeElement('span', documentRef);
  const windowRef = new FakeElement('div', documentRef);
  const controller = createTrackSelectionController({
    selector,
    status,
    liveRegion,
    documentRef,
    windowRef,
    now: () => new Date(2026, 6, 26, 1),
    applyTrack: (track) => applyApplicationTrack({ root, mapHeading }, track),
    onFatal: assert.fail,
    setTimeoutFn: () => 1,
    clearTimeoutFn() {},
  });
  const selected = controller.start();
  assert.equal(root.dataset.trackId, selected.id);
  assert.equal(mapHeading.textContent, selected.title);
  assert.match(status.textContent, new RegExp(`Active course: ${selected.title}`));
  assert.equal(liveRegion.textContent, '');
  controller.destroy();
});

test('renderer setTrack preflight failure is atomic', () => {
  const { root } = dashboardRoot();
  const controller = renderDashboard(snapshot(), root, getTrack('ridge-pass'));
  const routeButton = root.querySelectorAll('.session-car').find((button) => (
    button.dataset.sessionId === 'route'
  ));
  const wrapper = routeButton.parentElement;
  const before = {
    track: root.dataset.trackId,
    heading: root.querySelector('#map-heading').textContent,
    x: wrapper.style.getPropertyValue('--vehicle-x'),
    label: routeButton.getAttribute('aria-label'),
    buttons: root.querySelectorAll('.session-car').length,
  };
  assert.throws(() => controller.setTrack({ id: 'not-a-track' }), /Unknown track ID/);
  assert.deepEqual({
    track: root.dataset.trackId,
    heading: root.querySelector('#map-heading').textContent,
    x: wrapper.style.getPropertyValue('--vehicle-x'),
    label: routeButton.getAttribute('aria-label'),
    buttons: root.querySelectorAll('.session-car').length,
  }, before);
  controller.destroy();
});

test('application fatal handler uses sole root or body fallback and is idempotent', () => {
  for (const count of [0, 1, 2]) {
    const documentRef = new FakeDocument();
    const roots = Array.from({ length: count }, () => {
      const root = new FakeElement('div', documentRef);
      root.id = 'dashboard-root';
      documentRef.body.append(root);
      return root;
    });
    let trackDestroyed = 0;
    let sourceDestroyed = 0;
    const handler = createApplicationFatalHandler({
      documentRef,
      dashboardRoots: roots,
      getTrackController: () => ({ destroy: () => { trackDestroyed += 1; } }),
      getSourceController: () => ({ destroy: () => { sourceDestroyed += 1; } }),
    });
    handler.handle(new Error('fatal application commit'));
    handler.handle(new Error('ignored repeat'));
    assert.equal(trackDestroyed, 1);
    assert.equal(sourceDestroyed, 1);
    assert.equal(handler.fatal, true);
    const surface = count === 1 ? roots[0] : documentRef.body;
    assert.match(surface.textContent, /Dashboard could not be displayed/);
    assert.match(surface.textContent, /application failure/);
    assert.doesNotMatch(surface.textContent, /Live snapshot rejected/);
  }
});

test('startup zero, one, and duplicate root cardinality uses required fatal surface', async () => {
  for (const count of [0, 1, 2]) {
    const documentRef = new FakeDocument();
    const roots = Array.from({ length: count }, () => {
      const root = new FakeElement('div', documentRef);
      root.id = 'dashboard-root';
      documentRef.body.append(root);
      return root;
    });
    await startDashboard(documentRef, new FakeElement('div', documentRef));
    const surface = count === 1 ? roots[0] : documentRef.body;
    assert.match(surface.textContent, /Dashboard could not be displayed/);
    if (count !== 1) assert.equal(documentRef.body.children.length, 1);
  }
});

test('unexpected renderer commit failure is replaced by app fatal teardown', () => {
  const { documentRef, root } = dashboardRoot();
  const renderController = renderDashboard(snapshot(), root, getTrack('ridge-pass'));
  const wrapper = root.querySelectorAll('.session-car').find((button) => (
    button.dataset.sessionId === 'route'
  )).parentElement;
  const originalSet = wrapper.style.setProperty.bind(wrapper.style);
  wrapper.style.setProperty = (name, value) => {
    if (name === '--vehicle-y') throw new Error('synthetic commit failure');
    originalSet(name, value);
  };
  let sourceDestroyed = 0;
  const fatal = createApplicationFatalHandler({
    documentRef,
    dashboardRoots: [root],
    getSourceController: () => ({
      destroy() {
        sourceDestroyed += 1;
        renderController.destroy();
      },
    }),
  });
  try {
    renderController.setTrack(getTrack('cypress-run'));
    assert.fail('commit should fail');
  } catch (error) {
    fatal.handle(error);
  }
  assert.equal(sourceDestroyed, 1);
  assert.match(root.textContent, /Dashboard could not be displayed/);
  assert.doesNotMatch(root.textContent, /Launch Line|Live snapshot rejected/);
});

test('startup SVG containment preflight rejects a visible canonical source fill', () => {
  const documentRef = new FakeDocument();
  const root = new FakeElement('div', documentRef);
  root.id = 'dashboard-root';
  documentRef.body.append(root);
  for (const id of ['track-select', 'track-status', 'track-live-region', 'map-heading']) {
    const mount = new FakeElement(id === 'track-select' ? 'select' : 'div', documentRef);
    mount.id = id;
    root.append(mount);
  }
  const svg = new FakeElement('svg', documentRef);
  root.append(svg);
  for (const track of TRACK_CATALOG) {
    const art = new FakeElement('g', documentRef);
    art.id = track.artId;
    art.setAttribute('data-track-art', track.id);
    const centerline = new FakeElement('path', documentRef);
    centerline.id = track.centerlineId;
    centerline.setAttribute('fill', 'none');
    centerline.setAttribute('d', 'M0 0 C1 1 2 2 3 3');
    art.append(centerline);
    svg.append(art);
  }
  assert.equal(preflightDocument(documentRef).root, root);
  documentRef.querySelector(`#${getTrack('cypress-run').centerlineId}`).setAttribute('fill', 'black');
  assert.throws(() => preflightDocument(documentRef), /centerline does not match catalog/);
});

// Builds a document that satisfies startDashboard's full preflight (track art,
// centerlines, and route-segment placeholders) so the Go-live wiring can be
// exercised end to end instead of only through the early-fatal boot paths above.
function buildBootDocument() {
  const { documentRef, root } = dashboardRoot();

  const trackSelect = documentRef.createElement('select');
  trackSelect.id = 'track-select';
  root.append(trackSelect);
  const trackStatus = documentRef.createElement('span');
  trackStatus.id = 'track-status';
  root.append(trackStatus);
  const trackLiveRegion = documentRef.createElement('span');
  trackLiveRegion.id = 'track-live-region';
  root.append(trackLiveRegion);

  const svg = documentRef.createElement('svg');
  root.append(svg);
  for (const track of TRACK_CATALOG) {
    const geometry = GENERATED_ROUTE_GEOMETRY.find((item) => item.id === track.id);
    const art = documentRef.createElement('g');
    art.id = track.artId;
    art.setAttribute('data-track-art', track.id);
    const centerlineContainer = documentRef.createElement('div');
    centerlineContainer.className = 'route-centerlines';
    geometry.segmentPaths.forEach((segment, index) => {
      const path = documentRef.createElement('path');
      path.classList.add(segment.cssClass);
      path.setAttribute('data-route-segment-index', String(index));
      path.setAttribute('d', segment.d);
      centerlineContainer.append(path);
    });
    art.append(centerlineContainer);
    const centerline = documentRef.createElement('path');
    centerline.id = track.centerlineId;
    centerline.setAttribute('fill', 'none');
    centerline.setAttribute('d', geometry.centerlineD);
    art.append(centerline);
    svg.append(art);
  }

  const sourceControls = documentRef.createElement('section');
  sourceControls.id = 'source-controls';
  const fileInput = documentRef.createElement('input');
  fileInput.id = 'snapshot-file';
  const resetButton = documentRef.createElement('button');
  resetButton.id = 'reset-source';
  const sourceLabel = documentRef.createElement('span');
  sourceLabel.id = 'source-label';
  const sourceAge = documentRef.createElement('span');
  sourceAge.id = 'source-age';
  const sourceNotice = documentRef.createElement('span');
  sourceNotice.id = 'source-notice';
  sourceControls.append(fileInput, resetButton, sourceLabel, sourceAge, sourceNotice);
  root.append(sourceControls);

  // dashboardRoot() already seeds #go-live; real markup starts it disabled.
  const goLiveButton = root.querySelector('#go-live');
  goLiveButton.disabled = true;

  return { documentRef, goLiveButton };
}

test('opt-in Go-live control stays inert without a real live token and wires up when one is present', async () => {
  const realTimers = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
  };
  // Auto track scheduling and live polling both reach for real global timers;
  // stub them so this boot can't leave a pending handle after the test ends.
  globalThis.setTimeout = () => 0;
  globalThis.clearTimeout = () => {};
  globalThis.setInterval = () => 0;
  globalThis.clearInterval = () => {};
  try {
    for (const token of [undefined, '', LIVE_CONSTANTS.LIVE_TOKEN_PLACEHOLDER]) {
      const { documentRef, goLiveButton } = buildBootDocument();
      const windowRef = new FakeElement('div', documentRef);
      if (token !== undefined) windowRef.__LIVE_TOKEN__ = token;
      await startDashboard(documentRef, windowRef);
      assert.equal(goLiveButton.disabled, true, `token ${JSON.stringify(token)}`);
    }

    const { documentRef, goLiveButton } = buildBootDocument();
    const fetchCalls = [];
    const windowRef = new FakeElement('div', documentRef);
    windowRef.__LIVE_TOKEN__ = 'tok';
    windowRef.fetch = async (url, options) => {
      fetchCalls.push({ url, options });
      return {
        ok: true,
        json: async () => ({
          schemaVersion: LIVE_CONSTANTS.SCHEMA_V2,
          source: { kind: 'tmux_oneshot', collectorVersion: LIVE_CONSTANTS.COLLECTOR_VERSION },
          observedAt: new Date().toISOString(),
          sessions: [],
        }),
      };
    };
    await startDashboard(documentRef, windowRef);
    assert.equal(goLiveButton.disabled, false);
    assert.doesNotThrow(() => goLiveButton.dispatchEvent(new Event('click')));
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, LIVE_CONSTANTS.LIVE_SNAPSHOT_ROUTE);
    assert.equal(fetchCalls[0].options.headers[LIVE_CONSTANTS.LIVE_TOKEN_HEADER], 'tok');
  } finally {
    Object.assign(globalThis, realTimers);
  }
});
