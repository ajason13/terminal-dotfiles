# Backgrounds via GitHub Release + history reclaim

- **Date:** 2026-07-09
- **Status:** Approved (design)
- **Repo:** ajason13/wezterm-tmux-dotfiles (public)

## Problem

Wallpaper assets are committed directly to git. As of this writing `.git` is
~122 MB against ~54 MB of working-tree images - 2.2x - because ~55 commits of
binary wallpaper churn (adds, re-processing, per-image tweaks) each write a full
new blob into history that can never be reclaimed without a rewrite. The
per-total size cap has already been bumped 50 MB -> 64 MB to keep pace, which
defers rather than solves the problem. For a dotfiles repo whose purpose is to
be cloned onto new machines, clone size and time only degrade from here.

## Goals

- Stop committing wallpaper bytes to git; deliver them out-of-band.
- Reclaim the existing ~122 MB of history so `.git` returns to a few MB.
- Keep install simple on a public repo (no auth for asset download).
- Preserve graceful behavior when assets are absent (no wallpaper, never an error).

## Non-goals

- Redesigning the inbox ingestion workflow (it stays the front door for new images).
- Versioned rollback of asset bundles (a rolling release tag is acceptable; the
  user does not need old wallpaper-set versions).
- Changing which wallpapers exist or the manifest allowlist model.

## Decision summary

- **Delivery:** publish a `backgrounds.tar.gz` as a **Release asset** on the
  existing repo under a single **rolling tag `backgrounds`** (asset replaced on
  each publish). Chosen over git-LFS because LFS keeps every version against a
  1 GB free storage cap (bad fit for constant churn), needs `git lfs` on every
  machine, and meters bandwidth; Release assets have no practical cap at this
  scale, are not metered like LFS, and need no extra dependency.
- **History:** full reclaim via `git filter-repo`, force-pushed to `main`, done
  as a deliberate step *after* the delivery migration is proven working.
- **Access:** repo is public, so the installer downloads via unauthenticated
  `curl`. Publishing requires write, so it is done as the `ajason13` owner.

## Design

### 1. Repo shape after migration

- **Tracked (text-only):** all config (`wezterm/**/*.lua`, `tmux/*`), manifest
  allowlists (`wezterm/modules/background_manifests/*.lua`), inbox validation
  tooling, scripts, README.
- **Gitignored:** `wezterm/assets/backgrounds/**` (the images).
- **Delivered:** `backgrounds.tar.gz` (Release asset) containing the image tree
  (`100-vehicles/...`, `200-anime/...`) referenced by the manifests, plus a
  `backgrounds.sha256` checksum asset.

The manifests remain the source of truth for *what* exists; the tarball carries
the bytes. `backgrounds.lua` already includes only files that exist on disk and
renders no image when the set is empty, so a machine without assets shows no
wallpaper rather than erroring.

### 2. Publish flow (`scripts/publish-backgrounds.sh`, run as `ajason13`)

1. Run `check-background-assets.sh` (size/manifest sanity) against the working tree.
2. Verify every manifest entry has a matching file, and warn on files present but
   not listed in any manifest.
3. Build `backgrounds.tar.gz` from `wezterm/assets/backgrounds/`; write `backgrounds.sha256`.
4. `gh release create backgrounds` (if absent) then `gh release upload backgrounds
   backgrounds.tar.gz backgrounds.sha256 --clobber`.

### 3. Install / fetch flow (`install-macos.sh`)

New `fetch_backgrounds` step:

- Download `backgrounds.sha256` from
  `https://github.com/ajason13/wezterm-tmux-dotfiles/releases/download/backgrounds/backgrounds.sha256`.
- If it matches the local `.backgrounds-version` marker, skip (idempotent).
- Otherwise download `backgrounds.tar.gz`, verify checksum, extract into the
  target: `wezterm/assets/backgrounds/` for `--link`, or
  `~/.config/wezterm/assets/backgrounds/` for copy mode. Record the checksum in
  `.backgrounds-version`.
- **Non-fatal:** on offline/fetch failure, warn and continue; config still
  installs and wallpapers fill in on a later run.
- Flags: `--skip-backgrounds`, `--refresh-backgrounds` (force re-download).

### 4. CI changes

- `check-background-assets.sh` currently scans the in-tree images and would fail
  ("no background assets found") once they are gitignored. Move its size
  validation into `publish-backgrounds.sh`, where the files exist.
- CI retains inbox validation, shellcheck, `bash -n`, and executable checks, and
  adds a manifest well-formedness check (entries are valid relative paths).
- Any new scripts are added to the shellcheck / `bash -n` / `test -x` lists.

### 5. History rewrite (the reclaim)

1. **Back up first (non-negotiable):** `git clone --mirror` and a `git bundle`
   of the current state, stored off to the side.
2. `git filter-repo --path wezterm/assets/backgrounds/ --invert-paths` to strip
   every wallpaper blob from all history. `.git` drops to a few MB.
3. Force-push rewritten `main` to `ajason13` (owner).
4. **Re-sync the fork:** delete + re-fork `ajason14` (its history is now
   divergent) or force-push it.
5. **Re-clone everywhere:** every existing clone (all personal machines) must
   re-clone or hard-reset to the new history.

### 6. Sequencing (safe order)

1. Land the delivery migration as a normal fork -> `ajason13` PR (gitignore
   assets, `publish-backgrounds.sh`, `install-macos.sh` fetch step, CI update,
   README). Merges cleanly, no rewrite yet.
2. Publish the first `backgrounds` release; verify `install --refresh-backgrounds`
   pulls and extracts it on a machine.
3. **Only then** perform the history rewrite (step 5 above) as a separate,
   deliberate action - the one irreversible part - once delivery is proven.

## Risks and mitigations

- **Irreversible rewrite / lost data:** mirror + bundle backup before touching
  history; rewrite is sequenced last, after delivery works.
- **Fork/clone divergence after force-push:** documented re-fork + re-clone step;
  low blast radius (personal repo, few clones).
- **Assets missing on a fresh machine (offline):** fetch is non-fatal; wallpaper
  simply absent until fetched; `--refresh-backgrounds` re-pulls.
- **Rolling tag has no rollback:** accepted per non-goals; switching to dated
  tags later is a small change to the publish script and installer URL.

## Success criteria

- New commits no longer add wallpaper blobs; `wezterm/assets/backgrounds/**` is gitignored.
- A fresh `--link` or copy install on a networked machine fetches and extracts the
  wallpapers; re-running install without changes re-downloads nothing.
- CI is green with assets absent from the tree.
- After the rewrite, `.git` is a few MB and `git log` no longer contains wallpaper blobs.
