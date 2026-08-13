import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { FixtureSessionAdapter } from '../src/fixture-adapter.mjs';
import { FIXTURE_SNAPSHOT } from '../src/fixture-sessions.mjs';
import {
  CAR_ASSET_CATALOG, CAR_VISUAL_CATALOG, computeTooltipShift, selectCarVisual,
} from '../src/render-dashboard.mjs';
import {
  PERMISSION_STATES,
  SESSION_STATUSES,
  STATE_PRESENTATION,
  SnapshotValidationError,
  buildAccessibleText,
  formatActivityAge,
  formatActivityTimestamp,
  normalizeSnapshot,
  parseWorkRef,
} from '../src/session-contract.mjs';
import {
  PIT_CAPACITY,
  ROUTE_ANCHORS,
  SEGMENTS,
  UNASSIGNED_BAY_LABEL,
  allocatePitBays,
  allocateSessions,
  fnv1a32,
  preferredRouteIndex,
} from '../src/track-layout.mjs';

const GENERATED_AT = '2026-07-19T20:30:00Z';
const BASE_STYLES = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const ROUTE_STYLES = readFileSync(new URL('../generated/route-motion.css', import.meta.url), 'utf8');
const STYLES = `${ROUTE_STYLES}\n${BASE_STYLES}`;
const INDEX = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const README = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const BROWSER_VERIFICATION = readFileSync(
  new URL('./BROWSER_VERIFICATION.md', import.meta.url), 'utf8',
);
const RENDERER = readFileSync(new URL('../src/render-dashboard.mjs', import.meta.url), 'utf8');
const ROUTE_CAPABILITY = readFileSync(
  new URL('../src/route-motion-capability.mjs', import.meta.url), 'utf8',
);

function session(id, status = 'active', overrides = {}) {
  const value = {
    id,
    displayName: `Session ${id}`,
    status,
    lastActivityAt: '2026-07-19T20:29:00Z',
    permissionState: status === 'waiting_for_permission' ? 'requested' : 'not_required',
    ...overrides,
  };
  if (status === 'error' && !('errorSummary' in overrides)) value.errorSummary = 'Focused test failure';
  return value;
}

function snapshot(sessions, overrides = {}) {
  return { schemaVersion: 1, generatedAt: GENERATED_AT, sessions, ...overrides };
}

function normalized(sessions) {
  return normalizeSnapshot(snapshot(sessions));
}

function expectInvalid(value, pattern) {
  assert.throws(() => normalizeSnapshot(value), (error) => {
    assert.ok(error instanceof SnapshotValidationError);
    assert.match(error.message, pattern);
    return true;
  });
}

test('exports the exact status, permission, and six visual mappings', () => {
  assert.deepEqual(SESSION_STATUSES, [
    'active', 'thinking', 'waiting_for_permission', 'idle', 'error', 'complete', 'unknown',
  ]);
  assert.deepEqual(PERMISSION_STATES, [
    'not_required', 'requested', 'granted', 'denied', 'unknown',
  ]);
  assert.deepEqual(Object.fromEntries(Object.entries(STATE_PRESENTATION)
    .map(([key, value]) => [key, [value.label, value.glyph, value.pool]])), {
    active: ['Active', '›', 'route'],
    thinking: ['Thinking', '…', 'route'],
    waiting_for_permission: ['Waiting for permission', '!', 'pit'],
    idle: ['Idle', '‖', 'pit'],
    error: ['Error', '×', 'pit'],
    complete: ['Complete', '✓', 'pit'],
    unknown: ['Unknown', '?', 'pit'],
  });
});

test('normalizes every state into its required pool and accessible text', () => {
  const statuses = SESSION_STATUSES.filter((status) => status !== 'unknown');
  const data = normalized(statuses.map((status, index) => session(`state-${index}`, status)));
  const placements = allocateSessions(data.sessions);
  const expectedPools = ['route', 'route', 'pit', 'pit', 'pit', 'pit'];
  placements.forEach((placement, index) => {
    const item = data.sessions[index];
    const text = buildAccessibleText(item, placement, data.generatedAt);
    assert.equal(placement.pool, expectedPools[index]);
    assert.match(text.label, new RegExp(`${item.mapCode}.*${STATE_PRESENTATION[item.status].label}`));
    assert.match(text.label, new RegExp(placement.locationLabel));
    assert.match(text.details, /Last (active|response): .+ \(1 minute ago\)/);
  });
});

test('fixture adapter returns independent fixture snapshots', async () => {
  const adapter = new FixtureSessionAdapter(FIXTURE_SNAPSHOT);
  const first = await adapter.readSnapshot();
  const second = await adapter.readSnapshot();
  first.sessions[0].displayName = 'Changed locally';
  assert.notEqual(first, second);
  assert.notEqual(first.sessions, second.sessions);
  assert.notEqual(second.sessions[0].displayName, 'Changed locally');
});

test('whole snapshot fails for schema, collection, and mixed non-progress field errors', () => {
  expectInvalid(snapshot([], { schemaVersion: 2 }), /schemaVersion/);
  expectInvalid({ schemaVersion: 1, generatedAt: GENERATED_AT, sessions: null }, /sessions must/);
  expectInvalid(snapshot([session('valid'), { ...session('invalid'), displayName: '' }]), /displayName/);
  expectInvalid(snapshot([session('valid'), { ...session('invalid'), permissionState: undefined }]), /permissionState/);
  expectInvalid(snapshot([session('valid'), { ...session('invalid'), phase: ' ' }]), /phase/);
});

test('malformed snapshot and session timestamps fail visibly', () => {
  expectInvalid(snapshot([], { generatedAt: 'yesterday' }), /generatedAt/);
  expectInvalid(snapshot([session('bad-time', 'active', { lastActivityAt: '2026/07/19' })]), /lastActivityAt/);
});

test('progress accepts missing and inclusive boundaries with exact slot behavior', () => {
  const missing = normalized([session('hash-me')]).sessions[0];
  const zero = normalized([session('zero', 'active', { progress: 0 })]).sessions[0];
  const one = normalized([session('one', 'active', { progress: 1 })]).sessions[0];
  assert.equal(preferredRouteIndex(missing), fnv1a32('hash-me') % 16);
  assert.equal(preferredRouteIndex(zero), 0);
  assert.equal(preferredRouteIndex(one), 15);
});

test('progress rejects non-finite, non-number, and out-of-range values', () => {
  for (const value of [NaN, Infinity, -Infinity, '0.5', -0.01, 1.01]) {
    expectInvalid(snapshot([session(`bad-${String(value)}`, 'active', { progress: value })]), /progress/);
  }
});

test('permission and error invariants fail closed', () => {
  for (const permissionState of ['not_required', 'granted', 'unknown']) {
    expectInvalid(snapshot([session(`wait-${permissionState}`, 'waiting_for_permission', { permissionState })]), /permissionState/);
  }
  for (const permissionState of ['requested', 'denied']) {
    expectInvalid(snapshot([session(`active-${permissionState}`, 'active', { permissionState })]), /permissionState/);
  }
  expectInvalid(snapshot([session('error-no-summary', 'error', { errorSummary: undefined })]), /errorSummary/);
  expectInvalid(snapshot([session('active-with-error', 'active', { errorSummary: 'not allowed' })]), /errorSummary/);
  assert.doesNotThrow(() => normalized([
    session('requested', 'waiting_for_permission', { permissionState: 'requested' }),
    session('denied', 'waiting_for_permission', { permissionState: 'denied' }),
  ]));
});

test('duplicate IDs fail while duplicate names receive stable unique codes', () => {
  expectInvalid(snapshot([session('same'), session('same')]), /duplicates/);
  const first = normalizeSnapshot(snapshot([
    session('z-id', 'idle', { displayName: 'Relay' }),
    session('a-id', 'complete', { displayName: 'Relay' }),
  ]));
  assert.equal(first.sessions.find((item) => item.id === 'a-id').mapCode, 'S01');
  assert.equal(first.sessions.find((item) => item.id === 'z-id').mapCode, 'S02');
  assert.notEqual(first.sessions[0].mapCode, first.sessions[1].mapCode);
});

