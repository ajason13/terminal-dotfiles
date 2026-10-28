#!/usr/bin/env bash
# Deterministic expiry/liveness cases use fake process observations, not live orgs.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lease="$root/bin/sf-lease"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
export SF_LEASE_HOME="$tmp/store" SF_LEASE_TTL_MINUTES=1
mkdir -p "$tmp/bin"
cat > "$tmp/bin/ps" <<'SH'
#!/bin/sh
case "${PROCESS_STATE:-live}" in
  live) printf 'Wed Oct 28 00:00:00 2026 S\n' ;;
  reused) printf 'Wed Oct 28 01:00:00 2026 S\n' ;;
  zombie) printf 'Wed Oct 28 00:00:00 2026 Z\n' ;;
  dead) exit 1 ;;
  error) exit 2 ;;
  error1) printf 'ps: permission denied\n' >&2; exit 1 ;;
  malformed) printf 'unexpected ps output\n' ;;
  uncertain) printf 'partial'; exit 1 ;;
esac
SH
chmod +x "$tmp/bin/ps"
export PATH="$tmp/bin:$PATH"
birth='Wed Oct 28 00:00:00 2026'
code() { local rc=0; "$lease" "$@" >"$tmp/out" 2>"$tmp/err" || rc=$?; printf '%s' "$rc"; }
check() { [[ "$2" == "$3" ]] || { printf 'FAIL %s: expected %s, got %s\n' "$1" "$2" "$3" >&2; exit 1; }; printf 'ok %s\n' "$1"; }
age() { sed 's/^started.*/started\t1/' "$SF_LEASE_HOME/sf-org.lease/meta" > "$tmp/meta"; mv "$tmp/meta" "$SF_LEASE_HOME/sf-org.lease/meta"; }
"$lease" claim org session command call
check 'bind an existing call to its executing process' 0 "$(code bind org session call 123 "$birth")"
for n in 1 2 3; do
  age
  check "live call retains exclusion at TTL interval $n" 1 "$(code claim org rival command rival-call)"
  "$lease" sweep org
  check 'sweep preserves active owner' yes "$([ -f "$SF_LEASE_HOME/sf-org.lease/meta" ] && echo yes || echo no)"
done
age
check 'process lookup failure retains exclusion' 1 "$(PROCESS_STATE=error code claim org rival command rival-call)"
check 'process lookup failure is visible' yes "$(if grep -q 'liveness uncertain' "$tmp/err"; then echo yes; else echo no; fi)"
for observation in error1 malformed uncertain; do
  check "$observation process observation retains exclusion" 1 "$(PROCESS_STATE="$observation" code claim org rival command rival-call)"
  check "$observation observation reports uncertainty" yes "$(if grep -q 'liveness uncertain' "$tmp/err"; then echo yes; else echo no; fi)"
done
check 'holder exposes the bound process for recovery' yes "$(if "$lease" holder org | grep -q 'pid=123 started=Wed'; then echo yes; else echo no; fi)"
check 'invalid PID is rejected' 64 "$(code bind org session call 000123 "$birth")"
check 'late bind cannot replace a process binding'  1 "$(code bind org session call 456 "$birth")"
check 'wrong token cannot bind' 1 "$(code bind org session wrong 123 "$birth")"
check 'wrong session cannot bind' 1 "$(code bind org rival call 123 "$birth")"
check 'dead process expires' 0 "$(PROCESS_STATE=dead code claim org rival command replacement)"
check 'late binding cannot revive an older owner' 1 "$(code bind org session call 123 "$birth")"
"$lease" release org session call
check 'old cleanup preserves replacement' 1 "$(code claim org third command third)"
"$lease" release-session rival
for state in reused zombie; do
  "$lease" claim org session command "call-$state"
  "$lease" bind org session "call-$state" 123 "$birth"
  age
  check "$state process does not extend old ownership" 0 "$(PROCESS_STATE="$state" code claim org rival command replacement)"
  "$lease" release-session rival
done
"$lease" claim org session command a
"$lease" claim org session command b
"$lease" bind org session a 123 "$birth"
"$lease" bind org session b 123 "$birth"
"$lease" release org session a
age
check 'released sibling does not lose active sibling exclusion' 1 "$(code claim org rival command replacement)"
check 'background post cleanup retains a live call' 1 "$(code release-call session b)"
check 'uncertain background completion retains a call' 1 "$(PROCESS_STATE=error code release-call session b)"
check 'ps rc1 error on background completion retains a call' 1 "$(PROCESS_STATE=error1 code release-call session b)"
PROCESS_STATE=dead "$lease" release-call session b
check 'call cleanup finds its identity without command resolution' 0 "$(code claim org rival command replacement)"
"$lease" release-call session b
check 'late call cleanup cannot remove replacement' 1 "$(code claim org third command third)"
"$lease" release-session rival
check 'bind never creates a missing lease' 1 "$(code bind org session call 123 "$birth")"
"$lease" claim org session command legacy-call
age
check 'unbound claims preserve ordinary TTL expiry' 0 "$(code claim org rival command replacement)"
printf 'lease liveness checks passed\n'
