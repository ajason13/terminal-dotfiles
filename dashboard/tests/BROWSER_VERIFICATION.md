# Dashboard browser verification

The checked-in automated suite covers the stable, fixture-only browser
regression surface in Chromium at 1440x900 and 390x844:

```sh
npm --prefix dashboard ci
npm --prefix dashboard exec -- playwright install chromium
npm --prefix dashboard run test:browser
```

The test runner starts and stops its own loopback-only Python static server.
Normal dashboard use never starts that server. The suite fails on browser
console warnings, console errors, and uncaught page errors; it retains
screenshots and traces only on failure in ignored dashboard-local result
directories.

The rest of this document is the supplemental, manual
`playwright-cli`-driven procedure. It covers generated live-import lifecycle,
deeper accessibility inspection, exhaustive geometry sweeps, and intentional
reference screenshots that would be brittle or inappropriate in the
fixture-only automated suite. The dependency-free Node tests continue to cover
contracts and injected lifecycle/process boundaries.

The current Auto label is `Auto · workday schedule`. Exact browser-local
08:30, 12:30, and 16:30 behavior, before-open/after-close selection, next-day
08:30 targeting, clock jumps, and DST construction are deterministic clock
contracts covered by `multi-track.test.mjs`; this manual procedure does not
claim wall-clock boundary evidence.

## Lantern Coil third-course evidence — 2026-07-31

Roadmap item 6 adds the exact canonical `lantern-coil` open spiral as the third
and final configured course, after Ridge Pass and Cypress Run. The compiler
retains 528 visible frames per responsive profile (513 equal-distance base
positions plus 15 cubic boundaries), sixteen ordered static anchors, the shared
64-second linear lap, exact four-second phase spacing, and no course-specific
presentation scale.

The committed compiler reproduced these measurements:

```text
desktop displayed path length                 2881.5085400383px
mobile displayed path length                  1294.2558205702px
canonical 1024-step nonlocal spacing minimum    76.6568482792 units
desktop nonlocal spacing minimum                 68.8020641682px
mobile nonlocal spacing minimum                  54.9833118647px
desktop emitted-frame target edge clearance      57.1615600000px
mobile emitted-frame target edge clearance        4.6426400000px
desktop 16-anchor target edge clearance           87.5999600000px
mobile 16-anchor target edge clearance             14.4303320000px
desktop 16-anchor center separation               101.8898707548px
mobile 16-anchor center separation                 59.5665035316px
```

A flattened 32-subdivision-per-cubic intersection audit found zero
self-intersections. The detector produced exactly five positive clockwise
regions at canonical apex fractions `0.072265625`, `0.421875`,
`0.693359375`, `0.880859375`, and `0.98046875`. Desktop peak yaws are
`34.0332`, `30.7834`, `33.1415`, `40.164`, and `19.1235` degrees; mobile
peaks are `19.8528`, `18.6834`, `20.1688`, `23.8153`, and `25.0196`
degrees. Desktop retains 359 exact zero-yaw frames and mobile retains 303,
including every envelope boundary and separated between-envelope frames.

The dependency-free suite passed `159/159`. The final two-profile Playwright
matrix passed `40/40` and covers fixtures and fresh synthetic live mode for
all three courses, every retained Lantern frame, the full sixteen-slot
Lantern capacity,
759/760px and 959/960px layout boundaries, all compiled corner landmarks,
normal and reduced motion, hover/focus/pin/Escape, switching, accessibility,
and clean console/page-error channels. Every target and focus exterior stayed
contained; phased targets and the sixteen static anchors did not overlap;
course art and vehicle transforms remained isolated. The independently
authored nested terraces remained visually distinguishable as separate road
arms at both reference sizes.

Exactly two new neutral fixture references were captured with the course
selected, traversal paused at `16000ms`, no focus, tooltip, pin, pressed,
import, skip-link, or failure state, and mobile `fullPage: true`:

```text
desktop-lantern-coil.png  1440x900  sha256 7161cf45bc822eb6fad88476621319f62a75a375ebe2ee9d66a814774505cfa1
mobile-lantern-coil.png   390x1673  sha256 ef29439aa4e4229c4f17a022bb72b38566c9e3cd64a125ed2f522622c2ecde8d
```

The ordinary browser suite prepares and checks this neutral reference state
without writing either tracked PNG. Screenshot updates are an explicit,
test-only operation that runs the same test in both viewport projects:

```sh
DASHBOARD_UPDATE_SCREENSHOTS=1 npm --prefix dashboard run test:browser -- --grep "prepares the neutral Lantern Coil reference"
```

Only use that command when intentionally refreshing the two Lantern Coil
references. Review the resulting bytes and dimensions before retaining them;
the default `npm --prefix dashboard run test:browser` command must leave all
tracked screenshots untouched.

All nine prior screenshot hashes remained byte-identical. Browser commands
used synthetic data only, and ports 43917 and 43918 were clear afterward.

