#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install_home="${DOTFILES_TARGET_HOME:-$HOME}"
timestamp="$(date +%Y%m%d-%H%M%S)-$$"
# shellcheck source=scripts/install-targets.sh
source "$root_dir/scripts/install-targets.sh"
mode="copy"
dry_run="false"
skip_backgrounds="false"
refresh_backgrounds="false"

usage() {
  cat <<'EOF'
Usage: ./install-macos.sh [--copy|--link] [--dry-run]

  --copy     Copy WezTerm, tmux, Neovim, and Codex files into their home-directory locations.
  --link     Symlink live config to this dotfiles folder. Best while editing locally.
  --dry-run  Print planned actions without changing files.
  --skip-backgrounds     Do not download the wallpaper bundles.
  --refresh-backgrounds  Force re-download of the wallpaper bundles.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --copy)
      mode="copy"
      ;;
    --link)
      mode="link"
      ;;
    --dry-run)
      dry_run="true"
      ;;
    --skip-backgrounds)
      skip_backgrounds="true"
      ;;
    --refresh-backgrounds)
      refresh_backgrounds="true"
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

backup_path() {
  local target="$1"

  if [[ -e "$target" || -L "$target" ]]; then
    [[ ! -e "$target.backup-$timestamp" && ! -L "$target.backup-$timestamp" ]] || {
      printf 'Backup already exists: %s\n' "$target.backup-$timestamp" >&2
      exit 1
    }
    run mv "$target" "$target.backup-$timestamp"
    printf 'Backed up %s\n' "$target"
  fi
}

backup_file_if_needed() {
  local source="$1"
  local target="$2"

  if [[ ! -e "$target" && ! -L "$target" ]]; then
    return
  fi

  if [[ ! -L "$target" ]] && cmp -s "$source" "$target"; then
    return
  fi

  backup_path "$target"
}

install_file() {
  local source="$1"
  local target="$2"
  local file_mode="${3:-0644}"

  backup_file_if_needed "$source" "$target"
  run mkdir -p "$(dirname "$target")"
  run install -m "$file_mode" "$source" "$target"
  printf 'Installed %s\n' "$target"
}

