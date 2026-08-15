# Codex Restore

`codex-restore` is an opt-in recovery helper for **interactive Codex sessions
running in tmux panes**. It combines tmux-resurrect/continuum's pane and working
directory restore with `codex resume <session-id>`.

It does not preserve a running process. After a restart, tmux restores plain
shells; `codex-restore` sends a resume command only to panes that you explicitly
marked as managed before the restart.

## Prerequisites

Install this dotfiles repository, then enable the tmux plugins described in the
[README's persistence section](../README.md#tmux-plugins-session-persistence).
In particular, `~/.tmux.local.conf` needs:

```tmux
set -g @continuum-restore 'on'
set -g @continuum-save-interval '15'
run-shell '~/.tmux/plugins/tmux-resurrect/resurrect.tmux'
run-shell '~/.tmux/plugins/tmux-continuum/continuum.tmux'
```

Reload tmux (`Ctrl-a r`) after enabling it. The first Codex hook invocation after
installing this feature may ask Codex to trust the changed hook configuration;
approve it only after checking that `~/.codex/config.toml` points to this setup.

## Everyday use

Start a recoverable session from the tmux pane that should own it:

```sh
codex-restore start
# or: codex-restore start --profile builder
```

The wrapper starts normal interactive Codex. On its first prompt, the Codex hook
records the Codex UUID, tmux session/window/pane position, and working directory.
It records neither prompts nor transcripts. Sessions launched as plain `codex`
remain unmanaged.

After an unclean shutdown or restart:

```sh
codex-restore list
codex-restore restore
```

`restore` shows only records whose tmux session, window index, pane index, and
directory match a currently restored pane, then requires confirmation. It sends
the exact `codex resume <UUID>` command to each confirmed pane. It never uses
`codex resume --last`, which would be ambiguous with more than one pane.

Use `codex-restore restore --yes` only in a deliberate automation after reviewing
the candidate list. A UUID is resumed at most once per tmux server: a second
restore attempt is skipped until tmux itself restarts.

Run this before continuing interrupted work:

```sh
git status
git diff
```

Check migrations, test artifacts, service state, and any external side effects
before asking the resumed agent to repeat a tool call.

## Management and recovery

```sh
codex-restore unmanage             # this pane stops recording future sessions
codex-restore forget <session-uuid> # delete one record and its resume lock
codex-restore list                 # UUID, saved pane identity, cwd, timestamp
```

State is stored in `~/.local/state/codex-restore/` with owner-only permissions.
It contains UUIDs, paths, pane locations, and timestamps. It intentionally does
not inspect or modify Codex's internal session storage. If a repository moves,
a pane changes identity, authentication expires, or a saved session disappears,
the helper skips it rather than guessing.

## Open WezTerm after login

This is optional. It opens WezTerm once after graphical login; WezTerm then
attaches to tmux, which causes continuum to restore the saved layout. It does
not auto-confirm Codex resumes.

```sh
codex-restore install-login
codex-restore uninstall-login
```

The per-user LaunchAgent is
`~/Library/LaunchAgents/com.jasonalvarez.codex-restore-wezterm.plist`. It cannot
open WezTerm before graphical login (and FileVault makes that distinction
especially important).

## Limitations

- A continuum checkpoint can be up to its configured save interval old. Use
  `Ctrl-a Ctrl-s` before a planned restart when the exact latest layout matters.
- A pane ID is not stable after restore. The helper deliberately uses the saved
  tmux session/window/pane position plus cwd and skips ambiguous matches.
- The wrapper only records a session after its first user prompt. A session that
  never receives one has nothing durable to resume.
- Do not treat a resumed conversation as proof that a partially completed command
  was safe to retry. Reconcile the real workspace first.
