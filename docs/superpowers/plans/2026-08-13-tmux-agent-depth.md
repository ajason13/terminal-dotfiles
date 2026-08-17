# tmux Agent Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tmux status bar show how many subagents are in flight per window, so a lead that has fanned out and gone quiet reads as working rather than idle.

**Architecture:** Claude Code hooks write one file per in-flight subagent into a per-pane state directory. The `tmux-llm-status` daemon counts those files during its existing one-second sweep and lets a nonzero count override the terminal-title classification. The state file carries only a count, never working/idle, so a missed hook can never strand a pane in a wrong state.

**Tech Stack:** bash 3.2 (macOS system bash), tmux, jq (hook only), Claude Code hooks.

**Spec:** `docs/superpowers/specs/2026-08-13-tmux-agent-depth-design.md`

## Global Constraints

- **bash 3.2 compatible.** macOS ships bash 3.2 and `tmux-llm-status` runs under `#!/usr/bin/env bash`. No associative arrays, no `${var^^}`, no `mapfile`.
- **The hook always exits 0 and writes nothing to stderr on success.** `SubagentStart` surfaces hook stderr in the transcript on exit code 2.
- **The daemon adds zero forks per pane per pass.** It already sweeps every session, window, and pane once per second; use bash globbing, never `ls`.
- **Every existing check in `scripts/test-tmux-llm-status.sh` must pass unmodified.** If one needs editing, the design is wrong - stop and report.
- **State root override is `TMUX_LLM_STATE_HOME`**, defaulting to `$HOME/.local/state/tmux-llm`. Used identically by the hook, the daemon, and both test scripts.
- **Pane key is `$TMUX_PANE` with the leading `%` stripped:** `%437` becomes `437`.
- **Every commit compiles and passes its tests.** Tests are written first within a task but committed alongside their implementation.
- **No em dashes in source comments or docs.** Use a plain dash.
- **Comment blocks are 1-2 lines**, carrying the load-bearing "why" only.

---

### Task 1: Settle the subagent payload shape

The entire design assumes `SubagentStart`/`SubagentStop` payloads carry a stable correlating id, that `hook_event_name` is present, and that `$TMUX_PANE` inside a subagent hook resolves to the lead's pane. None of that is verified. This task is throwaway instrumentation whose only deliverable is an amendment to the spec.

**Files:**
- Create: `/private/tmp/claude-502/.../scratchpad/probe-hook.sh` (throwaway, never committed)
- Create: `.claude/settings.local.json` (worktree-scoped, temporary, removed in Step 7)
- Modify: `docs/superpowers/specs/2026-08-13-tmux-agent-depth-design.md`

**Interfaces:**
- Consumes: nothing
- Produces: the confirmed jq path for the agent id, used verbatim in Task 2's `agent="$(... jq -r '<PATH>' ...)"`

- [ ] **Step 1: Write the probe hook**

Write to the scratchpad (NOT the repo):

```bash
#!/usr/bin/env bash
# THROWAWAY. Dumps every hook payload so we can read the real field names.
set -uo pipefail
LOG="${0%/*}/probe-hook.log"
payload="$(cat)"
{
  printf '=== %s TMUX_PANE=[%s]\n' "$(date +%H:%M:%S)" "${TMUX_PANE:-UNSET}"
  printf '%s\n' "$payload"
} >> "$LOG" 2>/dev/null
exit 0
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x <scratchpad>/probe-hook.sh`

- [ ] **Step 3: Register it worktree-scoped**

Create `.claude/settings.local.json` in the worktree root. Worktree-scoped, NOT `~/.claude/settings.json` - a global registration would fire in all of Jason's other live sessions.

```json
{
  "hooks": {
    "SubagentStart": [{ "hooks": [{ "type": "command", "command": "/private/tmp/claude-502/-Users-jasonalvarez-Apps-wezterm-tmux-dotfiles/e7126e82-3bf3-4104-b42c-ead49a610adb/scratchpad/probe-hook.sh", "timeout": 5 }] }],
    "SubagentStop":  [{ "hooks": [{ "type": "command", "command": "/private/tmp/claude-502/-Users-jasonalvarez-Apps-wezterm-tmux-dotfiles/e7126e82-3bf3-4104-b42c-ead49a610adb/scratchpad/probe-hook.sh", "timeout": 5 }] }]
  }
}
```

