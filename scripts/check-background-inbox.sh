#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
inbox_dir="${BACKGROUND_INBOX_DIR:-$repo_root/wezterm/assets/inbox}"

fail() {
  echo "background inbox check failed: $*" >&2
  exit 1
}

# shellcheck source=scripts/lib/background-inbox.sh
source "$repo_root/scripts/lib/background-inbox.sh"


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
$(inbox_images "$inbox_dir")
EOF

(( image_count <= INBOX_MAX_IMAGES )) || fail "inbox has ${image_count} image(s); maximum is ${INBOX_MAX_IMAGES} before processing"

while IFS= read -r yaml; do
  [[ -n "$yaml" ]] || continue
  base="${yaml%.yaml}"
  rel_yaml="${yaml#"$repo_root"/}"

  matched=false
  for image in "$base".*; do
    if [[ -f "$image" ]] && is_inbox_image "$image"; then matched=true; break; fi
  done
  [[ "$matched" == true ]] || fail "$rel_yaml does not have a matching image file"
done <<EOF
$(find "$inbox_dir" \
  -path "$inbox_dir/_sample" -prune -o \
  -path "$inbox_dir/_processed" -prune -o \
  -type f -iname '*.yaml' -print | sort)
EOF

echo "background inbox OK: ${image_count} image(s), defaults lighting=dark_warm notes=terminal-background defaults"
