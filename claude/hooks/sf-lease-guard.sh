#!/usr/bin/env bash
# PreToolUse(Bash): claim the org lease a test command needs, or block the call.
#
# Exit 2 blocks and hands stderr to Claude; every other outcome exits 0. This
# hook runs before EVERY Bash call in EVERY session, including the session you
# would have to fix it from, so it fails OPEN by construction: a missing binary,
# an unparseable payload, a busy store or any unexpected sf-lease exit code lets
# the call through. Only rc 1 from `claim` - a live competing holder - blocks.
# Inert unless SF_LEASE_ENABLE names an explicitly truthy value.
set -uo pipefail

# An allowlist, not a denylist: an unrecognised value ("no", "off", a typo) must
# leave a hook that can block every Bash call switched OFF, not on.
case "${SF_LEASE_ENABLE:-}" in
  1|on|On|ON|true|True|TRUE|yes|Yes|YES) ;;
  *) exit 0 ;;
esac

# ${HOME:-}, not $HOME: under `set -u` an unset HOME aborts the hook at rc 1
# before it can decide anything, and rc 1 from a hook is not exit 0. An empty
# default just makes the path unexecutable, which is already a fail-open case.
RESOLVE="${SF_ORG_RESOLVE_BIN:-${HOME:-}/.local/bin/sf-org-resolve}"
LEASE="${SF_LEASE_BIN:-${HOME:-}/.local/bin/sf-lease}"
[[ -x "$RESOLVE" && -x "$LEASE" ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

LOG="${SF_LEASE_LOG:-${SF_LEASE_HOME:-${HOME:-}/.local/state/sf-leases}/hook.log}"

# The only channel that survives a hook that exits 0, so every exit code the
# caller cannot act on lands here rather than vanishing. Rotates because on a
# wedged store this is written once per Bash call per session.
HOOK_NAME=sf-lease-guard
# Missing support code must leave a per-command hook inert.
# shellcheck source=claude/hooks/sf-lease-common.sh
source "$(dirname "${BASH_SOURCE[0]}")/sf-lease-common.sh" 2>/dev/null || exit 0

payload="$(cat)"
[[ "$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)" == "Bash" ]] || exit 0

cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)"
sid="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)"
[[ -n "$cmd" && -n "$cwd" && -n "$sid" ]] || exit 0
token="$(call_token "$payload")"

# `cd canary/bearoku && npm run test:staging` runs in that subdirectory, not in
# the payload's .cwd, so resolving against .cwd alone silently keys the lease
# off the wrong repo's config. Only a leading `cd` chain is followed, and the
# path is never executed - it is passed to the resolver as a directory.
cwd="$(effective_cwd "$cwd" "$cmd")"

# 2>/dev/null: the resolver writes diagnostics to stderr, and capturing those
# would corrupt the identity string this whole hook keys off.
resolve_rc=0
identity="$("$RESOLVE" "$cwd" "$cmd" 2>/dev/null)" || resolve_rc=$?
# rc 3 is "this IS a test command, but the config it resolves through is present
# and unusable". It still fails OPEN - only its visibility changes. Before it had
# its own code it was rc 1, identical to "not a test command", so an unreadable
# org map turned the whole mechanism off with ZERO lines in this log. Re-run for
# the reason: this state is already broken, so one extra resolve costs nothing.
if [[ "$resolve_rc" -eq 3 ]]; then
  why="$("$RESOLVE" "$cwd" "$cmd" 2>&1 >/dev/null | tr '\n\t' '  ')"
  log "resolve_rc=3 session=$sid NO LEASE WAS TAKEN and this run is unprotected: sf-org-resolve found its configuration present but unusable [$why]. Check the org map (${SF_ORG_MAP:-${HOME:-}/.config/sf-org-identity/map}) and the env file the run loads are readable. Allowing the call."
  exit 0
fi
[[ "$resolve_rc" -eq 0 && -n "$identity" ]] || exit 0

rc=0
if [[ -n "$token" ]]; then
  claim_diagnostics="$("$LEASE" claim "$identity" "$sid" "$cmd" "$token" 2>&1 >/dev/null)" || rc=$?
else
  log "identity=$identity session=$sid missing/invalid tool_use_id; claiming legacy slot until SessionEnd/manual cleanup/TTL. PostToolUse cannot safely release it."
  claim_diagnostics="$("$LEASE" claim "$identity" "$sid" "$cmd" 2>&1 >/dev/null)" || rc=$?
fi
case "$claim_diagnostics" in
  *'liveness uncertain'*|*'bound processes ended'*)
    log "identity=$identity session=$sid ${claim_diagnostics:0:500}" ;;
