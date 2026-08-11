#!/usr/bin/env bash
# PreToolUse(Bash) hook: record which Salesforce org a test command targets, keyed
# by session, so the statusline can show the org a session is ACTUALLY using rather
# than only the .env default. Writes "<flag>\t<id>" (flag=prod|ok) - or the sentinel
# "default" - to the per-session store. Best-effort and non-blocking: it only ever
# records state and always exits 0, so it can never deny a tool call.
set -uo pipefail

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
sess=$(printf '%s' "$input" | jq -r '.session_id // empty' 2>/dev/null)
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
if [ -z "$cmd" ] || [ -z "$sess" ]; then exit 0; fi

# React only to Playwright test invocations; everything else is a no-op.
printf '%s' "$cmd" | grep -qE 'playwright[[:space:]]+test|npx[[:space:]]+playwright|test:last-failed' || exit 0

STORE="${SESSION_ORG_HOME:-$HOME/.local/state/session-orgs}"
mkdir -p "$STORE" 2>/dev/null || true

# Pull an inline "KEY=value" assignment out of the command string (env prefix).
arg() { printf '%s' "$cmd" | grep -oE "(^|[[:space:]])$1=[^[:space:]]+" | tail -n1 | sed -E "s/.*$1=//"; }
# A host is prod unless it carries a sandbox/scratch/dev marker.
prodish() { case "$1" in *sandbox*|*scratch*|*develop*|*--*) return 1 ;; *) return 0 ;; esac; }

alias=$(arg SF_ORG_ALIAS)
baseurl=$(arg SF_BASE_URL)
pool=$(arg SF_SCRATCH_POOL)
tenv=$(arg TEST_ENV)

flag=ok
id=""
if [ -n "$alias" ]; then
  id="$alias"
elif [ -n "$baseurl" ]; then
  host="${baseurl#*://}"; host="${host%%/*}"; host="${host%%.*}"; id="$host"
  prodish "$baseurl" && flag=prod
elif [ -n "$tenv" ]; then
  # Resolve identity from the env file the run would load, if it exists locally.
  path="$cwd/.env.$tenv"
  if [ -f "$path" ]; then
    b=$(grep -E '^[[:space:]]*SF_BASE_URL=' "$path" 2>/dev/null | tail -n1 | sed -E 's/^[^=]*=//; s/^["'\'']//; s/["'\''][[:space:]]*$//')
    s=$(grep -E '^[[:space:]]*AM_SANDBOX_NAME=' "$path" 2>/dev/null | tail -n1 | sed -E 's/^[^=]*=//; s/^["'\'']//; s/["'\''][[:space:]]*$//')
    if [ -n "$b" ]; then host="${b#*://}"; host="${host%%/*}"; host="${host%%.*}"; id="$host"; prodish "$b" && flag=prod; fi
    if [ -z "$id" ] && [ -n "$s" ]; then
      id="$s"
      case "$id" in *@*) id="${id%@*}"; case "$id" in *+*) id="${id##*+}" ;; esac ;; esac
    fi
  fi
  [ -z "$id" ] && id="$tenv"
  case "$tenv" in *[Pp][Rr][Oo][Dd]*) flag=prod ;; esac
elif [ -n "$pool" ] && [ "$pool" != 0 ] && [ "$pool" != false ]; then
  id="scratch-pool"
fi

if [ -z "$id" ]; then
  printf 'default' > "$STORE/$sess"
else
  printf '%s\t%s' "$flag" "$id" > "$STORE/$sess"
fi
exit 0
