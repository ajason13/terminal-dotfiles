# Dashboard Corner-Aware Drift Design

Date: 2026-07-28

Status: implementation complete; independent pre-implementation and final
post-change QA PASS; commit and push authorized

Roadmap item: `3a — Corner-aware drifting`

Delivery mode: Gated Delivery

## Objective

Replace the optional Night Pass dashboard's independent active/thinking drift
loops with deterministic yaw compiled from each course's canonical cubic
geometry. Moving cars retain the exact constant-speed route traversal, but yaw
now begins at a meaningful corner's entry, peaks at its apex in the actual turn
direction, and settles to zero at exit. Straights have zero yaw.

This is visual route behavior, not vehicle physics.

## Discovery and evidence

The Lead Architect read the supplied AGENTS instructions, the current roadmap,
the route-compiler and tangent/atmosphere design packets, package
configuration, both route sources, the cubic library, compiler, generated
motion CSS, renderer, capability initializer, base CSS, current Node tests,
Playwright tests, browser evidence, and the prior multi-track design.

There is no repository-root `AGENTS.md`; the user-supplied AGENTS instructions
are authoritative. `codex/AGENTS.md` is scoped to that subtree and does not
govern the dashboard.

Baseline evidence before this packet:

- `main`, `origin/main`, and `HEAD` are `9072c36`;
- `routes:check` passes;
- all 127 Node tests pass;
- `git diff --check` passes; and
- the worktree is clean.

Repository facts:

- Ridge has 15 canonical cubics and 527 retained visible frames per profile.
  Cypress has 21 cubics and 533 retained visible frames per profile.
- Each profile retains the same 513 equal-screen-distance base points plus
  every internal cubic boundary. Desktop is calibrated at `1160×682`; mobile
  is calibrated at `372×580`.
- Existing route frames already carry the correct responsive tangent heading.
  Traversal is `64s linear infinite`, with a `-4s` phase per slot and reset
  milestones at `98.8/99.2/99.6/100`.
- `.vehicle-anchor` owns traversal. `.car-angle` rotates by tangent.
  `.car-motion` currently runs an unrelated time-looped translate/yaw cycle.
  Glyph and code counter-rotate by the inverse tangent plus inverse drift yaw.
- `.car-atmosphere` is a heading-following sibling outside drift. Hover,
  focus-within, and pin pause the wrapper, nested drift, and both smoke
  pseudos. Reduced motion and failed angle registration fail static.
- Ridge cubic boundary 8 is an intentional sharp join. Its outgoing-heading
  turn is `117.871578°` at `48.5111%` desktop and `64.613624°` at `49.2289%`
  mobile.
- Cypress's authored identity requires six 90-degree transitions and two
  hairpins. A simple `15°` tangent-window threshold merges the two same-sign
  Drop Chute transitions, so threshold-only detection is insufficient.
- Applying the threshold separately to responsive profiles is also rejected:
  it produces unstable topology (Ridge 7 desktop/10 mobile and Cypress 7
  desktop/12 mobile). Positive responsive scaling preserves turn sign, but
  changes apparent curvature and timing.

Weak claims and remaining visual unknowns:

- The constants below are geometry-policy choices, not a claim that there is
  one universal mathematical definition of a visual corner.
- The compiled topology matches both authored courses, but yaw legibility and
  the approved cap still require normal-speed browser review.
- Cypress mobile has only about 3px minimum target clearance before this item.
  Removing drift translation should not worsen it, but item 4 remains the
  authorized clearance improvement.
- Browser automation can sample every envelope exactly. It cannot replace the
  required full-lap human review of perceived stability and direction.

## Approved scope

Builder may change only:

```text
dashboard/scripts/lib/route-compiler.mjs
dashboard/generated/route-motion.css
dashboard/styles.css
dashboard/tests/route-compiler.test.mjs
dashboard/tests/dashboard.test.mjs
dashboard/tests/browser/dashboard.spec.mjs
dashboard/tests/BROWSER_VERIFICATION.md
dashboard/tests/screenshots/desktop.png
dashboard/tests/screenshots/mobile.png
dashboard/tests/screenshots/desktop-ridge-pass.png
dashboard/tests/screenshots/mobile-ridge-pass.png
dashboard/tests/screenshots/desktop-cypress-run.png
dashboard/tests/screenshots/mobile-cypress-run.png
docs/superpowers/plans/2026-07-27-dashboard-roadmap.md
this design packet (status and evidence only)
```

