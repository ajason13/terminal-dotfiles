# Pit Session Bays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Divide the dashboard pit into one bay per tmux session, alphabetically ordered and stable across live refreshes, so a glance answers "is anything in this session waiting on me?"

**Architecture:** `allocateSessions` gains two additive fields on pit placements (`bayKey`, `bayRank`) while keeping its exact signature and frozen flat-array return; a new sibling export `allocatePitBays` supplies the ordered bay roster. The renderer reconciles bay elements against that roster and appends cars into per-bay mounts, reusing bay elements so pinned cars survive. Capping the lane's height to protect the stage forces pit tooltips onto the `position: fixed` docking mobile already uses.

**Tech Stack:** Vanilla ES modules, no build step, no dependencies. `node --test` for unit tests, Playwright for browser tests, plain CSS.

**Spec:** `docs/superpowers/specs/2026-08-12-pit-session-bays-design.md`

## Global Constraints

- No new npm dependencies. ES modules only.
- No em dashes anywhere (code, comments, docs, commit messages). Use a plain hyphen.
- Comment blocks are 1-2 lines by default. Keep the load-bearing "why"; drop what the code already shows.
- Do NOT change the collector (`src/tmux-collector.mjs`, `src/tmux-classifier.mjs`), the contract's validation, `normalizeImportedSnapshot`, or the live-server security model.
- `allocateSessions(sessions, track)` keeps its exact signature and frozen flat-array return. Roughly 20 test call sites index into it positionally.
- Preserve the incremental `update()` path. Never recreate a car element (it restarts the CSS motion animation) and never rebuild a bay that already exists (it destroys a pinned descendant's focus and `data-pinned`).
- `dom-fake.mjs` supports only `#id` and `.class` selectors and has no `insertBefore`. Bay lookup must use an in-memory `Map`; bay ordering must use `append()` as a move.
- Keep the `#pit`, `#pit-overflow`, `#pit-lane` id contract, mirrored in `tests/dom-fake.mjs:162-166`. The skip link keeps landing on `#pit-lane`.
- Commit after every task. Each commit compiles and passes `npm run verify`.
- All commands run from `dashboard/`.

---

### Task 1: Allocation becomes bay-aware

**Files:**
- Modify: `dashboard/src/track-layout.mjs`
- Test: `dashboard/tests/dashboard.test.mjs`

**Interfaces:**
- Consumes: `parseWorkRef` from `./session-contract.mjs` (already exported), `STATE_PRESENTATION`.
- Produces:
  - `pitPlacement` objects now carry `bayKey: string | null` and `bayRank: number`. `slotIndex` keeps its existing meaning (global recency rank, drives capacity and overflow). Route and overflow placements do NOT gain these fields - consumers check `pool === 'pit' && !overflow` first, which the renderer already does.
  - `allocatePitBays(sessions, track = RIDGE_PASS) -> frozen Array<{ key: string | null, label: string }>`
  - `UNASSIGNED_BAY_LABEL = 'Unassigned'`
  - `locationLabel` for pit placements changes from `Pit position N` to `Pit, <label> bay, position N`.

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/tests/dashboard.test.mjs`. Import `allocatePitBays` and `UNASSIGNED_BAY_LABEL` by adding them to the existing `../src/track-layout.mjs` import block at line 21-28 (keep the list alphabetical: `PIT_CAPACITY, ROUTE_ANCHORS, SEGMENTS, UNASSIGNED_BAY_LABEL, allocatePitBays, allocateSessions, fnv1a32, preferredRouteIndex`).

These use the file's existing `session(id, status, overrides)` and `normalized(sessions)` helpers at lines 44-63.

```js
test('pit placements carry a bay key and a within-bay recency rank', () => {
  const data = normalized([
    session('e-new', 'idle', { displayName: 'E2E ▸ newer', lastActivityAt: '2026-07-19T20:20:00Z' }),
    session('e-old', 'idle', { displayName: 'E2E ▸ older', lastActivityAt: '2026-07-19T20:10:00Z' }),
    session('w-one', 'idle', { displayName: 'Workflow ▸ only', lastActivityAt: '2026-07-19T20:15:00Z' }),
  ]);
  const byId = new Map(allocateSessions(data.sessions).map((item) => [item.id, item]));
  // slotIndex is global recency; bayRank counts only within the bay.
  assert.deepEqual(['e-new', 'w-one', 'e-old'].map((id) => {
    const placement = byId.get(id);
    return [placement.bayKey, placement.bayRank, placement.slotIndex];
  }), [['E2E', 0, 0], ['Workflow', 0, 1], ['E2E', 1, 2]]);
});

test('pit location label names the bay and counts within it', () => {
  const data = normalized([
    session('a', 'idle', { displayName: 'E2E ▸ newer', lastActivityAt: '2026-07-19T20:20:00Z' }),
    session('b', 'idle', { displayName: 'E2E ▸ older', lastActivityAt: '2026-07-19T20:10:00Z' }),
  ]);
  const placements = allocateSessions(data.sessions);
  assert.equal(placements[0].locationLabel, 'Pit, E2E bay, position 1');
  assert.equal(placements[1].locationLabel, 'Pit, E2E bay, position 2');
});

test('a session with no session prefix lands in the Unassigned bay', () => {
  const [placement] = allocateSessions(normalized([session('bare', 'idle')]).sessions);
  assert.equal(placement.bayKey, null);
  assert.equal(placement.locationLabel, 'Pit, Unassigned bay, position 1');
});

test('bays sort case-insensitively and Unassigned comes last', () => {
  const data = normalized([
    session('w', 'idle', { displayName: 'Workflow ▸ w' }),
    session('c', 'idle', { displayName: 'canary ▸ c' }),
    session('e', 'idle', { displayName: 'E2E ▸ e' }),
    session('bare', 'idle'),
    session('d', 'idle', { displayName: 'dotfiles ▸ d' }),
  ]);
  const bays = allocatePitBays(data.sessions);
  assert.deepEqual(bays.map((bay) => bay.key), ['canary', 'dotfiles', 'E2E', 'Workflow', null]);
  assert.deepEqual(bays.at(-1).label, UNASSIGNED_BAY_LABEL);
});

test('an all-on-track session still gets a bay so it can render Clear', () => {
  const data = normalized([
    session('running', 'active', { displayName: 'E2E ▸ busy', progress: 0.5 }),
    session('parked', 'idle', { displayName: 'canary ▸ waiting' }),
  ]);
  assert.deepEqual(allocatePitBays(data.sessions).map((bay) => bay.key), ['canary', 'E2E']);
});

test('Unassigned appears only when it holds a placed car', () => {
  const data = normalized([session('bare', 'active', { progress: 0 })]);
  assert.deepEqual(allocatePitBays(data.sessions), []);
});

test('bay assignment and roster ignore input order', () => {
  const sessions = normalized([
    session('a', 'idle', { displayName: 'E2E ▸ a', lastActivityAt: '2026-07-19T20:20:00Z' }),
    session('b', 'idle', { displayName: 'canary ▸ b', lastActivityAt: '2026-07-19T20:15:00Z' }),
    session('c', 'idle', { displayName: 'E2E ▸ c', lastActivityAt: '2026-07-19T20:10:00Z' }),
  ]).sessions;
  const digest = (items) => Object.fromEntries(
    allocateSessions(items).map((item) => [item.id, `${item.bayKey}:${item.bayRank}`]),
  );
  const reversed = [...sessions].reverse();
  assert.deepEqual(digest(reversed), digest(sessions));
  assert.deepEqual(
    allocatePitBays(reversed).map((bay) => bay.key),
    allocatePitBays(sessions).map((bay) => bay.key),
  );
});

test('capacity stays global: the oldest pit car overflows regardless of bay', () => {
  const sessions = Array.from({ length: PIT_CAPACITY + 1 }, (_, index) => session(
    `p${String(index).padStart(2, '0')}`,
    'idle',
    {
      displayName: `${index % 2 === 0 ? 'E2E' : 'canary'} ▸ w${index}`,
      // index 0 is newest, each later one a minute older, so the last one overflows.
      lastActivityAt: `2026-07-19T20:${String(40 - index).padStart(2, '0')}:00Z`,
    },
  ));
  const overflowed = allocateSessions(normalized(sessions).sessions).filter((item) => item.overflow);
  assert.deepEqual(overflowed.map((item) => item.id), [`p${PIT_CAPACITY}`]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL. The first failures are `SyntaxError`/import errors for `allocatePitBays` and `UNASSIGNED_BAY_LABEL` not being exported from `track-layout.mjs`.

- [ ] **Step 3: Implement in `src/track-layout.mjs`**

Change the import on line 1 to pull in `parseWorkRef`:

```js
import { STATE_PRESENTATION, parseWorkRef } from './session-contract.mjs';
```

Add below `export const PIT_CAPACITY = 18;` (line 23):

```js
export const UNASSIGNED_BAY_LABEL = 'Unassigned';

// The tmux session a window belongs to, parsed off the `<session> ▸ <window>` display
// name. null means the name carried no prefix (fixtures, imported snapshots).
const bayKeyOf = (session) => parseWorkRef(session.displayName).sessionName;
```

Replace `pitPlacement` (lines 35-41) with:

```js
function pitPlacement(session, slotIndex, bayKey, bayRank) {
  return Object.freeze({
    id: session.id, mapCode: session.mapCode, pool: 'pit', poolLabel: 'Pit',
    locationLabel: `Pit, ${bayKey ?? UNASSIGNED_BAY_LABEL} bay, position ${bayRank + 1}`,
    x: null, y: null, angle: null, slotIndex, bayKey, bayRank, overflow: false,
  });
}
```

Replace the `orderedPit.forEach(...)` block (lines 78-82) with:

```js
  // Global recency restricted to one bay's members is that bay's recency order, so a
  // single pass assigns the global slotIndex and the per-bay bayRank together.
  const bayFill = new Map();
  orderedPit.forEach((session, rank) => {
    if (rank >= PIT_CAPACITY) {
      byId.set(session.id, overflowPlacement(session, 'pit', 'Pit'));
      return;
    }
    const bayKey = bayKeyOf(session);
    const bayRank = bayFill.get(bayKey) ?? 0;
    bayFill.set(bayKey, bayRank + 1);
    byId.set(session.id, pitPlacement(session, rank, bayKey, bayRank));
  });
```

Append at the end of the file:

```js
// Ordered pit bays. Separate from allocateSessions because that function's frozen
// flat-array return is indexed positionally across the suite. Re-runs allocation so
// the Unassigned rule reads real placements rather than a second capacity guess.
export function allocatePitBays(sessions, track = RIDGE_PASS) {
  const placed = allocateSessions(sessions, track);
  const hasUnassignedCar = placed.some((item) => (
    item.pool === 'pit' && !item.overflow && item.bayKey === null
  ));
  // Named bays come from every session, route included, so a session whose windows are
  // all on-track still gets a bay to render Clear in.
  const named = new Set();
  for (const session of sessions) {
    const key = bayKeyOf(session);
    if (key !== null) named.add(key);
  }
  const bays = [...named]
    .sort((left, right) => left.localeCompare(right))
    .map((key) => ({ key, label: key }));
  // Unassigned is not a real tmux session, so it earns a bay only by holding a car.
  if (hasUnassignedCar) bays.push({ key: null, label: UNASSIGNED_BAY_LABEL });
  return Object.freeze(bays.map((bay) => Object.freeze(bay)));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify`
Expected: PASS. Note `tests/dashboard.test.mjs` has an existing assertion at line 451 (`assert.equal(PIT_CAPACITY, 18)`) and the 24-session fixture distribution test near line 555 - both must still pass, since neither status counts nor global slotIndex changed.

- [ ] **Step 5: Commit**

```bash
git add src/track-layout.mjs tests/dashboard.test.mjs
git commit -m "feat(dashboard): allocate pit cars into per-session bays

Pit placements gain bayKey and bayRank; a new allocatePitBays supplies the
ordered roster. slotIndex keeps driving global capacity and overflow, so the
18-slot oldest-overflows contract is unchanged.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Renderer builds bays on first render

**Files:**
- Modify: `dashboard/src/render-dashboard.mjs:542-563` (the pit append block), plus two new module-scope helpers
- Modify: `dashboard/index.html:252`
- Modify: `dashboard/tests/dashboard.test.mjs:182` (source-text assertion that names the old append)
- Test: `dashboard/tests/renderer-lifecycle.test.mjs`

**Interfaces:**
- Consumes: `allocatePitBays` from Task 1; `placement.bayKey` and `placement.bayRank` from Task 1.
- Produces:
  - `syncPitBays(documentRef, pitMount, roster, bays) -> void`, where `bays` is a `Map<string, { section, mount, count }>` keyed by `bayKey ?? ''`. Mutates `bays` in place.
  - `appendPitCars(entries, bays) -> void`, where `entries` is `Array<{ wrapper, placement }>`.
  - DOM contract: `#pit.pit-bays > section.pit-bay[data-bay-key] > (h3.pit-bay-name > span.pit-bay-label + span.pit-bay-count) + div.pit-bay-mount > .pit-vehicle`
  - Task 3 reuses both helpers verbatim in `update()`.

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/tests/renderer-lifecycle.test.mjs`, using its existing `routeSnapshot`, `routeSession`, `pitSession`, and `findCar` helpers (lines 44-79).

Also add this shared helper next to `findCar` (Task 3 uses it too):

```js
// Pit cars now live in per-session bay mounts, so read them bay by bay in DOM order.
const pitIds = (root) => root.querySelectorAll('.pit-bay-mount')
  .flatMap((mount) => mount.children.map((el) => el.dataset.sessionId));

const bayLabels = (root) => root.querySelectorAll('.pit-bay-label')
  .map((el) => el.textContent);
```

```js
test('the pit renders one bay per tmux session, alphabetically, Unassigned last', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    pitSession('w', 'idle', { displayName: 'Workflow ▸ w' }),
    pitSession('c', 'idle', { displayName: 'canary ▸ c' }),
    pitSession('bare', 'idle', { displayName: 'no prefix' }),
    pitSession('e', 'idle', { displayName: 'E2E ▸ e' }),
  ]), root, getTrack('ridge-pass'));
  assert.deepEqual(bayLabels(root), ['canary', 'E2E', 'Workflow', 'Unassigned']);
});

