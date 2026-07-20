# Terminal Dotfiles

Portable macOS configuration for a terminal-centric workflow - WezTerm, tmux,
and Neovim - focused on LLM sessions, fast pane/window management, Quick Select
file opening, local branch review, and rotating terminal backgrounds.

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

## Requirements

Install the core tools:

```sh
brew install tmux
brew install neovim tree-sitter-cli
brew install --cask wezterm visual-studio-code
```

`tree-sitter-cli` is needed by the Neovim config to compile syntax parsers
(nvim-treesitter's `main` branch builds them with the `tree-sitter` CLI).

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
~/.config/nvim -> nvim
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

## Recommended Tools

This is a menu, not a checklist. You adopt a tool by replacing a habit, and you
can only build a habit or two at a time - so start with the short **Start here**
set, then add the rest only when you hit the specific annoyance each one solves.
Installing everything at once just leaves you with tools you forget you have.

This repo manages WezTerm and tmux; the shell (`~/.zshrc`) and Git
(`~/.gitconfig`) snippets below go in your personal dotfiles.

### Start here

The daily-driver kit. Each item is either passive (install it and existing
things just work better) or a single new reflex - together they cover most of
the benefit.

**A Nerd Font** - install first; the prompt and several tools use its glyphs.

```sh
brew install --cask font-jetbrains-mono-nerd-font
```

```lua
-- wezterm/local.lua: point WezTerm at it (appearance.lua sets the shared default)
return {
  apply = function(config, wezterm, env)
    config.font = wezterm.font('JetBrainsMono Nerd Font')
  end,
}
```

**zsh-autosuggestions + zsh-syntax-highlighting** - passive: ghost text from
history (accept with `->`/End) and command coloring. Just keep typing.

```sh
brew install zsh-autosuggestions zsh-syntax-highlighting
```

```sh
# ~/.zshrc  (autosuggestions first; syntax-highlighting MUST be sourced last)
if command -v brew >/dev/null 2>&1; then
  ZSH_SHARE="$(brew --prefix)/share"
  [ -f "$ZSH_SHARE/zsh-autosuggestions/zsh-autosuggestions.zsh" ] &&
    source "$ZSH_SHARE/zsh-autosuggestions/zsh-autosuggestions.zsh"
  [ -f "$ZSH_SHARE/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ] &&
    source "$ZSH_SHARE/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
fi
```

**starship** - passive: a more informative prompt (git state, exit codes), no
new commands to learn.

```sh
brew install starship
# ~/.zshrc:  eval "$(starship init zsh)"
```

**fzf** - one reflex: fuzzy `Ctrl-R` history search (and file pickers).

```sh
brew install fzf
# ~/.zshrc:  source <(fzf --zsh)
```

A useful fzf-powered helper for jumping into git worktrees - handy since Claude
Code creates them under `.claude/worktrees/` and typing those paths is tedious.
Run `wt` for the picker, or `wt <filter>` to pre-filter - it jumps straight there
when only one worktree matches. Worktrees are per-repo, so run it inside the repo:

```sh
# ~/.zshrc - jump to a git worktree of the current repo by fuzzy pick.
# `wt` opens the picker; `wt <filter>` pre-filters (jumps if a single match).
wt() {
  local dir
  dir=$(git worktree list 2>/dev/null | fzf --prompt='worktree> ' --query="$*" --select-1 --exit-0 | awk '{print $1}')
  if [ -n "$dir" ]; then
    cd "$dir"
  else
    echo "wt: no worktree matched (run inside the repo - worktrees are per-repo)" >&2
  fi
}
```

**zoxide** - one new verb: `z proj` instead of a long `cd` path.

```sh
brew install zoxide
# ~/.zshrc:  eval "$(zoxide init zsh)"
```

**git-delta** - passive: syntax-highlighted git diffs.

```sh
brew install git-delta
# ~/.gitconfig:  [core] pager = delta   (see `delta --help`)
```

### Add when you feel the need

Install one only when its trigger actually bites. A tool adopted to solve a real
annoyance sticks; one installed speculatively becomes clutter. (You already have
`rg` and `jq`.)

| Tool | Reach for it when... | Install |
|---|---|---|
| `lazygit` | multi-step git (staging hunks, rebasing, juggling branches) feels clumsy on the CLI | `brew install lazygit` |
| `bat` | you `cat` a file and want syntax highlighting | `brew install bat` |
| `eza` | plain `ls` feels flat and you want git status or a tree at a glance | `brew install eza` |
| `fd` | `find`'s syntax annoys you | `brew install fd` |
| `ripgrep` (`rg`) | `grep -r` is slow or noisy (also powers Neovim's finder later) | `brew install ripgrep` |
| `yazi` | you want to browse, preview, and bulk-move files visually | `brew install yazi` |
| `jq` / `yq` | you're poking at JSON / YAML (API responses, configs) | `brew install jq yq` |
| `glow` | you want Markdown / LLM output rendered, not raw | `brew install glow` |
| `atuin` | fzf's `Ctrl-R` isn't enough; you want searchable, cross-machine history | `brew install atuin` |
| `btop` | something's hot and `top` isn't enough | `brew install btop` |
| `dust` / `duf` | "what's eating my disk?" / you want a clearer `df` | `brew install dust duf` |
| `procs` | `ps aux \| grep` gets old | `brew install procs` |
| `watchexec` | you keep re-running a command after every file save | `brew install watchexec` |

### tmux plugins (when you want session persistence)

Reach for these when you lose your window/pane layout on restart, or want fuzzy
session switching. This config keeps a long-lived `main` session, so
[TPM](https://github.com/tmux-plugins/tpm) + resurrect/continuum pay off. Declare
plugins in `~/.tmux.local.conf` (kept out of the shared config, sourced last):

```sh
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

```tmux
# ~/.tmux.local.conf
set -g @plugin 'tmux-plugins/tpm'
set -g @plugin 'tmux-plugins/tmux-resurrect'
set -g @plugin 'tmux-plugins/tmux-continuum'
set -g @plugin 'tmux-plugins/tmux-yank'
set -g @plugin 'sainnhe/tmux-fzf'
set -g @continuum-restore 'on'         # auto-restore the last save when tmux starts
set -g @continuum-save-interval '15'   # auto-save every 15 minutes (0 disables)
run '~/.tmux/plugins/tpm/tpm'
```

Install with `Ctrl-a I`; save/restore manually with `Ctrl-a Ctrl-s` /
`Ctrl-a Ctrl-r`. Because this config re-sources `~/.tmux.conf` on client attach,
the `run tpm` line re-runs each attach - harmless, and it keeps plugins loaded in
new windows.

`@continuum-restore 'on'` is the line that brings sessions back after a reboot:
continuum auto-saves in the background and auto-restores the last save when the
tmux server next starts. Without it, continuum still saves, but you would restore
by hand with `Ctrl-a Ctrl-r`.

**What survives, and what does not.** Restore brings back windows, panes,
layout, and each pane's working directory - but not live program state. After a
reboot your Claude Code / Codex panes come back as plain shells in the right
directories, not resumed conversations. To resume the conversation itself, use
the agent's own mechanism from that directory: `claude --continue` (most recent
conversation in that dir) or `claude --resume` (pick one); Codex has
`codex resume`. Claude keys history by directory and resurrect restores the
directory, so `claude --continue` in a restored pane lands on that project's last
conversation.

### Reference

**Everything at once (fresh machine):**

```sh
brew install \
  zsh-autosuggestions zsh-syntax-highlighting starship fzf zoxide atuin \
  eza bat fd ripgrep dust duf procs btop \
  jq yq glow yazi lazygit git-delta gh watchexec entr tmux
brew install --cask wezterm font-jetbrains-mono-nerd-font
```

Prefer a reproducible manifest? Keep a `Brewfile` and run `brew bundle`.

**WezTerm extras:** WezTerm has a plugin system (`wezterm.plugin.require`) - e.g.
[`resurrect.wezterm`](https://github.com/MLFlexer/resurrect.wezterm) for
window/tab/pane layouts, and `smart-splits` for unified pane navigation with
Neovim.

**Neovim.** This repo ships a minimal, purpose-built Neovim config under
[`nvim/`](nvim/README.md) - navigate, open, git, and read/review, with no LSP or
autocomplete. It installs alongside WezTerm and tmux (see Local Editing Mode) and
unlocks **reviewing branches locally instead of in the browser**:

- `diffview.nvim` - `<leader>gd` (`:DiffviewOpen main...HEAD`) shows the whole
  branch diff as a file tree with side-by-side panes (the "Files changed" view).
- `gitsigns` + `lazygit` - inline hunks, blame, and a full git TUI (`<leader>gg`).
- `render-markdown.nvim` - renders `.md` inline for read-heavy work.

Full loop: `gh pr checkout <n>` -> `wt` -> `nvim` -> `<leader>gd`. See
[`nvim/README.md`](nvim/README.md) for the keymap cheat sheet. Before Neovim is
installed, `gh pr diff <n>` (piped through `delta`) or `lazygit` cover branch
review from the terminal.

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

Wallpapers are delivered as split GitHub Release bundles, not committed to git.
`install-macos.sh` downloads bundle tarballs from rolling releases such as
`backgrounds-general`, `backgrounds-vehicles`, and `backgrounds-anime`, then
extracts them into the local wallpaper tree (into the repo tree for `--link`,
or `~/.config/wezterm` for copy mode). Re-runs skip a bundle only when that
bundle's published checksum is unchanged **and** its local directory is already
populated - so rerunning the installer self-heals a missing or deleted bundle.
Fetch failures are non-fatal per bundle: if one release is unreachable, install
still completes and leaves the other bundles unchanged.

- Skip the fetch: `./install-macos.sh --skip-backgrounds`
- Force a re-download: `./install-macos.sh --refresh-backgrounds`

To publish a new set (repo owner): add/update images under
`wezterm/assets/backgrounds/`, list them in the manifests, then run
`./scripts/publish-backgrounds.sh`. That publishes one tarball per configured
bundle. To publish only one bundle:

```sh
./scripts/publish-backgrounds.sh --bundle anime
```

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

If the screenshots are still on your Desktop, use the helper to import them and
auto-create sidecars from the sample YAML:

```sh
./scripts/import-background-inbox.sh --move --series haikyuu --mode stylized ~/Desktop/*.png
```

That command:

- moves or copies the image files into `wezterm/assets/inbox/`
- creates matching `.yaml` sidecars from `_sample/scene-001.yaml`
- optionally stamps the same `series` / `mode` onto every imported file

Useful variants:

```sh
# keep the originals on Desktop
./scripts/import-background-inbox.sh --copy ~/Desktop/'Screenshot 2026-07-15 at 9.12.01 PM.png'

# import and jump straight into editing the generated YAML files
./scripts/import-background-inbox.sh --move --series attack-on-titan --mode as_is --edit ~/Desktop/*.png
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
- Split published wallpapers into category bundles instead of one monolithic
  release.
- Keep bundle totals within their current caps:
  - `general`: 16 MiB
  - `vehicles`: 24 MiB
  - `anime`: 72 MiB

`./scripts/publish-backgrounds.sh` enforces the current image size limits
(via `./scripts/check-background-assets.sh`) before publishing bundle releases,
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
