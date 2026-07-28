# Dashboard Multi-Track Rotation Design

Date: 2026-07-26

Status: implemented and verified; final independent audit PASS (2026-07-26)

Delivery mode: Gated Delivery

## Objective

Add a reusable, browser-local catalog of original touge tracks to the optional
dashboard. The dashboard will select a track automatically in four six-hour
local-time windows per day and will also expose a tab-only manual selector.

The first delivery contains exactly two tracks:

1. `ridge-pass` — display title `Ridge Pass`; the current approved High Moor
   through Valley Gate course.
2. `cypress-run` — display title `Cypress Run`; a new original course defined
   below.

Session source and visual course remain independent state axes. Track changes
must not reread, revalidate, import, poll, or mutate fixture/live session data.

## Protected boundaries

- Runtime changes stay under `dashboard/`.
- The timer-invariant clarification in
  `docs/superpowers/specs/2026-07-21-dashboard-live-adapter-resolved-design.md`
  and durable verification notes may change outside `dashboard/`.
- Do not change WezTerm configuration, tmux configuration, wallpaper
  manifests/rotation, LLM-status behavior, installers, terminal startup, or
  the one-shot collector contract.
- Do not add a daemon, backend, network request, telemetry, persistence,
  cookies, `localStorage`, URL state, service worker, dependency, framework,
  build step, or live process integration.
- Do not import or call WezTerm's Lua background module. Only the abstract
  ideas of a catalog and deterministic time selection are reused.
- All track art, names, coordinates, and schedules are original. Do not trace
  maps, GPX/GIS data, photographs, screenshots, branded road treatments, or
  copyrighted fictional layouts.
- Correct tangent orientation and drifting remain deferred.

## Track catalog contract

Create `dashboard/src/track-catalog.mjs`.

Each frozen track definition contains:

```text
id                    stable kebab-case string
title                 nonempty display string
artId                 ID of one static SVG track group in index.html
centerlineId          ID of that track's canonical SVG centerline
desktopAnimationName  committed CSS keyframe name
mobileAnimationName   committed CSS keyframe name
segments              six ordered segment names
routeAnchors          exactly sixteen frozen anchors
```

Each route anchor contains the existing `id`, `poolLabel`, `x`, `y`, and
`angle` fields. IDs remain `R01` through `R16` inside each track because only
one track is active at a time. Every anchor's `poolLabel` must be one of its
track's segments. The route allocation distribution is exactly
`2/3/3/3/3/2`.

The catalog array, every track, both nested arrays, and every anchor use exact
closed key sets. Catalog validation fails visibly during application startup
for:

- fewer than two tracks;
- duplicate track, art, centerline, or animation IDs;
- unsupported/missing keys;
- an ID outside `^[a-z0-9]+(?:-[a-z0-9]+)*$`;
- a blank title or segment;
- other than six unique segments;
- other than sixteen anchors;
- any anchor whose ID is not exactly `R01` through `R16` at array indices
  zero through fifteen;
- duplicate or out-of-order anchor IDs;
- unsupported/missing anchor keys;
- an `x`, `y`, or `angle` that is not a finite number;
- an anchor outside `x=0..1000`, `y=0..760`;
- an anchor referencing an unknown segment;
- anchors that do not follow segment order contiguously with the exact
  `2/3/3/3/3/2` distribution;
- a blank or unsafe `artId`, `centerlineId`, `desktopAnimationName`, or
  `mobileAnimationName`; these reference names must match
  `^[a-z][a-z0-9-]*$`.

The catalog exports a default track ID and a strict lookup that throws on an
unknown ID. Parked and unknown-hold anchors remain global in
`track-layout.mjs`.

Validation produces deeply frozen definitions: track objects, segment arrays,
anchor arrays, and individual anchors are all frozen. Do not freeze unvalidated
input and then assume it is safe.

Before the first render, application startup also verifies:

- every `artId` resolves to exactly one SVG `<g data-track-art="track-id">`;
- every `centerlineId` resolves to exactly one SVG `<path>` contained by that
  track's art group;
- no track art group is nested in another track art group;
- the selector, status, live region, dashboard root, and map heading mounts
  exist exactly once.