- [ ] **Step 4: Restart the session so hooks load**

Settings may not hot-reload. Exit and re-enter Claude Code in this worktree before proceeding, or the log will stay empty and you will wrongly conclude the events do not fire.

- [ ] **Step 5: Trigger two concurrent subagents**

Dispatch two trivial subagents in a single message so their `SubagentStart` hooks fire concurrently, which also exercises the race the one-file-per-agent design exists to avoid. A prompt such as "echo the word ping and stop" is enough for each.

- [ ] **Step 6: Read the log and answer five questions**

Run: `cat <scratchpad>/probe-hook.log`

Record, for each:
1. Is `hook_event_name` present, and is its value exactly `SubagentStart` / `SubagentStop`?
2. Which key holds a **stable id that matches between Start and Stop** for the same agent? Candidates: `agent_id`, `subagent_id`, `tool_use_id`, `session_id`.
3. Does `TMUX_PANE` show the lead's pane id, or `UNSET`?
4. Did both concurrent agents produce distinct ids?
5. Did `SubagentStop` fire for both?

- [ ] **Step 7: Remove the temporary registration**

Run: `rm .claude/settings.local.json`

Leaving it registered would point a live hook at a scratchpad path that gets cleaned up.

- [ ] **Step 8: Amend the spec with the findings**

Replace the "Assumptions I have not verified" section's items 1-3 with the measured answers, moving them into "Verified facts". If question 2 has **no** stable matching id, stop and report: Task 2 must switch to the `mkdir`-locked counter fallback and this plan needs revising before you continue.

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/specs/2026-08-13-tmux-agent-depth-design.md
git commit -m "docs(tmux): record measured subagent hook payload shape

Replaces three assumed premises with measured ones: the event name field,
the id that correlates SubagentStart with SubagentStop, and whether
\$TMUX_PANE inside a subagent hook resolves to the lead's pane.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The hook script

**Files:**
- Create: `claude/hooks/tmux-agent-depth.sh`
- Create: `scripts/test-tmux-agent-depth.sh`

**Interfaces:**
- Consumes: the jq id path confirmed in Task 1
- Produces: the on-disk contract `$TMUX_LLM_STATE_HOME/panes/<pane>.agents/<agent-id>`, one file per in-flight agent, which Task 3 counts

- [ ] **Step 1: Write the failing test**

Create `scripts/test-tmux-agent-depth.sh`:

```bash
#!/usr/bin/env bash
# Behavioural tests for claude/hooks/tmux-agent-depth.sh. Drives the hook the way
# Claude Code does - JSON on stdin, TMUX_PANE in the environment - and asserts on
# the resulting state directory.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook="$repo_root/claude/hooks/tmux-agent-depth.sh"

test_home="$(mktemp -d /tmp/tmux-agent-depth-test-XXXXXX)"
TMUX_LLM_STATE_HOME="$test_home/state"
export TMUX_LLM_STATE_HOME
trap 'rm -rf "$test_home"' EXIT

agent_dir="$TMUX_LLM_STATE_HOME/panes/9.agents"

failures=0
check() {
  local label="$1" want="$2" got="$3"
  if [[ "$want" == "$got" ]]; then
    printf '  ok   %s\n' "$label"
  else
    printf '  FAIL %s\n       want: [%s]\n       got:  [%s]\n' "$label" "$want" "$got" >&2
    failures=$((failures + 1))
  fi
}

# Fire one hook event the way Claude Code would.
fire() {
  local event="$1" agent="${2:-}" pane="${3:-%9}"
  printf '{"hook_event_name":"%s","agent_id":"%s"}' "$event" "$agent" \
    | TMUX_PANE="$pane" "$hook"
}

# nullglob stays OFF deliberately: with it on, an empty dir yields an empty array
# and `${f[0]}` is unbound under `set -u`. Unset, the glob stays literal and the
# -e test fails cleanly.
count() {
  local -a f=("$agent_dir"/*)
  if [[ -e "${f[0]}" ]]; then printf '%d' "${#f[@]}"; else printf '0'; fi
}

fire SubagentStart alpha
check "start creates one file" "1" "$(count)"

fire SubagentStart beta
check "second agent adds a file" "2" "$(count)"

# A duplicate Start must not inflate the count, or a retried hook double-counts.
fire SubagentStart beta
check "duplicate start is idempotent" "2" "$(count)"

fire SubagentStop beta
check "stop removes only its own agent" "1" "$(count)"

# An unmatched Stop must not disturb the others.
fire SubagentStop never-started
check "unknown stop is a no-op" "1" "$(count)"

fire SessionStart
check "session start wipes the pane" "0" "$(count)"

fire SubagentStart gamma
fire SessionEnd
check "session end wipes the pane" "0" "$(count)"

# --- guards: the hook must never disturb a session --------------------------
fire SubagentStart delta '%9'
other="$TMUX_LLM_STATE_HOME/panes/7.agents"
check "another pane is untouched" "absent" \
  "$(if [[ -d "$other" ]]; then printf 'present'; else printf 'absent'; fi)"

# Outside tmux there is no pane to key on, so the hook must do nothing.
# `|| true` throughout: `set -e` would abort the run instead of reporting a FAIL.
out="$(printf '{"hook_event_name":"SubagentStart","agent_id":"x"}' | env -u TMUX_PANE "$hook" 2>&1 || true)"
check "no TMUX_PANE is a silent no-op" "" "$out"

# Garbage input must exit 0 with silent stderr, or it lands in the transcript.
err="$(printf 'not json at all' | TMUX_PANE='%9' "$hook" 2>&1 >/dev/null || true)"
check "garbage stdin is silent" "" "$err"

rc=0
printf 'not json at all' | TMUX_PANE='%9' "$hook" >/dev/null 2>&1 || rc=$?
check "garbage stdin exits 0" "0" "$rc"

if (( failures > 0 )); then
  printf 'test-tmux-agent-depth: %d failure(s)\n' "$failures" >&2
  exit 1
fi

printf 'test-tmux-agent-depth: all checks passed\n'
```

- [ ] **Step 2: Make the test executable and run it to verify it fails**

Run:
```bash
chmod +x scripts/test-tmux-agent-depth.sh
./scripts/test-tmux-agent-depth.sh
```

Expected: FAIL, because `claude/hooks/tmux-agent-depth.sh` does not exist yet. The `set -euo pipefail` at the top means it aborts on the first `fire` call.

- [ ] **Step 3: Write the hook**

Create `claude/hooks/tmux-agent-depth.sh` exactly as below. `agent_id` is the documented correlating field on both subagent events, but Task 1 could not capture a live payload to confirm it, so the jq expression keeps a defensive fallback chain. Do not collapse it to a single field:

```bash
#!/usr/bin/env bash
# Tracks in-flight subagents per tmux pane so the status bar can show depth.
#
# One file per agent rather than a counter: a parallel fan-out fires many
# SubagentStart hooks concurrently, and read-modify-write on a shared counter
# loses increments exactly when the fan-out is largest. Always exits 0 and stays
# silent - SubagentStart surfaces hook stderr in the transcript.
set -uo pipefail

# No pane to key on means we are not in tmux and there is nothing to track.
[[ -n "${TMUX_PANE:-}" ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

STATE_HOME="${TMUX_LLM_STATE_HOME:-${HOME:-}/.local/state/tmux-llm}"
AGENT_DIR="$STATE_HOME/panes/${TMUX_PANE#%}.agents"

payload="$(cat 2>/dev/null || true)"
event="$(printf '%s' "$payload" | jq -r '.hook_event_name // empty' 2>/dev/null || true)"
agent="$(printf '%s' "$payload" | jq -r '.agent_id // .subagent_id // .tool_use_id // empty' 2>/dev/null || true)"

# Ids are opaque upstream values that become filenames, so keep only characters
# that cannot escape the directory.
agent="$(printf '%s' "$agent" | tr -cd 'A-Za-z0-9_-')"

case "$event" in
  SubagentStart)
    [[ -n "$agent" ]] || exit 0
    mkdir -p "$AGENT_DIR" 2>/dev/null || exit 0
    : > "$AGENT_DIR/$agent" 2>/dev/null || true
    ;;
  SubagentStop)
    [[ -n "$agent" ]] || exit 0
    rm -f "$AGENT_DIR/$agent" 2>/dev/null || true
    ;;
  SessionStart | SessionEnd)
    rm -rf "$AGENT_DIR" 2>/dev/null || true
    ;;
esac

exit 0
```

