# Optional tools and session persistence

[Back to setup and keybindings](../README.md). Commands below run from the
repository root unless a block names another location.

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

### tmux plugins (session persistence)

Reach for these when you want your window/pane layout to survive a reboot:
[tmux-resurrect](https://github.com/tmux-plugins/tmux-resurrect) saves and
restores sessions, and
[tmux-continuum](https://github.com/tmux-plugins/tmux-continuum) adds background
auto-save plus auto-restore when the tmux server starts.

Skip TPM here. TPM discovers plugins by scanning `~/.tmux.conf`, but in this repo
that file is the shared config and machine-local settings belong in
`~/.tmux.local.conf` (sourced last), which TPM does not scan - and `set -g @plugin`
is a single option that later declarations overwrite. For a couple of plugins it
is simpler and reliable to clone them and source their entry scripts directly:

```sh
git clone https://github.com/tmux-plugins/tmux-resurrect ~/.tmux/plugins/tmux-resurrect
git clone https://github.com/tmux-plugins/tmux-continuum  ~/.tmux/plugins/tmux-continuum
```

```tmux
# ~/.tmux.local.conf
# Set the @continuum options before sourcing continuum (it reads them at init),
# and source resurrect before continuum, which depends on it.
set -g @continuum-restore 'on'         # auto-restore the last save when tmux starts
set -g @continuum-save-interval '15'   # auto-save every 15 minutes (0 disables)
run-shell '~/.tmux/plugins/tmux-resurrect/resurrect.tmux'
run-shell '~/.tmux/plugins/tmux-continuum/continuum.tmux'
```

Reload with `Ctrl-a r` to activate; save/restore manually with `Ctrl-a Ctrl-s` /
`Ctrl-a Ctrl-r`. Add other tmux plugins the same way - clone the repo and add a
matching `run-shell '.../<plugin>.tmux'` line. Update a plugin with
`git -C ~/.tmux/plugins/<name> pull`.

`@continuum-restore 'on'` is the line that brings sessions back after a reboot:
continuum auto-saves in the background and auto-restores the last save when the
tmux server next starts. Without it, continuum still saves, but you would restore
by hand with `Ctrl-a Ctrl-r`.

**What survives, and what does not.** Restore brings back windows, panes,
layout, and each pane's working directory - but not live program state. By
default your Claude Code / Codex panes come back as plain shells in the right
directories, not resumed conversations.

To resume each Claude pane's exact conversation, add the
[`tmux-agent-resume`](../bin/tmux-agent-resume) save hook to `~/.tmux.local.conf`
**before** the `run-shell` lines:

```tmux
set -g @resurrect-hook-post-save-layout '~/.local/bin/tmux-agent-resume'
set -g @resurrect-processes 'claude'
```

On every save, the hook reads Claude's live session registry
(`~/.claude/sessions/<pid>.json`) and rewrites each Claude pane's saved command
to `claude --resume <session-id>`. The launch command alone goes stale after
`/clear` or `/resume`, and `claude --continue` is ambiguous when two panes share
a directory. A Claude pane with no live session record is saved as a plain shell
instead.

For opt-in recovery of multiple Codex panes, use
[`codex-restore`](codex-restore.md): start a managed pane with
`codex-restore start`, then after tmux restores run `codex-restore restore` and
confirm the exact saved UUID-to-pane matches. It never uses `codex resume --last`
for every pane. `codex-restore install-login` optionally opens WezTerm after
graphical login; it deliberately leaves the final resume confirmation to you.

### Reference

**Optional utility collection (review before installing):**

```sh
brew install \
  zsh-autosuggestions zsh-syntax-highlighting starship fzf zoxide atuin \
  eza bat fd ripgrep dust duf procs btop \
  jq yq glow yazi lazygit git-delta gh watchexec entr tmux
brew install --cask wezterm font-jetbrains-mono-nerd-font
```

The core [Brewfile](../Brewfile) intentionally excludes this optional collection.
See the [dependency guide](workstation-setup.md) for Bundle commands and
version limitations.

**WezTerm extras:** WezTerm has a plugin system (`wezterm.plugin.require`) - e.g.
[`resurrect.wezterm`](https://github.com/MLFlexer/resurrect.wezterm) for
window/tab/pane layouts, and `smart-splits` for unified pane navigation with
Neovim.

**Neovim.** This repo ships a minimal, purpose-built Neovim config under
[`nvim/`](../nvim/README.md) - navigate, open, git, and read/review, with no LSP or
autocomplete. It installs alongside WezTerm and tmux (see [Local Editing Mode](../README.md#local-editing-mode)) and
unlocks **reviewing branches locally instead of in the browser**:

- `diffview.nvim` - `<leader>gd` (`:DiffviewOpen main...HEAD`) shows the whole
  branch diff as a file tree with side-by-side panes (the "Files changed" view).
- `gitsigns` + `lazygit` - inline hunks, blame, and a full git TUI (`<leader>gg`).
- `render-markdown.nvim` - renders `.md` inline for read-heavy work.

Copy the entire current file from normal mode:

```vim
:%y+
```

This uses the system clipboard. If the active Neovim build does not expose
clipboard support, use `:%y` to yank into Neovim's default register instead.

Full loop: `gh pr checkout <n>` -> `wt` -> `nvim` -> `<leader>gd`. See
[`nvim/README.md`](../nvim/README.md) for the keymap cheat sheet. Before Neovim is
installed, `gh pr diff <n>` (piped through `delta`) or `lazygit` cover branch
review from the terminal.
