#!/usr/bin/env bash
set -euo pipefail

# Headless-load check for the Neovim config: install locked plugins and treesitter
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
cp "$repo_root/nvim/lazy-lock.json" "$work/expected-lock.json"

# Every phase runs through the same Lua guard: command-line Lua errors can
# otherwise print a message and still let a later +qa exit successfully.
export NVIM_TEST_SCRIPT="$work/phase.lua"
export NVIM_TEST_PROBE="$work/probe.md"
cat >"$NVIM_TEST_SCRIPT" <<'LUA'
local ok, err = xpcall(function()
  local config_dir = vim.env.XDG_CONFIG_HOME .. '/nvim'
  local lock = vim.json.decode(table.concat(vim.fn.readfile(config_dir .. '/lazy-lock.json'), '\n'))
  local function locked_commit(name)
    local entry = lock[name]
    assert(type(entry) == 'table' and type(entry.commit) == 'string'
      and #entry.commit == 40 and entry.commit:match('^%x+$'), 'Missing/invalid lock entry: ' .. name)
    return entry.commit
  end
  local function git(args)
    local output = vim.fn.system(args)
    assert(vim.v.shell_error == 0, 'Git failed: ' .. table.concat(args, ' ') .. '\n' .. output)
    return vim.trim(output)
  end
  -- Bootstrap the manager at its lock entry before any config/plugin code runs.
  local lazy_dir = vim.env.XDG_DATA_HOME .. '/nvim/lazy/lazy.nvim'
  local lazy_commit = locked_commit('lazy.nvim')
  if vim.fn.isdirectory(lazy_dir) == 0 then
    git({ 'git', 'clone', '--filter=blob:none', '--no-checkout',
      'https://github.com/folke/lazy.nvim.git', lazy_dir })
    git({ 'git', '-C', lazy_dir, 'checkout', '--detach', lazy_commit })
  end
  assert(git({ 'git', '-C', lazy_dir, 'rev-parse', 'HEAD' }) == lazy_commit,
    'Locked revision mismatch: lazy.nvim')
  vim.opt.rtp:prepend(config_dir)
  vim.opt.rtp:prepend(lazy_dir)
  -- lazy.nvim writes its lock after install/restore. This isolated verification
  -- must only consume the shipped lock, including during automatic first install.
  require('lazy.manage.lock').update = function() end
  -- -u NONE prevents automatic startup; allow lazy.nvim to own plugin loading.
  vim.go.loadplugins = true
  vim.cmd.source(vim.fn.fnameescape(config_dir .. '/init.lua'))

  local phase = vim.env.NVIM_TEST_PHASE
  if phase == 'plugin install' then
    vim.cmd('Lazy! restore')
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
    vim.cmd.edit(vim.fn.fnameescape(config_dir .. '/init.lua'))
    vim.treesitter.get_parser(0, 'lua'):parse(true)
  else
    error('Unknown test phase')
  end
  -- Check every configured plugin and every lock entry: missing plugins, missing
  -- pins, and successful commands that checked out the wrong revision all fail.
  local plugins = require('lazy.core.config').plugins
  for name in pairs(plugins) do locked_commit(name) end
  for name in pairs(lock) do
    local plugin = assert(plugins[name], 'Locked plugin missing from config: ' .. name)
    assert(git({ 'git', '-C', plugin.dir, 'rev-parse', 'HEAD' }) == locked_commit(name),
      'Locked revision mismatch: ' .. name)
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
  NVIM_TEST_PHASE="$phase" nvim --headless -u NONE \
    '+lua dofile(vim.env.NVIM_TEST_SCRIPT)' +qa >"$work/output" 2>&1 || status=$?
  if (( status != 0 )) || grep -qiE '(^|[[:space:]])E[0-9]+:|^Error detected|^stack traceback:' "$work/output"; then
    echo "test-nvim: $phase failed (exit $status)" >&2
    cat "$work/output" >&2
    exit 1
  fi
  if ! cmp -s "$work/expected-lock.json" "$XDG_CONFIG_HOME/nvim/lazy-lock.json" ||
      ! cmp -s "$work/expected-lock.json" "$repo_root/nvim/lazy-lock.json"; then
    echo "test-nvim: $phase failed: lockfile changed" >&2
    exit 1
  fi
}

# 1. Install/restore locked plugins headlessly (network: clones from GitHub).
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
