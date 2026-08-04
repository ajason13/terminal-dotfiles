# Dashboard Full-Bleed Track Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reframe the Night Pass dashboard so the track is a full-bleed hero with a bottom pit lane of labeled bays and a slim header, without touching route geometry, session data, or the live-server.

**Architecture:** Pure presentation change. The render/update engine is entirely element-id driven, and every id it reads is preserved (relocated in the DOM, not removed). The work is an `index.html` restructure into four stacked regions (slim bar / full-bleed stage / pit lane / readout strip) plus a `styles.css` rewrite. `generated/route-motion.css`, the route configs, `route-geometry.mjs`, and all `.mjs` logic stay untouched.

**Tech Stack:** Vanilla ES modules, hand-written CSS, SVG. Node built-in test runner for unit tests; Playwright (desktop 1440x900 + mobile 390x844) for browser tests. No build step, no dependencies.

## Global Constraints

- No new npm dependencies. ES modules only. No em dashes anywhere (use a plain hyphen `-`).
- Presentation only: do NOT change the session data contract, collector, `normalizeImportedSnapshot`/import validation, or the live-server security model.
- Do NOT edit `dashboard/generated/route-motion.css` (generated) or any route geometry (`routes/*.route.mjs`, `scripts/compile-routes.mjs`, `src/generated/route-geometry.mjs`). `npm run routes:check` must stay green (byte-identical).
- Every id the JS reads must exist exactly once in `index.html`. Ids consumed by `app.mjs` (`exactlyOne`) and `render-dashboard.mjs` (`requiredMount`): `#dashboard-root`, `#track-select`, `#track-status`, `#track-live-region`, `#map-heading`, `#go-live`, `#snapshot-file`, `#reset-source`, `#source-controls`, `#source-label`, `#source-age`, `#source-notice`, `#snapshot-summary`, `#vehicle-layer`, `#tooltip-layer`, `#overflow-notice`, `#session-readout`, `#on-track-summary`, `#map-stage`, `#unknown-hold`, `#pit-error`, `#pit-permission`, `#pit-pitstop`, `#pit-unknown`, `#pit-error-overflow`, `#pit-permission-overflow`, `#pit-pitstop-overflow`, `#pit-unknown-overflow`. Plus the per-track art/centerline ids checked by `preflightDocument`: `#ridge-pass-art`/`#ridge-pass-centerline`, `#cypress-run-art`/`#cypress-run-centerline`, `#lantern-coil-art`/`#lantern-coil-centerline` (each art `<g data-track-art="...">`, each centerline a `<path fill="none" d="...">` inside its art, not nested).
- Invariants the existing browser suite enforces - MUST hold after the redesign:
  - `<h1>` text stays exactly `Night Pass Session Map` (do NOT shorten the heading text; style it small in the bar instead).
  - `#source-label`, `#snapshot-summary` ("... sessions") text semantics unchanged.
  - z-index: `.vehicle-anchor` (pinned/hover) stacking `3`, `.session-tooltip` `20`, `#overflow-notice` `12`.
  - `#map-stage` keeps every route car contained within its box; `stage.width > 300`, `stage.height > 500` on BOTH desktop and mobile; `document.documentElement.scrollWidth === clientWidth` (no horizontal page overflow).
  - No new browser console warnings/errors (the suite's `afterEach` asserts an empty diagnostics array).
- Fixtures mode and live mode both keep working; the incremental `update()` path (not full re-render) still preserves route-car CSS animations across the 5s live refresh.

---

### Task 1: Four-region structural layout (index.html + core CSS)

The load-bearing task. Rewrite the page into four stacked regions with all ids preserved, and rewrite the top-level layout CSS so the stage is full-bleed. Success is defined by the **existing** unit + browser suites passing against the new structure - that is what proves the id contract holds and the geometry survives full-bleed.

**Files:**
- Modify: `dashboard/index.html` (body structure, skip link, legend element)
- Modify: `dashboard/styles.css` (top-level layout: `#dashboard-root`, `#map-stage`, and new region wrappers; remove/replace `.dashboard-header`, `.dashboard-layout`, `.map-panel`, `.pit-stack` layout rules)

**Interfaces:**
- Consumes: the id list and preflight art/centerline contract from Global Constraints.
- Produces: DOM regions `header.dashboard-bar`, `main#map-stage.map-stage`, `section#pit-lane`, `footer.readout-strip` for later tasks to style internally. The SVG (`svg.route-map` with all three `.course-art` groups, `#vehicle-layer`, `#tooltip-layer`, `#overflow-notice`) moves intact into `#map-stage`.

- [ ] **Step 1: Audit the id contract before editing**

Run and read the output; every id below must appear in your new `index.html`:

```bash
cd dashboard
grep -oE "exactlyOne\(document(Ref)?, '#[^']+'\)|requiredMount\(root, '#?[^')]+'\)" src/app.mjs src/render-dashboard.mjs
grep -oE "querySelectorAll\(`#\$\{track\.(art|centerline)Id\}`\)" src/app.mjs
```

Expected: the ids enumerated in Global Constraints. Keep this list beside you while rewriting.

- [ ] **Step 2: Rewrite the `index.html` body into four regions**

Replace the current `.dashboard-header` + `main.dashboard-layout` (map-panel + aside.pit-stack) with the structure below. Move the entire existing `<svg class="route-map">...</svg>` (all three course-art groups unchanged) into `#map-stage`. Keep `window.__LIVE_TOKEN__` script and module script as-is. Retarget the skip link to `#pit-lane`.

```html
<a class="skip-link" href="#pit-lane">Skip to pit lane</a>
<div id="dashboard-root" class="dashboard-root" data-track-id="ridge-pass">
  <header class="dashboard-bar">
    <div class="brand">
      <h1>Night Pass Session Map</h1>
      <p id="source-label" class="mode-pill">Fixtures · Night sector</p>
    </div>
    <div class="bar-course">
      <label for="track-select">Course</label>
      <select id="track-select">
        <option value="auto">Auto · workday schedule</option>
        <option value="ridge-pass">Ridge Pass</option>
        <option value="cypress-run">Cypress Run</option>
        <option value="lantern-coil">Lantern Coil</option>
      </select>
      <span id="track-status" class="track-status">Active course: Ridge Pass</span>
      <span id="track-live-region" class="visually-hidden" aria-live="polite"></span>
    </div>
    <p id="snapshot-summary" class="snapshot-summary">Preparing the route…</p>
    <div id="on-track-summary" class="on-track-summary" aria-label="Route session summary"></div>
    <details class="legend-disclosure">
      <summary aria-label="Session state legend">?</summary>
      <ul class="state-legend" aria-label="Session state legend">
        <li class="legend-active"><span aria-hidden="true">›</span> Active</li>
        <li class="legend-thinking"><span aria-hidden="true">…</span> Thinking</li>
        <li class="legend-waiting"><span aria-hidden="true">!</span> Permission</li>
        <li class="legend-idle"><span aria-hidden="true">‖</span> Idle</li>
        <li class="legend-error"><span aria-hidden="true">×</span> Error</li>
        <li class="legend-complete"><span aria-hidden="true">✓</span> Complete</li>
        <li class="legend-unknown"><span aria-hidden="true">?</span> Unknown</li>
      </ul>
    </details>
    <section id="source-controls" class="source-controls" aria-label="Snapshot source">
      <label class="import-label" for="snapshot-file">Import</label>
      <input id="snapshot-file" type="file" accept=".json,application/json">
      <button id="reset-source" type="button">Fixtures</button>
      <button id="go-live" type="button" disabled>Go live</button>
      <span id="source-age" class="source-age"></span>
      <span id="source-notice" class="source-notice" role="status"></span>
    </section>
  </header>

  <main id="map-stage" class="map-stage" aria-labelledby="map-heading">
    <h2 id="map-heading" class="map-heading">Ridge Pass</h2>
    <svg class="route-map" viewBox="0 0 1000 760" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <!-- MOVE the existing defs + all three course-art groups here UNCHANGED -->
    </svg>
    <div id="vehicle-layer" class="vehicle-layer" aria-label="Sessions positioned on the route"></div>
    <div id="tooltip-layer" class="tooltip-layer"></div>
    <div id="overflow-notice" class="overflow-notice" hidden></div>
  </main>

  <section id="pit-lane" class="pit-lane" aria-label="Pit lane" tabindex="-1">
    <div class="pit-bay pit-error">
      <header><span aria-hidden="true">×</span><h2>Service Bay</h2></header>
      <div id="pit-error" class="pit-mount" aria-label="Error sessions"></div>
      <div id="pit-error-overflow" class="pit-overflow" hidden></div>
    </div>
    <div class="pit-bay pit-permission">
      <header><span aria-hidden="true">!</span><h2>Permission Checkpoint</h2></header>
      <div id="pit-permission" class="pit-mount" aria-label="Sessions waiting for permission"></div>
      <div id="pit-permission-overflow" class="pit-overflow" hidden></div>
    </div>
    <div class="pit-bay pit-stop">
      <header><span aria-hidden="true">‖</span><h2>Pit Stop</h2></header>
      <div id="pit-pitstop" class="pit-mount" aria-label="Idle and complete sessions"></div>
      <div id="pit-pitstop-overflow" class="pit-overflow" hidden></div>
    </div>
    <div class="pit-bay pit-hold">
      <section id="unknown-hold" class="unknown-hold" aria-label="Unclassified sessions" hidden>
        <header><span aria-hidden="true">?</span><h2>Unclassified hold</h2></header>
        <div id="pit-unknown" class="unknown-mount" aria-label="Unclassified sessions"></div>
        <div id="pit-unknown-overflow" class="pit-overflow" hidden></div>
      </section>
    </div>
  </section>

  <footer class="readout-strip">
    <div id="session-readout" class="session-readout">
      Focus or hover a car for exact activity time. Enter or Space pins; Escape clears.
    </div>
  </footer>
</div>
```

Note: `render-dashboard.mjs` sets `mapHeading.textContent` to the track title and toggles `#unknown-hold.hidden`; both still work by id. The `#unknown-hold` starts `hidden` (matches prior behavior). Keep the `.visually-hidden` utility class in CSS.

- [ ] **Step 3: Rewrite the top-level layout CSS**

In `styles.css`, replace the `.dashboard-header` / `.dashboard-layout` / `.map-panel` / `.pit-stack` layout rules with a four-row column and a full-bleed stage. Keep all car/route/tooltip/animation rules and the `:root` variables. Minimum core:

```css
.dashboard-root {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto auto; /* bar, stage, lane, readout */
  min-height: 100vh;
  min-height: 100dvh;
}
.dashboard-bar {
  display: flex; align-items: center; gap: 12px; flex-wrap: nowrap;
  padding: 6px 14px; border-bottom: 1px solid var(--color-border, #22314a);
}
.map-stage {
  position: relative;
  min-height: 0;      /* allow the grid row to bound it */
  width: 100%;
}
.map-stage .route-map,
.map-stage .vehicle-layer,
.map-stage .tooltip-layer { position: absolute; inset: 0; width: 100%; height: 100%; }
.pit-lane { display: grid; grid-template-columns: 1fr 1fr 1fr 0.8fr; gap: 10px; padding: 8px 14px; border-top: 2px dashed var(--color-border, #35507a); }
.readout-strip { padding: 4px 14px; border-top: 1px solid var(--color-border, #1a2740); }
```

Drop the old `.map-stage { min-height: 580px; height: 580px; }` fixed sizing (desktop) so the stage flex-fills the grid row. Keep the `:root`, car, route, tooltip, and `@media` motion rules; later tasks refine the bar/lane/readout internals and the mobile queries.

- [ ] **Step 4: Verify unit tests and routes stay green**

```bash
cd dashboard
node --test tests/*.test.mjs
npm run routes:check
find . -path ./node_modules -prune -o -name '*.mjs' -type f -exec node --check {} \;
```

Expected: 202 unit tests pass, `routes: generated artifacts are current`, no `node --check` errors. (Unit tests build DOM from `dom-fake.mjs` whose id list is unchanged, so they must pass untouched.)

- [ ] **Step 5: Verify the existing browser suite passes against the new structure**

```bash
cd dashboard
npm exec -- playwright install chromium   # once per machine
npm run test:browser
```

Expected: all existing specs green on both projects. This proves: every JS-read id resolves (no boot `application-failure`), cars stay contained in the full-bleed `#map-stage`, `stage.height > 500` on desktop AND mobile, no horizontal document overflow, and the `layout boundaries` selector/status non-overlap holds. If `stage.height > 500` fails on mobile, the chrome (bar + lane + readout) is eating too much height - reduce lane/bar padding here; the full budget fix lands in Task 5.

- [ ] **Step 6: Commit**

```bash
git add dashboard/index.html dashboard/styles.css
git commit -m "feat(dashboard): restructure into full-bleed four-region layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Slim bar composition + folded legend

Style the bar internals so it reads as one slim strip, and make the legend a working disclosure.

**Files:**
- Modify: `dashboard/styles.css` (`.dashboard-bar` internals: `.brand`, `h1`, `.mode-pill`, `.bar-course`, `.snapshot-summary`, `.on-track-summary`, `.legend-disclosure`, `.source-controls`)
- Create: `dashboard/tests/browser/full-bleed-layout.spec.mjs` (new specs for the redesigned chrome)

**Interfaces:**
- Consumes: the `header.dashboard-bar` structure from Task 1.
- Produces: `full-bleed-layout.spec.mjs` with a shared `page.goto('/')` + `await expect(page.locator('#snapshot-summary')).toContainText('24 sessions')` beforeEach, extended by Tasks 3-5.

- [ ] **Step 1: Write the failing bar test**

Create `dashboard/tests/browser/full-bleed-layout.spec.mjs`:

```js
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#snapshot-summary')).toContainText('24 sessions');
});

