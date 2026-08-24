# Fix the dead space in the docked pit tooltip

Paste everything below into a fresh Claude Code session started from
`~/Apps/wezterm-tmux-dotfiles`.

---

## Task

The dashboard's pit tooltips (the bubbles for parked tmux session cars in the
bottom pit lane) have a lot of empty space. Fix it. There are **two independent
defects**, both measured, not guessed.

The pit-session-bays feature merged in PR #54 (`73bdd2f`). Both defects were
introduced by that PR's design, and one of them was flagged in its final review
as a cosmetic minor and knowingly accepted. That judgment was wrong: this is the
pit's primary interaction and the emptiness is the first thing a user notices.

## Measured evidence

Chromium at 1440x900, canonical 24-session fixture, first pit car focused:

| Measurement | Value |
|---|---|
| Tooltip rendered width | 448px |
| Widest actual content line | 310.6px |
| **Horizontal dead space** | **111.4px (25% of the bubble)** |
| Tooltip bottom edge | y=630 |
| Pit lane top edge | y=685.8 |
| Pit lane height | 214.2px |
| **Vertical gap, tooltip bottom to lane top** | **55.8px** |

The bubble has 6 content lines and 12px horizontal padding.

## Root cause 1: the width is fixed, not shrink-to-fit

`dashboard/styles.css:1061` sets `width: min(28rem, calc(100vw - 2rem))` on
`.pit-vehicle .session-tooltip`. `min()` of two lengths resolves to a **fixed**
width, so the bubble is always 448px on desktop regardless of content. The base
tooltip at `styles.css:805` uses `min(16rem, ...)` = 256px; the pit variant was
widened for the docked design without ever being made to shrink to its content.

## Root cause 2: it docks to the lane's cap, not the lane

`dashboard/styles.css:1058` sets `bottom: calc(var(--pit-lane-max) + 14px)`.
`--pit-lane-max` is `min(32vh, 16rem)` = 256px on desktop, so the bubble sits
270px above the viewport bottom. But `.pit-lane` uses `max-height`, and with the
canonical fixture it renders at only 214.2px. The offset overshoots by
256 - 214.2 = 41.8px, plus the 14px intended gap = the measured 55.8px.

This gap did not exist while the lane was pinned at its cap. It appeared when
bays were widened to three car columns (which shortened the lane from 423px of
content to 214.2px) - so the two changes interact, and any fix must hold for a
lane at any height between its minimum and its cap.

## Hard constraints - do not break these

Each of these is load-bearing and at least one has a test asserting it.

- **`position: fixed` on pit tooltips must stay.** `.pit-lane` is
  `overflow: hidden auto` (it scrolls internally), so an in-flow bubble opening
  upward would be clipped by it. A unit test asserts the lane's
  `overflow: hidden auto` **and** the tooltip's `position: fixed` *together* in
  one test, precisely so the pair cannot drift apart. Find it in
  `dashboard/tests/dashboard.test.mjs` (the test named for 44px targets and
  map-first responsive behavior). Do not revert to absolute positioning.
- **Do not add `transform`, `filter`, `contain`, `perspective`, or
  `will-change` to any ancestor of `.pit-vehicle`** (`.dashboard-root`,
  `.pit-lane`, `.pit-bays`, `.pit-bay`). Any of them makes `fixed` resolve
  against that ancestor instead of the viewport and silently reintroduces the
  clipping. Note `overscroll-behavior: contain` on `.pit-lane` is unrelated and
  fine.
- **Do not delete `.pit-vehicle:hover/:focus-within/[data-pinned]
  .session-tooltip { transform: none }`** (around `styles.css:1065`). It looks
  redundant against the base rule but is not: the generic show rule around
  `styles.css:876-886` matches `.pit-vehicle:hover .session-tooltip` at
  specificity (0,3,0), beating the pit base rule's (0,2,0), and would reapply
  `translate(-50%, ...)` - which with `left: 1rem` throws the bubble roughly
  14rem off the left edge. There is a comment saying so; a reviewer still
  misread it as dead code once.
- **`--pit-lane-max` is single-sourced on purpose**, referenced by both
  `.pit-lane { max-height }` and the tooltip dock offset. If you keep using it
  in both places, keep them consistent; if you stop using it for the dock, say
  so in a comment so the next reader does not "restore" the coupling.
- **Exactly one pit tooltip may be visible at a time.** All of them share one
  docked rect, so two visible overlap. Two `:has()` guards enforce this: a
  pinned guard, and a hover guard scoped with
  `:not(:has(.pit-vehicle[data-pinned="true"]))` so a pin stays authoritative.
  Do not collapse them into one - a bare hover guard cancels against the pinned
  guard and hides *both* tooltips when one car is pinned and another hovered.
- **Mobile docks differently.** Under the `@media (max-width: 760px)` block the
  bubble is `top: 4rem` and full-width, and `--pit-lane-max` is overridden to
  `min(32vh, 6rem)`. Any fix must hold at 390x844, where the vertical budget is
  already tight (a 149px bar plus a 580px stage floor in an 844px viewport).

