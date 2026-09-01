# Night Pass dashboard: the 16 idle sessions it cannot see

Investigation and implementation plan. Measured against a live 25-pane tmux
server (tmux 3.6a) on 2026-08-24. Nothing is implemented yet.

## Decisions you need from me

1. **Take the real activity signal, not the relabel.** The briefing priced
   "find a real activity signal" as materially more work than relabelling.
   That pricing rested on a premise I measured and found false. The real signal
   is `#{window_activity}` - one extra tmux format field in the *same* one-shot
   `list-panes -a` call, no polling, no pane content, no process inspection.
   It is now the *cheapest* option that is also correct.
   **Recommend: yes.** Cost of getting it wrong: you ship 16 question marks
   instead of 16 wrong pause glyphs and the board still tells you nothing.
2. **Let `activity.at` carry the real last-activity time, not `observedAt`.**
   Today every live session reports "Seen: just now" because the collector
   stamps `observedAt` on all of them - a session silent for 8 hours claims it
   was seen this second. That is the *same* overclaim as the pit glyph, in the
   tooltip. Fixing it means relaxing the import rule
   `session.activity.at === snapshot.observedAt`.
   **Recommend: yes**, same commit family. Cost of skipping: you fix the glyph
   and leave the identical lie one hover away.
3. **Still render `confidence`?** **Decided: yes, included here** (my
   recommendation was to defer; overruled). Low and none confidence render as
   unsettled - dashed state ring, dimmed car, `unconfirmed` in the tooltip and
   the accessible label.

## Assumptions I have not verified

- That `#{window_activity}` behaves the same on tmux 3.7, which `README.md`
  names as the version the collector's byte-length behaviour was verified
  against. I measured 3.6a, which is what is installed here.
- That a 60s threshold is right. I have one board's spread, not a distribution
  over days. The gap on today's board is wide (38s → 122s) but that is one
  sample.
- That Codex panes behave like Claude Code panes under this signal. Every
  agent pane on this machine is Claude Code; I have no live Codex pane, so the
  `CODEX_STATIC` branch is reasoned about, not measured.
- That no agent pane is ever left with a sibling pane that emits output on its
  own (a `tail -f`, a watch loop). That would mark its window active. See
  "The one honest limitation".

---

## What I measured

Live tally from the real classifier over the real tmux server:

```
{ '(not tracked)': 8, 'idle/low/tmux_title_static_provider': 17 }
```

17 idle readings, all `low` confidence, all from one branch. Zero positive
evidence anywhere on the board. Pane `%382` - the pane running the session
that wrote this document, mid-task - reads `idle`.

## Three claims in the briefing that the measurement contradicts

**1. "A subagent is a child process, so nothing in this design could observe it
even in principle."** The first clause is false. No `claude` process on this
machine has a `claude` child; subagents run in-process.

Worse, the proposed remedy is an anti-signal. Every Claude Code pane
*permanently* holds 1-5 children - `testRailMcp`, `playwright-mcp`,
`@upstash/context7-mcp`, `caffeinate` - alive whether or not the agent is
working:

```
claude pid=10292 children=3  claude -w BB-260
     -> npm exec playwright run-test-mcp-server
     -> npm exec @upstash/context7-mcp
     -> uv tool uvx --from git+https://github.com/ajason14/testRailMcp@v0.6.0
```

Child-process presence would classify every agent pane as active, forever. It
is not merely insufficient; it inverts the defect.

**2. "`pane_current_command` is the version string, so `COMMANDS` is dead
code."** True, and the allowlist is dead. But the process is not hidden - it is
cleanly named one level down from `#{pane_pid}`:

```
pane_pid=97379  -zsh
   child: 10292 claude -w BB-260
```

tmux reports `2.1.233` because Claude Code renames its own process. So the
allowlist *is* repairable. It just stops being load-bearing once decision 1
lands, which is a better outcome than repairing it.

**3. "Pane output churn between polls" is a live option.** It is not.
`README.md:10` promises "no ... pane-content access" and the collector section
states "It never reads pane content or history." `capture-pane` hashing breaks
a documented guarantee and needs cross-poll state the one-shot collector does
not have. Ruled out on contract, not on cost.

## The signal the briefing did not consider

`#{window_activity}` is a per-window epoch of last output. It is pane
*metadata*, exactly the category the collector already reads, and it costs one
field in the existing single `list-panes -a` call.

Two samples ~51s apart, `advanced` = the field moved, `age` = silence at the
second sample:

```
%382  advanced=58    age=0s        2.1.241   Workflow/Dashboard   <- writing this
%569  advanced=78    age=0s        2.1.241   E2E/PR
%562  advanced=58    age=0s        2.1.241   E2E/BB-577
%445  advanced=101   age=23s       2.1.233   E2E/PR
%480  advanced=93    age=32s       2.1.235   E2E/PR
%552  advanced=92    age=34s       2.1.241   E2E/Update
%558  advanced=89    age=38s       2.1.241   E2E/PR
%459  advanced=1800  age=51s       2.1.241   Scrum/Weekly
%2    advanced=0     age=122s      2.1.241   E2E/Debug
%81   advanced=0     age=123s      2.1.226   E2E/Notion-Jira
%373  advanced=0     age=237s      2.1.228   Workflow/New
%432  advanced=0     age=237s      2.1.232   Workflow/Org
%464  advanced=0     age=19446s    2.1.234   Manual/BV
%398  advanced=0     age=19582s    2.1.228   Manual/TestRail
%457  advanced=0     age=19686s    2.1.233   Scrum/Standup
%448  advanced=0     age=28626s    2.1.233   Career/2026
%451  advanced=0     age=28626s    2.1.233   Career/Keep
```

