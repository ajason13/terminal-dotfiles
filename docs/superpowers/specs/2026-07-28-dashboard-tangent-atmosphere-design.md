# Dashboard Tangent Orientation and Atmosphere Design

Date: 2026-07-28

Status: complete; final independent post-change QA PASS

Delivery mode: Gated Delivery

Implementation evidence (2026-07-28): the focused pre-implementation review
returned PASS and authorized the Builder. Implementation preserves 527 Ridge
and 533 Cypress visible frames per profile, the generated geometry module,
route sources, public `angle: 0` anchors, lockfile, 64-second timeline, phase,
and reset positions. `routes:check`, 122/122 Node tests, 12/12 Chromium tests,
all-MJS syntax checks, and `git diff --check` pass. The six approved neutral
screenshots were refreshed. Normal-speed full-lap recordings for both tracks
and both viewports were reviewed; Ridge boundary 8 remained readable without
reverse spin or state-marking loss. The final post-change result is recorded
below.

Post-change QA remediation evidence (2026-07-28): contextual heading failures
and the missing compiler/static/capability/browser matrix cases were added
without changing the visual contract or screenshots. `routes:check` and
127/127 Node tests pass. The expanded Playwright suite passes all 22
project-expanded cases across desktop and mobile Chromium. That run exposed
and verified the correction for a mobile cascade defect: the capability-gated
thinking-puff override now retains the specified 3px size, 3.2-second duration,
and single-puff policy without `!important`. Browser syntax, `git diff --check`,
and test-server cleanup also pass. This evidence satisfied the final
post-change gate recorded below.

Final independent post-change handoff (2026-07-28): PASS with no blockers.
The gate is closed and roadmap item 3 is complete. Verification evidence:
`routes:check` PASS; 127/127 unit tests PASS; 22/22 desktop/mobile Playwright
cases PASS; browser syntax PASS; `git diff --check` PASS; ports 43917/43918
clear; and all six approved screenshots refreshed. The mobile thinking-puff
selector cascade correction computes to the specified 3px size, 3.2-second
duration, and 0-second delay. The only remaining risk is manual-only and
nonblocking: normal-speed review visually accepted the intentionally abrupt
Ridge boundary 8; the capability browser matrix samples active smoke, while
mobile thinking capability gating is covered statically plus in a supported
browser. No Notion task exists or was created. Next owner/task: roadmap item
4, Cypress mobile clearance.

## Objective

Make every moving route car face the responsive screen-space tangent of its
canonical route, then add restrained deterministic drift yaw and decorative
exhaust atmosphere for the `active` and `thinking` states.

This is a visual-only extension of the completed route compiler. It must not
change any route point, keyframe percentage, frame count, route duration,
phase, reset milestone, anchor, allocation rule, source/session contract,
workday track schedule, or optional local-only boundary.

## Delivery classification and gate

This item uses **Gated Delivery** because it changes the generated CSS contract
shared by the route compiler, renderer DOM, responsive behavior, inspection
pause cascade, reduced-motion behavior, and browser verification.

The Lead Architect owns this packet. An independent reviewer must return PASS
against the packet at the end of this document before the Builder changes
runtime files. After implementation, the same boundary requires an independent
post-change PASS before the roadmap item can be marked complete.

## Repository facts

The following are observations from the current implementation, not new
decisions:

- `dashboard/generated/route-motion.css` contains 527 visible frames for each
  Ridge profile and 533 for each Cypress profile. The reset remains at
  `98.8%`, `99.2%`, `99.6%`, and `100%`.
- Desktop and mobile schedules are independently calibrated at `1160×682` and
  `372×580` because `preserveAspectRatio="none"` applies nonuniform x/y scale.
- The generated schedules currently own `left`, `top`, and reset `opacity`.
  The public generated route anchors still have the exact key set
  `id,poolLabel,x,y,angle`, with `angle: 0`.
- Route traversal runs on `.vehicle-anchor`. The unrotated
  `button.session-car` contains `.car-angle > .car-motion > .car-body`; the
  tooltip is a sibling of the button. The SVG car's forward axis is local
  negative Y.
- The wrapper is the 52px desktop or 44px mobile focus/hit target. Its tooltip,
  focus treatment, and inspection state must not rotate.
- Only `active` and `thinking` sessions use route slots and route traversal.
  Parked and unknown vehicles have no `data-route-slot`.
- Existing nested state motion uses 2.8-second active and 3.6-second thinking
  cycles. Route traversal is 64 seconds, linear, with a negative four-second
  phase per route slot.
- Hover, focus-within, and pin currently pause both the route wrapper and
  `.car-motion`. Reduced motion disables both.
- The renderer already writes zero-degree angle variables from the public
  anchor `angle`; because an element's own inline custom property overrides an
  inherited value, those route inline declarations cannot remain on
  `.car-angle` once heading is animated on its ancestor.
- Measured from the canonical cubics, Ridge boundary 8 has the only intentional
  large tangent discontinuity: `117.871578°` desktop at generated
  `48.5111%`, and `64.613624°` mobile at `49.2289%`. The next-largest Ridge
  join is under 20 degrees; Cypress joins are under 23 degrees. This sharp
  authored join is not a compiler defect.
- The immediately preceding retained frames are `48.4352%` desktop and
  `49.207%` mobile. Their tangent-to-outgoing-boundary deltas are
  `118.186960°` and `64.701536°`, respectively. Those interpolation deltas are
  related to, but not equal to, the authored incoming-to-outgoing join angles.
- Current automated browser coverage verifies geometry, phase, containment,
  pause/resume, and reduced motion but does not verify tangent direction,
  registered-property fallback, pseudo-element smoke, or upright markings.

## Approved scope

The Builder may change only:

```text
dashboard/scripts/lib/route-compiler.mjs
dashboard/generated/route-motion.css
dashboard/src/render-dashboard.mjs
dashboard/src/route-motion-capability.mjs        (new)
dashboard/src/app.mjs
dashboard/styles.css
dashboard/tests/route-compiler.test.mjs
dashboard/tests/dashboard.test.mjs
dashboard/tests/renderer-lifecycle.test.mjs
dashboard/tests/browser/dashboard.spec.mjs
dashboard/tests/BROWSER_VERIFICATION.md
dashboard/tests/screenshots/desktop.png
dashboard/tests/screenshots/mobile.png
dashboard/tests/screenshots/desktop-ridge-pass.png
dashboard/tests/screenshots/mobile-ridge-pass.png
dashboard/tests/screenshots/desktop-cypress-run.png
dashboard/tests/screenshots/mobile-cypress-run.png
dashboard/README.md                               (only if verification guidance needs it)
docs/superpowers/plans/2026-07-27-dashboard-roadmap.md
this design packet                              (status/evidence sections only)
```

