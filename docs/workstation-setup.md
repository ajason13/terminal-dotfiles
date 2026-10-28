# macOS workstation dependencies

For Windows, use the separate [Windows 10/11 + WSL 2 guide](windows-setup.md).

Start in the repository root. Install Apple's Command Line Tools (`xcode-select
--install`) and [Homebrew](https://brew.sh/) first, following its printed shell
setup instructions so `brew` is on `PATH`. The Command Line Tools supply Git and
a C compiler for Neovim's parser builds; macOS supplies Bash, curl and AppleScript.

## Core terminal and editor

The root [Brewfile](../Brewfile) selects the packages used by the shipped core
configuration:

| Dependency | Used for |
| --- | --- |
| `tmux` | Sessions, panes and the agent table |
| `neovim` | Terminal editing |
| `tree-sitter-cli` | Compiling the configured Neovim syntax parsers |
| `ripgrep` (`rg`) | Neovim Telescope live grep |
| `jq` | Agent activity hooks, status line and JSON helpers |
| WezTerm | Terminal application |
| Visual Studio Code | Registered `vscode://file` links |

Use current stable Homebrew releases for these tools. The manifest is a package
inventory, not a lockfile: it does not pin versions or reproduce exact binaries.
The optional dashboard exporter specifically targets tmux 3.7; see its
[collector constraints](../dashboard/README.md#export-a-one-shot-snapshot-optional).

Check the manifest without installing anything:

```sh
brew bundle list --all --file=Brewfile
brew bundle check --no-upgrade --verbose --file=Brewfile
```

The check exits zero when every entry is installed and nonzero with unmet
Homebrew entries otherwise (a tool installed by another manager can still be
reported as missing). `--no-upgrade` accepts installed versions even when newer
ones exist; it does not certify the runtime versions or integrations below.
After reviewing the list, explicitly install missing core dependencies:

```sh
brew bundle install --no-upgrade --file=Brewfile
```

This can download packages and dependencies. It skips upgrades of already
installed entries; update individual tools explicitly when needed. Bundle
semantics are described in the [Homebrew Bundle guide](https://docs.brew.sh/Brew-Bundle-and-Brewfile).
Do not use `brew bundle cleanup` for this manifest: your other workstation tools
are intentionally outside its scope.

Open VS Code once to register its URL handler. If you also want `code` in your
shell, use **Shell Command: Install 'code' command in PATH** in its command
palette. Fonts are optional; see the root [requirements](../README.md#requirements).
Neovim downloads plugins and compiles parsers on first launch, which requires
network access. See the [Neovim guide](../nvim/README.md).

## Optional integrations and verification

These are required only for the named workflow. They are deliberately absent
from the core Brewfile; install only what you use.

| Workflow | Additional requirements and setup |
| --- | --- |
| Claude activity/status hooks | Claude Code installed and signed in separately; core `jq` is required. Manually [register the hooks](../README.md#registering-the-hooks) and [status line](../README.md#claude-code-settings-manual-step). |
| Codex helpers | Codex CLI installed and signed in separately. `codex-budget` requires Node 22+ (`brew install node`, or an existing Node version manager); check `node --version`. See [budget usage](codex-budget.md) and [opt-in session recovery](codex-restore.md). |
| GitHub SDLC delivery | GitHub CLI (`brew install gh`), separately authenticated with the repository access you need. CLI installation does not establish model availability, account access or allowance. |
| Neovim Git UI shortcut | `brew install lazygit` for `<leader>gg`; other editing features do not require it. |
| Dashboard preview/browser tests | Node 22+ with npm and Python 3 (`brew install node python` if absent). Run the locked npm install and Chromium setup from the [dashboard guide](../dashboard/README.md#verify); Python runs its local preview server. |
| Repository shell/Lua checks | `brew install shellcheck lua`; Bash syntax checks use macOS Bash. CI uses Lua 5.4; the harness also accepts `lua` or LuaJIT. Neovim verification also uses the core editor, Git, tree-sitter CLI and C compiler, plus network access. |
| Salesforce leases | Explicit opt-in, manual hooks and identity mapping in [Salesforce Org Leases](../README.md#salesforce-org-leases). Installing packages does not enable leases or configure Salesforce credentials. |

For local shell and Lua verification, run from the repository root:

```sh
bash scripts/check-shell.sh
bash scripts/check-shell.sh --lint
bash scripts/test-install-macos.sh
./scripts/test-backgrounds-lua.sh
./scripts/test-links-lua.sh
```

Other optional shell enhancements, fonts, session persistence plugins and utility
recommendations stay in the root [optional setup](../README.md#recommended-tools)
sections. They are not needed to satisfy `brew bundle check`.

## Install the dotfiles separately

Return to the root [installation guide](../README.md#install-on-a-mac) for copy,
link, preview and uninstall commands. `install-macos.sh` manages files only:
normal and dry-run modes do not invoke Bundle, install packages or sign in to
services. Claude hook registration and all integration opt-ins remain manual.
