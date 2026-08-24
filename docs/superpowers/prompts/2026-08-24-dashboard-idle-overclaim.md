# The dashboard reports 16 idle sessions it cannot actually see

Paste everything below into a fresh Claude Code session started from
`~/Apps/wezterm-tmux-dotfiles`.

---

## Task

On live data the Night Pass dashboard parks nearly every session in the pit with
the idle glyph `‖`, including sessions that are actively working through a
subagent. The classification is not wrong so much as **overclaimed**: the
classifier has no evidence either way, records that fact honestly, and the
renderer then presents the absence of evidence as a confident "stopped".

This is the same species of defect as the 2026-08-24 review's headline finding
(state that does not reach the eye honestly), and it is worth reading that
review first for context on the state model:
`docs/superpowers/plans/2026-08-24-dashboard-design-review.md`.

**Do not start by editing the classifier.** Two files have to agree, and the one
that will reject your change is not the one you will be editing. See "The trap"
below.

## Reproduce first

This defect cannot be reproduced from fixtures. It only appears against live
tmux, so start there.

```sh
cd dashboard && node serve-live.mjs      # http://127.0.0.1:4173, then click "Go live"
```

Look at the raw titles the classifier is fed:

```sh
tmux list-panes -a -F '#{session_name} ▸ #{window_name} | cmd=#{pane_current_command} | title=#{pane_title}'
```

Then run the real classifier over those panes. This is the measurement that
matters, and it takes seconds:

```sh
cd dashboard && node -e "
import('./src/tmux-classifier.mjs').then(async (m) => {
  const { execSync } = await import('node:child_process');
  const out = execSync(\"tmux list-panes -a -F '#{pane_current_command}\t#{pane_title}'\", {encoding:'utf8'});
  const tally = {};
  for (const line of out.trim().split('\n')) {
    const [cmd, ...rest] = line.split('\t');
    const r = m.classifyPane({ pane_current_command: cmd, pane_title: rest.join('\t') });
    const k = r ? \`\${r.status}/\${r.confidence}/\${r.provenance}\` : '(not tracked)';
    tally[k] = (tally[k]||0)+1;
  }
  console.log(tally);
});
"
```

## Measured evidence

Observed 2026-08-24 against a live 26-pane tmux server, at least one session
running a subagent at the time:

| Classification | Count | Confidence | Provenance |
|---|---|---|---|
| `idle` | **16** | **low** | `tmux_title_static_provider` |
| `active` | 1 | medium | `tmux_title_spinner` |
| not tracked (returns `null`) | 9 | - | - |

Every single idle reading is low confidence and comes from the same branch. Not
one idle reading on the entire board was positive evidence of an idle session.

## Root cause 1: the classifier only ever sees the pane title

`classifyPane` (`dashboard/src/tmux-classifier.mjs:24`) takes one meaningful
input, `record.pane_title`. It never inspects pane output, the process tree, or
child processes. A subagent is a child process, so nothing in this design could
observe it even in principle.

Claude Code sets its tmux title to a spinner glyph (`◐◓◑◒`) while working in the
**foreground**, and to `✳ <task text>` otherwise. Dispatching a subagent does not
put a spinner on the parent's title. So the pane reads `✳ …`, falls past every
positive-evidence branch, and lands here at `tmux-classifier.mjs:71-76`:

```js
if (codexStatic || claudeStatic) {
  return Object.freeze({
    status: 'idle', permissionState: 'unknown',
    confidence: 'low', provenance: 'tmux_title_static_provider',
  });
}
```

`CLAUDE_STATIC` is `/^✳/` (`tmux-classifier.mjs:6`). That one character is
carrying the entire classification.

## Root cause 2: the renderer discards the confidence the classifier recorded

`STATE_PRESENTATION` (`dashboard/src/session-contract.mjs:9-17`) maps `idle` to
the glyph `‖`, a pause symbol, with no reference to `confidence`. A `low`
confidence idle and a `medium` confidence one render identically. The classifier
does the honest thing and the presentation layer throws that away, so sixteen
"could not tell" readings display as sixteen "stopped" readings.

Note the shape of the fix space here: `confidence` is already carried end to end
through the snapshot. Nothing consumes it visually.

## The quieter fragility, worth fixing while you are in here

