# Registro da sessão — Fases 5 a 7

Sessão de 30/07 a 04/08/2026. Ponto de partida: `8dbbd62` (Fase 4 concluída).
Ponto final: `2e70162`.

**96 arquivos alterados, +9.593 / −372.** Testes de backend: 169 → 362.
Testes de frontend: 13 → 44.

---

## 1. Commits

| Commit | O que |
|---|---|
| `a1ea56d` | Fase 5: visualização (mapas de Ashby, linhas de índice, comparador) |
| `7dd7e68` | Fase 6: camada de IA desacoplada e painel de assistência |
| `3e27604` | Merge PR #1 |
| `bbea0ad` | Formatação do backend inteiro com black |
| `9522e4a` | CI no GitHub Actions |
| `8757872` | Actions para runtime Node 24; app para Node 22 |
| `94d6022` | Merge PR #2 |
| `a7cc413` | Correção: unidade explícita em limiar dimensionado (IA) |
| `29f95f9` | Merge PR #3 |
| `6be4664` | Fase 7 (1/n): exportação CSV/XLSX com relatório auditável |
| `2e70162` | Merge PR #4 |

> O commit da Fase 6 (`7dd7e68`) **não segue** o padrão `Fase N:` dos demais.
> Isso já causou a impressão de que a fase tinha sido pulada. Registrado aqui
> para quem for ler o `git log`.

---

## 2. Funcionalidades criadas

### Fase 5 — Visualização

**Backend**
- `calculations/powerlaw.py` — reescreve o índice como monômio `C·Πp^e` e
  **deriva** a inclinação log-log `−a/b`. `E/ρ`→1, `E^(1/2)/ρ`→2, `E^(1/3)/ρ`→3.
  Rejeita, com o motivo, o que não é lei de potência.
- `domain/geometry.py` — fecho convexo (monotone chain) dos envelopes.
- `calculations/performance.py` — avaliação de índice compartilhada entre seleção
  e mapas, com teste garantindo que concordam.
- `calculations/units.py` — `to_canonical_delta` para converter **diferenças**.
- `services/chart_service.py`, `schemas/charts.py`,
  `repositories/chart_repository.py`, `routers/charts.py`.
- `domain/ranking.py` — `normalize_column` tornada pública e reutilizada.

**Frontend**
- `/mapas` — eixos, escala, filtro por classe, envelopes, barras de erro,
  rótulos, linha de índice por material ou valor livre, exportação PNG/SVG.
- `/comparar` — tabela, barras, radar, coordenadas paralelas, heatmap.
- `lib/charts.ts`, `components/charts/AshbyMap.tsx`, `ComparisonView.tsx`.
- `types/plotly-dist.d.ts`.

### Fase 6 — Camada de IA

- `ai/provider.py` — interface estreita; o provedor recebe só catálogo e texto.
- `ai/mock.py` — provedor simulado **determinístico**, sem chave e sem rede.
- `ai/guardrails.py` — as regras executáveis.
- `ai/factory.py`, `schemas/ai.py`, `services/ai_service.py`, `routers/ai.py`.
- Frontend: `AIAssistPanel.tsx` (revisão opt-in item a item, incluindo o que os
  guardrails recusaram) e `StudyExplanation.tsx`.

### Fase 7 — Exportação

- `exporters/cells.py` — neutralização de injeção de fórmula.
- `exporters/report.py` — modelo do relatório e avisos obrigatórios.
- `exporters/spreadsheet.py` — CSV e XLSX.
- `services/export_service.py` — relatório de estudo em 9 abas e do catálogo.
- `routers/exports.py`, `components/ExportButtons.tsx`.

### Infraestrutura

- `.github/workflows/ci.yml` — backend em matriz 3.11/3.12 (`ruff`,
  `black --check`, `pytest`, `alembic upgrade` + seed) e frontend (`npm ci`,
  `typecheck`, `lint`, `test`, `build`).
- `.claude/launch.json` e `.claude/settings.local.json` (este último ignorado).

---

## 3. Correções

