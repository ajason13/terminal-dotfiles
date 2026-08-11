#!/usr/bin/env bash
# SessionEnd: release every lease this session still holds.
#
# The last line of defence: whatever the PostToolUse hook missed - a killed
# hook, a crashed run - is cleaned up here. Only rc 0 means released; anything
# else is reported loudly rather than assumed to be "already gone", because a
# silently-missed release keeps the org leased for a full TTL and blocks every
# other session, which is the exact harm this whole mechanism exists to prevent.
# Always exits 0. Inert unless SF_LEASE_ENABLE names an explicitly truthy value.
set -uo pipefail

case "${SF_LEASE_ENABLE:-}" in
  1|on|On|ON|true|True|TRUE|yes|Yes|YES) ;;
  *) exit 0 ;;
esac

# ${HOME:-}, not $HOME: under `set -u` an unset HOME aborts at rc 1 BEFORE the
# release below ever runs, and this is the last line of defence - a lease that
# survives here is leased until its TTL expires.
LEASE="${SF_LEASE_BIN:-${HOME:-}/.local/bin/sf-lease}"
[[ -x "$LEASE" ]] || exit 0
command -v jq >/dev/null 2>&1 || exit 0

LOG="${SF_LEASE_LOG:-${SF_LEASE_HOME:-${HOME:-}/.local/state/sf-leases}/hook.log}"

log() {
  local dir="${LOG%/*}" size=0
  [[ -d "$dir" ]] || mkdir -p "$dir" 2>/dev/null || return 0
  # `wc -c <file` pads with spaces on macOS, and 2>/dev/null has to come FIRST
  # or the shell reports a failed redirection on the real stderr.
  [[ -f "$LOG" ]] && size="$(2>/dev/null wc -c < "$LOG" | tr -d '[:space:]')"
  [[ "$size" =~ ^[0-9]+$ ]] || size=0
  (( size > 262144 )) && mv -f "$LOG" "$LOG.1" 2>/dev/null
  2>/dev/null printf '%s sf-lease-end %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$*" >> "$LOG"
  printf 'sf-lease-end: %s\n' "$*" >&2
  return 0
}

sid="$(cat | jq -r '.session_id // empty' 2>/dev/null)"
[[ -n "$sid" ]] || exit 0

rc=0
attempt=0
# Each retry costs sf-lease's whole mutex timeout (5s by default) on a wedged
# store. Garbage, a leading zero (bash reads it as octal) and anything past the
# cap all fall back to the default, out loud.
RETRIES_MAX=5
retries="${SF_LEASE_HOOK_RETRIES:-2}"
if ! [[ "$retries" =~ ^(0|[1-9][0-9]*)$ ]] || (( retries > RETRIES_MAX )); then
  log "SF_LEASE_HOOK_RETRIES=$retries is not an integer in 0..$RETRIES_MAX; using 2 instead."
  retries=2
fi
# The loop's ceiling is a LITERAL bound on an internal counter, not $retries, so
# no value of the knob can spin forever even if it slips past the check above.
# A value like "08" is exactly how that happens: bash reads it as octal and
# `-ge` then errors instead of comparing, so the break never fires.
while [[ "$attempt" -le "$RETRIES_MAX" ]]; do
  rc=0
  "$LEASE" release-session "$sid" >/dev/null 2>&1 || rc=$?
  [[ "$rc" -eq 75 ]] || break
  [[ "$attempt" -ge "$retries" ]] && break
  attempt=$(( attempt + 1 ))
  sleep 0.2
done

case "$rc" in
  0) ;;
  75)
    log "rc=75 session=$sid leases were NOT released - the store stayed busy or wedged across $((attempt + 1)) attempts. Any org this session held stays leased until its TTL expires and will block other sessions. Recover with: sf-lease list; sf-lease unwedge; sf-lease release-session $sid"
    ;;
  64)
    # Two causes: a bad invocation, or a malformed SF_LEASE_* numeric knob. The
    # knob is the likely one, since arming means editing those in a shell profile.
    log "rc=64 session=$sid release-session was rejected as a bad invocation, so nothing was released. Either a malformed SF_LEASE_* value in your shell profile (SF_LEASE_TTL_MINUTES, SF_LEASE_MUTEX_TIMEOUT_MS, SF_LEASE_MUTEX_WEDGE_SECONDS - each must be a plain integer inside its documented range), or a bug in this hook's argument plumbing. Run: sf-lease release-session $sid - it prints which."
    ;;
  70)
    log "rc=70 session=$sid sf-lease aborted before deciding anything, so nothing was released. This is an sf-lease bug and must never happen."
    ;;
  130|143)
    log "rc=$rc session=$sid release-session was killed by a signal and may NOT have completed; leases held by this session may survive until their TTL."
    ;;
  *)
    log "rc=$rc session=$sid unexpected sf-lease exit code; nothing was released."
    ;;
esac
exit 0
