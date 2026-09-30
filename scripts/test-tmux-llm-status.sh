#!/usr/bin/env bash
set -euo pipefail

# Behavioural tests for tmux/tmux-llm-status. Runs against a private tmux server
# via TMUX_SOCKET so it never reads or mutates live session state.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$repo_root/tmux/tmux-llm-status"

if ! command -v tmux >/dev/null 2>&1; then
  echo "test-tmux-llm-status: tmux not found (brew install tmux)" >&2
  exit 1
fi

# Kept under /tmp rather than TMPDIR: macOS TMPDIR paths are long enough to risk
# the ~104-byte unix socket path limit.
test_home="$(mktemp -d /tmp/tmux-llm-status-test-XXXXXX)"
TMUX_SOCKET="$test_home/tmux.sock"
export TMUX_SOCKET
# Point agent-depth state at a throwaway dir so these tests can never read or
# write the real status directory.
TMUX_LLM_STATE_HOME="$test_home/llm-state"
export TMUX_LLM_STATE_HOME

# A fake org-lock for the whole run, so the table never reads the real lock directory.
# list replays a fixture; any other subcommand sleeps like a waiter blocked on a claim.
fake_bin="$test_home/bin"
mkdir -p "$fake_bin"
FAKE_LOCKS="$test_home/locks.json"
printf '[]\n' > "$FAKE_LOCKS"
cat > "$fake_bin/org-lock" <<'FAKE'
#!/usr/bin/env bash
case "${1:-}" in list) cat "$FAKE_LOCKS" ;; *) sleep 600; : ;; esac
FAKE
# An e2e run polling for a busy org at config load; its alias is in the environment only.
# node, as in a real run: macOS hides the environment of SIP binaries such as /bin/bash.
printf '#!/usr/bin/env node\nsetTimeout(() => {}, 600000);\n' > "$fake_bin/playwright"
chmod +x "$fake_bin/org-lock" "$fake_bin/playwright"
export FAKE_LOCKS TMUX_LLM_ORG_LOCK="$fake_bin/org-lock" SCRATCH_POOL_LOCK_DIR="$test_home/no-locks"
# Absent until a test writes it, so the real announce log is never read.
TMUX_LLM_ANNOUNCE_LOG="$test_home/announce.log"
TMUX_LLM_CLAUDE_SESSIONS="$test_home/claude-sessions"
export TMUX_LLM_ANNOUNCE_LOG TMUX_LLM_CLAUDE_SESSIONS

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

busy_file_for() {
  local id
  id="$(t display-message -p -t "$1" '#{pane_id}')"
  printf '%s' "$TMUX_LLM_STATE_HOME/panes/${id#%}.busy"
}

# Age is the point of the marker, so the fixture takes it: 0 = a turn running now.
busy_for() {
  local f
  f="$(busy_file_for "$1")"
  mkdir -p "${f%/*}"
  printf '%s' "$(( $(date +%s) - ${2:-0} ))" > "$f"
}

clear_busy_for() { rm -f "$(busy_file_for "$1")"; }

needs_file_for() {
  local id
  id="$(t display-message -p -t "$1" '#{pane_id}')"
  printf '%s' "$TMUX_LLM_STATE_HOME/panes/${id#%}.needs"
}
needs_for() { local f; f="$(needs_file_for "$1")"; mkdir -p "${f%/*}"; date +%s > "$f"; }
clear_needs_for() { rm -f "$(needs_file_for "$1")"; }

meta_for() {  # target model ctx branch
  local id f now
  id="$(t display-message -p -t "$1" '#{pane_id}')"
  f="$TMUX_LLM_STATE_HOME/panes/${id#%}.meta"
  now="$(date +%s)"
  mkdir -p "${f%/*}"
  printf '%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\x1f%s\n' \
    "$now" "$2" "$3" 5 $((now + 10800)) 3 $((now + 432000)) "$4" > "$f"
}
# A here-string, not a pipe: grep -q exits on its first match, and under pipefail the
# writer's SIGPIPE turned a found string into "no" (1 in 8 parallel runs).
has() { if grep -qF -- "$2" <<< "$1"; then printf 'yes'; else printf 'no'; fi; }

exists() { if [[ -e "$1" ]]; then printf 'present'; else printf 'absent'; fi; }

