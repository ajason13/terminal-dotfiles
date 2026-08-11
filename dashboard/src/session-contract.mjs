export const SESSION_STATUSES = Object.freeze([
  'active', 'thinking', 'waiting_for_permission', 'idle', 'error', 'complete', 'unknown',
]);

export const PERMISSION_STATES = Object.freeze([
  'not_required', 'requested', 'granted', 'denied', 'unknown',
]);

export const STATE_PRESENTATION = Object.freeze({
  active: Object.freeze({ label: 'Active', glyph: '›', pool: 'route' }),
  thinking: Object.freeze({ label: 'Thinking', glyph: '…', pool: 'route' }),
  waiting_for_permission: Object.freeze({ label: 'Waiting for permission', glyph: '!', pool: 'pit' }),
  idle: Object.freeze({ label: 'Idle', glyph: '‖', pool: 'pit' }),
  error: Object.freeze({ label: 'Error', glyph: '×', pool: 'pit' }),
  complete: Object.freeze({ label: 'Complete', glyph: '✓', pool: 'pit' }),
  unknown: Object.freeze({ label: 'Unknown', glyph: '?', pool: 'pit' }),
});

const WAITING_PERMISSIONS = new Set(['requested', 'denied']);
const NON_WAITING_PERMISSIONS = new Set(['not_required', 'granted', 'unknown']);
const FIXTURE_STATUSES = new Set([
  'active', 'thinking', 'waiting_for_permission', 'idle', 'error', 'complete',
]);
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export class SnapshotValidationError extends Error {
  constructor(issues) {
    super(`Invalid dashboard snapshot: ${issues.join('; ')}`);
    this.name = 'SnapshotValidationError';
    this.issues = Object.freeze([...issues]);
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonemptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isIsoTimestamp(value) {
  return typeof value === 'string' && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

function optionalString(session, field, path, issues) {
  if (field in session && session[field] !== undefined && !isNonemptyString(session[field])) {
    issues.push(`${path}.${field} must be a nonempty string when present`);
  }
}

function validateSession(session, index, issues, ids) {
  const path = `sessions[${index}]`;
  if (!isRecord(session)) {
    issues.push(`${path} must be an object`);
    return;
  }

  for (const field of ['id', 'displayName']) {
    if (!isNonemptyString(session[field])) issues.push(`${path}.${field} must be a nonempty string`);
  }
  if (isNonemptyString(session.id)) {
    if (ids.has(session.id)) issues.push(`${path}.id duplicates ${JSON.stringify(session.id)}`);
    ids.add(session.id);
  }
  if (!FIXTURE_STATUSES.has(session.status)) issues.push(`${path}.status is unsupported`);
  if (!PERMISSION_STATES.includes(session.permissionState)) issues.push(`${path}.permissionState is unsupported`);
  if (!isIsoTimestamp(session.lastActivityAt)) {
    issues.push(`${path}.lastActivityAt must be a parseable ISO timestamp`);
  }

  if ('progress' in session && session.progress !== undefined) {
    if (typeof session.progress !== 'number' || !Number.isFinite(session.progress)
      || session.progress < 0 || session.progress > 1) {
      issues.push(`${path}.progress must be a finite number from 0 through 1`);
    }
  }
  optionalString(session, 'phase', path, issues);
  optionalString(session, 'errorSummary', path, issues);

  if (session.status === 'error' && !isNonemptyString(session.errorSummary)) {
    issues.push(`${path}.errorSummary is required for error status`);
  }
  if (session.status !== 'error' && 'errorSummary' in session && session.errorSummary !== undefined) {
    issues.push(`${path}.errorSummary is allowed only for error status`);
  }

  if (session.status === 'waiting_for_permission') {
    if (!WAITING_PERMISSIONS.has(session.permissionState)) {
      issues.push(`${path}.permissionState must be requested or denied while waiting`);
    }
  } else if (PERMISSION_STATES.includes(session.permissionState)
    && !NON_WAITING_PERMISSIONS.has(session.permissionState)) {
    issues.push(`${path}.permissionState requested or denied requires waiting status`);
  }
}

function frozenSession(session, mapCode) {
  const normalized = {
    id: session.id.trim(),
    displayName: session.displayName.trim(),
    status: session.status,
    lastActivityAt: session.lastActivityAt,
    permissionState: session.permissionState,
    sourceKind: 'fixture',
    confidence: 'authoritative',
    provenance: 'fixture_authoritative',
    activity: Object.freeze({
      kind: session.status === 'complete' ? 'last_response' : 'last_activity',
      at: session.lastActivityAt,
    }),
    mapCode,
  };
  for (const field of ['progress', 'phase', 'errorSummary']) {
    if (session[field] !== undefined) normalized[field] = session[field];
  }
  return Object.freeze(normalized);
}

export function normalizeSnapshot(snapshot) {
  if (!isRecord(snapshot)) throw new SnapshotValidationError(['snapshot must be an object']);
  const issues = [];
  if (snapshot.schemaVersion !== 1) issues.push('schemaVersion must equal 1');
  if (!isIsoTimestamp(snapshot.generatedAt)) issues.push('generatedAt must be a parseable ISO timestamp');
  if (!Array.isArray(snapshot.sessions)) {
    issues.push('sessions must be an array');
  } else {
    const ids = new Set();
    snapshot.sessions.forEach((session, index) => validateSession(session, index, issues, ids));
  }
  if (issues.length > 0) throw new SnapshotValidationError(issues);

  const codes = new Map([...snapshot.sessions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((session, index) => [session.id, `S${String(index + 1).padStart(2, '0')}`]));
  return Object.freeze({
    schemaVersion: 1,
    sourceKind: 'fixture',
    generatedAt: snapshot.generatedAt,
    sessions: Object.freeze(snapshot.sessions.map((session) => frozenSession(session, codes.get(session.id)))),
  });
}

export function formatActivityAge(lastActivityAt, generatedAt) {
  const seconds = Math.max(0, Math.floor((Date.parse(generatedAt) - Date.parse(lastActivityAt)) / 1000));
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function formatActivityTimestamp(value, options = {}) {
  const { locale = 'en-US', timeZone } = options;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(value));
}

const TICKET_RE = /[A-Z][A-Z0-9]+-\d+/;
const PR_RE = /\bPR\s*#?\s*(\d+)/i;
// Legacy ` · pane <N>` suffix. The collector no longer emits it, but imported and
// hand-authored snapshots still carry it, and the heading must stay the window
// name the operator chose either way.
const PANE_SUFFIX_RE = /\s*·\s*pane\s+\d+\s*$/i;
// The `<session> ▸ ` prefix sanitizeDisplayName prepends. Split off so the heading
// stays the window name while `sessionName` carries the tmux session separately.
// The class excludes ▸ so only the first one is consumed - that is the delimiter,
// since sanitizeDisplayName strips ▸ out of both segments it joins.
const SESSION_PREFIX_RE = /^([^▸]*)▸\s*/u;
// Separators operators put between a ref and the rest of a window name
// (`BB-76 - Track History`, `BB-76: Track History`). Stripping the ref orphans one.
const SEPARATOR = '·\\-–—:|';
const EDGE_SEPARATOR_RE = new RegExp(`^[\\s${SEPARATOR}]+|[\\s${SEPARATOR}]+$`, 'g');
// Only a run of 2+ separators collapses, so a hyphen inside a word (`e2e-automation`)
// is left alone - it is adjacency to another separator that marks one as orphaned.
const SEPARATOR_RUN_RE = new RegExp(`([${SEPARATOR}])(?:\\s*[${SEPARATOR}])+`, 'g');

// Parse the Jira key and/or PR number out of a session displayName (the tmux
// window name). Strips both tokens and the ` · pane <N>` suffix; `label` is '' when
// nothing survives, and callers fall back to the ref.
export function parseWorkRef(name) {
  const source = typeof name === 'string' ? name : '';
  // Match tokens on the window name alone. A session named after a ticket would
  // otherwise hijack the ref for every window inside it.
  const prefixMatch = source.match(SESSION_PREFIX_RE);
  const sessionName = prefixMatch ? prefixMatch[1].trim() || null : null;
  const scoped = source.replace(SESSION_PREFIX_RE, '');
  const ticketMatch = scoped.match(TICKET_RE);
  const prMatch = scoped.match(PR_RE);
  const ticketKey = ticketMatch ? ticketMatch[0] : null;
  const prNumber = prMatch ? Number(prMatch[1]) : null;
  let label = scoped.replace(PANE_SUFFIX_RE, '');
  if (ticketMatch) label = label.replace(TICKET_RE, ' ');
  if (prMatch) label = label.replace(PR_RE, ' ');
  // Token removal orphans separators (`BB-325` alone reduces to `·`). An empty
  // label is a valid result - the renderer falls back to the ref itself.
  label = label.replace(/\s+/g, ' ');
  // Only drop separators when a token was actually stripped - an untouched
  // name like `foo·bar` or `Rate-limit retry` must keep its own punctuation.
  if (ticketMatch || prMatch) {
    label = label.replace(SEPARATOR_RUN_RE, '$1').replace(EDGE_SEPARATOR_RE, '');
  }
  label = label.trim();
  return { ticketKey, prNumber, label, sessionName };
}

export function buildAccessibleText(session, placement, generatedAt, timestampOptions = {}) {
  const state = STATE_PRESENTATION[session.status];
  const location = placement.overflow
    ? `Map capacity exceeded for ${placement.poolLabel}`
    : placement.locationLabel;
  const details = [];
  if (session.phase) details.push(`Phase: ${session.phase}`);
  if (session.progress !== undefined) details.push(`Progress: ${Math.round(session.progress * 100)} percent`);
  const relative = formatActivityAge(session.lastActivityAt, generatedAt);
  const activity = Object.freeze({
    label: session.activity?.kind === 'observed'
      ? 'Seen'
      : session.status === 'complete' ? 'Last response' : 'Last active',
    exact: formatActivityTimestamp(session.lastActivityAt, timestampOptions),
    relative,
    // Tooltip-only wording; `relative` keeps the precise form for the a11y string.
    short: /^\d+ seconds? ago$/.test(relative) ? 'just now' : relative,
    datetime: session.lastActivityAt,
  });
  details.push(`${activity.label}: ${activity.exact} (${activity.relative})`);
  if (session.errorSummary) details.push(`Error: ${session.errorSummary}`);
  const workRef = parseWorkRef(session.displayName);
  return Object.freeze({
    label: `${session.mapCode}, ${session.displayName}, ${state.label}, ${location}`,
    details: details.join('. '),
    activity,
    workRef: Object.freeze(workRef),
  });
}
