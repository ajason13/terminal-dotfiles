# Pit divided into tmux-session bays - design spec

The single flat pit becomes one bay per tmux session, so the pit answers "is
anything in *this* session waiting on me?" at a glance. Route/track untouched.
Presentation and allocation only: no collector, schema, or validation change.

## Decisions you need from me

None open. Every decision below was resolved in brainstorming on 2026-08-12.

## Assumptions I have not verified (flag while implementing)

- **No ancestor of `.pit-vehicle` establishes a containing block.** The tooltip fix
  depends on `position: fixed` resolving against the viewport. Any ancestor with
  `transform`, `filter`, `contain`, `perspective`, or `will-change` would silently
  re-anchor it to that ancestor and reintroduce the clipping this design exists to
  avoid. Check `.dashboard-root`, `.pit-lane`, `.pit`, `.pit-bay` before styling; if
  one is found, stop and raise it rather than working around it.
- **`sessionName` is populated in live mode for every session.** `sanitizeDisplayName`
  emits the `<session> ▸ <window>` prefix only when tmux reports a nonempty
  `session_name` (`tmux-classifier.mjs:107`). The convention is that it always does,
  but an unnamed session would land in Unassigned rather than its own bay. That
  degrades calmly, so it needs no collection change - just do not be surprised by it.
- **Realistic bay count is 2-5.** The scroll cap is sized for that, degrading to an
  internal scrollbar beyond it. Not measured against a real busy day.
- **Reusing a bay element across `update()` preserves a descendant car's focus,
  `data-pinned`, and `aria-pressed`.** Standard move-not-recreate behavior, same
  assumption the existing recency re-sort already relies on. The renderer and browser
  suites are the backstop.

## Supersedes

Amends `2026-08-05-combined-pit-lane-design.md`. Its decisions 1, 2, 5, and 6 no
longer hold:

| Was | Now |
|---|---|
| 1. One pit region | One bay per tmux session, plus Unassigned when nonempty |
| 2. Pure global recency order | Recency *within* a bay; bays ordered alphabetically |
| 5. One full-width wrapping grid | A wrapping row of bays, each its own small grid |
| 6. A single `Pit` heading | `Pit` (h2) over a per-bay session name (h3) |

Decisions 3 (id tie-break), 4 (capacity 18, oldest overflows), 7 (tooltips open
upward), and 8 (`pool` is `route | pit`) are unchanged and still binding.

Worth stating plainly, since this partly reverses a spec that is a week old: the bays
deleted on 2026-08-05 were keyed on `status`, which every car already communicates
through its color and glyph. Those bays were redundant. A bay keyed on tmux session
carries information that appears nowhere else on the board, which is why the same
form is right on this axis and was wrong on that one.

## Decisions locked

Amended 2026-08-12 after branch review: decision 6's rationale for the per-bay count was
wrong and is restated below. No behavior changed.

1. **Group spatially, by tmux session.** The job is scanning a session's parked work
   as a block, not merely identifying a single car's owner. A per-card session chip
   was considered and rejected as insufficient for that job.
2. **Bays sort alphabetically by session name, and never move.** The live poller
   re-renders every 5s; recency-ranked bays would reshuffle under the cursor and
   destroy the muscle memory that makes name-based navigation fast. Stability beats
   freshness here. `key.localeCompare(other)` - ICU primary strength is
   case-insensitive, so `canary, dotfiles, E2E, Wkfl` falls out without a hand-rolled
   case fold.
3. **Cars inside a bay stay newest-first**, by `bayRank`.
4. **Every live tmux session always has a bay**, showing `Clear` when it holds nothing.
   Fixed positions are the point of decision 2, and an empty bay is a positive signal:
   nothing in that session is stuck.
5. **Unassigned is last, and conditional.** Sessions whose `displayName` carries no
   `▸` prefix (fixtures, hand-authored and imported snapshots) group into an
   `Unassigned` bay rendered last. It is not a real tmux session, so it appears only
   when it holds at least one car and never shows a `Clear` placeholder.
