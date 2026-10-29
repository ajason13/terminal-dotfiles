# Terminal backgrounds

[Back to setup and keybindings](../README.md). Commands below run from the
repository root unless a block names another location.

## Backgrounds

Background rotation is configured in:

```text
wezterm/modules/backgrounds.lua
```

To change brightness:

```lua
-- wezterm/local.lua
return {
  background_hsb = {
    brightness = 0.16,
    saturation = 0.90,
  },
}
```

To change the interval:

```lua
-- wezterm/local.lua
return {
  background_rotation_seconds = 2 * 60 * 60,
}
```

Wallpapers are delivered as split GitHub Release bundles, not committed to git.
`install-macos.sh` downloads bundle tarballs from rolling releases such as
`backgrounds-general`, `backgrounds-vehicles`, and `backgrounds-anime`, then
extracts them into the local wallpaper tree (into the repo tree for `--link`,
or `~/.config/wezterm` for copy mode). Re-runs skip a bundle only when that
bundle's published checksum is unchanged **and** its local directory is already
populated - so rerunning the installer self-heals a missing or deleted bundle.
Fetch failures are non-fatal per bundle: if one release is unreachable, install
still completes and leaves the other bundles unchanged.

- Skip the fetch: `./install-macos.sh --skip-backgrounds`
- Force a re-download: `./install-macos.sh --refresh-backgrounds`

To publish a new set (repo owner): add/update images under
`wezterm/assets/backgrounds/`, list them in the manifests, then run
`./scripts/publish-backgrounds.sh`. That publishes one tarball per configured
bundle. To publish only one bundle:

```sh
./scripts/publish-backgrounds.sh --bundle anime
```

List the relative path of any new or changed image in the relevant file under
`wezterm/modules/background_manifests`.

The background list is intentionally explicit. WezTerm does not auto-scan the
folders, so archive, experiment, or sensitive folders can exist without showing
up in rotation unless a file is added to a manifest.

Machine-local excludes are also supported:

```lua
-- wezterm/local.lua
return {
  background_excludes = {
    '200-anime/haikyuu/014-pointing-black.png',
  },
}
```

This is useful when you want to park a background temporarily without removing
it from the shared curated rotation.

## Background Inbox

For repeated wallpaper work, use the inbox workflow instead of hand-describing
the same defaults every time.

Drop screenshots into:

```text
wezterm/assets/inbox/
```

If the screenshots are still on your Desktop, use the helper to import them and
auto-create sidecars from the sample YAML:

```sh
./scripts/import-background-inbox.sh --move --series haikyuu --mode stylized --from-dir ~/Desktop
```

That command:

- moves or copies the image files into `wezterm/assets/inbox/`
- selects only top-level PNG and JPEG files from the directory (it does not
  recurse), matching extensions case-insensitively and ordering by basename in
  deterministic C/byte order
- imports the first files that fit in the remaining inbox capacity, up to 10
- creates matching `.yaml` sidecars from `_sample/scene-001.yaml`
- optionally stamps the same `series` / `mode` onto every imported file
- enforces a maximum of **10 pending images** in the inbox; process or archive
  the current batch before importing more

Useful variants:

```sh
# keep the originals on Desktop
./scripts/import-background-inbox.sh --copy ~/Desktop/'Screenshot 2026-07-15 at 9.12.01 PM.png'

# import and jump straight into editing the generated YAML files
./scripts/import-background-inbox.sh --move --series attack-on-titan --mode as_is --edit --from-dir ~/Desktop
```

Explicit image paths and directory mode support PNG and JPEG files. Directory
mode cannot be combined with explicit paths.

For each screenshot, add a sidecar YAML file with the same basename:

```text
wezterm/assets/inbox/scene-001.png
wezterm/assets/inbox/scene-001.yaml
```

Processed source screenshots can be moved into:

```text
wezterm/assets/inbox/_processed/
```

That archive is ignored by the inbox validator, so it will not stay in the
active queue.

Only two fields are required:

```yaml
series: haikyuu
mode: stylized
```

You can also add an optional `focus` field when the source frame needs tighter
direction about what to preserve, crop around, or black out.

Example:

```yaml
series: haikyuu
mode: stylized
focus: >
  Keep the yellow hair girl, orange hair boy, orange hair woman, and the man on
  her right. Keep the middle turnstiles and black out everything else.
```

Use `focus` for things like:

- which characters to keep
- which object or action is the real subject
- what background elements to preserve
- what should fall away into black negative space
- whether the scene should stay close to the frame or be more selectively reduced

Valid `mode` values are:

- `stylized`
- `as_is`

Mode meaning is intentionally narrow:

- `stylized`: closer to `200-anime/haikyuu/001` through `008`
  - darker and more transformed
  - stronger wallpaper reinterpretation
- `as_is`: closer to `200-anime/haikyuu/009` and later
  - preserve the source frame more directly
  - still apply dark/warm terminal treatment and UI cleanup

The rest is intentionally hardcoded for the current wallpaper workflow:

- `lighting`: `dark_warm`
- `notes`: terminal-background defaults

Validate the queue before asking Codex to process it:

```sh
./scripts/check-background-inbox.sh
./scripts/list-background-inbox.sh
```

Then hand off the queue with a prompt like:

```text
Process the background inbox.
```

Codex should use the inbox file, apply the default dark/warm terminal treatment,
respect any optional `focus` direction, route the output into the right
background folder for the declared series, and update the relevant manifest
file.

`./scripts/list-background-inbox.sh` is the quick preflight view. It prints the
pending inbox items, their series/mode metadata, and the inferred destination
path based on the current library numbering. If you want to override the
generated filename slug, add an optional `slug` field:

```yaml
series: haikyuu
mode: stylized
slug: tsukishima-ushijima-celebration
```

## Asset Scaling

The current scaling approach is:

- Keep rotation on an explicit allowlist rather than a pure exclude model.
- Split that allowlist into small manifest files by category or franchise.
- Keep backgrounds grouped under numeric categories, then subfolders such as
  `200-anime/haikyuu`.
- Keep individual wallpaper files at or below roughly 2.5 MiB.
- Split published wallpapers into category bundles instead of one monolithic
  release.
- Keep bundle totals within their current caps:
  - `general`: 16 MiB
  - `vehicles`: 24 MiB
  - `anime`: 200 MiB

`./scripts/publish-backgrounds.sh` enforces the current image size limits
(via `./scripts/check-background-assets.sh`) before publishing bundle releases,
so an oversized asset fails the publish rather than CI.

If the library outgrows those limits, the next step is to curate older assets
out of the repo or move larger wallpaper archives to Git LFS or external
storage, not to loosen the rotation manifest into auto-discovery.
