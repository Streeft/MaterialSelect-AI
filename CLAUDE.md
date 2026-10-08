# CLAUDE.md — Convenções do projeto MaterialSelect AI

Instruções para agentes/contribuidores trabalhando neste repositório. Esta é a
**versão curta**, carregada automaticamente.

> **Novo por aqui?** Comece por [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md)
> (estado do projeto) e leia [`docs/CLAUDE.md`](docs/CLAUDE.md) — o guia
> completo, com as armadilhas que já causaram bug, a nomenclatura e as decisões
> que não devem ser alteradas. Arquitetura em
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md); o que fazer a seguir em
> [`docs/TODO.md`](docs/TODO.md).

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
6. **Dados de demonstração** são fictícios e marcados (`is_demo`), com aviso na
   interface e nos arquivos. Criar dado de demonstração novo, ou apagar o que
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

`importers/` (Fase 3), `ai/` (Fase 6) e `exporters/` (Fase 7) estão
implementadas.

Em `exporters/`, **todo arquivo exportado carrega o aviso de limitação de uso**
(compromisso do item 5 da proposta). O modelo `Report` é agnóstico de formato e
tem dois renderizadores: `spreadsheet.py` (CSV/XLSX) e `html.py` (imprimível). O cartão
de material para CAE ([D-104](docs/DECISIONS.md)) **não** passa pelo `Report`:
`exporters/cae/` lê um `CaeCard` já convertido para o sistema de unidades que o
usuário escolheu, e cada formato declara o que exige — faltando, a exportação é
recusada (422), nunca escrita com o branco que o solver preencheria.

`Report.figures` é uma **lista** porque um documento de seleção tem mais de uma
figura, e a ordem é a da leitura. O relatório leva o **mapa de seleção**; o
laudo leva o mapa e o gráfico de ranking ([D-53](docs/DECISIONS.md)). Os eixos
do mapa saem da expressão do índice, na ordem em que ela os nomeia — é nesse par
que o índice é uma reta —, e a geometria vem de `ChartService.property_map`, a
mesma chamada que serve a tela: reimplementá-la no exportador criaria duas
verdades sobre a mesma figura. Figura que não pode ser desenhada é **omitida com
a razão na legenda**, nunca falha a exportação.

O envelope de classe é uma **nuvem** ([D-54](docs/DECISIONS.md)): elipse com
folga e piso de tamanho, para que uma classe de um material ainda se leia como
família — o fecho convexo precisa de três pontos e some no catálogo didático. A
nuvem **alarga** a região além dos materiais nela, então é indicativa, e a
legenda diz isso. O **fecho continua literal** e nunca recebe folga: ele responde
a "qual região exatamente estes materiais ocupam".

**O escape é por formato, e não intercambiável.** `cells.py` neutraliza injeção
de fórmula na planilha com apóstrofo à frente — visível, nunca destrutivo;
números negativos saem como célula numérica de propósito. `html.py` neutraliza
injeção de **marcação** com `html.escape` em todo valor, cabeçalho, título e
nota. Não reaproveite um no outro: um `=` é inerte em HTML, e o apóstrofo
apareceria na tela como corrupção do dado. O HTML ainda é servido sob
`Content-Security-Policy: default-src 'none'`, camada independente do escape.

Na camada `ai/`, o provedor recebe só o catálogo e o texto — nunca uma sessão de
banco ou o avaliador de expressões — e **toda** saída passa por
`app/ai/guardrails.py` antes de chegar ao usuário. Ao mexer ali, não afrouxe duas
regras: **ancoragem numérica** (todo número de uma restrição proposta tem de
aparecer no enunciado do usuário, inclusive quando uma conversão estaria correta)
e **unidade explícita** (limiar sobre propriedade dimensionada não pode omitir a
unidade — unidade ausente vira a canônica e, numa escala com offset, inverte o
sentido do enunciado).

Há quatro provedores: `mock` (padrão, determinístico, sem rede), `claude-api`
(API da Anthropic, chave própria), `claude-cli` (o Claude Code instalado na
máquina, pela assinatura já autenticada) e `openai-compat` (qualquer servidor que
fale `/chat/completions`, escolhido por `AI_BASE_URL` — o Gemini no plano
gratuito do Google AI Studio, que é a IA oficial do projeto desde o D-93, Groq,
Ollama local, OpenRouter, OpenAI). O que os provedores reais compartilham está em
`app/ai/model_base.py` — **não** em um arquivo com "claude" no nome, porque as
garantias são da camada. Duas delas não são negociáveis (D-35): **o modelo
escolhe um índice pelo slug** e a expressão é lida do catálogo depois — não peça
esse campo ao modelo — e **as ressalvas da explicação são do backend**
(`app/ai/caveats.py`), fora do esquema enviado. Um provedor real não é
determinístico, e é por isso que o padrão continua `mock`.

