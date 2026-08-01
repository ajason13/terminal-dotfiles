# Dashboard third original course design

**Status:** Delivery-approved; item 6 complete
**Date:** 2026-07-31
**Scope:** Night Pass dashboard roadmap item 6 only
**Delivery mode:** Gated Delivery

## Objective and task ledger

Add exactly one original medium-speed technical course through the existing
canonical route-source/compiler workflow. The resulting catalog contains
exactly three courses. Generated geometry and motion remain compiler-owned;
neither generated artifact may be hand-edited.

| Item | Task | Status |
|---|---|---|
| 1 | Browser regression harness | Complete |
| 2 | Route compiler | Complete |
| 3 | Tangent orientation and atmosphere | Complete |
| 3a | Corner-aware drifting | Complete |
| 4 | Cypress mobile clearance | Complete |
| 5 | Opt-in live workflow | Complete |
| 6 | Third original course | Complete |

Initial repository state was `main` at
`ab3017cefc4c2fefabd80f918ef4e18013357d4f`, equal to the locally recorded
`origin/main` with divergence `0 behind / 0 ahead`. At that audit, the index
and untracked set were empty and the unrelated user-owned unstaged change at
`wezterm/modules/background_manifests/anime.lua` was excluded from item 6.
During implementation, external updates advanced both local `HEAD` and
`origin/main`, first to `e074fe4c816239fccefc524000dceb1ebc667c68` and then to
`e61c3317ec52047e20b6d790277ab7989f3e2a04`; divergence at the coordination
audit remained `0 behind / 0 ahead`. The `e61c331` publication contains exactly the unrelated
root `README.md`, `scripts/background-bundles.sh`, and
`wezterm/modules/background_manifests/anime.lua` changes. It leaves only
item-6 paths unstaged or untracked and the index empty at that audit. Git
history is authoritative for the later item-6 commit and push status.

## Course specification: Lantern Coil

Identity is `lantern-coil` / **Lantern Coil**. The course is an independently
constructed open spiral, not a traced road, map, circuit, landmark, branded
facility, or fictional route asset. Traversal starts on the lower-left outer
terrace at `(183.779, 529.409)`, proceeds clockwise around a progressively
tightening illuminated basin, and finishes at `(411.182, 402.975)` on the
inner terrace. It never closes the spiral and does not self-intersect.

Its technical character is sustained line placement through broad changing-
radius turns rather than Ridge Pass switchbacks or Cypress Run's squared
nineties and 180-degree hairpins. “Medium-speed” is a visual/course-design
description, not a vehicle-physics claim: the protected shared motion remains
one 64-second linear traversal without acceleration or braking.

The same-sign topology is intentional. “Technical” here means managing five
separated, progressively tighter radius zones and their tangent-stable links;
it does not claim alternating left/right transitions. This tradeoff is accepted
because it creates the strongest geometric distinction from the two existing
courses. Each detected envelope must be separated by retained zero-yaw frames,
and at least one ordinary visible frame must remain outside every envelope.

The visual language is an abstract night rain garden: nested dark water
terraces, soft lantern pools, reed marks, glassy inlay arcs, and low retaining
rings. It must not reuse Ridge mountain cue classes or Cypress paved-apron,
tire-wall, cone, clipping-marker, grid, or skid-ring cue classes. Decorative
SVG remains static, pointer-inert, course-owned, and original. No image,
external asset, network fetch, logo, real place name, or landmark is added.

Traversal segments, curve counts, and fixed capacities are:

| Order | Segment | Cubics | Slots |
|---:|---|---:|---:|
| 1 | Ember Gate | 1 | 2 |
| 2 | Outer Lantern | 2 | 3 |
| 3 | Prism Rise | 2 | 3 |
| 4 | Halo Crest | 3 | 3 |
| 5 | Inner Coil | 4 | 3 |
| 6 | Dawn Chute | 4 | 2 |

The canonical `1000×760` displayed-coordinate path is exactly:

