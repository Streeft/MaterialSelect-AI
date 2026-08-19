# Makes the CI checks required for `main` on GitHub.
#
# `.github/workflows/ci.yml` already runs on every pull request, but a green
# check that nobody has to wait for is a convention, not a gate: a merge with
# red CI still goes through. This script applies the repository ruleset that
# turns it into a refusal from GitHub itself.
#
# This works because the repository is PUBLIC. Protected branches and rulesets
# do not exist for *private* repositories on GitHub Free: both
# `PUT /branches/main/protection` and `POST /rulesets` answer 403 ("Upgrade to
# GitHub Pro or make this repository public"). Making the repository private
# again disarms the gate and this script starts failing — see D-22 in
# docs/DECISIONS.md for the decision and what it cost.
#
# Run this again after touching ci.yml. The ruleset requires a fixed list of
# names, so a job that is not on the list runs, shows red on the pull request
# and DOES NOT block the merge — which looks like a gate and is not one. The
# reverse locks the repository: a required name that no job ever reports blocks
# every merge forever. The names below must match the `name:` of each job in
# ci.yml exactly.
#
# Run from the repository root:  .\scripts\protect-main.ps1
[CmdletBinding()]
param(
    [string]$Repository = "Streeft/MaterialSelect-AI",
    [string]$RulesetName = "CI obrigatoria em main",

    # Require the branch to be up to date with `main` before merging. This is
    # what makes the guarantee honest: it is the *merged* combination that gets
    # tested, not the branch as it looked before main moved. The cost is having
    # to update the branch and wait for CI again when main advances first.
    [bool]$RequireUpToDate = $true
)

$ErrorActionPreference = "Stop"

$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) {
    $fallback = "C:\Program Files\GitHub CLI\gh.exe"
    if (Test-Path $fallback) { $gh = $fallback }
}
if (-not $gh) {
    Write-Error "GitHub CLI nao encontrado. Instale com: winget install --id GitHub.cli"
}

$checks = @(
    "Backend (Python 3.11)",
    "Backend (Python 3.12)",
    "Frontend",
    "E2E (Playwright)"
)

$ruleset = [ordered]@{
    name        = $RulesetName
    target      = "branch"
    enforcement = "active"
    # ~DEFAULT_BRANCH follows the repository setting instead of hardcoding a
    # branch name, so renaming the default branch does not silently disarm this.
    conditions  = @{ ref_name = @{ include = @("~DEFAULT_BRANCH"); exclude = @() } }
    rules       = @(
        @{
            type       = "required_status_checks"
            parameters = @{
                strict_required_status_checks_policy = $RequireUpToDate
                required_status_checks               = @($checks | ForEach-Object { @{ context = $_ } })
            }
        }
    )
}

$body = $ruleset | ConvertTo-Json -Depth 10

# Idempotent: update the ruleset if it already exists, create it otherwise.
$existing = & $gh api "repos/$Repository/rulesets" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host $existing -ForegroundColor Red
    Write-Error "Nao foi possivel ler as rulesets de $Repository. Se a resposta acima for 403, o plano da conta nao permite proteger branch em repositorio privado - veja o cabecalho deste arquivo."
}

$id = ($existing | ConvertFrom-Json) |
    Where-Object { $_.name -eq $RulesetName } |
    Select-Object -First 1 -ExpandProperty id -ErrorAction SilentlyContinue

if ($id) {
    $result = $body | & $gh api --method PUT "repos/$Repository/rulesets/$id" --input - 2>&1
    $action = "atualizada"
} else {
    $result = $body | & $gh api --method POST "repos/$Repository/rulesets" --input - 2>&1
    $action = "criada"
}

if ($LASTEXITCODE -ne 0) {
    Write-Host $result -ForegroundColor Red
    Write-Error "Falha ao aplicar a ruleset."
}

Write-Host "Ruleset '$RulesetName' $action em $Repository." -ForegroundColor Green
Write-Host "Checks obrigatorios em main:" -ForegroundColor Green
$checks | ForEach-Object { Write-Host "  - $_" }
if ($RequireUpToDate) {
    Write-Host "  (branch precisa estar atualizada com main antes do merge)"
}