Focused static Node tests, rather than runtime CSSOM probing, verify that every
catalog animation name has exactly one committed `@keyframes` definition and
exactly one matching track-scoped desktop/mobile assignment. This avoids
browser stylesheet-access differences while keeping missing/duplicate CSS
references fail-closed in repository verification.

`allocateSessions(sessions, track)` uses the chosen track's route anchors.
Progress/hash/canonical-sort/circular-probing/overflow semantics remain
unchanged. Fixture and imported snapshot schemas do not acquire a track field.

## Included courses

### Ridge Pass

Use the current horizontally mirrored course without geometry, timing, naming,
or terrain changes:

`High Moor → Pass Ladder → Cedar Chain → Cloud Ridge → Long Arc → Valley Gate`

Its current sixteen anchors, two responsive constant-distance schedules,
terrain art, and verification thresholds become the `ridge-pass` definition.

### Cypress Run

Create one visually distinct, hand-authored continuous `1000×760` course. It
starts at the upper-left and exits at the lower-right. Its ordered segments and
capacities are:

1. `Cypress Crown` — 2
2. `Granite Ladder` — 3
3. `Raincut Traverse` — 3
4. `Basin Sweep` — 3
5. `Fern Chicane` — 3
6. `South Gate` — 2

Composition:

- Cypress Crown is a short forested crest.
- Granite Ladder is one compact set of three unequal switchbacks.
- Raincut Traverse is a long exposed diagonal release.
- Basin Sweep is the course's single broad bowl-shaped curve.
- Fern Chicane is a compact linked left/right sequence, not another horizontal
  ribbon.
- South Gate is a short oblique exit.
- Use only generic forest, rockcut, retaining-wall, basin, contour, and grass
  cues. Add no building, logo, real-road label, or branded landmark.
- Avoid self-intersections, repeated full-width S bands, and non-adjacent
  route legs close enough to create mobile target ambiguity.

Both tracks use a 64-second visible lap, exact four-second phase spacing, linear
timing, a hidden end-to-start reset, and separately distance-calibrated desktop
and mobile schedules. Every moving car on the active track uses the same
schedule. Each schedule must keep accumulated visible-interval distance
variation at or below five percent at its verified viewport.

## SVG and CSS selection

Keep both static original SVG groups in `dashboard/index.html`. Shared patterns,
filters, and generic terrain styles may be reused. All track-owned SVG IDs are
unique and prefixed by track ID. Do not fetch fragments or create track markup
with `innerHTML`.

`#dashboard-root` owns `data-track-id`. CSS shows only the matching SVG group
and assigns only the matching desktop/mobile animation name to route cars.
Labels must remain readable and unmirrored.

The initial HTML value is `data-track-id="ridge-pass"` so the page is not blank
before JavaScript. Application startup replaces it with the selected automatic
or manual track before the first snapshot render.

## Deterministic automatic selection

Create `dashboard/src/track-selection.mjs`.

Constants:

```text
TRACK_BUCKET_HOURS = 6
TRACK_BUCKETS_PER_DAY = 4
boundaries = 00:00, 06:00, 12:00, 18:00 browser-local time
```

The pure slot function uses local calendar fields:

```text
localDayOrdinal = floor(Date.UTC(localYear, localMonth, localDate) / 86400000)
bucket = floor(localHour / 6)
slot = localDayOrdinal * 4 + bucket
```

Automatic selection uses mathematical floor-modulo
`((slot % length) + length) % length` over the catalog's explicit stable order.
This is deterministic, repeat-free across adjacent buckets when the catalog
has at least two tracks, requires no storage, and makes two tracks alternate.
Reordering the catalog is an intentional product change.

The exact boundary is part of the new bucket. The next-boundary function
constructs the next browser-local 00/06/12/18 `Date`, including local day
rollover. Tests inject dates around boundaries, DST transitions, time-zone-like
offset changes, and clock jumps.

Clock recomputation occurs only on initial start, execution of the scheduled
timeout, a `visibilitychange` that makes the page visible, `pageshow`, and
window `focus`. A continuously visible and untouched tab is not guaranteed to
correct immediately after a manual OS clock/time-zone jump; it corrects at the
next authorized trigger. Tests change the injected clock before invoking each
authorized trigger and assert current-bucket correction plus exactly one future
timeout. No polling is added to detect clock changes.

