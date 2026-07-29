#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="$repo_root/scripts/import-background-inbox.sh"
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
sample_dir="$inbox_dir/_sample"
source_dir="$tmp_dir/source"
mkdir -p "$sample_dir" "$source_dir"

cat >"$sample_dir/scene-001.yaml" <<'EOF'
series: haikyuu
mode: stylized
focus: >
  Keep the main character and the core action silhouette.
EOF

touch "$source_dir/scene-a.png"
touch "$source_dir/scene-b.jpg"

output="$(
  BACKGROUND_INBOX_DIR="$inbox_dir" \
  BACKGROUND_INBOX_SAMPLE_YAML="$sample_dir/scene-001.yaml" \
  "$script" --copy --series attack-on-titan --mode as_is \
  "$source_dir/scene-a.png" "$source_dir/scene-b.jpg"
)" || fail "copy import should succeed"

[[ -f "$source_dir/scene-a.png" ]] || fail "copy mode should keep source image"
[[ -f "$inbox_dir/scene-a.png" ]] || fail "missing copied scene-a.png"
[[ -f "$inbox_dir/scene-a.yaml" ]] || fail "missing scene-a.yaml"
[[ -f "$inbox_dir/scene-b.jpg" ]] || fail "missing copied scene-b.jpg"
[[ -f "$inbox_dir/scene-b.yaml" ]] || fail "missing scene-b.yaml"

grep -F "series: attack-on-titan" "$inbox_dir/scene-a.yaml" >/dev/null \
  || fail "series override missing from scene-a.yaml"
grep -F "mode: as_is" "$inbox_dir/scene-a.yaml" >/dev/null \
  || fail "mode override missing from scene-a.yaml"
grep -F "Imported 2 image(s)" <<<"$output" >/dev/null \
  || fail "missing import summary"

touch "$source_dir/scene-c.jpeg"
move_output="$(
  BACKGROUND_INBOX_DIR="$inbox_dir" \
  BACKGROUND_INBOX_SAMPLE_YAML="$sample_dir/scene-001.yaml" \
  "$script" --move "$source_dir/scene-c.jpeg"
)" || fail "move import should succeed"

[[ ! -f "$source_dir/scene-c.jpeg" ]] || fail "move mode should remove source image"
[[ -f "$inbox_dir/scene-c.jpeg" ]] || fail "missing moved scene-c.jpeg"
[[ -f "$inbox_dir/scene-c.yaml" ]] || fail "missing scene-c.yaml"
grep -F "series: haikyuu" "$inbox_dir/scene-c.yaml" >/dev/null \
  || fail "sample series should be preserved when no override is given"
grep -F "mode: stylized" "$inbox_dir/scene-c.yaml" >/dev/null \
  || fail "sample mode should be preserved when no override is given"
grep -F "./scripts/check-background-inbox.sh" <<<"$move_output" >/dev/null \
  || fail "missing next-step hint"

directory_inbox="$tmp_dir/directory-inbox"
directory_source="$tmp_dir/directory-source"
mkdir -p "$directory_inbox" "$directory_source/nested"
for number in $(seq -w 1 12); do
  touch "$directory_source/scene-${number}.png"
done
touch "$directory_source/ignored.jpg"
touch "$directory_source/ignored.PNG"
touch "$directory_source/nested/scene-00.png"

directory_output="$(
  BACKGROUND_INBOX_DIR="$directory_inbox" \
  BACKGROUND_INBOX_SAMPLE_YAML="$sample_dir/scene-001.yaml" \
  "$script" --copy --series initial-d --mode stylized --from-dir "$directory_source"
)" || fail "directory import should succeed"

for number in $(seq -w 1 10); do
  [[ -f "$directory_inbox/scene-${number}.png" ]] \
    || fail "directory import missing scene-${number}.png"
  [[ -f "$directory_inbox/scene-${number}.yaml" ]] \
    || fail "directory import missing scene-${number}.yaml"
done
[[ ! -e "$directory_inbox/scene-11.png" ]] \
  || fail "directory import should stop at 10 images"