- [ ] **Step 4: Make it executable and run the tests to verify they pass**

Run:
```bash
chmod +x claude/hooks/tmux-agent-depth.sh
./scripts/test-tmux-agent-depth.sh
```

Expected: `test-tmux-agent-depth: all checks passed`

- [ ] **Step 5: Commit**

```bash
git add claude/hooks/tmux-agent-depth.sh scripts/test-tmux-agent-depth.sh
git commit -m "feat(tmux): track in-flight subagents per pane via hooks

One file per agent rather than a counter, because a parallel fan-out fires
many SubagentStart hooks concurrently and a shared counter loses increments
under read-modify-write precisely when the fan-out is largest.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Daemon reads depth and renders it

**Files:**
- Modify: `tmux/tmux-llm-status:110-133` (`count_window`), `:187-197` (`format_marker`), `:222-227` (`window_status`), `:231-251` (`fleet_summary`), `:255-284` (`next_waiting`), `:290-313` (`update_session`), `:328-333` (`run_daemon`), `:365-398` (dispatch)
- Test: `scripts/test-tmux-llm-status.sh`

**Interfaces:**
- Consumes: the on-disk contract from Task 2
- Produces: `count_agents <pane_id>` echoing an integer; `prune_dead_panes` and its `prune` subcommand; `count_window` echoing four space-separated integers `active present waiting depth_sum`; `format_marker <active> <present> <waiting> [depth]`

**Critical:** `count_window` currently emits three fields and is read at **four** call sites (`window_status:225`, `fleet_summary:242`, `next_waiting:275`, `update_session:297`). `read -r a b c` against four fields silently packs `"3 4"` into `c`. Every call site must gain the fourth variable or `waiting` becomes a non-numeric string and the `(( ))` comparisons break.

- [ ] **Step 1: Write the failing tests**

Add to `scripts/test-tmux-llm-status.sh`. Insert the helper next to the existing `SESSION_OBJECTIVE_HOME` block near line 20:

```bash
# Isolate agent-depth state the same way objectives are isolated, so these tests
# can never read or write the real status directory.
TMUX_LLM_STATE_HOME="$test_home/llm-state"
export TMUX_LLM_STATE_HOME

agent_dir_for() {
  local id
  id="$(t display-message -p -t "$1" '#{pane_id}')"
  printf '%s' "$TMUX_LLM_STATE_HOME/panes/${id#%}.agents"
}

agents_for() {
  local dir i
  dir="$(agent_dir_for "$1")"
  mkdir -p "$dir"
  for (( i = 0; i < $2; i++ )); do : > "$dir/a$i"; done
}

clear_agents_for() { rm -rf "$(agent_dir_for "$1")"; }

exists() { if [[ -d "$1" ]]; then printf 'present'; else printf 'absent'; fi; }
```

Append these checks immediately before the final `if (( failures > 0 ))` block at line 94:

```bash
# --- agent depth ---------------------------------------------------------------
# The whole feature: a lead that fanned out and went quiet still reads as working.
t select-pane -t alpha:a1 -T '✳ claude idle'
agents_for alpha:a1 3
"$bin" once
check "depth overrides an idle title" "S3" "$(marker_of alpha:a1)"

# The roll-up counts windows, not agents, or the bottom-left corner stops scanning.
check "roll-up counts windows not agents" "S1" "$(fleet_of alpha)"

clear_agents_for alpha:a1
agents_for alpha:a1 1
"$bin" once
check "depth of 1 suppresses the number" "S" "$(marker_of alpha:a1)"

# A working title plus depth must count the pane once, not twice. alpha:a2 is set
# in the SAME pass: markers are read from stored options, so a title changed after
# the last `once` would assert against stale state.
t select-pane -t alpha:a1 -T '⠋ claude working'
t select-pane -t alpha:a2 -T '✳ claude idle'
clear_agents_for alpha:a1
agents_for alpha:a1 4
"$bin" once
check "working title is not double-counted" "S4" "$(marker_of alpha:a1)"

