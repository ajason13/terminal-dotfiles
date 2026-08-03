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
  assert.match(root.querySelector('#session-readout').textContent, /Launch Line/);
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
