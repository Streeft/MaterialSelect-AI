# MaterialSelect AI

Plataforma web de apoio à **seleção de materiais de engenharia** inspirada na
metodologia de Michael Ashby (mapas de propriedades e índices de desempenho).
Projeto de Trabalho de Conclusão de Curso em Engenharia de Materiais (UFRGS).

> ⚠️ **Dados exclusivamente demonstrativos. Não utilizar em projetos reais.**
> Os materiais e valores incluídos são fictícios, criados apenas para exercitar
> o sistema.

Este repositório está na **Fase 1 (Fundação) + primeira fatia vertical**:
catálogo de materiais funcionando de ponta a ponta (banco → API → interface →
gráfico → testes). As demais fases (importador, mapas Ashby completos, índices de
desempenho, ranking multicritério, IA e relatórios) estão descritas em
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
científica, unidade incompatível, intervalo invertido), a regra de **dado
ausente nunca vira zero**, e os endpoints do catálogo (lista, busca, detalhe,
gráfico, 404).

**Frontend** (Vitest + typecheck + build):

```powershell
cd apps\web
npm run typecheck
npm run test
npm run build
```

## Importar a base do professor (futuro)

O sistema foi desenhado para **não** depender do formato da planilha do
orientador. A camada de importação (Fase 3) trará um assistente de mapeamento de
colunas → propriedades, com detecção de unidades e validação. Enquanto isso,
`sample-data/materials_demo.csv` documenta o formato de referência esperado.

## Documentação

- [`docs/01-visao-geral.md`](docs/01-visao-geral.md) — visão geral e problema.
- [`docs/02-arquitetura.md`](docs/02-arquitetura.md) — arquitetura (Mermaid).
- [`docs/03-modelo-de-dados.md`](docs/03-modelo-de-dados.md) — modelo de dados (ER).
- [`docs/04-metodologia-selecao.md`](docs/04-metodologia-selecao.md) — metodologia Ashby (roadmap).
- [`docs/05-tratamento-unidades.md`](docs/05-tratamento-unidades.md) — unidades e rastreabilidade.
- [`docs/adr/`](docs/adr/) — registros de decisão arquitetural.
- [`docs/backlog.md`](docs/backlog.md) — backlog priorizado das próximas fases.
