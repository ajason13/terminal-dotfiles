---
name: local-dev-handoff
description: Use when documenting, fixing, or explaining local development setup, environment requirements, build/test commands, dev servers, package managers, Node/Python versions, nvm usage, Docker, or README handoff instructions.
---

# Local Dev Handoff

Make local setup and verification reproducible for the next developer.

## Workflow

1. Detect the project root and relevant subproject root.
2. Identify the package manager, runtime versions, and lockfiles.
3. Read existing README, scripts, Docker files, and config before changing docs.
4. Verify commands when practical:
   - install
   - build
   - test
   - dev server
   - preview or production run
5. Document exact commands from the correct directory.
6. Include environment setup such as `nvm`, `.env`, Docker, or services.
7. Call out commands not run and why.

## Node / nvm Pattern

When a shell does not automatically load `nvm`, use:

```sh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm use
```

Then run project commands from the directory that contains the relevant `package.json`.

## Documentation Rules

- Put durable setup instructions in the repo README or project-specific README.
- Link focused repository decisions where needed; update external trackers only when requested.
- Do not duplicate long command lists across multiple sources unless necessary.
- Prefer copy-pasteable command blocks.
- Include expected local URLs for dev servers.
- Mention required versions only when known from files or verified output.

## Escalation

Use higher-effort review if:

- build or test failures need code changes
- dependency versions conflict
- Docker or CI behavior differs from local behavior
- setup touches secrets, production infrastructure, or deployment
- the handoff affects release or merge readiness
