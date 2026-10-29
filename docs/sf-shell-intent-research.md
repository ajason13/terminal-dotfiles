# Shell intent in Salesforce lease resolution

Research for [#102](https://github.com/ajason13/terminal-dotfiles/issues/102),
2026-10-29, against `34bc114`. This document and its synthetic runner change no
installed behavior. Live frequency, operator impact, and willingness to adopt a
wrapper are unverified.

## Recommendation

**Retain the documented limits and defer a parser or wrapper implementation.**
The current resolver can block ordinary prose and miss real tests. Cwd mistakes
can also claim the wrong org when the original directory has resolvable config;
they do not necessarily result in no lease. Another regex would not resolve
shell syntax or dynamic execution reliably.

A parser could distinguish literal arguments from command nodes, but an AST
alone cannot establish runtime cwd, branch execution, or expanded command names.
A wrapper could make an individual invocation explicit, but existing raw
`npx playwright test` commands would bypass it unless callers actually adopt it.
Neither option currently has enough usage evidence or an agreed supported
grammar to justify changing a hook that runs before every Bash call.

Keep the existing off-by-default, fail-open, advisory policy. This is local
coordination for opted-in Claude Bash calls, not Salesforce-side enforcement or
coverage of bare terminals, other agents, or remote hosts. Revisit if repeated
false refusals or missed coordination justify the dependency and maintenance
cost, or if operators commit to an explicit wrapper workflow. No implementation
follow-up is proposed until those requirements are established.

## Reproduce the evidence

From the repository root, with Node, Bash and jq available:

```sh
node scripts/research-sf-shell-intent.mjs
bash scripts/test-sf-org-resolve.sh
bash scripts/test-sf-lease-hooks.sh
```

The [runner](../scripts/research-sf-shell-intent.mjs) invokes the real
[resolver](../bin/sf-org-resolve), [cwd helper](../claude/hooks/sf-lease-common.sh)
and [guard](../claude/hooks/sf-lease-guard.sh). It creates disposable fixture
repositories, two fake org identities, a fake identity map and private log/state
paths. A fixed fake lease binary simulates a rival holder; it does not exercise
the real store, expiry, or process-binding lifecycle. Command strings are passed
as data to fixed programs, never evaluated or executed. A synthetic command
substitution containing `touch` must leave its sentinel absent. Fixtures are
removed on completion or failure.

Each case records manually labelled possible test execution and expected current
resolver identity, then checks both identity/exit status and the real guard's
refusal behavior. `TARGET=child` is the assumed runtime context of the
variable-cd example; it is not expanded during observation. `child` has org B;
the payload directory has org A. A failed `cd missing && ...` cannot reach its
test. Other branches and test commands are not run to establish labels.

At the research revision, **25 cases pass: 9 correct, 7 false refusals, 4 missed
tests and 5 wrong-org resolutions**. These counts describe this deliberately
adversarial corpus, not production rates. A guard exit of 2 means refusal with
the synthetic rival holding whichever org was resolved; a wrong-org result can
both block unrelated work and leave the intended org unprotected.

| Cases | Intended behavior | Observed with rival |
| --- | --- | --- |
| Literal test, inline alias assignment, defined npm test script | Test org A | Resolve A; guard 2 |
| Lint, single-line quoted mention, inert sentinel substitution | No test | No identity; guard 0 |
| Multiline commit/PR prose, quoted semicolon, plain/quoted heredoc text | No test | Resolve A; guard 2 |
| Quoted heredoc containing `$(npx playwright test)` | Literal text | Resolve A; guard 2 |
| Unquoted heredoc containing the same substitution | Possible test org A | Resolve A; guard 2 |
| `( npx playwright test )`, `echo $(npx playwright test)`, backticks, quoted `"npx"` command word | Possible test org A | No identity; guard 0 |
| Leading `cd child && ...`, quoted literal child path | Test org B | Resolve B; guard 2 |
| Variable/late/nested cd, pushd, fifth leading cd | Test org B | Resolve A; guard 2 |
| Failed leading cd with `&&` | No reachable test | Resolve A; guard 2 |

The different results for substitution at the start of a heredoc line versus
inside `echo` are accidental text-match behavior. They are not a supported shell
grammar. Quoting the heredoc delimiter suppresses expansion; an unquoted heredoc
can contain executable substitutions even though its ordinary test-looking text
is only input data. See the GNU Bash manual on
[here documents](https://www.gnu.org/software/bash/manual/html_node/Redirections.html)
and [command substitution](https://www.gnu.org/software/bash/manual/html_node/Command-Substitution.html).

## Candidate comparison

Only the current resolver/guard was executed. Parser and wrapper results below
are design expectations, not benchmark or prototype results. No parser dependency
was installed, and no wrapper was added.

| Approach | False refusals | Missed protection / identity | Dependency and runtime cost | Adoption and bypass |
| --- | --- | --- | --- | --- |
| Retain current limits | Measured prose and unreachable-command refusals above remain | Measured misses and wrong cwd remain; supported invocation/config shapes only | Existing Bash, text tools and jq; no added startup or package | Existing opted-in hooks work as today; unsupported syntax and non-Claude callers bypass coordination |
| Bounded syntax parser | Can separate literal quoted/heredoc data from executable nodes; conservative branch handling can still refuse tests that never run | Could traverse nested commands/substitutions, but cwd, expansions, multiple orgs and dynamic scripts need separate policy | Add a pinned parser artifact and AST adapter; parse and walk on every armed call; latency, packaging and upgrade cost unmeasured | Can improve supported raw calls without wrapper adoption; unsupported/dynamic grammar still needs an honest fail-open outcome |
| Explicit execution wrapper | Explicit argv and identity/cwd can avoid guessing intent from prose for wrapped calls | Correctness depends on supplied identity/cwd, claim/bind/release lifecycle, and descendants; unwrapped calls remain outside its coverage | New installed command and lifecycle tests; work on opted-in invocations; no measured timing | Requires caller/documentation adoption; raw commands, aliases and direct runner calls can bypass it; retaining heuristic hooks would retain their false refusals |

One concrete parser candidate is the
[mvdan/sh syntax package](https://github.com/mvdan/sh#readme), which exposes shell
parsing separately from interpretation. Any future trial must pin a version,
select the actual caller dialect, walk syntax without using an interpreter, and
validate packaging on supported platforms. Supporting a dialect syntactically
does not mean its dynamic execution can be resolved statically. There is no
proposal to download or execute a parser automatically from a hook.

## Decisions required before a follow-up can be Ready

- **Supported grammar:** agree on caller dialect and whether literal simple
  commands, assignments, lists, pipelines, subshells, substitutions and literal
  leading cd are in scope. Dynamic command names, `eval`, `bash -c`, sourced
  scripts, functions/aliases, variable/glob cwd, directory stacks and conditional
  execution need explicit unsupported/unknown handling. Never execute text to
  discover these values.
- **Refusal versus missed coordination:** choose whether a possible test in an
  unexecuted branch warrants a claim. Parser errors and unsupported constructs
  must preserve the fail-open policy; unknown must not be advertised as protected.
  Decide how to surface that uncertainty without logging prompts or env values.
- **Multiple targets:** choose how one Bash call touching several orgs or cwd
  contexts would claim and release them. A parser cannot safely collapse these
  to one guessed identity; partial acquisition and ordering need separate design.
- **Wrapper adoption:** identify actual callers that will use explicit argv,
  cwd and identity; define its interaction with existing hooks to avoid duplicate
  claims. Decide whether heuristics remain, with their limits, or are retired
  after migration. Wrapper-only adoption cannot automatically protect raw calls.
- **Success and maintenance:** establish a real operator problem, acceptable
  per-call overhead, supported platforms, pin/update ownership, and rollback.
  A bounded parser trial should first improve the prose/substitution corpus
  without misidentifying cwd; a wrapper trial should demonstrate actual adoption
  and lifecycle cleanup. Either runtime change requires a separate issue and
  fresh-context Codex review of command gating and advisory exclusion.

The original rationale and limits are recorded in
[PR #52](https://github.com/ajason13/terminal-dotfiles/pull/52) and
[README Known gaps](../README.md#known-gaps). The current per-call and process
lifecycle fixes in [PR #126](https://github.com/ajason13/terminal-dotfiles/pull/126)
do not change shell intent detection. No new telemetry or runtime diagnostics are
needed for this research; the runner's case table is its reproducible evidence.
