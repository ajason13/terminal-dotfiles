#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/install-targets.sh
source "$root_dir/scripts/install-targets.sh"
install_home="${DOTFILES_TARGET_HOME:-$HOME}"
timestamp="$(date +%Y%m%d-%H%M%S)-$$"
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

targets=()
while IFS='|' read -r kind _ relative_target _; do
  target="$install_home/$relative_target"
  if [[ "$kind" == "skill" ]]; then
    # Backups and removed skills must stay outside the skill discovery root.
    name="$(basename "$target")"
    receipt="$install_home/.local/state/terminal-dotfiles/skills"
    managed=false
    if grep -qxF "$name" "$receipt" 2>/dev/null; then
      managed=true
    elif [[ -L "$target" && "$(readlink "$target")" == "$root_dir/codex/skills/$name" ]]; then
      managed=true
    elif [[ -d "$target" && ! -L "$target" && -d "$root_dir/codex/skills/$name" ]] && diff -qr "$root_dir/codex/skills/$name" "$target" >/dev/null; then
      managed=true
    fi
    if [[ "$managed" != true ]]; then
      printf 'Leaving unmanaged skill %s\n' "$target"
      continue
    fi
    saved="$(find "$install_home/.codex/skill-backups" -mindepth 2 -maxdepth 2 -name "$name" -print 2>/dev/null | sort | tail -n 1 || true)"
    if [[ -e "$target" || -L "$target" ]]; then
      run mkdir -p "$install_home/.codex/skill-removed/$timestamp"
      run mv "$target" "$install_home/.codex/skill-removed/$timestamp/$name"
      printf 'Removed %s\n' "$target"
    fi
    if [[ "$restore_latest" == "true" && -n "$saved" ]]; then
      run mkdir -p "$(dirname "$target")"
      run mv "$saved" "$target"
      printf 'Restored %s from %s\n' "$target" "$saved"
    fi
  else
    targets+=("$target")
  fi
done < <(install_targets "$root_dir" "$install_home")
# A retired profile can still exist after updating an older installation.
targets+=("$install_home/.codex/workflow-coordinator.config.toml")

# Retired features whose files may still be present from an earlier install.
legacy_targets=(
  "$install_home/.claude/hooks/track-crm-org.sh"
  "$install_home/.local/bin/session-objective"
  "$install_home/.claude/commands/objective.md"
)

for target in "${targets[@]}" "${legacy_targets[@]}"; do
  remove_target "$target"
done

if [[ "$restore_latest" == "true" ]]; then
  for target in "${targets[@]}"; do
    restore_target "$target"
  done
fi

run rm -f "$install_home/.local/state/terminal-dotfiles/skills"
printf '\nUninstall complete.\n'
# Removing the scripts does not unregister them: a settings.json entry pointing at
# a hook that no longer exists is a per-Bash-call error, so unregister first.
printf 'If the sf-lease hooks were registered, remove their ~/.claude/settings.json\n'
printf 'entries and unset SF_LEASE_ENABLE too - this script does not edit settings.json.\n'
# Left in place on purpose: it may hold a live lease belonging to another running
# session, and this script only removes what it installed. Named plainly because
# it is the one place this feature wrote real org identities to disk.
if [[ -d "${SF_LEASE_HOME:-$install_home/.local/state/sf-leases}" ]]; then
  printf '\nThe lease store was NOT removed: %s\n' "${SF_LEASE_HOME:-$install_home/.local/state/sf-leases}"
  printf 'It holds any still-live leases, and hook.log there records real org\n'
  printf 'identities and Claude session ids. To delete both: rm -rf %s\n' \
    "${SF_LEASE_HOME:-$install_home/.local/state/sf-leases}"
fi

# Left in place on purpose: it may hold live subagent-depth counts for a running
# pane, and this script only removes what it installed.
if [[ -d "${TMUX_LLM_STATE_HOME:-$install_home/.local/state/tmux-llm}" ]]; then
  printf '\nThe tmux-llm-status state store was NOT removed: %s\n' \
    "${TMUX_LLM_STATE_HOME:-$install_home/.local/state/tmux-llm}"
  printf 'To delete it: rm -rf %s\n' "${TMUX_LLM_STATE_HOME:-$install_home/.local/state/tmux-llm}"
fi
