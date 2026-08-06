# Session work-ref (Jira ticket / PR) display

Follow-up to the merged #42 (route-tooltip viewport clamp). Surfaces the Jira
ticket and/or PR a session is working on, in two places on the Night Pass
dashboard: extra line(s) in the car's tooltip, and a small always-visible badge
near the car on the map. Everything is derived from the existing session
`displayName` (the sanitized tmux `window_name` plus a ` · pane <N>` suffix) -
no collector change, no git/branch read, no GitHub/`gh` call.

## Decisions you need from me

Both settled in brainstorming; listed for the record, none open:

1. **Badge placement** - centered just below the car body (chosen) over above the
   car. It reads as a nameplate and stays clear of the car's glyph and S-code; it
   sits in the tooltip's default downward zone, so the badge **fades out while its
   tooltip is open** (the tooltip repeats the ref, so nothing is lost). Cost of
   getting it wrong: badge and tooltip half-overlap on hover.
2. **Edge clipping** - accept a few px of clip for a car at the extreme stage edge
   (chosen) over a JS mini-clamp. The badge is always-visible on a
   continuously-animating car, so a clamp would need per-frame `rAF`; not worth it
   for a tiny decorative label, and the stage's `overflow: hidden` clips cleanly.
   Cost of getting it wrong: needless per-frame JS for a rare, cosmetic case.
3. **Pit cars get the badge too** (added per user request, 2026-08-06). Pit cars
   carry the same ticket/PR work as route cars, so hiding their ref on the map is
   an inconsistency. Consequence: pit cars sit in a compact `.pit-mount` grid
   (`grid-auto-rows: 52px`, ~7px row gap); a below-car badge (~14px) would collide
   with the next row, so the pit grid's **row gap grows** to clear the badge, and
   the lane's bottom padding leaves room for a last-row badge. Cost of getting it
   wrong: badges overlap the pit car in the row below.

## Assumptions I have not verified

- **One window per ticket/PR, ideally one agent pane per window.** The display is
  only as correct as the naming convention. A window running two agent panes shows
  the same ref on both cars (both panes share the window name) - accepted.
- **tmux auto-rename is off** (`set -g automatic-rename off`) or names are set by
  tooling. If auto-rename is on, tmux overwrites the manual ticket name with the
  running command and the ref vanishes. Documented as an operational requirement,
  not enforced in code.
- **The ` · pane <N>` suffix and sanitization do not corrupt the tokens.** The
  parser runs on the full `displayName`; the pane suffix has no digits-after-`PR`
  or `[A-Z]+-\d+` shape, so it cannot be mis-parsed as a ref. Covered by a unit
  test with the suffix present.

## Approach

Pure parse-and-render over existing snapshot data. No collector, `TMUX_FIELDS`,
snapshot-validation, or live-server-security changes. A present PR token means
"a PR is open"; true review-state (approved / changes-requested) is out of scope.

### Naming convention (locked)

- **Jira key**: matches `/[A-Z][A-Z0-9]+-\d+/` (e.g. `BB-228`). Window named e.g.
  `BB-228 route tooltip`.
- **PR token**: matches `/\bPR\s*#?\s*(\d+)/i`, canonical form `PR#42`, added when
  a PR opens, e.g. `BB-228 PR#42 route tooltip`. The key may be kept or replaced;
  the parser handles both.

### What to display (locked - plain text, NO links anywhere)

- **Tooltip lines:** `Jira: BB-228` when a ticket is present; `PR #42` when a PR is
  present; both lines when both are present.
- **On-map badge:** one small label near the car - `PR#42` if a PR token is
  present, else the ticket key `BB-228`, else nothing (no ref → no badge; keeps
  the map clean). PR takes precedence over ticket for the single badge. Applies to
  **both route and pit cars** (see decision 3).

## Components and boundaries

### 1. `parseWorkRef(name)` - `src/session-contract.mjs` (new, exported, pure)

```
parseWorkRef(name: string) -> {
  ticketKey: string | null,   // e.g. "BB-228", or null
  prNumber:  number | null,   // e.g. 42, or null
  label:     string,          // name with recognized tokens stripped + whitespace tidied;
                              // falls back to the full name if nothing parsed or strip is empty
}
```

- `ticketKey`: first match of `/[A-Z][A-Z0-9]+-\d+/`.
- `prNumber`: first match of `/\bPR\s*#?\s*(\d+)/i`, captured group parsed to Number.
- `label`: `name` with the matched ticket and PR tokens removed, collapsed
  whitespace, trimmed. If the result is empty (name was only tokens), fall back to
  the original `name`. Trailing ` · pane <N>` suffix is preserved in `label`.
- Extraction order note: `ticketKey` and `prNumber` are matched independently on
  the raw name. A PR token cannot false-match the ticket regex (the ticket shape
  requires a `-\d+`; `PR#42`/`PR 42` have no hyphen), so a bare `PR#42` correctly
  yields `ticketKey: null`. For `label`, strip BOTH matched spans, then collapse
  whitespace - order does not affect the result, only that both are removed.

Thoroughly unit-tested: ticket-only, PR-only, both, neither, tolerant PR spacing
(`PR 42`, `PR#42`, `PR #42`, `pr42`), token in the middle vs end, label fallback,
and the ` · pane 2` suffix present.

### 2. `buildAccessibleText(...)` - `src/session-contract.mjs` (extended)

