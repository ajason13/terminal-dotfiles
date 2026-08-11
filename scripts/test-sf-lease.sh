#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bin="$repo_root/bin/sf-lease"

SF_LEASE_HOME="$(mktemp -d)"
export SF_LEASE_HOME SF_LEASE_TTL_MINUTES=120
trap 'rm -rf "$SF_LEASE_HOME"' EXIT

# Run hermetically. A real /tmp/e2e-scratch-pool gains .lock files during the
# other repo's normal operation, which would make list's pool row surfacing
# flip "list is silent with no leases" from pass to fail depending on what
# else is running on the machine.
export SCRATCH_POOL_LOCK_DIR="$SF_LEASE_HOME/pool"

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
rc_of() { "$bin" "$@" >/dev/null 2>&1 && printf 0 || printf 1; }
# The exact exit code, not just pass/fail: rc 75 ("store busy, nothing was
# decided") has to be distinguishable from rc 1 ("that org is taken").
code_of() { local rc=0; "$bin" "$@" >/dev/null 2>&1 || rc=$?; printf '%s' "$rc"; }
out_of() { "$bin" "$@" 2>&1 || true; }
# env, not a VAR=val prefix: the prefix form sets a shell variable for a
# FUNCTION call, which never reaches the child unless that name is already
# exported - so the prefix form would silently test the default instead.
code_env() { local e="$1" rc=0; shift; env "$e" "$bin" "$@" >/dev/null 2>&1 || rc=$?; printf '%s' "$rc"; }
# Same, against an arbitrary binary: that is how the mutation runs below drive
# deliberately-broken variants of sf-lease.
code_env_bin() {
  local b="$1" e="$2" rc=0; shift 2
  env "$e" "$b" "$@" >/dev/null 2>&1 || rc=$?
  printf '%s' "$rc"
}
out_env() { local e="$1"; shift; env "$e" "$bin" "$@" 2>&1 || true; }
# With a hard deadline, reporting HUNG if it had to be killed. An infinite spin
# inside a PreToolUse hook hangs the session rather than failing it, so
# "it eventually errors out" is not a good enough contract.
code_within() {
  local secs="$1" e="$2" rc=0 p k; shift 2
  env "$e" "$bin" "$@" >/dev/null 2>&1 &
  p=$!
  ( sleep "$secs"; kill -9 "$p" 2>/dev/null ) >/dev/null 2>&1 &
  k=$!
  wait "$p" 2>/dev/null || rc=$?
  kill "$k" 2>/dev/null || true
  [[ "$rc" -eq 137 ]] && printf 'HUNG' || printf '%s' "$rc"
}
age_mutex() {
  touch -A -020000 "$SF_LEASE_HOME/.claiming" 2>/dev/null \
    || touch -t "$(date -v-2H +%Y%m%d%H%M)" "$SF_LEASE_HOME/.claiming"
}
session_of() { "$bin" holder "$1" | sed -n 's/.*session=\([^ ]*\).*/\1/p'; }
has() { case "$1" in *"$2"*) printf yes ;; *) printf no ;; esac; }
mutex_held() { [[ -d "$SF_LEASE_HOME/.claiming" ]] && printf yes || printf no; }

# A slow `mv` shim parks a REAL sf-lease inside its critical section for a few
# seconds (write_meta stages metadata through mv), which is the only way to
# observe a live, legitimately-held mutex from outside the process holding it.
slowbin="$(mktemp -d)"
printf '#!/bin/sh\nsleep 2\nexec /bin/mv "$@"\n' > "$slowbin/mv"
chmod +x "$slowbin/mv"
trap 'rm -rf "$SF_LEASE_HOME" "$slowbin"' EXIT

# --- claim and contention -----------------------------------------------------
check 'first claim succeeds'                0 "$(rc_of claim orga sess-A 'playwright test')"
check 'a second session is refused'         1 "$(rc_of claim orga sess-B 'playwright test')"
check 'the same session is re-entrant'      0 "$(rc_of claim orga sess-A 'playwright test --last-failed')"
check 'a different org is independent'      0 "$(rc_of claim orgb sess-B 'playwright test')"
check 'holder names the owning session'     'sess-A' "$(session_of orga)"
check 'holder of an unheld org is empty'    '' "$("$bin" holder orgc)"