```text
M183.779 529.409 C165.135 504.06 65.478 425.334 71.914 377.312 C78.35 329.29 147.672 270.791 222.395 241.28 C297.117 211.77 428.286 195.664 520.251 200.25 C612.216 204.836 721.028 236.388 774.184 268.795 C827.339 301.203 851.735 356.625 839.185 394.696 C826.635 432.767 761.889 476.537 698.883 497.22 C635.877 517.903 531.206 525.489 461.147 518.796 C391.087 512.103 313.626 483.589 278.526 457.062 C243.426 430.536 235.245 387.661 250.546 359.637 C265.848 331.613 321.493 301.826 370.336 288.919 C419.179 276.011 495.449 274.929 543.603 282.193 C591.757 289.456 639.775 312.913 659.26 332.501 C678.745 352.089 675.222 381.659 660.515 399.719 C645.807 417.78 603.543 434.561 571.015 440.862 C538.487 447.162 491.983 443.838 465.345 437.523 C438.706 431.209 420.209 408.733 411.182 402.975
```

Canonical segment anchor locators are fixed as follows; all lateral offsets
are `0`:

```text
Ember Gate:    0, 0.651
Outer Lantern: 0.158, 0.498, 0.838
Prism Rise:    0.2, 0.582, 0.964
Halo Crest:    0.269, 0.566, 0.863
Inner Coil:    0.16, 0.456, 0.752
Dawn Chute:    0.075, 1
```

The existing compiler functions were exercised read-only against this exact
path before approval. The candidate produces sixteen contained anchors, 528
visible frames per responsive profile (513 equal-distance base positions plus
15 internal cubic boundaries), maximum audited interpolation deviation of
approximately `0.149px` desktop and `0.044px` mobile, and interval-distance
variation below `0.10%` desktop / `0.03%` mobile. Its responsive path lengths
are approximately `2881.51px` desktop and `1294.26px` mobile. Those lengths sit
between current Ridge (`2763.12px` desktop / `1101.46px` mobile) and Cypress
(`3789.68px` desktop / approximately `1502.31px` mobile after its protected
`0.94` presentation scale), providing a measurable medium-speed interpretation
under the shared duration. These measurements are design-time evidence and
must be reproduced from the committed compiler after Builder implementation.

A 1024-step equal-screen-distance nonlocal spacing audit, excluding pairs less
than eight percent of the lap apart, found no sampled self-intersection and
minimum centerline spacing of approximately `76.66` canonical units,
`68.81px` desktop, and `54.98px` mobile. Builder must reproduce a flattened-
path intersection audit and keep nonlocal spacing at or above the responsive
`52px` / `44px` target diameters. Browser review must additionally reject any
decorative or road treatment that makes neighboring coil arms read as one
ambiguous lane.

The canonical detector identifies exactly five positive-sign clockwise corner
regions with apex fractions `0.072265625`, `0.421875`, `0.693359375`,
`0.880859375`, and `0.98046875`. Expected desktop peak drift yaw is
`34.0332deg`, `30.7834deg`, `33.1415deg`, `40.164deg`, and `19.1235deg`;
expected mobile peak drift yaw is `19.8528deg`, `18.6834deg`, `20.1688deg`,
`23.8153deg`, and `25.0196deg`. The candidate retains 359 desktop and 303
mobile zero-yaw frames. Tests must pin region count, sign, boundaries/apices,
responsive projection, unequal broad/tight peak behavior, yaw envelopes,
zero-yaw boundary and between-envelope frames, at least one non-envelope
straight frame, and tangent headings.

## Bounded compiler and catalog extension

The route schema stays at version 1. The public track and anchor key sets,
view box, responsive profiles, target diameters, six-segment shape,
`2/3/3/3/3/2` capacities, anchor-offset range, 513 base grid, boundary-frame
insertion, precision, deviation/speed/collision audits, tangent generation,
corner policy, CSS serialization, static headings, and atomic artifact workflow
do not change.

Only these compiler/catalog constraints expand:

1. `route-config.mjs` appends `lantern-coil` after `cypress-run`.
2. The compiler requires exactly three unique ordered route IDs rather than
   exactly two.
3. The fixed curve-count table adds `lantern-coil: [1, 2, 2, 3, 4, 4]`.
4. Runtime catalog validation requires exactly three tracks, retaining every
   other closed-key and uniqueness check.
5. Route-directory validation requires exactly the three configured source
   files and continues to reject missing or extra route sources.

No generic arbitrary-course import, schema extension, relaxed validation, or
runtime route authoring is approved.

## Catalog, SVG, styling, and Auto schedule

Use unique identifiers:

```text
artId: lantern-coil-art
centerlineId: lantern-coil-centerline
desktopAnimationName: lantern-coil-traverse-desktop
mobileAnimationName: lantern-coil-traverse-mobile
```

