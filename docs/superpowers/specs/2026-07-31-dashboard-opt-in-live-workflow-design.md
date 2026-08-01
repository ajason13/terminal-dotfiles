# Dashboard opt-in live workflow design

**Status:** Implementation complete; independent post-change QA PASS
**Date:** 2026-07-31
**Scope:** Night Pass dashboard roadmap item 5 only

## Delivery gate and repository state

This item uses Gated Delivery because it crosses the local process/filesystem
boundary around the already-approved tmux collector. The collector, schema-v2
wire contract, browser import lifecycle, fixtures, routes, rendering, and
terminal configuration are protected inputs rather than redesign targets.

The initial repository audit found a clean `main` at
`e7acd1dd578a6cc9522f1d78598ce5cb30bb9002`; `origin/main` initially pointed to
`3288c3c80ea06a56efb7ac9a60806d4f2681a7d5`. During read-only discovery the
remote-tracking ref advanced by an external push to the same `e7acd1d` HEAD.
The release gate must re-check branch, HEAD, upstream, index, worktree, and
untracked files. It may push only when item 5 is the sole unpublished commit.

## Current workflow and exact gap

The current documented export command is:

```sh
node dashboard/collect-tmux.mjs > /tmp/dashboard-tmux-snapshot.json
```

`collect-tmux.mjs` is fail-closed internally: it buffers and validates the
complete observation before writing JSON to stdout. Shell redirection is
outside that guarantee. The shell opens the destination before Node starts,
normally with create-or-truncate behavior. Therefore a missing binary,
rejected socket, collector error, launch error, or interruption can leave an
empty file; if a valid snapshot already existed, it is truncated before the
collector can preserve it. A synthetic reproduction, which did not invoke the
collector or tmux, exited `1` and changed a nonempty `0600` destination to zero
bytes.

The browser lifecycle is already explicit and correct. After a successful
export, the user selects the file with **Import live snapshot**. Refresh means
rerunning the one-shot export and explicitly selecting/importing the new file
again. The browser does not reread the prior `File`, watch the destination,
poll, fetch, or access tmux. The existing minute interval changes displayed age
text only.

## Approved one-command interface

Add a separate workflow-layer entry point and document this repository-root
command:

```sh
node dashboard/export-tmux.mjs /tmp/dashboard-tmux-snapshot.json
```

The destination is an explicit, single, absolute positional path. There is no
default path, environment-derived path, shell expression, option parsing,
stdin protocol, or stdout redirection. Relative paths, zero or multiple
arguments, NUL-bearing paths, and a final component of `.` or `..` fail before
collection.

The separate entry point is intentional. `dashboard/collect-tmux.mjs` and
`src/collector-cli.mjs` retain their validated stdout/error behavior for
compatibility and focused tests. The new exporter imports and invokes
`collectTmuxSnapshot` exactly once after initial destination validation; it
does not spawn the collector as a second process and never invokes tmux itself.

## Destination and atomic replacement contract

1. Resolve the explicitly named parent with `realpath`. This deliberately
   supports macOS `/tmp`, which normally resolves to `/private/tmp`, without
   consulting `HOME`, `PATH`, `TMUX`, `TMUX_PANE`, `TMUX_TMPDIR`, or another
   environment-selected location.
2. Inspect the resolved parent with `lstat` and require it to be an existing
   directory owned by root or the current UID. Require effective write/search
   access. If it is group/world writable, require the sticky bit;
   root-owned `/private/tmp` satisfies those conditions. Missing,
   non-directory, foreign-owned, or unsafe parents fail before collection.
3. Inspect the destination with `lstat`. Absence is allowed. An existing target
   must be a regular file owned by the current UID. A directory, symlink,
   socket, FIFO, device, or other special file fails closed. Existing contents
   are not opened, read, chmodded, or truncated.