# --- release ownership --------------------------------------------------------
"$bin" release orga sess-B
check 'a non-owner cannot release'          'sess-A' "$(session_of orga)"
"$bin" release orga sess-A
check 'the owner can release'               '' "$(session_of orga)"
check 'release of an unheld org is quiet'   0 "$(rc_of release orga sess-A)"

"$bin" claim orga sess-B 'x' >/dev/null
"$bin" release-session sess-B
check 'release-session clears orga'         '' "$(session_of orga)"
check 'release-session clears orgb too'     '' "$(session_of orgb)"

# --- staleness ----------------------------------------------------------------
"$bin" claim orga sess-C 'playwright test' >/dev/null
aged=$(( $(date +%s) - 3 * 60 * 60 ))
printf 'session\tsess-C\nstarted\t%s\ncmd\tplaywright test\n' "$aged" \
  > "$SF_LEASE_HOME/sf-orga.lease/meta"
check 'a lease past its TTL is reclaimed'   0 "$(rc_of claim orga sess-D 'playwright test')"
check 'the reclaiming session owns it'      'sess-D' "$(session_of orga)"
"$bin" release-session sess-D

mkdir -p "$SF_LEASE_HOME/sf-orga.lease"   # metadata-less: interrupted mid-claim
check 'a fresh metadata-less lease is respected' 1 "$(rc_of claim orga sess-E 'x')"
touch -A -020000 "$SF_LEASE_HOME/sf-orga.lease" 2>/dev/null \
  || touch -t "$(date -v-2H +%Y%m%d%H%M)" "$SF_LEASE_HOME/sf-orga.lease"
check 'an old metadata-less lease is reclaimed'  0 "$(rc_of claim orga sess-E 'x')"

# --- list ---------------------------------------------------------------------
# Not "list | grep -q orga": under pipefail, grep -q exits on its first match
# while sf-lease is still writing later rows, sf-lease takes SIGPIPE, and the
# pipeline's rc 141 would fail this check even though the row was present.
out="$("$bin" list)"
check 'list names the held org' 'yes' "$([[ "$out" == *orga* ]] && echo yes || echo no)"

# A tampered or truncated `started` must not reach bash's arithmetic. "08" is read
# as OCTAL, and the raw `value too great for base` error came out of a hook's
# stderr; substituting 0 instead printed the epoch in minutes as if it were an age.
printf 'session\tsess-E\nstarted\t08\ncmd\tx\n' > "$SF_LEASE_HOME/sf-orga.lease/meta"
check 'holder reports an unparseable age as ?, not a number' 'session=sess-E age=? cmd=x' \
  "$("$bin" holder orga 2>/dev/null)"
check 'and says nothing at all on stderr' '' "$("$bin" holder orga 2>&1 >/dev/null)"
check 'list shows the same row without erroring' 'yes' \
  "$(has "$("$bin" list 2>/dev/null)" 'orga')"
check 'and list stays quiet on stderr too' '' "$("$bin" list 2>&1 >/dev/null)"

# Mutation run: let a leading zero back into the `started` guard and holder emits
# a raw bash arithmetic error instead of a row. Built here rather than with the
# later mutants because this is where the tampered meta is on disk.
zeros_dir="$(mktemp -d)"
sed 's#started" =~ \^(0|\[1-9\]#started" =~ ^(0|[0-9]#g' "$bin" > "$zeros_dir/zeros"
chmod +x "$zeros_dir/zeros"
check 'the leading-zero variant differs from the real binary' 'differs' \
  "$(cmp -s "$bin" "$zeros_dir/zeros" && echo IDENTICAL || echo differs)"
check 'accepting a leading zero puts a bash error on stderr' 'yes' \
  "$(has "$("$zeros_dir/zeros" holder orga 2>&1 >/dev/null)" 'value too great for base')"
check 'and prints no row at all' '' "$("$zeros_dir/zeros" holder orga 2>/dev/null)"
rm -rf "$zeros_dir"

"$bin" release-session sess-E
check 'list is silent with no leases' '' "$("$bin" list)"

