#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
inbox_dir="${BACKGROUND_INBOX_DIR:-$repo_root/wezterm/assets/inbox}"
max_images=10

fail() {
  echo "background inbox check failed: $*" >&2
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

[[ -d "$inbox_dir" ]] || fail "missing inbox directory at $inbox_dir"

image_count=0
yaml_count=0

while IFS= read -r image; do
  [[ -n "$image" ]] || continue
  image_count=$((image_count + 1))
  yaml="${image%.*}.yaml"
  rel_image="${image#"$repo_root"/}"

  [[ -f "$yaml" ]] || fail "$rel_image is missing sidecar ${yaml#"$repo_root"/}"

  yaml_count=$((yaml_count + 1))
  series="$(yaml_value series "$yaml")"
  mode="$(yaml_value mode "$yaml")"

  [[ -n "$series" ]] || fail "${yaml#"$repo_root"/} is missing series"
  [[ -n "$mode" ]] || fail "${yaml#"$repo_root"/} is missing mode"

  case "$mode" in
    stylized|as_is) ;;
    *) fail "${yaml#"$repo_root"/} has invalid mode '$mode' (expected stylized or as_is)" ;;
  esac
done <<EOF
$(find "$inbox_dir" \
  -path "$inbox_dir/_sample" -prune -o \
  -path "$inbox_dir/_processed" -prune -o \
  -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \) -print | sort)
EOF

(( image_count <= max_images )) || fail "inbox has ${image_count} image(s); maximum is ${max_images} before processing"

while IFS= read -r yaml; do
  [[ -n "$yaml" ]] || continue
  base="${yaml%.yaml}"
  rel_yaml="${yaml#"$repo_root"/}"

  if [[ ! -f "${base}.png" && ! -f "${base}.jpg" && ! -f "${base}.jpeg" ]]; then
    fail "$rel_yaml does not have a matching image file"
  fi
done <<EOF
$(find "$inbox_dir" \
  -path "$inbox_dir/_sample" -prune -o \
  -path "$inbox_dir/_processed" -prune -o \
  -type f -iname '*.yaml' -print | sort)
EOF

echo "background inbox OK: ${image_count} image(s), defaults lighting=dark_warm notes=terminal-background defaults"