test('document removes the status rail and declares the exact ordered pit stack', () => {
  assert.doesNotMatch(INDEX, /status-rail|session-list|Text equivalent|Session status/);
  const orderedIds = ['on-track-summary', 'map-stage', 'pit'];
  let previous = -1;
  for (const id of orderedIds) {
    const position = INDEX.indexOf(`id="${id}"`);
    assert.ok(position > previous, `${id} must follow the previous pit`);
    previous = position;
  }
  assert.match(RENDERER, /placement\.pool === 'route' \? 'route' : 'pit'/);
  assert.match(RENDERER, /vehicleLayer\.append\(car\.wrapper\)/);
  assert.match(RENDERER, /bay\.mount\.append\(item\.wrapper\)/);
  assert.match(RENDERER, /for \(const status of \['active', 'thinking'\]\)/);
  assert.match(RENDERER, /aria-label', `\$\{count\} \$\{presentation\.label\.toLowerCase\(\)\} sessions on track`/);
  const summarySource = RENDERER.slice(
    RENDERER.indexOf('function renderOnTrackSummary'),
    RENDERER.indexOf('const POOL_LABELS'),
  );
  assert.doesNotMatch(summarySource, /makeCar|session-car|createElement\('button'/);
  assert.doesNotMatch(INDEX, /pit-error|pit-permission|pit-pitstop|unknown-hold|pit-complete|pit-idle/);
});

test('dashboard uses a compact header and preserves document scrolling on desktop', () => {
  const header = STYLES.match(/\.dashboard-bar\s*\{([^}]*)\}/s)?.[1] ?? '';
  const controls = STYLES.match(/\.source-controls\s*\{([^}]*)\}/s)?.[1] ?? '';
  const legend = STYLES.match(/\.state-legend\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(header, /display:\s*flex/);
  assert.match(header, /padding:\s*6px 14px/);
  assert.match(controls, /margin-left:\s*auto/);
  assert.match(legend, /display:\s*flex/);
  assert.doesNotMatch(
    STYLES,
    /@media\s*\(min-width:\s*760px\)[\s\S]*?\.dashboard-root\s*\{[\s\S]*?overflow:\s*hidden/,
  );
  assert.match(STYLES, /\.dashboard-root\s*\{[\s\S]*?min-height:\s*100dvh/);
});

test('activity ages use the deterministic snapshot clock', () => {
  assert.equal(formatActivityAge('2026-07-19T20:29:52Z', GENERATED_AT), '8 seconds ago');
  assert.equal(formatActivityAge('2026-07-19T19:30:00Z', GENERATED_AT), '1 hour ago');
  assert.equal(formatActivityAge('2026-07-18T20:30:00Z', GENERATED_AT), '1 day ago');
});

test('exact timestamps are deterministic under fixed UTC and use state-specific wording', () => {
  assert.equal(
    formatActivityTimestamp('2026-07-19T20:29:00Z', { locale: 'en-US', timeZone: 'UTC' }),
    'Jul 19, 2026, 8:29:00 PM UTC',
  );
  const activeData = normalized([session('active-time')]);
  const activePlacement = allocateSessions(activeData.sessions)[0];
  const activeText = buildAccessibleText(
    activeData.sessions[0], activePlacement, activeData.generatedAt,
    { locale: 'en-US', timeZone: 'UTC' },
  );
  assert.match(activeText.details, /Last active: Jul 19, 2026, 8:29:00 PM UTC \(1 minute ago\)/);

  const completeData = normalized([session('complete-time', 'complete')]);
  const completePlacement = allocateSessions(completeData.sessions)[0];
  const completeText = buildAccessibleText(
    completeData.sessions[0], completePlacement, completeData.generatedAt,
    { locale: 'en-US', timeZone: 'UTC' },
  );
  assert.match(completeText.details, /Last response: Jul 19, 2026, 8:29:00 PM UTC \(1 minute ago\)/);
  assert.equal(completeText.activity.datetime, '2026-07-19T20:29:00Z');
});

test('parseWorkRef extracts a ticket-only name', () => {
  assert.deepEqual(parseWorkRef('BB-228 route tooltip'), {
    ticketKey: 'BB-228', prNumber: null, label: 'route tooltip', sessionName: null,
  });
});

test('parseWorkRef extracts a PR-only name and leaves ticketKey null', () => {
  assert.deepEqual(parseWorkRef('PR#57 live adapter'), {
    ticketKey: null, prNumber: 57, label: 'live adapter', sessionName: null,
  });
});

test('parseWorkRef extracts both a ticket and a PR', () => {
  assert.deepEqual(parseWorkRef('BB-228 PR#42 route tooltip'), {
    ticketKey: 'BB-228', prNumber: 42, label: 'route tooltip', sessionName: null,
  });
});

test('parseWorkRef returns nulls and the full name when neither token is present', () => {
  assert.deepEqual(parseWorkRef('Aoba'), {
    ticketKey: null, prNumber: null, label: 'Aoba', sessionName: null,
  });
});

test('parseWorkRef tolerates PR spacing variants', () => {
  assert.equal(parseWorkRef('feature PR 42').prNumber, 42);
  assert.equal(parseWorkRef('feature PR #42').prNumber, 42);
  assert.equal(parseWorkRef('feature pr42').prNumber, 42);
  assert.equal(parseWorkRef('feature PR#42').prNumber, 42);
});

test('parseWorkRef strips the pane suffix from the label', () => {
  assert.deepEqual(parseWorkRef('verifying BB-511 output · pane 2'), {
    ticketKey: 'BB-511', prNumber: null, label: 'verifying output', sessionName: null,
  });
});

test('parseWorkRef yields an empty label when the name is only tokens', () => {
  assert.deepEqual(parseWorkRef('BB-228 PR#42'), {
    ticketKey: 'BB-228', prNumber: 42, label: '', sessionName: null,
  });
});

test('parseWorkRef yields an empty label for a bare ref with a pane suffix', () => {
  assert.deepEqual(parseWorkRef('BB-325 · pane 1'), {
    ticketKey: 'BB-325', prNumber: null, label: '', sessionName: null,
  });
});

test('parseWorkRef strips the pane suffix from a name with no tokens', () => {
  assert.deepEqual(parseWorkRef('Synthetic active · pane 1'), {
    ticketKey: null, prNumber: null, label: 'Synthetic active', sessionName: null,
  });
});

test('parseWorkRef keeps the no-separator "Pane <N>" fallback name intact', () => {
  // sanitizeDisplayName emits `Pane 3` (no separator) for an empty window name.
  assert.deepEqual(parseWorkRef('Pane 3'), {
    ticketKey: null, prNumber: null, label: 'Pane 3', sessionName: null,
  });
});

test('parseWorkRef drops separators orphaned by token removal', () => {
  assert.equal(parseWorkRef('BB-228 · route tooltip').label, 'route tooltip');
  assert.equal(parseWorkRef('route tooltip · BB-228').label, 'route tooltip');
  assert.equal(parseWorkRef('left · BB-228 · right').label, 'left · right');
});

test('parseWorkRef leaves an untouched separator alone when no token matched', () => {
  assert.equal(parseWorkRef('foo·bar').label, 'foo·bar');
});

// `BB-76 - Track History` is the operator's real window-naming convention, and a
// dash orphaned by the ref left the heading reading `- Track History`.
test('parseWorkRef drops a dash, colon or pipe orphaned by token removal', () => {
  assert.equal(parseWorkRef('E2E ▸ BB-76 - Track History').label, 'Track History');
  assert.equal(parseWorkRef('E2E ▸ PR #521 - Fix Project Flag').label, 'Fix Project Flag');
  assert.equal(parseWorkRef('BB-76: Track History').label, 'Track History');
  assert.equal(parseWorkRef('BB-76 — Track History').label, 'Track History');
  assert.equal(parseWorkRef('BB-76 | Track History').label, 'Track History');
  assert.equal(parseWorkRef('Track History - BB-76').label, 'Track History');
  assert.equal(parseWorkRef('left - BB-228 - right').label, 'left - right');
});

// Only separator adjacency marks one as orphaned, so a hyphen doing real work
// inside a word survives the collapse.
test('parseWorkRef keeps a hyphen that is part of a word', () => {
  assert.equal(parseWorkRef('BB-76 Rate-limit retry').label, 'Rate-limit retry');
  assert.equal(parseWorkRef('e2e-automation - BB-76').label, 'e2e-automation');
  assert.equal(parseWorkRef('Rate-limit retry').label, 'Rate-limit retry');
});

test('parseWorkRef returns the tmux session so the tooltip can show it', () => {
  assert.equal(parseWorkRef('E2E ▸ BB-76 - Track History').sessionName, 'E2E');
  assert.equal(parseWorkRef('Workflow ▸ Cross Talk').sessionName, 'Workflow');
  assert.equal(parseWorkRef('Aoba').sessionName, null);
  // sanitizeDisplayName omits the prefix entirely for an unnamed session.
  assert.equal(parseWorkRef(' ▸ Cross Talk').sessionName, null);
});

test('parseWorkRef strips the session prefix so the heading stays the window name', () => {
  assert.deepEqual(parseWorkRef('E2E ▸ BB-325 · pane 1'), {
    ticketKey: 'BB-325', prNumber: null, label: '', sessionName: 'E2E',
  });
  assert.equal(parseWorkRef('E2E ▸ verifying BB-511 output · pane 2').label, 'verifying output');
  assert.equal(parseWorkRef('API ▸ Aoba').label, 'Aoba');
  assert.equal(parseWorkRef('E2E ▸ PR #495 · pane 1').prNumber, 495);
});

test('parseWorkRef strips only the first ▸, which is always the session delimiter', () => {
  // sanitizeDisplayName strips ▸ from both segments, so a second one cannot come
  // from tmux. Guard the parse anyway: a hand-authored snapshot could carry one.
  assert.equal(parseWorkRef('E2E ▸ left ▸ right').label, 'left ▸ right');
});

test('buildAccessibleText exposes the parsed work-ref for the renderer', () => {
  const data = normalized([session('ref', 'active', { displayName: 'BB-228 PR#42 route tooltip' })]);
  const placement = allocateSessions(data.sessions)[0];
  const text = buildAccessibleText(data.sessions[0], placement, data.generatedAt);
  assert.deepEqual(text.workRef, { ticketKey: 'BB-228', prNumber: 42, label: 'route tooltip', sessionName: null });
});

test('buildAccessibleText work-ref is null when the name has no tokens', () => {
  const data = normalized([session('plain', 'active', { displayName: 'Aoba' })]);
  const placement = allocateSessions(data.sessions)[0];
  const text = buildAccessibleText(data.sessions[0], placement, data.generatedAt);
  assert.deepEqual(text.workRef, { ticketKey: null, prNumber: null, label: 'Aoba', sessionName: null });
});

test('buildAccessibleText omits permission text for every permission state', () => {
  for (const permissionState of ['requested', 'denied', 'granted', 'unknown', 'not_required']) {
    const status = permissionState === 'requested' || permissionState === 'denied'
      ? 'waiting_for_permission'
      : 'active';
    const data = normalized([session(`perm-${permissionState}`, status, { permissionState })]);
    const placement = allocateSessions(data.sessions)[0];
    const text = buildAccessibleText(data.sessions[0], placement, data.generatedAt);
    assert.doesNotMatch(text.details, /Permission/i, `${permissionState} leaked permission text`);
  }
});

test('buildAccessibleText labels an observed activity "Seen" and shortens sub-minute ages', () => {
  // `observed` is unreachable through normalizeSnapshot (fixtures are always
  // last_activity/last_response), so build the live-shaped session directly.
  const observed = {
    id: 'live',
    displayName: 'BB-325 · pane 1',
    mapCode: 'S01',
    status: 'active',
    permissionState: 'unknown',
    lastActivityAt: '2026-07-19T20:29:52Z',
    activity: { kind: 'observed', at: '2026-07-19T20:29:52Z' },
  };
  const placement = allocateSessions([observed])[0];
  const text = buildAccessibleText(observed, placement, GENERATED_AT);
  assert.equal(text.activity.label, 'Seen');
  assert.equal(text.activity.relative, '8 seconds ago');
  assert.equal(text.activity.short, 'just now');
  assert.equal(text.activity.datetime, '2026-07-19T20:29:52Z');
});

test('activity.short falls back to the precise wording at and beyond one minute', () => {
  const at = (lastActivityAt) => {
    const data = normalized([session('short-band', 'active', { lastActivityAt })]);
    const placement = allocateSessions(data.sessions)[0];
    return buildAccessibleText(data.sessions[0], placement, data.generatedAt).activity;
  };
  assert.equal(at('2026-07-19T20:29:01Z').short, 'just now');
  assert.equal(at('2026-07-19T20:29:00Z').short, '1 minute ago');
  assert.equal(at('2026-07-19T20:29:00Z').relative, '1 minute ago');
});

test('buildAccessibleText keeps the aria-label intact for both overflowed and placed sessions', () => {
  const data = normalized(poolSet('active', 17, 'ov'));
  const placements = allocateSessions(data.sessions);
  const overflowed = placements.find((item) => item.overflow);
  const placed = placements.find((item) => !item.overflow);
  const pick = (placement) => data.sessions.find((item) => item.id === placement.id);

  const overflowText = buildAccessibleText(pick(overflowed), overflowed, data.generatedAt);
  assert.match(overflowText.label, /Map capacity exceeded for Shared Route/);

  const placedText = buildAccessibleText(pick(placed), placed, data.generatedAt);
  // The aria-label keeps the map code, the full displayName, and the location.
  const item = pick(placed);
  assert.equal(
    placedText.label,
    `${item.mapCode}, ${item.displayName}, Active, ${placed.locationLabel}`,
  );
});

test('FNV-1a-32 matches known vectors and the downhill touge has exact capacities', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('hello'), 0x4f9f2cab);
  assert.deepEqual(SEGMENTS, [
    'High Moor',
    'Pass Ladder',
    'Cedar Chain',
    'Cloud Ridge',
    'Long Arc',
    'Valley Gate',
  ]);
  assert.equal(ROUTE_ANCHORS.length, 16);
  assert.deepEqual(SEGMENTS.map((segment) => (
    ROUTE_ANCHORS.filter((item) => item.poolLabel === segment).length
  )), [2, 3, 3, 3, 3, 2]);
  assert.deepEqual(ROUTE_ANCHORS.map((item) => item.poolLabel), [
    'High Moor', 'High Moor',
    'Pass Ladder', 'Pass Ladder', 'Pass Ladder',
    'Cedar Chain', 'Cedar Chain', 'Cedar Chain',
    'Cloud Ridge', 'Cloud Ridge', 'Cloud Ridge',
    'Long Arc', 'Long Arc', 'Long Arc',
    'Valley Gate', 'Valley Gate',
  ]);
  assert.equal(PIT_CAPACITY, 18);
});

test('document keeps Ridge Pass as one original continuous six-part centerline', () => {
  assert.match(INDEX, /id="ridge-pass-centerline"/);
  assert.equal((INDEX.match(/href="#ridge-pass-centerline"/g) ?? []).length, 2);
  for (const name of [
    'HIGH MOOR', 'PASS LADDER', 'CEDAR CHAIN',
    'CLOUD RIDGE', 'LONG ARC', 'VALLEY GATE',
  ]) assert.match(INDEX, new RegExp(`>${name}<`));
  for (const className of [
    'segment-high-moor', 'segment-pass-ladder', 'segment-cedar-chain',
    'segment-cloud-ridge', 'segment-long-arc', 'segment-valley-gate',
  ]) {
    assert.match(INDEX, new RegExp(`class="${className}"`));
    assert.match(STYLES, new RegExp(`\\.${className}\\s*\\{`));
  }
  for (const removed of [
    'Lower Hairpins', 'Cedar Bend', 'Ridge Run', 'Summit Approach',
    'LOWER HAIRPINS', 'CEDAR BEND', 'RIDGE RUN', 'SUMMIT APPROACH',
    'Summit Hook', 'Ridge Traverse', 'Rockcut Sweep', 'Cedar Esses',
    'Needle Stack', 'Lower Gate',
    'SUMMIT HOOK', 'RIDGE TRAVERSE', 'ROCKCUT SWEEP', 'CEDAR ESSES',
    'NEEDLE STACK', 'LOWER GATE',
    'Moonwatch', 'MOONWATCH', 'Shelter', 'SHELTER',
  ]) {
    for (const source of [INDEX, STYLES, README, BROWSER_VERIFICATION]) {
      assert.equal(source.includes(removed), false, removed);
    }
    assert.equal(SEGMENTS.includes(removed), false, removed);
  }
  assert.doesNotMatch(INDEX, /M96 696 C278 612 716 730 904 626/);
  assert.equal((INDEX.match(/id="ridge-pass-centerline"/g) ?? []).length, 1);
});

test('the approved touge is horizontally mirrored while traversal order and height stay fixed', () => {
  const originalAnchors = [
    [918, 72], [786, 126], [618, 160], [724, 220],
    [732, 306], [568, 322], [460, 400], [330, 450],
    [400, 520], [500, 560], [610, 585], [744, 612],
    [654, 723], [432, 662], [240, 680], [88, 728],
  ];
  ROUTE_ANCHORS.forEach((anchor, index) => {
    const expected = [1000 - originalAnchors[index][0], originalAnchors[index][1]];
    assert.ok(Math.hypot(anchor.x - expected[0], anchor.y - expected[1]) <= 0.5);
  });
  assert.ok(ROUTE_ANCHORS[0].x < ROUTE_ANCHORS.at(-1).x);
  assert.equal(ROUTE_ANCHORS[0].poolLabel, 'High Moor');
  assert.equal(ROUTE_ANCHORS.at(-1).poolLabel, 'Valley Gate');

  assert.match(INDEX, /data-track-art="ridge-pass"[\s\S]*?transform="translate\(1000 0\) scale\(-1 1\)"/);
  assert.doesNotMatch(INDEX, /class="segment-labels"[^>]*transform=/);
  for (const [className, x, y] of [
    ['label-high-moor', 142, 50],
    ['label-pass-ladder', 116, 246],
    ['label-cedar-chain', 626, 358],
    ['label-cloud-ridge', 568, 558],
    ['label-long-arc', 350, 674],
    ['label-valley-gate', 900, 688],
  ]) {
    assert.match(INDEX, new RegExp(`class="${className}" x="${x}" y="${y}"`));
  }
});

test('all touge route anchors preserve non-overlapping 44px circular mobile targets', () => {
  const mapWidth = 370.4;
  const mapHeight = 580;
  const targetDiameter = 44;
  const targetRadius = targetDiameter / 2;
  const anchors = ROUTE_ANCHORS;
  const targets = anchors.map((item) => ({
    id: item.id,
    x: item.x * mapWidth / 1000,
    y: item.y * mapHeight / 760,
  }));
  assert.equal(targets.every((target) => (
    target.x - targetRadius >= 0 && target.x + targetRadius <= mapWidth
    && target.y - targetRadius >= 0 && target.y + targetRadius <= mapHeight
  )), true);
  for (let first = 0; first < targets.length; first += 1) {
    for (let second = first + 1; second < targets.length; second += 1) {
      const left = targets[first];
      const right = targets[second];
      const centerDistance = Math.hypot(left.x - right.x, left.y - right.y);
      assert.ok(
        centerDistance >= targetDiameter,
        `${left.id}/${right.id} centers are only ${centerDistance.toFixed(2)}px apart`,
      );
    }
  }
});

test('collisions probe forward by canonical ID and ignore input order', () => {
  const source = normalized([
    session('zulu', 'thinking', { progress: 0.5 }),
    session('alpha', 'active', { progress: 0.5 }),
    session('mike', 'thinking', { progress: 0.5 }),
  ]).sessions;
  const byId = (items) => Object.fromEntries(items.map((item) => [item.id, item.slotIndex]));
  const forward = byId(allocateSessions(source));
  const reversed = byId(allocateSessions([...source].reverse()));
  assert.deepEqual(forward, { zulu: 10, alpha: 8, mike: 9 });
  assert.deepEqual(reversed, forward);
});

test('canonical 24-session fixture has exact distribution, unique anchors, and no overflow', () => {
  const data = normalizeSnapshot(FIXTURE_SNAPSHOT);
  const counts = Object.fromEntries(SESSION_STATUSES.map((status) => [
    status, data.sessions.filter((item) => item.status === status).length,
  ]));
  assert.deepEqual(counts, {
    active: 6, thinking: 6, waiting_for_permission: 3, idle: 3, error: 3, complete: 3,
    unknown: 0,
  });
  const placements = allocateSessions(data.sessions);
  assert.equal(placements.length, 24);
  assert.equal(placements.some((item) => item.overflow), false);
  assert.equal(new Set(placements.map((item) => `${item.pool}:${item.slotIndex}`)).size, 24);
  assert.deepEqual(Object.fromEntries(['route', 'pit'].map((pool) => [
    pool, placements.filter((item) => item.pool === pool).length,
  ])), { route: 12, pit: 12 });
  const pit = placements.filter((item) => item.pool === 'pit');
  assert.equal(new Set(pit.map((item) => item.slotIndex)).size, 12);
  assert.match(RENDERER, /const car = makeCar\(documentRef, session, placement, text, target\)/);
});

function poolSet(status, count, prefix) {
  return Array.from({ length: count }, (_, index) => session(
    `${prefix}-${String(index).padStart(2, '0')}`,
    status,
    status === 'active' ? { progress: index / Math.max(1, count - 1) } : {},
  ));
}

test('34 sessions fit when every independent pool is within capacity', () => {
  const items = [
    ...poolSet('active', 16, 'route'),
    ...poolSet('waiting_for_permission', 6, 'permission'),
    ...poolSet('error', 6, 'error'),
    ...poolSet('idle', 3, 'idle'),
    ...poolSet('complete', 3, 'complete'),
  ];
  const placements = allocateSessions(normalized(items).sessions);
  assert.equal(placements.length, 34);
  assert.equal(placements.some((item) => item.overflow), false);
});

test('route session 17 overflows without reusing a slot and retains accessible detail', () => {
  const data = normalized(poolSet('active', 17, 'route-overflow'));
  const placements = allocateSessions(data.sessions);
  const overflowed = placements.filter((item) => item.overflow);
  assert.equal(overflowed.length, 1);
  assert.equal(new Set(placements.filter((item) => !item.overflow).map((item) => item.slotIndex)).size, 16);
  const item = data.sessions.find((candidate) => candidate.id === overflowed[0].id);
  const text = buildAccessibleText(item, overflowed[0], data.generatedAt);
  assert.match(text.label, /Map capacity exceeded for Shared Route/);
  assert.match(text.label, new RegExp(item.displayName));
  assert.match(text.details, /Last active/);
});

test('pit orders newest lastActivityAt first regardless of input order', () => {
  const mk = (id, at) => session(id, 'complete', { lastActivityAt: at });
  const data = normalized([
    mk('b', '2026-08-05T10:00:00Z'),
    mk('a', '2026-08-05T10:05:00Z'),
    mk('c', '2026-08-05T09:55:00Z'),
  ]);
  const order = allocateSessions(data.sessions)
    .slice().sort((l, r) => l.slotIndex - r.slotIndex).map((p) => p.id);
  assert.deepEqual(order, ['a', 'b', 'c']); // 10:05, 10:00, 09:55
});

test('pit ties on identical lastActivityAt break by id ascending', () => {
  const at = '2026-08-05T10:00:00Z';
  const data = normalized([
    session('zulu', 'idle', { lastActivityAt: at }),
    session('alpha', 'error', { lastActivityAt: at, errorSummary: 'x' }),
    session('mike', 'complete', { lastActivityAt: at }),
  ]);
  const order = allocateSessions(data.sessions)
    .slice().sort((l, r) => l.slotIndex - r.slotIndex).map((p) => p.id);
  assert.deepEqual(order, ['alpha', 'mike', 'zulu']);
});

test('pit caps at 18 and overflows the oldest, keeping newest onscreen', () => {
  const items = Array.from({ length: 20 }, (_, i) => session(
    `s-${String(i).padStart(2, '0')}`,
    'complete',
    // s-00 newest ... s-19 oldest
    { lastActivityAt: `2026-08-05T10:${String(40 - i).padStart(2, '0')}:00Z` },
  ));
  const data = normalized(items);
  const placements = allocateSessions(data.sessions);
  const overflowed = placements.filter((p) => p.overflow);
  assert.equal(overflowed.length, 2);
  // the two OLDEST overflow
  assert.deepEqual(overflowed.map((p) => p.id).sort(), ['s-18', 's-19']);
  const shown = placements.filter((p) => !p.overflow);
  assert.equal(new Set(shown.map((p) => p.slotIndex)).size, 18);
  const newest = placements.find((p) => p.slotIndex === 0);
  assert.equal(newest.id, 's-00');
  const item = data.sessions.find((s) => s.id === overflowed[0].id);
  const text = buildAccessibleText(item, overflowed[0], data.generatedAt);
  assert.match(text.label, /Map capacity exceeded for Pit/);
});

test('long names remain complete in accessible labels', () => {
  const longName = 'A local analysis session with an intentionally long name that must never be abbreviated';
  const data = normalized([session('long-name', 'idle', { displayName: longName })]);
  const placement = allocateSessions(data.sessions)[0];
  const text = buildAccessibleText(data.sessions[0], placement, data.generatedAt);
  assert.match(text.label, new RegExp(longName));
  assert.equal(text.label.includes('…'), false);
});

function cssTokens(source) {
  return Object.fromEntries([...source.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)]
    .map((match) => [match[1].replace(/^color-/, ''), match[2]]));
}