`pane_current_command` for every Claude Code pane on this machine is the version
string (`2.1.233`, `2.1.241`, …), **not** `claude`. So `COMMANDS`
(`tmux-classifier.mjs:1`) never matches and `commandCandidate` is `false` for
every Claude pane.

Classification therefore rests entirely on the `✳` prefix. If that banner ever
changes, `tmux-classifier.mjs:39` returns `null` and all sixteen panes **vanish
from the dashboard entirely** rather than degrading to `unknown`. The allowlist
that was supposed to be the safety net is dead code in practice.

## The trap that will cost you the session

`validCombination` (`dashboard/src/import-snapshot.mjs:44-58`) is an exact
allowlist of **full tuples**, not of statuses:

```
status | activity.kind | permissionState | confidence | provenance
```

Its seven entries correspond one-for-one to the classifier's seven return
shapes, in a different file, with nothing enforcing the link. So the obvious
one-line fix - returning `unknown` instead of `idle` for the static-provider
branch - produces the tuple:

```
unknown|observed|unknown|low|tmux_title_static_provider
```

which is absent from the allowlist, so `reject()` throws
`SnapshotValidationError(['LIVE_SNAPSHOT_INVALID'])` and the **whole live
snapshot is discarded**. The dashboard goes blank, not wrong. Any classifier
change must land in both files in the same commit.

Also note the two validators speak different vocabularies: `normalizeSnapshot`
uses `FIXTURE_STATUSES` (`session-contract.mjs:21`), which omits `unknown`
entirely, while the live path uses `validCombination`. No single snapshot can
exercise all seven states, so a fixture test will not cover this path.

## Approach

Settle the design before writing code; the cheap fix and the correct fix are not
the same, and which one is right depends on how much you want the dashboard to
claim. Roughly in cost order:

1. **Stop overclaiming.** Either route `tmux_title_static_provider` to `unknown`
   (`?`), or keep `idle` but let low confidence render differently - dimmed,
   outlined, a distinct glyph. Cheapest, and honest, but the board then shows
   sixteen question marks, which may just relocate the problem.
2. **Repair the command allowlist** so identification does not rest on one
   character. Small, independent of 1, and worth doing regardless.
3. **Find a real activity signal.** Pane output churn between polls, or child
   process presence under the pane's pid, would let a subagent-running session
   read as genuinely active. This is the only option that answers the original
   question rather than re-labelling it, and it is materially more work - it
   changes what the collector gathers, not just how it is labelled.

Options 1 and 2 are contained. Option 3 crosses into the collector and deserves
its own decision about whether the dashboard should poll process state at all -
`README.md` documents a deliberate no-server / no-polling transport boundary
that live mode already bends.

## Hard constraints

- **Classifier and `validCombination` change together, in one commit.** See the
  trap above.
- **`confidence` and `provenance` are load-bearing, not decoration.** They are
  how the snapshot records epistemic weakness. Do not drop them to simplify a
  tuple.
- Live mode is opt-in and must stay opt-in. Do not make the dashboard poll
  process state by default.
- Comment blocks stay to 1-2 lines; keep the load-bearing "why". No ticket
  references in source.
- Never modify `CHANGELOG.md` or anything auto-generated.
- Atomic commits, refactors separate from behaviour changes. Do not batch.

## Verification

Both suites must pass before any commit:

```sh
cd dashboard
npm run verify        # expect 279 passing
npx playwright test   # expect 104 passing, 6 skipped
```

Fixtures cannot reach this code path, so a green suite is necessary but not
sufficient. Verify against live tmux with the classifier script above, and state
the before/after tally explicitly rather than claiming it works.

If you add a test, confirm it fails against the pre-change source:

```sh
git stash push -- dashboard/src/tmux-classifier.mjs dashboard/src/import-snapshot.mjs
node --test tests/live-adapter.test.mjs    # expect failures
git stash pop
```

## Out of scope

- **Mobile.** The dashboard is desktop-only (decided 2026-08-24). The mobile CSS
  and the `mobile-chromium` Playwright project stay green as a second-width
  regression net, but mobile layout findings are not defects.
- **Finding 6** of the design review (`preserveAspectRatio="none"`) remains open
  and untouched, with its analysis recorded in the review doc.
- **Refreshing `dashboard/tests/screenshots/`.** Still stale (Jul 27-29) and now
  also predates the merged desktop pass. Procedure is documented at
  `dashboard/tests/BROWSER_VERIFICATION.md:639-682`. Unrelated to this task.
