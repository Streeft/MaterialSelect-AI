# Arquitetura

Documento canônico de arquitetura do MaterialSelect AI. Substitui e expande o
antigo `02-arquitetura.md`, que agora aponta para cá.

---

## 1. Visão geral

Monorepo com dois aplicativos desacoplados e um pacote de contrato de tipos.
O backend é a **fonte de verdade de todo número**; o frontend desenha.

```mermaid
flowchart LR
  subgraph Web["apps/web — Next.js 14 (App Router)"]
    UI["Telas: catálogo, importação,<br/>seleção, mapas, comparador"]
    Q["TanStack Query"]
    Plot["Plotly (só desenha)"]
    UI --> Q
    UI --> Plot
  end

  subgraph API["apps/api — FastAPI"]
    R["routers — HTTP fino"]
    S["services — orquestração"]
    Repo["repositories — acesso a dados"]
    Dom["domain — regras puras"]
    Calc["calculations — cálculo determinístico"]
    Imp["importers"]
    Exp["exporters"]
    AI["ai — opcional"]
    M["models — SQLAlchemy 2.0"]
    R --> S --> Repo --> M
    S --> Dom
    S --> Imp
    S --> Exp
    S --> AI
    Dom --> Calc
    AI -. "só catálogo + texto" .-> Calc
  end

  DB[("SQLite dev · PostgreSQL alvo")]
  Q -- "HTTP /api/*" --> R
  M --> DB
```

### O princípio que organiza tudo

> **Todo número é calculado deterministicamente no backend, em unidade
> canônica, com a origem rastreável. O frontend não calcula. A IA não calcula.**

Isso não é estilo: é o que sustenta a alegação de reprodutibilidade do trabalho.
Duas consequências que costumam surpreender quem chega:

- **Geometria de gráfico é cálculo, não apresentação.** Inclinação de linha de
  índice, vértices de envelope e escores normalizados vêm prontos do servidor,
  em coordenadas de dados ([ADR 0004](adr/0004-geometria-de-graficos-no-backend.md)).
- **A IA propõe, nunca decide nem calcula** ([ADR 0003](adr/0003-ia-desacoplada-do-calculo.md)).

---

## 2. Estrutura de diretórios

```
MaterialSelect-AI/
├─ apps/
│  ├─ api/                      # backend FastAPI (~18.300 linhas Python)
│  │  ├─ alembic/versions/      # 7 migrations; fonte de verdade do schema
│  │  ├─ app/
│  │  │  ├─ ai/                 # camada de IA opcional (Fase 6; 4 provedores)
│  │  │  ├─ calculations/       # cálculo determinístico: units, expressions,
│  │  │  │                      #   performance, powerlaw, statistics
│  │  │  ├─ db/                 # engine, sessão, seed
│  │  │  ├─ domain/             # regras puras, sem I/O
│  │  │  ├─ exporters/          # report/spreadsheet/html/cells + figures (SVG)
│  │  │  ├─ importers/          # CSV/XLSX de entrada (Fase 3)
│  │  │  ├─ models/             # SQLAlchemy 2.0
│  │  │  ├─ repositories/       # acesso a dados, sempre parametrizado
│  │  │  ├─ routers/            # HTTP fino, sem regra de negócio
│  │  │  ├─ schemas/            # contratos Pydantic v2
│  │  │  ├─ services/           # orquestração de casos de uso
│  │  │  └─ tests/              # 28 arquivos, 639 testes
│  │  └─ pyproject.toml
│  └─ web/                      # frontend Next.js 14
│     ├─ app/                   # App Router: uma pasta por rota — catalogo,
│     │                         #   materiais, mapas, comparar, selecao,
│     │                         #   importar, painel, admin, estilo
│     ├─ components/            # componentes por domínio (ui/, charts/,
│     │                         #   dashboard/, selection/, layout/, ai/, ...)
│     ├─ lib/                   # api.ts, types.ts, i18n.ts, format.ts,
│     │                         #   charts.ts, plotly-custom.ts, design/
│     └─ types/                 # declarações de módulos sem tipos
├─ packages/shared-types/       # contrato canônico (espelhado em web/lib/types.ts)
├─ docs/                        # esta documentação
├─ .github/workflows/ci.yml     # portão de CI
├─ sample-data/                 # CSV de exemplo para a importação
└─ scripts/                     # atalhos PowerShell
```

