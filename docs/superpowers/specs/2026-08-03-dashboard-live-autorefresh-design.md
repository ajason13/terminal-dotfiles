# Dashboard live auto-refresh (opt-in loopback) - Design

**Status:** Design approved; not yet implemented.

**Goal:** Let the dashboard update on its own from real tmux data, on a short
interval, without the user re-running the exporter and re-selecting a file each
time.

**Governing principle:** Reopen only the *transport* boundary. Every live byte
still flows through the existing hardened collector and the exact same
`normalizeImportedSnapshot` validation used for manual file import, so the
*data* guarantees the prior specs established are preserved unchanged.

---

## Motivation

The current live path (see `2026-07-21-dashboard-live-adapter-resolved-design.md`
and `2026-07-31-dashboard-opt-in-live-workflow-design.md`) is a one-shot export
to a sanitized schema-v2 JSON file that the user explicitly selects in the
browser. Refresh means rerunning `export-tmux.mjs` and re-selecting the file.
That is deliberately not "live" - the specs forbid polling, watching, daemons,
servers, and browser re-reads.

For actively watching agent sessions flip between working / waiting, the manual
loop is too slow. This design adds an **opt-in** auto-refresh that the user
starts explicitly, accepting a scoped reversal of the no-server / no-polling
transport rules in exchange for hands-free updates.

## Scope

**In scope:**
- A new opt-in loopback HTTP server that serves the static dashboard and one
  read-only snapshot endpoint.
- A browser poll loop that fetches the endpoint on an interval and renders each
  payload through the existing import-validation path.
- Security hardening for the local server (bind, Host/cross-site checks, token).
- Tests for the endpoint handler and the poll controller, using injected fakes
  (never the real tmux server).

**Out of scope:**
- Streaming (SSE/WebSocket) and any long-lived daemon.
- File-watch / File System Access API re-read.
- Any change to the collector's data contract, sanitization, or enums.
- Auto-starting the server from WezTerm, tmux, shells, or the LLM-status daemon.
- Persistence, telemetry, remote services, pane content, or new tmux commands.

## Protected boundaries

**Preserved exactly (data layer - the load-bearing safety):**
- Session IDs remain the salted SHA-256 `tmux-[0-9a-f]{32}` form; raw socket
  path / start_time / pane_id are never emitted (`src/tmux-collector.mjs`
  `stableTmuxId`).
- Status stays the closed enum
  (`active/thinking/waiting_for_permission/idle/unknown`); no pane content,
  titles, activity timestamps, or `@llm_status` are used.
- Display name is window-name + pane-index only, NFC-normalized, control-chars
  stripped, ≤80 code points.
- Every payload the browser accepts passes `normalizeImportedSnapshot`
  (`src/import-snapshot.mjs`): exact-key validation, `schemaVersion===2`,
  `source.kind==='tmux_oneshot'`, session count ≤64, age ≤15 min / future-skew
  ≤2 min, per-session ID regex, display-name re-sanitization, and the 7-tuple
  `validCombination` allowlist. Any violation rejects the whole payload.
- Imported strings render through text nodes, never `innerHTML`.
- The collector's environment gate is unchanged: Homebrew tmux at
  `/opt/homebrew/bin/tmux` or `/usr/local/bin/tmux`, ownership/type checks on the
  binary and the default `/private/tmp/tmux-<uid>/default` socket, the tmux-3.7
  length-prefixed `#{n:...}` framing, fail-closed on anything else.

**Deliberately reversed (transport layer - documented as a scoped choice):**
- A loopback HTTP server now exists (opt-in, `127.0.0.1` only).
- A data-polling timer now exists in the browser (the 5s fetch loop).
- A fetch endpoint now exists (`GET /live/snapshot`).

These three were listed as protected in the prior specs. This design supersedes
that transport prohibition **only** for the explicitly-started server; the pure
export-and-import mode remains present and is still the documented default.

## Architecture

### New entry point: `dashboard/serve-live.mjs`

A dependency-free Node HTTP server, started manually:

```sh
node dashboard/serve-live.mjs           # defaults to 127.0.0.1:4173
node dashboard/serve-live.mjs --port 5000
```

Responsibilities:
1. **Static file server** for the dashboard directory, so live mode is one
   command (no separate `python3 -m http.server`). Serves only files resolving
   under `dashboard/`; rejects path traversal and does not follow symlinks out
   of the tree. `node_modules`, `tests/`, and dotfiles are not served.
2. **`GET /live/snapshot`** - runs the existing collector
   (`buildSnapshot` from `src/tmux-collector.mjs`) and returns the schema-v2
   JSON object, identical to what `export-tmux.mjs` writes to disk.
