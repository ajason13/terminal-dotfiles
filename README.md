# Terminal Dotfiles

Portable macOS configuration for a terminal-centric workflow - WezTerm, tmux,
Neovim, Codex, and Claude Code - focused on LLM sessions, fast pane/window
management, Quick Select file opening, local branch review, and rotating
terminal backgrounds.

## What This Includes

- WezTerm attaches your most recently used tmux session, creating `main` if no
  server is running yet. Renaming sessions is safe: `Ctrl-a $`.
- tmux owns windows and panes; WezTerm tabs are hidden.
- tmux status bar shows LLM activity markers: per window, plus a roll-up for the
  current session next to its name (each session counts only its own windows).
- Session objectives are tracked and shown in the Claude Code statusline, but no
  longer in tmux: one window per task means the window name already says it.
- `Ctrl-a` is the tmux prefix.
- `Ctrl-a \` splits horizontally and `Ctrl-a -` splits vertically.
- `Ctrl-a h/j/k/l` moves between panes.
- `Ctrl-a s` picks a session, `Ctrl-a S` creates one (prompts for a name, starts
  in the current pane's directory), `Ctrl-a $` renames the current one.
- `Ctrl-Shift-Space` opens selected text paths in a tmux Neovim split, PNG
  images in Preview, and web targets in the browser.
- WezTerm backgrounds rotate every 15 minutes by default.
- Codex defaults to `gpt-5.6-terra` with `medium` reasoning for routine sessions
  and includes pinned Sol role profiles for research, architecture, and
  implementation.
- Claude Code sessions can take advisory leases on shared Salesforce orgs, so two
  agents do not run tests against the same org at once. Off until
  `SF_LEASE_ENABLE` is set - see Salesforce Org Leases.

## Status bar markers

| Marker | Meaning |
| --- | --- |
| `⠹` | a turn is running, no fan-out |
| `⠹N` | N subagents in flight |
| `◆` | agent present, idle |
| `!` | blocked on you |

`N` is suppressed at 1. Both working states come from `tmux-agent-depth.sh`,
under `$TMUX_LLM_STATE_HOME/panes/` (default `~/.local/state/tmux-llm`, override
with `TMUX_LLM_STATE_HOME`):

- **depth** - one file per in-flight subagent in `<pane>.agents/`
- **busy** - `<pane>.busy`, holding the epoch of the last event in the turn

Busy is not a nicety. Claude Code used to animate its terminal title with
braille frames while working; since 2.1.2xx it shows a static `✳ <summary>`
whether it is thinking or idle, so the title can no longer answer "is this pane
working?" at all. Without the hooks registered, every Claude window sits on `◆`
forever and the spinner appears only during a fan-out.

Busy is read as **fresh**, not merely present: `Stop` does not fire when you
interrupt a turn, so an existence check alone would spin forever afterwards.
`UserPromptSubmit` opens the turn, `PostToolBatch` heartbeats it, and
`Stop`/`StopFailure` close it; the marker ages out after
`TMUX_LLM_BUSY_TTL` seconds (default 1200, comfortably above one tool batch).

Codex panes get presence and the title-based working state, but never a depth
number or a busy marker, because Codex fires neither `SubagentStart` nor these
turn events. The title matchers stay in place for exactly that reason.

`tmux-llm-status prune` drops state for panes tmux no longer reports, so a dead
pane's leftovers cannot linger. If a marker still shows a spinner with no real
work running - a missed `SubagentStop` left a file behind - clear it by hand:
`rm -rf ~/.local/state/tmux-llm/panes/<pane>.agents ~/.local/state/tmux-llm/panes/<pane>.busy`.

### Registering the hooks

`~/.claude/settings.json` is never written by this repo, so merge these by hand,
appending to any array that already exists:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "PostToolBatch": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "StopFailure": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "SubagentStart": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "SubagentStop": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/tmux-agent-depth.sh", "timeout": 5 }] }
    ]
  }
}
```

The first four are the busy marker, the next two are depth, and the last two
reset a pane. Registering only some is fine - each state degrades to absent
rather than wrong - but dropping `Stop` leaves every pane spinning until the
TTL expires.

## Layout

```text
.
├── LICENSE
├── README.md
├── bin
│   ├── session-objective
│   ├── sf-lease
│   └── sf-org-resolve
├── claude
│   ├── commands
│   │   └── objective.md
│   ├── hooks
│   │   ├── sf-lease-end.sh
│   │   ├── sf-lease-guard.sh
│   │   ├── sf-lease-post.sh
│   │   ├── sf-lease-table.sh
│   │   └── tmux-agent-depth.sh
│   └── statusline.sh
├── codex
│   ├── AGENTS.md
│   ├── agents
│   ├── bin
│   │   └── codex-role
│   ├── config.toml
│   └── profiles
├── install-macos.sh
├── nvim
│   ├── init.lua
│   ├── lazy-lock.json
│   └── lua
│       ├── config
│       │   ├── keymaps.lua
│       │   └── options.lua
│       └── plugins
│           ├── editing.lua
│           ├── git.lua
│           ├── oil.lua
│           ├── telescope.lua
│           ├── treesitter.lua
│           ├── ui.lua
│           └── which-key.lua
├── scripts
│   ├── check-background-assets.sh
│   ├── check-background-inbox.sh
│   └── test-session-objective.sh
├── tmux
│   ├── tmux.conf
│   ├── tmux.local.conf.example
│   └── tmux-llm-status
├── uninstall-macos.sh
└── wezterm
    ├── .wezterm.lua
    ├── wezterm.lua
    ├── local.lua.example
    ├── modules
    │   ├── appearance.lua
    │   ├── backgrounds.lua
    │   ├── background_manifests
    │   │   ├── anime.lua
    │   │   ├── general.lua
    │   │   └── vehicles.lua
    │   ├── general.lua
    │   ├── links.lua
    │   └── macos.lua
    └── assets
        ├── backgrounds
        │   ├── 000-general
        │   ├── 100-vehicles
        │   └── 200-anime
        └── inbox
            └── _sample
```