## Track selection controller

Create a small lifecycle controller with injected clock and timer functions.
It owns:

- the native selector;
- current mode (`auto` or `manual`);
- current track ID;
- at most one pending boundary timeout;
- `visibilitychange` and `pageshow` catch-up listeners;
- teardown through one `AbortController`.

Behavior:

- Selector options are `Auto · every 6 hours`, `Ridge Pass`, and
  `Cypress Run`.
- Auto is the initial mode on every load/new tab.
- No selection is persisted.
- In Auto, choose the current bucket immediately and schedule one one-shot
  `setTimeout` for the next local boundary.
- On the timeout, recompute from the clock, apply only if the track changed,
  then schedule exactly one next timeout.
- `visibilitychange` when visible and `pageshow` recompute and replace the
  pending timeout so a suspended tab catches up.
- Window `focus` performs the same recompute/reschedule catch-up.
- Manual selection clears the boundary timeout and immediately applies the
  chosen track.
- Returning to Auto immediately selects the current bucket and restores one
  timeout.
- Destroy clears the timeout and listeners.
- Track changes are instantaneous; no crossfade or transition.
- A compact visible status states the active course. In Auto it also states the
  next local change time, including the local date when the boundary crosses
  midnight.
- The visible status is separate from a dedicated polite live region.
- The live region announces only an actual track-ID transition after initial
  startup. It does not announce initial selection, same-track catch-up,
  same-track manual selection, or a mode-only change.

Use a native `<select>` with a programmatically associated visible label and a
minimum 44px target. Put it in the map-panel heading without materially
re-expanding the global dashboard header. The neutral session readout remains
available and usable at both target viewports.

## Source and renderer lifecycle

The selected track is application-owned visual state.

`app.mjs` starts track selection before the first fixture render, retains the
active track, and supplies it to every subsequent source render.

`source-controller.mjs` exposes `setTrack(track)`, which forwards to the current
render controller. A track change during async validation updates application
visual state; whichever complete snapshot commits next renders on that active
track. Track changes never alter source mode, file controls, age state, or
validation generation.

The source controller receives an app-owned fatal callback. Live file
read/validation rejection is caught separately from snapshot render/application
failure:

- a `readFile` validation error follows the existing rejected-live fallback;
- an error from `render`, `replaceView`, `setTrack`, or another application
  commit is fatal and must never be reported as `Live snapshot rejected`.

This separation applies to fixture start/reset commits as well as live commits.

`renderDashboard(snapshot, root, track)` returns a controller with
`setTrack(nextTrack)`.

`setTrack`:

- preflights the next catalog lookup, required nodes, route allocation,
  placements, derived coordinates/classes, text, tooltip content, and all
  mutations without changing DOM state;
- only after complete preflight, switches `data-track-id` and visible SVG art
  and commits the prepared update synchronously;
- updates route wrapper coordinates, edge/tooltip classes, route-slot
  metadata, and accessible location text;
- updates each route button's `aria-label`, tooltip, and the visible readout;
- leaves parked/unknown placement unchanged;
- preserves the same route and parked DOM buttons;
- preserves keyboard focus on the same session;
- preserves the pinned session ID and `aria-pressed` state;
- keeps a pinned route car paused;
- does not duplicate listeners or DOM nodes.

If preflight exposes an impossible catalog/placement invariant, no mutation
occurs and the error is routed to the app fatal handler. If the synchronous
commit unexpectedly throws after mutation begins, whole-root fatal replacement
is the rollback; mixed track UI must never remain visible.

### App-owned fatal handler

`app.mjs` owns one idempotent fatal handler shared by track and source
controllers. Startup, selector events, timeout callbacks, visibility/pageshow/
focus catch-up callbacks, source rendering, and renderer track commits route
unexpected application errors to it.

On first fatal error it:

1. marks the app fatal so no callback may reschedule;
2. destroys track selection, clearing its timeout/listeners;
3. destroys source control, clearing the age interval, invalidating pending
   generations/commits, and destroying the current render;
