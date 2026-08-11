#!/bin/bash
input=$(cat)

# --- Model (abbreviated, e.g. claude-opus-4-8 -> opus-4.8) ---
abbreviate_model() {
  local raw="$1"
  [ -z "$raw" ] && { echo ""; return; }
  # normalize spaces/dots to '-' and lowercase, so "Claude Opus 4.8" behaves like "claude-opus-4-8"
  local norm
  norm=$(echo "$raw" | tr '[:upper:]' '[:lower:]' | tr ' .' '--')
  local -a parts
  IFS='-' read -ra parts <<< "$norm"
  local family="" nums=()
  for p in "${parts[@]}"; do
    [ -z "$p" ] && continue
    [ "$p" = "claude" ] && continue
    if [[ "$p" =~ ^[0-9]+$ ]]; then
      # 6+ digit numeric tokens are release dates (e.g. 20250805) - drop them
      if [ ${#p} -ge 6 ]; then
        continue
      fi
      nums+=("$p")
    else
      if [ -z "$family" ]; then
        family="$p"
      else
        family="$family-$p"
      fi
    fi
  done
  local version=""
  if [ ${#nums[@]} -gt 0 ]; then
    version=$(IFS=.; echo "${nums[*]}")
  fi
  if [ -n "$family" ] && [ -n "$version" ]; then
    echo "${family}-${version}"
  elif [ -n "$family" ]; then
    echo "$family"
  else
    echo "$raw"
  fi
}

# --- CRM org resolution (announce-only visibility of the target Salesforce org) ---
# Reads only non-secret identity keys from the env file the suite loads; never
# prints the file and never touches *PASSWORD/SECRET/TOKEN keys.
read_env_key() {
  # $1 = file, $2 = key; prints the value with surrounding quotes/space stripped.
  grep -E "^[[:space:]]*$2=" "$1" 2>/dev/null | tail -n1 \
    | sed -E "s/^[[:space:]]*$2=//; s/^[\"']//; s/[\"'][[:space:]]*\$//; s/[[:space:]]*\$//"
}

resolve_crm_org() {
  local root="$1" sess="$2"
  local id="" is_prod=0

  # Per-session override: the org of the last test command this session ran,
  # recorded by the track-crm-org PreToolUse hook. Authoritative over the default,
  # because it reflects what the session actually targeted (prod, a scratch org...).
  local store="${SESSION_ORG_HOME:-$HOME/.local/state/session-orgs}"
  if [ -n "$sess" ] && [ -f "$store/$sess" ]; then
    local line flag
    line=$(cat "$store/$sess" 2>/dev/null)
    flag=${line%%$'\t'*}
    if [ "$flag" != default ] && [ "$line" != "$flag" ]; then
      id=${line#*$'\t'}
      [ "$flag" = prod ] && is_prod=1
    fi
  fi

  # Otherwise the session default, from the env file the suite would load.
  if [ -z "$id" ] && [ -n "$root" ]; then
    local envfile=".env"
    [ -n "$TEST_ENV" ] && envfile=".env.$TEST_ENV"
    local path="$root/$envfile"
    # relevance gate: silent unless this project's env exposes SF org identity keys
    if [ -f "$path" ] && grep -qE '^[[:space:]]*(SF_BASE_URL|AM_SANDBOX_NAME|SF_ORG_ALIAS|SF_SCRATCH_POOL)=' "$path" 2>/dev/null; then
      local alias baseurl sandbox pool host
      alias=$(read_env_key "$path" SF_ORG_ALIAS)
      baseurl=$(read_env_key "$path" SF_BASE_URL)
      sandbox=$(read_env_key "$path" AM_SANDBOX_NAME)
      pool=$(read_env_key "$path" SF_SCRATCH_POOL)

      host=""
      if [ -n "$baseurl" ]; then
        host="${baseurl#*://}"; host="${host%%/*}"; host="${host%%.*}"
      fi

      if [ -n "$alias" ]; then id="$alias"
      elif [ -n "$host" ]; then id="$host"
      elif [ -n "$sandbox" ]; then
        id="$sandbox"
        # compact email-style sandbox logins (user+orgtag@domain) to the org tag
        case "$id" in *@*) id="${id%@*}"; case "$id" in *+*) id="${id##*+}";; esac ;; esac
      elif [ -n "$pool" ]; then id="scratch-pool"
      else id="${TEST_ENV:-sf}"
      fi

      # PROD when TEST_ENV says so, or a base URL lacks sandbox/scratch/dev markers
      case "$TEST_ENV" in *[Pp][Rr][Oo][Dd]*) is_prod=1;; esac
      if [ "$is_prod" -eq 0 ] && [ -n "$host" ]; then
        case "$baseurl" in
          *sandbox*|*scratch*|*develop*|*--*) : ;;
          *) is_prod=1 ;;
        esac
      fi
    fi
  fi

  [ -z "$id" ] && return
  if [ "$is_prod" -eq 1 ]; then
    printf '\033[1;31msf:⚠PROD %s\033[0m' "$id"
  else
    printf 'sf:%s' "$id"
  fi
}

MODEL_RAW=$(echo "$input" | jq -r '.model.id // .model.display_name // empty')
MODEL=$(abbreviate_model "$MODEL_RAW")