Add one native selector option after Cypress Run. Add one six-path hydrated
SVG placeholder group and static original decorations. Course-specific CSS
shows the group only for `data-track-id="lantern-coil"` and adds six unique
segment/label colors. Do not add a mobile presentation scale unless browser
evidence proves the unscaled compiled course fails an existing target or focus
clearance contract and an independent gate approves that bounded correction.

The existing workday schedule is retained exactly: automatic boundaries remain
08:30 and 12:30 local time, after-hours behavior is unchanged, and Auto owns at
most one one-shot timeout. The stable catalog order is:

```text
Ridge Pass -> Cypress Run -> Lantern Coil
```

The existing `day * 2 + windowIndex` slot, reduced modulo catalog length,
naturally rotates three courses across successive workday windows. It yields a
six-window repeating sequence of Ridge, Cypress, Lantern, Ridge, Cypress,
Lantern; the starting member on a particular civil date remains a deterministic
consequence of the existing local-day ordinal. No third daily boundary, closing
boundary, polling timer, storage, or persistence is added.

Course switching must continue to preserve the same session/button DOM
identity, focus, pressed/pinned state, tooltip/readout behavior, source mode,
import generation, age display, fixture/live data, allocation semantics, and
accessibility announcements.

## Protected invariants and non-goals

- Preserve the 64-second linear lap, exact four-second phase spacing, hidden
  reset, deterministic slot allocation, tangent headings, corner-aware drift,
  atmosphere, fail-static angle capability, reduced motion, hover/focus/pin
  pause behavior, mobile target size, focus ring, tooltip, and overflow rules.
- Ridge Pass and Cypress Run canonical sources, parsed generated geometry,
  anchors, headings, corner topology, keyframe values, art, responsive Cypress
  scale, behavior, and reference screenshots are protected against change.
- Preserve fixture startup, synthetic live import, rejected-live fallback,
  reset, schema validation, renderer/source lifecycle, and accessibility.
- Preserve item 5's exact export command and collector, privacy, classifier,
  schema-v2, filesystem, error, refresh, and browser-import contracts.
- Add no runtime dependency, build system, backend, network access, polling,
  telemetry, persistence, terminal integration, service, or new process call.
- Do not access the real/default tmux server during automated verification.
- Do not change tmux, WezTerm, wallpaper, installer, LLM-status, background
  manifests, package manifests/lockfiles, or unrelated user work.
- Do not implement an item 7. Any discovered improvement is proposed future
  work and remains unauthorized.

## Approved implementation files

Production and generated scope is limited to:

- new `dashboard/routes/lantern-coil.route.mjs`;
- `dashboard/routes/route-config.mjs`;
- `dashboard/scripts/lib/route-compiler.mjs`;
- `dashboard/src/track-catalog.mjs`;
- compiler-owned `dashboard/src/generated/route-geometry.mjs`;
- compiler-owned `dashboard/generated/route-motion.css`;
- `dashboard/index.html`;
- `dashboard/styles.css`;
- `dashboard/README.md`.

The README edit must also correct its already-stale architecture statement
that tangent orientation and drifting are deferred. Current source, roadmap,
tests, and final handoffs establish both as implemented protected behavior;
Builder must not preserve or introduce a contradictory deferral claim.

Verification/documentation scope may update:

- `dashboard/tests/route-compiler.test.mjs`;
- `dashboard/tests/route-hydration.test.mjs` if count/atomicity fixtures require it;
- `dashboard/tests/multi-track.test.mjs`;
- `dashboard/tests/dashboard.test.mjs`;
- `dashboard/tests/renderer-lifecycle.test.mjs` only if a three-course assertion
  belongs there;
- `dashboard/tests/browser/dashboard.spec.mjs`;
- `dashboard/tests/BROWSER_VERIFICATION.md`;
- new `dashboard/tests/screenshots/desktop-lantern-coil.png`;
- new `dashboard/tests/screenshots/mobile-lantern-coil.png`;
- this design packet;
- after post-change PASS only,
  `docs/superpowers/plans/2026-07-27-dashboard-roadmap.md`.

No other file is pre-approved. Builder must stop and request architectural
review before expanding this set.

## Verification and screenshot policy

Required automated verification is:

```sh
npm --prefix dashboard run routes:check
npm --prefix dashboard run test:unit
npm --prefix dashboard run test:browser
find dashboard -path dashboard/node_modules -prune -o -name '*.mjs' -type f -exec node --check {} \;
git diff --check -- <scoped item 6 files>
```

