# Route-tooltip Viewport Clamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an on-track (route) car's tooltip stay fully on-screen at any horizontal position, on desktop (1440x900) and mobile (390x844), by replacing brittle coordinate thresholds with a CSS viewport-relative clamp.

**Architecture:** Render already computes each route car's horizontal viewport fraction as `placement.x / 10`. Expose it as a unitless CSS custom property `--vehicle-vw`; a pure-CSS `--tt-shift` derived from it nudges the centered tooltip only as far as needed to keep both edges inside the stage (`overflow: hidden`, full-bleed = viewport width). The old `edge-left`/`edge-right` class mechanism is deleted. Pit tooltips and vertical `tooltip-up` placement are untouched.

**Tech Stack:** Vanilla ES modules, CSS custom properties + `min()`/`max()`/`clamp()` math, Node's built-in test runner, Playwright (two projects).

## Global Constraints

- No new npm dependencies. ES modules only.
- No em dashes anywhere (plain hyphen `-`), including code comments.
- Do NOT regress #41: combined pit ordering/capacity/overflow, desktop pit left-align, and the mobile docked pit-tooltip + pin-suppression rules stay intact. Do NOT change the collector, import validation, or live-server security model.
- Leave route car positioning, the 16-slot route, animation, and pin/pause-on-hover untouched - tooltip-positioning fix only.
- Preserve accessibility: `aria-describedby` / `role="tooltip"` association, focus, and pin (Enter/Space/Escape) unchanged.
- Mobile: no horizontal page overflow; 44px car hit target unchanged.
- Preserve both fixtures and live modes and the incremental `update()` path (`applyRouteCar` must set `--vehicle-vw` every tick).
- Keep code comments to 1-2 lines; explain the "why" only. No issue-tracker IDs in code.
- **The browser suite runs ~3 minutes.** Run it as ONE foreground Bash call with the Bash `timeout` parameter set to `600000`. Never background it or spawn a monitor.

## Verification commands (referenced by tasks)

- Unit: `node --test dashboard/tests/*.test.mjs` (baseline 204 passing)
- Routes: `npm --prefix dashboard run routes:check`
- Browser (foreground, `timeout` 600000): `npm --prefix dashboard run test:browser`
- Single browser test, one project (faster during repro):
  `npm --prefix dashboard exec -- playwright test full-bleed-layout --project=mobile-chromium -g "route tooltips stay"`

---

### Task 1: Reproduce the clip with a failing route-tooltip regression test

Prove the bug before touching CSS/JS. This test becomes the permanent guard. It is left FAILING at the end of this task and is greened + committed in Task 2 (the repo rule is that every commit passes tests, so the red test is not committed on its own).

**Files:**
- Modify: `dashboard/tests/browser/full-bleed-layout.spec.mjs` (add one test after the existing `test('pit tooltips stay within the viewport', ...)`, ~L97)

**Interfaces:**
- Consumes: existing spec helpers (`test`, `expect` from `@playwright/test`), the `beforeEach` that navigates to `/` and asserts `24 sessions`, and the `afterEach` that asserts no console warnings/errors.
- Produces: `test('route tooltips stay within the viewport', ...)` - the regression guard Task 2 must green on both projects.

- [ ] **Step 1: Write the failing test**

Add to `dashboard/tests/browser/full-bleed-layout.spec.mjs`:

```javascript
test('route tooltips stay within the viewport', async ({ page }) => {
  // ridge-pass deterministically populates the on-track route across the full
  // width, including the near-edge band the clamp must protect.
  await page.locator('#track-select').selectOption('ridge-pass');
  await expect(page.locator('.vehicle-anchor').first()).toBeVisible();

  const sweep = () => page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const bad = [];
    for (const wrapper of document.querySelectorAll('.vehicle-anchor')) {
      wrapper.querySelector('.session-car').focus();
      const r = wrapper.querySelector('.session-tooltip').getBoundingClientRect();
      if (r.left < -0.5 || r.right > vw + 0.5) {
        bad.push({ id: wrapper.dataset.sessionId, left: Math.round(r.left), right: Math.round(r.right), vw });
      }
      wrapper.querySelector('.session-car').blur();
    }
    return bad;
  });

  const atNative = await sweep();
  expect(atNative, `native ${page.viewportSize().width}: ${JSON.stringify(atNative)}`).toEqual([]);

  // At 1440 the fixture route coords don't reach the edge, so on the desktop
  // project also sweep a narrow width where a centered near-edge tooltip
  // provably overhangs. (Mobile already sweeps at its native 390.)
  if (page.viewportSize().width > 759) {
    await page.setViewportSize({ width: 390, height: 900 });
    const atNarrow = await sweep();
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(atNarrow, `narrow 390: ${JSON.stringify(atNarrow)}`).toEqual([]);
  }
});
```

