# Starts the Next.js web app in development mode.
# Run from the repository root:  .\scripts\dev-web.ps1
$ErrorActionPreference = "Stop"
$web = Join-Path $PSScriptRoot "..\apps\web"
Push-Location $web
try {
    if (-not (Test-Path (Join-Path $web "node_modules"))) {
        Write-Host "Instalando dependências do frontend..."
        & npm install
    }
    & npm run dev
}
finally {
    Pop-Location
}