function relativeLuminance(hex) {
  const channels = hex.slice(1).match(/.{2}/g).map((pair) => parseInt(pair, 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05)
    / (Math.min(firstLuminance, secondLuminance) + 0.05);
}

test('solid CSS text and state-glyph tokens meet WCAG 4.5:1 contrast', () => {
  const tokens = cssTokens(STYLES);
  const pairs = [
    ['text-primary', 'surface-night'],
    ['text-primary', 'surface-panel'],
    ['text-muted', 'surface-panel'],
    ['active-ink', 'active-bg'],
    ['thinking-ink', 'thinking-bg'],
    ['waiting-ink', 'waiting-bg'],
    ['idle-ink', 'idle-bg'],
    ['error-ink', 'error-bg'],
    ['complete-ink', 'complete-bg'],
    ['active-ink', 'surface-panel'],
    ['thinking-ink', 'surface-panel'],
    ['waiting-ink', 'surface-panel'],
    ['idle-ink', 'surface-panel'],
    ['error-ink', 'surface-panel'],
    ['complete-ink', 'surface-panel'],
  ];
  for (const [foreground, background] of pairs) {
    assert.ok(tokens[foreground], `missing solid token ${foreground}`);
    assert.ok(tokens[background], `missing solid token ${background}`);
    const ratio = contrastRatio(tokens[foreground], tokens[background]);
    assert.ok(ratio >= 4.5, `${foreground}/${background} contrast ${ratio.toFixed(2)} is below 4.5`);
  }
});

test('focus and meaningful boundary tokens meet WCAG 3:1 non-text contrast', () => {
  const tokens = cssTokens(STYLES);
  for (const [foreground, background] of [
    ['focus', 'surface-night'],
    ['focus', 'surface-panel'],
    ['boundary', 'surface-night'],
    ['boundary', 'surface-panel'],
  ]) {
    const ratio = contrastRatio(tokens[foreground], tokens[background]);
    assert.ok(ratio >= 3, `${foreground}/${background} contrast ${ratio.toFixed(2)} is below 3`);
  }
});

test('compiled drift uses the route clock and parked cars remain static', () => {
  assert.match(STYLES, /\.car-motion\s*\{[^}]*animation:\s*none;[^}]*transform:\s*rotate\(var\(--drift-yaw,\s*0deg\)\)/si);
  assert.doesNotMatch(STYLES, /@keyframes\s+(?:active-drift|thinking-drift)/);
  assert.doesNotMatch(STYLES, /\.car-motion\s*\{[^}]*translate/si);
  assert.doesNotMatch(
    STYLES,
    /:where\(\[data-route-angle-motion="enabled"\]\)\[data-track-id\][\s\S]*?\.vehicle-anchor\.state-(?:active|thinking) \.car-motion\s*\{[^}]*animation:/si,
  );
  for (const parked of ['waiting-for-permission', 'idle', 'error', 'complete']) {
    assert.doesNotMatch(
      STYLES,
      new RegExp(`\\.state-${parked}\\s+\\.car-motion\\s*\\{[^}]*animation\\s*:`, 'si'),
      `${parked} must remain parked`,
    );
  }
});

