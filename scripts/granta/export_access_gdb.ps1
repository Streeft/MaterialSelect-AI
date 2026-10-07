#requires -Version 7.0
<#
.SYNOPSIS
  Lossless-ish row export for licensed Granta EduPack data.gdb (Access/Jet).

.DESCRIPTION
  Opens the database through an installed ACE/Jet OLE DB provider, enumerates
  user tables and writes:
    schema.json
    raw_manifest.json
    tables/<safe-name>.ndjson
    blobs/<sha256>.bin

  Binary columns are never coerced to text. They are emitted as sidecar files
  addressed by SHA-256. Decimal/DateTime/Guid values carry an explicit type
  marker so JSON round-trips do not silently change their meaning.

  This script never modifies the source database.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$DatabasePath,

    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-Sha256File([string]$Path) {
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-Sha256Bytes([byte[]]$Bytes) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([Convert]::ToHexString($sha.ComputeHash($Bytes))).ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function Get-SafeName([string]$Name) {
    $safe = [Regex]::Replace($Name, '[^A-Za-z0-9._-]+', '_').Trim('_')
    if ([string]::IsNullOrWhiteSpace($safe)) { $safe = "table" }
    $suffix = Get-Sha256Bytes([Text.Encoding]::UTF8.GetBytes($Name))
    return "$safe-$($suffix.Substring(0, 10))"
}

function Convert-DbValue($Value, [string]$BlobDirectory) {
    if ($null -eq $Value -or $Value -is [DBNull]) {
        return $null
    }
    if ($Value -is [byte[]]) {
        $hash = Get-Sha256Bytes $Value
        $path = Join-Path $BlobDirectory "$hash.bin"
        if (-not (Test-Path -LiteralPath $path)) {
            [IO.File]::WriteAllBytes($path, $Value)
        }
        return [ordered]@{
            '$type' = 'binary'
            sha256 = $hash
            length = $Value.Length
            sidecar = "blobs/$hash.bin"
        }
    }
    if ($Value -is [DateTime]) {
        return [ordered]@{
            '$type' = 'datetime'
            value = $Value.ToString("o", [Globalization.CultureInfo]::InvariantCulture)
        }
    }
    if ($Value -is [Decimal]) {
        return [ordered]@{
            '$type' = 'decimal'
            value = $Value.ToString([Globalization.CultureInfo]::InvariantCulture)
        }
    }
    if ($Value -is [Guid]) {
        return [ordered]@{
            '$type' = 'guid'
            value = $Value.ToString("D")
        }
    }
    return $Value
}

$source = (Resolve-Path -LiteralPath $DatabasePath).Path
$output = [IO.Path]::GetFullPath($OutputDirectory)
$tablesDir = Join-Path $output "tables"
$blobsDir = Join-Path $output "blobs"
New-Item -ItemType Directory -Force -Path $tablesDir, $blobsDir | Out-Null

$providers = @(
    "Microsoft.ACE.OLEDB.16.0",
    "Microsoft.ACE.OLEDB.12.0",
    "Microsoft.Jet.OLEDB.4.0"
)

# Some ACE installations reject the nonstandard .gdb extension even though the
# bytes are an Access database. Preserve the source and use a temporary .mdb
# filename with identical bytes only when necessary.
$tempCopy = $null
$connection = $null
$selectedProvider = $null

function Try-Open([string]$Path) {
    foreach ($provider in $providers) {
        $conn = [Data.OleDb.OleDbConnection]::new(
            "Provider=$provider;Data Source=$Path;Mode=Read;Persist Security Info=False;"
        )
        try {
            $conn.Open()
            return @{ Connection = $conn; Provider = $provider }
        }
        catch {
            $conn.Dispose()
        }
    }
    return $null
}

$opened = Try-Open $source
if ($null -eq $opened) {
    $tempCopy = Join-Path ([IO.Path]::GetTempPath()) ("granta-" + [Guid]::NewGuid() + ".mdb")
    Copy-Item -LiteralPath $source -Destination $tempCopy
    $opened = Try-Open $tempCopy
}
if ($null -eq $opened) {
    throw "Nenhum provider ACE/Jet disponível conseguiu abrir '$source'. Instale Microsoft Access Database Engine 64-bit."
}

$connection = $opened.Connection
$selectedProvider = $opened.Provider

try {
    $tablesSchema = $connection.GetOleDbSchemaTable(
        [Data.OleDb.OleDbSchemaGuid]::Tables,
        @($null, $null, $null, "TABLE")
    )
    $tableNames = @(
        $tablesSchema.Rows |
        ForEach-Object { [string]$_["TABLE_NAME"] } |
        Where-Object { $_ -and -not $_.StartsWith("MSys", [StringComparison]::OrdinalIgnoreCase) } |
        Sort-Object -Unique
    )

    $schemaOutput = [ordered]@{
        source_file = [IO.Path]::GetFileName($source)
        source_sha256 = Get-Sha256File $source
        provider = $selectedProvider
        extracted_at_utc = [DateTime]::UtcNow.ToString("o")
        tables = @()
    }
    $manifestTables = [ordered]@{}

    foreach ($tableName in $tableNames) {
        Write-Host "[granta-export] $tableName"
        $safe = Get-SafeName $tableName
        $tablePath = Join-Path $tablesDir "$safe.ndjson"

        $columnsSchema = $connection.GetOleDbSchemaTable(
            [Data.OleDb.OleDbSchemaGuid]::Columns,
            @($null, $null, $tableName, $null)
        )
        $columns = @(
            $columnsSchema.Rows |
            Sort-Object { [int]$_["ORDINAL_POSITION"] } |
            ForEach-Object {
                [ordered]@{
                    name = [string]$_["COLUMN_NAME"]
                    ordinal = [int]$_["ORDINAL_POSITION"]
                    provider_type = if ($_["DATA_TYPE"] -is [DBNull]) { $null } else { [int]$_["DATA_TYPE"] }
                    nullable = if ($_["IS_NULLABLE"] -is [DBNull]) { $null } else { [bool]$_["IS_NULLABLE"] }
                    max_length = if ($_["CHARACTER_MAXIMUM_LENGTH"] -is [DBNull]) { $null } else { [int]$_["CHARACTER_MAXIMUM_LENGTH"] }
                    precision = if ($_["NUMERIC_PRECISION"] -is [DBNull]) { $null } else { [int]$_["NUMERIC_PRECISION"] }
                    scale = if ($_["NUMERIC_SCALE"] -is [DBNull]) { $null } else { [int]$_["NUMERIC_SCALE"] }
                }
            }
        )
        $schemaOutput.tables += [ordered]@{
            name = $tableName
            export_file = "tables/$safe.ndjson"
            columns = $columns
        }

        $escapedTable = $tableName.Replace("]", "]]")
        $command = $connection.CreateCommand()
        $command.CommandText = "SELECT * FROM [$escapedTable]"
        $reader = $command.ExecuteReader()
        $writer = [IO.StreamWriter]::new(
            $tablePath,
            $false,
            [Text.UTF8Encoding]::new($false)
        )
        $rowIndex = 0
        try {
            while ($reader.Read()) {
                $rowIndex++
                $row = [ordered]@{
                    _table = $tableName
                    _row_index = $rowIndex
                    values = [ordered]@{}
                }
                for ($i = 0; $i -lt $reader.FieldCount; $i++) {
                    $name = $reader.GetName($i)
                    $row.values[$name] = Convert-DbValue $reader.GetValue($i) $blobsDir
                }
                $json = $row | ConvertTo-Json -Compress -Depth 20
                $writer.WriteLine($json)
            }
        }
        finally {
            $writer.Dispose()
            $reader.Dispose()
            $command.Dispose()
        }

        $manifestTables[$tableName] = [ordered]@{
            file = "tables/$safe.ndjson"
            rows = $rowIndex
            sha256 = Get-Sha256File $tablePath
        }
    }

    $schemaPath = Join-Path $output "schema.json"
    $schemaOutput | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath $schemaPath -Encoding utf8NoBOM

    $manifest = [ordered]@{
        format_version = 1
        source_file = [IO.Path]::GetFileName($source)
        source_sha256 = Get-Sha256File $source
        schema_sha256 = Get-Sha256File $schemaPath
        provider = $selectedProvider
        tables = $manifestTables
    }
    $manifestPath = Join-Path $output "raw_manifest.json"
    $manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $manifestPath -Encoding utf8NoBOM

    Write-Host "[granta-export] concluído: $($tableNames.Count) tabelas"
    Write-Host "[granta-export] source sha256: $($manifest.source_sha256)"
}
finally {
    if ($null -ne $connection) { $connection.Dispose() }
    if ($null -ne $tempCopy -and (Test-Path -LiteralPath $tempCopy)) {
        Remove-Item -LiteralPath $tempCopy -Force
    }
}
