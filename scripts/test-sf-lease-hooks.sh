#!/usr/bin/env bash
set -euo pipefail

# Behavioural tests for the four sf-lease Claude Code hooks. Everything runs
# against an isolated lease store, an isolated org map and a fixture repo, so
# the suite never touches live session state or a real org.
#
# SF_LEASE_HOOK_DIR points the suite at a copy of the hooks; that is how the
# mutation runs (deliberately-broken variants) are driven.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
hook_dir="${SF_LEASE_HOOK_DIR:-$repo_root/claude/hooks}"
guard="$hook_dir/sf-lease-guard.sh"
post="$hook_dir/sf-lease-post.sh"
end="$hook_dir/sf-lease-end.sh"
table="$hook_dir/sf-lease-table.sh"

if ! command -v jq >/dev/null 2>&1; then
  echo "test-sf-lease-hooks: jq not found (brew install jq)" >&2
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

export SF_LEASE_BIN="$repo_root/bin/sf-lease"
export SF_ORG_RESOLVE_BIN="$repo_root/bin/sf-org-resolve"
export SF_LEASE_HOME="$tmp/leases"
export SF_LEASE_LOG="$tmp/hook.log"
# Hermetic like scripts/test-sf-lease.sh: the real /tmp/e2e-scratch-pool gains
# .lock files during the other repo's normal operation, and a real org map on
# this machine would canonicalize the fixture identities out from under us.
export SCRATCH_POOL_LOCK_DIR="$tmp/pool"
export SF_ORG_MAP="$tmp/no-such-map"
mkdir -p "$SF_LEASE_HOME"

# Fixture repos. `q--orga...` -> identity `orga`, `q--orgb...` -> `orgb`; the
# nested one exists so `cd sub && ...` can be shown to resolve to a DIFFERENT
# org than the payload's .cwd would.
fixture="$tmp/my-e2e-repo"
mkdir -p "$fixture/sub"
printf 'SF_BASE_URL=https://q--orga.sandbox.my.salesforce.com\n' > "$fixture/.env"
printf 'SF_BASE_URL=https://q--orgb.sandbox.my.salesforce.com\n' > "$fixture/sub/.env"

# A stand-in sf-lease whose exit code is dictated by the caller: the only way
# to exercise every row of sf-lease's exit-code contract from the hook side.
shim_dir="$tmp/shim"
mkdir -p "$shim_dir"
{
  printf '#!/bin/sh\n'
  printf 'printf "%%s\\n" "$1" >> "${SHIM_CALLS:-/dev/null}"\n'
  printf 'case "$1" in\n'
  printf '  holder) [ -n "${SHIM_HOLDER:-}" ] && printf "%%s\\n" "$SHIM_HOLDER"; exit 0 ;;\n'
  printf 'esac\n'
  printf 'exit "${SHIM_RC:-0}"\n'
} > "$shim_dir/sf-lease"
chmod +x "$shim_dir/sf-lease"
shim="$shim_dir/sf-lease"

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

payload() { # tool cmd cwd session
  jq -nc --arg t "$1" --arg c "$2" --arg d "$3" --arg s "$4" \
    '{tool_name:$t, tool_input:{command:$c}, cwd:$d, session_id:$s}'
}

# The payload travels in a global so the remaining arguments can be env
# overrides. `env "$@" hook` with zero overrides is still a valid invocation.
PAYLOAD=""
# EVERY check goes through a deadline, not just the ones with a loop in view. A
# hook does not need a loop of its own to hang - it needs a child that blocks,
# and the guard and post hooks shell out to sf-lease and sf-org-resolve with no
# timeout. Before this was the default, a hanging SessionStart hook got 47 checks
# into this suite, stopped dead, reported NO failure, and was still running at 44s.
RUN_DEADLINE_SECONDS=20
run() { # hook [VAR=val ...]
  run_bounded "$RUN_DEADLINE_SECONDS" "$@"
}

# With a hard deadline, reporting HUNG if it had to be killed - so a hook that
# never returns FAILS this suite rather than hanging it. Take this explicitly
# only to override the default deadline; `run` already carries one.
run_bounded() { # seconds hook [VAR=val ...]
  local secs="$1" h="$2" rc=0 p k; shift 2
  printf '%s' "$PAYLOAD" | env "$@" "$h" >"$tmp/out" 2>"$tmp/err" &
  p=$!
  ( sleep "$secs"; kill -9 "$p" 2>/dev/null ) >/dev/null 2>&1 &
  k=$!
  wait "$p" 2>/dev/null || rc=$?
  kill "$k" 2>/dev/null || true
  [[ "$rc" -eq 137 ]] && printf 'HUNG' || printf '%s' "$rc"
}