No `openai-compat`, duas coisas parecem descuido e são decisão (D-36):
`AI_BASE_URL` **não tem padrão** (um padrão escolheria um fornecedor pelo
operador; sem ele, o erro traz as receitas prontas) e **chave vazia é
configuração válida** — sem `AI_API_KEY` o cabeçalho `Authorization` não é
enviado, que é o que um Ollama local espera. Degradar o modo JSON é decisão do
operador via `AI_JSON_MODE`, nunca queda silenciosa. E o aviso mostrado ao
usuário nomeia **o host** de destino, nunca o caminho — um caminho de gateway
pode carregar token.

## Sistema de design (frontend)

A interface tem um sistema de design próprio, **sem biblioteca de componentes
externa** (D-23): o MSDS (`apps/web/lib/msds/`, D-74) é código deste
repositório, e desde [D-80](docs/DECISIONS.md) nenhuma primitiva depende mais
de `@material/web` — a dependência saiu do `package.json` e a exceção de D-48
ficou sem objeto. Três regras que não são questão de gosto:

- **Cor só via token.** Todo valor de cor vive em `apps/web/app/globals.css` como
  triplo `"R G B"`; o Tailwind lê pelo `tailwind.config.ts` e a camada de gráfico
  lê o mesmo token em runtime por `lib/design/palette.ts`, de modo que interface
  e figura não possam discordar (D-28). Nada de classe de paleta crua
  (`bg-slate-800`) em componente.