test('a session whose windows are all on-track gets an empty bay', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('busy', { displayName: 'dotfiles ▸ busy' }),
    pitSession('parked', 'idle', { displayName: 'canary ▸ parked' }),
  ]), root, getTrack('ridge-pass'));
  assert.deepEqual(bayLabels(root), ['canary', 'dotfiles']);
  const bays = root.querySelectorAll('.pit-bay');
  const dotfiles = bays.find((bay) => bay.dataset.bayKey === 'dotfiles');
  assert.equal(dotfiles.querySelector('.pit-bay-mount').children.length, 0);
  assert.equal(dotfiles.querySelector('.pit-bay-count').textContent, '0');
});

test('cars sit in their own bay, newest-first within it', () => {
  const { root } = dashboardRoot();
  const t = (m) => `2026-07-26T16:${String(m).padStart(2, '0')}:00Z`;
  renderDashboard(routeSnapshot([
    pitSession('e-old', 'idle', { displayName: 'E2E ▸ old', lastActivityAt: t(10) }),
    pitSession('c-mid', 'idle', { displayName: 'canary ▸ mid', lastActivityAt: t(20) }),
    pitSession('e-new', 'idle', { displayName: 'E2E ▸ new', lastActivityAt: t(30) }),
  ]), root, getTrack('ridge-pass'));
  // canary bay first (alphabetical), then E2E newest-first inside its own bay.
  assert.deepEqual(pitIds(root), ['c-mid', 'e-new', 'e-old']);
});

