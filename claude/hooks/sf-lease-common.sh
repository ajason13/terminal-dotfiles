#!/usr/bin/env bash
# Shared by the installed lease hooks. Callers supply HOOK_NAME, LOG and LEASE.
log() {
  local dir="${LOG%/*}" size=0
  [[ -d "$dir" ]] || mkdir -p "$dir" 2>/dev/null || return 0
  # `wc -c <file` pads with spaces on macOS, and 2>/dev/null has to come FIRST
  # or the shell reports a failed redirection on the real stderr.
  [[ -f "$LOG" ]] && size="$(2>/dev/null wc -c < "$LOG" | tr -d '[:space:]')"
  [[ "$size" =~ ^[0-9]+$ ]] || size=0
  (( size > 262144 )) && mv -f "$LOG" "$LOG.1" 2>/dev/null
  2>/dev/null printf '%s %s %s\n' "$(date '+%Y-%m-%dT%H:%M:%S%z')" "$HOOK_NAME" "$*" >> "$LOG"
  [[ "$HOOK_NAME" == sf-lease-guard ]] || printf '%s: %s\n' "$HOOK_NAME" "$*" >&2
  return 0
}


CD_RE='^[[:space:]]*cd[[:space:]]+("[^"]+"|'\''[^'\'']+'\''|[^[:space:];&|]+)[[:space:]]*(&&|;)'
effective_cwd() {
  local base="$1" rest="$2" target resolved hops=0
  while (( hops < 4 )) && [[ "$rest" =~ $CD_RE ]]; do
    target="${BASH_REMATCH[1]}"
    rest="${rest:${#BASH_REMATCH[0]}}"
    target="${target%\"}"; target="${target#\"}"
    target="${target%\'}"; target="${target#\'}"
    case "$target" in
      '~') target="${HOME:-}" ;;
      \~/*) target="${HOME:-}/${target#\~/}" ;;
      /*) ;;
      *) target="$base/$target" ;;
    esac
    resolved="$(cd "$target" 2>/dev/null && pwd)" || resolved=''
    [[ -n "$resolved" ]] || break
    base="$resolved"
    hops=$(( hops + 1 ))
  done
  printf '%s' "$base"
}

release_with_retry() {
  local RETRIES_MAX=5 retries="${SF_LEASE_HOOK_RETRIES:-2}"
  rc=0
  attempt=0
  if ! [[ "$retries" =~ ^(0|[1-9][0-9]*)$ ]] || (( retries > RETRIES_MAX )); then
    log "SF_LEASE_HOOK_RETRIES=$retries is not an integer in 0..$RETRIES_MAX; using 2 instead."
    retries=2
  fi
  # The loop's ceiling is a LITERAL bound on an internal counter, not $retries, so
  # no value of the knob can spin forever even if it slips past the check above.
  # An infinite spin in a hook hangs the whole session rather than failing it -
  # and a value like "08" is exactly how that happens, because bash reads it as
  # octal and `-ge` then errors instead of comparing.
  while [[ "$attempt" -le "$RETRIES_MAX" ]]; do
    rc=0
    "$LEASE" "$@" >/dev/null 2>&1 || rc=$?
    [[ "$rc" -eq 75 ]] || break
    [[ "$attempt" -ge "$retries" ]] && break
    attempt=$(( attempt + 1 ))
    sleep 0.2
  done
}
