---
name: complete-one-issue
description: Complete exactly one Ready GitHub issue through the current repository's AI SDLC, including implementation, verification, required review, PR delivery, and completion tracking. Use when asked to select and deliver the next issue; excludes backlog-only planning or review-only requests.
---

# Complete One GitHub Issue

Complete one GitHub issue through the current repository's AI SDLC. Follow applicable repository instructions and delivery authority, including the owner-approved private repository fallback below.

Read applicable AGENTS.md instructions and check usage allowance before
starting. Confirm the Git remote and inspect the worktree. Preserve unrelated
changes. Start from current origin/main using a focused task branch or isolated
worktree.

Review open issues, dependencies, and relevant merged PRs. Select the next
Ready issue using explicit execution order, then priority, risk, and user value.
Do not select work blocked by dependencies or unresolved decisions. Identify
the chosen issue and acceptance criteria before implementation.

Implement the smallest complete change, run proportional verification, perform
required review, and resolve material findings. Update the issue with material
progress, blockers, verification, and linked follow-ups. Create a linked PR and
complete delivery under the applicable merge authority and branch protections.

## Merge delivery

Before merging or enabling native auto-merge, verify the repository, PR author,
base branch, exact reviewed head SHA, required checks and reviews, and merge
eligibility. Prefer native auto-merge when available and authorized.

An explicit owner invocation of this skill to deliver an issue in an
`ajason13`-owned private repository authorizes a direct PR merge when native
auto-merge is disabled or unavailable. Apply this fallback only to an
`ajason13`-authored PR for the selected issue. Use a repository-allowed merge
method and bind the merge to the reviewed head, for example with
`gh pr merge --match-head-commit <reviewed-sha>`. A changed head requires
reverification and any required review before delivery. Honor branch
protections, required human approvals, and any explicit instruction to hold
the merge. If the PR is blocked, record the blocker and next action.

Confirm the PR actually merged into main before marking implementation Done.
Update the issue with completion evidence and identify the next recommended
issue. If safe, leave the checkout on updated main.

Stop after this one issue. If blocked or usage limits prevent completion,
record the exact state and next action in the issue and a local checkpoint.
Do not start another issue.