4. In the resolved destination directory, create one unpredictable sibling
   temporary file with `O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW` and requested
   mode `0600`. The default injected token source is exactly
   `randomBytes(16).toString('hex')`, producing 32 lowercase hexadecimal
   characters. The sibling basename is
   `.<destination-basename>.<token>.tmp`; compare it with the destination
   basename and reject equality. Make exactly eight exclusive-create attempts
   on `EEXIST`, drawing a fresh token for each. Any invalid injected token,
   non-`EEXIST` create failure, or eighth collision fails; never open or delete
   a colliding name.
5. Apply `fchmod(0600)`, then verify through the open handle that the temporary
   inode is a regular file owned by the current UID, has one link, and has exact
   POSIX mode bits `0600`. Only then invoke the existing collector once and
   serialize its returned object with the existing pretty-printed schema-v2
   form plus one trailing LF. Do not normalize, reinterpret, or add keys to the
   snapshot.
6. Write the complete payload, explicitly reapply `chmod(0600)`, verify the
   open inode again, `fsync` it, and close it. Any collector, serialization,
   write, permission, metadata, sync, or close failure occurs before replacement.
7. Immediately before commit, repeat the destination `lstat`/ownership/type
   validation. Then rename the sibling temporary file over the destination.
   Same-directory POSIX rename is the sole commit point: absence creates one
   complete file and an existing accepted regular file is atomically replaced.
8. After successful rename, perform no fallible post-commit operation. This
   avoids reporting ordinary failure after the old snapshot is no longer
   recoverable. Success leaves exactly one destination with mode `0600` and no
   exporter-owned temporary artifact.

Every caught pre-commit failure closes the handle if present and unlinks only
the exact temporary name created by that invocation. Cleanup must never scan,
glob, or remove another invocation's file. Collector, serialization, create,
write, chmod, sync, close, destination revalidation, and rename failures do not
replace an existing valid destination. Cleanup failures remain closed and are
covered by the limitations below; raw paths and system errors are never
printed.

Error precedence is exact. First map the primary failure to a closed code:
structural destination failures map to `SNAPSHOT_DESTINATION_INVALID`; a
`CollectorError` maps to its code only when that value is a member of the
checked-in `COLLECTOR_ERROR_CODES`; every other failure, including an
unrecognized `CollectorError.code`, maps to `SNAPSHOT_EXPORT_FAILED`. If this
invocation created a temporary file, attempt both applicable cleanup steps and
track their results. Any close or unlink cleanup failure overrides the primary
mapping with `SNAPSHOT_EXPORT_FAILED`; otherwise emit the mapped primary code.

Concurrent valid exports use independent exclusive temporary files. Each
commit is atomic; the last rename to complete wins, so the destination is
always one complete snapshot. No lock file is added because a crash-safe stale
lock protocol would be broader than this one-shot workflow. Collision retries
and commit order are dependency-injected in tests so the behavior is
deterministic under controlled scheduling.

## CLI and error contract

Successful execution:

- exit status `0`;
- empty stdout;
- empty stderr;
- one complete schema-v2 destination at exact mode `0600`.

Collector failures retain the exact existing checked-in `TMUX_*` stderr code
and exit status `1` only when cleanup succeeds. Unrecognized collector codes or
any cleanup failure emit `SNAPSHOT_EXPORT_FAILED`. No existing collector code
or mapping changes.

The workflow layer adds exactly two closed codes:

```text
SNAPSHOT_DESTINATION_INVALID
SNAPSHOT_EXPORT_FAILED
```

`SNAPSHOT_DESTINATION_INVALID` covers CLI arity/path-shape failures, missing or
unsafe parents, and a destination whose observed type or ownership is
unacceptable. `SNAPSHOT_EXPORT_FAILED` covers access denial, exhausted
exclusive-name collisions, serialization, open/write/chmod/sync/close,
cleanup, and rename failures. Both write exactly the code plus LF to stderr,
write nothing to stdout, and return `1`. No exception text, path, raw snapshot,
or system detail is emitted.

This new closed workflow error contract is necessary because the failure is
outside the collector and must not be mislabeled as a tmux failure.

## Protected invariants

- The collector keeps the same two absolute tmux candidates, default socket
  construction and ownership/type checks, one `execFile` call, fixed arguments,
  minimal child environment, `shell: false`, byte framing, timeout, and limits.
