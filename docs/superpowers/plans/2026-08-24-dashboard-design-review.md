# Night Pass dashboard: design review

Reviewed against a live render of current `main` at 1440x900 and 390x844, not
the committed screenshots in `dashboard/tests/screenshots/` (those are from
Jul 27-29 and predate the full-bleed track, the combined pit lane, and the pit
session bays - they no longer show the product).

This records decisions and findings. It does not authorize implementation.

## Decisions made

1. **State is encoded on the car itself**, not via a restored state-grouped
   rail. The rail would cost the full-bleed track.
2. **The pit lane keeps grouping by tmux session.** With state on the car you
   get both axes at once instead of trading one for the other. `allocatePitBays`
   and its tests stand.
3. **No design-system project and no `/design`.** Ledger in "Design-system
   project: the ledger" below. A local state-matrix harness buys the useful
   part for a fraction of the cost.

One sub-decision is still open and is the first thing implementation must
settle: **which encoding** goes on the car - ring, upright plate, or glyph
badge. See "Constraints on the encoding" for what the code already permits.

## Assumptions I have not verified

- That the fixtures produce `waiting_for_permission`, `error`, or `complete` at
  all. I never saw those states render. The claim that they are visually
  identical is read from CSS, not observed. The harness in step 1 exists
  primarily to close this gap.
- That `Auto - workday schedule` resolved to Harbor Yard Rallycross because of
  the time of day, and that the other three courses share these problems. I
  reviewed one course.
- That you still want the racing metaphor as-is. Every finding assumes yes.
- That nothing in the ten open worktrees already fixes these. I read `main`.

## The headline finding

**All five pit states are visually identical.** A session waiting on your
permission is pixel-identical to one that finished an hour ago.

`STATE_PRESENTATION` (`session-contract.mjs:9-17`) assigns each state a pool:

| Pool | States |
|---|---|
| `route` | `active`, `thinking` |
| `pit` | `waiting_for_permission`, `idle`, `error`, `complete`, `unknown` |

The route pool is fine. `.car-atmosphere` at `styles.css:734-761` gives
`active` and `thinking` a tinted exhaust puff, and those are the only two states
the route can ever hold, so that treatment is complete for its pool.

The pit pool has nothing:

- Every `.pit-vehicle` rule in `styles.css` is tooltip, hover, z-index, or
  badge-hiding. Not one state rule. The `.car-atmosphere` state rules are
  scoped to `.vehicle-anchor`, which is route-only.
- `styles.css:727-733` does set `--state-bg` and `--state-ink` on every car
  wrapper for all seven states, correctly. Nothing on a pit car consumes them.
  `styles.css:607` applies `color: var(--state-ink)` to `.session-car`, which
  holds an `<img>` sprite and no text, so it paints nothing.
- Position does not recover it either. `allocatePitBays` groups by
  `bayKeyOf(session)`, the tmux session name, so `canary` holds whatever mix of
  the five states it happens to hold.
- Car colour does not recover it. `selectCarVisual(session.mapCode)`
  (`render-dashboard.mjs:300`) derives model and livery from session identity.

So state reaches the eye in three places, none of them the pit lane: the
tooltip (`styles.css:847-858`, hover or focus only), the legend
(`styles.css:955-958`), and the two header counts.

The legend is also closed by default - `index.html:35` puts all seven states
inside a collapsed `<details>` behind a `?`. The key to the visual language is
hidden.

**Correction against the first draft of this review:** I previously called
`renderOnTrackSummary` hardcoding `['active', 'thinking']`
(`render-dashboard.mjs:369`) a bug that left 12 of 24 sessions unaccounted for.
It is not a bug. That element is labelled "on track" and the route pool holds
only those two states. Disregard it.

## Constraints on the encoding

Useful facts for whoever implements this:

- `.car-badge` is a child of the wrapper, not the rotating car
  (`render-dashboard.mjs:273`), so anything in that slot **stays upright for
  free** and already renders in both pools. No counter-rotation needed, despite
  `--route-upright-heading` and `--drift-upright-yaw` existing.
- That slot is taken. `applyBadge` puts the `PR#42` / `BB-305` workRef there at
  `top: calc(100% - 3px)`, below the car. A state indicator needs its own slot,
  most naturally above.
- The badge hides on hover and pin (`styles.css:713-719`) because the tooltip
  takes over. Decide deliberately whether a state indicator should do the same.
  It probably should not.
- Every state already has a glyph in `STATE_PRESENTATION`: `›` active, `…`
  thinking, `!` permission, `‖` idle, `×` error, `✓` complete, `?` unknown. The
  legend already uses them. Reusing them on the car costs nothing and makes the
  legend a real key.
- Cars render at `calc(52 * var(--car-unit))` with a 44px minimum, so roughly
  40px on the desktop route and smaller in the pit. Colour alone will not carry
  seven states at that size, and fails for colour-blind readers against the
  varied liveries. Glyph plus colour is the safe pairing.

## Desktop findings (1440x900)

