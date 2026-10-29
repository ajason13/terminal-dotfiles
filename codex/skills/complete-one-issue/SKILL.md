---
name: complete-one-issue
description: Complete exactly one Ready GitHub issue through the current repository's AI SDLC, including implementation, verification, required review, PR delivery, and completion tracking. Use when asked to select and deliver the next issue; excludes backlog-only planning or review-only requests.
---

# Complete One GitHub Issue

When invoked, carry out the following request in the current project. Follow applicable repository instructions and existing delivery authority; this skill does not grant additional permissions.

Complete one GitHub issue through this repository’s AI SDLC.

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
complete delivery under existing authority and branch protections.

Confirm the PR actually merged into main before marking implementation Done.
Update the issue with completion evidence and identify the next recommended
issue. If safe, leave the checkout on updated main.

Stop after this one issue. If blocked or usage limits prevent completion,
record the exact state and next action in the issue and a local checkpoint.
Do not start another issue.