## Requirements

Install the core tools:

```sh
brew install tmux
brew install neovim tree-sitter-cli
brew install --cask wezterm visual-studio-code
```

`tree-sitter-cli` is needed by the Neovim config to compile syntax parsers
(nvim-treesitter's `main` branch builds them with the `tree-sitter` CLI).

Codex must be installed and signed in. The installer writes its configuration
to `~/.codex` but does not copy credentials or authentication state.

Optional font:

```sh
brew install --cask font-jetbrains-mono
```

VS Code must be registered for `vscode://file` links. If needed, open VS Code
and run `Shell Command: Install 'code' command in PATH` from the command
palette.

## Install On A Mac

Clone this repo, then run:

```sh
./install-macos.sh
```

Preview first:

```sh
./install-macos.sh --dry-run
```

Copy mode installs files into:

```text
~/.wezterm.lua
~/.config/wezterm
~/.tmux.conf
~/.local/bin/tmux-llm-status
~/.codex/config.toml
~/.codex/AGENTS.md
~/.codex/agents
~/.codex/{deep-researcher,lead-architect,workflow-coordinator,builder}.config.toml
~/.local/bin/codex-role
~/.local/bin/session-objective
~/.local/bin/sf-org-resolve
~/.local/bin/sf-lease
~/.claude/statusline.sh
~/.claude/commands/objective.md
~/.claude/hooks/sf-lease-{guard,post,end,table}.sh
~/.claude/hooks/tmux-agent-depth.sh
```

Existing files are backed up before replacement when contents differ.
`~/.claude/settings.json` is never written: see Session Objectives and Salesforce
Org Leases for the hook snippets to merge by hand. The lease hooks stay inert
after installation until `SF_LEASE_ENABLE` is set, so installing them changes
nothing about how a session behaves.

## Local Editing Mode

Use link mode on a machine where you want this repo to be the live config:

```sh
./install-macos.sh --link
```

This symlinks:

```text
~/.wezterm.lua -> wezterm/.wezterm.lua
~/.config/wezterm -> wezterm
~/.config/nvim -> nvim
~/.tmux.conf -> tmux/tmux.conf
~/.local/bin/tmux-llm-status -> tmux/tmux-llm-status
~/.codex/config.toml -> codex/config.toml
~/.codex/AGENTS.md -> codex/AGENTS.md
~/.codex/agents -> codex/agents
~/.codex/{deep-researcher,lead-architect,workflow-coordinator,builder}.config.toml -> codex/profiles/*
~/.local/bin/codex-role -> codex/bin/codex-role
~/.local/bin/session-objective -> bin/session-objective
~/.local/bin/sf-org-resolve -> bin/sf-org-resolve
~/.local/bin/sf-lease -> bin/sf-lease
~/.claude/statusline.sh -> claude/statusline.sh
~/.claude/commands/objective.md -> claude/commands/objective.md
~/.claude/hooks/sf-lease-{guard,post,end,table}.sh -> claude/hooks/*
~/.claude/hooks/tmux-agent-depth.sh -> claude/hooks/tmux-agent-depth.sh
```

## Codex Role Routing

The normal Codex default is `gpt-5.6-terra` with `medium` reasoning, suitable
for routine inspection, coordination, documentation, and status work. Four
custom agents are also installed for explicit role routing:

| Role | Model | Reasoning |
| --- | --- | --- |
| Deep Researcher | `gpt-5.6-sol` | `xhigh` |
| Lead Architect | `gpt-5.6-sol` | `high` |
| Workflow Coordinator | `gpt-5.6-terra` | `medium` |
| Builder | `gpt-5.6-sol` | `medium` |

For a task delegated within Codex, name the custom agent explicitly, for
example: `Use the deep-researcher agent to map this codebase.` The agent file
pins its model and reasoning effort.

For a top-level CLI session, use `codex-role`. This is the reliable way to
guarantee the intended model and reasoning level from session start:

```sh
codex-role research
codex-role architect
codex-role coordinate
codex-role build
```

Each command starts Codex with an explicit profile. Task wording and global
instructions can guide routing, but they cannot guarantee that a top-level
session changes model after it has started. If a pinned model or level is not
available, Codex should surface that as an exception rather than silently
downshifting.

### Hybrid Delivery Workflow

The installed role guidance uses two delivery modes. Choose the smallest mode
that safely fits the task rather than running every task through every role.

**Advisor Mode is the default** for scoped, low-risk work such as routine bug
fixes, local tooling, documentation, small UI changes, and exploration. One
primary role owns the outcome and consults a specialist only for a bounded
question. A Builder usually owns implementation; a Lead Architect owns an
ambiguous decision. Research findings and QA feedback are advisory, and the
primary records the decision, assumptions, and verification in its handoff.
Advisor Mode permits at most one bounded specialist, with no recursive
delegation. Workflow coordination is a brief intake or final sync step rather
than a persistent parallel agent.

**Gated Delivery Mode** is required for new architecture, cross-module or
public contracts, privacy, safety, security, licensing, auth, payments,
external integrations, release candidates, and explicitly requested independent
reviews. The Lead Architect selects the gate, defines the implementation-ready
plan, and the Builder starts only after that review passes. The Workflow
Coordinator records state and evidence but never changes the technical decision.
Only the roles and gates required by the task's risk should run.

Subagents are useful for independent exploration, focused test or log analysis,
and other read-heavy work that would pollute the primary thread. They are not a
token-saving mechanism: every spawned agent performs its own model and tool
work. The default spawned-agent pool is therefore capped at two threads and
uses `gpt-5.6-terra` with `medium` reasoning. Use the pinned Builder for normal
behavioral implementation, escalate to Architect or Researcher only when the
risk requires it, and keep one chat per coherent outcome.

Examples:

```text
Advisor: "Use the builder agent to fix this focused test failure; consult the
deep-researcher only if the library behavior is uncertain."

Gated: "Use the lead-architect agent to classify this authentication change,
write the spec and QA gate, then hand the approved scope to the builder."
```

WezTerm has automatic reload enabled, but module edits through symlinks may not
always reload immediately. Press `Cmd-r` in WezTerm if needed. Reload tmux with
`Ctrl-a r`.

Note that a tmux server is long-lived. Because WezTerm attaches to the existing
server (`tmux attach`), edits to `tmux.conf` don't apply to a running
server until it is reloaded, and a server started before a change can drift out
of sync (for example, an old status-bar position). This config re-sources itself
whenever a client attaches, so newly opened WezTerm windows pick up the latest
config automatically; the session you're already in still needs `Ctrl-a r`. For
a fully clean slate, quit all WezTerm windows (or run `tmux kill-server`).

## Session Objectives

Every agent session gets a one-line objective, so a pane you return to after a
day says what it was for instead of needing to be asked.

- Seeded once from the session's first substantive prompt, then left alone.
  Replies like `yes` or `run it` do not overwrite it.
- The seed is **normalized**, because a real prompt front-loads the least useful
  part and puts the identifier last. A raw truncation reads
  `create a plan to implement https://leandat...`; normalized it reads
  `plan: BB-484`. Ticket URLs collapse to their key, GitHub links to
  `<repo> PR <n>`, other URLs to their last path segment, and interaction
  framing (`can you`, `please`, `I want you to`) is dropped. Task verbs like
  `fix` and `add` are kept, because those *are* the objective. Review-command
  openers collapse too, since the command name alone can be 29 characters:
  `/playwright-code-review-panel e2e-automation pr 469` becomes
  `Review PR 469`. Planning and PR-description openers get a compact tag
  (`test plan: BB-300`, `PR desc: jalvarez/eng-613`), and paste placeholders are
  dropped.

  `/rename` is deliberately kept and seeds its text, because a hand-written
  session name is the best objective available and tmux cannot read
  `session_name` the way Claude's status line can. Config commands (`/model`,
  `/mcp`, `/clear`, ...) do not seed at all, so the next real prompt describes
  the session instead. Same for a prompt that was only a paste placeholder.

  An explicit
  `/objective` is stored verbatim - your words are not rewritten.
  Check any string with `session-objective normalize`.