test('each bay header carries its own parked count', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    pitSession('a', 'idle', { displayName: 'E2E ▸ a' }),
    pitSession('b', 'error', { displayName: 'E2E ▸ b' }),
    pitSession('c', 'idle', { displayName: 'canary ▸ c' }),
  ]), root, getTrack('ridge-pass'));
  assert.deepEqual(
    root.querySelectorAll('.pit-bay-count').map((el) => el.textContent),
    ['1', '2'],
  );
});

test('a pit car aria-label names its bay and its position inside it', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    pitSession('only', 'idle', { displayName: 'E2E ▸ only' }),
  ]), root, getTrack('ridge-pass'));
  assert.match(findCar(root, 'only').getAttribute('aria-label'), /Pit, E2E bay, position 1/);
});
```

Then fix the three existing tests that read `#pit`'s children directly, which are now bay sections rather than cars:

- Line 630 and line 649: replace `const idsAt = () => root.querySelector('#pit').children.map((el) => el.dataset.sessionId);` with `const idsAt = () => pitIds(root);`
- Line 656: replace `root.querySelector('#pit').children.filter((el) => el.dataset.pinned === 'true')` with `root.querySelectorAll('.pit-vehicle').filter((el) => el.dataset.pinned === 'true')`

Their fixtures use unprefixed display names, so all their cars land in the single Unassigned bay and the assertions keep their original meaning.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/renderer-lifecycle.test.mjs`
Expected: FAIL. The new tests fail because `.pit-bay` does not exist yet, so `bayLabels(root)` returns `[]` and `pitIds(root)` returns `[]`.

- [ ] **Step 3: Implement**

In `dashboard/index.html`, change line 252 from:

```html
          <div id="pit" class="pit-mount" aria-label="Parked sessions, newest first"></div>
