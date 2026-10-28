# Night Pass dashboard future work

## Current outcome (2026-10-27)

This list records an earlier baseline, not pending implementation. The rejected
Lantern Coil reversal was integrated in
[c21b671](https://github.com/ajason13/terminal-dotfiles/commit/c21b671).
Harbor Yard Rallycross later shipped in
[316e4a9](https://github.com/ajason13/terminal-dotfiles/commit/316e4a9); the current
catalog has three courses. Neutral screenshot-state assertions shipped in
[2d9daa5](https://github.com/ajason13/terminal-dotfiles/commit/2d9daa5) and two-course
breakpoint clearance/overlap checks in
[709d0b7](https://github.com/ajason13/terminal-dotfiles/commit/709d0b7).

Only extending those matrices to Harbor Yard remains as
[#99](https://github.com/ajason13/terminal-dotfiles/issues/99). Use
[GitHub Issues](https://github.com/ajason13/terminal-dotfiles/issues) as the active
backlog and the [dashboard guide](../../../dashboard/README.md) for current behavior.
The stash warning below remains historical recovery guidance, not an instruction
to restore the two-course catalog.

## Original candidates (historical)

At the time of writing, these candidates were unimplemented and unauthorized:

1. Remove the rejected Lantern Coil course from current `main` and restore the
   catalog to Ridge Pass and Cypress Run without reverting any newer dashboard
   work. A start prompt is available at
   `docs/superpowers/prompts/2026-08-07-dashboard-two-course-reversal.md`.
2. Strengthen neutral screenshot-state assertions.
3. Add permanent breakpoint focus-clearance and pairwise phased-overlap
   assertions at 759/760px and 959/960px.

The named Git stash `pre-pull dashboard reversal and future-work prompt
2026-08-07` preserves the complete pre-pull worktree for recovery and evidence.
It is based on an obsolete dashboard baseline and must not be popped or applied
wholesale onto current `main`.
