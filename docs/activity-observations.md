# Shared local activity observations

Implementation contract for [#122](https://github.com/ajason13/terminal-dotfiles/issues/122),
after the operator approved the bounded collection decision on 2026-10-29.
The earlier [research](activity-evidence-research.md) remains historical evidence.

## Enable and disable

Install the hook, `tmux-llm-status` and `tmux-agent-observation` together using
[the workstation installer](workstation-setup.md). The helper requires Python
3.9+ on PATH and supports macOS and Linux; unavailable Python, unsupported
identity checks or missing SessionStart evidence produce heuristic/unknown
fallback. Register the existing [Claude hooks](agent-status.md#registering-the-hooks)
and start a new Claude session. Nothing installs packages or starts a new service.

When the helper is installed, tmux uses normalized observations instead of legacy
busy/needs/subagent markers. `explain %3` identifies the winning shared rule;
the table distinguishes `? input` and `ended`. Presence/title fallbacks can still
differ intentionally: tmux asserts presence, while dashboard window silence is
only an idle heuristic. The separate unseen-turn-end badge retains its existing
acknowledgement rules and never asserts verified success; `○ unseen` takes
precedence over the table’s ordinary `ended` label until acknowledged.

The dashboard reads the observation store only with an explicit option:

```sh
node dashboard/collect-tmux.mjs --hook-evidence
node dashboard/export-tmux.mjs /tmp/dashboard-tmux-snapshot.json --hook-evidence
node dashboard/serve-live.mjs --hook-evidence
```

The live server still requires **Go live** in the browser. Omit `--hook-evidence`
for the unchanged title-only version-2 collector. Its existing macOS default
socket and binary restrictions still apply; Linux support here concerns the
hook/status helper and its tests, not a new dashboard socket policy.
To restore the old tmux marker behavior, remove the helper using the managed
uninstaller/backup workflow; mixed old installations remain supported. Removing
or corrupting observations while the new helper is present never re-enables
legacy-marker trust.

## Local identity and files

The dedicated store defaults to `~/.local/state/tmux-observations-v1`.
`TMUX_AGENT_OBSERVATION_HOME` selects an absolute private store for isolated
fixtures or an explicit operator configuration; both consumers must use the same
setting. `TMUX_AGENT_OBSERVATION_BIN` similarly selects a hook/status helper;
the dashboard uses the helper in its checked-out repository.

The store directory must be owned by the current user with mode `0700`. Parent
components are opened relative to directory descriptors without following
symlinks; they must be root/current-user owned and not group/other writable
except sticky directories. Records/locks must be regular, single-link,
current-user-owned mode `0600` files. Readers are read-only and never create the
store, lock, prune or repair it. Writers use one store-wide nonblocking advisory
lock, an exclusive random temporary file and atomic rename within the open
directory. Readers cannot follow a substituted symlink to another file.
No unrelated state directories are scanned. Atomicity prevents partial reads;
this ephemeral observation store does not promise durability through a crash.

The entire store is capped at 256 records (8 MiB of record payload), one lock
and one bounded atomic-write temporary. SessionStart publications safely reclaim
validated records whose latest event is at least 20 minutes old; readers never
prune. A full store rejects new records until expired records can be reclaimed.
Unexpected/unsafe entries fail closed without touching unrelated content. No
background deletion timer is introduced; an inactive store may retain bounded
expired records until another session starts. Each record is capped at 32,768
bytes and 64 facts. The tmux identity frame is
capped at 65,536 bytes / 256 panes and each tmux request at two seconds. Private
pane identifiers and random tokens are validated before use. A record filename
is SHA-256 of server process generation and pane ID; no upstream string becomes
a path component.

Internal version-1 JSON has exactly these keys:

| Key | Meaning |
| --- | --- |
| `version` | integer `1` |
| `server`, `pane`, `actor` | `{pid, start}` process generations; Linux procfs start ticks or macOS libproc start seconds/microseconds |
| `id` | validated pane ID, local only |
| `session` | SHA-256 of the validated opaque Claude session ID, local only |
| `token` | random 128-bit session-generation token, also stored in pane option `@llm_observation` |
| `order` | positive producer-invocation epoch nanoseconds; latest accepted event |
| `closed` | SessionEnd tombstone |
| `facts` | bounded map of lead/turn-end/hashed-agent facts, each `{kind, at}` |

SessionStart must come from a hook descended from the current pane process and
name the current server PID. The helper skips intermediary hook shells to bind
the persistent spawning agent process. Consumers verify that process is still
alive with its original generation and descended from the original pane.
SessionStart issues a new pane-local token; later events must match the stored
session, actor, pane and token. Server restart, pane respawn/reuse, dead actor,
wrong session or lost token invalidates evidence. Readers recheck live identity
after reading files; dashboard also requires the server epoch of its metadata
snapshot. PID alone, file mtime and process presence cannot establish activity.
The same-user local producer is trusted to report hook facts: this is not an
isolation boundary against malicious code running as that user.

## Events, ordering and freshness

The ordering token is captured when the helper invocation begins, before
identity lookup or lock acquisition. An older/equal invocation cannot overwrite
a newer record. This orders received hook invocations, not unobservable upstream
actions: upstream delivery delays cannot be reconstructed. Contending writers
fail closed rather than blocking hooks or overwriting a concurrent update;
an observation can be missed. Missing/delayed hooks and silent long turns remain
limits of hook-reported evidence, which is never labelled authoritative.

| Event | Observation |
| --- | --- |
| SessionStart | new generation, no assertion of active/idle; all old facts discarded |
| Lead UserPromptSubmit | opens active lead turn, clears prior facts |
| PostToolBatch | renews only an already fresh lead/known child and clears that agent's wait |
| SubagentStart/Stop | adds/removes a known turn's hashed child fact; cannot end lead |
| Notification `permission_prompt` | explicit permission wait |
| Notification `elicitation_dialog` | distinct input/question wait, no broader question detection claim |
| Lead Stop/StopFailure | observed turn ended; not success; surviving child work/waits keep precedence |
| SessionEnd | closed generation; later events cannot reopen it without SessionStart |

All facts expire at age **20 minutes**, including waits and subagents. Each
fact has its own event time: another agent's heartbeat cannot renew an orphan
wait or child. Exactly 20 minutes is expired. Future event times, invalid records
and unverifiable identities are rejected. Heartbeats cannot reopen expired or
ended turns. No new heartbeat service is introduced. Unknown/expired evidence
falls back to labelled heuristics or unknown; absence/deletion never establishes
hook-derived idle or completion.

For identical valid evidence both surfaces use the helper's decision:
permission wait > input/question wait > active lead/child > observed turn ended.
An expired explicit end is unknown, not a persistent idle claim. Legacy marker
files are still written for old consumers during mixed upgrades, but the shared
reader never reads them. Other providers retain their title/command fallback.

## Snapshot compatibility

Title-only collection still emits schema **2**, collector **1.1.0**, with exactly
its existing keys and accepted tuples. New importers retain that validation.
Hook-enabled collection emits schema **3**, collector **2.0.0**; old importers
reject it instead of silently interpreting different semantics as version 2.

Schema 3 retains the existing top-level and session fields and adds exactly one
session field: `evidence: {kind, eventAt, expiresAt}`. Heuristic tuples retain
version-2 status/provenance/confidence and use kind `heuristic` with both times
`null`. Hook tuples use kind `hook`, ISO UTC event/expiry times, medium confidence,
and these independent validator-checked combinations:

| Status | Permission | Provenance |
| --- | --- | --- |
| `active` | `unknown` | `tmux_hook_active` |
| `waiting_for_permission` | `requested` | `tmux_hook_permission` |
| `waiting_for_input` | `unknown` | `tmux_hook_question` |
| `turn_ended` | `unknown` | `tmux_hook_turn_ended` |

For hook tuples, `activity.kind` is `observed` and `activity.at` equals the event
time. Top-level `observedAt` is collection time; expiry is event time plus exactly
20 minutes and must be later than collection. Event timestamps are conservatively
truncated to milliseconds when crossing the JSON boundary. A file imported later
is still a historical observation; its normal snapshot-age rules apply. Live
polling recollects and re-evaluates facts. Event time never becomes collection
time just because a record was read.

Exports contain only normalized display facts and the pre-existing sanitized
names/opaque IDs: no prompts, notification messages, transcripts, raw titles,
credentials, paths, process/session identities, owner IDs or agent filenames.

## Verification

```sh
python3 scripts/test-tmux-agent-observation.py
python3 scripts/test-tmux-observation-integration.py
bash scripts/test-tmux-llm-status.sh
bash scripts/test-tmux-agent-depth.sh
cd dashboard
npm run verify
npm run test:browser
```

tmux batches one helper read per render/daemon pass rather than starting a
helper per pane. The integration test creates a private tmux server, synthetic hook producer and
private store, then compares actual tmux decisions with independently validated
dashboard snapshots. It never reads the default server or the operator's state.
