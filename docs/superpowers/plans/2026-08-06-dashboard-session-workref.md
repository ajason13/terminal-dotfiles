# Session work-ref (Jira ticket / PR) display - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the Jira ticket and/or PR a session is working on - derived purely from the tmux-window-name `displayName` - as tooltip line(s) and a small always-visible on-map badge on both route and pit cars.

**Architecture:** A new pure `parseWorkRef(name)` in `session-contract.mjs` extracts `{ticketKey, prNumber, label}`. `buildAccessibleText` exposes the parsed ref as `text.workRef`, which the renderer consumes in three places: the tooltip's bold line (stripped `label`), dedicated `Jira:`/`PR #` tooltip lines, and a module-scope `applyBadge(...)` helper that creates/updates/removes a `.car-badge` element on the car's wrapper. CSS styles the badge and grows the pit grid's row gap to fit a below-car badge. No collector, snapshot-validation, live-server, git, or network change.

**Tech Stack:** ES modules, Node's built-in `node:test`, Playwright (browser), plain CSS. No new dependencies.

## Global Constraints

Copied verbatim from the spec; every task's requirements include these:

- Do NOT change the collector, `TMUX_FIELDS`, snapshot import validation, or the live-server security model. Pure parse-and-render over existing `displayName` data.
- No git/branch reading, no GitHub/`gh` call, no true PR review-state. A present PR token means "open."
- No hyperlinking anywhere - all refs are plain text.
- No new npm dependencies. ES modules only. No em dashes (use plain `-`).
- Keep comment blocks to 1-2 lines; no issue-tracker IDs in code comments.
- Preserve accessibility: `role="tooltip"` + `aria-describedby`; the ticket/PR must be in the accessible text. The badge is redundant-visual with `aria-hidden="true"`.
- The badge must not break the car's 44px mobile hit target, pin/pause-on-hover, focus, or the pin (Enter/Space/Escape); it is decorative and `pointer-events: none`.
- Preserve the route-tooltip viewport clamp: it measures `tooltip.offsetHeight`/width on show; the extra line makes tooltips taller (re-measured automatically). Verify edge cars still do not clip on desktop (1440x900) and mobile (390x844).
- Naming convention (locked): Jira key `/[A-Z][A-Z0-9]+-\d+/` (e.g. `BB-228`); PR token `/\bPR\s*#?\s*(\d+)/i` (canonical `PR#42`).
- Display (locked): tooltip shows `Jira: BB-228` and/or `PR #42`; badge shows `PR#42` else `BB-228` else nothing. PR precedence over ticket for the single badge.
- Tests: unit `node --test dashboard/tests/*.test.mjs`; routes `npm --prefix dashboard run routes:check`; browser `npm --prefix dashboard run test:browser` - the browser suite runs ~3 min, so run it as ONE foreground Bash call with the `timeout` parameter set to 600000; never background it.

**Run commands from the `dashboard/` directory unless a path says otherwise.**

---

### Task 1: `parseWorkRef(name)` pure parser

**Files:**
- Modify: `dashboard/src/session-contract.mjs` (add + export `parseWorkRef`)
- Test: `dashboard/tests/dashboard.test.mjs` (new unit tests)

**Interfaces:**
- Produces: `export function parseWorkRef(name: string): { ticketKey: string|null, prNumber: number|null, label: string }`
  - `ticketKey`: first match of `/[A-Z][A-Z0-9]+-\d+/`, else `null`.
  - `prNumber`: captured group of first match of `/\bPR\s*#?\s*(\d+)/i` as a `Number`, else `null`.
  - `label`: `name` with the matched ticket and PR spans removed, whitespace collapsed to single spaces, trimmed; falls back to the original `name` (trimmed) if the strip result is empty.

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/tests/dashboard.test.mjs`. Import `parseWorkRef` by adding it to the existing `session-contract.mjs` import block (lines 8-17):

```js
// add parseWorkRef to the existing named import from '../src/session-contract.mjs'
```

Then add the tests (place near the other `session-contract` tests):

```js
test('parseWorkRef extracts a ticket-only name', () => {
  assert.deepEqual(parseWorkRef('BB-228 route tooltip'), {
    ticketKey: 'BB-228', prNumber: null, label: 'route tooltip',
  });
});

test('parseWorkRef extracts a PR-only name and leaves ticketKey null', () => {
  assert.deepEqual(parseWorkRef('PR#57 live adapter'), {
    ticketKey: null, prNumber: 57, label: 'live adapter',
  });
});

