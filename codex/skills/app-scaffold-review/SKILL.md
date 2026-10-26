---
name: app-scaffold-review
description: Use when evaluating, planning, or scaffolding a new app idea, prototype, frontend, tool, SaaS product, dashboard, game, or MVP. Covers scope selection, stack fit, first-screen usability, implementation review, and build verification.
---

# App Scaffold Review

Help turn an app idea into a usable first version or review an existing scaffold for viability.

## Workflow

1. Identify the target user, primary workflow, and minimum useful outcome.
2. Inspect any existing repo before choosing a stack or pattern.
3. Define the smallest usable app surface, not a landing page unless requested.
4. Match implementation choices to the existing framework and design system.
5. Build or recommend complete core interactions, empty states, and error states.
6. Verify with local build/dev commands when implementing.
7. Summarize what works, what remains risky, and the next useful iteration.

## Product Guidance

- Make the first screen useful for the actual workflow.
- Prefer boring, reliable architecture over novelty.
- Keep MVP scope narrow but complete enough to exercise the core loop.
- Avoid decorative UI that obscures data, controls, or user tasks.
- Treat authentication, payments, persistence, and deployment as explicit decisions.

## Frontend Guidance

- Follow existing component and styling conventions.
- Use real controls for real actions: buttons, menus, tabs, inputs, toggles, sliders.
- Use icons from the existing icon library when available.
- Ensure text fits at mobile and desktop sizes.
- Verify visual output with a browser or screenshot tooling when practical.

## Review Checklist

- Can a user complete the primary workflow?
- Is the data model sufficient for the workflow?
- Are loading, empty, error, and success states represented?
- Does the implementation match the repo's existing stack?
- Can it be run locally with documented commands?

## Escalation

Use higher-effort review when the task involves:

- implementing non-trivial code
- complex state, data modeling, real-time behavior, AI integrations, or payments
- production deployment choices
- security, privacy, or sensitive user data
- debugging failing builds or tests