- `/objective <text>` (or a prompt starting `objective:`) sets it explicitly and
  pins it. A bare `/objective` just reports the current one.
- Claude Code shows it as the first status-line segment; an explicit `/rename`
  wins over it there.
- **tmux does not display it.** The status bar and pane borders both showed it
  once; with one window per task the window name already carries the task, so
  both were removed rather than duplicating it. `LLM_OBJECTIVE_MAX_LEN` and
  `LLM_PANE_OBJECTIVE_MAX_LEN` went with them.
- Store: `~/.local/state/session-objectives/`, one file per session id.
  `SESSION_OBJECTIVE_HOME` relocates it. Files unread for 30 days are swept on
  the next `SessionStart`.

Claude Code and Codex both send `session_id` and `prompt` on `UserPromptSubmit`,
so one capture path serves both. Only Claude Code renders it: `tui.status_line`
takes a fixed list of predefined identifiers, not a command, so a Codex session
captures an objective that nothing currently displays. tmux used to be the shared
surface for exactly that reason; one window per task made it redundant.

Run `session-objective doctor` if an objective stops appearing. It reports the
store and its objective count, and warns if a hook payload arrived with no
recognisable prompt field.

### Claude Code hooks (manual step)

`~/.claude/settings.json` is **not** installed by this repo: it carries a
personal MCP tool allowlist and this repo is public. Merge these two hooks into
it by hand, keeping whatever is already there:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "$HOME/.local/bin/session-objective capture", "timeout": 5 }] }
    ],
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "$HOME/.local/bin/session-objective reset", "timeout": 5 }] }
    ]
  }
}
```

Also set the status line, if it is not already pointed there:

```json
{ "statusLine": { "type": "command", "command": "~/.claude/statusline.sh" } }
```

Hooks added to a running session may need `/hooks` opened once, or a restart,
before they take effect. Codex needs no manual step - its hooks live in
`codex/config.toml`, but they are inert until `~/.codex/config.toml` is linked.

## Salesforce Org Leases

Two Claude sessions running tests against the same shared Salesforce org corrupt
each other's data. This makes that collision visible instead of silent: a session
whose Bash call would touch an org another session is already testing is
**blocked before the command runs**, with the holding session named.

It is **advisory, single-machine, and covers only Claude-driven Bash calls.** A
command you type in a bare terminal, a task launched from an editor, and anything
on another machine take no lease and are never blocked. A lease means "another
session says it is using this org" - it is not a lock on the org itself.

Everything here is **off** until `SF_LEASE_ENABLE` is set. Installing it changes
nothing on its own.

### The three pieces

Each knows as little as possible about the others.

- **`sf-org-resolve <cwd> <command>`** answers *which org would this command
  touch?* It recognises test invocations (`playwright test`, `npx playwright`,
  `npm run test*`, `vitest run`, `test:last-failed`) **at the start of a command
  segment** - the beginning of the command, or after `&&`, `||`, `;`, `|` or a
  newline - so `cd repo && npm run test:staging` counts and
  `git commit -m "fix the npx playwright test flake"` does not. It then reads the
  same configuration the run itself would read - an inline
  `SF_ORG_ALIAS=`/`SF_BASE_URL=` prefix, the `dotenv -e` file a `package.json`
  script names, otherwise `.env`/`.env.<TEST_ENV>` in that directory - and
  canonicalizes the result through `~/.config/sf-org-identity/map`, because two
  repos name the same org differently. It prints one identity or nothing, and
  knows nothing about leases. A run with `SF_SCRATCH_POOL=1` provisions its own
  org, so it resolves to nothing on purpose (an allowlist: `SF_SCRATCH_POOL=no`
  is *not* a pooled run and still takes a lease).

  It exits `0` with an identity, `1` for "no lease needed", and `3` for **its
  configuration being present and unusable** - an unreadable org map or env file,
  or a map entry that is not a usable identity. rc 3 exists because as rc 1 it was
  indistinguishable from "not a test command": leasing was simply off, with no log
  line anywhere. The hooks still let the call through on rc 3, but they say so
  loudly in the hook log.
- **`sf-lease`** is the lease store: `claim`, `release`, `release-session`,
  `holder`, `list`, `sweep`, `unwedge`. State lives in
  `~/.local/state/sf-leases/`, one directory per identity, and every mutation
  runs under a single store-wide mutex. It knows nothing about Salesforce - it
  leases opaque strings.
- **Four Claude Code hooks** connect the two to the session lifecycle:
  `sf-lease-guard.sh` (PreToolUse/Bash) claims or blocks with exit 2;
  `sf-lease-post.sh` (PostToolUse/Bash) releases *only* the identity that same
  call resolved to, so an unrelated `git status` cannot drop a live suite's
  lease; `sf-lease-end.sh` (SessionEnd) releases everything the session still
  holds; `sf-lease-table.sh` (SessionStart) prints what is already leased.

Every hook fails **open**: a missing binary, an unparseable payload, a busy store
or any unexpected exit code lets the call through. Only a live competing holder
blocks. A guard that can stop every Bash call in every session has to be built
that way - including the session you would fix it from.

### Arming it, in this order

1. `./install-macos.sh` puts the two binaries in `~/.local/bin` and the four hook
   scripts in `~/.claude/hooks`. Both are inert at this point.
2. Merge the hooks into `~/.claude/settings.json` **by hand**, keeping whatever
   is already registered there - `PreToolUse` and `SessionStart` commonly
   already carry entries, so append to those arrays. Do not merge with
   `jq '.[0] * .[1]'`: that replaces arrays, which silently drops the hooks
   already in the file.

   ```json
   {
     "hooks": {
       "PreToolUse": [
         { "matcher": "Bash", "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/sf-lease-guard.sh", "timeout": 15 }] }
       ],
       "PostToolUse": [
         { "matcher": "Bash", "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/sf-lease-post.sh", "timeout": 30 }] }
       ],
       "SessionEnd": [
         { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/sf-lease-end.sh", "timeout": 30 }] }
       ],
       "SessionStart": [
         { "hooks": [{ "type": "command", "command": "$HOME/.claude/hooks/sf-lease-table.sh", "timeout": 10 }] }
       ]
     }
   }
   ```

3. **Confirm they are inert.** Restart a session, run a few Bash calls including
   a test command, and check that nothing was blocked, `sf-lease list` prints
   nothing, and `~/.local/state/sf-leases/hook.log` has no new lines.
4. Only then `export SF_LEASE_ENABLE=1` (shell profile) and restart.

To back out, `unset SF_LEASE_ENABLE` and restart - the hooks go inert again with
their registration intact. `./uninstall-macos.sh` removes the scripts, but it
does not edit `settings.json`; unregister them there first, since an entry
pointing at a missing hook errors on every Bash call.

### Knobs

- `SF_LEASE_ENABLE` - the arming switch, matched against an allowlist
  (`1`, `on`, `true`, `yes`, any capitalization). Anything else, including `off`
  and a typo, leaves it **off**.
- `SF_LEASE_TTL_MINUTES` (default `120`, range **1-1440**) - how long a lease
  outlives a session that died without releasing it. A live session re-claims on
  every Bash call, so this only ever expires an abandoned lease. The upper bound
  is literal, not cosmetic: this knob drives the only multiplication in `sf-lease`,
  and `200000000000000000` wrapped `ttl * 60` to a *negative* number, which made
  every lease read stale and handed a rival an org its real holder was still
  running against. Out of range is `rc 64`, reported in the hook log.
- `SF_LEASE_MUTEX_WEDGE_SECONDS` (default `60`, range **30-86400**) - how old the
  claim mutex has to be before `list` warns and `unwedge` will consider clearing
  it. It has a **floor** as well as a ceiling, because a value below one (or one
  wrapped negative past int64) let `unwedge` delete a mutex a live claim was
  holding, with no `--force`.
- `SF_LEASE_HOOK_RETRIES` (default `2`, **capped at 5**) - how many times the
  release hooks retry a busy store. `0` is the escape hatch: one attempt, no
  retry, when a wedged store is making every Bash call slow. Do not try to raise
  it past the cap - each retry costs a full mutex timeout on *every* Bash call.
  A value past the cap, a non-integer, or a leading zero (bash reads `08` as
  octal) falls back to `2` and says so in the hook log.
- `SF_LEASE_MUTEX_TIMEOUT_MS` (default `5000`, which is also its **ceiling**) -
  how long a claim waits for the store mutex. It can only be lowered. `20000`
  made a single Bash call's guard take 26s and `86400000` - the
  milliseconds-per-day typo - was still spinning at 30s; both are perfectly
  valid integers, which is why the ceiling is a literal bound rather than a
  validation rule. This one *clamps* instead of refusing, unlike the two knobs
  above: it sits on the PreToolUse hot path, where too long a wait is a stall
  rather than a wrong answer, so clamping keeps leasing working where `rc 64`
  would switch it off over a typo. Past a day in milliseconds it is refused,
  because that is a number in the wrong variable rather than a wait.

A malformed value in any of those three is `rc 64` from `sf-lease`, which the hooks
log naming both possible causes - the knob and their own argument plumbing - and
then allow the call. **A bad knob means leasing is off**, so it is worth reading
the log line rather than assuming a hook bug.
- `SF_LEASE_HOME` (default `~/.local/state/sf-leases`), `SF_ORG_MAP` (default
  `~/.config/sf-org-identity/map`), `SF_LEASE_LOG`, `SF_LEASE_BIN`,
  `SF_ORG_RESOLVE_BIN` - relocations, mostly for the test suites.

### Day to day

```sh
sf-lease list                     # who holds what; silent when nothing is held
sf-lease holder <org>
sf-lease release <org> <session>  # force-clear one lease
sf-lease release-session <session>
```

`SF_SCRATCH_POOL=1` on a run bypasses leasing entirely - that run claims its own
scratch org from the e2e pool, which has its own lock directory. `sf-lease list`
shows those pool locks alongside the org leases, read-only, so one command gives
the whole picture.

### When the store wedges

The claim mutex is held for tens of milliseconds and is never auto-recovered: an
age-based "fix" would reintroduce the exact race the mutex exists to close. So a
process killed inside its critical section leaves the store wedged, and recovery
is a human step.

Nothing is blocked while it is wedged - claims fail open - but every Bash call in
every armed session pays for it: about **5s in the PreToolUse hook plus 15.4s in
the PostToolUse hook, roughly 20.4s per call** at the default retry count, each
writing an `rc=75` line to the hook log that names the fix.

```sh
sf-lease list      # warns when the mutex has been held longer than a minute
sf-lease unwedge   # refuses unless the mutex is old AND its owning pid is gone
```

`sf-lease unwedge --force` skips both proofs and **can hand the same org to two
sessions at once**, including every session that claims after it. Use it only
when you are certain the owning process is dead.

### Where the real identifiers live

Both are local, outside this repo, and neither is ever committed:

- `~/.config/sf-org-identity/map` - the two-column raw-to-canonical org map.
  This repo's tests use fakes (`orga`, `orgb`) only.
- `~/.local/state/sf-leases/hook.log` - hook diagnostics, and it contains **org
  identities and Claude session ids**. Rotated at 256KB with one previous copy
  kept, so about 512KB at most.

`./uninstall-macos.sh` removes the binaries and hooks but **leaves that store in
place** - it can hold a live lease belonging to another running session, and the
script only removes what it installed. It prints the path and the `rm -rf` to
finish the job.

### Adding a third repo to the map

Two repos only collide if they resolve to the *same* string, so a new repo has to
be mapped to whatever the other two already canonicalize to. Ask the resolver
rather than guessing - it prints the raw value it derived, which is the left-hand
column the map needs:

```sh
sf-org-resolve ~/Apps/some-repo 'npm run test:staging'   # prints e.g. 00Dfake0000000001
sf-org-resolve ~/Apps/e2e-automation 'npx playwright test'
```

Then add a line per raw value in `~/.config/sf-org-identity/map` (whitespace-
separated `raw canonical`, `#` comments, first match wins) pointing all of them at
one canonical name, and re-run both commands: they must now print the same string.
If the new repo prints nothing, it is not a recognised invocation shape or the
config it reads is not one of the ones listed above; if it exits `3`, the map or an
env file is present and unreadable.