```

to:

```html
          <div id="pit" class="pit-bays" aria-label="Parked sessions grouped by tmux session"></div>
```

In `dashboard/src/render-dashboard.mjs`, update the import on line 2:

```js
import { allocatePitBays, allocateSessions } from './track-layout.mjs';
```

Add these two module-scope helpers just above `export function renderDashboard` (before line 403):

```js
// Reconciles bay elements against the roster. Bays are reused and reordered with
// append() (a move) rather than rebuilt, because rebuilding one would destroy a pinned
// descendant car's focus and data-pinned, and dom-fake has no insertBefore.
function syncPitBays(documentRef, pitMount, roster, bays) {
  const live = new Set();
  for (const bay of roster) {
    const id = bay.key ?? '';
    live.add(id);
    let entry = bays.get(id);
    if (!entry) {
      const section = element(documentRef, 'section', 'pit-bay');
      section.dataset.bayKey = id;
      section.setAttribute('aria-label', `${bay.label} bay`);
      const heading = element(documentRef, 'h3', 'pit-bay-name');
      const count = element(documentRef, 'span', 'pit-bay-count', '0');
      heading.append(element(documentRef, 'span', 'pit-bay-label', bay.label), count);
      const mount = element(documentRef, 'div', 'pit-bay-mount');
      section.append(heading, mount);
      entry = { section, mount, count };
      bays.set(id, entry);
    }
    pitMount.append(entry.section);
  }
  for (const [id, entry] of [...bays]) {
    if (live.has(id)) continue;
    entry.section.remove();
    bays.delete(id);
  }
}

// Appends every pit car into its bay's mount in bayRank order. Runs on first render and
// on every update(), so a car whose tmux session was renamed changes bays for free.
function appendPitCars(entries, bays) {
  const byBay = new Map();
  for (const entry of entries) {
    const id = entry.placement.bayKey ?? '';
    if (!byBay.has(id)) byBay.set(id, []);
    byBay.get(id).push(entry);
  }
  for (const [id, bay] of bays) {
    const items = (byBay.get(id) ?? [])
      .sort((left, right) => left.placement.bayRank - right.placement.bayRank);
    for (const item of items) bay.mount.append(item.wrapper);
    bay.count.textContent = String(items.length);
  }
}
```

Inside `renderDashboard`, declare the bay map alongside the other per-render maps (next to `const overflows = new Map();` at line 483):

```js
  const bays = new Map();
```

Replace lines 542-563 (the `pitEntries` loop's tail and the sort/append) so entries carry the whole placement and bays are built before cars land:

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
    else pitEntries.push({ wrapper: car.wrapper, placement });
  }
  syncPitBays(documentRef, pitMount, allocatePitBays(snapshot.sessions, track), bays);
  appendPitCars(pitEntries, bays);
```

Finally update the source-text assertion in `dashboard/tests/dashboard.test.mjs:182` from:

```js
  assert.match(RENDERER, /pitMount\.append\(entry\.wrapper\)/);
```

to:

```js
  assert.match(RENDERER, /bay\.mount\.append\(item\.wrapper\)/);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify`
Expected: PASS, including the amended `dashboard.test.mjs` structural test.

- [ ] **Step 5: Commit**

```bash
git add src/render-dashboard.mjs index.html tests/renderer-lifecycle.test.mjs tests/dashboard.test.mjs
git commit -m "feat(dashboard): render the pit as one bay per tmux session

Bays come from allocatePitBays and are reused across renders; cars append
into their bay's mount in bayRank order. A session with every window
on-track still gets a bay so it can read Clear.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Bays survive the live update path

**Files:**
- Modify: `dashboard/src/render-dashboard.mjs:668-676` (new-car branch) and `:687-700` (pit re-append)
- Test: `dashboard/tests/renderer-lifecycle.test.mjs`

**Interfaces:**
- Consumes: `syncPitBays` and `appendPitCars` from Task 2, unchanged.
- Produces: no new exports. `update()` reconciles the bay roster every tick.

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/tests/renderer-lifecycle.test.mjs`:

