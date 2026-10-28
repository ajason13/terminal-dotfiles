# Codex budget runner

`codex-budget` requires Node 22+, the installed Codex CLI, and ChatGPT sign-in.
Its status command calls the documented app-server `config/read` and
`account/rateLimits/read` endpoints without starting a thread or model turn.
It reports only model, allowance percentages, and reset timestamps; credentials
and account identifiers are neither read from files nor printed.

```sh
codex-budget status
codex-budget status --model gpt-6.1-sol
codex-budget status --task-size large
codex-budget run --repo /path/to/clean-repo --task /path/to/task.md --task-size bounded --wait
```

Write one bounded behavior change and its acceptance criteria in each task
file. Repeat `--task` to queue separate tasks sequentially. Task files may live
outside the repo to keep the working tree clean. Use `--effort high` for a
difficult task or `--model gpt-6-luna` for mechanical work; otherwise the
effective Codex configuration supplies both settings.

The custom reserve policy is defined by global `AGENTS.md`. Percentages mean
remaining allowance; the lowest applicable window governs, including five-hour
and weekly windows.

| Remaining allowance | Action |
| --- | --- |
| Above 15% | May start a bounded task after assessing headroom for implementation, verification, fixes, review, and delivery. |
| 5–15% | Finish active work and checkpoint; do not start queued implementation. |
| Below 5% | Save a checkpoint and stop substantive work. |
| Exhausted | Wait for the reported reset, then recheck all applicable windows. |

In interactive sessions, 30% is a caution threshold for large or uncertain work:
split or defer the task if headroom is insufficient to reach a verified stopping
point. A documentation correction or isolated fix with known checks may be
bounded; a cross-cutting refactor or regression with an unknown cause is large
or uncertain. File count alone does not determine task size.

For unattended runs, choose `--task-size bounded` (the default, requires above
15%) or `--task-size large` (requires above 30%, also for uncertain work). This
option applies to every task in the invocation and to `status`, reset selection,
and saved usage observations. Run mixed-size queues separately or classify the
whole queue as large. Do not select bounded merely to bypass the large reserve.
At 85% five-hour / 29% weekly, a bounded task can start; a large unattended task
waits. This is a workflow preference, not an OpenAI quota guarantee.

For Plus, status requires both five-hour and weekly data. Missing, stale, or
malformed data stops unattended work. Model-specific buckets are included when
the service explicitly identifies the selected model. An unknown plan or
unidentifiable extra allowance stops unattended work rather than guessing its
applicability.

`--wait` keeps this process alive using ordinary timers, with no model polling,
until the latest constraining reset plus a small buffer; it then re-queries
both windows. The default total wait is 24 hours; use
`--max-wait-hours 168` to permit a weekly reset. Leave the process running in a
terminal/tmux session. This installs no recurring job or launch daemon.

Each task uses `codex exec` with workspace-write sandboxing and automatic
approval review. No sandbox bypass is used. A repository lock prevents two
runner instances from owning the same Git common directory. The runner
requires a clean working tree and rechecks repository state after waiting.
Other Codex sessions can consume shared allowance concurrently, so this does
not guarantee an in-flight reserve or block credit spending if a task overruns
the included allowance. Keep tasks small and disable paid overage settings in
the product if you require an absolute no-spend guarantee.

The runner stores `checkpoint.json`, a response schema, and concise task
reports in `<git-common-dir>/codex-budget/<run-id>/`. Files contain task paths
and hashes, branch/commit, session ID, verification, unfinished criteria, and
next action. Raw tool streams and credentials are not saved. Normal Codex
session persistence remains controlled by Codex settings.

An incomplete, failed, or interrupted task stops the queue. Interrupt signals
are forwarded to the active Codex process; if it does not stop within ten
seconds, the process group is terminated and the queue remains stopped. Inspect the printed
checkpoint and recorded session before resuming it explicitly; the runner
never repeats a possibly mutating task automatically. The checkpoint is local
state, not an unchangeable security or audit record. A crash during waiting can
leave `runner.lock`; inspect the PID and active processes before removing a
stale lock. Previously completed task files must be omitted from a new run.

Verify with:

```sh
node --test scripts/test-codex-budget.mjs
```

Protocol reference: [Codex App Server](https://learn.chatgpt.com/docs/app-server).
The CLI labels app-server tooling experimental; errors or protocol changes stop
the runner rather than falling back to an undocumented account endpoint.
