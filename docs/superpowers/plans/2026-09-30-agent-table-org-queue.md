# Agent table: org queue position from the announce log

Follows PR #74 (ORG/LOCK columns, merged). Adds a numbered queue (`wait 1`, `wait 2`, ...) to the LOCK column, read from `/tmp/e2e-scratch-pool/announce.log`. Branch `feat/agent-table-queue` off `main`.

## Decisions you need from me

1. **Drop a wait when its pane is gone, when the same pane later logs CLAIM/RELEASE/ACTUAL on that alias, or after 12h.** Recommended: pane liveness catches ended sessions, and 12h catches a live session that silently gave up. The cost if that's wrong: too short a cutoff drops a real long wait; too long keeps a phantom holding a slot that later waiters count behind.
2. **Order by tier (P0-P3), then first WAIT time.** Recommended, because that's the agreed rule in `~/Apps/CLAUDE.md`, and it reproduced bb-624's own "behind ..." list today. The cost if that's wrong: rule 7's "yielded twice ties with P1" backstop is invisible in the log, so a starved P2 still shows behind P1s.
3. **Show waits from lines without `pane=` on the `Locks:` line by session name, not in any row, for 12h.** Recommended: sessions already running won't reread the convention, so during rollout most waits are legacy. The cost if that's wrong: the header line gets long for a day, then empties by itself.

## Assumptions I have not verified

- **Running sessions will adopt `pane=`.** Only sessions that reread `~/Apps/CLAUDE.md` or get a new brief will. Until then the queue is mostly on the `Locks:` line (decision 3).
- **Sessions log the pane that actually runs the tests.** A session that shells into another pane, or a subagent pane, would log the wrong pane. I haven't seen it happen.
- **The log stays small enough to read in full on every render.** It's 113 lines over 2 days. The plan reads `tail -n 2000` as a bound anyway.
- **Session tokens don't contain `pane=`.** Parsing finds the first `pane=%[0-9]+` token anywhere in the line.

## Verified 2026-09-30

| Question | Result |
|---|---|
| `$TMUX_PANE` in a Claude Bash tool shell | Set (`%228`), so the convention's `echo` expands it. |
| Waiting `org-lock run` processes on the host | **None**, while 4 sessions had logged WAIT on canarys. The process-based `queued` from #74 never fires in practice. |
| Queue rebuilt from the log (latest verb per session is WAIT, tier then time) | bg-96-drift P1, bb-391-06, bb-12, bb-624, plus 2 from yesterday. Matches bb-624's self-declared "behind firstuser-avail, bg-96-drift, bb-391-06, bb-12, bb-741". |
| Log session names vs table rows | 3 of 5 waiters matched by name. That is why the convention now carries the pane. |

## Corrected during the build

- **All three decisions went with the recommendation** (2026-09-30).
- **A wait silent past the cutoff keeps no place when revived.** The first build kept the first WAIT's time across a 14h gap. That put bb-741 (WAIT yesterday 19:35, again today 09:28) first, where bb-624's own list had it fourth. Expired waits now close during the scan, and the live order matches bb-624's list exactly.
- **Commits 1 and 2 merged into one.** The suite tests only through `table`, and `wait_rows` has no visible effect without the wiring. A debug subcommand just to split them wasn't worth it.
- **The "dropped" checks were vacuous at first.** They grepped for session names the table never prints for pane-tagged waits. Mutation runs (cutoff, live-pane, close-on-CLAIM and sort each disabled) showed that. Each check now fails under exactly its own mutation.
- **The existing "missing org-lock drops the columns" check now also points the log at a missing file.** With waits present, the columns showing is correct.
- **Legacy lines resolve through the agent name.** In practice a wait with no `pane=` still sat on the `Locks:` line. `~/.claude/sessions/<pid>.json` holds each live session's agent name and pane, and the logged name is that agent name, sometimes minus its two-character suffix (bb-624 is bb-624-7b on %212, confirmed by the pid tree). Matching exactly, or by suffix when only one agent fits, placed 3 of 4 live waits. The fourth, bb-741-job-setting-rest, reads `(unmatched)`. It is alive: it is `job-settings-workaround-b5` (PR #793, pane %139), logging a hand-picked name. An earlier label, `(no session)`, read as dead and nearly got a live waiter RELEASEd on its behalf.
- **`pane=` adoption started within minutes.** firstuser-avail logged `RELEASE`/`ACTUAL` with `pane=%226` at 09:39.

