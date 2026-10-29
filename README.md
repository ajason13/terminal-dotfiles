# Terminal Dotfiles

Shared configuration for a terminal-centric workflow - WezTerm, tmux,
Neovim, Codex, and Claude Code - focused on LLM sessions, fast pane/window
management, Quick Select file opening, local branch review, and rotating
terminal backgrounds.

For native Windows WezTerm with tmux inside WSL 2, follow the
[Windows 10/11 setup guide](docs/windows-setup.md). The macOS installer and
Homebrew dependency guide below are for Macs.

## Quick setup

1. Check [requirements](#requirements), then [install](#install-on-a-mac) in
   copy mode or use [link mode](#local-editing-mode) for live editing.
2. Apply [local overrides](#local-overrides); agent hooks and status-line
   settings are [manual setup](docs/agent-status.md#registering-the-hooks).
3. Use the keys below. See [uninstall and restore](#uninstall-and-restore)
   to remove the setup or restore backups.

| Task | Guide |
| --- | --- |
| Agent markers, hook registration, session ordering | [Agent activity](docs/agent-status.md) |
| Claude status-line settings | [Claude status line](docs/claude-statusline.md) |
| Optional Salesforce coordination | [Org leases](docs/salesforce-leases.md) |
| Optional tools and reboot recovery | [Tools and persistence](docs/optional-tools.md), [Codex recovery](docs/codex-restore.md) |
| Optional dashboard, fixtures and live opt-in | [Night Pass](dashboard/README.md) |
| Wallpaper rotation, inbox and publishing | [Backgrounds](docs/backgrounds.md) |
| Issue delivery and usage | [Codex workflow](docs/codex-workflow.md), [budget runner](docs/codex-budget.md) |
| Repository layout and contributor checks | [Repository guide](docs/repository-guide.md) |
| Editor setup and review keys | [Neovim](nvim/README.md) |

## Main keybindings

`Ctrl-a` is the tmux prefix; release it before the next key.

| Keys | Action |
| --- | --- |
| `Ctrl-a \` / `Ctrl-a -` | Split horizontally / vertically |
| `Ctrl-a h/j/k/l` | Move between panes |
| `Ctrl-a s` / `Ctrl-a S` / `Ctrl-a $` | Pick / create / rename a session |
| `Ctrl-a A` / `Ctrl-a a` | Open agent table / jump to next waiting agent |
| `Ctrl-a P` | Copy the pane's whole scrollback |
| `Ctrl-a r` | Reload tmux configuration |
| `Cmd-r` | Reload WezTerm if module changes have not appeared |
| `Ctrl-Shift-Space` | Quick Select: open paths, PNGs or web targets |

Press `q` to leave tmux scrollback mode and return to typing. Optional
[persistence keys](docs/optional-tools.md#tmux-plugins-session-persistence)
require separate plugin setup.

## What This Includes

- WezTerm attaches your most recently used tmux session, creating `main` if no
  server is running yet. Renaming sessions is safe: `Ctrl-a $`.
- tmux owns windows and panes; WezTerm tabs are hidden.
- tmux status bar shows LLM activity markers: per window, plus a roll-up for the
  current session next to its name (each session counts only its own windows).
- The Claude Code status line shows model, branch, context-window usage, and
  rate-limit usage. The path, session objectives, PR state, and the Salesforce
  org indicator have all been removed - see Claude Code Status Line for what
  each one cost.
- `Ctrl-a` is the tmux prefix.
- `Ctrl-a \` splits horizontally and `Ctrl-a -` splits vertically.
- `Ctrl-a h/j/k/l` moves between panes.
- `Ctrl-a P` copies the current pane's whole scrollback to the clipboard. While a
  pane is scrolled back, the status bar shows `SCROLLBACK` until `q` returns you to
  typing.
- A Claude pane that parks on a permission prompt or question raises a macOS
  notification naming its session and window (`TMUX_LLM_NOTIFY=0` mutes it).
- `Ctrl-a A` opens the agent table: every LLM pane across sessions, blocked
  first, by window name, with ctx, model, project, branch and account limits;
  one key jumps there, `r` redraws, `t` flips to tree order (grouped by
  session, as in `Ctrl-a s`, whose rows now carry the same agent markers).
  While org-lock holds an org or the announce log has a `WAIT`, ORG and LOCK
  show which pane holds it (`held`) and each waiter's place (`wait N`, by tier
  then arrival, keyed by the line's `pane=$TMUX_PANE`, else by the session's
  agent name). The place is the
  agreed order, not a reservation: first to claim still wins.
  `tmux-llm-status table` prints the same view once.
- `Ctrl-a s` picks a session, `Ctrl-a S` creates one (prompts for a name, starts
  in the current pane's directory), `Ctrl-a $` renames the current one.
- The `Ctrl-a s` picker lists sessions in creation order. `tmux-session-to-end`
  rebuilds a session under a newer id to reorder that list without losing panes
  or the processes in them - see tmux Session Order.
- `Ctrl-Shift-Space` opens selected text paths in a tmux Neovim split, PNG
  images in Preview, and web targets in the browser.
- WezTerm backgrounds rotate every 15 minutes by default.
- The optional [Night Pass dashboard](dashboard/README.md) has three courses:
  Ridge Pass, Cypress Run, and Harbor Yard Rallycross. It starts with fixtures;
  manual snapshot import and loopback live polling are explicit opt-ins.
  Cars follow the route with orientation/drift where supported; stationary cars
  share 18 pit slots grouped by tmux session, alongside 16 route slots.
- Codex defaults to `gpt-6.1-sol` with `medium` reasoning for routine sessions
  and includes pinned Astra and Sol profiles for research, architecture, and
  implementation.
- Claude Code sessions can take advisory leases on shared Salesforce orgs, so two
  agents do not run tests against the same org at once. Off until
  `SF_LEASE_ENABLE` is set - see Salesforce Org Leases.

## Status bar markers

See [Status bar markers](docs/agent-status.md#status-bar-markers).

### Explain a pane's status

See [Explain a pane's status](docs/agent-status.md#explain-a-panes-status).

### Registering the hooks

See [Registering the hooks](docs/agent-status.md#registering-the-hooks).

## tmux Session Order

See [tmux Session Order](docs/agent-status.md#tmux-session-order).

## Layout

See [Layout](docs/repository-guide.md#layout).

## Requirements

Start with the [macOS workstation dependency guide](docs/workstation-setup.md)
for prerequisites, required versus optional tools, version expectations, and
explicit check/install commands. The root [Brewfile](Brewfile) covers the core
terminal/editor workflow, including `ripgrep` for Neovim and `jq` for hooks.
Package installation is a separate operator action; the dotfile installer only
manages files. Agent CLIs, sign-in, Node-based helpers and development tooling
have separate requirements in the guide.

Optional font:

```sh
brew install --cask font-jetbrains-mono
```

VS Code must be registered for `vscode://file` links. If needed, open VS Code
and run `Shell Command: Install 'code' command in PATH` from the command
palette.

For read-only dependency, installed-link and opt-in hook checks, see
[installation diagnostics](docs/workstation-setup.md#read-only-installation-diagnostics).

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
~/.codex/config.toml
~/.codex/AGENTS.md
~/.codex/agents
~/.codex/{deep-researcher,lead-architect,builder}.config.toml
~/.local/bin/codex-role
~/.local/bin/codex-budget
~/.local/bin/sf-org-resolve
~/.local/bin/sf-lease
~/.local/bin/tmux-session-to-end
~/.claude/statusline.sh
~/.claude/hooks/sf-lease-{guard,post,end,table}.sh
~/.claude/hooks/tmux-agent-depth.sh
```

Existing files are backed up before replacement when contents differ.
Directory installs back up the complete prior directory, carry local-only files
forward, and replace managed entries without following destination symlinks.
Unchanged reinstalls retain the original backup. Skill backups are stored under
`~/.codex/skill-backups/`, outside skill discovery.
`~/.claude/settings.json` is never written: see Claude Code Status Line and
Salesforce Org Leases for the settings and hook snippets to merge by hand. The lease hooks stay inert
after installation until `SF_LEASE_ENABLE` is set, so installing them changes
nothing about how a session behaves.

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
~/.codex/config.toml -> codex/config.toml
~/.codex/AGENTS.md -> codex/AGENTS.md
~/.codex/agents -> codex/agents
~/.codex/{deep-researcher,lead-architect,builder}.config.toml -> codex/profiles/*
~/.local/bin/codex-role -> codex/bin/codex-role
~/.local/bin/codex-budget -> codex/bin/codex-budget.mjs
~/.local/bin/sf-org-resolve -> bin/sf-org-resolve
~/.local/bin/sf-lease -> bin/sf-lease
~/.local/bin/tmux-session-to-end -> bin/tmux-session-to-end
~/.claude/statusline.sh -> claude/statusline.sh
~/.claude/hooks/sf-lease-{guard,post,end,table}.sh -> claude/hooks/*
~/.claude/hooks/tmux-agent-depth.sh -> claude/hooks/tmux-agent-depth.sh
```

## Codex SDLC

Start with [Working with Codex](docs/codex-workflow.md) for new sessions,
issue tracking, continuation, unattended tasks, Dependabot, and troubleshooting.
GitHub Issues are the running source of truth for work: identify an issue before
implementation, record material progress and dependencies there, and link the
PR. Follow Backlog → Ready → In progress → In review → Done; implementation is
Done only after acceptance criteria, required checks, and review are satisfied
and the linked PR is merged. The guide includes a reusable backlog prompt and
issue format; local checkpoints support resuming sessions.

For one active issue at a time per project, follow the
[one-issue delivery loop and reusable implementation prompt](docs/codex-workflow.md#deliver-one-issue-per-fresh-chat):
fresh chat → next Ready issue → implementation and verification → reviewed PR
→ confirmed merge → updated local `main` → repeat.

The normal Codex default is `gpt-6.1-sol` with `medium` reasoning for routine
delivery. Three optional, explicitly selected profiles support heavier work:

| Role | Model | Reasoning |
| --- | --- | --- |
| Deep Researcher | `gpt-6-astra` | `medium` |
| Lead Architect | `gpt-6.1-sol` | `high` |
| Builder | `gpt-6.1-sol` | `medium` |

For a task delegated within Codex, name the custom agent explicitly, for
example: `Use the deep-researcher agent to map this codebase.` The agent file
pins its model and reasoning effort.

For a top-level CLI session, use `codex-role`. This is the reliable way to
guarantee the intended model and reasoning level from session start:

```sh
codex-role research
codex-role architect
codex-role build
```

Each command starts Codex with an explicit profile. Task wording and global
instructions can guide routing, but they cannot guarantee that a top-level
session changes model after it has started. If a pinned model or level is not
available, Codex should surface that as an exception rather than silently
downshifting.

Every task follows a compact loop: state the goal, scope, risk, acceptance
criteria, and verification; inspect before editing; make the smallest complete
change; run proportional verification; then review the final diff and report
assumptions or residual risk. Use DRY, SOLID where it helps, and KISS.

One Codex session owns each outcome. Do not delegate by default. A single
subagent is appropriate only for a bounded, independent question where context
isolation adds material value; it must not delegate further. The default pool is
therefore one Luna/medium subagent, not a parallel delivery pipeline.

For auth, security, privacy, safety, payments, licensing, migrations, public
APIs or schemas, releases, and requested reviews, run a fresh-context Codex
review after implementation. Supply its acceptance criteria, final diff, and
verification output; resolve material findings before handoff. This replaces
external-model and Notion gates.

The installed global `AGENTS.md` owns standing delivery authority, engineering
expectations, and usage thresholds. Model pins live in config and profiles;
specialized skills contain procedures without repeating model tables.
Reviewable skill sources in `codex/skills/` are installed by both installer
modes. Uninstall removes these managed skills and, with `--restore-latest`,
restores any versions they replaced. Unrelated personal skills remain in place.
A receipt under `~/.local/state/terminal-dotfiles/skills` also tracks managed
skills that have since been removed from the checkout.

Use `codex-budget status` for a read-only allowance query with no model call.
For unattended tasks, see [the budget runner](docs/codex-budget.md). It gates
each task, waits for reported resets when requested, and stores concise local
checkpoints under the Git directory. A running task can still exceed the
reserve; this is a task-boundary guard, not a hard token/spending cap.

WezTerm has automatic reload enabled, but module edits through symlinks may not
always reload immediately. Press `Cmd-r` in WezTerm if needed. Reload tmux with
`Ctrl-a r`.

Note that a tmux server is long-lived. Because WezTerm attaches to the existing
server (`tmux attach`), edits to `tmux.conf` don't apply to a running
server until it is reloaded, and a server started before a change can drift out
of sync (for example, an old status-bar position). This config re-sources itself
whenever a client attaches, so newly opened WezTerm windows pick up the latest
config automatically; the session you're already in still needs `Ctrl-a r`. For
a fully clean slate, quit all WezTerm windows (or run `tmux kill-server`).

## Claude Code Status Line

See [Claude Code Status Line](docs/claude-statusline.md#claude-code-status-line).

### Claude Code settings (manual step)

See [Claude Code settings (manual step)](docs/claude-statusline.md#claude-code-settings-manual-step).

## Salesforce Org Leases

See [Salesforce Org Leases](docs/salesforce-leases.md#salesforce-org-leases).

### The three pieces

See [The three pieces](docs/salesforce-leases.md#the-three-pieces).

### Arming it, in this order

See [Arming it, in this order](docs/salesforce-leases.md#arming-it-in-this-order).

### Knobs

See [Knobs](docs/salesforce-leases.md#knobs).

### Day to day

See [Day to day](docs/salesforce-leases.md#day-to-day).

### When the store wedges

See [When the store wedges](docs/salesforce-leases.md#when-the-store-wedges).

### Where the real identifiers live

See [Where the real identifiers live](docs/salesforce-leases.md#where-the-real-identifiers-live).

### Adding a third repo to the map

See [Adding a third repo to the map](docs/salesforce-leases.md#adding-a-third-repo-to-the-map).

### Known gaps

See [Known gaps](docs/salesforce-leases.md#known-gaps).

### Verifying it end to end

See [Verifying it end to end](docs/salesforce-leases.md#verifying-it-end-to-end).

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

See [Recommended Tools](docs/optional-tools.md#recommended-tools).

### Start here

See [Start here](docs/optional-tools.md#start-here).

### Add when you feel the need

See [Add when you feel the need](docs/optional-tools.md#add-when-you-feel-the-need).

### tmux plugins (session persistence)

See [tmux plugins (session persistence)](docs/optional-tools.md#tmux-plugins-session-persistence).

### Reference

See [Reference](docs/optional-tools.md#reference).

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

Uninstall removes the two lease binaries and the four
`~/.claude/hooks/sf-lease-*.sh` scripts, but it cannot touch
`~/.claude/settings.json`, since this repo never installs it. Remove those hook
entries from that file by hand - and `unset SF_LEASE_ENABLE` - or they will point
at scripts that are no longer there, which errors on every Bash call.

## Verification

See [Verification](docs/repository-guide.md#verification).

## Backgrounds

See [Backgrounds](docs/backgrounds.md#backgrounds).

## Background Inbox

See [Background Inbox](docs/backgrounds.md#background-inbox).

## Asset Scaling

See [Asset Scaling](docs/backgrounds.md#asset-scaling).

## Notes

See [Notes](docs/agent-status.md#notes).

## License

MIT. See [LICENSE](LICENSE).