- [ ] **Step 2: Run the test and verify it FAILS on both projects**

Run (foreground, `timeout` 600000):
`npm --prefix dashboard exec -- playwright test full-bleed-layout -g "route tooltips stay"`

Expected: FAIL.
- `mobile-chromium`: the native (390) sweep returns a non-empty `bad` list (cars with `left < 0`), so `expect(atNative...)` fails.
- `desktop-chromium`: the native (1440) sweep passes, but the narrow (390) sweep returns a non-empty list, so `expect(atNarrow...)` fails.

If either project unexpectedly PASSES, stop and investigate before proceeding (the reproduction is the proof the fix is real). Record the printed `bad` lists as the observed clip evidence.

- [ ] **Step 3: Do NOT commit**

Leave the failing test in the working tree. Task 2 makes it pass and commits it together with the fix. Hand off the observed failure output to the reviewer.

---

### Task 2: Apply the viewport clamp (render + CSS) and green the guard

**Files:**
- Modify: `dashboard/src/render-dashboard.mjs` (`makeCar` route branch ~L111-119; `applyRouteCar` ~L270-281)
- Modify: `dashboard/styles.css` (`.session-tooltip` base ~L867-887; delete edge rules ~L896-897 and ~L910-917; shared reveal ~L899-908)
- Test: `dashboard/tests/browser/full-bleed-layout.spec.mjs` (the Task 1 test, now expected to pass)

**Interfaces:**
- Consumes: `placement.x` (0-1000 route-anchor coordinate) already used to set `--vehicle-x`.
- Produces: CSS custom prop `--vehicle-vw` (unitless string of `placement.x / 10`) on every `.vehicle-anchor`; CSS vars `--tt-gutter`, `--tt-half`, `--tt-carx`, `--tt-shift` on `.session-tooltip`. No `edge-left` / `edge-right` classes anywhere.

- [ ] **Step 1: render - set `--vehicle-vw`, drop edge toggles in `makeCar`**

In `dashboard/src/render-dashboard.mjs`, the route branch currently reads:

```javascript
  if (target === 'route') {
    wrapper.style.setProperty('--vehicle-x', `${placement.x / 10}%`);
    wrapper.style.setProperty('--vehicle-y', `${placement.y / 7.6}%`);
    wrapper.style.setProperty('--route-phase', `${-placement.slotIndex * ROUTE_PHASE_SECONDS}s`);
    wrapper.dataset.routeSlot = String(placement.slotIndex);
    if (placement.y >= 560) wrapper.classList.add('tooltip-up');
    if (placement.x <= 210) wrapper.classList.add('edge-left');
    if (placement.x >= 790) wrapper.classList.add('edge-right');
  }
```

Replace with (add `--vehicle-vw`; keep `tooltip-up`; delete both edge adds):

```javascript
  if (target === 'route') {
    wrapper.style.setProperty('--vehicle-x', `${placement.x / 10}%`);
    wrapper.style.setProperty('--vehicle-y', `${placement.y / 7.6}%`);
    // Car center as a viewport fraction; the tooltip clamp reads this to stay on-stage.
    wrapper.style.setProperty('--vehicle-vw', String(placement.x / 10));
    wrapper.style.setProperty('--route-phase', `${-placement.slotIndex * ROUTE_PHASE_SECONDS}s`);
    wrapper.dataset.routeSlot = String(placement.slotIndex);
    if (placement.y >= 560) wrapper.classList.add('tooltip-up');
  }
```

- [ ] **Step 2: render - set `--vehicle-vw`, drop edge toggles in `applyRouteCar`**

In `applyRouteCar`, the body currently reads:

```javascript
    wrapper.style.setProperty('--vehicle-x', `${placement.x / 10}%`);
    wrapper.style.setProperty('--vehicle-y', `${placement.y / 7.6}%`);
    wrapper.style.setProperty('--route-phase', `${-placement.slotIndex * ROUTE_PHASE_SECONDS}s`);
    wrapper.dataset.routeSlot = String(placement.slotIndex);
    wrapper.classList.toggle('tooltip-up', placement.y >= 560);
    wrapper.classList.toggle('edge-left', placement.x <= 210);
    wrapper.classList.toggle('edge-right', placement.x >= 790);
```

Replace with (add `--vehicle-vw`; keep `tooltip-up` toggle; delete both edge toggles):

```javascript
    wrapper.style.setProperty('--vehicle-x', `${placement.x / 10}%`);
    wrapper.style.setProperty('--vehicle-y', `${placement.y / 7.6}%`);
    wrapper.style.setProperty('--vehicle-vw', String(placement.x / 10));
    wrapper.style.setProperty('--route-phase', `${-placement.slotIndex * ROUTE_PHASE_SECONDS}s`);
    wrapper.dataset.routeSlot = String(placement.slotIndex);
    wrapper.classList.toggle('tooltip-up', placement.y >= 560);
```

