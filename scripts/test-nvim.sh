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

# 1. Install plugins headlessly (network: clones from GitHub).
nvim --headless "+Lazy! sync" +qa >/dev/null 2>&1 || true

# 2. Compile and install every parser the config declares, synchronously. Doing
#    this up front (blocking via :wait) means the treesitter config's own
#    install() in step 3 finds them already present and spawns no async build
#    jobs, so nothing races the cleanup trap and the run is deterministic.
#    NVIM_TEST_SKIP_TS_INSTALL disables the config's own install() for this one
#    invocation, so this explicit call is the only installer running (no race).
#    Keep the parser list in sync with nvim/lua/plugins/treesitter.lua.
NVIM_TEST_SKIP_TS_INSTALL=1 nvim --headless \
  "+lua require('nvim-treesitter').install({'lua','bash','json','yaml','markdown','markdown_inline','gitcommit','diff','vim','query'}):wait(600000)" \
  +qa >/dev/null 2>&1 || true

# 3. Force-load every lazy plugin (so event/cmd/keys-gated configs run), then
#    open a markdown file with a fenced code block and force a full parse
#    including injections - the exact path that regressed on newer Neovim, and
#    what render-markdown relies on. Fail on any error output; a clean config is
#    silent. The parse is intentionally NOT wrapped in pcall so a regression
#    surfaces as an error the grep catches.
probe_md="$work/probe.md"
# Literal markdown; the backticks are intentional content, not command substitution.
# shellcheck disable=SC2016
printf '# Probe\n\ntext with **bold**\n\n```lua\nlocal x = 1\n```\n' >"$probe_md"
out="$(nvim --headless \
  +'Lazy! load all' \
  +"edit $probe_md" \
  +"lua vim.treesitter.get_parser(0, 'markdown'):parse(true)" \
  +"edit $XDG_CONFIG_HOME/nvim/init.lua" \
  +qa 2>&1 >/dev/null)" || true
if grep -qiE 'error|E[0-9]+:|stack traceback' <<< "$out"; then
  echo "test-nvim: startup produced errors:" >&2
  printf '%s\n' "$out" >&2
  exit 1
fi

echo "nvim config loads clean"
