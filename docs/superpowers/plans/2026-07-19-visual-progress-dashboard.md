# Visual Progress Dashboard Implementation Plan

**Status:** POST-IMPLEMENTATION REVISION COMPLETE / VERIFIED WITH ONE MANUAL-ONLY RESIDUAL

**Goal:** Build the approved fixture-only, original mountain-pass progress
dashboard as an optional top-level `dashboard/` companion.

**Architecture:** Dependency-free HTML, CSS, inline SVG, and vanilla ES modules.
One immutable fixture adapter boundary feeds normalized snapshots to a DOM-only
renderer. Deterministic map allocation and accessible text are pure/testable.

**Authoritative design:**
`docs/superpowers/specs/2026-07-19-visual-progress-dashboard-design.md`

**Live-adapter spike:**
[`2026-07-20-dashboard-live-adapter-spike.md`](../specs/2026-07-20-dashboard-live-adapter-spike.md)
- research outcome approved; implementation remains deferred. Schema v1 cannot
truthfully render the available tmux/WezTerm signals. Fixtures remain the
default, and any schema-v2/manual-import work requires separate approval.

## Ownership and gate

- [x] `deep-researcher`: repository/reference/integration research, read-only.
- [x] `lead-architect`: approve visual/data architecture and protected scope.
- [x] `workflow-coordinator`: discover durable paths and Notion applicability.
- [x] `lead-architect`: persist approved artifacts after two coordinator write
  invocations stalled without filesystem output; this exception is recorded.
- [x] User: submit the initial QA prompt, design, and source packet in Claude
  Chat and return the complete verdict.
- [x] `lead-architect`: record the FAIL and disposition all three blockers.
- [x] User: submit the updated design, source packet, and focused re-review
  prompt in Claude Chat and return the complete verdict.
- [x] `lead-architect`: approve the re-review PASS with no blockers and accept
  all four non-blocking clarifications.
- [x] `builder`: complete the authorized implementation and verification.
- [x] `workflow-coordinator`: record verification, residual risk, adapter seam,
  and next owner.

No relevant Notion task/page was discovered. Do not create or update Notion.

## Protected boundaries

- Create runtime code only under `dashboard/`.
- Do not modify README, installers, terminal startup, `tmux/`, `wezterm/`,
  wallpapers, LLM status/daemon, CI, or existing user changes.
- Fixtures only; no live terminal/process data, commands, polling, timers used as
  polling, control, network APIs/services, persistence, auth, analytics, or
  remote logging.
- No package manifest, dependency, framework, backend, copied reference code,
  branded assets, or protected track/car treatment.

## Task 1: QA-planning gate (`lead-architect` + user)

- [x] Create focused source packet.
- [x] Create self-contained Claude QA-planning prompt.
- [x] Supply both files and the approved design to Claude Chat.
- [x] Record FAIL with three blockers: route capacity terminology, invalid
  progress policy, and missing contrast verification.
- [x] Resolve B1 with a shared 16-slot route pool, four slots per named segment,
  six bays per stationary zone, a stated 24-session envelope, and exact tests.
- [x] Resolve B2 by rejecting every present non-number, non-finite, or
  out-of-range progress value while hashing only missing progress.
- [x] Resolve B3 with dependency-free WCAG contrast-token tests and a named
  manual contrast audit.
- [x] Accept the seven non-blocking recommendations as focused tests/clarity.
- [x] Create focused Claude re-review prompt.
- [x] Obtain re-review PASS and explicit `Builder may begin` authorization.

The gate passed. **Builder may begin.**

## Task 2: Contract, fixtures, and deterministic layout (`builder`)

**Create:**
`dashboard/src/session-contract.mjs`, `dashboard/src/fixture-adapter.mjs`,
`dashboard/src/fixture-sessions.mjs`, `dashboard/src/track-layout.mjs`, and
`dashboard/tests/dashboard.test.mjs`.

- [x] Implement the exact six-state and permission enums and snapshot contract.
- [x] Validate required fields, duplicate IDs, error/waiting invariants, and
  timestamps; any invalid field on any session invalidates the whole snapshot
  visibly. Reject present progress unless it is finite and within 0..1.
- [x] Allow duplicate display names. Assign unique deterministic map codes
  `S01` through `SNN` by canonical stable-ID sort and include each code on the
  car, rail, and concise accessible label.