- [ ] **Step 3: CSS - add the clamp vars and consume the shift in the base transform**

In `dashboard/styles.css`, the `.session-tooltip` base rule currently ends with:

```css
  transform: translate(-50%, -.25rem);
  transition: opacity 120ms ease, transform 120ms ease, visibility 120ms linear;
  pointer-events: none;
}
```

Insert the clamp vars just before the `transform` line and update the transform:

```css
  --tt-gutter: .5rem;
  --tt-half: calc(min(16rem, calc(100vw - 2rem)) / 2);
  --tt-carx: calc(var(--vehicle-vw, 50) * 1vw);
  /* Nudge the centered tooltip only as far as needed to keep it on-stage: push
     right if it would overhang the left edge, pull left if the right, else 0. */
  --tt-shift: max(
    calc(var(--tt-gutter) - var(--tt-carx) + var(--tt-half)),
    min(0px, calc(100vw - var(--tt-gutter) - var(--tt-carx) - var(--tt-half)))
  );
  transform: translate(calc(-50% + var(--tt-shift)), -.25rem);
  transition: opacity 120ms ease, transform 120ms ease, visibility 120ms linear;
  pointer-events: none;
}
```

- [ ] **Step 4: CSS - delete the edge base rules and update the shared reveal**

Delete these two lines (`.edge-left` / `.edge-right` base, ~L896-897):

```css
.edge-left .session-tooltip { left: 0; transform: translate(0, -.25rem); }
.edge-right .session-tooltip { right: 0; left: auto; transform: translate(0, -.25rem); }
```

In the shared reveal rule (the block listing `.vehicle-anchor:hover ... .pit-vehicle[data-pinned="true"] .session-tooltip`), change its transform so revealed route tooltips keep the shift (pit tooltips override this transform in their own rules, so pit is unaffected):

```css
  opacity: 1;
  visibility: visible;
  transform: translate(calc(-50% + var(--tt-shift)), 0);
}
```

Delete the now-dead edge reveal block (~L910-917):

```css
.edge-left:hover .session-tooltip,
.edge-left:focus-within .session-tooltip,
.edge-left[data-pinned="true"] .session-tooltip,
.edge-right:hover .session-tooltip,
.edge-right:focus-within .session-tooltip,
.edge-right[data-pinned="true"] .session-tooltip {
  transform: translate(0, 0);
}
```

Leave every `.pit-vehicle ...`, `.tooltip-up .session-tooltip`, and mobile `@media` rule exactly as-is.

- [ ] **Step 5: Verify the reproduction now passes on both projects**

Run (foreground, `timeout` 600000):
`npm --prefix dashboard exec -- playwright test full-bleed-layout -g "route tooltips stay"`
Expected: PASS on both `desktop-chromium` and `mobile-chromium`.

