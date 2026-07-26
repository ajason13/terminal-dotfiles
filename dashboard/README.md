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
node dashboard/collect-tmux.mjs > /tmp/dashboard-tmux-snapshot.json
```

The collector makes exactly one hardened `list-panes -a` call. It reads pane
metadata only: socket/server epoch identifiers, tmux IDs, window name, pane
index, pane title, and current command. It never reads pane content or history.
The emitted file contains opaque stable IDs, sanitized display names derived
only from window name plus pane index, inferred state, provenance, confidence,
and one observation timestamp. Raw titles, commands, sockets, tmux IDs, and
server times are never emitted.

The implementation deliberately fails closed on non-macOS layouts, custom
sockets/server names, alternate tmux paths, unsafe executables/sockets,
timeouts, stderr, malformed or oversized output, or any validation error. A
failure writes one closed error code to stderr, exits nonzero, and writes no
JSON or partial JSON to stdout. Delete an empty redirected file after a failed
command.

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

The browser never discovers or executes tmux, rereads an imported file, or
refreshes session data. Its sole interval updates only the displayed age label.
Stop the preview with `Ctrl-C`.

## Verify

Run syntax checks for every JavaScript module:

```sh
find dashboard -name '*.mjs' -type f -exec node --check {} \;
```

Run all dependency-free tests:

```sh
node --test dashboard/tests/dashboard.test.mjs dashboard/tests/live-adapter.test.mjs
```

Build, lint, and type-check commands are **N/A**. This browser-native project
has no package manifest, framework, dependency, generated bundle, or build
toolchain.

## Reproduce browser verification

Browser verification uses fresh synthetic files so committed data never ages
into invalidity:

```sh
DASHBOARD_BROWSER_FIXTURES="$(mktemp -d /tmp/night-pass-browser.XXXXXX)"
node dashboard/tests/generate-browser-fixtures.mjs "$DASHBOARD_BROWSER_FIXTURES"
python3 -m http.server 4173 --bind 127.0.0.1 --directory dashboard
```

Use the two generated paths printed by the helper for the valid and rejection
imports. The full manual `playwright-cli` procedure, assertions, screenshots,
and cleanup commands are recorded in
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

Active/thinking sessions continuously drive the original route from Summit
Approach through Ridge Run and Cedar Bend to the Lower Hairpins. Their
deterministic 16-slot allocation supplies evenly separated phase offsets on one
shared 64-second CSS traversal; there is no animation loop or data timer.
Hover, keyboard focus, or pinning pauses a route car for inspection. Reduced
motion disables traversal and nested car motion, returning each route car to
its deterministic static anchor without changing accessible location text.

Service Bay, Permission Checkpoint, and the shared idle/complete Pit Stop each
use six stationary anchors. Unknown observations remain stationary in a
distinct dashed **Unclassified hold** with three gray `?` anchors and
independent overflow, for a total map capacity of 37. Colors are paired with
glyphs/patterns, and native buttons provide keyboard and screen-reader
behavior.

## Remove

Delete `dashboard/` to remove the companion dashboard. No terminal or dotfiles
configuration needs to be reverted.
