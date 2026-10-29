# Agent activity and tmux sessions

[Back to setup and keybindings](../README.md). Commands below run from the
repository root unless a block names another location.

## Status bar markers

| Marker | Meaning |
| --- | --- |
| `⠹` | a turn is running, no fan-out |
| `⠹N` | N subagents in flight |
| `◆` | agent present, idle |
| `○` | Claude turn ended while unviewed; awaiting acknowledgement |
| `!` | a permission or question prompt is waiting on you |

`N` is suppressed at 1. Both working states come from `tmux-agent-depth.sh`,
under `$TMUX_LLM_STATE_HOME/panes/` (default `~/.local/state/tmux-llm`, override
with `TMUX_LLM_STATE_HOME`):

- **depth** - one file per in-flight subagent in `<pane>.agents/`
- **busy** - `<pane>.busy`, holding the epoch of the last event in the turn

Busy is not a nicety. Claude Code used to animate its terminal title with
braille frames while working; since 2.1.2xx it shows a static `✳ <summary>`
whether it is thinking or idle, so the title can no longer answer "is this pane
working?" at all. Without the hooks registered, every Claude window sits on `◆`
forever and the spinner appears only during a fan-out.

Busy is read as **fresh**, not merely present: `Stop` does not fire when you
interrupt a turn, so an existence check alone would spin forever afterwards.
`UserPromptSubmit` opens the turn, `PostToolBatch` heartbeats it, and
`Stop`/`StopFailure` close it; the marker ages out after
`TMUX_LLM_BUSY_TTL` seconds (default 1200, comfortably above one tool batch).

Claude completion evidence is separate from working/idle/blocked state. A
registered top-level `UserPromptSubmit` with a session ID opens a turn;
`PostToolBatch` can refresh it while fresh. Only a matching top-level `Stop`
within the busy TTL records an unseen completion. Startup, subagent stops,
`StopFailure`, interruption (which has no Stop), and TTL expiry never create
one. A new prompt, session start/end, or failure clears it. A session restart
(including compact/resume) conservatively invalidates completion tracking until
the next prompt. Missing IDs/hooks or an expired turn can miss a completion;
they cannot substitute idle/title heuristics for completion evidence.