### Known gaps

- `cd "$VAR" && ...`, `pushd`, and any `cd` that is not the first command are
  not followed. The lease keys off the payload's own working directory instead,
  which in practice means no lease rather than the wrong one.
- **Matching is still on command text, not intent - and it can still block.**
  Anchoring to a command segment fixed the single-line cases: with a rival holding
  the org, `git commit -m "fix flake in npx playwright test"`, an `echo` into a
  notes file, `gh pr create --body "...npx playwright test"` and
  `git log --grep="playwright test"` used to return exit 2 and now return 0. What
  is left is narrower but is the same kind of harm, so read it as a limitation on
  what you can type, not as a leak.

  A **newline counts as a segment boundary**, so any command whose *later lines*
  begin with a test invocation resolves - which means it **takes a lease, and is
  blocked outright while another session holds that org**. Measured at exit 2, all
  of them routine work here:

  - a multi-line `git commit -m` whose body mentions a suite (this repo's own
    commit conventions mandate multi-line messages), e.g. a second line reading
    `npx playwright test was red`
  - `gh pr create --body "## Test plan⏎npx playwright test⏎"`
  - a heredoc: `cat > notes.md <<EOF⏎npx playwright test⏎EOF`
  - and the single-line variant of the same thing, a quoted separator:
    `git commit -m "wip; npx playwright test"`

  If one of these is refused, the command itself is fine - re-run it once the other
  session finishes, or run that one call with `SF_LEASE_ENABLE= <command>` to make
  the hook inert for it.

  It cuts the other way too: a test command the segment rule cannot see takes **no
  lease at all**, so `( npx playwright test )` and `echo $(npx playwright test)`
  both run unprotected.

  Closing this properly means parsing the shell - knowing which text is a command
  and which is an argument - not a better regex, so it is deliberately not
  attempted. A lease taken this way is still released by the PostToolUse hook for
  the same call.
