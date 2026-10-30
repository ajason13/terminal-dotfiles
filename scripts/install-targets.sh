#!/usr/bin/env bash
# Shared inventory: kind|repository source|home-relative target|file mode.
# Directories are backed up/restored as units; skills back up outside discovery.
install_targets() {
  local root="$1" entry name
  cat <<'TARGETS'
file|wezterm/.wezterm.lua|.wezterm.lua|0644
tree|wezterm|.config/wezterm|0644
file|tmux/tmux.conf|.tmux.conf|0644
file|tmux/tmux-llm-status|.local/bin/tmux-llm-status|0755
tree|nvim|.config/nvim|0644
file|codex/config.toml|.codex/config.toml|0600
file|codex/AGENTS.md|.codex/AGENTS.md|0644
tree|codex/agents|.codex/agents|0644
file|codex/bin/codex-role|.local/bin/codex-role|0755
file|codex/bin/codex-budget.mjs|.local/bin/codex-budget|0755
file|bin/tmux-agent-observation|.local/bin/tmux-agent-observation|0755
file|bin/dotfiles-doctor|.local/bin/dotfiles-doctor|0755
file|bin/codex-restore|.local/bin/codex-restore|0755
file|bin/sf-org-resolve|.local/bin/sf-org-resolve|0755
file|bin/sf-lease|.local/bin/sf-lease|0755
file|bin/tmux-agent-resume|.local/bin/tmux-agent-resume|0755
file|bin/tmux-session-to-end|.local/bin/tmux-session-to-end|0755
file|claude/statusline.sh|.claude/statusline.sh|0755
file|claude/hooks/sf-lease-guard.sh|.claude/hooks/sf-lease-guard.sh|0755
file|claude/hooks/sf-lease-post.sh|.claude/hooks/sf-lease-post.sh|0755
file|claude/hooks/sf-lease-end.sh|.claude/hooks/sf-lease-end.sh|0755
file|claude/hooks/sf-lease-table.sh|.claude/hooks/sf-lease-table.sh|0755
file|claude/hooks/sf-lease-common.sh|.claude/hooks/sf-lease-common.sh|0644
file|claude/hooks/tmux-agent-depth.sh|.claude/hooks/tmux-agent-depth.sh|0755
TARGETS
  for entry in "$root"/codex/profiles/*.config.toml; do
    [[ -f "$entry" ]] || continue
    name="$(basename "$entry")"
    printf 'file|codex/profiles/%s|.codex/%s|0600\n' "$name" "$name"
  done
  while IFS= read -r name; do
    # Skills are direct children only. Never accept paths from the receipt.
    [[ "$name" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]] || continue
    printf 'skill|codex/skills/%s|.codex/skills/%s|0644\n' "$name" "$name"
  done < <( {
    for entry in "$root"/codex/skills/*; do
      [[ -f "$entry/SKILL.md" ]] && basename "$entry"
    done
    if [[ -n "${2:-}" && -f "$2/.local/state/terminal-dotfiles/skills" ]]; then
      cat "$2/.local/state/terminal-dotfiles/skills"
    fi
  } | LC_ALL=C sort -u)

}
