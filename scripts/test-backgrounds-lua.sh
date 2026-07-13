#!/usr/bin/env bash
set -euo pipefail

# Runs the pure-Lua unit tests for wezterm/modules/backgrounds.lua. Uses any
# available standalone Lua interpreter; WezTerm is not required because the
# functions under test never touch it.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_file="$repo_root/wezterm/modules/backgrounds_test.lua"

lua_bin=""
for candidate in lua5.4 lua5.3 lua luajit; do
  if command -v "$candidate" >/dev/null 2>&1; then
    lua_bin="$candidate"
    break
  fi
done

if [[ -z "$lua_bin" ]]; then
  echo "test-backgrounds-lua: no Lua interpreter found (tried lua5.4, lua5.3, lua, luajit)" >&2
  echo "install one, e.g. 'brew install lua' (macOS) or 'apt-get install lua5.4' (Debian/Ubuntu)" >&2
  exit 1
fi

exec "$lua_bin" "$test_file"