- [x] Build deterministic labels and activity ages from snapshot `generatedAt`.
- [x] Define the 16-slot shared route pool, four slots per named segment, six
  Service Bay slots, six Permission Checkpoint slots, and one shared six-bay Pit
  Stop pool for idle/complete, using FNV-1a-32 fallback, canonical-ID circular
  probing, and explicit overflow.
- [x] Add the fixed canonical fixture: 6 active, 6 thinking, and 3 per parked
  state.
- [x] Test all mappings/invariants; malformed timestamps/progress; exact
  capacity arithmetic; collision/reorder behavior; N+1 overflow with complete
  detail-readout coverage; 24 canonical visual-regression fixtures; the revised
  34-session total capacity and N+1 pool overflow; duplicate-name map codes; one
  invalid non-progress field in
  a mixed set; and long-name preservation.

## Task 3: Full-screen visual and interaction (`builder`)

**Create:** `dashboard/index.html`, `dashboard/styles.css`,
`dashboard/src/app.mjs`, and `dashboard/src/render-dashboard.mjs`.

- [x] Draw the original four-segment SVG route and four stationary zones.
- [x] Render native car buttons at deterministic anchors with state-specific
  text, glyph/pattern/silhouette, tooltip/readout counterpart, and visible focus.
- [x] Implement pointer/focus readout, Enter/Space pinning, and Escape clearing.
- [x] Replace the former status rail with four stacked spatial zones while
  retaining semantic labels and details without duplicate tab stops.
- [x] Implement desktop/mobile layouts, 44px controls, wrapping names, bounded
  rail scrolling, and no horizontal overflow.
- [x] Animate only active/thinking nested bodies and fully disable optional
  motion/transitions under reduced motion.
- [x] Render invalid snapshots and capacity overflow visibly.

## Task 4: Local handoff and focused verification (`builder`)

**Create:** `dashboard/README.md` and optionally retained evidence under
`dashboard/tests/screenshots/`.

- [x] Document an independent loopback-only local preview command and unit test
  commands; state that no terminal integration occurs.
- [x] Run `node --check` on every `.mjs` file.
- [x] Run `node --test dashboard/tests/*.test.mjs`.
- [x] Record build/lint/type checks as N/A where no toolchain exists.
- [x] Run browser checks at 1440x900 and 390x844, normal and reduced motion.
- [x] Assert nonblank framing, route/pit state placement, unique in-map bounds,
  no clipping/overflow, long-name behavior, and animation policy.
- [x] Test CSS color tokens with WCAG luminance math: 4.5:1 text/glyph and 3:1
  focus/non-text boundaries.
- [x] Visually inspect contrast and presentation in the retained desktop/mobile
  screenshots, including normal, pinned, error, and overflow treatments.
- [ ] **Manual-only residual:** sanity-check the longest accessible text with
  VoiceOver. This environment could not execute the read-aloud audit.
- [x] Capture desktop and mobile screenshots.
- [x] Run existing shell syntax/ShellCheck, five shell suites, manifest, and Lua
  checks. Neovim headless remains unrun because `tree-sitter` CLI is missing.

## Task 5: Boundary audit and coordination closeout

- [x] Confirm the diff contains no `fetch`, `XMLHttpRequest`, `WebSocket`,
  `EventSource`, `sendBeacon`, analytics, `child_process`, tmux/WezTerm imports,
  process polling, `setInterval`, dependency, package, daemon, or remote service.
- [x] Confirm no protected existing file changed and unrelated dirty work is
  preserved.
- [x] Confirm no reference coordinates, timings, asset names, or external asset
  URLs were carried into the implementation.
- [x] `lead-architect` reviews implementation against this plan.
- [x] `workflow-coordinator` records exact commands/results, screenshot paths,
  remaining manual-only risks, future read-only adapter seam, and next owner.

## Current evidence and exceptions

- Discovery found no existing web stack or relevant Notion task.
- Public reference review used primary GitHub sources and established a strict
  no-copy/no-brand boundary.
- Worktree already contains modified README/installers/anime manifest and an
  untracked `codex/` tree; they belong to the user.
- Hyphenated native agent names are unsupported by the orchestration API.
- Runtime model/reasoning pins were not exposed or confirmed; no substitution
  is claimed.
- Claude CLI is unavailable on the user's free plan, so the user is next owner
  for any future manual Claude Chat review.
