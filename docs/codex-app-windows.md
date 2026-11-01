# Codex app on Windows

Use one local Codex project for each application repository. Keep GitHub Issues
as the durable backlog and use one chat per issue. Resume an unfinished issue's
existing chat. Use the current checkout for sequential work; select Worktree
when independent work needs isolation.

## Install the shared workflow

From this checkout in PowerShell:

```powershell
.\scripts\install-codex-windows.ps1 -WhatIf
.\scripts\install-codex-windows.ps1
```

The installer copies `codex/AGENTS.md` to `~/.codex/AGENTS.md` and every tracked
skill folder to `~/.agents/skills`. Copies avoid Windows symlink privileges.
Rerun after pulling changes to refresh them. Identical content is skipped;
changed destinations are moved to `~/.codex/setup-backups/<unique-id>/` before
replacement. Unrelated skills and the existing app configuration are preserved.
For rollback, restore the affected saved target from that backup directory;
newly installed targets have no previous version to restore.

Open a fresh chat after installation; restart the app if skill discovery has
not refreshed. Confirm Complete One GitHub Issue appears in the skill selector.

## Daily work

Open the application folder, select its model and effort in the app, and use:

```text
Use $complete-one-issue to deliver the next Ready issue in this repository.
Follow current AGENTS.md, verify the change, complete authorized PR delivery,
and stop after this issue.
```

For a new idea, use the App Scaffold Review skill to define the smallest usable
version, then record independently verifiable outcomes as GitHub Issues.
Keep application commands and boundaries in that application's `AGENTS.md`.
Use the connected GitHub tools for issues and PRs; operations those tools do
not support require another authenticated client or a reviewable draft.

The macOS `codex-role`, tmux restore hook, and `codex-budget` runner are not
installed by this script. Use the app model picker and Settings > Usage.
Unknown allowance must not be represented as a successful budget check.
Installing this workflow does not start background issue delivery.

## Project environments

Use the app's local-environment settings to create setup scripts and Run,
Build, and Test actions, then check the generated `.codex` configuration into
the individual application repository. Use the repository's declared runtime,
not a single global Node version: Chart the Course uses Node 24 and Swing Sync
uses Node 22. AutoPulse documents native PowerShell setup in its getting-started
guide and uses `.venv\Scripts\python.exe` for verification.

References: [skill discovery](https://learn.chatgpt.com/docs/build-skills),
[local environments](https://learn.chatgpt.com/docs/environments/local-environment),
and [worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees).