`dashboard/README.md` may change only if the verification procedure otherwise
becomes false. Any other production file, route source, public key, generated
MJS change, dependency change, or screenshot change returns to architecture.

Expected production changes are limited to the compiler, generated motion CSS,
and base CSS. The renderer DOM and capability initializer already provide the
correct transform hierarchy and four registered angle properties; they are
inspected and tested but are not expected to change.

## Protected invariants

The following remain byte- or value-identical:

- every canonical path/control point, segment mapping, displayed centerline,
  responsive route position, percentage, retained frame count, anchor,
  allocation rule, and target size;
- `64s` linear traversal, `-4s` phases, animation names, state eligibility,
  and `98.8/99.2/99.6/100` reset behavior;
- `GENERATED_TRACK_INPUT`, `GENERATED_ROUTE_GEOMETRY`, public anchor keys, and
  numeric `angle: 0`;
- route sources, `route-config.mjs`, package files, fixtures, session schemas,
  adapter/collector/source controls, track selection, and workday schedule;
- renderer hierarchy, accessible names, ARIA, tab order, buttons, focus rings,
  hit targets, tooltips, parked cars, and atmosphere hierarchy; and
- the optional, self-contained, browser-local boundary plus all tmux, WezTerm,
  wallpaper, LLM-status, terminal-startup, installer, and live-collector
  behavior.

No random value, acceleration, braking, physics, runtime path measurement,
JavaScript animation loop, timer, polling, network request, service, daemon,
telemetry, storage, persistence, authentication, framework, or dependency is
authorized.

## Geometry-to-corner contract

### Coordinate and sign convention

Corner topology is detected once in canonical displayed map space. Responsive
profiles may change serialized timeline percentages and yaw magnitude, but not
corner identity or sign.

CSS/screen convention is authoritative:

```text
positive signed turn = clockwise = right turn
negative signed turn = counterclockwise = left turn
```

All responsive transforms have positive x/y scale, so they cannot reverse this
orientation. A sign change caused only by scaling is a compiler failure.

### Canonical detection lattice

Use the validated canonical cubics and unscaled map-space arc length:

```text
BASE_INTERVALS = 512
BASE_POINTS = 513
HALF_WINDOW_INTERVALS = 6
TANGENT_PROBES_PER_BASE_INTERVAL = 4
MAX_CONTINUOUS_PROBE_TURN = 90deg (exclusive)
WINDOW_TURN_THRESHOLD = 15deg
STEP_TURN_EPSILON = 0.05deg
BROAD_LOBE_TOTAL_TURN = 30deg
PROMINENCE_VALLEY_RATIO = 0.50
DISCONTINUOUS_JOIN_THRESHOLD = 45deg
```

The topology candidate set is a canonical pseudo-profile schedule built with
the existing candidate and collision machinery:

```text
profile width = 1000
profile height = 760
513 equal canonical-arc-length base points
every exact internal cubic boundary
percent = existing serializeFour(98.8 * distanceFraction)
```

Group candidates by that exact serialized percentage string, exactly as
`mergeScheduleCandidates` does. A group with one boundary retains the boundary
and discards a colliding base; multiple boundaries in one group fail; a
base-only group must contain exactly one base. The retained set is sorted by
numeric serialized percentage, while every later calculation continues to use
the retained candidate's unrounded canonical distance. An exact boundary uses
the outgoing derivative at `t=0`.

Before measuring windows, build one route-wide ordered tangent probe stream:

1. add `2049` equal canonical-distance probes (`512 * 4` intervals);
2. add every retained topology candidate distance;
3. for every topology candidate distance `s`, add the clamped exact distances
   `s - totalCanonicalLength * 6 / 512` and
   `s + totalCanonicalLength * 6 / 512`; and
4. at each internal cubic boundary add two ordered probes at the same distance:
   incoming cubic `t=1` first, outgoing cubic `t=0` second. All other
   same-distance probes deduplicate to the outgoing boundary probe.

