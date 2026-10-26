# Start prompt: strengthen dashboard neutral screenshot-state assertions

Executing this prompt requires separate, explicit user authorization. This
document describes proposed implementation work and does not authorize edits,
staging, commit, push, or screenshot refreshes by itself.

You are the Builder Codex agent working in Advisor Mode in:

```text
/Users/jasonalvarez/gitHubRepos/dotfiles
```

## Objective

Implement Night Pass dashboard future-work item 2: strengthen the automated
preconditions for the deterministic neutral reference-screenshot state.

At prompt creation, `HEAD == origin/main ==
709d0b7f45e06b0d041fd8322561b06aeb572a54`, after item 3 added permanent
breakpoint route-clearance assertions. Git state at execution time is
authoritative. Reinspect current code and tests before editing, preserve the
item 3 coverage, and stop if later changes conflict with this scope.

This is browser-test and verification-documentation hardening. It is not a
pixel-diff project and does not authorize changing screenshot bytes.

## Current gap and authoritative neutral state

The tracked reference images are intentionally manual evidence. No current
browser test uses `page.screenshot`, `toHaveScreenshot`, or
`DASHBOARD_UPDATE_SCREENSHOTS`, and routine pixel-diff testing is not the goal.
The current capture commands select a course and write a file but do not prove
the documented capture preconditions.

`dashboard/tests/BROWSER_VERIFICATION.md` and the current dashboard contracts
define the neutral state as:

- the committed 24-session fixture source, with no live import or live polling;
- the exact target viewport and manually selected course;
- every Web Animation paused;
- route traversal sampled at `16000ms`;
- active/thinking smoke sampled at 40 percent of its animation cycle;
- every other animation sampled at zero (corner yaw comes from the traversal
  keyframe and has no independent drift clock);
- two animation frames elapsed after deterministic timeline writes and before
  final state assertions or any separately authorized capture;
- the legend and other optional UI closed, with no focused, hovered, pressed,
  or pinned session, no visible tooltip, and no rejection or application
  failure state.

## Approved scope

Create the smallest reusable Playwright capture-preparation helper consistent
with the current suite, and exercise it as permanent assertions in both
configured Chromium projects:

- desktop at exactly `1440x900`;
- mobile at exactly `390x844`;
- Ridge Pass (`ridge-pass`) and Cypress Run (`cypress-run`) in fixed order.

The helper must prepare the deterministic state, wait exactly two animation
frames after setting the timelines, and then fail closed if any neutral-state
precondition is false. Make failures identify at least the viewport, course,
and violated precondition. Keep it reusable for a future independently
authorized manual or opt-in writer, but do not add a screenshot-writing branch
in this task.

Before any optional future write, the helper/assertions must prove:

- `document.documentElement.clientWidth` and the Playwright viewport are the
  expected width and height for the active project;
- `#dashboard-root[data-track-id]`, `#map-heading`, `#track-status`, the native
  selector value, and the single visible `.course-art` all name the explicitly
  selected course;
- `#source-label` is exactly the fixture label, `#snapshot-summary` reports 24
  sessions, 24 `.session-car` controls are rendered, the source region is not
  busy, and source age/notice fields are empty;
- `.legend-disclosure` is closed and the overflow notice is not exposing a
  failure artifact;
- no session control is the active element or matches focus/hover state, every
  session button has `aria-pressed="false"`, and no route or pit wrapper has
  `data-pinned="true"`;
- every `.session-tooltip` computes hidden with zero opacity, and no
  `.invalid-snapshot` or `.application-failure` exists;
- all Web Animations are paused at the documented deterministic samples:
  traversal at `16000ms`, smoke at 40 percent of its own duration, and all
  remaining animations at zero. Assert actual animation state/current time
  after the two-frame settlement rather than trusting that assignments ran.

Use current selectors, animation names, and Web Animations behavior discovered
from the authoritative implementation. Do not encode a stale animation-count
assumption if semantic identification provides a stronger contract. Neutralize
pointer and keyboard state deliberately before asserting; do not make the test
pass by hiding tooltips, pins, failures, or focus through production CSS or
runtime changes.

The neutral reference set covered by this work is exactly:

```text
dashboard/tests/screenshots/desktop-ridge-pass.png
dashboard/tests/screenshots/mobile-ridge-pass.png
dashboard/tests/screenshots/desktop-cypress-run.png
dashboard/tests/screenshots/mobile-cypress-run.png
dashboard/tests/screenshots/desktop.png
dashboard/tests/screenshots/mobile.png
```

The last two are byte-identical Ridge aliases. Assert the same prepared Ridge
state would precede either alias, but do not duplicate an expensive browser
scenario solely for identical output. The following evidence is intentionally
non-neutral and must not be passed through, renamed as, or asserted by the
neutral helper:

```text
dashboard/tests/screenshots/desktop-live.png
dashboard/tests/screenshots/mobile-live.png
dashboard/tests/screenshots/desktop-complete-detail.png
```

