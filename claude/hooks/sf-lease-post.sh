#!/usr/bin/env bash
# PostToolUse(Bash): release the lease this same Bash call claimed.
#
# It RE-RESOLVES the command and releases only that identity. Releasing
# everything the session holds would let an unrelated `git status`, run while a
# suite is mid-flight, drop that suite's live lease. Always exits 0. Inert
# unless SF_LEASE_ENABLE names an explicitly truthy value.
set -uo pipefail

case "${SF_LEASE_ENABLE:-}" in
  1|on|On|ON|true|True|TRUE|yes|Yes|YES) ;;
  *) exit 0 ;;
esac

# ${HOME:-}, not $HOME: under `set -u` an unset HOME aborts at rc 1 BEFORE the
# release below ever runs, which leaves the lease standing - the one failure
# mode this hook exists to prevent.
RESOLVE="${SF_ORG_RESOLVE_BIN:-${HOME:-}/.local/bin/sf-org-resolve}"
LEASE="${SF_LEASE_BIN:-${HOME:-}/.local/bin/sf-lease}"
[[ -x "$RESOLVE" && -x "$LEASE" ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

LOG="${SF_LEASE_LOG:-${SF_LEASE_HOME:-${HOME:-}/.local/state/sf-leases}/hook.log}"

HOOK_NAME=sf-lease-post
# Missing support code must leave a per-command hook inert.
# shellcheck source=claude/hooks/sf-lease-common.sh
source "$(dirname "${BASH_SOURCE[0]}")/sf-lease-common.sh" 2>/dev/null || exit 0

payload="$(cat)"
[[ "$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)" == "Bash" ]] || exit 0

cmd="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
cwd="$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)"
sid="$(printf '%s' "$payload" | jq -r '.session_id // empty' 2>/dev/null)"
[[ -n "$cmd" && -n "$cwd" && -n "$sid" ]] || exit 0

# Resolve with the same shared directory rule used when claiming.
cwd="$(effective_cwd "$cwd" "$cmd")"

resolve_rc=0
identity="$("$RESOLVE" "$cwd" "$cmd" 2>/dev/null)" || resolve_rc=$?
# rc 3 = config present but unusable. The guard could not have claimed anything
# either, so there is nothing to release; log it for the same reason the guard
# does - as rc 1 this was indistinguishable from "not a test command".
if [[ "$resolve_rc" -eq 3 ]]; then
  why="$("$RESOLVE" "$cwd" "$cmd" 2>&1 >/dev/null | tr '\n\t' '  ')"
  log "resolve_rc=3 session=$sid sf-org-resolve found its configuration present but unusable [$why], so no identity could be resolved and nothing was released. Leasing is effectively OFF until this is fixed."
  exit 0
fi
[[ "$resolve_rc" -eq 0 && -n "$identity" ]] || exit 0

# rc 75 means the store was busy and NOTHING was released, so unlike the claim
# path a retry is worth its cost here: the alternative is a lease that outlives
# its run and blocks every other session for a full TTL. sf-lease itself only
# ever removes a lease whose meta names this session, so a retry cannot take
# anyone else's.
release_with_retry release "$identity" "$sid"

case "$rc" in
  0) ;;
  75)
    log "rc=75 identity=$identity session=$sid the lease was NOT released - the store stayed busy or wedged across $((attempt + 1)) attempts, so this org stays leased until its TTL expires. Recover with: sf-lease list; sf-lease unwedge; sf-lease release $identity $sid"
    ;;
  64)
    # Two causes: a bad invocation, or a malformed SF_LEASE_* numeric knob. The
    # knob is the likely one, since arming means editing those in a shell profile.
    log "rc=64 identity=$identity session=$sid release was rejected as a bad invocation, so the lease was NOT released. Either a malformed SF_LEASE_* value in your shell profile (SF_LEASE_TTL_MINUTES, SF_LEASE_MUTEX_TIMEOUT_MS, SF_LEASE_MUTEX_WEDGE_SECONDS - each must be a plain integer inside its documented range), or a bug in this hook's argument plumbing. Run: sf-lease release $identity $sid - it prints which."
    ;;
  70)
    log "rc=70 identity=$identity session=$sid sf-lease aborted before deciding anything, so the lease was NOT released. This is an sf-lease bug and must never happen."
    ;;
  130|143)
    log "rc=$rc identity=$identity session=$sid the release was killed by a signal and may NOT have completed. SessionEnd will retry it."
    ;;
  *)
    log "rc=$rc identity=$identity session=$sid unexpected sf-lease exit code; the lease was NOT released."
    ;;
esac
exit 0
