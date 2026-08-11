#!/usr/bin/env bash
# SessionStart: show which orgs are already leased, so a new session knows what
# it will collide with before it runs anything.
#
# Read-only and silent on a clean machine - `sf-lease list` prints nothing when
# there are no leases, and breaks that silence only to warn about a genuinely
# wedged claim mutex. Always exits 0. Inert unless SF_LEASE_ENABLE names an
# explicitly truthy value.
set -uo pipefail

case "${SF_LEASE_ENABLE:-}" in
  1|on|On|ON|true|True|TRUE|yes|Yes|YES) ;;
  *) exit 0 ;;
esac

# ${HOME:-}, not $HOME: under `set -u` an unset HOME aborts the hook at rc 1.
LEASE="${SF_LEASE_BIN:-${HOME:-}/.local/bin/sf-lease}"
[[ -x "$LEASE" ]] || exit 0

"$LEASE" list 2>/dev/null || true
exit 0
