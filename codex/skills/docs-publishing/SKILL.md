---
name: docs-publishing
description: Use when converting notes, specs, research, or implementation details into polished public documentation. Applies to Markdown, MDX, Starlight/Astro docs, README pages, technical guides, and docs-site publishing workflows.
---

# Docs Publishing

Turn source material into professional documentation that can be published.

## Workflow

1. Identify the target docs system and file conventions.
2. Read nearby docs to match structure, tone, frontmatter, and navigation.
3. Extract the authoritative source material before drafting.
4. Convert content into clear sections with stable headings.
5. Use code blocks for schemas, commands, APIs, class definitions, and config.
6. Remove placeholders, unresolved notes, and unsupported claims.
7. Run the relevant docs build or validation command when available.

## Quality Rules

- Prefer concise technical prose over marketing language.
- Preserve exact values, commands, schema fields, and constraints.
- Cite or link sources when claims come from research or external material.
- Keep docs aligned with code and schemas when both exist.
- Do not invent TODO, TBD, roadmap, or placeholder sections.
- Avoid duplicating large content if a canonical source should be linked instead.

## Starlight / MDX Notes

For Starlight pages:

- include frontmatter with `title` and `description`
- use standard Markdown/MDX headings
- avoid React-only constructs unless the repo already uses them
- verify new pages are reachable through sidebar config or content collections
- run the Astro build when practical

## Escalation

Use higher-effort review if the docs:

- define security, safety, compliance, or standards behavior
- publish schema or API contracts
- summarize research claims that need careful wording
- must resolve conflict between notes, code, tests, and product requirements
- affect release or merge readiness