Because staging is forbidden before post-change PASS, the ordinary Git diff
check does not cover new untracked text files. Before that gate, run
`git diff --no-index --check /dev/null <new-text-file>` separately for the new
route source and this packet (and any other independently approved new text
file), accepting exit `1` only for the expected content difference and
rejecting any whitespace diagnostic or other exit. New PNGs are covered by
format/dimension inspection and SHA-256 rather than a text whitespace check.

Focused tests must prove exactly three catalog entries and selector options;
the exact route source identity/path/segment topology; route filename closure;
deterministic compilation and stale-artifact detection; sixteen anchors;
responsive containment/separation; 528-frame construction; tangent and static
headings; the exact five-corner topology and drift envelopes; reduced-motion
static behavior; and unchanged Ridge/Cypress parsed generated values.

At 1440×900 and 390×844, exercise all three courses in fixture and fresh
synthetic-live modes. Audit canonical and sixteen-route-capacity cases across
the complete visible lap for full target/focus containment, phased separation,
centerline alignment, collision, overflow, heading, drift, boundary/reset
frames, normal motion, reduced motion, hover, keyboard focus, pin/escape,
track switching, source preservation, accessibility, and clean browser console
and page-error channels. Browser tests and manual checks use synthetic inputs
only and must leave ports 43917 and 43918 clear.

Also run no-screenshot responsive regression checks immediately below and
above both layout boundaries: 759/760px and 959/960px viewport widths. For all
three courses, those checks must reject target/focus clipping, phased overlap,
map or page horizontal overflow, selector/status collision, and course-art or
vehicle-layer transform leakage.

Add exactly the two neutral Lantern Coil screenshots if the deterministic
visual implementation passes review. They use the standard fixture, no focus,
pin, tooltip, pressed state, or skip-link artifact. Desktop uses a 1440×900
viewport and screenshot. Mobile uses a 390×844 viewport and Playwright
`fullPage: true`; the resulting bitmap is exactly 390px wide and may be taller
than 844px, matching existing mobile reference policy. Record pre/post SHA-256 for every tracked
screenshot. The nine existing screenshots are expected to remain
byte-identical; any change blocks release pending explanation and independent
approval. The two monolithic generated artifacts must change, but parsed Ridge
and Cypress entries/keyframes must remain value-identical to the pre-change
commit apart from their generated source digest/header/container context.

Audit zero failures, zero skips/todos, zero browser console warnings/errors,
and zero page errors. Confirm package files and every protected integration
file are unchanged. Confirm no automated command invoked `collect-tmux.mjs`,
`export-tmux.mjs`, the real collector, or the user's default tmux server.

## Observability decision

Add no runtime logging, metrics, traces, telemetry, debug UI, persisted state,
or new operator hook. Existing visible fatal rendering, closed compiler
diagnostics, `routes:check`, Node assertions, browser console/page-error gates,
and reference screenshots are sufficient for a static compiled course. This
decision must be revisited only if implementation introduces an otherwise
unobservable failure mode; such an expansion is not currently approved.

## Weak claims, platform assumptions, and unknowns

- “Original” means independently authored here without an external route or
  visual reference. It is not a global trademark/name clearance or proof that
  no unrelated place has ever used similar generic words.
- “Medium-speed” remains a screen-space visual proxy rather than vehicle
  physics. It is made measurable here by requiring Lantern's responsive path
  length—and therefore displayed speed under the shared duration—to remain
  strictly between current Ridge and displayed Cypress in both profiles.
- Design-time compiler measurements used the current Node/compiler functions;
  committed outputs and browser-rendered CSS/SVG remain authoritative.
- Responsive compiler audits use fixed `1160×682` and `372×580` map profiles;
  full-page viewports are 1440×900 and 390×844. Intermediate breakpoints still
  need regression coverage and are not inferred from only those two profiles.
- Chromium/Playwright is the automated browser baseline. Registered custom
  angle properties and `prefers-reduced-motion` behavior retain the existing
  supported-browser/fail-static assumptions.
- Screenshot byte identity can vary with an environment/toolchain change.
  The pinned local Playwright dependency and unchanged environment are assumed;
  any mismatch is investigated rather than silently refreshed.
- No relevant Notion task was supplied, so no Notion work is authorized.

## Gate state and handoffs