test('vehicle selector deterministically covers 64 combinations and the 32-file PNG catalog', () => {
  const codes = Array.from({ length: 64 }, (_, index) => `S${String(index + 1).padStart(2, '0')}`);
  const first = codes.map(selectCarVisual);
  const second = codes.map(selectCarVisual);
  assert.deepEqual(first.map(({ modelKey, liveryKey, view }) => ({ modelKey, liveryKey, view })),
    second.map(({ modelKey, liveryKey, view }) => ({ modelKey, liveryKey, view })));
  assert.equal(new Set(first.map(({ modelKey, liveryKey }) => `${modelKey}/${liveryKey}`)).size, 64);
  assert.deepEqual(new Set(first.map(({ modelKey }) => modelKey)),
    new Set(CAR_VISUAL_CATALOG.models.map(({ key }) => key)));
  assert.deepEqual(new Set(first.map(({ liveryKey }) => liveryKey)),
    new Set(CAR_VISUAL_CATALOG.liveries.map(({ key }) => key)));
  assert.deepEqual(new Set(first.map(({ view }) => view)), new Set(['side', 'front', 'rear']));
  assert.equal(new Set(first.map(({ signatureKey }) => signatureKey)).size, 8);
  assert.deepEqual(first.slice(0, 8).map(({ modelKey }) => modelKey),
    CAR_VISUAL_CATALOG.models.map(({ key }) => key));
  assert.deepEqual(new Set(first.slice(0, 8).map(({ liveryKey }) => liveryKey)),
    new Set(['center-stripe']));
  assert.deepEqual(first.slice(8, 16).map(({ modelKey }) => modelKey),
    CAR_VISUAL_CATALOG.models.map(({ key }) => key));
  assert.deepEqual(new Set(first.slice(8, 16).map(({ liveryKey }) => liveryKey)),
    new Set(['twin-stripe']));
  assert.deepEqual(CAR_VISUAL_CATALOG.models.map(({
    key, nativeTopNose, topCorrection,
  }) => ({ key, nativeTopNose, topCorrection })), [
    { key: 'coupe', nativeTopNose: 'down', topCorrection: 180 },
    { key: 'hatchback', nativeTopNose: 'down', topCorrection: 180 },
    { key: 'sedan', nativeTopNose: 'up', topCorrection: 0 },
    { key: 'wagon', nativeTopNose: 'up', topCorrection: 0 },
    { key: 'roadster', nativeTopNose: 'up', topCorrection: 0 },
    { key: 'rally', nativeTopNose: 'down', topCorrection: 180 },
    { key: 'fastback', nativeTopNose: 'up', topCorrection: 0 },
    { key: 'utility', nativeTopNose: 'up', topCorrection: 0 },
  ]);
  assert.ok(Object.isFrozen(CAR_VISUAL_CATALOG));
  assert.ok(Object.isFrozen(CAR_ASSET_CATALOG));

  const expectedNames = [];
  const paths = new Set();
  for (const model of CAR_VISUAL_CATALOG.models) {
    const family = CAR_ASSET_CATALOG[model.key];
    assert.ok(Object.isFrozen(family));
    assert.deepEqual(new Set(Object.keys(family)), new Set(['top', 'side', 'front', 'rear']));
    for (const [view, asset] of Object.entries(family)) {
      assert.ok(Object.isFrozen(asset));
      const name = `${model.key}-${view}.png`;
      expectedNames.push(name);
      assert.equal(asset.path, `assets/cars/${name}`);
      assert.equal(paths.has(asset.path), false);
      paths.add(asset.path);
      assert.equal(asset.width, view === 'top' ? 32 : 48);
      assert.equal(asset.height, view === 'top' ? 48 : 32);
      assert.doesNotMatch(asset.path, /^(?:data:|https?:)/);

      const bytes = readFileSync(new URL(`../${asset.path}`, import.meta.url));
      assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
      assert.equal(bytes.readUInt32BE(16), asset.width);
      assert.equal(bytes.readUInt32BE(20), asset.height);
      assert.equal(bytes[24], 8, `${name} uses 8-bit channels`);
      assert.equal(bytes[25], 6, `${name} is RGBA and carries alpha`);
      assert.equal(bytes[28], 0, `${name} is non-interlaced`);
    }
  }
  assert.equal(paths.size, 32);
  assert.deepEqual(
    readdirSync(new URL('../assets/cars/', import.meta.url)).filter((name) => name.endsWith('.png')).sort(),
    expectedNames.sort(),
  );
});