# One window's agents must never leak into another's marker.
check "sibling window unaffected by depth" "◆" "$(marker_of alpha:a2)"

clear_agents_for alpha:a1
t select-pane -t alpha:a1 -T '✳ claude idle'
"$bin" once
check "clearing agents reverts to present" "◆" "$(marker_of alpha:a1)"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./scripts/test-tmux-llm-status.sh`

Expected: the six new checks FAIL (`depth overrides an idle title` reports `want: [S3] got: [◆]`). Every pre-existing check must still pass; if one fails now, you have broken the fixture setup, not the feature.

- [ ] **Step 3: Add the state root and `count_agents`**

In `tmux/tmux-llm-status`, add after the `tmux_cmd` function (around line 22):

```bash
STATE_HOME="${TMUX_LLM_STATE_HOME:-${HOME:-}/.local/state/tmux-llm}"

# In-flight subagents for one pane, as a file count published by the
# tmux-agent-depth hook. Globbed rather than `ls` because this runs for every
# pane on every one-second pass and must not fork.
count_agents() {
  local dir="$STATE_HOME/panes/${1#%}.agents"
  local -a found=("$dir"/*)
  if [[ -e "${found[0]}" ]]; then printf '%d' "${#found[@]}"; else printf '0'; fi
}
```

- [ ] **Step 4: Teach `count_window` to read depth**

Replace `count_window` (lines 110-133) with:

```bash
# Scan a window's panes and echo four space-separated counts:
# "<active> <present> <waiting> <depth>" = working / present-but-idle /
# awaiting-input panes, then total subagents in flight across the window.
count_window() {
  local target="${1:?window target required}"
  local active=0 present=0 waiting=0 depth_sum=0 pane_id command title depth

  while IFS=$'\t' read -r pane_id command title; do
    depth="$(count_agents "$pane_id")"
    # Depth wins over the title: a lead that fanned out and went quiet reports an
    # idle title while its agents are still running, which is the case this exists for.
    if (( depth > 0 )); then
      active=$((active + 1))
      depth_sum=$((depth_sum + depth))
    elif has_spinner_title "${title:-}"; then
      active=$((active + 1))
    elif is_active_title "${title:-}"; then
      active=$((active + 1))
    elif is_waiting_title "${title:-}"; then
      waiting=$((waiting + 1))
    elif is_codex_title "${title:-}"; then
      present=$((present + 1))
    elif is_claude_title "${title:-}"; then
      present=$((present + 1))
    elif is_llm_command "${command##*/}"; then
      present=$((present + 1))
    fi
  done < <(tmux_cmd list-panes -t "$target" -F '#{pane_id}	#{pane_current_command}	#{pane_title}' 2>/dev/null || true)

  # Trailing newline is required: callers use `read`, which returns non-zero at
  # EOF without one, and under `set -e` that would silently abort the caller.
  printf '%d %d %d %d\n' "$active" "$present" "$waiting" "$depth_sum"
}
```

The tab characters inside the `-F` format string are literal tabs, matching the existing line 128.

- [ ] **Step 5: Teach `format_marker` to render depth**

Replace `format_marker` (lines 187-197) with:

```bash
# Per-window marker, by precedence: working (spinner) > present (diamond) >
# waiting (bang). The spinner's number is agents-in-flight when we have that
# count, else panes working - never the two summed, they are different units.
format_marker() {
  local active="$1" present="$2" waiting="$3" depth="${4:-0}" n

  if (( active > 0 )); then
    if (( depth > 0 )); then n="$depth"; else n="$active"; fi
    if (( n == 1 )); then spinner_frame; else printf '%s%d' "$(spinner_frame)" "$n"; fi
  elif (( present > 0 )); then
    if (( present == 1 )); then printf '◆'; else printf '◆%d' "$present"; fi
  elif (( waiting > 0 )); then
    if (( waiting == 1 )); then printf '!'; else printf '!%d' "$waiting"; fi
  fi
}
```

- [ ] **Step 6: Update all four `count_window` call sites**

`window_status` (lines 222-227):

```bash
window_status() {
  local target="${1:?window target required}"
  local active present waiting depth
  read -r active present waiting depth < <(count_window "$target")
  format_marker "$active" "$present" "$waiting" "$depth"
}
```

In `fleet_summary` (line 234), change the declaration to `local window active present waiting depth` and line 242 to:

```bash
    read -r active present waiting depth < <(count_window "$window")
