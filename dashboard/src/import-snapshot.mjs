import { LIVE_CONSTANTS } from './live-constants.mjs';
import { HOOK_COLLECTOR_VERSION, HOOK_SCHEMA_VERSION, HOOK_TTL_MS } from './observation-contract.mjs';
import { SnapshotValidationError } from './session-contract.mjs';
import { canonicalizeDisplayName } from './tmux-classifier.mjs';

export const ACTIVITY_KINDS = Object.freeze([
  'observed', 'last_activity', 'last_response', 'unavailable',
]);
export const CONFIDENCE_LEVELS = Object.freeze(['authoritative', 'medium', 'low', 'none']);
export const PROVENANCE_VALUES = Object.freeze([
  'fixture_authoritative',
  'tmux_title_spinner',
  'tmux_title_thinking',
  'tmux_title_working',
  'tmux_title_action_required',
  'tmux_title_ready_idle',
  'tmux_title_static_provider',
  'tmux_activity_recent',
  'tmux_activity_idle',
  'tmux_command_candidate',
  'tmux_hook_active',
  'tmux_hook_permission',
  'tmux_hook_question',
  'tmux_hook_turn_ended',
]);

const EXACT_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const TMUX_ID = /^tmux-[0-9a-f]{32}$/;
const TOP_KEYS = ['observedAt', 'schemaVersion', 'sessions', 'source'];
const SOURCE_KEYS = ['collectorVersion', 'kind'];
const SESSION_KEYS = [
  'activity', 'confidence', 'displayName', 'id', 'permissionState', 'provenance', 'status',
];
const ACTIVITY_KEYS = ['at', 'kind'];
const CONTROLS = /[\u0000-\u001f\u007f-\u009f]/u;

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return record(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function validTimestamp(value) {
  return typeof value === 'string' && EXACT_UTC.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validCombination(session) {
  const key = [
    session.status, session.activity?.kind, session.permissionState,
    session.confidence, session.provenance,
  ].join('|');
  return new Set([
    'active|observed|unknown|medium|tmux_title_spinner',
    'active|observed|unknown|medium|tmux_title_working',
    'thinking|observed|unknown|medium|tmux_title_thinking',
    'waiting_for_permission|observed|requested|low|tmux_title_action_required',
    'idle|observed|unknown|low|tmux_title_ready_idle',
    'idle|observed|unknown|low|tmux_title_static_provider',
    'active|observed|unknown|medium|tmux_activity_recent',
    'idle|observed|unknown|medium|tmux_activity_idle',
    'unknown|observed|unknown|none|tmux_command_candidate',
  ]).has(key);
}

function validV3Combination(session, observed) {
  if (!exactKeys(session.evidence, ['kind', 'eventAt', 'expiresAt'])) return false;
  const evidence = session.evidence;
  if (evidence.kind === 'heuristic') {
    return evidence.eventAt === null && evidence.expiresAt === null && validCombination(session);
  }
  if (evidence.kind !== 'hook' || !validTimestamp(evidence.eventAt)
    || !validTimestamp(evidence.expiresAt)
    || Date.parse(evidence.eventAt) > observed || Date.parse(evidence.expiresAt) <= observed
    || Date.parse(evidence.expiresAt) - Date.parse(evidence.eventAt) !== HOOK_TTL_MS
    || session.activity.at !== evidence.eventAt) return false;
  return new Set([
    'active|observed|unknown|medium|tmux_hook_active',
    'waiting_for_permission|observed|requested|medium|tmux_hook_permission',
    'waiting_for_input|observed|unknown|medium|tmux_hook_question',
    'turn_ended|observed|unknown|medium|tmux_hook_turn_ended',
  ]).has([session.status, session.activity.kind, session.permissionState,
    session.confidence, session.provenance].join('|'));
}

function reject() {
  throw new SnapshotValidationError(['LIVE_SNAPSHOT_INVALID']);
}

export function normalizeImportedSnapshot(snapshot, importNow = Date.now()) {
  const v3 = snapshot?.schemaVersion === HOOK_SCHEMA_VERSION;
  if (!exactKeys(snapshot, TOP_KEYS)
    || (!v3 && snapshot.schemaVersion !== LIVE_CONSTANTS.SCHEMA_V2)
    || !exactKeys(snapshot.source, SOURCE_KEYS)
    || snapshot.source.kind !== 'tmux_oneshot'
    || snapshot.source.collectorVersion !== (v3 ? HOOK_COLLECTOR_VERSION : LIVE_CONSTANTS.COLLECTOR_VERSION)
    || !validTimestamp(snapshot.observedAt)
    || !Array.isArray(snapshot.sessions)
    || snapshot.sessions.length > LIVE_CONSTANTS.MAX_SESSION_COUNT) reject();

  const observed = Date.parse(snapshot.observedAt);
  if (observed > importNow + LIVE_CONSTANTS.MAX_FUTURE_SKEW_MS
    || importNow - observed > LIVE_CONSTANTS.MAX_IMPORT_AGE_MS) reject();

  const ids = new Set();
  const sessions = snapshot.sessions.map((session) => {
    if (!exactKeys(session, v3 ? [...SESSION_KEYS, 'evidence'] : SESSION_KEYS)
      || !TMUX_ID.test(session.id)
      || typeof session.displayName !== 'string'
      || session.displayName.length === 0
      || [...session.displayName].length > LIVE_CONSTANTS.MAX_DISPLAY_NAME_CODE_POINTS
      || CONTROLS.test(session.displayName)
      || session.displayName !== session.displayName.normalize('NFC')
      || session.displayName !== canonicalizeDisplayName(session.displayName)
      || !exactKeys(session.activity, ACTIVITY_KEYS)
      // Activity may predate the observation by any amount - that gap is the
      // point - but a stamp after it is incoherent and rejects the file.
      || !validTimestamp(session.activity.at)
      || Date.parse(session.activity.at) > observed
      || !(v3 ? validV3Combination(session, observed) : validCombination(session))
      || ids.has(session.id)) reject();
    ids.add(session.id);
    return Object.freeze({
      ...session,
      sourceKind: 'tmux_oneshot',
      generatedAt: snapshot.observedAt,
      lastActivityAt: session.activity.at,
    });
  });

  const codes = new Map([...sessions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((session, index) => [session.id, `S${String(index + 1).padStart(2, '0')}`]));
  return Object.freeze({
    schemaVersion: snapshot.schemaVersion,
    sourceKind: 'tmux_oneshot',
    observedAt: snapshot.observedAt,
    generatedAt: snapshot.observedAt,
    sessions: Object.freeze(sessions.map((session) => Object.freeze({
      ...session,
      mapCode: codes.get(session.id),
    }))),
  });
}

export function readImportFile(file, {
  FileReaderClass = globalThis.FileReader,
  importNow = Date.now(),
} = {}) {
  if (!file || !Number.isInteger(file.size)
    || file.size <= 0 || file.size > LIVE_CONSTANTS.MAX_IMPORT_FILE_BYTES) {
    return Promise.reject(new SnapshotValidationError(['LIVE_SNAPSHOT_INVALID']));
  }
  return new Promise((resolve, rejectPromise) => {
    const reader = new FileReaderClass();
    reader.onerror = () => rejectPromise(new SnapshotValidationError(['LIVE_SNAPSHOT_INVALID']));
    reader.onload = () => {
      try {
        resolve(normalizeImportedSnapshot(JSON.parse(String(reader.result)), importNow));
      } catch {
        rejectPromise(new SnapshotValidationError(['LIVE_SNAPSHOT_INVALID']));
      }
    };
    reader.readAsText(file);
  });
}

export function ageLabel(observedAt, now = Date.now()) {
  const age = Math.max(0, now - Date.parse(observedAt));
  const minutes = Math.floor(age / 60000);
  const band = age < LIVE_CONSTANTS.FRESH_DISPLAY_AGE_MS
    ? 'fresh'
    : age <= LIVE_CONSTANTS.MAX_IMPORT_AGE_MS ? 'aging' : 'stale';
  return `${band} · observed ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
}
