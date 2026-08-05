# Combined recency-ordered pit lane - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the dashboard's four pit bays into one pit region whose parked cars are ordered most-recently-active first, holding across the 5s live refresh.

**Architecture:** `allocateSessions` collapses every off-track session into one `pit` bucket sorted by `lastActivityAt` descending (id tie-break), capped at 18 with the oldest overflowing. The renderer mounts them into a single `#pit` wrapping grid in that order, and `update()` re-appends surviving pit nodes to re-sort in place. The route/track is untouched.

**Tech Stack:** Vanilla ES modules, node:test unit suite with a DOM fake, Playwright browser suite (desktop 1440x900 + mobile 390x844), static CSS.

## Global Constraints

- No new npm dependencies. ES modules only.
- No em dashes anywhere (code, comments, copy) - use a plain hyphen `-`.
- Do NOT change the collector, `normalizeImportedSnapshot` / import validation, or the live-server security model.
- Order the pit ONLY by `session.lastActivityAt` (already validated in the contract). Add no new collected field.
- Leave the route/track untouched: 16-slot route, animation, pause-on-hover, tooltip, pin via Enter/Space/Escape.
- Preserve both fixtures and live modes and the incremental `update()` path (no full re-render).
- Every DOM id must exist exactly once and be mirrored in `tests/dom-fake.mjs`'s `dashboardRoot` id list.
- Accessibility preserved: labeled region, aria, focus, skip link -> the pit.
- Responsive: mobile 390x844, no horizontal page overflow, 44px car hit target.
- Run the browser suite as ONE foreground Bash call with the `timeout` parameter set to `600000`. Do NOT background it.

## File Structure

- `dashboard/src/session-contract.mjs` - `STATE_PRESENTATION.pool` collapses to `route | pit`.
- `dashboard/src/track-layout.mjs` - single pit bucket, recency sort, `PIT_CAPACITY`; delete bay-anchor machinery.
- `dashboard/index.html` - four `pit-bay` sections + `unknown-hold` -> one `.pit` section (`#pit`, `#pit-overflow`).
- `dashboard/src/render-dashboard.mjs` - single pit mount, recency append, in-place `update()` re-sort, two overflow buckets.
- `dashboard/styles.css` - one full-width wrapping pit; upward tooltips; delete bay/unknown/edge rules.
- `dashboard/tests/dom-fake.mjs` - id list mirror.
- `dashboard/tests/dashboard.test.mjs` - structural + allocation assertions rewritten; new recency/tie-break/capacity tests.
- `dashboard/tests/renderer-lifecycle.test.mjs` - new pit ids; assert `update()` recency re-sort.
- `dashboard/tests/browser/full-bleed-layout.spec.mjs`, `dashboard/tests/browser/dashboard.spec.mjs` - one pit region, recency DOM order, mobile no-overflow.

---

### Task 1: Collapse the four bays into one recency-ordered pit

This is one atomic change: the data contract, allocation, DOM, id contract, renderer first-render path, CSS, and the unit/lifecycle tests move together (the renderer resolves ids via `requiredMount`, so a half-applied change throws). The live-refresh re-sort is Task 2; the browser specs are Task 3.

**Files:**
- Modify: `dashboard/src/session-contract.mjs` (STATE_PRESENTATION pool values)
- Modify: `dashboard/src/track-layout.mjs` (full allocateSessions rewrite)
- Modify: `dashboard/index.html:253-275` (pit-lane body)
- Modify: `dashboard/src/render-dashboard.mjs` (pit mount resolution, first-render append, overflow buckets)
- Modify: `dashboard/styles.css` (pit-lane / pit-mount / tooltip / delete bay+unknown rules)
- Modify: `dashboard/tests/dom-fake.mjs:158-164` (id list)
- Test: `dashboard/tests/dashboard.test.mjs`, `dashboard/tests/renderer-lifecycle.test.mjs`

**Interfaces:**
- Consumes: `STATE_PRESENTATION[status].pool`, `session.lastActivityAt` (ISO string), `session.id`.
- Produces:
  - `PIT_CAPACITY = 18` (exported from `track-layout.mjs`).
  - Pit placement object: `{ id, mapCode, pool: 'pit', poolLabel: 'Pit', locationLabel: 'Pit position N', x: null, y: null, angle: null, slotIndex, overflow: false }` where `slotIndex` is the 0-based recency rank (0 = newest).
  - Overflow placement: `{ …, pool: 'pit', poolLabel: 'Pit', locationLabel: 'Pit is at capacity', x: null, y: null, angle: null, slotIndex: null, overflow: true }`.
  - DOM ids: `#pit` (mount), `#pit-overflow` (notice). Removed: `#pit-error/#pit-permission/#pit-pitstop/#pit-unknown` (+ `-overflow`), `#unknown-hold`.

- [ ] **Step 1: Collapse the pool contract**

