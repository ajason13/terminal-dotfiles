#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
task_tmp="$(mktemp -d)"
trap 'rm -rf "$task_tmp"' EXIT
printf 'echo valid\n' > "$task_tmp/first.sh"
printf 'if then\n' > "$task_tmp/second.sh"
if bash "$repo_root/scripts/check-shell.sh" "$task_tmp/first.sh" "$task_tmp/second.sh" > "$task_tmp/out" 2>&1; then
  echo 'Syntax gate accepted a broken second script' >&2
  exit 1
fi
grep -qF second.sh "$task_tmp/out"
printf 'echo valid\n' > "$task_tmp/second.sh"
bash "$repo_root/scripts/check-shell.sh" "$task_tmp/first.sh" "$task_tmp/second.sh"
echo 'Shell syntax gate checks every file'