6. **Capacity stays globally 18.** `PIT_CAPACITY` keeps its current meaning: one pool
   of 18 by global recency, oldest overflowing into the existing collapsed chip. No
   per-bay quotas - one capacity rule in one place. Consequence: a busy session can push
   a quiet session's only car into overflow. Each bay header carries a count of the cars
   placed in that bay. That count is a convenience readout, not an overflow signal - it
   reads 0 both when nothing is parked and when the bay's only car overflowed. The global
   overflow chip remains the only overflow signal.
7. **The lane scrolls; the stage does not shrink.** `.pit-lane` takes
   `max-height: min(32vh, 16rem)` with `overflow-y: auto` - about two bay rows. The pit
   lane is the `auto` row in `grid-template-rows: auto minmax(0, 1fr) auto`, so an
   uncapped pit eats the stage - the same failure mode as commit 244a50d, one row down.
   Note the cap alone gives the stage its floor: bar + 32vh is the worst case, so the
   remaining `1fr` can never drop below roughly 60vh. Do **not** also raise the grid's
   `minmax(0, ...)` to a nonzero floor - that would reintroduce vertical page overflow
   on short viewports, which `minmax(0, 1fr)` exists to prevent.
8. **Pit tooltips dock with `position: fixed` at all widths.** Forced by decision 7:
   tooltips open upward past the lane's top edge, which is why `.pit-lane` is
   `overflow: visible` today (`styles.css:906`). A scrolling ancestor and an escaping
   child cannot both win. Mobile already solved this (`styles.css:1328`); this
   promotes that technique to every width.

## Hard constraints

- No new npm dependencies. ES modules only. No em dashes (plain hyphen).
- Do NOT change the collector, the session contract's validation,
  `normalizeImportedSnapshot`, or the live-server security model.
- `allocateSessions` keeps its exact signature and frozen-flat-array return. Roughly
  20 test call sites index into it positionally.
- Preserve the incremental `update()` path. No full re-render, and no recreating car
  elements (it restarts their CSS animation).
- Leave the route untouched: 16 anchors, animation, pause-on-hover, tooltip, pin via
  Enter/Space/Escape.
- Keep the `#pit`, `#pit-overflow`, and `#pit-lane` id contract, mirrored in
  `dom-fake.mjs:165`. Keep the skip link landing on `#pit-lane`.
- Accessibility: labeled bays, valid heading hierarchy, focus management, and grouping
  exposed to assistive tech rather than being purely visual.
- Responsive: 390x844 mobile, no horizontal page overflow, 44px car hit target.

## Architecture

### Allocation (`src/track-layout.mjs`)

`pitPlacement` gains two additive fields. Each of the three now has exactly one job:

| Field | Meaning |
|---|---|
| `slotIndex` | global recency rank across the whole pit; drives capacity and overflow (unchanged) |
| `bayKey` | the tmux session name, or `null` for Unassigned |
| `bayRank` | 0-based recency rank *within* that bay; drives DOM order and the a11y label |

A new sibling export carries the roster, rather than changing the return shape:

```js
// Ordered bays for the pit. Separate from allocateSessions because its frozen
// flat-array return is indexed positionally across the suite.
export function allocatePitBays(sessions) // -> frozen [{ key, label }]
```

Roster rules:

- Keys are the distinct `parseWorkRef(displayName).sessionName` values across **all**
  sessions, route and pit alike. Route membership is what makes a `Clear` bay possible
  for a session whose every window is active or thinking.
- Named bays sort by `localeCompare`; the `null` bay is appended last and only when it
  holds a placed car.

`locationLabel` becomes bay-aware: `Pit, E2E bay, position 2` replaces
`Pit position 7`. It feeds `buildAccessibleText` (`session-contract.mjs:221`), so
screen readers get the grouping too. `bayRank` exists so that number counts within the
bay, matching what a sighted user sees.

### DOM (`index.html`, `src/render-dashboard.mjs`)

```html
<div id="pit" class="pit-bays" aria-label="Parked sessions grouped by tmux session">
  <section class="pit-bay" data-bay-key="E2E">
    <h3 class="pit-bay-name">E2E <span class="pit-bay-count">2</span></h3>
    <div class="pit-bay-mount"><!-- cars in bayRank order --></div>
  </section>
</div>
```

