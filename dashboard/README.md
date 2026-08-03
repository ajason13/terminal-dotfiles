# Night Pass Session Map

This directory contains an optional local visual progress dashboard. It starts
in its deterministic fixture mode. A separate, one-shot collector can export a
sanitized observation from the current user's default tmux server; the browser
reads that JSON only after an explicit file selection.

Nothing here is installed, loaded, or started by WezTerm, tmux, the wallpaper
workflow, or the LLM-status process. There is no polling, daemon, backend,
terminal control, pane-content access, persistence, telemetry, or remote
service.

## Export a one-shot snapshot (optional)

The collector is dependency-free and opt-in. It targets the byte-length
behavior verified for tmux 3.7. On macOS with Homebrew tmux at
`/opt/homebrew/bin/tmux` or `/usr/local/bin/tmux`, and only when the current
user's default socket passes the ownership/type checks, run from the repository
root:

```sh
node dashboard/export-tmux.mjs /tmp/dashboard-tmux-snapshot.json
```

The collector makes exactly one hardened `list-panes -a` call. It reads pane
metadata only: socket/server epoch identifiers, tmux IDs, window name, pane
index, pane title, and current command. It never reads pane content or history.
The emitted file contains opaque stable IDs, sanitized display names derived
only from window name plus pane index, inferred state, provenance, confidence,
and one observation timestamp. Raw titles, commands, sockets, tmux IDs, and
server times are never emitted.

The exporter writes a same-directory temporary file with mode `0600`, flushes
and closes the complete snapshot, and then atomically replaces the named
regular file. If collection, writing, or replacement fails, it exits nonzero,
prints one closed error code to stderr, removes its temporary file when the
filesystem permits, and preserves any previously valid destination. The
destination must be an absolute path in an existing safe, writable directory;
directories, symlinks, and special-file destinations are rejected.

The implementation deliberately fails closed on non-macOS layouts, custom
sockets/server names, alternate tmux paths, unsafe executables/sockets,
timeouts, stderr, malformed or oversized output, or any validation error. A
failure writes one closed error code to stderr, exits nonzero, and writes
nothing to stdout.

## Live auto-refresh (opt-in)

`node serve-live.mjs` starts a server bound to 127.0.0.1 that serves the
dashboard and one read-only endpoint, `GET /live/snapshot`, which runs the same
one-shot collector on each request. Open the printed URL, click "Go live", and
the dashboard polls every 5 seconds.

This mode deliberately reverses the no-server / no-polling transport boundary
the rest of this dashboard holds to. It is opt-in and off by default: nothing
starts it automatically, and the export-and-import workflow above remains the
default. Every fetched payload passes the same validation as an imported file
(hashed IDs, closed status enum, no pane content, size and age bounds), so the
data guarantees are unchanged - only the transport is new.

Hardening: loopback-only bind, a Host-header allowlist (DNS-rebinding defense),
cross-site request rejection, and a per-process token required on the endpoint.
The server writes nothing to disk and stops on Ctrl-C.

## Import and run

Start the loopback-only static preview:

```sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory dashboard
```

Open <http://127.0.0.1:4173/>. The map initially shows fixtures. Choose
**Import live snapshot**, select `/tmp/dashboard-tmux-snapshot.json`, and wait
for validation. A valid schema-v2 snapshot replaces the map and shows its
observed age. An invalid, stale, future-dated, oversized, schema-v1, or modified
file is rejected as a whole and fresh fixtures are rendered with a rejection
notice. **Reset to fixtures** explicitly returns to fixture mode.

To refresh, rerun the one-shot export command and then explicitly choose
**Import live snapshot** and select the file again. The browser does not reread
the previously selected file automatically.

The browser never discovers or executes tmux, rereads an imported file, or
refreshes session data. The successful-live-source interval updates only the
displayed age label. The dashboard is intended for daily use from 08:30 through
16:30 browser-local time, but it does not close or disable itself outside those
hours. In course **Auto** mode, one independent one-shot timeout switches the
visual course at 08:30 and 12:30. Before opening and after closing, the current
deterministic course remains selected and the timeout targets the next 08:30
opening; there is no overnight churn. Manual course mode has no boundary
timeout. Course choice is tab-only and is never stored. Stop the preview with
`Ctrl-C`.

## Verify

Route geometry is authored only in `dashboard/routes/`. Regenerate the checked-in
catalog/SVG artifact and responsive motion stylesheet after changing a route,
then verify that committed outputs are current:

```sh
npm --prefix dashboard run routes:write
npm --prefix dashboard run routes:check
```

`routes:check` performs a byte-for-byte in-memory comparison and never writes.
The compiler is dependency-free; route generation does not use browser SVG
APIs, network access, session data, or terminal processes.

Run syntax checks for every JavaScript module:

```sh
find dashboard -path dashboard/node_modules -prune -o -name '*.mjs' -type f -exec node --check {} \;
```

Run all dependency-free tests:

```sh
node --test dashboard/tests/*.test.mjs
```

Install the dashboard-local browser-test tooling once, including its Chromium
binary, then run the fixture-only browser suite:

```sh
npm --prefix dashboard ci
npm --prefix dashboard exec -- playwright install chromium
npm --prefix dashboard run test:browser
```