---

## 3. Camadas do backend e suas responsabilidades

O fluxo de uma requisição é **estritamente unidirecional**:

```
routers → services → repositories → models → banco
                  ↘ domain → calculations
```

| Camada | Responsabilidade | Não pode |
|---|---|---|
| `routers` | HTTP: validação de entrada, status. | Conter regra de negócio. |
| `services` | Orquestrar casos de uso; transformar entidades em schemas. | Emitir SQL cru. |
| `repositories` | Única camada que consulta o banco, sempre parametrizada. | Conter regra de negócio. |
| `domain` | Regras puras, sem I/O. | Importar SQLAlchemy ou FastAPI. |
| `calculations` | Cálculo determinístico. | Ter estado ou I/O. |
| `models` | Mapeamento objeto-relacional. | Conter lógica. |

### `calculations/` — o núcleo numérico

| Módulo | O que faz | Por que existe separado |
|---|---|---|
| `units.py` | Conversão via Pint; `to_canonical` (absoluto) e `to_canonical_delta` (diferença). | A distinção absoluto/diferença é obrigatória: ±5 °C é ±5 K, não ±278 K. |
| `expressions.py` | Parser **seguro sem `eval`**: AST com whitelist + interpretador manual. Roda em `float` e em `Quantity` do Pint. | A dimensão do índice é **derivada**, não declarada. |
| `powerlaw.py` | Reescreve o índice como monômio `C·Πp^e`; **deriva** a inclinação log-log `−a/b`. | É o que torna a linha de índice testável em vez de presumida. |
| `performance.py` | Avalia um índice para um material. | Compartilhado entre seleção e mapas — impede que discordem. |
| `statistics.py` | Quartis, mínimo, mediana, máximo e percentuais de cobertura do painel. | Um box-plot é geometria, e geometria é cálculo ([ADR 0004](adr/0004-geometria-de-graficos-no-backend.md)): o navegador recebe os cinco números prontos, nunca a amostra para quantilizar. |

### `domain/` — regras puras

| Módulo | Regra que guarda |
|---|---|
| `data_quality.py` | **Dado ausente nunca vira zero.** Todo construtor de valor passa aqui. |
| `filters.py` | Restrições e funil de eliminação. Propriedade ausente **elimina** o material. |
| `ranking.py` | Soma ponderada normalizada; `normalize_column` é público e reutilizado pelo comparador. |
| `geometry.py` | Fecho convexo (monotone chain) dos envelopes de classe. |
| `slug.py`, `errors.py` | Slugs e a hierarquia de erros mapeada para HTTP. |

### `ai/` — a camada opcional

```mermaid
flowchart LR
  T["Enunciado do usuário"] --> S["ai_service"]
  C["Catálogo<br/>(propriedades, índices, classes)"] --> S
  S --> P["AIProvider<br/>(mock · claude-api · claude-cli)"]
  P --> V["Validação por schema"]
  V --> G["guardrails"]
  G -->|aprovado| U["Proposta para revisão"]
  G -->|recusado| Rj["rejected[] com o motivo"]
```

O provedor recebe **só** o catálogo e o texto — nunca uma sessão de banco, nunca
o avaliador de expressões. Cinco regras em `guardrails.py`:

1. entidades sugeridas têm de existir no catálogo;
2. **todo número tem de aparecer no enunciado do usuário** — o que rejeita até
   conversões corretas (`300 °C` ancora `300 degC`, não `573.15 kelvin`);
3. unidades têm de ser dimensionalmente compatíveis;
4. **limiar dimensionado tem de declarar a unidade** (ausente vira canônica e,
   em escala com offset, inverte o sentido do enunciado);
