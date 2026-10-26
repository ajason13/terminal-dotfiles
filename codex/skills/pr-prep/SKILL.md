---
name: pr-prep
description: Use when preparing, summarizing, or creating a pull request from local repository changes. Covers diff inspection, PR title/body drafting, test evidence, risk notes, and gh pr create usage.
---

# PR Prep

Prepare pull requests from the actual repository state.

## Workflow

1. Inspect branch and worktree:
   - `git status --short --branch`
   - `git diff --stat`
   - `git diff --cached --stat` when staged changes exist
2. Review the relevant diff before drafting:
   - `git diff`
   - `git diff --cached` if committing or creating a PR from staged changes
3. Identify unrelated local changes and leave them alone.
4. Verify or summarize tests/builds already run. If no verification was run, say that clearly.
5. Check observability impact for implementation PRs: if the diff adds runtime behavior, failure modes, external integrations, long-running work, operator workflows, or sensitive data handling, note whether logs/debugging/metrics/diagnostics were added, already exist, are unnecessary, or are deferred.
6. Draft a concise PR title and body.
7. Create the PR when authorized by the task or standing delivery policy. Honor reviewed head SHA and required checks before enabling native auto-merge.

## PR Body Shape

Use this structure unless the repository has a stronger template:

```md
## Summary
- ...

## Verification
- ...

## Risk / Notes
- ...
```

Keep summaries specific to the diff. Do not claim tests passed unless they were run and succeeded in the current context.

## Quality Rules

- Lead with what changed and why.
- Mention user-facing behavior, docs, schemas, tests, and migration impact when relevant.
- Mention observability impact when runtime behavior changed, especially new logs/debugging hooks or an intentional “no new observability needed” decision.
- Include exact verification commands and outcomes.
- Call out skipped tests or blocked verification.
- Avoid implementation trivia unless it helps reviewers.
- Do not include unrelated worktree changes in the PR.

## Escalation

Use higher-effort review before creating or summarizing the PR if:

- the PR affects security, data contracts, migrations, infrastructure, billing, auth, or safety behavior
- tests fail or were not understood
- the diff is too large to summarize confidently
- reviewer/auditor sign-off is required before merge