| # | Defeito | Como apareceu |
|---|---|---|
| 1 | **Isolamento de testes quebrado.** pysqlite emite BEGIN sozinho e nunca antes de SAVEPOINT; um teste que começasse por escrita escapava do rollback e vazava para todos os seguintes. A suíte ficava verde perdendo isolamento em silêncio. | Ao adicionar um teste cuja primeira instrução era um POST. |
| 2 | **Dados do usuário sem escape no hover do Plotly.** Nomes de material vêm de planilhas importadas e eram interpolados crus em texto que o Plotly renderiza como rich text. | Revisão do próprio código. |
| 3 | **Unidade nula virando canônica na IA.** "no mínimo 300 graus C" saía com `unit: null` e virava ≥ 300 K, isto é −173 °C: nenhuma restrição. Os quatro guardrails existentes não pegavam. | Demonstração ao vivo dos endpoints. |
| 4 | **`prettyUnit` renderizava `** 2.5` como `·· 2.5`** nas dimensões derivadas. | Conferência da tela no navegador. |
| 5 | **Rótulos de eixo colidindo no comparador.** Duas propriedades com o mesmo símbolo viravam a mesma categoria no Plotly e as séries se fundiam em silêncio. | Revisão do próprio código. |
| 6 | **Reta de índice vertical exigia intervalo positivo em X** que ela não usa. | Revisão do próprio código. |

Todos com teste de regressão. Vale notar que **os defeitos 3 e 4 só apareceram
ao abrir o navegador** — nenhum teste os pegava.

---

## 4. Melhorias e refatorações

- **Formatação:** backend inteiro passado pelo black (32 arquivos), em commit
  próprio, para viabilizar `black --check` como portão de CI.
- **Avaliação de índice extraída** para `calculations/performance.py`, eliminando
  a duplicação entre seleção e mapas.
- **`normalize_column` tornada pública** e reutilizada pelo comparador, para que
  barra e escore não possam divergir.
- **Envelopes deixaram de refazer requisição** ao alternar o checkbox — passaram
  a ser filtro de exibição.
- **Níveis numéricos de índice ligados na interface**, usando capacidade da API
  que já existia e estava sem uso.
- **Actions atualizadas** para runtime Node 24 e app para Node 22.

---

## 5. Decisões tomadas nesta sessão

Registradas em [DECISIONS.md](DECISIONS.md): ADR 0004 e as decisões D-08 a D-19.
As de maior consequência:

- **Geometria de gráfico é cálculo** (ADR 0004).
- **Todo número da IA tem de aparecer no enunciado** (D-08) — rejeita até
  conversão correta.
- **Limiar dimensionado tem de declarar unidade** (D-09) — nasceu do defeito 3.
- **Coordenadas paralelas sem `parcoords`** (D-12) — porque ele não expressa
  ausência.
- **Escape de fórmula visível, não destrutivo** (D-13).
- **Exportador reexecuta o pipeline** (D-14).

---

## 6. Documentação

Criados: `08-visualizacao.md`, `09-camada-ia.md`, `10-relatorios.md`,
`adr/0004-geometria-de-graficos-no-backend.md` e, neste checkpoint,
`PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `TODO.md`,
`DECISIONS.md` e este arquivo.

Atualizados: `CLAUDE.md` (raiz), `README.md`, `02-arquitetura.md`,
`04-metodologia-selecao.md`, `backlog.md`.

---

## 7. Processo

Quatro PRs, todos com CI verde a partir do #2 (que criou a CI):

| PR | Conteúdo | Merge |
|---|---|---|
| #1 | Fases 5 e 6 | `3e27604` |
| #2 | CI + formatação | `94d6022` |
| #3 | Correção de unidade na IA | `29f95f9` |
| #4 | Fase 7: exportação | `2e70162` |

Também nesta sessão: `main` publicado no remote e definido como branch padrão
(antes o `HEAD` apontava para `fase-5-visualizacao`), e o GitHub CLI instalado e
autenticado.

**Branches mescladas ainda existentes** (local e remoto): `fase-5-visualizacao`,
`fase-7-ci`, `fase-6-unidade-explicita`, `fase-7-relatorios`. Podem ser
removidas.
