#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="$repo_root/scripts/list-background-inbox.sh"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

fail() {
  echo "test failed: $*" >&2
  exit 1
}

inbox_dir="$tmp_dir/inbox"
asset_dir="$tmp_dir/backgrounds"

mkdir -p "$inbox_dir" "$asset_dir/100-vehicles" "$asset_dir/200-anime/haikyuu" "$asset_dir/200-anime/attack-on-titan"

touch "$asset_dir/100-vehicles/190-honda-odyssey-elite-costco-night.png"
touch "$asset_dir/200-anime/haikyuu/030-practice-bib-lineup.png"
touch "$asset_dir/200-anime/attack-on-titan/005-night-encircled-crate.png"

touch "$inbox_dir/Screenshot 2026-07-10 at 9.00.00 PM.png"
cat >"$inbox_dir/Screenshot 2026-07-10 at 9.00.00 PM.yaml" <<'EOF'
series: haikyuu
mode: stylized
focus: keep only the blocker and ball
EOF

touch "$inbox_dir/odyssey-night.png"
cat >"$inbox_dir/odyssey-night.yaml" <<'EOF'
series: vehicles
mode: as_is
slug: honda-odyssey-night-lot
EOF

output="$(BACKGROUND_INBOX_DIR="$inbox_dir" BACKGROUND_ASSET_DIR="$asset_dir" "$script")" \
  || fail "list-background-inbox should succeed"

printf '%s' "$output" | grep -F "Pending background inbox items:" >/dev/null \
  || fail "missing header"
printf '%s' "$output" | grep -F "destination: 200-anime/haikyuu/031-screenshot-2026-07-10-at-9-00-00-pm.png" >/dev/null \
  || fail "missing inferred haikyuu destination"
printf '%s' "$output" | grep -F "focus: keep only the blocker and ball" >/dev/null \
  || fail "missing focus line"
printf '%s' "$output" | grep -F "destination: 100-vehicles/200-honda-odyssey-night-lot.png" >/dev/null \
  || fail "missing explicit vehicle slug destination"

empty_inbox="$tmp_dir/empty-inbox"
mkdir -p "$empty_inbox"
empty_output="$(BACKGROUND_INBOX_DIR="$empty_inbox" BACKGROUND_ASSET_DIR="$asset_dir" "$script")" \
  || fail "empty inbox should succeed"
printf '%s' "$empty_output" | grep -F "No pending inbox items." >/dev/null \
  || fail "missing empty inbox message"

unmapped_inbox="$tmp_dir/unmapped-inbox"
mkdir -p "$unmapped_inbox"
touch "$unmapped_inbox/unknown-scene.png"
cat >"$unmapped_inbox/unknown-scene.yaml" <<'EOF'
series: mystery-show
mode: as_is
EOF
unmapped_output="$(BACKGROUND_INBOX_DIR="$unmapped_inbox" BACKGROUND_ASSET_DIR="$asset_dir" "$script")" \
  || fail "unmapped series should still list successfully"
printf '%s' "$unmapped_output" | grep -F "destination: unmapped series 'mystery-show'" >/dev/null \
  || fail "missing unmapped series destination"

echo "list-background-inbox tests passed"
