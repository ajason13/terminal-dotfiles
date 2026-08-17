#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
timestamp="$(date +%Y%m%d-%H%M%S)"
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

prepare_copy_dir() {
  local target="$1"

  if [[ -L "$target" ]]; then
    backup_path "$target"
  fi

  run mkdir -p "$target"
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
  printf '\n'
  printf 'Separately, for the statusline org indicator (never blocks, always exits 0):\n'
  printf '  PreToolUse  (Bash) -> ~/.claude/hooks/track-crm-org.sh\n'
  printf 'Without it the statusline still works, falling back to the env default.\n'
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

run mkdir -p "$HOME/.config"
run mkdir -p "$HOME/.local/bin"
run mkdir -p "$HOME/.codex"
run mkdir -p "$HOME/.claude/commands"

if [[ "$mode" == "link" ]]; then
  link_path "$root_dir/wezterm/.wezterm.lua" "$HOME/.wezterm.lua"
  link_path "$root_dir/wezterm" "$HOME/.config/wezterm"
  link_path "$root_dir/tmux/tmux.conf" "$HOME/.tmux.conf"
  link_path "$root_dir/tmux/tmux-llm-status" "$HOME/.local/bin/tmux-llm-status"
  link_path "$root_dir/nvim" "$HOME/.config/nvim"
  link_path "$root_dir/codex/config.toml" "$HOME/.codex/config.toml"
  link_path "$root_dir/codex/AGENTS.md" "$HOME/.codex/AGENTS.md"
  link_path "$root_dir/codex/agents" "$HOME/.codex/agents"
  link_path "$root_dir/codex/bin/codex-role" "$HOME/.local/bin/codex-role"
  link_path "$root_dir/bin/session-objective" "$HOME/.local/bin/session-objective"
  link_path "$root_dir/bin/sf-org-resolve" "$HOME/.local/bin/sf-org-resolve"
  link_path "$root_dir/bin/sf-lease" "$HOME/.local/bin/sf-lease"
  link_path "$root_dir/claude/statusline.sh" "$HOME/.claude/statusline.sh"
  link_path "$root_dir/claude/commands/objective.md" "$HOME/.claude/commands/objective.md"
  link_path "$root_dir/claude/hooks/track-crm-org.sh" "$HOME/.claude/hooks/track-crm-org.sh"
  link_path "$root_dir/claude/hooks/sf-lease-guard.sh" "$HOME/.claude/hooks/sf-lease-guard.sh"
  link_path "$root_dir/claude/hooks/sf-lease-post.sh" "$HOME/.claude/hooks/sf-lease-post.sh"
  link_path "$root_dir/claude/hooks/sf-lease-end.sh" "$HOME/.claude/hooks/sf-lease-end.sh"
  link_path "$root_dir/claude/hooks/sf-lease-table.sh" "$HOME/.claude/hooks/sf-lease-table.sh"
  link_path "$root_dir/claude/hooks/tmux-agent-depth.sh" "$HOME/.claude/hooks/tmux-agent-depth.sh"
  for profile in "$root_dir"/codex/profiles/*.config.toml; do
    link_path "$profile" "$HOME/.codex/$(basename "$profile")"
  done

  printf '\nLinked WezTerm, tmux, Neovim, Codex, and Claude Code config for local editing.\n'
  print_hooks_notice
  printf 'Edit files in %s and reload WezTerm with Cmd-r if needed.\n' "$root_dir"
  printf 'Reload tmux with: Ctrl-a r\n'
  fetch_backgrounds "$root_dir/wezterm/assets/backgrounds"
  exit 0
fi

prepare_copy_dir "$HOME/.config/wezterm"
prepare_copy_dir "$HOME/.config/wezterm/modules"
prepare_copy_dir "$HOME/.config/wezterm/assets"
prepare_copy_dir "$HOME/.codex/agents"

install_file "$root_dir/wezterm/.wezterm.lua" "$HOME/.wezterm.lua"
install_file "$root_dir/wezterm/wezterm.lua" "$HOME/.config/wezterm/wezterm.lua"

for module in "$root_dir"/wezterm/modules/*.lua; do
  install_file "$module" "$HOME/.config/wezterm/modules/$(basename "$module")"
done

while IFS= read -r asset; do
  relative_asset="${asset#"$root_dir"/wezterm/assets/}"
  target_asset="$HOME/.config/wezterm/assets/$relative_asset"
  install_file "$asset" "$target_asset"
done < <(find "$root_dir/wezterm/assets" -type f ! -name '.DS_Store' | sort)

install_file "$root_dir/tmux/tmux.conf" "$HOME/.tmux.conf"
install_file "$root_dir/tmux/tmux-llm-status" "$HOME/.local/bin/tmux-llm-status" 0755
install_file "$root_dir/codex/config.toml" "$HOME/.codex/config.toml" 0600
install_file "$root_dir/codex/AGENTS.md" "$HOME/.codex/AGENTS.md"
install_file "$root_dir/codex/bin/codex-role" "$HOME/.local/bin/codex-role" 0755
install_file "$root_dir/bin/session-objective" "$HOME/.local/bin/session-objective" 0755
install_file "$root_dir/bin/sf-org-resolve" "$HOME/.local/bin/sf-org-resolve" 0755
install_file "$root_dir/bin/sf-lease" "$HOME/.local/bin/sf-lease" 0755
install_file "$root_dir/claude/statusline.sh" "$HOME/.claude/statusline.sh" 0755
install_file "$root_dir/claude/commands/objective.md" "$HOME/.claude/commands/objective.md"
install_file "$root_dir/claude/hooks/track-crm-org.sh" "$HOME/.claude/hooks/track-crm-org.sh" 0755
install_file "$root_dir/claude/hooks/sf-lease-guard.sh" "$HOME/.claude/hooks/sf-lease-guard.sh" 0755
install_file "$root_dir/claude/hooks/sf-lease-post.sh" "$HOME/.claude/hooks/sf-lease-post.sh" 0755
install_file "$root_dir/claude/hooks/sf-lease-end.sh" "$HOME/.claude/hooks/sf-lease-end.sh" 0755
install_file "$root_dir/claude/hooks/sf-lease-table.sh" "$HOME/.claude/hooks/sf-lease-table.sh" 0755
install_file "$root_dir/claude/hooks/tmux-agent-depth.sh" "$HOME/.claude/hooks/tmux-agent-depth.sh" 0755

for agent in "$root_dir"/codex/agents/*.toml; do
  install_file "$agent" "$HOME/.codex/agents/$(basename "$agent")"
done

for profile in "$root_dir"/codex/profiles/*.config.toml; do
  install_file "$profile" "$HOME/.codex/$(basename "$profile")" 0600
done

prepare_copy_dir "$HOME/.config/nvim"
run cp -R "$root_dir/nvim/." "$HOME/.config/nvim/"
printf 'Installed %s\n' "$HOME/.config/nvim"

fetch_backgrounds "$HOME/.config/wezterm/assets/backgrounds"

printf '\nInstalled WezTerm, tmux, Neovim, Codex, and Claude Code config for macOS.\n'
print_hooks_notice
printf 'Reload WezTerm, then reload tmux with: Ctrl-a r\n'
