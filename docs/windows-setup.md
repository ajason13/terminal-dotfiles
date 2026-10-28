# Windows 10/11 with WezTerm and tmux in WSL 2

Run WezTerm as a native Windows application and tmux inside Ubuntu on WSL 2.
WezTerm keeps its fonts, colors and configuration on Windows; shells, tmux,
repositories and development tools live inside Linux. The shipped configuration
launches `wsl.exe` into the Linux user's home and attaches the most recently used
tmux session, creating `main` when no server exists.

This guide covers the terminal and tmux workflow. It does not install the optional
Neovim configuration, Codex/Claude tooling or Salesforce integrations. Do not run
`install-macos.sh` or the Brewfile for this setup.

Platform branches are covered by mocked Lua tests and tmux checks. Native Windows
and WSL execution still require the smoke checks below on your laptop.

## 1. Install Windows applications and WSL

Install [WezTerm for Windows](https://wezterm.org/install/windows.html) and
[Git for Windows](https://git-scm.com/install/windows). Install JetBrains Mono
on **Windows**, so native WezTerm can find the configured font. A Nerd Font
variant is optional; select its exact family name in `local.lua` if used.

In **PowerShell as Administrator**:

```powershell
wsl --install -d Ubuntu
```

Restart if requested, open Ubuntu and finish creating your Linux user/password.
Microsoft's [installation guide](https://learn.microsoft.com/en-us/windows/wsl/install)
requires Windows 11 or Windows 10 version 2004/build 19041 or newer for this
installation command. For Windows 10, use current Store WSL rather than an old
inbox version so `--cd` is available. See the
[WSL command reference](https://learn.microsoft.com/en-us/windows/wsl/basic-commands).

In ordinary **PowerShell**:

```powershell
wsl --update
wsl --list --verbose
```

Confirm Ubuntu is using version `2`. If necessary, run
`wsl --set-version Ubuntu 2`, using the exact distribution name from the list.
The default distribution has a `*`; optionally change it with
`wsl --set-default Ubuntu`. Verify that this opens a Linux shell in your Linux home:

```powershell
wsl --distribution Ubuntu --cd ~
```

## 2. Install tmux and helpers inside Ubuntu

Run these commands in the **Ubuntu shell**, as your normal Linux user:

```sh
sudo apt update
sudo apt install tmux git jq
tmux -V
mkdir -p ~/src
cd ~/src
git clone https://github.com/ajason13/terminal-dotfiles.git
cd terminal-dotfiles
```

Use Ubuntu 24.04 or newer with tmux 3.4 or newer for this guide. The optional
dashboard exporter requires tmux 3.7; it is outside this setup. Keep Linux work
under `~/src`, avoiding Windows/WSL line-ending and filesystem differences.

Copy the tmux configuration and helpers. GNU `cp --backup=numbered` preserves
existing destination files as numbered backups such as `.tmux.conf.~1~`:

```sh
mkdir -p ~/.local/bin
cp -a --backup=numbered tmux/tmux.conf ~/.tmux.conf
cp -a --backup=numbered tmux/tmux-llm-status ~/.local/bin/tmux-llm-status
cp -a --backup=numbered bin/tmux-session-to-end ~/.local/bin/tmux-session-to-end
export PATH="$HOME/.local/bin:$PATH"
```

Check `~/.profile` includes `~/.local/bin` on PATH. Ubuntu's default profile adds
it when that directory exists; if your profile was customized, add
`export PATH="$HOME/.local/bin:$PATH"`. New WezTerm windows start a Linux login
shell that reads this file. Keep personal tmux overrides in `~/.tmux.local.conf`;
the shared file sources it last.

`tmux-llm-status` supplies the status bar and agent picker even without optional
agent hooks. Hooks and CLIs are separate opt-ins: install and authenticate them
inside WSL, and use Linux home paths for their settings. Desktop notifications
are macOS-only by default; a custom executable can be supplied through
`TMUX_LLM_NOTIFY_CMD`. No Windows notification integration is installed here.

## 3. Install WezTerm configuration on Windows

Open a new **PowerShell** window. This uses a second checkout for native GUI
configuration, separate from your Linux tools. Git for Windows is required here.

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\src" | Out-Null
Set-Location "$env:USERPROFILE\src"
git clone https://github.com/ajason13/terminal-dotfiles.git
Set-Location terminal-dotfiles
```

For an existing checkout, enter its directory instead of cloning again. Back up
existing configuration before copying. The following block moves both existing
locations into a new timestamped backup directory, then installs clean copies:

```powershell
$configRoot = Join-Path $env:USERPROFILE '.config'
$backupRoot = Join-Path $env:USERPROFILE ('wezterm-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Force $configRoot | Out-Null
New-Item -ItemType Directory $backupRoot | Out-Null
if (Test-Path "$configRoot\wezterm") {
    Move-Item "$configRoot\wezterm" "$backupRoot\wezterm"
}
if (Test-Path "$env:USERPROFILE\.wezterm.lua") {
    Move-Item "$env:USERPROFILE\.wezterm.lua" "$backupRoot\.wezterm.lua"
}
Copy-Item -Recurse '.\wezterm' "$configRoot\wezterm"
Copy-Item '.\wezterm\.wezterm.lua' "$env:USERPROFILE\.wezterm.lua"
Write-Output "Previous configuration: $backupRoot"
```

WezTerm's [configuration search rules](https://wezterm.org/config/files.html)
support these Windows home locations. The loader uses
[`wezterm.home_dir`](https://wezterm.org/config/lua/wezterm/home_dir.html), so no
Windows `HOME` environment variable is needed. Avoid a separate `wezterm.lua`
beside `wezterm.exe` or `WEZTERM_CONFIG_FILE` override that could take precedence.

To select a specific distribution, create
`%USERPROFILE%\.config\wezterm\local.lua` (merge with existing settings if present):

```lua
return {
  wsl_distribution = 'Ubuntu', -- exact name from wsl --list --verbose
}
```

Omit `wsl_distribution` to use WSL's default. This setup invokes `wsl.exe`
directly; do not also configure `default_domain = 'WSL:...'`. If you need a font
override, add an `apply` function in the same returned table:

```lua
return {
  wsl_distribution = 'Ubuntu',
  apply = function(config, wezterm)
    config.font = wezterm.font('JetBrainsMono Nerd Font')
  end,
}
```

The repository's background manifests load on Windows too. Images are optional
and not all are stored in Git; missing images fall back to the configured color
scheme. The root [background guide](../README.md#backgrounds) describes the
optional release bundles. For this setup, images belong in the **Windows**
config's `assets/backgrounds` directory, not the WSL home. No background download
is required for tmux.

## 4. Verify on the laptop

Open native Windows WezTerm. It should start tmux in Linux, with the repository's
status bar and no visible WezTerm tab bar. Inside it:

```sh
uname -s
pwd
printf '%s\n' "$TMUX"
command -v tmux jq tmux-llm-status
tmux show-environment -g PATH
```

Expect `Linux`, your Linux home directory on first launch, a nonempty `TMUX`
value and Linux executable paths. Then check:

- `Ctrl-a c` creates a window; `Ctrl-a \` and `Ctrl-a -` split panes.
- `Ctrl-a h/j/k/l` moves between panes; `Ctrl-a s` opens the session picker.
- `Ctrl-a $` renames the session. Open another WezTerm window and confirm it
  attaches to that session instead of creating a new `main`.
- Print `printf 'WSL clipboard test\n'`, press `Ctrl-a P`, then paste into
  Notepad. Linux uses tmux's terminal clipboard escape sequence (OSC 52);
  macOS keeps `pbcopy`. Very large scrollback copies can exceed terminal limits;
  save large captures to a file with `tmux capture-pane -p -J -S - > capture.txt`.
- `Ctrl-Shift-C` / `Ctrl-Shift-V` copy/paste in WezTerm. Hold Shift while selecting
  text if tmux mouse mode intercepts dragging. `Ctrl-Shift-click` opens web links.
- `Ctrl-Shift-Space` opens Quick Select. Web targets open in your Windows browser;
  file targets are **copied to the clipboard**, with a notification. Paste the
  path into your WSL editor. Automatic tmux Neovim splits, Preview and local
  VS Code file links are not available through the Windows host configuration.
  File hyperlinks are suppressed rather than opened against the wrong filesystem.

If WezTerm exits immediately, run this in PowerShell to expose WSL/tmux errors:

```powershell
wsl --distribution Ubuntu --cd ~ --exec /bin/sh -lc 'command -v tmux; tmux -V; tmux new-session -A -s main'
```

If you see a config error, check WezTerm's debug overlay (`Ctrl-Shift-L`). Check
the distribution name and `.profile` PATH, and remove conflicting WezTerm startup
overrides. From WSL, `infocmp tmux-256color` should succeed; install Ubuntu's
`ncurses-term` package if the terminfo entry is missing.

## Updates and removal

Pull changes in **both** checkouts. Repeat the WSL copy commands to update tmux;
reload it with `Ctrl-a r`. For Windows, repeat the backup/copy block and restore
your saved `local.lua` from the printed backup directory, merging new settings
as needed. Press `Ctrl-Shift-R` to reload WezTerm; startup changes require a new
window. Preserve `~/.tmux.local.conf` and other personal files.

To remove this configuration, close WezTerm, move the installed Windows
`.config\wezterm` directory and `.wezterm.lua` aside, then restore those same
locations from your backup directory. In WSL, remove only the three copied files
(`~/.tmux.conf`, `~/.local/bin/tmux-llm-status`,
`~/.local/bin/tmux-session-to-end`) and restore their numbered backups if any.
Existing tmux servers retain loaded settings until stopped; stop them only after
finishing the work in their sessions. This does not require removing WSL, your
Linux user data or either checkout.