Update `dashboard/tests/BROWSER_VERIFICATION.md` with the permanent assertion
coverage, exact helper contract, courses/viewports, neutral/non-neutral file
classification, verification result, and any residual manual-only capture
step. Keep historical evidence accurate.

Expected implementation paths are limited to:

```text
dashboard/tests/browser/dashboard.spec.mjs
dashboard/tests/BROWSER_VERIFICATION.md
```

If current suite structure makes a small dedicated browser-test helper module
materially clearer, report the proposed path and reason before adding it. Do
not edit the future-work roadmap merely to reconcile item 3's current status;
that unrelated bookkeeping is outside this item.

## Non-goals and protected boundaries

- Do not call `page.screenshot`, add `toHaveScreenshot`, introduce visual
  baselines, or add an environment-controlled screenshot writer.
- Do not capture, refresh, rename, add, or delete any PNG. All nine tracked
  screenshot files must remain byte-identical unless a later independent
  authorization explicitly approves a refresh.
- Do not change runtime JavaScript, HTML, CSS, route sources, route compiler,
  generated geometry or motion, fixture data, live server, collector, schema,
  adapters, package files, lockfiles, Playwright configuration, dependencies,
  or runtime observability.
- Do not change course geometry, animation timing, drift/smoke behavior,
  selection, layout, focus, hover, pin, tooltip, accessibility, source, or
  failure behavior to satisfy the assertions.
- Do not access external networks or a real/default tmux server, socket,
  client, session, pane, or environment. The existing Playwright-owned
  loopback static server and committed synthetic fixture are sufficient.
- Do not implement another future-work item or weaken the item 3 breakpoint
  matrix introduced at `709d0b7`.

## Repository and worktree safety

Before editing, inspect branch, `HEAD`, `origin/main`, divergence, index,
unstaged changes, untracked files, and named stashes. Preserve all unrelated
work exactly. In particular, do not pop, apply, drop, or clear the named
`pre-pull dashboard reversal and future-work prompt 2026-08-07` stash or any
other stash.

Do not reset, restore, checkout, rebase, merge, broadly clean, or overwrite
another worker's changes. If local or upstream work overlaps the approved
paths, stop and report the exact conflict. Do not stage, commit, or push unless
the user separately authorizes that exact action.

Record the implementation decision, assumptions, consulted repository
evidence, and verification in the handoff. Advisor output informs the Builder;
it does not expand this scope.

## Acceptance criteria

1. A reusable test-side helper deterministically prepares and validates the
   documented neutral state before any possible future capture.
2. Permanent Playwright assertions pass for Ridge Pass and Cypress Run at
   `1440x900` and `390x844`, with actionable viewport/course/precondition
   diagnostics.
3. The assertions prove fixture identity and population, exact course and
   viewport identity, closed neutral UI, no session focus/hover/press/pin,
   hidden tooltips, no rejection/fatal state, and settled paused animation
   samples after two animation frames.
4. The four course-specific references and two Ridge aliases are accurately
   documented as neutral. Both live references and the complete-detail
   reference remain explicitly excluded.
5. No screenshot-writing or pixel-diff mechanism is introduced, and all nine
   tracked PNGs retain their exact SHA-256 bytes.
6. Runtime, routes, generated artifacts, fixtures, live/tmux behavior,
   dependencies, configuration, item 3 assertions, stashes, and unrelated
   work remain unchanged.
7. The complete Node and Playwright suites pass with no failures, unexpected
   skips/todos, browser console warnings/errors, or page errors.

## Required verification

From the repository root, run and report at minimum:

```sh
npm --prefix dashboard run routes:check
npm --prefix dashboard run test:unit
npm --prefix dashboard run test:browser
find dashboard -path dashboard/node_modules -prune -o -name '*.mjs' -type f -exec node --check {} \;
git diff --check -- dashboard/tests/browser/dashboard.spec.mjs dashboard/tests/BROWSER_VERIFICATION.md
shasum -a 256 dashboard/tests/screenshots/*.png
lsof -nP -iTCP:43917 -sTCP:LISTEN
lsof -nP -iTCP:43918 -sTCP:LISTEN
git status --short
git diff --cached --name-only
git stash list
```

Capture screenshot hashes before editing and compare them after verification.
Audit every test failure, skip, todo, warning, console error, page error, and
unexpected changed file. The two `lsof` checks must show that the Playwright
server and live-server ports are clear after the suite. Remove only ignored
Playwright artifacts created by this task, after distinguishing them from
pre-existing user files; do not use broad cleanup.

## Handoff

Report the exact files changed, helper location and contract, each
course/viewport case, how the two-frame and Web Animations samples were
verified, test counts and diagnostics, before/after screenshot hashes,
neutral/non-neutral inventory, clear-port evidence, no-real-tmux confirmation,
stash and unrelated-work preservation, residual manual capture risk, and any
scope exception. State explicitly whether anything was staged, committed, or
pushed.
