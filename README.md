# WezTerm + tmux Dotfiles

Portable macOS configuration for a WezTerm + tmux workflow focused on LLM
sessions, fast pane/window management, Quick Select file opening, and rotating
terminal backgrounds.

## What This Includes

- WezTerm starts or attaches to tmux session `main`.
- tmux owns windows and panes; WezTerm tabs are hidden.
- tmux status bar shows aggregate LLM activity markers.
- `Ctrl-a` is the tmux prefix.
- `Ctrl-a \` splits horizontally and `Ctrl-a -` splits vertically.
- `Ctrl-a h/j/k/l` moves between panes.
- `Ctrl-Shift-Space` opens selected paths in VS Code and web targets in the
  browser.
- WezTerm backgrounds rotate every two hours.

## Layout

```text
.
├── LICENSE
├── README.md
├── install-macos.sh
├── uninstall-macos.sh
├── tmux
│   ├── tmux.conf
│   ├── tmux.local.conf.example
│   └── tmux-llm-status
└── wezterm
    ├── .wezterm.lua
    ├── wezterm.lua
    ├── local.lua.example
    ├── modules
    │   ├── appearance.lua
    │   ├── backgrounds.lua
    │   ├── general.lua
    │   ├── links.lua
    │   └── macos.lua
    └── assets/backgrounds
```

## Requirements

Install the core tools:

```sh
brew install tmux
brew install --cask wezterm visual-studio-code
```

Optional font:

```sh
brew install --cask font-jetbrains-mono
```

VS Code must be registered for `vscode://file` links. If needed, open VS Code
and run `Shell Command: Install 'code' command in PATH` from the command
palette.

## Install On A Mac

Clone this repo, then run:

```sh
./install-macos.sh
```

Preview first:

```sh
./install-macos.sh --dry-run
```

Copy mode installs files into:

```text
~/.wezterm.lua
~/.config/wezterm
~/.tmux.conf
~/.local/bin/tmux-llm-status
```

Existing files are backed up before replacement when contents differ.

## Local Editing Mode

Use link mode on a machine where you want this repo to be the live config:

```sh
./install-macos.sh --link
```

This symlinks:

```text
~/.wezterm.lua -> wezterm/.wezterm.lua
~/.config/wezterm -> wezterm
~/.tmux.conf -> tmux/tmux.conf
~/.local/bin/tmux-llm-status -> tmux/tmux-llm-status
```

WezTerm has automatic reload enabled, but module edits through symlinks may not
always reload immediately. Press `Cmd-r` in WezTerm if needed. Reload tmux with
`Ctrl-a r`.

## Local Overrides

Machine-local overrides are ignored by Git.

For WezTerm, copy the example:

```sh
cp wezterm/local.lua.example wezterm/local.lua
```

In copy mode, place the file at:

```text
~/.config/wezterm/local.lua
```

Supported WezTerm local settings include:

```lua
return {
  background_hsb = {
    brightness = 0.40,
    saturation = 0.90,
  },
  background_rotation_seconds = 2 * 60 * 60,
}
```

You can also add an `apply` function for arbitrary WezTerm overrides:

```lua
return {
  apply = function(config, wezterm, env)
    config.font_size = 14.0
  end,
}
```

For tmux, create:

```sh
cp tmux/tmux.local.conf.example ~/.tmux.local.conf
```

`tmux/tmux.conf` sources `~/.tmux.local.conf` when present.

## Uninstall And Restore

Preview uninstall:

```sh
./uninstall-macos.sh --dry-run
```

Remove this setup and restore the latest timestamped backups when present:

```sh
./uninstall-macos.sh --restore-latest
```

Remove this setup without restoring old files:

```sh
./uninstall-macos.sh --remove-only
```

## Backgrounds

Background rotation is configured in:

```text
wezterm/modules/backgrounds.lua
```

To change brightness:

```lua
-- wezterm/local.lua
return {
  background_hsb = {
    brightness = 0.16,
    saturation = 0.90,
  },
}
```

To change the interval:

```lua
-- wezterm/local.lua
return {
  background_rotation_seconds = 2 * 60 * 60,
}
```

Add image files under `wezterm/assets/backgrounds` and list them in
`background_files`.

## Notes

The LLM activity marker is driven primarily by pane titles: it recognizes the
working spinner and idle state of both Claude Code and Codex, which animate and
label their terminal titles. Foreground command names are only a fallback for
other CLIs - Claude and Codex report an unstable process name (e.g. a version
string), so they are detected by title, not command. CLIs that expose neither
may only show a generic detected marker.

## License

MIT. See [LICENSE](LICENSE).
