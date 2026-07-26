# Claude QA re-review prompt: dashboard live adapter

Paste the text below into the same Claude conversation. Attach the resolved
design and FAIL response named under `Evidence`.

---

## Role

You are the same lead adversarial QA planner and architecture auditor for the
optional local tmux session dashboard.

## Stage

Follow-up pre-implementation re-review after your ten blocking findings. Builder
remains blocked and no implementation code exists.

## Scope

Re-review only the ten blocker closures and any cross-cutting contradiction they
create in the process, privacy, schema, parsing, identity, lifecycle,
accessibility, capacity, or protected boundaries. Do not broaden into polling,
hooks, or full live lifecycle tracking.

## Prior verdict

You returned FAIL and “Builder must not begin” with BF-1 through BF-10 covering:

1. conflicting staleness behavior;
2. missing enums/compatibility matrix;
3. missing numeric limits;
4. ambiguous tmux framing;
5. unproven single-call server epoch;
6. unspecified execFile hardening;
7. unspecified/overstated hashing;
8. undefined mixed-source lifecycle;
9. unknown-state capacity ambiguity;
10. title/name leakage.

All ten were accepted and resolved in specification text. No runtime code was
changed.

## Evidence

Review these attached files:

1. `2026-07-21-dashboard-live-adapter-resolved-design.md` — authoritative
   implementation contract superseding ambiguous clauses in the discovery
   spike.
2. `2026-07-21-dashboard-live-adapter-claude-qa-fail-response.md` — finding-by-
   finding resolution and verification.

The previously supplied source packet remains current. If this is a new chat,
also attach `2026-07-21-dashboard-live-adapter-source-packet.md`.

## Required checks

- Confirm BF-1 through BF-10 are each closed with deterministic values and no
  internal contradictions.
- Audit the exact schema matrix, especially reserved `unavailable`, source-v1
  fixture normalization, forbidden tmux combinations, and timestamp equality.
- Audit byte-length framing for zero length, leading zeros, embedded LF/control
  bytes, fatal UTF-8, partial/trailing data, field limits, and record count.
- Confirm `socket_path` and `start_time` from one list-panes call satisfy the
  identity requirement without leaking in output.
- Audit absolute binary/socket validation, environment isolation, timeout,
  maxBuffer, stderr/nonzero/partial-output behavior, and sanitized error paths.
- Audit whether the UI-only minute interval is sufficiently isolated from data
  refresh and reliably torn down.
- Audit every state-machine transition for mixed DOM, listener/timer duplication,
  pinned state, source labels, and fixture fallback.
- Audit unknown candidate admission, the three-anchor Unclassified hold,
  independent overflow, semantic distinction, accessibility, and mobile layout.
- Identify any new blocker introduced by exact constants or closed enums.

## Protected boundaries

Fixtures remain default. No tmux/WezTerm/config/installer/daemon/startup changes,
pane content, terminal control, data polling, watcher, backend, fetch endpoint,
persistence, telemetry, or remote service is allowed. The only timer is the
display-only age label interval.

## Output required

Return exactly:

1. **Verdict:** PASS or FAIL.
2. **Implementation authorization:** “Builder may begin” or “Builder must not
   begin.”
3. **Blocking findings:** severity-ranked with minimal resolution, or “None.”
4. **Finding closure audit:** table for BF-1 through BF-10 with Closed/Not Closed
   and evidence.
5. **Non-blocking recommendations.**
6. **Missing tests or invariant edge cases.**
7. **Protected-boundary audit.**
8. **Explicit sign-off status.**

Do not write implementation code. A PASS must explicitly state “Builder may
begin.”
