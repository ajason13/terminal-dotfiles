# Agent Table Implementation Plan

## Decisions you need from me

1. **"Need you" means a blocked prompt only** (`permission_prompt`, `elicitation_dialog`), not `idle_prompt`. Recommend yes. If wrong: `idle_prompt` fires for every finished session, so 20 of your 21 panes would show `!` and the signal would mean nothing again.
2. **`!` beats working and idle in the status bar marker, and `Ctrl-a a` jumps to blocked panes first.** Recommend yes. If wrong: today `!` sits below ◆, so a blocked pane in a split window (Scrum:1 has 4 panes) is hidden behind its idle neighbors, which is what the table is supposed to fix.
3. **Popup on `Ctrl-a A`, not a permanent pane like the coworker's.** Recommend popup. If wrong: a pane lives in one session, and your 21 agents are spread across 5 sessions, so it would only be visible from one of them.

## Assumptions I have not verified

- **The statusline process inherits `TMUX_PANE`.** Hooks do (live `.busy` files prove it), and the statusline is spawned by the same `claude` process, but I haven't checked this. Task 1 Step 6 checks it live.
- **Notification hook payloads carry `notification_type`** with the values `permission_prompt` / `elicitation_dialog`, and the `matcher` field filters on it. Task 2 Step 1 captures a real payload before any code relies on it.
- **`PostToolBatch` fires after an approved or denied permission prompt**, which is what clears `!`. If it doesn't, `!` lingers until the next prompt you type or the next Stop.
- **`switch-client` run from inside `display-popup -E` targets the client that opened the popup.** Task 4 checks this by hand. It can't be tested on a headless server.
- **Running sessions pick up a new `Notification` hook entry without a restart.** If they don't, `!` only works in sessions started after the settings change.
- **Idle panes will have a `.meta` reading.** A pane that hasn't re-rendered its status line since install has no file yet and shows `-` cells. The six Scrum panes on 2.1.263 are the likely ones.

## What I verified (2026-09-29, this Mac)

- `~/.local/state/tmux-llm/panes/` holds only `<pane>.busy` (an epoch) and `<pane>.agents/` (one file per subagent). It has no model, context, limits, branch or task data.
- `claude/statusline.sh` has context %, 5h/7d limits, model and branch on stdin, and persists none of it. It is symlinked live into `~/.claude/`, so **any edit ships to all 21 sessions immediately**.
- Every Claude pane title is `✳ <task summary>`, so the TASK column comes for free from `#{pane_title}`.
- **`!` is dead today.** `is_waiting_title` matches "Action Required/Ready/Idle", and no live title contains those. `Ctrl-a a` therefore jumps to any idle pane, not to one blocked on you. There are no tests for the waiting state at all.
- Leftovers: `37.busy` dates from 22:05 yesterday, which is past the TTL, so the reader correctly ignores it. `12.agents/` is an empty directory from Sep 18 on a live pane and counts as 0. Both are harmless. `prune` only runs at daemon start.
- tmux 3.6a, bash 3.2.57. `prefix A` is unbound.

---

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `Ctrl-a A` popup listing every LLM pane across all sessions (blocked first, then working, then idle) with ctx %, model, branch, task and account limits, where one key jumps to that pane.

**Architecture:** Two new per-pane state files are added next to `.busy`/`.agents` under `$TMUX_LLM_STATE_HOME/panes/`. The statusline writes `<pane>.meta` (its readings), and the depth hook writes `<pane>.needs` on a blocking Notification. `tmux-llm-status` gains a shared `classify_pane`, a `table` renderer and a `pick` loop, and tmux binds the loop in a popup.

**Tech Stack:** bash 3.2 (macOS system bash: no associative arrays, and `"${arr[@]}"` on an empty array is unbound under `set -u`), jq, tmux 3.6.

**Spec:** This conversation's comparison with the coworker's `qa` crew dashboard. The only piece carried over is the session table with jump-to-pane. Role crew, focus slot and non-tmux sessions are out of scope.

## Global Constraints

- The statusline must never fail or print anything extra. Every write it makes is best effort.
- The hook always exits 0 and stays silent.
- The per-pane path in `tmux-llm-status` (the 1-second daemon) adds no forks. `table`/`pick` may fork, since they run on demand.
- State files are named by the numeric pane id only. Validate `TMUX_PANE` before building a path, as the hook already does.
- Field separator in `.meta` is 0x1F, not tab. `read` collapses empty tab fields, and ctx is empty before the first API call.
- No em dashes in code, comments or docs. Comments stay at 1-2 lines.

## Review Focus

