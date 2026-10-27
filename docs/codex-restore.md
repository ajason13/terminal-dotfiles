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

Reload tmux (`Ctrl-a r`) after enabling it. Install `jq` (`brew install jq`)
for the JSON adapter. The installed `~/.codex/config.toml` registers a
`SessionStart` command: `"$HOME/.local/bin/codex-restore" capture-hook`.
Open `/hooks` in Codex and review/trust that exact definition before relying on
recovery; untrusted hooks are skipped. Other active lifecycle hooks still run.
Copy and link installs both include the configuration and helper; uninstall
removes them (or restores their backups) and preserves saved recovery state.

The registration and JSON input follow the
[official Codex hook contract](https://learn.chatgpt.com/docs/hooks).
`capture-hook` accepts one JSON object with `hook_event_name: "SessionStart"`
and a UUID-shaped string `session_id`. It ignores malformed input and unmanaged
or non-tmux contexts, reads no transcript, and emits no model context.

## Everyday use

Start a recoverable session from the tmux pane that should own it:

```sh
codex-restore start
# or: codex-restore start --profile builder
```

The wrapper starts normal interactive Codex. When the trusted `SessionStart`
hook fires, it records the Codex UUID, tmux session/window/pane position, and working directory.
It records neither prompts nor transcripts. Sessions launched as plain `codex`
remain unmanaged.

The same hook refreshes the managed pane's record on resume, clear, compact, or
fork. A replacement UUID supersedes the old record for that logical pane.

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
- Capture requires the trusted hook to run. Depending on CLI lifecycle timing,
  this can wait until the first prompt; check `codex-restore list` before relying
  on recovery. Hooks disabled by configuration or policy cannot capture.
- Do not treat a resumed conversation as proof that a partially completed command
  was safe to retry. Reconcile the real workspace first.