- **No refcount on parallel claims from one session.** A claim is per-identity,
  not per-call, and PostToolUse releases outright. Reproduced: `sess-A` claims
  `orga` for call #1 and re-entrantly for call #2; PostToolUse for #2 releases it
  while #1 is still running, and a rival's claim then returns rc 0. Claude Code
  batches independent Bash calls, and both suites canonicalize to one org, so
  "run e2e and canary at once" is exactly that shape. Closing it needs a claim
  token or a refcount in the lease metadata - real design work, deliberately not
  attempted in a fix wave. Until then, treat two suites launched in one batch as
  unprotected against each other.
- Only the invocation shapes listed above are recognised. A runner started some
  other way takes no lease.
- `~/.claude/hooks/track-crm-org.sh`, the status line's CRM-org tracker, is not
  in this repo and still carries **its own copy** of the resolution logic that
  `sf-org-resolve` was derived from. Converging the two is follow-up work; until
  then a resolution rule has to change in both places.

### Verifying it end to end

Needs two live sessions. In session A, start a suite in a repo that resolves to a
shared org; while it runs, ask session B for a test command against the same org.
B's Bash call should be refused before it executes, naming A; `npm run lint`
should never be. When A finishes, B's retry should succeed, and a third session's
SessionStart should list the lease while A holds it.

Use a bare `npx playwright test`. `TEST_ENV=staging` resolves to nothing in the
e2e repo - there is no `.env.staging` there - so it would read as a false
negative.

Include one more case in session B while A holds the org: a **multi-line
`git commit -m`** whose body mentions a suite. That is the shape the text-matching
gap above governs, and it is the difference between "the guard stops test runs" and
"the guard stops me writing a commit message". Expect it to be **refused** today -
the point of running it is to see for yourself how often that would happen, and to
decide whether that cost is acceptable before leaving the hooks armed.

