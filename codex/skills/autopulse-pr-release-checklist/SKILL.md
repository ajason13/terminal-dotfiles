---
name: autopulse-pr-release-checklist
description: Check AutoPulse diagnostic, packaging, and docs evidence before a pull request or release decision.
metadata:
  short-description: Check AutoPulse delivery evidence
---

# AutoPulse Delivery Evidence

Use repository AGENTS.md for the delivery loop and the existing PR template.
Include only evidence relevant to the changed surface:

- Schemas, adapters, validation, exports: read-only diagnostic/security tests and
  data-contract regression evidence.
- Packaging: archive contents, offline installation, dependency/license checks,
  and supported-platform evidence required by the selected release contract.
- Public docs: the affected Starlight build and browser checks.
- Runtime diagnostics: sanitized observability changes or why existing
  diagnostics suffice.

Security, schema, safety, and release changes require the repository's fresh
Codex review. Preserve qualified-human, real-hardware, and hosted release
evidence requirements. Merge approval alone never authorizes a release or a
vehicle connection. Follow global delivery authority for scoped PR operations.