The generated MJS is compiled during verification but is expected to remain
byte-identical. If implementation requires any other production file, public
key, route source, or screenshot, stop and return to architecture.

The Builder may edit this design packet only to change `Status` and append
dated implementation evidence, QA verdicts, and final handoff state.
Normative scope, selector, math, effect, test, acceptance, or protected-boundary
text is Lead Architect-owned; a needed normative change returns to
architecture.

## Non-goals and protected boundaries

- No route geometry, control point, segment mapping, anchor locator, anchor
  coordinate, keyframe percentage, visible frame count, timeline, easing,
  duration, phase, opacity reset, target size, or responsive breakpoint change.
- No smoothing, timing expansion, extra frame, or road redesign to hide Ridge
  boundary 8.
- No change to the generated/public anchor `angle` value or key set. It remains
  the numeric integer `0` for all route anchors.
- No acceleration, braking, physics, random drift, random smoke, timer,
  JavaScript animation loop, canvas, WebGL, image asset, audio, or vibration.
- No status, snapshot, fixture, collector, import, live-adapter, allocation,
  overflow, source-controller, track-selection, or workday schedule change.
- No backend, daemon, polling, network request, persistence, telemetry,
  analytics, storage, cookie, service worker, framework, dependency, or lockfile
  change.
- No tmux, WezTerm, wallpaper, LLM-status, installer, shell startup, default
  startup, or terminal-process change.
- No third-party visual asset or licensing input. The effect remains CSS over
  the existing original SVG.

## Architecture boundaries

### Compiler ownership

`dashboard/scripts/lib/route-compiler.mjs` remains the sole owner of:

- responsive tangent evaluation for retained route frames;
- four-decimal heading serialization and continuity unwrapping;
- reset headings;
- generated desktop/mobile route-slot static headings; and
- generated heading declarations and their deterministic ordering.

The compiler must reuse the already validated canonical cubics, retained
base-plus-boundary candidates, exact responsive profiles, and derivative
functions from the SVG cubic library. It must not parse generated CSS or use
browser SVG APIs.

### Generated CSS ownership

`dashboard/generated/route-motion.css` owns:

- track/route-slot desktop and mobile static heading selectors;
- capability-gated active/thinking traversal assignments; and
- `--route-heading` plus its inverse in every route keyframe.

It continues to own all existing route animation names, positions,
percentages, reset opacity, track order, responsive animation-name overrides,
and generated ownership header.

`dashboard/src/generated/route-geometry.mjs` does **not** gain tangent data.
`GENERATED_TRACK_INPUT`, `GENERATED_ROUTE_GEOMETRY`, their public keys, all
anchor values, and the source digest remain unchanged.

### Hand-authored CSS ownership

`dashboard/styles.css` owns:

- default zero-angle variables;
- the `.car-angle`, `.car-motion`, `.car-body`, and atmosphere layer styles;
- deterministic active/thinking drift and smoke keyframes;
- pause selectors;
- mobile effect reductions; and
- reduced-motion disabling.

No hand-authored track ID, route-slot heading value, responsive tangent, or
route animation name may be copied into base CSS.

### Renderer DOM ownership

For every car, the DOM remains exactly:

```text
.vehicle-anchor or .pit-vehicle
  span.car-atmosphere[aria-hidden="true"]
  button.session-car
    span.car-angle
      span.car-motion
        span.car-body
          svg.car-silhouette[aria-hidden="true"]
          span.car-glyph[aria-hidden="true"]
          span.car-code[aria-hidden="true"]
  span.session-tooltip[role="tooltip"]
```

There is exactly one `.car-atmosphere` per car, inserted immediately before
the button. It has an empty text value,
`aria-hidden="true"`, and no role, dataset, ID, listener, or state. CSS sets it
and both pseudo-elements to `pointer-events: none`.

The atmosphere is a sibling of the button. It independently consumes inherited
`--route-heading`, so its exhaust axis follows the route while staying outside
drift yaw. This prevents the mobile button's circular `clip-path` from
silently clipping the required thinking puff. The tooltip, button, focus
target, and `.session-car` remain outside both rotating visual subtrees.

The renderer removes the current route inline `--vehicle-angle` and
`--vehicle-upright-angle` declarations. It does not replace them with heading
math. Parked vehicles inherit the CSS zero defaults.

### Capability boundary

Add `dashboard/src/route-motion-capability.mjs` with one exported initializer.
`app.mjs` calls it on `#dashboard-root` before the first snapshot render.

The initializer uses a module-scope cache whose initial value is unknown. On
the first call it attempts all four registrations, in the fixed order above,
through `CSS.registerProperty`. Each call has its own `try/catch`, so a failure
does not prevent attempts for the remaining names. All four calls must return
without exception. Any exception—including `InvalidModificationError`,
regardless of whether earlier names registered successfully—sets the final
cached result to `false`. Registration is irreversible, so partial
registration remains deliberately fail-static for that page.

Only a first-call result of four successes sets:

```text
data-route-angle-motion="enabled"
```

Later calls never register again. They reuse the cached boolean, set the
attribute when true, and remove a stale attribute when false. A missing
`CSS.registerProperty` API caches false and removes the attribute. The
initializer catches every registration exception, never throws or logs, is
idempotent in one page lifetime, returns the cached boolean, creates no timer,
persists nothing, and announces nothing.

Generated route traversal assignments and hand-authored drift/smoke animation
assignments require that exact enabled attribute. Unsupported registration
therefore produces static route cars at their existing generated anchors with
the correct responsive static tangent, zero drift, and no smoke. Continuing
route movement with discretely jumping custom angles is forbidden because it
would create misleading sideways travel and heading snaps. A static fallback
is the fail-safe behavior.

## Registered angle contract

The four properties are registered exclusively through
`CSS.registerProperty`; there are no literal `@property` rules. Combining the
two registration mechanisms would make the required first JavaScript
registration throw `InvalidModificationError` in a conforming browser and
would incorrectly force the supported path into fallback.

