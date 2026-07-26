# Claude final QA re-review prompt: dashboard live adapter

Paste the prompt below into the same Claude conversation and attach the three
files named under **Evidence**. If starting a new conversation, also attach the
prior source packet and prior re-review response.

---

## Role

You are the same lead adversarial QA planner and architecture auditor for the
optional local tmux session dashboard.

## Stage

Final, narrowly scoped pre-implementation re-review after the second FAIL.
Builder remains blocked. No live-adapter implementation code exists.

## Scope

Review only the four remaining findings NB-1 through NB-4 and whether their
closures introduce a contradiction with the already-approved process,
privacy, schema, identity, lifecycle, or protected boundaries. Do not reopen
closed BF-1 through BF-10 without identifying concrete contradictory evidence.

## Context

Your second review found nine original blockers closed and left four items:

1. no reproducible byte-level proof that tmux 3.7 `#{n:field}` reports UTF-8
   bytes for multibyte/control-bearing content;
2. no multi-session and across-restart proof that exact variable `start_time`
   is server-scoped and changes with the server epoch;
3. no deterministic concurrent-file-selection policy while validating;
4. ambiguous scope for the `^tmux-[0-9a-f]{32}$` ID invariant.

All four were accepted. NB-1 and NB-2 now have exact isolated commands and raw
evidence; NB-3 and NB-4 now have exact authoritative contract text. The
non-blocking precision recommendations were also incorporated.

## Acceptance criteria

- The byte artifact must show the exact `-F` expression and complete production
  format, a title containing `⠧`, `✳`, and a control character, raw hex,
  code-point/byte arithmetic, and an unshifted following field.
- The identity artifact must use exact variable `start_time`, at least two
  simultaneous sessions and multiple windows/panes, one value across all rows,
  and a different value after restart on the same explicit socket.
- During `validating`, at most one `FileReader` can exist and no overlapping
  attempt can commit, including a programmatically dispatched change.
- The tmux ID regex applies only to `tmux_oneshot`; fixture IDs stay unchanged.
- Evidence must be synthetic and isolated from the user's default tmux server.
- No implementation may begin unless this re-review passes.

## Protected boundaries

Fixtures remain the startup default. No tmux/WezTerm/config/installer/daemon/
startup changes, pane content, terminal control, data polling, watcher,
backend, network endpoint, persistence, analytics, telemetry, or remote service
is allowed. The sole future runtime process remains one opt-in read-only
`list-panes` call; the sole timer remains display-only age text.

## Relevant source contents / evidence

Attach and review:

1. `2026-07-21-dashboard-live-adapter-resolved-design.md` — authoritative
   contract, revised 2026-07-22.
2. `2026-07-22-dashboard-live-adapter-tmux-evidence.md` — exact commands, raw
   hex, multi-session rows, restart comparison, isolation, and cleanup.
3. `2026-07-22-dashboard-live-adapter-claude-qa-rereview-fail-response.md` —
   finding-by-finding closure map.

For a new conversation also attach:

4. `2026-07-21-dashboard-live-adapter-source-packet.md`.
5. Your second re-review response that returned FAIL with NB-1 through NB-4.

Treat the successful OSC/C1 sample as the byte proof. The earlier
`select-pane -T` C0 attempt did not set the requested title and is explicitly
not offered as proof.

## Verification

Check the evidence arithmetically rather than accepting its conclusion:

- decode the title payload bytes and confirm 18 bytes versus 13 code points;
- confirm the full-frame title prefix is `18:` and the next field begins
  `5:sleep` at the exact boundary;
- confirm all six first-server rows share one `start_time` across two session
  IDs and three window IDs;
- confirm the restarted server on the same socket has a different value;
- confirm the state machine disables the actual input before the reader exists
  and guards programmatic reentry;
- confirm fixture IDs are explicitly exempt from the tmux-only regex;
- confirm the evidence contains synthetic values only and records cleanup.

## Known non-goals

Do not request polling, hooks, event subscriptions, pane content/history,
process inspection, custom sockets, arbitrary tmux binaries, Linux support,
WezTerm CLI, live terminal control, authentication, persistence, telemetry,
network services, or a broader live-session lifecycle. Those remain deferred.

## Output required

Return exactly:

1. **Verdict:** PASS or FAIL.
2. **Implementation authorization:** “Builder may begin” or “Builder must not
   begin.”
3. **NB-1 through NB-4 closure audit:** table with Closed/Not Closed and exact
   evidence.
4. **Blocking findings:** severity-ranked with minimal resolution, or “None.”
5. **Contract consistency audit:** process, privacy, identity, import lifecycle,
   fixture compatibility, and protected boundaries.
6. **Missing tests or invariant edge cases:** only items caused by NB-1 through
   NB-4; label each blocking or non-blocking.
7. **Explicit sign-off status.**

Do not write implementation code. A PASS must explicitly state “Builder may
begin.”
