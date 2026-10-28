#!/usr/bin/env bash
# PostToolUse(Bash): release the lease this same Bash call claimed.
#
# It locates the existing claim by session/tool_use_id, so a process-binding
# prefix or a changed working directory cannot redirect cleanup. Always exits
# 0; inert unless SF_LEASE_ENABLE names an explicitly truthy value.
set -uo pipefail

case "${SF_LEASE_ENABLE:-}" in
  1|on|On|ON|true|True|TRUE|yes|Yes|YES) ;;
  *) exit 0 ;;
esac

# ${HOME:-}, not $HOME: under `set -u` an unset HOME aborts at rc 1 BEFORE the
# release below ever runs, which leaves the lease standing - the one failure
# mode this hook exists to prevent.
LEASE="${SF_LEASE_BIN:-${HOME:-}/.local/bin/sf-lease}"
[[ -x "$LEASE" ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

LOG="${SF_LEASE_LOG:-${SF_LEASE_HOME:-${HOME:-}/.local/state/sf-leases}/hook.log}"

HOOK_NAME=sf-lease-post
# Missing support code must leave a per-command hook inert.
# shellcheck source=claude/hooks/sf-lease-common.sh
source "$(dirname "${BASH_SOURCE[0]}")/sf-lease-common.sh" 2>/dev/null || exit 0

payload="$(cat)"
[[ "$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)" == "Bash" ]] || exit 0

sid="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)"
[[ -n "$sid" ]] || exit 0
token="$(call_token "$payload")"
identity='(call lookup)'

# rc 75 means the store was busy and NOTHING was released, so unlike the claim
# path a retry is worth its cost here: the alternative is a lease that outlives
# its run and blocks every other session for a full TTL. sf-lease itself only
# ever removes a lease whose meta names this session, so a retry cannot take
# anyone else's.
if [[ -z "$token" ]]; then
  log "identity=$identity session=$sid missing/invalid tool_use_id; releasing nothing. Inspect with: sf-lease list; clean up after calls finish with: sf-lease release-session $sid"
  exit 0
fi
release_with_retry release-call "$sid" "$token"

case "$rc" in
  0) ;;
  1)
    log "session=$sid call=$token bound process still live or liveness uncertain; retaining its claim for background completion. Inspect with: sf-lease list; after calls stop, use sf-lease release-session $sid or allow TTL cleanup."
    ;;
  75)
    log "rc=75 identity=$identity session=$sid the lease was NOT released - the store stayed busy or wedged across $((attempt + 1)) attempts, so this org stays leased until its TTL expires. Recover with: sf-lease list; sf-lease unwedge; sf-lease release-call $sid $token"
    ;;
  64)
    # Two causes: a bad invocation, or a malformed SF_LEASE_* numeric knob. The
    # knob is the likely one, since arming means editing those in a shell profile.
    log "rc=64 identity=$identity session=$sid release was rejected as a bad invocation, so the lease was NOT released. Either a malformed SF_LEASE_* value in your shell profile (SF_LEASE_TTL_MINUTES, SF_LEASE_MUTEX_TIMEOUT_MS, SF_LEASE_MUTEX_WEDGE_SECONDS - each must be a plain integer inside its documented range), or a bug in this hook's argument plumbing. Run: sf-lease release-call $sid $token - it prints which."
    ;;
  70)
    log "rc=70 identity=$identity session=$sid sf-lease failed to persist the release or aborted; release was NOT confirmed. Check store permissions/free space; inspect with: sf-lease list; retry with: sf-lease release-call $sid $token."
    ;;
  130|143)
    log "rc=$rc identity=$identity session=$sid the release was killed by a signal and may NOT have completed. SessionEnd will retry it."
    ;;
  *)
    log "rc=$rc identity=$identity session=$sid unexpected sf-lease exit code; the lease was NOT released."
    ;;
esac
exit 0
