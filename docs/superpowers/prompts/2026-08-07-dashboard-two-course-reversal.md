# Start prompt: restore the current dashboard to two courses

Executing this prompt requires separate, explicit user authorization. This
document describes proposed work and does not authorize implementation,
staging, commit, push, or deletion of the recovery stash.

You are the Lead Architect Codex agent working in:

```text
/Users/jasonalvarez/gitHubRepos/dotfiles
```

## Objective

Remove the rejected Lantern Coil course from the Night Pass dashboard on the
latest authoritative `main`, leaving exactly two courses in fixed order:
Ridge Pass, then Cypress Run.

At prompt creation, `HEAD == origin/main ==
d37494333e26bcce7133926175bbd66a75d051c7`, but Git state at execution time is
authoritative. Do not reset to or copy the old pre-Lantern dashboard. The
current branch contains substantial later work that must survive, including
live auto-refresh, the loopback live server, full-bleed layout, the combined
recency-ordered pit lane, tooltip viewport clamping, work-ref presentation,
and tooltip decluttering.

A named stash, `pre-pull dashboard reversal and future-work prompt 2026-08-07`,
contains the obsolete pre-pull rollback and unrelated user work. Preserve it.
Do not pop, drop, apply, or clear it wholesale. It may be inspected read-only
for historical intent only after resolving its exact identity by stash message.

## Delivery mode and roles

Use Gated Delivery because this removes canonical route geometry, compiler
outputs, public UI, responsive motion, screenshots, and regression contracts.
Use native named agents only:

- `deep-researcher`: read-only discovery of current contracts and post-item-6
  changes.
- `lead-architect`: define the current-baseline removal specification,
  acceptance criteria, protected paths, and verification plan.
- A separate `lead-architect`: independent pre-implementation QA.
- `builder`: implement only after pre-QA PASS.
- A different `lead-architect`: independent post-change QA.
- `workflow-coordinator`: update repository roadmap/handoff evidence only; do
  no Notion work unless a relevant Notion task is explicitly supplied.

Surface any role, model, or reasoning-effort availability exception. Never run
`codex-role` shell commands.

## Repository safety

Before any task action, inspect branch, `HEAD`, `origin/main`, divergence,
index, unstaged changes, untracked files, and named stashes. Preserve all
unrelated work exactly. Do not reset, restore, checkout, rebase, broadly clean,
or apply the recovery stash. Do not stage, commit, or push unless separately
authorized. If current local work or upstream changes overlap the approved
removal, stop and report the exact conflict.

## Required discovery

Read all applicable `AGENTS.md` instructions and current dashboard roadmap,
design handoffs, README, route sources/configuration, compiler and libraries,
catalog/layout/selection/hydration/motion modules, generated artifacts, HTML,
CSS, package scripts, Node tests, Playwright configuration/specifications,
browser verification guide, and all plans/specifications added after item 6.

Establish the current:

- route schema, compiler closure, profiles, anchors, headings, corner/drift
  behavior, timing, responsive transforms, and Auto rotation;
- full-bleed DOM/id contract, combined pit allocation, tooltip/focus/pin rules,
  accessibility, and mobile layout;
- fixture, file-import, loopback live-server, five-second live auto-refresh,
  source-controller, privacy, filesystem, and failure/fallback contracts;
- screenshot inventory and byte baselines;
- Node and browser test matrix, including intentional project-specific skips;
- exact files and values introduced specifically for Lantern Coil.

Report weak claims, platform assumptions, unknowns, and every post-item-6
contract that a historical rollback would damage.

## Architecture requirements

- Remove exactly one course: `lantern-coil` / Lantern Coil.
- Retain Ridge Pass and Cypress Run unchanged and in that fixed order.
- Remove Lantern's canonical route source, compiler curve constraints, catalog
  entry, selector option, SVG art, scoped styles, geometry, motion keyframes,
  tests, and its two screenshot files.
- Author all generated changes through the canonical route compiler. Never
  hand-edit generated geometry or motion keyframes.
- Update exact-cardinality/source-directory validation to two courses while
  preserving schema v1 and fail-closed behavior.
