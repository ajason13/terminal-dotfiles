# Night Pass Session Map

This directory contains an optional local visual progress dashboard. It starts
in its deterministic fixture mode. A separate, one-shot collector can export a
sanitized observation from the current user's default tmux server; the browser
reads that JSON only after an explicit file selection.

Nothing here is installed, loaded, or started by WezTerm, tmux, the wallpaper
workflow, or the LLM-status process. The fixture/file-import workflow starts no
server or polling. For opt-in auto-refresh, run `node dashboard/serve-live.mjs`
from the repository root, open the printed loopback URL, and select **Go live**.
The local server reads pane metadata; it does not control terminals, read pane
content, persist observations, or send telemetry to a remote service.

Track current work in [GitHub Issues](https://github.com/ajason13/terminal-dotfiles/issues).

## Verification and module boundaries

From `dashboard/`, use Node 22+ and the committed npm lockfile:

```sh
npm ci
npm run verify
npx playwright install chromium
npm run test:browser
```

`verify` checks generated routes, syntax-checks each JavaScript module separately,
and runs the unit suites. Browser tests cover desktop and mobile Chromium.

`render-dashboard.mjs` owns session reconciliation and interaction state;
`car-visuals.mjs` constructs cars and tooltip content; `tooltip-layout.mjs` owns
route-tooltip clamping and pit-tooltip docking. Existing renderer exports remain
available to callers.

Live polling applies a ten-second deadline to the request and response-body
read. A timeout aborts the fetch and counts toward the existing three-failure
fallback. Reset, import, and teardown cancel an in-flight request and discard
late responses.

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

Titles identify candidates through a spinner, Claude's `✳` prefix, current Codex
`task | project` titles, or legacy `[Status] task|project` titles. Direct agent
command basenames also identify candidates; unrelated `node` titles do not.
Presence alone does not prove idle or active work.

Title precedence matches the shell for equivalent evidence: spinner first,
then a structured Codex `[Thinking] ` or active prefix (`Working`, `Running`,
`Processing`, `Executing`, `Loading`), then `[Action Required] `. Codex status
prefixes require a recognized Codex title. Task words never become status
signals: `[Ready] Action Required | project` is presence, and `✳ Thinking` is a
static Claude title. A spinner with Action Required text remains active.

Static Claude and Codex titles, including `[Ready] ` and `[Idle] `, use the
existing **window silence** fallback. Silence under 60 seconds reads active;
60 seconds or more reads idle. Unusable activity gives low-confidence idle;
this is a fallback label, not measured silence or proof that a turn ended.
Command-only candidates remain unknown. Control-bearing titles are rejected;
a direct command candidate with such a title remains unknown.

Confidence is medium for spinner, structured working/thinking, and usable
window-activity evidence, low for structured permission or a static provider
title without usable activity, and none for an unclassified command candidate.
It is never high. tmux exposes activity per **window**, not per pane, so output
from a sibling editor or `tail -f` can mark an agent active. One agent pane per
window reduces this ambiguity. A silent agent driving a subagent can still look
idle; silence is not authoritative lifecycle evidence.

The dashboard does not read the busy/needs/subagent state files used by
[`tmux-llm-status`](../README.md#status-bar-markers). That status bar gives
Claude's hook observations precedence over title fallback; the dashboard uses
titles and window activity alone. The two surfaces can disagree, including
when a sibling pane produces output. [#100](https://github.com/ajason13/terminal-dotfiles/issues/100)
records the [historical comparison and current title-alignment results](../docs/activity-evidence-research.md).
Shared hook collection remains deferred pending identity/privacy decisions.
Existing exported fields and the validator's closed tuple vocabulary are
unchanged, including support for historical `tmux_title_ready_idle` snapshots.

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

From the repository root, `node dashboard/serve-live.mjs` starts a server bound
to 127.0.0.1 that serves the dashboard and one read-only endpoint,
`GET /live/snapshot`, which runs the same
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
anchor slots, distinct from the single `#pit-overflow` notice for the pit pool.

`section#pit-lane` groups stationary cars by **tmux session**, not by state.
Named bays sort alphabetically; a session with only on-track cars still has an
empty bay marked `Clear`. A final `Unassigned` bay appears only when an allocated
pit car has no session prefix in its display name. Each bay mixes permission,
idle, error, complete, and unknown states, distinguished by the car's glyph and
status text. [PR #41](https://github.com/ajason13/terminal-dotfiles/pull/41)
combined the pit pool; [PR #54](https://github.com/ajason13/terminal-dotfiles/pull/54)
added session bays without changing that shared capacity.

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
legacy polygon or SVG artwork layered over it. Every car carries a state glyph
badge, added in [PR #63](https://github.com/ajason13/terminal-dotfiles/pull/63),
alongside accessible button labels, tooltip status wording, state colors and
boundaries, and separate work-reference chips. Map-code labels are absent from
the car art. A tooltip includes that matching
non-interactive preview and an assistive-text equivalent; model and livery
never replace state colors, boundaries, accessible labels, or status wording.

Below 760px, the bar wraps to multiple rows, session bays stack at full width,
and route targets use a true 44px hit region. The pit lane has a capped height
and scrolls internally. Mobile CSS and browser tests remain a second-width
regression net; mobile product expansion remains out of scope.

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

### The one coupling that crosses those module boundaries

`validCombination` (`src/import-snapshot.mjs`) is an exact allowlist of **full
tuples** - `status | activity.kind | permissionState | confidence | provenance` -
with one entry per shape `classifyPane` can return. A synthetic branch matrix in
`tests/live-adapter.test.mjs` passes real `buildSnapshot` output through
`normalizeImportedSnapshot` to check compatibility. The validator rejects the
**whole** snapshot rather than the one bad session: a classifier state the
allowlist does not carry throws
`SnapshotValidationError(['LIVE_SNAPSHOT_INVALID'])` and the dashboard falls back
to fixtures. It goes blank, not wrong, which is why this is easy to ship and hard
to notice.

So a change to what the classifier can return has to land in all of these in one
commit:

| Surface | File |
|---|---|
| the returned tuples | `src/tmux-classifier.mjs` |
| the closed provenance enum | `PROVENANCE_VALUES`, `src/import-snapshot.mjs` |
| the tuple allowlist | `validCombination`, `src/import-snapshot.mjs` |
| tuple assertions and round-trip branch matrix | `tests/live-adapter.test.mjs` |

The two validators also speak different vocabularies: the fixture path uses
`FIXTURE_STATUSES` (`src/session-contract.mjs`), which omits `unknown` entirely,
while the live path uses `validCombination`. No single snapshot exercises every
state, so **a fixture-only test cannot cover this path** - pass synthetic
classifier outputs through `normalizeImportedSnapshot`.
The permanent round-trip matrix covers the current classifier branches without
real tmux access. Extend its raw-pane cases whenever a new branch is added;
independent allowlist and rejection tests remain in place.

### Courses, motion, and capacity

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
and tooltip remain unclipped. Tangent-based orientation, signed corner-aware
drift, and active/thinking smoke are implemented. They require successful
registration of all four angle properties in `src/route-motion-capability.mjs`;
unsupported registration falls back to static anchors. Reduced motion also
disables traversal, drift, and smoke.

Capacity is **16 on-route plus 18 in one shared pit pool, 34 total**, with no
borrowing between pools. Active/thinking sessions use route slots. Permission,
idle, error, complete, and unknown sessions share the pit's newest-first order
by `lastActivityAt`, with ID as the tie-breaker, before session-bay grouping.
Unknowns have no extra capacity. Excess sessions appear in the respective
route or pit overflow disclosure with map code and display name. See
`src/track-layout.mjs` for allocation and `src/render-dashboard.mjs` for notices.
Colors are paired with glyphs/patterns, and native buttons provide keyboard
and screen-reader behavior.

Permanent neutral-reference assertions and breakpoint focus/overlap checks
already cover Ridge Pass and Cypress Run. Harbor Yard is shipped, but extending
those specific matrices remains [#99](https://github.com/ajason13/terminal-dotfiles/issues/99).
The stretched full-bleed artwork remains an intentional trade-off awaiting the
decision in [#101](https://github.com/ajason13/terminal-dotfiles/issues/101).

## Remove

Delete `dashboard/` to remove the companion dashboard. No terminal or dotfiles
configuration needs to be reverted.
