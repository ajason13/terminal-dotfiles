# Working with Codex

This is the human operator guide for the personal-project workflow. Read it
when needed; agents do not need to load it on every task. Global `AGENTS.md`
owns delivery authority and usage policy. Each project's `AGENTS.md` owns its
commands and domain constraints. Configuration and role profiles own model
settings. Historical handoffs are reference material.
GitHub Issues are the running source of truth for repository work; local
checkpoints carry only the context needed to resume a session.

## Start a normal task

Open the individual repository as your Codex project or working directory:

| Project | Local directory | Project-specific guidance |
| --- | --- | --- |
| AutoPulse | `autopulse/` | `AGENTS.md`, `CONTRIBUTING.md`; Python and docs subproject setup |
| Chart the Course | `chart-the-course/` | `AGENTS.md`, `CONTRIBUTING.md`; Node from `.nvmrc` |
| Swing Sync | `swing-sync/` | `AGENTS.md`, `CONTRIBUTING.md`; Node from `.nvmrc` |

For example, from the directory containing the repository checkouts:

```sh
cd swing-sync
codex-budget status
codex
```

In the desktop app, select the repository folder and create a new chat. In
the CLI, `codex` uses your saved defaults; `/status` shows the active model and
limits. `codex-role build` explicitly selects the implementation profile.
Use the model picker or `/model` to adjust effort for difficult work.
`codex-role architect` and `codex-role research` start read-only planning or
research sessions; they are optional, not stages every task must pass.

A good starting request is short and concrete:

```text
Implement [issue URL or one change]. Done when [observable acceptance criteria].
Relevant area: [files, screen, error, or issue].
Follow current AGENTS.md, preserve unrelated work, verify the change,
and complete the scoped PR delivery when checks and required review pass.
```

For investigation without implementation, say "Diagnose ..." or "Review ...".
Codex should inspect relevant files, clarify material ambiguity, implement
within scope, test, review, and report delivery state. You do not need to
repeat global rules, select specialist roles, paste old context histories, or
run commands yourself unless access or a product decision needs your input.

## Track and order work

At intake, confirm the repository from its Git remote and identify the issue
before implementation. Search open and recently closed issues and check current
code and merged PRs before creating anything. Update a matching issue instead
of duplicating it. An implementation request authorizes tracking that scoped
work; organizing a backlog alone does not authorize implementing it.

Keep one issue per independently implementable and verifiable outcome, usually
one focused PR. Use a parent tracking issue only when several tasks contribute
to a larger outcome. Write issues for a fresh session using this format:

```md
## Problem or desired outcome
State whether this is a confirmed bug, proposed improvement, research question,
or human decision. Identify assumptions that still need evidence.

## Evidence and affected surfaces
Include relevant code paths, behavior, issue/PR links, or reproduction steps.

## Scope and exclusions
Define the focused outcome and what belongs in separate follow-up issues.

## Acceptance criteria
- [ ] Observable, checkable conditions for this outcome.

## Dependencies and execution order
Depends on: linked issues, or none. Record priority separately from order.

## Verification and required review
Name proportional checks, required review, and any unresolved decision.

## Status and next action
Record the workflow state and the next concrete action.
```

Use **Backlog → Ready → In progress → In review → Done**. Backlog includes
untriaged findings and blocked or optional work. Ready requires actionable
criteria and verification, satisfied dependencies, and no blocking decision.
In progress means implementation or investigation is underway; In review means
the result is awaiting required checks, review, or merge. Implementation is
Done only when acceptance criteria are met, required checks pass, required
review is resolved, and the linked PR is merged. Research and decision issues
need recorded evidence or a decision satisfying their criteria.

Reuse existing labels and milestones. For a larger backlog, use outcome-based
milestones ordered by dependencies, risk, and user value, with optional future
work outside the immediate milestone. Use native issue dependencies when
available, otherwise linked “Depends on” entries. Reuse an appropriate existing
GitHub Project; if none fits, keep status in issue bodies or comments. No new
Project or second tracking system is required.

During delivery, record material findings, blockers, verification, and scope
changes in the issue. Preserve relevant existing content and explain material
scope changes. Link newly discovered out-of-scope work as follow-up issues;
tracking a recommendation does not authorize implementing it. Link each PR to
its issue, using `Closes #N` only when merging that PR will satisfy all completion
criteria. A queued auto-merge is still In review.

At a stopping point, update the issue with what is complete, what remains,
verification, blockers, and the next concrete action. Keep secrets, sensitive
data, raw logs, and unnecessary conversation history out of GitHub. If access
is unavailable, save ready-to-submit drafts and their order under the Git
directory, continue authorized local work where possible, and report exactly
what was not published. Reconcile the drafts with existing issues when access
returns before publishing them.

To organize a repository's backlog without implementing it, use:

```text
Use GitHub Issues as the running source of truth for this repository's work.
Confirm the target from its Git remote and follow applicable AGENTS.md.
Review this conversation, repository instructions, open and recently closed
issues, current code, and relevant merged PRs. Update matching issues before
creating new ones, and do not reopen work already completed by newer code.

You may create and update scoped issues, labels, and milestones. Do not implement
changes, close unresolved issues, or modify unrelated work. Preserve relevant
existing content and explain material scope changes.

Use the issue format and workflow in this guide. Distinguish confirmed bugs,
proposed improvements, research questions, and human decisions. Keep each issue
suitable for one independently verifiable outcome. Reuse labels, milestones,
and an appropriate existing Project. Record dependency order separately from
priority; keep optional future work outside the immediate milestone.

Report created or updated issue links, recommended order and dependencies,
the next ready issue, unresolved decisions, and access limitations. If access
is unavailable, prepare local ready-to-submit drafts and an ordered backlog,
and clearly state that nothing was published. Do not include sensitive data.
```