# -f /dev/null on every server-creating call: the real tmux.conf restarts the
# status daemon, which would then run against this test socket.
t() { tmux -S "$TMUX_SOCKET" "$@"; }
cleanup() {
  t kill-server 2>/dev/null || true
  [[ -z "${outside_pid:-}" ]] || kill "$outside_pid" 2>/dev/null || true
  rm -rf "$test_home"
}
trap cleanup EXIT

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

# Spinner frames rotate with the clock, so normalise them to 'S' for assertions.
normalize() {
  local s="$1" frame
  for frame in ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏; do s="${s//$frame/S}"; done
  printf '%s' "$s"
}

# Read through the same resolution path the status bar uses, so a session that
# lacks its own value shows whatever it would really inherit.
fleet_of() { normalize "$(t display-message -p -t "$1" '#{@llm_fleet}')"; }
marker_of() { normalize "$(t display-message -p -t "$1" '#{@llm_status}')"; }

# --- fixture: alpha has two idle-present agents, beta has one working ---------
t -f /dev/null new-session -d -s alpha -n a1
t -f /dev/null new-window -d -t alpha: -n a2
t -f /dev/null new-session -d -s beta -n b1

t select-pane -t alpha:a1 -T '✳ claude idle'
t select-pane -t alpha:a2 -T '✳ claude idle'
t select-pane -t beta:b1 -T '⠋ claude working'

"$bin" once

# --- the roll-up beside #S must count only that session's windows -------------
check "alpha fleet counts only alpha" "◆2" "$(fleet_of alpha)"
check "beta fleet counts only beta" "S1" "$(fleet_of beta)"

# --- per-window markers keep working ------------------------------------------
check "alpha:a1 marker" "◆" "$(marker_of alpha:a1)"
check "beta:b1 marker" "S" "$(marker_of beta:b1)"

# --- a session created between passes must not inherit another's numbers ------
t -f /dev/null new-session -d -s gamma -n g1
check "new session starts empty" "" "$(fleet_of gamma)"
"$bin" once
check "agentless session stays empty" "" "$(fleet_of gamma)"
check "alpha unaffected by gamma" "◆2" "$(fleet_of alpha)"

# --- a session going quiet clears its own roll-up -----------------------------
t select-pane -t alpha:a1 -T 'zsh'
t select-pane -t alpha:a2 -T 'zsh'
"$bin" once
check "quiet session clears" "" "$(fleet_of alpha)"
check "beta still working" "S1" "$(fleet_of beta)"

# --- summary subcommand is scoped to the session it is asked about ------------
check "summary -t beta" "S1" "$(normalize "$("$bin" summary beta)")"
check "summary -t alpha" "" "$(normalize "$("$bin" summary alpha)")"

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

# Depth still wins even when the title itself already reads as working.
# alpha:a2 is set in the SAME pass: markers are read from stored options, so a
# title changed after the last `once` would assert against stale state.
t select-pane -t alpha:a1 -T '⠋ claude working'
t select-pane -t alpha:a2 -T '✳ claude idle'
clear_agents_for alpha:a1
agents_for alpha:a1 4
"$bin" once
check "depth wins over a working title" "S4" "$(marker_of alpha:a1)"

# One window's agents must never leak into another's marker.
check "sibling window unaffected by depth" "◆" "$(marker_of alpha:a2)"

clear_agents_for alpha:a1
t select-pane -t alpha:a1 -T '✳ claude idle'
"$bin" once
check "clearing agents reverts to present" "◆" "$(marker_of alpha:a1)"

# --- depth_sum accumulates across panes in one window ---------------------------
# Nothing else exercises two panes contributing to the same window's depth; a sum
# that silently truncated to one pane's count would otherwise slip through.
t -f /dev/null new-window -d -t alpha: -n multi
t split-window -d -t alpha:multi
agents_for alpha:multi.0 2
agents_for alpha:multi.1 3
"$bin" once
check "depth_sum accumulates across panes" "S5" "$(marker_of alpha:multi)"
clear_agents_for alpha:multi.0
clear_agents_for alpha:multi.1

# --- busy marker drives the working state --------------------------------------
# The regression this exists for: Claude Code stopped animating its title, so an
# idle-looking title is now the ONLY title a working lead ever shows.
t select-pane -t alpha:a1 -T '✳ claude idle'
busy_for alpha:a1
"$bin" once
check "busy marker beats an idle title" "S" "$(marker_of alpha:a1)"
# a2 is still an idle Claude pane, so the roll-up must separate the two states.
check "a busy window counts in the roll-up" "S1 ◆1" "$(fleet_of alpha)"

