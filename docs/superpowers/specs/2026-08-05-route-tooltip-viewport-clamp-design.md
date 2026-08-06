# Route-tooltip viewport clamp

Follow-up to #40 (full-bleed track) and #41 (combined pit). Fixes a pre-existing
route/track bug: an on-track car's tooltip, centered above/below the car, can
extend past the left or right viewport edge and get cut off by the stage's
`overflow: hidden`.

## Decisions you need from me

All four settled during brainstorming; listed for the record, none open:

1. **Mechanism** - CSS-only viewport clamp (chosen) over coordinate-threshold
   retune or JS measure-and-nudge. Cost of getting it wrong: thresholds stay
   brittle to viewport width and re-clip on narrow/mobile.
2. **Scope** - route cars only (chosen). The desktop pit's accepted right-column
   clip is #41's deliberate decision and stays as shipped.
3. **Mobile route** - same viewport clamp (chosen), not a docked bubble. Keeps
   the tooltip attached to its on-track car.
4. **Vertical (`tooltip-up`)** - left orthogonal (chosen). Fix touches the
   horizontal X axis only.

Plus one test decision: the desktop regression guard also asserts at a narrow
width (~700px) so it demonstrably fails pre-fix, not only at 1440.

## Assumptions I have not verified

- **The fixture route coords do NOT clip at desktop 1440** - the clipping band
  only appears at narrower widths and on mobile 390. This is analysis, not yet
  observed. The reproduction step confirms it empirically; if desktop 1440 also
  clips, that is a stronger repro, not a problem. Either way the narrow-width
  desktop check guarantees a pre-fix desktop failure.
- **`.map-stage` width tracks the viewport** (full-bleed, `width: 100%`, no body
  h-padding), so `100vw` in the clamp matches the clip context. Verified by
  reading `styles.css` (`.map-stage`, `.map-stage .vehicle-layer` `inset: 0`);
  the `--tt-gutter` inset absorbs any scrollbar/rounding slack.
- **No unit test asserts the `edge-left`/`edge-right` CSS or JS toggles** other
  than what this spec re-points. `grep` of `dashboard.test.mjs` shows no
  `edge-left`/`edge-right`/tooltip-transform references beyond `z-index: 20`.
  Re-confirm during implementation before deleting.

## The bug

`.session-tooltip` (base) opens centered on the car: `left: 50%`,
`width: min(16rem, calc(100vw - 2rem))` (up to ~256px), `transform:
translate(-50%, ...)`. The only edge handling is class-driven:
`makeCar`/`applyRouteCar` add `edge-left` when `placement.x <= 210` and
`edge-right` when `placement.x >= 790`, which left/right-align the tooltip to the
car. Those thresholds are fixed 0-1000 viewBox coordinates tuned for the older
inset track. On the full-bleed track the car sits at `placement.x / 10` percent
of the true viewport width, so:

- A car in the band **just inside** the thresholds (e.g. `210 < x < ~300`) gets a
  centered ~256px tooltip whose edge overhangs once `x/10 %` of the viewport is
  within half-a-tooltip of the edge.
- On mobile 390px the `x <= 210` threshold sits at only ~82px - already less than
  the 128px half-tooltip - so even threshold and inside-threshold cars clip, and
  the mobile media query never repositions route tooltips.

The stage's `overflow: hidden` then cuts the overhang off at the viewport edge.

## The fix

Replace coordinate thresholds with a **viewport-relative horizontal clamp**
computed entirely in CSS from a single value render already knows.

### render-dashboard.mjs

In both the `makeCar` route branch (~L111-118) and `applyRouteCar` (~L271-277):