In `dashboard/src/session-contract.mjs`, set `pool: 'pit'` for `waiting_for_permission`, `idle`, `error`, `complete`, and `unknown` (leave `active`/`thinking` as `route`):

```js
export const STATE_PRESENTATION = Object.freeze({
  active: Object.freeze({ label: 'Active', glyph: '›', pool: 'route' }),
  thinking: Object.freeze({ label: 'Thinking', glyph: '…', pool: 'route' }),
  waiting_for_permission: Object.freeze({ label: 'Waiting for permission', glyph: '!', pool: 'pit' }),
  idle: Object.freeze({ label: 'Idle', glyph: '‖', pool: 'pit' }),
  error: Object.freeze({ label: 'Error', glyph: '×', pool: 'pit' }),
  complete: Object.freeze({ label: 'Complete', glyph: '✓', pool: 'pit' }),
  unknown: Object.freeze({ label: 'Unknown', glyph: '?', pool: 'pit' }),
});
```

- [ ] **Step 2: Rewrite `allocateSessions` for one recency-ordered pit**

Replace `dashboard/src/track-layout.mjs` lines 6-94 (the `ZONES`, `bays`, `PARKED_ANCHORS`, `UNKNOWN_HOLD_ANCHORS`, `anchorsOf`, `labelOf`, `placement`, `overflow`, `allocateSessions` block) with the following. Keep `fnv1a32` and `preferredRouteIndex` unchanged. Keep the top imports and `SEGMENTS`/`ROUTE_ANCHORS` exports.

```js
export const PIT_CAPACITY = 18;

const poolOf = (session) => STATE_PRESENTATION[session.status].pool;

function routePlacement(session, anchor, slotIndex) {
  return Object.freeze({
    id: session.id, mapCode: session.mapCode, pool: 'route', poolLabel: 'Shared Route',
    locationLabel: `${anchor.poolLabel}, Route Slot ${slotIndex + 1}`,
    x: anchor.x, y: anchor.y, angle: anchor.angle, slotIndex, overflow: false,
  });
}

function pitPlacement(session, slotIndex) {
  return Object.freeze({
    id: session.id, mapCode: session.mapCode, pool: 'pit', poolLabel: 'Pit',
    locationLabel: `Pit position ${slotIndex + 1}`,
    x: null, y: null, angle: null, slotIndex, overflow: false,
  });
}

const overflowPlacement = (session, pool, poolLabel) => Object.freeze({
  id: session.id, mapCode: session.mapCode, pool, poolLabel,
  locationLabel: pool === 'route' ? 'Map capacity exceeded for Shared Route' : 'Pit is at capacity',
  x: null, y: null, angle: null, slotIndex: null, overflow: true,
});

export function allocateSessions(sessions, track = RIDGE_PASS) {
  const routeMembers = [];
  const pitMembers = [];
  for (const session of sessions) {
    (poolOf(session) === 'route' ? routeMembers : pitMembers).push(session);
  }
  const byId = new Map();

  // Route: progress/hash slotting into the track anchors. Order-independent.
  const routeAnchors = track.routeAnchors;
  const usedRoute = new Set();
  for (const session of [...routeMembers].sort((l, r) => l.id.localeCompare(r.id))) {
    if (usedRoute.size === routeAnchors.length) {
      byId.set(session.id, overflowPlacement(session, 'route', 'Shared Route'));
      continue;
    }
    let index = preferredRouteIndex(session);
    while (usedRoute.has(index)) index = (index + 1) % routeAnchors.length;
    usedRoute.add(index);
    byId.set(session.id, routePlacement(session, routeAnchors[index], index));
  }

  // Pit: one pool, newest-first by lastActivityAt, id tie-break, capacity PIT_CAPACITY.
  // Sort is order-independent (timestamp desc, then id asc), so input order never
  // changes the result - preserves the suite's stable-allocation guarantee.
  const orderedPit = [...pitMembers].sort((l, r) => {
    const delta = Date.parse(r.lastActivityAt) - Date.parse(l.lastActivityAt);
    return delta !== 0 ? delta : l.id.localeCompare(r.id);
  });
  orderedPit.forEach((session, rank) => {
    byId.set(session.id, rank < PIT_CAPACITY
      ? pitPlacement(session, rank)
      : overflowPlacement(session, 'pit', 'Pit'));
  });

  return Object.freeze(sessions.map((session) => byId.get(session.id)));
}
```

Also delete the now-unused `a` helper (line 13) and the `ZONES`/`PARKED_ANCHORS`/`UNKNOWN_HOLD_ANCHORS` exports. `ROUTE_ANCHORS` (line 14) stays.

- [ ] **Step 3: Collapse the pit-lane DOM**

In `dashboard/index.html`, replace the whole `#pit-lane` block (lines 253-275, the four `<section class="pit-bay …>` plus the `unknown-hold` section) with:

```html
      <section id="pit-lane" class="pit-lane" aria-label="Pit lane" tabindex="-1">
        <section class="pit" aria-labelledby="pit-heading">
          <header><span aria-hidden="true">&#9670;</span><h2 id="pit-heading">Pit</h2></header>
          <div id="pit" class="pit-mount" aria-label="Parked sessions, newest first"></div>
          <div id="pit-overflow" class="pit-overflow" hidden></div>
        </section>
      </section>
```

- [ ] **Step 4: Mirror the id contract in the DOM fake**

In `dashboard/tests/dom-fake.mjs`, change the id list (lines 158-164) so it drops the eight removed pit/unknown ids and adds the two new ones:

```js
  for (const id of [
    'snapshot-summary', 'vehicle-layer', 'tooltip-layer', 'overflow-notice',
    'on-track-summary', 'map-stage', 'map-heading',
    'pit', 'pit-overflow', 'go-live',
  ]) {
```

- [ ] **Step 5: Point the renderer at the single pit mount and append in recency order**

In `dashboard/src/render-dashboard.mjs`:

Replace `PIT_SELECTORS` (lines 7-12) - delete it (no longer needed).

Replace the mount resolution (lines 218-224) with:

```js
  const pitMount = requiredMount(root, '#pit');
  const pitOverflow = requiredMount(root, '#pit-overflow');
```

Delete the unknown placeholder-tile loop and `unknownHold` usage. Replace lines 230-241 (`for (const mount of pitMounts.values())` through the `pitOverflows` reset loop) with:

```js
  pitMount.replaceChildren();
  pitOverflow.replaceChildren();
  pitOverflow.hidden = true;
```

Delete line 243 (`unknownHold.hidden = …`) and the `unknownHold` requiredMount (line 218).

In `makeCar` (lines 108-159), delete the `if (target === 'unknown') { … }` branch (lines 126-129). `target` is now only `'route'` or `'pit'`.

Change `POOL_LABELS` (lines 182-188) to:

```js
const POOL_LABELS = Object.freeze({ route: 'route', pit: 'pit' });
```

Replace the first-render creation loop (lines 315-332) with one that appends route cars immediately and pit cars in recency (`slotIndex`) order:

```js
  const pitEntries = [];
  for (const session of snapshot.sessions) {
    const placement = placementsById.get(session.id);
    const text = buildAccessibleText(session, placement, snapshot.generatedAt);
    textById.set(session.id, text);
    if (placement.overflow) {
      if (!overflows.has(placement.pool)) overflows.set(placement.pool, []);
      overflows.get(placement.pool).push({ code: session.mapCode, name: session.displayName });
      continue;
    }
    const target = placement.pool === 'route' ? 'route' : 'pit';
    const car = makeCar(documentRef, session, placement, text, target);
    carsById.set(session.id, car.wrapper);
    buttonsById.set(session.id, car.button);
    tooltipsById.set(session.id, car.wrapper.querySelector('.session-tooltip'));
    attachCarInteractions(session.id);
    if (target === 'route') vehicleLayer.append(car.wrapper);
    else pitEntries.push({ wrapper: car.wrapper, slotIndex: placement.slotIndex });
  }
  for (const entry of pitEntries.sort((a, b) => a.slotIndex - b.slotIndex)) {
    pitMount.append(entry.wrapper);
  }
```

Replace the first-render overflow-notice loop (lines 335-340) with two fixed buckets:

```js
  summary.textContent = summaryText(snapshot);
  for (const [pool, entries] of overflows) {
    const notice = pool === 'route' ? mapOverflow : pitOverflow;
    const capacity = placements.filter((item) => item.pool === pool && !item.overflow).length;
    renderOverflowNotice(documentRef, notice, entries, POOL_LABELS[pool] ?? pool, capacity);
    notice.hidden = false;
  }
```

In `update()`, change the overflow reset + render (lines 454-465) to use the single `pitOverflow`:

```js
      mapOverflow.replaceChildren();
      mapOverflow.hidden = true;
      pitOverflow.replaceChildren();
      pitOverflow.hidden = true;
      for (const [pool, entries] of nextOverflows) {
        const notice = pool === 'route' ? mapOverflow : pitOverflow;
        const capacity = nextPlacements.filter((item) => item.pool === pool && !item.overflow).length;
        renderOverflowNotice(documentRef, notice, entries, POOL_LABELS[pool] ?? pool, capacity);
        notice.hidden = false;
      }
```

And in `update()`, the create branch (line 437-438) that appended to `pitMounts.get(target)` becomes:

```js
        } else {
          const car = makeCar(documentRef, session, placement, text, target);
          if (target === 'route') vehicleLayer.append(car.wrapper);
          else pitMount.append(car.wrapper);
          carsById.set(session.id, car.wrapper);
          buttonsById.set(session.id, car.button);
          tooltipsById.set(session.id, car.wrapper.querySelector('.session-tooltip'));
          attachCarInteractions(session.id);
        }
```

(The recency re-sort inside `update()` is added in Task 2. Newly-created pit cars append to the end here; Task 2 re-orders them.)

