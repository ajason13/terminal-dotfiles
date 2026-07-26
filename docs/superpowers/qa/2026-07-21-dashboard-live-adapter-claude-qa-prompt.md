# Claude QA-planning prompt: dashboard live adapter

Paste the text below into Claude Chat and attach the two files named under
`Evidence supplied`.

---

## Role

You are the lead adversarial QA planner and architecture auditor for an optional
local visual dashboard that observes LLM sessions running under tmux/WezTerm.
Challenge the design rather than completing it or assuming its claims are true.

## Stage

Pre-implementation architecture and QA gate. No live collector, schema-v2
implementation, or manual file adapter exists yet.

## Scope

Review the proposed opt-in, one-shot tmux observation exporter, schema-v2
contract direction, and manual browser file-import boundary. Determine whether
the Builder may implement it safely and whether the specification is precise
enough to produce deterministic code and tests.

## Context

The current dependency-free dashboard is fixture-only and lives entirely under
`dashboard/`. Schema v1 requires every session to have one of six known states
and a trustworthy `lastActivityAt`. Read-only discovery found that a stateless
tmux read can identify panes and infer some present state from titles, but cannot
truthfully establish exact last activity, last response, completion, agent
errors, denied permission, progress, or phase.

The proposed next step therefore retains fixtures as the startup default and
adds:

1. A user-invoked Node CLI that performs exactly one fixed read-only
   `tmux list-panes` call through `execFile`, classifies raw observations in
   memory, discards sensitive raw fields, and writes sanitized JSON to stdout.
2. Backward-compatible schema-v2 normalization with `unknown` state, activity
   kinds (`observed`, `last_activity`, `last_response`, `unavailable`), source,
   sanitized provenance, and confidence.
3. An explicit browser file input using FileReader. The user redirects collector
   stdout to a private file, selects it manually, and repeats that workflow to
   refresh. There is no automatic file access or polling.
4. Fail-closed import: invalid live input is rejected visibly and the known
   fixture dashboard remains displayed.

One-shot inference is intentionally limited:

- spinner or exact working keyword -> `active`;
- exact `Thinking` only -> `thinking`;
- exact `Action Required` only -> `waiting_for_permission` with `requested`;
- exact Ready/Idle or recognized static provider title -> low/medium-confidence
  `idle`;
- ambiguous or unsupported -> `unknown`;
- never emit complete, error, denied permission, progress, phase, error summary,
  last activity, or last response from current tmux signals.

Unknown sessions are proposed as gray `?` cars in Pit Stop, labeled “State
unavailable” and “Observed at,” never “Last active.”

## Acceptance criteria to audit

- Fixture mode remains the default and all current tests continue passing.
- Collector executes exactly one allowlisted `tmux list-panes` command with
  constant arguments and no shell.
- Collector never invokes WezTerm CLI or controls/modifies tmux.
- Stable IDs are deterministic for one tmux server epoch and differ across
  epochs, while raw socket identity is not emitted.
- Raw titles may exist only in collector memory. Output contains no cwd, PID,
  TTY, socket path, start command, full command line, history, environment, or
  pane content.
- Generic spinners never claim thinking. Only exact Action Required claims a
  requested permission wait.
- No current source invents complete, error, denied, progress, phase, error
  summary, last activity, or last response.
- Imported JSON is untrusted, size/count bounded, fully validated, memory-only,
  and rendered only through text nodes.
- Invalid, malformed, oversized, unsupported, or stale input fails visibly and
  retains fixtures; no partial live snapshot renders.
- UI exposes source mode, observation time, staleness, confidence/unavailable
  meaning, and accessible unknown-state text without turning into session cards.
- Unknown sessions have deterministic nonoverlapping placement and explicit
  overflow at desktop/mobile widths.
- Refresh remains explicit; no timer, watcher, loop, daemon, background process,
  fetch endpoint, or implicit filesystem access exists.
- Tests cover classifier/parser records, command allowlist and denylist,
  identity, privacy, schema invariants, markup injection, staleness, fallback,
  unknown placement/overflow, keyboard access, reduced motion, and desktop/mobile
  presentation.

