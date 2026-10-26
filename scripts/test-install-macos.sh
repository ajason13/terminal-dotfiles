#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
task_tmp="$(mktemp -d)"
trap 'rm -rf "$task_tmp"' EXIT
fixture="$task_tmp/repo"
mkdir -p "$fixture/scripts" "$fixture/codex/profiles" "$fixture/codex/skills/example"
cp "$repo_root/install-macos.sh" "$repo_root/uninstall-macos.sh" "$fixture/"
cp "$repo_root/scripts/install-targets.sh" "$fixture/scripts/"
# Build only the inputs needed by the inventory, without real local wallpapers.
# shellcheck source=scripts/install-targets.sh
source "$fixture/scripts/install-targets.sh"
while IFS='|' read -r kind relative_source _ _; do
  source_path="$fixture/$relative_source"
  if [[ "$kind" == tree || "$kind" == skill ]]; then
    mkdir -p "$source_path"
    printf 'managed\n' > "$source_path/managed.txt"
  else
    mkdir -p "$(dirname "$source_path")"
    printf 'managed\n' > "$source_path"
  fi
done < <(install_targets "$fixture")
printf 'skill\n' > "$fixture/codex/skills/example/SKILL.md"
printf 'profile\n' > "$fixture/codex/profiles/example.config.toml"
mkdir -p "$fixture/wezterm/modules"
cp -R "$repo_root/wezterm/modules/background_manifests" "$fixture/wezterm/modules/"

check() { [[ "$1" == "$2" ]] || { printf 'FAIL: %s (got %s)\n' "$3" "$2" >&2; exit 1; }; }
directory_mode() {
  if [[ "$(uname -s)" == Darwin ]]; then stat -f %Lp "$1"; else stat -c %a "$1"; fi
}
run_install() { DOTFILES_TARGET_HOME="$1" bash "$fixture/install-macos.sh" --skip-backgrounds "${@:2}" >/dev/null; }
run_uninstall() { DOTFILES_TARGET_HOME="$1" bash "$fixture/uninstall-macos.sh" "${@:2}" >/dev/null; }
for mode in copy link; do
  target_home="$task_tmp/$mode"
  mkdir -p "$target_home/.config/nvim" "$target_home/.config/wezterm" "$target_home/.codex/skills/example" "$target_home/.codex/skills/unrelated"
  chmod 700 "$target_home/.config/nvim"
  printf 'old-nvim\n' > "$target_home/.config/nvim/managed.txt"
  printf 'old-wezterm\n' > "$target_home/.config/wezterm/managed.txt"
  printf 'local override\n' > "$target_home/.config/wezterm/local.lua"
  printf 'old-skill\n' > "$target_home/.codex/skills/example/SKILL.md"
  printf 'unrelated\n' > "$target_home/.codex/skills/unrelated/SKILL.md"
  # Dry runs must leave both files and directory structure untouched.
  before="$(find "$target_home" -print | sort)"
  run_install "$target_home" "--$mode" --dry-run
  check "$before" "$(find "$target_home" -print | sort)" 'dry run changed paths'
  check old-nvim "$(cat "$target_home/.config/nvim/managed.txt")" 'dry run changed content'
  run_install "$target_home" "--$mode"
  check managed "$(cat "$target_home/.config/nvim/managed.txt")" 'nvim not installed'
  for manifest in general vehicles anime; do
    test -f "$target_home/.config/wezterm/modules/background_manifests/$manifest.lua"
  done
  test -f "$target_home/.codex/skills/unrelated/SKILL.md"
  if [[ "$mode" == copy ]]; then
    check 'local override' "$(cat "$target_home/.config/wezterm/local.lua")" 'local override not carried forward'
    test ! -L "$target_home/.config/nvim"
    check 700 "$(directory_mode "$target_home/.config/nvim")" 'copy widened directory permissions'
  else
    test -L "$target_home/.config/nvim"
  fi
  # Unchanged installs preserve the original backup even with local-only files.
  run_install "$target_home" "--$mode"
  run_uninstall "$target_home" --dry-run
  check managed "$(cat "$target_home/.config/nvim/managed.txt")" 'uninstall dry run changed content'
  run_uninstall "$target_home" --restore-latest
  check old-nvim "$(cat "$target_home/.config/nvim/managed.txt")" 'nvim not restored'
  check 700 "$(directory_mode "$target_home/.config/nvim")" 'restore lost directory permissions'
  check old-wezterm "$(cat "$target_home/.config/wezterm/managed.txt")" 'wezterm not restored'
  check old-skill "$(cat "$target_home/.codex/skills/example/SKILL.md")" 'skill not restored'
  test -f "$target_home/.codex/skills/unrelated/SKILL.md"
  test ! -e "$target_home/.codex/example.config.toml"
done
# Copying over an existing nested symlink must never overwrite its referent.
target_home="$task_tmp/symlink"
mkdir -p "$target_home/.config/nvim"
printf 'external\n' > "$task_tmp/external"
ln -s "$task_tmp/external" "$target_home/.config/nvim/managed.txt"
run_install "$target_home"
check external "$(cat "$task_tmp/external")" 'copy followed a destination symlink'
run_uninstall "$target_home" --remove-only
test ! -e "$target_home/.config/nvim"
test ! -e "$target_home/.codex/skills/example"
# A repeated link install is idempotent and preserves the original backup.
target_home="$task_tmp/repeat"
mkdir -p "$target_home/.config/nvim"
printf 'original\n' > "$target_home/.config/nvim/managed.txt"
run_install "$target_home" --link
run_install "$target_home" --link
run_uninstall "$target_home"
check original "$(cat "$target_home/.config/nvim/managed.txt")" 'repeat link install lost original backup'
# An uninstall without an install must not remove a personal namesake skill.
target_home="$task_tmp/personal"
mkdir -p "$target_home/.codex/skills/example"
printf 'personal\n' > "$target_home/.codex/skills/example/SKILL.md"
mkdir -p "$target_home/.local/state/terminal-dotfiles"
printf '../outside\n../../outside\n' > "$target_home/.local/state/terminal-dotfiles/skills"
printf 'keep\n' > "$target_home/outside"
run_uninstall "$target_home"
check keep "$(cat "$target_home/outside")" 'receipt escaped the skill directory'
check personal "$(cat "$target_home/.codex/skills/example/SKILL.md")" 'uninstall removed an unmanaged skill'

# A skill removed from the checkout remains uninstallable via its receipt.
target_home="$task_tmp/retired-skill"
run_install "$target_home" --link
mv "$fixture/codex/skills/example" "$fixture/retired-example"
run_uninstall "$target_home"
test ! -e "$target_home/.codex/skills/example"
test ! -L "$target_home/.codex/skills/example"

echo 'Install/uninstall preserve and restore configurations in copy and link modes'