1. **Space allocation is inverted.** The track gets roughly 620px of height to
   thread 12 cars through, with about 40% of that canvas empty navy. The pit
   lane gets a ~180px strip to hold the other 12 in 3-column bays, and then
   leaves ~600px of horizontal dead space to the right of the last bay. The
   half with more content gets less room.
2. **The course `<select>` is a browser default** (`index.html:24`). In a
   heavily art-directed dark UI it is the one element that looks unstyled, and
   it sits in the most prominent slot in the bar.
3. **The header is a junk drawer with no grouping.** Title, a `Fixtures - Night
   sector` pill, a `Course` label plus select, a bare `24 sessions`, two state
   chips, a `?`, then Import / Fixtures / Go live at the far right. Import,
   Fixtures, Go live and the `Fixtures - Night sector` pill are all one concern
   - snapshot source - and they are at opposite ends of the bar.
4. **Place labels compete with data.** `DOCK START`, `GRAVEL CUT`, `CRANE
   SWEEP`, `BASIN LOOP`, `CROSSOVER RISE`, `YARD FINISH` are letter-spaced caps
   at roughly the weight of the `PR#42` and `BB-305` badges. The labels are
   flavour and the badges are the payload, so the hierarchy is backwards.
5. **Decorative geometry reads as UI.** The empty rounded rectangles at
   left-centre and right, the tan ellipses, and the tick rows along the top and
   bottom edges sit at similar contrast to the pit bay containers. Nothing
   tells the eye which boxes hold information.
6. **`preserveAspectRatio="none"`** on the route SVG (`index.html:59`) stretches
   the 1000x760 art non-uniformly to the container. Lane width and dash pitch
   distort with the viewport, and cars are being placed on a stretched path.

## Mobile findings (390x844)

7. **The header eats 150px, about 18% of the viewport,** across four stacked
   rows before any content. The `?` gets a row to itself next to the three
   source buttons.
8. **The pit lane is effectively gone.** You see the `canary` bay's first row
   and nothing else. The commit `9dc0d50` capped the lane so the page would not
   scroll vertically, but the result is that three of four session groups sit
   below the fold and each bay now scrolls horizontally at five cars wide. The
   vertical scroll was removed, not the overflow. Given the headline finding,
   this is worse than it looks: the pit is where every actionable state lives.
9. **Labels collide with cars.** `BASIN LOOP` is clipped to `N LOOP` by a car,
   and `CRANE SWEEP` is overlapped by another. Finding 4 becomes a legibility
   bug at this width, not a hierarchy preference.

## Design-system project: the ledger

`/design` grants `DesignSync`, which syncs a local component library to a
claude.ai design-system project. It is transport, not critique. It will not
look at the dashboard and tell you anything. The findings above came from
reading the render and the CSS.

**What a design-system project would genuinely buy:**

1. A gallery where state encodings sit side by side. Today comparing ring vs
   plate vs badge means editing a 35KB stylesheet, reloading, screenshotting.
2. A forced token layer. There are 21 colour tokens and no scale for type,
   spacing, or radius; the literals are scattered (`.5rem`, `.66rem`, `.45rem`,
   `.55rem`, `999px`, `12px`). Naming them is worth doing on its own merits.
3. A way to render states the fixtures may never produce.

**What it costs:**

1. The library does not exist. Roughly ten components extracted from scratch
   for zero user-visible change.
2. Two sources of truth that drift silently. Preview markup duplicates what
   `render-dashboard.mjs` generates, with nothing enforcing a match. This repo
   carries 400KB of tests precisely because drift matters here.
3. The components are not really components. A car's appearance depends on
   `--vehicle-x/y`, `--route-heading`, `--drift-yaw`, and `--car-unit` computed
   from the viewport through a rotating parent chain. The hard parts - rotation,
   path placement, pit overflow - are emergent from layout and do not survive
   extraction into a static card. You would be galleryising the easy 20%.
4. One repo, one consumer, one developer. Design systems amortise sync cost
   across teams; that coordination problem does not exist here.
5. Every round trip ends in a manual hand-port back into `styles.css`.

**Conclusion: skip it, steal benefits 1 and 3.** See step 1 below.

## Suggested sequence

1. **Build `dashboard/tests/states.html`.** One static page that `<link>`s the
   real `styles.css` and renders every state in both pools, route and pit, at
   both car sizes. Because it imports the real stylesheet it cannot drift on
   tokens. It gives the side-by-side comparison a design-system project would
   have given, at a fraction of the cost, and it closes the "nobody has ever
   seen `error` render" gap permanently. Screenshot it from Playwright and it
   doubles as a visual-regression fixture. This replaces "refresh the committed
   screenshots" as step 1, and largely subsumes it.
2. **Settle the encoding sub-decision against that harness,** then implement it
   on `.pit-vehicle`. This is the only finding that costs real information
   today. Route cars are already adequately served.
3. **Fix findings 4 and 9 together.** The label hierarchy fix removes the
   mobile collision as a side effect.
4. **Treat findings 1, 7 and 8 as one piece of work,** not three. They are a
   single problem: the layout budget is allocated to the track and spent by the
   pit. Finding 8 gets more urgent once the pit is where state lives.
5. **Findings 2, 3, 5 and 6 are polish.** Cheap, low risk, no hurry.
