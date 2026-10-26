#!/usr/bin/env bash
# The inbox uses simple top-level YAML scalar fields, not a general YAML parser.
# Shared with the import and validation entry points.
# shellcheck disable=SC2034
INBOX_MAX_IMAGES=10

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


inbox_images() {
  local dir="$1"
  find "$dir" -path "$dir/_sample" -prune -o -path "$dir/_processed" -prune -o \
    -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \) -print | LC_ALL=C sort
}

is_inbox_image() {
  case "$(printf '%s' "${1##*.}" | tr '[:upper:]' '[:lower:]')" in
    png|jpg|jpeg) return 0 ;;
    *) return 1 ;;
  esac
}
