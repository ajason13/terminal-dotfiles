# Dashboard Cypress Mobile Clearance Design

Date: 2026-07-28

Status: complete; independent pre-implementation QA-planning PASS and final
independent post-change QA PASS recorded. Commit and push are authorized;
release status is established by Git history.

Roadmap item: `4 — Cypress mobile clearance`

Delivery mode: Gated Delivery

## Objective

Increase Cypress Run's minimum rendered mobile full-target edge clearance at
`390×844` materially beyond the current approximately `3px`, without editing
the canonical route or artwork, shrinking the `44px` target, weakening
containment or overlap assertions, or changing any route compiler, motion,
interaction, fixture/live, or protected terminal contract.

Items 5 and 6 remain unimplemented. Item 5 is the next recommended task;
item 6 remains deferred after it. This item passed both independent gates and
verification; commit and push are authorized, with release status established
by Git history.

## Discovery and measured baseline

The Lead Architect used the user-supplied AGENTS instructions as authoritative
and read the checked-in `codex/AGENTS.md`. There is no repository-root
`AGENTS.md`. The required roadmap, multi-track and route-compiler packets,
tangent/atmosphere and corner-drift packets, package configuration, canonical
route sources, compiler, generated geometry and motion artifacts, renderer,
base CSS, Node tests, Playwright tests, browser-verification evidence, and
current Cypress screenshots were inspected.

The task began on `main` at `91cd168`. The only pre-existing worktree change
at initial handoff was:

```text
 M wezterm/modules/background_manifests/anime.lua
```

Its initial unstaged diff SHA-256 was
`112200c78129d70882d57d2e59449a9973483dcac225f9b6c59e8e14c857978f`
with `10` added and `0` deleted lines.

During the pre-implementation gate, an external repository update advanced
both `main` and `origin/main` to
`210b084 feat(backgrounds): add Initial D anime rotation`. That predecessor
commit contains only `anime.lua` (`16` inserted lines); its committed blob and
worktree file at that intermediate point both had SHA-256
`8aedb71732113b795aa43c413edb7dd71686d873d95dca4e48d1d54987015f42`.
The discovery agents and Lead Architect did not edit, restore, stage, commit,
or push that file.

The user work then changed again during the gate. Immediately before Builder
handoff, `anime.lua` is unstaged with `0` added and `1` deleted line, worktree
SHA-256
`5950e0045f1a0e3b2660d7ed72347f273be75d4872405a3de0964a58a2944fa7`,
and unstaged-diff SHA-256
`6cc1dbfdafb910406bd39f467bf817d9295bdc4a72c122bae5a09b9d1c0e9216`.
Item 4 proceeds on top of `210b084` but must not modify, restore, stage, or
include `anime.lua` in the dashboard commit. If concurrent user work changes
it again, record the new external state; do not force it back to an earlier
hash.

At the required `390×844` viewport, pinned Playwright Chromium renders the map
stage at:

```text
left   9.796875px
right  380.203125px
width  370.40625px
height 580px
```

An exhaustive sweep of all `533` retained Cypress mobile visible frames,
using the complete `.session-car` rectangle for route slot 1, measured:

```text
minimum full-target clearance  3.0000px
limiting viewport/stage edge   right
route percentage               61.75%
emitted frame index            333
retained candidate             base index 320
compiled left/top              93.2526% / 87.6988%
canonical cubic/t              cubic 13 / 0.5448047649
canonical distance             2145.0787678568
responsive heading             179.2237deg
compiled drift yaw             30.0009deg
```

The fixture probe at route slot 1 is `S10` / `route-aoba`, but target identity
is not causal: all sixteen phase slots traverse the same schedule and therefore
the same limiting route location.

The limiting frame lies inside Cypress mobile corner 6, the South Hairpin
envelope:

```text
entry 57.6977%
apex  63.4867%
exit  66.1883%
sign  positive/right
peak  35.0967deg
```

At the limiting frame, the transformed `.car-body` itself has approximately
`5.74px` right clearance. The full `44px` interactive target, not drifted body
geometry, is the limiting footprint.

### Causal finding

