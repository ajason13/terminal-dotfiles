#!/usr/bin/env bash
set -euo pipefail

timestamp="$(date +%Y%m%d-%H%M%S)"
dry_run="false"
restore_latest="true"

usage() {
  cat <<'EOF'
Usage: ./uninstall-macos.sh [--restore-latest|--remove-only] [--dry-run]

  --restore-latest  Remove installed config and restore latest *.backup-* files when present.
  --remove-only     Remove installed config after backing it up; do not restore old files.
  --dry-run         Print planned actions without changing files.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --restore-latest)
      restore_latest="true"
      ;;
    --remove-only)
      restore_latest="false"
      ;;
    --dry-run)
      dry_run="true"
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
  shift
done

run() {
  if [[ "$dry_run" == "true" ]]; then
    printf 'DRY RUN:'
    printf ' %q' "$@"
    printf '\n'
    return
  fi

  "$@"
}

latest_backup() {
  local target="$1"
  local latest=""

  latest="$(find "$(dirname "$target")" -maxdepth 1 -name "$(basename "$target").backup-*" -print 2>/dev/null | sort | tail -n 1 || true)"
  printf '%s' "$latest"
}

remove_target() {
  local target="$1"

  if [[ -e "$target" || -L "$target" ]]; then
    run mv "$target" "$target.removed-$timestamp"
    printf 'Removed %s\n' "$target"
  fi
}

restore_target() {
  local target="$1"
  local backup

  backup="$(latest_backup "$target")"
  if [[ -z "$backup" ]]; then
    printf 'No backup found for %s\n' "$target"
    return
  fi

  if [[ "$dry_run" != "true" && ( -e "$target" || -L "$target" ) ]]; then
    printf 'Skipped restore for %s because it already exists\n' "$target"
    return
  fi

  run mv "$backup" "$target"
  printf 'Restored %s from %s\n' "$target" "$backup"
}

targets=(
  "$HOME/.wezterm.lua"
  "$HOME/.config/wezterm"
  "$HOME/.tmux.conf"
  "$HOME/.local/bin/tmux-llm-status"
  "$HOME/.config/nvim"
  "$HOME/.codex/config.toml"
  "$HOME/.codex/AGENTS.md"
  "$HOME/.codex/agents"
  "$HOME/.codex/deep-researcher.config.toml"
  "$HOME/.codex/lead-architect.config.toml"
  "$HOME/.codex/workflow-coordinator.config.toml"
  "$HOME/.codex/builder.config.toml"
  "$HOME/.local/bin/codex-role"
  "$HOME/.local/bin/session-objective"
  "$HOME/.local/bin/sf-org-resolve"
  "$HOME/.local/bin/sf-lease"
  "$HOME/.claude/statusline.sh"
  "$HOME/.claude/commands/objective.md"
  "$HOME/.claude/hooks/track-crm-org.sh"
  "$HOME/.claude/hooks/sf-lease-guard.sh"
  "$HOME/.claude/hooks/sf-lease-post.sh"
  "$HOME/.claude/hooks/sf-lease-end.sh"
  "$HOME/.claude/hooks/sf-lease-table.sh"
  "$HOME/.claude/hooks/tmux-agent-depth.sh"
)

for target in "${targets[@]}"; do
  remove_target "$target"
done

if [[ "$restore_latest" == "true" ]]; then
  for target in "${targets[@]}"; do
    restore_target "$target"
  done
fi

printf '\nUninstall complete.\n'
# Removing the scripts does not unregister them: a settings.json entry pointing at
# a hook that no longer exists is a per-Bash-call error, so unregister first.
printf 'If the sf-lease hooks were registered, remove their ~/.claude/settings.json\n'
printf 'entries and unset SF_LEASE_ENABLE too - this script does not edit settings.json.\n'
# Left in place on purpose: it may hold a live lease belonging to another running
# session, and this script only removes what it installed. Named plainly because
# it is the one place this feature wrote real org identities to disk.
if [[ -d "${SF_LEASE_HOME:-$HOME/.local/state/sf-leases}" ]]; then
  printf '\nThe lease store was NOT removed: %s\n' "${SF_LEASE_HOME:-$HOME/.local/state/sf-leases}"
  printf 'It holds any still-live leases, and hook.log there records real org\n'
  printf 'identities and Claude session ids. To delete both: rm -rf %s\n' \
    "${SF_LEASE_HOME:-$HOME/.local/state/sf-leases}"
fi

# Left in place on purpose: it may hold live subagent-depth counts for a running
# pane, and this script only removes what it installed.
if [[ -d "${TMUX_LLM_STATE_HOME:-$HOME/.local/state/tmux-llm}" ]]; then
  printf '\nThe tmux-llm-status state store was NOT removed: %s\n' \
    "${TMUX_LLM_STATE_HOME:-$HOME/.local/state/tmux-llm}"
  printf 'To delete it: rm -rf %s\n' "${TMUX_LLM_STATE_HOME:-$HOME/.local/state/tmux-llm}"
fi