# Freshness, not mere existence: Stop does not fire on a user interrupt, so a
# marker that outlives its turn must age out rather than spin forever.
busy_for alpha:a1 99999
"$bin" once
check "a stale busy marker reads as idle" "◆" "$(marker_of alpha:a1)"

busy_for alpha:a1
agents_for alpha:a1 2
"$bin" once
check "depth still wins over busy" "S2" "$(marker_of alpha:a1)"
clear_agents_for alpha:a1

clear_busy_for alpha:a1
"$bin" once
check "clearing busy reverts to present" "◆" "$(marker_of alpha:a1)"

# A busy pane with no LLM title at all is still working - a shell pane is not.
t select-pane -t alpha:a2 -T 'zsh'
busy_for alpha:a2
"$bin" once
check "busy needs no title to count" "S" "$(marker_of alpha:a2)"
clear_busy_for alpha:a2
"$bin" once
check "an unmarked shell pane stays empty" "" "$(marker_of alpha:a2)"

# --- pruning state for panes that no longer exist ------------------------------
# tmux pane ids reset to %0 when the server restarts, so a dir left by a previous
# server can collide with a recycled id. Exposed as a subcommand so it is testable
# without running the daemon loop.
mkdir -p "$TMUX_LLM_STATE_HOME/panes/99999.agents"
: > "$TMUX_LLM_STATE_HOME/panes/99999.agents/ghost"
: > "$TMUX_LLM_STATE_HOME/panes/99999.busy"
: > "$TMUX_LLM_STATE_HOME/panes/99999.meta"
agents_for alpha:a1 2
busy_for alpha:a1
"$bin" prune
check "prune drops dirs for dead panes" "absent" \
  "$(exists "$TMUX_LLM_STATE_HOME/panes/99999.agents")"
check "prune drops busy markers for dead panes" "absent" \
  "$(exists "$TMUX_LLM_STATE_HOME/panes/99999.busy")"
check "prune drops readings for dead panes" "absent" \
  "$(exists "$TMUX_LLM_STATE_HOME/panes/99999.meta")"
check "prune keeps dirs for live panes" "present" \
  "$(exists "$(agent_dir_for alpha:a1)")"
check "prune keeps busy markers for live panes" "present" \
  "$(exists "$(busy_file_for alpha:a1)")"
clear_agents_for alpha:a1
clear_busy_for alpha:a1

# --- blocked outranks working and idle, in the pane and in the window ----------
# Agent panes run sleep, not a shell: .needs is ignored on a bare shell prompt.
t -f /dev/null new-session -d -s delta -n d1 'sleep 600'
t split-window -d -t delta:d1 'sleep 600'
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

# --- table: every LLM pane, blocked first, readings where they exist ----------
# PROJECT must name the repo from inside a linked worktree, and fall back off-repo.
repo="$test_home/proj-repo"
git init -q "$repo"
git -C "$repo" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
git -C "$repo" worktree add -q -b bb-1 "$repo/.claude/worktrees/bb-1"
mkdir -p "$test_home/plain-dir"
t -f /dev/null new-session -d -s 'E2E - Tbl' -n t1 -c "$repo/.claude/worktrees/bb-1" 'sleep 600'
t -f /dev/null new-window -d -t 'E2E - Tbl:' -n t2 -c "$test_home/plain-dir" 'sleep 600'
t -f /dev/null new-window -d -t 'E2E - Tbl:' -n t3
t select-pane -t 'E2E - Tbl:t1' -T '✳ idle task'
t select-pane -t 'E2E - Tbl:t2' -T '✳ blocked task'
t select-pane -t 'E2E - Tbl:t3' -T 'zsh'
# Two windows share a name, as one PJM per session does live.
t -f /dev/null new-window -d -t 'E2E - Tbl:' -n dup 'sleep 600'
t -f /dev/null new-window -d -t 'E2E - Tbl:' -n dup 'sleep 600'
t select-pane -t 'E2E - Tbl:3' -T '✳ alpha'
t select-pane -t 'E2E - Tbl:4' -T '✳ beta with a pane title long enough to outgrow any narrow terminal'
needs_for 'E2E - Tbl:t2'
meta_for 'E2E - Tbl:t2' opus-5.5 29.4 bb-391