- [ ] **Step 6: Run the full browser suite (no #41 regression)**

Run (foreground, `timeout` 600000): `npm --prefix dashboard run test:browser`
Expected: all tests PASS on both projects - especially the existing `pit tooltips stay within the viewport`, `focusing a route car shows its tooltip ...` (pin/Escape), `mobile pit tooltips never overlap`, and `mobile keeps the pit full-width and never overflows horizontally`.

- [ ] **Step 7: Run routes check (unchanged)**

Run: `npm --prefix dashboard run routes:check`
Expected: PASS (routes untouched).

- [ ] **Step 8: Commit the fix together with its regression test**

```bash
git add dashboard/src/render-dashboard.mjs dashboard/styles.css dashboard/tests/browser/full-bleed-layout.spec.mjs
git commit -m "fix(dashboard): clamp route tooltips to the viewport edge

Replace the fixed edge-left/edge-right coordinate thresholds with a
viewport-relative CSS shift derived from the car's --vehicle-vw, so an
on-track car's tooltip never clips off the full-bleed stage at any width,
including mobile 390. Adds a route-tooltip viewport regression test that
failed before this change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Pin the new CSS structure in the unit suite

The unit suite regex-asserts literal CSS structure. Add a meaningful assertion for the clamp and assert the brittle edge rules are gone; this replaces (does not weaken) the removed edge-class structure.

**Files:**
- Modify: `dashboard/tests/dashboard.test.mjs` (add one `test(...)` near the existing tooltip/atmosphere CSS assertions, ~L720)

**Interfaces:**
- Consumes: the module-level `BASE_STYLES` string (already used by neighboring tests; confirm its name at the top of the file before writing - if the base stylesheet global is named differently, use that name).
- Produces: `test('route tooltip clamps horizontally to the viewport instead of edge classes', ...)`.

- [ ] **Step 1: Confirm the styles global name**

Open `dashboard/tests/dashboard.test.mjs` and confirm the variable holding the raw `styles.css` contents (the file uses `BASE_STYLES` for the normalized-CSS assertions, e.g. the `z-index: 20` test). Use that exact name in Step 2.

- [ ] **Step 2: Write the assertion test**

Add:

```javascript
test('route tooltip clamps horizontally to the viewport instead of edge classes', () => {
  const css = BASE_STYLES.replace(/\s+/g, ' ');
  // The shift keeps the centered tooltip on-stage at any width.
  assert.match(css, /--tt-shift:\s*max\(\s*calc\([^)]*var\(--tt-gutter\)[^)]*var\(--tt-carx\)[^)]*var\(--tt-half\)[^)]*\),\s*min\(\s*0px,\s*calc\([^)]*100vw[^)]*var\(--tt-carx\)[^)]*var\(--tt-half\)[^)]*\)\s*\)/);
  // Both resting and revealed transforms consume the shift.
  assert.match(css, /\.session-tooltip \{[^}]*transform: translate\(calc\(-50% \+ var\(--tt-shift\)\), -\.25rem\)/);
  assert.match(css, /transform: translate\(calc\(-50% \+ var\(--tt-shift\)\), 0\)/);
  // The brittle coordinate-threshold edge rules are gone.
  assert.doesNotMatch(css, /\.edge-left \.session-tooltip/);
  assert.doesNotMatch(css, /\.edge-right \.session-tooltip/);
});
```

- [ ] **Step 3: Run the unit suite**

Run: `node --test dashboard/tests/*.test.mjs`
Expected: PASS, now 205 tests (204 baseline + 1). If the `--tt-shift` regex does not match, print the `.session-tooltip` block and adjust the regex to the exact whitespace/formatting emitted - do not weaken the intent (it must still pin the `max( ... min(0px, ... 100vw ...) )` shift and both shifted transforms).

- [ ] **Step 4: Commit**

```bash
git add dashboard/tests/dashboard.test.mjs
git commit -m "test(dashboard): assert the route-tooltip viewport clamp CSS structure

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Full-gate verification and manual visual confirmation

**Files:** none (verification only).

- [ ] **Step 1: Run every automated gate green**

- `node --test dashboard/tests/*.test.mjs` -> 205 pass
- `npm --prefix dashboard run routes:check` -> pass
- `npm --prefix dashboard run test:browser` (foreground, `timeout` 600000) -> all pass, both projects

- [ ] **Step 2: Manual - fixtures mode, desktop + mobile**

Start: `cd dashboard && python3 -m http.server 4173 --bind 127.0.0.1`, open `http://127.0.0.1:4173`.
- Select each track; hover/focus route cars sitting at the far left and far right of the track. Confirm the tooltip stays fully on-screen (no clip) at desktop width and at a narrowed window / mobile emulation (390px).
- Confirm pin (Enter/Space) shows and holds the tooltip, Escape clears it, and hovering pauses the car - all unchanged.

- [ ] **Step 3: Manual - live mode**

In its own terminal: `node dashboard/serve-live.mjs`; open the page and click "Go live". Confirm route tooltips stay on-screen through live `update()` ticks (cars re-sorting/moving), at desktop and mobile widths. Stop the server when done.

- [ ] **Step 4: Report evidence**

Summarize: pre-fix failure output (from Task 1), post-fix green runs (unit/routes/browser counts), and the manual desktop+mobile+live confirmation. Then proceed to `superpowers:finishing-a-development-branch`.

---

## Self-Review

**Spec coverage:**
- CSS-only viewport clamp -> Task 2 Steps 3-4. ✓
- Expose `--vehicle-vw`, drop edge toggles, keep `tooltip-up`, preserve `update()` path -> Task 2 Steps 1-2. ✓
- Route-only scope; pit + `tooltip-up` untouched -> Task 2 Step 4 explicitly leaves pit/tooltip-up/mobile rules; no pit files touched. ✓
- Mobile via same clamp -> viewport-relative rule; verified by mobile-chromium native sweep (Task 1/2) and manual Step 2. ✓
- Reproduce first, both projects, narrow-desktop check -> Task 1. ✓
- Unit assertion added, not weakened; edge assertions gone -> Task 3. ✓
- Full gate + manual fixtures/live -> Task 4. ✓
- Browser suite foreground `timeout` 600000 -> stated in Global Constraints and every browser step. ✓

**Placeholder scan:** No TBD/TODO; all code blocks are literal; regexes are concrete with a fallback instruction that preserves intent. ✓

**Type consistency:** `--vehicle-vw` (unitless string via `String(placement.x / 10)`) is set in both `makeCar` and `applyRouteCar` and read by `--tt-carx` in CSS; `--tt-gutter`/`--tt-half`/`--tt-carx`/`--tt-shift` names match between Task 2 CSS and Task 3 assertions. ✓