out_text() { cat "$tmp/out"; }
err_text() { cat "$tmp/err"; }
has() { case "$1" in *"$2"*) printf yes ;; *) printf no ;; esac; }
session_of() { "$SF_LEASE_BIN" holder "$1" | sed -n 's/.*session=\([^ ]*\).*/\1/p'; }
lease_count() { ls -d "$SF_LEASE_HOME"/sf-*.lease 2>/dev/null | wc -l | tr -d ' '; }
reset_log() { rm -f "$SF_LEASE_LOG"; }
log_text() { cat "$SF_LEASE_LOG" 2>/dev/null || true; }
calls_of() { grep -c "^$1$" "$tmp/calls" 2>/dev/null || printf 0; }

TESTCMD='npx playwright test'

# --- this suite's own deadline ------------------------------------------------
# First, because everything below depends on it: a check that hangs reports
# nothing at all, so the deadline is the difference between a failing suite and a
# silent one. If `run` ever loses its deadline again, this check is what waits out
# the stub and fails instead of the suite stalling forever on some later hook.
hang_hook="$tmp/hang-hook.sh"
printf '#!/bin/sh\nsleep 30\n' > "$hang_hook"
chmod +x "$hang_hook"
PAYLOAD='{}'
check 'a hook that never returns is reported as HUNG' 'HUNG' "$(run_bounded 2 "$hang_hook")"
check 'and run enforces a deadline of its own, on every check' 'HUNG' \
  "$(RUN_DEADLINE_SECONDS=2 run "$hang_hook")"

# --- the arming gate ----------------------------------------------------------
# A hook that can block every Bash call in every live session must stay inert
# until it is explicitly switched on, and "explicitly" means an allowlist: a
# value nobody meant as "on" must not arm it.
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-A)"
check 'SF_LEASE_ENABLE unset: guard allows'      0 "$(run "$guard")"
check 'and takes no lease'                       0 "$(lease_count)"
check 'SF_LEASE_ENABLE=0: guard allows'          0 "$(run "$guard" SF_LEASE_ENABLE=0)"
check 'SF_LEASE_ENABLE=false: guard allows'      0 "$(run "$guard" SF_LEASE_ENABLE=false)"
check 'SF_LEASE_ENABLE=no stays inert'           0 "$(run "$guard" SF_LEASE_ENABLE=no)"
check 'still no lease after the gate cases'      0 "$(lease_count)"

# --- scope: only Bash, only commands that touch a shared org ------------------
PAYLOAD="$(payload Read "$TESTCMD" "$fixture" sess-A)"
check 'a non-Bash tool is ignored'               0 "$(run "$guard" SF_LEASE_ENABLE=1)"
check 'and takes no lease'                       0 "$(lease_count)"

PAYLOAD="$(payload Bash 'npm run lint' "$fixture" sess-A)"
check 'a non-test command is allowed'            0 "$(run "$guard" SF_LEASE_ENABLE=1)"
check 'and takes no lease'                       0 "$(lease_count)"

PAYLOAD="$(payload Bash '' "$fixture" sess-A)"
check 'an empty command is allowed'              0 "$(run "$guard" SF_LEASE_ENABLE=1)"

PAYLOAD="$(jq -nc '{tool_name:"Bash", tool_input:{command:"npx playwright test"}}')"
check 'a payload with no cwd/session is allowed' 0 "$(run "$guard" SF_LEASE_ENABLE=1)"
check 'and takes no lease'                       0 "$(lease_count)"

# --- claim, refuse, re-enter --------------------------------------------------
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-A)"
check 'a test command against a free org is allowed' 0 "$(run "$guard" SF_LEASE_ENABLE=1)"
check 'and the lease is held by that session'    'sess-A' "$(session_of orga)"

PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-B)"
check 'a second session is BLOCKED'              2 "$(run "$guard" SF_LEASE_ENABLE=1)"
blocked_err="$(err_text)"
check 'the block message is valid JSON'          'yes' \
  "$(jq -e . >/dev/null 2>&1 <<<"$blocked_err" && echo yes || echo no)"