Read-only deep-researcher discovery completed. Independent pre-implementation
review by a native `lead-architect` (`gpt-5.6-sol`, high reasoning) returned
PASS and explicitly authorized Builder; there was no role, model, or effort
availability exception. Builder then implemented only the approved paths.

As built, Lantern Coil is the third and final ordered catalog entry. Its source
uses the approved path, six segment names, curve map `[1, 2, 2, 3, 4, 4]`, and
sixteen locators. The compiler emitted both generated artifacts; no generated
geometry or keyframe schedule was hand-authored. The native selector, scoped
rain-garden SVG/CSS, exact-three validation, three-course Auto assertions, and
focused route/compiler/browser coverage were added without changing the schema
version or protected item 5 implementation. Screenshot writing is explicitly
opt-in with `DASHBOARD_UPDATE_SCREENSHOTS=1`; the ordinary browser suite still
performs the neutral screenshot-state assertions but cannot rewrite references.

Primary verification evidence:

- `npm --prefix dashboard run routes:check`: PASS; artifacts match compiler output.
- `npm --prefix dashboard run test:unit`: 159 passed, 0 failed, 0 skipped/todo.
- `npm --prefix dashboard run test:browser`: 40 passed, 0 failed, 0 skipped in
  6.3 minutes across desktop Chromium `1440×900` and mobile Chromium `390×844`.
- Focused opt-in Lantern screenshot run: 2 passed; an immediate ordinary
  40-test run left both Lantern file sizes and mtimes unchanged.
- Every dashboard `.mjs` module passed `node --check`; scoped tracked and new
  text files passed whitespace checks; ports 43917 and 43918 were clear after
  testing; generated Playwright report artifacts were removed.
- Browser assertions observed zero console warnings/errors and zero page
  errors. The test-runner process emitted only Node's inherited
  `NO_COLOR`/`FORCE_COLOR` notice. The first sandboxed browser invocation could
  not bind the local Python server (`EPERM`); the identical command passed when
  rerun with approved local-loopback permission. This is an execution-environment
  exception, not a product failure.
- Desktop and mobile sweeps covered every Lantern retained motion frame and all
  sixteen static slots, all three fixture and fresh synthetic-live courses,
  responsive boundaries at 759/760/959/960px, tangent headings, five signed
  corner envelopes, drift boundaries, reduced motion, focus, hover, pin/escape,
  overflow, collision, target containment, track switching, identity, and
  accessibility. Existing Ridge and Cypress parsed geometry/keyframes and
  behavior remained protected.
- The nine pre-existing PNG references remain byte-identical. The only new
  screenshots are `desktop-lantern-coil.png` (`1440×900`, SHA-256
  `7161cf45bc822eb6fad88476621319f62a75a375ebe2ee9d66a814774505cfa1`)
  and `mobile-lantern-coil.png` (`390×1673` full page from a `390×844`
  viewport, SHA-256
  `ef29439aa4e4229c4f17a022bb72b38566c9e3cd64a125ed2f522622c2ecde8d`).
- Package manifests, the item 5 collector/export/import implementation, and
  every protected integration path are unchanged. No collector/export command
  ran, no real/default tmux server was accessed, and no network, telemetry,
  polling, persistence, dependency, backend, or terminal integration was added.
- The observability decision remains no new runtime instrumentation; compiler
  diagnostics, fatal UI, unit/browser assertions, and opt-in deterministic
  screenshot evidence cover the introduced failure modes.

A different native `lead-architect` independently reviewed the final diff and
delivery evidence and returned post-change PASS with no blocking finding. Its
nonblocking weak claims remain: original is not global name/trademark
clearance; medium-speed is a screen-space proxy rather than vehicle physics;
Chromium/Playwright and registered-angle/reduced-motion behavior retain their
existing platform assumptions; and screenshot identity depends on the pinned
local rendering environment. This PASS authorizes the workflow-coordinator
status update only; it does not assert that staging, commit, or push has
occurred.

Delivery is therefore approved and item 6 is complete. No observability,
Notion, tmux-server, collector, terminal, network, telemetry, polling, or
persistence access/change occurred. The only proposed future work is to
strengthen permanent neutral-screenshot assertions and checked-in breakpoint
focus-clearance/pairwise-overlap assertions. It is unimplemented and
unauthorized; the current routes, unit, browser, syntax, scoped-diff,
generated-artifact, screenshot, and port evidence already passed.
