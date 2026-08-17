#!/usr/bin/env bash
set -euo pipefail

# Behavioural tests for bin/session-objective. Runs against an isolated store via
# SESSION_OBJECTIVE_HOME so it never touches live session state.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$repo_root/bin/session-objective"

if ! command -v jq >/dev/null 2>&1; then
  echo "test-session-objective: jq not found (brew install jq)" >&2
  exit 1
fi

SESSION_OBJECTIVE_HOME="$(mktemp -d)"
export SESSION_OBJECTIVE_HOME
trap 'rm -rf "$SESSION_OBJECTIVE_HOME"' EXIT

failures=0
check() {
  local label="$1" want="$2" got="$3"
  if [[ "$want" == "$got" ]]; then
    printf '  ok   %s\n' "$label"
  else
    printf '  FAIL %s\n       want: [%s]\n       got:  [%s]\n' "$label" "$want" "$got" >&2
    failures=$((failures + 1))
  fi
}

submit() {
  local sid="$1" prompt="$2"
  jq -nc --arg s "$sid" --arg p "$prompt" '{session_id:$s, prompt:$p}' | "$bin" capture
}

objective_of() { "$bin" read "$1"; }

# --- seeding and stickiness ---------------------------------------------------
submit s1 "yes"
check "short prompt does not seed" "" "$(objective_of s1)"

submit s1 "Heal the failing smart-rep spec on EC2"
check "substantive prompt seeds" "Heal the failing smart-rep spec on EC2" "$(objective_of s1)"

submit s1 "now push and open a PR please"
check "later prompt does not clobber" "Heal the failing smart-rep spec on EC2" "$(objective_of s1)"

# --- explicit override --------------------------------------------------------
submit s1 "/objective audit log content subset"
check "/objective overrides" "audit log content subset" "$(objective_of s1)"

submit s1 "another long prompt that should be ignored now"
check "override is pinned" "audit log content subset" "$(objective_of s1)"

submit s1 "/objective"
check "bare /objective does not blank" "audit log content subset" "$(objective_of s1)"

submit s1 "/objective    "
check "bare /objective with spaces does not blank" "audit log content subset" "$(objective_of s1)"

submit s1 "objective: buffer time scenarios"
check "objective: prefix overrides" "buffer time scenarios" "$(objective_of s1)"

submit s2 "/objectives-report generate the thing"
check "a different /objectives word is not the command" \
  "/objectives-report generate the thing" "$(objective_of s2)"

# --- truncation --------------------------------------------------------------
long="$(printf 'x%.0s' $(seq 1 80))"
submit s3 "objective: $long"
check "truncates to max length plus ellipsis" "$(printf 'x%.0s' $(seq 1 48))..." "$(objective_of s3)"

check "respects SESSION_OBJECTIVE_MAX_LEN" "$(printf 'x%.0s' $(seq 1 10))..." \
  "$(SESSION_OBJECTIVE_MAX_LEN=10 "$bin" read s3)"

# --- reset -------------------------------------------------------------------
jq -nc '{session_id:"s1", source:"startup"}' | "$bin" reset
check "startup does not clear" "buffer time scenarios" "$(objective_of s1)"

jq -nc '{session_id:"s1", source:"clear"}' | "$bin" reset
check "clear resets the objective" "" "$(objective_of s1)"

# Sessions are independent: a reset aimed at one id must not touch another's.
submit p1 "Investigate the booking confirm timeout"
submit p3 "A live session that must survive the sweep"
jq -nc '{session_id:"none", source:"startup"}' | "$bin" reset
check "unrelated reset keeps other objectives" "A live session that must survive the sweep" \
  "$(objective_of p3)"
check "each session keeps its own objective" "Investigate the booking confirm timeout" \
  "$(objective_of p1)"

# TMUX_PANE is no longer read: nothing renders objectives per pane any more.
check "pane subcommand is gone" "2" \
  "$("$bin" pane '%42' >/dev/null 2>&1; echo $?)"

# --- unparsed payload diagnostic ---------------------------------------------
jq -nc '{session_id:"s9", surprise:"a long enough value to seed with"}' | "$bin" capture
check "unknown prompt field leaves a diagnostic" "yes" \
  "$([[ -f "$SESSION_OBJECTIVE_HOME/.unparsed-payload.json" ]] && echo yes || echo no)"
