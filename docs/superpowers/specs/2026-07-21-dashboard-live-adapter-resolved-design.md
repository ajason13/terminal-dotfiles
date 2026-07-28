# Dashboard live-adapter resolved design

**Status:** Claude QA PASS; implementation authorized and under final verification

**Date:** 2026-07-22
**Supersedes:** Ambiguous implementation clauses in the 2026-07-20 discovery
spike. The spike remains the research record; this document is authoritative
for implementation and re-review.

## Scope

Add an opt-in, one-shot tmux observation exporter and explicit browser file
import. Fixtures remain the startup default. There is no tmux polling,
automatic data refresh, daemon, backend, terminal control, pane content access,
WezTerm CLI, or default-startup integration.

## Exact constants

```text
SCHEMA_V2                         2
COLLECTOR_VERSION                 1.0.0
MAX_IMPORT_FILE_BYTES             262144       (256 KiB)
MAX_SESSION_COUNT                 64
MAX_IMPORT_AGE_MS                 900000       (15 minutes)
MAX_FUTURE_SKEW_MS                120000       (2 minutes)
STALE_LABEL_TICK_MS               60000        (1 minute)
FRESH_DISPLAY_AGE_MS              300000       (5 minutes)
TMUX_TIMEOUT_MS                   3000
TMUX_MAX_BUFFER_BYTES             1048576      (1 MiB per stream)
TMUX_KILL_SIGNAL                  SIGKILL
MAX_RAW_RECORDS                   256
MAX_LENGTH_DIGITS                 7
TMUX_FIELD_COUNT                  9
MAX_SOCKET_BYTES                  4096
MAX_NAME_OR_TITLE_BYTES           4096
MAX_COMMAND_BYTES                 256
MAX_ID_FIELD_BYTES                64
MAX_DISPLAY_NAME_CODE_POINTS      80
UNKNOWN_HOLD_ANCHORS              3
SHA256_EMITTED_HEX_CHARS          32           (128 emitted bits)
```

All boundary comparisons are inclusive unless explicitly stated. A file is
accepted only when `0 < File.size <= MAX_IMPORT_FILE_BYTES`; session count is
accepted only when `0 <= sessions.length <= MAX_SESSION_COUNT`.

## Closed enums

```text
sourceKind:
  fixture | tmux_oneshot

status:
  active | thinking | waiting_for_permission | idle | error | complete | unknown

permissionState:
  not_required | requested | granted | denied | unknown

activityKind:
  observed | last_activity | last_response | unavailable

confidence:
  authoritative | medium | low | none

provenance:
  fixture_authoritative
  tmux_title_spinner
  tmux_title_thinking
  tmux_title_working
  tmux_title_action_required
  tmux_title_ready_idle
  tmux_title_static_provider
  tmux_command_candidate
```

Unknown enum values reject the complete snapshot. `unavailable` is reserved by
the normalized contract but has no valid producer among the two current source
kinds; both current source matrices reject it. A future source requires a
schema revision and review.

## Schema v2 wire shape

The collector emits exactly this key structure; additional keys reject import.

```json
{
  "schemaVersion": 2,
  "source": {
    "kind": "tmux_oneshot",
    "collectorVersion": "1.0.0"
  },
  "observedAt": "2026-07-21T12:34:56.789Z",
  "sessions": [
    {
      "id": "tmux-0123456789abcdef0123456789abcdef",
      "displayName": "Project · pane 1",
      "status": "active",
      "permissionState": "unknown",
      "confidence": "medium",
      "provenance": "tmux_title_spinner",
      "activity": {
        "kind": "observed",
        "at": "2026-07-21T12:34:56.789Z"
      }
    }
  ]
}
```

`observedAt` and every v2 activity timestamp use the exact UTC form produced by
`Date.prototype.toISOString()` (`YYYY-MM-DDTHH:mm:ss.sssZ`). For
`tmux_oneshot`, every session's `activity.at` equals top-level `observedAt`
byte-for-byte.

Schema-v1 fixtures remain unchanged on disk. Normalization gives them internal
`sourceKind=fixture`, `confidence=authoritative`, and
`provenance=fixture_authoritative`; their existing `lastActivityAt` becomes
`last_activity`, except complete becomes `last_response`.