Sort by unrounded canonical distance, then by the stated incoming/outgoing
boundary order. Compute the existing normalized heading at every probe and
unwrap the complete stream sequentially. Any non-boundary adjacent probe delta
with absolute magnitude greater than or equal to `90°` fails compilation as
an under-sampled continuous turn. An incoming-to-outgoing boundary delta may
be greater than `90°`, but the existing exact `180±1e-9` and serialized
180-degree tie failures still apply. This makes a continuous turn above 180
degrees accumulate with its true sign instead of aliasing to the endpoint
shortest arc; a turn too concentrated for the fixed probe density fails closed
instead of guessing.

At candidate canonical distance `s`, select stream headings at:

```text
before = max(0, s - totalCanonicalLength * 6 / 512)
after  = min(totalCanonicalLength, s + totalCanonicalLength * 6 / 512)
```

The exact endpoint probes were inserted above. Define signed window turn as
`unwrappedHeading(after) - unwrappedHeading(before)` from that single
route-wide stream; never renormalize this difference to a shortest arc. The
first and last six base intervals are guard bands and cannot start a threshold
corner. Nonfinite derivatives, effectively-zero derivatives, ambiguous
180-degree ties, or the continuous-probe guard fail compilation with
route/probe context.

### Meaningful-corner selection

Number retained candidates `C[0]..C[n-1]`.

1. A threshold region is a maximal inclusive candidate-index interval
   `[a,b]` in which every candidate has the same nonzero window-turn sign and
   absolute window-turn magnitude at least `15°`.
2. Read each retained candidate's already-unwrapped heading from the single
   route-wide probe stream; do not perform a second candidate-only unwrap.
   Define tangent step `D[i] = heading(C[i]) - heading(C[i-1])` for
   `i=1..n-1`. A step is neutral when `abs(D[i]) < 0.05°`; equality is
   nonneutral. A lobe is a maximal run of positive or negative steps that may
   bridge exactly one neutral step only when nonneutral steps of the same sign
   exist immediately on both sides. Leading/trailing neutral steps are not in
   a lobe. An opposite-sign step always ends the lobe. If its first and last
   step indices are `p` and `q`, its inclusive candidate bounds are
   `[p-1,q]`, and integrated turn is `sum(D[p..q])`, including any bridged
   neutral step.
3. A lobe with absolute integrated turn at least `30°` is eligible for the
   broad fallback only when its inclusive candidate interval intersects no
   threshold region of either sign. Inclusive ranges `[a,b]` and `[c,d]`
   intersect exactly when `max(a,c) <= min(b,d)`. Discrete adjacency
   (`b + 1 === c` or `d + 1 === a`) is not intersection and does not suppress
   fallback eligibility. A lobe whose inclusive range intersects any threshold
   region is already represented by short-window detection and does not
   contribute or expand a region. Add each eligible lobe interval as a
   broad-only region. Then combine same-sign regions by sorting on start/end
   and repeatedly unioning inclusive candidate ranges that overlap. Merely
   adjacent nonoverlapping intervals do not merge. Repeat to a fixed point;
   the result cannot contain overlapping same-sign regions. Any remaining
   opposite-sign overlap is a compiler failure. This fallback-only rule
   prevents a long signed lobe from expanding through the opposite-sign
   shoulder of an already detected chicane while still detecting a genuinely
   broad bend whose entire local window stays below `15°`.
4. Within each merged region, form provisional peaks from local maxima of
   absolute window-turn magnitude at least `15°`. Endpoints compare against
   their sole interior neighbor. A plateau is one peak at its earliest
   candidate. If a broad-only region has no qualifying peak, use its earliest
   global absolute maximum.
5. Add every internal join in the region whose authored
   incoming-to-outgoing turn is at least `45°` as a forced peak. For each
   forced peak, remove nonforced peaks within canonical distance
   `totalCanonicalLength * 6 / 512` on either side. Two forced peaks are never
   collapsed.