```js
test('update() adds a bay when a new tmux session appears and drops it when it goes', () => {
  const { root } = dashboardRoot();
  const build = (sessions) => routeSnapshot(sessions);
  const view = renderDashboard(build([
    pitSession('c', 'idle', { displayName: 'canary ▸ c' }),
  ]), root, getTrack('ridge-pass'));
  assert.deepEqual(bayLabels(root), ['canary']);

  view.update(build([
    pitSession('c', 'idle', { displayName: 'canary ▸ c' }),
    pitSession('e', 'idle', { displayName: 'E2E ▸ e' }),
  ]));
  assert.deepEqual(bayLabels(root), ['canary', 'E2E']);

  view.update(build([pitSession('e', 'idle', { displayName: 'E2E ▸ e' })]));
  assert.deepEqual(bayLabels(root), ['E2E']);
  assert.deepEqual(pitIds(root), ['e']);
});

test('update() keeps a pinned pit car pinned and focused across a bay roster change', () => {
  const { root, documentRef } = dashboardRoot();
  const build = (sessions) => routeSnapshot(sessions);
  const view = renderDashboard(build([
    pitSession('keep', 'idle', { displayName: 'E2E ▸ keep' }),
  ]), root, getTrack('ridge-pass'));
  const button = findCar(root, 'keep');
  button.focus();
  button.dispatchEvent(keydown(' '));
  const wrapper = button.parentElement;
  assert.equal(wrapper.dataset.pinned, 'true');

  // A brand new bay sorts BEFORE E2E, so the roster reorders around the pinned car.
  view.update(build([
    pitSession('keep', 'idle', { displayName: 'E2E ▸ keep' }),
    pitSession('fresh', 'idle', { displayName: 'canary ▸ fresh' }),
  ]));
  assert.deepEqual(bayLabels(root), ['canary', 'E2E']);
  assert.equal(findCar(root, 'keep'), button, 'the pinned car element was not recreated');
  assert.equal(button.parentElement.dataset.pinned, 'true');
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(documentRef.activeElement, button, 'focus survived the bay reorder');
});

test('update() moves a car to a new bay when its tmux session is renamed', () => {
  const { root } = dashboardRoot();
  const view = renderDashboard(routeSnapshot([
    pitSession('moved', 'idle', { displayName: 'canary ▸ work' }),
  ]), root, getTrack('ridge-pass'));
  assert.deepEqual(bayLabels(root), ['canary']);

  view.update(routeSnapshot([
    pitSession('moved', 'idle', { displayName: 'E2E ▸ work' }),
  ]));
  assert.deepEqual(bayLabels(root), ['E2E']);
  const bay = root.querySelectorAll('.pit-bay').find((item) => item.dataset.bayKey === 'E2E');
  assert.deepEqual(
    bay.querySelector('.pit-bay-mount').children.map((el) => el.dataset.sessionId),
    ['moved'],
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/renderer-lifecycle.test.mjs`
Expected: FAIL. `update()` still appends into `pitMount` directly, so no second bay is created and `bayLabels(root)` stays `['canary']`.

- [ ] **Step 3: Implement**

In `update()`, the new-car branch currently appends pit cars straight into `pitMount` (line 671). A pit car must instead be left parentless until `appendPitCars` places it. Change lines 668-676 from:

```js
        } else {
          const car = makeCar(documentRef, session, placement, text, target);
          if (target === 'route') vehicleLayer.append(car.wrapper);
          else pitMount.append(car.wrapper);
```

to:

```js
        } else {
          const car = makeCar(documentRef, session, placement, text, target);
          // Pit cars are parented by appendPitCars below, once their bay exists.
          if (target === 'route') vehicleLayer.append(car.wrapper);
```

Then replace the pit re-append block (lines 687-700) with:

```js
      // Re-append every pit car into its bay each tick: that single pass fixes ordering,
      // absorbs bay renames, and moves cars into bays created this tick. append() MOVES
      // an existing node, so element identity, listeners, and pinned state survive.
      const pitEntries = [];
      for (const [id, wrapper] of carsById) {
        const placement = nextPlacementsById.get(id);
        if (placement && !placement.overflow && placement.pool === 'pit') {
          pitEntries.push({ wrapper, placement });
        }
      }
      syncPitBays(documentRef, pitMount, allocatePitBays(nextSnapshot.sessions, track), bays);
      appendPitCars(pitEntries, bays);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run verify`
Expected: PASS. The pre-existing `update() re-sorts the pit so a freshly active session moves to the front` test (line 617) must still pass via the `pitIds` helper wired up in Task 2.

- [ ] **Step 5: Commit**

```bash
git add src/render-dashboard.mjs tests/renderer-lifecycle.test.mjs
git commit -m "feat(dashboard): reconcile pit bays across the live refresh

update() rebuilds the roster each tick and re-appends every pit car into
its bay, which also absorbs tmux session renames. Bay elements are reused
so a pinned car keeps its element, pin, and focus.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Fixtures carry session prefixes

**Files:**
- Modify: `dashboard/src/fixture-sessions.mjs`

**Interfaces:**
- Consumes: nothing new.
- Produces: the fixture bay roster `['canary', 'dotfiles', 'e2e', 'Unassigned']` with pit counts `canary: 5, dotfiles: 0, e2e: 5, Unassigned: 2`. Task 6's browser assertions depend on these exact values.

Without this, every fixture `sessionName` is `null`, the whole fixture pit collapses into one Unassigned bay, and the browser suite cannot see the feature at all. Statuses, ids, timestamps, and progress values do NOT change, so the existing 24-session distribution test keeps passing.

- [ ] **Step 1: Apply the prefixes**

Edit `dashboard/src/fixture-sessions.mjs`, prefixing only `displayName`. `dotfiles` gets route sessions only, so its bay renders Clear. `idle-rowan` and `done-willow` stay bare to populate Unassigned.

| id | new `displayName` |
|---|---|
| `route-aoba` | `e2e ▸ Aoba` |
| `route-bracken` | `e2e ▸ BB-228 PR#42 route tooltip` |
| `route-cinder` | `canary ▸ BB-305 combined pit` |
| `route-driftwood` | `canary ▸ PR#57 live adapter` |
| `route-ember` | `dotfiles ▸ verifying BB-511 output · pane 2` |
| `route-fir` | `dotfiles ▸ Fir` |
| `think-gale` | `e2e ▸ Gale` |
| `think-hemlock` | `e2e ▸ Hemlock` |
| `think-iris` | `canary ▸ Iris` |
| `think-juniper` | `canary ▸ Juniper` |
| `think-kestrel` | `dotfiles ▸ Kestrel` |
| `think-larch` | `dotfiles ▸ Larch` |
| `wait-maple` | `e2e ▸ Maple` |
| `wait-nightjar` | `e2e ▸ Nightjar` |
| `wait-orchid` | `canary ▸ Orchid` |
| `idle-pine` | `e2e ▸ BB-410 PR#63 fixture pass` |
| `idle-quartz` | `canary ▸ BB-325` |
| `idle-rowan` | unchanged (stays bare) |
| `error-sable` | `e2e ▸ Sable` |
| `error-thrush` | `canary ▸ Thrush` |
| `error-umber` | `e2e ▸ Relay` |
| `done-violet` | `canary ▸ Relay` |
| `done-willow` | unchanged (stays bare) |
| `done-yarrow` | `canary ▸ Yarrow` |