# --- claim's own staging is atomic, not just its outcome ----------------------
# Deliberately early: several later blocks depend on a claim actually calling
# mv (that is what parks it inside its critical section), so a direct-write
# implementation must be caught by the check built for it, here, and not
# diagnosed by the confusing cascade it would cause further down.
#
# A mkdir-then-write-metadata-directly implementation would pass both checks
# below by construction (it never creates a temp artifact to leave behind,
# and it does create a meta file), so neither actually discriminates it from
# the real temp-file+mv implementation. Kept anyway as a cheap regression net
# for write_meta's own cleanup-on-failure paths.
"$bin" claim orgz sess-Z 'playwright test' >/dev/null
check 'a claim leaves no temp meta artifact in the store' '' \
  "$(ls "$SF_LEASE_HOME"/.meta.* 2>/dev/null)"
check 'a completed lease directory always has its meta file' 'yes' \
  "$([[ -f "$SF_LEASE_HOME/sf-orgz.lease/meta" ]] && echo yes || echo no)"
"$bin" release-session sess-Z

# The discriminating check: shim mv to fail and confirm claim actually needs
# it. The real implementation stages meta through mv and fails closed (rc 1,
# no meta) when mv is unavailable; a direct-write implementation never calls
# mv at all and would still succeed (rc 0, meta written) under this shim.
failbin="$(mktemp -d)"
printf '#!/bin/sh\nexit 1\n' > "$failbin/mv"
chmod +x "$failbin/mv"
check 'claim fails closed when mv is unavailable' 1 \
  "$(PATH="$failbin:$PATH" rc_of claim orgshim sess-A 'x')"
check 'no meta is written when mv failed' 'no' \
  "$([[ -f "$SF_LEASE_HOME/sf-orgshim.lease/meta" ]] && echo yes || echo no)"
rm -rf "$failbin"

# --- store-wide claim mutex ----------------------------------------------------
"$bin" claim orgmutex sess-M 'x' >/dev/null
check 'the mutex is released after a successful claim' 'no' \
  "$([[ -d "$SF_LEASE_HOME/.claiming" ]] && echo yes || echo no)"
"$bin" release-session sess-M

# --- a busy or wedged store is not "org taken" --------------------------------
# rc 75 everywhere, on stderr, and - the part that actually bit - release must
# NOT report success for a lease it never got in to remove. This is the
# SessionEnd cleanup path: a false 0 here leaks the org for a full TTL.
"$bin" claim orgbusy sess-BZ 'x' >/dev/null
mkdir "$SF_LEASE_HOME/.claiming"   # a foreign mutex: store busy, or wedged
export SF_LEASE_MUTEX_TIMEOUT_MS=200

check 'claim on a busy store reports busy, not "org taken"' 75 \
  "$(code_of claim orgmutex2 sess-M 'x')"
check 'release on a busy store reports busy, not success' 75 \
  "$(code_of release orgbusy sess-BZ)"
check 'release-session on a busy store reports busy, not success' 75 \
  "$(code_of release-session sess-BZ)"
check 'sweep on a busy store reports busy' 75 "$(code_of sweep orgbusy)"
check 'the lease is still on disk after those busy returns' 'yes' \
  "$([[ -f "$SF_LEASE_HOME/sf-orgbusy.lease/meta" ]] && echo yes || echo no)"
check 'a busy acquire says so on stderr' 'yes' \
  "$(has "$(out_of claim orgmutex2 sess-M 'x')" 'store busy')"
check 'a failed acquire never removes a mutex it does not own' 'yes' "$(mutex_held)"

unset SF_LEASE_MUTEX_TIMEOUT_MS
rmdir "$SF_LEASE_HOME/.claiming"   # test-created; nothing auto-releases it
"$bin" release-session sess-BZ >/dev/null

"$bin" claim orgmutex3 '' 'x' >/dev/null 2>&1 || true
check 'an exit-64 empty-argument claim never leaves the mutex held' 'no' "$(mutex_held)"

# --- numeric knobs are validated, and an abort is never a grant ---------------
# bash 3.2 exits 0 when set -u kills the shell from inside an ARITHMETIC
# context, so an unvalidated numeric knob turns a fatal abort into "you hold
# the org" - a false grant while someone else is running against it.
"$bin" claim orgknob sess-K 'held' >/dev/null
check 'a non-numeric TTL is rejected, not treated as a grant' 64 \
  "$(code_env SF_LEASE_TTL_MINUTES=abc claim orgknob sess-RIVAL 'x')"
