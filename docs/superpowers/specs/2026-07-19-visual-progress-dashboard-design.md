# Visual Progress Dashboard Design

**Status:** PASS / BUILDER AUTHORIZED

## Goal

Add one optional, full-screen visual progress dashboard for multiple LLM sessions.
The primary surface is an original top-down nighttime mountain pass: small cars
show session state by their location, shape, glyph, text equivalent, and subtle
motion. It is a progress surface, not a terminal, chat client, or agent manager.

## Repository facts and placement decision

This is a terminal-dotfiles repository with no existing web app, package
manifest, browser test configuration, or root `CONTEXT.md`. The dashboard will
therefore use a new top-level `dashboard/` directory. That directory is the
complete opt-in boundary: it can be run or removed independently.

No dashboard file is installed or loaded by the existing terminal setup. This
task must not change the README, installers, default terminal startup, tmux or
WezTerm configuration, wallpaper workflow, LLM-status daemon, or CI.

## Technology and files

Use browser-native technology only: semantic HTML, CSS, an original inline SVG,
and vanilla ES modules. Use Node's built-in test runner. Do not add a framework,
design system, package manifest, lockfile, dependency, backend, fetched asset,
generated asset, or product network service.

```text
dashboard/
├── README.md
├── index.html
├── styles.css
├── src/
│   ├── app.mjs
│   ├── session-contract.mjs
│   ├── fixture-adapter.mjs
│   ├── fixture-sessions.mjs
│   ├── track-layout.mjs
│   └── render-dashboard.mjs
└── tests/
    ├── dashboard.test.mjs
    └── screenshots/              # retained desktop/mobile evidence, if used
```

`app.mjs` reads one fixture snapshot, normalizes it, and passes it to the
renderer. `session-contract.mjs` owns enums, validation, normalization, view
models, and accessible labels. Fixture data and its adapter remain separate.
`track-layout.mjs` owns original geometry, deterministic allocation, and
overflow. `render-dashboard.mjs` owns DOM rendering only; it must not import
fixtures or terminal, process, or network APIs. CSS owns visual states,
responsive behavior, and motion.

An ephemeral loopback-only static preview command may be documented as opt-in
local tooling. It is never auto-started and is not a shipped server or daemon.

## Original visual system

The map uses one fixed SVG viewBox and an original road with four named
segments: Lower Hairpins, Cedar Bend, Ridge Run, and Summit Approach. Four
visually separate stationary areas are Permission Checkpoint, Scenic Turnout,
Service Bay, and Summit Overlook. Scenery is decorative and `aria-hidden`.

Pokegents supplies only the abstract observation that a persistent spatial scene
can make multiple agent states glanceable. Do not reuse its code, assets,
dimensions, town layout, grid masks, coordinates, pathfinding, timings, sprites,
names, or iconography. Do not use Pokémon or Initial D characters, logos,
screenshots, track layouts, branded cars, typography, music, or motifs.

## Data and adapter contract

```ts
type SessionStatus =
  | 'active'
  | 'thinking'
  | 'waiting_for_permission'
  | 'idle'
  | 'error'
  | 'complete'

type PermissionState =
  | 'not_required'
  | 'requested'
  | 'granted'
  | 'denied'
  | 'unknown'

interface SessionSnapshot {
  id: string
  displayName: string
  status: SessionStatus
  lastActivityAt: string
  permissionState: PermissionState
  progress?: number
  phase?: string
  errorSummary?: string
}

interface DashboardSnapshot {
  schemaVersion: 1
  generatedAt: string
  sessions: readonly SessionSnapshot[]
}

interface SessionAdapter {
  readSnapshot(): Promise<DashboardSnapshot>
}
```

IDs and names are nonempty strings and timestamps are parseable ISO strings. A
missing `progress` is valid and uses the stable-ID fallback. A present progress
must be a number, finite, and within the inclusive range 0..1. `NaN`, either
infinity, strings, and finite values below 0 or above 1 invalidate the complete
snapshot and produce the visible invalid-snapshot state; they are never clamped
or silently treated as missing. Duplicate IDs, unsupported values, and missing
required fields also fail visibly. `error` requires `errorSummary`.
`waiting_for_permission` requires `requested` or `denied`; every other status
allows only `not_required`, `granted`, or `unknown`. Fixture `generatedAt` is
the deterministic clock for activity-age labels.

