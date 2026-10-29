# Activity evidence across tmux and the dashboard

Research for [#100](https://github.com/ajason13/terminal-dotfiles/issues/100),
2026-10-28, against `5256156`. This is a comparison and recommendation, not a
new observation contract. The original research made no runtime, schema, hook
registration, or collection boundary changes. The title-only implementation
update for #129 is recorded below. Live disagreement frequency and operator
impact remain unverified; all examples below are synthetic.

## Recommendation

**Defer shared hook collection. Proceed with the separately scoped
[title-fallback alignment follow-up #129](https://github.com/ajason13/terminal-dotfiles/issues/129).** Existing title parsing differences can be reduced without
reading another file or changing exported fields. Sharing hook files now would
also share stale evidence without proving that it belongs to the observed
server and process. It would not make either surface authoritative.

Keep [#122](https://github.com/ajason13/terminal-dotfiles/issues/122) blocked until
the identity, freshness and privacy decisions below have an approved contract.
This recommendation does not authorize expanding the dashboard's file access.
The existing one-agent-pane-per-window convention remains useful for reducing
sibling activity contamination, but does not prove that a silent agent is idle.

## Historical evidence and precedence (`5256156`)

Sources: [shell classifier and diagnostics](../tmux/tmux-llm-status),
[Claude hook producer](../claude/hooks/tmux-agent-depth.sh),
[dashboard classifier](../dashboard/src/tmux-classifier.mjs),
[collector](../dashboard/src/tmux-collector.mjs),
[constants](../dashboard/src/live-constants.mjs), and
[live import validator](../dashboard/src/import-snapshot.mjs).

| Dimension | tmux status / table | Dashboard live snapshot |
| --- | --- | --- |
| Supported classification | `waiting`, `active`, `present`, `none`; table calls present idle | `waiting_for_permission`, `thinking`, `active`, `idle`, `unknown`; non-candidates omitted |
| Precedence, highest first | needs unless shell → subagent count → fresh busy → spinner → structured active title → structured waiting title → provider title/command → table-only live session record → none | reject control-bearing title (command candidate becomes unknown) → candidate gate → Action Required token → Thinking token → spinner → Working/Running/Processing/Executing/Loading token → Ready/Idle token → static provider + activity → command candidate unknown |
| Presence recognition | Codex ` | ` or old bracketed status ending `|`; Claude `✳`; spinner; command basename in fixed list; table session fallback | spinner, old bracketed Codex title, `✳`, or command basename in fixed list; plain current Codex title with `node` is omitted |
| Provenance / confidence | Fixed diagnostic winning-rule labels, no confidence field. Hook evidence is not identity-verified or proof of successful work | Explicit `tmux_title_*`, `tmux_activity_*`, `tmux_command_candidate` tuples; medium for thinking/working/spinner/activity, low for permission/ready/static-without-epoch, none for unknown; never authoritative |
| Permission meaning | needs covers permission **and questions**, including subagent prompts; structured Codex Action Required fallback | title token yields requested permission, low confidence; no independent hook confirmation |
| Time / freshness | Busy epoch age strictly `< TMUX_LLM_BUSY_TTL`, default 1,200 seconds; exactly TTL expires. Needs and subagent files have no TTL. Titles/session presence have no activity timeout | Static provider: silence `< 60,000 ms` active, exactly 60,000 idle; unusable epoch gives low-confidence idle. Explicit title tokens bypass silence |
| Clock / invalid marker | Busy decimal syntax bounded; malformed ignored; future busy epoch still counts fresh | Invalid/nonpositive activity epoch treated unavailable; future activity clamps silence to zero |
| Missing hooks | Indistinguishable from no published evidence; fallback to title/command/session. Present does not prove idle | Hooks are never read; no distinction between absent, broken and unsupported hooks |
| Observation vs activity | Table age is separate from classification; `explain` reports marker age, not last successful action | `observedAt` is collection time; `activity.kind=observed` timestamp comes from window output, clamped for future skew, or observation time if unavailable. It is not a per-pane hook heartbeat |
| Snapshot age | Daemon refreshes roughly every second; UI freshness does not fix stale markers | Import rejects snapshots older than 15 minutes or more than 2 minutes in future; fresh display through 5 minutes. Snapshot freshness is distinct from title/evidence freshness |

`present` versus dashboard `idle` is not necessarily a semantic conflict: the
former asserts presence while the latter can mean only window silence. Do not
normalize `none` (no recognized candidate) into positive idle evidence.

## Lifecycle, interrupted work and reused identities

The hook marks busy on `UserPromptSubmit` and `PostToolBatch`; the latter also
clears a needs marker owned by that agent. Permission/elicitation notifications
create needs; idle notifications do not. Subagent start/stop maintain individual
files. Top-level `Stop`/`StopFailure` clear busy; a subagent stop cannot clear the
lead's turn. A turn ending is not verified task completion.

`SessionStart` always clears needs. Normal startup clears busy and subagents;
compact/resume preserve them. `SessionEnd` removes these markers. An interrupted
turn may never emit Stop: busy can remain active until TTL, and a silent live
turn can expire without another heartbeat. Orphan subagent files have no timeout;
a shell ignores needs but can still be classified active from busy/subagent
files. A future busy timestamp can extend the effective freshness interval.

The daemon prunes IDs absent from the live pane list when it starts, skipping an
empty list as a possible socket failure. This does not bind retained files to a
server epoch, socket, or process generation. A reused ID already present at prune
time can inherit old files; same-pane respawn is not detected. `explain` rejects
retained dead panes, but the general classifier does not itself inspect deadness.
It must not be described as a universal dead-pane filter.

Dashboard IDs hash socket path, server start epoch and pane ID: server restart
changes the exported ID, while respawning a process in the same pane does not.
The collector requests neither pane PID nor deadness. Stale titles or current
window output can still classify a retained or repurposed pane. A fresh snapshot
therefore does not establish a fresh agent lifecycle.

## Reproducible synthetic comparison

Run from the repository root (Node and Bash; no tmux server required):

```sh
node scripts/research-activity-evidence.mjs
```

The script loads the real shell classifier definitions before its diagnostic
functions, invokes only `classify_pane` with synthetic strings, fixed time and
private temporary marker files, and imports the real dashboard classifier and
validator. It executes no supplied command/title text, contacts no socket and
reads no live state. It fails if the source extraction boundary moves. The table
below preserves the original research snapshot; the script now asserts the
current #129 behavior documented in the following section.
Each emitted snapshot must pass the live validator; ID assertions demonstrate
server-epoch separation and the lack of process-respawn separation.

| Fixture | tmux result / reason | Dashboard result / provenance | Interpretation |
| --- | --- | --- | --- |
| static-quiet | present / agent-title | idle / activity_idle | Different assertions; no proof of idle |
| sibling-output | present / agent-title | active / activity_recent | Inherent to current window-level observation; sibling output is simulated by recent window time |
| busy-silent | active / fresh-busy-marker | idle / activity_idle | Hook evidence unavailable to dashboard |
| blocked-recent | waiting / needs-marker | active / activity_recent | Needs overrides busy/depth only in tmux |
| subagent-silent | active / subagent-depth | idle / activity_idle | Silent fan-out not visible to dashboard |
| busy-at-ttl | present / agent-title | idle / activity_idle | Expiration discards busy; does not prove completion |
| busy-future | active / fresh-busy-marker | idle / activity_idle | Clock skew remains a marker weakness |
| busy-malformed | present / agent-title | idle / activity_idle | Invalid `08` ignored by shell |
| spinner-with-prompt-text | active / spinner-title | waiting_for_permission / title_action_required | Avoidable precedence difference |
| codex-task-text | present / agent-title | waiting_for_permission / title_action_required | Avoidable false prompt from `[Ready] Action Required \| project` |
| codex-current-title | present / agent-title | omitted | Avoidable candidate recognition difference with `node` |
| command-only | present / agent-command | unknown / command_candidate | Presence versus absence of activity evidence |
| busy-on-shell | active / fresh-busy-marker | omitted | Stale marker can survive process replacement; needs alone ignored |
| no-activity-epoch | present / agent-title | idle / title_static_provider | Low-confidence fallback, not measured silence |
| exact-silence-boundary | present / agent-title | idle / activity_idle | 60 seconds is idle, not active |

Dashboard provenance above abbreviates the `tmux_` prefix. Interrupted turns,
startup/compact/resume cleanup and actual private-server diagnostics are covered
by the existing [hook suite](../scripts/test-tmux-agent-depth.sh) and
[status suite](../scripts/test-tmux-llm-status.sh); those tests complement this
fixed classifier corpus. No production observation is claimed.

## Title alignment update (#129)

The historical table above remains evidence of the original differences.
The current corpus now expects these three changed dashboard results:

| Fixture | Current dashboard result / provenance | Meaning |
| --- | --- | --- |
| spinner-with-prompt-text | active / title_spinner | Spinner wins over task words |
| codex-task-text | active / activity_recent | `[Ready] Action Required \| project` is presence; the fixture has recent window output |
| codex-current-title | idle / activity_idle | `task \| project` with `node` is recognized; the fixture has 120 seconds of window silence |

All other corpus expectations remain unchanged. Current precedence is control
rejection → candidate gate → spinner → structured Codex Thinking/active prefix
→ structured Codex Action Required prefix → static provider with window-activity
fallback → command candidate unknown. Current and legacy Codex candidates match
the shell's title shapes. Claude static text, unstructured task words and
Ready/Idle prefixes provide presence only; they do not bypass activity fallback.
The shell still reports presence where the dashboard estimates activity from
window silence. This is intentional and does not prove idle.

The expanded [classifier round-trip matrix](../dashboard/tests/live-adapter.test.mjs)
covers direct/node candidates, negative titles, structured statuses, task-token
false positives, spinner conflicts, control rejection and every emitted branch.
Every produced snapshot passes the independent live validator. No fields,
accepted tuples, collection access, hooks or shell behavior changed. Historical
`tmux_title_ready_idle` imports remain supported, although current classification
uses the existing activity fallback for Ready/Idle titles. Shared-hook work in
#122 remains blocked on the decisions below.

## Options and the collection boundary

| Option | Privacy / compatibility | Effort and limits |
| --- | --- | --- |
| Retain current evidence, improve explanations | No new access or schema; intentional disagreements documented | Lowest cost; false activity from siblings and silent-turn misses remain |
| Align title fallback first | Same metadata, existing tuple vocabulary; parser and validator regressions must stay coherent | Small bounded classifier/test change. Removes demonstrated title false prompts and candidate gaps, not hook/window disagreement |
| Shared normalized hook observations with heuristic fallback | New state-file reads require explicit approval and safe ownership/type/size/path handling. Existing `.meta`, session records and agent filenames can expose unrelated context; do not export them | Larger producer/consumer change: bind identity, define monotonic freshness/order and race behavior, specify missing/unsupported/stale signals, version schema/tuples and support old exports. Sharing only a classifier cannot manufacture missing evidence |

A prospective internal observation should carry a server/process-bound identity,
provider, semantic state, evidence kind, producer event time, observer time and
expiry/unknown reason. This is a design requirement to evaluate, not a shipped
field set or agreement to collect it. Export only the minimum normalized fields;
never prompts, transcripts, raw titles, marker owners, agent filenames,
credentials or sensitive paths. An elicitation question should not silently
become a confirmed permission request. An old file's mtime must not become a
fresh event timestamp just because it was read now.

The current validator accepts exact version-2 keys, collector version and a
closed list of status/activity/permission/confidence/provenance tuples. New
hook provenance or fields would be rejected, even if structurally plausible.
A future implementation must deliberately choose version negotiation or a
migration policy, keep historical snapshot behavior explicit, and expand the
independent validator tests alongside collector round trips. Hook evidence
should not be called authoritative before identity and lifecycle guarantees
justify it.

## Follow-up gates and unresolved decisions

Title alignment is independently justified by the corpus, without live impact
statistics: support current Codex presence, stop interpreting task words as
status, and state explicit spinner/status precedence while preserving control
character rejection and validator tuples. Acceptance should cover current/old
Codex titles with `node` and direct commands, quoted task status words,
spinner conflicts, static Claude, every existing classifier branch and negative
candidate cases. Validate all emitted snapshots and run dashboard verification.
This follow-up does not authorize hook reads or a schema change.

Before #122 can become Ready, the operator must approve whether the demonstrated
hook/window disagreement warrants broader local file access. An implementation
proposal must settle identity across sockets/restarts/respawns; freshness,
future clocks and orphan needs/subagents; interrupted turns and heartbeat gaps;
permission versus questions; and export compatibility. The preferred behavior
for unsupported/missing hooks must remain an explicit heuristic/unknown fallback,
not false completion or idle inferred from absent files. These decisions remain
unresolved by this research recommendation.

Measurable gates for a future shared implementation: identical valid supported
evidence yields the same semantic state on both surfaces; wrong identity,
expired/malformed/unsafe files and interrupted/reused panes cannot become
confirmed activity; fallback retains its provenance; no extra metadata escapes;
every emitted tuple passes the independent validator. Use synthetic hooks and
isolated panes, include restart/respawn and sibling cases, and obtain fresh-context
Codex security/privacy/schema review. No live collection, daemon, registration,
or remote host change is part of this research.
