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

# Fire a SessionStart/SessionEnd with a .source field, the way auto-compaction does.
fire_with_source() {
  local event="$1" source="$2" pane="${3:-%9}"
  printf '{"hook_event_name":"%s","source":"%s"}' "$event" "$source" \
    | TMUX_PANE="$pane" "$hook"
}

# nullglob stays OFF deliberately: with it on, an empty dir yields an empty array
# and `${f[0]}` is unbound under `set -u`. Unset, the glob stays literal and the
# -e test fails cleanly.
count() {
  local pane="${1:-9}"
  local dir="$TMUX_LLM_STATE_HOME/panes/$pane.agents"
  local -a f=("$dir"/*)
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

# --- SessionStart source gating: auto-compaction fires mid-turn with agents
# still in flight, so it must not wipe. startup/clear/unknown still wipe. -----
fire SubagentStart kept
fire_with_source SessionStart compact
check "compact source does not wipe" "1" "$(count)"

fire_with_source SessionStart resume
check "resume source does not wipe" "1" "$(count)"

fire_with_source SessionStart startup
check "startup source still wipes" "0" "$(count)"

fire SubagentStart kept2
fire_with_source SessionStart clear
check "clear source still wipes" "0" "$(count)"

fire SubagentStart kept3
fire_with_source SessionStart ''
check "missing source wipes conservatively" "0" "$(count)"

# --- guards: the hook must never disturb a session --------------------------
# Seed pane 7 with an agent, then fire on pane 9, then assert pane 7 is untouched.
fire SubagentStart seeded-agent '%7'
check "can seed another pane" "1" "$(count 7)"

fire SubagentStart isolated '%9'
check "another pane is untouched" "1" "$(count 7)"

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