check 'and the org is still held by its real owner' 'sess-K' "$(session_of orgknob)"
check 'a zero TTL is rejected too' 64 \
  "$(code_env SF_LEASE_TTL_MINUTES=0 claim orgknob sess-RIVAL 'x')"

mkdir "$SF_LEASE_HOME/.claiming"   # the timeout is only consulted when contended
check 'a non-numeric mutex timeout is rejected, not treated as a grant' 64 \
  "$(code_env SF_LEASE_MUTEX_TIMEOUT_MS=abc claim orgknob2 sess-RIVAL 'x')"
# "5s"/"2000ms" is the mistake a hook author makes with a variable named _MS.
# It made every (( )) comparison false, spinning at 50ms forever.
check 'a "5s" mutex timeout terminates instead of spinning forever' 64 \
  "$(code_within 6 SF_LEASE_MUTEX_TIMEOUT_MS=5s claim orgknob2 sess-RIVAL 'x')"
check 'a zero mutex timeout is rejected' 64 \
  "$(code_within 6 SF_LEASE_MUTEX_TIMEOUT_MS=0 claim orgknob2 sess-RIVAL 'x')"
# Leading zero: bash reads "08" as octal, so it is an arithmetic error rather
# than eight, and a loop bounded only by it never terminates.
check 'a leading-zero mutex timeout is rejected' 64 \
  "$(code_within 6 SF_LEASE_MUTEX_TIMEOUT_MS=08 claim orgknob2 sess-RIVAL 'x')"
check 'a hex-shaped mutex timeout is rejected' 64 \
  "$(code_within 6 SF_LEASE_MUTEX_TIMEOUT_MS=0x10 claim orgknob2 sess-RIVAL 'x')"

# --- the mutex timeout has a LITERAL ceiling, not just a regex -----------------
# Every value below is a positive integer that passes the validation above, and
# each one stalled a session anyway: 20000 made one Bash call's PreToolUse guard
# take 26s, 86400000 (the ms-per-day typo) was still spinning at 30s. So the knob
# may only lower the wait, and each value here must come back inside the deadline.
# These are the slowest checks in this suite - a clamped timeout still waits out
# its full 5s - so each value runs ONCE and both its rc and its stderr are read
# back from files afterwards.
knob_dir="$(mktemp -d)"
trap 'rm -rf "$SF_LEASE_HOME" "$slowbin" "$knob_dir"' EXIT
knob_run() { # secs VAR=val subcmd... ; KNOB_BIN overrides which binary runs
  local secs="$1" e="$2" b="${KNOB_BIN:-$bin}" rc=0 p k; shift 2
  env "$e" "$b" "$@" >"$knob_dir/out" 2>"$knob_dir/err" &
  p=$!
  ( sleep "$secs"; kill -9 "$p" 2>/dev/null ) >/dev/null 2>&1 &
  k=$!
  wait "$p" 2>/dev/null || rc=$?
  if [[ "$rc" -eq 137 ]]; then printf 'HUNG' > "$knob_dir/rc"; else printf '%s' "$rc" > "$knob_dir/rc"; fi
}
knob_rc() { cat "$knob_dir/rc"; }
knob_err() { cat "$knob_dir/err"; }

knob_run 20 SF_LEASE_MUTEX_TIMEOUT_MS=86400000 claim orgknob4 sess-RIVAL 'x'
check 'an ms-per-day timeout gives up rather than stalling the session' 75 "$(knob_rc)"
check 'and says which value it refused'      'yes' "$(has "$(knob_err)" '86400000')"
check 'and names the ceiling it used instead' 'yes' "$(has "$(knob_err)" '5000ms')"
# 2^64: the regex passes it. It is clamped values that keep working; a number this
# far past any wait is a value in the wrong variable, so it is refused outright.
# Still bounded by a deadline here, because "it errors out" is not the same claim
# as "it terminates".
knob_run 20 SF_LEASE_MUTEX_TIMEOUT_MS=18446744073709551616 claim orgknob4 sess-RIVAL 'x'
check 'an int64-overflow timeout is refused, and terminates' 64 "$(knob_rc)"

