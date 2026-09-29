#!/usr/bin/env bash
set -euo pipefail

# shellcheck source=scripts/background-bundles.sh
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
asset_dir="${BACKGROUND_ASSET_DIR:-$repo_root/wezterm/assets/backgrounds}"
source "$repo_root/scripts/background-bundles.sh"

fail() {
  echo "publish-backgrounds failed: $*" >&2
  exit 1
}

build_only=false
out_dir=""
bundle_filter=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-only)
      build_only=true
      out_dir="${2:?--build-only requires an output directory}"
      mkdir -p "$out_dir"
      shift 2
      ;;
    --bundle)
      bundle_filter="${2:?--bundle requires a bundle name}"
      shift 2
      ;;
    *)
      fail "unknown argument '$1'"
      ;;
  esac
done

if [[ "$build_only" != true ]]; then
  out_dir="$(mktemp -d)"
  trap 'rm -rf "$out_dir"' EXIT
fi

[[ -d "$asset_dir" ]] || fail "missing asset directory at $asset_dir"
[[ -n "$(find "$asset_dir" -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' \) -print -quit)" ]] \
  || fail "no images found in $asset_dir"

# Validate against the real repo tree only (skipped for fixture/--build-only tests).
if [[ "$asset_dir" == "$repo_root/wezterm/assets/backgrounds" ]]; then
  bash "$repo_root/scripts/check-background-assets.sh"

  manifest_dir="$repo_root/wezterm/modules/background_manifests"
  if [[ -d "$manifest_dir" ]]; then
    entries="$(grep -rhoE "'[^']*\.(png|jpg|jpeg)'" "$manifest_dir" 2>/dev/null | sed "s/^'//; s/'\$//" | sort -u)"
    # Fail if a manifest references a file that is not present.
    while IFS= read -r entry; do
      [[ -n "$entry" ]] || continue
      [[ -f "$asset_dir/$entry" ]] || fail "manifest entry '$entry' has no file in $asset_dir"
    done < <(printf '%s\n' "$entries")
    # Warn (non-fatal) on image files not referenced by any manifest.
    while IFS= read -r file; do
      rel="${file#"$asset_dir"/}"
      grep -qxF "$rel" <<< "$entries" \
        || echo "note: $rel present but not listed in any manifest" >&2
    done < <(find "$asset_dir" -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' \) | sort)
  fi
fi

bundle_count=0
while IFS='|' read -r bundle_name release_tag bundle_path _; do
  [[ -n "$bundle_name" ]] || continue
  if [[ -n "$bundle_filter" && "$bundle_name" != "$bundle_filter" ]]; then
    continue
  fi

  bundle_dir="$asset_dir/$bundle_path"
  if [[ ! -d "$bundle_dir" ]]; then
    echo "note: skipping missing bundle directory $bundle_path" >&2
    continue
  fi
  [[ -n "$(find "$bundle_dir" -type f \( -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' \) -print -quit)" ]] \
    || continue

  bundle_count=$((bundle_count + 1))
  bundle_out_dir="$out_dir/$bundle_name"
  mkdir -p "$bundle_out_dir"
  tarball="$bundle_out_dir/backgrounds.tar.gz"
  checksum="$bundle_out_dir/backgrounds.sha256"

  tar --exclude='.DS_Store' --exclude='._*' -czf "$tarball" -C "$asset_dir" "$bundle_path"
  ( cd "$bundle_out_dir" && shasum -a 256 "backgrounds.tar.gz" > "backgrounds.sha256" )

  echo "built $tarball ($(wc -c < "$tarball") bytes)"

  if [[ "$build_only" == true ]]; then
    continue
  fi

  command -v gh >/dev/null 2>&1 || fail "gh CLI is required to publish"

  if ! gh release view "$release_tag" >/dev/null 2>&1; then
    gh release create "$release_tag" \
      --title "Terminal backgrounds: $bundle_name" \
      --notes "Rolling wallpaper bundle for '$bundle_name' fetched by install-macos.sh."
  fi

  gh release upload "$release_tag" "$tarball" "$checksum" --clobber
  echo "published bundle '$bundle_name' to release '$release_tag'"
done < <(background_bundles)

(( bundle_count > 0 )) || fail "no matching wallpaper bundles found to publish"