check 'it has an error key'                      'yes' \
  "$(jq -e 'has("error")' >/dev/null 2>&1 <<<"$blocked_err" && echo yes || echo no)"
check 'the error names the org'                  'yes' "$(has "$blocked_err" 'orga')"
check 'the error names the holding session'      'yes' "$(has "$blocked_err" 'sess-A')"
check 'the blocked call took no second lease'    1 "$(lease_count)"
check 'the org is still held by its real owner'  'sess-A' "$(session_of orga)"

# --- a command that merely MENTIONS a test invocation is not a test call -------
# Measured end-to-end with sess-A holding orga: every one of these came back rc 2,
# BLOCKED. The resolver keys off command text and the guard blocks on a resolved
# identity, so writing about a suite in a commit message stopped the commit. This
# is the outcome the governing constraint ranks worst, so it is asserted here at
# hook level - rc 0 - and not only at the resolver's boundary.
mention() { # command
  PAYLOAD="$(payload Bash "$1" "$fixture" sess-B)"
  run "$guard" SF_LEASE_ENABLE=1
}
check 'a commit message mentioning a suite is NOT blocked' 0 \
  "$(mention 'git commit -m "fix flake in npx playwright test"')"
check 'echoing a suite command into a file is NOT blocked' 0 \
  "$(mention 'echo "npx playwright test" >> notes.md')"
check 'a PR body quoting a suite command is NOT blocked' 0 \
  "$(mention 'gh pr create --body "reproduce with npx playwright test"')"
check 'a git log --grep for a suite command is NOT blocked' 0 \
  "$(mention 'git log --grep="playwright test" --oneline')"
check 'and none of them took a lease of their own' 1 "$(lease_count)"
check 'nor disturbed the real holder'             'sess-A' "$(session_of orga)"

PAYLOAD="$(payload Bash 'npx playwright test --last-failed' "$fixture" sess-A)"
check 'the same session is re-entrant'           0 "$(run "$guard" SF_LEASE_ENABLE=1)"
check 'and still holds it'                       'sess-A' "$(session_of orga)"

# --- the effective directory, not the payload's .cwd --------------------------
# `cd sub && npm run test:...` runs in sub. Resolving against .cwd would key the
# lease off the wrong repo's config - a silent mis-lease, not a visible error.
PAYLOAD="$(payload Bash "cd sub && $TESTCMD" "$fixture" sess-C)"
check 'a leading cd is followed when resolving'  0 "$(run "$guard" SF_LEASE_ENABLE=1)"
check 'the lease is on the nested repo org'      'sess-C' "$(session_of orgb)"
check 'not on the payload cwd org'               'sess-A' "$(session_of orga)"

# Each of these is phrased so the WRONG directory produces the opposite result,
# rather than both answers happening to agree.
PAYLOAD="$(payload Bash "cd \"sub\" && $TESTCMD" "$fixture" sess-C)"
check 'a quoted cd target is followed too'       0 "$(run "$guard" SF_LEASE_ENABLE=1)"
PAYLOAD="$(payload Bash "$TESTCMD && cd sub" "$fixture" sess-C)"
check 'a cd that is not leading is not followed' 2 "$(run "$guard" SF_LEASE_ENABLE=1)"
PAYLOAD="$(payload Bash "cd /nonexistent/dir && $TESTCMD" "$fixture" sess-C)"
check 'an unresolvable cd falls back to the payload cwd' 2 "$(run "$guard" SF_LEASE_ENABLE=1)"
check 'and none of those changed who holds what' 'sess-A sess-C' \
  "$(session_of orga) $(session_of orgb)"

# --- PostToolUse releases only what this call resolved to ---------------------
PAYLOAD="$(payload Bash 'git status' "$fixture" sess-A)"
check 'an unrelated command post-hook is quiet'  0 "$(run "$post" SF_LEASE_ENABLE=1)"
check 'and does NOT drop the live lease'         'sess-A' "$(session_of orga)"
check 'nor any other session lease'               'sess-C' "$(session_of orgb)"

PAYLOAD="$(payload Bash "cd sub && $TESTCMD" "$fixture" sess-A)"
check 'a post hook for an org this session does not hold is quiet' 0 \
  "$(run "$post" SF_LEASE_ENABLE=1)"