4. replaces the complete dashboard root with an application-level alert whose
   wording describes a dashboard/application failure, not a rejected fixture
   or live snapshot.

If startup finds exactly one dashboard root, every fatal case replaces that
root. If the root is missing or duplicated, the fatal handler constructs the
same alert using DOM APIs and replaces `document.body` contents instead; it
does not guess which malformed root is authoritative. Tests cover zero, one,
and duplicate root cases.

Repeated fatal calls are no-ops. No callback silently suppresses an error;
after routing it to the fatal handler, it returns without retry, fallback,
reschedule, or rethrow. This keeps the browser console clean while making the
fatal state visible.
`renderDashboardError` may be split into accurately named snapshot and
application error surfaces, but their messages and use sites must remain
unambiguous.

Source import/reset/rejection behavior remains unchanged:

- source transitions continue to clear pin/focus state;
- the chosen track and selector mode remain unchanged;
- live age updates continue independently;
- rejected live import falls back to fresh fixtures on the active track.

## Timer invariant amendment

Amend the live-adapter resolved design:

- The successful-live-source 60-second `setInterval` remains the only
  data-age interval.
- Auto track mode may own exactly one one-shot boundary `setTimeout`.
- The boundary timeout changes visual course only. It performs no file, tmux,
  process, network, source, schema, or session-data polling.
- Manual track mode owns no boundary timeout.
- Both timers have explicit teardown and independent tests.
- No other timer or polling loop is authorized.

## Reduced motion and accessibility

- Automatic/manual track selection remains functional under
  `prefers-reduced-motion`.
- Track art changes instantly with no animation.
- Active/thinking cars use the chosen track's static deterministic anchors and
  do not traverse.
- Track selector, status, current title, segment/location labels, car accessible
  names, tooltip text, and pinned readout all reflect the active track.
- State remains encoded by the existing non-color glyph/treatment system.
- Focus indication, contrast, tooltip bounds, and 44px mobile targets remain.

## Observability

No logging, analytics, metrics, traces, network reporting, or debug endpoint is
needed. The active-track title, Auto/manual selector value, and next-change
status are sufficient local observability. Invalid catalog/application startup
uses the existing visible error surface.

## Automated verification

Add focused Node tests for:

- catalog schema, deep freezing, closed keys, safe references, exact ordered
  `R01..R16`, finite coordinate/angle types, capacity, contiguous segment
  membership, and invalid definitions;
- exact two-track IDs/titles and segment distributions;
- pure slot selection at one millisecond before, exactly at, and after all four
  boundaries plus local day rollover;
- deterministic adjacent-bucket non-repeat and catalog-order coverage;
- spring-forward/fall-back local dates, forward/backward clock or offset jumps
  applied before every authorized recompute trigger, and no promise of
  untouched-visible-tab immediate correction;
- at most one timeout, rescheduling, visibility/pageshow catch-up, manual clear,
  focus catch-up, Auto restore, timer handle `0`, `setTimeout` failure, callback
  failure, repeated destroy, no reschedule after fatal, and no duplicate
  listeners;
- source/track independence during fixture, live, validating, rejection, reset,
  and destroy paths;
- renderer `setTrack` preserving DOM identity, focus, pin, `aria-pressed`, and
  tooltip association/listener count and parked placement while updating
  hovered/focused/pinned readout and route location/accessibility;
- track changes before initial fixture render and during deferred fixture/live
  validation followed by success, rejection, reset, and destroy;
- fatal failures at startup, manual selection, boundary timeout,
  visibility/pageshow/focus catch-up, source render replacement, and track
  commit; none may be mislabeled as live rejection;
- zero, one, and duplicate dashboard-root startup cases, with body-level fatal
  replacement for invalid root cardinality;
- reduced-motion track switching;
- unique SVG/CSS IDs, runtime DOM containment, and matching catalog references;
- sixteen static anchors per track, bounds, mobile separation, capacity, and
  unchanged allocation semantics;
- route overflow at session seventeen on both tracks;
- exactly the existing age interval plus the authorized boundary timeout, with
  no additional timer/network/process APIs;
- absence of storage, cookies, history mutation, service workers,
  `requestAnimationFrame`, and `requestIdleCallback`.