Each JavaScript registration uses the descriptor equivalent of:

```js
{
  name: '--route-heading',
  syntax: '<angle>',
  inherits: true,
  initialValue: '0deg',
}
```

The other names use the same `syntax`, `inherits`, and `initialValue`. Their
fixed registration order is `--route-heading`, `--route-upright-heading`,
`--drift-yaw`, `--drift-upright-yaw`. The names, syntax string, inheritance,
initial value, absence of literal `@property` rules, and call order are
static-tested. Base CSS still provides ordinary `0deg` fallback declarations
so static transforms work when registration is unsupported.

The paired upright properties are deliberate. They avoid relying on
not-yet-universal angle multiplication inside `calc()`. Every generated or
hand-authored keyframe must emit exact additive inverses. The glyph and code
use:

```css
transform: rotate(calc(
  var(--route-upright-heading, 0deg)
  + var(--drift-upright-yaw, 0deg)
));
```

The car visual transforms are:

```css
.car-angle {
  transform: rotate(var(--route-heading, 0deg));
}

.car-motion {
  transform: translate(0, 0) rotate(var(--drift-yaw, 0deg));
}
```

Each drift keyframe sets its literal `translate(<x>, <y>)` followed by
`rotate(var(--drift-yaw))`. The browser interpolates the standard `transform`
property while the registered yaw and inverse-yaw properties interpolate.
There are no unregistered translation custom properties that could step
discretely.

## Cascade and selector contract

The capability gate uses `:where()` so it contributes zero specificity.
Generated desktop traversal assignments use exactly:

```css
.dashboard-root:where([data-route-angle-motion="enabled"])[data-track-id="<track>"]
  .vehicle-anchor.state-active,
.dashboard-root:where([data-route-angle-motion="enabled"])[data-track-id="<track>"]
  .vehicle-anchor.state-thinking
```

Each selector has specificity `0-4-0`. The existing later wrapper pause
selectors use exactly:

```css
.dashboard-root[data-track-id] .vehicle-anchor:hover,
.dashboard-root[data-track-id] .vehicle-anchor:focus-within,
.dashboard-root[data-track-id] .vehicle-anchor[data-pinned="true"]
```

They also have specificity `0-4-0`, so source order makes
`animation-play-state: paused` win. The mobile generated `animation-name`
overrides use the same capability-gated selector shape and specificity.

Active/thinking drift assignments append `.car-motion` to the capability-gated
state selectors and therefore have specificity `0-5-0`. Their later pause
selectors append `.car-motion` to the three inspection selectors and also have
specificity `0-5-0`.

For drift, the exact suffix is ` .car-motion`. For smoke, the exact suffix is
` > .car-atmosphere::before` or ` > .car-atmosphere::after`; direct-child
matching pins the reviewed sibling hierarchy. The assignment expands
`state-active` and `state-thinking` as two comma-separated selectors and does
not use `:is()`.

The later smoke pause selectors are exactly:

```css
.dashboard-root[data-track-id]
  .vehicle-anchor:hover > .car-atmosphere::before,
.dashboard-root[data-track-id]
  .vehicle-anchor:focus-within > .car-atmosphere::before,
.dashboard-root[data-track-id]
  .vehicle-anchor[data-pinned="true"] > .car-atmosphere::before
```

with an identical separate block ending in `::after`. Assignment and pause
smoke selectors have specificity `0-5-1`. No `!important` is used outside the
existing reduced-motion policy.

A static test must parse every assignment/pause selector, assert these exact
forms and specificity tuples, and prove every pause block occurs later than
the assignment it overrides. Browser tests must additionally verify computed
play state for the wrapper, drift, `::before`, and `::after` during hover,
focus, pin-after-blur/pointer-leave, Escape, and ordinary resume. Static
specificity evidence alone is not sufficient.

## Heading mathematics

For canonical cubic derivative `(dx,dy)` and profile scale:

```text
sx = profile.width / 1000
sy = profile.height / 760
screen derivative = (dx × sx, dy × sy)
raw heading degrees = atan2(dy × sy, dx × sx) × 180 / π + 90
```

The `+90` aligns the car SVG's local negative-Y forward axis to the
screen-space forward tangent. Desktop and mobile headings are not
interchangeable.

### Derivative selection

- A retained base candidate uses the derivative returned by
  `pointAtDistance` at its unrounded route-distance fraction.
- An exact internal cubic boundary uses the outgoing cubic derivative at
  `t=0`, including a boundary that replaced a colliding base candidate.
- The first route frame uses the first cubic at `t=0`.
- The final visible route frame uses the final cubic at `t=1`.
- Static slot heading first resolves the anchor's authored segment-local `at`
  in unscaled map-space arc length. Lateral offset changes position, not
  heading. An internal cubic boundary uses the outgoing cubic. At a nonfinal
  segment's `at=1`, “outgoing” means the first cubic of the next segment at
  `t=0`; only the route's final `at=1` uses the final cubic at `t=1`.

Every derivative component and scaled component must be finite. Let
`m = hypot(dx × sx, dy × sy)`. `m <= 1e-9` profile pixels per unit `t` is an
effectively-zero derivative and fails compilation. There is no tangent repair,
neighbor averaging, or finite-difference fallback.

### Normalization, unwrapping, and ties

1. Normalize each finite raw heading to the half-open range `[-180,180)`.
   Therefore an isolated positive 180-degree result normalizes to `-180`.
2. The first emitted heading is that normalized value.
3. For each following retained frame, choose the `raw + 360k` equivalent
   nearest to the previous unwrapped heading.
4. A nearest-equivalent delta whose absolute distance from 180 degrees is
   `<=1e-9` is an ambiguous exact reversal and fails compilation. The compiler
   never chooses clockwise or counterclockwise by array order.
5. Serialize the chosen unwrapped heading and its exact negative with the
   existing four-decimal `toFixed(4)` rule, trailing-zero removal, and
   negative-zero normalization.
6. After serialization, every adjacent visible heading delta must have
   absolute value strictly below 180 degrees. Rounding to an exact 180-degree
   tie fails rather than silently selecting a direction.

Heading continuity never wraps merely to keep emitted values inside
`[-180,180)`. Values outside one revolution are valid deterministic CSS
angles. This prevents a `359°` reverse spin when the physical turn is `1°`.

