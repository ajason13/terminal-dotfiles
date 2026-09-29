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