## Protected boundaries

The implementation must not modify:

- `tmux/tmux.conf`;
- `tmux/tmux-llm-status`;
- WezTerm configuration/modules;
- installers or wallpaper workflows;
- default terminal startup;
- the existing LLM-status daemon;
- root CI without separate approval.

It must never use `capture-pane`, `display-message -a`, pane/scrollback content,
environment capture, full process inspection, `set-option`, `source-file`,
`run-shell`, pane/window selection, switching, send-keys, kill/control commands,
WezTerm CLI, arbitrary executable paths, shell interpolation, or `innerHTML` for
imported values.

## Evidence supplied

Review both attached files as authoritative input:

1. `2026-07-20-dashboard-live-adapter-spike.md` — approved research outcome,
   signal-confidence policy, proposed architecture, privacy boundary, and next
   task.
2. `2026-07-21-dashboard-live-adapter-source-packet.md` — focused current-source
   contents and observed runtime evidence.

There is no implementation diff to audit. Treat claims about future behavior as
requirements that must be made exact enough for deterministic tests.

## Verification context

The existing fixture dashboard has 28 passing Node tests plus previously
verified 1440x900 and 390x844 browser layouts, keyboard pin/Escape behavior,
reduced motion, contrast, and zero console errors. Those results cover the
fixture implementation only, not the proposed live boundary.

## Known non-goals

- polling or automatic refresh;
- live last-response or last-activity tracking;
- completion/error inference;
- transcript, prompt, completion, pane-content, or history access;
- terminal control;
- WezTerm integration;
- background daemon, backend, network service, persistence, authentication,
  telemetry, analytics, remote logging, or cloud services;
- changes to the existing tmux/LLM-status workflow.

## Required adversarial checks

Attack at least these questions:

1. Is schema v2 precise about every allowed/forbidden combination of status,
   activity kind, timestamp, permission state, confidence, source, and
   provenance?
2. Are file byte limit, session-count limit, staleness thresholds, timestamp
   rules, enum values, and whole-snapshot rejection rules exact enough to test?
3. Can tmux format output safely represent tabs/newlines/control characters in
   user-controlled titles/window names without parser ambiguity or leakage?
4. Can a single `list-panes` format provide every identity input, including a
   server epoch/socket identity, without a second command?
5. Can PATH/executable resolution, environment variables, maxBuffer, timeouts,
   signals, stderr, nonzero exit, partial stdout, or missing tmux violate the
   one-command/security boundary?
6. Can hashing a predictable socket path meaningfully protect it, and are hash
   algorithm, truncation, canonical input, and collision handling specified?
7. Can invalid import leave mixed fixture/live DOM, duplicated listeners,
   incorrect source labels, or stale pinned state?
8. Does placing unknown sessions in the shared Pit Stop create capacity or
   semantic ambiguity with idle/complete sessions? Is overflow deterministic?
9. Can window names, diagnostics, accessible text, tooltips, error messages, or
   test snapshots leak raw sensitive fields?
10. Does “stale input fails visibly” conflict with retaining fixtures, and is the
    UX distinction between rejection, warning, and accepted-but-stale exact?

Distinguish blockers from reasonable implementation details and future
stateful-integration work. For each blocker, give the minimal specification
change needed for re-review.

## Output required

Return exactly these sections:

1. **Verdict:** PASS or FAIL.
2. **Implementation authorization:** “Builder may begin” or “Builder must not
   begin.”
3. **Blocking findings:** numbered, severity-ranked, each tied to a requirement
   or protected boundary and followed by a minimal resolution.
4. **Non-blocking recommendations.**
5. **Missing tests and edge cases:** table with risk/criterion and automated vs
   manual classification.
6. **Contract-invariant audit:** enumerate invalid status/activity/permission/
   confidence/source combinations that tests must reject.
7. **Protected-boundary audit:** process execution, privacy, terminal isolation,
   fallback, and default-startup isolation.
8. **Explicit sign-off status:** exact remaining conditions or confirmation that
   the Builder may begin.

Do not write implementation code. Do not broaden the scope to polling or hooks.
