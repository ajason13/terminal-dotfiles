---
name: feedback-retention
description: Use when the user asks what was learned from a task, how to self-improve after feedback, or asks Codex to update durable guidance after reviewer, auditor, CI, PR, incident, or implementation feedback. Applies across projects and should be paired with project-specific context or tracker sync when available.
metadata:
  short-description: Turn feedback into durable guidance
---

# Feedback Retention

Use this skill to convert useful feedback into repeatable process, tests, or
project memory. The goal is not to write a retrospective; it is to reduce the
chance that the same class of issue returns in a future project.

## Workflow

1. **Classify the feedback**
   - Blocker: must change current work before sign-off.
   - Non-blocking recommendation: useful but not required for current scope.
   - Future work: should be tracked separately.
   - Process lesson: should change how future tasks are planned, audited, or
     verified.

2. **Find the right durability layer**
   - Tests or verification scripts for behavior that can be enforced.
   - Focused feature docs, requested tracker comments, or ADRs
     for project-specific decisions.
   - Repo guidance such as `AGENTS.md`, `CLAUDE.md`, or local `.agents/skills`
     for recurring project workflow rules.
   - Global Codex skills under `~/.codex/skills` for cross-project habits.
   - Backlog items for useful work that would expand the current task.

3. **Prefer executable protection**
   - Add or update tests for parser edge cases, verifier rules, contract
     checks, regression cases, and fail-closed behavior.
   - Use named tests when audit sign-off depends on proving specific scenarios.
   - Avoid relying only on prose when the failure mode can be checked.

4. **Update the reviewed plan when scope changes**
   - If feedback changes acceptance criteria, verifier architecture, security
     posture, or public claims, update the spec or plan before implementation.
   - For sensitive work, get a focused re-review after fixing blockers.
   - Keep blocker fixes separate from optional hardening so the current scope
     does not silently expand.

5. **Make audit packets self-contained**
   - Include every changed tracked file or explicitly justify omissions.
   - Include full focused diffs or complete coherent excerpts for files the
     reviewer must judge.
   - Include exact verification commands and results, not only summaries.
   - Map named tests to blockers or acceptance criteria when coverage is being
     audited.

6. **Record the lesson**
   - Update the relevant feature document or an explicitly requested tracker; avoid a repository-wide running history.
   - Update global or project-specific skill guidance only for lessons likely
     to recur.
   - Preserve non-goals and deferred recommendations so future agents do not
     mistake them for completed requirements.

## Good Targets

Update durable guidance when feedback reveals:

- A missing verification layer or fail-open test path.
- A recurring audit-prompt omission.
- A repeated PR, merge, release, or tracker synchronization mistake.
- A parser, extractor, schema, or verifier edge case that should be tested.
- A process rule that applies across repositories, not only the current task.

Do not update global skills for one-off implementation details, project-only
terms, or preferences that belong in the repository's own guidance.
