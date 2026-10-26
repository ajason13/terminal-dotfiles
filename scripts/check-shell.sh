#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
lint=false
if [[ "${1:-}" == --lint ]]; then lint=true; shift; fi
files=()
if (( $# )); then
  files=("$@")
else
  while IFS= read -r -d '' file; do
    [[ -f "$file" ]] || continue
    if [[ "$file" == *.sh ]] || head -n 1 "$file" | grep -qE '^#!.*bash'; then
      files+=("$file")
    fi
  done < <(git ls-files --cached --others --exclude-standard -z)
fi
(( ${#files[@]} > 0 )) || { echo 'No shell scripts found' >&2; exit 1; }
if [[ "$lint" == true ]]; then
  shellcheck -x -P "$repo_root" "${files[@]}"
else
  for file in "${files[@]}"; do bash -n "$file"; done
fi