- Define and test the resulting two-course Auto workday schedule without adding
  boundaries, polling, persistence, or timers.
- Preserve the 64-second traversal, deterministic allocation, tangent
  orientation, corner-aware drift, reduced motion, Cypress mobile scaling,
  full-bleed stage, combined pit lane, tooltip clamping/decluttering, work refs,
  focus/hover/pin identity, accessibility, and mobile targets.
- Preserve fixture, manual import, loopback live serving, five-second
  auto-refresh, in-place renderer updates, fallback behavior, collector/schema/
  privacy/filesystem contracts, and the exact user-facing live commands.
- Do not introduce dependencies, telemetry, persistence, external network
  access, backend expansion, terminal integration, or a replacement course.
- Never contact the real/default tmux server during automated verification.
- Do not copy all dashboard files from `e61c331` or another historical commit;
  that would erase newer authorized behavior.

## Screenshots

At prompt creation the dashboard has eleven PNG references: nine shared/Ridge/
Cypress/live references and two Lantern references. Delete only
`desktop-lantern-coil.png` and `mobile-lantern-coil.png`. Prove every retained
reference is byte-identical before and after. Do not refresh a retained image
unless a new independent gate explicitly approves a deterministic reason.

## Acceptance criteria

1. Canonical config, source directory, generated geometry, catalog, selector,
   runtime art, and motion contain exactly Ridge Pass and Cypress Run.
2. No Lantern runtime identifier, art, CSS, geometry, keyframe, test, or
   screenshot remains under `dashboard/**`.
3. Compiler output is deterministic/current and Ridge/Cypress parsed values do
   not regress.
4. Desktop/mobile containment, target clearance, phased separation, headings,
   corner envelopes, drift boundaries, reduced/fallback motion, focus, hover,
   pinning, overflow, and switching pass for both courses.
5. Auto rotation is explicitly tested for the two-course schedule.
6. Fixture, import, synthetic loopback live, repeated auto-refresh, fallback,
   DOM identity, pit ordering, tooltip behavior, accessibility, and work refs
   pass on both courses.
7. The nine retained screenshots are byte-identical; only the two Lantern PNGs
   are deleted.
8. Current live-server, collector, schema, privacy, filesystem, package,
   dependency, network, telemetry, persistence, and terminal boundaries remain
   unchanged.
9. Roadmap and durable handoff accurately record the user-directed reversal;
   any replacement course or test hardening remains proposed and unauthorized.
10. The recovery stash and all unrelated work remain intact.

## Required verification

Run and report at minimum:

```sh
npm --prefix dashboard run routes:check
npm --prefix dashboard run test:unit
npm --prefix dashboard run test:browser
find dashboard -path dashboard/node_modules -prune -o -name '*.mjs' -type f -exec node --check {} \;
git diff --check -- <approved paths>
shasum -a 256 dashboard/tests/screenshots/*.png
lsof -nP -iTCP:43917 -sTCP:LISTEN
lsof -nP -iTCP:43918 -sTCP:LISTEN
git status --short
git diff --cached --name-only
git stash list
```

Also run focused route/compiler/catalog/Auto tests; fixture and synthetic-live
flows for both courses; desktop 1440x900 and mobile 390x844; normal,
reduced-motion, registered-property fallback, focus, hover, pin, overflow, and
track switching; live auto-refresh and rejection fallback; browser console and
page-error audits; generated-artifact comparison; screenshot byte comparison;
and port/report cleanup. Audit every failure, skip, todo, warning, and error.

## Handoff

Before implementation, report the exact deletion/retention plan, current
compiler/catalog/Auto changes, protected newer contracts, expected files,
test/browser/screenshot plan, observability decision, and pre-QA status.

At completion report exact files changed/deleted, compiler provenance, all test
counts, screenshot hashes, QA verdicts, no-real-tmux confirmation, stash and
unrelated-work preservation, observability, roadmap/future-work status, and
whether anything was staged, committed, or pushed. Do not execute future work
or remove the recovery stash without separate authorization.
