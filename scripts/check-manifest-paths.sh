#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest_dir="${BACKGROUND_MANIFEST_DIR:-$repo_root/wezterm/modules/background_manifests}"

fail() {
  echo "manifest path check failed: $*" >&2
  exit 1
}

[[ -d "$manifest_dir" ]] || fail "missing manifest directory at $manifest_dir"

entry_count=0
while IFS= read -r entry; do
  [[ -n "$entry" ]] || continue
  entry_count=$((entry_count + 1))

  case "$entry" in
    /*) fail "entry '$entry' must be a relative path" ;;
  esac
  case "$entry" in
    *..*) fail "entry '$entry' must not contain '..'" ;;
  esac
done < <(
  grep -rhoE "'[^']*\.(png|jpg|jpeg)'" "$manifest_dir" 2>/dev/null \
    | sed "s/^'//; s/'\$//"
)

(( entry_count > 0 )) || fail "no manifest entries found in $manifest_dir"

echo "manifest paths OK: ${entry_count} entries"
