import { STATE_PRESENTATION, parseWorkRef } from './session-contract.mjs';
import { getTrack } from './track-catalog.mjs';

const RIDGE_PASS = getTrack('ridge-pass');
export const SEGMENTS = RIDGE_PASS.segments;

export const ROUTE_ANCHORS = RIDGE_PASS.routeAnchors;

export function fnv1a32(value) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash = Math.imul((hash ^ byte) >>> 0, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function preferredRouteIndex(session) {
  return session.progress === undefined
    ? fnv1a32(session.id) % 16
    : Math.min(15, Math.floor(session.progress * 16));
}

export const PIT_CAPACITY = 18;

export const UNASSIGNED_BAY_LABEL = 'Unassigned';

// The tmux session a window belongs to, parsed off the `<session> ▸ <window>` display
// name. null means the name carried no prefix (fixtures, imported snapshots).
const bayKeyOf = (session) => parseWorkRef(session.displayName).sessionName;

const poolOf = (session) => STATE_PRESENTATION[session.status].pool;

function routePlacement(session, anchor, slotIndex) {
  return Object.freeze({
    id: session.id, mapCode: session.mapCode, pool: 'route', poolLabel: 'Shared Route',
    locationLabel: `${anchor.poolLabel}, Route Slot ${slotIndex + 1}`,
    x: anchor.x, y: anchor.y, angle: anchor.angle, slotIndex, overflow: false,
  });
}

function pitPlacement(session, slotIndex, bayKey, bayRank) {
  return Object.freeze({
    id: session.id, mapCode: session.mapCode, pool: 'pit', poolLabel: 'Pit',
    locationLabel: `Pit, ${bayKey ?? UNASSIGNED_BAY_LABEL} bay, position ${bayRank + 1}`,
    x: null, y: null, angle: null, slotIndex, bayKey, bayRank, overflow: false,
  });
}

const overflowPlacement = (session, pool, poolLabel) => Object.freeze({
  id: session.id, mapCode: session.mapCode, pool, poolLabel,
  locationLabel: pool === 'route' ? 'Map capacity exceeded for Shared Route' : 'Pit is at capacity',
  x: null, y: null, angle: null, slotIndex: null, overflow: true,
});

export function allocateSessions(sessions, track = RIDGE_PASS) {
  const routeMembers = [];
  const pitMembers = [];
  for (const session of sessions) {
    (poolOf(session) === 'route' ? routeMembers : pitMembers).push(session);
  }
  const byId = new Map();

  // Route: progress/hash slotting into the track anchors. Order-independent.
  const routeAnchors = track.routeAnchors;
  const usedRoute = new Set();
  for (const session of [...routeMembers].sort((l, r) => l.id.localeCompare(r.id))) {
    if (usedRoute.size === routeAnchors.length) {
      byId.set(session.id, overflowPlacement(session, 'route', 'Shared Route'));
      continue;
    }
    let index = preferredRouteIndex(session);
    while (usedRoute.has(index)) index = (index + 1) % routeAnchors.length;
    usedRoute.add(index);
    byId.set(session.id, routePlacement(session, routeAnchors[index], index));
  }

  // Pit: one pool, newest-first by lastActivityAt, id tie-break, capacity PIT_CAPACITY.
  // Sort is order-independent (timestamp desc, then id asc), so input order never
  // changes the result - preserves the suite's stable-allocation guarantee.
  const orderedPit = [...pitMembers].sort((l, r) => {
    const delta = Date.parse(r.lastActivityAt) - Date.parse(l.lastActivityAt);
    return delta !== 0 ? delta : l.id.localeCompare(r.id);
  });
  // Global recency restricted to one bay's members is that bay's recency order, so a
  // single pass assigns the global slotIndex and the per-bay bayRank together.
  const bayFill = new Map();
  orderedPit.forEach((session, rank) => {
    if (rank >= PIT_CAPACITY) {
      byId.set(session.id, overflowPlacement(session, 'pit', 'Pit'));
      return;
    }
    const bayKey = bayKeyOf(session);
    const bayRank = bayFill.get(bayKey) ?? 0;
    bayFill.set(bayKey, bayRank + 1);
    byId.set(session.id, pitPlacement(session, rank, bayKey, bayRank));
  });

  return Object.freeze(sessions.map((session) => byId.get(session.id)));
}

// Separate from allocateSessions since its return is indexed positionally across the suite.
// Re-runs allocation (not a second capacity guess) so Unassigned reflects real placements.
export function allocatePitBays(sessions, track = RIDGE_PASS) {
  const placed = allocateSessions(sessions, track);
  const hasUnassignedCar = placed.some((item) => (
    item.pool === 'pit' && !item.overflow && item.bayKey === null
  ));
  // Named bays come from every session, route included, so a session whose windows are
  // all on-track still gets a bay to render Clear in.
  const named = new Set();
  for (const session of sessions) {
    const key = bayKeyOf(session);
    if (key !== null) named.add(key);
  }
  const bays = [...named]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => ({ key, label: key }));
  // Unassigned is not a real tmux session, so it earns a bay only by holding a car.
  if (hasUnassignedCar) bays.push({ key: null, label: UNASSIGNED_BAY_LABEL });
  return Object.freeze(bays.map((bay) => Object.freeze(bay)));
}