- Set one new custom property on the route wrapper:
  `wrapper.style.setProperty('--vehicle-vw', String(placement.x / 10))`
  (unitless; the car's horizontal position as a vw number).
- **Remove** the `edge-left` / `edge-right` toggles (both the `makeCar`
  `classList.add` and the `applyRouteCar` `classList.toggle`).
- **Keep** the `tooltip-up` toggle exactly as-is.

Nothing else in render changes: `--vehicle-x/-y`, `--route-phase`,
`data-routeSlot`, aria, state class, `replaceTooltip`, pin/pause all untouched.

### styles.css

On the base `.session-tooltip` (pit overrides `transform` wholesale, so pit is
unaffected; `--vehicle-vw` is never set on pit cars and its `50` fallback is
harmless since pit never reads the shifted transform):

```css
.session-tooltip {
  /* ...existing: position, z-index: 20, top, left: 50%, width, etc... */
  --tt-gutter: .5rem;
  --tt-half: calc(min(16rem, calc(100vw - 2rem)) / 2);
  --tt-carx: calc(var(--vehicle-vw, 50) * 1vw);
  /* Shift the centered tooltip only as far as needed to keep it on-stage:
     push right if it would overhang the left edge, pull left if it would
     overhang the right, else 0 (stay centered). Viewport-relative, so it holds
     at any width incl. mobile 390. */
  --tt-shift: max(
    calc(var(--tt-gutter) - var(--tt-carx) + var(--tt-half)),
    min(0px, calc(100vw - var(--tt-gutter) - var(--tt-carx) - var(--tt-half)))
  );
  transform: translate(calc(-50% + var(--tt-shift)), -.25rem);
}
```

Reveal rule for route cars (`.vehicle-anchor:hover / :focus-within /
[data-pinned="true"] .session-tooltip`): `transform: translate(calc(-50% +
var(--tt-shift)), 0)`.

**Delete** the now-dead `.edge-left .session-tooltip` / `.edge-right
.session-tooltip` base rules and the `.edge-left:hover ... .edge-right ...`
reveal block. Leave every `.pit-vehicle ...` rule and the `.tooltip-up
.session-tooltip` rule exactly as-is.

**Clamp derivation** (`--tt-shift`): let `c = --tt-carx` (car center, vw), `h =
--tt-half`, `g = --tt-gutter`.
- Left push needed: `g - (c - h)` = `g - c + h` (positive when overhanging left).
- Right push needed: `(100vw - g) - (c + h)` = `100vw - g - c - h` (negative when
  overhanging right).
- `shift = max(leftPush, min(0px, rightPush))`:
  - no overhang -> `leftPush <= 0`, `rightPush >= 0` -> `min(0, +) = 0` ->
    `max(-, 0) = 0` (centered).
  - overhang left -> `leftPush > 0` -> `max(+, 0) = leftPush`.
  - overhang right -> `rightPush < 0` -> `min(0, -) = rightPush` ->
    `max(leftPush<=rightPush, rightPush) = rightPush`.

## Testing

### Reproduce first (regression guard)

Clone `test('pit tooltips stay within the viewport', ...)` in
`dashboard/tests/browser/full-bleed-layout.spec.mjs` for route cars:

```
test('route tooltips stay within the viewport', ...):
  select #track-select -> 'ridge-pass' (deterministic route population)
  page.evaluate: for each `.vehicle-anchor`:
    focus its `.session-car`, read `.session-tooltip` getBoundingClientRect(),
    flag if left < -0.5 || right > clientWidth + 0.5, blur
  expect flagged == []
```

- Runs on **both** projects (desktop 1440x900, mobile 390x844).
- **Desktop narrow-width check:** in the desktop project, also
  `page.setViewportSize({ width: 700, height: 900 })` and repeat the sweep, so a
  band car provably clips and the test FAILS pre-fix on desktop too (restore
  size after, or keep it last).
- Confirm this test **FAILS** before any CSS/JS change (mobile for sure; desktop
  at the narrow width). That failing run is the proof the fix is real.
- `getBoundingClientRect` reports the layout box regardless of the stage's
  `overflow: hidden` clip, so an overhang shows as `left < 0` / `right > cw` -
  exactly what the pit test relies on.
- Mirror the pit test's synchronous focus/measure/blur loop (no awaits mid-loop)
  so the route car's CSS animation can't advance between measure calls.

### Unit tests (dashboard.test.mjs)

- Keep the `.session-tooltip { ... z-index: 20 }` assertion.
- **Add** an assertion that the route tooltip transform uses the clamp:
  match `translate(calc(-50% + var(--tt-shift))` and the `--tt-shift`
  `max( ... min(0px, ... 100vw ...) ... )` shape. This replaces (does not
  weaken) any deleted edge-class assertion - it pins the new structure.
- If any assertion referenced `edge-left`/`edge-right`, re-point it; confirm via
  grep first.

### Full gate (all must be green, both projects)

- `node --test dashboard/tests/*.test.mjs` (currently 204, +1 new assertion path)
- `npm --prefix dashboard run routes:check`
- `npm --prefix dashboard run test:browser` - **one foreground Bash call,
  `timeout` 600000**, never backgrounded.
- Manual: fixtures (`python3 -m http.server 4173`) and live
  (`node dashboard/serve-live.mjs` + Go live) at desktop and mobile widths, cars
  at far left/right of the track; verify pin (Enter/Space), Escape, and
  pause-on-hover unchanged.

## Constraints honored

- No #41 regression: combined pit ordering/capacity/overflow and the mobile
  docked pit-tooltip rule untouched; collector, import validation, live-server
  security model untouched.
- Route positioning, 16-slot route, animation, pin/pause-on-hover untouched.
- No new npm deps; ES modules only; no em dashes.
- Accessibility preserved: `aria-describedby` / `role="tooltip"` association,
  focus, and pin unchanged.
- Mobile: no horizontal page overflow; 44px car hit target unchanged.
- Both fixtures and live modes and the incremental `update()` path preserved
  (`applyRouteCar` sets `--vehicle-vw` on every tick).

## Out of scope

- The desktop pit right-column clip (#41's deliberate choice).
- Vertical `tooltip-up` placement.
- Any change to route car position, animation, route slotting, or pit behavior.