- **A paleta é azul, e dois matizes estão onde estão de propósito** (D-38, que
  substitui a paleta de D-33 sem revogar o método dela). `--info` fica no ciano
  para que um alerta informativo não vire cromo de marca, e
  `--quality-importado` fica no violeta porque o único matiz com que uma
  procedência não pode ser confundida é aquele em que se clica. Ao mexer na
  paleta, meça: o par mais apertado é `--brand-700` sobre `--brand-50` a 5,01:1,
  e `--accent` **não** é o azul do Google (#1A73E8 dá 4,51:1 com branco). Estado
  de hover nomeia `800`/`900`, nunca `--accent` — que *é* `--brand-700` e
  produziria um hover invisível no tema claro. A paleta categórica de classes
  (Okabe–Ito) não é da marca e não se mexe: ela responde a daltonismo e a
  impressão monocromática.
- **Forma e movimento também são token.** `rounded-card`/`rounded-control`
  cobrem quase tudo; a classe `.pressable` (em `globals.css`) é o gesto de
  "maleável" — 2% de `transform` na curva do Material 3, sem biblioteca.
- **Primitivas em `components/ui/`**, importadas sempre pelo barril
  `@/components/ui` e documentadas ao vivo em `/estilo` — as figuras da
  monografia são capturas dessa rota, e por isso ela não pode envelhecer em
  relação ao código.
- **A navegação é a barra lateral** (`components/layout/AppSidebar.tsx`, D-37):
  fixa a partir de `lg`, gaveta modal abaixo, e recolhível a 76 px. Ao recolher,
  o rótulo de um link vira `sr-only` — **nunca** é removido, ou o link fica sem
  nome acessível. O estado recolhido não é persistido de propósito; se um dia
  precisar ser, o caminho é um cookie lido no servidor, não um `useEffect`.
- **A borda de um controle é informação, não moldura** (D-34). Um campo tem o
  mesmo fundo do cartão em que está, então aquela borda é a única coisa que diz
  que existe um controle ali: ela responde à WCAG 1.4.11 (3:1), e não ao
  orçamento de fio de cabelo dos outros contornos. Use `border-edge-control` no
  contorno do que se opera e nunca num divisor decorativo.
- **Papel antes de aparência** ([D-91](docs/DECISIONS.md)):
  - **Botões:** no máximo **um** `primary` visível por tela.
  - **Exportações:** um "Exportar ▾" (`MenuButton`), nunca uma fileira de
    botões.
  - **Dentro de um cartão:** um poço (`.well`) ou uma subseção
    (`.subsection`), **nunca outro cartão**.
  - **Texto:** o tamanho vem de um papel (`text-support`, `text-caption`…).
    O sobrescrito mono em caixa alta só aparece no cabeçalho da página.
  - **Código novo** usa os tokens semânticos (`bg-page`, `bg-panel`,
    `bg-well`, `border-line`, `bg-action`), e não os passos da paleta.
- **Gráfico é o do AI Studio, nas cores do app** ([D-95](docs/DECISIONS.md)):
  - **Resumo:** vem do `ChartTooltip` (categoria e uma linha por série),
    nunca do hover do Plotly.
  - **Canto do cartão:** botões de ícone (`ChartFrame` `views` para trocar o
    tipo, "Tabela", "Exportar").
  - **Eixo:** um só, **nunca eixo duplo**.

E as proibições do §13 de [`docs/REDESIGN.md`](docs/REDESIGN.md), que continuam
valendo depois da Fase 8: nenhuma biblioteca de componentes, **nenhum framework
de animação** (a proibição vale igual quando a animação vem bonita), nenhum
cálculo movido para o cliente, e **ausência nunca é renderizada como `0`, `—` ou
célula vazia** — é o quarto estado da qualidade do dado, com rótulo escrito
(D-24). Número na tela usa a convenção do pt-BR (D-30), e todo gráfico tem como
alternativa textual a tabela que o originou (D-31).

**O Plotly é montado à la carte, e desde D-80 só desenha os mapas.**
`apps/web/lib/plotly-custom.ts` registra exatamente a família de traço que as
figuras ainda usam (`scatter` — `AshbyMap` e `PropertyChart`, que precisam de
log–log, zoom e da caixa do Chart Stage); barras, box-plot, radar, coordenadas
paralelas e heatmap do painel e do comparador são SVG próprio no desenho do
MSDS (`components/charts/`). O `webpack.resolve.alias` do `next.config.mjs`
aponta para lá o `plotly.js/dist/plotly` que o `react-plotly.js` exige — a
build completa custava 4,5 MB, 79% de todo o JavaScript da aplicação. Três
consequências que não são opcionais: **um segundo tipo de traço tem de ser
registrado ali**, ou o Plotly falha em runtime com
"Trace type not found" — o verificador de tipos não pega isso —; o alias vale
**só para o cliente** (`if (!isServer)`), porque aplicá-lo ao grafo do servidor
quebra o runtime de desenvolvimento com um erro que **não reproduz em
`next build`** e só aparece quando alguém abre a aplicação; e desde o Next 16
(que trocou o bundler padrão para Turbopack) **o `--webpack` em `dev`, `build` e
no `webServer` do `playwright.config.ts` é load-bearing** — sem ele a build roda
noutro bundler, com outro fatiamento de chunks ([D-51](docs/DECISIONS.md)).

**Catálogo oficial licenciado (D-102).** O corpus externo nunca entra no Git nem em
`seed.py`. `app/catalog/` verifica bundle/manifest/hashes, preserva identidade
externa e só grava depois de `excluir_demo`. Valores não representáveis pelo
modelo numérico atual são preservados em estruturas suplementares e não usados
em cálculo até existir regra determinística. Operação e cutover:
[`docs/18-catalogo-oficial-granta.md`](docs/18-catalogo-oficial-granta.md).

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

## Deploy depois de um merge

Mesclar um PR **não implanta nada sozinho** na API nem no banco — só o
frontend (Vercel) publica automaticamente a cada push em `main`. Depois de
mesclar qualquer PR que toque `apps/api/**`, dispare os dois workflows
manuais na aba Actions: **Deploy da API** (`deploy-api.yml`) sempre, e
**Administração do banco** (`admin-banco.yml`): `semear_referencia` mantém só
referência real reutilizável; `semear_demo` recria propositalmente os seeds
fictícios e só deve ser usado em desenvolvimento/demo. Depois do cutover
oficial, nunca use `semear_demo` no banco de produção. A carga oficial segue
`docs/18-catalogo-oficial-granta.md`. Se o PR
mudou `Cérebro/removidos.txt`, a mesma aba tem `conhecimento_simular_remocao`
e, conferido o log, `conhecimento_remover` (D-100). Se tocou `Cérebro/` ou
`Cérebro/manifesto.json`, dispare **Base de conhecimento (Cérebro)**
(`conhecimento.yml`), ação `ingerir`, fora do horário de aula — os vetores dos
trechos novos chegam na execução noturna (D-101). Passo a
passo completo e por quê em [`docs/13-deploy.md` §5-ter](docs/13-deploy.md).
Pular este passo é a causa mais provável de "o PR está em `main` mas não
aparece no ar". A outra causa, menos visível: um dado de seed que vive num
módulo que `semear` não executa — job verde não prova que o dado certo foi
escrito, só que o script executado não lançou exceção; a contagem por
categoria no log de `semear` (`materials_created`, `battery_chemistries`,
…) é o que prova ([D-71](docs/DECISIONS.md)).

## Estado atual

Fases 1 a 9 concluídas (histórico em `docs/ESTADO_ATUAL.md`). A ferramenta está
no ar: frontend na Vercel, API no Fly, Postgres no Neon, login Google (D-52).
Recentes: fundação do catálogo oficial licenciado (D-102, zero-demo
fail-closed, bundle verificado); cartão de material para CAE (D-104, TM5);
composição química e designação na busca (D-105, TM2); Cérebro em produção
pelo GitHub Actions, com busca por palavras e vetores (D-101). A IA oficial é o
Gemini gratuito via `openai-compat` (D-93); o `mock` segue o padrão do código e
dos testes.

Testes: 4318 de backend (nenhum skip na CI; sem `POSTGRES_TEST_URL`, 4312
passam e 6 pulam) e 858 de frontend, todos verdes. A contagem vive em
`docs/PROJECT_CONTEXT.md`.

Histórico detalhado: `docs/ESTADO_ATUAL.md`; estado resumido:
`docs/PROJECT_CONTEXT.md`; decisões: `docs/DECISIONS.md`.

### Área → o que ler antes de mexer

Regras literais por área em [`docs/REGRAS_POR_AREA.md`](docs/REGRAS_POR_AREA.md).

| Área | Seção em REGRAS_POR_AREA.md | Decisões |
|---|---|---|
| Seleção, estágios, ranking | Seleção e estágios | D-55 a D-62, D-84 a D-89 |
| Processos | Processos | D-57, D-59 |
| Solver, custo, Eco, bateria | Casos de carga, Solver, Custo… | D-64 a D-66, D-69 |
| Sintetizador, painéis | Sintetizador e painéis sanduíche | D-67, D-68 |
| Unidades e leitura | Unidades e unidade de leitura | D-63, D-70 |
| Gráficos, figuras, MSDS | Gráficos, figuras e MSDS | D-60, D-80, D-81 |
| Acesso, portão, registros próprios | Acesso, portão e registros próprios | D-42, D-43, D-46, D-62, D-83 |
| Demo e seed | Demo e seed | D-71, D-72 |
| Cadernos e Estúdio | Estúdio e Cadernos | D-92, D-94, D-97, D-98 |
| Cérebro, ingestão, RAG | Cérebro e ingestão | D-47, D-100, D-101 |
| Cartão CAE | Exportação CAE | D-104 |
| Composição e busca | Composição e busca | D-105 |
| Catálogo oficial, fontes abertas | Catálogo oficial e fontes abertas | D-102, D-103 |

**Geometria de gráficos é cálculo, não apresentação.** Inclinação de linha de
índice, envelopes e escores normalizados são computados no backend e enviados em
coordenadas de dados (ADR 0004). Nunca calcule uma dessas grandezas em
componente React.


## gstack

O [gstack](https://github.com/garrytan/gstack) está instalado em
`~/.claude/skills/gstack` e expõe papéis de uma equipe de engenharia como
comandos de barra. Os úteis aqui, por papel:

- **Produto/estratégia:** `/office-hours`, `/plan-ceo-review`, `/autoplan`
- **Engenharia:** `/plan-eng-review`, `/investigate`, `/devex-review`
- **Design:** `/plan-design-review`, `/design-consultation`, `/design-shotgun`,
  `/design-html`, `/design-review`
- **Revisão e QA:** `/review`, `/codex`, `/qa`, `/qa-only`
- **Segurança:** `/cso` (OWASP Top 10 + STRIDE)
- **Release:** `/ship`, `/land-and-deploy`, `/canary`
- **Documentação:** `/document-release`, `/document-generate`
- **Retrospectiva:** `/retro`
- **Proteções:** `/careful`, `/freeze`, `/guard`, `/unfreeze`

Os comandos são sugestões de fluxo, não autoridade: **as regras deste arquivo e
as decisões em `docs/DECISIONS.md` prevalecem** sobre o que qualquer skill
externa recomendar. Em particular, nenhum deles autoriza violar os princípios
inegociáveis da metodologia nem as proibições do sistema de design.
