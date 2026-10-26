---
name: audit-response
description: Use when responding to reviewer or auditor feedback, including audit findings, bug reports, regression reports, adversarial tests, or requested fixes after review.
---

# Audit Response

Treat audit feedback as a defect hypothesis until verified.

## Workflow

1. Parse each finding into:
   - claim
   - affected files or behavior
   - severity
   - reproduction or evidence needed
2. Inspect the relevant code and tests before making changes.
3. Reproduce the issue when practical using the smallest targeted command.
4. Patch only the affected area unless the fix requires a broader contract change.
5. Add or update focused tests when the finding exposes missing coverage.
6. If the finding or fix changes runtime behavior, error handling, privacy/security boundaries, external integrations, or operator workflows, check whether logging/debugging/diagnostics also need to change.
7. Run targeted verification first, then broader suites when the blast radius warrants it.
8. Summarize the outcome as fixed, not reproducible, accepted risk, or escalated.
9. When a finding exposes a repeatable process gap, use `$feedback-retention`
   or the project's context-sync workflow to capture the lesson in durable
   guidance instead of relying on chat memory.

## Response Format

When reporting back:

```md
Findings addressed:
- ...

Verification:
- ...

Notes:
- ...
```

For code-review style responses, lead with remaining bugs or risks. If no issues remain, say that clearly and note any unrun tests.

## Handling Findings

- Do not dismiss a finding without checking the code path.
- If the auditor is wrong, explain the exact evidence.
- If the finding is valid, fix behavior before polishing style.
- If a fix changes a public contract, update docs or schemas as needed.
- If a fix changes a failure path, ensure observability remains useful and safe; add logs/debug hooks only when they help diagnose the new path without leaking sensitive data.
- If a fix introduces a new verifier, parser, checklist, or review mechanism,
  make sure the mechanism is covered by the reviewed plan or explicitly record
  it as a scope decision. Add negative-path tests for the mechanism when
  practical.
- Preserve unrelated user changes in the worktree.
- Avoid broad refactors during audit response unless they are necessary to make the fix correct.

## Verification Standards

Prefer commands that directly exercise the finding:

- single failing test or test file
- schema validation case
- build/lint command for touched surface
- regression test added for the reported edge case

Escalate to broader verification when the fix touches shared validation, data models, API boundaries, security checks, or replay/control flow.

## Escalation

Escalate to architecture or user guidance if:

- the finding conflicts with product requirements
- the correct behavior is ambiguous
- fixing the issue requires changing a standard, schema, or security policy
- the test suite cannot be run and merge readiness depends on it
