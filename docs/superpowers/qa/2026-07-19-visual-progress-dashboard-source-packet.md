# Visual Progress Dashboard QA Source Packet

**Purpose:** Self-contained source context for pre-implementation Claude QA
planning. No implementation diff exists.

**Gate:** PASS / BUILDER AUTHORIZED. Claude re-review found no blockers.

## Repository and working state

The repository is macOS terminal dotfiles for WezTerm, tmux, Neovim, and Codex.
It has no root `CONTEXT.md`, package manifest, web application, or browser-test
configuration. Existing CI checks shell files, repository scripts, a Neovim
headless load, and pure-Lua WezTerm tests.

The worktree was dirty before this task: README, installers, and an anime
background manifest are modified, and `codex/` is untracked. These changes are
user-owned and excluded from dashboard scope.

Relevant source facts:

- `codex/AGENTS.md` assigns research to `deep-researcher`, architecture to
  `lead-architect`, coordination/state to `workflow-coordinator`, and code/tests
  to `builder`; unavailable model/effort pins must be recorded.
- `wezterm/modules/general.lua` starts or attaches tmux session `main`; WezTerm
  tabs are hidden and tmux owns windows/panes.
- `tmux/tmux-llm-status` classifies title/command heuristics into active,
  present, and waiting, scans windows every second, and writes tmux options.
- `tmux/tmux.conf` consumes those options in the status bar and starts the
  existing status daemon.
- `.github/workflows/ci.yml` has no JavaScript or browser job.

## Existing telemetry limitations

Terminal titles are mutable vendor behavior. Current signals cannot reliably
distinguish `active` from `thinking`, and ready/idle/action-required states are
collapsed. Error and complete are not reliably observable. Pane/window IDs are
not durable, window precedence can hide pane states, and current output lacks
stable session identity, permission metadata, progress/phase, error detail, and
trustworthy activity timestamps.

No live integration is proposed. These facts only shape a future adapter seam.

## Approved product and isolation

The product is one map-dominant, full-screen, nighttime mountain-pass progress
surface. Cars represent sessions on an original route or in named stationary
zones. There are no agent cards, chat, transcript, prompt/completion view, faux
terminal, management control, or landing-page content.

The top-level `dashboard/` directory is the complete optional boundary. It is
independently runnable/removable and must not change or hook into README,
installers, startup, tmux, WezTerm, wallpaper workflows, daemon/status behavior,
CI, processes, network services, persistence, auth, analytics, or logging.

The implementation uses only semantic HTML, CSS, original inline SVG, vanilla
ES modules, and Node built-in tests. No package manifest, dependency, framework,
backend, or fetched/generated/branded asset is allowed.

## Approved data contract

Statuses: `active`, `thinking`, `waiting_for_permission`, `idle`, `error`, and
`complete`.

Permission states: `not_required`, `requested`, `granted`, `denied`, and
`unknown`.

Each session has a nonempty stable ID and display name, status, parseable ISO
activity timestamp, permission state, optional validated progress, optional
phase, and optional error summary. Missing progress hashes by stable ID. Present
progress must be a finite number within inclusive 0..1 or the snapshot fails
visibly; it is never clamped. Error requires a summary; waiting requires
requested or denied permission, while other statuses allow only not-required,
granted, or unknown. A schema-v1 dashboard snapshot includes a
parseable `generatedAt`, used as the deterministic clock, and a readonly session
array. Duplicate IDs fail visibly; duplicate display names are allowed. Every
invalid field on any session - including malformed timestamp, missing required
field, invalid status, progress, or permission - invalidates the whole snapshot
visibly. A mixed valid/invalid set cannot partially render.

The only v1 adapter reads a fixed fixture snapshot once. Rendering receives
normalized snapshots and has no access to fixtures, terminal code, commands,
processes, network APIs, or polling.

## Approved map, states, capacity, and interaction

The original route segments are Lower Hairpins, Cedar Bend, Ridge Run, and
Summit Approach. Stationary areas are Permission Checkpoint, Scenic Turnout,
Service Bay, and Summit Overlook.

| State | Location | Required non-color signal | Motion |
| --- | --- | --- | --- |
| active | one of four named segments; shared route pool | forward chevron/headlights | subtle nudge |
| thinking | one of four named segments; shared route pool | ellipsis/skid pattern | drift sway |
| waiting_for_permission | checkpoint | `!`/barrier hatch | none |
| idle | turnout | pause/muted stripe | none |
| error | service bay | warning/x/broken outline | none |
| complete | summit | check/checker | none |