The cause is a bounded responsive presentation rule: the canonical Cypress
centerline reaches `93.2526%` of the rendered mobile stage width while the
route target retains its required `22px` radius. On the actual
`370.40625px`-wide stage:

```text
(1 - 0.932526) * 370.40625 - 22 = approximately 2.993px
```

Browser subpixel rounding yields the measured `3.0000px` target clearance.
The compiler's nominal mobile profile width is `372px`; using that width would
produce only approximately `3.10px`. The roughly `1.59px` nominal-versus-
rendered stage-width difference contributes only about `0.10px` and is not the
material cause. Map-stage height allocation, target-size regression, drift,
body rotation, phase allocation, and clipping behavior are not causal.

The limiting retained frame is between the exact corner landmarks. Testing
only entry/apex/exit would not pin the actual minimum, so the implementation
must retain both the complete-frame clearance sweep and the required
entry/apex/exit target/body audit.

## Approved minimum-clearance contract

At `390×844`, every retained visible Cypress mobile route center must place the
complete rendered `44px` `.session-car` target at least:

```text
12 CSS px
```

from every map-stage edge.

This is a hard browser assertion, not a documentation estimate. The threshold
applies after all responsive ancestor and wrapper transforms. It is measured
from the rendered target rectangle to the rendered map-stage rectangle. No
tolerance may reduce the threshold below `12px`.

The approved `0.94` transform prototype produces approximately `12.61px` at
the same limiting frame, leaving a deterministic subpixel buffer above the
contract. The threshold is intentionally lower than the expected measurement
so pinned Chromium rendering noise cannot create a false failure while still
quadrupling the baseline clearance.

## Approved implementation

Use one Cypress-mobile-only uniform presentation transform:

```text
course scale         0.94
transform origin     exact map-stage / SVG view-box center
wrapper counterscale 1.0638297872340425 (the exact decimal reciprocal used by
                     the approved CSS)
```

Inside the existing `@media (max-width: 759px)` block:

1. Uniformly scale `#cypress-run-art` by `0.94` about the `1000×760` SVG
   view-box center. Use an explicit SVG transform box and center origin.
2. Uniformly scale the Cypress-active `#vehicle-layer` by `0.94` about the
   map-stage center.
3. Add the exact inverse scale to Cypress-active `.vehicle-anchor` after its
   existing `translate(-50%, -50%)`, so each rendered wrapper and all
   descendants retain their current screen-space size.
4. Scope every rule to
   `.dashboard-root[data-track-id="cypress-run"]` and the mobile breakpoint.
   Ridge and desktop rules must not match.

The route-map and route-position layers therefore share the same positive,
uniform, center-origin transform. Canonical `d` strings, artwork coordinates,
generated route percentages/positions, responsive headings, drift envelopes,
and static anchors remain unchanged. Reduced-motion and capability-fallback
cars use their existing static anchors inside the transformed vehicle layer
and remain aligned with the identically transformed route art.

The transform reduces Cypress mobile's displayed course distances and
screen-pixel speed uniformly by `6%`. Architecture explicitly approves that
responsive presentation adjustment. The traversal remains constant-speed,
linear, and exactly `64s`; no percentage, phase, reset, acceleration, or
relative course position changes.

The inverse wrapper scale is mandatory. Scaling the target, car, focus ring,
tooltip, or hit-test surface down to `41.36px` is prohibited.

An architecture prototype of the exact composition measured:

```text
minimum Cypress mobile full-target edge clearance  12.6122px
minimum Cypress mobile phased target separation    63.3332px
minimum Cypress mobile static-anchor separation    57.3888px
rendered route target                              44×44px
```

The transform is a presentation-only responsive allocation adjustment. It
does not authorize route artwork edits, generated keyframe edits, a compiler
special case, target shrinkage, stage overflow, or changes to other profiles.

## Expected files

Before the post-change QA gate, Builder may change only:

```text
dashboard/styles.css
dashboard/tests/dashboard.test.mjs
dashboard/tests/browser/dashboard.spec.mjs
dashboard/tests/BROWSER_VERIFICATION.md
dashboard/tests/screenshots/mobile-cypress-run.png
this design packet (implementation evidence and status only)
```