```

In `next_waiting` (line 256), change the declaration to `local current window active present waiting depth` and line 275 to:

```bash
    read -r active present waiting depth < <(count_window "$target")
```

In `update_session` (line 292), change the declaration to `local window active present waiting depth` and lines 297-299 to:

```bash
    read -r active present waiting depth < <(count_window "$window")
    tmux_cmd set-option -wq -t "$window" @llm_status \
      "$(format_marker "$active" "$present" "$waiting" "$depth")" 2>/dev/null || true
```

`window_category` keeps taking three arguments and is unchanged - the roll-up counts windows by dominant state, and depth has no place in it.

- [ ] **Step 7: Write the failing test for stale-pane pruning**

Append to the agent-depth block in `scripts/test-tmux-llm-status.sh`:

```bash
# --- pruning state for panes that no longer exist ------------------------------
# tmux pane ids reset to %0 when the server restarts, so a dir left by a previous
# server can collide with a recycled id. Exposed as a subcommand so it is testable
# without running the daemon loop.
mkdir -p "$TMUX_LLM_STATE_HOME/panes/99999.agents"
: > "$TMUX_LLM_STATE_HOME/panes/99999.agents/ghost"
agents_for alpha:a1 2
"$bin" prune
check "prune drops dirs for dead panes" "absent" \
  "$(exists "$TMUX_LLM_STATE_HOME/panes/99999.agents")"
check "prune keeps dirs for live panes" "present" \
  "$(exists "$(agent_dir_for alpha:a1)")"
clear_agents_for alpha:a1
```

Run: `./scripts/test-tmux-llm-status.sh`

Expected: FAIL with a usage error, because `prune` is not a recognised subcommand yet.

- [ ] **Step 8: Implement pruning**

Add to `tmux/tmux-llm-status`, after `count_agents`:

```bash
# Drop agent state for panes tmux no longer reports. Pane ids reset to %0 on a
# tmux server restart, so a stale dir could otherwise collide with a recycled id.
prune_dead_panes() {
  local dir id live
  [[ -d "$STATE_HOME/panes" ]] || return 0
  live=" $(tmux_cmd list-panes -a -F '#{pane_id}' 2>/dev/null | tr -d '%' | tr '\n' ' ' || true)"
  for dir in "$STATE_HOME/panes"/*.agents; do
    [[ -d "$dir" ]] || continue
    id="${dir##*/}"
    id="${id%.agents}"
    case "$live" in
      *" $id "*) ;;
      *) rm -rf "$dir" 2>/dev/null || true ;;
    esac
  done
}
```

Call it once at daemon start, not per pass - a directory scan every second to fix a
problem that occurs approximately never. In `run_daemon` (line 328):

```bash
run_daemon() {
  prune_dead_panes
  while true; do
    update_all_windows
    sleep 1
  done
}
```

Add a `prune` case to the dispatch block alongside `once`:

```bash
  prune)
    prune_dead_panes
    ;;
```

and add it to the usage string:

```bash
    printf 'Usage: %s window <target> | objective <target> | summary [session] | next-waiting | once | prune | start | stop | restart\n' "${0##*/}" >&2
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `./scripts/test-tmux-llm-status.sh`

Expected: `test-tmux-llm-status: all checks passed`, with every pre-existing check still passing unmodified.

- [ ] **Step 10: Run the hook tests to confirm nothing regressed**

Run: `./scripts/test-tmux-agent-depth.sh`

Expected: `test-tmux-agent-depth: all checks passed`

- [ ] **Step 11: Commit**