test('parseWorkRef extracts both a ticket and a PR', () => {
  assert.deepEqual(parseWorkRef('BB-228 PR#42 route tooltip'), {
    ticketKey: 'BB-228', prNumber: 42, label: 'route tooltip',
  });
});

test('parseWorkRef returns nulls and the full name when neither token is present', () => {
  assert.deepEqual(parseWorkRef('Aoba'), {
    ticketKey: null, prNumber: null, label: 'Aoba',
  });
});

test('parseWorkRef tolerates PR spacing variants', () => {
  assert.equal(parseWorkRef('feature PR 42').prNumber, 42);
  assert.equal(parseWorkRef('feature PR #42').prNumber, 42);
  assert.equal(parseWorkRef('feature pr42').prNumber, 42);
  assert.equal(parseWorkRef('feature PR#42').prNumber, 42);
});

test('parseWorkRef finds tokens mid-name and preserves the pane suffix in label', () => {
  assert.deepEqual(parseWorkRef('verifying BB-511 output · pane 2'), {
    ticketKey: 'BB-511', prNumber: null, label: 'verifying output · pane 2',
  });
});

test('parseWorkRef falls back to the full name when the name is only tokens', () => {
  assert.deepEqual(parseWorkRef('BB-228 PR#42'), {
    ticketKey: 'BB-228', prNumber: 42, label: 'BB-228 PR#42',
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: FAIL - `parseWorkRef is not a function` / `not exported`.

- [ ] **Step 3: Implement `parseWorkRef`**

Add to `dashboard/src/session-contract.mjs` (near the other exported helpers, e.g. after `isIsoTimestamp`):

```js
const TICKET_RE = /[A-Z][A-Z0-9]+-\d+/;
const PR_RE = /\bPR\s*#?\s*(\d+)/i;

// Parse the Jira key and/or PR number out of a session displayName (the tmux
// window name). Total: any string in, nulls + a tidied label out. PR and ticket
// are matched independently; a PR token cannot false-match the ticket regex
// (that shape needs a `-\d+`), so a bare PR yields ticketKey: null.
export function parseWorkRef(name) {
  const source = typeof name === 'string' ? name : '';
  const ticketMatch = source.match(TICKET_RE);
  const prMatch = source.match(PR_RE);
  const ticketKey = ticketMatch ? ticketMatch[0] : null;
  const prNumber = prMatch ? Number(prMatch[1]) : null;
  let label = source;
  if (ticketMatch) label = label.replace(TICKET_RE, ' ');
  if (prMatch) label = label.replace(PR_RE, ' ');
  label = label.replace(/\s+/g, ' ').trim();
  if (label === '') label = source.trim();
  return { ticketKey, prNumber, label };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: PASS (all new `parseWorkRef` tests green, existing tests still green).

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/session-contract.mjs dashboard/tests/dashboard.test.mjs
git commit -m "feat(dashboard): add pure parseWorkRef ticket/PR parser"
```

---

### Task 2: Expose `workRef` on `buildAccessibleText`

**Files:**
- Modify: `dashboard/src/session-contract.mjs` (`buildAccessibleText`)
- Test: `dashboard/tests/dashboard.test.mjs`

**Interfaces:**
- Consumes: `parseWorkRef` (Task 1).
- Produces: `buildAccessibleText(...)` return object gains a frozen `workRef: { ticketKey, prNumber, label }` (from `parseWorkRef(session.displayName)`). Existing fields (`label`, `details`, `location`, `activity`) are unchanged. The `details` string is intentionally NOT modified - the ref is rendered as dedicated tooltip lines (Task 3), and the tooltip is the `aria-describedby` target, so the ref is in the accessible description without duplicating it in `details`.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/tests/dashboard.test.mjs`:

```js
test('buildAccessibleText exposes the parsed work-ref for the renderer', () => {
  const data = normalized([session('ref', 'active', { displayName: 'BB-228 PR#42 route tooltip' })]);
  const placement = allocateSessions(data.sessions)[0];
  const text = buildAccessibleText(data.sessions[0], placement, data.generatedAt);
  assert.deepEqual(text.workRef, { ticketKey: 'BB-228', prNumber: 42, label: 'route tooltip' });
});

test('buildAccessibleText work-ref is null when the name has no tokens', () => {
  const data = normalized([session('plain', 'active', { displayName: 'Aoba' })]);
  const placement = allocateSessions(data.sessions)[0];
  const text = buildAccessibleText(data.sessions[0], placement, data.generatedAt);
  assert.deepEqual(text.workRef, { ticketKey: null, prNumber: null, label: 'Aoba' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: FAIL - `text.workRef` is `undefined`.

- [ ] **Step 3: Implement**

In `dashboard/src/session-contract.mjs`, inside `buildAccessibleText`, add the parse and include it in the frozen return. The final `return Object.freeze({...})` becomes:

```js
  const workRef = parseWorkRef(session.displayName);
  return Object.freeze({
    label: `${session.mapCode}, ${session.displayName}, ${state.label}, ${location}`,
    details: details.join('. '),
    location,
    activity,
    workRef: Object.freeze(workRef),
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/session-contract.mjs dashboard/tests/dashboard.test.mjs
git commit -m "feat(dashboard): expose parsed workRef on accessible text"
```

---

### Task 3: Tooltip renders stripped label + `Jira:`/`PR #` lines

**Files:**
- Modify: `dashboard/src/render-dashboard.mjs` (`makeTooltip`; `replaceTooltip` needs no change - it re-calls `makeTooltip`)
- Test: `dashboard/tests/renderer-lifecycle.test.mjs` (DOM render + live-update)

**Interfaces:**
- Consumes: `text.workRef` (Task 2), reached via the `text` argument already passed to `makeTooltip`.
- Produces: the tooltip's bold `<strong>` first child reads `${session.mapCode} · ${text.workRef.label}` (stripped label, not the raw name). Immediately after the state/location `<span>`, a `Jira: <ticketKey>` `<span>` and/or a `PR #<prNumber>` `<span>` is appended when present, before the `.tooltip-details` span.

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/tests/renderer-lifecycle.test.mjs` (it already imports `renderDashboard`, `dashboardRoot`, `getTrack`, `routeSnapshot`, `routeSession`, `findCar`). Add:

```js
test('tooltip shows the stripped bold label and Jira/PR lines for a route car', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('ref', { displayName: 'BB-228 PR#42 route tooltip' }),
  ]), root, getTrack('ridge-pass'));
  const wrapper = findCar(root, 'ref').parentElement;
  const tooltip = wrapper.querySelector('.session-tooltip');
  assert.match(tooltip.children[0].textContent, /^S\d+ · route tooltip$/);
  assert.match(tooltip.textContent, /Jira: BB-228/);
  assert.match(tooltip.textContent, /PR #42/);
});

test('tooltip omits ref lines when the name has no tokens', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('plain', { displayName: 'Aoba' }),
  ]), root, getTrack('ridge-pass'));
  const tooltip = findCar(root, 'plain').parentElement.querySelector('.session-tooltip');
  assert.match(tooltip.children[0].textContent, /^S\d+ · Aoba$/);
  assert.doesNotMatch(tooltip.textContent, /Jira:|PR #/);
});

test('replaceTooltip renders new ref lines on a live update()', () => {
  const { root } = dashboardRoot();
  const controller = renderDashboard(routeSnapshot([
    routeSession('ref', { displayName: 'Aoba' }),
  ]), root, getTrack('ridge-pass'));
  controller.update(routeSnapshot([
    routeSession('ref', { displayName: 'BB-305 PR#9 renamed' }),
  ], '2026-07-26T17:00:05Z'));
  const tooltip = findCar(root, 'ref').parentElement.querySelector('.session-tooltip');
  assert.match(tooltip.textContent, /Jira: BB-305/);
  assert.match(tooltip.textContent, /PR #9/);
  controller.destroy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test dashboard/tests/renderer-lifecycle.test.mjs`
Expected: FAIL - bold line still shows the raw name; no `Jira:`/`PR #` lines.

- [ ] **Step 3: Implement**

In `dashboard/src/render-dashboard.mjs`, change `makeTooltip` (currently lines ~74-89). Replace the `tooltip.append(strong, span)` block and add the ref lines:

```js
function makeTooltip(documentRef, session, presentation, text, tooltipId) {
  const tooltip = element(documentRef, 'span', 'session-tooltip');
  tooltip.id = tooltipId;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.append(
    element(documentRef, 'strong', '', `${session.mapCode} · ${text.workRef.label}`),
    element(documentRef, 'span', '', `${presentation.label} · ${text.location}`),
  );
  if (text.workRef.ticketKey) {
    tooltip.append(element(documentRef, 'span', '', `Jira: ${text.workRef.ticketKey}`));
  }
  if (text.workRef.prNumber !== null) {
    tooltip.append(element(documentRef, 'span', '', `PR #${text.workRef.prNumber}`));
  }
  const details = element(documentRef, 'span', 'tooltip-details');
  const nonActivity = text.details.split(`. ${text.activity.label}:`)[0];
  if (nonActivity && nonActivity !== text.details) details.append(`${nonActivity}. `);
  appendActivity(documentRef, details, text.activity);
  if (session.errorSummary) details.append(`. Error: ${session.errorSummary}`);
  tooltip.append(details);
  return tooltip;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test dashboard/tests/renderer-lifecycle.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run the full unit suite (guard the RENDERER-source regex tests)**

Run: `node --test dashboard/tests/*.test.mjs`
Expected: PASS. (No RENDERER-source regex covers the changed `makeTooltip` lines; if one trips, reconcile it to the new literal.)

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/render-dashboard.mjs dashboard/tests/renderer-lifecycle.test.mjs
git commit -m "feat(dashboard): render work-ref in the car tooltip"
```

---

### Task 4: On-map badge on route and pit cars (`applyBadge`)

**Files:**
- Modify: `dashboard/src/render-dashboard.mjs` (`badgeLabel` + `applyBadge` module helpers; wire into `makeCar`, `applyRouteCar`, and the pit branch of `update()`)
- Test: `dashboard/tests/renderer-lifecycle.test.mjs`

**Interfaces:**
- Consumes: `text.workRef` (Task 2), `element(...)` (existing module helper).
- Produces:
  - `function badgeLabel(workRef): string|null` - `PR#<n>` if `prNumber !== null`, else `ticketKey`, else `null`.
  - `function applyBadge(documentRef, wrapper, workRef): void` - idempotent: creates a `<span class="car-badge" aria-hidden="true">` child of `wrapper` when a label exists, updates its `textContent`, or removes it when no ref. Safe to call on create and on every live update.
- The badge is a direct child of the wrapper (`.vehicle-anchor` for route, `.pit-vehicle` for pit), appended AFTER the existing `wrapper.append(atmosphere, button, makeTooltip(...))` call - do NOT alter that literal (a RENDERER-source regex asserts `wrapper.append(\s*atmosphere,\s*button,`).

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/tests/renderer-lifecycle.test.mjs`. Note: pit cars need a helper - add near the top-of-file helpers:

```js
const pitSession = (id, status, overrides = {}) => ({
  id,
  displayName: `Pit ${id}`,
  status,
  lastActivityAt: '2026-07-26T16:59:00Z',
  permissionState: status === 'waiting_for_permission' ? 'requested' : 'not_required',
  ...(status === 'error' ? { errorSummary: 'x' } : {}),
  ...overrides,
});
```

Then the tests:

```js
test('a route car with a PR shows a PR#-precedence badge, aria-hidden', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('ref', { displayName: 'BB-228 PR#42 route tooltip' }),
  ]), root, getTrack('ridge-pass'));
  const wrapper = findCar(root, 'ref').parentElement;
  const badge = wrapper.querySelector('.car-badge');
  assert.ok(badge, 'badge exists');
  assert.equal(badge.textContent, 'PR#42');
  assert.equal(badge.getAttribute('aria-hidden'), 'true');
});

