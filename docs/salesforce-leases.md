# Salesforce org leases

[Back to setup and keybindings](../README.md). Commands below run from the
repository root unless a block names another location.

## Salesforce Org Leases

Two Claude sessions running tests against the same shared Salesforce org corrupt
each other's data. This makes that collision visible instead of silent: a session
whose Bash call would touch an org another session is already testing is
**blocked before the command runs**, with the holding session named.

It is **advisory, single-machine, and covers only Claude-driven Bash calls.** A
command you type in a bare terminal, a task launched from an editor, and anything
on another machine take no lease and are never blocked. A lease means "another
session says it is using this org" - it is not a lock on the org itself.

Everything here is **off** until `SF_LEASE_ENABLE` is set. Installing it changes
nothing on its own.

### The three pieces

Each knows as little as possible about the others.

- **`sf-org-resolve <cwd> <command>`** answers *which org would this command
  touch?* It recognises test invocations (`playwright test`, `npx playwright`,
  `npm run test*`, `vitest run`, `test:last-failed`) **at the start of a command
  segment** - the beginning of the command, or after `&&`, `||`, `;`, `|` or a
  newline - so `cd repo && npm run test:staging` counts and
  `git commit -m "fix the npx playwright test flake"` does not. It then reads the
  same configuration the run itself would read - an inline
  `SF_ORG_ALIAS=`/`SF_BASE_URL=` prefix, the `dotenv -e` file a `package.json`
  script names, otherwise `.env`/`.env.<TEST_ENV>` in that directory - and
  canonicalizes the result through `~/.config/sf-org-identity/map`, because two
  repos name the same org differently. It prints one identity or nothing, and
  knows nothing about leases. A run with `SF_SCRATCH_POOL=1` provisions its own
  org, so it resolves to nothing on purpose (an allowlist: `SF_SCRATCH_POOL=no`
  is *not* a pooled run and still takes a lease).

  It exits `0` with an identity, `1` for "no lease needed", and `3` for **its
  configuration being present and unusable** - an unreadable org map or env file,
  or a map entry that is not a usable identity. rc 3 exists because as rc 1 it was
  indistinguishable from "not a test command": leasing was simply off, with no log
  line anywhere. The hooks still let the call through on rc 3, but they say so
  loudly in the hook log.
- **`sf-lease`** is the lease store: `claim`, `release`, `release-session`,
  `bind`, `release-call`, `holder`, `list`, `sweep`, `unwedge`. State lives in
  `~/.local/state/sf-leases/`, one directory per identity, and every mutation
  runs under a single store-wide mutex. It knows nothing about Salesforce - it
  leases opaque strings.
- **Four Claude Code hooks** connect the two to the session lifecycle:
  `sf-lease-guard.sh` (PreToolUse/Bash) claims or blocks with exit 2;
  `sf-lease-post.sh` (PostToolUse/Bash) releases only that call's claim on
  its original identity, using the shared `tool_use_id`, so another overlapping
  call from the session keeps its claim; `sf-lease-end.sh` (SessionEnd) releases
  everything the session still holds; `sf-lease-table.sh` (SessionStart) prints what is already leased.

Every hook fails **open**: a missing binary, an unparseable payload, a busy store
or any unexpected exit code lets the call through. Only a live competing holder
blocks. A guard that can stop every Bash call in every session has to be built
that way - including the session you would fix it from.

### Arming it, in this order

1. `./install-macos.sh` puts the two binaries in `~/.local/bin` and the four hook
   scripts in `~/.claude/hooks`. Both are inert at this point.
2. Merge the hooks into `~/.claude/settings.json` **by hand**, keeping whatever
   is already registered there - `PreToolUse` and `SessionStart` commonly
   already carry entries, so append to those arrays. Do not merge with
   `jq '.[0] * .[1]'`: that replaces arrays, which silently drops the hooks
   already in the file.

   ```json
   {
     "hooks": {
       "PreToolUse": [
         { "matcher": "Bash", "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/sf-lease-guard.sh", "timeout": 15 }] }
       ],
       "PostToolUse": [
         { "matcher": "Bash", "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/sf-lease-post.sh", "timeout": 30 }] }
       ],
       "SessionEnd": [
         { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/sf-lease-end.sh", "timeout": 30 }] }
       ],
       "SessionStart": [
         { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/sf-lease-table.sh", "timeout": 10 }] }
       ]
     }
   }
   ```

3. **Confirm they are inert.** Restart a session, run a few Bash calls including
   a test command, and check that nothing was blocked, `sf-lease list` prints
   nothing, and `~/.local/state/sf-leases/hook.log` has no new lines.