`FixtureSessionAdapter` is the only v1 implementation. Rendering receives only
normalized snapshots and never imports tmux/WezTerm code, runs commands,
inspects processes, reads terminal state, or schedules polling.

## State-to-visual and placement contract

| State | Location | Non-color encoding | Motion |
| --- | --- | --- | --- |
| `active` | one of four named route segments (shared route pool) | forward chevron, solid headlights | subtle forward nudge |
| `thinking` | one of four named route segments (shared route pool) | ellipsis and skid-line pattern | deterministic drift sway |
| `waiting_for_permission` | Permission Checkpoint | `!` and barrier hatch | parked |
| `idle` | Scenic Turnout | pause glyph and muted stripe | parked |
| `error` | Service Bay | warning/x and broken outline | parked |
| `complete` | Summit Overlook | check and checker pattern | parked |

`route/ascent` and `route/switchbacks` were visual-treatment descriptions, not
additional locations. Active and thinking cars share one 16-anchor route pool:
exactly four anchors in each of Lower Hairpins, Cedar Bend, Ridge Run, and
Summit Approach. Each stationary zone has exactly six named bays.

For a present progress, the preferred route index is
`min(15, floor(progress * 16))`; progress 1 therefore selects index 15. Missing
progress uses `FNV-1a-32(id) % 16`. Stationary pools use
`FNV-1a-32(id) % 6`. Within each pool, sessions are sorted by stable ID and
collisions use forward circular probing. Active and thinking compete in the
same route pool; parked states never move to a different zone. Do not use
`Math.random()`. Animation affects a nested car body only, never its anchor.

Capacity is enforced only per pool: combined active/thinking is at most 16 and
each individual parked-state pool is at most six. Full geometry therefore
supports 40 sessions (16 route plus four times six parked bays). The canonical
24-session fixture - six active, six thinking, and three in each parked state -
is the visual-regression fixture, not an aggregate cap. When a pool is full,
never cross-map a state or reuse a coordinate: mark excess sessions as `map
capacity exceeded`, show an explicit map indicator, and retain each full session
state in the rail.

## Interaction and accessible text

- Native car buttons are at least 44 CSS pixels, keyboard focusable, and have a
  visible focus treatment.
- Hover/focus shows a tooltip. Enter/Space pins its tooltip and counterpart
  highlight; Escape clears it.
- Duplicate `displayName` values are allowed. Assign unique deterministic map
  codes `S01` through `SNN` by canonical stable-ID sort and show each code on
  both car and rail.
- Each button has a concise `aria-label` ordered as map code, full display name,
  textual state, and route segment or named bay. It is never visually or
  accessibly truncated.
- The connected `aria-describedby` text adds only applicable details in this
  order: permission, phase/progress, snapshot-relative activity age, and error
  summary. Permission is omitted for `not_required`; requested, denied, granted,
  and unknown use explicit plain-language phrases.
- A compact ordered status rail contains map code/glyph, wrapping full name,
  textual state, and location. It is a semantic list, not cards or chat, and
  does not add duplicate tab stops.
- A skip link reaches the session rail. The static fixture screen uses no noisy
  live region.

## Responsive and motion policy

At 760px and wider, the map dominates with a narrow side rail. Below 760px, the
map remains first and full width while the bounded, vertically scrollable rail
stacks below. Long names wrap and the document has no horizontal overflow.

Only `active` and `thinking` animate, subtly and deterministically. Parked states
are static. `@media (prefers-reduced-motion: reduce)` sets all car animation and
nonessential transition to none without changing placement, state, or labels.
Screenshots use reduced motion for determinism. A separate normal-motion check
asserts computed `animation-name` and play state rather than pixel diffs.

## Fixtures

Use a fixed `generatedAt` and the canonical 24-session distribution: six active,
six thinking, and three in each parked state. It covers long names, missing and
boundary progress, optional phase, valid permission variants, and error
summaries. Fixtures contain no timers or polling and remain separate from
rendering.