## Cypress mobile clearance implementation evidence — 2026-07-28

Roadmap item 4 applies a Cypress-mobile-only centered `0.94` presentation
scale to the route SVG and vehicle layer, with the exact
`1.0638297872340425` inverse wrapper scale. Canonical route sources, generated
geometry and motion, timing, phases, responsive headings, drift frames,
anchors, target/body sizes, and fixture/live behavior remain unchanged.

Pinned Chromium at `390x844` produced these exhaustive moving results across
all 533 retained Cypress mobile frame times and every visible phased route
car:

```text
minimum Route Slot 1 target clearance  12.6122131348px, right edge
limiting emitted frame / percentage    333 / 61.75%
minimum focus-ring exterior clearance   9.6122131348px
minimum phased center separation        63.2960687468px
maximum scheduled CTM error              0.0204623008px
maximum nearest transformed-path error   0.0968262887px
target/body clipping and overlaps        0
horizontal overflow                      0
```

The scheduled oracle uses only serialized `left/top` interpolation transformed
through the centerline's `getScreenCTM()`. The independent nearest-path oracle
precomputes `2049` CTM-transformed samples across the complete canonical SVG
path, globally searches every coarse candidate for every target, and refines
only the globally winning neighborhood. It does not use schedule-correlated
canonical distance. The test audits all visible phased targets at every
retained frame and all visible phased cars at every named corner entry, apex,
and exit.

CDP `DOM.getContentQuads` comparisons against the same frozen DOM with the
three presentation transforms disabled retained the body, glyph, code,
tooltip, and `44x44px` wrapper/button within `0.1px`. The wrapper quad is
explicitly asserted axis-aligned in CDP TL/TR/BR/BL order. Its focus exterior
vertices are reconstructed from all four computed `-3px` insets and `3px`
borders, normalized for translation, compared vertex-by-vertex and
edge-by-edge with the transform-disabled exterior within `0.1px`, and asserted
to be `50x50px`. The mobile-thinking puff remains independently reconstructed
through ancestor and pseudo matrices.

The test-only sixteen-route-session fixture produced identical reduced-motion
and failed-capability results:

```text
minimum target clearance        13.4934692383px at R06
minimum focus-ring clearance    10.4934692383px at R06
minimum static separation       57.3840332031px
anchor CTM error                <=0.1px
target/body overlaps, motion,
drift, and smoke                0
target/body stage clipping       0
```

Verification passed `141/141` Node tests and `32/32` Playwright profile tests
with zero failures, skips, console warnings, console errors, or page errors.
The Playwright matrix covers both courses at `1440x900` and `390x844`,
computed-transform course isolation, stacking, CDP content quads, focus and
hit behavior, hover/pin/Escape, track switching while focused and pinned,
reduced motion, capability fallback, reset, smoke, and parked states.

Only `mobile-cypress-run.png` changed. Its SHA-256 changed from
`7bb28e69eb1f6b5281537c777e842b61417b377f7d8c88acaff0d06ada9e3079`
to
`827c8429e08534d8cd7d891f61e05be2a540e936ab14ad5a9201f915d5cc08f2`.
All eight other tracked dashboard screenshots retained their pre-change
SHA-256 bytes. The refreshed reference uses the documented `16000ms`
traversal and 40% smoke sample with no focus, tooltip, pin, import, or failure
state.

Nine normal-speed samples spanning a complete 64-second observation window
were reviewed for Ridge and Cypress at both required viewports. Across all
four profiles, course identity, all corners, route/body alignment, target/body
containment, separation, upright glyphs/codes, smoke policy, focus rings,
hover, pin, Escape, reduced motion, reset, and parked states showed no Item 4
regression. Cypress mobile remained recognizable after the uniform scale.

One inherited visual issue remains outside Item 4's approved CSS scope:
mobile tooltips can be clipped by the map stage when a moving route car is
focused near a stage edge. On the same frozen Cypress DOM at exactly
`32000ms`, the enabled Item 4 composition rendered the unrotated tooltip at
`255.99998x109.07813px`, with `53.39404px` right and `10.97229px` bottom
overflow. Test-only disabling all three Item 4 transforms on that same DOM
rendered it at `256x109.07813px`, with `53.6875px` right and `21.31085px`
bottom overflow. Item 4 therefore preserves tooltip dimensions and angle,
slightly improves right intersection, and improves bottom intersection by
about `10.34px`; it does not introduce the clipping.

The same exact-time Ridge sample, which no Item 4 selector matches, rendered
the same `256x109.07813px` unrotated tooltip with `118.46875px` right
overflow. Target/focus-ring clearance remained `107.03967px`/`104.03967px`
for enabled Cypress, `96.76563px`/`93.76563px` for transform-disabled
Cypress, and `93.53125px`/`90.53125px` for Ridge. The automated tooltip-size
and interaction contracts pass. The inherited clipping is recorded for
architecture disposition; Item 4 does not broaden scope to change route-aware
tooltip placement.

