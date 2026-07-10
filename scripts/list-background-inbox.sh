#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
inbox_dir="${BACKGROUND_INBOX_DIR:-$repo_root/wezterm/assets/inbox}"
background_dir="${BACKGROUND_ASSET_DIR:-$repo_root/wezterm/assets/backgrounds}"
check_script="$repo_root/scripts/check-background-inbox.sh"

fail() {
  echo "background inbox list failed: $*" >&2
  exit 1
}

trim() {
  printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

yaml_value() {
  local key="$1"
  local file="$2"
  local value
  value="$(sed -n "s/^${key}:[[:space:]]*//p" "$file" | head -n 1)"
  trim "$value"
}

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9]/-/g; s/-\{2,\}/-/g; s/^-//; s/-$//'
}

series_slug() {
  slugify "$1"
}

series_dir() {
  local series="$1"
  local slug
  slug="$(series_slug "$series")"

  case "$slug" in
    general) printf '%s\n' "$background_dir/000-general" ;;
    vehicles) printf '%s\n' "$background_dir/100-vehicles" ;;
    *)
      if [[ -d "$background_dir/200-anime/$slug" ]]; then
        printf '%s\n' "$background_dir/200-anime/$slug"
      elif [[ -d "$background_dir/$slug" ]]; then
        printf '%s\n' "$background_dir/$slug"
      else
        return 1
      fi
      ;;
  esac
}

next_slot() {
  local dir="$1"
  local max=0
  local step=1

  [[ "$dir" == "$background_dir/100-vehicles" ]] && step=10

  while IFS= read -r file; do
    [[ -n "$file" ]] || continue
    name="$(basename "$file")"
    num="${name%%-*}"
    [[ "$num" =~ ^[0-9]+$ ]] || continue
    value=$((10#$num))
    (( value > max )) && max=$value
  done <<EOF
$(find "$dir" -maxdepth 1 -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' \) | sort)
EOF

  printf '%03d\n' $((max + step))
}

"$check_script" >/dev/null

[[ -d "$background_dir" ]] || fail "missing backgrounds directory at $background_dir"

printf 'Pending background inbox items:\n'
printf '\n'

count=0
while IFS= read -r image; do
  [[ -n "$image" ]] || continue
  count=$((count + 1))

  yaml="${image%.*}.yaml"
  rel_image="${image#"$repo_root"/}"
  series="$(yaml_value series "$yaml")"
  mode="$(yaml_value mode "$yaml")"
  focus="$(yaml_value focus "$yaml")"
  slug="$(yaml_value slug "$yaml")"

  dir="$(series_dir "$series" 2>/dev/null || true)"
  if [[ -z "$dir" ]]; then
    destination="unmapped series '$series'"
  else
    slot="$(next_slot "$dir")"
    if [[ -z "$slug" ]]; then
      source_name="$(basename "${image%.*}")"
      slug="$(slugify "$source_name")"
      [[ -n "$slug" ]] || slug="pending-name"
    fi
    destination="${dir#"$background_dir"/}/$slot-$slug.png"
  fi

  printf '%d. %s\n' "$count" "$rel_image"
  printf '   series: %s\n' "$series"
  printf '   mode: %s\n' "$mode"
  printf '   destination: %s\n' "$destination"
  if [[ -n "$focus" ]]; then
    printf '   focus: %s\n' "$focus"
  fi
done <<EOF
$(find "$inbox_dir" \
  -path "$inbox_dir/_sample" -prune -o \
  -path "$inbox_dir/_processed" -prune -o \
  -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \) -print | sort)
EOF

if (( count == 0 )); then
  printf 'No pending inbox items.\n'
fi
