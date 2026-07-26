import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FixtureSessionAdapter } from '../src/fixture-adapter.mjs';
import { FIXTURE_SNAPSHOT } from '../src/fixture-sessions.mjs';
import {
  PERMISSION_STATES,
  SESSION_STATUSES,
  STATE_PRESENTATION,
  SnapshotValidationError,
  buildAccessibleText,
  formatActivityAge,
  formatActivityTimestamp,
  normalizeSnapshot,
} from '../src/session-contract.mjs';
import {
  PARKED_ANCHORS,
  ROUTE_ANCHORS,
  SEGMENTS,
  ZONES,
  allocateSessions,
  fnv1a32,
  preferredRouteIndex,
} from '../src/track-layout.mjs';

const GENERATED_AT = '2026-07-19T20:30:00Z';
const STYLES = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const INDEX = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const RENDERER = readFileSync(new URL('../src/render-dashboard.mjs', import.meta.url), 'utf8');

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
    waiting_for_permission: ['Waiting for permission', '!', 'permission'],
    idle: ['Idle', '‖', 'pitstop'],
    error: ['Error', '×', 'error'],
    complete: ['Complete', '✓', 'pitstop'],
    unknown: ['Unknown', '?', 'unknown'],
  });
});

test('normalizes every state into its required pool and accessible text', () => {
  const statuses = SESSION_STATUSES.filter((status) => status !== 'unknown');
  const data = normalized(statuses.map((status, index) => session(`state-${index}`, status)));
  const placements = allocateSessions(data.sessions);
  const expectedPools = ['route', 'route', 'permission', 'pitstop', 'error', 'pitstop'];
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
  assert.doesNotMatch(INDEX, /id="session-readout"[^>]*aria-live/);
  const orderedIds = ['on-track-summary', 'pit-error', 'pit-permission', 'pit-pitstop'];
  let previous = -1;
  for (const id of orderedIds) {
    const position = INDEX.indexOf(`id="${id}"`);
    assert.ok(position > previous, `${id} must follow the previous pit`);
    previous = position;
  }
  assert.match(RENDERER, /placement\.pool === 'route' \? 'route' : placement\.pool/);
  assert.match(RENDERER, /vehicleLayer\.append\(car\.wrapper\)/);
  assert.match(RENDERER, /pitMounts\.get\(target\)\.append\(car\.wrapper\)/);
  assert.match(RENDERER, /for \(const status of \['active', 'thinking'\]\)/);
  assert.match(RENDERER, /aria-label', `\$\{count\} \$\{presentation\.label\.toLowerCase\(\)\} sessions on track`/);
  const summarySource = RENDERER.slice(
    RENDERER.indexOf('function renderOnTrackSummary'),
    RENDERER.indexOf('function overflowSummary'),
  );
  assert.doesNotMatch(summarySource, /makeCar|session-car|createElement\('button'/);
  assert.doesNotMatch(INDEX, /Summit Overlook|Scenic Turnout|pit-complete|pit-idle/);
});

test('dashboard uses a compact header and preserves document scrolling on desktop', () => {
  const header = STYLES.match(/\.dashboard-header\s*\{([^}]*)\}/s)?.[1] ?? '';
  const controls = STYLES.match(/\.source-controls\s*\{([^}]*)\}/s)?.[1] ?? '';
  const legend = STYLES.match(/\.state-legend\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(header, /padding:\s*\.45rem clamp\(\.8rem,\s*1\.5vw,\s*1\.5rem\)/);
  assert.match(controls, /grid-column:\s*1/);
  assert.match(legend, /grid-column:\s*2/);
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

test('FNV-1a-32 matches known vectors and geometry has exact capacities', () => {
  assert.equal(fnv1a32(''), 0x811c9dc5);
  assert.equal(fnv1a32('hello'), 0x4f9f2cab);
  assert.equal(ROUTE_ANCHORS.length, 16);
  for (const segment of SEGMENTS) {
    assert.equal(ROUTE_ANCHORS.filter((item) => item.poolLabel === segment).length, 4);
  }
  assert.deepEqual(Object.keys(PARKED_ANCHORS).sort(), ['error', 'permission', 'pitstop']);
  for (const anchors of Object.values(PARKED_ANCHORS)) assert.equal(anchors.length, 6);
  assert.equal(Math.min(...ROUTE_ANCHORS.map((item) => item.x)), 150);
  assert.equal(Math.max(...ROUTE_ANCHORS.map((item) => item.x)), 850);
  assert.deepEqual(Object.values(ZONES), [
    'Permission Checkpoint', 'Service Bay', 'Pit Stop', 'Unclassified hold',
  ]);
});

test('all widened route anchors preserve 52px separation at the mobile map scale', () => {
  const mapWidth = 370.4;
  const mapHeight = 580;
  const target = 52;
  const anchors = ROUTE_ANCHORS;
  const boxes = anchors.map((item) => ({
    id: item.id,
    left: item.x * mapWidth / 1000 - target / 2,
    right: item.x * mapWidth / 1000 + target / 2,
    top: item.y * mapHeight / 760 - target / 2,
    bottom: item.y * mapHeight / 760 + target / 2,
  }));
  assert.equal(boxes.every((box) => box.left >= 0 && box.right <= mapWidth
    && box.top >= 0 && box.bottom <= mapHeight), true);
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const left = boxes[first];
      const right = boxes[second];
      const overlaps = left.left < right.right && left.right > right.left
        && left.top < right.bottom && left.bottom > right.top;
      assert.equal(overlaps, false, `${left.id} overlaps ${right.id}`);
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
  assert.deepEqual(Object.fromEntries(['route', 'error', 'permission', 'pitstop'].map((pool) => [
    pool, placements.filter((item) => item.pool === pool).length,
  ])), { route: 12, error: 3, permission: 3, pitstop: 6 });
  const pitStop = placements.filter((item) => item.pool === 'pitstop');
  assert.equal(new Set(pitStop.map((item) => item.slotIndex)).size, 6);
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

test('permission and error pool session 7 overflows and keeps full state text', () => {
  for (const status of ['waiting_for_permission', 'error']) {
    const data = normalized(poolSet(status, 7, `overflow-${status}`));
    const placements = allocateSessions(data.sessions);
    const overflowed = placements.filter((item) => item.overflow);
    assert.equal(overflowed.length, 1, status);
    assert.equal(new Set(placements.filter((item) => !item.overflow).map((item) => item.slotIndex)).size, 6);
    const item = data.sessions.find((candidate) => candidate.id === overflowed[0].id);
    const text = buildAccessibleText(item, overflowed[0], data.generatedAt);
    assert.match(text.label, /Map capacity exceeded/);
    assert.match(text.label, new RegExp(STATE_PRESENTATION[status].label));
    assert.match(text.details, status === 'complete' ? /Last response/ : /Last active/);
    if (status === 'error') assert.match(text.details, /Focused test failure/);
  }
});

test('combined idle and complete Pit Stop pool overflows after six canonical-ID allocations', () => {
  const items = [
    ...poolSet('idle', 4, 'stopped-idle'),
    ...poolSet('complete', 3, 'stopped-complete'),
  ];
  const data = normalized(items);
  const placements = allocateSessions(data.sessions);
  const placed = placements.filter((item) => !item.overflow);
  const overflowed = placements.filter((item) => item.overflow);
  assert.equal(placed.length, 6);
  assert.equal(overflowed.length, 1);
  assert.equal(new Set(placed.map((item) => item.slotIndex)).size, 6);
  assert.equal(placements.every((item) => item.pool === 'pitstop'), true);
  const item = data.sessions.find((candidate) => candidate.id === overflowed[0].id);
  const text = buildAccessibleText(item, overflowed[0], data.generatedAt);
  assert.match(text.label, /Map capacity exceeded for Pit Stop/);
  assert.match(text.details, item.status === 'complete' ? /Last response/ : /Last active/);
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

test('motion is assigned only to active and thinking nested car bodies', () => {
  assert.match(STYLES, /\.state-active\s+\.car-motion\s*\{[^}]*animation:\s*active-nudge/si);
  assert.match(STYLES, /\.state-thinking\s+\.car-motion\s*\{[^}]*animation:\s*thinking-drift/si);
  assert.match(STYLES, /\.car-motion\s*\{[^}]*animation:\s*none/si);
  for (const parked of ['waiting-for-permission', 'idle', 'error', 'complete']) {
    assert.doesNotMatch(
      STYLES,
      new RegExp(`\\.state-${parked}\\s+\\.car-motion\\s*\\{[^}]*animation\\s*:`, 'si'),
      `${parked} must remain parked`,
    );
  }
});

test('session controls render an original top-down SVG car without shrinking the accessible target', () => {
  assert.match(RENDERER, /createElementNS\('http:\/\/www\.w3\.org\/2000\/svg'/);
  assert.match(RENDERER, /function makeCarSilhouette\(documentRef\)/);
  assert.match(RENDERER, /viewBox: '0 0 32 48'/);
  assert.match(RENDERER, /'car-wheel'/);
  assert.match(RENDERER, /'car-chassis'/);
  assert.match(RENDERER, /'car-glass car-glass-front'/);
  assert.match(RENDERER, /'car-glass car-glass-rear'/);
  assert.match(RENDERER, /'car-roof'/);
  assert.match(RENDERER, /body\.append\(makeCarSilhouette\(documentRef\), glyph, code\)/);
  assert.match(STYLES, /\.session-car\s*\{[^}]*width:\s*52px;[^}]*height:\s*52px;[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;[^}]*border:\s*0;[^}]*background:\s*transparent/si);
  assert.match(STYLES, /\.car-body\s*\{[^}]*width:\s*32px;[^}]*height:\s*48px/si);
  assert.match(STYLES, /\.car-chassis\s*\{[^}]*fill:\s*var\(--state-bg\);[^}]*stroke:\s*var\(--state-ink\)/si);
  assert.match(STYLES, /\.car-wheel\s*\{[^}]*fill:\s*var\(--color-surface-night\)/si);
});

test('all seven vehicle states retain upright non-color roof markings and distinct treatments', () => {
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
  }
  assert.match(STYLES, /\.car-glyph\s*\{[^}]*position:\s*absolute;[^}]*transform:\s*rotate\(var\(--vehicle-upright-angle/si);
  assert.match(STYLES, /\.car-code\s*\{[^}]*position:\s*absolute;[^}]*transform:\s*rotate\(var\(--vehicle-upright-angle/si);
  for (const status of [
    'active', 'thinking', 'waiting-for-permission', 'idle', 'error', 'complete', 'unknown',
  ]) {
    assert.match(STYLES, new RegExp(`\\.state-${status} \\.car-(?:headlamp|centerline|roof|chassis)\\s*\\{`, 's'));
  }
  assert.match(STYLES, /\.state-active\s+\.car-headlamp\s*\{[^}]*opacity:\s*1/si);
  assert.match(STYLES, /\.state-thinking\s+\.car-roof\s*\{[^}]*stroke-dasharray/si);
});

test('route cars share deterministic touge traversal phases and inspection pauses', () => {
  assert.match(STYLES, /--route-lap-duration:\s*64s/);
  assert.match(
    STYLES,
    /\.vehicle-anchor\.state-active,\s*\.vehicle-anchor\.state-thinking\s*\{[^}]*animation:\s*touge-traverse var\(--route-lap-duration\) linear infinite/si,
  );
  assert.match(STYLES, /animation-delay:\s*var\(--route-phase,\s*0s\)/);
  assert.match(
    STYLES,
    /\.vehicle-anchor:hover,\s*\.vehicle-anchor:focus-within,\s*\.vehicle-anchor\[data-pinned="true"\]\s*\{[^}]*animation-play-state:\s*paused/si,
  );
  assert.match(STYLES, /@keyframes touge-traverse\s*\{[\s\S]*0%\s*\{[\s\S]*24\.7%[\s\S]*49\.4%[\s\S]*74\.1%[\s\S]*98\.8%[\s\S]*99\.2%[\s\S]*99\.6%[\s\S]*100%/);
  assert.match(RENDERER, /const ROUTE_LAP_SECONDS = 64/);
  assert.match(RENDERER, /const ROUTE_PHASE_SECONDS = ROUTE_LAP_SECONDS \/ 16/);
  assert.match(RENDERER, /--route-phase', `\$\{-placement\.slotIndex \* ROUTE_PHASE_SECONDS\}s`/);
  assert.match(RENDERER, /wrapper\.dataset\.routeSlot = String\(placement\.slotIndex\)/);
  const mobile = STYLES.slice(STYLES.indexOf('@media (max-width: 759px)'));
  assert.match(
    mobile,
    /\.vehicle-anchor,\s*\.vehicle-anchor \.session-car\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/si,
  );
  for (const parked of ['waiting-for-permission', 'idle', 'error', 'complete', 'unknown']) {
    assert.doesNotMatch(
      STYLES,
      new RegExp(`\\.vehicle-anchor\\.state-${parked}[^}]*touge-traverse`, 'si'),
      `${parked} must not traverse`,
    );
  }
});

test('On Track summary uses accessible counts and distinct non-color state encoding', () => {
  assert.match(STYLES, /\.on-track-count\.state-active\s+\.on-track-glyph\s*\{[^}]*border-top-width:\s*4px/si);
  assert.match(STYLES, /\.on-track-count\.state-thinking\s*\{[^}]*repeating-linear-gradient/si);
  assert.match(STYLES, /\.on-track-count\s*\{[^}]*color:\s*var\(--state-ink\)/si);
});

test('reverse-facing car labels counter-rotate upright and the document has a local favicon', () => {
  assert.match(RENDERER, /const vehicleAngle = target === 'route' \? placement\.angle : 0/);
  assert.match(RENDERER, /--vehicle-upright-angle', `\$\{-vehicleAngle\}deg`/);
  assert.match(STYLES, /\.car-glyph\s*\{[^}]*transform:\s*rotate\(var\(--vehicle-upright-angle/si);
  assert.match(STYLES, /\.car-code\s*\{[^}]*transform:\s*rotate\(var\(--vehicle-upright-angle/si);
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
  assert.match(carRule, /width:\s*52px/);
  assert.match(carRule, /height:\s*52px/);
  assert.match(carRule, /min-width:\s*44px/);
  assert.match(carRule, /min-height:\s*44px/);

  const desktopLayout = STYLES.match(/\.dashboard-layout\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(desktopLayout, /display:\s*grid/);
  assert.match(desktopLayout, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(13\.5rem,\s*15rem\)/);
  const pitStackRule = STYLES.match(/\.pit-stack\s*\{([^}]*)\}/s)?.[1] ?? '';
  assert.match(pitStackRule, /overflow:\s*visible/);
  assert.doesNotMatch(pitStackRule, /overflow:\s*auto/);

  const mobileStart = STYLES.indexOf('@media (max-width: 759px)');
  const mobileEnd = STYLES.indexOf('@media (max-width: 420px)', mobileStart);
  const mobile = STYLES.slice(mobileStart, mobileEnd);
  assert.ok(mobileStart >= 0, '759px mobile breakpoint must exist');
  assert.match(mobile, /\.dashboard-layout\s*\{[^}]*flex-direction:\s*column/si);
  assert.match(mobile, /\.map-stage\s*\{[^}]*height:\s*580px/si);
  assert.match(mobile, /\.pit-stack\s*\{[^}]*display:\s*grid/si);
  assert.ok(INDEX.indexOf('class="map-panel"') < INDEX.indexOf('class="pit-stack"'));
  assert.match(STYLES, /overflow-x:\s*hidden/);
  assert.match(STYLES, /\.pit-mount\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*52px\)/si);
  assert.match(STYLES, /\.session-readout\s*\{[^}]*overflow-wrap:\s*anywhere/si);
  assert.doesNotMatch(STYLES, /status-rail|session-list|rail-item/);
});
