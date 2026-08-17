# tmux-llm-status: hook-driven agent depth

Date: 2026-08-13
Status: approved design, not yet planned

## Decisions you need from me

1. **Counter fallback if subagent payloads carry no stable id.** Recommendation: fall
   back to a single counter file guarded by an atomic `mkdir` lock, the idiom
   `org-lock` already uses. Cost if wrong: concurrent `SubagentStart` hooks in a
   parallel fan-out lose increments, so the number under-reports exactly when the
   fan-out is largest, which is when you most rely on it.
2. **Whether the hook ships inert behind an env gate.** Recommendation: no gate,
   guarded only by `$TMUX_PANE` being set. Cost if wrong: the hook departs from the
   `SF_LEASE_ENABLE` convention, so a future reader may assume all hooks in this repo
   are opt-in. The counter-cost of gating is worse: you install the feature and it
   silently does nothing.

No other decisions are open. Everything else was settled during brainstorming.

## Assumptions I have not verified

Premises this design rests on. Items 1 and 2 were settled from vendor
documentation on 2026-08-17; the rest remain open and are confirmed by the live
session check, since a live payload capture proved impossible (see below).

1. ~~Payloads carry a stable correlating id.~~ **Settled as `agent_id`** - see
   Verified facts. Documented, not observed.
2. ~~Payloads include `hook_event_name`.~~ **Settled** - see Verified facts.
3. `$TMUX_PANE` inside a `SubagentStart` hook resolves to the **lead's** pane. If
   subagent hooks run in a different environment, the keying breaks and everything
   downstream with it. **Still open** - confirmed by the live session check.
4. `SubagentStart` fires for **every** agent flavour (Task tool, forks, workflow
   agents), not just one. Affects completeness of the count, not its correctness.
   **Still open.**
5. Whether the lead's main loop actually goes idle during a fan-out. Affects how
   often depth-over-idle fires in practice; correctness is unaffected because depth
   overrides the title either way. **Still open.**

Because 1 is documented rather than observed, the hook resolves the id through a
defensive fallback chain (`.agent_id // .subagent_id // .tool_use_id`) rather than
hardcoding a single field. If `agent_id` is present, as documented, the chain is a
no-op; if it is absent under some agent flavour, depth degrades to an over-count
rather than breaking outright.

## Verified facts

Measured or inspected during brainstorming, not assumed:

- The hook event list includes `SubagentStart`, `SubagentStop`, `TaskCreated`,
  `TaskCompleted`, `StopFailure`, `PermissionRequest`, `TeammateIdle`, and
  `PostCompact`, alongside the familiar events.
- `TaskCreated` / `TaskCompleted` fire for the `TaskCreate` **tool**, not for
  backgrounded shell commands. A `run_in_background` Bash call has no completion
  event.
- Claude Code **owns the pane title while a turn is in flight**: a competing write
  survives ~400ms before the animation reclaims it, and never returns.
- Claude Code **sets the title once and forgets it while idle**: a competing write
  survived all 60 samples across 12 seconds.
- `~/.claude/jobs/<id>/state.json` is a live registry carrying `.state`, `.tempo`,
  `.inFlight.tasks`, and `.updatedAt`, but only for background agents. Two entries
  existed against 17 live panes, so it is not a general session registry.
- **`agent_id` is the correlating field on both subagent events.** Vendor changelog:
  "Added `agent_id` and `agent_transcript_path` fields to `SubagentStop` hooks", and
  "Added `agent_id` (for subagents) and `agent_type` (for subagents and `--agent`)
  to hook events". Documented, not observed - the hook keeps a fallback chain.
- **Hooks do not hot-reload into a running session.** A probe hook registered in a
  worktree `.claude/settings.local.json` mid-session did not fire for two subagents
  that ran to completion, while the same script logged correctly when invoked
  directly. So a live payload capture requires either a session restart or a global
  registration that would fire across every other live session. This is why items 1
  and 2 above were settled from documentation instead.

## Problem

The status bar reports that Claude's **main loop is mid-turn**, not that **work is
happening**. Those diverged once background tasks and subagents shipped. A window
running a twelve-agent fan-out is indistinguishable from one answering a one-line
question, and a lead that has gone quiet awaiting subagent results renders as `◆`
(idle) while real work is in flight.

Detection today is entirely a terminal-title scrape: `count_window` reads only
`#{pane_current_command}` and `#{pane_title}`, so it cannot see inside the process.

## Marker vocabulary

| Marker | Meaning |
| --- | --- |
| `⠹` | a turn is running, no fan-out |
| `⠹N` | N subagents in flight |
| `◆` | agent present, idle |
| `!` | blocked on you |

`N` is suppressed at 1, matching how `◆` and `!` already behave.

## Design

### State contract

