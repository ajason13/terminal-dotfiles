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
Unclassified-hold overflow, and a visible distinct dashed `?` region.

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
- map, pits, Unclassified hold, tooltips, and overflow notices remain inside
  their intended bounds;
- the Unclassified hold bottom remains inside the viewport;
- source controls remain secondary to the map.

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
the shared 64-second duration and `linear` timing. Hover, focus, and pinned states must compute
`animation-play-state: paused` and preserve the same sampled position.
Active nested motion may compute to `active-nudge`, while thinking retains
`thinking-drift`. Parked and unknown cars must not move between samples.
Reduced motion must set both route traversal and nested car motion to `none`,
leaving route cars at their deterministic static anchors.

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

- document scroll width equals client width;
- no car controls overlap;
- route cars advance between samples while remaining centered over the scaled
  roadway and inside the map bounds;
- map precedes all pit regions;
- long synthetic names and overflow details wrap without clipping;
- import label and reset button are at least 44px high;
- the focused hidden file input produces the visible 3px label outline.

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