test('session controls render generated top-down PNG cars without shrinking the accessible target', () => {
  assert.match(RENDERER, /function makeCarImage\(documentRef, visual, view, className\)/);
  assert.match(RENDERER, /element\(documentRef, 'img', className\)/);
  assert.match(RENDERER, /function makeCarSilhouette\(documentRef, visual\)/);
  assert.match(RENDERER, /makeCarImage\(documentRef, visual, 'top', 'car-sprite'\)/);
  assert.match(RENDERER, /alt: ''/);
  assert.match(RENDERER, /'aria-hidden': 'true'/);
  assert.match(RENDERER, /draggable: 'false'/);
  assert.match(STYLES, /\.session-car\s*\{[^}]*width:\s*calc\(52 \* var\(--car-unit\)\);[^}]*height:\s*calc\(52 \* var\(--car-unit\)\);[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;[^}]*border:\s*0;[^}]*background:\s*transparent/si);
  assert.match(STYLES, /\.car-body\s*\{[^}]*width:\s*calc\(32 \* var\(--car-unit\)\);[^}]*height:\s*calc\(48 \* var\(--car-unit\)\)/si);
  assert.match(STYLES, /\.car-sprite\s*\{[^}]*image-rendering:\s*pixelated/si);
  assert.doesNotMatch(RENDERER,
    /svgElement|appendLivery|'car-overlay'|'vehicle-preview-overlay'|'car-livery'|'vehicle-preview-livery'|'car-centerline'|'car-headlamp'/);
  assert.doesNotMatch(STYLES,
    /\.car-overlay|\.vehicle-preview-overlay|\.car-livery|\.vehicle-preview-livery|\.car-centerline|\.car-headlamp/);
  assert.match(STYLES,
    /\.car-sprite\[data-car-top-correction="180"\]\s*\{[^}]*transform:\s*rotate\(180deg\)/si);
  assert.doesNotMatch(STYLES, /data-car-view="top"[^}]*rotate\(180deg\)/si);
  assert.doesNotMatch(STYLES, /\.vehicle-preview-image[^}]*rotate\(180deg\)/si);
});


