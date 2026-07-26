# Codex Role Routing

Use the role requested by the user. Choose a delivery mode before delegating.
Do not silently change an agent's model or reasoning effort; record an
unavailable model or effort as an exception in the handoff.

## Advisor Mode (Default)

Use Advisor Mode for scoped, low-risk work: routine bug fixes, local tooling,
documentation, small UI changes, and exploration. One accountable primary owns
the task and consults only the specialist needed for a bounded question.

- Use `builder` as primary for implementation, debugging, tests, and docs.
- Use `lead-architect` as primary for an ambiguous decision or small spec.
- Use `deep-researcher` for evidence-backed research before recommendations.
- Treat specialist output as advice, not automatic authorization. The primary
  records the decision, assumptions, and verification in the normal handoff.
- Do not add a coordinator or independent QA gate unless the task warrants it.

## Gated Delivery Mode

Use Gated Delivery for new architecture, cross-module/public contracts,
privacy, safety, security, licensing, auth, payments, external integrations,
release candidates, or any task the user explicitly asks to independently
review. The Lead Architect selects this mode and defines the gate.

1. `deep-researcher` provides evidence when research is material.
2. `lead-architect` creates the approved scope, constraints, acceptance
   criteria, and verification plan.
3. Obtain the required independent QA/audit review before implementation.
4. `builder` implements only the approved scope and records verification.
5. `workflow-coordinator` records status, evidence, and handoffs without
   changing technical direction.

## Role Boundaries

- Research-only tasks: use `deep-researcher` before making recommendations.
- Architecture, specs, or ambiguous planning: use `lead-architect`.
- Notion, status, handoffs, and release checklists: use `workflow-coordinator`.
- Code changes, debugging, tests, CI, and documentation: use `builder`.
- For mixed work, the Lead Architect defines the plan; the Builder implements
  it only after any selected gate has passed.

For a guaranteed top-level role pin in the CLI, start the session with
`codex-role <role>` instead of relying on task wording.