### Frame and reset declaration contract

No retained candidate, percentage string, `left`, `top`, or visible/reset
`opacity` changes. Every frame adds properties in this fixed order:

```text
left
top
--route-heading
--route-upright-heading
opacity (only where already emitted)
```

At reset:

- `98.8%` uses the final point and final heading, visible;
- `99.2%` uses the final point and identical final heading, then becomes
  invisible;
- `99.6%` uses the first point and first heading while invisible; and
- `100%` uses the first point and identical first heading, then becomes
  visible.

The hidden interval absorbs the end-to-start position and heading reset.
Neither position nor heading may interpolate across the visible fade.

### Sharp-join policy

The outgoing boundary heading is authoritative. Ridge boundary 8 retains its
authored shortest turn across the dense interval immediately preceding the
boundary; no geometry/timing smoothing or extra special frame is allowed.

The Builder must inspect this join at normal speed, not only scrubbed or
slowed, on desktop and mobile. If the turn visually reads as a distracting
snap, obscures the state marking, or appears to reverse, implementation stops
and returns to the Lead Architect. The Builder must not locally smooth it.

Compiler tests pin boundary 8's profile percentages and turn magnitudes to
within `0.0001°` of the repository facts above so an accidental route change
cannot be mistaken for an atmosphere adjustment.

## Static route-slot headings

For each track, profile, and zero-based `data-route-slot="0".."15"`, generated
CSS sets both the heading and its inverse on `.vehicle-anchor`. Desktop
selectors precede that track's desktop keyframes. Mobile overrides appear
inside the existing `@media (max-width: 759px)` block.

The selectors use both track and slot:

```css
.dashboard-root[data-track-id="<track>"]
  .vehicle-anchor[data-route-slot="<index>"] {
  --route-heading: <responsive tangent>;
  --route-upright-heading: <exact inverse>;
}
```

These selectors are not state-scoped, so reduced motion and the unsupported
registration fallback retain tangent-facing route cars. They do not match
parked vehicles, which remain at `0deg`.

Static headings come from route source anchor locators during compilation, not
from the public anchor `angle`, rounded `x/y`, route-slot phase, or nearest
motion frame. Generation must assert exactly 16 unique selectors per
track/profile and exact slot order `0..15`.

## Drift and atmosphere values

Effects are deterministic CSS only and run only when
`data-route-angle-motion="enabled"` is present.

### Drift

Keep the existing cycle durations and `ease-in-out` timing:

| State | Duration | 0% / 100% | 50% | Bounds |
|---|---:|---|---|---|
| Active | 2.8s | `x=-1px`, `y=0`, yaw `-0.75deg` | `x=1px`, `y=-2px`, yaw `0.75deg` | `|x|<=1px`, `y=-2..0px`, `|yaw|<=0.75deg` |
| Thinking | 3.6s | `x=-2px`, `y=0`, yaw `-1.5deg` | `x=2px`, `y=0`, yaw `1.5deg` | `|x|<=2px`, `y=0`, `|yaw|<=1.5deg` |

Every drift keyframe emits `--drift-upright-yaw` as the exact serialized
negative of `--drift-yaw`. No other state receives drift.

### Atmosphere layer and stacking

`.car-atmosphere` is an absolutely positioned, target-sized sibling immediately
before `.session-car`. It has `inset: 0`, `width: 100%`, `height: 100%`,
`overflow: visible`, `transform-origin: 50% 50%`, and:

```css
transform: rotate(var(--route-heading, 0deg));
```

Its local negative Y is forward. The desktop emitter origin is
`left: 50%; top: calc(50% + 20px)` inside the 52px square. The mobile route
origin is `left: 50%; top: calc(50% + 16px)` inside the 44px square. Both
pseudo-elements are positioned by their center at that origin. No transform or
layout measurement is read in JavaScript.

The exact stacking order inside the positioned wrapper is:

```text
car-atmosphere z-index: 0
.session-car z-index: 1
mobile wrapper focus ::after z-index: 4
glyph/code within body z-index: 2
session-tooltip z-index: 20
```

The atmosphere, `::before`, and `::after` all have `pointer-events: none`.
The wrapper does not gain overflow clipping. The mobile button retains its
existing circular `clip-path`, but the sibling atmosphere is not its
descendant and is therefore not clipped by it.

Both pseudos use the exact same fill:

```css
radial-gradient(
  circle at 50% 50%,
  color-mix(in srgb, var(--state-ink) 32%, transparent) 0 18%,
  color-mix(in srgb, var(--state-ink) 18%, transparent) 42%,
  transparent 72%
)
```

The state ink tokens are opaque, so those stops contribute alpha `0.32`,
`0.18`, and `0` before the pseudo-element's animated opacity is applied. There
is no blur, filter, shadow, blend mode, solid fill, or color outside this
gradient.

Exact desktop active values:

| Pseudo | Size | Duration | Delay | 0% `(x,y,scale,opacity)` | 40% | 100% |
|---|---:|---:|---:|---|---|---|
| `::before` | 5px | 1.6s linear infinite | `0s` | `(0px,0px,.65,0)` | `(-1px,4px,1,.22)` | `(-2px,10px,1.35,0)` |
| `::after` | 4px | 1.6s linear infinite | `-.8s` | `(0px,0px,.65,0)` | `(1px,4px,1,.22)` | `(2px,10px,1.35,0)` |

The active peak travel is 4px and end travel is 10px. Including scaled radius,
the union is bounded to local emitter offsets x `-5.375..4.7px` and y
`-1.625..13.375px`.

Exact desktop thinking values:

| Pseudo | Size | Duration | Delay | 0% `(x,y,scale,opacity)` | 40% | 100% |
|---|---:|---:|---:|---|---|---|
| `::before` | 4px | 2.4s linear infinite | `0s` | `(0px,0px,.7,0)` | `(-.75px,3px,.9,.14)` | `(-1.5px,7px,1.2,0)` |
| `::after` | 4px | 2.4s linear infinite | `-1.2s` | `(0px,0px,.7,0)` | `(.75px,3px,.9,.14)` | `(1.5px,7px,1.2,0)` |

The thinking peak travel is 3px and end travel is 7px. Including scaled
radius, the union is bounded to local emitter offsets x `-3.9..3.9px` and y
`-1.4..9.4px`.

