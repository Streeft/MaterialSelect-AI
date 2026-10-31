# CLAUDE.md — Convenções do projeto MaterialSelect AI

Instruções para agentes/contribuidores trabalhando neste repositório. Esta é a
**versão curta**, carregada automaticamente.
> **Sob demanda, não por inteiro:** estado em [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md),
> guia completo em [`docs/CLAUDE.md`](docs/CLAUDE.md), arquitetura em
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), pendências em [`docs/TODO.md`](docs/TODO.md).
> **Nunca leia inteiros** `DECISIONS.md` (650 KB), `CHANGELOG_SESSION.md`, `TODO.md`,
> `ESTADO_ATUAL.md`: use `rg "D-NN"` e leia só a faixa; edite por trecho.

## Princípios inegociáveis (metodologia)

1. **Não inventar propriedades de materiais.** Só existem valores explicitamente
   cadastrados ou importados.
2. **Todo cálculo numérico é determinístico e vive no backend** (camadas
   `calculations` / `domain`). A camada de IA **nunca** produz valores
   numéricos — apenas interpreta, sugere e explica.
3. **Dado ausente nunca vira zero.** Use `is_missing=True` com campos numéricos
   `NULL`. A regra está centralizada em `app/domain/data_quality.py`.
4. **Rastreabilidade de unidades:** preserve valor original + unidade original +
   valor normalizado + unidade canônica + método de conversão. Conversão só via
   `app/calculations/units.py` (Pint).
5. **Sem segredos versionados.** Configuração por variáveis de ambiente
   (`.env`, ignorado). Há `.env.example` .
6. **Dados de demonstração** são fictícios e marcados (`is_demo`); o marcador é
   dado, não texto na tela ([D-138](docs/DECISIONS.md) retirou o aviso). Criar dado de demonstração novo, ou apagar o que
   já existe, segue a regra fixa em
   [`docs/15-dados-demonstrativos.md`](docs/15-dados-demonstrativos.md) —
   leia antes de escrever um seed, não importa a ferramenta ou IDE.
7. **Catálogo só de fonte aprovada.** Fonte aberta entra só com veredito
   **APROVADA** em [`docs/catalogo/fontes.md`](docs/catalogo/fontes.md) e pelo
   pipeline do D-102; o Granta EduPack segue a trilha própria do
   [D-102](docs/DECISIONS.md); bases comerciais (MatWeb, Total Materia, ASM,
   MMPDS, CAMPUS) ficam **recusadas** para *scraping*/extração em massa. Regra
   em [`docs/20-catalogo-fontes-abertas.md`](docs/20-catalogo-fontes-abertas.md)
   ([D-103](docs/DECISIONS.md), rascunho).

## Idiomas

- **Interface e conteúdo para o usuário:** português do Brasil.
- **Código (identificadores, funções, comentários):** inglês, consistente.
- **Domínio/rotulagem de UI** pode usar termos em PT-BR quando forem o texto
  exibido (dicionário em `apps/web/lib/i18n.ts`).
- Exceção única e deliberada, comentada no próprio arquivo: os textos de amostra
  dentro de `apps/web/app/estilo/page.tsx`, que são conteúdo de espécime
  tipográfico e não copy de produto.

## Arquitetura em camadas (backend)

Fluxo: `routers` (HTTP fino) → `services` (regras/orquestração) →
`repositories` (acesso a dados, sempre parametrizado) → `models` (SQLAlchemy).
Regras puras em `domain`; cálculo determinístico em `calculations`. **Sem lógica
de negócio nos routers.** Contratos de entrada/saída em `schemas` (Pydantic v2).


Detalhe por área, carregado só ao tocar nos arquivos (`.claude/rules/`):
`backend-ai-exporters.md` (importers/exporters/IA: escape por formato, guardrails,
provedores), `frontend-design-system.md` (tokens, MSDS, Plotly, proibições),
`catalogo-oficial.md` (D-102), `deploy-pos-merge.md` (workflows a disparar após merge
de `apps/api/**`: **Deploy da API** sempre; **Administração do banco** conforme o caso;
`semear_demo` é aditivo e só roda em produção por decisão do autor, D-189; nunca depois do cutover oficial).

## Convenções

- Python: SQLAlchemy 2.0 style (`Mapped[...]`/`mapped_column`), Pydantic v2,
  type hints. Lint/format: `ruff` + `black` (config em `pyproject.toml`).
- TypeScript: modo **estrito** (`strict`, `noUncheckedIndexedAccess`). Componentes
  acessíveis, estados de loading/erro/vazio sempre tratados.
- Migrations: Alembic é a fonte de verdade do schema. Gere com
  `alembic revision --autogenerate` após alterar models; nunca edite o banco à
  mão. `Base.metadata.create_all` só é usado como conveniência no seed/testes.