The shared active/thinking route pool has 16 anchors, four in each named
segment. Each stationary zone has six bays. Present progress maps to
`min(15, floor(progress*16))`; missing progress uses FNV-1a-32 modulo pool size.
Canonical-ID sorting plus forward circular probing resolves collisions. The
capacity is enforced per pool only: route total <=16 and each parked state <=6.
The full geometry supports 40 sessions. The canonical fixture - 6 active, 6
thinking, and 3 per parked state - is a 24-session visual-regression fixture,
not an aggregate cap. N+1 overflow is explicit and retains every rail detail.

Decorative SVG is hidden from accessibility APIs. Meaningful cars are 44px
native buttons with visible focus, full accessible labels, described tooltips,
and Enter/Space pin plus Escape clear. The compact ordered rail is not cards or
chat and adds no duplicate tab stops. Names wrap and remain complete.
Duplicate names are distinguished by unique deterministic map codes `S01`
through `SNN`, assigned by canonical stable-ID sort and shown on car and rail.
The concise aria-label contains map code, full name, state, and location;
ordered described details contain applicable permission, phase/progress,
activity, and error text.

At 760px and wider the map dominates beside a narrow rail. On smaller screens
the map remains first and the bounded rail stacks below. There is no document
horizontal overflow. Only active/thinking animate. Reduced-motion CSS disables
animation and nonessential transitions without altering semantics or placement.

## Approved verification

Node tests cover six-state mappings, invariants, labels/activity age, malformed
timestamps, strict progress validity and missing fallback, invalid/duplicate
input, exact pool capacity, collision/reorder determinism, 24 canonical unique
anchors, a 40-session within-pool no-overflow set, N+1 overflow with rail detail,
duplicate-name map codes, an invalid non-progress field in a mixed set, long
names, and motion policy. CSS-token tests
calculate WCAG contrast without dependencies: 4.5:1 for text/glyphs and 3:1 for
focus/meaningful non-text boundaries. Browser checks cover 1440x900 and
390x844, normal/reduced motion, nonblank framing, semantic car/rail equivalents,
in-map non-overlapping bounds, clipping/overflow, long names, computed animation,
and screenshots. Normal motion is checked through computed animation name/play
state, not screenshot diffs. Manual checks cover normal, hover, focus, pinned,
error, and overflow contrast states and the longest
accessible text with VoiceOver. The full existing repository suite runs after
implementation.

The final diff must be searched for network APIs, analytics, child processes,
tmux/WezTerm/process access, polling/timers, packages/dependencies, daemons, and
protected-file changes.

## Public reference and IP boundary

Primary reference pages inspected:

- https://github.com/tRidha/pokegents/blob/main/README.md
- https://github.com/tRidha/pokegents/blob/main/dashboard/web/src/components/TownView.tsx
- https://github.com/tRidha/pokegents/blob/main/dashboard/web/src/types.ts
- https://github.com/tRidha/pokegents/blob/main/dashboard/web/src/hooks/useAgentState.ts
- https://github.com/tRidha/pokegents/blob/main/dashboard/web/package.json
- https://github.com/tRidha/pokegents/blob/main/THIRD_PARTY_NOTICES.md
- https://github.com/tRidha/pokegents/blob/main/LICENSE

Only the high-level idea of a spatial glanceable state surface transfers.
Pokegents code, assets, layout, dimensions, masks, coordinates, algorithms,
timings, sprites, names, and iconography do not. Pokémon/Initial D characters,
logos, screenshots, tracks, cars, type, music, and branded motifs are excluded.
Final review explicitly checks for copied coordinates, timings, asset names, and
external asset URLs.

## Known unknowns and exceptions

- The canonical visual-regression fixture has 24 sessions. Per-pool limits
  allow 40 total when every pool is filled; capacity is not unlimited.
- Browser tooling is locally present but is not a repository dependency.
- Node is locally available but is not currently a documented root requirement.
- Hyphenated native agent names could not be preserved by orchestration.
- The runtime did not expose or confirm configured model/reasoning pins. No
  substitution is claimed.
- Claude CLI is unavailable on the user's free plan. Manual Claude Chat is the
  next gate owner.

## Review inputs

Also supply:

- `docs/superpowers/specs/2026-07-19-visual-progress-dashboard-design.md`
- `docs/superpowers/qa/2026-07-19-visual-progress-dashboard-claude-qa-planning.md`

The initial Claude verdict was FAIL. The three blockers were resolved, and
Claude re-review returned PASS with no blockers. All four non-blocking
clarifications are accepted. **Builder may begin.**

> PASS — all three original blockers (route/pool capacity arithmetic, strict
> fail-visible progress validation, and dependency-free contrast verification)
> are resolved with concrete, testable specifications; Builder may begin
> implementation per the plan, and the listed non-blocking items should be
> tracked as follow-up polish rather than gating conditions.
