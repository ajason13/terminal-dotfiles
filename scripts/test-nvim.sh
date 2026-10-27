#!/usr/bin/env bash
set -euo pipefail

# Headless-load check for the Neovim config: install plugins and treesitter
# parsers, then open representative buffers and confirm the config loads and
# parses with no Lua/startup errors. The Neovim analog of the WezTerm `ls-fonts`
# check. Runs against an isolated copy of the repo's nvim/ so it never touches
# the user's live config or the committed lazy-lock.json.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v nvim >/dev/null 2>&1; then
  echo "test-nvim: neovim not found (brew install neovim)" >&2
  exit 1
fi
if ! command -v tree-sitter >/dev/null 2>&1; then
  echo "test-nvim: tree-sitter CLI not found (brew install tree-sitter-cli)" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
export XDG_CONFIG_HOME="$work/config"
export XDG_DATA_HOME="$work/data"
export XDG_STATE_HOME="$work/state"
export XDG_CACHE_HOME="$work/cache"
mkdir -p "$XDG_CONFIG_HOME"
cp -R "$repo_root/nvim" "$XDG_CONFIG_HOME/nvim"

# Every phase runs through the same Lua guard: command-line Lua errors can
# otherwise print a message and still let a later +qa exit successfully.
export NVIM_TEST_SCRIPT="$work/phase.lua"
export NVIM_TEST_PROBE="$work/probe.md"
cat >"$NVIM_TEST_SCRIPT" <<'LUA'
local ok, err = xpcall(function()
  local phase = vim.env.NVIM_TEST_PHASE
  if phase == 'plugin install' then
    vim.cmd('Lazy! sync')
    for name, plugin in pairs(require('lazy.core.config').plugins) do
      for _, task in ipairs(plugin._.tasks or {}) do
        assert(not task:has_errors(), 'Plugin task failed: ' .. name)
      end
    end
  elseif phase == 'parser install' then
    -- Keep the list in sync with nvim/lua/plugins/treesitter.lua.
    local languages = {
      'lua', 'bash', 'json', 'yaml', 'markdown', 'markdown_inline',
      'gitcommit', 'diff', 'vim', 'query',
    }
    local ts = require('nvim-treesitter')
    assert(ts.install(languages):wait(600000) ~= false, 'Parser installation failed')
    local installed = ts.get_installed('parsers')
    for _, lang in ipairs(languages) do
      assert(vim.list_contains(installed, lang), 'Parser missing: ' .. lang)
      vim.treesitter.language.add(lang)
    end
  elseif phase == 'config probe' then
    vim.cmd('Lazy! load all')
    vim.cmd.edit(vim.fn.fnameescape(vim.env.NVIM_TEST_PROBE))
    vim.treesitter.get_parser(0, 'markdown'):parse(true)
    vim.cmd.edit(vim.fn.fnameescape(vim.env.XDG_CONFIG_HOME .. '/nvim/init.lua'))
  else
    error('Unknown test phase')
  end
  assert(vim.v.errmsg == '', vim.v.errmsg)
end, debug.traceback)
if not ok then
  vim.api.nvim_err_writeln(err)
  vim.cmd('cquit 1')
end
LUA

run_phase() {
  local phase="$1" status=0
  NVIM_TEST_PHASE="$phase" nvim --headless \
    '+lua dofile(vim.env.NVIM_TEST_SCRIPT)' +qa >"$work/output" 2>&1 || status=$?
  if (( status != 0 )) || grep -qiE '(^|[[:space:]])E[0-9]+:|^Error detected|^stack traceback:' "$work/output"; then
    echo "test-nvim: $phase failed (exit $status)" >&2
    cat "$work/output" >&2
    exit 1
  fi
}

# 1. Install plugins headlessly (network: clones from GitHub).
NVIM_TEST_SKIP_TS_INSTALL=1 run_phase 'plugin install'

# 2. Compile all declared parsers synchronously, without a second asynchronous
# installer from the config racing this phase or the cleanup trap.
NVIM_TEST_SKIP_TS_INSTALL=1 run_phase 'parser install'

# 3. Force-load lazy plugins and parse markdown including fenced Lua injections.
# Literal markdown; the backticks are intentional content, not command substitution.
# shellcheck disable=SC2016
printf '# Probe\n\ntext with **bold**\n\n```lua\nlocal x = 1\n```\n' >"$NVIM_TEST_PROBE"
run_phase 'config probe'

echo "nvim config loads clean"