# Mutation runs: a guard is only tested if its absence fails. Strip the clamp and
# the literal spin ceiling must still bring the loop home; strip both and it must
# HANG - which is what these checks would otherwise never have caught.
mut_dir="$(mktemp -d)"
trap 'rm -rf "$SF_LEASE_HOME" "$slowbin" "$knob_dir" "$mut_dir"' EXIT
sed '/^MUTEX_TIMEOUT_MAX_MS=/,/^fi$/d' "$bin" > "$mut_dir/no-clamp"
sed -e '/^MUTEX_TIMEOUT_MAX_MS=/,/^fi$/d' \
    -e 's/ || \[\[ "$spins" -ge "$MUTEX_SPIN_MAX" \]\]//' "$bin" > "$mut_dir/no-bounds"
chmod +x "$mut_dir/no-clamp" "$mut_dir/no-bounds"
check 'the no-clamp variant differs from the real binary' 'differs' \
  "$(cmp -s "$bin" "$mut_dir/no-clamp" && echo IDENTICAL || echo differs)"
check 'the no-bounds variant differs from the no-clamp one' 'differs' \
  "$(cmp -s "$mut_dir/no-clamp" "$mut_dir/no-bounds" && echo IDENTICAL || echo differs)"
KNOB_BIN="$mut_dir/no-clamp" knob_run 20 SF_LEASE_MUTEX_TIMEOUT_MS=86400000 claim orgknob4 sess-RIVAL 'x'
check 'without the clamp, the spin ceiling alone still terminates' 75 "$(knob_rc)"
KNOB_BIN="$mut_dir/no-bounds" knob_run 8 SF_LEASE_MUTEX_TIMEOUT_MS=86400000 claim orgknob4 sess-RIVAL 'x'
check 'with neither bound it hangs - so these checks are load-bearing' 'HUNG' "$(knob_rc)"

rmdir "$SF_LEASE_HOME/.claiming"
"$bin" release-session sess-K >/dev/null

# --- the OTHER two knobs have literal bounds too -------------------------------
# Instances five and six of one class on this branch: a value that PASSES the
# regex and then fails toward a false success. The mitigation had been applied
# per-knob, to the two knobs somebody happened to measure - and the two nobody
# measured were exactly the two still regex-only. So the bound now lives in
# require_positive_int and every knob goes through it.
#
# TTL drives the only multiplication in the file. 200000000000000000 * 60 wraps to
# a NEGATIVE number, every lease then reads stale, and a rival gets rc 0 while the
# real holder is still running against that org.
"$bin" claim orgttl sess-TTL 'held' >/dev/null
check 'an int64-overflow TTL is refused, not a false grant' 64 \
  "$(code_env SF_LEASE_TTL_MINUTES=200000000000000000 claim orgttl sess-RIVAL 'x')"
check 'and the real holder still holds the org' 'sess-TTL' "$(session_of orgttl)"
check 'and the refusal names the range it wanted' 'yes' \
  "$(has "$(out_env SF_LEASE_TTL_MINUTES=200000000000000000 claim orgttl sess-RIVAL 'x')" 'between 1 and 1440')"
check 'a TTL one past the ceiling is refused' 64 \
  "$(code_env SF_LEASE_TTL_MINUTES=1441 claim orgttl sess-RIVAL 'x')"
# At the ceiling it is a normal run again: rc 1 because the org really is taken.
check 'a TTL at the ceiling is honoured, not refused' 1 \
  "$(code_env SF_LEASE_TTL_MINUTES=1440 claim orgttl sess-RIVAL 'x')"

# The same wrap on the wedge threshold reopened the unstamped-mutex hole the cap
# round closed: a 0-second-old mutex with no owner token is a live claim caught
# between its mkdir and its stamp, and unwedge cleared it with no --force.
mkdir "$SF_LEASE_HOME/.claiming"
check 'an int64-overflow wedge threshold is refused' 64 \
  "$(code_env SF_LEASE_MUTEX_WEDGE_SECONDS=9223372036854775808 unwedge)"
