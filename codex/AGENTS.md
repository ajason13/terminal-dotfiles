# Single-Agent Codex SDLC

One Codex session owns one behavior change per PR. Configuration owns model
pins; use the default for routine delivery and a higher-effort profile for
architecture or difficult regressions. Report unavailable model settings.

## Default Delivery Loop

1. **Intake:** state the goal, affected repository or files, risk, acceptance
   criteria, and intended verification. Confirm the Git remote and identify
   the matching issue before implementation; create one if needed under the
   tracking rules below.
2. **Inspect:** read the relevant instructions and code before editing; retain
   repository conventions and unrelated user changes.
3. **Plan:** for a non-trivial change, name the smallest safe approach and
   non-goals. Reuse existing abstractions, keep responsibilities clear, and
   avoid speculative frameworks. Apply DRY, KISS, and SOLID where they simplify
   the actual change.
4. **Implement:** make the smallest complete change. Do not expand scope
   without user direction. Record material findings, blockers, verification,
   and scope changes in the issue; link follow-up issues for out-of-scope work.
5. **Verify:** run focused tests, build, lint, or a manual check proportional
   to risk. Add regression coverage for changed behavior. Run focused checks
   during iteration and required broader checks before completion; investigate
   failures rather than repeatedly rerunning them.
6. **Review and hand off:** inspect the final diff for regressions, security,
   public-contract impact, duplication, and documentation needs. Report files
   changed, verification, assumptions, and residual risk. Link the PR to its
   issue and record what is complete, what remains, and the next concrete action.

## GitHub Issues Work Tracking

Use GitHub Issues as the running source of truth for repository work. For
authorized implementation or backlog organization, scoped issue creation and
updates are authorized; create labels or milestones only when materially useful.
A backlog-only request does not authorize implementation or unresolved closure.

Before creating issues, read repository instructions, search open and recently
closed issues, and check current code and merged PRs for work already addressed.
Update matching issues, preserve relevant content, and explain material scope
changes. Distinguish confirmed bugs, proposed improvements, research questions,
and human decisions; label assumptions as unverified.

Use one issue per independently implementable and verifiable outcome, normally
one focused PR. Use a parent issue only for several contributing tasks. Include
the problem or outcome, evidence and affected surfaces, scope and exclusions,
checkable acceptance criteria, dependencies, proportional verification, and
required review or unresolved decisions. A fresh session must be able to act
without the original conversation.

Reuse existing labels and milestones. Group larger backlogs into outcome-based
milestones, ordered by dependencies, risk, and user value; keep optional future
work outside the immediate milestone. Record execution order separately from
priority using native dependencies when available or linked “Depends on” entries.

Use Backlog → Ready → In progress → In review → Done. Ready means actionable
criteria and verification, satisfied dependencies, and no blocking decision.
Reuse an appropriate existing GitHub Project; otherwise record status in the
issue without creating another tracking system. Mark implementation Done and
close its issue only after criteria are met, required checks pass, required
review is resolved, and the linked PR is merged. Research and decision issues
require recorded evidence or a decision satisfying their criteria.

At a stopping point, update the issue with completion, remaining work, blockers,
verification, and next action. Keep local Git-directory checkpoints for resuming
sessions, not as a second backlog. If GitHub is unavailable, save ready-to-submit
issue drafts and ordering under the Git directory, continue authorized local
work where possible, and report that tracking updates were not published.
Never publish secrets, sensitive data, or unnecessary conversation history.

## Risk-Triggered Fresh Review

For authentication, authorization, security, privacy, safety, payments,
licensing, data migrations, public APIs or schemas, release candidates, or a
user-requested review, use a fresh-context Codex review after implementation.
Give that review the acceptance criteria, final diff, and verification output.
It is a Codex review, not an external-model or Notion gate; resolve material
findings before handoff.

## Usage And Context

Before large work and between tasks, use `codex-budget status --model <active-model>`
when installed, otherwise `/status` or Settings → Usage. Never infer remaining
allowance from tokens. Start queued work only above 30% in every applicable
window. At 15–30%, finish the current task. Below 15%, save a checkpoint and
stop starting work. At a limit, wait for the reported reset and recheck both
windows. Missing usage data is unknown, not permission for an unattended run.
Do not purchase credits or redeem resets automatically.

Read relevant files and bounded tool output; load skill details only when
needed. Keep required rules here, specialized procedures in skills, commands
in scripts/CI, and model pins in configuration. At a pause, keep a local note
under the Git directory with branch/commit, remaining criteria, verification,
and next action. Do not recreate a repository-wide history file.

## Standing Delivery Authority

For an implementation task in a repository owned by `ajason13`, scoped edits,
verification, focused commits, pushing a task branch, PR creation, and enabling
native auto-merge for `ajason13` PRs are authorized after required checks and
reviews pass. Recheck the repository, author, base, and reviewed head SHA;
respect branch protections and never include unrelated work. A request for
advice or review alone does not authorize publishing. Release publication,
destructive changes, and work outside the task remain separate decisions.
Dependabot has separate eligibility rules in its merge skill.

Do not delegate by default. A single explicit subagent is allowed only for a
bounded, independent question where context isolation materially improves the
outcome; it must not delegate further. Keep one chat per outcome, compact long
threads, and read historical handoffs only when relevant. Do not use Notion or
external-model workflows unless the user explicitly requests them.

For a guaranteed top-level model pin, use `codex-role <research|architect|build>`.