- Claude re-review returned PASS with no blockers. The initial FAIL, all three
  blocker resolutions, and all four accepted non-blocking clarifications are
  dispositioned in the durable artifacts.

> PASS — all three original blockers (route/pool capacity arithmetic, strict
> fail-visible progress validation, and dependency-free contrast verification)
> are resolved with concrete, testable specifications; Builder may begin
> implementation per the plan, and the listed non-blocking items should be
> tracked as follow-up polish rather than gating conditions.

Next owner: user/maintainer for the optional VoiceOver sanity check and
commit/review.

## Required final confirmations

- [x] The dashboard is optional, self-contained, independently removable, and
  does not change default WezTerm/tmux behavior.
- [x] Live tmux/WezTerm integration is deferred.

## Initial verification evidence — 2026-07-20

- All dashboard `.mjs` files passed `node --check`.
- `node --test dashboard/tests/dashboard.test.mjs`: 25 tests, 25 pass, 0 fail;
  final duration 294.346372ms.
- Desktop browser, 1440x900: 24 cars and 24 rail rows; 24 unique labels and
  descriptions; no bounding-box overlaps; all cars in map; document overflow
  0; active/thinking animations running; parked animations none; zero console
  errors.
- Mobile browser, 390x844: 24 cars/24 rows; no overlap or out-of-map car; minimum
  target 46x46; document overflow 0; map first; long name visible; rail scrolls.
- Reduced motion: all car animations `none` and relevant transitions `0s`.
- Keyboard: focus tooltip visible; Enter pins car and rail with `aria-pressed`;
  Escape clears.
- Retained and visually inspected screenshots:
  `dashboard/tests/screenshots/desktop.png` (1440x900) and
  `dashboard/tests/screenshots/mobile.png` (390x844). Both are nonblank,
  correctly framed, and free of clipping/overlap; thinking cars are violet and
  labels remain upright.
- `bash -n` PASS; ShellCheck PASS; five existing shell suites PASS using
  escalated temporary directories; background Lua tests PASS;
  `check-manifest-paths` PASS with 59 entries.
- Neovim headless test UNRUN because tree-sitter CLI is missing. This is a
  residual environment gap, not evidence of a dashboard regression.
- Build, package lint, and typecheck: N/A for this zero-build app with no package
  toolchain.
- Boundary scan clean: no `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`,
  `sendBeacon`, `child_process`, `setInterval`, `setTimeout`, tmux, WezTerm,
  process access, or HTTP URLs in runtime; no packages, lockfiles, dependencies,
  or external asset URLs. Only `dashboard/` runtime is new; documentation is
  approved coordination scope.
- Preview/browser processes were stopped and `.playwright-cli` was removed.
- Manual-only residual: VoiceOver read-aloud sanity could not run here;
  automated accessibility names and the browser semantic snapshot passed.
- Future seam remains a separately approved read-only `SessionAdapter`; no live
  adapter was implemented.
- No Notion sync applies because no relevant existing page was supplied or
  discovered.
- Builder delegation recovered the native `builder` name. Runtime model and
  reasoning effort were not exposed or confirmed; no substitution is claimed.

## Post-implementation naming and mapping revision — 2026-07-20

### Current presentation and interaction contract

- The status rail was removed. Its former right-side area is now four stacked
  spatial zones, in exact order: On Track, Service Bay, Permission Checkpoint,
  and Pit Stop. Obsolete runtime zone names were removed.
- On Track contains accessible, non-button active/thinking counts, with distinct
  glyph, pattern, and color treatment. The canonical counts are six active and
  six thinking. It duplicates no cars; active/thinking remain only on the route.
- Pit Stop combines idle and complete sessions in one deterministic six-bay
  pool. Canonical stable-ID ordering and circular probing allocate three idle
  plus three complete without overlap; the next session overflows explicitly.
- Total supported capacity is 34: 16 route anchors, six Service Bay slots, six
  Permission Checkpoint slots, and six shared Pit Stop bays.
- The route uses widened anchors spanning `x=150..850` and 52px cars. Only
  `active` and `thinking` appear on the route. Each parked session renders once,
  in its matching pit zone.
- Exact browser-local timestamp and timezone appear in semantic `<time>` text,
  the detail readout, and tooltip. Complete sessions use `Last response`; all
  other states use `Last active`. Snapshot-relative age remains visible.