[[ ! -e "$directory_inbox/scene-12.png" ]] \
  || fail "directory import should stop at 10 images"
[[ ! -e "$directory_inbox/ignored.jpg" ]] \
  || fail "directory import should ignore JPEG files"
[[ ! -e "$directory_inbox/ignored.PNG" ]] \
  || fail "directory import should match lowercase *.png only"
[[ ! -e "$directory_inbox/scene-00.png" ]] \
  || fail "directory import should not recurse"
grep -F "Imported 10 image(s)" <<<"$directory_output" >/dev/null \
  || fail "directory import summary should report 10 images"

capacity_inbox="$tmp_dir/capacity-inbox"
capacity_source="$tmp_dir/capacity-source"
mkdir -p "$capacity_inbox" "$capacity_source"
for number in $(seq -w 1 8); do
  touch "$capacity_inbox/existing-${number}.png"
done
touch "$capacity_source/a.png"
touch "$capacity_source/b.png"
touch "$capacity_source/c.png"

capacity_output="$(
  BACKGROUND_INBOX_DIR="$capacity_inbox" \
  BACKGROUND_INBOX_SAMPLE_YAML="$sample_dir/scene-001.yaml" \
  "$script" --copy --from-dir "$capacity_source"
)" || fail "directory import should respect remaining capacity"

[[ -f "$capacity_inbox/a.png" ]] || fail "remaining-capacity import missing a.png"
[[ -f "$capacity_inbox/b.png" ]] || fail "remaining-capacity import missing b.png"
[[ ! -e "$capacity_inbox/c.png" ]] || fail "remaining-capacity import should not include c.png"
grep -F "Imported 2 image(s)" <<<"$capacity_output" >/dev/null \
  || fail "remaining-capacity summary should report 2 images"

empty_source="$tmp_dir/empty-source"
mkdir -p "$empty_source"
if BACKGROUND_INBOX_DIR="$inbox_dir" \
  BACKGROUND_INBOX_SAMPLE_YAML="$sample_dir/scene-001.yaml" \
  "$script" --copy --from-dir "$empty_source" >/dev/null 2>&1; then
  fail "directory import without lowercase PNG files should fail"
fi

if BACKGROUND_INBOX_DIR="$inbox_dir" \
  BACKGROUND_INBOX_SAMPLE_YAML="$sample_dir/scene-001.yaml" \
  "$script" --copy --from-dir "$source_dir" "$source_dir/scene-a.png" >/dev/null 2>&1; then
  fail "directory import combined with explicit paths should fail"
fi

touch "$source_dir/not-image.txt"
if BACKGROUND_INBOX_DIR="$inbox_dir" \
  BACKGROUND_INBOX_SAMPLE_YAML="$sample_dir/scene-001.yaml" \
  "$script" "$source_dir/not-image.txt" >/dev/null 2>&1; then
  fail "non-image input should fail"
fi

touch "$source_dir/scene-a.png"
if BACKGROUND_INBOX_DIR="$inbox_dir" \
  BACKGROUND_INBOX_SAMPLE_YAML="$sample_dir/scene-001.yaml" \
  "$script" --copy "$source_dir/scene-a.png" >/dev/null 2>&1; then
  fail "duplicate destination should fail"
fi

for number in $(seq -w 1 7); do
  touch "$inbox_dir/existing-${number}.png"
done
touch "$source_dir/overflow.png"
if BACKGROUND_INBOX_DIR="$inbox_dir" \
  BACKGROUND_INBOX_SAMPLE_YAML="$sample_dir/scene-001.yaml" \
  "$script" --move "$source_dir/overflow.png" >"$tmp_dir/overflow-output" 2>&1; then
  fail "import over the maximum should fail"
fi
grep -F "would exceed the maximum of 10" "$tmp_dir/overflow-output" >/dev/null \
  || fail "missing overflow error"
[[ -f "$source_dir/overflow.png" ]] || fail "overflow rejection should not move source image"

echo "import-background-inbox tests passed"