- [ ] **Step 6: Rewrite the pit CSS**

In `dashboard/styles.css`:

Replace `.pit-lane` (lines 935-943) and delete the `#pit-lane:has(...)` reflow (945-948):

```css
.pit-lane {
  display: grid;
  gap: 10px;
  padding: 8px 14px;
  min-width: 0;
  overflow: visible;
  border-top: 2px dashed var(--color-boundary);
}
```

Replace `.pit-bay` header rules (950-985) and the `.pit-error/.pit-permission/.pit-stop` ink rules (987-989) with one `.pit` block:

```css
.pit {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.pit > header {
  display: flex;
  align-items: center;
  gap: .35rem;
  margin-bottom: .3rem;
}

.pit > header h2 {
  margin: 0;
  font-size: .72rem;
  line-height: 1.2;
  white-space: nowrap;
}

.pit-lane:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 2px;
}
```

Delete the unknown-hold block and its anchors (991-1024: `.unknown-hold`, `.unknown-mount`, `.unknown-anchor`, `.unknown-mount .pit-vehicle`).

Change `.pit-mount` (1069-1076) to a full-width wrapping grid:

```css
.pit-mount {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  grid-auto-rows: 52px;
  justify-items: center;
  gap: .45rem .55rem;
  min-height: 52px;
}
```

(Keep `.pit-mount:empty::after { content: "Clear"; … }` at 1078-1085.)

Replace the pit tooltip rules (1087-1108: the sideways `.pit-vehicle .session-tooltip`, the leftmost `.pit-error …` rule, and the pit hover block) with upward, left-aligned rules. Left-aligned protects the left column (including the newest, top-left car) from clipping off the left edge; `overflow-x: hidden` on the page guards the right column:

```css
/* Pit is the bottom lane, so tooltips open upward. Left-aligned so the left
   column (including the newest, top-left car) never clips off the left edge. */
.pit-vehicle .session-tooltip {
  top: auto;
  bottom: calc(100% + 9px);
  left: 0;
  right: auto;
  transform: translate(0, -.25rem);
}

.pit-vehicle:hover .session-tooltip,
.pit-vehicle:focus-within .session-tooltip,
.pit-vehicle[data-pinned="true"] .session-tooltip {
  transform: translate(0, 0);
}
```

In the 759px mobile block: change `.pit-mount { grid-template-columns: repeat(3, 52px) }` (line 1404) to `.pit-mount { grid-template-columns: repeat(auto-fill, 52px) }`, and delete the mobile per-bay tooltip rules (1405-1417: the comment plus `.pit-bay .pit-vehicle .session-tooltip` and its hover variant). The desktop upward rule applies at mobile too.

- [ ] **Step 7: Update the unit-test assertions to the new structure (run red first)**

Edit `dashboard/tests/dashboard.test.mjs`:

- Pool mapping (77-86): change the five off-track statuses' third tuple element to `'pit'`:
  ```js
    waiting_for_permission: ['Waiting for permission', '!', 'pit'],
    idle: ['Idle', '‖', 'pit'],
    error: ['Error', '×', 'pit'],
    complete: ['Complete', '✓', 'pit'],
    unknown: ['Unknown', '?', 'pit'],
  ```
- `expectedPools` (93): `['route', 'route', 'pit', 'pit', 'pit', 'pit']`.
- "declares the exact ordered pit stack" (168-188): replace `orderedIds` with `['on-track-summary', 'map-stage', 'pit']`; keep the `#map-stage` before `#pit` ordering. Replace `assert.match(RENDERER, /pitMounts\.get\(target\)\.append\(car\.wrapper\)/)` with `assert.match(RENDERER, /pitMount\.append\(entry\.wrapper\)/)`. Change the stray-detection `assert.doesNotMatch(INDEX, …)` to `assert.doesNotMatch(INDEX, /pit-error|pit-permission|pit-pitstop|unknown-hold|pit-complete|pit-idle/)`. Keep the `renderOnTrackSummary` doesNotMatch block unchanged.
- `PARKED_ANCHORS`/`ZONES` assertions (257-261): delete them; replace with `assert.equal(PIT_CAPACITY, 18)` (import `PIT_CAPACITY` from `track-layout.mjs`). Remove the now-dangling `PARKED_ANCHORS`/`ZONES` imports.
- Canonical 24-session distribution (366-385): the off-track pools merge. Replace the distribution assertion with:
  ```js
  assert.deepEqual(Object.fromEntries(['route', 'pit'].map((pool) => [
    pool, placements.filter((item) => item.pool === pool).length,
  ])), { route: 12, pit: 12 });
  const pit = placements.filter((item) => item.pool === 'pit');
  assert.equal(new Set(pit.map((item) => item.slotIndex)).size, 12);
  ```
  Change `assert.match(RENDERER, /const car = makeCar\(documentRef, session, placement, text, target\)/)` - this string still exists, keep it.