At `max-width: 759px`, active `.car-atmosphere` is `display: none`. Thinking
`::after` is `display: none`; thinking `::before` uses:

| Size | Duration | Delay | 0% `(x,y,scale,opacity)` | 40% | 100% |
|---:|---:|---:|---|---|---|
| 3px | 3.2s linear infinite | `0s` | `(0px,0px,.75,0)` | `(-.5px,2px,.9,.08)` | `(-1px,4px,1.05,0)` |

Mobile thinking peak travel is 2px and end travel is 4px. Including scaled
radius, its local emitter envelope is x `-2.575..1.125px` and y
`-1.125..5.575px`.

Every transform is written as
`translate(calc(-50% + <x>), calc(-50% + <y>)) scale(<scale>)`.
Every cycle starts and ends at opacity zero and peaks only at 40%. Keyframes
contain no random, alternate, stepped, or state-data-dependent value.

Mobile drift yaw/translation values remain the same because they are already
bounded below 2px/1.5 degrees; only atmosphere is reduced.

### Atmosphere clipping and browser bounds

The existing `.map-stage { overflow: hidden; }` is the sole atmosphere clipping
boundary. Smoke may be clipped at the stage edge during the already-hidden or
edge-adjacent route endpoints; that is accepted for decoration and must not
move a route center or weaken target containment. No wrapper, button,
atmosphere, vehicle layer, or tooltip layer gains new clipping.

At a compiler-selected interior active and thinking frame with sufficient
stage clearance, browser tests pause the pseudo animation at 0%, 40%, and 100%,
read the pseudo computed width, height, opacity, transform matrix, display,
duration, delay, and play state, and reconstruct its four transformed corners
relative to the atmosphere box. The reconstructed offsets must match the
pinned local envelopes within `0.1px`; the 40% puff must have a nonzero
intersection at least `2×2px` with the stage. Mobile must show the one thinking
puff and hide active plus thinking `::after`.

At every viewport/state combination, the atmosphere must leave the button and
wrapper bounding boxes unchanged, leave the mobile circular hit test and focus
ring bounds unchanged, receive no hit at its visible pixels, remain below the
button/focus/tooltip, produce no document overflow, and never change the
existing zero target-clipping result.

The animated pseudo opacity cap is below `0.25`, and the gradient's maximum
effective alpha is `0.22 × 0.32 = 0.0704` active, `0.0448` desktop thinking,
and `0.0256` mobile thinking. Decorative smoke has no contrast conformance
role; all existing text, state, focus, and boundary contrast assertions remain
unchanged and must still pass.

## Interaction and motion policy

Hover, `focus-within`, and `data-pinned="true"` pause, with the same
track-scoped specificity:

1. the `.vehicle-anchor` route traversal;
2. `.car-motion` drift;
3. `.car-atmosphere::before`; and
4. `.car-atmosphere::after`.

All four remain paused after pointer leave/blur while pinned. Escape resumes
all four. CSS order keeps pause rules after generated traversal and
hand-authored effect assignments.

Under `prefers-reduced-motion: reduce`:

- wrapper traversal is `none !important`;
- `.car-motion` drift is `none !important` and its drift variables resolve to
  zero;
- both atmosphere pseudo-elements are `animation: none !important` and
  `opacity: 0 !important`;
- static track/slot responsive headings still apply; and
- all existing transition disabling remains.

Reduced motion must not reset route heading to zero. It disables motion, not
orientation.

## Data, privacy, security, and accessibility

- Heading inputs are trusted repository-owned cubics and fixed calibration
  profiles already validated by the compiler. No session or imported live
  value enters angle math or generated selectors.
- No generated selector contains a session ID, map code, display name, status,
  timestamp, path supplied at runtime, or external URL.
- The capability probe is local feature detection. It makes no network,
  storage, process, timing, or fingerprinting report.
- No schema, ARIA label, accessible text, live-region message, keyboard
  command, pressed state, tooltip relationship, or tab order changes.
- The empty atmosphere span and its pseudos are aria-hidden and pointer-inert.
- The focus target and tooltip remain unrotated and unclipped. Mobile retains a
  true circular 44px pointer target and the wrapper-owned focus ring.
- Roof glyphs and map codes remain screen-upright through the sum of the exact
  inverse heading and inverse drift yaw. Their accessible meaning remains
  duplicated in the button label, tooltip, readout, and legend.

## Deterministic serialization and drift checks

Compilation remains byte-deterministic. Heading values use the existing shared
four-decimal serializer and negative-zero normalization. Static selectors use
track order, then slot order. Desktop precedes mobile. No timestamp, host path,
locale output, or random value is introduced.

After the compiler code changes and before regeneration:

- `npm --prefix dashboard run routes:check` must exit `1`;
- drift output must name only `dashboard/generated/route-motion.css`; and
- `dashboard/src/generated/route-geometry.mjs` must compare byte-identical.

After `routes:write`, `routes:check` must exit `0`. The generated CSS keeps the
same digest because authored route sources did not change. A digest change,
route MJS change, or changed frame percentage/count is a blocker.

Expected generated CSS differences are limited to:

- 32 desktop and 32 mobile static slot-heading selectors;
- the zero-specificity `:where()` capability gate added to traversal
  assignment and mobile override selectors;
- two angle declarations per existing route/reset frame; and
- otherwise unchanged mobile animation-name override values.

There is no generated `@property` block. Among generated artifacts, only
`dashboard/generated/route-motion.css` changes; the generated MJS is
byte-identical. The Builder's authorized hand-authored runtime/test/docs files
also change, and exactly the six named screenshots may change. “CSS-only
generated drift” does not mean the entire milestone is a one-file change.

## Verification plan

### Compiler and static tests

Add focused tests for:

- forward-axis math on horizontal, vertical, diagonal, and nonuniformly scaled
  derivatives;
- finite and `1e-9` effectively-zero derivative rejection;
- exact outgoing derivative selection at every internal boundary, anchors,
  start, and final endpoint;
- static anchor headings evaluated from the map-space segment-local locator,
  including `at=1` selecting the outgoing next cubic at a shared segment end
  rather than the rounded anchor coordinate, lateral-offset point, nearest
  schedule frame, or prior cubic;