## Corner-aware drift evidence — 2026-07-28

Item `3a — Corner-aware drifting` replaced the independent active/thinking
drift clocks with yaw compiled into the existing route frames. The canonical
detector produced exactly eight Ridge and eight Cypress corners. All four
responsive schedules reproduced the approved entry/apex/exit tables, retained
527 Ridge and 533 Cypress visible frames, and preserved the 64-second linear
traversal, four-second phases, positions, percentages, headings, and reset
milestones.

Visual chassis peak yaw in corner order is:

```text
Ridge desktop:  -15.6934, 42, -42, 25.3841, -15.7379, 42, -42, 15.0556
Ridge mobile:   -20.6179, 42, -34.5487, 32.8126, -15, 38.6441, -27.5844, 23.5902
Cypress desktop: 31.9633, -35.5407, 34.0024, -32.8155, -35.8418, 41.0754, 33.356, 38.8397
Cypress mobile:  29.048, -38.246, 30.9951, -29.6761, -36.6616, 35.0967, 24.8633, 40.8003
```

The compiler's `corner.sign` remains positive for clockwise/right route turns
and negative for counterclockwise/left route turns. Serialized chassis yaw
uses that same sign so the nose points into the turn and the rear reads
outward. The generic magnitude policy is a `15deg` floor,
linear scaling from a `15deg` to `90deg` responsive tangent window, and a
`42deg` cap. Entry/exit are exact zero, apex is the exact visual peak,
and both halves use canonical-distance smoothstep interpolation. Every
serialized inverse is the negation of the once-rounded yaw.
The maximum adjacent serialized yaw deltas are `15.7379deg` Ridge desktop,
`20.6179deg` Ridge mobile, `6.6907deg` Cypress desktop, and `7.202deg`
Cypress mobile, all below the `45deg` no-long-arc guard.

The dependency-free suite passed 140/140 with zero failures or skips. The
Playwright matrix passed 22/22 at 1440x900 and 390x844 with zero failures,
skips, console warnings, console errors, or page errors. It sampled
entry/apex/exit for every corner on both courses and both profiles, and
verified route-turn and visual yaw sign, bounds/inverse,
`<=0.25deg` glyph/code upright error, zero straight yaw, stronger tight-corner
yaw, `<=1px` centerline alignment,
`>=52px`/`>=44px` target separation, containment, zero horizontal overflow,
one 64-second linear wrapper animation, and no `.car-motion` animation.
Hover, focus, pin, Escape, both smoke pseudos, reduced motion, capability
failure/collision/caching, static headings, parked cars, resets, track
switching, and focus identity also passed.

Exactly six fixture screenshots were refreshed and reviewed:
`desktop-ridge-pass.png`, `desktop-cypress-run.png`, `mobile-ridge-pass.png`,
`mobile-cypress-run.png`, plus the byte-identical Ridge aliases `desktop.png`
and `mobile.png`. Desktop captures are 1440x900; mobile full-page captures are
390x1673. The capture selected the course, paused every route animation at
`16000ms`, paused smoke at its 40% sample, waited two animation frames, and
captured with no nested drift animation to seek. No focus, tooltip, pin, live
import, or failure state is present.

Normal-speed recordings were run serially at both required viewports after
fresh cache-disabled hard loads.
One complete 64-second Ridge lap and one complete 64-second Cypress lap were
reviewed per viewport. Ridge boundary 8 received three additional true-speed
passes per viewport and was inspected at 0.5-second frame spacing. The
same-sign chassis yaw was visibly distinguishable at normal dashboard scale
after the hard reload: the nose pointed into each turn and the rear read
outward. Rendered `.car-body` bounds stayed contained and nonoverlapping at
every apex, including Cypress mobile and Ridge boundary 8. Direction,
entry/apex/exit legibility, straights, upright glyphs/codes, subtle smoke,
route-center stability, containment, and session clearance remained sound.
The short Ridge mobile corner-1 exit settled continuously without a snap.
There was no reverse spin, unintended long arc, sign flicker, left/right
ambiguity, clipping, or unstable boundary-8 behavior. The automated
interaction matrix supplied the hover/focus/pin/Escape and reduced-motion
exercise for the same builds.

## Tangent orientation and atmosphere evidence — 2026-07-28

The generated schedules retain 527 visible Ridge frames and 533 visible
Cypress frames per responsive profile. Route geometry, public anchors,
keyframe percentages/positions, 64-second timing, four-second phases, and the
hidden reset are unchanged. Generated headings at the start of each lap are
`98.795deg`/`112.3083deg` for Ridge desktop/mobile and
`86.0663deg`/`79.6654deg` for Cypress desktop/mobile.

The fixture screenshots use a stable neutral state: every Web Animation is
paused, traversal is set to `16000ms`, smoke is set to its 40% sample, and
other animations are set to zero. Corner yaw is sampled from the traversal
keyframe itself; there is no independent drift cycle. The first
active/thinking computed route headings were:

```text
Ridge desktop:   239.812deg, 125.622deg
Cypress desktop: 90deg, 270deg
Ridge mobile:    199.379deg, 151.335deg
Cypress mobile:  111.542deg, 270deg
```

Exactly six fixture-only references were refreshed:
`desktop-ridge-pass.png`, `mobile-ridge-pass.png`,
`desktop-cypress-run.png`, `mobile-cypress-run.png`, and the Ridge aliases
`desktop.png`/`mobile.png`. They contain no focus, tooltip, pin, live import,
or failure state.

Normal-speed 64-second recordings were reviewed for both tracks at 1440×900
and 390×844. Ridge boundary 8 was replayed three times at each viewport. The
authored turn is abrupt but reads as the car following the visible V-shaped
road join; it does not reverse, hide the upright state marking, obscure the
lamps, clip the target, or produce a multi-turn spin. No smoothing was added.
Active/thinking atmosphere remains faint and behind the car, and the mobile
single-puff reduction does not obscure the glyph or map code.

Pre-audit verification passed 122/122 dependency-free Node tests and 12/12
fixture-only Playwright tests. That browser suite covered both viewports with
clean consoles, responsive 64-second traversal, `<=1px` centerline alignment,
`>=52px`/`>=44px` target separation, zero target clipping, zero horizontal
overflow, wrapper/drift hover, focus, and pin pause/resume for the original
active-route case, atmosphere sibling DOM order and pointer inertness, and
reduced-motion route/drift disabling. It did not establish the complete
both-track wrapper/drift/both-pseudo pause matrix or pseudo reduced-motion
coverage now defined by the expanded suite.

## Post-change QA remediation coverage — 2026-07-28

After independent post-change QA returned FAIL on evidence completeness and
contextual diagnostics, focused Node coverage was expanded to 127/127 passing
tests. The named tests now pin:

- outgoing start, every internal boundary, final endpoint, and map-space
  static-slot derivatives, including nonfinal segment `at=1`;
- raw `180±1e-9` ambiguity, post-serialization ties, inverse precision,
  contextual route/profile/frame-or-slot failures, and the four committed
  pre-heading schedule hashes;
- exact reset headings and declaration order, unique ordered desktop/mobile
  static selectors, selector specificity/source order, atmosphere gradients,
  frame values, envelopes, stacking, mobile reductions, parked exclusion, and
  cached-failure stale-attribute removal/no-throw behavior.

The expanded Playwright file defines 22 project-expanded cases. The complete
matrix passed 22/22 after the test-harness corrections and mobile atmosphere
cascade fix. In addition to the earlier regression surface, named cases cover
both tracks and both viewports for:

- seven timeline samples plus every internal boundary, midpoint registered
  angle interpolation, and `<=0.25deg` heading/forward-axis agreement;
- `98.8/99.2/99.6/100` position, heading, opacity, visibility, and upright
  glyph/code resets;
- 25/50/75% drift yaw/inverse and glyph/code upright composition;
- missing registration, failure positions 1–4, collision/partial
  registration, and cached success/failure on a second stale root;
- pseudo width, height, duration, delay, transform, opacity, envelope,
  intersection, mobile visibility, visible-pixel hit testing, focus/bounds,
  document overflow, and all-layer inspection pause/resume.

The successful full-matrix command was:

```sh
npm --prefix dashboard run test:browser
```

## Route compiler implementation evidence — 2026-07-28

The fixture-only Playwright suite passed 12/12 tests across its two Chromium
projects (1440x900 and 390x844). It verified synchronous generated SVG
hydration, six ordered segment placeholders per course, generated/base CSS
cascade, responsive animation names, 64-second linear timing, four-second slot
phases, pause/focus/pin/Escape behavior, reduced motion, 24 fixture sessions,
full-target containment, and zero horizontal overflow with clean consoles.
Its compiler-specific sweep fixes each route animation at `0`, `1234`,
`7777`, `15999`, `31888`, `47999`, and `63000` milliseconds for both courses
and projects. Every visible route center remained within `1px` of the hydrated
SVG centerline, every pair retained at least the profile's `52px`/`44px`
target diameter, and zero full targets clipped the map stage.
The actual map-stage boxes were `1159.609375×681.625` desktop and
`370.40625×580` mobile. No reference screenshot changed.

Compiler output contains 527 visible Ridge frames for both profiles and 533
visible Cypress frames for both profiles, followed by exactly three reset
frames. Maximum audited serialized chord deviation was `0.4255416753px`
Ridge desktop, `0.0361384028px` Ridge mobile, `0.1752953458px` Cypress
desktop, and `0.0988015444px` Cypress mobile. The largest generated-to-legacy
motion delta at every legacy visible keyframe was `0.0651467881px` Ridge
desktop, `0.1364750696px` Ridge mobile, `0.0013456315px` Cypress desktop, and
`0.0006890457px` Cypress mobile.

Generated anchor changes from the legacy centers, in `R01..R16` order, are:

```text
Ridge Pass
R01 +0.0000,+0.0000   R02 +0.0000,+0.0000
R03 +0.0022,+0.0007   R04 +0.0016,-0.0001
R05 +0.0000,+0.0000   R06 +0.0000,+0.0000
R07 +0.0000,+0.0000   R08 -0.0034,-0.0017
R09 +0.0003,-0.0001   R10 -0.0027,+0.0013
R11 +0.0000,+0.0000   R12 -0.0026,+0.0016
R13 +0.0015,+0.0001   R14 +0.0045,-0.0016
R15 +0.0000,+0.0000   R16 +0.0000,+0.0000

Cypress Run
R01 +0.0000,+0.0000   R02 +0.0000,+0.0000
R03 +0.0006,+0.0021   R04 -0.0012,-0.0013
R05 +0.0000,+0.0000   R06 +0.0000,+0.0000
R07 +0.0000,+0.0000   R08 +0.0000,+0.0000
R09 +0.0000,-0.0001   R10 -0.0003,-0.0011
R11 +0.0000,+0.0000   R12 +0.0000,+0.0000
R13 +0.0000,+0.0000   R14 +0.0000,+0.0000
R15 +0.0000,+0.0000   R16 +0.0000,+0.0000
```

The maximum anchor-center delta is `0.0048` view-box unit. Canonical displayed
centerline and segment control points have zero geometric delta. Final
independent post-change review remains required before roadmap completion.

## Prepare fresh synthetic inputs

In the browser terminal, start one shell at the repository root and keep using
that same shell for fixture generation, every `playwright-cli` command, and
cleanup:

```sh
DASHBOARD_BROWSER_FIXTURES="$(mktemp -d /tmp/night-pass-browser.XXXXXX)"
node dashboard/tests/generate-browser-fixtures.mjs "$DASHBOARD_BROWSER_FIXTURES"
```

The generator uses the current `new Date().toISOString()` value for top-level
`observedAt` and every activity timestamp. It creates:

- `$DASHBOARD_BROWSER_FIXTURES/live-valid.json`: schema v2 with active,
  permission, and four unknown sessions, including one unknown overflow;
- `$DASHBOARD_BROWSER_FIXTURES/live-invalid.json`: schema v1, for rejection.

The Node test imports the generator with an injected timestamp, validates the
valid output using that same clock, rejects the invalid output, and removes its
temporary files.

## Start loopback preview and browser

In the separate preview-server terminal, run only:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dashboard
```

Back in the original browser terminal—the same shell where
`DASHBOARD_BROWSER_FIXTURES` was defined—run:

```sh
playwright-cli -s=dashboard-live open http://127.0.0.1:4173/
playwright-cli -s=dashboard-live resize 1440 900
```

## Desktop lifecycle and assertions

Run the lifecycle in this exact order:

1. Confirm initial `Fixtures · Night sector` and 24 session buttons.
2. Import `live-valid.json`.
3. Import `live-valid.json` again.
4. Import `live-invalid.json`; confirm exactly
   `Live snapshot rejected; showing fixtures.` and 24 fixture buttons.
5. Import `live-valid.json` again.
6. Activate **Reset to fixtures** and confirm 24 fixture buttons with no
   rejection notice.

Example import:

```sh
playwright-cli -s=dashboard-live run-code "async page => {
  await page.locator('#snapshot-file').setInputFiles('${DASHBOARD_BROWSER_FIXTURES}/live-valid.json');
  await page.waitForFunction(() => document.querySelector('#source-label').textContent.startsWith('Live'));
}"
```

For each transition, inspect source and age labels, actual input
`disabled`/`aria-busy` settlement, duplicate-node absence, and cleared pinned
state. For live mode assert three rendered unknown cars, one explicit
Unclassified-hold overflow, and a visible distinct dashed `?` region, and that
the fourth pit-lane bay (`.pit-hold`) becomes visible only for that live
observation.

Fold/unfold the legend and confirm the car tooltip tracks focus:

```sh
playwright-cli -s=dashboard-live click ".legend-disclosure summary"
playwright-cli -s=dashboard-live run-code "async page => {
  await page.waitForSelector('.legend-disclosure[open] .state-legend', { state: 'visible' });
}"
playwright-cli -s=dashboard-live click ".legend-disclosure summary"
```

The seven legend entries must be hidden until the disclosure is opened and
hidden again once it is closed; opening it must not reflow the rest of the
bar. Focus a route car and confirm its `.session-tooltip` becomes visible with
the identity/state/activity detail, and that `#map-stage` does not change
height as the detail appears (there is no persistent readout strip to reflow
the stage); blur it and confirm the tooltip hides.

Keyboard/accessibility checks:

```sh
playwright-cli -s=dashboard-live reload
playwright-cli -s=dashboard-live press Tab
playwright-cli -s=dashboard-live press Tab
```