check 'and the live mid-stamp mutex survives it' 'yes' "$(mutex_held)"
check 'a wedge threshold under the floor is refused too' 64 \
  "$(code_env SF_LEASE_MUTEX_WEDGE_SECONDS=1 unwedge)"
check 'and that mutex survives as well' 'yes' "$(mutex_held)"
check 'a wedge threshold at the floor still refuses a fresh mutex' 75 \
  "$(code_env SF_LEASE_MUTEX_WEDGE_SECONDS=30 unwedge)"
rmdir "$SF_LEASE_HOME/.claiming"

# Mutation run: strip the literal bounds and the overflow is a REAL false grant
# again - rc 0 while sess-TTL is still running - which is what makes the checks
# above something other than decoration.
sed 's|^  if int_exceeds "$value" "$max".*|  if false; then|' "$bin" > "$mut_dir/no-knob-bounds"
chmod +x "$mut_dir/no-knob-bounds"
check 'the no-knob-bounds variant differs from the real binary' 'differs' \
  "$(cmp -s "$bin" "$mut_dir/no-knob-bounds" && echo IDENTICAL || echo differs)"
check 'without the bounds an overflow TTL grants an org someone else holds' 0 \
  "$(code_env_bin "$mut_dir/no-knob-bounds" SF_LEASE_TTL_MINUTES=200000000000000000 \
      claim orgttl sess-RIVAL 'x')"
check 'and the holder really did transfer - that is the false grant' 'sess-RIVAL' \
  "$(session_of orgttl)"
"$bin" release-session sess-RIVAL >/dev/null
"$bin" release-session sess-TTL >/dev/null

# --- the abort backstop: an abort must never read as a grant --------------------
# Parked as an Important residual for the whole cap round: LEASE_EXIT_OK was
# verified load-bearing by a control experiment but never had a regression test,
# and two NEW instances of the numeric class showed up afterwards - the evidence
# that enumerating the holes had failed and only the class-wide net was going to
# catch the next one.
#
# bash 3.2 exits 0 when set -u kills the shell from inside an ARITHMETIC context,
# so a fatal abort in the claim path reads to the caller as "you hold the org".
# The abort is injected as an arithmetic use of an unset variable at the top of
# cmd_claim: the shape no regex and no validation can see coming, which is the
# only honest way to test a backstop for the holes nobody has thought of.
"$bin" claim orgab sess-AB 'held' >/dev/null
sed 's|^cmd_claim() {|cmd_claim() { (( LEASE_ABORT_PROBE + 1 ));|' "$bin" > "$mut_dir/abort"
sed -e 's|^cmd_claim() {|cmd_claim() { (( LEASE_ABORT_PROBE + 1 ));|' \
    -e 's|^LEASE_EXIT_OK=0$|LEASE_EXIT_OK=1|' "$bin" > "$mut_dir/abort-no-backstop"
chmod +x "$mut_dir/abort" "$mut_dir/abort-no-backstop"
check 'the abort variant differs from the real binary' 'differs' \
  "$(cmp -s "$bin" "$mut_dir/abort" && echo IDENTICAL || echo differs)"
check 'the no-backstop variant differs from the abort one' 'differs' \
  "$(cmp -s "$mut_dir/abort" "$mut_dir/abort-no-backstop" && echo IDENTICAL || echo differs)"
check 'an abort inside claim reports 70, never a grant' 70 \
  "$(code_env_bin "$mut_dir/abort" IGNORED=1 claim orgab sess-RIVAL 'x')"
check 'and the real holder is untouched' 'sess-AB' "$(session_of orgab)"
check 'and it says it is an sf-lease bug, not a refusal' 'yes' \
  "$(has "$(env IGNORED=1 "$mut_dir/abort" claim orgab sess-RIVAL 'x' 2>&1 || true)" \
      'aborted before reaching a decision')"
check 'the abort leaves no mutex behind' 'no' "$(mutex_held)"
# The control: with only the LEASE_EXIT_OK flag defeated, the SAME abort reports
# success. That is the false grant the backstop exists for, and it is why this
# check is the one that would have been asking the right question all along.
check 'without the backstop the same abort reads as a GRANT' 0 \
  "$(code_env_bin "$mut_dir/abort-no-backstop" IGNORED=1 claim orgab sess-RIVAL 'x')"
