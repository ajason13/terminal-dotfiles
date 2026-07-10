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
- WezTerm backgrounds rotate every 15 minutes by default.

## Layout

```text
.
├── LICENSE
├── README.md
├── install-macos.sh
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

Note that a tmux server is long-lived. Because WezTerm attaches to the existing
`main` server (`new-session -A`), edits to `tmux.conf` don't apply to a running
server until it is reloaded, and a server started before a change can drift out
of sync (for example, an old status-bar position). This config re-sources itself
whenever a client attaches, so newly opened WezTerm windows pick up the latest
config automatically; the session you're already in still needs `Ctrl-a r`. For
a fully clean slate, quit all WezTerm windows (or run `tmux kill-server`).

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
  background_rotation_seconds = 15 * 60,
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

Wallpapers are delivered as a GitHub Release asset, not committed to git.
`install-macos.sh` downloads `backgrounds.tar.gz` from the rolling `backgrounds`
release and extracts it (into the repo tree for `--link`, or `~/.config/wezterm`
for copy mode). Re-runs skip the download only when the published checksum is
unchanged **and** the local wallpaper tree is already populated - so rerunning
the installer self-heals a missing or deleted set. Fetch failures are non-fatal:
if the release is unreachable the install still completes and simply shows no
wallpaper until the next successful fetch.

- Skip the fetch: `./install-macos.sh --skip-backgrounds`
- Force a re-download: `./install-macos.sh --refresh-backgrounds`

To publish a new set (repo owner): add/update images under
`wezterm/assets/backgrounds/`, list them in the manifests, then run
`./scripts/publish-backgrounds.sh`.

List the relative path of any new or changed image in the relevant file under
`wezterm/modules/background_manifests`.

The background list is intentionally explicit. WezTerm does not auto-scan the
folders, so archive, experiment, or sensitive folders can exist without showing
up in rotation unless a file is added to a manifest.

Machine-local excludes are also supported:

```lua
-- wezterm/local.lua
return {
  background_excludes = {
    '200-anime/haikyuu/014-pointing-black.png',
  },
}
```

This is useful when you want to park a background temporarily without removing
it from the shared curated rotation.

## Background Inbox

For repeated wallpaper work, use the inbox workflow instead of hand-describing
the same defaults every time.

Drop screenshots into:

```text
wezterm/assets/inbox/
```

For each screenshot, add a sidecar YAML file with the same basename:

```text
wezterm/assets/inbox/scene-001.png
wezterm/assets/inbox/scene-001.yaml
```

Processed source screenshots can be moved into:

```text
wezterm/assets/inbox/_processed/
```

That archive is ignored by the inbox validator, so it will not stay in the
active queue.

Only two fields are required:

```yaml
series: haikyuu
mode: stylized
```

You can also add an optional `focus` field when the source frame needs tighter
direction about what to preserve, crop around, or black out.

Example:

```yaml
series: haikyuu
mode: stylized
focus: >
  Keep the yellow hair girl, orange hair boy, orange hair woman, and the man on
  her right. Keep the middle turnstiles and black out everything else.
```

Use `focus` for things like:

- which characters to keep
- which object or action is the real subject
- what background elements to preserve
- what should fall away into black negative space
- whether the scene should stay close to the frame or be more selectively reduced

Valid `mode` values are:

- `stylized`
- `as_is`

Mode meaning is intentionally narrow:

- `stylized`: closer to `200-anime/haikyuu/001` through `008`
  - darker and more transformed
  - stronger wallpaper reinterpretation
- `as_is`: closer to `200-anime/haikyuu/009` and later
  - preserve the source frame more directly
  - still apply dark/warm terminal treatment and UI cleanup

The rest is intentionally hardcoded for the current wallpaper workflow:

- `lighting`: `dark_warm`
- `notes`: terminal-background defaults

Validate the queue before asking Codex to process it:

```sh
./scripts/check-background-inbox.sh
./scripts/list-background-inbox.sh
```

Then hand off the queue with a prompt like:

```text
Process the background inbox.
```

Codex should use the inbox file, apply the default dark/warm terminal treatment,
respect any optional `focus` direction, route the output into the right
background folder for the declared series, and update the relevant manifest
file.

`./scripts/list-background-inbox.sh` is the quick preflight view. It prints the
pending inbox items, their series/mode metadata, and the inferred destination
path based on the current library numbering. If you want to override the
generated filename slug, add an optional `slug` field:

```yaml
series: haikyuu
mode: stylized
slug: tsukishima-ushijima-celebration
```

## Asset Scaling

The current scaling approach is:

- Keep rotation on an explicit allowlist rather than a pure exclude model.
- Split that allowlist into small manifest files by category or franchise.
- Keep backgrounds grouped under numeric categories, then subfolders such as
  `200-anime/haikyuu`.
- Keep individual wallpaper files at or below roughly 2.5 MiB.
- Keep the total background library at or below roughly 80 MiB (the size of the
  published release bundle, checked before publishing - not git-tracked).

`./scripts/publish-backgrounds.sh` enforces the current image size limits
(via `./scripts/check-background-assets.sh`) before publishing a new release,
so an oversized asset fails the publish rather than CI.

If the library outgrows those limits, the next step is to curate older assets
out of the repo or move larger wallpaper archives to Git LFS or external
storage, not to loosen the rotation manifest into auto-discovery.

## Notes

The LLM activity marker is driven primarily by pane titles: it recognizes the
working spinner and idle state of both Claude Code and Codex, which animate and
label their terminal titles. Foreground command names are only a fallback for
other CLIs - Claude and Codex report an unstable process name (e.g. a version
string), so they are detected by title, not command. CLIs that expose neither
may only show a generic detected marker.

## License

MIT. See [LICENSE](LICENSE).