## Compatibility matrix

Every row is exhaustive. Any combination not listed is invalid.

| Source | Status | Activity | Permission | Confidence | Provenance |
|---|---|---|---|---|---|
| fixture | active, thinking, idle, error | last_activity + `at` | not_required, granted, unknown | authoritative | fixture_authoritative |
| fixture | waiting_for_permission | last_activity + `at` | requested, denied | authoritative | fixture_authoritative |
| fixture | complete | last_response + `at` | not_required, granted, unknown | authoritative | fixture_authoritative |
| tmux_oneshot | active | observed + `at` | unknown | medium | tmux_title_spinner or tmux_title_working |
| tmux_oneshot | thinking | observed + `at` | unknown | medium | tmux_title_thinking |
| tmux_oneshot | waiting_for_permission | observed + `at` | requested | low | tmux_title_action_required |
| tmux_oneshot | idle | observed + `at` | unknown | low | tmux_title_ready_idle or tmux_title_static_provider |
| tmux_oneshot | unknown | observed + `at` | unknown | none | tmux_command_candidate |

Additional invariants:

- `observed`, `last_activity`, and `last_response` require exactly one `at`.
- `unavailable` forbids `at` and is invalid for both current sources.
- Error requires a nonempty error summary only in normalized fixture data; v2
  tmux input forbids both error status and `errorSummary`.
- v2 tmux input forbids progress, phase, lastActivityAt, generatedAt, and all
  raw-observation keys.
- Requested/denied permission is valid only with waiting status. The one-shot
  source may emit requested only, never denied.
- IDs are unique. The `^tmux-[0-9a-f]{32}$` format invariant applies only to
  sessions whose normalized `sourceKind` is `tmux_oneshot`. Existing
  fixture-derived IDs are exempt, remain unchanged, and continue to use the
  fixture contract.
- The entire snapshot rejects on the first accumulated set of invariant
  violations; no valid subset renders.

## Candidate admission and state classification

Raw panes are considered candidate LLM sessions only when at least one holds:

- the title starts with a recognized Braille/circle/ASCII spinner;
- the title matches the existing static Codex shape;
- the title starts with the static Claude `✳` marker;
- the basename of `pane_current_command` is exactly one of
  `codex`, `claude`, `gemini`, `aider`, or `opencode`.

All other panes are omitted, not labeled unknown. A candidate is classified in
this exact precedence order:

1. ASCII token `Action Required` -> waiting/requested/low.
2. ASCII token `Thinking` -> thinking/medium.
3. recognized spinner prefix -> active/medium.
4. ASCII token Working, Running, Processing, Executing, or Loading ->
   active/medium.
5. ASCII token Ready or Idle -> idle/low.
6. static Codex or Claude title -> idle/low.
7. allowlisted command candidate -> unknown/none.

Tokens are case-sensitive and bounded by start/end or a non-ASCII-letter byte.
If a pane title contains C0/C1 controls, keyword/static-title classification is
disabled; only an allowlisted command may admit it, as unknown. A generic
spinner never means thinking. Raw titles and commands are discarded after
classification.

## Exact tmux invocation

The only permitted binaries are checked in this order:

```text
/opt/homebrew/bin/tmux
/usr/local/bin/tmux
```

No PATH lookup, `command -v`, relative path, environment/config override, or
bare `tmux` fallback is allowed. The candidate must be executable and resolve
to a regular executable file. Its owner must be either root or the current UID,
and group/world write bits must be absent; otherwise it is unavailable.

This first collector is deliberately macOS/Homebrew-specific. Other platforms,
package-manager paths, custom sockets, and alternate server names are future
scope and fail closed rather than broadening executable or socket discovery.

The initial implementation targets only the current user's default tmux socket:

```text
/private/tmp/tmux-<process.getuid()>/default
```

The collector obtains that path itself, rejects nonnumeric UID construction,
and requires `lstat` to identify a Unix socket owned by the current UID. It does
not inherit or trust `TMUX`, `TMUX_PANE`, `TMUX_TMPDIR`, `HOME`, `NODE_OPTIONS`,
or parent PATH. Custom sockets are future scope.

The single process invocation is:

```js
execFile(tmuxBinary, [
  '-S', validatedSocketPath,
  'list-panes',
  '-a',
  '-F', LENGTH_PREFIXED_FORMAT,
], {
  cwd: '/',
  env: {
    PATH: '/usr/bin:/bin',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
  },
  encoding: 'buffer',
  timeout: 3000,
  maxBuffer: 1048576,
  killSignal: 'SIGKILL',
  windowsHide: true,
  shell: false,
});
```

## Exact tmux framing and parser

Delimiter splitting and tmux `q` modifiers are prohibited. tmux `q` does not
escape tabs, newlines, carriage returns, or arbitrary control bytes.

The exact nine fields are:

```text
socket_path
start_time
session_id
window_id
pane_id
pane_index
window_name
pane_title
pane_current_command
```

The compact `-F` argument is the literal concatenation below, with no separator
between framed fields:

```text
T1#{n:socket_path}:#{socket_path}#{n:start_time}:#{start_time}#{n:session_id}:#{session_id}#{n:window_id}:#{window_id}#{n:pane_id}:#{pane_id}#{n:pane_index}:#{pane_index}#{n:window_name}:#{window_name}#{n:pane_title}:#{pane_title}#{n:pane_current_command}:#{pane_current_command}
```

tmux appends exactly one LF after each expanded record. The parser operates on
the stdout `Buffer`:

1. Require `T1`.
2. For each of exactly nine fields, read 1-7 ASCII decimal length digits,
   require `:`, then consume exactly that many bytes.
3. Reject signs, whitespace, empty/nondecimal length, leading zeros except the
   single digit `0`, a length above its field limit, or incomplete bytes.
4. After field nine require exactly one LF; repeat until exact EOF.
5. Reject empty output, trailing bytes, extra/missing fields, more than 256
   records, duplicate pane IDs, or inconsistent socket/start time.
6. Decode each extracted field independently using
   `new TextDecoder('utf-8', {fatal:true})`.
7. Validate: `start_time` is `^[0-9]{1,20}$` and a positive safe integer;
   session ID `^\$[0-9]+$`; window ID `^@[0-9]+$`; pane ID `^%[0-9]+$`;
   pane index `^[0-9]+$`; socket equals the validated path; no field contains
   NUL.
8. Reject the complete collection on any structural, UTF-8, semantic, duplicate,
   or consistency failure.

Length framing remains unambiguous when names/titles contain tabs, newlines,
colons, backslashes, record magic, or control characters. Synthetic tests must
cover each case.

The tmux 3.7 behavior on which this framing depends is demonstrated byte for
byte in
`docs/superpowers/qa/2026-07-22-dashboard-live-adapter-tmux-evidence.md`.
That isolated test uses `#{n:pane_title}:#{pane_title}` with `⠧`, `✳`, and a
C1 control character and proves that `n` reports the 18 UTF-8 payload bytes,
not the 13 Unicode code points. The same artifact records the exact commands,
hex output, multi-session `start_time` evidence, restart evidence, and cleanup.

The per-field byte limits are fixed as follows:

| Field | Maximum bytes |
|---|---:|
| `socket_path` | `MAX_SOCKET_BYTES` (4096) |
| `start_time` | `MAX_ID_FIELD_BYTES` (64) |
| `session_id` | `MAX_ID_FIELD_BYTES` (64) |
| `window_id` | `MAX_ID_FIELD_BYTES` (64) |
| `pane_id` | `MAX_ID_FIELD_BYTES` (64) |
| `pane_index` | `MAX_ID_FIELD_BYTES` (64) |
| `window_name` | `MAX_NAME_OR_TITLE_BYTES` (4096) |
| `pane_title` | `MAX_NAME_OR_TITLE_BYTES` (4096) |
| `pane_current_command` | `MAX_COMMAND_BYTES` (256) |

## Collector failure policy

Output is accepted only when the child exits zero, emits no stderr, emits
nonempty stdout within the 1 MiB limit, and the entire Buffer validates.

On missing binary, rejected socket, spawn failure, timeout, signal, maxBuffer,
nonzero exit, any stderr byte, partial stdout, malformed frame, invalid UTF-8,
or invalid field, the collector:

- discards all stdout;
- writes no JSON or partial JSON to stdout;
- emits exactly one sanitized error code to stderr and exits nonzero;
- never prints an exception message/stack or raw value;
- never falls back to another parser, socket, command, or fixture.

Closed error codes:

```text
TMUX_BINARY_UNAVAILABLE
TMUX_SOCKET_REJECTED
TMUX_TIMEOUT
TMUX_OUTPUT_LIMIT
TMUX_NONZERO_EXIT
TMUX_STDERR
TMUX_FRAME_INVALID
TMUX_UTF8_INVALID
TMUX_FIELD_INVALID
TMUX_IDENTITY_COLLISION
```

Browser fixture fallback is separate and visibly disclosed.

## Stable identity

One `list-panes` call provides `socket_path` and tmux's exact `start_time`
format variable, which the tmux 3.7 manual names “Server start time.” The
isolated evidence artifact shows one value across six panes, three windows, and
two concurrent sessions, then a different value after restarting the server on
the same socket path.
Identity uses SHA-256 over these exact UTF-8 bytes:

```text
dashboard-tmux-id-v1 NUL socket_path NUL start_time NUL pane_id
```

The emitted ID is `tmux-` plus the first 32 lowercase hexadecimal digest
characters. Hashing provides stable opaque display identity, not confidentiality
against a local actor who can guess the socket. Raw socket/start time are not
emitted. A duplicate pane ID or emitted hash rejects the complete collection
with `TMUX_IDENTITY_COLLISION`; collision recovery/substitution is prohibited.

## Display-name sanitization and no-leak rule

The display name derives from window name plus pane index, never pane title.
Before output, the window name is fatal-UTF-8 decoded, normalized to NFC, has
C0/C1 control characters replaced with spaces, collapses whitespace, and trims.
An empty result becomes `Pane <index>`. A result over 80 Unicode code points is
truncated to 79 code points plus U+2026. The pane suffix is included inside the
80-code-point total.

Diagnostics and browser rejection messages contain only closed error codes,
enum labels, versions, and numeric counts. They never include filenames,
display names, title/name substrings, paths, IDs, commands, or Node error text.
Tooltips and accessible text may show only the sanitized display name and use
text nodes, never HTML. Automated fixtures are synthetic. Output captured from
a user's real/default tmux server is forbidden in tests, snapshots,
screenshots, and committed artifacts. A synthetic transcript from an isolated
disposable QA server is allowed only when it contains no user-derived names,
titles, paths, commands, or session data.

## Import staleness rules

At file selection, read `File.size` before reading/parsing content. Reject when
size is zero or above 262144 bytes.

The browser file-import path accepts only `schemaVersion === 2` collector
snapshots. Schema-v1 data is produced only by the in-process fixture adapter;
an imported schema-v1 file is unsupported and rejects to fixtures.

Let `importNow=Date.now()` and `observed=Date.parse(observedAt)`:

- reject when `observed > importNow + 120000`;
- reject when `importNow - observed > 900000`;
- accept both exact boundaries;
- accept future skew within two minutes and display age as zero until time
catches up.

After successful import, exactly one display-only 60000 ms interval updates the
age label. It never rereads files/tmux, revalidates, rejects, switches source,
or changes placement. Age labels are fresh below five minutes, aging from five
through fifteen minutes, and stale above fifteen minutes. An accepted snapshot
may become stale and remains displayed until explicit import/reset. This timer
is the only authorized interval and is not data polling; it is cleared on every
source transition and page unload.

The separately gated multi-track visual design may additionally own exactly one
Auto-mode, one-shot boundary `setTimeout`, as specified in
`2026-07-26-dashboard-multi-track-design.md`. That timeout changes only local
track artwork/placement at a six-hour boundary; it performs no file, tmux,
process, network, schema, source, or session-data polling. Manual track mode and
fatal/destroyed application state own no boundary timeout. No other interval,
timeout loop, or polling mechanism is authorized.

## Source-mode state machine

Closed states:

```text
fixtures
validating(previous = fixtures | live | rejected_fixtures)
live
rejected_fixtures
```

Initial state is fixtures. On every file selection:

1. Clear pin/focus/tooltip state and any age timer.
2. Enter validating synchronously before creating a `FileReader`; keep the
   previous complete view visible, set the file input's actual `disabled`
   property to `true`, and expose `aria-busy=true` on the import region. Do not
   mutate session DOM during validation.