3. **Token injection** - on serving `index.html`, replaces a
   `__LIVE_TOKEN__` placeholder with a per-process random token (see Security).

The server writes nothing to disk, keeps no session state, and exits on
Ctrl-C. It is never started by any other component.

### Reused, unchanged

- `src/tmux-collector.mjs`, `src/tmux-frame.mjs`, `src/tmux-classifier.mjs` -
  collection + sanitization.
- `src/import-snapshot.mjs` `normalizeImportedSnapshot` - browser-side
  validation, applied to fetched payloads exactly as to picked files.
- `src/source-controller.mjs` - extended with a polling state (below), not
  rewritten.
- `src/live-constants.mjs` - gains the new constants (below).

## Data flow

```
browser  --GET /live/snapshot every 5s (X-Live-Token)-->  serve-live.mjs
                                                               |
                                                          tmux-collector (hardened)
                                                               |
                                                          schema-v2 JSON
browser  <-------------------- 200 application/json ------------
   |
normalizeImportedSnapshot  ->  render (live)  |  reject -> keep last-good, mark stale
```

## Endpoint contract

`GET /live/snapshot`

- **Request** must carry `X-Live-Token: <token>` matching the served page's
  token, a `Host` header of `127.0.0.1:<port>` or `localhost:<port>`, and must
  not be cross-site (`Sec-Fetch-Site` in `{same-origin, none}` when present).
- **200** `application/json`, `Cache-Control: no-store` - the schema-v2 object.
- **403** `{ "error": "LIVE_REQUEST_FORBIDDEN" }` - Host / cross-site / token
  failure.
- **503** `{ "error": "<COLLECTOR_ERROR_CODE>" }` - collector environment gate
  failed (wrong tmux, bad socket, timeout); reuses the closed
  `COLLECTOR_ERROR_CODES`.
- **405** for any method other than `GET`.
- Error bodies contain only closed codes - never raw error text or paths.

## Browser opt-in and lifecycle

- **Fixtures remain the startup default.** `source-controller.start()` renders
  fixtures exactly as today.
- **Capability detection:** the injected token (`window.__LIVE_TOKEN__`) is
  present only when served by `serve-live.mjs`. The "Go live (auto-refresh)"
  control is shown/enabled only then; over `file://` or a plain static server it
  is absent, so nothing changes for the pure workflow.
- **Start:** clicking "Go live" fetches `/live/snapshot`, runs
  `normalizeImportedSnapshot`, and on success enters a new source-controller
  state `live_polling` (label `Live · auto-refresh`), then sets a
  `LIVE_POLL_INTERVAL_MS` (5000) interval.
- **Each tick** re-fetches and re-validates. A rejected or failed tick does
  **not** clear the view: it keeps the last-good snapshot and marks it stale
  (reusing the age-label affordance). After `LIVE_MAX_CONSECUTIVE_FAILURES` (3)
  consecutive failures it falls back to fixtures with a rejection label.
- **Pause on hidden:** a `visibilitychange` handler stops the interval while the
  tab is hidden and resumes on visible, so a backgrounded tab does not poll.
- **Stop:** the control toggles off to stop polling and return to fixtures.
- **Interval configurability:** `LIVE_POLL_INTERVAL_MS` is a constant in
  `live-constants.mjs`; the existing display-only age-label interval is
  unchanged.
- Reentrancy uses the controller's existing `generation` counter + single
  `AbortController` per render; a start/stop/tick cannot interleave stale
  renders.

## New constants (`src/live-constants.mjs`)

- `LIVE_POLL_INTERVAL_MS = 5000`
- `LIVE_MAX_CONSECUTIVE_FAILURES = 3`
- `LIVE_SERVER_DEFAULT_PORT = 4173`
- `LIVE_SNAPSHOT_ROUTE = '/live/snapshot'`
- `LIVE_TOKEN_PLACEHOLDER = '__LIVE_TOKEN__'`
- Closed code additions: `LIVE_REQUEST_FORBIDDEN` (server-side auth), reusing
  existing `COLLECTOR_ERROR_CODES` and `LIVE_SNAPSHOT_INVALID`.

## Security model

- **Bind `127.0.0.1` only** - never `0.0.0.0`; the socket is unreachable off the
  loopback interface.
- **Host header allowlist** - only `127.0.0.1:<port>` / `localhost:<port>`;
  anything else is 403. This is the DNS-rebinding defense: a malicious page
  resolving its own domain to `127.0.0.1` would send a foreign Host and be
  rejected.
- **Cross-site rejection** - reject when `Sec-Fetch-Site` is `cross-site` /
  `same-site`; accept `same-origin` / `none`. Defense-in-depth alongside Host.
