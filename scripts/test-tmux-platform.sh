#!/usr/bin/env bash
set -euo pipefail

# Real tmux parsing and platform branches on private sockets, never live sessions.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmux_bin="$(command -v tmux)"
fixture="$(mktemp -d /tmp/tmux-platform-XXXXXX)"
cleanup() {
  "$tmux_bin" -S "$fixture/socket" kill-server 2>/dev/null || true
  rm -rf "$fixture"
}
trap cleanup EXIT
mkdir -p "$fixture/bin"
# Expand the platform variable when the stub runs, not when it is written.
# shellcheck disable=SC2016
printf '#!/bin/sh\nprintf "%%s\\n" "$TEST_PLATFORM"\n' > "$fixture/bin/uname"
printf '#!/bin/sh\nexit 0\n' > "$fixture/status"
chmod +x "$fixture/bin/uname" "$fixture/status"
# Redirect all home paths before loading, including attach hooks and overrides.
# Pin the OS stub: the Darwin branch deliberately replaces the server PATH.
sed -e "s|~/.local/bin/tmux-llm-status|$fixture/status|g" \
    -e "s|~/.tmux.local.conf|$fixture/local.conf|g" \
    -e "s|~/.tmux.conf|$fixture/tmux.conf|g" \
    -e "s|uname -s|$fixture/bin/uname -s|g" \
    "$repo_root/tmux/tmux.conf" > "$fixture/tmux.conf"

t() { "$tmux_bin" -S "$fixture/socket" "$@"; }
for platform in Linux Darwin; do
  TEST_PLATFORM="$platform" PATH="$fixture/bin:$PATH" \
    "$tmux_bin" -S "$fixture/socket" -f /dev/null new-session -d -s test
  original_path="$(t show-environment -g PATH)"
  t source-file "$fixture/tmux.conf"
  binding="$(t list-keys -T prefix P)"
  case "$platform" in
    Linux)
      [[ "$(t show-environment -g PATH)" == "$original_path" ]]
      [[ "$binding" == *'load-buffer -w -t'* && "$binding" != *pbcopy* ]]
      ;;
    Darwin)
      [[ "$(t show-environment -g PATH)" == 'PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin' ]]
      [[ "$binding" == *pbcopy* && "$binding" != *load-buffer* ]]
      ;;
  esac
  # Formats must survive config load and expand against the triggering client.
  [[ "$binding" == *'#{pane_id}'* ]]
  t show-options -s terminal-features | grep -q clipboard
  t kill-server
  echo "ok - $platform tmux config, PATH and clipboard binding"
done
