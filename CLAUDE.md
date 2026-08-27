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
   (`.env`, ignorado). Há `.env.example`.
6. **Dados de demonstração** são fictícios e marcados (`is_demo`), com aviso na
   interface e nos arquivos.

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
tem dois renderizadores: `spreadsheet.py` (CSV/XLSX) e `html.py` (imprimível).

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
fale `/chat/completions`, escolhido por `AI_BASE_URL` — Groq no plano gratuito,
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

A interface tem um sistema de design próprio, **sem biblioteca de componentes**
(D-23) — exceto as primitivas de baixo nível envolvidas por `@material/web`
(botão, checkbox, radio, select, chip, diálogo, abas), exceção pontual aceita
em D-48. Três regras que não são questão de gosto:

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

E as proibições do §13 de [`docs/REDESIGN.md`](docs/REDESIGN.md), que continuam
valendo depois da Fase 8: nenhuma biblioteca de componentes, **nenhum framework
de animação** (a proibição vale igual quando a animação vem bonita), nenhum
cálculo movido para o cliente, e **ausência nunca é renderizada como `0`, `—` ou
célula vazia** — é o quarto estado da qualidade do dado, com rótulo escrito
(D-24). Número na tela usa a convenção do pt-BR (D-30), e todo gráfico tem como
alternativa textual a tabela que o originou (D-31).

**O Plotly é montado à la carte.** `apps/web/lib/plotly-custom.ts` registra
exatamente as cinco famílias de traço que as figuras usam (`bar`, `box`,
`heatmap`, `scatter`, `scatterpolar`), e o `webpack.resolve.alias` do
`next.config.mjs` aponta para lá o `plotly.js/dist/plotly` que o
`react-plotly.js` exige — a build completa custava 4,5 MB, 79% de todo o
JavaScript da aplicação. Duas consequências que não são opcionais: **um sexto
tipo de traço tem de ser registrado ali**, ou o Plotly falha em runtime com
"Trace type not found" — o verificador de tipos não pega isso —, e o alias vale
**só para o cliente** (`if (!isServer)`), porque aplicá-lo ao grafo do servidor
quebra o runtime de desenvolvimento com um erro que **não reproduz em
`next build`** e só aparece quando alguém abre a aplicação.

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

Fases 1 a 9 concluídas. **Fase 7 (relatórios e qualidade) concluída** — as
exportações CSV/XLSX, o relatório HTML imprimível, os testes end-to-end de
interface (A4, Playwright em `apps/web/e2e/`), a autenticação (A5) e a
auditoria (M2 — `AuditEvent`, quem mudou o quê e quando, retrato em vez de
junção viva, [D-43](docs/DECISIONS.md)) já saíram; falta só a arquitetura para
PPTX (B2, baixa prioridade). **A5** deu login exclusivamente por terceiros
(Google, OAuth 2.0 — sem senha em lugar nenhum do sistema), sessão em cookie
`httpOnly` que é linha de banco e não JWT, catálogo compartilhado entre todo
usuário autenticado e um `Project` por usuário isolando `SelectionStudy`
([D-42](docs/DECISIONS.md)); o Playwright injeta uma sessão fixa por cookie em
vez de passar pelo Google, sem expor bypass nenhum na API. **Fase 8 (redesign da
interface) concluída** — sistema de design próprio, as quatro promessas da
proposta visíveis na tela, acessibilidade medida no navegador nos dois temas e
a 375 px.
`docs/11-usabilidade.md` está instrumentado, mas **nenhuma sessão de teste com
usuários foi realizada** — enquanto a tabela de melhorias dele estiver vazia, o
§3.5 da proposta não foi cumprido.

A camada de IA da Fase 6 ganhou provedores reais (`claude-api`, `claude-cli`,
`openai-compat`) sem que serviço, guardrails ou interface mudassem — a
demonstração de que a camada é mesmo opcional e substituível.

**Fase 9 concluída** — o pedido tinha seis frentes (IA gratuita, sidebar,
repaginação mais colorida e arredondada, dashboards interativos, mapas
personalizáveis, laudo de engenharia completo), e as seis foram entregues: o
provedor `openai-compat` (D-36), o renderizador de figuras SVG do backend
(`app/exporters/figures.py`), a barra lateral (D-37), a repaginação — paleta,
forma e movimento (D-38) —, o painel de indicadores em `/painel` (D-39):
cobertura geral, composição por tipo de evidência, cobertura por classe,
ranking de lacunas e distribuição por propriedade com box-plot, tudo sobre
quartis e percentuais computados no backend (ADR 0004); os mapas
personalizáveis (D-40): um eixo do mapa em `/mapas` agora pode ser um índice de
desempenho — do catálogo ou expressão personalizada —, não só uma propriedade
cadastrada, com a linha de índice sobreposta e o eixo-índice mutuamente
exclusivos por desenho; e o laudo de engenharia (D-41):
`GET /api/exports/estudos/{id}/laudo.html`, um documento distinto do
relatório de seleção da Fase 7 — a mesma reexecução determinística e as
mesmas oito seções de auditoria, mais o gráfico de barras do ranking
(`figures.py`, agora exercitado fora de teste) e, quando a camada de IA está
ligada, a interpretação de `AIService.explain()`. Ausência de IA é
declarada, nunca silenciosa; responsável técnico é texto livre, nunca
validado. **As figuras da monografia que são capturas de `/estilo` precisam
ser refeitas depois de D-38.**

