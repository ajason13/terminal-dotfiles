# Dashboard browser verification

This is a manual, `playwright-cli`-driven browser procedure. It is not an
automated browser test suite. The dependency-free Node tests cover contracts
and injected lifecycle/process boundaries; this procedure records real browser
layout, interaction, accessibility, motion, and console evidence.

## Prepare fresh synthetic inputs

In the browser terminal, start one shell at the repository root and keep using
that same shell for fixture generation, every `playwright-cli` command, and
cleanup:

```sh
DASHBOARD_BROWSER_FIXTURES="$(mktemp -d /tmp/night-pass-browser.XXXXXX)"
node dashboard/tests/generate-browser-fixtures.mjs "$DASHBOARD_BROWSER_FIXTURES"
```

The generator uses the current `new Date().toISOString()` value for top-level
`observedAt` and every activity timestamp. It creates:

- `$DASHBOARD_BROWSER_FIXTURES/live-valid.json`: schema v2 with active,
  permission, and four unknown sessions, including one unknown overflow;
- `$DASHBOARD_BROWSER_FIXTURES/live-invalid.json`: schema v1, for rejection.

The Node test imports the generator with an injected timestamp, validates the
valid output using that same clock, rejects the invalid output, and removes its
temporary files.

## Start loopback preview and browser

In the separate preview-server terminal, run only:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dashboard
```

Back in the original browser terminal—the same shell where
`DASHBOARD_BROWSER_FIXTURES` was defined—run:

```sh
playwright-cli -s=dashboard-live open http://127.0.0.1:4173/
playwright-cli -s=dashboard-live resize 1440 900
```

## Desktop lifecycle and assertions

Run the lifecycle in this exact order:

1. Confirm initial `Fixtures · Night sector` and 24 session buttons.
2. Import `live-valid.json`.
3. Import `live-valid.json` again.
4. Import `live-invalid.json`; confirm exactly
   `Live snapshot rejected; showing fixtures.` and 24 fixture buttons.
5. Import `live-valid.json` again.
6. Activate **Reset to fixtures** and confirm 24 fixture buttons with no
   rejection notice.

Example import:

```sh
playwright-cli -s=dashboard-live run-code "async page => {
  await page.locator('#snapshot-file').setInputFiles('${DASHBOARD_BROWSER_FIXTURES}/live-valid.json');
  await page.waitForFunction(() => document.querySelector('#source-label').textContent.startsWith('Live'));
}"
```

For each transition, inspect source and age labels, actual input
`disabled`/`aria-busy` settlement, duplicate-node absence, and cleared pinned
state. For live mode assert three rendered unknown cars, one explicit
Unclassified-hold overflow, and a visible distinct dashed `?` region.

Keyboard/accessibility checks:

```sh
playwright-cli -s=dashboard-live reload
playwright-cli -s=dashboard-live press Tab
playwright-cli -s=dashboard-live press Tab
```

The second Tab focuses `#snapshot-file`; its visible label must compute a solid
3px focus outline. The import label and reset button must each measure at least
44px high. Focus a session car, press Enter, confirm `aria-pressed=true`, press
Escape, and confirm `aria-pressed=false`. Accessible labels must contain the
sanitized display name, state, and placement without interpreting markup.

Geometry assertions at 1440x900:

- document scroll width equals client width;
- route-car positions sampled at least one second apart change in the forward
  Summit -> Ridge -> Cedar -> Lower direction while cars remain centered over
  the roadway;
- distinct session controls do not overlap at the canonical starting phases;
- map, pits, Unclassified hold, tooltips, and overflow notices remain inside
  their intended bounds;
- the Unclassified hold bottom remains inside the viewport;
- source controls remain secondary to the map.

Motion checks:

```sh
playwright-cli -s=dashboard-live run-code "async page => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
}"
playwright-cli -s=dashboard-live run-code "async page => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
}"
```

Route wrappers must compute to `touge-traverse` normally, and sampled positions
must advance over time. Hover, focus, and pinned states must compute
`animation-play-state: paused` and preserve the same sampled position.
Active nested motion may compute to `active-nudge`, while thinking retains
`thinking-drift`. Parked and unknown cars must not move between samples.
Reduced motion must set both route traversal and nested car motion to `none`,
leaving route cars at their deterministic static anchors.

