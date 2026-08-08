#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
inbox_dir="${BACKGROUND_INBOX_DIR:-$repo_root/wezterm/assets/inbox}"
sample_yaml="${BACKGROUND_INBOX_SAMPLE_YAML:-$inbox_dir/_sample/scene-001.yaml}"
max_images=10
copy_mode="move"
series=""
mode=""
edit_after=0
from_dir=""

fail() {
  echo "background inbox import failed: $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage:
  ./scripts/import-background-inbox.sh [--move|--copy] [--series NAME] [--mode stylized|as_is] [--edit] IMAGE...
  ./scripts/import-background-inbox.sh [--move|--copy] [--series NAME] [--mode stylized|as_is] [--edit] --from-dir DIR

Examples:
  ./scripts/import-background-inbox.sh --move --series haikyuu --mode stylized --from-dir ~/Desktop
  ./scripts/import-background-inbox.sh --copy ~/Desktop/'Screenshot 2026-07-15 at 9.12.01 PM.png'

Directory mode scans top-level PNG and JPEG files (not subdirectories), orders
matches by basename in C/byte order, and imports up to the inbox's remaining
10-image capacity.
EOF
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

set_yaml_value() {
  local file="$1"
  local key="$2"
  local value="$3"

  if grep -q "^${key}:" "$file"; then
    perl -0pi -e "s/^${key}:[^\n]*\$/${key}: ${value}/m" "$file"
  else
    printf '%s: %s\n' "$key" "$value" >>"$file"
  fi
}

image_paths=()
while (( $# > 0 )); do
  case "$1" in
    --move)
      copy_mode="move"
      ;;
    --copy)
      copy_mode="copy"
      ;;
    --series)
      shift
      [[ $# -gt 0 ]] || fail "--series requires a value"
      series="$1"
      ;;
    --mode)
      shift
      [[ $# -gt 0 ]] || fail "--mode requires a value"
      mode="$1"
      ;;
    --edit)
      edit_after=1
      ;;
    --from-dir)
      shift
      [[ $# -gt 0 ]] || fail "--from-dir requires a value"
      [[ -z "$from_dir" ]] || fail "--from-dir may only be specified once"
      from_dir="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while (( $# > 0 )); do
        image_paths+=("$1")
        shift
      done
      break
      ;;
    -*)
      fail "unknown option: $1"
      ;;
    *)
      image_paths+=("$1")
      ;;
  esac
  shift
done

[[ -d "$inbox_dir" ]] || fail "missing inbox directory at $inbox_dir"
[[ -f "$sample_yaml" ]] || fail "missing sample YAML at $sample_yaml"
if [[ -n "$from_dir" ]]; then
  (( ${#image_paths[@]} == 0 )) || fail "--from-dir cannot be combined with explicit image paths"
  [[ -d "$from_dir" ]] || fail "missing source directory: $from_dir"
else
  (( ${#image_paths[@]} > 0 )) || fail "no image paths provided"
fi

case "$mode" in
  ""|stylized|as_is) ;;
  *) fail "invalid mode '$mode' (expected stylized or as_is)" ;;
esac

existing_image_count="$(find "$inbox_dir" \
  -path "$inbox_dir/_sample" -prune -o \
  -path "$inbox_dir/_processed" -prune -o \
  -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \) -print | wc -l | tr -d '[:space:]')"

if [[ -n "$from_dir" ]]; then
  remaining_capacity=$((max_images - existing_image_count))
  (( remaining_capacity > 0 )) || fail "inbox already has the maximum of ${max_images} image(s)"

  directory_images=()
  while IFS= read -r image; do
    directory_images+=("$image")
  done < <(
    find "$from_dir" -maxdepth 1 -type f \
      \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \) -print |
      LC_ALL=C sort
  )
  (( ${#directory_images[@]} > 0 )) || \
    fail "no PNG or JPEG files found in directory: $from_dir"

  selection_count="${#directory_images[@]}"
  if (( selection_count > remaining_capacity )); then
    selection_count="$remaining_capacity"
  fi
  for (( index = 0; index < selection_count; index++ )); do
    image_paths+=("${directory_images[$index]}")
  done
fi

incoming_image_count="${#image_paths[@]}"

(( existing_image_count + incoming_image_count <= max_images )) || \
  fail "inbox has ${existing_image_count} image(s); importing ${incoming_image_count} would exceed the maximum of ${max_images}"

imported_yamls=()
count=0
for source in "${image_paths[@]}"; do
  [[ -f "$source" ]] || fail "missing image file: $source"

  case "${source##*.}" in
    png|PNG|jpg|JPG|jpeg|JPEG) ;;
    *) fail "unsupported image type: $source" ;;
  esac

  base_name="$(basename "$source")"
  dest_image="$inbox_dir/$base_name"
  dest_yaml="${dest_image%.*}.yaml"

  [[ "$source" != "$dest_image" ]] || fail "source is already in inbox: $source"
  [[ ! -e "$dest_image" ]] || fail "destination image already exists: $dest_image"
  [[ ! -e "$dest_yaml" ]] || fail "destination YAML already exists: $dest_yaml"

  if [[ "$copy_mode" == "move" ]]; then
    mv "$source" "$dest_image"
  else
    cp "$source" "$dest_image"
  fi

  cp "$sample_yaml" "$dest_yaml"

  if [[ -n "$series" ]]; then
    set_yaml_value "$dest_yaml" "series" "$series"
  fi

  if [[ -n "$mode" ]]; then
    set_yaml_value "$dest_yaml" "mode" "$mode"
  fi

  imported_yamls+=("$dest_yaml")
  count=$((count + 1))
done

printf 'Imported %d image(s) into %s\n' "$count" "$inbox_dir"
for yaml in "${imported_yamls[@]}"; do
  rel_yaml="${yaml#"$repo_root"/}"
  current_series="$(yaml_value series "$yaml")"
  current_mode="$(yaml_value mode "$yaml")"
  printf -- '- %s' "$rel_yaml"
  if [[ -n "$current_series" || -n "$current_mode" ]]; then
    printf ' (series=%s mode=%s)' "${current_series:-unset}" "${current_mode:-unset}"
  fi
  printf '\n'
done

if (( edit_after == 1 )); then
  editor="${EDITOR:-nvim}"
  exec "$editor" "${imported_yamls[@]}"
fi

cat <<'EOF'

Next:
  ./scripts/check-background-inbox.sh
  ./scripts/list-background-inbox.sh
EOF
