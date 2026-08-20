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

MODEL_RAW=$(echo "$input" | jq -r '.model.id // .model.display_name // empty')
MODEL=$(abbreviate_model "$MODEL_RAW")

# --- Git branch (prefer worktree branch, else resolve from cwd) ---
CWD=$(echo "$input" | jq -r '.cwd // .workspace.current_dir // empty')
BRANCH=$(echo "$input" | jq -r '.worktree.branch // empty')
if [ -z "$BRANCH" ] && [ -n "$CWD" ]; then
  BRANCH=$(git -C "$CWD" rev-parse --abbrev-ref HEAD 2>/dev/null)
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

# --- Context window (null before the first API call, and again after /compact) ---
CTX_PCT=$(echo "$input" | jq -r '(.context_window.used_percentage | numbers) // empty')
CTX=""
[ -n "$CTX_PCT" ] && CTX="ctx $(printf '%.0f' "$CTX_PCT")%"

# --- Rate limits (5-hour / 7-day usage, plus time left in each window) ---
FIVE_H=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
WEEK=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
# `numbers` drops a null or non-numeric reset instead of letting floor error out
FIVE_H_AT=$(echo "$input" | jq -r '(.rate_limits.five_hour.resets_at | numbers | floor) // empty')
WEEK_AT=$(echo "$input" | jq -r '(.rate_limits.seven_day.resets_at | numbers | floor) // empty')

# Only pay for `date` when there is a reset to measure against. Bash 3.2 ships
# on macOS, so $EPOCHSECONDS is not an option here.
NOW=""
[ -n "$FIVE_H_AT$WEEK_AT" ] && NOW=$(date +%s)

# Span until an epoch reset: whole hours under a day, whole days above. Empty
# for a missing or already-elapsed reset, so the caller omits the parenthetical.
until_reset() {
  local at="$1" delta n unit
  { [ -z "$at" ] || [ -z "$NOW" ]; } && { echo ""; return; }
  delta=$(( at - NOW ))
  [ "$delta" -le 0 ] && { echo ""; return; }
  if [ "$delta" -lt 86400 ]; then
    n=$(( (delta + 1800) / 3600 )); unit="h"
  else
    n=$(( (delta + 43200) / 86400 )); unit="d"
  fi
  # a reset minutes away rounds to 0; report the floor of one unit instead
  [ "$n" -lt 1 ] && n=1
  echo "${n}${unit}"
}

LIMITS=""
if [ -n "$FIVE_H" ]; then
  LIMITS="5h $(printf '%.0f' "$FIVE_H")%"
  FIVE_H_LEFT=$(until_reset "$FIVE_H_AT")
  [ -n "$FIVE_H_LEFT" ] && LIMITS="$LIMITS ($FIVE_H_LEFT)"
fi
if [ -n "$WEEK" ]; then
  WEEK_FMT="7d $(printf '%.0f' "$WEEK")%"
  WEEK_LEFT=$(until_reset "$WEEK_AT")
  [ -n "$WEEK_LEFT" ] && WEEK_FMT="$WEEK_FMT ($WEEK_LEFT)"
  LIMITS="${LIMITS:+$LIMITS · }$WEEK_FMT"
fi

# --- Assemble, omitting any segment whose data wasn't available ---
SEGMENTS=()
[ -n "$MODEL" ] && SEGMENTS+=("$MODEL")
[ -n "$BRANCH" ] && SEGMENTS+=("$BRANCH")
[ -n "$RELPATH" ] && SEGMENTS+=("$RELPATH")
[ -n "$CTX" ] && SEGMENTS+=("$CTX")
[ -n "$LIMITS" ] && SEGMENTS+=("$LIMITS")

OUT=""
for seg in "${SEGMENTS[@]}"; do
  OUT="${OUT:+$OUT | }$seg"
done

printf "%s" "$OUT"