- Pointer and keyboard focus update the readout. Enter/Space pins the car and
  detail; Escape clears the pin.
- `aria-live` is deliberately absent so pointer movement does not create noisy
  hover announcements. Semantic names/descriptions remain available.
- Pit tooltip clipping was corrected.
- The companion remains optional, self-contained, and fixture-only. Live
  tmux/WezTerm integration remains deferred.

### Revision verification evidence

- All dashboard `.mjs` files passed `node --check`.
- `node --test dashboard/tests/dashboard.test.mjs`: 28 tests, 28 pass, 0 fail.
- Desktop browser at 1440x900: 24 car buttons total - 12 route, three Service
  Bay, three Permission Checkpoint, and six Pit Stop. On Track contains zero
  buttons. Zones are ordered correctly, with no car overlap and no horizontal
  or vertical overflow; console reports zero errors or warnings.
- Mobile browser at 390x844: map first with four stacked zones below; Pit Stop
  contains six nonoverlapping cars; no out-of-bounds car or horizontal overflow;
  every control is 52x52.
- Normal motion: `active-nudge` and `thinking-drift` run only for active and
  thinking; every parked car has no animation.
- Reduced motion: all car animations are `none` and relevant transitions are
  zero seconds.
- Exact active and complete timestamps remain verified in browser-local PDT,
  including `Last response` for the complete session in Pit Stop and the
  snapshot-relative age.
- Keyboard behavior passed: focus shows detail, Enter pins the car/readout with
  `aria-pressed`, and Escape clears it.
- Screenshots were captured and visually inspected:
  `dashboard/tests/screenshots/desktop.png`,
  `dashboard/tests/screenshots/mobile.png`, and
  `dashboard/tests/screenshots/desktop-complete-detail.png`. All three were
  refreshed for the confirmed zone names and mapping.
- `git diff --check` passed.
- Boundary scan found no runtime references to `fetch`, `XMLHttpRequest`,
  `WebSocket`, `EventSource`, `sendBeacon`, `child_process`, `setInterval`,
  tmux, or WezTerm. Live tmux/WezTerm integration remains deferred.
- Manual-only residual remains: VoiceOver read-aloud sanity was not executable
  here. Automated accessible names and browser semantic inspection passed.
- Future work remains a separately approved read-only `SessionAdapter`; no live
  adapter was implemented.
- Unrelated repository changes were preserved and were not part of this
  revision.
- No Notion update applies; no relevant existing task/page was supplied.

**Next owner:** user/maintainer for review and the optional manual VoiceOver
sanity check.

## Read-only live-adapter spike — 2026-07-20

Research and lead-architecture review are complete. The approved next direction
is an explicitly invoked, one-shot tmux observation exporter plus manual browser
file import. Fixture mode remains the default. Schema v2 must represent unknown
state, observation time, unavailable activity, confidence, and sanitized
provenance without inventing completion or last-response facts.

The implementation boundary, signal-confidence matrix, privacy controls, and
acceptance criteria are recorded in
[`../specs/2026-07-20-dashboard-live-adapter-spike.md`](../specs/2026-07-20-dashboard-live-adapter-spike.md).

Implementation is gated on a new adversarial QA review. Polling, daemons,
automatic refresh, terminal control, WezTerm CLI, transcript access, tmux/config
changes, and default startup integration remain deferred.

## Live-adapter Claude QA status — 2026-07-21

Claude returned **FAIL** on the proposed read-only live-adapter boundary, so the
Builder remains blocked. All ten findings have been dispositioned and resolved
in the [resolved design](../specs/2026-07-21-dashboard-live-adapter-resolved-design.md).
The supporting [FAIL response](../qa/2026-07-21-dashboard-live-adapter-claude-qa-fail-response.md)
records the finding-by-finding resolution, including the read-only tmux
validation evidence. A new focused review must use the
[re-review prompt](../qa/2026-07-21-dashboard-live-adapter-claude-qa-re-review-prompt.md)
and return PASS before implementation can begin.

This resolution changed documentation only: no dashboard runtime, tmux/WezTerm
configuration, process behavior, or Notion state changed. Runtime model and
reasoning-effort pins remain unconfirmed; no substitution is claimed.

**Next owner:** user/Lead Architect to obtain the focused Claude re-review;
Builder authorization remains withheld.