- **Per-process token** - 16 random bytes (hex) generated at server start,
  injected into the served `index.html`, required as `X-Live-Token` on the
  endpoint. Same-origin policy prevents other local pages from reading the
  token out of our document, and they cannot guess it, so they cannot scrape the
  endpoint even from `127.0.0.1`.
- **No new data exposure** - the endpoint returns exactly the sanitized
  schema-v2 object the user already imports by hand: hashed IDs, closed status
  enum, no pane content. A leak's blast radius is "count of tmux sessions and
  their coarse status," nothing more.
- **Lifecycle** - manual start, Ctrl-C stop, no auto-start, no persistence, no
  disk writes, no logging of session payloads. Entirely decoupled from WezTerm,
  tmux config, the wallpaper workflow, and the LLM-status daemon.

## Error handling

| Condition | Server | Browser |
|---|---|---|
| Collector env gate fails | 503 + closed code | "Live unavailable", stay on fixtures |
| Transient collector error on a tick | 503 + closed code | Keep last-good, mark stale, keep polling |
| Malformed / oversized / too-old payload | (n/a - client-side) | `LIVE_SNAPSHOT_INVALID`, keep last-good |
| Host / cross-site / token failure | 403 + `LIVE_REQUEST_FORBIDDEN` | Treated as failed tick |
| N consecutive failures | - | Fall back to fixtures with rejection label |
| Tab hidden | - | Pause polling; resume on visible |

## Testing

- **Endpoint handler (unit):** Host allow/deny, cross-site deny, token
  match/mismatch, success shape, `405`, and each error code - with an
  **injected fake collector** so the real tmux server is never contacted.
- **Static serving (unit):** path-traversal rejection, symlink-escape
  rejection, token injection into `index.html`, correct content types.
- **Poll controller (unit):** start/stop, tick validation success and
  rejection, keep-last-good on failure, N-failure fallback, visibility pause -
  with injected `fetch` and fake timers, extending `tests/live-adapter.test.mjs`.
- **Playwright (browser):** fixture-only plus a **mocked** `/live/snapshot` via
  route interception to drive the live UI. Per the standing rule, no test
  contacts the user's real default tmux server.
- Run: `node --test dashboard/tests/*.test.mjs`,
  `npm --prefix dashboard run test:browser`,
  `npm --prefix dashboard run routes:check`.

## Files touched

**New:**
- `dashboard/serve-live.mjs` - CLI entry (arg parsing, start server).
- `dashboard/src/live-server.mjs` - request routing, Host/token/cross-site
  checks, static file serving, snapshot handler (testable without binding a
  socket).
- `dashboard/src/live-poller.mjs` - browser poll loop + failure/visibility
  logic (testable with injected fetch/timers).
- `dashboard/tests/live-server.test.mjs`, `dashboard/tests/live-poller.test.mjs`.

**Modified:**
- `dashboard/src/live-constants.mjs` - new constants + `LIVE_REQUEST_FORBIDDEN`.
- `dashboard/src/source-controller.mjs` - add `live_polling` state + wiring.
- `dashboard/src/app.mjs` - read `window.__LIVE_TOKEN__`, mount the "Go live"
  control when present.
- `dashboard/index.html` - `__LIVE_TOKEN__` placeholder + control markup.
- `dashboard/README.md` - a clearly-fenced "Live auto-refresh (opt-in)" section
  stating that it reverses the no-server / no-polling transport boundary, with
  the mitigations, and that the export-and-import mode remains the default.

## Explicitly rejected (do not implement)

- Streaming daemon (SSE/WebSocket) or any long-lived background process.
- File-watch / File System Access API re-read (Chromium-only; also reverses
  no-reread).
- Binding to `0.0.0.0` or any non-loopback interface.
- Broadening collector discovery (PATH lookup, custom sockets, other tmux
  paths), changing the status enum, or emitting pane content / activity
  timestamps - all remain banned.
- Auto-starting the server from any other component.

## Acceptance criteria

- [ ] `node dashboard/serve-live.mjs` serves the dashboard on `127.0.0.1` and
      the browser, after "Go live", auto-updates every 5s from real tmux.
- [ ] Fixtures remain the startup default; the live control is absent unless
      served by `serve-live.mjs`.
- [ ] Every rendered live payload has passed `normalizeImportedSnapshot`;
      malformed payloads keep the last-good view instead of crashing.
- [ ] Endpoint rejects foreign Host, cross-site requests, and missing/wrong
      token with `403 LIVE_REQUEST_FORBIDDEN`.
- [ ] Polling pauses on a hidden tab and stops on toggle-off.
- [ ] No test contacts the real default tmux server; all pass.
- [ ] README documents the opt-in reversal and preserved data guarantees.
- [ ] PR linked in this ticket.