- `[-180,180)` first-angle normalization;
- nearest-equivalent unwrapping across zero;
- exact `180±1e-9` rejection and post-four-decimal 180-degree rejection;
- four-decimal positive/inverse serialization and negative-zero normalization;
- Ridge boundary 8 percentages and measured desktop/mobile authored
  incoming-to-outgoing turns, tested separately from the preceding retained
  percentages and `118.186960°`/`64.701536°`
  previous-frame-to-outgoing-boundary deltas so the two quantities cannot be
  conflated;
- unchanged retained frame counts, every existing percentage, every existing
  `left/top/opacity`, and unchanged speed/deviation/phase audits;
- exact final heading at `98.8/99.2` and exact first heading at
  `0/99.6/100`;
- exact frame property order and one occurrence per generated declaration;
- 16 unique static selectors per track/profile in slot order, derived from
  source locators rather than public `angle`;
- desktop/mobile headings differ where nonuniform scale requires it;
- generated MJS byte identity and CSS-only drift behavior;
- capability-gated traversal selectors and unchanged 64s/linear/-4s phase;
- exact `:where()` selectors/specificities/source order;
- exact `CSS.registerProperty` descriptors/order, absence of literal
  `@property`, missing API, failure at each of four call positions,
  `InvalidModificationError` first-call collision, partial success followed by
  failure, cached success, cached failure, stale-attribute removal, and no
  throw/log behavior;
- exact atmosphere DOM, aria-hidden/pointer-inert rules, effect bounds, mobile
  reductions, pause selectors, and reduced-motion overrides;
- parked states have no route, drift, or smoke assignment; and
- public catalog/anchor keys, `angle:0`, freezing, allocation, source
  independence, and workday selection remain unchanged.

### Browser automated matrix

Run fixture-only Chromium at `1440×900` and `390×844`, for Ridge and Cypress:

| Capability/motion | Required result |
|---|---|
| Supported, normal | Correct responsive animation name; 64s linear traversal; computed midpoint route heading interpolates as an angle; car forward axis agrees with the route tangent |
| Supported, hover | Wrapper, drift, and both smoke pseudos pause; position and transforms remain stable |
| Supported, focus | Same complete pause; focus ring and tooltip remain unrotated and visible |
| Supported, pinned then blurred | All motion remains paused; Escape resumes all animations |
| Reduced motion | No route/drift/smoke animation; static tangent heading remains; zero movement |
| Missing registration API | Capability attribute absent/removed; no route/drift/smoke animation; responsive static tangent remains; no heading jump |
| Registration failure positions 1–4 | All four calls attempted on first initialization; any exception leaves the capability absent and motion static even after partial registration |
| First-call name collision | `InvalidModificationError` is failure, the remaining names are still attempted, and later initialization uses cached false without another call |
| Cached success/failure | A second initializer call performs zero registrations and applies/removes the attribute from its supplied root according to the cached result |

For tangent agreement, use exact Web Animations timeline control at the existing
seven route samples plus every internal cubic-boundary percentage. Compare the
rendered forward-axis vector against the compiler-expected profile heading:
`<=0.25°` at exact frames. For mid-interval interpolation, assert the computed
heading lies on the selected unwrapped shortest arc; do not compare it to an
unbounded exact tangent at Ridge boundary 8.

Existing centerline alignment (`<=1px`), target separation (`>=52/44px`),
containment, no horizontal overflow, clean console, hydration, track switching,
focus identity, source independence, and tooltip/readout assertions remain
unchanged.

Browser tests must inspect pseudo-element computed styles for opacity,
animation name, duration, play state, and mobile hiding. They must also confirm
the car body rotates while the button/tooltip transform remains unrotated and
glyph/code net rotation is within `0.25°` of screen-upright. At 25%, 50%, and
75% of both drift cycles, tests compare interpolated yaw with its inverse and
assert net glyph/code rotation remains within `0.25°`.

Browser tests set the wrapper animation to each reset point
`98.8/99.2/99.6/100` for both tracks/profiles. They assert final/final/first/
first position and heading respectively, opacity `1/0/0/1`, no visible
end-to-start interpolation, and an upright marking at every point.

### Required normal-speed visual review

At both viewports:

1. watch one complete normal-speed lap of each track;
2. watch Ridge boundary 8 for at least three normal passes;
3. inspect active and thinking smoke against light/dark road and label areas;
4. exercise hover, keyboard focus, pin, Escape, and reduced motion; and
5. confirm the car's nose, lamps, state glyph, map code, focus ring, and tooltip
   remain legible with no reverse spin, lateral sideways travel, smoke occlusion,
   or target clipping.

Ridge boundary 8 is a visual gate. An unacceptable snap returns to architecture
instead of being smoothed by the Builder.

### Screenshots and evidence

Refresh only the six neutral route screenshots named in the approved scope.
Capture the four explicit track images and the two Ridge aliases at their
existing viewport/full-page dimensions. Before capture, pause all animations
through Web Animations and set route traversal to `16000ms`, active/thinking
drift to `50%` of its cycle, and smoke to its `40%` peak. Record the capture
procedure and exact computed headings in `BROWSER_VERIFICATION.md`.

The screenshot must contain fixture data only and no focus, tooltip, pinned,
pressed, skip-link, live-file, or failure artifact. Other checked-in screenshots
must remain byte-identical.

### Commands

From the repository root:

```sh
npm --prefix dashboard run routes:check
npm --prefix dashboard run test:unit
npm --prefix dashboard run test:browser
node --check dashboard/scripts/lib/route-compiler.mjs
node --check dashboard/src/route-motion-capability.mjs
node --check dashboard/src/render-dashboard.mjs
node --check dashboard/src/app.mjs
node --check dashboard/tests/route-compiler.test.mjs
node --check dashboard/tests/dashboard.test.mjs
node --check dashboard/tests/renderer-lifecycle.test.mjs
node --check dashboard/tests/browser/dashboard.spec.mjs
git diff --check
```

Also verify the worktree contains no dependency/lockfile, route-source,
generated-MJS, protected-file, or unexpected screenshot change.

## Acceptance criteria

Implementation is acceptable only when:

1. every moving route frame faces the responsive screen-space tangent using
   the pinned math, outgoing-boundary, epsilon, unwrapping, tie, inverse, reset,
   precision, and property-order contracts;
2. every existing frame count, percentage, `left`, `top`, opacity, route
   geometry, anchor, 64-second timing, linear easing, four-second phase, and
   hidden reset is unchanged;