The state file carries **only what the title cannot**: a count. It never stores
working/idle, because the title classification already gets that right. That
avoids storing a *state* that can go stale - but not a stale count: a nonzero
count unconditionally forces `active` in `count_window`, so one leftover file
still pins the marker to working. Recovery is that pane's next `SessionStart`,
a daemon restart after the pane dies, or `rm -rf` of the pane's `.agents/` dir.
A `Stop`-hook wipe was considered as a self-heal and rejected: in this harness
the lead's turn ends while background subagents are still running, so wiping on
`Stop` would destroy live counts.

```
~/.local/state/tmux-llm/panes/
  437.agents/            <- one file per in-flight subagent
    agent-abc123
    agent-def456
```

Depth is the file count. One file per agent rather than a counter is load-bearing:
a parallel fan-out fires many `SubagentStart` hooks concurrently, and
read-modify-write on a shared counter loses increments. Independent file creates
make the race disappear rather than locking around it. Crash recovery is `rm -rf`.

Panes are keyed by `$TMUX_PANE` (`%437`, stripped to `437`). `TMUX_LLM_STATE_HOME`
overrides the root so tests never touch live state, mirroring
`SESSION_OBJECTIVE_HOME`.

Phantom files are reaped in three tiers: `SessionStart` wipes the pane's dir
(unless its `.source` is `compact` or `resume` - see Hooks below), `SessionEnd`
always wipes it, and the daemon ignores state for panes tmux no longer reports
as live. A hard `SIGKILL` can strand files until that pane's next qualifying
`SessionStart`; accepted rather than adding a permanent heartbeat for a rare,
self-healing case.

### Hooks

One script, `claude/hooks/tmux-agent-depth.sh`, dispatching on `.hook_event_name`:

| Event | Action |
| --- | --- |
| `SubagentStart` | create `panes/<pane>.agents/<agent-id>` |
| `SubagentStop` | remove that file |
| `SessionStart` | wipe the pane's `.agents/` dir, unless `.source` is `compact` or `resume` |
| `SessionEnd` | wipe the pane's `.agents/` dir |

`SessionStart` also fires mid-turn for auto-compaction (`source: "compact"`) and
session resume (`source: "resume"`), both of which can happen while subagents
are still in flight; wiping there would strand a busy pane at idle forever,
since surviving agents only ever fire `SubagentStop`. `startup` and `clear`,
and any `.source` value not yet observed, still wipe.

One script rather than the four-script `sf-lease-*` pattern: those four do
genuinely different work, whereas these share pane resolution and differ by one
line each. Splitting them would duplicate the keying in four places.

Guards, in order: no `$TMUX_PANE`, no `jq`, or unparseable payload all exit 0. The
hook **always exits 0 and writes nothing to stderr on the happy path**, because
`SubagentStart` surfaces stderr in the transcript on exit code 2 and a status-bar
nicety must never add noise to a session.

Registration stays hand-merged into `~/.claude/settings.json`, per the existing
contract that `install-macos.sh` never writes it:

```jsonc
"SubagentStart": [{ "hooks": [{ "type": "command",
  "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }],
"SubagentStop":  [{ "hooks": [{ "type": "command",
  "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }],
```

plus the same under `SessionStart` and `SessionEnd`. `install-macos.sh` gains the
script in both the copy and `--link` lists, and `print_hooks_notice` gains four rows.

### Daemon

**Depth overrides the title.** A pane with agents in flight is `active` even when
its title says idle. That single rule is the feature: it is exactly the case where
the lead has fanned out, gone quiet, and today renders `◆`.

`count_window` accumulates a per-window `depth_sum` across its panes and emits it
as the fourth output field, which `format_marker` receives as its `depth`
argument.

```bash
depth=$(count_agents "$pane_id")
if   (( depth > 0 ));                 then active=$((active+1)); depth_sum=$((depth_sum+depth))
elif has_spinner_title "${title:-}";  then active=$((active+1))
elif is_active_title  "${title:-}";   then active=$((active+1))
elif is_waiting_title "${title:-}";   then waiting=$((waiting+1))
elif is_codex_title   "${title:-}";   then present=$((present+1))
elif is_claude_title  "${title:-}";   then present=$((present+1))
elif is_llm_command "${command##*/}"; then present=$((present+1))
fi
```

The existing chain is untouched below the new first branch, so every case that
works today behaves identically when no state dir exists. `count_window` grows a
fourth output field (`active present waiting depth`) and its `list-panes` format
gains `#{pane_id}`.

`format_marker` picks N by precedence, never by mixing units:

```
depth > 0  ->  N = depth      (agents in flight)
depth == 0 ->  N = active     (panes working, today's meaning)
N == 1     ->  suppress the number
```

With one pane per window the second branch is effectively dead, but keeping it
means an incidental split still renders sanely instead of under-reporting.

`count_agents` uses bash globbing, not `ls`. The daemon already sweeps every
session, window, and pane once per second; forking `ls` ~17 times per second would
be a real regression on a laptop.

The daemon resolves its root once, the same override the hook and tests use:
`STATE_HOME="${TMUX_LLM_STATE_HOME:-$HOME/.local/state/tmux-llm}"`.