All existing tests must continue to pass.

## Browser verification

At `1440×900` and `390×844`, verify both tracks manually selected and Auto:

- nonblank, framed track and readable labels;
- exactly twelve phased route targets under the unchanged canonical fixture
  (six active and six thinking);
- a separate synthetic sixteen-route-session capacity fixture covering all
  sixteen four-second phases;
- 128 samples at 500ms across the 64-second lap for both the canonical and
  synthetic capacity fixtures;
- minimum route-target center distance at least 44px;
- zero visible-car overlap, off-road centers, clipping, and horizontal overflow;
- visible-interval distance variation at most five percent;
- correct desktop/mobile animation name and 64-second linear duration;
- parked immobility; hover/focus/pin pause; Escape clear; reduced-motion
  immobility;
- selector keyboard/focus/44px behavior;
- manual → Auto and boundary/catch-up changes;
- focused and pinned session preservation across track changes;
- fixture/live/rejected/reset source independence on at least one course;
- zero browser errors and warnings.

Also inspect layout and selector/status behavior immediately below/above the
`759/760` and `959/960` breakpoints.

Capture neutral screenshots with no pin/tooltip:

- `desktop-ridge-pass.png`
- `mobile-ridge-pass.png` (exactly 390px wide)
- `desktop-cypress-run.png`
- `mobile-cypress-run.png` (exactly 390px wide)

Existing `desktop.png` and `mobile.png` remain the manually selected Ridge Pass
baseline.

## Non-goals

- More than two tracks in this delivery.
- Shared code or synchronized timing with WezTerm wallpaper rotation.
- Persistent manual selection.
- Random selection, remote configuration, or user-authored track import.
- Track editing UI.
- Crossfade or animated track transitions.
- Exact hidden-tab boundary execution.
- Live tmux/WezTerm integration changes.
- Tangent orientation, drift angle, acceleration, braking, or route-dependent
  session semantics.
- Deployment, backend, authentication, persistence, analytics, or telemetry.

## Final delivery evidence and handoff (2026-07-26)

**Delivery mode and gate:** Gated Delivery is complete. The initial independent
audit returned **FAIL**; its catalog/selection-lifecycle, atomic track-render,
and visual-verification findings were closed in the implementation and
rechecked. The final independent audit returned **PASS** on 2026-07-26.

**Delivered scope:** The dashboard contains exactly two independent visual
tracks, **Ridge Pass** and **Cypress Run**. Auto selection uses browser-local
`00:00`/`06:00`/`12:00`/`18:00` buckets; manual selection is tab-only and does
not persist. Fixture/live source state and chosen track remain independent, and
Auto owns only one boundary `setTimeout` (manual owns none).

**Verification evidence:**

- Node suite: **85/85 passing**. Syntax, diff, and protected-boundary checks
  passed.
- At `1440×900` and `390×844`, both tracks passed 128×500ms browser sweeps
  with canonical 12-route and synthetic 16-route fixtures: zero overlap,
  off-road centers, full-target clipping, horizontal overflow, or console
  errors.
- Cypress Run measured minimum spacing of **62.55px desktop / 45.02px mobile**
  and visible-distance variation of **4.60% desktop / 2.22% mobile**.
- Neutral captures: `dashboard/tests/screenshots/desktop-ridge-pass.png`,
  `dashboard/tests/screenshots/mobile-ridge-pass.png`,
  `dashboard/tests/screenshots/desktop-cypress-run.png`, and
  `dashboard/tests/screenshots/mobile-cypress-run.png` (with `desktop.png` and
  `mobile.png` retained as Ridge Pass baselines).

**Boundaries, exceptions, and residuals:** No terminal, tmux, WezTerm,
wallpaper, startup, or live-integration expansion was made. Observability is
unchanged: no new logs, metrics, or telemetry. Preferred GPT-5.4/5.5 models
were unavailable; the research, audit, and builder work used native GPT-5.6
roles. The only residual is nonblocking: Cypress Run has **0.22px** mobile
moving clearance. Deferred work remains tangent car orientation/drifting and
per-new-track authored SVG/CSS calibration.

