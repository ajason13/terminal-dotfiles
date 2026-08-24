# Finish the Night Pass dashboard design review

Paste everything below into a fresh Claude Code session started from
`~/Apps/wezterm-tmux-dotfiles`.

---

## Task

Work the seven open findings from the 2026-08-24 dashboard design review at
`docs/superpowers/plans/2026-08-24-dashboard-design-review.md`. Read that file
first: it carries the full finding list, the decisions already taken, and the
assumptions that were never verified.

Findings 4 and 9 (sector-label hierarchy) and the headline state-legibility
finding are already fixed on branch `feat/dashboard-state-matrix`, pushed to the
`fork` remote. Do not redo them. **Confirm whether that branch has merged before
starting**; if it has not, branch from it rather than from `main`, or the state
badge work will not be in your tree.

Nothing below is authorized to be committed or pushed without checking in first.

## Do this first

Get eyes on the current build. The committed screenshots in
`dashboard/tests/screenshots/` are from Jul 27-29 and predate the full-bleed
track, the combined pit lane, and the pit session bays. **They do not show the
product.** Refreshing them is worth doing and is not yet done.

```sh
cd dashboard && python3 -m http.server 43921 --bind 127.0.0.1 --directory .
# http://127.0.0.1:43921/index.html          the product
# http://127.0.0.1:43921/tests/states.html   every state in one bay each
```

`tests/states.html` is a harness added by the previous session. It boots the
real renderer against a synthetic snapshot whose tmux session name *is* the
state, so the real `allocatePitBays` lays out one bay per state. Use it whenever
a change could affect how states read.

## The work, in priority order

### Findings 1, 7 and 8 are one problem, not three

The layout budget is handed to the track and spent by the pit. Treat them
together.

- **Finding 1 (desktop):** the track gets roughly 620px of height to thread 12
  cars through, with about 40% of that canvas empty navy. The pit lane gets a
  ~180px strip for the other 12 in 3-column bays, then leaves ~600px of
  horizontal dead space to the right of the last bay. The half with more content
  gets less room.
- **Finding 7 (mobile):** the header consumes about 150px, roughly 18% of a
  844px viewport, across four stacked rows before any content.
- **Finding 8 (mobile):** the pit lane is effectively gone. You see the first
  bay's first row and nothing else; the other groups are below the fold and each
  bay scrolls horizontally at five cars wide.

**The causal chain is already written down in the code.** `styles.css:1309`
says: bar (149px) plus the 580px `.map-stage` floor leave only ~115px before the
page scrolls, so `--pit-lane-max` drops to 6rem (96px) on mobile against the
desktop 16rem. So finding 7 *causes* finding 8. Shrinking the header, or the
580px stage floor, buys pit height directly with no new layout machinery.

This matters more than it looks: after the state-badge work, the pit is where
five of the seven states live, so the pit being below the fold now hides the
information the dashboard exists to surface.

Commit `9dc0d50` capped the lane to stop vertical page scroll. That constraint
is real - do not reintroduce vertical scrolling to "fix" this.

### Findings 2, 3, 5, 6 are polish

Cheap, low risk, no ordering between them.

- **2:** the course `<select>` at `index.html:24` is an unstyled browser default
  sitting in the most prominent slot of a heavily art-directed dark bar.
- **3:** the header has no grouping. Import, Fixtures, Go live and the
  `Fixtures - Night sector` pill are all one concern - snapshot source - and sit
  at opposite ends of the bar.
- **5:** decorative geometry reads as UI. The empty rounded rectangles, tan
  ellipses, and edge tick rows sit at similar contrast to the pit bay
  containers, so nothing tells the eye which boxes hold information.
- **6:** `preserveAspectRatio="none"` on the route SVG (`index.html:59`)
  stretches the 1000x760 art non-uniformly, so lane width and dash pitch distort
  with the viewport and cars are placed on a stretched path. Note this is
  load-bearing: `--car-unit` (`styles.css:567`) compensates by scaling with the
  mean stretch. Changing the aspect handling means revisiting that clamp.

## Gotchas the previous session paid for

- **`.vehicle-anchor::after` and `.pit-vehicle::after` are taken.** The mobile
  focus ring uses the former (`styles.css`, in the `max-width: 759px` block).
  The state badge lives on `::before` for exactly this reason. Anything new on
  these wrappers needs a different hook or it silently replaces the badge on
  focus. Grepping `vehicle-anchor::` will miss it, because the selector is
  `.vehicle-anchor:has(.session-car:focus-visible)::after`.
- **The state badge anchors to `.car-body`, not the wrapper.** The wrapper is
  52 units but the mobile block pins route art to 24x36, so wrapper-relative
  offsets float the badge off its own car. There is a matching mobile override.
  Any change to car sizing must update both.
- **`src/app.mjs` self-starts on import** (bottom of file). Importing it from a
  test page boots the real fixture dashboard over that page. `states.html`
  transplants `index.html`'s `#dashboard-root` and drives `renderDashboard`
  directly instead.
- **Two snapshot validators, different vocabularies.** `normalizeSnapshot`
  (fixtures) omits `unknown` from `FIXTURE_STATUSES`;
  `normalizeImportedSnapshot` (live and imported) has no `error` or `complete`
  in its combination allowlist. Neither covers all seven states, so no single
  snapshot can render them all.
- **`git rm` from the wrong cwd fails silently.** Verify deletions with
  `git status` rather than trusting an `echo`.

## Constraints

- Atomic commits. One logical change each; keep refactors separate from
  behaviour changes. Never batch at the end.
- Comment blocks stay to 1-2 lines. Keep the load-bearing "why", drop what the
  code already shows. No ticket references in source.
- Do not modify `CHANGELOG.md` or anything auto-generated.

## Verification

Both suites must pass before any commit:

```sh
cd dashboard
npm run verify        # expect 279 passing
npx playwright test   # expect 103 passing, 5 skipped
```

Run the **full** browser suite, not just the specs you touched:
`full-bleed-layout.spec.mjs` carries clearance and overlap assertions that
layout changes trip in non-obvious ways.

When you add a test, check it fails against the pre-change stylesheet:

```sh
git checkout main -- dashboard/styles.css
npx playwright test <your-spec> --reporter=line     # expect failures
git checkout HEAD -- dashboard/styles.css
```

Screenshot at 1440x900 and 390x844 and actually look at both. Several findings
in this review were only visible at one of the two widths, and two defects in
the badge work were mobile-only.