- [ ] **Step 2: Check for tests that hardcode a fixture display name**

Run: `grep -rn "Aoba\|Nightjar\|BB-410\|BB-325\|Yarrow\|combined pit" tests/ | grep -v node_modules`
Expected: the `parseWorkRef` unit tests near `tests/dashboard.test.mjs:237-300` use their own literal strings and are unaffected. `tests/browser/full-bleed-layout.spec.mjs:227-253` matches on badge text (`PR#63`), which survives because `parseWorkRef` scopes ticket and PR matching to the window segment after `▸`. Fix any assertion that matches a full fixture display name to expect the prefixed form.

- [ ] **Step 3: Run the suite**

Run: `npm run verify`
Expected: PASS. Confirm the 24-session distribution test near `tests/dashboard.test.mjs:555` still passes - statuses are untouched.

- [ ] **Step 4: Commit**

```bash
git add src/fixture-sessions.mjs
git commit -m "test(dashboard): give fixture sessions tmux session prefixes

Every fixture display name was bare, so the whole fixture pit collapsed
into one Unassigned bay and the bays were invisible in dev and in the
browser suite. dotfiles is route-only so its bay exercises Clear; two rows
stay bare to exercise Unassigned.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Bay layout, lane height cap, and docked tooltips

**Files:**
- Modify: `dashboard/styles.css` (`.pit-lane` at 901, the pit tooltip block at 998-1012, `.pit-mount` at 979-994, the mobile block near 1321-1350)
- Modify: `dashboard/tests/dashboard.test.mjs:1137`, `:1314`, `:1315` (text assertions naming `.pit-mount`)

**Interfaces:**
- Consumes: the class names Task 2 produced (`.pit-bays`, `.pit-bay`, `.pit-bay-name`, `.pit-bay-label`, `.pit-bay-count`, `.pit-bay-mount`).
- Produces: `.pit-lane` capped at `min(32vh, 16rem)` with `overflow: hidden auto`; pit tooltips `position: fixed` at all widths. Task 6 asserts both.

- [ ] **Step 1: Update the three text assertions to name the new class**

In `dashboard/tests/dashboard.test.mjs`, change line 1137 from `\.pit-mount\s*\{` to `\.pit-bay-mount\s*\{`, and lines 1314-1315 from `\.pit-mount \{` to `\.pit-bay-mount \{`. Run `npm run test:unit` and expect these three to FAIL, since `.pit-bay-mount` does not exist in the CSS yet.

- [ ] **Step 2: Replace `.pit-mount` with the bay row and bay mount**

In `dashboard/styles.css`, replace the `.pit-mount` and `.pit-mount:empty::after` rules (lines 979-994) with:

```css
#pit {
  display: flex;
  flex-wrap: wrap;
  align-items: start;
  gap: .75rem;
}

.pit-bay {
  display: flex;
  flex: 0 1 auto;
  flex-direction: column;
  gap: .3rem;
  /* two 52px car columns plus the grid gap, so a one-car bay is not a sliver */
  min-width: 116px;
  padding: .35rem .45rem;
  border: 1px solid var(--color-boundary);
  border-radius: .5rem;
}

.pit-bay-name {
  display: flex;
  align-items: baseline;
  gap: .3rem;
  margin: 0;
  color: var(--color-text-muted);
  font-size: .64rem;
  font-weight: 700;
}

/* Truncate rather than wrap: one long tmux session name must not stretch the row. */
.pit-bay-label {
  overflow: hidden;
  max-width: 12ch;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pit-bay-count {
  flex: none;
  padding: 0 .25rem;
  border-radius: .25rem;
  background: var(--color-idle-bg);
  color: var(--color-idle-ink);
  font-variant-numeric: tabular-nums;
}

.pit-bay-mount {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  grid-auto-rows: 52px;
  justify-items: center;
  gap: 1.15rem .55rem;
  padding-bottom: 16px;
  min-height: 52px;
}

.pit-bay-mount:empty::after {
  content: "Clear";
  grid-column: 1 / -1;
  align-self: center;
  color: var(--color-text-muted);
  font-size: .7rem;
  text-align: center;
}
```

- [ ] **Step 3: Cap the lane so it can never eat the stage**

Replace the `.pit-lane` rule (lines 901-908) with:

```css
.pit-lane {
  display: grid;
  gap: 10px;
  padding: 8px 14px;
  min-width: 0;
  /* The lane is the `auto` row of .dashboard-root, so an uncapped pit shrinks the
     stage. Cap it and scroll inside instead; do not add a floor to that row's
     minmax(0, 1fr), which is what prevents vertical page overflow when short. */
  max-height: min(32vh, 16rem);
  overflow: hidden auto;
  overscroll-behavior: contain;
  border-top: 2px dashed var(--color-boundary);
}
```

- [ ] **Step 4: Dock pit tooltips with `position: fixed` at all widths**

Replace the pit tooltip block (lines 998-1012) with:

```css
/* The lane scrolls now, so an in-flow bubble opening upward past its top edge would
   be clipped. Fixed positioning leaves that overflow entirely and docks every pit
   tooltip to one rect above the lane. */
.pit-vehicle .session-tooltip {
  position: fixed;
  top: auto;
  bottom: calc(min(32vh, 16rem) + 14px);
  left: 1rem;
  right: auto;
  width: min(28rem, calc(100vw - 2rem));
  transform: none;
}

.pit-vehicle:hover .session-tooltip,
.pit-vehicle:focus-within .session-tooltip,
.pit-vehicle[data-pinned="true"] .session-tooltip {
  transform: none;
}

/* One shared rect means two visible tooltips would overlap, so once a car is pinned
   only the pinned one may show. */
.pit-lane:has(.pit-vehicle[data-pinned="true"]) .pit-vehicle:not([data-pinned="true"]) .session-tooltip {
  visibility: hidden;
}
```

The base show rule at lines 872-883 sets `transform: translate(calc(-50% + var(--tt-shift)), var(--tt-shift-y))` for every tooltip; the `transform: none` above wins on source order, which is why it must stay below line 883. No JS change is needed: `clampRouteTooltip` is bound to `vehicleLayer` and matches `.vehicle-anchor` only (`render-dashboard.mjs:428,468-471`), so pit tooltips never receive `--tt-shift`.

- [ ] **Step 5: Update the mobile block**

In the `@media (max-width: 760px)` block:
- Change `.pit-mount { grid-template-columns: repeat(auto-fill, 52px); }` (line 1321) to `.pit-bay-mount { grid-template-columns: repeat(auto-fill, 52px); }`
- Add `.pit-bay { flex: 1 1 100%; }` so bays stack full-width.
- Replace the mobile `.pit-vehicle .session-tooltip` rule (lines 1328-1336) with only what differs from the new global docking, and delete the now-duplicated `transform: none` rule at 1338-1342 and the `:has()` guard at 1347-1349 (both are global now):

```css
  /* Mobile docks to a full-width rect below the header instead of above the lane. */
  .pit-vehicle .session-tooltip {
    top: 4rem;
    bottom: auto;
    left: 1rem;
    right: 1rem;
    width: auto;
  }
```

- [ ] **Step 6: Verify**

Run: `npm run verify`
Expected: PASS, including the three amended `.pit-bay-mount` text assertions and the existing `styles.css` token checks near lines 687 and 714.

- [ ] **Step 7: Commit**

```bash
git add styles.css tests/dashboard.test.mjs
git commit -m "feat(dashboard): lay out pit bays and cap the lane height

Bays wrap in a flex row, each with its own car grid and Clear placeholder.
Capping the lane protects the stage, which forces pit tooltips onto the
position-fixed docking mobile already used; that docking and its
single-visible-tooltip guard are now global.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Browser suite

**Files:**
- Modify: `dashboard/tests/browser/full-bleed-layout.spec.mjs:43-56` and `:277-290`
- Modify: `dashboard/tests/BROWSER_VERIFICATION.md`

**Interfaces:**
- Consumes: the exact fixture roster from Task 4 (`canary`, `dotfiles`, `e2e`, `Unassigned` with pit counts 5, 0, 5, 2) and the CSS contract from Task 5.
- Produces: no exports.

- [ ] **Step 1: Rewrite the three assertions that encode the flat pit**

Replace the test at line 43 (`the pit is one region below the stage, ordered newest-first`) with:

```js
test('the pit divides into tmux-session bays, newest-first inside each', async ({ page }) => {
  await expect(page.locator('#pit-heading')).toHaveText('Pit');
  await expect(page.locator('#pit .pit-bay-label')).toHaveText([
    'canary', 'dotfiles', 'e2e', 'Unassigned',
  ]);
  await expect(page.locator('#pit .pit-bay-count')).toHaveText(['5', '0', '5', '2']);

  const lane = await page.locator('#pit-lane').boundingBox();
  const stage = await page.locator('#map-stage').boundingBox();
  expect(lane.y).toBeGreaterThan(stage.y);

  // Within each bay, DOM order must be descending lastActivityAt.
  const perBay = await page.locator('#pit .pit-bay-mount').evaluateAll((mounts) => mounts.map(
    (mount) => [...mount.querySelectorAll('.activity-time')]
      .map((el) => Date.parse(el.getAttribute('datetime'))),
  ));
  for (const times of perBay) {
    expect(times).toEqual([...times].sort((a, b) => b - a));
  }
});

test('an all-on-track session shows an empty bay rather than vanishing', async ({ page }) => {
  const dotfiles = page.locator('#pit .pit-bay', { has: page.locator('.pit-bay-label', { hasText: 'dotfiles' }) });
  await expect(dotfiles.locator('.pit-vehicle')).toHaveCount(0);
  await expect(dotfiles.locator('.pit-bay-mount')).toBeVisible();
});
```

Note: line 44's `await expect(page.locator('.pit-bay')).toHaveCount(0)` is deleted outright - `.pit-bay` is now the point.

At line 286, move the grid-columns check off `#pit` (now a flex row of bays) onto a bay mount:

```js
  const cols = await page.locator('#pit .pit-bay-mount').first()
    .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
```

- [ ] **Step 2: Add the coverage that proves the design**

```js
test('the lane stays capped and the page never scrolls vertically', async ({ page }) => {
  const cap = await page.locator('#pit-lane').evaluate((el) => {
    const limit = parseFloat(getComputedStyle(el).maxHeight);
    return { height: el.getBoundingClientRect().height, limit };
  });
  expect(cap.height).toBeLessThanOrEqual(cap.limit + 1);
  const overflows = await page.evaluate(() => (
    document.documentElement.scrollHeight > document.documentElement.clientHeight + 1
  ));
  expect(overflows).toBe(false);
});

test('a docked pit tooltip is fully in-viewport and unclipped by the scrolling lane', async ({ page }) => {
  const car = page.locator('#pit .pit-vehicle .session-car').first();
  await car.focus();
  const tooltip = page.locator('#pit .pit-vehicle').first().locator('.session-tooltip');
  await expect(tooltip).toBeVisible();
  const box = await tooltip.boundingBox();
  const viewport = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  // The lane's own top edge must not crop it: fixed positioning is what allows this.
  const laneTop = (await page.locator('#pit-lane').boundingBox()).y;
  expect(box.y).toBeLessThan(laneTop);
  await expect(tooltip).toHaveCSS('position', 'fixed');
});
```

- [ ] **Step 3: Run the browser suite**

Run: `npm run test:browser`
Expected: PASS across both the desktop and mobile projects. If the mobile project fails the tooltip test because mobile docks below the header rather than above the lane, scope the `expect(box.y).toBeLessThan(laneTop)` assertion to the desktop viewport width instead of loosening the in-viewport assertions.

- [ ] **Step 4: Update the verification doc**

`dashboard/tests/BROWSER_VERIFICATION.md` is already partly stale: it still describes the four status-keyed bays that the 2026-08-05 combined-pit change deleted. Do not read it as a description of current behavior. Update these specific lines to the session-bay model (bays per tmux session, alphabetical and stable, `Clear` when empty, `Unassigned` last, lane capped and internally scrolling, tooltips docked):

- line 502: references a `.pit-hold` fourth bay that no longer exists. Delete the claim.
- lines 543 and 547: "row of labeled bays" and "the Unclassified ..." - now correct in shape but wrong in cause; the labels are tmux sessions, not statuses.
- lines 622-623: claims the pit lane reflows to a 2x2 grid of bays and that `getComputedStyle('#pit-lane').gridTemplateColumns` reports it. `#pit-lane` is a grid but the bays live in `#pit`, which is a flex row. Rewrite against `#pit`.

- [ ] **Step 5: Commit**

```bash
git add tests/browser/full-bleed-layout.spec.mjs tests/BROWSER_VERIFICATION.md
git commit -m "test(dashboard): cover pit session bays in the browser suite

Rewrites the three assertions that encoded the flat pit and adds the two
that prove the design: the lane respects its cap without the page
scrolling, and a docked tooltip escapes the scrolling lane unclipped.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Verification

Final gates, from `dashboard/`:

```bash
npm run verify        # routes:check + check:syntax + test:unit
npm run test:browser  # desktop + mobile projects
```

Then look at it: serve the dashboard in fixtures mode and confirm four bays reading `canary 5`, `dotfiles 0` (showing `Clear`), `e2e 5`, `Unassigned 2`, with the stage unsqueezed and a pit tooltip opening above the lane without clipping.

## Known breakage inventory

Seven existing assertions encode the flat pit and are amended deliberately. Every one is accounted for above; if any other test fails, treat it as a real finding rather than noise.

| File | Line | What it asserts | Task |
|---|---|---|---|
| `tests/dashboard.test.mjs` | 182 | renderer source contains `pitMount.append(entry.wrapper)` | 2 |
| `tests/dashboard.test.mjs` | 1137 | `.pit-mount` mobile 52px columns | 5 |
| `tests/dashboard.test.mjs` | 1314-1315 | `.pit-mount` gap and padding-bottom | 5 |
| `tests/renderer-lifecycle.test.mjs` | 630, 649 | `#pit`'s children are cars | 2 |
| `tests/renderer-lifecycle.test.mjs` | 656 | `#pit`'s children carry `data-pinned` | 2 |
| `tests/browser/full-bleed-layout.spec.mjs` | 44 | `.pit-bay` count is 0 | 6 |
| `tests/browser/full-bleed-layout.spec.mjs` | 51 | `#pit` order globally descending | 6 |
| `tests/browser/full-bleed-layout.spec.mjs` | 286 | grid columns on `#pit` | 6 |

One more to watch, not amended: `full-bleed-layout.spec.mjs:284` asserts `stage.height > 500` on the 390x844 mobile project. The new lane cap resolves to 256px there (`16rem` beats `32vh`), leaving the stage roughly 528px - it should pass, but with under 30px of headroom. If it fails, lower the mobile cap inside the `@media (max-width: 760px)` block rather than weakening the assertion; the stage is deliberately the hero on mobile.

## Already verified during planning

The spec's first and riskiest assumption is resolved: **no ancestor of `.pit-vehicle` establishes a containing block**, so `position: fixed` will resolve against the viewport. Evidence - `contain: layout paint style` and `transform` at `styles.css:818-823` are on `.session-tooltip` itself, and `filter: brightness` at `styles.css:787` is on `.session-car`, a sibling of the tooltip rather than an ancestor. `.pit-vehicle` sets only `z-index` (`:719-722`); `.pit-lane`, `.pit`, `.dashboard-root`, `body`, and `html` set none of the five properties. Do not spend time re-deriving this, but if you add a `transform` or `filter` to any of those ancestors during implementation, decision 8 breaks and you must stop.
