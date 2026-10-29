# Claude Code status line

[Back to setup and keybindings](../README.md). Commands below run from the
repository root unless a block names another location.

## Claude Code Status Line

`claude/statusline.sh` renders one line under the prompt, joining only the
segments whose data is available, in this order:

| Segment | Source |
| --- | --- |
| `opus-5` | the session model, abbreviated |
| branch | the worktree's branch, else the branch at `cwd` |
| `ctx 34%` | share of the context window in use |
| `5h 2% (3h) · 7d 99% (2d)` | rate-limit usage, and the time left in each window |

`ctx` comes from `context_window.used_percentage`, which Claude Code
pre-calculates. That field is null before the session's first API call and again
after `/compact`, so the segment drops out until the next call rather than
standing in a placeholder `ctx 0%`.

The reset spans are rendered as time remaining rather than a wall-clock time, so
the number reads without arithmetic; the parenthetical is dropped when the
payload carries no reset or the window has already rolled over.

The only subprocesses left are a local `git rev-parse`, when the payload carries
no worktree branch, and one `date +%s`, when there is a reset to measure against
- macOS ships bash 3.2, which has no `$EPOCHSECONDS`. Nothing touches the
network or reads a file, so a render never waits on one.

**No path.** A path segment sat between branch and rate-limit usage, rendering
`cwd` relative to the worktree root. Under one window per task `cwd` is the
worktree root nearly always, so the segment showed a bare `.` - a character that
took up room without ever telling one session from another. `worktree.path` was
read only to build it, so that read went with it.

**No Salesforce org.** An `sf:<org>` segment led the line, red `⚠PROD` when the
target looked like production, fed by a `PreToolUse` hook that recorded the org
of the last test command. It was removed because it was silent in the sessions
that needed it most: the hook matched only Playwright invocations, so canary
vitest runs never updated it, and its `.env` fallback looked at the project root
while canary's package lives a directory down. Prod canary runs therefore showed
nothing at all, and a `⚠PROD` badge that stays silent teaches you to read
silence as safe. `sf-org-resolve` and the lease system are unaffected - they
never depended on this - and dropping the hook leaves them the single copy of
the org-resolution logic.

**No PR state.** A `PR #<n>` segment sat between branch and path, colored by
open/draft/merged/closed. It cost a backgrounded `gh pr view` per render behind
a 15-second cache, and the window name already carries the PR. Claude Code does
now pass `pr.number` and `pr.review_state` in the status-line payload, so
restoring it costs one `jq` read rather than the cache - worth knowing if the
window-name habit ever changes.

**No session objective.** A `▸ <objective>` segment used to lead the line,
seeded from the session's first substantive prompt. One window per task means
the window name already says what the session is for, so the segment and the
capture pipeline behind it - `session-objective`, `/objective`, and their
`UserPromptSubmit`/`SessionStart` hooks - were removed rather than kept as a
second copy of the window name. Uninstall still clears the two installed paths
from machines that had them.

### Claude Code settings (manual step)

`~/.claude/settings.json` is **not** installed by this repo: it carries a
personal MCP tool allowlist and this repo is public. Point the status line at
the installed script by hand:

```json
{ "statusLine": { "type": "command", "command": "~/.claude/statusline.sh" } }
```

The activity hooks are listed under [Status bar markers](agent-status.md#status-bar-markers).
The [Salesforce lease hooks](salesforce-leases.md#salesforce-org-leases) are separate; the retired
CRM-org tracker no longer feeds the status line.
Hooks added to a running session may need `/hooks` opened once, or a restart,
before they take effect.