The second Tab focuses `#snapshot-file`; its visible label must compute a solid
3px focus outline. The import label and reset button must each measure at least
44px high. Focus a session car, press Enter, confirm `aria-pressed=true`, press
Escape, and confirm `aria-pressed=false`. Accessible labels must contain the
sanitized display name, state, and placement without interpreting markup.

Geometry assertions at 1440x900:

- document scroll width equals client width;
- route-car positions sampled at least one second apart change in the forward
  High Moor -> Pass Ladder -> Cedar Chain -> Cloud Ridge -> Long Arc
  -> Valley Gate direction while cars remain centered over the roadway;
- distinct session controls do not overlap at the canonical starting phases;
- the full-bleed `#map-stage`, the bottom `#pit-lane` bays, the Unclassified
  hold, tooltips, and the corner `#overflow-notice` pill all remain inside
  their intended bounds;
- the Unclassified hold bottom remains inside the viewport;
- `#pit-lane` sits below `#map-stage` as a row of labeled bays, and the header
  bar's source controls remain secondary to the stage.

For each manually selected course, run the canonical twelve-route fixture and
then a separate synthetic sixteen-route phase fixture. Drive every route
wrapper's Web Animations timeline through 128 values at 500ms increments. At
every visible sample, compare the complete button rectangle—not only its
center—to the fixed `#map-stage` rectangle:

```js
const stage = document.querySelector('#map-stage').getBoundingClientRect();
const bounds = [...document.querySelectorAll('.vehicle-anchor .session-car')]
  .map((button) => button.getBoundingClientRect());
for (const box of bounds) {
  if (box.left < stage.left || box.right > stage.right
    || box.top < stage.top || box.bottom > stage.bottom) {
    throw new Error('route target clipped');
  }
}
```

Repeat after `prefers-reduced-motion: reduce` so all sixteen static anchors,
including Cypress Run R15/R16, contain the complete 52px desktop or 44px mobile
target. Separately assert the canonical centerline sources have
`fill="none"` and that their transformed screen points remain under the moving
centers. Record minimum center separation, minimum edge margin, maximum
centerline deviation, overlap/off-road/clipping counts, computed animation
name/duration/timing, and document overflow for every course/fixture/viewport.

Motion checks:

```sh
playwright-cli -s=dashboard-live run-code "async page => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}"
playwright-cli -s=dashboard-live run-code "async page => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
}"
```

Route wrappers must compute to the selected catalog course's committed
`*-traverse-desktop` name at desktop width and `*-traverse-mobile` below
760px, and sampled positions must advance over time. Every schedule retains
the shared 64-second duration and `linear` timing. Hover, focus, and pinned
states must compute `animation-play-state: paused` on the wrapper and preserve
the same sampled position. `.car-motion` must have no animation and must rotate
only by compiled `--drift-yaw`; the inverse keeps glyphs and codes upright.
Parked and unknown cars must not move between samples. Reduced motion must set
route traversal to `none`, resolve drift to zero, hide smoke, and leave route
cars at deterministic static tangent-facing anchors.

Capture synthetic-only desktop evidence:

```sh
playwright-cli -s=dashboard-live select "#track-select" ridge-pass
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/desktop-ridge-pass.png
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/desktop.png
playwright-cli -s=dashboard-live select "#track-select" cypress-run
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/desktop-cypress-run.png
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/desktop-live.png
```

## Mobile lifecycle and assertions

```sh
playwright-cli -s=dashboard-live resize 390 844
```

Repeat fixtures -> live -> live -> rejected fixtures -> live -> fixtures using
the generated files. Repeat keyboard focus, Enter/Escape, normal/reduced
motion, source/age/rejection labels, and unknown overflow checks.

At 390x844 assert:

- document scroll width equals client width (no horizontal overflow);
- the header bar wraps to multiple rows and the pit lane reflows to a 2x2
  grid of bays (`getComputedStyle('#pit-lane').gridTemplateColumns` reports
  two tracks);
- no car controls overlap;
- route cars advance between samples while remaining centered over the scaled
  roadway and inside the map bounds;
- `#map-stage` precedes `#pit-lane`;
- long synthetic names and overflow details wrap without clipping;
- import label and reset button are at least 44px high;
- the focused hidden file input produces the visible 3px label outline;
- the folded legend opens and closes the same as on desktop.

Capture synthetic-only mobile evidence:

```sh
playwright-cli -s=dashboard-live select "#track-select" ridge-pass
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/mobile-ridge-pass.png --full-page
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/mobile.png
playwright-cli -s=dashboard-live select "#track-select" cypress-run
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/mobile-cypress-run.png --full-page
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/mobile-live.png --full-page
```

At the end, require:

```sh
playwright-cli -s=dashboard-live console warning
```

Expected result: zero errors and zero warnings.

## Cleanup

In that same browser terminal, so the fixture variable still expands:

