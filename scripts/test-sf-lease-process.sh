#!/usr/bin/env bash
# Real local processes and transformed hook inputs; never calls Salesforce.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
lease="$root/bin/sf-lease"
tmp="$(mktemp -d)"
process_pid=''
cleanup() { touch "$tmp/finish"; [[ -z "$process_pid" ]] || kill "$process_pid" 2>/dev/null || true; rm -rf "$tmp"; }
trap cleanup EXIT
export SF_LEASE_HOME="$tmp/store" SF_LEASE_TTL_MINUTES=1 SF_LEASE_ENABLE=1
export SF_LEASE_BIN="$lease" SF_ORG_RESOLVE_BIN="$root/bin/sf-org-resolve" SF_ORG_MAP="$tmp/no-map"
mkdir -p "$tmp/bin" "$tmp/sub dir"
printf 'SF_BASE_URL=https://q--orga.sandbox.my.salesforce.com\n' > "$tmp/sub dir/.env"
cat > "$tmp/bin/npx" <<'SH'
#!/bin/bash
printf 'child-stdout\n'
printf 'child-stderr\n' >&2
cat
touch "$PROCESS_FIXTURE/ready"
for ((i=0; i<200; i++)); do
  [[ ! -f "$PROCESS_FIXTURE/finish" ]] || exit 7
  sleep 0.1
done
exit 99
SH
chmod +x "$tmp/bin/npx"
export PATH="$tmp/bin:$PATH" PROCESS_FIXTURE="$tmp"
check() { [[ "$2" == "$3" ]] || { printf 'FAIL %s: expected [%s], got [%s]\n' "$1" "$2" "$3" >&2; exit 1; }; printf 'ok %s\n' "$1"; }
code() { local rc=0; "$lease" "$@" >"$tmp/lease.out" 2>"$tmp/lease.err" || rc=$?; printf '%s' "$rc"; }
age() { sed 's/^started.*/started\t1/' "$SF_LEASE_HOME/sf-orga.lease/meta" > "$tmp/meta"; mv "$tmp/meta" "$SF_LEASE_HOME/sf-orga.lease/meta"; }
# Deliberately include quotes and metacharacters in the session and command.
# They must remain data, not shell expansions in the generated prefix.
# shellcheck disable=SC2016
sid='session $(touch INJECTED); "quote"'
cmd='cd "sub dir" && npx playwright test'
jq -nc --arg s "$sid" --arg c "$cmd" --arg cwd "$tmp" \
  '{tool_name:"Bash",session_id:$s,tool_use_id:"process-call",cwd:$cwd,tool_input:{command:$c,timeout:20000,description:"fixture",run_in_background:false}}' > "$tmp/payload"
"$root/claude/hooks/sf-lease-guard.sh" < "$tmp/payload" > "$tmp/response"
jq -e '.hookSpecificOutput.updatedInput | .timeout == 20000 and .description == "fixture" and .run_in_background == false' "$tmp/response" >/dev/null
check 'hook preserves input fields and permission handling' null "$(jq -r '.hookSpecificOutput.permissionDecision' "$tmp/response")"
updated="$(jq -r '.hookSpecificOutput.updatedInput.command' "$tmp/response")"
check 'original command remains literal at top level' "$cmd" "${updated#*$'\n'}"
printf 'stdin-value\n' > "$tmp/input"
(cd "$tmp" && exec bash -c "$updated" < "$tmp/input") > "$tmp/stdout" 2> "$tmp/stderr" &
process_pid=$!
for ((i=0; i<100; i++)); do [[ ! -f "$tmp/ready" ]] || break; sleep 0.1; done
check 'transformed command runs with its original stdin and cwd' yes "$([ -f "$tmp/ready" ] && echo yes || echo no)"
for n in 1 2; do
  age
  check "actual shell retains exclusion after TTL $n" 1 "$(code claim orga rival rival rival-call)"
done
jq --arg c "$updated" '.tool_input.command=$c' "$tmp/payload" | "$root/claude/hooks/sf-lease-post.sh" 2> "$tmp/background.err"
check 'early/background PostToolUse keeps live process excluded' 1 "$(code claim orga rival rival rival-call)"
check 'background retention is visible' yes "$(if grep -q 'retaining its claim' "$tmp/background.err"; then echo yes; else echo no; fi)"
check 'session metacharacters were not executed' no "$([ -f "$tmp/INJECTED" ] && echo yes || echo no)"
touch "$tmp/finish"
rc=0; wait "$process_pid" || rc=$?; process_pid=''
check 'original nonzero exit status is preserved' 7 "$rc"
check 'original stdout and stdin are preserved' $'child-stdout\nstdin-value' "$(cat "$tmp/stdout")"
check 'original stderr is preserved' child-stderr "$(cat "$tmp/stderr")"
# Cleanup must use call ID even with the prefix and nested original cwd.
jq --arg c "$updated" '.tool_input.command=$c' "$tmp/payload" | "$root/claude/hooks/sf-lease-post.sh"
check 'post with transformed input releases the bound identity' 0 "$(code claim orga rival rival rival-call)"
"$lease" release-session rival

# exec keeps PID/start identity. Termination and missed post cleanup are
# observed without a heartbeat or a worker that could survive the call.
"$lease" claim orga session command killed-call
birth=''
bash -c 'exec sleep 30' &
process_pid=$!
birth="$(LC_ALL=C ps -p "$process_pid" -o lstart=)"
"$lease" bind orga session killed-call "$process_pid" "$birth"
age
check 'exec of another program retains exclusion' 1 "$(code claim orga rival rival rival-call)"
kill -TERM "$process_pid"
wait "$process_pid" 2>/dev/null || true; process_pid=''
check 'termination and missed post eventually allow a rival' 0 "$(code claim orga rival rival rival-call)"
check 'expiry reports terminated process evidence' yes "$(if grep -q 'bound processes ended' "$tmp/lease.err"; then echo yes; else echo no; fi)"
"$lease" release-session rival

# A binding failure remains visible and preserves the existing fail-open
# policy; it neither swallows the original command nor changes its result.
"$root/claude/hooks/sf-lease-guard.sh" < "$tmp/payload" > "$tmp/response"
"$lease" release-call "$sid" process-call
updated="$(jq -r '.hookSpecificOutput.updatedInput.command' "$tmp/response")"
rc=0
(cd "$tmp" && bash -c "$updated" < "$tmp/input") > "$tmp/stdout" 2> "$tmp/stderr" || rc=$?
check 'late bind cannot recreate a released claim' '' "$("$lease" holder orga)"
check 'bind failure preserves command status' 7 "$rc"
check 'bind failure is visible on stderr' yes "$(if grep -q 'process binding failed' "$tmp/stderr"; then echo yes; else echo no; fi)"
printf 'real-process lease checks passed\n'