5. prosa não pode introduzir números que o cálculo não produziu.

Quatro provedores atendem esse contrato: `mock` (padrão, determinístico,
offline), `claude-api` (API da Anthropic, chave própria), `claude-cli` (o Claude
Code instalado na máquina, pela assinatura já autenticada) e `openai-compat`
(qualquer servidor que fale `/chat/completions`, escolhido por `AI_BASE_URL` —
Groq no plano gratuito, Ollama local, OpenRouter, OpenAI). Os três reais
compartilham `model_base.py` — **não** um arquivo com "claude" no nome, porque as
garantias são da camada e não de um fornecedor ([D-36](DECISIONS.md)) —, que os
deixa estruturalmente incapazes de duas coisas: escrever uma expressão de índice
(o modelo devolve um slug; a expressão vem do catálogo) e omitir as ressalvas de
uma explicação (elas são do backend, em `caveats.py`). Ver
[D-35](DECISIONS.md).

### `exporters/` — saída auditável

`report.py` define o modelo do relatório — agnóstico de formato — e os **avisos
obrigatórios**. Dois renderizadores consomem o mesmo `Report`: `spreadsheet.py`
(CSV e XLSX) e `html.py` (documento imprimível, do qual sai o PDF pela impressão
do navegador).

Cada formato é protegido contra a injeção que lhe cabe, e as duas defesas são
distintas de propósito:

| Formato | Risco | Defesa |
|---|---|---|
| CSV/XLSX | célula executável (`=`, `+`, `-`, `@`, TAB, CR) | `cells.py`: escape **visível** (apóstrofo), não destrutivo. Número negativo sai como célula numérica de propósito. |
| HTML | marcação executável (`<script>`) | `html.py`: `html.escape` em todo valor, cabeçalho, título e nota — **mais** `Content-Security-Policy: default-src 'none'` no router, como camada independente. |

Aplicar o escape da planilha no HTML seria errado nas duas pontas: um `=` é
inerte em marcação, e o apóstrofo apareceria na tela como corrupção do dado.

---

## 4. Fluxo dos dados

### Entrada de um valor de propriedade

```mermaid
flowchart TD
  A["Formulário manual OU importação CSV/XLSX"] --> B["schemas: PropertyValueIn"]
  B --> C{"kind?"}
  C -->|scalar| D["build_scalar_value"]
  C -->|interval| E["build_interval_value"]
  C -->|missing| F["missing_value → is_missing=True<br/>todos os campos numéricos NULL"]
  D --> G["to_canonical (Pint)"]
  E --> G
  G --> H["MaterialPropertyValue"]
  H --> I[("Guarda valor original + unidade original +<br/>valor normalizado + unidade canônica +<br/>método de conversão")]
```

### Seleção determinística

```mermaid
flowchart LR
  A["Materiais ativos"] --> B["filters: restrições + funil"]
  B --> C["expressions: índice<br/>(AST seguro, dimensão derivada)"]
  C --> D["ranking: soma ponderada<br/>normalizada"]
  D --> E["Candidatos + contribuições<br/>+ excluídos + sensibilidade"]
```

### Exportação

```mermaid
flowchart LR
  A["Estudo salvo"] --> B["SelectionService.run_study<br/>(reexecuta o pipeline)"]
  B --> C["ExportService → Report<br/>(9 seções + avisos)"]
  C --> D["spreadsheet + cells<br/>(neutraliza fórmula)"]
  C --> E["html<br/>(neutraliza marcação)"]
  D --> F["CSV ou XLSX<br/>(download)"]
  E --> G["HTML imprimível<br/>(inline, vira PDF no navegador)"]
```

### Laudo de engenharia (Fase 9)

Documento **distinto** do relatório de seleção acima, e não uma variante dele
([D-41](DECISIONS.md)): o relatório acompanha uma tela, o laudo é feito para ser
anexado sozinho à monografia. Reaproveita a mesma reexecução determinística e as
mesmas seções de auditoria, e acrescenta duas coisas.