3. all 16 route slots per track use generated profile-specific static headings
   without changing public anchor keys or `angle:0`, and parked vehicles remain
   at zero degrees;
4. the button, hit/focus target, and tooltip remain outside heading/drift
   rotation; the sibling atmosphere independently follows heading but not
   drift; roof glyph and code remain screen-upright;
5. active/thinking drift and smoke stay within every pinned duration,
   yaw/translation, size, opacity, travel, stacking, and mobile bound with no
   randomness, timer, schema, or ARIA change;
6. hover, focus, and pin pause traversal, drift, and both smoke pseudos; Escape
   resumes them;
7. reduced motion and unsupported registration both produce nonmoving,
   tangent-facing static route cars with no smoke or heading snap;
8. normal-speed Ridge boundary 8 review is acceptable at both viewports, or
   work stops for architecture rather than smoothing;
9. compiler/static/browser tests pass with clean consoles, tangent and upright
   error `<=0.25°`, existing centerline error `<=1px`, separation
   `>=52/44px`, zero clipping, and zero horizontal overflow;
10. among generated artifacts and screenshots, only the expected generated CSS
    and six named screenshots change; generated MJS, routes, lockfile,
    source/session behavior, workday selection, optional isolation, and
    protected systems remain unchanged; and
11. independent pre-implementation and post-implementation reviews both return
    PASS before implementation begins and the roadmap item becomes complete.

## Observability impact

Runtime observability impact is **none**. No log, warning, telemetry, event,
metric, timer, network request, storage value, or live-region announcement is
added. Unsupported registered-angle animation is deliberately quiet and
static; unit/browser verification, not runtime reporting, observes the
capability branch.

Build-time observability remains the existing route compiler CLI. A stale
generated stylesheet is visible through `routes:check` exit `1`; current output
is exit `0`. Compiler validation errors gain bounded route/profile/frame or
slot context for nonfinite/zero/tie heading failures but never print session
data or whole source objects.

## Migration and rollback

1. Add heading math and tests without altering candidate construction.
2. Prove the old/new frame percentages, positions, opacity, counts, geometry
   MJS, anchors, and phase audits are byte/value identical.
3. Add generated angle declarations/static selectors and regenerate CSS.
4. Add capability detection, DOM atmosphere, transforms, pause/reduced-motion
   policy, and browser coverage as one coherent runtime change.
5. Perform normal-speed visual review and deterministic screenshot refresh.
6. Obtain independent post-change PASS before marking the roadmap complete.

Rollback is one revert of this milestone. It restores unrotated route cars and
the former nested nudge/drift without a data migration because no schema,
storage, route source, generated MJS, or session value changes. Do not roll
back only the compiler while retaining heading-bearing generated CSS; the
drift check is authoritative.

## Material open questions and blockers

There are no unresolved Builder design choices.

Two gates remain:

1. focused independent pre-implementation re-review must return PASS after the
   initial FAIL; and
2. the implemented Ridge boundary 8 must pass the specified normal-speed
   desktop/mobile visual review and independent post-change QA.

If capability detection cannot reliably distinguish registered angle support
in a target browser, the accepted outcome is the static fallback. Enabling
moving traversal with discrete or unregistered headings is not an alternative.

## Focused independent pre-implementation re-review packet

