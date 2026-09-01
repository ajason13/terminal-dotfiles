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
index, pane title, current command, and the window's last-activity epoch. It
never reads pane content or history. The emitted file contains opaque stable
IDs, sanitized display names derived only from window name plus pane index,
inferred state, provenance, confidence, one observation timestamp, and one
last-activity timestamp. Raw titles, commands, sockets, tmux IDs, and server
times are never emitted.

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

## How a session is judged active or idle

The pane title says which agent is attached, never what it is doing: Claude Code
shows a spinner only while working in the foreground, so a session driving a
subagent looks the same as one stopped hours ago. Judging on the title alone put
every tracked pane in the pit.

State therefore comes from **window silence** - how long since the window last
produced output. A working pane writes continuously, spinner redraws included, so
recent output is evidence of work even when the title cannot show it; an idle
pane goes quiet for minutes to hours with no heartbeat. Silence under a minute
reads active, over it reads idle, and a pane whose title carries stronger
evidence (a spinner, `Thinking`, `Working`, `Action Required`) still wins on the
title.

This is why `confidence` is medium and never high. tmux exposes activity per
**window**, not per pane, so a second pane in the same window - an editor, a
`tail -f` - marks its neighbour active. Running one agent pane per window is what
keeps that rare, which makes the convention below load-bearing for accuracy, not
just for tooltips.

A reading the collector could not stand behind renders as unsettled rather than
settled: a dashed state ring, a dimmed car, and `unconfirmed` in the tooltip and
the accessible label.

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

**Run one agent pane per window.** Two agent panes in one window produce two
identical tooltips, since the tooltip does not show the pane index - you can
still tell the cars apart by the code on the car body (`S08`). More importantly,
activity is measured per window, so panes sharing a window cannot be told apart
by whether they are working.

This needs stable window names. tmux auto-rename overwrites a manual name with the
running command, so set `set -g automatic-rename off` (or have tooling set the
names); otherwise the ref disappears when the command changes.

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

For the same fast production gate used by CI (generated-route drift, JavaScript
syntax, and the complete unit suite), run:

```sh
npm --prefix dashboard run verify
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
by the dashboard. GitHub Actions runs the fast verification gate and the
Chromium regression suite on every push and pull request.

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

## Layout

The dashboard is a full-bleed track: a slim header bar, a full-bleed map stage,
and a bottom pit lane of labeled bays. There is no side panel and no clock.

The header bar (`header.dashboard-bar`) holds the title, the mode pill, the
Course selector, the live snapshot summary and on-track state counts, a folded
legend disclosure, and the import/reset/go-live source controls, all on one
row that wraps at the mobile breakpoint. The legend is a native `<details>`
(`.legend-disclosure`) collapsed by default behind a small `?` summary button;
opening it drops down the seven state entries without pushing the rest of the
bar around.

Below the bar, `main#map-stage` fills the remaining viewport height with the
selected course's SVG art, route centerlines, and moving session cars. A
corner heading (`#map-heading`) names the active course in the top-left, and a
calm corner overflow pill (`#overflow-notice`) appears top-right only when
there are more on-track (active/thinking) sessions than the course's route
anchor slots, distinct from the separate `.pit-overflow` affordance inside
each pit bay.

`section#pit-lane` is a row of labeled bays below the stage: Service Bay
(errored sessions), Permission Checkpoint (awaiting permission), and the
shared idle/complete Pit Stop, plus a fourth Unclassified hold bay that only
appears when there are unknown sessions to show (the lane reflows to fill the
row when that bay is empty). Each bay is its own labeled region with a heading
and its own overflow affordance, replacing the former `aside.pit-stack` side
column.

Per-session detail (identity, state, location, and exact activity time) is
shown by each car's own tooltip on hover, keyboard focus, or pin - there is no
separate persistent readout strip. Keeping the detail anchored to the car
avoids reflowing the stage as it populates.

Vehicle artwork is a local catalog of 32 original generated pixel-art PNGs.
Map codes `S01` through `S64` select a deterministic 8-by-8 catalog. The model
cycles first, so `S01` through `S08` show a rounded grand tourer, upright hatch,
rally sedan, long-roof van, low sport coupe, high-rise classic, long-hood
fastback, and boxy liftback; each following group of eight repeats those models
with the next of eight stable livery metadata keys.
The model selects the generated PNG family; there is no separate runtime livery
art layer. The map-code index also cycles through side, front, and rear previews. Each family
has a 32-by-48 top view and three 48-by-32 tooltip views with hard transparent
pixel edges; tooltip art is displayed at an exact 2x size. Immutable model
metadata records whether each native top image points up or down. Coupe,
hatchback, and rally top art receive a 180-degree correction; sedan, wagon,
roadster, fastback, and utility receive none. This canonicalizes every nose to
the route renderer's negative-Y forward axis and makes parked cars face up,
while wrappers and tooltip previews keep their existing transforms. The generated assets
use read-only local vehicle images only as stance, proportion, and lighting
references: the resulting generic cars contain no manufacturer badges, logos,
text, or copied liveries. The generated PNG artwork renders unobscured, without
legacy polygon or SVG artwork layered over it. In-car state glyphs, map-code
labels, and their CSS are intentionally absent;
accessible button labels, tooltip status wording, state colors and boundaries,
and separate work-reference chips carry those semantics instead. A tooltip includes that matching
non-interactive preview and an assistive-text equivalent; model and livery
never replace state colors, boundaries, accessible labels, or status wording.

Below 760px, the bar wraps to multiple rows, the pit lane reflows to a 2x2
grid of bays, route targets shrink to a true 44px hit region, and the stage
keeps a minimum height so the track stays the visual hero within the
available chrome budget.

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

The browser-local catalog contains three original continuous courses:
**Ridge Pass**, from upper-left High Moor through Pass Ladder, Cedar Chain,
Cloud Ridge, and Long Arc to lower-right Valley Gate; and **Cypress Run**, from
Launch Line through North Nineties, East Hairpin, Drop Chute, South Hairpin,
and West Switchback. **Harbor Yard Rallycross** is a mixed-surface night docklands
course, passing containers, quay walls, cranes, a gravel cut, and a crossover
rise. Each course uses 2/3/3/3/3/2 route slots in traversal order
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
course's one canonical displayed-coordinate cubic path. The checked-in
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
and tooltip remain unclipped. Tangent-based car orientation and drifting remain
deferred.

Service Bay, Permission Checkpoint, and the shared idle/complete Pit Stop each
mount their six stationary anchors inside their own bottom pit-lane bay.
Unknown observations remain stationary in a distinct dashed **Unclassified
hold** bay with three gray `?` anchors and independent overflow, appearing
only while an unknown session exists, for a total map capacity of 37. Colors
are paired with glyphs/patterns, and native buttons provide keyboard and
screen-reader behavior.

## Remove

Delete `dashboard/` to remove the companion dashboard. No terminal or dotfiles
configuration needs to be reverted.