Capture synthetic-only desktop evidence:

```sh
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/desktop.png
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/desktop-live.png
```

## Mobile lifecycle and assertions

```sh
playwright-cli -s=dashboard-live resize 390 844
```

Repeat fixtures -> live -> live -> rejected fixtures -> live -> fixtures using
the generated files. Repeat keyboard focus, Enter/Escape, normal/reduced
motion, source/age/rejection labels, and unknown overflow checks.

At 390x844 assert:

- document scroll width equals client width;
- no car controls overlap;
- route cars advance between samples while remaining centered over the scaled
  roadway and inside the map bounds;
- map precedes all pit regions;
- long synthetic names and overflow details wrap without clipping;
- import label and reset button are at least 44px high;
- the focused hidden file input produces the visible 3px label outline.

Capture synthetic-only mobile evidence:

```sh
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/mobile.png
playwright-cli -s=dashboard-live screenshot --filename dashboard/tests/screenshots/mobile-live.png --full-page
```

At the end, require:

```sh
playwright-cli -s=dashboard-live console warning
```

Expected result: zero errors and zero warnings.

## Cleanup

In that same browser terminal, so the fixture variable still expands:

```sh
playwright-cli -s=dashboard-live close
rm "$DASHBOARD_BROWSER_FIXTURES/live-valid.json"
rm "$DASHBOARD_BROWSER_FIXTURES/live-invalid.json"
rmdir "$DASHBOARD_BROWSER_FIXTURES"
```

Stop the preview server with `Ctrl-C`. `playwright-cli list` must show no
browsers. Remove `.playwright-cli/` if the tool created local session
artifacts.

## Manual-only caveats

- Browser coverage above is manually driven and recorded, not an automated
  Playwright suite.
- The user's real/default tmux server is never queried during verification.
- Executable, socket, process, parser, error, and privacy behavior is tested
  through injected synthetic boundaries.
- Node's own child-process `maxBuffer` enforcement is exercised by an isolated
  `process.execPath -e` child that emits more than 1 MiB of valid framed
  synthetic records through the collector's injected callback. A second test
  simulates the callback error directly, and the parser record-count rejection
  separately uses a real concatenated synthetic `Buffer`.
- Screenshots contain synthetic fixture/generated data only.

## Latest manual result

On 2026-07-22, `playwright-cli` completed the documented lifecycle at 1440x900
and 390x844 using files freshly produced in a `mktemp` directory:

- fixtures/live/live/rejected fixtures/live/fixtures produced 24/5/5/24/5/24
  rendered controls (the sixth live session was the explicit unknown overflow);
- the three unknown anchors and one independent overflow rendered at both
  sizes;
- route wrappers computed to `touge-traverse`; fixture and fresh-live route
  cars advanced between temporal samples (the fresh-live car moved 59.82px in
  900ms);
- a 500ms-step sweep across the complete 64-second lap at both viewports
  produced zero overlaps, zero visible car centers outside the SVG road stroke,
  and zero visible controls outside the map (128 samples across 12 route cars);
- desktop route controls measured 52px and mobile route controls measured the
  accessible 44px minimum; horizontal overflow was zero;
- the desktop Unclassified hold bottom was 879.09px within the 900px viewport;
- source controls measured 44px, and keyboard focus on the real file input
  produced a solid 3px outline on its visible label;
- focus, hover, and pinning each paused traversal with zero sampled movement;
  Enter pinned and Escape cleared;
- nested active motion was `active-nudge`, thinking motion remained
  `thinking-drift`, all parked samples moved zero, and reduced motion disabled
  both wrapper and nested animations with zero route movement;
- the source age was fresh at zero minutes;
- the console contained zero errors and zero warnings.

`desktop-live.png` and `mobile-live.png` were refreshed from that generated
synthetic input. The browser, preview server, generated JSON files, temporary
directory, and local Playwright session artifacts were removed afterward.