check 'and the org it "granted" is still held by its real owner' 'sess-AB' \
  "$(session_of orgab)"
"$bin" release-session sess-AB >/dev/null

# --- unwedge must prove death before deleting a mutex -------------------------
# The whole point: an operator cannot tell a live mutex from a wedged one by
# looking, and the one action list's warning tells them to take used to hand
# the same org to two sessions and cascade into every claim after it.
check 'unwedge on a clean store is a quiet no-op' 0 "$(code_of unwedge)"
check 'unwedge rejects an unknown flag' 64 "$(code_of unwedge --wat)"

PATH="$slowbin:$PATH" "$bin" claim orgw sess-W 'slow' >/dev/null 2>&1 &
slowpid=$!
sleep 0.5   # orgw's claim is now inside its critical section, mutex live
uw_out="$(out_of unwedge)"
check 'unwedge refuses to break a live mutex' 75 "$(code_of unwedge)"
check 'the refusal reports the owner it found is running' 'yes' \
  "$(has "$uw_out" 'still running: yes')"
check 'the refusal points at --force' 'yes' "$(has "$uw_out" 'unwedge --force')"
check 'the live mutex is still held after the refusal' 'yes' "$(mutex_held)"
livrc=0; wait "$slowpid" || livrc=$?
check 'the live claim unwedge refused to break still succeeded' 0 "$livrc"
"$bin" release-session sess-W >/dev/null

# An aged mutex whose owner is still running is held, not wedged. This is the
# ONLY state that still needs --force: the pid is alive, but it may be a
# recycled pid belonging to an unrelated process, and that is genuinely
# ambiguous from here.
mkdir "$SF_LEASE_HOME/.claiming"
printf '%s:nonce:0\n' "$$" > "$SF_LEASE_HOME/.claiming/owner"
age_mutex
check 'unwedge refuses an aged mutex whose owner is still running' 75 "$(code_of unwedge)"
check 'and leaves that mutex in place' 'yes' "$(mutex_held)"
check '--force warns that it can hand out an org twice' 'yes' \
  "$(has "$(out_of unwedge --force)" 'TWO SESSIONS')"
check '--force does clear it' 'no' "$(mutex_held)"

# A tokenless mutex that is NOT aged is a live acquire caught between its mkdir
# and its stamp. Now that aged-and-tokenless clears on its own, age is the only
# gate left protecting this one, so it gets its own check.
mkdir "$SF_LEASE_HOME/.claiming"
check 'unwedge refuses a fresh tokenless mutex (a claim mid-stamp)' 75 "$(code_of unwedge)"
check 'and leaves that one in place too' 'yes' "$(mutex_held)"
rmdir "$SF_LEASE_HOME/.claiming"

# Aged with no token at all: a live acquire stamps its token microseconds after
# the mkdir, so nothing that could still be running left this behind. Clearable
# WITHOUT --force - demanding --force for a case its warning does not describe
# is how --force becomes a reflex.
mkdir "$SF_LEASE_HOME/.claiming"
age_mutex
check 'unwedge clears an aged mutex with no ownership token' 0 "$(code_of unwedge)"
check 'that tokenless mutex is gone' 'no' "$(mutex_held)"

# Aged AND the recorded pid is gone: the other case it may clear on its own.
mkdir "$SF_LEASE_HOME/.claiming"
printf '999999:nonce:0\n' > "$SF_LEASE_HOME/.claiming/owner"
age_mutex
check 'unwedge clears an aged mutex whose owner is gone' 0 "$(code_of unwedge)"
check 'the wedged mutex is gone' 'no' "$(mutex_held)"
check 'a claim right after unwedge succeeds immediately' 0 \
  "$(rc_of claim orgmutex4 sess-M 'x')"
"$bin" release-session sess-M