After independent post-change PASS, `workflow-coordinator` may additionally
change only:

```text
docs/superpowers/plans/2026-07-27-dashboard-roadmap.md
this design packet (final gate/handoff evidence only)
```

`dashboard/README.md` may change only if the existing documented verification
procedure would otherwise become false. Any other source, test, generated
artifact, screenshot, package, lockfile, route source, fixture, adapter,
collector, terminal file, or roadmap-item change returns to architecture.

Expected production code is exactly one scoped CSS change. The route compiler,
canonical sources, renderer, generated geometry, and generated motion CSS are
expected to remain byte-identical.

Exactly one deterministic screenshot is expected to change:

```text
dashboard/tests/screenshots/mobile-cypress-run.png
```

Desktop Cypress, both Ridge references, and the Ridge alias screenshots must
remain byte-identical.

## Protected invariants

The following remain byte- or value-identical:

- both canonical route paths, all control points, route and terrain artwork,
  segment mappings, generated geometry, and canonical source files;
- every generated visible/reset percentage, position, heading, inverse
  heading, drift yaw, inverse drift yaw, opacity, frame count (`527/533`),
  corner entry/apex/exit, corner sign, `15..42deg` same-sign tail-out policy,
  anchor, phase, allocation rule, and reset milestone;
- `64s linear infinite` traversal, `-4s` slot phases, animation names,
  constant-speed groups, capability registration, and fallback policy;
- the rendered `52px` desktop and `44px` mobile target sizes, target clipping
  shape, car dimensions, focus ring thickness, tooltip size, and pointer hit
  behavior;
- upright glyph/code composition and unrotated buttons, wrappers after net
  ancestor/counter-transform composition, tooltips, and focus rings;
- hover, focus, pin, Escape, smoke pause/resume, reduced motion, failed
  capability static fallback, reset behavior, and parked cars;
- desktop Ridge, mobile Ridge, and desktop Cypress rendered geometry;
- fixture/live schemas and behavior, source controls, adapters, collectors,
  track selection, and scheduling; and
- dashboard optionality, browser-local isolation, and every protected tmux,
  WezTerm, wallpaper, LLM-status, terminal-startup, installer, and live-
  collector boundary.

No backend, daemon, service, polling, telemetry, persistence, authentication,
runtime dependency, network request, automatic terminal access, new timer,
runtime geometry compiler, or automatic refresh is authorized.

## Required automated tests

### Static and Node tests

Pin:

- exactly one Cypress-mobile scale and exact inverse counterscale;
- explicit center origins and SVG view-box transform box;
- selectors scoped to Cypress and `max-width: 759px`;
- absence of matching Ridge or desktop transforms;
- unchanged `44px` mobile target, circular clip, focus ring, tooltip/button
  transform isolation, parked rules, route animation assignments, and reduced-
  motion behavior;
- unchanged generated route-motion CSS, generated route geometry, route
  sources, route config, package files, fixtures, adapters, and collectors;
- absence of runtime/network/storage/process/polling/telemetry APIs.

Do not change compiler thresholds or weaken existing containment, overlap,
target, overflow, migration, or generated-artifact tests.

### Browser matrix

Retain both Playwright projects at `1440×900` and `390×844` and both courses.
Use rendered screen coordinates derived from each centerline's
`getScreenCTM()` so the alignment assertion measures the approved responsive
SVG transform rather than assuming an untransformed view box.

The alignment oracle is exact:

1. At an emitted frame, convert its serialized position to the SVG source
   point `{ x: Number(frame.left) * 10, y: Number(frame.top) * 7.6 }`.
2. For a phased percentage between emitted frames, linearly interpolate the
   two surrounding serialized `left/top` values in animation-percentage space,
   including the existing reset milestones, and convert the result the same
   way.
3. Transform that SVG source point with
   `new DOMPoint(x, y).matrixTransform(centerline.getScreenCTM())` and compare
   it to the rendered target center within `0.1px`.
4. Independently compute nearest-centerline error by searching canonical SVG
   path-length points and transforming every candidate through the same CTM;
   retain the existing `<=1px` route error.