- `permission and error pool session 7 overflows` (421-435): these pools no longer overflow at 6. Delete this test (its intent - per-pool capacity - no longer exists; capacity is now the single pit's 18, covered by the new test in Step 8).
- `combined idle and complete Pit Stop pool overflows after six` (437-454): delete (replaced by the capacity-18 test in Step 8).
- `route session 17 overflows` (408-419): unchanged (route capacity is still 16) - leave as-is.
- `34 sessions fit` (395-406): 6 permission + 6 error + 3 idle + 3 complete = 18 pit + 16 route = 34, exactly at pit capacity, no overflow. This still passes as written; leave as-is.
- CSS structural block (819-844): `.pit-lane` rule assertion (822-825) still holds (`display: grid`, `overflow: visible`) - leave. Change the mobile `.pit-mount` assertion (843) to `assert.match(STYLES, /\.pit-mount\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill,\s*52px\)/si)`. The `INDEX.indexOf('id="map-stage"') < INDEX.indexOf('id="pit-lane"')` assertion (841) still holds - leave.

Edit `dashboard/tests/renderer-lifecycle.test.mjs` (it has its OWN local helpers - `overflowingSnapshot(count)` builds N idle sessions; there is no shared `session()` here):
- Replace the three `#pit-pitstop-overflow` selectors (lines 82, 172, 176) with `#pit-overflow`.
- Change both `overflowingSnapshot(16)` calls (lines 80, 174) to `overflowingSnapshot(20)` - 16 idle no longer overflows the 18-slot pit; 20 overflows by 2.
- Change the toggle regex (line 86) from `/^\d+ parked · over Pit Stop capacity \(\d+ slots?\)$/` to `/^\d+ parked · over pit capacity \(\d+ slots?\)$/` (the notice label is now `pit`, capacity 18). The item regex `/^S\d+ Idle Session \d+$/` is unchanged.

Run: `node --test dashboard/tests/*.test.mjs`
Expected at this point: FAIL - assertions reference new structure the source may not fully satisfy yet, and the new tests from Step 8 do not exist. This confirms the tests are exercising the change.

- [ ] **Step 8: Add the recency, tie-break, and capacity unit tests**

Add to `dashboard/tests/dashboard.test.mjs` (use the existing `session`/`normalized`/`allocateSessions` helpers; `session(id, status, overrides)` accepts `lastActivityAt` in overrides):

```js
test('pit orders newest lastActivityAt first regardless of input order', () => {
  const mk = (id, at) => session(id, 'complete', { lastActivityAt: at });
  const data = normalized([
    mk('b', '2026-08-05T10:00:00Z'),
    mk('a', '2026-08-05T10:05:00Z'),
    mk('c', '2026-08-05T09:55:00Z'),
  ]);
  const order = allocateSessions(data.sessions)
    .slice().sort((l, r) => l.slotIndex - r.slotIndex).map((p) => p.id);
  assert.deepEqual(order, ['a', 'b', 'c']); // 10:05, 10:00, 09:55
});

test('pit ties on identical lastActivityAt break by id ascending', () => {
  const at = '2026-08-05T10:00:00Z';
  const data = normalized([
    session('zulu', 'idle', { lastActivityAt: at }),
    session('alpha', 'error', { lastActivityAt: at, errorSummary: 'x' }),
    session('mike', 'complete', { lastActivityAt: at }),
  ]);
  const order = allocateSessions(data.sessions)
    .slice().sort((l, r) => l.slotIndex - r.slotIndex).map((p) => p.id);
  assert.deepEqual(order, ['alpha', 'mike', 'zulu']);
});

test('pit caps at 18 and overflows the oldest, keeping newest onscreen', () => {
  const items = Array.from({ length: 20 }, (_, i) => session(
    `s-${String(i).padStart(2, '0')}`,
    'complete',
    // s-00 newest ... s-19 oldest
    { lastActivityAt: `2026-08-05T10:${String(40 - i).padStart(2, '0')}:00Z` },
  ));
  const data = normalized(items);
  const placements = allocateSessions(data.sessions);
  const overflowed = placements.filter((p) => p.overflow);
  assert.equal(overflowed.length, 2);
  // the two OLDEST overflow
  assert.deepEqual(overflowed.map((p) => p.id).sort(), ['s-18', 's-19']);
  const shown = placements.filter((p) => !p.overflow);
  assert.equal(new Set(shown.map((p) => p.slotIndex)).size, 18);
  const newest = placements.find((p) => p.slotIndex === 0);
  assert.equal(newest.id, 's-00');
  const item = data.sessions.find((s) => s.id === overflowed[0].id);
  const text = buildAccessibleText(item, overflowed[0], data.generatedAt);
  assert.match(text.label, /Map capacity exceeded for Pit/);
});
```

Verify the `session` helper defaults `lastActivityAt`; if it hardcodes one value, pass `lastActivityAt` via overrides as above (the helper spreads overrides). If `error` sessions require `errorSummary`, include it (shown above).

- [ ] **Step 9: Run the unit + routes suites to green**

Run: `node --test dashboard/tests/*.test.mjs`
Expected: PASS (all, including the three new tests).

Run: `npm --prefix dashboard run routes:check`
Expected: `routes: generated artifacts are current`.

If a browser-spec import or a shared helper breaks compilation, note it - browser specs are updated in Task 3 and are expected to fail their assertions until then, but must still parse.

- [ ] **Step 10: Commit**

```bash
git add dashboard/src/session-contract.mjs dashboard/src/track-layout.mjs dashboard/index.html \
  dashboard/src/render-dashboard.mjs dashboard/styles.css dashboard/tests/dom-fake.mjs \
  dashboard/tests/dashboard.test.mjs dashboard/tests/renderer-lifecycle.test.mjs
git commit -m "feat(dashboard): merge the four pit bays into one recency-ordered pit

All off-track sessions render in a single #pit mount ordered newest-first
by lastActivityAt (id tie-break), capacity 18 with the oldest overflowing.
Collapses STATE_PRESENTATION.pool to route|pit and deletes the bay-anchor
and unknown-hold machinery. Tooltips open upward. Route/track untouched.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Keep the pit newest-first across the live update() refresh

The `update()` path reuses existing pit wrappers in place, so when a session's `lastActivityAt` advances between 5s snapshots (e.g. a running session completes and jumps to the front), the DOM order must re-sort. Re-appending an existing node moves it without recreating it, preserving element identity, listeners, `data-pinned`, and `aria-pressed`.

**Files:**
- Modify: `dashboard/tests/dom-fake.mjs` (make `append` move existing nodes, like real DOM)
- Modify: `dashboard/src/render-dashboard.mjs` (`update()` - add the recency re-sort)
- Test: `dashboard/tests/renderer-lifecycle.test.mjs`

**Interfaces:**
- Consumes: `nextPlacementsById` (built in `update()`), `carsById`, `pitMount`.
- Produces: after any `update()`, `#pit`'s children are in ascending `slotIndex` (recency) order.

**Test-fake constraints (verified against `dom-fake.mjs`):**
- The fake `querySelectorAll` handles only ONE simple selector (`#id` or `.class`) - compound selectors like `#pit .pit-vehicle` never match. Read pit order via `root.querySelector('#pit').children` (the mount's direct children are the `.pit-vehicle` wrappers).
- `renderer-lifecycle.test.mjs` builds snapshots inline via `normalizeSnapshot({...})` (no shared `session()` helper) and pins by dispatching `keydown('Enter')` on a `.session-car` found with `findCar(root, id)`. Use those idioms.

- [ ] **Step 1: Fix the DOM fake's `append` to move, not duplicate**

The current fake `append` (dom-fake.mjs:72-81) pushes a node without detaching it from its old position, so re-appending an existing child duplicates it. Real DOM moves the node. The re-sort below relies on move semantics, so make the fake faithful. Replace `append` with:

```js
  append(...items) {
    for (const item of items) {
      if (item instanceof FakeElement) {
        if (item.parentElement) {
          const existing = item.parentElement.children.indexOf(item);
          if (existing !== -1) item.parentElement.children.splice(existing, 1);
        }
        item.parentElement = this;
        this.children.push(item);
      } else {
        this.children.push(String(item));
      }
    }
  }
```

Existing callers append freshly-created (parentless) nodes, so the new detach branch only fires for the re-sort - no existing test changes behavior. Run `node --test dashboard/tests/*.test.mjs` and confirm still green (regression check on the fake change alone).

- [ ] **Step 2: Write the failing test**

Add to `dashboard/tests/renderer-lifecycle.test.mjs`, matching its inline-builder + `findCar`/`keydown` idioms:

```js
test('update() re-sorts the pit so a freshly active session moves to the front', () => {
  const { root } = dashboardRoot();
  const t = (m) => `2026-08-05T10:${String(m).padStart(2, '0')}:00Z`;
  const build = (oldAt) => normalizeSnapshot({
    schemaVersion: 1,
    generatedAt: '2026-08-05T11:00:00Z',
    sessions: [
      { id: 'old', displayName: 'Old', status: 'complete', lastActivityAt: oldAt, permissionState: 'not_required' },
      { id: 'mid', displayName: 'Mid', status: 'idle', lastActivityAt: t(20), permissionState: 'not_required' },
      { id: 'run', displayName: 'Run', status: 'complete', lastActivityAt: t(30), permissionState: 'not_required' },
    ],
  });
  const view = renderDashboard(build(t(10)), root, getTrack('ridge-pass'));
  const idsAt = () => root.querySelector('#pit').children.map((el) => el.dataset.sessionId);
  assert.deepEqual(idsAt(), ['run', 'mid', 'old']); // newest-first at mount

  view.update(build(t(45))); // 'old' fires a fresh response and jumps to newest
  assert.deepEqual(idsAt(), ['old', 'run', 'mid']);
});

test('update() re-sort keeps a pinned pit car pinned', () => {
  const { root } = dashboardRoot();
  const t = (m) => `2026-08-05T10:${String(m).padStart(2, '0')}:00Z`;
  const build = (aAt) => normalizeSnapshot({
    schemaVersion: 1,
    generatedAt: '2026-08-05T11:00:00Z',
    sessions: [
      { id: 'a', displayName: 'A', status: 'complete', lastActivityAt: aAt, permissionState: 'not_required' },
      { id: 'b', displayName: 'B', status: 'idle', lastActivityAt: t(20), permissionState: 'not_required' },
    ],
  });
  const view = renderDashboard(build(t(10)), root, getTrack('ridge-pass'));
  findCar(root, 'b').dispatchEvent(keydown('Enter')); // pin b
  view.update(build(t(30)));                          // a jumps ahead of b
  const pinned = root.querySelector('#pit').children.filter((el) => el.dataset.pinned === 'true');
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0].dataset.sessionId, 'b');
});
```

(`children.map`/`.filter` work because the fake's `children` is a real Array. Confirm `keydown` and `findCar` exist at the file's top - they do.)

- [ ] **Step 3: Run to verify it fails**

Run: `node --test dashboard/tests/renderer-lifecycle.test.mjs`
Expected: FAIL on the post-`update()` order assertion - the pit is not re-sorted, so `old` stays last.

- [ ] **Step 4: Add the in-place recency re-sort to `update()`**

In `dashboard/src/render-dashboard.mjs`, inside `update()`, after the per-session reuse/create loop and before the overflow rendering (i.e. right after the `for (const id of [...sessionsById.keys()])` stale-cleanup block, around line 452), add:

```js
      // Re-append surviving pit cars in recency (slotIndex) order so the newest
      // stays first across the live refresh. append() MOVES an existing node
      // without recreating it, so element identity, listeners, and pinned state
      // survive. Route cars are absolutely positioned, so their order is irrelevant.
      const pitOrder = [];
      for (const [id, wrapper] of carsById) {
        const placement = nextPlacementsById.get(id);
        if (placement && !placement.overflow && placement.pool === 'pit') {
          pitOrder.push({ wrapper, slotIndex: placement.slotIndex });
        }
      }
      for (const entry of pitOrder.sort((a, b) => a.slotIndex - b.slotIndex)) {
        pitMount.append(entry.wrapper);
      }
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --test dashboard/tests/renderer-lifecycle.test.mjs`
Expected: PASS.

Run: `node --test dashboard/tests/*.test.mjs`
Expected: PASS (full unit suite still green).

- [ ] **Step 6: Commit**

```bash
git add dashboard/tests/dom-fake.mjs dashboard/src/render-dashboard.mjs dashboard/tests/renderer-lifecycle.test.mjs
git commit -m "feat(dashboard): re-sort the pit by recency on each live update()

Re-append surviving pit cars in slotIndex order after update() so the
newest stays first across the 5s refresh; append() moves nodes in place,
preserving pin and focus. No full re-render.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Update the browser specs and run the full browser suite

The Playwright specs still assert four bays. Update them to the single pit, add a recency-order and mobile-no-overflow check, then run the suite (both projects) as the final gate.

**Files:**
- Modify: `dashboard/tests/browser/full-bleed-layout.spec.mjs`
- Modify: `dashboard/tests/browser/dashboard.spec.mjs` (only if it references pit bays - grep first)

**Interfaces:**
- Consumes: the rendered DOM from Tasks 1-2 (`#pit`, `.pit-mount .pit-vehicle`, upward tooltips).

- [ ] **Step 1: Rewrite the four-bay browser assertions**

In `dashboard/tests/browser/full-bleed-layout.spec.mjs`:

Replace the `'the pit lane is a row of four labeled bays below the stage'` test (43-52) with a single-pit + recency check:

```js
test('the pit is one region below the stage, ordered newest-first', async ({ page }) => {
  await expect(page.locator('.pit-bay')).toHaveCount(0);
  await expect(page.locator('#pit-heading')).toHaveText('Pit');
  const stage = await page.locator('#map-stage').boundingBox();
  const lane = await page.locator('#pit-lane').boundingBox();
  expect(lane.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);

  // DOM order in #pit must be descending lastActivityAt (newest first).
  const times = await page.locator('#pit .pit-vehicle .activity-time').evaluateAll((els) => (
    els.map((el) => Date.parse(el.getAttribute('datetime')))
  ));
  const sorted = [...times].sort((a, b) => b - a);
  expect(times).toEqual(sorted);
});
```

(If `.activity-time` is not present on every pit car, read the datetime from the tooltip's `<time class="activity-time">` which `makeTooltip` renders - confirm the selector against a rendered car.)

Update `'parked (pit) cars mount inside a pit bay, not on the stage'` (54-60): change the locator `'.pit-mount .pit-vehicle, .unknown-mount .pit-vehicle'` to `'#pit .pit-vehicle'`.

Delete `'the pit lane reflows to fill its width when the unknown bay is empty'` (62-82) - there are no bays to reflow. The full-width single mount is covered by the mobile-overflow test.

Replace `'pit tooltips stay within the viewport, including the leftmost bay'` (102-118): keep the viewport-clip check but drop the `.pit-bay` reference and the desktop-only skip (upward tooltips apply at all widths):

```js
test('pit tooltips stay within the viewport', async ({ page }) => {
  const clipped = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const wrapper of document.querySelectorAll('#pit .pit-vehicle')) {
      wrapper.querySelector('.session-car').focus();
      const r = wrapper.querySelector('.session-tooltip').getBoundingClientRect();
      if (r.left < -0.5 || r.right > vw + 0.5) bad.push({ id: wrapper.dataset.sessionId, left: r.left, right: r.right });
      wrapper.querySelector('.session-car').blur();
    }
    return bad;
  });
  expect(clipped, JSON.stringify(clipped)).toEqual([]);
});
```

Update `'mobile stacks the bar, uses a 2x2 pit lane, and never overflows horizontally'` (128-140): keep the `scrollWidth - clientWidth === 0` and stage-height checks; remove the `gridTemplateColumns … === 2` bay assertion (there are no bays). Rename to `'mobile keeps the pit full-width and never overflows horizontally'` and assert the pit mount is present and wraps:

```js
  await expect(page.locator('#pit')).toBeVisible();
  const cols = await page.locator('#pit').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
  expect(cols).toBeGreaterThanOrEqual(1); // auto-fill wrapping grid
```

- [ ] **Step 2: Grep and fix the other spec**

Run: `grep -n "pit-bay\|Service Bay\|Permission Checkpoint\|unknown-hold\|#pit-error\|#pit-permission\|#pit-pitstop" dashboard/tests/browser/dashboard.spec.mjs`
Fix any hits to the new single-pit structure (`#pit`, `.pit-vehicle`, single `Pit` heading). If there are no hits, leave the file unchanged.

- [ ] **Step 3: Run the full browser suite (foreground, both projects)**

Run this as ONE foreground Bash call with the `timeout` parameter set to `600000` (the suite takes ~3 minutes):

```bash
npm --prefix dashboard run test:browser
```

Expected: PASS on both the desktop (1440x900) and mobile (390x844) projects.

If a test fails on real clipping or overflow, fix the CSS in `styles.css` (not the test's intent) and re-run. Do not weaken an assertion to make it pass.

- [ ] **Step 4: Commit**

```bash
git add dashboard/tests/browser/full-bleed-layout.spec.mjs dashboard/tests/browser/dashboard.spec.mjs
git commit -m "test(dashboard): browser specs assert one recency-ordered pit

Replace the four-bay assertions with a single #pit region check, verify
DOM order is descending lastActivityAt, and keep the mobile no-overflow
and tooltip-clip guards.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- One pit / collapse pool -> Task 1 Steps 1-3, 5-6.
- Pure recency order + tie-break -> Task 1 Step 2 + Step 8 tests.
- Capacity 18, oldest overflows -> Task 1 Step 2 + Step 8 test.
- Holds across live refresh -> Task 2.
- Single "Pit" label -> Task 1 Step 3.
- Upward tooltip, delete per-bay CSS -> Task 1 Step 6.
- Id contract + dom-fake mirror -> Task 1 Steps 3-5.
- Mobile no-overflow / 44px target -> Task 1 Step 6 + Task 3 Steps 1, 3.
- Untouched route/collector/import/live-security -> not modified by any task.

**Placeholder scan:** No TBD/TODO. Two steps say "confirm the selector against a rendered car" / "adapt the pin trigger to whatever the file uses" - these are real verification instructions against existing code the implementer can read, not deferred design. The `session` helper's `lastActivityAt` handling (Step 8) is called out to verify because the plan author did not read the helper's body.

**Type consistency:** `PIT_CAPACITY` (exported, Task 1) used in Task 1 tests. `pitMount`/`pitOverflow` names consistent across Task 1 Step 5 and Task 2 Step 3. Placement shape (`pool: 'pit'`, `slotIndex`, `overflow`) consistent across allocation, render, and tests. `#pit`/`#pit-overflow` ids consistent across index.html, dom-fake, render-dashboard, and both spec updates.

## Assumptions carried from the spec (verify while implementing)

- `session.lastActivityAt` is populated for every off-track status in live mode (it is a required validated field; a snapshot missing it fails closed). If a real live snapshot lacks it, STOP and raise - do not add collection.
- Nothing outside allocation/rendering/labels reads the old four-way pool tag (grep-confirmed; re-grep before deleting `ZONES`/`PARKED_ANCHORS`).
- The `session`/`snapshot`/`normalized`/`dashboardRoot` test helpers accept `lastActivityAt` overrides and build a usable root; confirm signatures against the test files before writing Step 8 / Task 2 tests.