## Local Overrides

Machine-local overrides are ignored by Git.

For WezTerm, copy the example:

```sh
cp wezterm/local.lua.example wezterm/local.lua
```

In copy mode, place the file at:

```text
~/.config/wezterm/local.lua
```

Supported WezTerm local settings include:

```lua
return {
  background_hsb = {
    brightness = 0.40,
    saturation = 0.90,
  },
  background_rotation_seconds = 15 * 60,
}
```

You can also add an `apply` function for arbitrary WezTerm overrides:

```lua
return {
  apply = function(config, wezterm, env)
    config.font_size = 14.0
  end,
}
```

For tmux, create:

```sh
cp tmux/tmux.local.conf.example ~/.tmux.local.conf
```

`tmux/tmux.conf` sources `~/.tmux.local.conf` when present.

## Recommended Tools

This is a menu, not a checklist. You adopt a tool by replacing a habit, and you
can only build a habit or two at a time - so start with the short **Start here**
set, then add the rest only when you hit the specific annoyance each one solves.
Installing everything at once just leaves you with tools you forget you have.

This repo manages WezTerm and tmux; the shell (`~/.zshrc`) and Git
(`~/.gitconfig`) snippets below go in your personal dotfiles.

### Start here

The daily-driver kit. Each item is either passive (install it and existing
things just work better) or a single new reflex - together they cover most of
the benefit.

**A Nerd Font** - install first; the prompt and several tools use its glyphs.

```sh
brew install --cask font-jetbrains-mono-nerd-font
```

```lua
-- wezterm/local.lua: point WezTerm at it (appearance.lua sets the shared default)
return {
  apply = function(config, wezterm, env)
    config.font = wezterm.font('JetBrainsMono Nerd Font')
  end,
}
```

**zsh-autosuggestions + zsh-syntax-highlighting** - passive: ghost text from
history (accept with `->`/End) and command coloring. Just keep typing.

```sh
brew install zsh-autosuggestions zsh-syntax-highlighting
```

```sh
# ~/.zshrc  (autosuggestions first; syntax-highlighting MUST be sourced last)
if command -v brew >/dev/null 2>&1; then
  ZSH_SHARE="$(brew --prefix)/share"
  [ -f "$ZSH_SHARE/zsh-autosuggestions/zsh-autosuggestions.zsh" ] &&
    source "$ZSH_SHARE/zsh-autosuggestions/zsh-autosuggestions.zsh"
  [ -f "$ZSH_SHARE/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh" ] &&
    source "$ZSH_SHARE/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh"
fi
```

**starship** - passive: a more informative prompt (git state, exit codes), no
new commands to learn.

```sh
brew install starship
# ~/.zshrc:  eval "$(starship init zsh)"
```

**fzf** - one reflex: fuzzy `Ctrl-R` history search (and file pickers).

```sh
brew install fzf
# ~/.zshrc:  source <(fzf --zsh)
```

A useful fzf-powered helper for jumping into git worktrees - handy since Claude
Code creates them under `.claude/worktrees/` and typing those paths is tedious.
Run `wt` for the picker, or `wt <filter>` to pre-filter - it jumps straight there
when only one worktree matches. Worktrees are per-repo, so run it inside the repo:

```sh
# ~/.zshrc - jump to a git worktree of the current repo by fuzzy pick.
# `wt` opens the picker; `wt <filter>` pre-filters (jumps if a single match).
wt() {
  local dir
  dir=$(git worktree list 2>/dev/null | fzf --prompt='worktree> ' --query="$*" --select-1 --exit-0 | awk '{print $1}')
  if [ -n "$dir" ]; then
    cd "$dir"
  else
    echo "wt: no worktree matched (run inside the repo - worktrees are per-repo)" >&2
  fi
}
```

**zoxide** - one new verb: `z proj` instead of a long `cd` path.

```sh
brew install zoxide
# ~/.zshrc:  eval "$(zoxide init zsh)"
```

**git-delta** - passive: syntax-highlighted git diffs.

```sh
brew install git-delta
# ~/.gitconfig:  [core] pager = delta   (see `delta --help`)
```

### Add when you feel the need

Install one only when its trigger actually bites. A tool adopted to solve a real
annoyance sticks; one installed speculatively becomes clutter. (You already have
`rg` and `jq`.)