Two properties make this work:

- **A working pane always churns.** The spinner and streaming output are pane
  writes, so the field advances continuously - including for a session driving
  a subagent, which is the case the title cannot see.
- **An idle pane goes genuinely quiet.** No periodic heartbeat: idle panes sit
  static for 2 minutes to 8 hours (and a stale `zsh` for 7 days). This is not
  version-specific - `2.1.241` appears on both sides of the split.

So `idle` stops being "we saw a banner and nothing else" and becomes "nothing
has been written to this window for N minutes." That is positive evidence.

**Projected board with a 60s threshold: 8 active, 9 idle, 8 not tracked** -
against today's 0 active, 17 idle.

## The one honest limitation

tmux 3.6a exposes **no pane-scoped** activity variable. I checked: the only
match in the format list is `#{window_activity}`.

It is window-scoped, and the measurement shows sibling panes sharing a value -
`%432` (claude) and `%456` (nvim) both read 237s; `%448` (claude) and `%453`
(nvim) both read 28626s. A sibling pane that emits output on its own would mark
the agent pane active.

`README.md` already documents the mitigating convention ("Run one agent pane
per window"), but a claude pane beside an editor pane is exactly the live
layout here. This is why the new readings should be `medium`, never `high`,
confidence - and it is the reason `confidence` must stay load-bearing.

---

## Plan

Four commits. The classifier/`validCombination` lockstep constraint is real and
wider than the briefing states: a new provenance value must land in
`PROVENANCE_VALUES` (`import-snapshot.mjs:9`), `validCombination`
(`import-snapshot.mjs:44`), the classifier, **and three separate tuple tables
in `tests/live-adapter.test.mjs`** (lines ~234, ~531, ~565).

### Commit 1 - plumbing: collector reads `window_activity` (no behaviour change)

- `live-constants.mjs`: append `window_activity` to `TMUX_FIELDS`, extend
  `LENGTH_PREFIXED_FORMAT`, `TMUX_FIELD_COUNT` 10 → 11.
- `tmux-frame.mjs`: matching `FIELD_LIMITS` entry; validate as `^[0-9]{1,20}$`
  and a safe integer, mirroring the existing `start_time` check.
- Classification untouched - the classifier ignores the field this commit.
- Tests: frame parser accepts the 11-field record and rejects a malformed one.

### Commit 2 - behaviour: activity age drives the static-provider branch

Lockstep across classifier + `PROVENANCE_VALUES` + `validCombination` + tests.

- `classifyPane` gains the observation time and the pane's activity epoch.
  Positive title evidence still wins first - the precedence chain is unchanged.
- The `codexStatic || claudeStatic` branch splits on silence:
  - silence < threshold → `active` / `medium` / `tmux_activity_recent`
  - silence ≥ threshold → `idle` / `medium` / `tmux_activity_idle`
  - activity field absent or unparseable → today's
    `idle` / `low` / `tmux_title_static_provider`, kept as the degraded path.
- Two new allowlist tuples; the existing seven all stay.

### Commit 3 - behaviour: `activity.at` reports real last activity

- Collector stamps the window's activity epoch as `activity.at`.
- `import-snapshot.mjs`: relax `activity.at === observedAt` to
  `activity.at <= observedAt` within the existing age bound.
- Effect: the tooltip's "Seen: 8 hours ago" becomes true.
- `COLLECTOR_VERSION` 1.0.0 → 1.1.0 here. **This invalidates previously
  exported snapshot files** - `normalizeImportedSnapshot` rejects a mismatched
  `collectorVersion`. Correct, but it is a user-visible break worth naming.

### Commit 4 - docs

- `README.md`: the collector now reads one activity timestamp; still no pane
  content. Re-state the one-agent-pane-per-window convention as load-bearing
  for accuracy, not just for tooltips.

## Verification

- `npm run verify` (expect 279 passing) and `npx playwright test`
  (expect 104 passing, 6 skipped) before each commit.
- Fixtures cannot reach this path, so green is necessary and not sufficient.
  The live tally script is the real gate; before/after numbers get stated
  explicitly, not asserted.
- New tests confirmed failing against pre-change source via `git stash`.

## Outcome

Five commits on `fix/dashboard-idle-overclaim`. Verified end to end through
`serve-live.mjs` against live tmux, not only against fixtures:

| | before | after |
|---|---|---|
| classification | 17 `idle/low/tmux_title_static_provider`, 0 active | 15 `idle/medium/tmux_activity_idle`, 3 `active/medium/tmux_activity_recent` |
| low-confidence readings | every tracked pane | none |
| distinct activity stamps | 1 (all `observedAt`) | 15 |
| import gate | n/a | 18 sessions accepted, no `LIVE_SNAPSHOT_INVALID` |

`npm run verify` 284 passing; `npx playwright test` 104 passing, 6 skipped.

Five hardcoded `collectorVersion` strings across unit and browser test
fixtures now read `LIVE_CONSTANTS.COLLECTOR_VERSION`. That duplication is what
turned a one-line version bump into five red browser tests.

## Out of scope

Mobile; Finding 6 of the design review; refreshing
`dashboard/tests/screenshots/`.
