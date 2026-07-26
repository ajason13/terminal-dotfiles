# Dashboard live-adapter discovery spike

**Status:** Research complete; architecture approved; implementation gated
**Date:** 2026-07-20
**Scope:** Optional, one-shot, read-only tmux observation only

## Decision

The next implementation may add an explicitly invoked, one-shot tmux
observation exporter and manual browser file import. It must not add polling,
terminal control, a daemon, a backend endpoint, automatic refresh, or default
startup integration.

Fixtures remain the startup default. Live observation is user-selected and
must fail back to fixtures visibly.

Schema v1 cannot truthfully represent current tmux observations because it
requires a known six-state status and `lastActivityAt`. The approved direction
is compatible schema v2 support for unknown state, observation time,
unavailable activity, sanitized provenance, and confidence. Observation time
must never be relabeled as last activity or last response.

## Observed facts

- `FixtureSessionAdapter` is the only adapter and `app.mjs` reads it once.
- tmux is the authoritative session/window/pane hierarchy in this setup.
- `tmux-llm-status` reduces title/command observations to active, present, and
  waiting, then writes window/global options every second.
- A one-shot `tmux list-panes` exposes stable-for-server-lifetime IDs, names,
  titles, commands, paths, and pane lifecycle fields.
- Observed recognized LLM panes reported `node` as their current command.
- `@llm_status` is aggregated and can disagree with a later pane-title read.
- `window_activity` and `session_activity` are not trustworthy pane
  last-response timestamps; existing option writes may contaminate them.
- Plain `wezterm cli list` may auto-start a mux server. `--no-auto-start` could
  not connect here, so WezTerm CLI is not an approved source.
- `display-message -a` exposes buffers and other sensitive state and is banned
  from the collector.

## Signal-confidence policy

| Meaning | Allowed observation | Confidence | Policy |
|---|---|---:|---|
| Stable ID | hashed socket identity + server epoch + tmux IDs | Medium | Server-lifetime only; never expose socket |
| Display name | window name plus pane index/code | Medium | Mutable and potentially sensitive |
| Active | spinner or exact working keyword | Medium | Inferred |
| Thinking | exact `Thinking` title | Medium-low | Generic spinner is never thinking |
| Permission wait | exact `Action Required` | Medium-low | May infer requested only |
| Idle | exact Ready/Idle or recognized static provider title | Low-medium | Carry confidence |
| Unknown | unsupported or ambiguous title | High | Prefer unknown over guessing |
| Complete, error, denied | no stateless source | None | Never emit |
| Last activity/response | no trustworthy stateless source | None | Unavailable |
| Progress, phase, error summary | no source | None | Omit |

Pane disappearance, zero exit, Ready, or snapshot time must not be presented as
completion or last response. Sampling more often would not create that truth.

## Approved architecture

```text
explicit user command
        |
        v
OneShotTmuxReader -- one fixed execFile(tmux, list-panes, ...)
        |
        v
TmuxObservationNormalizer -- classify, hash identity, discard raw fields
        |
        v
sanitized schema-v2 JSON on stdout
        |
        v
user redirects to a private file and selects it in the browser
        |
        v
ManualSnapshotAdapter -- FileReader, validation, size bound, memory only
        |
        +-- valid: render with confidence and staleness
        +-- invalid: visible rejection notice and retained fixtures
```

The collector is a separate opt-in Node CLI. Browser rendering never executes
tmux. It uses `execFile` with constant arguments, no shell, and one selected
default/current tmux socket. It writes JSON to stdout only. Stderr contains
sanitized versions, counts, confidence totals, unknown totals, and omission
reasons only.

Raw titles may be classified in memory but are never persisted. Output excludes
cwd, PID, TTY, socket, start command, full command line, history, environment,
and pane content.

## Schema-v2 presentation

- Retain schema-v1 fixture compatibility.
- Add status `unknown`.
- Replace mandatory timestamp semantics with activity kinds `observed`,
  `last_activity`, `last_response`, and `unavailable`.
- Include `at` only when the activity kind supports it.
- Add sanitized source/provenance codes and confidence.
- One-shot observations use `observed` or `unavailable`; they never claim last
  activity or last response.
- Unknown sessions use a gray `?` in Pit Stop with “State unavailable” and
  “Observed at” text, never “Last active.”
- Trusted fixture or future event sources may still represent complete and last
  response.
- The UI shows source, observation time, and staleness unobtrusively.

## Privacy and security boundaries

Never use `capture-pane`, `display-message -a`, pane content, environment, full
process inspection, `set-option`, `source-file`, `run-shell`, selection,
switching, send-keys, kill/control commands, WezTerm CLI, arbitrary executable
paths, shell interpolation, or `innerHTML` for imported values.

The JSON file may contain window-derived task names. It is sensitive and must
not be committed. Imported JSON is untrusted, size/count bounded, fully
validated, and rendered through text nodes.

## Refresh and failure

Refresh is manual: rerun the collector, replace the private file, and reselect
it. There is no timer, watcher, loop, daemon, fetch endpoint, or implicit file
access.

Malformed, oversized, unsupported, or stale input fails visibly. Rejection
keeps fixtures visible with “Live snapshot rejected; showing fixtures.” No
partial live snapshot renders.

## Next implementation task

**Implement an opt-in one-shot tmux observation exporter and manual file
adapter; no polling.**

Acceptance criteria:

- Fixture mode remains default and all current tests pass.
- One collector invocation performs one fixed read-only `tmux list-panes` call
  through `execFile`.
- IDs are stable across ordering/repeated reads of one epoch and differ across
  epochs.
- Generic spinner maps to active; only exact Thinking maps to thinking; only
  exact Action Required maps to permission requested.
- Unknown/unavailable renders without invented timestamps.
- The collector never emits complete, error, denied, progress, phase,
  errorSummary, last activity, or last response from current signals.
- Sanitized output contains none of the forbidden raw fields.
- Manual import is explicit, memory-only, validated, and size/count bounded.
- Invalid input retains fixtures and shows the rejection notice.
- Tests cover parser/classifier records, command allowlist/denylist, identity,
  privacy, validation, markup injection, staleness, fallback, unknown layout,
  keyboard access, reduced motion, and desktop/mobile presentation.
- tmux, `tmux-llm-status`, WezTerm, installers, wallpaper, default startup, and
  root CI remain unchanged without separate approval.

Implementation is blocked until a new adversarial QA review approves this
expanded process/privacy/schema boundary.

## Weak claims and exceptions

- Title formats are mutable, provider-specific, and user-controlled.
- The sample covered one tmux server at one point in time.
- Option-write contamination still needs an isolated proof, but current
  activity values are unsuitable regardless.
- Pane IDs are server-lifetime only.
- No trusted source was found for exact completion, errors, denial, last
  activity, or last response.
- Native agent model/reasoning pins were not exposed by the runtime; no
  substitution is claimed.
- Coordinator persistence raced between two delegated agents; the lead
  architect reconciled and preserved the final approved artifact.

No Notion page applies to this one-off companion.