1. **Esc on a permission prompt.** No hook fires, so `.needs` stays set and the pane reads `!` until you next type there. It heals itself when you visit, which the `!` sends you to do. There is no test (it can't be driven headless); the README records it.
2. **A pane with no `.meta` yet** must render `-` cells in aligned columns, not shifted ones. Pinned in Task 3 (`tbl:0.0` has no meta).
3. **Session names with spaces** (`E2E - Add Coverage`) must not shift columns. Pinned in Task 3 by naming the fixture session `E2E - Tbl`.
4. **More LLM panes than keys (33).** Extra rows render with key `-` and are not selectable. It must not crash. Implemented in Task 3 via empty `${TABLE_KEYS:i:1}`; not tested (34 panes is a heavy fixture).
5. **Empty server / no panes.** The header must show `0 total` with no bash 3.2 unbound-array crash. Pinned in Task 3.

---

## File map

| File | Change |
|---|---|
| `claude/statusline.sh` | add `publish_meta`, called after the line is printed |
| `claude/hooks/tmux-agent-depth.sh` | write/clear `<pane>.needs` |
| `tmux/tmux-llm-status` | prune `.meta`/`.needs`; `classify_pane` refactor; `is_pane_blocked`; `!` precedence; `next_waiting` two-pass; `table`; `pick` |
| `tmux/tmux.conf` | `bind-key A display-popup ...` |
| `scripts/test-statusline.sh` | new |
| `scripts/test-tmux-agent-depth.sh`, `scripts/test-tmux-llm-status.sh` | extend |
| `README.md` | Notification hook registration, agent table section |

---

### Task 1: Statusline publishes a per-pane reading

**Files:**
- Modify: `claude/statusline.sh` (append function + call at end)
- Modify: `tmux/tmux-llm-status` (`prune_dead_panes`)
- Create: `scripts/test-statusline.sh`
- Modify: `scripts/test-tmux-llm-status.sh:210-219`

**Interfaces:**
- Produces: `$TMUX_LLM_STATE_HOME/panes/<n>.meta`, one line: `stamp␟model␟ctx_pct␟five_h␟five_h_at␟week␟week_at␟branch\n` (␟ = 0x1F). Empty fields are allowed.

- [ ] **Step 1: Write the failing test** `scripts/test-statusline.sh`

```bash
#!/usr/bin/env bash
# Behavioural tests for claude/statusline.sh's side channel: the per-pane .meta
# reading that `tmux-llm-status table` consumes.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sl="$repo_root/claude/statusline.sh"

test_home="$(mktemp -d /tmp/statusline-test-XXXXXX)"
TMUX_LLM_STATE_HOME="$test_home/state"
export TMUX_LLM_STATE_HOME
trap 'rm -rf "$test_home"' EXIT

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

full='{"model":{"id":"claude-opus-5-5"},"cwd":"/nonexistent","context_window":{"used_percentage":29.4},"rate_limits":{"five_hour":{"used_percentage":5,"resets_at":4102444800},"seven_day":{"used_percentage":3,"resets_at":4102444900}}}'
no_ctx='{"model":{"id":"claude-opus-5-5"},"cwd":"/nonexistent","rate_limits":{"five_hour":{"used_percentage":5,"resets_at":4102444800},"seven_day":{"used_percentage":3,"resets_at":4102444900}}}'
meta="$TMUX_LLM_STATE_HOME/panes/7.meta"

out="$(printf '%s' "$full" | TMUX_PANE=%7 "$sl")"
check "status line unchanged" "yes" "$([[ "$out" == "opus-5.5 | ctx 29% | 5h 5%"* ]] && echo yes || echo no)"

IFS=$'\x1f' read -r stamp model ctx five five_at week week_at branch < "$meta"
check "meta stamp is an epoch" "yes" "$([[ "$stamp" =~ ^[0-9]+$ ]] && echo yes || echo no)"
check "meta model" "opus-5.5" "$model"
check "meta ctx" "29.4" "$ctx"
check "meta 5h" "5" "$five"
check "meta 5h reset" "4102444800" "$five_at"
check "meta 7d" "3" "$week"
check "meta 7d reset" "4102444900" "$week_at"
check "meta branch empty outside git" "" "$branch"

# ctx is null before the first API call; later fields must not shift left
printf '%s' "$no_ctx" | TMUX_PANE=%7 "$sl" >/dev/null
IFS=$'\x1f' read -r stamp model ctx five five_at week week_at branch < "$meta"
check "empty ctx keeps its slot" "" "$ctx"
check "fields after empty ctx stay aligned" "4102444900" "$week_at"

rm -f "$meta"
printf '%s' "$full" | env -u TMUX_PANE "$sl" >/dev/null
check "no pane, no file" "0" "$(ls "$TMUX_LLM_STATE_HOME/panes" 2>/dev/null | wc -l | tr -d ' ')"

printf '%s' "$full" | TMUX_PANE='%../x' "$sl" >/dev/null
check "hostile pane id writes nothing" "0" "$(ls "$TMUX_LLM_STATE_HOME/panes" 2>/dev/null | wc -l | tr -d ' ')"

out="$(printf '%s' "$full" | TMUX_PANE=%7 TMUX_LLM_STATE_HOME=/dev/null/nope "$sl")"; rc=$?
check "unwritable state dir still renders" "yes" "$([[ "$out" == "opus-5.5 | ctx 29%"* ]] && echo yes || echo no)"
check "unwritable state dir exits 0" "0" "$rc"

if (( failures > 0 )); then
  printf 'test-statusline: %d failure(s)\n' "$failures" >&2
  exit 1
fi
printf 'test-statusline: all checks passed\n'
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `bash scripts/test-statusline.sh`
Expected: FAIL at `read ... < "$meta"` (no such file). The first check passes.

- [ ] **Step 3: Implement.** In `claude/statusline.sh`, add the function above `# --- Assemble` and call it on the last line:

```bash
# Publish this pane's readings for the tmux agent table. Best effort: a failed
# write must never blank or delay the status line.
publish_meta() {
  local pane="${TMUX_PANE:-}" dir file
  [[ "${pane#%}" =~ ^[0-9]+$ ]] || return 0
  dir="${TMUX_LLM_STATE_HOME:-$HOME/.local/state/tmux-llm}/panes"
  file="$dir/${pane#%}.meta"
  mkdir -p "$dir" 2>/dev/null || return 0
  # tmp + mv so the table never reads a half-written line
  if printf '%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\n' \
      "${NOW:-$(date +%s)}" "$MODEL" "$CTX_PCT" "$FIVE_H" "$FIVE_H_AT" "$WEEK" "$WEEK_AT" "$BRANCH" \
      > "$file.$$" 2>/dev/null; then
    mv -f "$file.$$" "$file" 2>/dev/null || rm -f "$file.$$" 2>/dev/null
  fi
  return 0
}
```

The file ends like this:

```bash
printf "%s" "$OUT"
publish_meta
```

In `tmux/tmux-llm-status` `prune_dead_panes`, widen the glob and suffix strip:

```bash
  for entry in "$STATE_HOME/panes"/*.agents "$STATE_HOME/panes"/*.busy "$STATE_HOME/panes"/*.meta; do
    [[ -e "$entry" ]] || continue
    id="${entry##*/}"
    id="${id%.agents}"
    id="${id%.busy}"
    id="${id%.meta}"
```

In `scripts/test-tmux-llm-status.sh`, after line 212 add `: > "$TMUX_LLM_STATE_HOME/panes/99999.meta"`, and after the busy-marker prune check add:

```bash
check "prune drops readings for dead panes" "absent" \
  "$(exists "$TMUX_LLM_STATE_HOME/panes/99999.meta")"
```

- [ ] **Step 4: Run tests**

Run: `bash scripts/test-statusline.sh && bash scripts/test-tmux-llm-status.sh`
Expected: both print `all checks passed`.

- [ ] **Step 5: Commit**

```bash
git add claude/statusline.sh tmux/tmux-llm-status scripts/test-statusline.sh scripts/test-tmux-llm-status.sh
git commit -m "feat(claude): publish statusline readings per tmux pane"
```

- [ ] **Step 6: Live check (the statusline is symlinked, so this is already shipped)**

Run: `sleep 30; ls -la ~/.local/state/tmux-llm/panes/*.meta | head; tr '\037' '|' < ~/.local/state/tmux-llm/panes/184.meta`
Expected: `.meta` files for active panes, pipe-separated fields. **If there are none, the `TMUX_PANE` assumption is false. Stop and report before Task 3.**

---

### Task 2: A real "blocked on you" signal

**Files:**
- Modify: `claude/hooks/tmux-agent-depth.sh`
- Modify: `tmux/tmux-llm-status` (`classify_pane` refactor, `is_pane_blocked`, `format_marker`, `window_category`, `next_waiting`, prune)
- Modify: `scripts/test-tmux-agent-depth.sh`, `scripts/test-tmux-llm-status.sh`
- Modify: `README.md` (hook registration)

**Interfaces:**
- Produces: `$TMUX_LLM_STATE_HOME/panes/<n>.needs` (an epoch; presence is the signal).
- Produces: `classify_pane <pane_id> <command> <title>` sets globals `PANE_STATE` (`waiting|active|present|none`) and `AGENT_COUNT`.
- Produces: `is_pane_blocked <pane_id>`, returning 0 when `.needs` exists.

- [ ] **Step 1: Capture a real Notification payload.** In a scratch directory, not your global settings:

```bash
mkdir -p /tmp/notif-probe/.claude && cd /tmp/notif-probe
cat > .claude/settings.json <<'EOF'
{ "hooks": { "Notification": [ { "hooks": [ { "type": "command", "command": "cat >> /tmp/notif-probe/payloads.jsonl; echo >> /tmp/notif-probe/payloads.jsonl" } ] } ] } }
EOF
```

Start `claude` there, ask it to run `touch x` (this triggers a permission prompt), wait 5s, deny, then quit. Run `jq -c '{hook_event_name,notification_type,message}' /tmp/notif-probe/payloads.jsonl`.
Expected: a row with `"notification_type":"permission_prompt"`. **If the field is missing or named differently, update the jq path in Step 5 and this plan's assumption before going further.**

- [ ] **Step 2: Refactor first, no behavior change.** In `tmux/tmux-llm-status`, add above `count_window`:

```bash
# One pane's state into PANE_STATE (waiting|active|present|none), plus AGENT_COUNT.
# Shared by the status bar and the table so the two can never disagree.
classify_pane() {
  local pane_id="$1" command="$2" title="$3"
  count_agents "$pane_id"
  if (( AGENT_COUNT > 0 )); then PANE_STATE=active
  elif is_pane_busy "$pane_id"; then PANE_STATE=active
  elif has_spinner_title "$title" || is_active_title "$title"; then PANE_STATE=active
  elif is_waiting_title "$title"; then PANE_STATE=waiting
  elif is_codex_title "$title" || is_claude_title "$title" || is_llm_command "${command##*/}"; then PANE_STATE=present
  else PANE_STATE=none
  fi
}
```

Replace the body of `count_window`'s loop with:

```bash
  while IFS=$'\t' read -r pane_id command title; do
    classify_pane "$pane_id" "$command" "${title:-}"
    case "$PANE_STATE" in
      active) active=$((active + 1)); depth_sum=$((depth_sum + AGENT_COUNT)) ;;
      waiting) waiting=$((waiting + 1)) ;;
      present) present=$((present + 1)) ;;
    esac
  done < <(tmux_cmd list-panes -t "$target" -F '#{pane_id}	#{pane_current_command}	#{pane_title}' 2>/dev/null || true)
```

Keep the two load-bearing comments from the old branches ("Depth wins over the title...", "Ahead of every title matcher...") on the matching `classify_pane` lines. Drop the now-unused `depth` local.

Run: `bash scripts/test-tmux-llm-status.sh` (expected: all pass). Then commit:

```bash
git add tmux/tmux-llm-status
git commit -m "refactor(tmux): extract classify_pane from count_window"
```

- [ ] **Step 3: Write the failing hook tests.** Append to `scripts/test-tmux-agent-depth.sh` before its summary block:

```bash
# --- blocked: a permission or question prompt parks the turn on you -----------
fire_notification() {
  printf '{"hook_event_name":"Notification","notification_type":"%s"}' "$1" \
    | TMUX_PANE="${2:-%9}" "$hook"
}
needs_state() {
  if [[ -f "$TMUX_LLM_STATE_HOME/panes/${1:-9}.needs" ]]; then printf 'blocked'; else printf 'clear'; fi
}

fire_notification permission_prompt
check "permission prompt marks blocked" "blocked" "$(needs_state)"
fire_lead PostToolBatch
check "tool batch after approval clears blocked" "clear" "$(needs_state)"
fire_notification idle_prompt
check "idle prompt is not blocked" "clear" "$(needs_state)"
fire_notification elicitation_dialog
check "question prompt marks blocked" "blocked" "$(needs_state)"
fire_lead UserPromptSubmit
check "typing a prompt clears blocked" "clear" "$(needs_state)"
fire_notification permission_prompt
fire Stop sub1
check "subagent stop keeps lead blocked" "blocked" "$(needs_state)"
fire_lead Stop
check "lead stop clears blocked" "clear" "$(needs_state)"
fire_notification permission_prompt
fire_lead SessionEnd
check "session end clears blocked" "clear" "$(needs_state)"
```

Run: `bash scripts/test-tmux-agent-depth.sh`
Expected: FAIL on "permission prompt marks blocked".

- [ ] **Step 4: Write the failing reader tests.** Append to `scripts/test-tmux-llm-status.sh` before the summary block, with helpers next to `busy_for`:

```bash
needs_file_for() {
  local id
  id="$(t display-message -p -t "$1" '#{pane_id}')"
  printf '%s' "$TMUX_LLM_STATE_HOME/panes/${id#%}.needs"
}
needs_for() { local f; f="$(needs_file_for "$1")"; mkdir -p "${f%/*}"; date +%s > "$f"; }
clear_needs_for() { rm -f "$(needs_file_for "$1")"; }
```

```bash
# --- blocked outranks working and idle, in the pane and in the window ----------
t -f /dev/null new-session -d -s delta -n d1
t split-window -d -t delta:d1
t select-pane -t delta:d1.0 -T '✳ claude idle'
t select-pane -t delta:d1.1 -T '✳ claude idle'
busy_for delta:d1.0
agents_for delta:d1.1 2
needs_for delta:d1.1
"$bin" once
check "blocked beats a working neighbour" "!" "$(marker_of delta:d1)"
check "blocked window rolls up as waiting" "!1" "$(fleet_of delta)"
clear_needs_for delta:d1.1
"$bin" once
check "cleared needs falls back to working" "S2" "$(marker_of delta:d1)"
clear_agents_for delta:d1.1
clear_busy_for delta:d1.0
t kill-session -t delta
```

Run: `bash scripts/test-tmux-llm-status.sh`
Expected: FAIL on "blocked beats a working neighbour" (got `S2`).

- [ ] **Step 5: Implement the hook side.** In `claude/hooks/tmux-agent-depth.sh`:

```bash
NEEDS_FILE="$STATE_HOME/panes/${TMUX_PANE#%}.needs"
```

Extend the single jq read to five fields: add `ntype` to the `read` names and `(.notification_type // "")` to the jq array. Then add a case and clear `.needs` wherever `.busy` is cleared or refreshed:

```bash
  Notification)
    # Only prompts that park the turn count; idle_prompt fires for every finished session.
    case "$ntype" in
      permission_prompt | elicitation_dialog)
        mkdir -p "${NEEDS_FILE%/*}" 2>/dev/null || exit 0
        printf '%s' "$(date +%s)" > "$NEEDS_FILE" 2>/dev/null || true
        ;;
    esac
    ;;
```

- `UserPromptSubmit`, `PostToolBatch`: `mark_busy; rm -f "$NEEDS_FILE" 2>/dev/null || true`
- `Stop | StopFailure`: `[[ -n "$subagent" ]] || rm -f "$BUSY_FILE" "$NEEDS_FILE" 2>/dev/null || true`
- `SessionStart` (the non-compact/resume branch) and `SessionEnd`: add `"$NEEDS_FILE"` to the `rm -f`.

- [ ] **Step 6: Implement the reader side.** In `tmux/tmux-llm-status`:

```bash
# Parked on a permission or question prompt? No TTL on purpose: a prompt can wait
# all night, and the next thing you type in that pane clears it.
is_pane_blocked() { [[ -f "$STATE_HOME/panes/${1#%}.needs" ]]; }
```

Put it first in `classify_pane`: `if is_pane_blocked "$pane_id"; then PANE_STATE=waiting` followed by `elif (( AGENT_COUNT > 0 ))...`. In `format_marker` and `window_category`, move the `waiting` branch to the top, above `active`, and update the comments to "blocked (bang) > working (spinner) > present (diamond)". In `prune_dead_panes`, add `"$STATE_HOME/panes"/*.needs` to the glob and `id="${id%.needs}"`.

Replace the search loop in `next_waiting` with a two-pass version:

```bash
  local off target pass
  # Blocked panes first; only when none are blocked, fall back to any idle agent.
  for pass in blocked idle; do
    for (( off = 1; off <= n; off++ )); do
      target="${windows[$(( (start + off) % n ))]}"
      read -r active present waiting depth < <(count_window "$target")
      case "$pass" in
        blocked) (( waiting > 0 )) || continue ;;
        idle) (( active == 0 && present > 0 )) || continue ;;
      esac
      tmux_cmd select-window -t "$target" 2>/dev/null \
        || tmux_cmd switch-client -t "$target" 2>/dev/null || true
      return 0
    done
  done
```

- [ ] **Step 7: Run all three suites**

Run: `bash scripts/test-tmux-agent-depth.sh && bash scripts/test-tmux-llm-status.sh && bash scripts/test-statusline.sh`
Expected: all pass.

- [ ] **Step 8: README and registration.** In `README.md`'s status-marker table, change the `!` row to "a permission or question prompt is waiting on you". In "Registering the hooks", add:

```json
    "Notification": [
      { "matcher": "permission_prompt|elicitation_dialog", "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ]
```

Add one sentence: Esc on a prompt fires no hook, so `!` stays until you next type in that pane. Then commit:

```bash
git add claude/hooks/tmux-agent-depth.sh tmux/tmux-llm-status scripts/test-tmux-agent-depth.sh scripts/test-tmux-llm-status.sh README.md
git commit -m "feat(tmux): mark panes blocked on a permission prompt"
```

- [ ] **Step 9: Register in `~/.claude/settings.json`.** This is outside the repo and affects all 21 sessions. **Ask Jason before writing.** Merge the `Notification` entry above, then trigger a permission prompt in any pane and confirm `!` appears in the status bar within 2s.

---

### Task 3: `tmux-llm-status table`

**Files:**
- Modify: `tmux/tmux-llm-status` (new functions + `table` case + usage line)
- Modify: `scripts/test-tmux-llm-status.sh`

**Interfaces:**
- Consumes: `classify_pane`, `.meta` format (Task 1), `.needs` (Task 2).
- Produces: `render_table`, which prints the table and fills global array `TABLE_PANES` (pane ids in key order). Also `TABLE_KEYS` (string) and `key_index <key>` (prints an index or nothing, always returns 0).

- [ ] **Step 1: Write the failing test.** Append before the summary block, with a helper next to `needs_for`:

```bash
meta_for() {  # target model ctx branch
  local id f now
  id="$(t display-message -p -t "$1" '#{pane_id}')"
  f="$TMUX_LLM_STATE_HOME/panes/${id#%}.meta"
  now="$(date +%s)"
  mkdir -p "${f%/*}"
  printf '%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\n' \
    "$now" "$2" "$3" 5 $((now + 10800)) 3 $((now + 432000)) "$4" > "$f"
}
has() { if printf '%s' "$1" | grep -qF -- "$2"; then printf 'yes'; else printf 'no'; fi; }
```

```bash
# --- table: every LLM pane, blocked first, readings where they exist ----------
t -f /dev/null new-session -d -s 'E2E - Tbl' -n t1
t -f /dev/null new-window -d -t 'E2E - Tbl:' -n t2
t -f /dev/null new-window -d -t 'E2E - Tbl:' -n t3
t select-pane -t 'E2E - Tbl:t1' -T '✳ idle task'
t select-pane -t 'E2E - Tbl:t2' -T '✳ blocked task'
t select-pane -t 'E2E - Tbl:t3' -T 'zsh'
needs_for 'E2E - Tbl:t2'
meta_for 'E2E - Tbl:t2' opus-5.5 29.4 bb-391

table="$(COLUMNS=160 "$bin" table)"
rows="$(printf '%s\n' "$table" | grep -F 'E2E - Tbl:')"
check "blocked row sorts above idle" "blocked task" \
  "$(printf '%s\n' "$rows" | head -1 | grep -oF 'blocked task')"
check "non-LLM pane is omitted" "no" "$(has "$rows" 'E2E - Tbl:2.0')"
check "blocked row carries ctx" "yes" "$(has "$rows" '29%')"
check "blocked row carries model" "yes" "$(has "$rows" 'opus-5.5')"
check "blocked row carries branch" "yes" "$(has "$rows" 'bb-391')"
check "task drops the title glyph" "no" "$(has "$rows" '✳')"
check "header counts the blocked pane" "yes" "$(has "$table" '· 1 need you ·')"
check "limits come from the newest reading" "yes" "$(has "$table" 'Limits: 5h 5% (resets 3h) · 7d 3% (resets 5d)')"
# spaced session name and a pane with no reading must keep columns aligned
idle_row="$(printf '%s\n' "$rows" | grep -F 'idle task')"
blocked_row="$(printf '%s\n' "$rows" | grep -F 'blocked task')"
check "missing reading renders dashes" "yes" "$(has "$idle_row" ' -  ')"
b_prefix="${blocked_row%%blocked task*}"
i_prefix="${idle_row%%idle task*}"
check "TASK column starts at the same offset" "${#b_prefix}" "${#i_prefix}"

empty="$(TMUX_SOCKET="$test_home/no-such.sock" "$bin" table)"
check "empty server renders a zero header" "yes" "$(has "$empty" '0 total')"
check "empty server has no reading" "yes" "$(has "$empty" 'Limits: no reading yet')"
```

Leave the `E2E - Tbl` session alive; Task 4 reuses it.

Run: `bash scripts/test-tmux-llm-status.sh`
Expected: FAIL on the usage error. `table` is not a subcommand yet.

- [ ] **Step 2: Implement.** Add above the `case "${1:-}"` dispatch in `tmux/tmux-llm-status`:

```bash
# Row keys in order; q and r are taken by quit and refresh.
TABLE_KEYS='123456789abcdefghijklmnopstuvwxyz'
TABLE_PANES=()

key_index() {
  local prefix="${TABLE_KEYS%%"$1"*}"
  if [[ -n "$1" && "$prefix" != "$TABLE_KEYS" ]]; then printf '%d' "${#prefix}"; fi
}

format_span() {
  local s="$1"
  if (( s < 60 )); then printf '%ds' "$s"
  elif (( s < 3600 )); then printf '%dm' $(( s / 60 ))
  elif (( s < 86400 )); then printf '%dh' $(( (s + 1800) / 3600 ))
  else printf '%dd' $(( (s + 43200) / 86400 )); fi
}

read_meta() {
  local file="$STATE_HOME/panes/${1#%}.meta"
  META_STAMP='' META_MODEL='' META_CTX='' META_5H='' META_5H_AT='' META_7D='' META_7D_AT='' META_BRANCH=''
  [[ -f "$file" ]] || return 0
  IFS=$'\x1f' read -r META_STAMP META_MODEL META_CTX META_5H META_5H_AT META_7D META_7D_AT META_BRANCH \
    < "$file" 2>/dev/null || true
}

# Tab-separated rows, most urgent first: rank, age, pane id, target, state, agents, title.
collect_rows() {
  local pane_id target activity command title rank age
  refresh_now
  while IFS=$'\t' read -r pane_id target activity command title; do
    classify_pane "$pane_id" "$command" "${title:-}"
    case "$PANE_STATE" in
      waiting) rank=0 ;; active) rank=1 ;; present) rank=2 ;; *) continue ;;
    esac
    age=$(( NOW - ${activity:-$NOW} )); (( age >= 0 )) || age=0
    printf '%d\t%d\t%s\t%s\t%s\t%d\t%s\n' "$rank" "$age" "$pane_id" "$target" "$PANE_STATE" "$AGENT_COUNT" "${title:-}"
  done < <(tmux_cmd list-panes -a -F '#{pane_id}	#{session_name}:#{window_index}.#{pane_index}	#{window_activity}	#{pane_current_command}	#{pane_title}' 2>/dev/null || true) \
    | sort -t "$(printf '\t')" -k1,1n -k2,2n
}

limit_part() {  # label pct reset_at
  [[ -n "$2" ]] || return 0
  printf '%s %.0f%%' "$1" "$2"
  if [[ -n "$3" ]] && (( $3 > NOW )); then printf ' (resets %s)' "$(format_span $(( $3 - NOW )))"; fi
}

render_table() {
  local -a rows=()
  local row rank age pane_id target state agents title i=0 key label ctx task
  local need=0 work=0 subs=0 newest=0 l5='' l5at='' l7='' l7at='' limits task_w
  local cols="${COLUMNS:-$(tput cols 2>/dev/null || printf 120)}"
  TABLE_PANES=()
  while IFS= read -r row; do rows+=("$row"); done < <(collect_rows)

  # bash 3.2: "${rows[@]}" on an empty array is unbound under set -u
  for row in ${rows[@]+"${rows[@]}"}; do
    IFS=$'\t' read -r rank age pane_id target state agents title <<< "$row"
    case "$state" in waiting) need=$((need + 1)) ;; active) work=$((work + 1)) ;; esac
    subs=$((subs + agents))
    read_meta "$pane_id"
    # Limits are account-wide, so the freshest reading from any pane wins.
    if [[ -n "$META_5H$META_7D" ]] && (( ${META_STAMP:-0} > newest )); then
      newest=$META_STAMP l5=$META_5H l5at=$META_5H_AT l7=$META_7D l7at=$META_7D_AT
    fi
  done

  printf 'LLM sessions · %d total · %d need you · %d working · %d subagents\n' \
    "${#rows[@]}" "$need" "$work" "$subs"
  if (( newest > 0 )); then
    limits="$(limit_part 5h "$l5" "$l5at")"
    [[ -n "$l7" ]] && limits="${limits:+$limits · }$(limit_part 7d "$l7" "$l7at")"
    printf 'Limits: %s · as of %s\n' "$limits" "$(date -r "$newest" +%H:%M)"
  else
    printf 'Limits: no reading yet\n'
  fi
  printf '%-3s %-28s %-8s %4s %3s %4s %-9s %-16s %s\n' KEY TARGET STATE AGE AG CTX MODEL BRANCH TASK
  task_w=$(( cols - 83 )); (( task_w > 10 )) || task_w=10

  for row in ${rows[@]+"${rows[@]}"}; do
    IFS=$'\t' read -r rank age pane_id target state agents title <<< "$row"
    read_meta "$pane_id"
    key="${TABLE_KEYS:i:1}"
    TABLE_PANES+=("$pane_id")
    case "$state" in waiting) label='! needs' ;; active) label='working' ;; *) label='idle' ;; esac
    ctx='-'; [[ -n "$META_CTX" ]] && ctx="$(printf '%.0f%%' "$META_CTX")"
    task="${title#✳ }"
    printf '%-3s %-28.28s %-8s %4s %3s %4s %-9.9s %-16.16s %s\n' \
      "${key:--}" "$target" "$label" "$(format_span "$age")" "$agents" "$ctx" \
      "${META_MODEL:--}" "${META_BRANCH:--}" "${task:0:task_w}"
    i=$((i + 1))
  done
}
```

Add `table) render_table ;;` to the dispatch and `| table` to the usage string.

- [ ] **Step 3: Run tests**

Run: `bash scripts/test-tmux-llm-status.sh`
Expected: all pass. If "TASK column starts at the same offset" fails, a `%-N.Ns` width is being fed multibyte text. Check the target column first.

- [ ] **Step 4: Eyeball it live**

Run: `tmux-llm-status table`
Expected: about 21 rows, this pane (`Workflow:5.1`) near the top as working, and the Scrum panes idle with `-` cells if they haven't rendered since Task 1.

- [ ] **Step 5: Commit**

```bash
git add tmux/tmux-llm-status scripts/test-tmux-llm-status.sh
git commit -m "feat(tmux): add tmux-llm-status table across every session"
```

---

### Task 4: `pick` popup on `Ctrl-a A`

**Files:**
- Modify: `tmux/tmux-llm-status` (`jump_to_pane`, `pick`, dispatch)
- Modify: `tmux/tmux.conf` (after the `bind-key a` line)
- Modify: `scripts/test-tmux-llm-status.sh`, `README.md`

**Interfaces:**
- Consumes: `render_table`, `TABLE_PANES`, `key_index`.

- [ ] **Step 1: Write the failing test** (uses the `E2E - Tbl` fixture from Task 3; `t2` is the only blocked pane, so it gets key `1`):

```bash
# --- pick: one key jumps, q and EOF leave things alone ------------------------
current_window() { t display-message -p -t 'E2E - Tbl' '#{window_name}'; }
t select-window -t 'E2E - Tbl:t1'
printf 'q' | "$bin" pick >/dev/null 2>&1
check "q quits without jumping" "t1" "$(current_window)"
printf 'Z' | "$bin" pick >/dev/null 2>&1
check "unmapped key then EOF exits without jumping" "t1" "$(current_window)"
printf '1' | "$bin" pick >/dev/null 2>&1
check "key 1 jumps to the blocked pane" "t2" "$(current_window)"
clear_needs_for 'E2E - Tbl:t2'
t kill-session -t 'E2E - Tbl'
```

Run: `bash scripts/test-tmux-llm-status.sh`
Expected: FAIL on "key 1 jumps to the blocked pane" (usage error, window unchanged).

- [ ] **Step 2: Implement**

```bash
# switch-client alone lands on the window's active pane, not the one picked.
jump_to_pane() {
  tmux_cmd select-window -t "$1" 2>/dev/null || true
  tmux_cmd select-pane -t "$1" 2>/dev/null || true
  tmux_cmd switch-client -t "$1" 2>/dev/null || true
}

# Popup loop: redraw every 2s until a key jumps or quits.
pick() {
  local key idx rc
  while true; do
    printf '\033[H\033[2J'
    render_table
    printf '\n[key] jump · r refresh · q quit\n'
    key='' rc=0
    read -rsn1 -t 2 key || rc=$?
    # >128 is the timeout; anything else non-zero is EOF, so there is no one to wait for
    (( rc == 0 || rc > 128 )) || return 0
    case "$key" in
      '' | r) continue ;;
      q | $'\e') return 0 ;;
    esac
    idx="$(key_index "$key")"
    [[ -n "$idx" && -n "${TABLE_PANES[$idx]:-}" ]] || continue
    jump_to_pane "${TABLE_PANES[$idx]}"
    return 0
  done
}
```

Add `pick) pick ;;` to the dispatch and `| pick` to usage. In `tmux/tmux.conf` after `bind-key a ...`:

```tmux
# Every LLM pane across sessions, blocked first; one key jumps there.
bind-key A display-popup -E -w 90% -h 70% -T ' agents ' '~/.local/bin/tmux-llm-status pick'
```

- [ ] **Step 3: Run all suites**

Run: `bash scripts/test-statusline.sh && bash scripts/test-tmux-agent-depth.sh && bash scripts/test-tmux-llm-status.sh`
Expected: all pass.

- [ ] **Step 4: Manual check** (covers the popup/`switch-client` assumption)

Run `tmux source-file ~/.tmux.conf`, press `Ctrl-a A` in `Workflow`, then press the key of a `Scrum` row.
Expected: the popup closes and the client lands on that exact pane in `Scrum`. If the popup closes but the client doesn't move, add `-c "$(tmux display -p '#{client_name}')"` to the bind as an env var and pass it to `switch-client -c`. Record which one was needed.

- [ ] **Step 5: README + commit.** Add a bullet under "What This Includes": "`Ctrl-a A` opens the agent table: every LLM pane across sessions, blocked first, with ctx, model, branch, task and account limits; one key jumps there." Add `table | pick` to the Layout/usage wherever `tmux-llm-status` subcommands are listed.

```bash
git add tmux/tmux-llm-status tmux/tmux.conf scripts/test-tmux-llm-status.sh README.md
git commit -m "feat(tmux): open the agent table in a popup on prefix A"
```

---

## Out of scope (named so nobody expands into them)

- Sessions outside tmux (the coworker's `(not in tmux)` row).
- Role crew and focus slot.
- Colors in the table. Add later behind `[[ -t 1 ]]` if the plain version earns its keep.
- Collapsing the statusline's 7 jq calls into one (a real cost per render, but a separate change).
