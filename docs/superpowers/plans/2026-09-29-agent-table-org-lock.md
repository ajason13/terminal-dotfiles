# Agent table: org-lock columns (PR B)

Stacked on PR #72 (`feat/agent-table-r2`). Adds ORG and LOCK columns to `tmux-llm-status table|pick`.

## Decisions you need from me

1. **ORG shows only while a lock or a wait exists; idle panes show `-`.** Recommended, because nothing readable names an idle pane's org (measured below). The cost if that's wrong: the column is empty most of the day, and you may decide it isn't worth a column. The alternative, reading each worktree's `.env`, breaks the no-`.env` guardrail, so I won't do it.
2. **Stack on PR #72 instead of branching from `main`.** Recommended: both PRs rewrite `render_table`'s header and row printf, so a parallel branch means a guaranteed conflict. The cost if that's wrong: PR B can't merge before #72, and a rejected commit in #72 means rebasing B.
3. **Build it now on `org-lock list --json`, not after org-lock grows a queue or the team lock.** Recommended: the only queue work in sight is `org-lock/QUEUE-SNAPSHOT.md` ("a separate session will build the durable version") and the unmerged `worktree-coworkers` design for a Salesforce-backed `Org_Lock__c`. Neither has code. The cost if that's wrong: when the team lock lands, holders move off-host, and this column under-reports exactly the way `org-lock list` already does for the 03:00 daily.

## Assumptions I have not verified

- **What a waiting e2e run looks like in `ps`.** I expect a `node .../playwright test` process with no lock, polling at config load. If its alias comes from the worktree's `.env` (loaded by `tests/utils/env_file.ts` inside node), neither `ps eww` nor argv shows it. So **an e2e waiter is detectable only when `SF_ORG_ALIAS` was set inline**. I have not watched a real e2e wait to confirm either half.
- **Where `org-lock run` puts its argv.** I assume `node <path>/org-lock run --alias X [--wait N] -- ...`, with the recorded holder pid being the wrapped child, a descendant of the org-lock node process. The README says the holder is the child. I have not observed a live `run` in `ps`.
- **Long-lived MCP holders stay inside the pane tree.** `~/Apps/CLAUDE.md` says a reused MCP server can hold the lock. I assume it is a descendant of its session's `claude` process, as Bash tool shells are (verified below). Not checked for `run-test-mcp-server`.
- **`ps eww` sees initial env only.** Anything a process sets after exec (dotenv) is invisible. That's the standard macOS/Linux behaviour; I have not tested it on CI's Ubuntu, and CI never needs it because the tests don't rely on env.

## Measured 2026-09-29

| Question | Result |
|---|---|
| `SF_ORG_ALIAS` in a live Claude pane's env | **Absent in 20/20** `claude` processes (`ps eww -o command=`). Only `SF_SCRATCH_POOL_WAIT_MINUTES` is present. |
| Can `ps eww` read env at all? | Yes for `claude` (47 words). The pane's login `-zsh` shows none. |
| Does a Bash tool shell sit in its pane's tree? | Yes: `zsh` → `claude` → `-zsh` (= `#{pane_pid}`) → tmux. |
| `org-lock list --json` fields | `alias, pid, ageMs, status (held/stale/unverified), stale, worktree, spec, cmd`. It returned `[]` today. |
| `org-lock` itself | A node script (`#!/usr/bin/env node`), so waiters look like `node .../org-lock ...`. |
| `jq` | Present (`/usr/bin/jq`), and already a dependency via `claude/statusline.sh`. |

So `bin/sf-org-resolve` and the pane env are both dead ends while idle. The holder row and waiter argv are the only signals.

## Design

**Columns:** `ORG` (alias, 12 wide) and `LOCK` after BRANCH.

| LOCK | Meaning |
|---|---|
| `held` | The alias's holder pid is inside this pane's process tree and status is `held`. |
| `held?` | Same, but status is `unverified` (pid alive, command drifted). Never rendered as free. |
| `queued` | A process in this pane's tree waits on alias X, and X's holder is outside this tree. |
| `-` | Neither. ORG is `-` too. |

A `stale` lock has a dead pid, so it can't sit in a pane tree. It goes to the header instead.

**Header line**, only when locks exist: `Locks: canarys held by pid 4412 (not in a pane) · fe-automation stale`. A holder outside every pane (launchd, a detached run) is the case most likely to surprise you, so it must be visible.

**Per render (forks allowed; the daemon path is untouched):**
1. One `org-lock list --json | jq -r '.[] | [.alias,.pid,.status] | @tsv'`. If `org-lock` or `jq` is missing, or either fails, the ORG/LOCK columns show `-` and nothing else changes.
2. One `ps -axo pid=,ppid=,command=`.
3. One `awk` program takes the ps output, the pane `pane_id pane_pid` pairs and the lock rows, and emits `pane_id\talias\tlock`. For each holder pid and each waiter pid, it walks up the ppid chain (bounded at 32 hops) until it hits a pane pid. Waiters are ps lines matching `org-lock (run .*--alias|claim) <alias>`, or `playwright test` lines whose command carries an inline `SF_ORG_ALIAS=`. That's argv only; `ps eww` is not used, per assumption 1.
4. `render_table` looks each pane up in that output: a bash 3.2 linear scan over at most ~25 lines, no assoc arrays.

**Config:** `TMUX_LLM_ORG_LOCK` (default `org-lock`) names the binary. Tests point it at a fake.

## Files

- `tmux/tmux-llm-status`: `collect_rows` also emits `#{pane_pid}`. New `org_rows` (steps 1-3) and `org_of` (step 4). `render_table` gets the two columns and the header line.
- `scripts/test-tmux-llm-status.sh`: new `E2E - Org` fixture.
- `README.md`: one line on the new columns.

## Tests (fake org-lock, real but throwaway process tree)

- A fake `org-lock` script on `PATH` in `$test_home`. `list --json` cats `$test_home/locks.json`; `run`/`claim` just `sleep 600`, so its argv is a realistic waiter. It never reads or writes `/tmp/e2e-scratch-pool`, and the fixture sets `SCRATCH_POOL_LOCK_DIR` to `$test_home/no-locks` as a backstop.
- The tree uses real processes in test panes: pane A runs `sh -c 'sleep 600 & wait'`, and its `sleep` child's pid goes into `locks.json` as the canarys holder. Pane B runs `org-lock run --alias canarys --wait 5 -- true` (the fake, sleeping).
- Checks: A shows `canarys held`. B shows `canarys queued`. A third pane shows `- -`. An `unverified` holder shows `held?`. A holder pid outside every pane appears in the header and on no row. A missing `org-lock` leaves the table rendering with dashes. `[]` prints no `Locks:` line.
- One negative run of each against a stubbed-out `org_rows`.

## Commits

1. `collect_rows` carries `pane_pid` (refactor, no visible change).
2. `org_rows` + `org_of`, with the fake-org-lock fixture.
3. ORG/LOCK columns and the header line.
4. README.

## Out of scope

- Remote holders (the allure-mac daily) and the Salesforce team lock. The README already says `org-lock list` is per-host. The header can't show what it can't see, and this plan does not pretend otherwise.
- `playwright-cli` sessions: they take no lock and have no alias in argv.
- Any write to org-lock state.