```mermaid
flowchart LR
  A["Estudo salvo"] --> B["SelectionService.run_study<br/>(reexecuta o pipeline)"]
  B --> C["ExportService.study_laudo"]
  C --> D["exporters/figures.py<br/>(barras do ranking, SVG no backend)"]
  C --> E["AIService.explain<br/>(quando a camada está ligada)"]
  C --> F["GET /api/exports/estudos/{id}/laudo.html"]
```

`figures.py` desenha o SVG **no backend**, pela mesma razão de sempre: a figura
de um documento auditável não pode depender de um navegador ter executado
JavaScript. E a ausência de IA é **declarada** no próprio laudo, nunca silenciosa
— um documento que omitisse a interpretação sem dizer que ela não existe faria o
leitor supor que ela não era necessária.

### Painel de indicadores (Fase 9)

`/painel` lê `DashboardService`, que emite **7 consultas agregadas** e nenhum
laço por material — verificado em perfil. Cobertura geral, composição por tipo
de evidência, cobertura por classe, ranking de lacunas e distribuição por
propriedade com box-plot, tudo sobre quartis e percentuais computados em
`calculations/statistics.py` ([D-39](DECISIONS.md), [ADR 0004](adr/0004-geometria-de-graficos-no-backend.md)).

---

## 5. Banco de dados

Alembic é a **fonte de verdade do schema**. `Base.metadata.create_all` só
aparece no seed e nos testes.

```mermaid
erDiagram
  MaterialClass ||--o{ Material : classifica
  Material ||--o{ MaterialPropertyValue : possui
  PropertyDefinition ||--o{ MaterialPropertyValue : define
  Source ||--o{ MaterialPropertyValue : origina
  ImportJob ||--o{ Material : criou
  User ||--o{ Project : possui
  User ||--o{ UserSession : loga
  Project ||--o{ SelectionStudy : escopa
  SelectionStudy ||--o{ SelectionConstraint : tem
  SelectionStudy ||--o{ RankingCriterion : tem
  User ||--o{ AuditEvent : "assina (retrato)"
```

| Tabela | Papel |
|---|---|
| `material_class` | Taxonomia hierárquica (`parent_id`). |
| `material` | Identidade, `is_demo`, `is_active` (soft delete), `import_job_id`. |
| `property_definition` | Catálogo configurável: unidade canônica, dimensão, direção desejável. |
| `material_property_value` | O valor **com toda a proveniência**. |
| `source` | Rótulo de origem do dado — licença/procedência, sinalização de dado de terceiro e revisor registrados no momento em que a fonte é criada (M1, [D-44](DECISIONS.md)). |
| `import_job`, `import_mapping_template` | Ciclo da importação e rollback lógico. |
| `performance_index` | Índices clássicos de Ashby com hipóteses. |
| `user` | Identidade Google (`google_sub` único), sem senha ([D-42](DECISIONS.md)). |
| `project` | Container de estudos de um dono; um por `user` no v1. |
| `user_session` | Sessão de login; `id` é o próprio valor do cookie. |
| `selection_study`, `selection_constraint`, `ranking_criterion` | Estudos reexecutáveis, escopados por `project_id`. |
| `audit_event` | Quem mudou o quê e quando (M2), com retrato de `user_email`/`entity_label`/`project_id` — sobrevive à conta, à entidade ou ao estudo desaparecerem depois ([D-43](DECISIONS.md)). |

**Campos de proveniência em `material_property_value`** — o coração do modelo:
`value_scalar`/`value_min`/`value_max`/`value_typical` (unidade **original**),
`original_unit`, `normalized_value` (unidade **canônica**), `canonical_unit`,
`conversion_method`, `uncertainty`, `measurement_condition`, `data_quality`,
`source_id`, `is_missing`.

> Atenção: `value_min`/`value_max`/`uncertainty` estão na unidade **original**.
> Quem for plotá-los num eixo canônico precisa converter — limites com
> `to_canonical`, incertezas com `to_canonical_delta`.