table="$(COLUMNS=160 "$bin" table)"
table_rows() { sed '1,/^KEY /d'; }
rows="$(printf '%s\n' "$table" | table_rows)"
check "blocked row sorts above idle" "yes" \
  "$(if head -1 <<< "$rows" | grep -qE '^1 +t2 +! needs'; then echo yes; else echo no; fi)"
check "non-LLM pane is omitted" "no" "$(if grep -qE '^. +t3 ' <<< "$rows"; then echo yes; else echo no; fi)"
check "target is the window name" "yes" "$(if grep -qE '^. +t1 +idle' <<< "$rows"; then echo yes; else echo no; fi)"
check "a unique window name carries no title" "no" "$(has "$rows" 't1 · ')"
check "project names the repo from a linked worktree" "yes" \
  "$(if grep -qE '^. +t1 .* proj-repo ' <<< "$rows"; then echo yes; else echo no; fi)"
check "project falls back to the directory off-repo" "yes" \
  "$(if grep -qE '^. +t2 .* plain-dir ' <<< "$rows"; then echo yes; else echo no; fi)"
check "a repeated window name carries its title" "yes" "$(has "$rows" 'dup · alpha')"
check "each repeat carries its own title" "yes" "$(has "$rows" 'dup · beta')"
check "blocked row carries ctx" "yes" "$(has "$rows" '29%')"
check "blocked row carries model" "yes" "$(has "$rows" 'opus-5.5')"
check "blocked row carries branch" "yes" "$(has "$rows" 'bb-391')"
check "a title suffix drops the title glyph" "no" "$(has "$rows" '✳')"
check "the TASK column is gone" "no" "$(has "$table" 'TASK')"
check "header counts the blocked pane" "yes" "$(has "$table" '· 1 need you ·')"
check "limits come from the newest reading" "yes" "$(has "$table" 'Limits: 5h 5% (resets 3h) · 7d 3% (resets 5d)')"
check "limits carry the reading's clock time" "yes" \
  "$(if grep -qE '^Limits: .* as of [0-9]{2}:[0-9]{2}$' <<< "$table"; then echo yes; else echo no; fi)"