```bash
count_agents() {
  local dir="$STATE_HOME/panes/${1#%}.agents"
  local -a found=("$dir"/*)
  if [[ -e "${found[0]}" ]]; then AGENT_COUNT=${#found[@]}; else AGENT_COUNT=0; fi
}
```

Assigning to `AGENT_COUNT` instead of printing avoids a subshell fork on the call site where
depth is read with no command substitution.

`window_category`, `format_fleet`, and the roll-up are untouched. `status-left`
counts **windows** by dominant state, and depth has no place there: `⠹3 ◆2` must
keep meaning "3 windows working, 2 idle".

tmux pane ids reset to `%0` when the tmux server restarts, so a stale `.agents/`
dir could collide with a recycled id. `SessionStart` wiping covers the realistic
path. The daemon also prunes dirs for non-live panes once at startup, not per pass.

## Testing

Every existing check in `scripts/test-tmux-llm-status.sh` must pass **unmodified**.
The design is additive: with no state dir the new first branch never fires, so the
current assertions are the regression guard for "nothing changed when hooks are not
installed". If any existing check needs editing, the design is wrong.

New fixtures reuse the harness style (`tmux select-pane -T`, then `"$bin" once`):

```bash
TMUX_LLM_STATE_HOME="$test_home/llm-state"
export TMUX_LLM_STATE_HOME
agents_for() {
  local id; id="$(t display-message -p -t "$1" '#{pane_id}')"
  mkdir -p "$TMUX_LLM_STATE_HOME/panes/${id#%}.agents"
  for (( i = 0; i < $2; i++ )); do : > "$TMUX_LLM_STATE_HOME/panes/${id#%}.agents/a$i"; done
}
```

| Check | Setup | Expect |
| --- | --- | --- |
| **Depth beats an idle title** | `✳ claude idle` + 3 agents | `S3` |
| Depth suppressed at 1 | `✳ claude idle` + 1 agent | `S` |
| Depth with a working title is not double-counted | `⠋ working` + 4 agents | `S4` |
| Clearing agents reverts | remove files, re-run | `◆` |
| **Roll-up ignores depth** | window with 6 agents | fleet `S1` |
| Another pane's dir does not leak | seed a1, assert a2 | `◆` |

The first is the entire feature. The fifth pins the decision that `status-left`
counts windows, so a later change that threads depth into the roll-up fails loudly
instead of quietly making the corner unreadable.

A second script, `scripts/test-tmux-agent-depth.sh`, covers the hook, following the
existing `test-sf-lease.sh` / `test-sf-lease-hooks.sh` split: `SubagentStart`
creates exactly one file, `SubagentStop` removes that same file, `SessionStart` and
`SessionEnd` wipe the dir, unset `$TMUX_PANE` is a no-op, and garbage stdin exits 0
with empty stderr.

## Out of scope

- **Busy-shell detection.** Needs a deny-list for `nvim`, `less`, `ssh`, `man`,
  `fzf`, `lazygit` and other programs that sit in the foreground indefinitely. The
  list drifts, and false positives land on the one glance the bar exists for.
- **The `⠿` background state.** Two populations under one glyph: background agents
  are visible only through an undocumented internal JSON layout, and backgrounded
  Bash has no completion event. Shipping `⠹N` correctly beats shipping `⠿`
  unreliably. Revisit if it bites.
- **Hook-written titles via `terminalSequence`.** Killed by measurement, not
  opinion. The idle-persistence result is banked if the daemon ever needs to push
  state outward to WezTerm or a notifier.
- **Depth in the session roll-up.** Pinned by a test.
- **The now-inert split-window border logic** in `publish_objectives`. Identified as
  dead weight under a one-pane-per-window workflow but left alone as scope creep.
  Resolved upstream instead: `main` removed objectives from the daemon entirely, so
  this is settled and needs no ticket.
- **Codex depth.** Codex has no `SubagentStart` equivalent, so Codex panes get
  presence and working states but never a depth number. The asymmetry is documented
  in the source rather than faked.
- **A liveness heartbeat.** See the `SIGKILL` gap above.

## Acceptance

- An idle-titled pane with a live fan-out shows `⠹6`.
- It reverts to `◆` when the agents finish.
- Every existing test passes unmodified.
- A machine without the hooks registered behaves exactly as it does today.

## Commit plan

Atomic, in order. Tests are written first within each commit (TDD), but land
*with* the implementation they cover, because every commit must pass its tests:

1. payload probe findings (spec amendment only, no product code)
2. `claude/hooks/tmux-agent-depth.sh` + `scripts/test-tmux-agent-depth.sh`
3. `count_window` / `format_marker` / `count_agents` in `tmux/tmux-llm-status`,
   with the new fixtures and checks in `scripts/test-tmux-llm-status.sh`
4. `install-macos.sh` wiring, `print_hooks_notice` rows, and README docs