**Unicidade `(material_id, property_id)`** — uma linha por par, garantida pelo
banco (`uq_material_property_value_pair`). É garantia de determinismo, não
arrumação: com duas linhas para o mesmo par, o valor que chega a um gráfico, a
um filtro ou a um ranking passaria a depender da ordem em que o SELECT devolveu
as linhas, e o mesmo catálogo poderia responder duas coisas diferentes. Os
serviços já recusam propriedades repetidas dentro de um payload; só a constraint
cobre duas requisições concorrentes.

**Índices.** Além das unicidades acima, toda chave estrangeira que aparece em
junção ou em filtro de tela é indexada: `material.class_id`,
`material.import_job_id`, `material_property_value.property_id`,
`material_property_value.source_id` e o `study_id` de restrições e critérios.
`material_property_value.material_id` fica **de fora de propósito** — é a
primeira coluna de `uq_material_property_value_pair`, que já atende qualquer
busca por material; `property_id`, sendo a segunda, não é alcançável por ele.

O ganho foi medido sobre um catálogo sintético de 5 000 materiais e 60 000
valores: −22% na distribuição do painel, −35% numa busca por classe, +10% de
tamanho do arquivo. O `overview` não muda e não poderia — são três junções
**agregadas sobre o catálogo inteiro**, e um índice não abrevia uma varredura
que precisa ler tudo. **Não rode `ANALYZE`**: com estatísticas disponíveis o
planejador do SQLite passa a escolher um plano indexado para esse agregado e ele
fica 85% mais lento.

---

## 6. APIs

Todas sob `/api`. Erros de domínio são mapeados em `main.py`:
`NotFoundError`→404, `ValidationError`→400, `ConflictError`→409,
`IntegrityError`→409 com mensagem genérica.

| Área | Rotas |
|---|---|
| Saúde | `GET /health` |
| Autenticação | `GET /auth/google/login`, `GET /auth/google/callback`, `POST /auth/logout`, `GET /auth/me` — os únicos, com `/health`, sem login exigido ([D-42](DECISIONS.md)) |
| Catálogo | `GET/POST /materials`, `GET/PATCH/DELETE /materials/{id}`, `PUT /materials/{id}/values`, `GET /materials/chart` |
| Taxonomia | `GET/POST /classes`, `PUT/DELETE /classes/{id}` |
| Propriedades | `GET/POST /properties`, `PUT/DELETE /properties/{id}` |
| Importação | `POST /imports/upload`, `/{id}/preview`, `/{id}/validate`, `/{id}/commit`, `/{id}/cancel`, `/{id}/rollback`; `GET /imports`, `/{id}/report`; `GET/POST /import-templates` |
| Seleção | `POST /selection/filter`, `/index`, `/run`; `GET/POST /selection/studies`; `GET/DELETE /selection/studies/{id}`; `POST /selection/studies/{id}/run`; `GET/POST /performance-indices` |
| Visualização | `POST /charts/property-map`, `POST /charts/compare` |
| Painel | `GET /dashboard/overview`, `GET /dashboard/distribution/{property_slug}` |
| IA (opcional) | `GET /ai/status`, `POST /ai/interpret`, `POST /ai/explain` |
| Exportação | `GET /exports/catalogo.{csv,xlsx,html}`, `GET /exports/estudos/{id}.{csv,xlsx,html}` |
| Laudo de engenharia | `GET /exports/estudos/{id}/laudo.html` |
| Auditoria | `GET /audit` — quem mudou o quê e quando ([D-43](DECISIONS.md)) |
| Fontes | `GET /sources` — licença, procedência e revisor de cada fonte registrada ([D-44](DECISIONS.md)) |

Visualização e comparação são **POST** porque a entrada é estruturada (par de
eixos, filtros, conjuntos de materiais, expressão e níveis) e não caberia
legivelmente numa query string.

---

## 7. Autenticação

Login é **só por terceiros — Google, via OAuth 2.0** ([D-42](DECISIONS.md)).
Sem senha em lugar nenhum do sistema.