```text
Role:
You are the independent lead auditor for the optional Night Pass dashboard's
tangent orientation and deterministic atmosphere milestone.

Stage:
Focused pre-implementation re-review after an independent FAIL. No production
implementation is authorized. Builder must remain blocked unless every prior
blocker below is resolved and your new verdict is PASS.

Prior FAIL and documented responses:
1. Cascade specificity was underspecified. The revised contract uses
   :where([data-route-angle-motion="enabled"]) so traversal remains specificity
   0-4-0, equal to the later wrapper pause selectors. Drift assignment/pause
   pairs are 0-5-0 and smoke assignment/pause pairs are 0-5-1. Exact selector,
   specificity, source-order, and computed play-state tests are required.
2. The initializer incorrectly treated InvalidModificationError as success.
   Literal @property rules are now forbidden. The first call attempts all four
   CSS.registerProperty registrations independently; all must succeed. Any
   exception, collision, missing API, or partial registration caches false and
   removes the attribute. Later calls never register again.
3. Atmosphere geometry was underspecified and mobile button clipping was
   unresolved. The sole empty atmosphere span is now a direct sibling
   immediately before the button. It independently rotates by route heading,
   remains outside drift, is pointer-inert, and is not subject to the mobile
   button clip. Exact emitter origins, gradients, frame tables, envelopes,
   clipping, stacking, and browser bounds tests are pinned in this document.

Scope:
Audit the complete contract in:
- docs/superpowers/specs/2026-07-28-dashboard-tangent-atmosphere-design.md
- docs/superpowers/specs/2026-07-28-dashboard-route-compiler-design.md
- docs/superpowers/plans/2026-07-27-dashboard-roadmap.md

Relevant implementation boundaries to inspect:
- dashboard/routes/route-config.mjs
- dashboard/routes/ridge-pass.route.mjs
- dashboard/routes/cypress-run.route.mjs
- dashboard/scripts/lib/route-compiler.mjs
- dashboard/scripts/lib/svg-cubic-path.mjs
- dashboard/generated/route-motion.css
- dashboard/src/generated/route-geometry.mjs
- dashboard/src/render-dashboard.mjs
- dashboard/src/app.mjs
- dashboard/src/track-catalog.mjs
- dashboard/src/track-layout.mjs
- dashboard/styles.css
- dashboard/tests/route-compiler.test.mjs
- dashboard/tests/dashboard.test.mjs
- dashboard/tests/renderer-lifecycle.test.mjs
- dashboard/tests/browser/dashboard.spec.mjs
- dashboard/tests/BROWSER_VERIFICATION.md

System context:
The browser-local dashboard has two compiler-owned cubic routes. Each profile
has 513 equal-distance base positions plus every internal cubic boundary:
527 visible frames for Ridge and 533 for Cypress. Traversal is 64 seconds,
linear, phase-shifted -4 seconds per one of 16 slots, and resets through
98.8/99.2/99.6/100. Desktop is calibrated at 1160x682, mobile at 372x580.
The route car SVG points along local -Y. The focusable button and tooltip must
not rotate. Public anchors remain id,poolLabel,x,y,angle with angle 0.

Approved heading contract:
- heading = degrees(atan2(dy*sy, dx*sx)) + 90;
- exact boundaries use outgoing derivatives;
- finite scaled derivative magnitude must exceed 1e-9;
- normalize first angle to [-180,180), unwrap every following angle to the
  nearest equivalent, reject an exact 180 tie within 1e-9 and any serialized
  adjacent 180 tie;
- serialize heading and inverse to four decimals;
- 98.8/99.2 keep final heading and 99.6/100 reset invisibly to first heading;
- Ridge boundary 8 intentionally turns 117.871578 degrees desktop at 48.5111%
  and 64.613624 degrees mobile at 49.2289%; it is preserved and visually gated.

DOM/CSS contract:
Traversal stays on .vehicle-anchor. .car-angle rotates heading.
.car-motion applies bounded drift. One empty aria-hidden pointer-inert
.car-atmosphere span is the direct wrapper child immediately before the
button. It independently rotates by inherited heading and stays outside drift.
The button, focus target, and tooltip are unrotated. Glyph/code counter-rotate
the exact sum through paired inverse registered properties.

Exact cascade:
- generated traversal:
  .dashboard-root:where([data-route-angle-motion="enabled"])
  [data-track-id="<track>"] .vehicle-anchor.state-active/thinking = 0-4-0;
- later wrapper hover/focus-within/pinned pause = 0-4-0;
- drift assignment and later pause = 0-5-0;
- atmosphere ::before/::after assignment and later pause = 0-5-1.
Static tests pin exact selectors, tuples, and ordering. Browser tests pin
wrapper, drift, and both pseudo play states through hover, focus, pin after
leave/blur, Escape, and resume.

Fallback contract:
Four inherited <angle> custom properties have initial 0deg. Their sole
registration mechanism is CSS.registerProperty in fixed heading,
upright-heading, drift-yaw, upright-yaw order; literal @property is forbidden.
The first initializer call attempts every name even after an earlier failure.
All four must succeed. Any exception including InvalidModificationError,
missing API, or partial success caches false, removes a stale capability
attribute, and remains fail-static. Cached success/failure performs no later
registration. No branch throws or logs. Unsupported/failed registration means
no route/drift/smoke animation while generated responsive static headings
remain. Discrete jumping headings are prohibited.

Effect contract:
Active drift is <=1px x, -2..0px y, <=0.75deg over 2.8s. Thinking drift is
<=2px x and <=1.5deg over 3.6s. Desktop active smoke is <=5px, opacity .22,
10px travel over 1.6s with -0.8s second-puff phase; thinking is <=4px, opacity
.14, 7px travel over 2.4s with -1.2s phase. Mobile hides active smoke and
thinking ::after; its one thinking puff is 3px, opacity .08, 4px travel over
3.2s. All use exact 0/40/100 position/scale/opacity tables and the exact
32%/18%/transparent radial gradient in the normative section. Desktop emitter
origin is target center +20px local Y; mobile is +16px. The map stage is the
sole clipping boundary. Hover, focus, and pin pause route, drift, and both
pseudos; Escape resumes. Atmosphere is below the button/focus/tooltip, cannot
receive input, and has no semantic role.

Protected contracts:
No geometry, keyframe percentage/count/position/opacity, anchor, allocation,
timing, phase, session/source/live schema, workday selection, dependency,
network, storage, telemetry, process, terminal, tmux, WezTerm, wallpaper,
LLM-status, installer, or default-startup change. Generated route MJS and route
source bytes must not change. Among generated artifacts and screenshots, only
generated CSS and the six named neutral screenshots change. Builder edits to
this spec are limited to status and evidence.

Focused re-review tasks:
1. Confirm :where() leaves traversal at 0-4-0 and every later pause selector
   has equal specificity; confirm exact static and computed-play-state tests
   cover wrapper, drift, both pseudos, hover/focus/pin/Escape/resume.
2. Confirm the four-call initializer cannot fail open after missing API,
   failure at positions 1-4, InvalidModificationError collision, partial
   registration, cached success/failure, or stale attributes; confirm no
   literal @property collision remains.
3. Confirm the sibling atmosphere follows heading but not drift and does not
   alter mobile button clipping, hit testing, focus, or tooltip transforms.
   Recompute the exact desktop/mobile 0/40/100 envelopes, gradient effective
   alpha maxima, stage clipping policy, and browser visibility/bounds tests.
4. Confirm added tests evaluate static anchors from the map-space locator with
   outgoing segment-end tangent, distinguish Ridge's authored boundary turn
   from its previous-frame interpolation delta, inspect 98.8/99.2/99.6/100
   position/heading/opacity resets, and test intermediate drift/upright net
   rotation plus mobile smoke/focus bounds.
5. Recheck the +90/nonuniform tangent, zero derivative, unwrap, tie, precision,
   protected frame/geometry/timing, accessibility, reduced-motion,
   observability, migration, and rollback contracts for contradictions caused
   by these revisions.
6. Identify any remaining hidden Builder choice. Recommendations that do not
   block correctness must be labeled non-blocking.

Evidence expected after implementation:
- routes:check before regeneration reports only route-motion.css drift;
- routes:check, 116+ Node tests, and 12+ Playwright tests pass after changes
  (test counts may increase, never decrease);
- node --check and git diff --check pass;
- generated MJS/routes/lockfile/protected files are unchanged;
- browser tangent/upright error <=0.25 degrees, existing route error <=1px,
  center separation >=52/44px, zero clipping/overflow, clean consoles;
- normal-speed Ridge boundary 8 review and six deterministic fixture
  screenshots are documented.

Output required:
1. PASS or FAIL verdict.
2. Explicit Builder authorization: may begin / must remain blocked.
3. A finding-by-finding verdict for prior blockers 1-3.
4. Remaining blockers ordered by severity, each with minimal resolution.
5. Selector/specificity and computed pause/resume audit.
6. Registration/fail-static/caching capability-matrix audit.
7. Atmosphere hierarchy, geometry, mobile clipping, visibility, stacking,
   accessibility, and bounds audit.
8. Required-test and protected-contract audit.
9. Non-blocking recommendations clearly separated from blockers.
10. Explicit sign-off status and exact remaining conditions.
```
