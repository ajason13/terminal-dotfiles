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
# tmux always sets this, but it flows into an rm -rf path below, so verify it.
[[ "${TMUX_PANE#%}" =~ ^[0-9]+$ ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

STATE_HOME="${TMUX_LLM_STATE_HOME:-${HOME:-}/.local/state/tmux-llm}"
AGENT_DIR="$STATE_HOME/panes/${TMUX_PANE#%}.agents"

payload="$(cat 2>/dev/null || true)"
# One jq call for all three fields, joined on 0x1F not tab: `read` treats tab as
# IFS whitespace and collapses empty fields regardless of how IFS is set, which
# would misparse an absent .source. Garbage payload -> jq fails silently -> no-op.
event="" agent="" source=""
IFS=$'\x1f' read -r event agent source < <(
  printf '%s' "$payload" | jq -r \
    '[(.hook_event_name // ""), (.agent_id // .subagent_id // .tool_use_id // ""), (.source // "")] | join("\u001f")' \
    2>/dev/null || true
)

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
  SessionStart)
    # compact/resume fire mid-turn with agents still in flight; wiping here
    # would strand a busy pane at idle forever, since surviving agents only
    # ever fire SubagentStop.
    case "$source" in
      compact | resume) ;;
      *) rm -rf "$AGENT_DIR" 2>/dev/null || true ;;
    esac
    ;;
  SessionEnd)
    rm -rf "$AGENT_DIR" 2>/dev/null || true
    ;;
esac

exit 0
