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
  "$HOME/.claude/statusline.sh"
  "$HOME/.claude/commands/objective.md"
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