- Testes: todo cálculo (unidades, dado ausente, índices, ranking, geometria)
  precisa de teste. Backend usa SQLite em memória; frontend usa Vitest.
- **Não altere o tratamento de BEGIN em `app/tests/conftest.py`.** O pysqlite
  emite BEGIN sozinho, e só antes de DML — nunca antes de SAVEPOINT. Sem os
  listeners que tiram o BEGIN do driver, um teste cuja *primeira* instrução seja
  uma escrita escapa do rollback e vaza para todos os testes seguintes.
  `app/tests/test_isolation.py` é o canário que protege isso.
- **Documentação anda junto do código, no mesmo PR.** Toda mudança de código ou
  funcionalidade nova atualiza o texto que ela tornou falso: `README.md`,
  `docs/DECISIONS.md` (decisão nova quando se escolhe um desenho),
  `docs/TODO.md`, `docs/CHANGELOG_SESSION.md`, `docs/PROJECT_CONTEXT.md` (estado e contagem de testes), o
  documento da área (`docs/09-camada-ia.md`, `docs/13-deploy.md`…),
  `docs/ESTADO_ATUAL.md` (só quando há decisão nova relevante; opcional) e
  `.env.example` quando a
  configuração muda. PR sem isso está incompleto — regra completa em
  [`docs/CLAUDE.md`](docs/CLAUDE.md) §1.12. Outras ferramentas de IA chegam
  aqui por [`AGENTS.md`](AGENTS.md).

## Comandos rápidos

```powershell
# Backend
cd apps\api; .\.venv\Scripts\Activate.ps1
python -m alembic upgrade head; python -m app.db.seed
uvicorn app.main:app --reload
pytest

# Frontend
cd apps\web
npm run dev
npm run typecheck; npm run test; npm run build
```

## Integração contínua

`.github/workflows/ci.yml` roda em todo push para `main` e em todo PR. O portão
é exatamente o conjunto de comandos acima — se um deles falha localmente, falha
na CI:

- **Backend** (Python 3.11 e 3.12): `ruff check app`, `black --check app`,
  `pytest`, e `alembic upgrade head` + `app.db.seed` num banco limpo. Este
  último existe porque os testes usam SQLite em memória com `create_all` e
  nunca exercitam as migrações — que são a fonte de verdade do schema.
- **Frontend**: `npm ci`, `typecheck`, `lint`, `test`, `build`.

Antes de abrir um PR, rode os dois conjuntos localmente; nenhum passo da CI é
meramente informativo.


## Estado atual

Fases 1 a 9 concluídas. Frontend na Vercel, API no Fly, Postgres no Neon. IA oficial: Gemini via `openai-compat` (D-93); `mock` é o padrão do código e dos testes. Contagem de testes e histórico: `docs/PROJECT_CONTEXT.md` e `docs/ESTADO_ATUAL.md`.

### Área → o que ler antes de mexer

Regras literais por área em [`docs/REGRAS_POR_AREA.md`](docs/REGRAS_POR_AREA.md).

| Área | Seção em REGRAS_POR_AREA.md | Decisões |
|---|---|---|
| Seleção, estágios, ranking | Seleção e estágios | D-55 a D-62, D-84 a D-89, D-126 |
| Processos | Processos | D-57, D-59 |
| Solver, custo, Eco, bateria | Casos de carga, Solver, Custo… | D-64 a D-66, D-69 |
| Sintetizador, painéis, varredura | Sintetizador e painéis sanduíche | D-67, D-68, D-144 |
| Unidades e leitura | Unidades e unidade de leitura | D-63, D-70 |
| Gráficos, figuras, MSDS | Gráficos, figuras e MSDS | D-60, D-80, D-81 |
| Acesso, portão, registros próprios | Acesso, portão e registros próprios | D-42, D-43, D-46, D-62, D-83 |
| Demo e seed | Demo e seed | D-71, D-72 |
| Cadernos e Estúdio | Estúdio e Cadernos | D-92, D-94, D-97, D-98 |
| Cérebro, ingestão, RAG | Cérebro e ingestão | D-47, D-100, D-101 |
| Cartão CAE | Exportação CAE | D-104, D-112, D-119 |
| Composição e busca | Composição e busca | D-105 |
| Catálogo oficial, fontes abertas | Catálogo oficial e fontes abertas | D-102, D-103 |

**Geometria de gráficos é cálculo, não apresentação.** Inclinação de linha de
índice, envelopes e escores normalizados são computados no backend e enviados em
coordenadas de dados (ADR 0004). Nunca calcule uma dessas grandezas em
componente React.



Sugestões de fluxo gstack (não são autoridade): [`docs/GSTACK.md`](docs/GSTACK.md).