test('route car art scales with the stretched track while pit cars stay at reference size', () => {
  const rootRule = STYLES.match(/^:root\s*\{([^}]*)\}/ms)?.[1] ?? '';
  // Pit cars sit outside the stage container, so the inherited default must stay 1px.
  assert.match(rootRule, /--car-unit:\s*1px/);
  assert.match(rootRule, /--car-reference-stretch:\s*1\.2/);
  assert.match(STYLES, /\.map-stage\s*\{[^}]*container-type:\s*size/si);

  const anchorRule = STYLES.match(/\.vehicle-anchor\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(anchorRule, /--car-unit:\s*clamp\(\s*1px,/si);
  assert.match(anchorRule, /100cqw \/ var\(--map-width\) \+ 100cqh \/ var\(--map-height\)/si);
  assert.match(anchorRule, /\/ var\(--car-reference-stretch\)/si);
  assert.match(anchorRule, /width:\s*calc\(52 \* var\(--car-unit\)\)/si);
  assert.doesNotMatch(anchorRule, /width:\s*52px/si);
});

test('all seven vehicle states retain accessible status text and state colors without car overlays', () => {
  for (const [status, glyph] of Object.entries({
    active: '›',
    thinking: '…',
    waiting_for_permission: '!',
    idle: '‖',
    error: '×',
    complete: '✓',
    unknown: '?',
  })) {
    assert.equal(STATE_PRESENTATION[status].glyph, glyph);
    assert.ok(STATE_PRESENTATION[status].label.length > 0);
  }
  assert.doesNotMatch(RENDERER, /'car-glyph'|'car-code'/);
  assert.doesNotMatch(STYLES, /\.car-glyph|\.car-code/);
  for (const status of [
    'active', 'thinking', 'waiting-for-permission', 'idle', 'error', 'complete', 'unknown',
  ]) {
    assert.match(STYLES, new RegExp(
      `\\.state-${status}\\s*\\{[^}]*--state-bg:\\s*var\\(--color-[^)]+-bg\\);[^}]*--state-ink:\\s*var\\(--color-[^)]+-ink\\)`,
      's',
    ));
  }
});

test('route cars share deterministic touge traversal phases and inspection pauses', () => {
  assert.match(STYLES, /--route-lap-duration:\s*64s/);
  assert.match(
    STYLES,
    /data-track-id="ridge-pass"[\s\S]*?animation:\s*ridge-pass-traverse-desktop var\(--route-lap-duration\) linear infinite/si,
  );
  assert.match(STYLES, /animation-delay:\s*var\(--route-phase,\s*0s\)/);
  const ridgeAnimation = STYLES.indexOf('.dashboard-root[data-track-id="ridge-pass"]');
  const cypressAnimation = STYLES.indexOf('.dashboard-root[data-track-id="cypress-run"]');
  const inspection = STYLES.indexOf(
    '.dashboard-root[data-track-id] .vehicle-anchor:hover,',
  );
  assert.ok(inspection > ridgeAnimation, 'inspection pause must follow Ridge animation shorthand');
  assert.ok(inspection > cypressAnimation, 'inspection pause must follow Cypress animation shorthand');
  assert.match(
    STYLES.slice(inspection),
    /\.dashboard-root\[data-track-id\] \.vehicle-anchor:hover,\s*\.dashboard-root\[data-track-id\] \.vehicle-anchor:focus-within,\s*\.dashboard-root\[data-track-id\] \.vehicle-anchor\[data-pinned="true"\]\s*\{[^}]*animation-play-state:\s*paused/si,
  );
  assert.doesNotMatch(
    STYLES,
    /\.vehicle-anchor(?::hover|:focus-within|\[data-pinned="true"\]) \.car-motion[\s\S]*?animation-play-state:\s*paused/si,
  );
  assert.doesNotMatch(
    STYLES,
    /(?:^|\n)\.vehicle-anchor:hover,\s*\.vehicle-anchor:focus-within/si,
    'unscoped low-specificity inspection rule must not return',
  );
  for (const schedule of ['desktop', 'mobile']) {
    const start = STYLES.indexOf(`@keyframes ridge-pass-traverse-${schedule}`);
    const next = STYLES.indexOf(schedule === 'desktop'
      ? '@keyframes ridge-pass-traverse-mobile'
      : '@keyframes cypress-run-traverse-desktop');
    const traverse = STYLES.slice(start, next);
    for (const point of ['0%', '24.7%', '49.4%', '74.1%', '98.8%', '99.2%', '99.6%', '100%']) {
      assert.ok(traverse.includes(`${point} {`), `${schedule} missing ${point}`);
    }
    assert.ok((traverse.match(/\d+(?:\.\d+)?%\s*\{/g) ?? []).length >= 68);
    for (const [progress, left, top] of [
      ['0%', 8.2, 9.4737],
      ['24.7%', schedule === 'desktop' ? 23.0712 : 21.2887, schedule === 'desktop' ? 31.089 : 33.017],
      ['49.4%', schedule === 'desktop' ? 68.1559 : 69.7558, schedule === 'desktop' ? 63.7113 : 62.1251],
      ['74.1%', schedule === 'desktop' ? 33.219 : 27.8917, schedule === 'desktop' ? 94.4652 : 92.6477],
      ['98.8%', 91.2, 95.7895],
    ]) {
      const match = traverse.match(new RegExp(
        `${progress.replace('.', '\\.')}\\s*\\{[^}]*left:\\s*([\\d.]+)%;[^}]*top:\\s*([\\d.]+)%`,
        's',
      ));
      assert.ok(match, `${schedule} missing migration waypoint ${progress}`);
      const width = schedule === 'desktop' ? 1160 : 372;
      const height = schedule === 'desktop' ? 682 : 580;
      assert.ok(Math.hypot(
        (Number(match[1]) - left) / 100 * width,
        (Number(match[2]) - top) / 100 * height,
      ) <= 0.75, `${schedule} ${progress} migration delta`);
    }
  }
  assert.match(RENDERER, /const ROUTE_LAP_SECONDS = 64/);
  assert.match(RENDERER, /const ROUTE_PHASE_SECONDS = ROUTE_LAP_SECONDS \/ 16/);
  assert.match(RENDERER, /--route-phase', `\$\{-placement\.slotIndex \* ROUTE_PHASE_SECONDS\}s`/);
  assert.match(RENDERER, /wrapper\.dataset\.routeSlot = String\(placement\.slotIndex\)/);
  const mobile = STYLES.slice(STYLES.indexOf('@media (max-width: 759px)'));
  assert.match(
    mobile,
    /data-track-id="ridge-pass"[\s\S]*?animation-name:\s*ridge-pass-traverse-mobile/si,
  );
  assert.match(
    mobile,
    /\.vehicle-anchor,\s*\.vehicle-anchor \.session-car\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/si,
  );
  for (const parked of ['waiting-for-permission', 'idle', 'error', 'complete', 'unknown']) {
    assert.doesNotMatch(
      STYLES,
      new RegExp(`\\.vehicle-anchor\\.state-${parked}[^}]*touge-traverse-(?:desktop|mobile)`, 'si'),
      `${parked} must not traverse`,
    );
  }
});

test('route and smoke assignments retain exact pause specificity and order', () => {
  const normalizedStyles = STYLES.replace(/\s+/g, ' ');
  const normalize = (value) => value.replace(/\s+/g, ' ');
  const specificity = (selector) => {
    const withoutWhere = selector.replace(/:where\([^)]*\)/g, '');
    const withoutPseudoElements = withoutWhere.replace(/::[\w-]+/g, '');
    return [
      (withoutWhere.match(/#[\w-]+/g) ?? []).length,
      (withoutPseudoElements.match(/\.[\w-]+|\[[^\]]+\]|:[\w-]+/g) ?? []).length,
      (withoutWhere.match(/::[\w-]+/g) ?? []).length,
    ];
  };
  const selectors = {
    traversal: '.dashboard-root:where([data-route-angle-motion="enabled"])[data-track-id="ridge-pass"] .vehicle-anchor.state-active',
    wrapperPause: '.dashboard-root[data-track-id] .vehicle-anchor:hover',
    smoke: '.dashboard-root:where([data-route-angle-motion="enabled"])[data-track-id] .vehicle-anchor.state-active > .car-atmosphere::before',
    smokePause: '.dashboard-root[data-track-id]\n  .vehicle-anchor:hover > .car-atmosphere::before',
  };
  assert.deepEqual(specificity(selectors.traversal), [0, 4, 0]);
  assert.deepEqual(specificity(selectors.wrapperPause), [0, 4, 0]);
  assert.deepEqual(specificity(selectors.smoke), [0, 5, 1]);
  assert.deepEqual(specificity(selectors.smokePause), [0, 5, 1]);
  for (const selector of Object.values(selectors)) {
    assert.ok(normalizedStyles.includes(normalize(selector)), selector);
  }
  assert.ok(normalizedStyles.indexOf(normalize(selectors.wrapperPause))
    > normalizedStyles.indexOf(normalize(selectors.traversal)));
  assert.ok(normalizedStyles.indexOf(normalize(selectors.smokePause))
    > normalizedStyles.indexOf(normalize(selectors.smoke)));
  for (const track of ['ridge-pass', 'cypress-run']) {
    for (const state of ['active', 'thinking']) {
      assert.ok(normalizedStyles.includes(
        `.dashboard-root:where([data-route-angle-motion="enabled"])[data-track-id="${track}"] `
          + `.vehicle-anchor.state-${state}`,
      ));
      for (const suffix of [' > .car-atmosphere::before', ' > .car-atmosphere::after']) {
        if (track === 'ridge-pass') {
          assert.ok(normalizedStyles.includes(
            `.dashboard-root:where([data-route-angle-motion="enabled"])[data-track-id] `
              + `.vehicle-anchor.state-${state}${suffix}`,
          ));
        }
      }
    }
  }
  for (const state of [':hover', ':focus-within', '[data-pinned="true"]']) {
    for (const suffix of ['', ' > .car-atmosphere::before', ' > .car-atmosphere::after']) {
      assert.ok(normalizedStyles.includes(
        `.dashboard-root[data-track-id] .vehicle-anchor${state}${suffix}`,
      ));
    }
  }
});

test('atmosphere CSS pins hierarchy, gradient, frames, stacking, and mobile reductions', () => {
  const normalized = BASE_STYLES.replace(/\s+/g, ' ');
  assert.match(normalized, /\.car-atmosphere \{[^}]*z-index: 0;[^}]*inset: 0;[^}]*width: 100%;[^}]*height: 100%;[^}]*overflow: visible;[^}]*rotate\(var\(--route-heading, 0deg\)\)[^}]*pointer-events: none;/);
  assert.match(normalized, /\.session-car \{[^}]*z-index: 1;/);
  assert.match(normalized, /\.session-tooltip \{[^}]*z-index: 20;/);
  assert.match(normalized,
    /\.vehicle-anchor:is\(:hover, :focus-within, \[data-pinned="true"\]\), \.pit-vehicle:is\(:hover, :focus-within, \[data-pinned="true"\]\) \{ z-index: 30;/);
  assert.ok(normalized.includes(
    'radial-gradient( circle at 50% 50%, '
      + 'color-mix(in srgb, var(--state-ink) 32%, transparent) 0 18%, '
      + 'color-mix(in srgb, var(--state-ink) 18%, transparent) 42%, transparent 72% )',
  ));
  assert.doesNotMatch(
    BASE_STYLES.match(/\.car-atmosphere::before,[\s\S]*?\n\}/)?.[0] ?? '',
    /filter|blur|shadow|mix-blend/,
  );
  for (const expected of [
    ['active-smoke-left', '5px', '1.6s', '0s'],
    ['active-smoke-right', '4px', '1.6s', '-.8s'],
    ['thinking-smoke-left', '4px', '2.4s', '0s'],
    ['thinking-smoke-right', '4px', '2.4s', '-1.2s'],
  ]) {
    const [name, size, duration, delay] = expected;
    assert.match(normalized, new RegExp(
      `width: ${size}; height: ${size}; animation: ${name} ${duration} linear `
        + `${delay === '0s' ? '' : `${delay} `}infinite;`,
    ));
  }
  for (const frame of [
    'translate(calc(-50% + -1px), calc(-50% + 4px)) scale(1)',
    'translate(calc(-50% + 2px), calc(-50% + 10px)) scale(1.35)',
    'translate(calc(-50% + -.75px), calc(-50% + 3px)) scale(.9)',
    'translate(calc(-50% + 1.5px), calc(-50% + 7px)) scale(1.2)',
    'translate(calc(-50% + -.5px), calc(-50% + 2px)) scale(.9)',
    'translate(calc(-50% + -1px), calc(-50% + 4px)) scale(1.05)',
  ]) assert.ok(normalized.includes(frame), frame);
  const mobile = normalized.slice(normalized.indexOf('@media (max-width: 759px)'));
  assert.match(mobile, /top: calc\(50% \+ 16px\)/);
  assert.match(mobile, /\.vehicle-anchor\.state-active > \.car-atmosphere \{ display: none;/);
  assert.match(mobile, /\.dashboard-root:where\(\[data-route-angle-motion="enabled"\]\)\[data-track-id\]\s+\.vehicle-anchor\.state-thinking > \.car-atmosphere::before \{[^}]*width: 3px;[^}]*height: 3px;[^}]*animation-name: mobile-thinking-smoke;[^}]*animation-duration: 3.2s;/);
  assert.match(mobile, /\.vehicle-anchor\.state-thinking > \.car-atmosphere::after \{ display: none;/);
  for (const parked of ['waiting-for-permission', 'idle', 'error', 'complete', 'unknown']) {
    assert.doesNotMatch(BASE_STYLES, new RegExp(
      `state-${parked}[^,{]*(?:active-drift|thinking-drift|smoke)`,
    ));
  }
  const envelope = (size, frames) => {
    const radius = size / 2;
    return frames.reduce((bounds, [x, y, scale]) => ({
      minX: Math.min(bounds.minX, x - radius * scale),
      maxX: Math.max(bounds.maxX, x + radius * scale),
      minY: Math.min(bounds.minY, y - radius * scale),
      maxY: Math.max(bounds.maxY, y + radius * scale),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  };
  const union = (...bounds) => ({
    minX: Math.min(...bounds.map(({ minX }) => minX)),
    maxX: Math.max(...bounds.map(({ maxX }) => maxX)),
    minY: Math.min(...bounds.map(({ minY }) => minY)),
    maxY: Math.max(...bounds.map(({ maxY }) => maxY)),
  });
  assert.deepEqual(union(
    envelope(5, [[0, 0, 0.65], [-1, 4, 1], [-2, 10, 1.35]]),
    envelope(4, [[0, 0, 0.65], [1, 4, 1], [2, 10, 1.35]]),
  ), { minX: -5.375, maxX: 4.7, minY: -1.625, maxY: 13.375 });
  assert.deepEqual(union(
    envelope(4, [[0, 0, 0.7], [-0.75, 3, 0.9], [-1.5, 7, 1.2]]),
    envelope(4, [[0, 0, 0.7], [0.75, 3, 0.9], [1.5, 7, 1.2]]),
  ), { minX: -3.9, maxX: 3.9, minY: -1.4, maxY: 9.4 });
  assert.deepEqual(
    envelope(3, [[0, 0, 0.75], [-0.5, 2, 0.9], [-1, 4, 1.05]]),
    { minX: -2.575, maxX: 1.125, minY: -1.125, maxY: 5.575 },
  );
});

test('On Track summary uses accessible counts and distinct non-color state encoding', () => {
  assert.match(STYLES, /\.on-track-count\.state-active\s+\.on-track-glyph\s*\{[^}]*border-top-width:\s*4px/si);
  assert.match(STYLES, /\.on-track-count\.state-thinking\s*\{[^}]*repeating-linear-gradient/si);
  assert.match(STYLES, /\.on-track-count\s*\{[^}]*color:\s*var\(--state-ink\)/si);
});

test('reverse-facing car labels counter-rotate upright and the document has a local favicon', () => {
  assert.doesNotMatch(RENDERER, /--vehicle-(?:upright-)?angle/);
  assert.match(RENDERER, /const atmosphere = element\(documentRef, 'span', 'car-atmosphere', ''\)/);
  assert.match(RENDERER, /wrapper\.append\(\s*atmosphere,\s*button,/s);
  assert.match(STYLES, /\.car-angle\s*\{\s*transform:\s*rotate\(var\(--route-heading,\s*0deg\)\)/si);
  assert.match(STYLES, /--route-upright-heading[\s\S]*--drift-upright-yaw/si);
  assert.match(INDEX, /<link rel="icon" href="data:,">/);
});

test('reduced-motion policy disables car animation and nonessential transitions', () => {
  const reducedMotion = STYLES.slice(STYLES.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.notEqual(reducedMotion.length, STYLES.length, 'reduced-motion media query must exist');
  assert.match(reducedMotion, /\.car-motion\s*\{[^}]*animation:\s*none\s*!important/si);
  assert.match(reducedMotion, /\.vehicle-anchor\s*\{[^}]*animation:\s*none\s*!important/si);
  assert.match(reducedMotion, /\.session-car[\s\S]*\.session-tooltip[\s\S]*transition:\s*none\s*!important/si);
});

test('CSS and document preserve 44px targets and map-first responsive behavior', () => {
  const carRule = STYLES.match(/\.session-car\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(carRule, /width:\s*calc\(52 \* var\(--car-unit\)\)/);
  assert.match(carRule, /height:\s*calc\(52 \* var\(--car-unit\)\)/);
  assert.match(carRule, /min-width:\s*44px/);
  assert.match(carRule, /min-height:\s*44px/);

  const rootLayout = STYLES.match(/\.dashboard-root\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(rootLayout, /display:\s*grid/);
  assert.match(rootLayout, /grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto\b/);
  const pitLaneRule = STYLES.match(/\.pit-lane\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(pitLaneRule, /display:\s*grid/);
  assert.match(pitLaneRule, /overflow:\s*hidden auto/);
  assert.doesNotMatch(pitLaneRule, /overflow:\s*visible/);
  // A scrolling lane only stays safe because the pit tooltip escapes via fixed
  // positioning; assert the pair together so they cannot drift apart.
  assert.match(STYLES, /\.pit-vehicle \.session-tooltip\s*\{[^}]*position:\s*fixed/s);

  // The docked bubble must shrink to its content and dock off the lane's measured top.
  // A `width: min(a, b)` resolves to a fixed length, and --pit-lane-max is a cap the
  // lane usually does not reach; each shipped as visible dead space once before.
  const pitTooltipRule = STYLES.match(/\.pit-vehicle \.session-tooltip\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(pitTooltipRule, /width:\s*max-content/);
  assert.match(pitTooltipRule, /max-width:\s*min\(28rem,\s*calc\(100vw - 2rem\)\)/);
  assert.doesNotMatch(pitTooltipRule, /^\s*width:\s*min\(/m);
  assert.match(pitTooltipRule, /bottom:\s*calc\(var\(--pit-dock-offset,\s*var\(--pit-lane-max\)\) \+ 14px\)/);
  assert.match(RENDERER, /setProperty\('--pit-dock-offset'/);

  const mobileStart = STYLES.indexOf('@media (max-width: 759px)');
  const mobileEnd = STYLES.indexOf('@media (max-width: 420px)', mobileStart);
  const mobile = STYLES.slice(mobileStart, mobileEnd);
  assert.ok(mobileStart >= 0, '759px mobile breakpoint must exist');
  assert.match(mobile, /\.map-stage\s*\{[^}]*min-height:\s*580px/si);
  assert.match(
    mobile,
    /\.vehicle-anchor \.session-car\s*\{[^}]*border-radius:\s*50%;[^}]*clip-path:\s*circle\(22px at 50% 50%\);[^}]*pointer-events:\s*auto/si,
  );
  assert.match(
    mobile,
    /\.vehicle-anchor:has\(\.session-car:focus-visible\)::after\s*\{[^}]*border:\s*3px solid var\(--color-focus\);[^}]*pointer-events:\s*none/si,
  );
  assert.match(mobile, /\.vehicle-anchor \.car-body\s*\{[^}]*width:\s*24px;[^}]*height:\s*36px/si);
  assert.ok(INDEX.indexOf('id="map-stage"') < INDEX.indexOf('id="pit-lane"'));
  assert.match(STYLES, /overflow-x:\s*hidden/);
  assert.match(STYLES, /\.pit-bay-mount\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*52px\)/si);
  assert.doesNotMatch(STYLES, /status-rail|session-list|rail-item/);
});

test('760px through 960px use compact rounded-square route controls only', () => {
  const compactStart = STYLES.indexOf('@media (min-width: 760px) and (max-width: 960px)');
  const compactEnd = STYLES.indexOf('@media (max-width: 759px)', compactStart);
  const compact = STYLES.slice(compactStart, compactEnd);
  assert.ok(compactStart >= 0, 'compact route-control media query must exist');
  assert.match(
    compact,
    /\.map-stage \.route-map,\s*\.map-stage \.vehicle-layer\s*\{[^}]*top:\s*-1px;[^}]*bottom:\s*auto/si,
  );
  assert.match(
    compact,
    /\.vehicle-anchor,\s*\.vehicle-anchor \.session-car\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/si,
  );
  assert.match(
    compact,
    /\.vehicle-anchor \.car-body\s*\{[^}]*width:\s*24px;[^}]*height:\s*36px/si,
  );
  assert.doesNotMatch(compact, /\.car-glyph|\.car-code/);
  assert.match(
    compact,
    /\.vehicle-anchor \.session-car:focus-visible\s*\{[^}]*outline:\s*3px solid var\(--color-focus\);[^}]*outline-offset:\s*0;[^}]*box-shadow:\s*none/si,
  );
  assert.doesNotMatch(compact, /\.pit-vehicle|clip-path|border-radius:\s*50%|::after/si);
});

test('Cypress mobile uses the approved centered course scale and exact target counterscale', () => {
  const mobileStart = BASE_STYLES.indexOf('@media (max-width: 759px)');
  const mobileEnd = BASE_STYLES.indexOf('@media (max-width: 420px)', mobileStart);
  const beforeMobile = BASE_STYLES.slice(0, mobileStart);
  const mobile = BASE_STYLES.slice(mobileStart, mobileEnd);
  const cypressArt = mobile.match(
    /\.dashboard-root\[data-track-id="cypress-run"\] #cypress-run-art\s*\{([^}]*)\}/s,
  )?.[1] ?? '';
  const vehicleLayer = mobile.match(
    /\.dashboard-root\[data-track-id="cypress-run"\] #vehicle-layer\s*\{([^}]*)\}/s,
  )?.[1] ?? '';
  const wrapper = mobile.match(
    /\.dashboard-root\[data-track-id="cypress-run"\] \.vehicle-anchor\s*\{([^}]*)\}/s,
  )?.[1] ?? '';

  assert.match(cypressArt, /transform-box:\s*view-box/);
  assert.match(cypressArt, /transform-origin:\s*500px 380px/);
  assert.match(cypressArt, /transform:\s*scale\(\.94\)/);
  assert.match(vehicleLayer, /transform-origin:\s*50% 50%/);
  assert.match(vehicleLayer, /transform:\s*scale\(\.94\)/);
  assert.match(
    wrapper,
    /transform:\s*translate\(-50%,\s*-50%\) scale\(1\.0638297872340425\)/,
  );
  assert.equal((mobile.match(/transform:\s*scale\(\.94\)/g) ?? []).length, 2);
  assert.equal((mobile.match(/scale\(1\.0638297872340425\)/g) ?? []).length, 1);
  assert.doesNotMatch(beforeMobile, /scale\(\.94\)|scale\(1\.0638297872340425\)/);
  assert.doesNotMatch(
    mobile,
    /data-track-id="ridge-pass"[^}]*scale\(\.94\)|#ridge-pass-art[^}]*scale\(\.94\)/s,
  );
  assert.match(
    mobile,
    /\.vehicle-anchor,\s*\.vehicle-anchor \.session-car\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s,
  );
  assert.match(
    mobile,
    /\.vehicle-anchor \.session-car\s*\{[^}]*clip-path:\s*circle\(22px at 50% 50%\)/s,
  );
  assert.match(
    mobile,
    /\.vehicle-anchor:has\(\.session-car:focus-visible\)::after\s*\{[^}]*inset:\s*-3px;[^}]*border:\s*3px solid/s,
  );
});