## Continue work

Keep the same chat for the same unfinished outcome. In the desktop app, reopen
it from recent chats. From the correct repository in the CLI:

```sh
codex resume
codex resume --last
codex resume <session-id>
```

The picker is safest if several chats are active. `--last` chooses the latest
interactive chat for the current directory. Use an explicit session ID from a
budget-runner checkpoint to resume that non-interactive session. Always check
the current branch and worktree: the transcript does not freeze repository
files. For an old chat, ask Codex to reconcile current `AGENTS.md` with the
actual worktree before continuing.

If starting a fresh chat for unfinished work, name its PR/branch and provide
only the relevant checkpoint:

```text
Continue [issue URL] on [branch/PR]. Read the issue and [specific checkpoint path].
Inspect the current worktree and confirm what remains before editing; do not
repeat completed commits, PR creation, or merges.
```

When context gets crowded, `/compact` summarizes the current chat. It does not
restore plan allowance. Before stopping a long task, ask for a short local
checkpoint containing the issue URL, branch/commit, unfinished criteria,
verification, and next action; update the issue's stopping-point status too.
Persistent Codex memories are disabled in this setup; there is
no requirement to maintain a MEMORY.md or root CONTEXT.md.

## Run unattended tasks

Use the [budget runner guide](codex-budget.md) for the full behavior and limits.
Put one bounded task in a local file outside the repo, then run:

```sh
codex-budget run --repo /absolute/path/to/repo --task /absolute/path/to/task.md --wait
```

The runner requires a clean repository or isolated worktree. Keep it running
in a terminal or tmux. It checks real usage before each task, waits for a
reported reset when requested, and rechecks before proceeding. The default
wait bound is 24 hours; a weekly reset may require `--max-wait-hours 168`.
Ordinary interactive chats do not gain automatic wait/resume from this command.

The printed checkpoint path is under the repository's Git common directory.
An interrupted or failed task requires inspection and an explicit resume;
the runner automatically resumes only waiting work that has not started.
Task boundaries are guarded; a running task can exceed the reserve.

## Dependency updates and merging

Use `$dependabot-merge` in the project chat:

```text
Use $dependabot-merge to triage open Dependabot PRs.
```

That request reports candidates without merging. To authorize eligible patch
updates, say "Use $dependabot-merge to merge eligible patch updates in this
repository." Minor, major, failing, conflicted, or unusual updates remain held
for review. A request covering multiple repositories must name them.

For ordinary implementation, standing authority covers scoped commits, task
branches, PR creation, and protected auto-merge for your own PRs. Required CI
and review must pass. Creating a PR or enabling auto-merge is not proof that
the change is merged; the final report must distinguish those states. Releases
and real-hardware operations retain their separate project requirements.

## Troubleshooting

| Symptom | First action |
| --- | --- |
| Wrong files, branch, or instructions | Confirm the project directory and run `git status --short --branch`; ask Codex to read current `AGENTS.md`. |
| Wrong model after resuming | Check `/status`; use `/model`. A saved chat may retain its earlier selection. |
| Missing skill | Check `/skills` or type `$`; reopen the session if discovery has not refreshed. Skill folders must contain a real `SKILL.md`; folder symlinks are supported. |
| Missing `codex-budget` or `codex-role` | Check that `~/.local/bin` is on PATH and the links target this checkout; ask Codex to repair only those links. |
| Unknown usage, timeout, or sign-in error | Check `/status` or Settings → Usage and Codex sign-in; retry the read-only query after restoring access. Unknown usage stops unattended work. |
| Runner rejects a dirty worktree | Preserve the existing changes; use an isolated worktree or resume their task. Do not reset or stash blindly. |
| Runner lock remains | Inspect its recorded PID and processes; remove only a verified stale lock. |
| Required CI fails | Have Codex inspect the first relevant failure and fix the cause. Do not bypass protection or repeatedly rerun unchanged code. |
| Auto-merge stays queued | Check required jobs, conflicts, review conversations, and current ruleset check names; ask Codex to diagnose the specific PR. |
| Approval reviewer denies an action | Inspect the denial and scope. Use a narrower authorized operation; approve a retry only after understanding the boundary. |

Useful diagnostic request:

```text
Diagnose this session/tooling problem: [exact command or symptom]. Inspect
current configuration, installed links, and relevant logs. Preserve user work
and secrets. Explain the cause and apply a scoped fix if it is within this task.
```

## Maintain the setup

The dotfiles README describes installation. Link mode links entire skill
folders so Codex can discover them. Copy mode installs regular files. Replaced
skill directories are backed up outside discovery under
`~/.codex/skill-backups/`; retired skills are under `~/.codex/skill-removed/`.
Reinstalling backs up and removes the retired workflow-coordinator agent and
profile, including copies left by older installations. `uninstall-macos.sh
--restore-latest` restores the prior agent tree and profile when backups exist.
Avoid importing the retired multi-agent setup or recreating its tracker gates.

Official references: [projects and chats](https://learn.chatgpt.com/docs/projects),
[session commands](https://learn.chatgpt.com/docs/developer-commands), and
[skill discovery](https://learn.chatgpt.com/docs/build-skills).