3. On success, abort all previous render listeners, clear all session mounts,
   full-render the accepted live snapshot, set the live source label, start one
   age-label timer, reset the file input value, re-enable the file input, clear
   `aria-busy`, and enter live.
4. On failure, abort all previous render listeners, create a fresh fixture
   snapshot through the fixture adapter, clear all session mounts, full-render
   fixtures, show exactly “Live snapshot rejected; showing fixtures.”, reset the
   file input value, re-enable the file input, clear `aria-busy`, and enter
   rejected_fixtures.
5. Explicit reset performs the same fresh fixture render without the rejection
   notice and enters fixtures.

While state is validating, every additional file-input change handler returns
before reading the file, creating a `FileReader`, clearing state, or committing
a transition. This guard covers programmatically dispatched change events in
addition to the disabled control. Therefore at most one validation can be in
flight, and there is no first/last-writer race to resolve.

Every render owns one `AbortController`; all render-scoped listeners use its
signal and are aborted before replacement. Root/global handlers and timers have
exactly one owner. Success-to-success, success-to-failure, failure-to-success,
and repeated failure tests must prove no duplicate nodes, listeners, timers,
source labels, or pinned state.

## Unknown-state placement

Unknown does not share the existing six idle/complete anchors. Pit Stop gains a
structurally distinct subregion labeled `Unclassified hold`, with three reserved
gray `?` anchors, a dashed boundary, and text/glyph encoding independent of
color. The subregion is hidden when no unknown session exists.

The unknown pool has capacity three and uses canonical-ID sorting plus FNV-1a
preferred slot and forward circular probing. Session four and above overflow
only the unknown pool with an explicit count/detail notice; unknown never
displaces idle or complete. Existing Pit Stop capacity remains six. Total map
capacity becomes 37. Desktop/mobile tests cover 0, 1, 3, and 4 unknown sessions,
long names, focus/pinning, tooltips, contrast, reduced motion, clipping, and
overflow.

## Protected boundaries

Do not modify tmux configuration, `tmux-llm-status`, WezTerm, installers,
wallpaper workflow, default startup, existing daemon, or root CI. Never use
`capture-pane`, `display-message -a`, pane content/history, environment/full
process capture, `set-option`, `source-file`, `run-shell`, selection/switching,
send-keys, kill/control commands, WezTerm CLI, arbitrary executable paths,
shell interpolation, or imported `innerHTML`.

There is no data-polling timer, watcher, loop, daemon, fetch endpoint, implicit
file access, persistence, analytics, telemetry, or remote service. The only
authorized timers are the display-only live age-label interval and the
separately gated Auto-only visual-course boundary timeout specified above. No
other interval, timeout loop, or polling mechanism is authorized.

## Required verification

The Builder must add automated tests for every constant, enum, matrix row and
invalid combination, byte frame boundary, control character, error code,
identity case, candidate/classifier branch, privacy omission, import-time age
boundary, source transition, listener/timer teardown, unknown capacity, and
markup injection. All 28 existing fixture tests remain passing.

Parser coverage must include at least two valid `T1` records concatenated in
one synthetic Buffer, plus a multi-record duplicate-pane-ID rejection. Buffer
limit coverage must distinguish the reachable `TMUX_OUTPUT_LIMIT` result when
field maxima exceed the 1 MiB child-process buffer from the separate parser
record-count rejection exercised with smaller synthetic records.

The source-transition suite must assert that the real file input is disabled
during validation, a programmatic second change creates no second
`FileReader`, and only the original attempt can commit. It must also assert that
fixture IDs remain unchanged and exempt from the tmux-only ID regex while every
`tmux_oneshot` ID matches it.

Browser verification must cover fixture -> live -> live -> rejected_fixtures ->
live -> fixtures at 1440x900 and 390x844, with zero console warnings/errors,
correct source/age labels, no overlap/clipping, keyboard behavior, reduced
motion, contrast, and synthetic-only screenshots.

Claude's 2026-07-22 final re-review returned PASS and explicitly authorized
“Builder may begin.” Implementation remains limited to this resolved design and
its protected boundaries.
