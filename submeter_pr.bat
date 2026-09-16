@echo off
chcp 65001 >nul
echo ======================================================================
echo   MaterialSelect AI - Submissao de Pull Request (Battery Designer)
echo ======================================================================
echo.

echo [1/4] Verificando status e criando branch feature/battery-designer-module-s...
git checkout -b feature/battery-designer-module-s 2>nul || git checkout feature/battery-designer-module-s

echo.
echo [2/4] Adicionando arquivos modificados e criados...
git add .
git status --short

echo.
echo [3/4] Criando commit...
git commit -m "feat(battery): implement Battery Designer module and reach 100%% platform coverage" ^
  -m "- Implement deterministic electrochemical catalog with 9 commercial chemistries (LFP, NMC, NCA, LCO, LTO, Na-ion, Lead-Acid, NiMH)" ^
  -m "- Add 6 application archetypes (EV, Drone, Power Tools, Residential/Industrial BESS)" ^
  -m "- Implement Ns x Np pack sizing with physical packaging factors (mass, volume, cost) and LCOS" ^
  -m "- Add chemical trade-offs, thermal safety runaway guidelines and Pareto dominance podiums" ^
  -m "- Create responsive frontend page at /app/baterias with Prisma design system" ^
  -m "- Add comprehensive test suites: 32 backend tests and 4 frontend tests" ^
  -m "- Register architectural decision D-69 and update maturity matrix to 100%% coverage"

echo.
echo [4/4] Enviando branch para o GitHub (origin)...
git push -u origin feature/battery-designer-module-s

echo.
echo ======================================================================
echo   Criando o Pull Request no GitHub...
echo ======================================================================
where gh >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo GitHub CLI (gh) detectado. Criando PR automaticamente...
    gh pr create --title "feat: Battery Designer (Módulo S) — 100%% de cobertura de capacidades do Granta EduPack (D-69)" --body "Entrega do Battery Designer (Módulo S do Granta EduPack / Faixa P4), elevando a cobertura da plataforma para 100%% (32 de 32 capacidades em nível >= 3) e nível médio para 3,66. Inclui catálogo de 9 químicas, 6 arquétipos, dimensionamento Ns x Np, fatores de empacotamento físico, LCOS, tela em /app/baterias, 36 testes automatizados e decisão arquitetural D-69."
) else (
    echo Abrindo navegador para criacao do Pull Request no GitHub...
    start https://github.com/Streeft/MaterialSelect-AI/compare/main...feature/battery-designer-module-s?expand=1
)

echo.
echo Concluido com sucesso!
pause