| Tool | Reach for it when... | Install |
|---|---|---|
| `lazygit` | multi-step git (staging hunks, rebasing, juggling branches) feels clumsy on the CLI | `brew install lazygit` |
| `bat` | you `cat` a file and want syntax highlighting | `brew install bat` |
| `eza` | plain `ls` feels flat and you want git status or a tree at a glance | `brew install eza` |
| `fd` | `find`'s syntax annoys you | `brew install fd` |
| `ripgrep` (`rg`) | `grep -r` is slow or noisy (also powers Neovim's finder later) | `brew install ripgrep` |
| `yazi` | you want to browse, preview, and bulk-move files visually | `brew install yazi` |
| `jq` / `yq` | you're poking at JSON / YAML (API responses, configs) | `brew install jq yq` |
| `glow` | you want Markdown / LLM output rendered, not raw | `brew install glow` |
| `atuin` | fzf's `Ctrl-R` isn't enough; you want searchable, cross-machine history | `brew install atuin` |
| `btop` | something's hot and `top` isn't enough | `brew install btop` |
| `dust` / `duf` | "what's eating my disk?" / you want a clearer `df` | `brew install dust duf` |
| `procs` | `ps aux \| grep` gets old | `brew install procs` |
| `watchexec` | you keep re-running a command after every file save | `brew install watchexec` |

### tmux plugins (session persistence)

Reach for these when you want your window/pane layout to survive a reboot:
[tmux-resurrect](https://github.com/tmux-plugins/tmux-resurrect) saves and
restores sessions, and
[tmux-continuum](https://github.com/tmux-plugins/tmux-continuum) adds background
auto-save plus auto-restore when the tmux server starts.

Skip TPM here. TPM discovers plugins by scanning `~/.tmux.conf`, but in this repo
that file is the shared config and machine-local settings belong in
`~/.tmux.local.conf` (sourced last), which TPM does not scan - and `set -g @plugin`
is a single option that later declarations overwrite. For a couple of plugins it
is simpler and reliable to clone them and source their entry scripts directly:

```sh
git clone https://github.com/tmux-plugins/tmux-resurrect ~/.tmux/plugins/tmux-resurrect
git clone https://github.com/tmux-plugins/tmux-continuum  ~/.tmux/plugins/tmux-continuum
```

```tmux
# ~/.tmux.local.conf
# Set the @continuum options before sourcing continuum (it reads them at init),
# and source resurrect before continuum, which depends on it.
set -g @continuum-restore 'on'         # auto-restore the last save when tmux starts
set -g @continuum-save-interval '15'   # auto-save every 15 minutes (0 disables)
run-shell '~/.tmux/plugins/tmux-resurrect/resurrect.tmux'
run-shell '~/.tmux/plugins/tmux-continuum/continuum.tmux'
```

Reload with `Ctrl-a r` to activate; save/restore manually with `Ctrl-a Ctrl-s` /
`Ctrl-a Ctrl-r`. Add other tmux plugins the same way - clone the repo and add a
matching `run-shell '.../<plugin>.tmux'` line. Update a plugin with
`git -C ~/.tmux/plugins/<name> pull`.

`@continuum-restore 'on'` is the line that brings sessions back after a reboot:
continuum auto-saves in the background and auto-restores the last save when the
tmux server next starts. Without it, continuum still saves, but you would restore
by hand with `Ctrl-a Ctrl-r`.

**What survives, and what does not.** Restore brings back windows, panes,
layout, and each pane's working directory - but not live program state. After a
reboot your Claude Code / Codex panes come back as plain shells in the right
directories, not resumed conversations. To resume the conversation itself, use
the agent's own mechanism from that directory: `claude --continue` (most recent
conversation in that dir) or `claude --resume` (pick one); Codex has
`codex resume`. Claude keys history by directory and resurrect restores the
directory, so `claude --continue` in a restored pane lands on that project's last
conversation.

For opt-in recovery of multiple Codex panes, use
[`codex-restore`](docs/codex-restore.md): start a managed pane with
`codex-restore start`, then after tmux restores run `codex-restore restore` and
confirm the exact saved UUID-to-pane matches. It never uses `codex resume --last`
for every pane. `codex-restore install-login` optionally opens WezTerm after
graphical login; it deliberately leaves the final resume confirmation to you.

### Reference

**Everything at once (fresh machine):**

```sh
brew install \
  zsh-autosuggestions zsh-syntax-highlighting starship fzf zoxide atuin \
  eza bat fd ripgrep dust duf procs btop \
  jq yq glow yazi lazygit git-delta gh watchexec entr tmux
brew install --cask wezterm font-jetbrains-mono-nerd-font
```

Prefer a reproducible manifest? Keep a `Brewfile` and run `brew bundle`.

**WezTerm extras:** WezTerm has a plugin system (`wezterm.plugin.require`) - e.g.
[`resurrect.wezterm`](https://github.com/MLFlexer/resurrect.wezterm) for
window/tab/pane layouts, and `smart-splits` for unified pane navigation with
Neovim.

**Neovim.** This repo ships a minimal, purpose-built Neovim config under
[`nvim/`](nvim/README.md) - navigate, open, git, and read/review, with no LSP or
autocomplete. It installs alongside WezTerm and tmux (see Local Editing Mode) and
unlocks **reviewing branches locally instead of in the browser**:

- `diffview.nvim` - `<leader>gd` (`:DiffviewOpen main...HEAD`) shows the whole
  branch diff as a file tree with side-by-side panes (the "Files changed" view).
- `gitsigns` + `lazygit` - inline hunks, blame, and a full git TUI (`<leader>gg`).
- `render-markdown.nvim` - renders `.md` inline for read-heavy work.

Copy the entire current file from normal mode:

```vim
:%y+
```

This uses the system clipboard. If the active Neovim build does not expose
clipboard support, use `:%y` to yank into Neovim's default register instead.

Full loop: `gh pr checkout <n>` -> `wt` -> `nvim` -> `<leader>gd`. See
[`nvim/README.md`](nvim/README.md) for the keymap cheat sheet. Before Neovim is
installed, `gh pr diff <n>` (piped through `delta`) or `lazygit` cover branch
review from the terminal.

## Uninstall And Restore

Preview uninstall:

```sh
./uninstall-macos.sh --dry-run
```

Remove this setup and restore the latest timestamped backups when present:

```sh
./uninstall-macos.sh --restore-latest
```

Remove this setup without restoring old files:

```sh
./uninstall-macos.sh --remove-only
```

Uninstall removes `~/.local/bin/session-objective`, the two lease binaries and
the four `~/.claude/hooks/sf-lease-*.sh` scripts, but it cannot touch
`~/.claude/settings.json`, since this repo never installs it. Remove those hook
entries from that file by hand - and `unset SF_LEASE_ENABLE` - or they will point
at scripts that are no longer there, which errors on every Bash call.

## Backgrounds

Background rotation is configured in:

```text
wezterm/modules/backgrounds.lua
```

To change brightness:

```lua
-- wezterm/local.lua
return {
  background_hsb = {
    brightness = 0.16,
    saturation = 0.90,
  },
}
```

To change the interval:

```lua
-- wezterm/local.lua
return {
  background_rotation_seconds = 2 * 60 * 60,
}
```

Wallpapers are delivered as split GitHub Release bundles, not committed to git.
`install-macos.sh` downloads bundle tarballs from rolling releases such as
`backgrounds-general`, `backgrounds-vehicles`, and `backgrounds-anime`, then
extracts them into the local wallpaper tree (into the repo tree for `--link`,
or `~/.config/wezterm` for copy mode). Re-runs skip a bundle only when that
bundle's published checksum is unchanged **and** its local directory is already
populated - so rerunning the installer self-heals a missing or deleted bundle.
Fetch failures are non-fatal per bundle: if one release is unreachable, install
still completes and leaves the other bundles unchanged.

- Skip the fetch: `./install-macos.sh --skip-backgrounds`
- Force a re-download: `./install-macos.sh --refresh-backgrounds`

To publish a new set (repo owner): add/update images under
`wezterm/assets/backgrounds/`, list them in the manifests, then run
`./scripts/publish-backgrounds.sh`. That publishes one tarball per configured
bundle. To publish only one bundle:

```sh
./scripts/publish-backgrounds.sh --bundle anime
```

List the relative path of any new or changed image in the relevant file under
`wezterm/modules/background_manifests`.

The background list is intentionally explicit. WezTerm does not auto-scan the
folders, so archive, experiment, or sensitive folders can exist without showing
up in rotation unless a file is added to a manifest.

Machine-local excludes are also supported:

```lua
-- wezterm/local.lua
return {
  background_excludes = {
    '200-anime/haikyuu/014-pointing-black.png',
  },
}
```

This is useful when you want to park a background temporarily without removing
it from the shared curated rotation.

## Background Inbox

For repeated wallpaper work, use the inbox workflow instead of hand-describing
the same defaults every time.

Drop screenshots into:

```text
wezterm/assets/inbox/
```

If the screenshots are still on your Desktop, use the helper to import them and
auto-create sidecars from the sample YAML:

```sh
./scripts/import-background-inbox.sh --move --series haikyuu --mode stylized --from-dir ~/Desktop
```

That command:

- moves or copies the image files into `wezterm/assets/inbox/`
- selects only top-level PNG and JPEG files from the directory (it does not
  recurse), matching extensions case-insensitively and ordering by basename in
  deterministic C/byte order
- imports the first files that fit in the remaining inbox capacity, up to 10
- creates matching `.yaml` sidecars from `_sample/scene-001.yaml`
- optionally stamps the same `series` / `mode` onto every imported file
- enforces a maximum of **10 pending images** in the inbox; process or archive
  the current batch before importing more

Useful variants:

```sh
# keep the originals on Desktop
./scripts/import-background-inbox.sh --copy ~/Desktop/'Screenshot 2026-07-15 at 9.12.01 PM.png'

# import and jump straight into editing the generated YAML files
./scripts/import-background-inbox.sh --move --series attack-on-titan --mode as_is --edit --from-dir ~/Desktop
```

Explicit image paths and directory mode support PNG and JPEG files. Directory
mode cannot be combined with explicit paths.

For each screenshot, add a sidecar YAML file with the same basename:

```text
wezterm/assets/inbox/scene-001.png
wezterm/assets/inbox/scene-001.yaml
```

Processed source screenshots can be moved into:

```text
wezterm/assets/inbox/_processed/
```

That archive is ignored by the inbox validator, so it will not stay in the
active queue.

Only two fields are required:

```yaml
series: haikyuu
mode: stylized
```

You can also add an optional `focus` field when the source frame needs tighter
direction about what to preserve, crop around, or black out.

Example:

```yaml
series: haikyuu
mode: stylized
focus: >
  Keep the yellow hair girl, orange hair boy, orange hair woman, and the man on
  her right. Keep the middle turnstiles and black out everything else.
```

Use `focus` for things like:

- which characters to keep
- which object or action is the real subject
- what background elements to preserve
- what should fall away into black negative space
- whether the scene should stay close to the frame or be more selectively reduced

Valid `mode` values are:

- `stylized`
- `as_is`

Mode meaning is intentionally narrow:

- `stylized`: closer to `200-anime/haikyuu/001` through `008`
  - darker and more transformed
  - stronger wallpaper reinterpretation
- `as_is`: closer to `200-anime/haikyuu/009` and later
  - preserve the source frame more directly
  - still apply dark/warm terminal treatment and UI cleanup

The rest is intentionally hardcoded for the current wallpaper workflow:

- `lighting`: `dark_warm`
- `notes`: terminal-background defaults

Validate the queue before asking Codex to process it:

```sh
./scripts/check-background-inbox.sh
./scripts/list-background-inbox.sh
```

Then hand off the queue with a prompt like:

```text
Process the background inbox.
```

Codex should use the inbox file, apply the default dark/warm terminal treatment,
respect any optional `focus` direction, route the output into the right
background folder for the declared series, and update the relevant manifest
file.

`./scripts/list-background-inbox.sh` is the quick preflight view. It prints the
pending inbox items, their series/mode metadata, and the inferred destination
path based on the current library numbering. If you want to override the
generated filename slug, add an optional `slug` field:

```yaml
series: haikyuu
mode: stylized
slug: tsukishima-ushijima-celebration
```

## Asset Scaling

The current scaling approach is:

- Keep rotation on an explicit allowlist rather than a pure exclude model.
- Split that allowlist into small manifest files by category or franchise.
- Keep backgrounds grouped under numeric categories, then subfolders such as
  `200-anime/haikyuu`.
- Keep individual wallpaper files at or below roughly 2.5 MiB.
- Split published wallpapers into category bundles instead of one monolithic
  release.
- Keep bundle totals within their current caps:
  - `general`: 16 MiB
  - `vehicles`: 24 MiB
  - `anime`: 200 MiB

`./scripts/publish-backgrounds.sh` enforces the current image size limits
(via `./scripts/check-background-assets.sh`) before publishing bundle releases,
so an oversized asset fails the publish rather than CI.

If the library outgrows those limits, the next step is to curate older assets
out of the repo or move larger wallpaper archives to Git LFS or external
storage, not to loosen the rotation manifest into auto-discovery.

## Notes

The LLM activity marker is driven primarily by pane titles: it recognizes the
working spinner and idle state of both Claude Code and Codex, which animate and
label their terminal titles. Foreground command names are only a fallback for
other CLIs - Claude and Codex report an unstable process name (e.g. a version
string), so they are detected by title, not command. CLIs that expose neither
may only show a generic detected marker.

## License

MIT. See [LICENSE](LICENSE).