4. Only then `export SF_LEASE_ENABLE=1` (shell profile) and restart.

To back out, `unset SF_LEASE_ENABLE` and restart - the hooks go inert again with
their registration intact. `./uninstall-macos.sh` removes the scripts, but it
does not edit `settings.json`; unregister them there first, since an entry
pointing at a missing hook errors on every Bash call.

### Knobs

- `SF_LEASE_ENABLE` - the arming switch, matched against an allowlist
  (`1`, `on`, `true`, `yes`, any capitalization). Anything else, including `off`
  and a typo, leaves it **off**.
- `SF_LEASE_TTL_MINUTES` (default `120`, range **1-1440**) - the expiry threshold
  after the last claim or process binding. A bound, live Bash call retains
  exclusion even beyond this threshold. Once its process exits, the ordinary
  timeout applies; no heartbeat or background worker renews abandoned calls.
  Unbound and legacy calls have TTL-only protection. The upper bound
  is literal, not cosmetic: this knob drives the only multiplication in `sf-lease`,
  and `200000000000000000` wrapped `ttl * 60` to a *negative* number, which made
  every lease read stale and handed a rival an org its real holder was still
  running against. Out of range is `rc 64`, reported in the hook log.
- `SF_LEASE_MUTEX_WEDGE_SECONDS` (default `60`, range **30-86400**) - how old the
  claim mutex has to be before `list` warns and `unwedge` will consider clearing
  it. It has a **floor** as well as a ceiling, because a value below one (or one
  wrapped negative past int64) let `unwedge` delete a mutex a live claim was
  holding, with no `--force`.
- `SF_LEASE_HOOK_RETRIES` (default `2`, **capped at 5**) - how many times the
  release hooks retry a busy store. `0` is the escape hatch: one attempt, no
  retry, when a wedged store is making every Bash call slow. Do not try to raise
  it past the cap - each retry costs a full mutex timeout on *every* Bash call.
  A value past the cap, a non-integer, or a leading zero (bash reads `08` as
  octal) falls back to `2` and says so in the hook log.
- `SF_LEASE_MUTEX_TIMEOUT_MS` (default `5000`, which is also its **ceiling**) -
  how long a claim waits for the store mutex. It can only be lowered. `20000`
  made a single Bash call's guard take 26s and `86400000` - the
  milliseconds-per-day typo - was still spinning at 30s; both are perfectly
  valid integers, which is why the ceiling is a literal bound rather than a
  validation rule. This one *clamps* instead of refusing, unlike the two knobs
  above: it sits on the PreToolUse hot path, where too long a wait is a stall
  rather than a wrong answer, so clamping keeps leasing working where `rc 64`
  would switch it off over a typo. Past a day in milliseconds it is refused,
  because that is a number in the wrong variable rather than a wait.

A malformed value in any of those three is `rc 64` from `sf-lease`, which the hooks
log naming both possible causes - the knob and their own argument plumbing - and
then allow the call. **A bad knob means leasing is off**, so it is worth reading
the log line rather than assuming a hook bug.
- `SF_LEASE_HOME` (default `~/.local/state/sf-leases`), `SF_ORG_MAP` (default
  `~/.config/sf-org-identity/map`), `SF_LEASE_LOG`, `SF_LEASE_BIN`,
  `SF_ORG_RESOLVE_BIN` - relocations, mostly for the test suites.

### Day to day

```sh
sf-lease list                     # who holds what; silent when nothing is held
sf-lease holder <org>
sf-lease release <org> <session> <token> # finish one identified call
sf-lease release <org> <session>         # finish the legacy CLI claim only
sf-lease release-session <session>
```

Claims accept an optional invocation token:
`sf-lease claim <org> <session> <command> [token]`. Release with the same
session and token. Tokens are 1–200 ASCII letters, digits, `.`, `_`, `:`, or
`-`; use a distinct token for each invocation and never reuse it. Duplicate
claims/releases are harmless while the lease exists. Released tokens remain
in metadata while sibling claims are active, so a delayed duplicate cannot
revive a finished call. A wrong session/token cannot release another claim.
`sf-lease holder <org>` also prints the active/released claim IDs for recovery.

Token-free CLI calls share one legacy slot and keep their historical reentrant
claim/release behavior. Old metadata is imported as an active legacy slot;
tokenized calls never discard it. A token-free release clears only that slot,
leaving identified calls held. `release-session` clears all claims owned by the
named session across orgs: use it for recovery only after those calls stop.