test('registered-angle capability attempts all four properties and caches fail-static results', async () => {
  const names = [
    '--route-heading',
    '--route-upright-heading',
    '--drift-yaw',
    '--drift-upright-yaw',
  ];
  for (const failureIndex of [-1, 0, 1, 2, 3]) {
    const { initializeRouteAngleMotion } = await import(
      `../src/route-motion-capability.mjs?case=${failureIndex}`
    );
    const calls = [];
    const attributes = new Map([['data-route-angle-motion', 'stale']]);
    const root = {
      setAttribute(name, value) { attributes.set(name, value); },
      removeAttribute(name) { attributes.delete(name); },
    };
    const cssRef = {
      registerProperty(descriptor) {
        calls.push(descriptor);
        if (calls.length - 1 === failureIndex) {
          throw Object.assign(new Error('collision'), { name: 'InvalidModificationError' });
        }
      },
    };
    assert.equal(initializeRouteAngleMotion(root, cssRef), failureIndex === -1);
    assert.deepEqual(calls.map(({ name }) => name), names);
    calls.forEach((descriptor, index) => assert.deepEqual(descriptor, {
      name: names[index],
      syntax: '<angle>',
      inherits: true,
      initialValue: '0deg',
    }));
    assert.equal(attributes.get('data-route-angle-motion'),
      failureIndex === -1 ? 'enabled' : undefined);
    assert.equal(initializeRouteAngleMotion(root, {
      registerProperty() { assert.fail('cached initialization must not register again'); },
    }), failureIndex === -1);
    const secondAttributes = new Map([['data-route-angle-motion', 'stale']]);
    const secondRoot = {
      setAttribute(name, value) { secondAttributes.set(name, value); },
      removeAttribute(name) { secondAttributes.delete(name); },
    };
    assert.doesNotThrow(() => initializeRouteAngleMotion(secondRoot, cssRef));
    assert.equal(secondAttributes.get('data-route-angle-motion'),
      failureIndex === -1 ? 'enabled' : undefined);
  }

  const { initializeRouteAngleMotion } = await import(
    '../src/route-motion-capability.mjs?case=missing'
  );
  const root = {
    removed: false,
    removeAttribute() { this.removed = true; },
  };
  assert.equal(initializeRouteAngleMotion(root, undefined), false);
  assert.equal(root.removed, true);
  assert.doesNotThrow(() => initializeRouteAngleMotion({
    removeAttribute() { throw new Error('synthetic DOM mutation failure'); },
  }, undefined));
  assert.doesNotMatch(STYLES, /@property\s+--/);
  assert.doesNotMatch(ROUTE_CAPABILITY, /console\.|setTimeout|setInterval|localStorage|sessionStorage/);
});

test('computeTooltipShift keeps the tooltip inside the viewport', () => {
  const base = { tooltipWidth: 256, viewportWidth: 390, gutter: 8 };
  // Centered car: no shift.
  assert.equal(computeTooltipShift({ ...base, carCenter: 195 }), 0);
  // Near left edge: push right so the left edge lands on the gutter.
  assert.equal(computeTooltipShift({ ...base, carCenter: 100 }), 36);
  // Near right edge: pull left so the right edge lands on vw - gutter.
  assert.equal(computeTooltipShift({ ...base, carCenter: 350 }), -96);
  // Comfortably centered on a wide viewport: no shift.
  assert.equal(computeTooltipShift({ carCenter: 720, tooltipWidth: 256, viewportWidth: 1440, gutter: 8 }), 0);
});