**Handoff:** Next owner is the user. No relevant Notion task or page exists;
no Notion action was taken.

## Approved workday schedule amendment (2026-07-26)

This amendment supersedes only the automatic rotation schedule described
earlier in this document. The original six-hour schedule and its delivery
evidence remain above as the historical record of the initial implementation;
they are not evidence for this amendment. Track geometry, source behavior,
protected boundaries, manual selection, and the one-timeout lifecycle are
unchanged.

The dashboard is expected to be used daily from 08:30 through 16:30
browser-local time. It does not auto-close, disable itself, poll, or add a
timer at closing. Auto mode has two active windows:

- first window: `08:30 <= local time < 12:30`;
- second window: `12:30 <= local time < 16:30`.

For a local calendar day ordinal `day`, the pure slot formula is:

```text
localMinutes = localHour * 60 + localMinute
windowIndex = localMinutes < 510 ? -1 : localMinutes < 750 ? 0 : 1
slot = day * 2 + windowIndex
```

Thus, before 08:30 the previous local day's second slot remains selected.
From 12:30 through the overnight after-hours period, the current local day's
second slot remains selected. With the required two-track catalog, every
adjacent active window is repeat-free, including the transition from one
workday's second window to the next workday's first window.

Exactly 08:30 belongs to the first window and exactly 12:30 belongs to the
second. Exactly 16:30 is after-hours; it does not change the course. The only
automatic selection boundaries are 08:30 and 12:30. Before opening, and from
12:30 onward, the next one-shot timeout targets the next local 08:30 opening,
using local `Date` construction so day rollover and DST elapsed time are
handled by the browser. Authorized timeout, visible `visibilitychange`,
`pageshow`, and focus catch-up triggers recompute from the current clock and
replace the pending timeout, preserving the invariant of at most one timer.

The selector and Auto status use the concise label
`Auto · workday schedule`; the status continues to show the next automatic
change. Verification for this amendment covers exact 08:30/12:30/16:30
boundaries, before-open and after-close behavior, local day rollover,
repeat-free selection, one-timer lifecycle, catch-up triggers, forward and
backward clock jumps, and DST-aware local boundary construction.

## Cypress Run drift-complex redesign amendment (2026-07-26)

This amendment supersedes only Cypress Run's course geometry, segment names,
course-specific art, responsive motion schedules, and Cypress screenshots.
Historical implementation and verification evidence above is intentionally
retained. Ridge Pass geometry/schedules, stable track IDs and titles, selector
and workday rotation, source/session behavior, pits, accessibility behavior,
and the shared 64-second linear lap with sixteen four-second phases remain
unchanged.

Cypress Run is an original purpose-built paved night drift complex rather than
a second mountain pass. Its continuous, non-self-intersecting route occupies
all four map quadrants and uses these traversal-ordered segments and exact
capacities:

1. `Launch Lane` — 2
2. `Outer Arc` — 3
3. `East Clipping Zone` — 3
4. `Infield Link` — 3
5. `Grand Carousel` — 3
6. `Return Straight` — 2

The composition begins on a marked launch apron, enters a long high-speed outer
sweep spanning the facility perimeter, descends through marked east clipping
points, compresses into one infield transition, opens into one broad carousel,
and exits on a distinct return/finish section. It must not use stacked
S-ribbons, a self-intersection, mountain-road cues, or copied/branded real-track
geometry. Cypress-specific art uses a paved apron/grid, floodlight pools, skid
arcs, tire barriers, cones, and clipping markers. Cypress art must not contain
the Ridge Pass mountain cue classes `ridge-shadow`, `valley-line`,
`terrain-contours`, `forest-boundary`, `tree-line`, `cliff-boundary`, or
`retaining-wall`.

Desktop and mobile schedules are distance-calibrated from the same canonical
Cypress centerline and retain the hidden reset. Static tests require all six
new names and drift-facility art cues, reject all six superseded names and the
mountain cue classes inside the Cypress SVG group, preserve exact 2/3/3/3/3/2
capacity, and enforce full-target containment plus at most 5% variation across
64 visible distance intervals.

