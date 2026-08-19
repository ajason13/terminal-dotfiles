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

exists() { if [[ -e "$1" ]]; then printf 'present'; else printf 'absent'; fi; }

# -f /dev/null on every server-creating call: the real tmux.conf restarts the
# status daemon, which would then run against this test socket.
t() { tmux -S "$TMUX_SOCKET" "$@"; }
cleanup() {
  t kill-server 2>/dev/null || true
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
agents_for alpha:a1 2
busy_for alpha:a1
"$bin" prune
check "prune drops dirs for dead panes" "absent" \
  "$(exists "$TMUX_LLM_STATE_HOME/panes/99999.agents")"
check "prune drops busy markers for dead panes" "absent" \
  "$(exists "$TMUX_LLM_STATE_HOME/panes/99999.busy")"
check "prune keeps dirs for live panes" "present" \
  "$(exists "$(agent_dir_for alpha:a1)")"
check "prune keeps busy markers for live panes" "present" \
  "$(exists "$(busy_file_for alpha:a1)")"
clear_agents_for alpha:a1
clear_busy_for alpha:a1

if (( failures > 0 )); then
  printf 'test-tmux-llm-status: %d failure(s)\n' "$failures" >&2
  exit 1
fi

printf 'test-tmux-llm-status: all checks passed\n'
