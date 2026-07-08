#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
background_dir="$repo_root/wezterm/assets/backgrounds"
max_file_bytes=$((2560 * 1024))
max_total_bytes=$((50 * 1024 * 1024))

fail() {
  echo "background asset check failed: $*" >&2
  exit 1
}

total_bytes=0
file_count=0
while IFS= read -r file; do
  file_count=$((file_count + 1))
  # wc -c is portable; `stat` size flags differ between macOS (-f%z) and Linux (-c%s).
  bytes=$(wc -c < "$file")
  total_bytes=$((total_bytes + bytes))
  if (( bytes > max_file_bytes )); then
    rel="${file#$repo_root/}"
    fail "$rel is ${bytes} bytes, above the ${max_file_bytes} byte limit"
  fi
done <<EOF
$(find "$background_dir" -type f \( -name '*.png' -o -name '*.jpg' \) | sort)
EOF

(( file_count > 0 )) || fail "no background assets found"

if (( total_bytes > max_total_bytes )); then
  fail "background assets total ${total_bytes} bytes, above the ${max_total_bytes} byte limit"
fi

echo "background assets OK: ${file_count} files, ${total_bytes} bytes total"