test('session-tooltip CSS defaults both clamp shifts to 0 and has no edge-class remnants', () => {
  assert.match(BASE_STYLES, /\.session-tooltip \{[^}]*--tt-shift:\s*0px;/s);
  assert.match(BASE_STYLES, /\.session-tooltip \{[^}]*--tt-shift-y:\s*0px;/s);
  assert.match(BASE_STYLES, /\.session-tooltip \{[^}]*calc\(var\(--tt-shift-y\) - \.25rem\)/s);
  assert.match(BASE_STYLES, /var\(--tt-shift-y\)/);
  assert.doesNotMatch(BASE_STYLES, /--vehicle-vw/);
  assert.doesNotMatch(BASE_STYLES, /\.edge-left|\.edge-right/);
  assert.doesNotMatch(RENDERER, /--vehicle-vw/);
  assert.doesNotMatch(RENDERER, /edge-left|edge-right/);
  assert.match(RENDERER, /export function computeTooltipShift/);
});

test('car-badge is a small, muted, upright, non-interactive pill below the car', () => {
  assert.match(BASE_STYLES, /\.car-badge \{[^}]*position:\s*absolute;[^}]*pointer-events:\s*none;/s);
  assert.match(BASE_STYLES, /\.car-badge \{[^}]*top:\s*calc\(100% - 3px\);/s);
  assert.match(BASE_STYLES, /\.car-badge \{[^}]*transform:\s*translateX\(-50%\);/s);
  // below the tooltip's z-index: 20 so an open tooltip stacks over it
  const z = BASE_STYLES.match(/\.car-badge \{[^}]*z-index:\s*(\d+);/s);
  assert.ok(z && Number(z[1]) < 20, 'badge sits below the tooltip z-index');
});

test('car-badge fades out while its tooltip is open, for both car types', () => {
  assert.match(BASE_STYLES, /\.vehicle-anchor:hover \.car-badge[\s\S]*?opacity:\s*0/s);
  assert.match(BASE_STYLES, /\.pit-vehicle\[data-pinned="true"\] \.car-badge[\s\S]*?opacity:\s*0/s);
});

test('pit grid reserves row room so a below-car badge clears the next row', () => {
  assert.match(BASE_STYLES, /\.pit-bay-mount \{[^}]*gap:\s*1\.15rem \.55rem;/s);
  assert.match(BASE_STYLES, /\.pit-bay-mount \{[^}]*padding-bottom:\s*16px;/s);
});

test('fixtures cover every badge/tooltip work-ref state', () => {
  const refs = FIXTURE_SNAPSHOT.sessions.map((s) => parseWorkRef(s.displayName));
  assert.ok(refs.some((r) => r.ticketKey && r.prNumber === null), 'a ticket-only fixture');
  assert.ok(refs.some((r) => r.ticketKey === null && r.prNumber !== null), 'a PR-only fixture');
  assert.ok(refs.some((r) => r.ticketKey && r.prNumber !== null), 'a ticket+PR fixture');
  assert.ok(refs.some((r) => r.ticketKey === null && r.prNumber === null), 'a no-ref fixture');
  const s = FIXTURE_SNAPSHOT.sessions;
  const pitRef = s.find((x) => x.id === 'idle-pine');
  assert.ok(parseWorkRef(pitRef.displayName).prNumber !== null, 'a pit-pool fixture carries a ref');
});

test('README documents the work-ref naming convention and auto-rename requirement', () => {
  assert.match(README, /automatic-rename off/);
  assert.match(README, /PR#\d+|PR#42/);
  assert.match(README, /BB-\d+|[A-Z]{2,}-\d+/);
});

test('pit placements carry a bay key and a within-bay recency rank', () => {
  const data = normalized([
    session('e-new', 'idle', { displayName: 'E2E ▸ newer', lastActivityAt: '2026-07-19T20:20:00Z' }),
    session('e-old', 'idle', { displayName: 'E2E ▸ older', lastActivityAt: '2026-07-19T20:10:00Z' }),
    session('w-one', 'idle', { displayName: 'Workflow ▸ only', lastActivityAt: '2026-07-19T20:15:00Z' }),
  ]);
  const byId = new Map(allocateSessions(data.sessions).map((item) => [item.id, item]));
  // slotIndex is global recency; bayRank counts only within the bay.
  assert.deepEqual(['e-new', 'w-one', 'e-old'].map((id) => {
    const placement = byId.get(id);
    return [placement.bayKey, placement.bayRank, placement.slotIndex];
  }), [['E2E', 0, 0], ['Workflow', 0, 1], ['E2E', 1, 2]]);
});

test('pit location label names the bay and counts within it', () => {
  const data = normalized([
    session('a', 'idle', { displayName: 'E2E ▸ newer', lastActivityAt: '2026-07-19T20:20:00Z' }),
    session('b', 'idle', { displayName: 'E2E ▸ older', lastActivityAt: '2026-07-19T20:10:00Z' }),
  ]);
  const placements = allocateSessions(data.sessions);
  assert.equal(placements[0].locationLabel, 'Pit, E2E bay, position 1');
  assert.equal(placements[1].locationLabel, 'Pit, E2E bay, position 2');
});

test('a session with no session prefix lands in the Unassigned bay', () => {
  const [placement] = allocateSessions(normalized([session('bare', 'idle')]).sessions);
  assert.equal(placement.bayKey, null);
  assert.equal(placement.locationLabel, 'Pit, Unassigned bay, position 1');
});

test('bays sort case-insensitively and Unassigned comes last', () => {
  const data = normalized([
    session('w', 'idle', { displayName: 'Workflow ▸ w' }),
    session('c', 'idle', { displayName: 'canary ▸ c' }),
    session('e', 'idle', { displayName: 'E2E ▸ e' }),
    session('bare', 'idle'),
    session('d', 'idle', { displayName: 'dotfiles ▸ d' }),
  ]);
  const bays = allocatePitBays(data.sessions);
  assert.deepEqual(bays.map((bay) => bay.key), ['canary', 'dotfiles', 'E2E', 'Workflow', null]);
  assert.deepEqual(bays.at(-1).label, UNASSIGNED_BAY_LABEL);
});

test('an all-on-track session still gets a bay so it can render Clear', () => {
  const data = normalized([
    session('running', 'active', { displayName: 'E2E ▸ busy', progress: 0.5 }),
    session('parked', 'idle', { displayName: 'canary ▸ waiting' }),
  ]);
  assert.deepEqual(allocatePitBays(data.sessions).map((bay) => bay.key), ['canary', 'E2E']);
});

test('Unassigned appears only when it holds a placed car', () => {
  const data = normalized([session('bare', 'active', { progress: 0 })]);
  assert.deepEqual(allocatePitBays(data.sessions), []);
});

test('an overflowed car with no session prefix does not spawn a phantom Unassigned bay', () => {
  const named = Array.from({ length: PIT_CAPACITY }, (_, index) => session(
    `n${String(index).padStart(2, '0')}`,
    'idle',
    {
      displayName: `E2E ▸ w${index}`,
      // Newest to oldest, all younger than the unprefixed car below, so they fill
      // every slot and the unprefixed one is the sole overflow.
      lastActivityAt: `2026-07-19T20:${String(39 - index).padStart(2, '0')}:00Z`,
    },
  ));
  const bare = session('bare', 'idle', { lastActivityAt: '2026-07-19T20:00:00Z' });
  const data = normalized([...named, bare]);
  assert.deepEqual(allocatePitBays(data.sessions).map((bay) => bay.key), ['E2E']);
});

test('bay assignment and roster ignore input order', () => {
  const sessions = normalized([
    session('a', 'idle', { displayName: 'E2E ▸ a', lastActivityAt: '2026-07-19T20:20:00Z' }),
    session('b', 'idle', { displayName: 'canary ▸ b', lastActivityAt: '2026-07-19T20:15:00Z' }),
    session('c', 'idle', { displayName: 'E2E ▸ c', lastActivityAt: '2026-07-19T20:10:00Z' }),
  ]).sessions;
  const digest = (items) => Object.fromEntries(
    allocateSessions(items).map((item) => [item.id, `${item.bayKey}:${item.bayRank}`]),
  );
  const reversed = [...sessions].reverse();
  assert.deepEqual(digest(reversed), digest(sessions));
  assert.deepEqual(
    allocatePitBays(reversed).map((bay) => bay.key),
    allocatePitBays(sessions).map((bay) => bay.key),
  );
});

test('capacity stays global: the oldest pit car overflows regardless of bay', () => {
  const sessions = Array.from({ length: PIT_CAPACITY + 1 }, (_, index) => session(
    `p${String(index).padStart(2, '0')}`,
    'idle',
    {
      displayName: `${index % 2 === 0 ? 'E2E' : 'canary'} ▸ w${index}`,
      // index 0 is newest, each later one a minute older, so the last one overflows.
      lastActivityAt: `2026-07-19T20:${String(40 - index).padStart(2, '0')}:00Z`,
    },
  ));
  const overflowed = allocateSessions(normalized(sessions).sessions).filter((item) => item.overflow);
  assert.deepEqual(overflowed.map((item) => item.id), [`p${PIT_CAPACITY}`]);
});

test('route placements and overflowed pit placements never gain bayKey or bayRank', () => {
  const pitSessions = Array.from({ length: PIT_CAPACITY + 1 }, (_, index) => session(
    `p${String(index).padStart(2, '0')}`,
    'idle',
    { lastActivityAt: `2026-07-19T20:${String(40 - index).padStart(2, '0')}:00Z` },
  ));
  const routeSession = session('on-route', 'active', { progress: 0.5 });
  const placements = allocateSessions(normalized([...pitSessions, routeSession]).sessions);
  const routePlacement = placements.find((item) => item.id === 'on-route');
  const overflowedPitPlacement = placements.find((item) => item.overflow);
  assert.equal(routePlacement.pool, 'route');
  assert.equal(overflowedPitPlacement.pool, 'pit');
  // The renderer gates on pool === 'pit' && !overflow before reading bayKey/bayRank,
  // so these fields must be absent (not merely undefined) outside that gate.
  for (const placement of [routePlacement, overflowedPitPlacement]) {
    assert.equal(Object.hasOwn(placement, 'bayKey'), false);
    assert.equal(Object.hasOwn(placement, 'bayRank'), false);
  }
});
