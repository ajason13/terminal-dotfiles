# Dashboard full-bleed track redesign - design spec

Date: 2026-08-04
Branch: `feat/dashboard-full-bleed-track` (fork `ajason14` -> upstream `ajason13:main`)
Status: approved in brainstorming (visual companion), pending spec review

## Decisions locked (resolved in brainstorming)

1. **Full-bleed by reframing, not rebuilding.** Keep the three existing themed routes
   (`ridge-pass`, `cypress-run`, `lantern-coil`) and their compiled 16-anchor geometry
   and motion **exactly as-is**. "Full-bleed" is achieved purely by re-laying-out the
   surrounding chrome in `index.html` + `styles.css`. No route-config, compiler,
   `route-geometry.mjs`, `route-motion.css`, or anchor-count change.
2. **Pit lane along the bottom.** The four off-track pools render as labeled bays in a
   distinct band beneath the track (not corner boxes, not a sidebar): Service Bay
   (error), Permission Checkpoint (waiting), Pit Stop (idle/complete), and a smaller
   Unclassified hold. Track fills the space above and stays the dominant element.
3. **Slim header, no clock.** One thin top bar carries: title ("Night Pass"),
   Live/Fixtures mode pill (the old eyebrow), Course selector, a compact session
   summary + on-track counts, a folded legend, and the Import / Fixtures / Go-live
   controls. No clock.
4. **Legend folded.** The 7-item legend collapses into a native `<details>` disclosure
   behind a `?` affordance in the bar. Not dropped (kept for learnability), but not a
   permanent row.
5. **Session readout -> persistent bottom strip.** The hover/focus/pin detail line moves
   to a slim status strip along the very bottom, below the pit lane.
6. **Overflow, kept calm.** Per-pool overflow stays the existing collapsed
   "N parked · over capacity" `<details>` toggle, re-homed inside the relevant bay.
   Route overflow becomes a small calm pill in a track corner. No red walls.
7. **Mobile:** top bar wraps (summary drops to a second line), track stays the hero with
   its existing compiled mobile motion, pit lane becomes a 2x2 grid of bays, readout
   wraps to two lines.

## Assumptions I have not verified (flag before/while implementing)

- **No JS logic change is needed.** The render/update engine is driven entirely by
  element **ids**, and every id it reads is preserved (just relocated in the DOM), so the
  redesign should be `index.html` restructure + `styles.css` rewrite with **zero** change
  to `render-dashboard.mjs`, `app.mjs`, `source-controller.mjs`, or the live plumbing.
  This is the core structural bet - to be confirmed in Task 1 by grepping every
  `exactlyOne`/`requiredMount`/`querySelector` id and the `preflightDocument` track-art
  assertions against the new markup.
- **Full-bleed aspect-ratio stretch is acceptable.** The route SVG uses
  `preserveAspectRatio="none"`, so a wider full-viewport stage stretches the art/route
  more than today's boxed panel. The existing design already distorts; assumption is that
  full-bleed distortion still reads fine. If it looks bad on very wide desktops, constrain
  the stage with a `max-width`/`aspect-ratio` cap (fallback, not default).
- **Playwright is the main test churn.** Unit tests + `routes:check` should stay green
  untouched (ids preserved, geometry untouched). The browser suite asserts on the current
  layout/landmarks and likely a reference screenshot, so it needs updating for the new
  structure. `tests/dom-fake.mjs` id list should not need to change (all render ids kept).

## Hard constraints (from the handoff, restated)

- No new npm dependencies. ES modules only. No em dashes in code/comments/markdown.
- Do NOT change the session data contract, collector, import validation, or live-server
  security model. Presentation only.
- Preserve ALL current behavior: route car animation; the incremental `update()` path that
  keeps animations alive across the 5s live refresh (no full re-render); status colors;
  tooltips; keyboard focus + pin (Enter/Space/Escape); the session readout; the calm
  collapsed overflow; both fixtures and live modes; accessibility (aria labels, focus
  management, skip link).
- 16-anchor route capacity and overflow-to-pit behavior unchanged.
- Must work on the mobile Playwright viewport (390x844), not just desktop.

## Architecture

### DOM restructure (`index.html`)

Replace today's `.dashboard-header` + `main.dashboard-layout` (`.map-panel` +
`aside.pit-stack`) with four stacked regions inside `#dashboard-root`
(a column flex/grid: bar auto, track `1fr`, lane auto, readout auto):

```
#dashboard-root
  header.dashboard-bar            (landmark: banner)
    .brand            -> title "Night Pass" + #source-label (mode pill)
    .bar-course       -> #track-select, #track-status (compact/visually-hidden),
                         #track-live-region (visually-hidden aria-live)
    .bar-summary      -> #snapshot-summary + #on-track-summary (compact counts)
    details.legend-disclosure  -> <summary>?</summary> + the 7-item legend <ul>
    #source-controls  -> import label, #snapshot-file, #reset-source, #go-live,
                         #source-age, #source-notice
  main#map-stage.map-stage        (landmark: main) - FULL-BLEED
    svg.route-map ... (unchanged art + centerlines + all three course-art groups)
    #map-heading      -> subtle small-caps track label overlay in a stage corner
                         (keeps the accessible heading; visually minimal)
    #vehicle-layer, #tooltip-layer
    #overflow-notice  -> calm route-overflow pill, positioned in a stage corner
  section.pit-lane aria-label="Pit lane"  id="pit-lane" tabindex="-1"
    .pit-bay.pit-error       -> header + #pit-error + #pit-error-overflow
    .pit-bay.pit-permission  -> header + #pit-permission + #pit-permission-overflow
    .pit-bay.pit-stop        -> header + #pit-pitstop + #pit-pitstop-overflow
    .pit-bay.pit-hold        -> #unknown-hold wrapping #pit-unknown + #pit-unknown-overflow
  footer.readout-strip            (landmark: contentinfo)
    #session-readout
```

