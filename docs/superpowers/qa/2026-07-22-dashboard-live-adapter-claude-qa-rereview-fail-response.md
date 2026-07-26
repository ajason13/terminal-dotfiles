# Dashboard live-adapter QA re-review FAIL response

**Auditor verdict:** FAIL

**Builder authorization:** Blocked

**Response scope:** Evidence and specification only; no runtime implementation

The four remaining findings were accepted. They are now closed in the
authoritative design and isolated evidence artifact. Builder remains blocked
until Claude returns PASS and explicitly says “Builder may begin.”

## NB-1 — UTF-8 byte-length framing was asserted, not demonstrated

**Fixed with reproducible byte evidence.** The isolated tmux 3.7 evidence runs
the literal `#{n:pane_title}:#{pane_title}` expression and then the complete
nine-field production format against a synthetic OSC title containing `⠧`,
`✳`, and U+0085. The payload contains 13 Unicode code points but 18 UTF-8
bytes. Both hex dumps emit the ASCII prefix `18:` and preserve the following
field boundary. Exact setup commands, invocations, arithmetic, raw hex, tmux
version, and cleanup are recorded in
`2026-07-22-dashboard-live-adapter-tmux-evidence.md`.

The initial `select-pane -T` method was not accepted as evidence: tmux left the
old title in place when given a C0-bearing value. The recorded proof instead
uses a synthetic pane process emitting an OSC title, and relies only on the
successful byte-for-byte output.

## NB-2 — `start_time` scope and restart behavior were unverified

**Fixed with reproducible multi-session evidence.** The exact variable is
`start_time`, documented by the installed tmux 3.7 manual as “Server start
time.” One isolated server returned `1784773438` for all six panes across two
concurrent sessions and three windows. After killing that server, waiting two
seconds, and starting a new server on the same socket path, the value was
`1784773440`. Exact commands and raw rows are in the evidence artifact. The
server-scoped constancy and across-epoch change are both demonstrated for the
pinned tmux 3.7 target.

## NB-3 — Concurrent file selection was unspecified

**Fixed structurally.** Entry to `validating` is synchronous and precedes
creation of the sole `FileReader`. The real file input is disabled and the
import region is marked `aria-busy=true` for the full validation. In addition,
the change handler returns immediately when already validating, before reading
a file, creating another reader, clearing state, or committing a transition.
Success and failure both reset/re-enable the control and clear busy state. This
defines at most one in-flight validation and removes winner/race ambiguity,
including for programmatically dispatched change events.

## NB-4 — tmux ID regex scope was ambiguous

**Fixed explicitly.** `^tmux-[0-9a-f]{32}$` applies only to normalized sessions
with `sourceKind=tmux_oneshot`. Existing fixture-derived IDs are exempt and
unchanged. Required tests assert both sides.

## Non-blocking recommendations incorporated

- Every one of the nine raw tmux fields now maps to an exact byte-limit
  constant.
- The collector is explicitly documented as macOS/Homebrew-specific for v1.
- Imported files must be schema v2; schema v1 exists only through the internal
  fixture adapter and is rejected by file import.
- Resolved tmux binaries must be owned by root/current UID and not group/world
  writable.
- The privacy rule now distinguishes forbidden real/default-server capture
  from the committed transcript of a disposable, synthetic-only QA server.

## Verification performed

- tmux version: `/usr/local/bin/tmux`, tmux 3.7.
- Relevant short frame: `18:` followed by exactly 18 UTF-8 title bytes and LF.
- Full nine-field frame: decoded lengths `45, 10, 2, 2, 2, 1, 9, 18, 5`, with
  the 18-byte title followed unambiguously by `5:sleep` and LF.
- Multi-session run: six rows, two sessions, three windows, one unique
  `start_time`.
- Restart run: same socket path, `start_time` changed by two seconds.
- All disposable tmux servers, sockets, and temporary directories removed.
- Default tmux/WezTerm behavior and configuration were untouched.
- No dashboard runtime implementation was started.

## Remaining gate

No known blocker remains in this response. Claude must narrowly re-review NB-1
through NB-4. Builder may begin only after a PASS that explicitly states
“Builder may begin.”