The tests must not use the former `stageBox + point/viewBox` mapping and must
not use `responsive profile fraction × SVG totalLength`; Cypress mobile's
timeline is calibrated in nonuniform screen space, so that latter source point
would be false.

For all four route/profile combinations, retain or strengthen assertions for:

- centerline alignment `<=1px`;
- target separation `>=52px` desktop and `>=44px` mobile;
- complete target and body containment;
- zero target/body overlap and zero horizontal overflow;
- tangent error `<=0.25deg`, entry/apex/exit drift sign and `15..42deg`
  magnitude, upright glyph/code error `<=0.25deg`, and unrotated interactive
  UI;
- exact `64s linear` traversal, phases, reset positions/headings/opacity,
  animation capability fallback, and reduced motion;
- hover, focus, pin, Escape, smoke pause/resume, focus ring, tooltip, hit
  testing, parked states, fixture/live behavior, and clean diagnostics.

For Cypress mobile specifically:

1. At each of all `533` retained visible frame times, inspect every visible
   phased route car, not only route slot 1. Assert every complete target and
   transformed body is contained; target-center separation is `>=44px`;
   target and body overlaps are zero; scheduled-center error is `<=0.1px`;
   nearest-centerline error is `<=1px`; and the route-slot-1 edge clearance is
   `>=12px`. Failure output must name the emitted frame, percentage, limiting
   edge, slot/pair, minimum separation, and measured rectangles. This sweep
   must reproduce the expected approximately `63.33px` phased minimum as
   evidence while retaining `44px` as the normative floor.
2. Sample every corner entry, apex, and exit as named subcases of that complete
   sweep. At each landmark, additionally assert compiled yaw/sign,
   entry/exit zero, apex `15..42deg`, and upright glyph/code composition for
   every visible phased route car.
3. Quantitatively pin screen-space geometry after ancestor/counter-transform
   composition. Wrapper/button rectangles are exactly `44×44px` within
   `0.1px`. Because pinned Chromium does not expose `Element.getBoxQuads()`,
   use a Playwright Chromium CDP session and `DOM.getContentQuads` for the body,
   glyph, code, and tooltip; compute the four edge lengths from the returned
   eight coordinates and require each to differ by at most `0.1px` from its
   corresponding unscaled mobile measurement. Resolve each element through
   `Runtime.evaluate`/its remote object ID and release the object after the
   quad query. A rotation-sensitive axis-aligned bounding box is not an
   acceptable substitute.

   Focus border remains exactly `3px`; reconstruct its exterior quad from the
   wrapper's CDP quad plus the computed `-3px` inset and border. For the
   mobile-thinking puff pseudo, which has no element node for
   `DOM.getContentQuads`, multiply the computed ancestor and pseudo
   `DOMMatrixReadOnly` transforms in paint order, apply the product to the
   pseudo's computed `3×3px` local box, and require the reconstructed edge
   lengths and matrix scale to match the unscaled sample within `0.1px`.
   Continue to assert the existing exact pseudo translation, opacity,
   intersection, hit testing, and pause behavior.

   Take every unscaled comparison from the same frozen Cypress DOM/content with
   a test-only injected rule that temporarily disables the three item 4
   transforms; do not compare tooltips with different track text, and do not
   add a production test hook. Compare supported quads/reconstructed quads so
   translation or rotation does not masquerade as scaling.
4. Assert the complete wrapper-owned `3px` focus ring retains at least `9px`
   stage-edge clearance at the limiting frame.
5. Assert the mobile thinking puff keeps its approved size, envelope,
   visibility, stacking, pointer inertness, and pause behavior after transform
   composition. Active mobile atmosphere remains intentionally hidden.
6. Assert the transformed vehicle-layer stacking context does not place route
   cars, focus rings, tooltips, or the overflow notice behind or in front of
   the wrong stage content.
7. Switch Cypress to Ridge and back while a route button is focused and pinned;
   the transform must appear/disappear immediately without changing button
   identity, focus, pin, tooltip state, or route allocation.
8. Assert computed scale is present only for mobile Cypress. Desktop Cypress
   and both Ridge profiles must retain their prior computed transforms.

### Static responsive states

