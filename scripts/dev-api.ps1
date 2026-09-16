# Starts the backend API with autoreload.
# Run from the repository root:  .\scripts\dev-api.ps1
$ErrorActionPreference = "Stop"
$api = Join-Path $PSScriptRoot "..\apps\api"
$py = Join-Path $api ".venv\Scripts\python.exe"
if (-not (Test-Path $py)) {
    Write-Error "Ambiente virtual não encontrado. Rode a instalação do backend primeiro (ver README)."
}
Push-Location $api
try {
    & $py -m uvicorn app.main:app --reload --port 8000
}
finally {
    Pop-Location
}