check 'and leaves the real owner in place'       'sess-C' "$(session_of orgb)"

PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-A)"
check 'the matching post hook releases'          0 "$(run "$post" SF_LEASE_ENABLE=1)"
check 'and the org is free'                      '' "$(session_of orga)"

PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-A)"
check 'post hook is inert without the gate'      0 "$(run "$guard" SF_LEASE_ENABLE=1)"
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-A)"
check 'ungated post hook releases nothing'       0 "$(run "$post")"
check 'so the lease survives'                    'sess-A' "$(session_of orga)"

# --- SessionEnd releases everything that session holds ------------------------
PAYLOAD="$(jq -nc '{session_id:"sess-A"}')"
check 'the end hook exits 0'                     0 "$(run "$end" SF_LEASE_ENABLE=1)"
check 'and released sess-A'                      '' "$(session_of orga)"
check 'but not another session'                  'sess-C' "$(session_of orgb)"

PAYLOAD="$(jq -nc '{session_id:"sess-C"}')"
check 'the end hook releases the other session too' 0 "$(run "$end" SF_LEASE_ENABLE=1)"
check 'store is empty'                           0 "$(lease_count)"

PAYLOAD="$(jq -nc '{}')"
check 'an end payload with no session is quiet'  0 "$(run "$end" SF_LEASE_ENABLE=1)"

# --- SessionStart table -------------------------------------------------------
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-T)"
run "$guard" SF_LEASE_ENABLE=1 >/dev/null
PAYLOAD='{}'
check 'the table hook exits 0'                   0 "$(run "$table" SF_LEASE_ENABLE=1)"
check 'and names the leased org'                 'yes' "$(has "$(out_text)" 'orga')"
check 'and names the holder'                     'yes' "$(has "$(out_text)" 'sess-T')"
check 'the table hook is inert without the gate' ''    "$(run "$table" >/dev/null; out_text)"

PAYLOAD="$(jq -nc '{session_id:"sess-T"}')"
run "$end" SF_LEASE_ENABLE=1 >/dev/null
PAYLOAD='{}'
check 'the table hook prints nothing with no leases' '' "$(run "$table" SF_LEASE_ENABLE=1 >/dev/null; out_text)"

# --- failing open -------------------------------------------------------------
# Missing binary, missing resolver, unusable jq: every one of these must allow
# the call. A lease system that cannot run must not stop anyone working.
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-A)"
check 'a missing sf-lease fails open'            0 \
  "$(run "$guard" SF_LEASE_ENABLE=1 SF_LEASE_BIN=/nonexistent/sf-lease)"
check 'a missing resolver fails open'            0 \
  "$(run "$guard" SF_LEASE_ENABLE=1 SF_ORG_RESOLVE_BIN=/nonexistent/sf-org-resolve)"
check 'a missing sf-lease fails open in the post hook' 0 \
  "$(run "$post" SF_LEASE_ENABLE=1 SF_LEASE_BIN=/nonexistent/sf-lease)"
check 'a missing resolver fails open in the post hook' 0 \
  "$(run "$post" SF_LEASE_ENABLE=1 SF_ORG_RESOLVE_BIN=/nonexistent/sf-org-resolve)"
PAYLOAD="$(jq -nc '{session_id:"sess-A"}')"
check 'a missing sf-lease fails open in the end hook' 0 \
  "$(run "$end" SF_LEASE_ENABLE=1 SF_LEASE_BIN=/nonexistent/sf-lease)"
PAYLOAD='{}'
check 'a missing sf-lease fails open in the table hook' 0 \
  "$(run "$table" SF_LEASE_ENABLE=1 SF_LEASE_BIN=/nonexistent/sf-lease)"
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-A)"
check 'an unreadable payload fails open'         0 \
  "$(PAYLOAD='not json at all'; run "$guard" SF_LEASE_ENABLE=1)"

# jq parses every payload, so a machine without it must allow the call rather
# than block on a parse it could never do. PATH carries only bash, which the
# shebang's `env` needs to start the hook at all.
nojq="$tmp/nojq"
mkdir -p "$nojq"
ln -sf /bin/bash "$nojq/bash"
check 'a missing jq fails open'                  0 "$(run "$guard" SF_LEASE_ENABLE=1 "PATH=$nojq")"
check 'and takes no lease'                       0 "$(lease_count)"