## Verification contract

Node tests cover all six state mappings, permission/error invariants,
activity-age text, malformed timestamps, duplicate IDs, allowed duplicate
display names with deterministic map codes, unsupported input, a mixed set in
which one session has an invalid non-progress required field, missing
progress fallback, exact progress boundaries 0 and 1, and rejection of `NaN`,
both infinities, strings, -0.01, and 1.01. Layout tests assert FNV-1a fallback,
exact route/zone capacities, the canonical 24 unique anchors, a 40-session
within-pool no-overflow set, deterministic hash/progress collision tie-breaking
under input reordering, route session 17 overflow, each stationary state's
session 7 overflow, and complete rail detail
for overflowed sessions. Long accessible names and motion-policy metadata are
also tested.

CSS exposes solid color tokens for rail text/surfaces, every state glyph/text
and immediate car background, focus indicators, and adjacent surfaces. A
dependency-free Node test reads those tokens and calculates WCAG relative
luminance and contrast: normal text and state glyphs must reach 4.5:1; focus
indicators and meaningful non-text boundaries must reach 3:1 against adjacent
colors.

Browser checks at 1440x900 and 390x844 verify nonblank map-dominant framing,
all car/rail equivalents, in-map non-overlapping car bounds, no document
overflow or clipped rail, long-name handling, computed non-`none` animation and
running play state for active/thinking only, `animation-name: none` under reduced
motion, and desktop/mobile screenshots. A manual desktop/mobile audit covers
contrast in normal, hover, focus, pinned, error, and overflow states plus a
VoiceOver sanity pass over the longest combined accessible text.

Implementation verification commands include `node --check` for every module,
`node --test dashboard/tests/*.test.mjs`, available Playwright/browser checks,
and the repository's existing shell, script, Lua, and Neovim checks. Build,
lint, and type commands are N/A where the zero-build stack has no toolchain;
dependencies must not be added merely to create those commands.

The final diff is audited for network APIs, analytics, child processes,
tmux/WezTerm imports, polling/timers, new dependencies, and protected-file
changes. Lead review also explicitly confirms that no public-reference
coordinates, timings, asset names, or external asset URLs were carried over.

## Future read-only adapter seam

A separately approved future adapter may normalize an externally produced,
read-only snapshot. UI modules must never parse terminal titles. Existing tmux
signals are lossy and title-first, collapse panes by precedence, and do not
reliably provide thinking/error/complete, stable identity, permission,
progress, error detail, or activity timestamps. Pane/window IDs are mutable.

Any tmux command, polling, WezTerm callback, process inspection, collector,
watcher, daemon, navigation, or control is a separate future task.

## Observability

A visible invalid-snapshot error is sufficient for fixture v1. No analytics,
remote logging, network telemetry, metrics, or background diagnostics are
needed.

## Non-goals

- Live tmux/WezTerm/process integration or terminal control.
- Agent session cards, chat, transcripts, prompts/completions, or faux terminal.
- Authentication, persistence, telemetry, remote logging, cloud services, or
  product network services.
- Installer, startup, tmux, WezTerm, wallpaper, daemon, status, README, or CI
  changes.
- Frameworks, design systems, dependencies, copied layouts, or branded assets.

## Gate and role exceptions

Claude returned FAIL on the first QA-planning review. The three blockers were
accepted and resolved: named route/pool capacity, strict progress invalidity,
and contrast verification. Claude re-review returned PASS with no blockers.
The four non-blocking clarifications above are accepted. **Builder may begin.**

> PASS — all three original blockers (route/pool capacity arithmetic, strict
> fail-visible progress validation, and dependency-free contrast verification)
> are resolved with concrete, testable specifications; Builder may begin
> implementation per the plan, and the listed non-blocking items should be
> tracked as follow-up polish rather than gating conditions.

The orchestration API could not preserve hyphenated native agent names and did
not expose child model/reasoning metadata. Checked-in role pins exist, but their
runtime use is unconfirmed; no model substitution is claimed.
