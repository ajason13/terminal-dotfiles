# Repository layout and verification

[Back to setup and keybindings](../README.md). Commands below run from the
repository root unless a block names another location.

## Layout

```text
.
├── LICENSE
├── README.md
├── bin
│   ├── codex-restore
│   ├── sf-lease
│   ├── sf-org-resolve
│   ├── tmux-agent-resume
│   └── tmux-session-to-end
├── claude
│   ├── hooks
│   │   ├── sf-lease-end.sh
│   │   ├── sf-lease-guard.sh
│   │   ├── sf-lease-post.sh
│   │   ├── sf-lease-table.sh
│   │   └── tmux-agent-depth.sh
│   └── statusline.sh
├── codex
│   ├── AGENTS.md
│   ├── agents
│   ├── bin
│   │   └── codex-role
│   ├── config.toml
│   └── profiles
├── install-macos.sh
├── nvim
│   ├── init.lua
│   ├── lazy-lock.json
│   └── lua
│       ├── config
│       │   ├── keymaps.lua
│       │   └── options.lua
│       └── plugins
│           ├── editing.lua
│           ├── git.lua
│           ├── oil.lua
│           ├── telescope.lua
│           ├── treesitter.lua
│           ├── ui.lua
│           └── which-key.lua
├── scripts
│   ├── check-background-assets.sh
│   └── check-background-inbox.sh
├── tmux
│   ├── tmux.conf
│   ├── tmux.local.conf.example
│   └── tmux-llm-status
├── uninstall-macos.sh
└── wezterm
    ├── .wezterm.lua
    ├── wezterm.lua
    ├── local.lua.example
    ├── modules
    │   ├── appearance.lua
    │   ├── backgrounds.lua
    │   ├── background_manifests
    │   │   ├── anime.lua
    │   │   ├── general.lua
    │   │   └── vehicles.lua
    │   ├── general.lua
    │   ├── links.lua
    │   └── macos.lua
    └── assets
        ├── backgrounds
        │   ├── 000-general
        │   ├── 100-vehicles
        │   └── 200-anime
        └── inbox
            └── _sample
```

## Verification

From the repository root:

```sh
bash scripts/check-shell.sh
bash scripts/check-shell.sh --lint
bash scripts/test-check-shell.sh
bash scripts/test-install-macos.sh
bash scripts/test-import-background-inbox.sh
bash scripts/test-sf-lease-hooks.sh
bash scripts/test-sf-lease-liveness.sh
bash scripts/test-sf-lease-process.sh
python3 scripts/test-tmux-agent-observation.py
python3 scripts/test-tmux-observation-integration.py
```

Syntax checking visits each shell file individually, including extensionless
Bash tools. ShellCheck must be installed for `--lint`. The installer suite uses
a temporary fixture checkout and `DOTFILES_TARGET_HOME` to test copy/link,
backups, restore, dry runs, and symlink handling without changing your home.
That variable can also select a staging home for manual installer checks.
Lease suites run on macOS in CI because they exercise BSD filesystem tools.
See [dashboard verification](../dashboard/README.md) for Node and browser checks.