# An unset HOME is the one input class that used to abort a hook at rc 1 under
# `set -u`, before it had decided anything - and in the release hooks that abort
# landed BEFORE the release, so the lease survived. Every hook must still exit 0
# here, and the release hooks must still do their job.
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-H)"
check 'the guard exits 0 with HOME unset'        0 "$(run "$guard" -u HOME SF_LEASE_ENABLE=1)"
check 'and still took the lease'                 'sess-H' "$(session_of orga)"
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-H)"
check 'the post hook exits 0 with HOME unset'    0 "$(run "$post" -u HOME SF_LEASE_ENABLE=1)"
check 'and still released the lease'             '' "$(session_of orga)"

PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-H)"
run "$guard" SF_LEASE_ENABLE=1 >/dev/null
PAYLOAD="$(jq -nc '{session_id:"sess-H"}')"
check 'the end hook exits 0 with HOME unset'     0 "$(run "$end" -u HOME SF_LEASE_ENABLE=1)"
check 'and still released the lease'             '' "$(session_of orga)"

PAYLOAD='{}'
check 'the table hook exits 0 with HOME unset'   0 "$(run "$table" -u HOME SF_LEASE_ENABLE=1)"

PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-H)"
check 'the guard exits 0 with HOME unset and nothing installed' 0 \
  "$(run "$guard" -u HOME -u SF_LEASE_BIN -u SF_ORG_RESOLVE_BIN -u SF_LEASE_HOME -u SF_LEASE_LOG SF_LEASE_ENABLE=1)"
check 'the post hook too'                        0 \
  "$(run "$post" -u HOME -u SF_LEASE_BIN -u SF_ORG_RESOLVE_BIN -u SF_LEASE_HOME -u SF_LEASE_LOG SF_LEASE_ENABLE=1)"
PAYLOAD="$(jq -nc '{session_id:"sess-H"}')"
check 'the end hook too'                         0 \
  "$(run "$end" -u HOME -u SF_LEASE_BIN -u SF_LEASE_HOME -u SF_LEASE_LOG SF_LEASE_ENABLE=1)"
PAYLOAD='{}'
check 'the table hook too'                       0 \
  "$(run "$table" -u HOME -u SF_LEASE_BIN SF_LEASE_ENABLE=1)"

# The guard and the post hook must reach the SAME effective directory or the
# post hook resolves a different identity and silently leaves the claim
# standing. The two copies are duplicated on purpose (see the hook headers);
# this is what stops them drifting apart.
extract_cd_block() { sed -n '/^CD_RE=/,/^}$/p' "$1"; }
check 'the effective_cwd block is actually found' 'yes' \
  "$([[ "$(extract_cd_block "$guard" | wc -l | tr -d ' ')" -gt 10 ]] && echo yes || echo no)"
check 'the guard and post hooks share one effective_cwd' 'identical' \
  "$([[ "$(extract_cd_block "$guard")" == "$(extract_cd_block "$post")" ]] && echo identical || echo DIFFERENT)"
check 'no lease was taken by any fail-open path' 0 "$(lease_count)"

# --- resolver rc 3: fails open, but never silently ----------------------------
# Reproduced with the org map at mode 000 and another session holding the org: the
# guard returned rc 0 with ZERO lines in hook.log, because "config present but
# unusable" was rc 1 - the same code as "not a test command" - and the fail-open
# audit correctly swallows both. The mechanism can be off for weeks and look
# exactly like the flake it exists to explain. Behaviour must NOT change here;
# only its visibility.
map000="$tmp/map-mode-000"
printf 'orga  shared-one\n' > "$map000"
chmod 000 "$map000"
reset_log
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-R3)"
check 'an unreadable org map still lets the call through'  0 \
  "$(run "$guard" SF_LEASE_ENABLE=1 "SF_ORG_MAP=$map000")"
check 'and takes no lease'                                 0 "$(lease_count)"
check 'but says so in the hook log'                        'yes' \
  "$(has "$(log_text)" 'resolve_rc=3')"
check 'and names it as an unprotected run'                 'yes' \
  "$(has "$(log_text)" 'NO LEASE WAS TAKEN')"
check "and carries the resolver's own reason"              'yes' \
  "$(has "$(log_text)" 'not readable')"
reset_log
check 'the post hook logs rc 3 too'                        0 \
  "$(run "$post" SF_LEASE_ENABLE=1 "SF_ORG_MAP=$map000")"
