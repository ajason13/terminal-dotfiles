#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=scripts/background-bundles.sh
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$repo_root/scripts/background-bundles.sh"
base_url_prefix="${BACKGROUNDS_BASE_URL_PREFIX:-https://github.com/ajason13/terminal-dotfiles/releases/download}"

dest=""
refresh=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dest) dest="${2:?--dest requires a path}"; shift 2 ;;
    --refresh) refresh=true; shift ;;
    *) echo "fetch-backgrounds: unknown argument '$1'" >&2; exit 2 ;;
  esac
done

[[ -n "$dest" ]] || { echo "fetch-backgrounds: --dest is required" >&2; exit 2; }

warn() { echo "fetch-backgrounds: $*" >&2; }

# True when the specific bundle path exists and holds at least one file. The
# marker alone is not authoritative: if the wallpaper tree was deleted the
# install must self-heal.
bundle_populated() {
  [[ -d "$1" ]] && [[ -n "$(find "$1" -type f -print -quit 2>/dev/null)" ]]
}

mkdir -p "$dest"

updated_any=false
while IFS='|' read -r bundle_name release_tag bundle_path _; do
  [[ -n "$bundle_name" ]] || continue
  base_url="$base_url_prefix/$release_tag"
  marker="$(dirname "$dest")/.backgrounds-version-$bundle_name"
  remote_sha="$(curl -fsSL "$base_url/backgrounds.sha256" 2>/dev/null || true)"
  if [[ -z "$remote_sha" ]]; then
    warn "could not fetch checksum for bundle '$bundle_name' from $base_url; leaving it unchanged"
    continue
  fi

  if [[ "$refresh" != true && -f "$marker" && "$(cat "$marker")" == "$remote_sha" ]] && bundle_populated "$dest/$bundle_path"; then
    echo "background bundle '$bundle_name' already up to date"
    continue
  fi

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  if ! curl -fsSL "$base_url/backgrounds.tar.gz" -o "$tmp/backgrounds.tar.gz"; then
    warn "could not download tarball for bundle '$bundle_name' from $base_url; leaving it unchanged"
    rm -rf "$tmp"
    continue
  fi

  got="$(shasum -a 256 "$tmp/backgrounds.tar.gz" | awk '{print $1}')"
  if [[ "$got" != "${remote_sha%% *}" ]]; then
    warn "checksum mismatch for bundle '$bundle_name'; leaving it unchanged"
    rm -rf "$tmp"
    continue
  fi

  tar -xzf "$tmp/backgrounds.tar.gz" -C "$dest"
  printf '%s\n' "$remote_sha" > "$marker"
  rm -rf "$tmp"
  updated_any=true
  echo "background bundle '$bundle_name' updated"
done < <(background_bundles)

if [[ "$updated_any" != true ]]; then
  echo "background bundles unchanged"
fi