# Replace managed entries without following destination symlinks into user data.
# The full previous directory has already been backed up before this overlay.
overlay_tree() {
  local source="$1" target="$2" entry dest
  for entry in "$source"/* "$source"/.[!.]* "$source"/..?*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    dest="$target/$(basename "$entry")"
    if [[ -d "$entry" && ! -L "$entry" ]]; then
      if [[ -L "$dest" || ( -e "$dest" && ! -d "$dest" ) ]]; then run rm -f "$dest"; fi
      run mkdir -p "$dest"
      overlay_tree "$entry" "$dest"
    else
      if [[ -e "$dest" || -L "$dest" ]]; then run rm -rf "$dest"; fi
      run cp -pR "$entry" "$dest"
    fi
  done
}

# Compare only managed entries; local overrides and downloaded assets do not
# turn an unchanged reinstall into a new backup of the installed configuration.
tree_matches_source() {
  local source="$1" target="$2" entry dest
  [[ -d "$target" && ! -L "$target" ]] || return 1
  for entry in "$source"/* "$source"/.[!.]* "$source"/..?*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    dest="$target/$(basename "$entry")"
    if [[ -L "$entry" ]]; then
      [[ -L "$dest" && "$(readlink "$entry")" == "$(readlink "$dest")" ]] || return 1
    elif [[ -d "$entry" ]]; then
      tree_matches_source "$entry" "$dest" || return 1
    else
      [[ -f "$dest" && ! -L "$dest" ]] && cmp -s "$entry" "$dest" || return 1
    fi
  done
}

# Preserve the previous tree as a unit, matching uninstall's restore unit.
# Carry local-only files forward (e.g. local.lua), then replace managed files.
install_tree() {
  local source="$1" target="$2" previous="" retire_coordinator=false
  # This one formerly managed agent must not survive as a local-only override.
  # Force a full backup even when the remaining managed files already match.
  if [[ "$target" == "$install_home/.codex/agents" && ! -e "$source/workflow-coordinator.toml" \
    && ( -e "$target/workflow-coordinator.toml" || -L "$target/workflow-coordinator.toml" ) ]]; then
    retire_coordinator=true
  fi
  if tree_matches_source "$source" "$target" && [[ "$retire_coordinator" != true ]]; then
    printf 'Already installed %s\n' "$target"
    return
  fi
  if [[ -e "$target" || -L "$target" ]]; then
    [[ -d "$target" && ! -L "$target" ]] && previous="$target.backup-$timestamp"
    backup_path "$target"
  fi
  if [[ -n "$previous" ]]; then
    # Copy the root too so private directory modes and local-file modes survive.
    run cp -pR "$previous" "$target"
  else
    run mkdir -p "$target"
  fi
  overlay_tree "$source" "$target"
  if [[ "$retire_coordinator" == true ]]; then
    run rm -f "$target/workflow-coordinator.toml"
  fi
  printf 'Installed %s\n' "$target"
}

link_path() {
  local source="$1"
  local target="$2"

  run mkdir -p "$(dirname "$target")"

  if [[ -L "$target" ]] && [[ "$(readlink "$target")" == "$source" ]]; then
    printf 'Already linked %s\n' "$target"
    return
  fi

  backup_path "$target"
  run ln -s "$source" "$target"
  printf 'Linked %s -> %s\n' "$target" "$source"
}

# Codex discovers symlinked skill folders, but not a symlinked SKILL.md file.
# Directory backups must live outside the discovery root to avoid duplicates.
install_skill() {
  local source="$1"
  local target saved name
  name="$(basename "$source")"
  target="$install_home/.codex/skills/$name"
  saved="$install_home/.codex/skill-backups/$timestamp/$name"

  if [[ "$mode" == "link" && -L "$target" ]] && [[ "$(readlink "$target")" == "$source" ]]; then
    printf 'Already linked %s\n' "$target"
    return
  fi
  if [[ "$mode" == "copy" && -d "$target" && ! -L "$target" ]] && diff -qr "$source" "$target" >/dev/null; then
    printf 'Already installed %s\n' "$target"
    return
  fi
  if [[ -e "$target" || -L "$target" ]]; then
    if [[ -e "$saved" || -L "$saved" ]]; then
      printf 'Skill backup already exists: %s\n' "$saved" >&2
      exit 1
    fi
    run mkdir -p "$(dirname "$saved")"
    run mv "$target" "$saved"
  fi
  run mkdir -p "$(dirname "$target")"
  if [[ "$mode" == "link" ]]; then
    run ln -s "$source" "$target"
  else
    run mkdir -p "$target"
    run cp -R "$source/." "$target/"
  fi
  printf 'Installed skill %s\n' "$target"
}

# The hook SCRIPTS are installed; registering them is deliberately manual. A
# PreToolUse hook can block or stall every Bash call in every live session,
# including the one you would fix it from, so registering and arming are two
# separate human steps - and settings.json is merged by hand because a
# `jq '.[0] * .[1]'` merge REPLACES arrays, dropping whatever hooks are already
# registered there.
print_hooks_notice() {
  printf 'Claude Code hooks are installed but NOT registered. Add to ~/.claude/settings.json\n'
  printf '(merge by hand - do not overwrite an existing hooks entry):\n'
  printf '  PreToolUse  (Bash) -> ~/.claude/hooks/sf-lease-guard.sh\n'
  printf '  PostToolUse (Bash) -> ~/.claude/hooks/sf-lease-post.sh\n'
  printf '  SessionEnd         -> ~/.claude/hooks/sf-lease-end.sh\n'
  printf '  SessionStart       -> ~/.claude/hooks/sf-lease-table.sh\n'
  printf 'They stay inert until you export SF_LEASE_ENABLE=1 - register them first,\n'
  printf 'confirm sessions still behave, and arm them only after that (see README).\n'
  printf '\n'
  printf 'Separately, for the tmux status bar subagent-depth markers (unconditional,\n'
  printf 'no env gate - they take effect as soon as they are registered):\n'
  printf '  SubagentStart      -> ~/.claude/hooks/tmux-agent-depth.sh\n'
  printf '  SubagentStop       -> ~/.claude/hooks/tmux-agent-depth.sh\n'
  printf '  SessionStart       -> ~/.claude/hooks/tmux-agent-depth.sh\n'
  printf '  SessionEnd         -> ~/.claude/hooks/tmux-agent-depth.sh\n'
  printf 'SessionStart and SessionEnd are shared with the lease hooks above - add both\n'
  printf 'commands under the same event key, do not let one replace the other.\n'
  printf '\n'
}

fetch_backgrounds() {
  local dest="$1"

  if [[ "$skip_backgrounds" == "true" ]]; then
    printf 'Skipping backgrounds fetch (--skip-backgrounds)\n'
    return
  fi

  local args=(--dest "$dest")
  if [[ "$refresh_backgrounds" == "true" ]]; then
    args+=(--refresh)
  fi

  run "$root_dir/scripts/fetch-backgrounds.sh" "${args[@]}"
}

while IFS='|' read -r kind relative_source relative_target file_mode; do
  source_path="$root_dir/$relative_source"
  target_path="$install_home/$relative_target"
  if [[ "$kind" == "skill" ]]; then
    install_skill "$source_path"
    receipt="$install_home/.local/state/terminal-dotfiles/skills"
    run mkdir -p "$(dirname "$receipt")"
    if [[ "$dry_run" != true ]] && ! grep -qxF "$(basename "$source_path")" "$receipt" 2>/dev/null; then
      printf '%s\n' "$(basename "$source_path")" >> "$receipt"
    fi
  elif [[ "$mode" == "link" ]]; then
    link_path "$source_path" "$target_path"
  elif [[ "$kind" == "tree" ]]; then
    install_tree "$source_path" "$target_path"
  else
    install_file "$source_path" "$target_path" "$file_mode"
  fi
done < <(install_targets "$root_dir")

# Its sibling backup is restored by uninstall --restore-latest, like other profiles.
backup_path "$install_home/.codex/workflow-coordinator.config.toml"

if [[ "$mode" == "link" ]]; then
  fetch_backgrounds "$root_dir/wezterm/assets/backgrounds"
else
  fetch_backgrounds "$install_home/.config/wezterm/assets/backgrounds"
fi
printf '\nInstalled WezTerm, tmux, Neovim, Codex, and Claude Code config (%s).\n' "$mode"
print_hooks_notice
printf 'Reload WezTerm, then reload tmux with: Ctrl-a r\n'