esac
case "$rc" in
  0)
    if [[ -n "$token" ]]; then
      # A hook's PID is short-lived. Bind from INSIDE the actual tool shell.
      # %q quotes data for Bash; the original command stays literal at top level.
      # Do not return permissionDecision=allow: normal permissions still apply.
      # shellcheck disable=SC2016
      printf -v binding '%q bind %q %q %q "$$" "$(LC_ALL=C ps -p "$$" -o lstart=)"' \
        "$LEASE" "$identity" "$sid" "$token"
      prefix="$binding || printf '%s\\n' 'sf-lease: process binding failed; this call has TTL-only protection. Stop competing runs; inspect sf-lease list and recover after calls stop.' >&2"
      printf '%s' "$payload" | jq --arg prefix "$prefix" \
        '{hookSpecificOutput:{hookEventName:"PreToolUse", updatedInput:(.tool_input | .command = ($prefix + "\n" + .command))}}'
    fi
    exit 0 ;;
  1) ;;                 # refused - fall through to the block below
  64)
    # TWO causes, and the second is the likely one: sf-lease returns 64 for a bad
    # invocation AND for a malformed SF_LEASE_* numeric knob. Naming only the
    # first sent an operator to the wrong file - and the README's arming step has
    # them editing exactly these variables in a shell profile.
    log "rc=64 identity=$identity session=$sid claim was rejected as a bad invocation, so NO lease was taken. Either a malformed SF_LEASE_* value in your shell profile (SF_LEASE_TTL_MINUTES, SF_LEASE_MUTEX_TIMEOUT_MS, SF_LEASE_MUTEX_WEDGE_SECONDS - each must be a plain integer inside its documented range), or a bug in this hook's argument plumbing. Run: sf-lease claim <org> <session> probe - it prints which. Allowing the call."
    exit 0 ;;
  70)
    log "rc=70 identity=$identity session=$sid sf-lease failed to persist the claim or aborted; no grant was confirmed. Check store permissions/free space and inspect with: sf-lease list. Allowing the call."
    exit 0 ;;
  75)
    # NOT a refusal: nothing was read, decided or changed. No retry here - the
    # mutex is never auto-recovered, so 75 in practice means a wedge that a
    # retry cannot clear, and each attempt costs another 5s on every Bash call
    # in the session. The release paths do retry, where the cost of a missed
    # release is a 120-minute leak.
    log "rc=75 identity=$identity session=$sid the lease store was busy or wedged, so NO lease was taken and this run is unprotected. Check: sf-lease list; then sf-lease unwedge. Allowing the call."
    exit 0 ;;
  130|143)
    log "rc=$rc identity=$identity session=$sid the claim was killed by a signal; the lease may or may not exist under this session id. It self-corrects on the next claim (re-entrant) or at SessionEnd. Allowing the call."
    exit 0 ;;
  *)
    log "rc=$rc identity=$identity session=$sid unexpected sf-lease exit code; treating it as 'not held'. Allowing the call."
    exit 0 ;;
esac

# A refused claim may find incomplete metadata from an interrupted writer.
# Report that uncertainty rather than inventing a holder. Persistence failures
# from this invocation already exited above with rc 70.
holder="$("$LEASE" holder "$identity" 2>/dev/null || true)"
[[ -n "$holder" ]] || holder='unknown - sf-lease recorded no holder, which can also mean the lease store failed to write its metadata'

log "rc=1 identity=$identity session=$sid BLOCKED: held by [$holder]"
jq -cn --arg id "$identity" --arg h "$holder" '{error:
  "Org \($id) is leased by another Claude session (\($h)). Wait for that run to finish, ask that session to release it, or run against a scratch org with SF_SCRATCH_POOL=1. Inspect with: sf-lease list. After all its calls stop, clear that session with: sf-lease release-session <session>."
}' >&2 || printf '{"error":"Org %s is leased by another Claude session. Inspect with: sf-lease list."}\n' "$identity" >&2
exit 2
