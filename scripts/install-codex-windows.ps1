[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$DestinationHome = $env:USERPROFILE
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$destinationRoot = [IO.Path]::GetFullPath($DestinationHome)
if (-not (Test-Path -LiteralPath $destinationRoot -PathType Container)) {
    throw "Destination home must already exist: $destinationRoot"
}
$backupRoot = Join-Path $destinationRoot ('.codex\setup-backups\' + [guid]::NewGuid().ToString('N'))
$targets = @(@{ Source = Join-Path $repoRoot 'codex\AGENTS.md'; Relative = '.codex\AGENTS.md' })
foreach ($skill in Get-ChildItem -LiteralPath (Join-Path $repoRoot 'codex\skills') -Directory) {
    if (Test-Path -LiteralPath (Join-Path $skill.FullName 'SKILL.md') -PathType Leaf) {
        $targets += @{ Source = $skill.FullName; Relative = ".agents\skills\$($skill.Name)" }
    }
}

function Get-ContentInventory([string]$Path) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
        return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    }
    $root = (Get-Item -LiteralPath $Path).FullName
    return ((Get-ChildItem -LiteralPath $root -File -Recurse | Sort-Object FullName | ForEach-Object {
        $_.FullName.Substring($root.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }) -join "`n")
}

foreach ($target in $targets) {
    $destination = Join-Path $destinationRoot $target.Relative
    # Do not follow an existing redirected destination or parent during installation.
    $ancestor = $destination
    while ($ancestor -and $ancestor.Length -ge $destinationRoot.Length) {
        if (Test-Path -LiteralPath $ancestor) {
            if ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing redirected path: $ancestor. Resolve the existing link before installing."
            }
        }
        $ancestor = Split-Path $ancestor -Parent
    }
    if ((Test-Path -LiteralPath $destination) -and
        (Get-ContentInventory $target.Source) -ceq (Get-ContentInventory $destination)) {
        Write-Output "Unchanged: $($target.Relative)"
        continue
    }
    if ($PSCmdlet.ShouldProcess($destination, 'Back up existing target and install Codex workflow')) {
        if (Test-Path -LiteralPath $destination) {
            $backup = Join-Path $backupRoot $target.Relative
            New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
            Move-Item -LiteralPath $destination -Destination $backup
            Write-Output "Backup: $backup"
        }
        New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $target.Source -Destination $destination -Recurse
        if ((Get-ContentInventory $target.Source) -cne (Get-ContentInventory $destination)) {
            throw "Installed content differs from source: $destination"
        }
        Write-Output "Installed: $($target.Relative)"
    }
}
Write-Output 'Existing config.toml, plugins, credentials, project instructions, and terminal settings were preserved.'
Write-Output 'Open a fresh Codex app chat to load the shared instructions and skills.'
