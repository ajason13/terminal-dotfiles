# Start prompt: dashboard breakpoint regression hardening

Executing this prompt requires separate, explicit user authorization. This
document records a possible task and does not authorize implementation.

## Objective

Harden the Night Pass dashboard Playwright regression suite at breakpoint pairs
`759/760` and `959/960`. This is test-hardening work only. Preserve the runtime
as exactly two courses in fixed order: Ridge Pass, then Cypress Run.

## Scope and constraints

- Limit changes to the smallest necessary Playwright test and browser
  verification documentation paths. Do not change runtime source, compiler
  source, route source, generated geometry or motion, HTML, CSS, package files,
  build configuration, or screenshots.
- Keep all nine existing screenshot files byte-identical. Do not capture,
  refresh, rename, add, or delete screenshots.
- Use synthetic fixture and synthetic live-import inputs only. Do not invoke
  the collector or access a real/default tmux server, socket, client, session,
  pane, or environment.
- Cover both retained courses in fixed Ridge Pass/Cypress Run order at every
  required width and in normal-motion, reduced-motion, and registered-property
  fallback states.
- Add permanent assertions for the complete focus-ring exterior clearance
  against the map-stage boundary and for pairwise phased-target overlap among
  every simultaneously visible route target. Assertions must identify the
  viewport, course, state, phase/frame, and limiting target pair on failure.
- Preserve current runtime behavior, layout, allocation, accessibility,
  animation timing, focus/hover/pin/tooltip behavior, Cypress mobile scaling,
  and item 5 import/source lifecycle contracts. Add no runtime observability,
  dependencies, network access, polling, persistence, or terminal integration.

## Git safety

Before editing, inspect `git status --short` and preserve all unrelated tracked
and untracked work. Do not use `git reset`, `git checkout`, `git restore`,
`git stash`, `git revert`, or broad cleanup commands. Do not stage, commit,
push, fetch, rebase, or merge unless the user separately authorizes that exact
action. Keep edits inside the approved test-hardening paths and report any
scope exception before taking it.

## Acceptance and verification

- The new browser assertions execute at `759`, `760`, `959`, and `960` pixels
  for Ridge Pass and Cypress Run, using synthetic fixture and synthetic-live
  data in normal, reduced, and fallback states.
- Focus-ring exteriors remain contained and pairwise phased targets do not
  overlap. The suite has zero failures, skips, todos, browser console warnings
  or errors, and uncaught page errors.
- The two-course runtime and all nine screenshot bytes remain unchanged, and
  no real/default tmux endpoint is contacted.
- Run and report:

  ```sh
  npm --prefix dashboard run routes:check
  npm --prefix dashboard run test:unit
  npm --prefix dashboard run test:browser
  rg --files dashboard -g '*.mjs' | xargs -n1 node --check
  git diff --check -- dashboard/tests/browser/dashboard.spec.mjs dashboard/tests/BROWSER_VERIFICATION.md
  shasum -a 256 dashboard/tests/screenshots/*.png
  lsof -nP -iTCP:43917 -sTCP:LISTEN
  lsof -nP -iTCP:43918 -sTCP:LISTEN
  git status --short
  git diff --cached --name-only
  ```

Remove generated Playwright reports/results after verification without touching
unrelated files. Return exact changed files, test counts, failures/skips/todos,
console/page-error results, screenshot hash comparison, clear-port evidence,
warnings, residual risk, and any scope exception.