- Schema-v2 constants, exact keys, classifier precedence, identity, privacy
  filtering, capacity, stale/future checks, and rejection behavior are
  unchanged.
- Raw titles, commands, sockets, tmux IDs, epochs, pane content/history,
  environment, cwd, PIDs, and other protected observations never enter the
  output or errors.
- Fixtures remain startup and rejection fallback. Browser source-control text
  and behavior do not change.
- No daemon, watcher, polling/recurring collection, timer, backend, network,
  telemetry, persistence, automatic browser file access, shell execution,
  dependency, build system, terminal configuration, route/artifact, or item 6
  work is added.

## Expected implementation files

Only these item 5 paths are approved for technical implementation:

- new `dashboard/export-tmux.mjs`;
- new `dashboard/src/snapshot-export.mjs`;
- new `dashboard/tests/snapshot-export.test.mjs`;
- modify `dashboard/README.md`.

Gated-delivery evidence may additionally update this design packet and, after
post-change PASS only, `docs/superpowers/plans/2026-07-27-dashboard-roadmap.md`.
`dashboard/package.json`, `package-lock.json`, the existing collector/import
modules, browser UI, routes, generated artifacts, screenshots, and all
protected dotfiles are expected to remain byte-identical.

## Test and verification plan

Focused synthetic tests inject the collector and every filesystem boundary.
They must prove:

- one success writes one import-validator-accepted snapshot with a trailing LF,
  exact `0600` mode, silent streams, and exit `0`;
- an existing regular snapshot is replaced atomically;
- collector, serialize, exclusive-open, write, chmod, sync, close, permission,
  revalidation, and rename failures return nonzero, preserve the prior valid
  destination, and remove the invocation's temporary file where the platform
  permits cleanup;
- missing parent, relative/invalid path, directory target, symlink target, and
  FIFO or another safe synthetic special-file target, and a foreign-owned
  parent or regular target fail closed before collector invocation;
- the exact eight exclusive-name attempts use injected 32-hex tokens, reject
  invalid/equal names, exhaust deterministically, and do not alter colliding
  files; controlled concurrent commits are complete and last-commit-wins;
- a whitelisted collector error passes through only after successful cleanup;
  unknown collector codes and injected close/unlink cleanup failures emit
  `SNAPSHOT_EXPORT_FAILED` with no raw detail;
- the exporter calls its injected collector exactly once and neither exporter
  source contains child-process/shell/network/watcher/polling APIs nor reads
  environment-selected executable/socket/destination values;
- serialized output contains none of the protected synthetic raw values;
- existing collector CLI tests retain their byte/behavior contract.

Full verification is:

```sh
npm --prefix dashboard run routes:check
npm --prefix dashboard run test:unit
npm --prefix dashboard run test:browser
find dashboard -path dashboard/node_modules -prune -o -name '*.mjs' -type f -exec node --check {} \;
git diff --check -- <scoped item 5 paths>
```

Also compare both generated route artifacts and all nine tracked screenshots
byte-for-byte with the pre-change hashes, confirm ports 43917 and 43918 are
clear, audit the final diff for dependencies/shell/network/polling/telemetry/
persistence/protected files/item 6, and re-check that unrelated files and
commits remain untouched and unstaged. Browser tests use synthetic inputs only
and must report zero failures, skips, console warnings/errors, and page errors.

No real collector trial is part of automated verification. Contacting the
user's default tmux server remains a separately authorized manual action.

## Observability decision

Add no runtime logs, metrics, traces, debug mode, telemetry, or persisted
diagnostics. Deterministic exit status and the closed stderr codes above are
sufficient for this explicit one-shot operation. Success is intentionally
silent because the user supplied the destination path.

## Weak claims, platform assumptions, and unknowns

- Atomic replacement relies on Darwin/POSIX same-directory `rename` semantics.
  It protects against ordinary process errors before commit, not power loss,
  kernel/filesystem failure, or a process killed after rename but before its
  caller observes exit `0`.
- `fsync` covers temporary-file contents. No parent-directory fsync is attempted
  after rename because a failure then could only report failure after replacing
  the prior file. Crash-durable directory persistence is not claimed.