6. Sort remaining peaks by candidate order. For every adjacent pair, find the
   earliest candidate with minimum absolute window magnitude strictly between
   them. It is a split valley only when:

   ```text
   valleyMagnitude <= 0.50 * min(leftPeakMagnitude, rightPeakMagnitude)
   ```

   Evaluate all adjacent pairs before forming corners. Split valleys partition
   the ordered peaks into peak clusters. For each cluster, choose its apex as
   the forced peak with greatest authored join magnitude, or, if it contains
   no forced peak, the provisional peak with greatest absolute window
   magnitude; exact ties choose the earlier candidate. The valley becomes the
   shared zero-yaw exit/entry. This generically splits the two Drop Chute turns
   while leaving sustained East/South hairpins whole.
7. A merged region's outer entry is the nearest retained **base** candidate
   whose canonical distance is strictly before its start candidate; outer exit
   is the nearest retained **base** candidate strictly after its end candidate.
   Skip inserted boundary candidates for these two outer zero-yaw shoulders.
   Boundaries still participate in signals, regions, lobes, and apex selection;
   they simply cannot shorten an outer shoulder between adjacent uniform base
   points. Missing outer base candidates fail compilation rather than clamp
   into the endpoint guard. Split valleys remain retained candidates of either
   kind and partition those outer bounds into corners. Entry must be before
   apex, apex before exit, and adjacent same-sign corners may share only a split
   valley.
8. Regions with a sign transition are always separate. Opposite signs never
   interpolate directly; a serialized zero-yaw frame must separate them.

No track ID, segment label, authored timing percentage, or handwritten
per-course drift schedule participates in detection.

### Approved canonical topology

Canonical lattice indices below are diagnostic locators, not authored route
data. `L` is negative/counterclockwise and `R` is positive/clockwise.

| Course | Corner | Sign | Entry | Apex | Exit | Note |
|---|---:|:---:|---:|---:|---:|---|
| Ridge | 1 | L | 29 | 35 | 36 | broad upper transition |
| Ridge | 2 | R | 66 | 81 | 95 | Pass Ladder |
| Ridge | 3 | L | 116 | 137 | 153 | Pass Ladder |
| Ridge | 4 | R | 175 | 182 | 191 | Cedar transition |
| Ridge | 5 | L | 193 | 194 | 199 | immediate chicane return |
| Ridge | 6 | R | 246 | boundary 8 | 265 | mandatory discontinuous apex |
| Ridge | 7 | L | 341 | 359 | 385 | Long Arc hairpin |
| Ridge | 8 | R | 446 | 454 | 467 | lower broad bend |
| Cypress | 1 | R | 51 | 66 | 76 | first North Ninety |
| Cypress | 2 | L | 79 | 89 | 99 | second North Ninety |
| Cypress | 3 | R | 130 | 142 | 172 | East Hairpin |
| Cypress | 4 | L | 212 | 225 | 235 | Drop Chute entry |
| Cypress | 5 | L | 235 | 247 | 259 | Drop Chute exit |
| Cypress | 6 | R | 302 | 325 | 340 | South Hairpin |
| Cypress | 7 | R | 440 | 454 | 463 | West rise |
| Cypress | 8 | R | 475 | 486 | 496 | compact reversal |

Expected profile frame percentages after nearest-retained-frame projection:

| Course/profile | Corner entry/apex/exit percentages |
|---|---|
| Ridge desktop | `5.5961/6.7539/6.9469`, `12.9289/15.6305/18.332`, `22.5773/26.4367/29.4286`, `33.7695/35.3133/36.857`, `37.243/37.4359/38.4008`, `47.2773/48.5111/50.9438`, `65.8023/69.0828/73.907`, `85.8711/87.4148/90.1164` |
| Ridge mobile | `5.5961/6.7539/6.9469`, `11.9641/15.4375/18.1717`, `21.6125/26.2437/29.6368`, `33.1906/34.3484/36.4711`, `36.857/37.243/38.4008`, `47.8562/49.2289/52.1016`, `65.8023/70.0477/76.0297`, `86.8359/88.1867/90.3094` |
| Cypress desktop | `10.4203/13.3148/14.8586`, `15.4375/16.9812/19.1039`, `25.2789/27.7875/32.9977`, `41.1023/43.8039/45.3477`, `45.3477/47.2773/49.593`, `58.4695/62.5219/65.4164`, `85.6781/88.3797/89.9234`, `91.8531/93.5898/95.5195` |
| Cypress mobile | `7.9117/10.6133/13.7008`, `14.6656/17.5602/19.2969`, `24.1211/26.2437/33.7695`, `39.9445/42.4531/45.3477`, `45.3477/49.0141/51.1367`, `57.6977/63.4867/66.1883`, `81.8187/84.7133/87.4148`, `91.2742/94.5547/96.2914` |