The Playwright runner owns a loopback-only static server for the test lifetime,
uses no real or generated live snapshots, and shuts the server down after the
run. It covers Chromium at 1440x900 and 390x844. Failure screenshots, traces,
and the HTML report are written under ignored dashboard-local result
directories; intentional manual reference screenshots remain tracked.

Build, lint, and type-check commands are **N/A**. The browser-native app still
has no framework, runtime dependency, generated bundle, or build toolchain.
`dashboard/package.json` is dev-only browser-test tooling and is never loaded
by the dashboard.

## Reproduce browser verification

Browser verification uses fresh synthetic files so committed data never ages
into invalidity:

```sh
DASHBOARD_BROWSER_FIXTURES="$(mktemp -d /tmp/night-pass-browser.XXXXXX)"
node dashboard/tests/generate-browser-fixtures.mjs "$DASHBOARD_BROWSER_FIXTURES"
python3 -m http.server 4173 --bind 127.0.0.1 --directory dashboard
```

Use the two generated paths printed by the helper for the valid and rejection
imports. The automated suite covers the stable fixture UI and core interaction
regressions. The fuller manual `playwright-cli` procedure retains live-import,
accessibility, exhaustive route sweep, geometry, and reference-screenshot
checks in
[`tests/BROWSER_VERIFICATION.md`](tests/BROWSER_VERIFICATION.md). After closing
the browser and preview server, remove both generated files and their directory:

```sh
rm "$DASHBOARD_BROWSER_FIXTURES/live-valid.json"
rm "$DASHBOARD_BROWSER_FIXTURES/live-invalid.json"
rmdir "$DASHBOARD_BROWSER_FIXTURES"
```

## Architecture

Fixture startup remains:

```text
fixed schema-v1 fixture -> FixtureSessionAdapter -> normalizeSnapshot -> render
```

The optional path is:

```text
one hardened tmux call -> byte-frame parser -> classifier/sanitizer
  -> schema-v2 JSON file -> explicit browser import -> validator -> full render
```

Collector discovery/execution, byte parsing, classification, identity, browser
validation, source lifecycle, allocation, and rendering are separate modules.
Tests inject filesystem, process, file-reader, timer, and renderer behavior; the
test suite never contacts the user's real/default tmux server.

The browser-local catalog contains exactly three original continuous courses:
**Ridge Pass**, from upper-left High Moor through Pass Ladder, Cedar Chain,
Cloud Ridge, and Long Arc to lower-right Valley Gate; **Cypress Run**, from
Launch Line through North Nineties, East Hairpin, Drop Chute, South Hairpin,
and West Switchback; and **Lantern Coil**, an open clockwise rain-garden spiral.
Each course uses 2/3/3/3/3/2 route slots in traversal order
and has independent static SVG art plus responsive motion schedules. Ridge Pass
retains its mountain terrain language. Cypress Run is a purpose-built paved
night mixed technical drift course that fills all four quadrants with
substantial north/south chutes, six squared 90-degree transitions, two
signature 180-degree hairpins, compact linked corners, angular lane islands,
marked clipping points, skid rings, tire barriers, cones, a painted grid, and
floodlight pools. All geometry and decoration is original local work; no real
map, coordinate set, route asset, branded facility, or landmark is used.

The native Course selector starts in `Auto · workday schedule`. Automatic
choice uses two local-calendar slots per day, 08:30–12:30 and 12:30–16:30, in
stable catalog order. It recomputes only at startup, its one boundary timeout,
visible `visibilitychange`, `pageshow`, or window focus. At exactly 08:30 the
first slot begins; at exactly 12:30 the second begins; at exactly 16:30 the
dashboard is after-hours and the next automatic change is the following local
day at 08:30. Manual course selection immediately clears the
timeout. Course switching never rereads or mutates fixture/live session data,
and preserves session button identity, focus, and pin state.

The deterministic 16-slot allocation supplies exact four-second phase offsets
on one shared 64-second CSS traversal. Desktop and mobile waypoint schedules
are compiled independently for their target screen proportions from each
course's one canonical displayed-coordinate cubic path. Lantern Coil adds an
open clockwise rain-garden spiral through Ember Gate, Outer Lantern, Prism
Rise, Halo Crest, Inner Coil, and Dawn Chute. The checked-in
compiler derives sixteen static anchors, full and six segment paths, a
513-position equal-distance base grid, and every internal cubic-boundary
keyframe. Startup synchronously validates and hydrates all route placeholders
before rendering a snapshot. Both schedules use `linear` timing to keep the
visible lap at one practical constant speed; there is no acceleration,
braking, corner easing, JavaScript animation loop, or data timer.
Hover, keyboard focus, or pinning pauses a route car for inspection. Reduced
motion disables traversal and nested car motion, returning each route car to
its deterministic static anchor without changing accessible location text. At
the mobile breakpoint, route buttons use a true 44px-diameter circular hit
region; the original car silhouette is contained inside it while the focus ring
and tooltip remain unclipped. Responsive tangent-based car orientation and
corner-aware drifting are compiler-owned protected behavior.

Service Bay, Permission Checkpoint, and the shared idle/complete Pit Stop each
use six stationary anchors. Unknown observations remain stationary in a
distinct dashed **Unclassified hold** with three gray `?` anchors and
independent overflow, for a total map capacity of 37. Colors are paired with
glyphs/patterns, and native buttons provide keyboard and screen-reader
behavior.

## Remove

Delete `dashboard/` to remove the companion dashboard. No terminal or dotfiles
configuration needs to be reverted.