The hooks use `tool_use_id` from the documented
[PreToolUse](https://code.claude.com/docs/en/hooks#pretooluse-input) and
[PostToolUse](https://code.claude.com/docs/en/hooks#posttooluse-input) payloads.
If the ID is absent or invalid, the guard conservatively claims the legacy
slot and logs it; the post hook logs and releases nothing. SessionEnd, manual
legacy release after calls finish, or TTL expiry cleans up that slot. Failed,
interrupted, or missed post hooks likewise leave inspectable claims for
SessionEnd/manual cleanup/TTL.

For identified calls, the guard returns a
[PreToolUse input update](https://code.claude.com/docs/en/hooks#pretooluse-decision-control)
that prepends `sf-lease bind` to the original command. It preserves all other
input fields and leaves normal permission decisions to Claude Code. The binding
runs inside the actual tool shell, recording its PID and process start time
in that call's metadata. Expiry checks compare both, reject zombies, and retain
exclusion while any bound active call still matches. An `exec` replacement
retains that process identity. PostToolUse releases by session/call ID across
orgs, so the prefix and changes of directory cannot redirect cleanup. If
PostToolUse arrives while the bound process is still alive (for example, a tool
started in the background), cleanup retains the claim and logs why. It then
expires after process exit under the bounds below, or SessionEnd/manual cleanup
can release it after the call stops. An uncertain process observation likewise
retains the claim. `release-call <session> <token>` returns 1 in those cases;
explicit `release` and `release-session` remain operator recovery commands.

This protects the executing shell's lifetime, including foreground commands it
waits for. Detached descendants that outlive it are outside the call lifetime;
wait for test commands rather than launching them with `&`, and stop remaining
children before manual cleanup after a killed shell. Missing post hooks leave
claims until SessionEnd, manual cleanup, or expiry after the bound process
exits. If the TTL has already elapsed, the next claim/sweep can reclaim the
lease immediately after process exit. Otherwise it can remain until the last
claim/bind timestamp plus the TTL. No worker needs termination or crash cleanup.

Binding refuses missing/released claims, a different session, and rebinding an
invocation to a different process. Delayed cleanup cannot remove a replacement
call with a distinct token. If binding fails (including a claim that expired
while awaiting permission), stderr warns that the call has TTL-only protection;
the command still runs under the existing advisory/fail-open policy. Check
`sf-lease list` and stop competing runs before retrying. Older clients that
ignore input updates likewise have TTL-only protection. If `ps` cannot provide
a usable observation during expiry, the lease stays held and stderr reports
`liveness uncertain`. Confirm every call has stopped, inspect
`sf-lease holder <org>`, and then use `sf-lease release-session <session>`.
Expiry also reports when bound processes have ended or changed identity. The
claim hook records these expiry diagnostics in its bounded log.
`holder` prints the recorded PID/start time alongside each bound call.

Deploy the binary and hooks together with the installer while no leased calls
are running. Older hooks/binaries do not implement per-call ownership; do not
mix versions or roll back while tokenized claims remain active. Settings
registration and the off-by-default arming gate remain manual.

`SF_SCRATCH_POOL=1` on a run bypasses leasing entirely - that run claims its own
scratch org from the e2e pool, which has its own lock directory. `sf-lease list`
shows those pool locks alongside the org leases, read-only, so one command gives
the whole picture.

### When the store wedges

The claim mutex is held for tens of milliseconds and is never auto-recovered: an
age-based "fix" would reintroduce the exact race the mutex exists to close. So a
process killed inside its critical section leaves the store wedged, and recovery
is a human step.

Nothing is blocked while it is wedged - claims fail open - but every Bash call in
every armed session pays for it: about **5s in the PreToolUse hook plus 15.4s in
the PostToolUse hook, roughly 20.4s per call** at the default retry count, each
writing an `rc=75` line to the hook log that names the fix.

```sh
sf-lease list      # warns when the mutex has been held longer than a minute
sf-lease unwedge   # refuses unless the mutex is old AND its owning pid is gone
```

`sf-lease unwedge --force` skips both proofs and **can hand the same org to two
sessions at once**, including every session that claims after it. Use it only
when you are certain the owning process is dead.

### Where the real identifiers live

Both are local, outside this repo, and neither is ever committed:

- `~/.config/sf-org-identity/map` - the two-column raw-to-canonical org map.
  This repo's tests use fakes (`orga`, `orgb`) only.
- `~/.local/state/sf-leases/hook.log` - hook diagnostics, and it contains **org
  identities and Claude session ids**. Rotated at 256KB with one previous copy
  kept, so about 512KB at most.

`./uninstall-macos.sh` removes the binaries and hooks but **leaves that store in
place** - it can hold a live lease belonging to another running session, and the
script only removes what it installed. It prints the path and the `rm -rf` to
finish the job.

### Adding a third repo to the map

Two repos only collide if they resolve to the *same* string, so a new repo has to
be mapped to whatever the other two already canonicalize to. Ask the resolver
rather than guessing - it prints the raw value it derived, which is the left-hand
column the map needs:

```sh
sf-org-resolve ~/Apps/some-repo 'npm run test:staging'   # prints e.g. 00Dfake0000000001
sf-org-resolve ~/Apps/e2e-automation 'npx playwright test'
```

Then add a line per raw value in `~/.config/sf-org-identity/map` (whitespace-
separated `raw canonical`, `#` comments, first match wins) pointing all of them at
one canonical name, and re-run both commands: they must now print the same string.
If the new repo prints nothing, it is not a recognised invocation shape or the
config it reads is not one of the ones listed above; if it exits `3`, the map or an
env file is present and unreadable.

### Known gaps

- `cd "$VAR" && ...`, `pushd`, and any `cd` that is not the first command are
  not followed. The lease keys off the payload's own working directory instead,
  which can mean no lease or a lease for the wrong org if that directory has
  resolvable configuration. Leading literal cd chains are limited to four hops.
  The [shell-intent research](sf-shell-intent-research.md) reproduces these
  cases and compares parsing and explicit-wrapper alternatives; runtime behavior
  remains unchanged.
- **Matching is still on command text, not intent - and it can still block.**
  Anchoring to a command segment fixed the single-line cases: with a rival holding
  the org, `git commit -m "fix flake in npx playwright test"`, an `echo` into a
  notes file, `gh pr create --body "...npx playwright test"` and
  `git log --grep="playwright test"` used to return exit 2 and now return 0. What
  is left is narrower but is the same kind of harm, so read it as a limitation on
  what you can type, not as a leak.

  A **newline counts as a segment boundary**, so any command whose *later lines*
  begin with a test invocation resolves - which means it **takes a lease, and is
  blocked outright while another session holds that org**. Measured at exit 2, all
  of them routine work here:

  - a multi-line `git commit -m` whose body mentions a suite (this repo's own
    commit conventions mandate multi-line messages), e.g. a second line reading
    `npx playwright test was red`
  - `gh pr create --body "## Test plan⏎npx playwright test⏎"`
  - a heredoc: `cat > notes.md <<EOF⏎npx playwright test⏎EOF`
  - and the single-line variant of the same thing, a quoted separator:
    `git commit -m "wip; npx playwright test"`

  If one of these is refused, the command itself is fine - re-run it once the other
  session finishes, or run that one call with `SF_LEASE_ENABLE= <command>` to make
  the hook inert for it.

  It cuts the other way too: a test command the segment rule cannot see takes **no
  lease at all**, so `( npx playwright test )` and `echo $(npx playwright test)`
  both run unprotected.

  Closing this properly means parsing the shell - knowing which text is a command
  and which is an argument - not a better regex, so it is deliberately not
  attempted. A lease taken this way is still released by the PostToolUse hook for
  the same call.
- Calls from the same session retain independent claims when hook call IDs
  are available. This excludes rival sessions until all claims finish; it does
  **not** serialize the owning session's own calls against each other.
  This fixes [#91](https://github.com/ajason13/terminal-dotfiles/issues/91),
  delivered in [PR #112](https://github.com/ajason13/terminal-dotfiles/pull/112).
- Bound live calls retain exclusion beyond TTL using process identity checks.
  Missing IDs, ignored input updates, and failed binding leave TTL-only
  protection. Missed post hooks use the cleanup and expiry bounds above.
- Only the invocation shapes listed above are recognised. A runner started some
  other way takes no lease.

### Verifying it end to end

Needs two live sessions. In session A, start a suite in a repo that resolves to a
shared org; while it runs, ask session B for a test command against the same org.
B's Bash call should be refused before it executes, naming A; `npm run lint`
should never be. When A finishes, B's retry should succeed, and a third session's
SessionStart should list the lease while A holds it.

Use a bare `npx playwright test`. `TEST_ENV=staging` resolves to nothing in the
e2e repo - there is no `.env.staging` there - so it would read as a false
negative.

Include one more case in session B while A holds the org: a **multi-line
`git commit -m`** whose body mentions a suite. That is the shape the text-matching
gap above governs, and it is the difference between "the guard stops test runs" and
"the guard stops me writing a commit message". Expect it to be **refused** today -
the point of running it is to see for yourself how often that would happen, and to
decide whether that cost is acceptable before leaving the hooks armed.