## Done already (outside this repo)

- `~/Apps/CLAUDE.md`: the example line carries `pane=$TMUX_PANE`, plus one comment line. Committed locally as `0f22346` (the repo has no remote). Other sessions' unstaged edits there were left alone.
- `~/.claude/skills/session-dispatch/references/brief-template.md`: CLAIM and WAIT bullets name `pane=$TMUX_PANE`. **Not committed**: `session-dispatch/` is untracked in the skills repo.

## Design

**Line grammar read:** `<ts> <VERB> <alias> <session> ... [pane=%N] ... [P0-3] ...`. The tier is the first `P[0-3]` token after the session. Timestamps compare as strings (`%FT%T`).

**`wait_rows`** (new, one awk over `tail -n 2000` of the log). Inputs: live pane ids, holder `pane<TAB>alias` pairs from `org_rows`, and a cutoff timestamp (`date -v-12H`, falling back to GNU `date -d`). For each `(pane or session, alias)`:
- WAIT opens a wait if none is open, recording its first timestamp. Later WAITs update the tier only (an "UPDATE supersedes" line keeps its place).
- CLAIM, RELEASE or ACTUAL closes it.

It then drops closed waits, waits opened before the cutoff, panes not in the live list, and panes that hold that alias. Within each alias it sorts by tier (none sorts after P3), then time, and numbers from 1. Output:
- `pane<TAB>alias<TAB>wait N<TAB>-` for lines carrying a pane;
- `-<TAB>alias<TAB>wait N<TAB>session` for legacy lines, which go to the header.

Legacy lines share one numbering with pane lines, so positions stay true.

**Wiring in `render_table`:**
- `ORG_ROWS` = holders, then process `queued` rows, then `wait_rows`. `org_of`'s first-match-wins keeps `held` over `wait`.
- The columns appear when locks **or** waits exist. An alias with waiters and no holder adds `canarys free, 2 waiting` to `Locks:`, which is the case where the next session should go.
- The header loop also skips `wait` rows for panes that have an agent row. Legacy ones render as `bb-12 wait 3 (no pane)`.
- `lock_w` becomes 7 (`wait 10`).

**Kept:** the #74 process-inferred `queued`, unnumbered. It's cheap and still right for an `org-lock run --wait` waiter. **Config:** `TMUX_LLM_ANNOUNCE_LOG` (default `/tmp/e2e-scratch-pool/announce.log`); tests point it at a fixture. The daemon path is untouched.

## Files

- `tmux/tmux-llm-status`: `wait_rows`, and the `render_table` wiring above.
- `scripts/test-tmux-llm-status.sh`: announce-log fixture in `$test_home`, exported like `FAKE_LOCKS`.
- `README.md`: the ORG/LOCK entry names `wait N` and where it comes from.

## Tests (fixture log, real throwaway panes in `E2E - Org`)

- Two panes WAIT, the P2 first and the P1 later: P1 shows `wait 1`, P2 `wait 2`.
- A pane that logs WAIT then CLAIM shows `held` (with a fake lock) or `-`, never `wait`.
- A second WAIT from the same pane keeps its original place.
- A WAIT for a pane id no longer present (`%99999`), and one older than the cutoff, both render nowhere.
- A legacy WAIT with no `pane=` appears on `Locks:` with its number and on no row.
- Waits with `locks.json` = `[]`: columns appear, and `Locks:` reads `canarys free, N waiting`.
- A missing log leaves #74 behaviour byte-identical. A negative run of each against a stubbed `wait_rows`.

## Commits

1. `wait_rows`, with the fixture and its unit-level checks.
2. The `render_table` wiring: numbered LOCK, columns on waits alone, the `free, N waiting` header.
3. README.
4. This plan, amended with anything measured during the build.

## Out of scope

- Enforcing order. org-lock has no reservation, and first to claim still wins. `wait 2` reports the agreed order; it guarantees nothing.
- Rule 7's yield backstop, remote holders (allure-mac daily), and any write to the log or lock state.
