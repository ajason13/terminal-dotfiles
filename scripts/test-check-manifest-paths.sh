#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="$repo_root/scripts/check-manifest-paths.sh"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fail() { echo "test failed: $*" >&2; exit 1; }

make_manifest() {
  local name="$1" body="$2"
  local dir="$tmp_dir/$name"
  mkdir -p "$dir"
  printf '%s\n' "$body" > "$dir/general.lua"
  printf '%s' "$dir"
}

run_ok() {
  BACKGROUND_MANIFEST_DIR="$1" "$script" >/dev/null 2>&1 \
    || fail "expected pass for $1"
}

run_fail() {
  if BACKGROUND_MANIFEST_DIR="$1" "$script" >/dev/null 2>&1; then
    fail "expected failure for $1"
  fi
}

run_ok "$(make_manifest valid "return { '100-vehicles/a.png', '200-anime/b.jpg' }")"
run_fail "$(make_manifest absolute "return { '/etc/passwd.png' }")"
run_fail "$(make_manifest dotdot "return { '../secrets/a.png' }")"
run_fail "$(make_manifest empty "return { }")"

echo "check-manifest-paths tests passed"
