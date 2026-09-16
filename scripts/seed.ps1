# Applies migrations and loads demonstration data into the backend database.
# Run from the repository root:  .\scripts\seed.ps1
$ErrorActionPreference = "Stop"
$api = Join-Path $PSScriptRoot "..\apps\api"
$py = Join-Path $api ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Error "Ambiente virtual não encontrado. Rode a instalação do backend primeiro (ver README)."
}
Push-Location $api
try {
    & $py -m alembic upgrade head
    & $py -m app.db.seed
}
finally {
    Pop-Location
}