## Suggested directions - evaluate, do not assume

**For the width**, the obvious move is `width: max-content` with
`max-width: min(28rem, calc(100vw - 2rem))`. Verify before committing: the
tooltip sets `overflow-wrap: anywhere` and has 6 children including a long
absolute timestamp, so `max-content` may resolve wider than 448px and make it
worse. Measure both the resulting width and whether any line now overflows.

**For the vertical gap**, in increasing order of invasiveness:

1. Shrink the constant. Cheap, but only correct at one particular lane height,
   so it trades a 55.8px gap for a wrong-in-the-other-direction gap later.
2. Give `.pit-lane` a fixed `height: var(--pit-lane-max)` instead of
   `max-height`, so the dock offset is always right. Costs stage space whenever
   the pit is near-empty, and the stage is deliberately the hero.
3. Set the dock offset from JS on show, measuring the lane's real top edge.
   **There is in-repo precedent**: `clampRouteTooltip` in
   `dashboard/src/render-dashboard.mjs` already does per-show measurement for
   *route* tooltips, setting `--tt-shift`/`--tt-shift-y` from a delegated
   `pointerover`/`focusin` handler on `#vehicle-layer`. It is deliberately
   scoped to `.vehicle-anchor`, so pit tooltips never receive those variables
   today. Extending the same pattern to the pit lane is the most correct fix and
   matches how the codebase already solves this class of problem.

Option 3 is my recommendation, but confirm the measurement cost is acceptable on
the 5s refresh path before committing to it.

## Verification required

Do not eyeball this. The pit-session-bays branch shipped a layout defect - bays
collapsed to a single car column and the lane scrolled with only 12 cars - with
the **entire suite green**, because a `cols >= 1` assertion passed with one
column and a cap assertion passed *precisely because* the lane was pinned at its
cap and scrolling. Two green tests concealed it. Measure in a real browser.

Gates, run from `dashboard/`:

```sh
npm run verify        # currently 279 pass, 0 fail
npm run test:browser  # currently 86 passed, 4 skipped, 0 failed
```

The browser suite takes 4+ minutes and much longer under load. Run it in the
foreground and block on it; do not background it. Note unrelated Playwright work
sometimes runs on this machine out of `~/Apps/e2e-automation` - leave those
processes alone, and note our suite binds port 43917 only.

Existing browser tests that must keep passing: `pit tooltips stay within the
viewport`, the docked-tooltip containment test, and the mobile
pinning/suppression test.

**Add an assertion that pins whatever you fix.** Suggestions: the tooltip's
bottom edge is within a small tolerance of the lane's top edge, and the bubble's
width is within a small tolerance of its widest content line. A fix with no
assertion will regress the next time the lane's height changes - which is
exactly how this defect appeared.

## Measurement harness

Playwright is installed in the worktree, not the main checkout. Either
`npm install` in `dashboard/`, or point the import at the existing worktree copy
as below. Serve the dashboard, then run:

```js
// measure-tooltip.mjs
import { chromium } from '<abs path to>/dashboard/node_modules/@playwright/test/index.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:43917/', { waitUntil: 'load' });
await page.waitForSelector('#pit .pit-bay');
await page.locator('#pit .pit-vehicle .session-car').first().focus();
await page.waitForTimeout(400); // the show transition is 120ms

console.log(JSON.stringify(await page.evaluate(() => {
  const tip = document.querySelector('#pit .pit-vehicle .session-tooltip');
  const lane = document.querySelector('#pit-lane');
  const t = tip.getBoundingClientRect();
  const l = lane.getBoundingClientRect();
  const widest = Math.max(...[...tip.children].map((c) => {
    const r = document.createRange();
    r.selectNodeContents(c);
    return r.getBoundingClientRect().width;
  }));
  const pad = parseFloat(getComputedStyle(tip).paddingLeft);
  return {
    width: t.width,
    widestContentLine: widest,
    horizontalDeadSpace: t.width - widest - 2 * pad - 2,
    verticalGap: l.top - t.bottom,
    laneHeight: l.height,
  };
}), null, 2));
await browser.close();
```

Serve with `python3 -m http.server 43917 --bind 127.0.0.1 --directory <abs path
to>/dashboard`, and be careful the `--directory` is the dashboard, not wherever
your shell happens to be. Repeat every measurement at 390x844 as well.

## Reference

- Design spec: `docs/superpowers/specs/2026-08-12-pit-session-bays-design.md`.
  Decision 7 covers the lane cap, decision 8 covers the fixed docking and why
  the two are coupled.
- Feature PR: #54 on `ajason13/terminal-dotfiles`, merged as `73bdd2f`.
- Manual verification procedure, including the pit-bay section:
  `dashboard/tests/BROWSER_VERIFICATION.md`.

## Scope

Presentation only. Do not change the collector, the session contract, allocation
(`track-layout.mjs`), or the bay structure. If a fix appears to require touching
those, stop and say so rather than widening the change.