The Builder must reproduce these counts, signs, and locators from the generic
algorithm. A mismatch returns to architecture; it is not repaired with a
track-specific constant.

## Responsive yaw and envelope contract

For each canonical corner and responsive profile:

1. Project entry/apex/exit independently to the nearest existing retained
   profile frame by unrounded canonical path distance. Exact cubic boundaries
   select the existing boundary frame. A distance tie selects the earlier
   frame. Projected entry/apex/exit must remain strictly ordered; otherwise
   compilation fails. A shared split valley is projected once and the same
   retained frame is used as both adjacent corners' boundary. Projected
   nonzero envelopes may not overlap.
2. Re-evaluate responsive headings at the same complete ordered probe
   distances and incoming/outgoing boundary ordering used by canonical
   detection, applying the profile's x/y scale. Sequentially unwrap the whole
   responsive probe stream with the same non-boundary `<90°` continuous guard
   and boundary 180-degree tie rules. Compute the signed ±6/512 apex window by
   differencing its exact unwrapped endpoint headings without renormalizing to
   a shortest arc. A responsive continuous turn that violates the probe guard
   fails compilation; it never changes sign through endpoint aliasing.
3. Assert its sign matches the canonical corner. Let `strength` be the
   absolute responsive window turn. For a mandatory discontinuous join, use
   the greater of window strength and responsive authored join magnitude.
4. Compute visual chassis peak yaw. `cornerSign` is the actual route-turn
   direction and the chassis yaw uses that same sign so the nose points into
   the turn while the rear reads outward:

   ```text
   normalized = clamp((strength - 15) / (90 - 15), 0, 1)
   peakMagnitude = 10deg + 20deg * normalized
   visualPeak = cornerSign * peakMagnitude
   ```

   Thus detected broad bends receive at least `10°`; tight corners increase
   linearly and clamp at `30°`. Four-decimal rounding happens only after the
   complete calculation.
5. Let `dE`, `dA`, and `dX` be the unrounded canonical distances of the
   projected retained entry, apex, and exit frames—not the original canonical
   landmark distances. Entry and exit yaw are exactly `0deg`; apex yaw is
   exactly `visualPeak`. For every retained profile frame with canonical
   distance `d`, interpolate entry-to-apex and apex-to-exit independently with:

   ```text
   entry half: t = (d - dE) / (dA - dE)
   exit half:  t = (dX - d) / (dX - dA)
   smoothstep(t) = 3t^2 - 2t^3
   ```

   Clamp `t` to `0..1` only after the strict landmark-order and envelope
   membership checks. Canonical distance, not timeline percentage, supplies
   `t`. This projected-frame definition guarantees serialized samples hit
   exact zero/peak/zero. Outside all corner envelopes yaw is exactly zero. At
   a shared prominence valley both corners serialize zero.
6. For every retained visible frame, first compute
   `roundedYaw = roundFour(rawYaw)`, then serialize `roundedYaw` as
   `--drift-yaw` and `-roundedYaw` as `--drift-upright-yaw`. Do not round the
   two properties independently. They appear after the heading pair. A frame
   may belong to at most one nonzero envelope.
7. Reset frames preserve final/final/first/first drift values at
   `98.8/99.2/99.6/100`. Endpoint guard bands make first and final yaw zero.

The serialized frame property order is:

```text
left
top
--route-heading
--route-upright-heading
--drift-yaw
--drift-upright-yaw
opacity (only where already present)
```

Serialization uses the existing four-decimal formatter, removes negative
zero, rejects nonfinite output, and remains byte-deterministic.

## CSS and transform composition

The generated traversal animation now owns route position, tangent heading,
drift yaw, and both inverses. Constant route speed is unchanged because no
position, percentage, duration, phase, or timing function changes.