# spaced session name and a pane with no reading must keep columns aligned
idle_row="$(grep -E '^. +t1 ' <<< "$rows")"
blocked_row="$(grep -E '^. +t2 ' <<< "$rows")"
check "missing reading renders dashes" "yes" "$(has "$idle_row" ' -  ')"
# ${#} counts characters, so this catches a multibyte · padded by byte.
dup_row="$(printf '%s\n' "$rows" | grep -F 'dup · alpha')"
b_prefix="${blocked_row%%! needs*}"
i_prefix="${idle_row%%idle *}"
d_prefix="${dup_row%%idle *}"
check "STATE starts at the same offset after a plain target" "${#b_prefix}" "${#i_prefix}"
check "STATE starts at the same offset after a · target" "${#i_prefix}" "${#d_prefix}"
longest=0
while IFS= read -r line; do (( ${#line} <= longest )) || longest=${#line}; done < <(COLUMNS=90 "$bin" table | table_rows)
check "a narrow terminal truncates rather than wraps" "yes" "$(if (( longest <= 90 )); then echo yes; else echo no; fi)"
# Exactly 90: PROJECT and BRANCH shrink to their values and TARGET takes the rest.
check "a long target fills a narrow terminal to the edge" "90" "$longest"

empty="$(TMUX_SOCKET="$test_home/no-such.sock" "$bin" table)"
meta_for 'E2E - Tbl:t2' opus-5.5 abc bb-391
check "a corrupt ctx reading does not cut the table short" "$(grep -c . <<< "$rows")" \
  "$(COLUMNS=160 "$bin" table | table_rows | grep -c .)"
meta_for 'E2E - Tbl:t2' opus-5.5 29.4 bb-391

# BRANCH fits names up to 40, but gives width back before TARGET drops below 24.
meta_for 'E2E - Tbl:t2' opus-5.5 29.4 chore/dependabot-group-typescript-eslint
check "a 40-character branch shows in full" "yes" \
  "$(has "$(COLUMNS=200 "$bin" table)" 'chore/dependabot-group-typescript-eslint')"
meta_for 'E2E - Tbl:t2' opus-5.5 29.4 chore/dependabot-group-typescript-eslint-plus
wide="$(COLUMNS=200 "$bin" table)"
check "a longer branch is cut at 40" "yes-no" \
  "$(has "$wide" 'chore/dependabot-group-typescript-eslint')-$(has "$wide" 'eslint-plus')"
# At 110 a 40-wide BRANCH would leave TARGET 10; it gives back 14 instead.
narrow_head="$(COLUMNS=110 "$bin" table | grep '^KEY ')"
narrow_head="${narrow_head%%STATE*}"
check "a long branch leaves TARGET 24 columns in a narrow terminal" "24" "$(( ${#narrow_head} - 5 ))"
longest=0
while IFS= read -r line; do (( ${#line} <= longest )) || longest=${#line}; done < <(COLUMNS=110 "$bin" table | table_rows)
check "a long branch still fits a narrow terminal" "yes" "$(if (( longest <= 110 )); then echo yes; else echo no; fi)"
meta_for 'E2E - Tbl:t2' opus-5.5 29.4 bb-391

check "empty server renders a zero header" "yes" "$(has "$empty" '0 total')"
check "empty server has no reading" "yes" "$(has "$empty" 'Limits: no reading yet')"

# --- tree order: grouped under session headers, in window order -----------------
tree="$(COLUMNS=160 "$bin" table tree)"
tbl_rows="$(sed -n '/^E2E - Tbl  /,/^[^ ]* *[^0-9a-z ]/p' <<< "$tree" | sed '1d' | grep -E '^. ')"
check "tree order puts a session header over its rows" "yes" \
  "$(if grep -qE '^E2E - Tbl  ' <<< "$tree"; then echo yes; else echo no; fi)"
check "tree order follows window order, not urgency" "t1 t2" \
  "$(head -2 <<< "$tbl_rows" | awk '{print $2}' | tr '\n' ' ' | sed 's/ $//')"
check "urgency order has no session headers" "no" \
  "$(if grep -qE '^E2E - Tbl  ' <<< "$table"; then echo yes; else echo no; fi)"
check "t is not a row key" "no" \
  "$(if grep -qE '^t  ' <<< "$tree"; then echo yes; else echo no; fi)"

# --- pick: one key jumps, q and EOF leave things alone ------------------------
current_window() { t display-message -p -t 'E2E - Tbl' '#{window_name}'; }
t select-window -t 'E2E - Tbl:t1'
printf 'q' | "$bin" pick >/dev/null 2>&1
check "q quits without jumping" "t1" "$(current_window)"
printf 'Z' | "$bin" pick >/dev/null 2>&1
check "unmapped key then EOF exits without jumping" "t1" "$(current_window)"
printf '1' | "$bin" pick >/dev/null 2>&1
check "key 1 jumps to the blocked pane" "t2" "$(current_window)"
# A real popup is a terminal that stays open, so pick must block on it rather than redraw
# on a timer; the key arrives well after the old 2s redraw would have fired.
in_tty() {
  if script --version >/dev/null 2>&1; then script -qec "$(printf '%q ' "$@")" /dev/null
  else script -q /dev/null "$@"; fi
}
t select-window -t 'E2E - Tbl:t1'
(sleep 3; printf '1') | in_tty "$bin" pick >/dev/null 2>&1 || true
check "pick waits on a terminal for a late key" "t2" "$(current_window)"
check "an idle popup draws once, with no timed redraw" "1" \
  "$( (sleep 3; printf 'q') | in_tty "$bin" pick 2>/dev/null | grep -o $'\033\\[2J' | wc -l | tr -d ' ')"
# The popup exports no COLUMNS, so width must come from the terminal itself: a long
# label fills a 100-column pty to the edge instead of stopping at tput's fallback 80.
# stdin from /dev/null: script cannot set up a pty over an inherited socket and prints nothing.
pty_longest="$(in_tty bash -c "stty cols 100 rows 40; unset COLUMNS; '$bin' table" 2>/dev/null </dev/null \
  | tr -d '\r' | while IFS= read -r line; do printf '%s\n' "${#line}"; done | sort -n | tail -1 || true)"
check "without COLUMNS the table uses the terminal's width" "100" "$pty_longest"

# After t, keys follow the tree rows: this key names a different pane in urgency order.
tree_key="$(grep -F 'dup · beta' <<< "$tree" | cut -c1)"
urgent_key="$(COLUMNS=160 "$bin" table | grep -F 'dup · beta' | cut -c1)"
check "the probe key differs between orders" "yes" "$([[ "$tree_key" != "$urgent_key" ]] && echo yes || echo no)"
t select-window -t 'E2E - Tbl:t1'
printf 't%s' "$tree_key" | COLUMNS=160 "$bin" pick >/dev/null 2>&1
check "t switches keys to tree order" "4" "$(t display-message -p -t 'E2E - Tbl' '#{window_index}')"
# Re-read: urgency order follows activity, and the jump above just changed it.
t select-window -t 'E2E - Tbl:t1'
urgent_key="$(COLUMNS=160 "$bin" table | grep -F 'dup · beta' | cut -c1)"
printf 'tt%s' "$urgent_key" | COLUMNS=160 "$bin" pick >/dev/null 2>&1
check "t twice is back to urgency order" "4" "$(t display-message -p -t 'E2E - Tbl' '#{window_index}')"
t select-window -t 'E2E - Tbl:t1'
printf 'r1' | "$bin" pick >/dev/null 2>&1
check "r redraws without leaving" "t2" "$(current_window)"
t select-window -t 'E2E - Tbl:t1'
printf '\033[A1' | "$bin" pick >/dev/null 2>&1
check "an arrow key does not close the popup" "t2" "$(current_window)"
t select-window -t 'E2E - Tbl:t1'
(printf '\033'; sleep 2; printf '1') | in_tty "$bin" pick >/dev/null 2>&1 || true
check "a bare Esc quits without jumping" "t1" "$(current_window)"
clear_needs_for 'E2E - Tbl:t2'
t kill-session -t 'E2E - Tbl'

# --- org-lock: holders and inferred waiters land on the pane that owns them ------
t -f /dev/null new-session -d -s 'E2E - Org' -n holder "sh -c 'sleep 600 & wait'"
t -f /dev/null new-window -d -t 'E2E - Org:' -n waiter "$fake_bin/org-lock run --alias canarys --wait 5 -- true"
t -f /dev/null new-window -d -t 'E2E - Org:' -n e2e "env SF_ORG_ALIAS=canarys $fake_bin/playwright test"
t -f /dev/null new-window -d -t 'E2E - Org:' -n bystander 'sleep 600'
t -f /dev/null new-window -d -t 'E2E - Org:' -n drifted "sh -c 'sleep 600 & wait'"
t -f /dev/null new-window -d -t 'E2E - Org:' -n plain "sh -c 'sleep 600 & wait'"
for w in qa qb qc qd qe qf qg; do t -f /dev/null new-window -d -t 'E2E - Org:' -n "$w" 'sleep 600'; done
for w in holder waiter e2e bystander drifted qa qb qc qd qe qf qg; do t select-pane -t "E2E - Org:$w" -T "✳ $w"; done
t select-pane -t 'E2E - Org:plain' -T 'zsh'
child_of() {  # window -> its pane's sleep child, once it has started
  local pp kid n
  pp="$(t display-message -p -t "E2E - Org:$1" '#{pane_pid}')"
  for (( n = 0; n < 50; n++ )); do
    kid="$(pgrep -P "$pp" sleep | head -1 || true)"
    [[ -n "$kid" ]] && { printf '%s' "$kid"; return 0; }
    sleep 0.1
  done
}
holder_pid="$(child_of holder)"
drifted_pid="$(child_of drifted)"
plain_pid="$(child_of plain)"
# Detached from stdout, or a caller piping this suite waits the full 600s for EOF.
sleep 600 >/dev/null 2>&1 &
outside_pid=$!
disown "$outside_pid"
cat > "$FAKE_LOCKS" <<JSON
[{"alias":"canarys","pid":$holder_pid,"status":"live"},
 {"alias":"fe-automation","pid":$drifted_pid,"status":"unverified"},
 {"alias":"canaryp","pid":$outside_pid,"status":"live"},
 {"alias":"old-org","pid":999999,"status":"stale"},
 {"alias":"devorg","pid":$plain_pid,"status":"live"}]
JSON
pane_of() { t display-message -p -t "E2E - Org:$1" '#{pane_id}'; }
ts_ago() { date -v-"$1"M +%FT%T 2>/dev/null || date -d "$1 minutes ago" +%FT%T; }
# qd waits first and re-logs last: an update keeps its place. qb's P1 jumps the P2s.
# Claude's own session records: the agent name a legacy WAIT line uses, and its pane.
mkdir -p "$TMUX_LLM_CLAUDE_SESSIONS"
printf '{"pid":%s,"name":"legacy-sess-3f","tmux":"E2E - Org:@1.%s"}\n' "$$" "$(pane_of qg)" \
  > "$TMUX_LLM_CLAUDE_SESSIONS/1.json"
printf '{"pid":999999,"name":"phantom-sess","tmux":"E2E - Org:@1.%s"}\n' "$(pane_of bystander)" \
  > "$TMUX_LLM_CLAUDE_SESSIONS/2.json"
cat > "$TMUX_LLM_ANNOUNCE_LOG" <<LOG
2020-01-01T00:00:00 WAIT canarys ancient pane=$(pane_of bystander) P1 long gone
$(ts_ago 800) WAIT canarys qf-sess pane=$(pane_of qf) P2 yesterday, then silent
$(ts_ago 60) WAIT canarys qc-sess pane=$(pane_of qc) P1 then claimed
$(ts_ago 55) CLAIM canarys qc-sess pane=$(pane_of qc) P1 ~5m
$(ts_ago 50) WAIT canarys qd-sess pane=$(pane_of qd) P2 first in line
$(ts_ago 45) NOTE canarys qa-sess pane=$(pane_of qa) not a wait
$(ts_ago 40) WAIT canarys qa-sess pane=$(pane_of qa) P2 ~10m
$(ts_ago 35) WAIT canarys gone-sess pane=%99999 P1 pane closed
$(ts_ago 30) WAIT canarys legacy-sess P2 no pane logged
$(ts_ago 25) WAIT canarys phantom-sess P2 no pane, no live session
$(ts_ago 10) WAIT canarys qb-sess pane=$(pane_of qb) P1 restoring the daily
$(ts_ago 5) WAIT canarys qd-sess pane=$(pane_of qd) P2 UPDATE supersedes
$(ts_ago 2) WAIT canarys qf-sess pane=$(pane_of qf) P2 back today
$(ts_ago 3) WAIT scratch1 qe-sess pane=$(pane_of qe) P3 nobody holds it
LOG
org_table="$(COLUMNS=200 "$bin" table)"
# Squeezed, because ORG pads every alias to the longest one.
org_row() { grep -E "^. +$1 " <<< "$org_table" | tr -s ' ' | sed -E 's/ $//'; }
ends() { if [[ "$1" == *"$2" ]]; then echo yes; else echo no; fi; }
check "holder pane shows its org held" "yes" "$(ends "$(org_row holder)" 'canarys held')"
check "org-lock waiter pane shows queued" "yes" "$(ends "$(org_row waiter)" 'canarys queued')"
if command -v node >/dev/null 2>&1; then
  check "e2e waiter with an inline alias shows queued" "yes" "$(ends "$(org_row e2e)" 'canarys queued')"
fi
check "an uninvolved pane shows dashes" "yes" \
  "$(ends "$(org_row bystander)" ' - -')"
check "an unverified holder is never shown as free" "yes" "$(ends "$(org_row drifted)" 'fe-automation held?')"
check "a holder outside every pane is in the header" "yes" \
  "$(has "$org_table" "canaryp held by pid $outside_pid, not in a pane")"
check "a stale lock is in the header" "yes" "$(has "$org_table" 'old-org stale, pid 999999 gone')"
check "a holder in a non-agent pane is in the header" "yes" \
  "$(has "$org_table" "devorg held by pid $plain_pid, in a non-agent pane")"
check "a P1 waiter is first in line" "yes" "$(ends "$(org_row qb)" 'canarys wait 1')"
check "a re-logged WAIT keeps its place" "yes" "$(ends "$(org_row qd)" 'canarys wait 2')"
check "a later P2 waiter queues behind it" "yes" "$(ends "$(org_row qa)" 'canarys wait 3')"
check "a wait revived after the cutoff joins the back" "yes" "$(ends "$(org_row qf)" 'canarys wait 6')"
check "a WAIT followed by CLAIM is no longer waiting" "yes" "$(ends "$(org_row qc)" ' - -')"
# A leaked wait shows on the pane it names, or in the header when no row owns it.
check "a wait older than the cutoff is dropped" "yes" "$(ends "$(org_row bystander)" ' - -')"
check "a wait from a closed pane is dropped" "no" \
  "$(if grep -qE 'canarys wait [0-9]+, in a non-agent pane' <<< "$org_table"; then echo yes; else echo no; fi)"
check "a wait with no pane lands on its session's row" "yes" "$(ends "$(org_row qg)" 'canarys wait 4')"
check "a wait naming no live agent is unmatched in the header" "yes" \
  "$(has "$org_table" 'phantom-sess wait 5 on canarys (unmatched)')"
check "an unheld org with waiters says it is free" "yes" "$(has "$org_table" 'scratch1 free, 1 waiting')"
check "a waiter on an unheld org is numbered" "yes" "$(ends "$(org_row qe)" 'scratch1 wait 1')"
longest=0
while IFS= read -r line; do (( ${#line} <= longest )) || longest=${#line}; done < <(COLUMNS=100 "$bin" table | table_rows)
check "org columns still fit a narrow terminal" "yes" "$(if (( longest <= 100 )); then echo yes; else echo no; fi)"
no_lock="$(TMUX_LLM_ORG_LOCK="$test_home/no-such-org-lock" TMUX_LLM_ANNOUNCE_LOG="$test_home/no-log" \
  COLUMNS=200 "$bin" table)"
check "a missing org-lock drops the org columns" "no" "$(has "$no_lock" 'LOCK')"
check "a missing org-lock keeps the rows" "yes" "$(if grep -qE '^. +holder ' <<< "$no_lock"; then echo yes; else echo no; fi)"
printf '[]\n' > "$FAKE_LOCKS"
waits_only="$(COLUMNS=200 "$bin" table)"
check "waits alone show the org columns" "yes" "$(has "$waits_only" 'LOCK')"
check "waits alone put a free org in the header" "yes" "$(has "$waits_only" 'canarys free, 6 waiting')"
# An unreadable lock state must never read as free: "free" is the go-ahead signal.
unknown="$(TMUX_LLM_ORG_LOCK="$test_home/no-such-org-lock" COLUMNS=200 "$bin" table)"
check "a missing org-lock never calls a waited-on org free" "no" "$(has "$unknown" 'canarys free')"
check "a missing org-lock says the lock state is unknown" "yes" \
  "$(has "$unknown" 'canarys lock unknown (org-lock unavailable), 6 waiting')"
# tmux's global PATH omits ~/.local/bin, where org-lock is installed.
mkdir -p "$test_home/.local/bin"
cp "$fake_bin/org-lock" "$test_home/.local/bin/org-lock"
printf '[{"alias":"canarys","pid":%s,"status":"live"}]\n' "$outside_pid" > "$FAKE_LOCKS"
home_bin="$(
  unset TMUX_LLM_ORG_LOCK
  HOME="$test_home" PATH="/usr/bin:/bin:$(dirname "$(command -v tmux)"):$(dirname "$(command -v jq)")" \
    COLUMNS=200 "$bin" table
)"
check "org-lock is found in ~/.local/bin off PATH" "yes" "$(has "$home_bin" "canarys held by pid $outside_pid, not in a pane")"
printf '[]\n' > "$FAKE_LOCKS"
rm -f "$TMUX_LLM_ANNOUNCE_LOG"
no_held="$(COLUMNS=200 "$bin" table)"
check "no locks means no org columns" "no" "$(has "$no_held" 'LOCK')"
check "no locks means no Locks line" "no" "$(has "$no_held" 'Locks:')"
kill "$outside_pid" 2>/dev/null || true
t kill-session -t 'E2E - Org'

# --- a leftover .needs on a bare shell (claude crashed mid-prompt) is not believed
t -f /dev/null new-session -d -s eps -n e1
t select-pane -t eps:e1 -T '✳ claude crashed'
needs_for eps:e1
"$bin" once
check "stale needs on a shell pane is ignored" "◆" "$(marker_of eps:e1)"
clear_needs_for eps:e1
t kill-session -t eps

if (( failures > 0 )); then
  printf 'test-tmux-llm-status: %d failure(s)\n' "$failures" >&2
  exit 1
fi

printf 'test-tmux-llm-status: all checks passed\n'