submit s9 "a recognisable prompt field again"
check "a parsed payload clears the diagnostic" "no" \
  "$([[ -f "$SESSION_OBJECTIVE_HOME/.unparsed-payload.json" ]] && echo yes || echo no)"

# --- robustness: a hook must never fail the prompt ---------------------------
printf 'not json at all' | "$bin" capture
check "malformed stdin exits 0" "0" "$?"
printf '' | "$bin" capture
check "empty stdin exits 0" "0" "$?"
printf '{}' | "$bin" capture
check "payload with no session id exits 0" "0" "$?"
printf '{}' | "$bin" reset
check "reset with no session id exits 0" "0" "$?"
check "read of an unknown session is empty" "" "$(objective_of no-such-session)"
"$bin" doctor >/dev/null
check "doctor exits 0" "0" "$?"

# --- seed normalization ------------------------------------------------------
# Cases taken from real prompt shapes: a raw truncation of these reads
# "create a plan to implement https://leandat...", which says nothing.
seeded() {
  local sid="n$1"
  submit "$sid" "$2"
  "$bin" read "$sid"
}

check "jira browse url collapses to the ticket key" "plan: BB-484" \
  "$(seeded 1 'Create a plan to implement https://leandatainc.atlassian.net/browse/BB-484')"
check "create-a-plan-for becomes a plan tag" "plan: BB-403" \
  "$(seeded 2 'Create a plan for https://leandatainc.atlassian.net/browse/BB-403')"
check "lets-plan-to becomes a plan tag" "plan: make a global review skill" \
  "$(seeded 3 "Let's plan to make a global review skill")"
check "pr description opener is tagged" "PR desc: jalvarez/ENG-645-Refactor" \
  "$(seeded 4 'create a pr description for jalvarez/ENG-645-Refactor')"
check "github pull url collapses to repo and number" "Review e2e-automation PR 469 now" \
  "$(seeded 5 'Review https://github.com/leandata/e2e-automation/pull/469 now')"
check "github issue url collapses" "e2e-automation issue 12 is open" \
  "$(seeded 6 'https://github.com/leandata/e2e-automation/issues/12 is open')"
check "other urls collapse to the last path segment" "read harness-design-long-running" \
  "$(seeded 7 'read https://www.anthropic.com/engineering/harness-design-long-running')"
check "url fragments are dropped" "see harness-design" \
  "$(seeded 8 'see https://www.anthropic.com/engineering/harness-design#part-two')"
check "can-you framing is dropped" "summarize what changed since Feb" \
  "$(seeded 9 'Can you summarize what changed since Feb')"
check "i-want-you-to framing is dropped" "fix the booking confirm timeout" \
  "$(seeded 10 'I want you to fix the booking confirm timeout')"

# Review-command openers. The command name alone can be 29 characters, which ate
# the whole status-bar budget before the PR number it was about.
check "review command collapses to Review PR n" "Review PR 469" \
  "$(seeded 16 '/playwright-code-review-panel e2e-automation pr 469')"
check "review command with a github url collapses the same way" "Review PR 469" \
  "$(seeded 17 '/playwright-code-review-panel https://github.com/leandata/e2e-automation/pull/469')"
check "an already-uppercase PR token is accepted" "Review PR 469" \
  "$(seeded 18 '/playwright-code-review-panel e2e-automation PR 469')"
check "a hash-prefixed number is accepted" "Review PR 512" \
  "$(seeded 19 '/code-review-panel e2e-automation pr #512')"
check "text after the number survives" "Review PR 12 in bearoku" \
  "$(seeded 20 '/canary-review pr 12 in bearoku')"
check "sibling review commands are covered" "Review the buffer time plan" \
  "$(seeded 21 '/plan-review the buffer time plan')"
check "a review command with no PR number still reads well" "Review my working diff" \
  "$(seeded 22 '/code-review-panel my working diff')"
check "a plain review verb is not treated as a command" "review the meeting log work" \
  "$(seeded 23 'review the meeting log work')"

# /rename is the most common opener in practice and is a hand-written label, so it
# is kept rather than skipped. tmux cannot read session_name; only Claude's status
# line can, so the store has to carry it.
check "rename keeps its text as the objective" "BB-443 - Harness Storage-State Paths" \
  "$(seeded 24 '/rename BB-443 - Harness Storage-State Paths')"

