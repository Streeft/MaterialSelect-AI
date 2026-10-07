#requires -Version 7.0
<#
.SYNOPSIS
  Export every Granta data.gdb found under one database root.

.DESCRIPTION
  Recursively discovers data.gdb files, calls export_access_gdb.ps1 for each
  database and writes one top-level inventory with the source SHA-256, byte size
  and relative output path. The source tree is never modified.

  Example:
    pwsh scripts/granta/export_all_databases.ps1 `
      -DatabaseRoot "C:\Program Files\ANSYS Inc\v252\edupack\database" `
      -OutputRoot "D:\granta-raw-export"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DatabaseRoot,

    [Parameter(Mandatory = $true)]
    [string]$OutputRoot
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root = (Resolve-Path -LiteralPath $DatabaseRoot).Path
$output = [IO.Path]::GetFullPath($OutputRoot)
$singleExporter = Join-Path $PSScriptRoot "export_access_gdb.ps1"

if (-not (Test-Path -LiteralPath $singleExporter)) {
    throw "export_access_gdb.ps1 não encontrado ao lado deste script."
}

New-Item -ItemType Directory -Force -Path $output | Out-Null

$databases = @(
    Get-ChildItem -LiteralPath $root -Recurse -File -Filter "data.gdb" |
    Sort-Object FullName
)

if ($databases.Count -eq 0) {
    throw "Nenhum data.gdb encontrado em '$root'."
}

$inventory = [ordered]@{
    format_version = 1
    database_root = $root
    generated_at_utc = [DateTime]::UtcNow.ToString("o")
    database_count = $databases.Count
    total_source_bytes = [int64]0
    databases = @()
}

foreach ($database in $databases) {
    $relativeParent = [IO.Path]::GetRelativePath($root, $database.DirectoryName)
    $safeRelative = $relativeParent -replace '[<>:"/\\|?*]', '_'
    if ([string]::IsNullOrWhiteSpace($safeRelative) -or $safeRelative -eq ".") {
        $safeRelative = "root"
    }
    $databaseOutput = Join-Path $output $safeRelative

    Write-Host "[granta-export-all] $relativeParent\data.gdb"
    & $singleExporter -DatabasePath $database.FullName -OutputDirectory $databaseOutput

    $sourceHash = (Get-FileHash -LiteralPath $database.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    $rawManifest = Join-Path $databaseOutput "raw_manifest.json"
    if (-not (Test-Path -LiteralPath $rawManifest)) {
        throw "Export de '$($database.FullName)' não produziu raw_manifest.json."
    }

    $inventory.total_source_bytes += [int64]$database.Length
    $inventory.databases += [ordered]@{
        relative_source = ([IO.Path]::GetRelativePath($root, $database.FullName) -replace "\\", "/")
        source_bytes = [int64]$database.Length
        source_sha256 = $sourceHash
        output_directory = ([IO.Path]::GetRelativePath($output, $databaseOutput) -replace "\\", "/")
        raw_manifest = (
            [IO.Path]::GetRelativePath($output, $rawManifest) -replace "\\", "/"
        )
    }
}

$inventoryPath = Join-Path $output "database_inventory.json"
$inventory | ConvertTo-Json -Depth 10 |
    Set-Content -LiteralPath $inventoryPath -Encoding utf8NoBOM

Write-Host "[granta-export-all] $($databases.Count) bancos exportados."
Write-Host "[granta-export-all] bytes de origem: $($inventory.total_source_bytes)"
Write-Host "[granta-export-all] inventário: $inventoryPath"