Final synthetic browser verification at 1440x900 and 390x844 used 128 x 500ms
sixteen-phase sweeps. Minimum moving centers were 66.75px desktop and 72.24px
mobile; maximum canonical-centerline deviation was 0.51px and 0.31px; moving
edge margins were 34.97px and 5.41px. Both viewports had zero overlap,
off-road centers, clipping, or horizontal overflow. Reduced-motion sixteen
anchor checks retained minimum centers of 90.44px and 61.44px with zero
overlap/clipping. Visible-distance variation was 1.04% desktop and 0.31%
mobile. Focus, pin, Escape clearing, accessible location text, 64-second linear
timing, and zero browser-console errors/warnings were rechecked.

Only `dashboard/tests/screenshots/desktop-cypress-run.png` and
`dashboard/tests/screenshots/mobile-cypress-run.png` were refreshed. They are
neutral fixture captures with no tooltip, pin, or focused session. The desktop
capture is exactly 1440x900; the mobile capture is exactly 390px wide and full
page. No dependency, network, storage, process, live-integration, tmux,
WezTerm, wallpaper, or startup scope was added. The skill-preferred GPT-5.5 was
unavailable; implementation used the native Builder GPT-5.6 Sol model at
medium reasoning.

## Cypress Run hairpin-gauntlet redesign amendment (2026-07-26)

This amendment explicitly supersedes the Cypress Run drift-complex geometry,
segment names, course-specific art, responsive motion schedules, screenshots,
and measurements in the immediately preceding amendment. That evidence remains
above as historical record and is not rewritten. Ridge Pass, the stable
`cypress-run` / `Cypress Run` identity, local workday Auto selection,
source/session and pit behavior, the shared 64-second linear lap with sixteen
four-second phases, and every protected data/process boundary remain unchanged.

Cypress Run is now an original full-map paved night **hairpin gauntlet** rather
than a sweeping outer circuit. Its continuous, non-self-intersecting route uses
five tightly spaced facility lanes across all four quadrants. Short linked
transitions feed alternating 180-degree pins and decreasing-radius end turns;
there is no long outer arc, broad carousel, large empty center, or
mountain-road treatment. Traversal order and exact capacities are:

1. `Launch Pin` — 2
2. `North Hairpins` — 3
3. `West Hairpin` — 3
4. `Center Pins` — 3
5. `South Hairpins` — 3
6. `Finish Pin` — 2

Course art keeps the purpose-built drift-facility night language and now
emphasizes lane islands, paired skid rings around four hairpins, tire walls,
eight clipping markers, cones, floodlight pools, and painted apron grids.
Static tests require all six hairpin names and multiple Cypress-specific
hairpin, clip, skid, and facility cues; reject all six superseded sweeping
segment names plus Cypress mountain cues; preserve 2/3/3/3/3/2 allocation; and
enforce complete 52px/44px target containment. The sixteen static anchors
measure at least 108.31px apart on desktop and 61.33px on mobile.

Both committed 513-point schedules are independently screen-distance
calibrated from the same canonical SVG centerline and retain the hidden reset.
Across 64 visible intervals, distance variation is 0.15% desktop and 0.31%
mobile, below the 5% limit.

Browser verification used the canonical twelve-route fixture and a separate
synthetic sixteen-route fixture at 1440x900 and 390x844. Each fixture completed
128 x 500ms full-lap sweeps. Minimum moving centers were 95.12px desktop and
79.50px mobile; maximum canonical-centerline deviation was 0.53px and 0.34px;
minimum full-target edge margins were 39.97px and 3.91px. Both viewports had
zero overlaps, off-road centers, full-target clipping, or horizontal overflow.
Reduced-motion sixteen-anchor checks retained minimum centers of 108.25px and
61.27px with zero overlap/clipping and animation `none`. The browser also
reconfirmed accessible Launch Pin location text, a 4px focus outline, Enter
pinning with a visible tooltip, Escape clearing, 64-second linear timing, and
zero console errors or warnings.

Only `dashboard/tests/screenshots/desktop-cypress-run.png` and
`dashboard/tests/screenshots/mobile-cypress-run.png` were refreshed. The
captures use the neutral standard 24-session fixture with no visible skip
link, focused control, tooltip, pin, or pressed artifact. Desktop is exactly
1440x900. Mobile browser verification confirmed `innerWidth`,
`documentElement.clientWidth`, and `documentElement.scrollWidth` were all
exactly 390px before the full-page 390x1673 capture.