test('the header is one slim bar with the essentials', async ({ page }) => {
  const bar = page.locator('.dashboard-bar');
  const box = await bar.boundingBox();
  expect(box.height).toBeLessThanOrEqual(64); // slim on desktop
  await expect(page.locator('.dashboard-bar h1')).toHaveText('Night Pass Session Map');
  await expect(page.locator('.dashboard-bar #track-select')).toBeVisible();
  await expect(page.locator('.dashboard-bar #go-live')).toBeVisible();
  await expect(page.locator('.dashboard-bar #snapshot-summary')).toBeVisible();
});

test('the legend is folded behind a disclosure until opened', async ({ page }) => {
  const legend = page.locator('.legend-disclosure .state-legend');
  await expect(legend).toBeHidden();
  await page.locator('.legend-disclosure summary').click();
  await expect(legend).toBeVisible();
  await expect(page.locator('.legend-disclosure .state-legend li')).toHaveCount(7);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd dashboard && npm run test:browser -- full-bleed-layout
```

Expected: FAIL (bar too tall / unstyled, or legend not collapsing) before the CSS lands.

- [ ] **Step 3: Style the bar and legend disclosure**

Add to `styles.css`. Keep `h1` semantics but small; make the legend a native disclosure (no JS):

```css
.dashboard-bar h1 { font-size: 0.95rem; margin: 0; letter-spacing: 0.01em; }
.brand { display: flex; align-items: baseline; gap: 8px; }
.mode-pill { margin: 0; font-size: 0.7rem; padding: 1px 8px; border-radius: 999px;
  border: 1px solid var(--color-border, #2f6a4a); }
.bar-course { display: flex; align-items: center; gap: 6px; }
.snapshot-summary { margin: 0; font-size: 0.75rem; white-space: nowrap; }
.on-track-summary { display: flex; gap: 8px; }
.source-controls { margin-left: auto; display: flex; align-items: center; gap: 8px; }
.legend-disclosure { position: relative; }
.legend-disclosure > summary { list-style: none; cursor: pointer; width: 22px; height: 22px;
  display: inline-flex; align-items: center; justify-content: center; border-radius: 50%;
  border: 1px solid var(--color-border, #3a4c6b); }
.legend-disclosure > summary::-webkit-details-marker { display: none; }
.legend-disclosure[open] > .state-legend { position: absolute; z-index: 30; top: 26px; right: 0;
  display: flex; flex-direction: column; gap: 4px; padding: 10px; border-radius: 8px;
  background: var(--color-panel, #0c1830); border: 1px solid var(--color-border, #22314a); }
.state-legend { list-style: none; margin: 0; }
```

Ensure the `.state-legend` default (closed) state is hidden: since it lives inside `<details>`, the browser hides it when closed - no extra rule needed. Verify the bar does not wrap on desktop (`flex-wrap: nowrap` from Task 1); if content is too wide at 1440, shrink gaps/font, do not wrap (mobile wrap is Task 5).

- [ ] **Step 4: Run to verify it passes**

```bash
cd dashboard && npm run test:browser -- full-bleed-layout
```

Expected: PASS (both new tests) on desktop; on mobile the bar-height assertion may need the `<= 64` relaxed - if so, guard the height check with `test.skip(page.viewportSize().width <= 759)` and cover mobile in Task 5.

- [ ] **Step 5: Commit**

```bash
git add dashboard/styles.css dashboard/tests/browser/full-bleed-layout.spec.mjs
git commit -m "feat(dashboard): slim header bar with folded legend disclosure

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Pit lane bays

Style the four pit pools as labeled bays in the bottom lane, and keep overflow calm and in-bay.

**Files:**
- Modify: `dashboard/styles.css` (`.pit-lane`, `.pit-bay`, `.pit-bay > header`, `.pit-mount`, `.unknown-mount`, `.pit-overflow`, and the existing `.overflow-toggle`/`.overflow-list` restyle to sit inside a bay)
- Modify: `dashboard/tests/browser/full-bleed-layout.spec.mjs`

**Interfaces:**
- Consumes: the `section#pit-lane` + four `.pit-bay` structure from Task 1.
- Produces: pit lane visual layout; no JS change (pit cars still mount into `#pit-error/permission/pitstop/unknown` by id).

- [ ] **Step 1: Write the failing pit-lane test**

Append to `full-bleed-layout.spec.mjs`:

```js
test('the pit lane is a row of four labeled bays below the stage', async ({ page }) => {
  const bays = page.locator('.pit-bay');
  await expect(bays).toHaveCount(4);
  const stage = await page.locator('#map-stage').boundingBox();
  const lane = await page.locator('#pit-lane').boundingBox();
  expect(lane.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1); // lane sits below the stage
  for (const label of ['Service Bay', 'Permission Checkpoint', 'Pit Stop']) {
    await expect(page.locator('.pit-bay header h2', { hasText: label })).toBeVisible();
  }
});

test('parked (pit) cars mount inside a pit bay, not on the stage', async ({ page }) => {
  const pitCars = page.locator('.pit-mount .pit-vehicle, .unknown-mount .pit-vehicle');
  const count = await pitCars.count();
  expect(count).toBeGreaterThan(0); // fixtures populate pit pools
  const strays = await page.locator('#vehicle-layer .pit-vehicle').count();
  expect(strays).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd dashboard && npm run test:browser -- full-bleed-layout
```

Expected: FAIL on lane-below-stage / bay layout before CSS.

- [ ] **Step 3: Style the bays and in-bay overflow**

```css
.pit-bay { display: flex; flex-direction: column; gap: 4px; min-width: 0;
  border: 1px solid var(--color-border, #4a5c7d); border-radius: 8px;
  background: var(--color-panel, #0f1c30); padding: 6px 8px; }
.pit-bay > header { display: flex; align-items: center; gap: 6px; }
.pit-bay h2 { font-size: 0.72rem; margin: 0; white-space: nowrap; }
.pit-mount { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.unknown-mount { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.pit-hold .unknown-hold[hidden] { display: none; }
.pit-overflow { margin-top: 2px; }
/* keep the existing calm collapsed overflow-details styling; ensure it fits a bay */
.pit-overflow .overflow-toggle { font-size: 0.68rem; }
```

Reuse the existing `.overflow-toggle`/`.overflow-list`/`.overflow-item` rules already in `styles.css` (do not duplicate; adjust only sizing so they read inside a bay). Keep the unknown bay's 3-column sub-grid (matches `render-dashboard.mjs`, which sets `gridColumn` on unknown anchors).

- [ ] **Step 4: Run to verify it passes**

```bash
cd dashboard && npm run test:browser -- full-bleed-layout
```

Expected: PASS. Also re-run the full suite to confirm no regression to the stage-geometry tests:

```bash
npm run test:browser
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add dashboard/styles.css dashboard/tests/browser/full-bleed-layout.spec.mjs
git commit -m "feat(dashboard): render pit pools as a bottom pit lane of labeled bays

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Readout strip, map-heading overlay, route-overflow pill

Move the session readout to a persistent bottom strip, make `#map-heading` a subtle stage-corner label, and style `#overflow-notice` as a calm corner pill (preserving z-index 12).

**Files:**
- Modify: `dashboard/styles.css` (`.readout-strip`, `.session-readout`, `.map-heading`, `.overflow-notice`)
- Modify: `dashboard/tests/browser/full-bleed-layout.spec.mjs`

**Interfaces:**
- Consumes: `footer.readout-strip > #session-readout`, `#map-heading` inside `#map-stage`, `#overflow-notice` inside `#map-stage` from Task 1.
- Produces: the readout status behavior in its new location; no JS change (`renderReadout` already targets `#session-readout`).

- [ ] **Step 1: Write the failing readout test**

Append to `full-bleed-layout.spec.mjs`:

```js
test('focusing a route car updates the bottom readout strip; Escape clears it', async ({ page }) => {
  const readout = page.locator('.readout-strip #session-readout');
  await expect(readout).toContainText('Focus or hover'); // neutral default
  const button = page.locator('.vehicle-anchor .session-car').first();
  await button.focus();
  await expect(readout.locator('.readout-identity')).toBeVisible();
  await button.press('Enter');            // pin
  await expect(page.locator('.vehicle-anchor[data-pinned="true"]')).toHaveCount(1);
  await page.keyboard.press('Escape');    // clear pin
  await expect(page.locator('.vehicle-anchor[data-pinned="true"]')).toHaveCount(0);
});

test('the route-overflow notice keeps z-index 12 and the map heading names the course', async ({ page }) => {
  await expect(page.locator('#map-heading')).toHaveText('Ridge Pass');
  const z = await page.locator('#overflow-notice').evaluate((el) => getComputedStyle(el).zIndex);
  expect(z).toBe('12');
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd dashboard && npm run test:browser -- full-bleed-layout
```

Expected: FAIL (readout not in strip / overflow z-index unset) before CSS.

- [ ] **Step 3: Style the readout strip, heading overlay, and overflow pill**

```css
.readout-strip { display: flex; align-items: center; min-height: 22px; }
.session-readout { display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.75rem; margin: 0; }
.readout-identity { font-weight: 600; }
.map-heading { position: absolute; z-index: 4; top: 8px; left: 12px; margin: 0;
  font-size: 0.72rem; letter-spacing: 0.16em; text-transform: uppercase;
  opacity: 0.7; pointer-events: none; }
.overflow-notice { position: absolute; z-index: 12; top: 8px; right: 12px;
  max-width: 40%; border-radius: 999px; }
.overflow-notice[hidden] { display: none; }
```

Confirm `render-dashboard.mjs` emits `.readout-identity` inside `#session-readout` (it does, via `renderReadout`); the test relies on that class. Keep `#overflow-notice` inside `#map-stage` so `position: absolute` anchors to the stage.

- [ ] **Step 4: Run to verify it passes**

```bash
cd dashboard && npm run test:browser -- full-bleed-layout
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add dashboard/styles.css dashboard/tests/browser/full-bleed-layout.spec.mjs
git commit -m "feat(dashboard): persistent bottom readout, corner map heading and overflow pill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Mobile reflow

Fold the bar, drop the pit lane to a 2x2 grid, and wrap the readout at the mobile breakpoint, keeping the stage tall enough and the page free of horizontal overflow.

**Files:**
- Modify: `dashboard/styles.css` (the `@media (max-width: 759px)` block, plus `959px` if the bar needs to wrap earlier)
- Modify: `dashboard/tests/browser/full-bleed-layout.spec.mjs`

**Interfaces:**
- Consumes: all region structure/styling from Tasks 1-4.
- Produces: the responsive layout; no JS change.

- [ ] **Step 1: Write the failing mobile test**

Append to `full-bleed-layout.spec.mjs`:

```js
test('mobile stacks the bar, uses a 2x2 pit lane, and never overflows horizontally', async ({ page }) => {
  test.skip(page.viewportSize().width > 759, 'mobile project only');
  const overflow = await page.evaluate(() => (
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  ));
  expect(overflow).toBe(0);
  const stage = await page.locator('#map-stage').boundingBox();
  expect(stage.height).toBeGreaterThan(500); // stage stays the hero within the chrome budget
  const columns = await page.locator('#pit-lane').evaluate((el) => (
    getComputedStyle(el).gridTemplateColumns.split(' ').length
  ));
  expect(columns).toBe(2); // 2x2 bays on mobile
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd dashboard && npm run test:browser -- full-bleed-layout --project=mobile-chromium
```

Expected: FAIL (4-column lane / stage too short) before the media query.

- [ ] **Step 3: Add the mobile media rules**

In the `@media (max-width: 759px)` block (keep the existing cypress-run clearance rules already there):

```css
@media (max-width: 759px) {
  .dashboard-bar { flex-wrap: wrap; gap: 6px 10px; }
  .snapshot-summary, .on-track-summary { flex-basis: 100%; }
  .source-controls { margin-left: 0; }
  .pit-lane { grid-template-columns: 1fr 1fr; gap: 8px; padding: 6px 10px; }
  .session-readout { font-size: 0.72rem; }
}
```

Budget check: at 844px tall the chrome (wrapped bar + 2x2 lane + readout) must leave `#map-stage` > 500px. If it does not, tighten bay padding / limit the pit-mount to 2 visible rows on mobile. Do not shrink the 44px mobile car hit-target (compiler-owned).

- [ ] **Step 4: Run to verify it passes**

```bash
cd dashboard && npm run test:browser -- --project=mobile-chromium
```

Expected: the new mobile test PASSES and every existing mobile motion/clearance spec stays green (they measure relative to `#map-stage`, which remains tall and contained).

- [ ] **Step 5: Commit**

```bash
git add dashboard/styles.css dashboard/tests/browser/full-bleed-layout.spec.mjs
git commit -m "feat(dashboard): mobile reflow - wrapped bar, 2x2 pit lane, contained stage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Reference screenshots, docs, and full-suite verification

Refresh the tracked reference screenshots for the new layout, update the docs that describe it, and run every gate.

**Files:**
- Modify (regenerate): `dashboard/tests/screenshots/desktop-lantern-coil.png`, `dashboard/tests/screenshots/mobile-lantern-coil.png`
- Modify: `dashboard/tests/BROWSER_VERIFICATION.md` (layout description), `dashboard/README.md` (the "Architecture" paragraphs describing the header/panel/pit-stack layout)

**Interfaces:**
- Consumes: the finished layout from Tasks 1-5.
- Produces: current tracked screenshots and docs; the final green state for the PR.

- [ ] **Step 1: Regenerate the tracked reference screenshots**

The screenshot spec only writes when `DASHBOARD_UPDATE_SCREENSHOTS=1` (it does not assert), so this refreshes the tracked PNGs to the new layout:

```bash
cd dashboard
DASHBOARD_UPDATE_SCREENSHOTS=1 npm run test:browser -- dashboard --grep "neutral Lantern Coil reference"
git status --short tests/screenshots
```

Expected: both `desktop-lantern-coil.png` and `mobile-lantern-coil.png` show as modified.

- [ ] **Step 2: Update the docs**

In `README.md`, revise the paragraphs that describe the old layout (the header + map-panel + `aside.pit-stack` / "Service Bay, Permission Checkpoint, and the shared idle/complete Pit Stop each use six stationary anchors" section) to describe the full-bleed stage + bottom pit lane + slim bar. In `tests/BROWSER_VERIFICATION.md`, update any layout/landmark description and the manual steps so they match the new regions and the folded legend. Keep all data/security wording unchanged (no behavior changed).

- [ ] **Step 3: Run every gate**

```bash
cd dashboard
node --test tests/*.test.mjs
npm run routes:check
find . -path ./node_modules -prune -o -name '*.mjs' -type f -exec node --check {} \;
npm run test:browser
```

Expected: 202 unit pass; routes current; no `node --check` errors; all browser specs green on both projects.

- [ ] **Step 4: Manual confirmation (fixtures + live + mobile)**

```bash
# fixtures
python3 -m http.server 4173 --bind 127.0.0.1 --directory dashboard   # open http://127.0.0.1:4173/
# live (real tmux) - separate run
node dashboard/serve-live.mjs                                        # open printed URL, click "Go live"
```

Confirm visually: full-bleed track with cars animating; bottom pit lane bays populate; Go-live updates in place without restarting car animations (watch a route car keep moving across a 5s refresh); folded legend opens/closes; readout updates on hover/focus/pin; narrow-window reflow to 2x2. Note results in the PR.

- [ ] **Step 5: Commit**

```bash
git add dashboard/tests/screenshots dashboard/README.md dashboard/tests/BROWSER_VERIFICATION.md
git commit -m "docs(dashboard): refresh screenshots and layout docs for full-bleed redesign

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Full-bleed track (spec decision 1) -> Task 1 (stage full-bleed) + geometry-suite proof.
- Bottom pit lane of labeled bays (decision 2) -> Task 3.
- Slim header, no clock (decision 3) -> Tasks 1-2 (no clock element is ever added).
- Folded legend (decision 4) -> Task 2 (native `<details>`).
- Readout -> bottom strip (decision 5) -> Task 4.
- Calm overflow, in-bay + route corner pill (decision 6) -> Task 3 (in-bay) + Task 4 (route pill).
- Mobile reflow (decision 7) -> Task 5.
- Reference screenshots + docs (spec Testing) -> Task 6.
- Assumption "no JS logic change" -> proven by Task 1 Step 4-5 (unchanged unit `dom-fake` id list + existing browser suite pass). If a required id were missing, boot throws and Task 1 Step 5 fails.
- Assumption "aspect-ratio stretch acceptable" -> Task 1 Step 5 runs the container-relative geometry sweeps; if they fail, apply the spec's fallback (constrain stage `max-width`/`aspect-ratio`) within Task 1.
- Assumption "Playwright is the churn" -> Tasks 2-5 add `full-bleed-layout.spec.mjs`; unit + routes stay untouched.

**Placeholder scan:** No TBD/TODO; every CSS and test step has concrete content. Overflow-in-bay reuses named existing classes (`.overflow-toggle`, `.overflow-list`, `.overflow-item`) rather than restating them.

**Type/name consistency:** Region class names (`.dashboard-bar`, `.map-stage`, `#pit-lane`, `.pit-bay`, `.readout-strip`, `.legend-disclosure`, `.pit-vehicle`, `.readout-identity`, `.vehicle-anchor`) are used identically across HTML (Task 1) and every test/CSS reference (Tasks 2-5). `.pit-vehicle` and `.readout-identity` are existing render-dashboard output classes, not new inventions. `#map-heading` text "Ridge Pass" matches the default track title asserted in Task 4.