# --- Git branch (prefer worktree branch, else resolve from cwd) ---
CWD=$(echo "$input" | jq -r '.cwd // .workspace.current_dir // empty')
BRANCH=$(echo "$input" | jq -r '.worktree.branch // empty')
if [ -z "$BRANCH" ] && [ -n "$CWD" ]; then
  BRANCH=$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null)
fi

# --- GitHub PR status (background-refreshed; never blocks statusline render) ---
# Shows the branch's PR number colored by state. gh runs in the background on a
# short TTL so rendering stays instant even when gh/network is slow; we always
# render whatever the cache holds (empty = checked, no PR for this branch).
PR_STATUS=""
if [ -n "$BRANCH" ] && [ -n "$CWD" ] && command -v gh >/dev/null 2>&1; then
  pr_cache_dir="${TMPDIR:-/tmp}/claude-pr-status"
  mkdir -p "$pr_cache_dir" 2>/dev/null
  pr_key=$(printf '%s' "$CWD|$BRANCH" | cksum | cut -d' ' -f1)
  pr_file="$pr_cache_dir/$pr_key"

  pr_fresh=0
  if [ -f "$pr_file" ]; then
    pr_mtime=$(stat -f %m "$pr_file" 2>/dev/null || stat -c %Y "$pr_file" 2>/dev/null || echo 0)
    [ $(( $(date +%s) - pr_mtime )) -lt 15 ] && pr_fresh=1
  fi
  if [ "$pr_fresh" -eq 0 ]; then
    ( cd "$CWD" && gh pr view --json number,state,isDraft \
        --jq '(.number|tostring) + "|" + (if .isDraft then "DRAFT" else .state end)' \
        >"$pr_file.tmp" 2>/dev/null && mv "$pr_file.tmp" "$pr_file" 2>/dev/null \
        || : >"$pr_file" ) >/dev/null 2>&1 &
    disown 2>/dev/null
  fi

  if [ -s "$pr_file" ]; then
    pr_info=$(cat "$pr_file" 2>/dev/null)
    pr_num="${pr_info%%|*}"
    pr_state="${pr_info##*|}"
    case "$pr_state" in
      OPEN)   PR_STATUS=$(printf '\033[1;32mPR #%s\033[0m' "$pr_num") ;;
      DRAFT)  PR_STATUS=$(printf '\033[1;33mPR #%s draft\033[0m' "$pr_num") ;;
      MERGED) PR_STATUS=$(printf '\033[1;35mPR #%s merged\033[0m' "$pr_num") ;;
      CLOSED) PR_STATUS=$(printf '\033[1;31mPR #%s closed\033[0m' "$pr_num") ;;
    esac
  fi
fi

# --- Current dir, relative to worktree/project root ---
ROOT=$(echo "$input" | jq -r '.worktree.path // .workspace.project_dir // empty')
RELPATH=""
if [ -n "$CWD" ] && [ -n "$ROOT" ]; then
  if [ "$CWD" = "$ROOT" ]; then
    RELPATH="."
  elif [[ "$CWD" == "$ROOT"/* ]]; then
    RELPATH="${CWD#"$ROOT"/}"
  else
    RELPATH="$CWD"
  fi
fi

# --- CRM org (the org this session is using: last test run's target, else default) ---
SESSION_ID=$(echo "$input" | jq -r '.session_id // empty')
CRM_ORG=$(resolve_crm_org "${ROOT:-$CWD}" "$SESSION_ID")

# --- Rate limits (5-hour / 7-day usage) ---
FIVE_H=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
WEEK=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')

LIMITS=""
[ -n "$FIVE_H" ] && LIMITS="5h $(printf '%.0f' "$FIVE_H")%"
if [ -n "$WEEK" ]; then
  WEEK_FMT="7d $(printf '%.0f' "$WEEK")%"
  LIMITS="${LIMITS:+$LIMITS · }$WEEK_FMT"
fi

# --- Session objective (what this pane is doing) ---
# An explicit /rename wins; otherwise fall back to the captured objective.
OBJECTIVE=$(echo "$input" | jq -r '.session_name // empty')
if [ -z "$OBJECTIVE" ] && [ -n "$SESSION_ID" ]; then
  OBJECTIVE=$("$HOME/.local/bin/session-objective" read "$SESSION_ID" 2>/dev/null)
fi

# --- Assemble, omitting any segment whose data wasn't available ---
SEGMENTS=()
[ -n "$OBJECTIVE" ] && SEGMENTS+=("▸ $OBJECTIVE")
[ -n "$CRM_ORG" ] && SEGMENTS+=("$CRM_ORG")
[ -n "$MODEL" ] && SEGMENTS+=("$MODEL")
[ -n "$BRANCH" ] && SEGMENTS+=("$BRANCH")
[ -n "$PR_STATUS" ] && SEGMENTS+=("$PR_STATUS")
[ -n "$RELPATH" ] && SEGMENTS+=("$RELPATH")
[ -n "$LIMITS" ] && SEGMENTS+=("$LIMITS")

OUT=""
for seg in "${SEGMENTS[@]}"; do
  OUT="${OUT:+$OUT | }$seg"
done

printf "%s" "$OUT"