The badge means **an observed turn ending**, not passing tests, verified work,
or a completed issue/PR. Like other [Stop observers](https://code.claude.com/docs/en/hooks#stop), it sees
the hook event, not the outcome of other Stop hooks that might ask Claude to continue.
Working and blocked evidence always outrank it. Window/session rollups show
`○N` for windows dominated by unseen completions; the agent table shows
`○ unseen` ahead of ordinary idle rows. Other providers retain their existing
behavior and never gain a completion badge from title text.

A pane counts as viewed when it is the **active pane in the current window of
any attached, non-control tmux client**, as observed at Stop or by a status/table
refresh (normally every second). Detached sessions, background windows, inactive
split panes, and control-mode clients do not acknowledge it. Any viewing client
can acknowledge for everyone, including clients in different sessions viewing a
linked window. This is a tmux selection rule: it cannot prove OS focus or human
attention, and a visit shorter than the polling interval may be missed. To clear
explicitly, run `tmux-llm-status ack %3` (find IDs with
`tmux list-panes -a -F '#{pane_id}'`). `explain` remains read-only and reports
completion eligibility separately from lifecycle state.

Completion/turn records use pane-local `@llm_unseen`, `@llm_turn`, and
`@llm_owner` tmux options, bound to the pane process and Claude session. Hook
producers must descend from the current pane process and name the current server
PID; unavailable process/server identity suppresses completion tracking. Delayed
events from another session cannot clear current evidence. They disappear with the pane or
server; respawning a pane rejects the prior process's evidence. No transcript,
prompt, or response text is saved. Install the hook and status helper together;
no dashboard snapshot/schema change or new notification channel is involved.

Codex task/project titles count as present; only a spinner or a structured
`[Thinking]`/`[Working]` (and other active status) prefix counts as working.
A structured `[Action Required]` prefix counts as waiting; `[Ready]` and
`[Idle]` count as present. Status words inside task names do not change the
marker. Claude's permission/question and busy hooks retain precedence over titles.

Codex panes get presence and the title-based working state, but never a depth
number or a busy marker, because Codex fires neither `SubagentStart` nor these
turn events. The title matchers stay in place for exactly that reason.

`tmux-llm-status prune` drops state for panes tmux no longer reports, so a dead
pane's leftovers cannot linger. If a marker still shows a spinner with no real
work running - a missed `SubagentStop` left a file behind - clear it by hand:
`rm -rf ~/.local/state/tmux-llm/panes/<pane>.agents ~/.local/state/tmux-llm/panes/<pane>.busy`.

The status publisher records its owner in the server-local `@llm_daemon_pid`
option. Duplicate publishers retire themselves when a replacement takes over,
so different versions cannot continually overwrite each other's icons. Each
tmux server has its own publisher. `tmux-llm-status restart` replaces it;
`stop` revokes ownership and lets it finish its current polling cycle. When
upgrading from the older PID-file launcher, stop any surviving old
`tmux-llm-status run` processes once before starting the new publisher.

### Explain a pane's status

Use `tmux list-panes -a -F '#{pane_id}'` to find a pane ID, then run:

```sh
tmux-llm-status explain %3
```

For example, a running Claude turn can report `Status/daemon: active; winning
rule: fresh-busy-marker`, with its busy age and TTL in seconds. A blocked prompt
wins over busy/depth signals; expired or malformed busy evidence falls through
to title/command presence. The report lists lower-priority evidence even when
ignored, and identifies stale needs markers ignored on bare shells.

The command evaluates the existing classifier twice: status/daemon context,
then table context with live Claude session records. A parked session can be
`none` in the status bar but `present` in the table; session records require
`jq`. Missing marker files cannot distinguish unregistered hooks from idle
agents. Needs/depth have no TTL; future busy timestamps retain the existing
classifier behavior. Neither a fresh marker nor a session record proves that a
reused pane ID still belongs to the original process. This is a point-in-time
observation, so a changing pane may differ on the next status refresh.

Only explicit `%<digits>` IDs are accepted. Exit status is 0 for a live pane
(including a non-agent), 1 for a missing/dead pane or unavailable server, and 2
for invalid arguments. The command reads metadata and existing hook/session
records, never pane content/history, and does not repair files, prune state,
update status options, or send notifications. It omits raw titles, commands,
agent names, paths, and marker contents. To report a status bug, paste this
output with the expected state and whether hooks are registered; do not attach
transcripts or settings. Review even sanitized output before sharing it.

### Registering the hooks

`~/.claude/settings.json` is never written by this repo, so merge these by hand,
appending to any array that already exists:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "PostToolBatch": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "StopFailure": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "SubagentStart": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "Notification": [
      { "matcher": "permission_prompt|elicitation_dialog", "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ]
  }
}
```

The first four are the busy marker, the next two are depth, the next two
reset a pane, and `Notification` is the blocked `!`. Esc on a prompt fires no
hook, so `!` stays until you next type in that pane. No event marks a prompt as
approved, so an approved long-running tool keeps `!` until its batch finishes. Registering only some is fine - each state degrades to absent
rather than wrong - but dropping `Stop` leaves every pane spinning until the
TTL expires.

## tmux Session Order

`Ctrl-a s` (`choose-tree`) lists sessions in creation order, which is session id
order, and tmux has no command to move a session within it. `choose-tree -O name`
sorts by name instead - tempting for keeping a prefixed family like `E2E - *`
adjacent, but the same sort field applies one level down, so every session's
window list turns alphabetical too. That is why the picker stays on the default.

`tmux-session-to-end` is the other lever: it rebuilds a session around a fresh
id so the session lands at the end of the list. Windows are relinked with
`move-window` rather than recreated, so pane processes - agents, dev servers,
long-running tests - keep running, and window indices survive.

```bash
tmux-session-to-end Workflow                        # send one session to the end
tmux-session-to-end Workflow 'Manual Testing' Scrum # tail order follows argument order
```

To group a family, send everything that sits between its members to the end. It
holds until the next session is created, since new sessions also land last.


## Notes

The LLM activity marker is driven primarily by pane titles: it recognizes the
working spinner and idle state of both Claude Code and Codex, which animate and
label their terminal titles. Foreground command names are only a fallback for
other CLIs - Claude and Codex report an unstable process name (e.g. a version
string), so they are detected by title, not command. CLIs that expose neither
may only show a generic detected marker.