```sh
playwright-cli -s=dashboard-live close
rm "$DASHBOARD_BROWSER_FIXTURES/live-valid.json"
rm "$DASHBOARD_BROWSER_FIXTURES/live-invalid.json"
rmdir "$DASHBOARD_BROWSER_FIXTURES"
```

Stop the preview server with `Ctrl-C`. `playwright-cli list` must show no
browsers. Remove `.playwright-cli/` if the tool created local session
artifacts.

## Manual-only caveats

- The generated live-import lifecycle, exhaustive animation timeline sweeps,
  fine-grained route/road alignment measurements, and reference screenshot
  review above remain manually driven.
- The user's real/default tmux server is never queried during verification.
- Executable, socket, process, parser, error, and privacy behavior is tested
  through injected synthetic boundaries.
- Node's own child-process `maxBuffer` enforcement is exercised by an isolated
  `process.execPath -e` child that emits more than 1 MiB of valid framed
  synthetic records through the collector's injected callback. A second test
  simulates the callback error directly, and the parser record-count rejection
  separately uses a real concatenated synthetic `Buffer`.
- Screenshots contain synthetic fixture/generated data only.

## Latest manual result

On 2026-07-27, the route inspection pause cascade was corrected without
changing either course or motion schedule. Ridge Pass and Cypress Run were
verified at 1440x900 and 390x844 with a hover-capable pointer. Hover, keyboard
focus, and an Enter-pinned inspection each computed both the route wrapper and
nested `.car-motion` to `animation-play-state: paused`; positions and nested
transforms remained identical across 720ms samples. Pointer leave resumed
movement by 34.21-43.92px on desktop and 12.72-18.42px on mobile. A pinned car
remained completely paused after blur and pointer leave with correct tooltip
and readout text; Escape cleared the pin and resumed movement by
31.98-43.92px on desktop and 12.71-18.44px on mobile. Reduced motion continued
to compute both animation names to `none`, and the browser console remained
free of errors and warnings. No screenshot changed for this CSS-only fix.

On 2026-07-26, Cypress Run's prior uniform hairpin gauntlet was superseded by
an original purpose-built paved night mixed technical drift course while Ridge
Pass, selection/source behavior, pits, and the 64-second/four-second phase
contract remained unchanged. The final Cypress-only browser verification
exercised the canonical twelve-route fixture and a separate synthetic
sixteen-route fixture and produced:

- 128 x 500ms sweeps at 1440x900 and 390x844 with minimum moving centers of
  79.46px desktop and 67.38px mobile, zero visible overlaps, zero off-road
  centers, zero full-target clipping, and zero horizontal overflow;
- maximum moving-center deviation from the responsive canonical centerline of
  0.39px desktop and 0.26px mobile, with minimum moving full-target edge
  margins of 6.81px and 3.02px respectively;
- reduced-motion sixteen-anchor placement with minimum centers of 71.75px
  desktop and 61.05px mobile, zero overlap/clipping, and animation `none`;
- `cypress-run-traverse-desktop` and `cypress-run-traverse-mobile` computing to
  64 seconds and `linear`; their 64 visible distance intervals varied by 0.10%
  desktop and 0.28% mobile;
- preserved accessible Launch Line location text, a 4px keyboard focus
  outline, Enter pinning, visible pinned tooltip, Escape clearing, and clean
  browser consoles with zero errors or warnings.

Neutral, unpinned, unfocused captures were refreshed only at
`desktop-cypress-run.png` (exactly 1440x900) and
`mobile-cypress-run.png` (exactly 390x1673, full page). Both contain the
standard 24-session fixture with no skip-link, focus, tooltip, pin, or pressed
artifact. Ridge Pass and shared fixture/live screenshots were not changed for
this amendment.

The Cypress hairpin-gauntlet and drift-complex evidence below is now
superseded and is retained only as historical verification.

Earlier on 2026-07-26, the initial two-course implementation was verified as
follows; these measurements describe the superseded Cypress mountain-road
geometry and remain only as historical evidence.

On 2026-07-26, the two-course catalog and browser-local rotation were verified
with synthetic data only. Ridge Pass retained its prior measurements. Cypress
Run's final distinct geometry and responsive schedules produced:

- a 128 x 500ms sweep of the canonical twelve route targets and a separate
  synthetic sixteen-phase capacity fixture with minimum centers of 62.55px
  desktop and 45.02px mobile, zero visible overlaps, zero off-road centers,
  zero full-target clipping, and zero horizontal overflow;
- `cypress-run-traverse-desktop` and `cypress-run-traverse-mobile`, each
  computing to 64 seconds and `linear`; accumulated visible-centerline length
  across 64 intervals varied by 4.60% desktop and 2.22% mobile, excluding the
  hidden reset;
- correct native manual selection and Auto restoration, one-shot boundary and
  focus/visibility/pageshow catch-up behavior, 44px selector and mobile route
  targets, focus/pin/button identity preservation, parked immobility, and
  reduced-motion static placement;
- clean layout immediately below/above 759/760 and 959/960, exact 390px mobile
  width, and zero browser errors or warnings.
