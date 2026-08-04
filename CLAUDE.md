# CLAUDE.md — Convenções do projeto MaterialSelect AI

Instruções para agentes/contribuidores trabalhando neste repositório.

## Princípios inegociáveis (metodologia)

1. **Não inventar propriedades de materiais.** Só existem valores explicitamente
   cadastrados ou importados.
2. **Todo cálculo numérico é determinístico e vive no backend** (camadas
   `calculations` / `domain`). A futura camada de IA **nunca** produz valores
   numéricos — apenas interpreta, sugere e explica.
3. **Dado ausente nunca vira zero.** Use `is_missing=True` com campos numéricos
   `NULL`. A regra está centralizada em `app/domain/data_quality.py`.
4. **Rastreabilidade de unidades:** preserve valor original + unidade original +
   valor normalizado + unidade canônica + método de conversão. Conversão só via
   `app/calculations/units.py` (Pint).
5. **Sem segredos versionados.** Configuração por variáveis de ambiente
   (`.env`, ignorado). Há `.env.example`.
6. **Dados de demonstração** são fictícios e marcados (`is_demo`), com aviso na
   interface e nos arquivos.

## Idiomas

- **Interface e conteúdo para o usuário:** português do Brasil.
- **Código (identificadores, funções, comentários):** inglês, consistente.
- **Domínio/rotulagem de UI** pode usar termos em PT-BR quando forem o texto
  exibido (dicionário em `apps/web/lib/i18n.ts`).

## Arquitetura em camadas (backend)

Fluxo: `routers` (HTTP fino) → `services` (regras/orquestração) →
`repositories` (acesso a dados, sempre parametrizado) → `models` (SQLAlchemy).
Regras puras em `domain`; cálculo determinístico em `calculations`. **Sem lógica
de negócio nos routers.** Contratos de entrada/saída em `schemas` (Pydantic v2).

`importers/` (Fase 3) e `ai/` (Fase 6) estão implementadas; `exporters/` segue
como stub documentado.

Na camada `ai/`, o provedor recebe só o catálogo e o texto — nunca uma sessão de
banco ou o avaliador de expressões — e **toda** saída passa por
`app/ai/guardrails.py` antes de chegar ao usuário. Ao mexer ali, não afrouxe a
ancoragem numérica: todo número de uma restrição proposta tem de aparecer no
enunciado do usuário, inclusive quando uma conversão estaria correta.

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

Fases 1 (Fundação), 2 (CRUD do catálogo), 3 (Importação CSV/XLSX), 4 (Seleção
determinística: filtros, índices de desempenho com parser seguro, ranking
multicritério e estudos salvos — ver docs/07-selecao-deterministica.md) e 5
(Visualização: mapas de Ashby com envelopes por classe, barras de erro e linhas
de índice com inclinação derivada da expressão; comparador com tabela, barras,
radar, coordenadas paralelas e heatmap; exportação PNG/SVG — ver
docs/08-visualizacao.md) e 6 (camada de IA opcional, desacoplada, com provedor
simulado determinístico e guardrails executáveis — ver docs/09-camada-ia.md)
concluídas. Próxima: Fase 7 (relatórios e qualidade). Backlog completo em
`docs/backlog.md`.

**Geometria de gráficos é cálculo, não apresentação.** Inclinação de linha de
índice, envelopes e escores normalizados são computados no backend e enviados em
coordenadas de dados; o frontend só desenha (ADR 0004). Nunca calcule uma dessas
grandezas em componente React.

Débitos técnicos conhecidos:

- `apps/web/lib/types.ts` espelha `packages/shared-types` (duplicação
  consciente); unificar via workspaces + `transpilePackages` depois.
- Busca por palavra-chave usa LIKE sobre JSON; migrar para tabela de
  associação/índice textual quando a base crescer.
- (quitado) A formatação do backend foi normalizada antes da Fase 7; `black
  --check app` agora é portão de CI e precisa passar.
