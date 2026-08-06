# Session tooltip declutter

Follow-up to the merged #43 (session work-ref display). Prunes the car tooltip
down to information that is actually per-session, and makes the window name the
heading. Nothing new enters the system: this is a presentation change over data
already in the snapshot, plus a README note so window names are chosen to suit
the new heading.

Observed problem (live tmux session, window named `BB-325`):

```
S08 · · pane 1
Active · Pass Ladder, Route Slot 5
Jira: BB-325
Permission state unknown. Observed: Aug 6, 2026, 3:16:25 PM PDT (0 seconds ago)
```

Four of the five visible facts are noise or duplication, and line 1 carries a
dangling separator.

## Decisions you need from me

All settled in brainstorming; listed for the record, none open:

1. **The ref becomes the heading when no name text survives the strip** (chosen)
   over a `pane N` fallback heading or a heading-less shape. With the map code and
   the pane index both removed, a bare-ref window name leaves nothing else to show.
   Cost of getting it wrong: an empty or stub bold line on the most common live
   session shape.
2. **`aria-label` on the car button is left exactly as it is** - it keeps the map
   code, the full `displayName` (pane suffix included), and the full location. A
   screen-reader user cannot see the map, so those are real information there;
   only the *visible* tooltip is pruned. Cost of getting it wrong: an
   accessibility regression sneaks in behind a cosmetic change.
3. **`formatActivityAge` is not modified.** The "just now" wording is applied
   where the tooltip label is built, not baked into the shared age formatter that
   the source-age readout and existing tests depend on. Cost of getting it wrong:
   a visual tweak silently changes an unrelated readout.

## Assumptions I have not verified

- **One agent pane per tmux window.** Removing the pane index means two agent
  panes in the same window produce identical tooltips - same heading, same ref,
  same status. Accepted knowingly: the car body still shows the distinct map code
  (`S08` / `S09`), and `dashboard/README.md` already prescribes one agent pane per
  window. This is the one thing the change gives up.
- **`Phase:` / `Progress:` are worth keeping.** They are absent from live tmux
  sessions (the classifier never sets them) and present on fixtures, which is why
  the screenshot shows neither. They carry genuine signal, so pruning them was not
  part of the ask and is not in scope.
- **The location line matters only on overflow.** For a placed car the track
  segment and route slot are map decoration - the user is already pointing at the
  car. For an overflowed car the location text is the only explanation of why it
  is not on the map, so it must survive there.
- **Every visible tooltip string is asserted somewhere in the suite.** The
  permission line, the `Observed:` label, and the `mapCode · ` heading prefix
  appear in `tests/dashboard.test.mjs`, `tests/renderer-lifecycle.test.mjs`,
  `tests/multi-track.test.mjs`, and the browser specs. Each needs a meaningful
  update, not deletion.

## Target shape

```
window "BB-325"            window "BB-228 PR#42 route tooltip"   window "scratch"
─────────────────          ───────────────────────────────────   ────────────────
BB-325                     route tooltip                         scratch
Active                     Active                                Idle
Seen just now              Jira: BB-228 · PR #42                 Seen 4 minutes ago
                           Seen just now
```

Overflowed car keeps its location:

```
BB-512
Idle · Pit is at capacity
Seen 2 minutes ago
```

Line by line:

- **Heading** - the window name with the recognized ref tokens *and* the trailing
  ` · pane <N>` suffix stripped, whitespace collapsed. When the strip leaves
  nothing, the ref itself is the heading (`BB-325`, or `PR#42` for a PR-only
  window). No map code, no pane index, no dangling separator.
- **Status line** - the state label alone. `· <location>` is appended only when
  `placement.overflow` is true.
- **Ref line** - `Jira: BB-228 · PR #42` on one line (either half alone when only
  one is present). Omitted entirely when the ref is already the heading, so the
  same token never appears twice.
- **Freshness** - `Seen just now` under 60 seconds, otherwise `Seen <relative>`
  (`Seen 4 minutes ago`). The exact timestamp remains in the `<time datetime>`
  attribute, so assistive tech and native hover still expose it.
- **Permission line** - removed. `unknown` means "the classifier could not tell",
  and when the state *is* meaningful the status label already reads "Waiting for
  permission".

## Components and boundaries

### 1. `parseWorkRef(name)` - `src/session-contract.mjs` (extended)

Currently `label` deliberately *preserves* the ` · pane <N>` suffix (per the #43
spec) and can leave a leading separator behind when the name was only a ref. Both
change:

- Strip a trailing ` · pane <N>` suffix (the shape `sanitizeDisplayName` appends
  in `src/tmux-classifier.mjs:93`) before tidying.
- Strip orphaned leading/trailing `·` separators left behind by token removal.
- `label` falls back to `''` (empty string), not to the original name, when
  nothing survives - callers decide the fallback. This is the behavioral break
  that makes a ref-as-heading possible, and it is why every `parseWorkRef` caller
  must be re-checked.

Return shape is otherwise unchanged: `{ ticketKey, prNumber, label }`. Still
total - any string in, a well-formed object out, no throw path.

### 2. `buildAccessibleText(...)` - `src/session-contract.mjs` (changed)

- Drop `permissionText` from `details` (and delete the now-unused helper).
- `activity.label` for the `observed` kind becomes `Seen`. `last_activity` /
  `last_response` kinds keep their existing `Last active` / `Last response`
  labels.