test('a route car with only a ticket shows the ticket badge', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('t', { displayName: 'BB-305 combined pit' }),
  ]), root, getTrack('ridge-pass'));
  const badge = findCar(root, 't').parentElement.querySelector('.car-badge');
  assert.equal(badge.textContent, 'BB-305');
});

test('a car with no ref has no badge element', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('plain', { displayName: 'Aoba' }),
  ]), root, getTrack('ridge-pass'));
  assert.equal(findCar(root, 'plain').parentElement.querySelector('.car-badge'), null);
});

test('a pit car also gets a badge on its .pit-vehicle wrapper', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    pitSession('parked', 'idle', { displayName: 'BB-410 PR#63 fixture pass' }),
  ]), root, getTrack('ridge-pass'));
  const wrapper = findCar(root, 'parked').parentElement;
  assert.ok(wrapper.classList.contains('pit-vehicle'), 'session parked in the pit');
  assert.equal(wrapper.querySelector('.car-badge').textContent, 'PR#63');
});

test('update() adds a badge when a ref appears and removes it when it disappears', () => {
  const { root } = dashboardRoot();
  const controller = renderDashboard(routeSnapshot([
    routeSession('ref', { displayName: 'Aoba' }),
  ]), root, getTrack('ridge-pass'));
  assert.equal(findCar(root, 'ref').parentElement.querySelector('.car-badge'), null);

  controller.update(routeSnapshot([
    routeSession('ref', { displayName: 'BB-9 PR#1 named now' }),
  ], '2026-07-26T17:00:05Z'));
  assert.equal(findCar(root, 'ref').parentElement.querySelector('.car-badge').textContent, 'PR#1');

  controller.update(routeSnapshot([
    routeSession('ref', { displayName: 'name gone' }),
  ], '2026-07-26T17:00:10Z'));
  assert.equal(findCar(root, 'ref').parentElement.querySelector('.car-badge'), null);
  controller.destroy();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test dashboard/tests/renderer-lifecycle.test.mjs`
Expected: FAIL - no `.car-badge` element is rendered.

- [ ] **Step 3: Implement the helpers**

In `dashboard/src/render-dashboard.mjs`, add module-scope helpers (place just above `makeCar`):

```js
function badgeLabel(workRef) {
  if (workRef.prNumber !== null) return `PR#${workRef.prNumber}`;
  if (workRef.ticketKey) return workRef.ticketKey;
  return null;
}

// Idempotent badge lifecycle for both car types: create on first ref, update
// text, or remove when the ref is gone. Child of the wrapper (not the rotating
// car), so it stays upright; aria-hidden since the ref is already in the tooltip.
function applyBadge(documentRef, wrapper, workRef) {
  const label = badgeLabel(workRef);
  let badge = wrapper.querySelector('.car-badge');
  if (!label) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    badge = element(documentRef, 'span', 'car-badge');
    badge.setAttribute('aria-hidden', 'true');
    wrapper.append(badge);
  }
  badge.textContent = label;
}
```

- [ ] **Step 4: Wire `applyBadge` into `makeCar`**

In `makeCar`, immediately AFTER the existing `wrapper.append(atmosphere, button, makeTooltip(...))` statement (do not modify that statement), add:

```js
  applyBadge(documentRef, wrapper, text.workRef);
```

- [ ] **Step 5: Wire `applyBadge` into the two live-update paths**

In `applyRouteCar(...)`, after `replaceTooltip(documentRef, tooltip, session, text);` add:

```js
    applyBadge(documentRef, wrapper, text.workRef);
```

In `update()`, the pit branch (the `else` under `if (target === 'route')`, currently `button.setAttribute('aria-label', ...); replaceTooltip(...); swapStateClass(...);`) - add after `swapStateClass(existingWrapper, session.status);`:

```js
            applyBadge(documentRef, existingWrapper, text.workRef);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test dashboard/tests/renderer-lifecycle.test.mjs`
Expected: PASS.

- [ ] **Step 7: Run the full unit suite**

Run: `node --test dashboard/tests/*.test.mjs`
Expected: PASS (the `wrapper.append(atmosphere, button,` RENDERER regex at ~line 805 still matches since that statement is unchanged).

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/render-dashboard.mjs dashboard/tests/renderer-lifecycle.test.mjs
git commit -m "feat(dashboard): render an upright work-ref badge on route and pit cars"
```

---

### Task 5: Badge styling + pit grid room

**Files:**
- Modify: `dashboard/styles.css`
- Test: `dashboard/tests/dashboard.test.mjs` (CSS-regex assertions, matching the existing style-assertion pattern)

**Interfaces:**
- Consumes: the `.car-badge` element (Task 4), `.vehicle-anchor` / `.pit-vehicle` wrappers, existing color vars (`--color-text-muted`, `--color-surface-raised`, `--color-surface-night`), `.pit-mount` grid.
- Produces: a `.car-badge` rule (small, muted, upright, below the car, `pointer-events: none`, `z-index` below the tooltip's 20); fade-to-`opacity:0` rules on hover/focus/pin for both wrappers; a widened `.pit-mount` row gap plus bottom padding so a below-car badge clears the next row and the last row.

- [ ] **Step 1: Write the failing tests**

Add to `dashboard/tests/dashboard.test.mjs` (near the other `BASE_STYLES` assertions):

```js
test('car-badge is a small, muted, upright, non-interactive pill below the car', () => {
  assert.match(BASE_STYLES, /\.car-badge \{[^}]*position:\s*absolute;[^}]*pointer-events:\s*none;/s);
  assert.match(BASE_STYLES, /\.car-badge \{[^}]*top:\s*calc\(100% - 3px\);/s);
  assert.match(BASE_STYLES, /\.car-badge \{[^}]*transform:\s*translateX\(-50%\);/s);
  // below the tooltip's z-index: 20 so an open tooltip stacks over it
  const z = BASE_STYLES.match(/\.car-badge \{[^}]*z-index:\s*(\d+);/s);
  assert.ok(z && Number(z[1]) < 20, 'badge sits below the tooltip z-index');
});

test('car-badge fades out while its tooltip is open, for both car types', () => {
  assert.match(BASE_STYLES, /\.vehicle-anchor:hover \.car-badge[\s\S]*?opacity:\s*0/s);
  assert.match(BASE_STYLES, /\.pit-vehicle\[data-pinned="true"\] \.car-badge[\s\S]*?opacity:\s*0/s);
});

test('pit grid reserves row room so a below-car badge clears the next row', () => {
  assert.match(BASE_STYLES, /\.pit-mount \{[^}]*gap:\s*1\.15rem \.55rem;/s);
  assert.match(BASE_STYLES, /\.pit-mount \{[^}]*padding-bottom:\s*16px;/s);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: FAIL - `.car-badge` rule absent; `.pit-mount` still `gap: .45rem .55rem`.

- [ ] **Step 3: Implement the badge styles**

In `dashboard/styles.css`, add after the `.car-code { ... }` block (ends ~line 749):

```css
.car-badge {
  position: absolute;
  z-index: 4;
  top: calc(100% - 3px);
  left: 50%;
  max-width: 66px;
  padding: 1px 5px;
  overflow: hidden;
  border-radius: 999px;
  color: var(--color-text-muted);
  background: color-mix(in srgb, var(--color-surface-raised) 82%, transparent);
  font-size: .5rem;
  font-weight: 800;
  letter-spacing: -.01em;
  line-height: 1.35;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-shadow: 0 1px 2px var(--color-surface-night);
  transform: translateX(-50%);
  pointer-events: none;
  transition: opacity 120ms ease;
}

.vehicle-anchor:hover .car-badge,
.vehicle-anchor:focus-within .car-badge,
.vehicle-anchor[data-pinned="true"] .car-badge,
.pit-vehicle:hover .car-badge,
.pit-vehicle:focus-within .car-badge,
.pit-vehicle[data-pinned="true"] .car-badge {
  opacity: 0;
}
```

- [ ] **Step 4: Grow the pit grid room**

In `dashboard/styles.css`, in the `.pit-mount` rule (~line 1005), change the row gap and add bottom padding so a below-car badge clears the next grid row and the last row:

```css
.pit-mount {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  grid-auto-rows: 52px;
  justify-items: center;
  gap: 1.15rem .55rem;
  padding-bottom: 16px;
  min-height: 52px;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: PASS.

- [ ] **Step 6: Run the full unit + routes suites**

Run: `node --test dashboard/tests/*.test.mjs && npm --prefix dashboard run routes:check`
Expected: PASS; routes artifacts current.

- [ ] **Step 7: Commit**

```bash
git add dashboard/styles.css dashboard/tests/dashboard.test.mjs
git commit -m "feat(dashboard): style the work-ref badge and make pit grid room"
```

---

### Task 6: Convention-following fixtures

**Files:**
- Modify: `dashboard/src/fixture-sessions.mjs`
- Test: `dashboard/tests/dashboard.test.mjs` (a coverage assertion so all badge/tooltip states exist in fixtures)

**Interfaces:**
- Consumes: `parseWorkRef` (Task 1) in the test only.
- Produces: fixture `displayName`s covering ticket-only, PR+ticket, PR-only, a pane suffix, a pit-pool ref, and several with no ref. Do NOT rename `error-umber` or `done-violet` (both display `Relay`; leave them untouched). Route pool = `active`/`thinking`; pit pool = `waiting_for_permission`/`idle`/`error`/`complete`.

Assign these names:
- `route-bracken` -> `BB-228 PR#42 route tooltip` (route, ticket+PR -> badge `PR#42`)
- `route-cinder` -> `BB-305 combined pit` (route, ticket-only -> badge `BB-305`)
- `route-driftwood` -> `PR#57 live adapter` (route, PR-only -> badge `PR#57`)
- `route-ember` -> `verifying BB-511 output · pane 2` (route, ticket + pane suffix -> badge `BB-511`, label keeps ` · pane 2`)
- `idle-pine` -> `BB-410 PR#63 fixture pass` (pit, ticket+PR -> badge `PR#63`)
- All others keep their current names (no ref -> no badge).

- [ ] **Step 1: Write the failing test**

Add to `dashboard/tests/dashboard.test.mjs`:

```js
test('fixtures cover every badge/tooltip work-ref state', () => {
  const refs = FIXTURE_SNAPSHOT.sessions.map((s) => parseWorkRef(s.displayName));
  assert.ok(refs.some((r) => r.ticketKey && r.prNumber === null), 'a ticket-only fixture');
  assert.ok(refs.some((r) => r.ticketKey === null && r.prNumber !== null), 'a PR-only fixture');
  assert.ok(refs.some((r) => r.ticketKey && r.prNumber !== null), 'a ticket+PR fixture');
  assert.ok(refs.some((r) => r.ticketKey === null && r.prNumber === null), 'a no-ref fixture');
  const s = FIXTURE_SNAPSHOT.sessions;
  const pitRef = s.find((x) => x.id === 'idle-pine');
  assert.ok(parseWorkRef(pitRef.displayName).prNumber !== null, 'a pit-pool fixture carries a ref');
});
```

`FIXTURE_SNAPSHOT` is already imported in this test file (line 6).

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: FAIL - current fixtures carry no work-refs.

- [ ] **Step 3: Implement - rename the five fixtures**

In `dashboard/src/fixture-sessions.mjs`, change only these `displayName` values (leave every other field and every other session unchanged):
- line 6 `route-bracken`: `displayName: 'BB-228 PR#42 route tooltip'`
- line 7 `route-cinder`: `displayName: 'BB-305 combined pit'`
- line 8 `route-driftwood`: `displayName: 'PR#57 live adapter'`
- line 9 `route-ember`: `displayName: 'verifying BB-511 output · pane 2'`
- line 20 `idle-pine`: `displayName: 'BB-410 PR#63 fixture pass'`

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: PASS.

- [ ] **Step 5: Run the full unit suite (fixture snapshots are widely consumed)**

Run: `node --test dashboard/tests/*.test.mjs`
Expected: PASS. If a test asserted a literal old fixture name, reconcile it to the new name (search the test dir for `Bracken`, `Cinder`, `Driftwood`, `Pine`, `Ember` if a failure appears).

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/fixture-sessions.mjs dashboard/tests/dashboard.test.mjs
git commit -m "test(dashboard): give fixtures convention-following work-ref names"
```

---

### Task 7: Browser assertions + full browser verification

**Files:**
- Modify: `dashboard/tests/browser/full-bleed-layout.spec.mjs` (add badge/tooltip assertions on the default fixtures page)

**Interfaces:**
- Consumes: the fixture names from Task 6 (`route-bracken` -> `PR#42` badge; `idle-pine` pit -> `PR#63` badge), rendered on the default `/` page.
- Produces: a spec asserting the badge text on a route and a pit car, and the tooltip `Jira:`/`PR #` lines on focus. The existing `route tooltips stay fully on-screen (both axes)...` spec already re-measures on show and thus covers the taller tooltip.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/tests/browser/full-bleed-layout.spec.mjs`:

```js
test('work-ref badges render on a route and a pit car, tooltip shows the ref', async ({ page }) => {
  await page.locator('#track-select').selectOption('ridge-pass');

  const routeWrapper = page.locator('.vehicle-anchor').filter({
    has: page.locator('.session-car[data-session-id="route-bracken"]'),
  });
  await expect(routeWrapper.locator('.car-badge')).toHaveText('PR#42');
  await expect(routeWrapper.locator('.car-badge')).toHaveAttribute('aria-hidden', 'true');

  const pitWrapper = page.locator('#pit .pit-vehicle').filter({
    has: page.locator('.session-car[data-session-id="idle-pine"]'),
  });
  await expect(pitWrapper.locator('.car-badge')).toHaveText('PR#63');

  // Focus the pit car (stationary; no animation to freeze) and read its tooltip.
  await pitWrapper.locator('.session-car').focus();
  const tooltip = pitWrapper.locator('.session-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText('Jira: BB-410');
  await expect(tooltip).toContainText('PR #63');
});
```

- [ ] **Step 2: Run the full browser suite ONCE, foreground, with a 600000 ms timeout**

Run (single foreground Bash call, `timeout: 600000`, never backgrounded):
`npm --prefix dashboard run test:browser`
Expected: the new spec passes on both the desktop (1440x900) and mobile (390x844) projects, AND the `route tooltips stay fully on-screen (both axes)...` and `pit tooltips stay within the viewport` specs still pass (confirming the taller tooltip did not reintroduce clipping). If the badge assertion fails on mobile because the pit car is off-screen, scope the pit assertion with `test.skip(page.viewportSize().width > 759, ...)` mirroring the sibling mobile specs - but try without a skip first.

- [ ] **Step 3: Commit**

```bash
git add dashboard/tests/browser/full-bleed-layout.spec.mjs
git commit -m "test(dashboard): assert work-ref badges and tooltip lines in the browser"
```

---

### Task 8: Document the naming convention

**Files:**
- Modify: `dashboard/README.md`
- Test: `dashboard/tests/dashboard.test.mjs` (README is already read into `README` at line 32)

**Interfaces:**
- Produces: a short README section describing the one-window-per-ticket/PR convention, the `BB-228` / `PR#42` tokens, and the hard requirement that tmux auto-rename be off.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/tests/dashboard.test.mjs`:

```js
test('README documents the work-ref naming convention and auto-rename requirement', () => {
  assert.match(README, /automatic-rename off/);
  assert.match(README, /PR#\d+|PR#42/);
  assert.match(README, /BB-\d+|[A-Z]{2,}-\d+/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: FAIL - README has no such section yet.

- [ ] **Step 3: Implement**

Add a section to `dashboard/README.md` (place it after the snapshot-export section, before `## Live auto-refresh`):

```markdown
## Show a session's Jira ticket / PR

The dashboard reads the ticket and PR a session is working on from the tmux
window name - no git, GitHub, or `gh` involved. Follow one window per ticket/PR
(ideally one agent pane per window) and name the window with:

- a Jira key matching `[A-Z][A-Z0-9]+-\d+`, e.g. `BB-228`;
- a `PR#<n>` token when a PR opens, e.g. `BB-228 PR#42 route tooltip` (the key may
  be kept or replaced).

The car shows a small badge (`PR#42` if a PR is open, else the ticket key) and its
tooltip lists `Jira: BB-228` and `PR #42`. Cars with neither token show no badge.

This needs stable window names. tmux auto-rename overwrites a manual name with the
running command, so set `set -g automatic-rename off` (or have tooling set the
names); otherwise the ref disappears when the command changes.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/README.md dashboard/tests/dashboard.test.mjs
git commit -m "docs(dashboard): document the work-ref naming convention"
```

---

## Final verification (after all tasks)

- [ ] **Unit + routes:** `node --test dashboard/tests/*.test.mjs && npm --prefix dashboard run routes:check` - all green.
- [ ] **Browser (once, foreground, `timeout: 600000`):** `npm --prefix dashboard run test:browser` - all green on both projects, clamp specs included.
- [ ] **Visual - fixtures:** from `dashboard/`, `python3 -m http.server 4173 --bind 127.0.0.1`, open at 1440x900 and 390x844; confirm badges under `route-bracken` (`PR#42`), `route-cinder` (`BB-305`), `route-driftwood` (`PR#57`), `route-ember` (`BB-511`), and pit `idle-pine` (`PR#63`); confirm tooltips show the ref lines and the badge fades under the open tooltip; confirm no edge clipping.
- [ ] **Visual - live:** `node dashboard/serve-live.mjs`, "Go live"; name a window `BB-228 ...`, confirm the badge/tooltip; rename to `BB-228 PR#42 ...`, confirm the badge flips to `PR#42` on the next refresh.

## Self-review notes (author)

- **Spec coverage:** parseWorkRef (T1) + a11y (T2) + tooltip (T3) + badge route&pit (T4) + CSS & pit grid (T5) + fixtures incl. pit ref & pane suffix (T6) + browser & clamp re-verify (T7) + README/auto-rename note (T8). All spec sections mapped.
- **Type consistency:** `workRef: {ticketKey, prNumber, label}` is used identically in T2/T3/T4; `badgeLabel`/`applyBadge` signatures fixed in T4 and reused by the three call sites.
- **No placeholders:** every code and test step carries real content and an exact run command.
- **RENDERER-source guard:** T3 touches `makeTooltip` (no source-regex over it); T4 preserves the `wrapper.append(atmosphere, button,` literal that line ~805 asserts.
