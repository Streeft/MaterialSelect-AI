# Deletes every fictional/demo material (is_demo=True) — irreversible.
# Run from the repository root:  .\scripts\clear-demo.ps1
# See docs/15-dados-demonstrativos.md before running this against produção.
$ErrorActionPreference = "Stop"
$api = Join-Path $PSScriptRoot "..\apps\api"
$py = Join-Path $api ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Error "Ambiente virtual não encontrado. Rode a instalação do backend primeiro (ver README)."
}
Push-Location $api
try {
    & $py -m app.db.clear_demo
}
finally {
    Pop-Location
}