Under both `prefers-reduced-motion: reduce` and failed angle-property
registration, construct a test-only sixteen-route-session Cypress fixture
without changing the production fixture or session contract. It may reuse the
renderer-produced route-car subtree and the exact generated catalog anchors;
it must not add a production test hook.

Audit all sixteen static anchors and assert:

- target edge clearance `>=12px`, including the expected limiting anchor and
  measured minimum;
- focus-ring exterior clearance `>=9px`;
- exact catalog-anchor alignment within `0.1px`, computed by transforming the
  anchor's canonical `{x,y}` through the Cypress art CTM (anchors with approved
  lateral offsets are not incorrectly forced to the centerline);
- `44×44px` target size, target/body containment, `>=44px` target-center
  separation, and zero target/body overlap;
- approved static responsive heading and upright glyph/code markings;
- no traversal, drift clock, or smoke.

The expected prototype static minima are approximately `13.48px` target-edge
clearance at `R06` on the right, and `57.39px` target-center separation.
`12px` and `44px` remain the normative floors.

Failures, skips, console warnings, console errors, and page errors must remain
zero.

## Deterministic screenshots and normal-speed gate

Refresh only `mobile-cypress-run.png` using the existing deterministic fixture
capture: select Cypress, pause route animations at `16000ms`, pause smoke at
its existing deterministic sample, wait two animation frames, and capture with
no focus, tooltip, pin, live import, or failure state.

Confirm every other tracked dashboard screenshot is byte-identical, including
the five other course/alias captures.

At normal speed, review one complete `64s` lap for each course at each required
viewport:

```text
Ridge Pass   1440×900
Ridge Pass   390×844
Cypress Run  1440×900
Cypress Run  390×844
```

Inspect all corners, route-center alignment, target/body containment,
separation, glyph/code uprightness, smoke, focus, tooltip, hover, pin, Escape,
reduced motion, reset, and parked states. Cypress mobile must retain its
recognizable course identity after the uniform scale. Any apparent route/body
separation, target shrinkage, newly introduced or worsened focus-ring/tooltip
clipping, tooltip scaling/rotation, unintended desktop/Ridge change, or
unstable reset returns to architecture. Inherited mobile tooltip clipping
proven no worse on the same frozen DOM is protected non-regression evidence
and is nonblocking for item 4.

## Verification

Required commands:

```sh
npm --prefix dashboard run routes:check
npm --prefix dashboard run test:unit
npm --prefix dashboard run test:browser
node --check dashboard/tests/dashboard.test.mjs
node --check dashboard/tests/browser/dashboard.spec.mjs
git diff --check
```

Also confirm:

- generated artifacts are current and byte-identical;
- browser-spec and every changed JavaScript file passes syntax checking;
- ports `43917` and `43918` are clear after verification;
- only approved files are staged and committed;
- no protected dependency, runtime/network API, telemetry, polling, storage,
  terminal, fixture/live, route-artwork, or roadmap item 5–6 change appears;
- `anime.lua` is never edited or restored by item 4, is absent from the item 4
  index and dashboard commit, and remains unstaged by this task; compare its
  final state to the recorded pre-Builder hash and report any independently
  observed concurrent user change rather than overwriting it.

## Observability and rollback

Runtime observability impact is none. Existing browser assertions, clean
diagnostics, deterministic screenshots, and the documented normal-speed review
are sufficient for this presentation-only rule. No runtime log, metric, trace,
event, timer, storage value, or diagnostic UI is added.

Rollback is one revert of item 4. It restores the former mobile Cypress
presentation and approximately `3px` edge clearance. There is no data or
generated-artifact migration.

## Weak claims and open visual unknowns

- `12.6122px` is a pinned-Chromium prototype result; the contract is the
  independently asserted `12px` floor, not that exact decimal in every browser.
- A `0.94` uniform scale mathematically preserves topology and relative shape,
  but preservation of perceived Cypress identity remains a normal-speed visual
  gate.
- The approved presentation transform uniformly reduces Cypress mobile's
  displayed course distance and screen-pixel speed by `6%` while preserving
  the exact `64s linear` timing contract.
- SVG `transform-box: view-box`, transform origin, and ancestor/inverse
  composition must be checked through rendered matrices and bounds; static CSS
  inspection alone is insufficient.