## Live-adapter final QA-gate status — 2026-07-22

Claude's second live-adapter re-review returned **FAIL** with NB-1 through
NB-4. The closure work is complete and the final re-review packet is ready at
[`2026-07-22-dashboard-live-adapter-claude-qa-final-rereview-prompt.md`](../qa/2026-07-22-dashboard-live-adapter-claude-qa-final-rereview-prompt.md).

- [x] NB-1: UTF-8 byte-length framing has isolated tmux evidence.
- [x] NB-2: multi-session and server-restart `start_time` behavior has isolated
  tmux evidence.
- [x] NB-3: the input-disable and reentry guard is specified.
- [x] NB-4: the tmux-only ID regex is explicitly scoped.

Builder remains blocked until Claude returns **PASS** and explicitly states
**“Builder may begin.”** The closures do not authorize implementation.

No dashboard runtime, tmux/WezTerm configuration, default startup behavior, or
other runtime behavior changed. The disposable tmux servers used for the
evidence were cleaned up. Live tmux/WezTerm integration remains deferred;
after this gate only, separately approved future work may be an opt-in,
one-shot collector. Fixture mode remains the default.

No relevant Notion task/page was supplied or discoverable, so no Notion update
was created. Runtime model and reasoning-effort pins remain unavailable or
unconfirmed; no model/effort substitution is claimed.

**Next owner:** user/Lead Architect to submit the final Claude re-review packet
and record the verdict. Builder authorization remains withheld.

## Authoritative live-adapter completion handoff — 2026-07-22

This entry supersedes the immediately preceding *pending final re-review* gate
status. The 2026-07-21 and earlier 2026-07-22 **FAIL** entries remain the
historical review record.

Claude's final re-review returned **PASS** and explicitly stated **“Builder may
begin.”** The authorized opt-in live-adapter implementation is complete under
`dashboard/**`.

### Independent verification

- All dashboard `.mjs` syntax checks passed.
- Node tests: **55/55 PASS**.
- `git diff --check` passed.
- Exhaustive schema verification covered all **4,480** combinations.
- Parser, classifier, lifecycle, disposal, `X_OK`, and privacy paths are
  covered, including real-child output exceeding 1 MiB and its `maxBuffer`
  mapping.
- Manual `playwright-cli` verification passed at desktop 1440x900 and mobile
  390x844 through the complete fixtures → live → live → rejected → live →
  fixtures sequence: zero console errors/warnings; three placed unknown
  sessions plus one explicit overflow; reduced motion; 44px focus targets; and
  no overlap or clipping.
- Screenshots and `BROWSER_VERIFICATION.md` record the browser evidence.

### Delivered scope and retained boundaries

- Fixture mode remains the default. The live adapter is opt-in and one-shot
  only; no real or default tmux socket was queried during verification.
- No default WezTerm/tmux/startup/configuration behavior changed.
- Continuous live tmux/WezTerm integration remains deferred.
- Residual manual risks: the browser procedure is not automated, and a real
  macOS/Homebrew tmux collector trial against the default socket was
  intentionally not run.
- No relevant Notion task/page exists for this one-off; no Notion update was
  created.

**Next owner:** user/maintainer for an optional manual collector trial and/or
implementation audit. This does not authorize default activation.

Runtime model and reasoning-effort pins remain unavailable or unconfirmed; no
model/effort substitution is claimed.

## Approved visual-motion amendment — 2026-07-22

Active and thinking cars now continuously traverse the original route in order:
Summit → Ridge → Cedar → Lower. The approved implementation uses a CSS-only
64-second lap and 16 deterministic phase slots. Hover, focus, and pinned states
pause movement; parked states remain static; `prefers-reduced-motion` restores
the fixed anchors.

Verification passed:

- Node tests: **56/56 PASS**.
- Desktop and mobile full-lap sampling: 128 samples at 500ms across the complete
  64-second lap, with 0 overlaps, 0 off-road visible centers, and 0 clipping.
- Browser console remained clean.
- Desktop/mobile fixture and live screenshots were refreshed.

The protected boundary is unchanged: the dashboard remains optional and
fixtures-default, with no WezTerm/tmux configuration changes, polling, daemon,
backend, network access, or new dependencies. No relevant Notion task/page
exists for this one-off; no Notion update was created.
