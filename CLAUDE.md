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

Pastas `importers/`, `ai/`, `exporters/` são stubs das fases futuras (só
`__init__.py` documentando a intenção).

## Convenções

- Python: SQLAlchemy 2.0 style (`Mapped[...]`/`mapped_column`), Pydantic v2,
  type hints. Lint/format: `ruff` + `black` (config em `pyproject.toml`).
- TypeScript: modo **estrito** (`strict`, `noUncheckedIndexedAccess`). Componentes
  acessíveis, estados de loading/erro/vazio sempre tratados.
- Migrations: Alembic é a fonte de verdade do schema. Gere com
  `alembic revision --autogenerate` após alterar models; nunca edite o banco à
  mão. `Base.metadata.create_all` só é usado como conveniência no seed/testes.
- Testes: todo cálculo (unidades, dado ausente, futuros índices/ranking) precisa
  de teste. Backend usa SQLite em memória; frontend usa Vitest.

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

## Estado atual

Fases 1 (Fundação), 2 (CRUD do catálogo), 3 (Importação CSV/XLSX), 4 (Seleção
determinística: filtros, índices de desempenho com parser seguro, ranking
multicritério e estudos salvos — ver docs/07-selecao-deterministica.md) e 5
(Visualização: mapas de Ashby com envelopes por classe, barras de erro e linhas
de índice com inclinação derivada da expressão; comparador com tabela, barras,
radar, coordenadas paralelas e heatmap; exportação PNG/SVG — ver
docs/08-visualizacao.md) concluídas. Próxima: Fase 6 (camada de IA opcional).
Backlog completo em `docs/backlog.md`.

**Geometria de gráficos é cálculo, não apresentação.** Inclinação de linha de
índice, envelopes e escores normalizados são computados no backend e enviados em
coordenadas de dados; o frontend só desenha (ADR 0004). Nunca calcule uma dessas
grandezas em componente React.

Débitos técnicos conhecidos:

- `apps/web/lib/types.ts` espelha `packages/shared-types` (duplicação
  consciente); unificar via workspaces + `transpilePackages` depois.
- Busca por palavra-chave usa LIKE sobre JSON; migrar para tabela de
  associação/índice textual quando a base crescer.
- `black --check` falha em arquivos anteriores à Fase 5 (o repositório nunca foi
  formatado por inteiro); arquivos novos já saem formatados.