- **Skip link:** retarget from `#pit-stack` to `#pit-lane` (rename the container id;
  no JS references `#pit-stack`). Keep `tabindex="-1"` for focus.
- **Every id the JS reads is preserved.** The redesign only moves ids to new parents and
  restyles; it does not add or remove any id in the render/app contract.

### Element relocation map (old -> new home)

| Element (id) | Today | New home |
|---|---|---|
| `#source-label` | header eyebrow | bar: mode pill |
| `<h1>` title | header | bar: `.brand` (text may shorten to "Night Pass") |
| `#snapshot-summary` | header | bar: `.bar-summary` |
| `#on-track-summary` | `aside` "On Track" zone | bar: `.bar-summary` (compact counts) |
| `.state-legend` (no id) | header row | `details.legend-disclosure` in bar |
| `#source-controls` (+children) | header | bar, right-aligned |
| `#track-select`,`#track-status`,`#track-live-region` | `.track-controls` in panel | bar: `.bar-course` |
| `#map-heading` | `.panel-heading` | subtle overlay label on stage |
| `#session-readout` | `.panel-heading` | `footer.readout-strip` |
| `#map-stage` (+ svg, layers) | `.map-panel` | `main`, full-bleed |
| `#overflow-notice` | in stage | in stage, styled as corner pill |
| `#pit-error/permission/pitstop` (+overflows) | `aside.pit-stack` zones | `.pit-lane` bays |
| `#unknown-hold`,`#pit-unknown`,`#pit-unknown-overflow` | in Pit Stop zone | `.pit-hold` bay |

### JS

Expected change: **none to logic.** `renderDashboard`/`update`/`setTrack`,
`renderOnTrackSummary`, `renderReadout`, and the overflow renderers all target the same
ids, which still resolve to exactly one node each. The `makeCar` route thresholds
(`tooltip-up` at `y>=560`, `edge-left/right`) operate in the SVG's `1000x760` coordinate
space and are layout-independent. Confirm in Task 1; if a genuine logic need appears
(e.g. readout empty-state), keep it minimal and isolated.

Legend disclosure is a native `<details>` - **no JS**, focus and Escape handled by the
platform; give the `<summary>` an accessible name ("Session state legend").

### CSS (`styles.css` - the bulk of the work)

- `#dashboard-root`: column layout, `100vh`/`100dvh`, no page scroll on desktop.
- New: `.dashboard-bar` (slim flex bar), `.brand`, `.mode-pill`, `.bar-course`,
  `.bar-summary`, `.legend-disclosure`, `.pit-lane`, `.pit-bay`, `.readout-strip`, the
  route-overflow corner pill, and the `#map-heading` overlay label.
- `#map-stage`: flex-fill the middle row (drop the fixed `min-height`/`height`), keep the
  SVG stretching to it.
- Re-home the pit bay `.pit-mount` grids into a horizontal 4-bay row (desktop) / 2x2
  (mobile); keep the unknown bay's 3-column sub-grid.
- Overflow `<details>` restyle to sit compactly inside a bay.
- Media queries: fold the bar wrap + pit-lane 2x2 + readout two-line at the existing
  `759px` breakpoint; keep the existing `cypress-run` mobile clearance rules.
- **`generated/route-motion.css` is not touched** (generated + geometry unchanged).

## Testing

- **Unit** (`node --test tests/*.test.mjs`): expected green unchanged. `dom-fake.mjs` id
  list unchanged (all render ids preserved). If any render test asserts on ancestor
  structure, update minimally.
- **`routes:check`**: unaffected (no geometry change) - must stay green.
- **Browser** (`npm run test:browser`, desktop 1440x900 + mobile 390x844): update
  selectors/landmark assertions for the new structure; refresh any tracked reference
  screenshot; add assertions for the pit lane, folded legend disclosure (open/close),
  bottom readout updating on focus/pin, and mobile 2x2 reflow. Keep the animation-continuity
  and keyboard-pin regressions.
- **Manual** `tests/BROWSER_VERIFICATION.md`: update the layout description; re-verify
  live mode via `node serve-live.mjs` + "Go live" and the mobile viewport.
- **Syntax**: `node --check` sweep over all `.mjs` (should be a no-op if JS is untouched).

## Out of scope

- Any route geometry / compiler / motion change, or a new track shape.
- Data contract, collector, import validation, live-server security.
- New dependencies, build tooling, or framework.
- Visual redesign of the car silhouette, course art, or color/status system beyond
  re-placement.

## Definition of done

Full-bleed track with a bottom pit lane of labeled bays and a slim (clock-less) header;
folded legend; bottom readout strip; calm overflow; fixtures + live both work; car
animations stay smooth across the 5s refresh; unit + `routes:check` + browser suites
green; accessibility preserved; PR opened `ajason14:feat/dashboard-full-bleed-track` ->
`ajason13:main` via the `pr-description` skill.
