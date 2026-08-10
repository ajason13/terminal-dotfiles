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
# publish_objectives shells out to the installed session-objective; point its
# store at a throwaway dir so these tests cannot read or write real objectives.
SESSION_OBJECTIVE_HOME="$test_home/objectives"
export SESSION_OBJECTIVE_HOME
mkdir -p "$SESSION_OBJECTIVE_HOME"

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

if (( failures > 0 )); then
  printf 'test-tmux-llm-status: %d failure(s)\n' "$failures" >&2
  exit 1
fi

printf 'test-tmux-llm-status: all checks passed\n'
