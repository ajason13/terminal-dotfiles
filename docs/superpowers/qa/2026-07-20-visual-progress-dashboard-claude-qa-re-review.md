# Claude QA Re-review: Visual Progress Dashboard

## Role

You are the independent lead QA architect performing a focused follow-up review
of a pre-implementation visual dashboard.

## Stage

Follow-up to your initial FAIL. No runtime implementation or code diff exists.
Builder remains blocked.

## Scope

Re-review the three blocking findings and their cross-cutting effects on data
validation, placement/capacity, accessibility, contrast, and verification. Read
the complete updated contents supplied with this chat:

1. `docs/superpowers/specs/2026-07-19-visual-progress-dashboard-design.md`
2. `docs/superpowers/qa/2026-07-19-visual-progress-dashboard-source-packet.md`
3. This re-review prompt.

## Context

The dashboard remains an optional, dependency-free, fixture-only top-level
`dashboard/` companion. It does not integrate with or change tmux, WezTerm,
terminal startup, installers, wallpapers, status daemons, CI, processes, or
network services. The first review returned FAIL with B1 route capacity
ambiguity, B2 ambiguous invalid progress handling, and B3 no contrast verifier.

## Findings and implemented documentation response

### B1: Route terminology and capacity

Resolved by stating that ascent/switchbacks were treatments, not zones. Active
and thinking share exactly 16 route anchors, four per named segment. Every
stationary zone has six bays. The supported envelope is <=24 total, <=16 route,
and <=6 for each parked state. The canonical fixture is 6 active, 6 thinking,
and 3 per parked state. Exact progress/hash selection, FNV-1a-32 fallback,
canonical-ID ordering, forward circular probing, N+1 overflow, and rail
retention tests are specified.

### B2: Invalid progress

Resolved by removing clamping. Missing progress is valid and hashes by ID. A
present value must be a number, finite, and within inclusive 0..1. `NaN`, both
infinities, strings, -0.01, and 1.01 fail the entire snapshot visibly. Exact
boundary and negative-path tests are specified.

### B3: Contrast verification

Resolved with solid CSS design tokens and a dependency-free Node WCAG luminance
test: text/state glyph pairs must reach 4.5:1, while focus indicators and
meaningful non-text boundaries must reach 3:1 against adjacent colors. A manual
desktop/mobile audit covers normal, hover, focus, selected, error, and overflow.

## Additional accepted recommendations

- Normal motion is verified by computed animation name/play state, not pixels.
- Missing progress uses named FNV-1a-32.
- Permission invariants disallow requested/denied on non-waiting statuses.
- Collision tie-break, malformed timestamp, overflow rail-detail, and exact
  capacity tests are named.
- Accessible text is split into concise full-name/state/location `aria-label`
  plus ordered applicable `aria-describedby` detail and gets a VoiceOver sanity
  check with the longest fixture.
- The loopback preview is opt-in and never auto-started.
- Final IP review checks coordinates, timings, asset names, and external URLs.

## Protected boundaries

All original protected boundaries remain unchanged. Absence of live integration
is intentional. Do not ask for implementation as a condition of this planning
sign-off; judge whether the revised contract is implementation-ready and
testable.

## Relevant source contents or focused diff

Changed artifacts only:

- `docs/superpowers/specs/2026-07-19-visual-progress-dashboard-design.md`
- `docs/superpowers/plans/2026-07-19-visual-progress-dashboard.md`
- `docs/superpowers/qa/2026-07-19-visual-progress-dashboard-source-packet.md`
- this new re-review prompt

There is no runtime diff. Treat the supplied updated design and source packet as
authoritative; the summary above is a finding-to-resolution map.

## Verification

Confirm that the specified arithmetic and N+1 tests prove the stated capacity,
strict progress tests cannot fail open, contrast checks cover the named
criterion without a dependency, and the accepted recommendations remain
consistent with the protected scope. Identify only concrete remaining blockers;
separate optional hardening and future work.

Documentation verification already performed:

- `git diff --check -- docs/superpowers` -> PASS.
- A focused text sweep found no remaining clamping policy or stale pending-gate
  claim; historical `route/ascent`/`route/switchbacks` wording appears only in
  the explicit clarification that they are not locations.
- No `dashboard/` runtime directory exists; implementation has not started.

## Known non-goals

Live collection/control, terminal integration, cards/chat/transcripts, network
services, persistence/auth/telemetry, dependencies/frameworks, installer/CI
integration, unlimited capacity, and copied or branded visuals remain excluded.

## Output required

Return exactly:

1. **Verdict:** `PASS` or `FAIL`.
2. **Implementation authorization:** `Builder may begin` or `Builder must not begin`.
3. **Blocking findings:** severity ordered with evidence and minimal resolution,
   or `None`.
4. **Non-blocking recommendations.**
5. **Missing tests and edge cases:** each labeled automated, screenshot, or manual.
6. **Protected-boundary audit:** isolation, live integration, network/process,
   and IP.
7. **Explicit sign-off status:** one paste-ready sentence.

## Recorded re-review result

**Verdict:** PASS

**Implementation authorization:** Builder may begin.

**Blocking findings:** None.

> PASS — all three original blockers (route/pool capacity arithmetic, strict
> fail-visible progress validation, and dependency-free contrast verification)
> are resolved with concrete, testable specifications; Builder may begin
> implementation per the plan, and the listed non-blocking items should be
> tracked as follow-up polish rather than gating conditions.