**Portão de assinatura concluído** — em cima do login de A5, todo usuário
autenticado agora também precisa de uma assinatura Stripe ativa para usar
qualquer rota da ferramenta; tenant é o usuário individual, sem
`Organization` nem `tenant_id` — mesma fronteira de isolamento de D-42, só
com verificação de plano por cima; um preço só no v1
([D-43](docs/DECISIONS.md)). `/entrar`, `/assinatura`, `/health` e as rotas
de `/billing` continuam fora do portão; o webhook do Stripe tem guarda de
ordem para uma reentrega fora de ordem não reativar assinatura cancelada.

**Branches de fase divergentes foram reconciliadas com `main`** (PRs #15, #14,
#7, #18): três eram ilusão de squash-merge (conteúdo já presente, git só
reportava divergência); a quarta (`fase-9-ia-e-laudo`) trouxe ~1.600 linhas
genuinamente novas — camada de conhecimento (`app/knowledge/`, ingestão do
Cérebro) e cobrança com Stripe —, ambas integradas por inteiro. O Cérebro
licenciado (livros comerciais + fichas ANSYS/Granta EduPack) veio por outro
caminho, o PR #17, e **continua no histórico de `main` por decisão explícita
do autor** — é a base de conhecimento da camada de IA, e ele optou por
mantê-la hospedada sabendo da exposição, ao contrário de
`fase-9-ia-e-laudo`, purgada antes do merge. Risco aceito, não pendência
([D-45](docs/DECISIONS.md)).

**O portão global de assinatura está ligado** ([D-46](docs/DECISIONS.md)):
entre os dois desenhos que o PR #18 deixou coexistindo em código, o autor
escolheu o binário do plano de 18/08 — `require_active_subscription` exige
`Subscription.status == "active"` em todo router exceto
`health`/`auth`/`billing`, e `AuthGate.tsx` voltou a ser um portão de dois
estágios (`/auth/me` → `/billing/status`). O plano Free/Pro de 21/08 fica
registrado como alternativa não implementada. `STRIPE_API_KEY` continua vazio
por padrão (D-36) — o portão bloqueia sem assinatura, mas `checkout`/`portal`
respondem 503 até um operador configurar o Stripe de verdade.

**RAG sobre o Cérebro entregue** ([D-47](docs/DECISIONS.md)): busca híbrida
(léxica BM25 + semântica, fundidas por *reciprocal rank fusion*) em
`app/knowledge/retrieval.py`, ligada só quando o provedor não é o `mock`, com
citação **verificada** por índice em `explain()` — nunca citação livre. A
ancoragem numérica foi provada intacta: `check_constraint` e
`ungrounded_numbers` nunca leem `context.retrieved`.

**PR #26 (`fase-9-ia-e-laudo`) mesclada por reconciliação manual do autor**,
depois de fechada sem merge por esta sessão (conteúdo já presente em `main`
por outro caminho). A única mudança substantiva que restava — `Dialog.tsx` e
`Tabs.tsx` migrados para `md-dialog`/`md-tabs` do `@material/web` — estende um
padrão em `main` desde a Fase 9 (`components/ui/material/elements.ts`) que
não tinha decisão registrada reconciliando-o com D-23 ("sem biblioteca de
componentes"). Resolvido nesta sessão como [D-48](docs/DECISIONS.md):
exceção pontual aceita, restrita a primitivas de baixo nível.

795 testes de backend (nenhum skip) e 162 de frontend, todos verdes. CI no
GitHub Actions roda em todo PR e push para `main`, agora com um quinto job
(`Lighthouse`, medindo desempenho/acessibilidade em 11 rotas — ver §12 do
PROJECT_CONTEXT.md).

**Desempenho medido**, com os números em `docs/PROJECT_CONTEXT.md §12`: o maior
*chunk* de JavaScript caiu de 4,5 MB para 981 KB (o Plotly completo era 79% de
todo o JS), as chaves estrangeiras ganharam índice, e o `upload` — único endpoint
`async` da aplicação — passou a rodar o serviço em *threadpool*, porque inline
ele congelava o event loop inteiro e não só a própria requisição. Duas
"otimizações" foram medidas e **recusadas** (índices de cobertura e `ANALYZE`,
este último 85% mais lento no `overview`).

**Estado detalhado, decisões, backlog e histórico da última sessão estão em
`docs/`** — ver PROJECT_CONTEXT.md, DECISIONS.md, TODO.md e
CHANGELOG_SESSION.md. Não duplique esse conteúdo aqui.

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
