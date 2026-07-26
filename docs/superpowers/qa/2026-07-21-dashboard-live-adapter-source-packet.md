# Dashboard live-adapter QA source packet

**Prepared:** 2026-07-21
**Stage:** Pre-implementation architecture review
**Implementation diff:** None

This packet contains focused current-source evidence needed to audit the
proposed spike. The attached spike specification is the authoritative proposed
design.

## Current dashboard data contract

Source: `dashboard/src/session-contract.mjs`

```js
export const SESSION_STATUSES = Object.freeze([
  'active', 'thinking', 'waiting_for_permission', 'idle', 'error', 'complete',
]);

export const PERMISSION_STATES = Object.freeze([
  'not_required', 'requested', 'granted', 'denied', 'unknown',
]);

export const STATE_PRESENTATION = Object.freeze({
  active: { label: 'Active', glyph: '›', pool: 'route' },
  thinking: { label: 'Thinking', glyph: '…', pool: 'route' },
  waiting_for_permission: { label: 'Waiting for permission', glyph: '!', pool: 'permission' },
  idle: { label: 'Idle', glyph: '‖', pool: 'pitstop' },
  error: { label: 'Error', glyph: '×', pool: 'error' },
  complete: { label: 'Complete', glyph: '✓', pool: 'pitstop' },
});
```

Current validation requires:

```js
if (!SESSION_STATUSES.includes(session.status)) issues.push('status unsupported');
if (!PERMISSION_STATES.includes(session.permissionState)) issues.push('permission unsupported');
if (!isIsoTimestamp(session.lastActivityAt)) issues.push('lastActivityAt required');

if (session.status === 'error' && !isNonemptyString(session.errorSummary)) {
  issues.push('errorSummary required for error');
}

if (session.status === 'waiting_for_permission') {
  // permission must be requested or denied
} else {
  // requested or denied is rejected
}

if (snapshot.schemaVersion !== 1) issues.push('schemaVersion must equal 1');
```

The complete state changes timestamp semantics:

```js
label: session.status === 'complete' ? 'Last response' : 'Last active'
```

Therefore observation time cannot be placed in `lastActivityAt` without making
a false user-visible claim.

## Current adapter and startup flow

Sources: `dashboard/src/fixture-adapter.mjs`, `dashboard/src/app.mjs`

```js
export class FixtureSessionAdapter {
  async readSnapshot() {
    return cloneSnapshot(this.#snapshot);
  }
}

async function startDashboard() {
  const adapter = new FixtureSessionAdapter(FIXTURE_SNAPSHOT);
  const rawSnapshot = await adapter.readSnapshot();
  const snapshot = normalizeSnapshot(rawSnapshot);
  renderDashboard(snapshot);
}
```

The dashboard reads fixtures once. It has no source selector, import lifecycle,
refresh lifecycle, or mixed-source reset behavior today.

## Current placement constraints

The current UI has:

- 16 route anchors shared by active/thinking;
- six Service Bay anchors for error;
- six Permission Checkpoint anchors for permission waits;
- six Pit Stop anchors shared by idle/complete;
- deterministic canonical-ID ordering and circular collision probing;
- explicit per-pool overflow.

The proposed `unknown` state has no existing pool. The spike proposes a gray `?`
car in Pit Stop, which changes that pool's capacity and semantic mix.

## Existing title classifier

Source: `tmux/tmux-llm-status`

```bash
has_spinner_title() {
  case "$1" in
    # Braille frames or circle/ASCII spinner prefixes
    $'\xe2\xa0'* | $'\xe2\xa1'* | $'\xe2\xa2'* | $'\xe2\xa3'* |
    "◐ "* | "◓ "* | "◑ "* | "◒ "* | "- "* | "\\ "* | "| "* | "/ "*)
      return 0 ;;
    *) return 1 ;;
  esac
}

is_waiting_title() {
  case "$1" in
    *"Action Required"* | *"Ready"* | *"Idle"*) return 0 ;;
    *) return 1 ;;
  esac
}

is_active_title() {
  case "$1" in
    *"Thinking"* | *"Working"* | *"Running"* | *"Processing"* |
    *"Executing"* | *"Loading"*) return 0 ;;
    *) return 1 ;;
  esac
}
```

Current classification order is spinner -> active keyword -> combined waiting
keyword -> static provider title -> command fallback. It emits only counts for
active, present, and waiting. The proposed exporter must not reuse its combined
waiting meaning because Ready/Idle do not prove a permission request.

## Existing daemon behavior that must remain untouched

Sources: `tmux/tmux-llm-status`, `tmux/tmux.conf`

```bash
update_all_windows() {
  # reads panes, then writes @llm_status per window and @llm_fleet globally
  tmux_cmd set-option -wq -t "$window" @llm_status "..."
  tmux_cmd set-option -gq @llm_fleet "..."
}

run_daemon() {
  while true; do
    update_all_windows
    sleep 1
  done
}
```

```tmux
run-shell -b '~/.local/bin/tmux-llm-status restart'
```

The dashboard collector must be separate and explicitly invoked. It must not
modify, call, stop, restart, import, or add output behavior to this daemon.

## Read-only runtime observations

The spike observed one tmux 3.7 server with one session, three windows, four
panes, and two clients. Relevant findings:

- server/session/window/pane IDs, window names, pane titles, commands, paths,
  dead state, and status are available through tmux formatting;
- recognized LLM panes reported `node` as current command;
- spinner-bearing titles were visible;
- one stored window marker disagreed with a later pane-title read;
- sequential tmux calls are not atomic;
- window/session activity values are not trustworthy pane response times in the
  presence of the option-writing status daemon.

No raw runtime titles, paths, PIDs, TTYs, socket values, buffers, or content are
included in this packet.

## WezTerm boundary

Installed WezTerm CLI behavior observed during the spike:

- plain `wezterm cli list` attempted its documented mux-server auto-start and
  failed before creating a server;
- `wezterm cli --no-auto-start list --format json` made no spawn attempt but
  could not connect.

WezTerm CLI is therefore explicitly excluded from the proposed collector.

## Current verification baseline

Before this new task, the fixture dashboard had:

- 28 passing dependency-free Node tests;
- desktop verification at 1440x900;
- mobile verification at 390x844;
- deterministic nonoverlapping placement and explicit overflow;
- keyboard focus, Enter/Space pin, and Escape clear behavior;
- reduced-motion and contrast checks;
- zero browser console errors/warnings;
- no runtime tmux, WezTerm, process, polling, or network integration.

These results do not validate schema v2, process execution, manual import,
privacy filtering, unknown-state placement, or stale-source behavior.

## Files relevant to eventual implementation

- `dashboard/src/session-contract.mjs`
- `dashboard/src/fixture-adapter.mjs`
- `dashboard/src/app.mjs`
- `dashboard/src/render-dashboard.mjs`
- `dashboard/src/track-layout.mjs`
- `dashboard/tests/dashboard.test.mjs`
- `dashboard/README.md`

Protected reference-only files:

- `tmux/tmux-llm-status`
- `tmux/tmux.conf`
- `wezterm/modules/general.lua`

No implementation diff exists yet.