```mermaid
flowchart LR
  Nav["Navegador"] -- "GET /auth/google/login" --> R["routers/auth.py"]
  R -- "redirect + cookie state efêmero" --> G["Google"]
  G -- "code" --> CB["/auth/google/callback"]
  CB --> AS["AuthService"]
  AS -- "troca code por tokens,<br/>verifica id_token localmente" --> G
  AS -- "upsert User + Project padrão<br/>+ nova UserSession" --> DB[("users · projects ·<br/>user_sessions")]
  AS -- "cookie msai_session<br/>HttpOnly, SameSite=Lax" --> Nav
  Nav -- "toda outra requisição" --> Dep["get_current_user<br/>(dependencies.py)"]
  Dep -- "resolve via UserSession" --> DB
```

`get_current_user` é o único ponto de verdade de "quem está logado" — todo
router depende dele, exceto os três públicos de `auth.py`
(`/google/login`, `/google/callback`, `/logout`) e `/health`. A verificação do
`id_token` é local, via `google-auth` (assinatura, `aud`, `iss`, `exp`), sem
round-trip ao endpoint `tokeninfo` que o próprio Google desaconselha para
produção.

**Escopo por `Project`, não por usuário.** O catálogo (materiais, classes,
propriedades) continua **global e compartilhado** entre todo usuário
autenticado — é dado de referência, não trabalho autoral de um usuário. Só
`SelectionStudy` é privado, filtrado por `project_id` em todo repositório e
serviço que o toca. Cada `User` ganha um `Project` único no primeiro login
("Meu projeto"); não há colaboração multiusuário nem troca de projeto na
interface no v1.

**Sessão é uma linha de banco, não um JWT.** `UserSession.id` é o próprio valor
opaco do cookie (`secrets.token_urlsafe`) — logout apaga a linha, o que revoga
de verdade, ao contrário de um token assinado que continuaria válido até
expirar. Sem renovação deslizante: 14 dias fixos desde a criação
(`session_ttl_hours`).

**Acesso ao estudo de outro projeto não é um erro novo.** O repositório,
filtrado por `project_id`, simplesmente não encontra a linha —
`NotFoundError` (404) já cobre isso; não vale revelar que o id existe.

Ver [D-42](DECISIONS.md) para o histórico completo (alternativas descartadas,
o que muda em relação a antes, e como o Playwright loga sem passar pelo
Google).

---

## 8. Bibliotecas importantes

### Backend
| Biblioteca | Papel | Observação |
|---|---|---|
| FastAPI + Pydantic v2 | HTTP e contratos | `allow_inf_nan=False` nos campos numéricos. |
| SQLAlchemy 2.0 | ORM | Estilo `Mapped[...]`/`mapped_column`. |
| Alembic | Migrations | Fonte de verdade do schema. |
| **Pint** | Unidades | [ADR 0002](adr/0002-pint-para-unidades.md). Um registry por processo. |
| openpyxl | XLSX (entrada e saída) | Leitura em `read_only` + `data_only`. |
| pytest, ruff, black | Qualidade | `line-length = 100`. |

### Frontend
| Biblioteca | Papel |
|---|---|
| Next.js 14 (App Router) | Rotas e build |
| TypeScript estrito | `strict` + `noUncheckedIndexedAccess` |
| TanStack Query | Estado de servidor |
| Plotly (`react-plotly.js`) | Só desenha |
| Tailwind | Estilo |
| Vitest | Testes de unidade |

---

## 9. Integrações

Nenhuma externa obrigatória. A camada de IA é opcional e, no provedor padrão
(`mock`), **não faz rede**. O sistema roda integralmente sem chave nenhuma.

---

## 10. Contrato de tipos

`packages/shared-types/index.ts` é canônico; `apps/web/lib/types.ts` o espelha
**manualmente**. Duplicação consciente para manter o build do Next simples no
MVP — está registrada como débito em [TODO.md](TODO.md). **Ao alterar um
contrato, altere os dois arquivos.**
