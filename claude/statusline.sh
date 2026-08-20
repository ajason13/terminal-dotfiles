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

# --- Rate limits (5-hour / 7-day usage) ---
FIVE_H=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
WEEK=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')

LIMITS=""
[ -n "$FIVE_H" ] && LIMITS="5h $(printf '%.0f' "$FIVE_H")%"
if [ -n "$WEEK" ]; then
  WEEK_FMT="7d $(printf '%.0f' "$WEEK")%"
  LIMITS="${LIMITS:+$LIMITS · }$WEEK_FMT"
fi

# --- Assemble, omitting any segment whose data wasn't available ---
SEGMENTS=()
[ -n "$MODEL" ] && SEGMENTS+=("$MODEL")
[ -n "$BRANCH" ] && SEGMENTS+=("$BRANCH")
[ -n "$RELPATH" ] && SEGMENTS+=("$RELPATH")
[ -n "$LIMITS" ] && SEGMENTS+=("$LIMITS")

OUT=""
for seg in "${SEGMENTS[@]}"; do
  OUT="${OUT:+$OUT | }$seg"
done

printf "%s" "$OUT"