check 'and records it as leasing being off'                'yes' \
  "$(has "$(log_text)" 'resolve_rc=3')"

# Mutation run: drop the rc-3 branch and the log goes silent again, which is the
# whole defect. Without this the checks above could pass on a hook that logs
# every resolver failure indiscriminately.
mut_hooks="$tmp/mut-hooks"
mkdir -p "$mut_hooks"
sed '/resolve_rc" -eq 3/,/^fi$/d' "$guard" > "$mut_hooks/guard-no-rc3.sh"
chmod +x "$mut_hooks/guard-no-rc3.sh"
check 'the no-rc3 guard variant differs from the real hook' 'differs' \
  "$(cmp -s "$guard" "$mut_hooks/guard-no-rc3.sh" && echo IDENTICAL || echo differs)"
reset_log
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-R3)"
check 'without the rc-3 branch the guard still allows'     0 \
  "$(run "$mut_hooks/guard-no-rc3.sh" SF_LEASE_ENABLE=1 "SF_ORG_MAP=$map000")"
check 'but logs NOTHING - the silence this fix removes'    '' "$(log_text)"
chmod 644 "$map000"
reset_log

# --- sf-lease's exit-code contract, from the claim side ------------------------
# Only rc 0 means "you hold the org". Everything except a live competing holder
# must allow the call AND leave a diagnosable trace - a hook that swallows an
# rc 64 or rc 70 turns a bug into an invisible one.
export SHIM_CALLS="$tmp/calls"

shim_guard() { # rc [holder]
  rm -f "$tmp/calls"
  reset_log
  PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-S)"
  run "$guard" SF_LEASE_ENABLE=1 "SF_LEASE_BIN=$shim" "SHIM_RC=$1" "SHIM_HOLDER=${2:-}"
}

check 'claim rc 0 -> allow'                      0 "$(shim_guard 0)"
check 'claim rc 0 logs nothing'                  '' "$(log_text)"

check 'claim rc 1 -> block'                      2 "$(shim_guard 1 'session=sess-X age=3m cmd=npx playwright test')"
check 'the block names the holder from `holder`' 'yes' "$(has "$(err_text)" 'sess-X')"

# claim also returns 1 when it could not write metadata, in which case `holder`
# legitimately prints nothing. The block message must still be well-formed.
check 'claim rc 1 with a silent holder still blocks' 2 "$(shim_guard 1)"
silent_err="$(err_text)"
check 'and still emits valid JSON'               'yes' \
  "$(jq -e 'has("error")' >/dev/null 2>&1 <<<"$silent_err" && echo yes || echo no)"
check 'and says the holder is unknown'           'yes' "$(has "$silent_err" 'unknown')"

check 'claim rc 64 -> allow, never a refusal'    0 "$(shim_guard 64)"
check 'and rc 64 is logged'                      'yes' "$(has "$(log_text)" 'rc=64')"
check 'rc 64 produces no block message'          '' "$(err_text)"
# rc 64 has TWO causes - a bad invocation AND a malformed SF_LEASE_* knob - and
# the log named only the first, so a bad knob was diagnosed as a hook bug and sent
# the operator to the wrong file. Arming means editing exactly those variables.
check 'and rc 64 names the knob cause too'       'yes' \
  "$(has "$(log_text)" 'malformed SF_LEASE_')"
check 'and names the knobs an operator edits'    'yes' \
  "$(has "$(log_text)" 'SF_LEASE_TTL_MINUTES')"

# End to end with the REAL sf-lease: the knob cause is not hypothetical. Measured
# with SF_LEASE_TTL_MINUTES=2h - the mechanism is silently off for every Bash call
# in the session, and the log used to blame the hook's own plumbing.
reset_log
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-K64)"
check 'a malformed knob really is an rc 64'      0 \
  "$(run "$guard" SF_LEASE_ENABLE=1 SF_LEASE_TTL_MINUTES=2h)"
check 'and it is logged as rc 64'                'yes' "$(has "$(log_text)" 'rc=64')"
check 'and the log points at the knob'           'yes' \
  "$(has "$(log_text)" 'malformed SF_LEASE_')"
check 'and no lease was taken'                   0 "$(lease_count)"

