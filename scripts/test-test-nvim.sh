#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
harness="${1:-$repo_root/scripts/test-nvim.sh}"
real_nvim="$(command -v nvim)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/bin"
export NVIM_FIXTURE_WORK="$work" NVIM_FIXTURE_REAL="$real_nvim"
cat >"$work/bin/tree-sitter" <<'STUB'
#!/usr/bin/env bash
exit 0
STUB
cat >"$work/bin/nvim" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
count=0
[[ ! -f "$NVIM_FIXTURE_WORK/count" ]] || read -r count <"$NVIM_FIXTURE_WORK/count"
count=$((count + 1))
printf '%s\n' "$count" >"$NVIM_FIXTURE_WORK/count"
[[ "$count" == "$NVIM_FIXTURE_PHASE" ]] || exit 0
case "$NVIM_FIXTURE_MODE" in
  silent) exit 42 ;;
  stdout) echo 'E123: fixture failure'; exit 0 ;;
  changelog) echo '[plugin] log | abc123 fix: error handling'; exit 0 ;;
  stderr) echo 'E123: fixture failure' >&2; exit 0 ;;
  lua-*)
    status=0
    "$NVIM_FIXTURE_REAL" --headless -u NONE \
      '+lua dofile(vim.env.NVIM_FIXTURE_WORK .. "/fixture.lua")' \
      '+lua dofile(vim.env.NVIM_TEST_SCRIPT)' +qa || status=$?
    printf '%s\n' "$status" >"$NVIM_FIXTURE_WORK/lua-status"
    exit "$status"
    ;;
esac
STUB
cat >"$work/fixture.lua" <<'LUA'
local mode = vim.env.NVIM_FIXTURE_MODE
local installed = {}
package.preload['lazy.core.config'] = function()
  return { plugins = { fixture = { _ = { tasks = {
    { has_errors = function() return mode == 'lua-plugin-task' end },
  } } } } }
end
package.preload['nvim-treesitter'] = function()
  return {
    install = function(languages)
      installed = languages
      return { wait = function()
        if mode == 'lua-parser-throw' then error('fixture fault') end
        return mode ~= 'lua-parser-false'
      end }
    end,
    get_installed = function()
      return mode == 'lua-parser-missing' and {} or installed
    end,
  }
end
vim.treesitter.language.add = function() end
vim.treesitter.get_parser = function()
  return { parse = function()
    if mode == 'lua-probe-throw' then error('fixture fault') end
  end }
end
-- Keep the real :cquit; skip plugin commands, but actually open probe buffers.
local cmd = vim.cmd
vim.cmd = setmetatable({ edit = cmd.edit }, { __call = function(_, command)
  if command == 'cquit 1' then cmd(command) end
end })
if mode == 'lua-errmsg' then vim.v.errmsg = 'fixture fault' end
LUA
chmod +x "$work/bin/nvim" "$work/bin/tree-sitter"
failed=0
run_case() {
  local mode="$1" phase="$2" expected="$3" label="$4" status=0
  rm -f "$work/count" "$work/lua-status"
  PATH="$work/bin:$PATH" NVIM_FIXTURE_MODE="$mode" NVIM_FIXTURE_PHASE="$phase" \
    bash "$harness" >"$work/output" 2>&1 || status=$?
  if [[ "$expected" == fail ]]; then
    if (( status == 0 )) || ! grep -qF "$label failed" "$work/output" || \
        grep -qF 'nvim config loads clean' "$work/output"; then
      echo "FAIL: $mode / $label accepted or lacked phase diagnostics" >&2
      failed=$((failed + 1))
    elif [[ "$mode" == lua-* ]] && [[ "$(cat "$work/lua-status")" == 0 ]]; then
      echo "FAIL: $mode did not explicitly exit Neovim with failure" >&2
      failed=$((failed + 1))
    fi
  elif (( status != 0 )) || ! grep -qF 'nvim config loads clean' "$work/output"; then
    echo "FAIL: $mode / $label rejected a valid load" >&2
    cat "$work/output" >&2
    failed=$((failed + 1))
  fi
}
for phase in 1 2 3; do
  case "$phase" in
    1) label='plugin install' ;;
    2) label='parser install' ;;
    3) label='config probe' ;;
  esac
  for mode in silent stdout stderr; do run_case "$mode" "$phase" fail "$label"; done
  run_case lua-success "$phase" pass "$label"
done
run_case changelog 1 pass 'plugin install'
run_case success 0 pass 'all phases'
run_case lua-plugin-task 1 fail 'plugin install'
run_case lua-parser-throw 2 fail 'parser install'
run_case lua-parser-false 2 fail 'parser install'
run_case lua-parser-missing 2 fail 'parser install'
run_case lua-probe-throw 3 fail 'config probe'
run_case lua-errmsg 3 fail 'config probe'
(( failed == 0 )) || exit 1
echo 'Neovim harness regression checks passed (20 cases)'