`#pit` keeps its id but changes role from car grid to bay row; the per-bay
`.pit-bay-mount` becomes the grid that `.pit-mount` is today. The existing
`.pit-mount:empty::after { content: "Clear" }` (`styles.css:989`) moves to
`.pit-bay-mount` and serves decision 4 unchanged.

Renderer changes:

- First render (`render-dashboard.mjs:542-562`): build bays from `allocatePitBays`,
  then bucket `pitEntries` on `placement.bayKey` and append each into its bay's mount
  in `bayRank` order.
- `update()` (`render-dashboard.mjs:687-699`): same bucketing, plus roster
  reconciliation for sessions appearing or vanishing mid-poll. **Reuse existing bay
  elements**; rebuilding one would destroy a pinned descendant car's `data-pinned`,
  `aria-pressed`, and focus.
- Overflow (`renderOverflowNotice`) is unchanged. Capacity is still global, so there
  is still exactly one chip.

### Styling (`styles.css`)

- `#pit`: `display: flex; flex-wrap: wrap` with bays at `flex: 0 1 auto` and a
  min-width near two car columns, so a one-car bay is not absurdly narrow.
- `.pit-lane`: `max-height: min(32vh, 16rem)`, `overflow-y: auto`,
  `overscroll-behavior: contain`. Leave the grid's `minmax(0, 1fr)` alone (decision 7).
- `.pit-vehicle .session-tooltip`: `position: fixed` at all widths, docked above the
  lane, left-aligned at `min(28rem, calc(100vw - 2rem))` at desktop; mobile keeps its
  current full-width rect. The `:has()` single-visible-tooltip guard at
  `styles.css:1347` is promoted out of the mobile block along with it, since once all
  tooltips share one rect, two visible at once would overlap.
- Mobile: bays go full-width single column; the `.pit-mount` 52px column rule at
  `styles.css:1321` moves to `.pit-bay-mount`.

### Fixtures (`src/fixture-sessions.mjs`)

Load-bearing, not cosmetic. All 24 fixture rows carry bare display names today, so
every `sessionName` is `null` and the fixture pit would collapse into one Unassigned
bay - the feature would look broken in dev and prove nothing in the browser suite.
Add `<session> ▸ ` prefixes: 3-4 session names, one with every window on-track (to
exercise the `Clear` bay), and 1-2 rows left bare (to exercise Unassigned).

## Testing

Unit (`tests/dashboard.test.mjs`):

- roster order, including case-insensitive collation
- Unassigned appears last, and only when nonempty
- a `Clear` bay exists for a session whose windows are all on-track
- `bayRank` is within-bay recency; `slotIndex` remains global
- capacity is still globally 18, oldest overflows, regardless of bay
- forward-vs-reversed order independence (the existing guarantee at `:550`) extended
  to cover the roster

Renderer (`tests/renderer-lifecycle.test.mjs`):

- a bay appears and disappears across `update()` as sessions come and go
- a pinned car survives a roster change with pin and focus intact (highest-value test
  in this set)

Browser (`tests/browser/full-bleed-layout.spec.mjs`) - three existing assertions
encode the flat pit and are rewritten deliberately:

| Line | Was | Becomes |
|---|---|---|
| `:44` | `.pit-bay` count is `0` | `.pit-bay` count is `>0`, one per session |
| `:51` | `#pit` order globally descending | descending *within* each bay |
| `:286` | grid columns on `#pit` | grid columns on `.pit-bay-mount` |

New browser coverage:

- with eight bays injected, the lane never exceeds `min(32vh, 16rem)` and the page
  itself does not scroll vertically
- a docked tooltip is fully in-viewport and unclipped by the scrolling lane at desktop
  width. This is the test that proves decision 8, and therefore the whole design.

Gates: `npm run verify` and `npm run test:browser` from `dashboard/`.

## Out of scope

- Promoting `sessionName` to a first-class contract field emitted by the collector.
  Correct eventually, but it breaks the no-collector-change constraint and drags in
  `live-constants.mjs`, `import-snapshot.mjs`, and `snapshot-export.mjs`. Revisit if a
  mis-parsed session name ever becomes a bug rather than a cosmetic glitch.
- Per-bay capacity quotas (see decision 6).
- Collapsing or reordering bays interactively, and persisting that per operator.
- Any change to the route, its geometry, or the on-track summary.