No dependency, network, storage, process, live-integration, tmux, WezTerm,
wallpaper, or startup scope was added. The requested skill-preferred GPT-5.5
was unavailable; implementation used the native Builder GPT-5.6 Sol model at
medium reasoning.

## Cypress Run mixed-technical-course amendment (2026-07-26)

This amendment explicitly supersedes the Cypress Run hairpin-gauntlet geometry,
segment names, course-specific art, responsive motion schedules, screenshots,
and measurements in the immediately preceding amendment. The earlier hairpin
and drift-complex evidence remains above as historical record and is not
rewritten. Ridge Pass, stable `cypress-run` / `Cypress Run` identity, local
workday Auto selection, source/session and pit behavior, the shared 64-second
linear lap with sixteen four-second phases, and every protected data/process
boundary remain unchanged.

Cypress Run is now an original full-map paved night **mixed technical drift
course**. Its continuous, non-self-intersecting route visibly travels both
east/west and north/south across all four quadrants. A short upper launch feeds
two squared corners around a substantial north chute; an east-side 180 returns
west; two more 90-degree corners enter and exit a long central Drop Chute; a
widened southeast 180 returns along the bottom; and a west-side 90-degree rise
and compact reversal complete the course. This produces six unmistakable
90-degree transitions and two signature 180-degree hairpins without a large
empty center or uniform stacked-row rhythm.

Traversal order and exact capacities are:

1. `Launch Line` — 2
2. `North Nineties` — 3
3. `East Hairpin` — 3
4. `Drop Chute` — 3
5. `South Hairpin` — 3
6. `West Switchback` — 2

The purpose-built night facility language remains, with angular lane islands
and ninety boxes, apex skid rings, tire walls, eight clipping markers, cones,
painted apron grids, and floodlight pools reinforcing the new mixed-corner
geometry. Static tests require all six segment names, the substantial vertical
legs, and multiple ninety/hairpin/clip/skid cues; reject the superseded uniform
hairpin and earlier sweeping segment names plus Cypress mountain cues; preserve
2/3/3/3/3/2 allocation; and enforce complete 52px/44px target containment.
The sixteen static anchors measure at least 71.79px apart on desktop and
61.05px on mobile.

Both committed 513-point schedules are independently screen-distance
calibrated from the same canonical SVG centerline and retain the hidden reset.
Across 64 visible intervals, distance variation is 0.10% desktop and 0.28%
mobile, below the 5% limit.

Browser verification used the canonical twelve-route fixture and a separate
synthetic sixteen-route fixture at 1440x900 and 390x844. Each fixture completed
128 x 500ms full-lap sweeps. Minimum moving centers were 79.46px desktop and
67.38px mobile; maximum canonical-centerline deviation was 0.39px and 0.26px;
minimum full-target edge margins were 6.81px and 3.02px. Both viewports had
zero overlaps, off-road centers, full-target clipping, or horizontal overflow.
Reduced-motion sixteen-anchor checks retained minimum centers of 71.75px and
61.05px with zero overlap/clipping and animation `none`. The browser also
reconfirmed accessible Launch Line location text, a 4px focus outline, Enter
pinning with a visible tooltip, Escape clearing, 64-second linear timing, and
zero console errors or warnings.

Only `dashboard/tests/screenshots/desktop-cypress-run.png` and
`dashboard/tests/screenshots/mobile-cypress-run.png` were refreshed. The
captures use the neutral standard 24-session fixture with no visible skip
link, focused control, tooltip, pin, or pressed artifact. Desktop is exactly
1440x900. Mobile browser verification confirmed `innerWidth`,
`documentElement.clientWidth`, and `documentElement.scrollWidth` were all
exactly 390px before the full-page 390px-wide capture.

No dependency, network, storage, process, live-integration, tmux, WezTerm,
wallpaper, or startup scope was added. The requested skill-preferred GPT-5.5
was unavailable; implementation used the native Builder GPT-5.6 Sol model at
medium reasoning.