Fold `parseWorkRef(session.displayName)` into the accessible `details` string so
screen readers announce the ref. Insert `Jira: BB-228` and/or `PR #42` into
`details` (before the activity line, alongside phase/progress/permission). The
badge itself is `aria-hidden`, so the accessible text is the single source of the
ref for assistive tech.

### 3. `makeTooltip(...)` / `replaceTooltip(...)` - `src/render-dashboard.mjs`

- Bold line becomes `mapCode · <label>` using `parseWorkRef(displayName).label`, so
  the ticket/PR shows once (on its own line) and not duplicated inside the name.
- Render a `Jira: <key>` line and/or a `PR #<n>` line when present (plain text, no
  anchors). `replaceTooltip` renders them on live `update()` (it already rebuilds
  the tooltip via `makeTooltip`, so this is automatic once `makeTooltip` changes).

### 4. Badge in `makeCar(...)` + live-update paths - `src/render-dashboard.mjs`

- A shared helper `applyBadge(wrapper, workRef)` owns the badge lifecycle for both
  car types: create the badge lazily when a ref first appears, update its text when
  the ref changes, and remove it when the ref disappears - so element identity and
  the car's running CSS animation survive live `update()`.
- The badge is a **direct child of the wrapper** (`.vehicle-anchor` for route,
  `.pit-vehicle` for pit), NOT inside the rotating `.car-angle`/`.car-motion`, so
  it stays upright and never inherits the car's rotation.
- Badge text per precedence: `PR#<n>` else `<ticketKey>` else render nothing.
- `aria-hidden="true"` (redundant with the tooltip/accessible text).
- Wiring: `makeCar(...)` calls `applyBadge` for both `target === 'route'` and pit.
  `applyRouteCar(...)` calls it on route live-update; the pit branch of `update()`
  (which today does `replaceTooltip` + `swapStateClass`) also calls it. Both branches
  read the ref once via `parseWorkRef(session.displayName)`.

### 5. `styles.css` - badge styling

- Small, muted pill: subtle background for legibility over the varied track,
  low-contrast text, `font-size` near the `.car-code` scale. Single class shared by
  both car types (e.g. `.car-badge`), positioned relative to the wrapper.
- Positioned centered just below the car body, upright (does NOT inherit the car's
  rotation - it is outside `.car-angle`).
- `pointer-events: none` (must not steal the car button's clicks / 44px hit target
  / pin / hover).
- `max-width` cap so a long-ish ref stays small; accept clean edge clip.
- Fades out (opacity 0) when its car is `:hover` / `:focus-within` /
  `[data-pinned="true"]`, yielding to the tooltip - for both `.vehicle-anchor` and
  `.pit-vehicle`.
- **Pit grid room:** grow `.pit-mount`'s row gap (and, if needed, `.pit-lane`'s
  bottom padding) so a below-car badge clears the next grid row and the last row.
  The badge stays absolutely positioned, so it does not reflow the grid; the gap
  bump only reserves visual room. Verify at the mobile pit grid too (the mobile
  block re-declares `.pit-mount` columns but inherits the base row gap).
- Honor the existing reduced-motion / mobile blocks where relevant.

### 6. `src/fixture-sessions.mjs` - fixtures

Give several fixtures convention-following `displayName`s so all states render in
fixtures: at least one ticket-only (`BB-228 route tooltip`), one with a PR
(`BB-228 PR#42 combined pit`), one PR-only (`PR#57 live adapter`), and leave
several with no ref (badge absent). Include a ` · pane <N>` suffix on at least one.
Ensure at least one **pit-pool** session (idle/error/complete/waiting status) has
a ref, so the pit badge is visible in fixtures, not just route badges.

## Data flow

`displayName` (already in the snapshot) → `parseWorkRef` → `{ticketKey, prNumber,
label}` → consumed by `buildAccessibleText` (a11y string), `makeTooltip` (bold
label + ref lines), and the route badge (precedence text). No new data enters the
system; nothing is fetched.

## Error handling

`parseWorkRef` is total: any string in, a well-formed object out (nulls + label
fallback). No throw path. A name with no recognizable tokens yields
`{null, null, label: name}` → no tooltip ref lines, no badge, unchanged bold label.

## Testing

- **Unit** (`node --test dashboard/tests/*.test.mjs`): exhaustive `parseWorkRef`
  cases (above); `buildAccessibleText` includes the ref; the existing
  regex-asserted tooltip/car CSS/HTML-structure tests in `dashboard.test.mjs`
  updated meaningfully for the new tooltip line(s) and badge element.
- **Routes** (`npm --prefix dashboard run routes:check`): must stay current (no
  route-artifact change expected; assert it).
- **Browser** (`npm --prefix dashboard run test:browser`, ~3 min, ONE foreground
  Bash call, `timeout: 600000`, never backgrounded): assert the new tooltip
  line(s) and the badge in fixtures - for both a route car and a pit car; verify
  the route-tooltip clamp still holds -
  the extra tooltip line makes tooltips taller and it re-measures `offsetHeight` on
  show, so confirm edge cars still do not clip on desktop (1440×900) and mobile
  (390×844).

## Out of scope

- Collector, `TMUX_FIELDS`, snapshot import validation, live-server security model.
- Git/branch reading, GitHub/`gh` calls, true PR review-state.
- Any hyperlinking - all refs are plain text everywhere.

## Operational note (docs, not code)

Add a short note to the dashboard README describing the naming convention (one
window per ticket/PR; key `BB-228`; PR token `PR#42`) and the hard requirement that
tmux auto-rename be off (`set -g automatic-rename off`) or names be tooling-set, so
the window name stays stable for the parser.
