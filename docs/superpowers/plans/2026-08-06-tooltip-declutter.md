# Session Tooltip Declutter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prune the session car tooltip to per-session facts - window name as the heading, status alone unless overflowed, one joined ref line, one short freshness line - and document the window-naming convention that now feeds the heading.

**Architecture:** Pure presentation change over data already in the snapshot. `parseWorkRef` gains pane-suffix and orphan-separator stripping and an empty-label fallback; `buildAccessibleText` stops emitting permission text and adds two derived fields (`activity.short`, `overflow`); `makeTooltip` restructures its lines. No collector, snapshot-schema, live-server, or CSS change.

**Tech Stack:** Vanilla ES modules, `node:test` + `node:assert/strict` for unit tests, a hand-rolled fake DOM (`tests/dom-fake.mjs`), Playwright for browser verification.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-06-tooltip-declutter-design.md`. Read it before starting.
- **No em dashes** in code, comments, commit messages, or docs. Use a plain `-`.
- **Comment blocks are 1-2 lines**, carrying the load-bearing "why" only. No ticket IDs in comments.
- **Atomic commits.** Each task commits at least once; refactors commit separately from behavior changes.
- The `aria-label` string built in `buildAccessibleText` (`label:`) must **not** change. It keeps the map code, the full `displayName` including the pane suffix, and the full location. Only the visible tooltip is pruned.
- `formatActivityAge` and `formatActivityTimestamp` must **not** change - other readouts and tests depend on them.
- Do not touch the on-map badge (`applyBadge`, `.car-badge`, badge CSS) or the overflow notice list.
- `permissionState` stays in the data model and snapshot validation. Only its *rendering* is removed.
- Browser tests: `npm --prefix dashboard run test:browser` takes ~3 min. Run it in **ONE foreground Bash call** with `timeout: 600000`. Never background it.
- Run unit tests with `node --test dashboard/tests/*.test.mjs` from the repo root.

## Key context an implementer will get wrong without reading this

**`observed` never happens in fixtures.** `normalizeSnapshot` (`src/session-contract.mjs:108`) hardcodes `activity.kind` to `last_activity` / `last_response`. Only the live path (`src/import-snapshot.mjs`, `src/tmux-collector.mjs:78`) produces `kind: 'observed'`. Consequences:

- The `Seen` label is **only reachable in live mode**. Fixture and browser runs show `Last active` / `Last response`.
- Therefore the `Seen` relabel must be unit-tested by handing `buildAccessibleText` a plain object literal with `activity: { kind: 'observed', at }`. It cannot be tested through `normalizeSnapshot`.
- A browser assertion that no tooltip says "Observed" would pass trivially. Don't rely on it as the proof.

**`activity.short` vs `activity.relative`.** `relative` keeps the precise wording and stays in the accessible `details` string. `short` is tooltip-only and reads `just now` under 60s. Both live on the same frozen object; neither replaces the other.

**The details-split seam.** `makeTooltip` separates phase/progress from the activity line with `text.details.split(\`. ${text.activity.label}:\`)`. The `details` string keeps its `label: exact (relative)` shape, so this seam keeps working even though the *rendered* activity line drops the colon. Do not "tidy" `details` to match the rendered form.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `dashboard/src/session-contract.mjs` | Snapshot normalization, work-ref parsing, accessible-text derivation | `parseWorkRef` strip rules + empty-label fallback; `buildAccessibleText` drops permission, adds `activity.short` and `overflow`; delete `permissionText` |
| `dashboard/src/render-dashboard.mjs` | DOM construction and live update | `makeTooltip` restructure, `appendActivity` reshape, new `refLine`/heading helpers |
| `dashboard/src/fixture-sessions.mjs` | Demo data | one fixture becomes a bare ref so the heading fallback is visible |
| `dashboard/tests/dashboard.test.mjs` | Contract-level unit tests | `parseWorkRef` cases, `buildAccessibleText` cases |
| `dashboard/tests/renderer-lifecycle.test.mjs` | Renderer DOM unit tests | tooltip-structure assertions |
| `dashboard/tests/browser/full-bleed-layout.spec.mjs` | Real-browser verification | ref-line form, heading fallback, clamp re-verify |
| `dashboard/README.md` | Operator docs | window-naming guidance for the new heading |

---

### Task 1: `parseWorkRef` strips the pane suffix and orphan separators

**Files:**
- Modify: `dashboard/src/session-contract.mjs:169-188`
- Test: `dashboard/tests/dashboard.test.mjs:235-290`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `parseWorkRef(name: string) -> { ticketKey: string|null, prNumber: number|null, label: string }`. **`label` may now be the empty string `''`** when the name was nothing but tokens and/or a pane suffix. Callers must supply their own fallback. Still total: any input, never throws.

- [ ] **Step 1: Update the two existing tests that lock in the old behavior**

These currently assert the behavior we are deliberately reversing. Replace them (do not delete - the cases still matter, the expectations change).

In `dashboard/tests/dashboard.test.mjs`, replace the test at line 266:

```js
test('parseWorkRef strips the pane suffix from the label', () => {
  assert.deepEqual(parseWorkRef('verifying BB-511 output · pane 2'), {
    ticketKey: 'BB-511', prNumber: null, label: 'verifying output',
  });
});
```

and replace the test at line 272:

```js
test('parseWorkRef yields an empty label when the name is only tokens', () => {
  assert.deepEqual(parseWorkRef('BB-228 PR#42'), {
    ticketKey: 'BB-228', prNumber: 42, label: '',
  });
});
```

- [ ] **Step 2: Add the new failing cases**

Append after the test you just replaced at line 272:

```js
test('parseWorkRef yields an empty label for a bare ref with a pane suffix', () => {
  assert.deepEqual(parseWorkRef('BB-325 · pane 1'), {
    ticketKey: 'BB-325', prNumber: null, label: '',
  });
});

test('parseWorkRef strips the pane suffix from a name with no tokens', () => {
  assert.deepEqual(parseWorkRef('Synthetic active · pane 1'), {
    ticketKey: null, prNumber: null, label: 'Synthetic active',
  });
});

test('parseWorkRef keeps the no-separator "Pane <N>" fallback name intact', () => {
  // sanitizeDisplayName emits `Pane 3` (no separator) for an empty window name.
  assert.deepEqual(parseWorkRef('Pane 3'), {
    ticketKey: null, prNumber: null, label: 'Pane 3',
  });
});

test('parseWorkRef drops separators orphaned by token removal', () => {
  assert.equal(parseWorkRef('BB-228 · route tooltip').label, 'route tooltip');
  assert.equal(parseWorkRef('route tooltip · BB-228').label, 'route tooltip');
  assert.equal(parseWorkRef('left · BB-228 · right').label, 'left · right');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: FAIL. The pane-suffix cases fail on the retained ` · pane N`; the bare-ref cases fail because `label` still falls back to the full name; the orphan-separator cases fail with a leading/trailing `·`.

- [ ] **Step 4: Implement the new strip rules**

In `dashboard/src/session-contract.mjs`, add the suffix pattern next to the existing two regexes (line 169-170):

```js
const TICKET_RE = /[A-Z][A-Z0-9]+-\d+/;
const PR_RE = /\bPR\s*#?\s*(\d+)/i;
// The ` · pane <N>` suffix sanitizeDisplayName appends; stripped so the tooltip
// heading is the window name the operator actually chose.
const PANE_SUFFIX_RE = /\s*·\s*pane\s+\d+\s*$/i;
```

Then replace the body of `parseWorkRef` (lines 176-188), keeping the existing doc comment above it:

```js
export function parseWorkRef(name) {
  const source = typeof name === 'string' ? name : '';
  const ticketMatch = source.match(TICKET_RE);
  const prMatch = source.match(PR_RE);
  const ticketKey = ticketMatch ? ticketMatch[0] : null;
  const prNumber = prMatch ? Number(prMatch[1]) : null;
  let label = source.replace(PANE_SUFFIX_RE, '');
  if (ticketMatch) label = label.replace(TICKET_RE, ' ');
  if (prMatch) label = label.replace(PR_RE, ' ');
  // Token removal orphans separators (`BB-325` alone reduces to `·`). An empty
  // label is a valid result - the renderer falls back to the ref itself.
  label = label
    .replace(/\s+/g, ' ')
    .replace(/(?:·\s*)+/g, '· ')
    .replace(/^[\s·]+|[\s·]+$/g, '');
  return { ticketKey, prNumber, label };
}
```

Note the removed line: the old `if (label === '') label = source.trim();` fallback is gone. That deletion is the point of this task.

- [ ] **Step 5: Update the doc comment above `parseWorkRef`**

The existing comment (lines 172-175) says "a tidied label out". Make the new contract explicit without exceeding two lines:

```js
// Parse the Jira key and/or PR number out of a session displayName (the tmux
// window name). Strips both tokens and the ` · pane <N>` suffix; `label` is '' when
// nothing survives, and callers fall back to the ref.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: PASS for every `parseWorkRef` test. Two `buildAccessibleText` work-ref tests (lines 278-290) should also still pass - `'BB-228 PR#42 route tooltip'` still yields `label: 'route tooltip'`, and `'Aoba'` has no tokens so its label is unchanged.

- [ ] **Step 7: Run the whole unit suite to find any other caller that assumed a nonempty label**

Run: `node --test dashboard/tests/*.test.mjs`
Expected: PASS. If `tests/dashboard.test.mjs:1063-1070` (the fixture work-ref sweep) fails, a fixture name reduces to an empty label - that is fine and expected in Task 4, but at this point no fixture is bare, so it should pass. Report any other failure rather than working around it.

- [ ] **Step 8: Commit**

```bash
git add dashboard/src/session-contract.mjs dashboard/tests/dashboard.test.mjs
git commit -m "refactor(dashboard): strip the pane suffix and orphan separators in parseWorkRef

label is now '' when a window name is nothing but a ref, so the tooltip can
use the ref itself as its heading. Callers own the fallback."
```

---

### Task 2: `buildAccessibleText` drops permission text and derives the short freshness form

**Files:**
- Modify: `dashboard/src/session-contract.mjs:190-225`
- Test: `dashboard/tests/dashboard.test.mjs`

**Interfaces:**
- Consumes: `parseWorkRef` from Task 1 (may return `label: ''`).
- Produces: `buildAccessibleText(session, placement, generatedAt, timestampOptions?)` returning a frozen object with `{ label, details, location, overflow, activity, workRef }`.
  - `overflow: boolean` - new. `true` when `placement.overflow` is true.
  - `activity: { label, exact, relative, short, datetime }` - `short` is new: `'just now'` for ages under 60 seconds, otherwise identical to `relative`. `label` is `'Seen'` for `activity.kind === 'observed'`, else `'Last response'` for a complete session, else `'Last active'`.
  - `details` no longer contains any permission text. It keeps the `${activity.label}: ${activity.exact} (${activity.relative})` shape.
  - `label` (the aria-label) is byte-for-byte unchanged.
- The module-level `permissionText` helper is deleted.

- [ ] **Step 1: Write the failing tests**

Append to `dashboard/tests/dashboard.test.mjs` after the `buildAccessibleText` work-ref tests (after line 290):

```js
test('buildAccessibleText omits permission text for every permission state', () => {
  for (const permissionState of ['requested', 'denied', 'granted', 'unknown', 'not_required']) {
    const status = permissionState === 'requested' || permissionState === 'denied'
      ? 'waiting_for_permission'
      : 'active';
    const data = normalized([session(`perm-${permissionState}`, status, { permissionState })]);
    const placement = allocateSessions(data.sessions)[0];
    const text = buildAccessibleText(data.sessions[0], placement, data.generatedAt);
    assert.doesNotMatch(text.details, /Permission/i, `${permissionState} leaked permission text`);
  }
});

test('buildAccessibleText labels an observed activity "Seen" and shortens sub-minute ages', () => {
  // `observed` is unreachable through normalizeSnapshot (fixtures are always
  // last_activity/last_response), so build the live-shaped session directly.
  const observed = {
    id: 'live',
    displayName: 'BB-325 · pane 1',
    mapCode: 'S01',
    status: 'active',
    permissionState: 'unknown',
    lastActivityAt: '2026-07-19T20:29:52Z',
    activity: { kind: 'observed', at: '2026-07-19T20:29:52Z' },
  };
  const placement = allocateSessions([observed])[0];
  const text = buildAccessibleText(observed, placement, GENERATED_AT);
  assert.equal(text.activity.label, 'Seen');
  assert.equal(text.activity.relative, '8 seconds ago');
  assert.equal(text.activity.short, 'just now');
  assert.equal(text.activity.datetime, '2026-07-19T20:29:52Z');
});

test('activity.short falls back to the precise wording at and beyond one minute', () => {
  const at = (lastActivityAt) => {
    const data = normalized([session('short-band', 'active', { lastActivityAt })]);
    const placement = allocateSessions(data.sessions)[0];
    return buildAccessibleText(data.sessions[0], placement, data.generatedAt).activity;
  };
  assert.equal(at('2026-07-19T20:29:01Z').short, 'just now');
  assert.equal(at('2026-07-19T20:29:00Z').short, '1 minute ago');
  assert.equal(at('2026-07-19T20:29:00Z').relative, '1 minute ago');
});

test('buildAccessibleText exposes overflow as a boolean and keeps the aria-label intact', () => {
  const data = normalized(poolSet('active', 17, 'ov'));
  const placements = allocateSessions(data.sessions);
  const overflowed = placements.find((item) => item.overflow);
  const placed = placements.find((item) => !item.overflow);
  const pick = (placement) => data.sessions.find((item) => item.id === placement.id);

  const overflowText = buildAccessibleText(pick(overflowed), overflowed, data.generatedAt);
  assert.equal(overflowText.overflow, true);
  assert.match(overflowText.label, /Map capacity exceeded for Shared Route/);

  const placedText = buildAccessibleText(pick(placed), placed, data.generatedAt);
  assert.equal(placedText.overflow, false);
  // The aria-label keeps the map code, the full displayName, and the location.
  const item = pick(placed);
  assert.equal(
    placedText.label,
    `${item.mapCode}, ${item.displayName}, Active, ${placed.locationLabel}`,
  );
});
```

`poolSet` and `GENERATED_AT` already exist in this file; confirm `poolSet`'s signature at its definition before use and adjust the call if it differs.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: FAIL - permission text present in `details`, `activity.short` undefined, `text.overflow` undefined, and the observed-session test fails on `label` still reading `Last active`.

- [ ] **Step 3: Delete `permissionText` and rewrite `buildAccessibleText`**

In `dashboard/src/session-contract.mjs`, delete the whole `permissionText` helper (lines 190-195). Then replace `buildAccessibleText` (lines 197-225) with:

```js
export function buildAccessibleText(session, placement, generatedAt, timestampOptions = {}) {
  const state = STATE_PRESENTATION[session.status];
  const location = placement.overflow
    ? `Map capacity exceeded for ${placement.poolLabel}`
    : placement.locationLabel;
  const details = [];
  if (session.phase) details.push(`Phase: ${session.phase}`);
  if (session.progress !== undefined) details.push(`Progress: ${Math.round(session.progress * 100)} percent`);
  const relative = formatActivityAge(session.lastActivityAt, generatedAt);
  const activity = Object.freeze({
    label: session.activity?.kind === 'observed'
      ? 'Seen'
      : session.status === 'complete' ? 'Last response' : 'Last active',
    exact: formatActivityTimestamp(session.lastActivityAt, timestampOptions),
    relative,
    // Tooltip-only wording; `relative` keeps the precise form for the a11y string.
    short: /^\d+ seconds? ago$/.test(relative) ? 'just now' : relative,
    datetime: session.lastActivityAt,
  });
  details.push(`${activity.label}: ${activity.exact} (${activity.relative})`);
  if (session.errorSummary) details.push(`Error: ${session.errorSummary}`);
  const workRef = parseWorkRef(session.displayName);
  return Object.freeze({
    label: `${session.mapCode}, ${session.displayName}, ${state.label}, ${location}`,
    details: details.join('. '),
    location,
    overflow: placement.overflow === true,
    activity,
    workRef: Object.freeze(workRef),
  });
}
```

The `short` test keys off `formatActivityAge`'s own sub-minute wording (`"N seconds ago"`, always plural) rather than recomputing the age, so the two can never disagree.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test dashboard/tests/dashboard.test.mjs`
Expected: PASS. The pre-existing assertions at lines 223 and 231 (`Last active: Jul 19, 2026, 8:29:00 PM UTC (1 minute ago)` and the `Last response` twin) must still pass untouched - they prove `details` kept its shape and the aria-label path is intact.

- [ ] **Step 5: Run the whole unit suite**

Run: `node --test dashboard/tests/*.test.mjs`
Expected: PASS. `tests/renderer-lifecycle.test.mjs:201` asserts the overflow notice contains no `'Permission state unknown'` - it already passed and must keep passing.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/session-contract.mjs dashboard/tests/dashboard.test.mjs
git commit -m "feat(dashboard): drop permission text and derive a short freshness form

The permission line was noise: 'unknown' means the classifier could not
tell, and a real wait is already stated by the status label. Adds
activity.short ('just now' under a minute) and an overflow flag for the
tooltip, leaving the aria-label and the details string shape unchanged."
```

---

### Task 3: Restructure the tooltip

**Files:**
- Modify: `dashboard/src/render-dashboard.mjs:67-95` (`appendActivity`, `makeTooltip`)
- Test: `dashboard/tests/renderer-lifecycle.test.mjs:88-122` and `:382`

**Interfaces:**
- Consumes: `buildAccessibleText`'s `overflow` and `activity.short` from Task 2; `parseWorkRef`'s possibly-empty `label` from Task 1.
- Produces the tooltip child order, which the browser specs in Task 4 rely on:
  1. `<strong>` heading - `workRef.label`, else `PR#<n>`/`<ticketKey>`, else `session.displayName`
  2. `<span>` status - `presentation.label`, plus ` · ${location}` only when `text.overflow`
  3. `<span>` ref line - `Jira: <key> · PR #<n>`; **absent** when the heading fell back to the ref
  4. `<span class="tooltip-details">` - phase/progress, then `<label> <time>{short}</time>`, then the error summary
- New module-local helpers: `refLine(workRef) -> string` (empty string when no ref) and `headingText(session, workRef) -> string` (never empty).

- [ ] **Step 1: Rewrite the three existing tooltip tests**

In `dashboard/tests/renderer-lifecycle.test.mjs`, replace the tests at lines 88-122:

```js
test('tooltip heading is the stripped name, with one joined Jira/PR line', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('ref', { displayName: 'BB-228 PR#42 route tooltip' }),
  ]), root, getTrack('ridge-pass'));
  const tooltip = findCar(root, 'ref').parentElement.querySelector('.session-tooltip');
  assert.equal(tooltip.children[0].textContent, 'route tooltip');
  assert.equal(tooltip.children[1].textContent, 'Active');
  assert.equal(tooltip.children[2].textContent, 'Jira: BB-228 · PR #42');
});

test('tooltip omits the ref line when the name has no tokens', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('plain', { displayName: 'Aoba' }),
  ]), root, getTrack('ridge-pass'));
  const tooltip = findCar(root, 'plain').parentElement.querySelector('.session-tooltip');
  assert.equal(tooltip.children[0].textContent, 'Aoba');
  assert.doesNotMatch(tooltip.textContent, /Jira:|PR #/);
});

test('a bare-ref window name uses the ref as the heading and drops the ref line', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('bare', { displayName: 'BB-325 · pane 1' }),
  ]), root, getTrack('ridge-pass'));
  const tooltip = findCar(root, 'bare').parentElement.querySelector('.session-tooltip');
  assert.equal(tooltip.children[0].textContent, 'BB-325');
  // The ref is the heading, so repeating it on its own line would duplicate it.
  assert.doesNotMatch(tooltip.textContent, /Jira:/);
});

test('a bare PR window name uses PR# precedence for the heading', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('barepr', { displayName: 'BB-228 PR#42' }),
  ]), root, getTrack('ridge-pass'));
  const tooltip = findCar(root, 'barepr').parentElement.querySelector('.session-tooltip');
  assert.equal(tooltip.children[0].textContent, 'PR#42');
});

test('tooltip drops the map code, the pane index, and the location for a placed car', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([
    routeSession('clean', { displayName: 'BB-228 route tooltip · pane 1' }),
  ]), root, getTrack('ridge-pass'));
  const tooltip = findCar(root, 'clean').parentElement.querySelector('.session-tooltip');
  assert.doesNotMatch(tooltip.textContent, /pane 1/);
  assert.doesNotMatch(tooltip.textContent, /Route Slot/);
  assert.doesNotMatch(tooltip.textContent, /S\d\d/);
  assert.doesNotMatch(tooltip.textContent, /Permission/i);
});

test('replaceTooltip renders the new heading and ref line on a live update()', () => {
  const { root } = dashboardRoot();
  const controller = renderDashboard(routeSnapshot([
    routeSession('ref', { displayName: 'Aoba' }),
  ]), root, getTrack('ridge-pass'));
  controller.update(routeSnapshot([
    routeSession('ref', { displayName: 'BB-305 PR#9 renamed' }),
  ], '2026-07-26T17:00:05Z'));
  const tooltip = findCar(root, 'ref').parentElement.querySelector('.session-tooltip');
  assert.equal(tooltip.children[0].textContent, 'renamed');
  assert.equal(tooltip.children[2].textContent, 'Jira: BB-305 · PR #9');
  controller.destroy();
});
```

- [ ] **Step 2: Add a test for the overflow exception and the activity line**

Append to the same file, after the tests from Step 1:

```js
test('an overflowed car keeps its location on the status line', () => {
  const { root } = dashboardRoot();
  const controller = renderDashboard(overflowingSnapshot(20), root, getTrack('ridge-pass'));
  const tooltips = root.querySelectorAll('.session-tooltip')
    .map((tooltip) => tooltip.children[1].textContent);
  assert.ok(
    tooltips.some((line) => line === 'Idle · Pit is at capacity'),
    `no overflowed tooltip named its capacity: ${JSON.stringify(tooltips)}`,
  );
  assert.ok(tooltips.some((line) => line === 'Idle'), 'placed cars show the status alone');
  controller.destroy();
});

test('the activity line renders the short age with the exact time kept on the <time> element', () => {
  const { root } = dashboardRoot();
  renderDashboard(routeSnapshot([routeSession('clock')]), root, getTrack('ridge-pass'));
  const tooltip = findCar(root, 'clock').parentElement.querySelector('.session-tooltip');
  const time = tooltip.querySelector('.activity-time');
  assert.equal(tooltip.querySelector('.tooltip-details').textContent.includes('Last active 1 minute ago'), true);
  assert.equal(time.textContent, '1 minute ago');
  assert.equal(time.dateTime, '2026-07-26T16:59:00Z');
  assert.match(time.getAttribute('title'), /2026/);
});
```

- [ ] **Step 3: Fix the `setTrack` test that asserts the segment name in the tooltip**

`dashboard/tests/renderer-lifecycle.test.mjs:382` asserts the tooltip text contains `Launch Line` - a track segment name. After this change a placed car's tooltip contains no location at all, so this assertion must move to the aria-label (which retains it) and invert for the tooltip. Replace line 382:

```js
  assert.match(routeButton.getAttribute('aria-label'), /Launch Line/);
  // The segment name lives in the aria-label only; the tooltip drops map geography.
  assert.doesNotMatch(routeWrapper.querySelector('.session-tooltip').textContent, /Launch Line/);
```

Keep line 381 (the aria-label assertion) exactly as it is - it is now the sole proof that `setTrack` re-derived the text.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `node --test dashboard/tests/renderer-lifecycle.test.mjs`
Expected: FAIL - headings still carry the `S01 · ` prefix, the ref line is still split across two spans, the status line still carries the route slot, and the activity line still reads `Last active: <exact> (<relative>)`.

- [ ] **Step 5: Reshape `appendActivity` and add the two helpers**

In `dashboard/src/render-dashboard.mjs`, replace `appendActivity` (lines 67-72):

```js
function appendActivity(documentRef, parent, activity) {
  parent.append(`${activity.label} `);
  const time = element(documentRef, 'time', 'activity-time', activity.short);
  time.dateTime = activity.datetime;
  // The precise timestamp stays reachable on hover without spending a line.
  time.setAttribute('title', activity.exact);
  parent.append(time);
}

function refLine(workRef) {
  const parts = [];
  if (workRef.ticketKey) parts.push(`Jira: ${workRef.ticketKey}`);
  if (workRef.prNumber !== null) parts.push(`PR #${workRef.prNumber}`);
  return parts.join(' · ');
}

// `badgeLabel` gives PR-over-ticket precedence; reused so the heading and the
// on-map badge never disagree about which ref identifies a session.
function headingText(session, workRef) {
  return workRef.label || badgeLabel(workRef) || session.displayName;
}
```

`badgeLabel` is declared later in the file (line 117) but function declarations hoist, so calling it here is fine. Do not move it.

- [ ] **Step 6: Restructure `makeTooltip`**

Replace `makeTooltip` (lines 74-95):

```js
function makeTooltip(documentRef, session, presentation, text, tooltipId) {
  const tooltip = element(documentRef, 'span', 'session-tooltip');
  tooltip.id = tooltipId;
  tooltip.setAttribute('role', 'tooltip');
  // Location is map decoration for a placed car; on overflow it is the only
  // explanation of why the car is not on the map.
  const status = text.overflow ? `${presentation.label} · ${text.location}` : presentation.label;
  tooltip.append(
    element(documentRef, 'strong', '', headingText(session, text.workRef)),
    element(documentRef, 'span', '', status),
  );
  // Skipped when the ref is already the heading, so a token never appears twice.
  const refs = text.workRef.label ? refLine(text.workRef) : '';
  if (refs) tooltip.append(element(documentRef, 'span', '', refs));
  const details = element(documentRef, 'span', 'tooltip-details');
  const nonActivity = text.details.split(`. ${text.activity.label}:`)[0];
  if (nonActivity && nonActivity !== text.details) details.append(`${nonActivity}. `);
  appendActivity(documentRef, details, text.activity);
  if (session.errorSummary) details.append(`. Error: ${session.errorSummary}`);
  tooltip.append(details);
  return tooltip;
}
```

`replaceTooltip` needs no edit - it already rebuilds through `makeTooltip`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test dashboard/tests/renderer-lifecycle.test.mjs`
Expected: PASS.

- [ ] **Step 8: Run the whole unit suite and the route check**

Run: `node --test dashboard/tests/*.test.mjs && npm --prefix dashboard run routes:check`
Expected: PASS for both, and `routes:check` reports the route artifacts current (no geometry change is expected from this task; if it reports drift, stop and report it rather than regenerating).

- [ ] **Step 9: Commit**

```bash
git add dashboard/src/render-dashboard.mjs dashboard/tests/renderer-lifecycle.test.mjs
git commit -m "feat(dashboard): declutter the session tooltip

Heading is the window name (the ref when nothing else survives the strip),
status stands alone unless the car overflowed, Jira and PR join one line,
and freshness reads 'just now' with the exact time on the <time> title.
Drops the map code, the pane index, and the always-identical timestamp."
```

---

### Task 4: Make the heading fallback visible in fixtures and verify in a real browser

**Files:**
- Modify: `dashboard/src/fixture-sessions.mjs:21`
- Modify: `dashboard/tests/browser/full-bleed-layout.spec.mjs:173-192`
- Test: the browser suite itself

**Interfaces:**
- Consumes: the tooltip child order from Task 3.
- Produces: a fixture whose `displayName` is a bare ref, so the heading fallback renders in fixture mode and is browser-assertable.

- [ ] **Step 1: Give one pit fixture a bare-ref name**

No current fixture is a bare ref, so the fallback path never renders in fixture or browser mode. In `dashboard/src/fixture-sessions.mjs`, change `idle-quartz` (line 21) so its `displayName` is exactly a ticket key:

```js
    { id: 'idle-quartz', displayName: 'BB-325', status: 'idle', lastActivityAt: '2026-07-19T19:44:12Z', permissionState: 'unknown' },
```

Leave every other fixture as it is. `route-ember` (`'verifying BB-511 output · pane 2'`) already exercises the pane-suffix strip, and `route-bracken` / `idle-pine` already carry both a ticket and a PR.

- [ ] **Step 2: Run the unit suite to catch fixture-sweep fallout**

Run: `node --test dashboard/tests/*.test.mjs`
Expected: PASS. `tests/dashboard.test.mjs:1063-1070` sweeps fixture work-refs; `idle-quartz` now parses to `{ticketKey: 'BB-325', prNumber: null, label: ''}`, which still satisfies a ref-present assertion. If that sweep asserts a nonempty label, update it to expect the bare-ref shape and say so in the commit.

- [ ] **Step 3: Update the browser work-ref spec to the joined form**

In `dashboard/tests/browser/full-bleed-layout.spec.mjs`, replace the two `toContainText` assertions at lines 191-192 and add heading coverage. Replace from `await expect(tooltip).toBeVisible();` through line 192 with:

```js
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('strong')).toHaveText('fixture pass');
  await expect(tooltip).toContainText('Jira: BB-410 · PR #63');
  // The pruned lines must not come back.
  await expect(tooltip).not.toContainText('Permission');
  await expect(tooltip).not.toContainText('Pit position');
  await expect(tooltip).not.toContainText('pane ');
```

- [ ] **Step 4: Add a browser test for the bare-ref heading**

Append after that test in the same file:

```js
test('a bare-ref window name shows the ref as the tooltip heading, with no ref line', async ({ page }) => {
  await page.locator('#track-select').selectOption('ridge-pass');
  const wrapper = page.locator('#pit .pit-vehicle').filter({
    has: page.locator('.session-car[data-session-id="idle-quartz"]'),
  });
  await wrapper.locator('.session-car').focus();
  const tooltip = wrapper.locator('.session-tooltip');
  await expect(tooltip).toBeVisible();
  await expect(tooltip.locator('strong')).toHaveText('BB-325');
  await expect(tooltip).not.toContainText('Jira:');
});
```

- [ ] **Step 5: Run the browser suite**

Run: `npm --prefix dashboard run test:browser`
ONE foreground Bash call, `timeout: 600000`, never backgrounded.
Expected: PASS. Pay attention to two suites beyond the ones you edited:
- the route-tooltip clamp tests (`full-bleed-layout.spec.mjs:99` and `:84`). Tooltips are now **shorter**, which changes the `offsetHeight + 9` open-up decision at `render-dashboard.mjs:265`. A pass here is the real verification that the clamp still holds; a failure is a genuine finding about the flip threshold, not a test to relax.
- `dashboard.spec.mjs:1094`, which loops over `['body', 'glyph', 'code', 'tooltip']` - confirm it is unaffected.

If the clamp fails, stop and report the failure with the output. Do not adjust the clamp without checking back.

- [ ] **Step 6: Commit**

```bash
git add dashboard/src/fixture-sessions.mjs dashboard/tests/browser/full-bleed-layout.spec.mjs
git commit -m "test(dashboard): cover the bare-ref tooltip heading in the browser

Gives a pit fixture a bare BB-325 name so the ref-as-heading fallback
renders in fixture mode, and asserts the joined ref line plus the absence
of the permission, location, and pane lines."
```

---

### Task 5: Document the window-naming convention

**Files:**
- Modify: `dashboard/README.md:47-62`

**Interfaces:**
- Consumes: the heading rules from Tasks 1 and 3.
- Produces: no code surface.

- [ ] **Step 1: Rewrite the naming section**

The existing section documents the badge and the old two-line tooltip. Replace `dashboard/README.md` lines 47-62 with:

```markdown
## Name your tmux windows so the dashboard can read them

The dashboard reads the ticket and PR a session is working on from the tmux
window name - no git, GitHub, or `gh` involved. The window name is also the
tooltip's heading, so the name is worth choosing deliberately.

Name the window with:

- a Jira key matching `[A-Z][A-Z0-9]+-\d+`, e.g. `BB-228`;
- a `PR#<n>` token when a PR opens, e.g. `BB-228 PR#42 route tooltip` (the key may
  be kept or replaced);
- a short phrase saying what you are doing. This is what you actually read in the
  tooltip, so `BB-228 route tooltip` beats a bare `BB-228`.

What each name produces:

| Window name | Tooltip heading | Ref line |
|---|---|---|
| `BB-228 PR#42 route tooltip` | `route tooltip` | `Jira: BB-228 · PR #42` |
| `BB-228 route tooltip` | `route tooltip` | `Jira: BB-228` |
| `BB-325` | `BB-325` | none - the ref is the heading |
| `scratch` | `scratch` | none |

The car also wears a small badge (`PR#42` if a PR is open, else the ticket key);
cars with neither token show no badge.

**Run one agent pane per window.** The tooltip does not show the pane index, so
two agent panes in the same window produce two identical tooltips. You can still
tell the cars apart by the code on the car body (`S08`), but the tooltip cannot
help you.

This needs stable window names. tmux auto-rename overwrites a manual name with the
running command, so set `set -g automatic-rename off` (or have tooling set the
names); otherwise the ref disappears when the command changes.
```

- [ ] **Step 2: Verify the claims in the table against the code**

Run: `node --test dashboard/tests/dashboard.test.mjs dashboard/tests/renderer-lifecycle.test.mjs`
Expected: PASS. Each table row corresponds to a test added in Tasks 1 and 3 (`BB-228 PR#42 route tooltip`, `BB-325 · pane 1`, `Aoba`). If a row has no matching test, add the test rather than trusting the table.

- [ ] **Step 3: Commit**

```bash
git add dashboard/README.md
git commit -m "docs(dashboard): document window naming for the tooltip heading

The window name is now the tooltip heading, so document what each naming
shape produces and why one agent pane per window matters once the pane
index is gone from the tooltip."
```

---

### Task 6: Full verification

**Files:** none - verification only.

- [ ] **Step 1: Run the complete unit suite**

Run: `node --test dashboard/tests/*.test.mjs`
Expected: PASS, zero failures.

- [ ] **Step 2: Run the route check**

Run: `npm --prefix dashboard run routes:check`
Expected: route artifacts current.

- [ ] **Step 3: Run the full browser suite**

Run: `npm --prefix dashboard run test:browser`
ONE foreground Bash call, `timeout: 600000`, never backgrounded.
Expected: PASS across desktop (1440x900) and mobile (390x844) projects.

- [ ] **Step 4: Look at it in live mode**

Run: `node dashboard/serve-live.mjs`, open the printed URL, click "Go live", and focus a car whose tmux window is named with a bare ticket key.
Expected, for a window named `BB-325`:

```
BB-325
Active
Seen just now
```

This is the only mode where the `Seen` label appears - fixtures always produce `Last active` / `Last response`. Confirm the original screenshot's five lines are down to three, with no `S08 · ·`, no permission line, and no absolute timestamp.

- [ ] **Step 5: Report**

State what passed, paste the failing output for anything that did not, and call out the live-mode check explicitly since it is manual.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Heading: name stripped of ref + pane suffix | 1, 3 |
| Heading: ref as fallback | 1 (empty label), 3 (`headingText`) |
| Status line: label alone, location on overflow only | 2 (`overflow` flag), 3 |
| Ref line joined with ` · `, omitted when it is the heading | 3 |
| Freshness: `Seen`, `just now` under 60s, exact time preserved | 2 (`short`, `label`), 3 (`appendActivity`) |
| Permission line removed | 2 |
| `aria-label` untouched (decision 2) | 2 (asserted explicitly) |
| `formatActivityAge` untouched (decision 3) | 2 (`short` derived from its output) |
| Phase/Progress survive | 3 (details seam preserved) |
| Overflow summary list unchanged | not touched; verified by Task 3 Step 8 |
| README naming guidance | 5 |
| Browser + clamp re-verify | 4 Step 5, 6 Step 3 |

**Placeholder scan:** no TBDs; every code step carries real code; no "similar to Task N" references.

**Type consistency:** `activity.short` (Task 2) is consumed by `appendActivity` (Task 3). `overflow` (Task 2) is consumed by `makeTooltip` (Task 3). `refLine` / `headingText` are declared and used only in Task 3. `badgeLabel` is pre-existing and unchanged. `parseWorkRef`'s empty-label contract (Task 1) is consumed by `headingText` (Task 3) and by the fixture change (Task 4).

**Known gap, deliberate:** the `Seen` label is unreachable in fixture and browser mode, so it is covered by a unit test on a hand-built live-shaped session (Task 2 Step 1) plus the manual live check (Task 6 Step 4). There is no automated end-to-end assertion of `Seen` in a real browser, because no fixture path can produce `activity.kind === 'observed'`. Closing that would mean changing the live-import path or adding a live fixture mode, which is out of scope for this plan.