# Mutation run: restore the old single-cause wording and both checks above go red.
sed 's|Either a malformed[^"]*|this is a bug in the hook argument plumbing.|' "$guard" \
  > "$mut_hooks/guard-old-rc64.sh"
chmod +x "$mut_hooks/guard-old-rc64.sh"
check 'the old-rc64 guard variant differs from the real hook' 'differs' \
  "$(cmp -s "$guard" "$mut_hooks/guard-old-rc64.sh" && echo IDENTICAL || echo differs)"
reset_log
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-K64)"
run "$mut_hooks/guard-old-rc64.sh" SF_LEASE_ENABLE=1 SF_LEASE_TTL_MINUTES=2h >/dev/null
check 'the old wording blames the plumbing and never mentions the knob' 'no' \
  "$(has "$(log_text)" 'malformed SF_LEASE_')"

check 'claim rc 70 -> allow'                     0 "$(shim_guard 70)"
check 'and rc 70 is logged as an sf-lease bug'   'yes' "$(has "$(log_text)" 'rc=70')"

check 'claim rc 75 -> allow, not a refusal'      0 "$(shim_guard 75)"
check 'and rc 75 is logged loudly'               'yes' "$(has "$(log_text)" 'rc=75')"
check 'the busy log says the store was busy'     'yes' "$(has "$(log_text)" 'busy')"
# Deliberate: sf-lease already waited out its own mutex timeout, and rc 75 means
# a wedge that no retry can clear, so retrying here only adds seconds to every
# Bash call in the session. The release paths DO retry - see below.
check 'the claim path does not retry a busy store' 1 "$(calls_of claim)"

check 'claim rc 143 -> allow'                    0 "$(shim_guard 143)"
check 'and rc 143 is logged'                     'yes' "$(has "$(log_text)" 'rc=143')"
check 'claim rc 130 -> allow'                    0 "$(shim_guard 130)"
check 'and rc 130 is logged'                     'yes' "$(has "$(log_text)" 'rc=130')"

# --- the same contract from the release side ----------------------------------
# This is where a mis-read exit code costs the most: a release that did not
# happen, reported as success, leaks the org for a full 120-minute TTL.
shim_post() { # rc
  rm -f "$tmp/calls"
  reset_log
  PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-S)"
  run "$post" SF_LEASE_ENABLE=1 "SF_LEASE_BIN=$shim" "SHIM_RC=$1"
}
shim_end() { # rc
  rm -f "$tmp/calls"
  reset_log
  PAYLOAD="$(jq -nc '{session_id:"sess-S"}')"
  run "$end" SF_LEASE_ENABLE=1 "SF_LEASE_BIN=$shim" "SHIM_RC=$1"
}

check 'post release rc 0 -> quiet success'       0 "$(shim_post 0)"
check 'and logs nothing'                         '' "$(log_text)"
check 'and released exactly once'                1 "$(calls_of release)"

check 'post release rc 75 exits 0'               0 "$(shim_post 75)"
check 'but is NOT recorded as released'          'yes' "$(has "$(log_text)" 'NOT released')"
check 'and is logged with its exit code'         'yes' "$(has "$(log_text)" 'rc=75')"
check 'and rc 75 was retried before giving up'   'yes' \
  "$([[ "$(calls_of release)" -gt 1 ]] && echo yes || echo no)"

check 'post release rc 64 exits 0'               0 "$(shim_post 64)"
check 'and is logged'                            'yes' "$(has "$(log_text)" 'rc=64')"
check 'and names the knob cause as well'         'yes' \
  "$(has "$(log_text)" 'malformed SF_LEASE_')"
check 'post release rc 70 exits 0'               0 "$(shim_post 70)"
check 'and is logged'                            'yes' "$(has "$(log_text)" 'rc=70')"
check 'post release rc 143 exits 0'              0 "$(shim_post 143)"
check 'and is logged'                            'yes' "$(has "$(log_text)" 'rc=143')"

check 'end release rc 0 -> quiet success'        0 "$(shim_end 0)"
check 'and logs nothing'                         '' "$(log_text)"
check 'and called release-session once'          1 "$(calls_of release-session)"