Base CSS becomes:

```css
.car-angle {
  transform: rotate(var(--route-heading, 0deg));
}

.car-motion {
  animation: none;
  transform: rotate(var(--drift-yaw, 0deg));
}
```

Delete the capability-gated `active-drift`/`thinking-drift` assignments and
their free-running keyframes. Delete drift translation. The route center and
button center therefore remain exactly on the compiled centerline.

The wrapper pause already freezes traversal, heading, and compiled drift as one
animation. Keep both smoke pause blocks. A separate `.car-motion`
`animation-play-state` pause block is unnecessary and must be removed so tests
do not imply a second drift clock.

The atmosphere remains a sibling that follows tangent heading but not drift.
Its size, opacity, travel, pointer inertness, mobile reduction, stacking, and
ARIA stay unchanged.

Glyph and code keep:

```css
rotate(calc(
  var(--route-upright-heading, 0deg)
  + var(--drift-upright-yaw, 0deg)
))
```

The button, focus/hit target, tooltip, and wrapper never rotate. Parked cars
inherit zero heading/yaw. Unsupported property registration and reduced motion
retain static responsive tangent headings with zero drift and no smoke.

## Tests and visual review

### Compiler and static tests

Add direct tests for:

- left, right, straight, near-zero curvature, broad bend, tight hairpin,
  distributed turn above 180 degrees, under-sampled concentrated-turn
  rejection, sign transition, same-sign prominence split, and discontinuous
  boundary;
- exact constants, canonical lattice construction, outgoing boundary tangent,
  endpoint guard, `0.05°` neutral steps, `15°` activation, `30°` broad-lobe
  fallback, `0.50` prominence split, and `45°` join promotion;
- broad-fallback suppression for inclusive intersection with same-sign and
  opposite-sign threshold regions, plus explicit adjacent nonintersection;
- deterministic entry/apex/exit selection and earlier-candidate tie rules;
- outer entry/exit selection from strictly outside base candidates when an
  inserted non-apex boundary lies between the threshold edge and next base;
- responsive sign preservation, magnitude scaling, `10°` floor, `30°` cap,
  smoothstep interpolation, shared zero valley, four-decimal inverse
  serialization, and negative-zero normalization;
- responsive distributed-turn-above-180 sign preservation and responsive
  continuous-probe alias rejection;
- strict projected entry/apex/exit ordering, collapse/overlap rejection,
  projected-distance exact zero/peak/zero samples, and complete-frame proof
  that every nonzero frame has its corner sign and belongs to one envelope;
- exact eight-corner Ridge/eight-corner Cypress tables above;
- unchanged route percentages, positions, counts (`527/533`), headings,
  opacity, geometry, anchors, phases, speed groups, deviation, and reset
  milestones;
- generated MJS byte identity, CSS property order, absence of independent
  drift animation/translation, and unchanged `64s linear` assignments;
- unchanged capability failure, parked, reduced-motion, smoke, focus, hit
  target, tooltip, fixture/live, allocation, and protected API tests.

### Browser matrix

At both `1440×900` and `390×844`, for both tracks:

- sample entry, apex, and exit of all eight corners;
- assert entry/exit yaw `0±0.01°`, apex sign, magnitude `10..30°`, inverse yaw,
  tangent-relative car composition, and glyph/code net upright error
  `<=0.25°`;
- assert tight-corner peak is greater than broad-corner peak and all straight
  audit samples resolve to zero yaw;
- retain tangent error `<=0.25°`, centerline error `<=1px`, target separation
  `>=52/44px`, complete containment, and zero horizontal overflow;
- assert the wrapper has one `64s linear` traversal animation and
  `.car-motion` has no independent animation;
- regress hover, focus, pin-after-leave/blur, Escape resume, both smoke
  pseudos, reduced motion, capability failures/collision/caching, static
  tangent fallback, parked state, track switching, focus identity, and clean
  diagnostics;
- keep console warnings, console errors, page errors, failures, and skips at
  zero.

### Normal-speed visual gate

At each viewport:

1. watch one complete normal-speed 64-second Ridge lap;
2. watch one complete normal-speed 64-second Cypress lap;
3. repeat Ridge boundary 8 at least three times;
4. inspect every corner direction, entry/apex/exit legibility, straights,
   glyph/code uprightness, smoke, focus, tooltip, target containment, and
   adjacent-session clearance; and
5. exercise hover, focus, pin, Escape, and reduced motion.

Any reverse spin, long-arc interpolation, sign flicker, left/right ambiguity,
route-center displacement, clipping, or visually unstable boundary 8 returns
to architecture.

Refresh exactly the six approved fixture-only screenshots. Pause traversal and
smoke deterministically; do not seek a nonexistent nested drift animation.
Record computed yaw/headings and capture procedure in
`BROWSER_VERIFICATION.md`. Other screenshots remain byte-identical.

## Verification commands

```sh
npm --prefix dashboard run routes:check
npm --prefix dashboard run test:unit
npm --prefix dashboard run test:browser
node --check dashboard/scripts/lib/route-compiler.mjs
node --check dashboard/tests/route-compiler.test.mjs
node --check dashboard/tests/dashboard.test.mjs
node --check dashboard/tests/browser/dashboard.spec.mjs
git diff --check
```

Also confirm:

- generated artifacts are current;
- generated MJS, route sources, config, package/lock files, renderer,
  capability initializer, fixtures, adapters, collectors, and protected files
  are unchanged;
- no dependency, network/process API, polling, timer, telemetry, persistence,
  terminal integration, or roadmap item 4–6 work appears;
- test ports `43917` and `43918` and any manual preview port are clear; and
- the final diff contains only authorized files.

## Observability and rollback

Runtime observability impact is none. No log, metric, event, trace, timer,
storage value, or diagnostic UI is added. Build-time observability remains the
compiler's deterministic validation errors and `routes:check`.

Rollback is one revert of item 3a. It restores the prior generic drift loops
without any data migration. Do not retain generated drift declarations with
the old independent CSS loop or vice versa.

## Acceptance criteria

Implementation passes only when all user-supplied acceptance criteria are met,
the exact generic contract above produces eight corners per track/profile,
both independent QA gates return PASS, the full verification matrix is clean,
and the roadmap records item 4 as the next task.

## Delivery evidence — 2026-07-28

Final independent post-change QA returned PASS and authorized commit and push.
This packet records that release authorization; commit and push state is
established by the release action rather than asserted here.

- Generic compiler output identifies eight meaningful signed route corners for
  Ridge Pass and eight for Cypress Run in each profile. Existing route
  keyframes carry `10..30deg` same-sign visual yaw and its inverse,
  while positions,
  percentages, frame counts, anchors, geometry, contracts, phases, reset
  milestones, and the `64s linear` traversal remain unchanged.
- Two focused architecture corrections were implemented within the approved
  contract: the `>=30deg` broad-lobe fallback now applies only when its
  inclusive interval intersects no threshold region, preventing opposite-sign
  Ridge-chicane expansion; and outer zero-yaw entry/exit shoulders now use the
  nearest strict retained base candidates while boundaries remain valid
  signals, apexes, and valleys, restoring generic table determinism.
  Post-QA remediation also clamps responsive apex windows and adds contextual
  probe lookup with exact-boundary tests. A subsequent independently approved
  revised visual-sign remediation preserves the actual route-turn
  `corner.sign` and responsive sign validation, serializes chassis yaw as
  `peakYaw = corner.sign * peakMagnitude`, and raises the generic visibility
  policy to a `10deg` floor and `30deg` cap; its inverse remains the exact
  negation of the once-rounded yaw. Generated CSS and the six deterministic
  fixture screenshots were refreshed for that correction.
- Verification PASS: `npm --prefix dashboard run routes:check`; 140/140 unit
  tests; 22/22 browser tests; all required browser-spec syntax checks;
  `git diff --check`; current generated artifacts; cleared test-server ports;
  and protected-file/dependency/network/process/polling/telemetry/unrelated-
  roadmap audits. Console warnings, console errors, page errors, failures,
  and skips were zero.