# --- the ownership token: no trap deletes a mutex it does not own -------------
# Without the token, the force-cleared process's own exit trap removes whatever
# now occupies the mutex path - un-protecting the NEXT holder's critical
# section, and every claim after it, from a single operator keystroke.
PATH="$slowbin:$PATH" "$bin" claim orgt sess-T 'slow' >/dev/null 2>"$SF_LEASE_HOME/slow.err" &
slowpid=$!
sleep 0.5
"$bin" unwedge --force >/dev/null 2>&1        # operator force-clears its mutex
mkdir "$SF_LEASE_HOME/.claiming"              # stand-in for the next holder
printf 'foreign:token:0\n' > "$SF_LEASE_HOME/.claiming/owner"
wait "$slowpid" || true                       # it exits, running its exit trap
check "another holder's mutex survives the force-cleared process's exit trap" 'yes' \
  "$(mutex_held)"
check "the other holder's ownership token is untouched" 'foreign:token:0' \
  "$(cat "$SF_LEASE_HOME/.claiming/owner")"
check 'the force-cleared process says it lost its mutex' 'yes' \
  "$(has "$(cat "$SF_LEASE_HOME/slow.err")" 'no longer ours')"
rm -rf "$SF_LEASE_HOME/.claiming"
"$bin" release-session sess-T >/dev/null

# --- a signal inside the critical section must terminate, not resume ----------
# Releasing the mutex without exiting let the interrupted mutation carry on
# outside the critical section and still report rc 0 - so a hook killed on
# timeout swallowed its own termination and mutated unguarded.
PATH="$slowbin:$PATH" "$bin" claim orgsig sess-SG 'slow' >/dev/null 2>&1 &
sigpid=$!
sleep 0.5
kill -TERM "$sigpid" 2>/dev/null || true   # never let a lost race abort the suite
sigrc=0; wait "$sigpid" || sigrc=$?
check 'SIGTERM inside the critical section exits 143, not 0' 143 "$sigrc"
check 'and the mutex is released on the way out' 'no' "$(mutex_held)"

# set -m so the child gets its own process group: a background job in a
# non-interactive shell has SIGINT ignored on entry, and a signal ignored on
# entry cannot be trapped, so without job control this would test nothing.
set -m
PATH="$slowbin:$PATH" "$bin" claim orgsig2 sess-SG 'slow' >/dev/null 2>&1 &
sigpid=$!
sleep 0.5
kill -INT "$sigpid" 2>/dev/null || true
sigrc=0; wait "$sigpid" || sigrc=$?
set +m
check 'SIGINT inside the critical section exits 130, not 0' 130 "$sigrc"
check 'and that mutex is released too' 'no' "$(mutex_held)"
"$bin" release-session sess-SG >/dev/null

mkdir "$SF_LEASE_HOME/.claiming"
touch -A -020000 "$SF_LEASE_HOME/.claiming" 2>/dev/null \
  || touch -t "$(date -v-2H +%Y%m%d%H%M)" "$SF_LEASE_HOME/.claiming"
out="$("$bin" list)"
check 'list warns about a mutex wedged for over 60s' 'yes' \
  "$([[ "$out" == *"sf-lease unwedge"* ]] && echo yes || echo no)"
rmdir "$SF_LEASE_HOME/.claiming"

"$bin" claim orgr sess-R 'first' >/dev/null
started1="$(awk -F'\t' '$1 == "started" { print $2 }' "$SF_LEASE_HOME/sf-orgr.lease/meta")"
sleep 1
"$bin" claim orgr sess-R 'second' >/dev/null
started2="$(awk -F'\t' '$1 == "started" { print $2 }' "$SF_LEASE_HOME/sf-orgr.lease/meta")"
check 're-entrant claim refreshes started' 'yes' \
  "$([[ "$started2" -gt "$started1" ]] && echo yes || echo no)"
"$bin" release-session sess-R

# Two genuinely concurrent processes claiming different orgs: the mutex must
# serialize them into a brief queue, never into a failure for either.
"$bin" claim orgp sess-P 'x' & pidP=$!
"$bin" claim orgq sess-Q 'y' & pidQ=$!
rcP=0; wait "$pidP" || rcP=$?
rcQ=0; wait "$pidQ" || rcQ=$?
check 'two concurrent claims on different orgs both succeed' '0 0' "$rcP $rcQ"
"$bin" release-session sess-P
"$bin" release-session sess-Q

if [[ $failures -gt 0 ]]; then
  printf '%d failure(s)\n' "$failures" >&2
  exit 1
fi
printf 'sf-lease behaves correctly\n'
