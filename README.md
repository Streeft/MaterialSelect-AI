# MaterialSelect AI

[![CI](https://github.com/Streeft/MaterialSelect-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/Streeft/MaterialSelect-AI/actions/workflows/ci.yml)

Plataforma web de apoio à **seleção de materiais de engenharia** inspirada na
metodologia de Michael Ashby (mapas de propriedades e índices de desempenho).
Projeto de Trabalho de Conclusão de Curso em Engenharia de Materiais (UFRGS).

> ⚠️ **Dados exclusivamente demonstrativos. Não utilizar em projetos reais.**
> Os materiais e valores incluídos são fictícios, criados apenas para exercitar
> o sistema.

Estão concluídas as **Fases 1 a 6**: fundação, catálogo, importação de planilhas,
seleção determinística (filtros, índices de desempenho, ranking multicritério),
visualização (mapas de Ashby e comparador) e a camada de IA opcional. A fase
restante — relatórios e qualidade — está descrita em
[`docs/backlog.md`](docs/backlog.md).

## Arquitetura (resumo)

Monorepo com backend determinístico e frontend desacoplados:

- **`apps/api`** — FastAPI + SQLAlchemy 2.0 + Alembic + Pint. Todo cálculo
  numérico (conversão de unidades) acontece aqui. Banco: SQLite em
  desenvolvimento, PostgreSQL como alvo de produção.
- **`apps/web`** — Next.js (App Router) + TypeScript estrito + Tailwind +
  TanStack Query + Plotly.
- **`packages/shared-types`** — contrato de tipos compartilhado (canônico).
- **`docs/`** — documentação técnica e registros de decisão (ADR).

Detalhes em [`docs/02-arquitetura.md`](docs/02-arquitetura.md).

## Pré-requisitos

- **Node.js 18+** e **npm** (para o frontend).
- **Python 3.11+** (para o backend). Se ainda não tiver:
  ```powershell
  winget install Python.Python.3.12
  ```
  Feche e reabra o terminal e confirme com `python --version`. Alternativa:
  baixar em <https://www.python.org/downloads/> (marque *Add python.exe to PATH*).
- **git** (opcional, para versionamento).
- Docker **não** é necessário para o MVP (há um `docker-compose.yml` como
  scaffold para uso futuro).

## Como executar (Windows / PowerShell)

### 1. Backend (API)

```powershell
cd apps\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"          # ou: pip install -r requirements.txt

copy .env.example .env           # ajuste se necessário

python -m alembic upgrade head   # cria o schema
python -m app.db.seed            # carrega os 5 materiais demonstrativos

uvicorn app.main:app --reload    # sobe a API em http://localhost:8000
```

Verifique: <http://localhost:8000/api/health> e a documentação interativa em
<http://localhost:8000/docs>.

### 2. Frontend (Web)

Em **outro terminal**:

```powershell
cd apps\web
npm install
copy .env.local.example .env.local

npm run dev                      # sobe a interface em http://localhost:3000
```

Abra <http://localhost:3000/catalogo>.

### Atalhos

Os scripts em [`scripts/`](scripts/) encapsulam os comandos acima:

```powershell
.\scripts\seed.ps1      # migration + seed
.\scripts\dev-api.ps1   # sobe a API
.\scripts\dev-web.ps1   # sobe a Web
```

## Testes

**Backend** (pytest):

```powershell
cd apps\api
.\.venv\Scripts\Activate.ps1
pytest
```

Cobre: conversão de unidades (GPa→Pa, g/cm³→kg/m³, vírgula decimal, notação
científica, unidade incompatível, intervalo invertido, conversão de diferenças
em unidades com offset), a regra de **dado ausente nunca vira zero**, o parser
seguro de expressões, filtros e ranking, a **inclinação das linhas de índice**
(`E/ρ`, `E^(1/2)/ρ`, `E^(1/3)/ρ`), o fecho convexo dos envelopes e os endpoints
do catálogo, da importação, da seleção e dos gráficos.

**Frontend** (Vitest + typecheck + build):

```powershell
cd apps\web
npm run typecheck
npm run test
npm run build
```

### Integração contínua

Todo push para `main` e todo pull request passam por
[`.github/workflows/ci.yml`](.github/workflows/ci.yml), que roda os mesmos
comandos desta seção — `ruff`, `black --check`, `pytest` (em Python 3.11 e
3.12), `typecheck`, `lint`, `test` e `build` — e ainda aplica as migrações do
Alembic num banco limpo, verificando que o schema versionado realmente sobe do
zero. Nenhum passo é informativo: qualquer falha bloqueia o merge.

## Camada de IA (Fase 6 — opcional, ligada por padrão em modo simulado)

Na etapa 1 de **Seleção**, o painel *Interpretar enunciado* lê um problema em
português e propõe função, objetivo, restrições e índices **já cadastrados** —
cada item marcável, com o trecho do enunciado que o originou, e nada aplicado
sem a sua confirmação. Estudos salvos ganham um botão *Explicar resultado*.

A garantia central não é uma promessa, é código: **todo número de uma restrição
proposta precisa aparecer no seu enunciado**, e a regra recusa até conversões
corretas (“300 °C” é aceito; “573,15 K” não), porque converter e registrar a
trilha é trabalho do backend. Entidades inexistentes, unidades incompatíveis e
prosa que cite cifras não calculadas também são recusadas — e o que foi recusado
aparece na tela, com o motivo.

O provedor padrão é **simulado**: regras determinísticas locais, sem chave e sem
rede. Defina `AI_PROVIDER=` (vazio) para desligar a camada por completo; nada no
resto do sistema depende dela. Detalhes em
[`docs/09-camada-ia.md`](docs/09-camada-ia.md).

## Relatórios e exportação (Fase 7 — em andamento)

No **Catálogo** e em cada estudo salvo há botões **CSV** e **XLSX**. O relatório
de um estudo reexecuta o pipeline determinístico e traz problema, funil de
eliminação, índice com dimensão derivada, contribuições por critério, excluídos
por dado ausente, análise de sensibilidade e a **proveniência de cada número**
(valor original, unidade original, método de conversão, qualidade, fonte).

Todo arquivo exportado carrega o aviso de que a ferramenta apoia ensino e
triagem preliminar e não substitui validação experimental — e o aviso de dados
demonstrativos quando aplicável. Células são protegidas contra injeção de
fórmula. Detalhes em [`docs/10-relatorios.md`](docs/10-relatorios.md).

## Mapas e comparação (Fase 5 — disponível)

Acesse **Mapas** (`/mapas`): um mapa de Ashby com escala linear/logarítmica,
filtro por classe, **envelopes por classe**, barras de erro para intervalos e
incertezas e **linhas de índice cuja inclinação é derivada da própria expressão**
no backend (`E/ρ` → 1, `E^(1/2)/ρ` → 2, `E^(1/3)/ρ` → 3). Escolha um material
para que a reta passe exatamente por ele e veja quantos candidatos ficam no lado
favorável. Materiais que não podem ser plotados aparecem listados com o motivo.

Acesse **Comparar** (`/comparar`): tabela com proveniência completa, barras,
radar, coordenadas paralelas e heatmap sobre valores normalizados no backend —
dados ausentes ficam como lacuna, nunca como zero. Todos os gráficos exportam em
**PNG e SVG**. Detalhes em [`docs/08-visualizacao.md`](docs/08-visualizacao.md).

## Seleção de materiais (Fase 4 — disponível)

Acesse **Seleção** no menu (`/selecao`): um assistente **Função → Restrições →
Objetivo → Resultados**. Aplique restrições (com contagem de candidatos em tempo
real), escolha um índice de desempenho (E/ρ, σ/ρ, E^(1/2)/ρ… ou uma expressão
sua, validada por um parser seguro sem `eval`), defina critérios de ranking com
pesos e veja o funil, o ranking com contribuições, os excluídos por dados
ausentes e a análise de sensibilidade. Análises podem ser **salvas e
reexecutadas**. Detalhes em [`docs/07-selecao-deterministica.md`](docs/07-selecao-deterministica.md).

## Importar planilhas (Fase 3 — disponível)

Acesse **Importar** no menu (`/importar`): envie um CSV ou XLSX, mapeie as
colunas para propriedades (com sugestões automáticas de unidade a partir do
cabeçalho), valide linha a linha e importe apenas os registros válidos. Cada
importação fica no histórico e pode ser **revertida** como uma unidade. Detalhes
e formatos aceitos em [`docs/06-importacao.md`](docs/06-importacao.md);
`sample-data/materials_demo.csv` serve como arquivo de exemplo.

## Documentação

- [`docs/01-visao-geral.md`](docs/01-visao-geral.md) — visão geral e problema.
- [`docs/02-arquitetura.md`](docs/02-arquitetura.md) — arquitetura (Mermaid).
- [`docs/03-modelo-de-dados.md`](docs/03-modelo-de-dados.md) — modelo de dados (ER).
- [`docs/04-metodologia-selecao.md`](docs/04-metodologia-selecao.md) — metodologia Ashby (roadmap).
- [`docs/05-tratamento-unidades.md`](docs/05-tratamento-unidades.md) — unidades e rastreabilidade.
- [`docs/06-importacao.md`](docs/06-importacao.md) — fluxo de importação e segurança.
- [`docs/07-selecao-deterministica.md`](docs/07-selecao-deterministica.md) — filtros, índices, ranking.
- [`docs/08-visualizacao.md`](docs/08-visualizacao.md) — mapas de Ashby, linhas de índice, comparador.
- [`docs/09-camada-ia.md`](docs/09-camada-ia.md) — camada de IA opcional e seus guardrails.
- [`docs/10-relatorios.md`](docs/10-relatorios.md) — exportação, relatório de seleção e proveniência.
- [`docs/09-camada-ia.md`](docs/09-camada-ia.md) — limites da IA, guardrails, provedor simulado.
- [`docs/adr/`](docs/adr/) — registros de decisão arquitetural.
- [`docs/backlog.md`](docs/backlog.md) — backlog priorizado das próximas fases.