- Browser automation can prove sampled and retained-frame bounds but cannot
  replace the required four normal-speed full-lap reviews.
- The full-frame target sweep proves target clearance along the emitted
  piecewise-linear motion schedule. Corner entry/apex/exit sampling separately
  proves drifted body envelopes and all phased targets at the required
  landmarks.

## Builder implementation evidence

Builder implemented the approved production change exactly in
`dashboard/styles.css`: Cypress mobile route art and the vehicle layer use the
centered `0.94` scale, the SVG declares `transform-box: view-box` and the
`500px 380px` view-box origin, and Cypress mobile route wrappers use the exact
`1.0638297872340425` counter-scale after `translate(-50%, -50%)`. No route
source, config, compiler, generated artifact, renderer, runtime, fixture,
adapter, package, roadmap, or protected terminal file was changed.

The exhaustive `390x844` moving audit passed all `533` retained frames and
every visible phased car:

```text
minimum Route Slot 1 target clearance  12.6122131348px, right edge
limiting emitted frame / percentage    333 / 61.75%
minimum focus-ring exterior clearance   9.6122131348px
minimum phased center separation        63.2960687468px
maximum scheduled CTM error              0.0204623008px
maximum nearest transformed-path error   0.0968262887px
target/body clipping and overlaps        0
```

Reduced-motion and failed-capability sixteen-anchor audits were identical:
`13.4934692383px` target clearance at R06, `10.4934692383px` focus clearance,
`57.3840332031px` separation, `<=0.1px` catalog-anchor CTM alignment, and zero
motion, drift, smoke, clipping, or overlap.

The scheduled oracle uses only serialized `left/top` interpolation through
`getScreenCTM()`. The independent nearest-path oracle globally searches `2049`
precomputed CTM-transformed samples across the complete canonical SVG path for
every target, then refines only the global winning neighborhood; it does not
use schedule-correlated canonical distance.

CDP `DOM.getContentQuads` proved the wrapper, button, body, glyph, code, and
tooltip retain their unscaled dimensions within `0.1px`. The axis-aligned
wrapper quad's focus exterior is reconstructed vertex-by-vertex from all four
computed `-3px` insets and `3px` borders, compared with the same frozen
transform-disabled DOM after translation normalization, and asserted
`50x50px`. The independently reconstructed mobile-thinking puff also remains
within `0.1px`. All sixteen static bodies have explicit diagnostic stage-edge
containment assertions. The full browser matrix passed `32/32` tests at both
viewports with zero failures, skips, warnings, errors, or page errors. The
Node suite passed `141/141`.

Only `dashboard/tests/screenshots/mobile-cypress-run.png` changed, from
SHA-256
`7bb28e69eb1f6b5281537c777e842b61417b377f7d8c88acaff0d06ada9e3079`
to
`827c8429e08534d8cd7d891f61e05be2a540e936ab14ad5a9201f915d5cc08f2`;
the other eight dashboard screenshot hashes remained byte-identical.

Normal-speed 64-second observations for both courses at both viewports showed
no Item 4 regression in course identity, corners, alignment, containment,
separation, upright markings, smoke, focus rings, interactions, reset, or
parked states. The architecture-requested exact `32000ms` comparison on the
same frozen Cypress mobile DOM measured the unrotated tooltip at
`255.99998x109.07813px` with Item 4 and `256x109.07813px` with all three Item
4 transforms disabled. Item 4 reduced inherited bottom overflow from
`21.31085px` to `10.97229px` and slightly reduced right overflow from
`53.6875px` to `53.39404px`. Untouched Ridge also retained inherited
horizontal tooltip clipping (`118.46875px`). Architecture classified this as
protected, improved non-regression evidence and nonblocking; no tooltip fix
was added.

## Final independent gate and handoff evidence

The independent pre-implementation QA-planning gate returned **PASS** and
authorized the Builder. The final independent post-change QA returned
**PASS**, with no blockers, authorizing coordination closeout and commit/push.
The approved technical direction and contracts were not changed during this
closeout.