# The trap this whole suite exists for: SessionEnd seeing a busy store and
# reporting success leaks the org silently for the full TTL.
check 'end release rc 75 exits 0'                0 "$(shim_end 75)"
check 'but is NOT recorded as released'          'yes' "$(has "$(log_text)" 'NOT released')"
check 'and is logged with its exit code'         'yes' "$(has "$(log_text)" 'rc=75')"
check 'and names the session that may be leaking' 'yes' "$(has "$(log_text)" 'sess-S')"
check 'and rc 75 was retried before giving up'   'yes' \
  "$([[ "$(calls_of release-session)" -gt 1 ]] && echo yes || echo no)"

check 'end release rc 64 exits 0'                0 "$(shim_end 64)"
check 'and is logged'                            'yes' "$(has "$(log_text)" 'rc=64')"
check 'and names the knob cause as well'         'yes' \
  "$(has "$(log_text)" 'malformed SF_LEASE_')"
check 'end release rc 70 exits 0'                0 "$(shim_end 70)"
check 'and is logged'                            'yes' "$(has "$(log_text)" 'rc=70')"
check 'end release rc 143 exits 0'               0 "$(shim_end 143)"
check 'and is logged'                            'yes' "$(has "$(log_text)" 'rc=143')"

# --- the retry budget is bounded ----------------------------------------------
# Each retry costs sf-lease's full 5s mutex timeout on a wedged store, and the
# post hook runs after every Bash call, so an unbounded knob turns a typo into
# a multi-minute stall per command.
# The rc goes to a file, not a variable: every call below runs inside $(...), so
# a variable assignment would be lost with the subshell.
retry_calls() { # SF_LEASE_HOOK_RETRIES value
  rm -f "$tmp/calls"
  reset_log
  PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-S)"
  run_bounded 20 "$post" SF_LEASE_ENABLE=1 "SF_LEASE_BIN=$shim" SHIM_RC=75 \
    "SF_LEASE_HOOK_RETRIES=$1" > "$tmp/retry_rc"
  calls_of release
}
retry_rc() { cat "$tmp/retry_rc"; }
check 'retries=0 means one attempt and no retry' 1 "$(retry_calls 0)"
check 'retries=1 means two attempts'             2 "$(retry_calls 1)"
check 'retries=200 is capped, not honoured'      3 "$(retry_calls 200)"
check 'and the clamp says which value it refused' 'yes' \
  "$(has "$(log_text)" 'SF_LEASE_HOOK_RETRIES=200')"
check 'a non-numeric retry count falls back'     3 "$(retry_calls abc)"
# "08" is not a hypothetical: bash reads it as octal, so a `-ge` against it
# errors rather than comparing, and a retry loop bounded only by $retries then
# spins forever. A hook that spins hangs the session instead of failing it.
check 'a leading-zero retry count falls back'    3 "$(retry_calls 08)"
check 'and the hook terminated rather than spinning' 0 "$(retry_rc)"
check 'the end hook caps its retries too'        3 \
  "$(rm -f "$tmp/calls"; reset_log; PAYLOAD="$(jq -nc '{session_id:"sess-S"}')"; \
     run_bounded 20 "$end" SF_LEASE_ENABLE=1 "SF_LEASE_BIN=$shim" SHIM_RC=75 \
       SF_LEASE_HOOK_RETRIES=08 >/dev/null; \
     calls_of release-session)"

unset SHIM_CALLS

# --- the log cannot grow without bound ----------------------------------------
# It is written from a PreToolUse hook, so on a wedged store it gets a line per
# Bash call in every session.
reset_log
head -c 300000 /dev/zero | tr '\0' 'x' > "$SF_LEASE_LOG"
PAYLOAD="$(payload Bash "$TESTCMD" "$fixture" sess-S)"
run "$guard" SF_LEASE_ENABLE=1 "SF_LEASE_BIN=$shim" SHIM_RC=75 >/dev/null
check 'an oversized log is rotated, not appended to' 'yes' \
  "$([[ "$(wc -c < "$SF_LEASE_LOG" | tr -d ' ')" -lt 1000 ]] && echo yes || echo no)"
check 'and the previous log is kept'             'yes' \
  "$([[ -f "$SF_LEASE_LOG.1" ]] && echo yes || echo no)"
rm -f "$SF_LEASE_LOG" "$SF_LEASE_LOG.1"

check 'the store is empty at the end'            0 "$(lease_count)"

if [[ $failures -gt 0 ]]; then
  printf '%d failure(s)\n' "$failures" >&2
  exit 1
fi
printf 'the sf-lease hooks behave correctly\n'