- `activity` gains a `relative`-derived `short` field: `just now` for ages under
  60 seconds, otherwise the existing `relative` string verbatim. `exact`,
  `relative`, and `datetime` all stay on the object - nothing is removed, so the
  `aria-label`/details path and any other consumer keep the precise wording.
- `label` (the `aria-label`) is untouched - see decision 2.
- Expose enough on the returned object for the renderer to build the heading
  without re-parsing: `workRef` already carries `{ticketKey, prNumber, label}`, so
  the renderer derives the heading from it.

### 3. `makeTooltip(...)` - `src/render-dashboard.mjs` (restructured)

- Heading: `text.workRef.label` when nonempty, else `PR#<n>`/`<ticketKey>` via the
  same precedence `badgeLabel` already uses (PR wins). Drop the `mapCode · `
  prefix.
- Status line: `presentation.label`, plus `· ${text.location}` only when the
  placement overflowed. `buildAccessibleText` must therefore surface the overflow
  flag alongside `location`, rather than the renderer re-deriving it.
- Ref line: single span joining the present halves with ` · `; skipped when the
  heading fell back to the ref.
- Details span: phase/progress stay inline, then the activity, then the error
  summary. The permission prefix disappears automatically once
  `buildAccessibleText` stops emitting it - the `text.details.split(...)` seam in
  `makeTooltip` keeps working, since it splits on `. ${activity.label}:`.

`appendActivity(...)` changes shape. Today it emits `<label>: <exact> (<relative>)`;
it becomes `<label> <time>{short}</time>` - e.g. the text `Seen ` followed by a
`<time>` whose visible text is `just now` and whose `datetime` is the ISO
`activity.datetime`. The `exact` string moves to the `<time>` element's `title`, so
the precise timestamp stays reachable on hover and to assistive tech without
occupying a line. Note the details-split seam above keys on `${activity.label}:`
with a colon - dropping the colon from the rendered output means that seam must be
kept in sync or replaced with a structural split.

`replaceTooltip` needs no change; it already rebuilds through `makeTooltip`.

### 4. `src/render-dashboard.mjs` - overflow summary

The overflow list builds entries from `session.displayName` directly
(`render-dashboard.mjs:356` and `:456`). Left as-is: that is a separate summary
surface listing cars that could not be placed, where the full name and map code
are the point.

### 5. `dashboard/README.md` - naming guidance (user-requested)

Extend the existing "Show a session's Jira ticket / PR" section so the convention
reflects that the window name is now the tooltip *heading*:

- State that the tooltip heading is the window name with the ref and pane suffix
  removed, so a short human-readable phrase after the ref is worth adding -
  `BB-228 route tooltip` reads better than bare `BB-228`.
- State the bare-ref fallback explicitly: a window named only `BB-325` shows
  `BB-325` as its heading, which is correct but tells you nothing beyond the
  ticket.
- State that the tooltip no longer shows the pane index, so **one agent pane per
  window** moves from "ideally" to a real recommendation - two panes in one window
  give two identical tooltips.
- Keep the existing auto-rename requirement (`set -g automatic-rename off`)
  as-is.

## Data flow

`displayName` (already in the snapshot) → `parseWorkRef` (now also strips the pane
suffix and orphaned separators) → `{ticketKey, prNumber, label}` → consumed by
`buildAccessibleText` (a11y string + activity label) and `makeTooltip` (heading,
ref line). The on-map badge keeps reading the same `workRef` and is unaffected.
Nothing is fetched; no collector, snapshot-schema, or live-server change.

## Error handling

No new throw paths. The one hazard is `label: ''`: any caller that assumed a
nonempty label now needs a fallback. The renderer's heading is the only consumer
that must handle it, and it does so via the ref-precedence fallback; the badge
path never reads `label`.

## Testing

- **Unit** (`node --test dashboard/tests/*.test.mjs`): `parseWorkRef` gains cases
  for the pane-suffix strip, the orphaned-separator strip, and the empty-label
  fallback; existing cases asserting the preserved suffix are updated, not
  deleted. `buildAccessibleText` asserts no permission text, the `Seen` label, and
  the "just now" band boundary at 59s/60s. The tooltip-structure assertions in
  `dashboard.test.mjs`, `renderer-lifecycle.test.mjs`, and `multi-track.test.mjs`
  are updated to the new heading and lines.
- **Routes** (`npm --prefix dashboard run routes:check`): expected to stay
  current; assert it.
- **Browser** (`npm --prefix dashboard run test:browser`, ~3 min, ONE foreground
  Bash call, `timeout: 600000`, never backgrounded): the work-ref spec at
  `tests/browser/full-bleed-layout.spec.mjs:173` asserts `Jira: BB-410` and
  `PR #63` on separate lines and must move to the joined form. Add an assertion
  that no tooltip contains "Permission" or "Observed". Re-verify the route
  tooltip clamp on desktop (1440×900) and mobile (390×844): tooltips get
  *shorter*, which changes the `offsetHeight` flip decision in
  `render-dashboard.mjs:265`, so the open-up/open-down behavior near the top edge
  needs a fresh look rather than an assumption.

## Out of scope

- The `aria-label` content (decision 2), and the overflow summary list.
- Removing `Phase:` / `Progress:`.
- The on-map badge - unchanged in placement, precedence, and styling.
- Collector, `TMUX_FIELDS`, snapshot validation, live-server security model.
- Any hyperlinking; refs stay plain text everywhere.