Final verified implementation: one Cypress-mobile-only centered `0.94`
presentation transform on route art and vehicle layer, plus the exact
`1.0638297872340425` wrapper counter-scale. The measured moving minimum rose
from approximately `3.0px` to `12.612213px`; focus clearance is `9.612213px`
and phased separation is `63.296069px`. Static reduced-motion and
failed-capability audits measured `13.493469px` target clearance,
`10.493469px` focus clearance, and `57.384033px` separation.

Verification evidence: `routes:check`; 141/141 Node tests; 32/32 browser
tests; JavaScript syntax checks; `git diff --check`; generated-artifact,
route/protected-boundary, and port (`43917`/`43918`) audits; and four
normal-speed 64-second windows (both courses at desktop and mobile). Only
`dashboard/tests/screenshots/mobile-cypress-run.png` changed. The inherited
mobile tooltip clipping decision was independently confirmed no worse and
remains nonblocking protected non-regression evidence.

The externally advanced predecessor is `bee9df6`; `anime.lua` is clean and
was not edited, restored, staged, or included by item 4. No model or reasoning
exception occurred (native workflow-coordinator defaults used); no runtime
observability was added or changed; and no Notion synchronization was in scope
or performed. Commit and push are authorized; release status is established
by Git history.
Item 5, Opt-in live workflow, is next recommended and remains unimplemented;
item 6 is deferred after it.

## Independent pre-implementation QA packet

```text
Role:
You are an independent Lead Architect auditing Night Pass dashboard roadmap
item 4, Cypress mobile clearance.

Stage:
Pre-implementation QA-planning gate. Builder is blocked unless the verdict is
PASS.

Scope:
Audit this complete design packet against:
- docs/superpowers/plans/2026-07-27-dashboard-roadmap.md
- docs/superpowers/specs/2026-07-26-dashboard-multi-track-design.md
- docs/superpowers/specs/2026-07-28-dashboard-route-compiler-design.md
- docs/superpowers/specs/2026-07-28-dashboard-tangent-atmosphere-design.md
- docs/superpowers/specs/2026-07-28-dashboard-corner-aware-drift-design.md
- current package, route/compiler/generated, renderer/CSS, Node/Playwright,
  browser-evidence, and screenshot files.

Architecture to challenge:
- measured 3px right-edge limiter at Cypress mobile 61.75%, frame 333/base
  320, inside corner 6;
- causal attribution to the responsive course extent plus fixed 44px target;
- 12 CSS px hard minimum at 390×844;
- Cypress-mobile-only 0.94 uniform course-art/vehicle-layer center scale;
- exact inverse vehicle-wrapper scale preserving all screen-space target/UI
  dimensions;
- unchanged canonical art/path and generated route artifacts;
- all-frame clearance plus every-corner entry/apex/exit target/body testing.

Attack:
1. transform origin/box mismatches and route-to-centerline displacement;
2. target, focus, tooltip, atmosphere, body, glyph, and hit-area shrinkage;
3. reduced-motion/static-anchor and capability-fallback misalignment;
4. phased-target or body overlap introduced by reduced center separation;
5. clipping, overflow, reset, interaction, parked, screenshot, and visual
   identity regressions;
6. unintended Ridge/desktop matching or compiler/artwork changes;
7. insufficient thresholds, samples, diagnostics, or protected-boundary audit.

Observability:
The design chooses no new runtime observability. Determine whether tests,
screenshots, and full-lap evidence are sufficient.

Out of scope:
Roadmap items 5-6, route artwork edits, compiler/keyframe changes, target
shrinkage, stage overflow, fixture/live or terminal changes, new dependencies,
services, persistence, telemetry, polling, and network/process integration.

Output required:
1. PASS or FAIL.
2. Explicit Builder authorization: may begin / must remain blocked.
3. Blockers ordered by severity with minimal resolutions.
4. Measurement/cause/threshold audit.
5. Transform, alignment, target-size, interaction, accessibility, reduced-
   motion, and fallback audit.
6. Test, screenshot, and normal-speed review sufficiency audit.
7. Protected-contract and observability audit.
8. Non-blocking recommendations separated from blockers.
9. Explicit sign-off status and remaining conditions.
```