- full 52px desktop and 44px mobile button bounds stayed inside the fixed map
  for every static anchor and visible waypoint; Cypress Run's minimum moving
  edge margin was 5.75px desktop and 0.22px mobile, while reduced-motion South
  Gate R16 retained 3.94px mobile margin;
- both canonical centerline source paths computed without a fill, eliminating
  source-path wedges while their two `<use>` strokes continued to render the
  roadway.

Neutral screenshots are `desktop-ridge-pass.png`, `mobile-ridge-pass.png`,
`desktop-cypress-run.png`, and `mobile-cypress-run.png`; `desktop.png` and
`mobile.png` remain the manually selected Ridge Pass baseline.

On 2026-07-26, the original reference-informed course was horizontally mirrored
to run from upper-left High Moor to lower-right Valley Gate. Its responsive
constant-speed schedules were verified at 1440x900 and 390x844:

- an exact 128 x 500ms full-lap sweep of 16 four-second-phased route targets
  produced minimum center separations of 62.60px desktop and 46.98px mobile,
  with zero target overlaps, off-road centers, clipped controls, and horizontal
  overflow;
- desktop used the schedule now cataloged as `ridge-pass-traverse-desktop`;
  mobile used `ridge-pass-traverse-mobile`. Both computed to a 64-second `linear` animation with
  the same phase delays and hidden reset;
- accumulated visible-centerline length across the 64 distance-calibrated
  intervals was 43.02-44.32px desktop (2.99% range / mean) and
  17.09-17.22px mobile (0.79%), excluding the hidden reset;
- all route anchors and desktop/mobile waypoint x positions retained their
  exact horizontal complements while every y position remained unchanged;
- normal movement advanced, hover and focus paused, Enter pinned, Escape
  cleared, parked cars moved 0px, and reduced motion disabled both route and
  nested car animations;
- mobile route controls remained true clipped 44px circles; focused tooltips
  were visible and inside the map; the console contained zero errors and zero
  warnings;
- neutral fixture screenshots were refreshed at exactly 1440x900 and 390x844.

On 2026-07-25, the previous six-section touge redesign was verified with exact Web
Animations timeline control at 500ms intervals across the complete 64-second
lap (128 samples per viewport):

- at 1440x900, route targets and visible car bounds had zero overlaps, the
  minimum center separation was 71.19px, all visible centers remained on the
  road, no route control clipped, and horizontal overflow was zero;
- at 390x844, visible car bounds had zero overlaps, the minimum circular-target
  center separation was 44.31px, all visible centers remained on the road, no
  route control clipped, and horizontal overflow was zero;
- the mobile button computed to `circle(22px at 50% 50%)` over a 44x44 target;
  its 24x36 artwork remained inside the circle, center hit testing reached the
  button, and transparent square-corner hit testing did not;
- keyboard focus rendered the wrapper-owned solid 3px focus ring without
  clipping; after its transition the tooltip was visible and inside the map;
- normal movement advanced, hover and focus paused with zero movement, Enter
  pinned, Escape cleared, parked cars did not move, and reduced motion disabled
  both route and nested car animations;
- all six labels rendered in downhill order, and the console contained zero
  errors and zero warnings.

`desktop.png` and `mobile.png` were refreshed from fixture mode. The live-import
lifecycle evidence below remains the most recent adapter-specific run.

On 2026-07-22, `playwright-cli` completed the documented lifecycle at 1440x900
and 390x844 using files freshly produced in a `mktemp` directory:

- fixtures/live/live/rejected fixtures/live/fixtures produced 24/5/5/24/5/24
  rendered controls (the sixth live session was the explicit unknown overflow);
- the three unknown anchors and one independent overflow rendered at both
  sizes;
- route wrappers computed to the route traversal configured at that time;
  fixture and fresh-live route cars advanced between temporal samples (the
  fresh-live car moved 59.82px in 900ms);
- a 500ms-step sweep across the complete 64-second lap at both viewports
  produced zero overlaps, zero visible car centers outside the SVG road stroke,
  and zero visible controls outside the map (128 samples across 12 route cars);
- desktop route controls measured 52px and mobile route controls measured the
  accessible 44px minimum; horizontal overflow was zero;
- the desktop Unclassified hold bottom was 879.09px within the 900px viewport;
- source controls measured 44px, and keyboard focus on the real file input
  produced a solid 3px outline on its visible label;
- focus, hover, and pinning each paused traversal with zero sampled movement;
  Enter pinned and Escape cleared;
- nested active motion was `active-nudge`, thinking motion remained
  `thinking-drift`, all parked samples moved zero, and reduced motion disabled
  both wrapper and nested animations with zero route movement;
- the source age was fresh at zero minutes;
- the console contained zero errors and zero warnings.

`desktop-live.png` and `mobile-live.png` were refreshed from that generated
synthetic input. The browser, preview server, generated JSON files, temporary
directory, and local Playwright session artifacts were removed afterward.