- A forced kill or machine crash can leave the hidden temporary file because no
  process can guarantee cleanup after it stops running. Caught failures must
  clean up; an underlying filesystem that refuses both the primary operation
  and unlink remains an explicit fail-closed residual.
- `realpath` intentionally follows parent symlinks, including macOS `/tmp`.
  The resolved parent and final destination component are checked with
  `lstat`, but portable Node path APIs cannot pin the parent namespace. A
  same-UID actor can race parent entries, the temporary name/link count, or the
  final target between validation and use. The design claims ordinary
  non-adversarial concurrency safety only. Rename does not dereference a
  swapped final symlink, but may replace its directory entry.
- `0600` refers only to POSIX mode bits on the newly installed inode. Portable
  Node APIs here do not audit inherited macOS ACLs, backups, privileged access,
  or exposure of the previously replaced inode.
- The existing collector is verified for macOS/Homebrew tmux 3.7 only. This
  workflow does not add non-macOS support or strengthen that historical claim.
- Invoking `node` itself still depends on the user's shell/runtime selection,
  as the existing documented CLI already does. The implementation does not use
  inherited `PATH`, `NODE_OPTIONS`, or tmux variables to select the tmux binary,
  socket, destination, or child environment. Node may process `NODE_OPTIONS`
  before application code can reject it; no stronger pre-start guarantee is
  claimed.
- A real default-socket collector trial remains unperformed and requires
  explicit user authorization.

## Gate state

The first independent pre-implementation review returned FAIL with four
blockers: parent ownership, error/cleanup precedence, exact collision behavior,
and namespace-race precision. The packet incorporated each correction. The
same independent pre-gate reviewer then returned PASS and explicitly authorized
**“Builder may begin.”**

The native Builder implemented only the four approved technical files. Primary
post-change verification produced:

- focused exporter tests: 15/15 passed, zero failures/skips/todos;
- full Node suite: 156/156 passed, zero failures/skips/todos;
- Playwright: 32/32 passed across desktop and mobile Chromium; its diagnostic
  assertions reported no browser console warnings/errors or page errors;
- `routes:check`: generated artifacts current;
- every dashboard `.mjs` syntax check passed;
- scoped `git diff --check` passed;
- all nine tracked screenshots and both generated route artifacts retained
  their recorded pre-change SHA-256 bytes;
- ports 43917 and 43918 were clear after verification;
- package/lockfile, collector/import/source/schema modules, UI, routes,
  generated artifacts, screenshots, and protected dotfiles were unchanged;
- static audit found no shell/child-process expansion, environment-selected
  destination/tmux path, network API, watcher, polling, recurring timer,
  telemetry, or persistence in the exporter;
- every exporter and browser test used injected or synthetic data. The real
  collector entry point and user's real/default tmux server were not invoked.

The first browser command attempt could not bind its loopback test server in
the filesystem/network sandbox (`EPERM`). The same fixture-only suite was
rerun with the approved loopback permission and passed 32/32. This was an
environment constraint, not a product/test failure.

At this checkpoint `HEAD == origin/main == e7acd1d`, the index is empty, and
unrelated user-owned unstaged changes exist in root `README.md`,
`scripts/background-bundles.sh`, and
`wezterm/modules/background_manifests/anime.lua`. They remain excluded.

The different native post-change `lead-architect` first returned FAIL because
operational parent-path filesystem errors were mislabeled as structural
destination errors and this packet contained two trailing spaces. The Builder
added an exact structural error allowlist with two-boundary negative tests;
`EIO` and unknown filesystem errors now fail as `SNAPSHOT_EXPORT_FAILED`
without collection. The packet whitespace was corrected. Focused tests
remained 15/15 and the full suite remained 156/156.

The independent post-change re-review then returned PASS with no blockers and
authorized the scoped release. The workflow-coordinator mechanically marked
item 5 complete and item 6 — Third original course — next and the only
remaining roadmap implementation item. No Notion work was created and item 6
was not started. Final staging, commit, and push remain subject to the exact
path audit and Git divergence guard.
