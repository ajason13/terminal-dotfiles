import { STATE_PRESENTATION } from './session-contract.mjs';

export const SEGMENTS = Object.freeze([
  'Lower Hairpins', 'Cedar Bend', 'Ridge Run', 'Summit Approach',
]);
export const ZONES = Object.freeze({
  permission: 'Permission Checkpoint',
  error: 'Service Bay',
  pitstop: 'Pit Stop',
  unknown: 'Unclassified hold',
});

const a = (id, poolLabel, x, y, angle = 0) => Object.freeze({ id, poolLabel, x, y, angle });
export const ROUTE_ANCHORS = Object.freeze([
  a('R01', SEGMENTS[0], 150, 690, -10), a('R02', SEGMENTS[0], 380, 650, -6),
  a('R03', SEGMENTS[0], 620, 685, 8), a('R04', SEGMENTS[0], 850, 625, -12),
  a('R05', SEGMENTS[1], 850, 530, -168), a('R06', SEGMENTS[1], 620, 500, 174),
  a('R07', SEGMENTS[1], 380, 540, 164), a('R08', SEGMENTS[1], 150, 500, -174),
  a('R09', SEGMENTS[2], 150, 405, -8), a('R10', SEGMENTS[2], 380, 370, 4),
  a('R11', SEGMENTS[2], 620, 405, -5), a('R12', SEGMENTS[2], 850, 350, 8),
  a('R13', SEGMENTS[3], 850, 255, -170), a('R14', SEGMENTS[3], 620, 225, 174),
  a('R15', SEGMENTS[3], 380, 270, 166), a('R16', SEGMENTS[3], 150, 210, -174),
]);

const bays = (prefix, poolLabel, left, right, rows) => Object.freeze(rows.flatMap((y, row) => [
  a(`${prefix}${row * 2 + 1}`, poolLabel, left, y),
  a(`${prefix}${row * 2 + 2}`, poolLabel, right, y),
]));
export const PARKED_ANCHORS = Object.freeze({
  error: bays('E', ZONES.error, 812, 937, [90, 152, 214]),
  permission: bays('P', ZONES.permission, 63, 190, [546, 608, 670]),
  pitstop: bays('T', ZONES.pitstop, 812, 937, [546, 608, 670]),
});
export const UNKNOWN_HOLD_ANCHORS = Object.freeze([
  a('U1', ZONES.unknown, 0, 0),
  a('U2', ZONES.unknown, 0, 0),
  a('U3', ZONES.unknown, 0, 0),
]);

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

const poolOf = (session) => STATE_PRESENTATION[session.status].pool;
const anchorsOf = (pool) => {
  if (pool === 'route') return ROUTE_ANCHORS;
  if (pool === 'unknown') return UNKNOWN_HOLD_ANCHORS;
  return PARKED_ANCHORS[pool];
};
const labelOf = (pool) => pool === 'route' ? 'Shared Route' : ZONES[pool];

function placement(session, pool, anchor, slotIndex) {
  return Object.freeze({
    id: session.id, mapCode: session.mapCode, pool, poolLabel: labelOf(pool),
    locationLabel: pool === 'route'
      ? `${anchor.poolLabel}, Route Slot ${slotIndex + 1}`
      : `${anchor.poolLabel}, Bay ${slotIndex + 1}`,
    x: anchor.x, y: anchor.y, angle: anchor.angle, slotIndex, overflow: false,
  });
}

const overflow = (session, pool) => Object.freeze({
  id: session.id, mapCode: session.mapCode, pool, poolLabel: labelOf(pool),
  locationLabel: `Map capacity exceeded for ${labelOf(pool)}`,
  x: null, y: null, angle: null, slotIndex: null, overflow: true,
});

export function allocateSessions(sessions) {
  const pools = new Map();
  for (const session of sessions) {
    const pool = poolOf(session);
    if (!pools.has(pool)) pools.set(pool, []);
    pools.get(pool).push(session);
  }
  const byId = new Map();
  for (const [pool, members] of pools) {
    const anchors = anchorsOf(pool);
    const used = new Set();
    for (const session of [...members].sort((l, r) => l.id.localeCompare(r.id))) {
      if (used.size === anchors.length) {
        byId.set(session.id, overflow(session, pool));
        continue;
      }
      let index = pool === 'route'
        ? preferredRouteIndex(session)
        : fnv1a32(session.id) % anchors.length;
      while (used.has(index)) index = (index + 1) % anchors.length;
      used.add(index);
      byId.set(session.id, placement(session, pool, anchors[index], index));
    }
  }
  return Object.freeze(sessions.map((session) => byId.get(session.id)));
}
