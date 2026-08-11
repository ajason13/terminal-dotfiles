# Codex Role Routing

Use the role requested by the user. Choose a delivery mode before delegating.
Do not silently change an agent's model or reasoning effort; record an
unavailable model or effort as an exception in the handoff.

## Advisor Mode (Default)

Use Advisor Mode for scoped, low-risk work: routine bug fixes, local tooling,
documentation, small UI changes, and exploration. One accountable primary owns
the task and consults only the specialist needed for a bounded question.
Advisor Mode permits at most one specialist, and that specialist must not
delegate recursively.

- Use `builder` as primary for implementation, debugging, tests, and docs.
- Use `lead-architect` as primary for an ambiguous decision or small spec.
- Use `deep-researcher` for evidence-backed research before recommendations.
- Treat specialist output as advice, not automatic authorization. The primary
  records the decision, assumptions, and verification in the normal handoff.
- Do not add a coordinator or independent QA gate unless the task warrants it.
- Treat workflow coordination as a brief intake or final synchronization step,
  not a persistent agent alongside routine implementation.

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

Use only the roles and gates required by the risk. Gated Delivery does not
authorize every role to run for every task, nested delegation, or duplicate
repository review.

## Delegation And Usage Efficiency

Default to a single accountable primary. Delegate only when there is a named,
bounded question or an independent unit of work with a material quality or
elapsed-time benefit. Subagents each perform their own model and tool work, so
parallelism is not a token-saving mechanism.

- Prefer subagents for independent exploration, focused test or log analysis,
  and other read-heavy work that would pollute the primary thread.
- Avoid subagents for sequential phases, small changes, routine status sync,
  or work that requires each agent to reread the same context.
- Use `gpt-5.6-terra` at `medium` for coordination, documentation, status,
  routine inspection, and ordinary supporting work.
- Use `gpt-5.6-luna` at `low` only for validated mechanical, repeatable, or
  high-volume chores.
- Use `gpt-5.6-sol` at `medium` for normal behavioral implementation,
  debugging, and tests; escalate to `high` for architecture, security, public
  contracts, ambiguous regressions, or release blockers.
- Reserve `gpt-5.6-sol` at `xhigh` for material multi-source research.

Keep one chat per coherent outcome and compact long threads. Scope prompts to
the relevant files and sources, keep active `CONTEXT.md` files concise, nest
project instructions near the code they govern, and disable MCP servers that
are not needed for the current session.

## Role Boundaries

- Research-only tasks: use `deep-researcher` before making recommendations.
- Architecture, specs, or ambiguous planning: use `lead-architect`.
- Notion, status, handoffs, and release checklists: use `workflow-coordinator`.
- Code changes, debugging, tests, CI, and documentation: use `builder`.
- For mixed work, the Lead Architect defines the plan; the Builder implements
  it only after any selected gate has passed.

For a guaranteed top-level role pin in the CLI, start the session with
`codex-role <role>` instead of relying on task wording.