- The six approved deterministic desktop/mobile screenshots were refreshed and
  reviewed. Normal-speed laps of Ridge and Cypress were reviewed at both
  viewports, with Ridge boundary 8 repeated at least three times per viewport;
  the visual gate passed. Fresh cache-disabled hard loads confirmed the nose
  points into each turn and the rear reads outward at normal dashboard scale.
  Rendered `.car-body` bounds remained contained and nonoverlapping at every
  apex on both tracks and viewports. Ridge boundary 8 measured `30deg`
  desktop and `27.5142deg` mobile visual yaw.
- No protected terminal, dashboard optionality, fixture/live-adapter, or
  Notion boundary changed. No Notion work was created or updated. Runtime
  observability remains unchanged: no runtime logs, metrics, events, traces,
  timers, storage, or diagnostic UI were added. No model availability
  exception occurred.

Next task: roadmap item 4, Cypress mobile clearance. Items 5 and 6 remain
deferred and unmodified.

## Independent pre-implementation QA packet

```text
Role:
You are an independent Lead Architect auditing the optional Night Pass
dashboard's item 3a corner-aware drift design.

Stage:
Pre-implementation QA-planning gate. Builder is blocked unless your verdict is
PASS.

Scope:
Audit the complete contract in:
- docs/superpowers/specs/2026-07-28-dashboard-corner-aware-drift-design.md
- docs/superpowers/specs/2026-07-28-dashboard-route-compiler-design.md
- docs/superpowers/specs/2026-07-28-dashboard-tangent-atmosphere-design.md
- docs/superpowers/specs/2026-07-26-dashboard-multi-track-design.md
- docs/superpowers/plans/2026-07-27-dashboard-roadmap.md

Inspect the current compiler, cubic math, generated CSS, renderer hierarchy,
capability initializer, base CSS, route sources, package configuration, Node
tests, Playwright tests, browser evidence, and screenshots named in the
corner-aware design.

Architecture to challenge:
- canonical 513-point plus boundary topology;
- signed ±6/512 tangent window;
- 15-degree activation, 0.05-degree neutral step, 30-degree integrated broad
  fallback, 0.50 same-sign prominence split, and 45-degree discontinuous join
  promotion;
- canonical topology with responsive projection and magnitude;
- 10..30-degree capped linear strength policy and smoothstep entry/exit;
- eight Ridge and eight Cypress corners with the exact tables;
- generated yaw/inverse declarations in the existing route animation;
- deletion of independent drift timing/translation;
- unchanged route speed, positions, timing, geometry, DOM, capability,
  atmosphere, accessibility, fallback, data, and protected terminal boundary.

Attack:
1. false positives/negatives, endpoint artifacts, sign reversal, peak/valley
   ties, overlapping envelopes, broad bends, hairpins, sign transitions, and
   discontinuous joins;
2. Cypress Drop Chute splitting versus East/South hairpin preservation;
3. Ridge boundary 8 apex/sign and long-arc interpolation;
4. responsive projection, strength, four-decimal collisions, deterministic
   serialization, and future-course generality;
5. CSS custom-property interpolation, transform/inverse composition,
   pause/resume, reduced motion, capability failure, parked state, focus/hit
   target/tooltip isolation, smoke, containment, and mobile clearance;
6. invariants for every route frame, percentage, position, count, heading,
   reset, anchor, timing, phase, schema, fixture/live behavior, dependency,
   optional isolation, and protected terminal system;
7. whether the compiler, browser, screenshot, and normal-speed review plans
   are sufficient and independently reproducible.

Observability:
The design chooses no new runtime observability; determine whether compiler
diagnostics and tests are sufficient.

Out of scope:
Roadmap items 4-6, route artwork changes, vehicle physics, runtime geometry,
new services/dependencies, and terminal/live-collector changes.

Output required:
1. PASS or FAIL.
2. Explicit Builder authorization: may begin / must remain blocked.
3. Blockers ordered by severity with minimal resolutions.
4. Corner-detector and envelope audit.
5. Exact Ridge/Cypress topology and responsive-table audit.
6. CSS/interaction/accessibility/fallback audit.
7. Test and visual-review sufficiency audit.
8. Protected-contract and observability audit.
9. Non-blocking recommendations separated from blockers.
10. Explicit sign-off status and remaining conditions.
```
