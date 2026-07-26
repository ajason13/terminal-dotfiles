#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="$repo_root/scripts/check-background-inbox.sh"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

fail() {
  echo "test failed: $*" >&2
  exit 1
}

make_case_dir() {
  local name="$1"
  local dir="$tmp_dir/$name"
  mkdir -p "$dir/_sample"
  echo "$dir"
}

run_ok() {
  local dir="$1"
  BACKGROUND_INBOX_DIR="$dir" "$script" >/dev/null
}

run_fail() {
  local dir="$1"
  local expected="$2"
  local output

  if output="$(BACKGROUND_INBOX_DIR="$dir" "$script" 2>&1)"; then
    fail "expected failure for $dir"
  fi

  printf '%s' "$output" | grep -F "$expected" >/dev/null || {
    echo "$output" >&2
    fail "expected error containing: $expected"
  }
}

empty_dir="$(make_case_dir empty)"
run_ok "$empty_dir"

valid_dir="$(make_case_dir valid)"
touch "$valid_dir/scene-001.png"
cat >"$valid_dir/scene-001.yaml" <<'EOF'
series: haikyuu
mode: stylized
EOF
run_ok "$valid_dir"

focus_dir="$(make_case_dir focus)"
touch "$focus_dir/scene-001.png"
cat >"$focus_dir/scene-001.yaml" <<'EOF'
series: haikyuu
mode: stylized
focus: >
  Keep the main character and core action. Black out the rest of the frame.
EOF
run_ok "$focus_dir"

processed_dir="$(make_case_dir processed)"
mkdir -p "$processed_dir/_processed/2026-07-08"
touch "$processed_dir/_processed/2026-07-08/scene-001.png"
cat >"$processed_dir/_processed/2026-07-08/scene-001.yaml" <<'EOF'
series: haikyuu
mode: stylized
EOF
run_ok "$processed_dir"

missing_sidecar_dir="$(make_case_dir missing-sidecar)"
touch "$missing_sidecar_dir/scene-001.png"
run_fail "$missing_sidecar_dir" "is missing sidecar"

invalid_mode_dir="$(make_case_dir invalid-mode)"
touch "$invalid_mode_dir/scene-001.png"
cat >"$invalid_mode_dir/scene-001.yaml" <<'EOF'
series: haikyuu
mode: dramatic
EOF
run_fail "$invalid_mode_dir" "invalid mode 'dramatic'"

missing_series_dir="$(make_case_dir missing-series)"
touch "$missing_series_dir/scene-001.png"
cat >"$missing_series_dir/scene-001.yaml" <<'EOF'
mode: as_is
EOF
run_fail "$missing_series_dir" "is missing series"

orphan_yaml_dir="$(make_case_dir orphan-yaml)"
cat >"$orphan_yaml_dir/scene-001.yaml" <<'EOF'
series: haikyuu
mode: as_is
EOF
run_fail "$orphan_yaml_dir" "does not have a matching image file"

overflow_dir="$(make_case_dir overflow)"
for number in $(seq -w 1 11); do
  touch "$overflow_dir/scene-${number}.png"
  cat >"$overflow_dir/scene-${number}.yaml" <<'EOF'
series: haikyuu
mode: stylized
EOF
done
run_fail "$overflow_dir" "maximum is 10 before processing"

echo "check-background-inbox tests passed"