# Paste placeholders carry no information.
check "a paste placeholder is stripped mid-prompt" "Review PR 104 pushed back:" \
  "$(seeded 25 '/canary-review pr 104 pushed back: [Pasted text #1 +19 lines]')"
submit pasteonly '[Pasted text #1 +103 lines]'
check "a paste-only opener does not seed" "" "$("$bin" read pasteonly)"
submit pasteonly 'investigate the CCIO readiness poll'
check "the next real prompt seeds after a paste-only opener" \
  "investigate the CCIO readiness poll" "$("$bin" read pasteonly)"

# Planning and PR-description openers get a compact tag.
check "test plan opener is tagged" "test plan: BB-300" \
  "$(seeded 27 'Create a test plan for https://leandatainc.atlassian.net/browse/BB-300')"
check "write-a-pr-description opener is tagged" "PR desc: jalvarez/eng-613" \
  "$(seeded 28 'Write a PR description for jalvarez/eng-613')"
check "the and-title variant is tagged too" "PR desc: jalvarez/ENG-658" \
  "$(seeded 29 'Write a PR description and title for jalvarez/ENG-658')"
check "do-we-need-to-plan-for becomes a plan tag" "plan: BB-221" \
  "$(seeded 30 'Do we need to plan for BB-221')"

# Question framing that survived the first pass.
check "do-you-have-enough-context is dropped" "BB-39" \
  "$(seeded 31 'Do you have enough context for https://leandatainc.atlassian.net/browse/BB-39')"
check "are-you-able-to is dropped" "use ssh to reach the EC2 box" \
  "$(seeded 32 'Are you able to use ssh to reach the EC2 box')"
check "i-would-like-to is dropped" "take a look back at BB-59" \
  "$(seeded 33 'I would like to take a look back at https://leandatainc.atlassian.net/browse/BB-59')"
check "is-there-a-way-to is dropped" "use a ssh tunnel for postgres" \
  "$(seeded 34 'Is there a way to use a ssh tunnel for postgres')"

# Config commands describe the tool, not the work.
submit metaA '/model sonnet'
check "config command /model does not seed" "" "$("$bin" read metaA)"
submit metaB '/release-notes now please'
check "config command /release-notes does not seed" "" "$("$bin" read metaB)"
submit metaC '/mcp list the servers'
check "config command /mcp does not seed" "" "$("$bin" read metaC)"
submit metaA 'fix the flaky handoff teardown'
check "a real prompt seeds after a config command" "fix the flaky handoff teardown" \
  "$("$bin" read metaA)"

# Task verbs are the objective and must survive untouched.
check "a leading fix verb is preserved" "fix the failing smart rep spec" \
  "$(seeded 11 'fix the failing smart rep spec')"
check "a leading add verb is preserved" "add a way to bypass the login gate" \
  "$(seeded 12 'add a way to bypass the login gate')"
check "a leading review verb is preserved" "review the meeting log integrity work" \
  "$(seeded 13 'review the meeting log integrity work')"

# A bare ticket URL is long enough to seed, and normalizes below the seed floor.
check "a bare ticket url still seeds despite shortening" "BB-277" \
  "$(seeded 14 'https://leandatainc.atlassian.net/browse/BB-277')"

# An explicit override is the user's own words and must NOT be rewritten.
submit n15 "Create a plan to implement https://leandatainc.atlassian.net/browse/BB-1"
submit n15 "/objective Create a plan for https://leandatainc.atlassian.net/browse/BB-9"
check "explicit /objective is stored verbatim" \
  "Create a plan for https://leandatainc.atlassian.net/browse/BB-9" \
  "$(SESSION_OBJECTIVE_MAX_LEN=200 "$bin" read n15)"

# --- newline and tab collapsing ----------------------------------------------
jq -nc '{session_id:"s10", prompt:"first line\nsecond\tline with tab"}' | "$bin" capture
check "collapses newlines and tabs to spaces" "first line second line with tab" "$(objective_of s10)"

if (( failures > 0 )); then
  printf '\ntest-session-objective: %d check(s) failed\n' "$failures" >&2
  exit 1
fi

echo "session-objective behaves correctly"