```bash
git add tmux/tmux-llm-status scripts/test-tmux-llm-status.sh
git commit -m "feat(tmux): show subagent depth in the window marker

A lead that fans out and goes quiet reports an idle title while its agents
run, so depth now overrides the title classification. The spinner's number is
agents-in-flight when known, else panes working - never the two summed.

count_window gained a fourth output field, so all four of its read sites were
updated; three fields read into four would have packed two into \$waiting.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Installer wiring and docs

**Files:**
- Modify: `install-macos.sh:130-141` (`print_hooks_notice`), `:181-185` (link mode), `:226-230` (copy mode)
- Modify: `README.md`

**Interfaces:**
- Consumes: `claude/hooks/tmux-agent-depth.sh` from Task 2
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Add the hook to link mode**

In `install-macos.sh`, after the existing `link_path` line for `sf-lease-table.sh` (line 185):

```bash
  link_path "$root_dir/claude/hooks/tmux-agent-depth.sh" "$HOME/.claude/hooks/tmux-agent-depth.sh"
```

- [ ] **Step 2: Add the hook to copy mode**

After the existing `install_file` line for `sf-lease-table.sh` (line 230):

```bash
install_file "$root_dir/claude/hooks/tmux-agent-depth.sh" "$HOME/.claude/hooks/tmux-agent-depth.sh" 0755
```

- [ ] **Step 3: Add the registration rows to the notice**

In `print_hooks_notice`, after the existing `SessionStart` row (line 136):

```bash
  printf '  SubagentStart      -> ~/.claude/hooks/tmux-agent-depth.sh\n'
  printf '  SubagentStop       -> ~/.claude/hooks/tmux-agent-depth.sh\n'
  printf '  SessionStart       -> ~/.claude/hooks/tmux-agent-depth.sh\n'
  printf '  SessionEnd         -> ~/.claude/hooks/tmux-agent-depth.sh\n'
```

- [ ] **Step 4: Verify the installer still parses**

Run: `bash -n install-macos.sh`

Expected: no output, exit 0.

- [ ] **Step 5: Document the marker vocabulary in the README**

Add to the README section covering the tmux status bar, and add `tmux-agent-depth.sh` to both hook file trees (near lines 45-49 and 198):

```markdown
### Status bar markers

| Marker | Meaning |
| --- | --- |
| `⠹` | a turn is running, no fan-out |
| `⠹N` | N subagents in flight |
| `◆` | agent present, idle |
| `!` | blocked on you |

`N` is suppressed at 1. Depth comes from `tmux-agent-depth.sh`, which writes one
file per in-flight subagent under `~/.local/state/tmux-llm/panes/<pane>.agents/`.
Until those four hooks are registered in `~/.claude/settings.json` the bar behaves
exactly as it did before: depth is simply absent, and nothing else changes.

Codex panes get presence and working states but never a depth number, because
Codex has no `SubagentStart` equivalent.
```

- [ ] **Step 6: Run the full test suite**

Run:
```bash
./scripts/test-tmux-agent-depth.sh
./scripts/test-tmux-llm-status.sh
```

Expected: both report all checks passed.

- [ ] **Step 7: Commit**

```bash
git add install-macos.sh README.md
git commit -m "feat(tmux): install and document the agent-depth hook

Registration stays hand-merged per the existing contract that the installer
never writes settings.json. Unregistered, the bar behaves exactly as before.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Verify against a live session

The tests drive the daemon through synthetic state files. Nothing so far has proven the real hook fires in a real session and reaches the real bar.

**Files:** none modified

- [ ] **Step 1: Install and register**

Run `./install-macos.sh --link`, then hand-merge the four rows the notice prints into `~/.claude/settings.json`.

- [ ] **Step 2: Restart the daemon**

Run: `~/.local/bin/tmux-llm-status restart`

- [ ] **Step 3: Restart a Claude session so the hooks load**

Exit and re-enter Claude Code in one tmux window.

- [ ] **Step 4: Dispatch three subagents and watch the bar**

Dispatch three trivial subagents in one message. Within about a second the window marker must show `⠹3`, and it must persist while the lead is idle awaiting their results - the exact case that reads `◆` today.

- [ ] **Step 5: Confirm it clears**

When the agents finish, the marker returns to `◆` within about a second. If a number is stranded, check for leftover files:

```bash
ls ~/.local/state/tmux-llm/panes/*/
```

- [ ] **Step 6: Confirm the acceptance criteria**

- An idle-titled pane with a live fan-out shows `⠹6`
- It reverts to `◆` when the agents finish
- Every existing test passes unmodified
- A machine without the hooks registered behaves exactly as it does today

Report any criterion that does not hold rather than adjusting the test to match.
