# Combined recency-ordered pit lane - design spec

Follow-up to the full-bleed redesign (PR #40). The bottom pit lane's four labeled
bays (Service Bay / Permission Checkpoint / Pit Stop / Unclassified hold) become
**one pit**, and the parked cars inside it are ordered **most-recently-active first**.
The route/track is untouched.

## Decisions locked (resolved in brainstorming)

1. **One pit.** All off-track sessions (error + permission + idle/complete + unknown)
   render in a single pit region. Per-car state stays distinguishable by its existing
   color + glyph (both derived from `status`, not pool). The folded header legend
   already documents the glyphs.
2. **Pure recency order.** Flat, newest-first, states interleaved. Order by
   `Date.parse(session.lastActivityAt)` descending. Holds on first render and after
   every 5s live refresh.
3. **Tie-break:** when two sessions share the exact `lastActivityAt`, order by
   `id.localeCompare` ascending. Deterministic - preserves the suite's existing
   "same result regardless of input order" guarantee.
4. **Capacity 18.** Beyond 18 cars, the **oldest** overflow into a calm collapsed
   "+N older parked" chip at the end (never the newest).
5. **Form:** one full-width wrapping grid, newest at top-left, row-major reading
   order = recency. Wraps to more rows when busy; no horizontal scroll.
6. **Label:** a single `Pit` heading. The four per-state sub-labels are dropped.
7. **Tooltip:** all pit tooltips open **upward** (the pit is the bottom lane, so
   there is always room above). Deletes the per-bay leftmost/edge tooltip CSS.
8. **Contract change confirmed:** `STATE_PRESENTATION[status].pool` collapses to
   `route | pit`. The four-way pool tag is removed - nothing branches on it once the
   pit is one region.

## Assumptions I have not verified (flag while implementing)

- **`lastActivityAt` is populated for every off-track status in live mode**, not just
  fixtures. The contract validates it as a required ISO timestamp
  (`session-contract.mjs:68`), so a snapshot missing it already fails closed. If a
  real live snapshot ever lacks it, allocation would `NaN`-sort - **stop and raise
  it, do not add collection.** (Fixtures are safe: every fixture session carries it.)
- **No consumer outside allocation/rendering/labels reads the fine pool tag**
  (`error`/`permission`/`pitstop`/`unknown`). Grep confirmed `poolOf` ->
  `STATE_PRESENTATION[status].pool` feeds only `allocateSessions`; color/glyph/label
  come from `status`. Re-grep before deleting to be certain.
- **Re-appending an existing DOM node to reorder preserves focus, `data-pinned`, and
  `aria-pressed`.** Standard browser behavior (move, not recreate); the browser suite
  is the backstop that proves pin/focus survive a recency re-sort across `update()`.

## Hard constraints (from the handoff, restated)

- No new npm dependencies. ES modules only. No em dashes (plain hyphen).
- Do NOT change the collector, import validation / `normalizeImportedSnapshot`, or the
  live-server security model. Order only by `lastActivityAt` (already validated).
- Leave the route/track untouched: 16-slot route, animation, pause-on-hover, tooltip,
  pin via Enter/Space/Escape.
- Preserve both fixtures and live modes and the incremental `update()` path (no full
  re-render).
- Keep the id contract exact and mirrored in `dom-fake.mjs`. Keep accessibility:
  labeled region, aria, focus, skip link -> the pit.
- Responsive: mobile 390x844, no horizontal page overflow, 44px car hit target.

## Architecture

### Data model (`session-contract.mjs`)

`STATE_PRESENTATION` pool values collapse to two:

```
active, thinking                              -> route
waiting_for_permission, idle, error,
complete, unknown                             -> pit
```

`label` and `glyph` per status are unchanged. `lastActivityAt` and `activity.kind`
(`last_response` for `complete`, `last_activity` otherwise) are unchanged - used only
as the sort key.

### Allocation + ordering (`track-layout.mjs`)

`allocateSessions(sessions, track)` keeps two buckets:

- **route** - unchanged: `preferredRouteIndex` (progress or `fnv1a32` hash) into the
  16 `track.routeAnchors`; overflow past 16.
- **pit** - sort members by `Date.parse(lastActivityAt)` descending, then
  `id.localeCompare` ascending. `slotIndex` = array index (0 = newest). Index >=
  `PIT_CAPACITY` (18) -> `overflow: true`.

Remove `PARKED_ANCHORS`, `UNKNOWN_HOLD_ANCHORS`, the `bays()` helper, and the
`ZONES` map (x/y bay coordinates were vestigial - pit cars are grid-flowed). Add
`export const PIT_CAPACITY = 18`.

Pit placement shape:

```js
{ id, mapCode, pool: 'pit', poolLabel: 'Pit',
  locationLabel: `Pit position ${slotIndex + 1}`,
  x: null, y: null, angle: null, slotIndex, overflow }
```

Route placement is unchanged (`Route Slot N`, real x/y/angle). Overflow placement:
`locationLabel: 'Pit is at capacity'`, `poolLabel: 'Pit'`.

`buildAccessibleText` needs no structural change - it already reads
`placement.poolLabel` / `locationLabel` and `session.activity`.

### Rendering (`render-dashboard.mjs`)

- `PIT_SELECTORS` -> a single `#pit` mount reference; `pitOverflows` map -> a single
  `#pit-overflow`. Delete the `#unknown-hold` requiredMount, the unknown placeholder-
  tile loop, and the `unknownHold.hidden` toggle.
- `makeCar` target is `route | pit`. Drop the `unknown` grid-column branch. Pit
  wrapper stays `pit-vehicle` + `state-${status}`.
- **Initial render:** route cars -> `vehicleLayer` (unchanged). Pit cars -> `#pit`,
  appended in `slotIndex` (recency) order. Since the render loop iterates
  `snapshot.sessions`, collect pit sessions and append sorted by `placement.slotIndex`.
- **`update()` re-orders in place:** after the reuse/create loop, re-append surviving
  pit wrappers to `#pit` in the new `slotIndex` order. `append()` moves an existing
  node without recreating it, so element identity, listeners, `data-pinned`, and
  `aria-pressed` survive. This keeps newest-first correct across live refresh with no
  full re-render. Pit cars are stationary (no motion animation to disturb).
- **Overflow:** two buckets - `route` -> `#overflow-notice`, `pit` -> `#pit-overflow`.
  Notice reads `N older parked - over pit capacity (18 slots)` and lists the dropped
  (oldest) codes + names. `POOL_LABELS` collapses to `{ route, pit: 'pit' }`.

### HTML + id contract (`index.html`, `app.mjs`, `dom-fake.mjs`)

`#pit-lane` region wrapper stays (skip-link target `#pit-lane`, `tabindex="-1"`,
`aria-label="Pit lane"`). Its body collapses to one section:

```html
<section id="pit-lane" class="pit-lane" aria-label="Pit lane" tabindex="-1">
  <section class="pit" aria-labelledby="pit-heading">
    <header><span aria-hidden="true">&#9670;</span><h2 id="pit-heading">Pit</h2></header>
    <div id="pit" class="pit-mount" aria-label="Parked sessions, newest first"></div>
    <div id="pit-overflow" class="pit-overflow" hidden></div>
  </section>
</section>
```

- **Ids removed:** `pit-error`, `pit-permission`, `pit-pitstop`, `pit-unknown` and
  their `-overflow`; `unknown-hold`.
- **Ids added:** `pit`, `pit-overflow`.
- `app.mjs` resolves no pit ids today (confirmed) - no change there.
- `dom-fake.mjs` `dashboardRoot` id list: drop the eight removed ids, add `pit` and
  `pit-overflow`.

### CSS (`styles.css`)

- `.pit-lane` becomes a simple full-width block containing one `.pit` section (drop
  the 4-column grid). Keep `display: grid` / `overflow: visible` markers the structural
  test asserts, or update that assertion - see Testing.
- `.pit-mount` -> `grid-template-columns: repeat(auto-fill, minmax(52px, 1fr))`,
  wrapping, row-major. Keep `grid-auto-rows: 52px`, 44px min hit target.
- `.pit` heading reuses the old `.pit-bay > header` styling (rename selector).
- **Delete:** `.pit-bay`, `.pit-error/.pit-permission/.pit-stop --state-ink`,
  `.unknown-hold`, `.unknown-mount`, `.unknown-anchor`, `.unknown-mount .pit-vehicle`,
  the `#pit-lane:has(.pit-hold .unknown-hold[hidden])` reflow, the
  `.pit-error .pit-vehicle .session-tooltip` leftmost rule, and the mobile
  `.pit-bay .pit-vehicle .session-tooltip` edge rules.
- **Pit tooltip opens upward:** `.pit-vehicle .session-tooltip` positions above the car
  (`bottom: calc(100% + …)`, `left: 50%`, `translateX(-50%)`), replacing the sideways
  rules. One rule for all pit cars.
- **Mobile (759px):** `.pit-mount` stays a wrapping 52px-cell grid
  (`repeat(auto-fill, 52px)` or the existing `repeat(3, 52px)` adapted); no horizontal
  page overflow; car hit target preserved.

## Testing

`dashboard.test.mjs` regex-asserts literal CSS/HTML structure - update each assertion
to the new structure, kept meaningful (not weakened):

- Pool mapping assertion -> `route | pit` two-way mapping.
- "declares the exact ordered pit stack" -> assert a single `#pit` mount and
  `#pit-overflow`, ordered after `#map-stage`.
- `PARKED_ANCHORS` / `ZONES` asserts -> removed or replaced with `PIT_CAPACITY === 18`.
- Pool-distribution + combined-pitstop-overflow tests -> one combined-pit distribution
  and a capacity-18 overflow test.
- `.pit-mount` grid-columns assertion -> the new wrapping columns.
- **New unit tests:** newest-first `slotIndex` from `lastActivityAt`; id tie-break on
  equal timestamps; capacity-18 drops the **oldest** (highest ranks overflow).
- `renderer-lifecycle.test.mjs` / `multi-track.test.mjs`: new pit ids; assert
  `update()` re-orders `#pit` children by recency when a session's `lastActivityAt`
  advances (e.g. a completing session jumps to the front), and that a pinned pit car
  keeps its pin across the re-sort.
- Browser `full-bleed-layout.spec.mjs` / `dashboard.spec.mjs`: one pit region; DOM
  order = recency; mobile 390x844 has no horizontal overflow and 44px hit targets;
  tooltip opens upward without clipping.

Commands (all must pass on both browser projects):
`node --test dashboard/tests/*.test.mjs`,
`npm --prefix dashboard run routes:check`,
`npm --prefix dashboard run test:browser` (run foreground, Bash `timeout` 600000).

## Out of scope

- Route/track visuals, animation, pin/tooltip behavior, the 16-slot layout.
- The collector, `normalizeImportedSnapshot` / import validation, live-server security.
- Any new collected field. We only order by the already-validated `lastActivityAt`.
- The header bar, legend, on-track summary, course selector.

## Definition of done

One combined pit holding all off-track sessions, ordered most-recently-active first and
staying ordered across the 5s live refresh; the four bays are gone; the route/track is
unchanged; fixtures and live both work; unit + routes + browser suites green on both
projects; accessibility preserved (labeled region, aria, focus, skip link -> pit); PR
opened from `ajason14:feat/dashboard-combined-pit` to `ajason13:main`.
