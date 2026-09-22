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
   interface e nos arquivos. Criar dado de demonstração novo, ou apagar o que
   já existe, segue a regra fixa em
   [`docs/15-dados-demonstrativos.md`](docs/15-dados-demonstrativos.md) —
   leia antes de escrever um seed, não importa a ferramenta ou IDE.

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
JavaScript da aplicação. Três consequências que não são opcionais: **um sexto
tipo de traço tem de ser registrado ali**, ou o Plotly falha em runtime com
"Trace type not found" — o verificador de tipos não pega isso —; o alias vale
**só para o cliente** (`if (!isServer)`), porque aplicá-lo ao grafo do servidor
quebra o runtime de desenvolvimento com um erro que **não reproduz em
`next build`** e só aparece quando alguém abre a aplicação; e desde o Next 16
(que trocou o bundler padrão para Turbopack) **o `--webpack` em `dev`, `build` e
no `webServer` do `playwright.config.ts` é load-bearing** — sem ele a build roda
noutro bundler, com outro fatiamento de chunks ([D-51](docs/DECISIONS.md)).

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

## Deploy depois de um merge

Mesclar um PR **não implanta nada sozinho** na API nem no banco — só o
frontend (Vercel) publica automaticamente a cada push em `main`. Depois de
mesclar qualquer PR que toque `apps/api/**`, dispare os dois workflows
manuais na aba Actions: **Deploy da API** (`deploy-api.yml`) sempre, e
**Administração do banco** (`admin-banco.yml`, ação `semear`) sempre que
mexer em `app/db/seed.py` ou `app/db/seed_extended.py` — na dúvida, dispare
os dois; `semear` roda ambos os módulos, e os dois são idempotentes. Passo a
passo completo e por quê em [`docs/13-deploy.md` §5-ter](docs/13-deploy.md).
Pular este passo é a causa mais provável de "o PR está em `main` mas não
aparece no ar". A outra causa, menos visível: um dado de seed que vive num
módulo que `semear` não executa — job verde não prova que o dado certo foi
escrito, só que o script executado não lançou exceção; a contagem por
categoria no log de `semear` (`materials_created`, `battery_chemistries`,
…) é o que prova ([D-71](docs/DECISIONS.md)).

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

**Backlog de baixa prioridade B1–B10 entregue por inteiro**, dirigido por
subagentes. A revisão final de branch pegou dois bugs reais que as revisões
por tarefa tinham deixado passar — B7 (carregar um `SavedChart` era um
no-op, por usar os dados da lista em vez do registro completo) e B8 (faltava
`placeholderData` no `useQuery`, então a troca linear/log continuava
recarregando a tela) — ambos corrigidos e rerrevistos. Ver `docs/TODO.md`
para o resumo de cada item.

**M5 (TOPSIS, PROMETHEE II, AHP) e M6 (restrições aninhadas) entregues**,
dez tarefas dirigidas por subagentes mais uma rodada de correção. M5 estava
marcado no backlog como "só se o orientador pedir" — dito sem meias
palavras: implementado porque o usuário confirmou que o orientador pediu. M6
deu à árvore de restrições parênteses lógicos de verdade (`ConstraintGroup`,
AND/OR aninhado). Uma revisão final de branch inteira, no modelo mais capaz
disponível, achou 4 problemas Importantes que só apareciam onde M5/M6 novos
encontravam código antigo intocado — o campo `method` não chegava a nenhuma
tela e duas superfícies pré-existentes (proveniência dos resultados, nota de
"Contribuições" do relatório/laudo) afirmavam algo falso para TOPSIS
especificamente; `AhpWeightsIn.matrix` aceitava `NaN`/`Infinity`; PROMETHEE
derrubava a resposta inteira com 0–1 candidatos em vez de degradar como os
outros dois métodos; o laudo descrevia um estudo aninhado como um combinador
único opaco. Os quatro corrigidos numa rodada só, rerrevisão limpa. Ver
`docs/PROJECT_CONTEXT.md` §3 e `docs/07-selecao-deterministica.md`.

**Os quatro gargalos P0, o P1-1, o P1-2 e o P1-3 da plataforma de seleção entregues.** Depois de
comparar a ferramenta com o modelo funcional dos manuais do Granta EduPack —
matriz de maturidade e roteiro em `docs/14-plataforma-selecao.md` —, P0-1 a P0-4
saíram, e com o P0-4 o **exercício 11 do manual fecha por inteiro**. **A seleção deixou de ser de estágio único**
([D-56](docs/DECISIONS.md)): um estudo é uma **pilha ordenada de
`SelectionStage`**, e o resultado é a interseção dos habilitados. **Cinco** tipos
(`limit`, `tree`, `process`, `material` e — desde o P1-2 — `chart`),
e um estágio é uma pergunta só — enviar os campos de outro é recusado, nunca
ignorado: `limit` carrega a árvore AND/OR do M6, `tree` carrega uma seleção de
pastas da taxonomia, `process` carrega a junção com o universo de processos e
`chart` carrega uma região de um plano. **`include_descendants` é o que `in_class` não sabe
fazer** — `in_class` compara o slug da própria classe, e como todo material mora
numa folha, marcar um galho ali não admite ninguém; as duas continuam existindo
porque respondem a perguntas diferentes. `enabled` é coluna e não exclusão, e um
estágio desligado ainda diz quantos admitiria sozinho. Migração aditiva com
backfill: com **um** estágio o funil plano sai idêntico ao de antes. Pilha vazia
não existe — nem no banco, nem na API (`stages: []` é 400), nem na tela. A busca
virou linguagem de consulta com AND/OR/NOT, frase, parênteses e curinga
([D-55](docs/DECISIONS.md)), com `AND` como padrão e ligando mais forte que
`OR`.

**O P0-2 deu o segundo universo** ([D-57](docs/DECISIONS.md)): `ProcessClass`
hierárquica, `Process` e a associação N–N `material_process`, que é o que torna
o Tree Stage a **junção entre tabelas** do método — materiais filtrados pelos
processos que os servem. Três decisões que não se mexem: a **família do processo
é a raiz da taxonomia**, não uma coluna enum (dado semeado, não schema, e uma
verdade só); a **associação não carrega número nenhum** — um valor sobre o par
precisaria da proveniência de `MaterialPropertyValue`, e inventá-lo violaria o
princípio 1; e a semântica é **"algum"**, porque "soldável E forjável" são dois
estágios e a pilha já os intersecta. Material sem processo vinculado **não**
passa por um estágio de processo — mesma regra da restrição numérica. O funil
distingue `in_tree` de `in_process`, ou diria que a seleção filtrou por classe
quando filtrou por processo. A ficha do material lista os processos compatíveis,
no próprio payload da ficha.

**O P0-3 deu ao estudo o universo do resultado** ([D-58](docs/DECISIONS.md)):
`SelectionStudy.universe` é `material` (padrão) ou `process`, e o motor passou a
ser **um só** para os dois — `RecordSnapshot` é a forma compartilhada, porque
nada do que o motor faz é sobre *material*, é sobre *um registro com classe e
valores*. `tree` anda a taxonomia do próprio universo e a travessia nomeia o
outro (`process` num estudo de materiais, `material` num de processos), então
**qual taxonomia valida um `class_slugs` decorre do universo, não do nome do
campo**. Ranqueamento e índice são **recusados com o motivo escrito** num estudo
de processos — no salvamento e na execução —, porque processo ainda não tem
atributo e devolver ranking vazio seria lido como "ninguém pontuou bem".
`CandidateOut.material_id` virou **`record_id`** pela mesma razão que
`in_tree` virou `in_process`. E o exportador **não** resolve id de processo
contra a tabela de materiais: resolveria por coincidência de id e imprimiria
proveniência de material sob o nome de um processo.

**O P0-4 deu atributo ao processo** ([D-59](docs/DECISIONS.md)), e é o que fecha o
exercício 11. `ProcessAttributeDefinition`/`ProcessAttributeValue` têm o trilho
de proveniência inteiro de `MaterialPropertyValue` mais os dois tipos de valor que
o modelo não cobria. **O envelope de capacidade é comparado por alcance:** um
processo que conforma peças de 0,1 a 10 kg atende "≥ 5 kg", e colapsar no ponto
médio erraria — **isso não é a regra do intervalo de material**, onde a faixa é
dispersão em torno de um valor verdadeiro e o ponto médio o representa; a
diferença está no dado, não na fórmula. Por isso a regra **tem de chegar ao
leitor**: o rótulo da restrição diz "alcance do envelope", e a folha de
proveniência tem a coluna *Tipo de valor* mais a nota. **Discreto** é pertinência
a vocabulário fechado, e o operador negativo não libera ausência. `ProcessAttributeKind`
é load-bearing (o motor compara por regras distintas), garantido por
`CheckConstraint`: atributo discreto não tem unidade, numérico não fica sem ela.
Tabelas próprias e não uma coluna `universe` em `PropertyDefinition`, pela mesma
razão do D-57. Um envelope vive em **dois** mapas do snapshot de propósito — os
limites em `envelopes` para filtrar, o ponto representativo em `values` para
ranquear —, e o motor prefere o envelope ao filtrar. A recusa de ranqueamento do
D-58 foi **retirada**, não reescrita: recusa-se atributo inexistente e atributo
discreto onde se exige magnitude. `material_id` virou `record_id` também em
ranking e índice, como o D-58 anunciou que aconteceria quando os atributos
chegassem.

**O P1-2 fez o gráfico reprovar** ([D-60](docs/DECISIONS.md)), e com ele os três
tipos de estágio do método existem. Um estágio `chart` carrega o **plano**, a
**caixa** (um limite por eixo, em coordenadas de dados, nunca pixel) e a **linha
iso-índice** no nível guardado — número e não "a linha que passa pelo material 7",
porque um estudo salvo reexecuta para a mesma resposta. **Nada disso é geometria,
e a linha é o caso que parece ser:** o lado favorável de um contorno é
`índice ≥ nível` (ou `≤`), a mesma comparação que `ChartService._draw_levels` já
faz para desenhar a linha, o que faz figura e funil concordarem por construção.
**O que o estágio acrescenta ao de limites é um só e é real:** um eixo pode ser
uma quantidade **derivada**, e um estágio de limites nomeia slug de propriedade.
**Registro que não pode ser posto no plano nunca passa** — mesmo onde a caixa não
limita aquele eixo e mesmo sem caixa —, o que torna um estágio sem caixa e sem
linha um critério com sentido: "tem de ser plotável aqui". Um envelope entra pelo
**ponto representativo** aqui e por **alcance** num estágio de limites: duas
regras para o mesmo dado, de propósito, e o documento diz qual rodou.
`RecordSnapshot.derived` é o quarto mapa — preenchido pelo serviço antes de o
motor ver o registro, porque o domínio compara números e nunca avalia expressão.
Toda coluna da caixa é anulável e **fica** anulável: NULL é "sem limite" e `0` é
um limite, e o lado aberto é desenhado indo até a borda do gráfico com a legenda
dizendo que isso não é um limite. O relatório e o laudo redesenham **o plano em
que a decisão foi desenhada** — geometria ainda vinda de
`ChartService.property_map` —, e um estudo de processos pode ter um estágio de
gráfico, mas o plano dele não é desenhado: não existe mapa do universo de
processos ainda.

**O P1-3 fez a taxonomia virar registro e o segundo universo se navegar**
([D-61](docs/DECISIONS.md)). Uma pasta era rótulo; agora carrega `applications` e
`characteristics` — texto editorial, **fora do princípio 1 por construção**,
porque aquele princípio governa valor de propriedade e uma frase sobre uma
família não é um. O que as segura é a regra oposta: **NULL quer dizer "ninguém
escreveu"**, estado diferente de string vazia, e a tela desenha isso com rótulo
escrito (D-24) — painel em branco leria como "esta família não tem aplicações". O
**breadcrumb sai de `app.domain.taxonomy.lineages`**, a mesma travessia do Tree
Stage, então trilha e estágio não discordam sobre quem está sob quem,
e exclui a própria pasta. **`descendant_*_count` é o que torna a árvore
navegável:** a contagem direta é 0 num galho puro por desenho, e sem o total da
subárvore ninguém distingue "pasta vazia" de "pasta cujo conteúdo está um nível
abaixo". A ficha da família mostra o que está nela **e abaixo dela**. Navegar e
filtrar convivem porque são perguntas diferentes — o seletor estreita a lista, o
cartão de família sai para a página dela. A **ficha do processo** saiu junto:
`GET /api/processes/{slug}` devolvia tudo desde o P0-4 e nada renderizava, e o
**tipo do valor** aparece ao lado de cada atributo porque envelope é comparado
por alcance e escalar pelo próprio valor (D-59). `process_count` passou a contar
só ativos, revertendo decisão anterior — raciocínio no D-61.

**O P1-4 fechou a faixa P1** ([D-62](docs/DECISIONS.md)): o catálogo ganhou
dono e o usuário ganhou espaço. `Material.owner_id` é anulável — **NULL é o
catálogo compartilhado**, que é o que ele sempre foi (D-42), e preenchido é o
registro próprio de uma pessoa. Uma coluna e não uma tabela paralela, porque o
motor, o painel, as figuras e os exportadores fazem a um material as mesmas
perguntas independentemente de quem o criou. A regra de visibilidade mora em
`app/repositories/visibility.py`, é argumento de construtor nos quatro
repositórios que leem material, e **falha fechada**: sem observador, só o
compartilhado. **Escrita não tem predicado próprio de propósito** — o filtro de
leitura já devolve exatamente o conjunto gravável, e um `owns()` teria ramo
morto. Propriedade é **declarada, nunca inferida de quem digitou**
(`is_own_record` no payload), e sai como booleano, nunca como `owner_id`.
`Favorite` e `RecentRecord` alcançam um universo cada por duas colunas anuláveis
com XOR (a forma do D-60), porque o par polimórfico não teria chave estrangeira
nenhuma; nenhum dos dois carrega número. Recentes são **conjunto com ordem, não
log**, com teto de 20 e registrados por `POST` do cliente — GET que escreve não
é cacheável nem idempotente. O documento **declara** registro próprio, no topo e
na coluna *Registro* da folha de proveniência: o valor satisfaz o princípio 1,
mas não passou pela revisão de fonte e licença do M1. O canário
(`test_my_records_isolation.py`) varre `app.openapi()`, então rota nova entra na
varredura no dia em que nasce — **e não pega omissão por construção**, o que
custou um defeito real registrado no D-62.

**O P2 deu o fim do fluxo do manual** ([D-63](docs/DECISIONS.md)):
`Datasheet → Find Similar → Comparison Table`. Duas perguntas carregam o item, e
nenhuma é de implementação. **Em que espaço se mede distância entre materiais:**
log onde `allows_log_scale` permite — a mesma bandeira que os gráficos leem,
para figura e semelhança não discordarem —, escalada pela dispersão do conjunto
e **promediada, não somada**, senão a base mais larga pareceria mais distante
por ter respondido mais. A queda para linear é **da propriedade no run, nunca de
um registro**. **E quando um percentual significa algo:** só em escala de razão,
decidido por `units.is_ratio_scale` **comportamentalmente** (dobrar a magnitude
dobra a grandeza) e não por tabela privada do Pint — 20 °C não é o dobro de
10 °C. A **base é tudo ou nada** e volta na resposta, com os excluídos nomeados:
lista ranqueada sem a base que a produziu é veredito, não resultado. A
**referência é parâmetro da pergunta** e vive na URL (B1), nunca no servidor —
senão a mesma URL desenharia duas tabelas. As **cinco maneiras de não haver
percentual** têm cada uma sua frase (D-24), e a ordem entre "a linha não tem" e
"a referência não tem" está fixada por teste: a culpa é da referência, porque
consertá-la conserta a coluna.

**O P2 restante fechou a faixa** ([D-64](docs/DECISIONS.md)), e a primeira coisa
que o desenho mostra é que **Engineering Solver e Performance Index Finder são
uma derivação só**: o Finder a lê simbolicamente ("qual índice esta combinação
produz?"), o Solver numericamente ("quantos quilos dá?"). Separá-los criaria as
duas verdades que o D-60 e o D-63 recusaram cada um na sua camada. Daí
`app/calculations/load_cases.py`: sete casos padrão — tirante por rigidez, por
resistência e por escoamento; viga por rigidez e por momento; placa por rigidez;
coluna por flambagem —, cada um com a derivação escrita por extenso e a fatoração
de Ashby tornada literal: **`massa = fator estrutural / índice`**. O fator
estrutural só nomeia variável de projeto, o índice só nomeia slug de propriedade,
e **o índice é lido do catálogo pelo slug** e nunca escrito no caso — a regra do
D-35, pela mesma razão. `_validate` recusa **no import** um caso cuja expressão
estrutural saia do seu espaço de nomes: nome compartilhado deixaria um dado de
projeto sombrear uma propriedade, e o número continuaria plausível. **A variável
livre não é sempre a área** — na placa o desenho fixa a área em planta e libera a
espessura —, então cada caso declara qual libera e em que unidade, e a prova
dimensional lê a unidade declarada. Um caso de carga mora em **código e não em
tabela**, ao contrário da família de processo do D-57, porque é argumento e não
dado: argumento se verifica por revisão, como `units.py`. Viga em flexão e coluna
em flambagem caem no **mesmo** índice, e o documento diz por quê. A condição de
apoio é **escolha visível**, não constante escondida.

**O P3 começou pelo Part Cost Estimator, e ele destravou o objetivo custo**
([D-65](docs/DECISIONS.md)) — duas escalas de uma pergunta só.
`C = m·Cm/(1−f) + C_t/n + Ċ_oh/ṅ + C_c/(ṅ·t_wo·L)` sobre os processos
compatíveis, devolvida **termo a termo**: é como cada parcela anda com o lote
(material é piso, ferramental cai com 1/n, os dois de tempo não se mexem) e o
cruzamento entre dois processos conforme *n* cresce que decidem algo — total
sozinho seria oráculo. Premissa de oficina é entrada com valor visível, como a
condição de apoio do D-64. E o objetivo *custo* é a **mesma derivação lida outra
vez**: ρ vira ρ·Cm no agrupamento material, o fator estrutural não se mexe, e um
caso passa a nomear **dois slugs de índice** em vez de carregar duas derivações
— quem chama nomeia o objetivo, e o caso escolhe o índice (regra do D-35,
intacta).

A consequência que atravessa as duas metades: **dinheiro não está em sistema de
unidades nenhum.** `custo_massa` é adimensional de propósito, então a análise
dimensional devolve a **dimensão da massa** nas duas execuções do solver. Ela
continua provando a álgebra — um expoente errado num gêmeo de custo cai igual —
e deixou de nomear a resposta: por isso o objetivo, a unidade ("unidade monetária
não especificada") e a razão disso são ditos em **palavras**, na API e na tela.
Imprimir "R$" seria inventar dado. Na tela, o gêmeo de custo aparece **ao lado**
do de massa antes da escolha (quem não vê os dois não nota que o fator estrutural
não mudou), e o link para `/app/custo` **some** numa execução de custo: ele leva
`massa=`, e um custo ali seria um número de outra grandeza que o estimador não
teria como perceber.

**O Eco Audit fechou a faixa P3 menos o Synthesizer** ([D-66](docs/DECISIONS.md)):
cinco fases — material, manufatura, transporte, uso, fim de vida — em energia e
carbono, e **a resposta não é o total**, é qual fase domina. Quatro coisas não se
mexem ali. A fase de uso tem **dois modelos que não são variantes de um** (no
`estatico` a massa da peça não entra em lugar nenhum, então aliviar a peça
economiza *nada* ali; escolher errado inverte a auditoria), e os campos do outro
modelo são **recusados, nunca ignorados** — a regra do D-56. A fase de material é
cobrada sobre a **massa comprada**, `massa / (1 − f)`, a fatoração do D-65 — e é
por isso que uma auditoria exige processo: auditar uma peça é auditar *fazer* a
peça. A **reciclagem aparece duas vezes e nunca se cancela** (gasto no fim desta
vida, poupança no início da próxima), e abater crédito é escolha de método que
este módulo não faz. E **auditoria incompleta não se resume, só se lista**: sem o
dado de uma fase, o pódio e o total são recusados com o motivo escrito — aterro e
incineração ficam declarados sem energia, nunca valendo zero.

Energia e carbono têm **pódios independentes**, porque leem dados diferentes e
podem discordar. A energia é derivada pelo Pint em MJ; o carbono sai em palavras
("kg de CO₂"), porque uma razão entre massas de substâncias diferentes o Pint
reduz a adimensional — mesmo dever do dinheiro no D-65, por motivo diferente.
`TransportMode` é tabela própria e **não** um processo: um `Process` se liga a
materiais por `material_process`, e um navio não é compatível com um material.

**O Synthesizer fechou a terceira linha em zero da faixa P3**
([D-67](docs/DECISIONS.md)): compósito de dois constituintes e espuma de um
sólido, e a frase que justifica o módulo existir é que **um valor sintetizado não
é inventado; é calculado, e a diferença é que ele carrega a derivação**. Três
coisas o sustentam: o registro é **declarado** sintetizado com a receita gravada;
cada valor nomeia a lei e a **base** dela (exata, par de limites, empírica); e a
qualidade do dado é a **pior dos pais que a regra leu** — incerteza de entrada
propagada, incerteza de modelo dita em palavras e nunca como barra de erro
inventada.

A decisão que não se mexe: **a regra de mistura é propriedade da propriedade, não
da receita.** Densidade por volume (exata); módulo como **par de limites** de
Voigt e Reuss, porque a direção não está catalogada e a média entre eles seria um
número só onde a pergunta tem dois; custo e as grandezas ambientais por **fração
mássica**, o que exige as duas densidades; temperatura de serviço pelo mínimo. E
**resistência de compósito não tem regra nenhuma** — quem a controla é a
interface, sobre a qual o catálogo nada sabe —, enquanto uma **espuma tem**, por
ser o mesmo material com vazios: a diferença não está na fórmula, está no que se
sabe. Propriedade sem regra **não é sintetizada**, com o motivo escrito (D-24), e
uma propriedade que tivesse regra *e* motivo de ausência é recusada **no import**
por `_validate()`. Um sintetizado é sempre registro **próprio**, por
`CheckConstraint` escrito de forma portável (`NOT (is_synthesized AND owner_id IS
NULL)` — o PostgreSQL recusa `boolean = 1`).

**Os Sandwich Panels fecharam a faixa P3** ([D-68](docs/DECISIONS.md)): duas
faces sobre um núcleo, como terceiro tipo do Synthesizer. Metade dele é o
Synthesizer sem adaptação — densidade e grandezas por massa saem pelas **mesmas
regras do compósito**, na fração de espessura das faces, porque massa é massa e o
arranjo não a move. A outra metade é uma regra só, e ela não é mistura: o
**módulo de flexão equivalente**, que nas mesmas frações volumétricas fica
**2,7× acima do limite de Voigt** — o teto de qualquer regra das misturas.
Passar dele é impossível para uma mistura, e é exatamente o motivo de se
construir um painel. Duas degenerescências conferem a fórmula inteira (sem
núcleo devolve `Ef`; sem faces, `Ec`), e **só a razão t/c decide**: escala
self-similar não move nem `ρ*` nem `E*`, que é o que torna legítimo plotar o
painel ao lado de sólidos — e por que a tela não pede unidade de espessura.

Duas recusas que não se afrouxam. **Resistência é competição entre modos de
falha** (escoamento da face, cisalhamento do núcleo, enrugamento da face) e vale
o menor; só o primeiro é calculável, e o mínimo sobre parte dos modos é um
limite superior, não a resistência — é a recusa do pódio do D-66 aplicada a modo
de falha. E **onde existe convenção o número entra, onde não existe não entra**:
o módulo de um painel é, por convenção, o de flexão equivalente, e ele vai para
`modulo_young` com a lei colada na proveniência; a condutividade não vai, porque
um painel é anisotrópico por construção e o slug é isotrópico.

**O Battery Designer fechou a faixa P4 do lado do método** ([D-69](docs/DECISIONS.md)),
e o desenho inteiro sai de uma pergunta: **160 Wh/kg é argumento ou é dado?** A
contagem em série e em paralelo, os fatores de empacotamento e o custo nivelado
por ciclo são álgebra — moram em código, como os casos de carga do D-64. A
energia específica de uma química **não**: é medida sobre substância real, e um
literal Python ali seria o princípio 1 violado. Daí `BatteryChemistry`: **tabela
própria e semeada**, na forma do `TransportMode` (D-66), com cada linha nomeando
a sua `Source` e a sua citação — as nove não saíram do mesmo lugar. Não vai em
`Material` porque energia específica é propriedade que nenhum outro registro pode
ter: ficaria em ~0% no painel e subiria ao topo do ranking de lacunas, que é o
mesmo efeito pelo qual o D-68 recusou um slug para o módulo de flexão.
`design_pack()` recebe um `CellSpec` **pronto** e nunca consulta banco. Três
regras acompanham: **segurança térmica é rótulo ordinal, nunca número**; **a
moeda é dita em palavras** (os custos estão em dólares porque é a moeda em que a
literatura de célula cota — a regra do D-65 nunca foi "não imprima moeda", foi
não *inferir* moeda de um símbolo); e **o arquétipo carrega o requisito, não a
premissa de oficina** — os três fatores de empacotamento são entrada com valor
visível. Química inexistente é 404; catálogo vazio recusa o pódio com o motivo
escrito.

**A unidade de leitura fechou a matriz do EduPack em 32 de 32**
([D-70](docs/DECISIONS.md)), e o desenho sai de uma assimetria: **ler não é
guardar**. `to_canonical` roda uma vez, quando um número entra, e devolve valor
*mais trilha*; `from_canonical` roda toda vez que alguém olha, e devolve só o
número. `PropertyDefinition.display_unit` dá a convenção de leitura de cada
grandeza — e é **por propriedade e não por dimensão**, porque módulo, escoamento
e tração compartilham dimensão e se leem em GPa, MPa e MPa. A escolha do leitor
vive na **URL** (D-63), restrita a `accepted_units`, e unidade fora do conjunto é
recusada com as admitidas escritas.

**A leitura é acrescentada, nunca substitui:** `value_scalar` guarda o que a
fonte disse, os campos `display_*` saem ao lado, e um documento exportado carrega
as três unidades — a de leitura no cabeçalho, a canônica na proveniência, a exata
no método de conversão. **Três coisas ela não toca:** o avaliador de índices, a
diferença percentual (computada sobre o canônico, porque `is_ratio_scale`
pergunta à canônica) e a aritmética de uma incerteza, que é diferença
(`from_canonical_delta`: ±5 K lidos em °C são ±5 °C). **No mapa converte-se no
fim**, porque toda saída geométrica é um par de coordenadas — assim o fecho, a
elipse, a linha de índice e a comparação do Chart Stage continuam canônicos e o
D-60 fica de pé —, e uma unidade que não é puro fator de escala **não entra num
mapa**, com a razão escrita.

**Uma auditoria ao vivo achou os 70 materiais fictícios do PR #59 ausentes em
produção, e a causa era mais funda do que "esqueceram de rodar o seed"**
([D-71](docs/DECISIONS.md)): eles viviam em `apps/api/app/db/seed_extended.py`,
um módulo próprio que nenhum script — nem `admin-banco.yml`, nem
`scripts/seed.ps1`, nem a CI — jamais chamava. Rodar `semear` terminava verde
porque o script que ele de fato executava (`app.db.seed`) não lançava erro
nenhum; só não continha os 70 materiais. A separação em dois módulos
continua certa — `conftest.py` reexecuta `app.db.seed` como base de todo
teste do backend, e dobrar esse baseline para 75 materiais quebraria dezenas
de asserções por contagem fixa —, o que faltava era ligar o segundo módulo a
algo que roda. `admin-banco.yml` (`semear`) e `scripts/seed.ps1` agora
executam os dois, em sequência; o stub vestigial `seed_patch.py`, do mesmo
PR e nunca importado por nada, foi removido.

**Apagar dado de demonstração ganhou um único caminho** ([D-72](docs/DECISIONS.md)):
`apps/api/app/db/clear_demo.py` (`python -m app.db.clear_demo`, ação
`excluir_demo` de `admin-banco.yml`) apaga todo `Material` com
`is_demo=True`, não importa em qual módulo de seed a linha nasceu — a
pergunta "isto é fictício?" tem uma resposta só, a coluna, e não depende de
lembrar quantos arquivos de seed existem. A cascata (valores, palavras-chave,
favoritos, processos ligados, receita de síntese) é escrita em Python e não
só declarada no schema, porque o SQLite dos testes não aplica `ondelete` sem
uma `PRAGMA` que este projeto não liga. É uma exceção estreita à regra geral
do catálogo — material real continua **desativado**, nunca excluído — válida
só porque `is_demo=True` já é a prova de que não existe história real para
proteger. `docs/15-dados-demonstrativos.md` é a regra completa: como criar
dado de demonstração sem reabrir o D-71, como apagá-lo quando o catálogo
oficial chegar, e o que qualquer agente — Antigravity incluído — precisa ler
antes de escrever um seed novo neste repositório.

1741 testes de backend (nenhum skip) e 368 de frontend, todos verdes. CI no
GitHub Actions roda em todo PR e push para `main`, agora com um quinto job
(`Lighthouse`, medindo desempenho/acessibilidade em 11 rotas — ver §12 do
PROJECT_CONTEXT.md).

**S1 (upgrade de segurança) entregue:** `next` 14.2.35 → **16.3.4** e `postcss`
→ **8.5.28**, fechando 21 CVEs do Next e 4 do PostCSS. A 14.2.35 é a última da
linha 14 — não havia patch dentro do major, então subir era a única saída. Deu
certo com risco baixo porque o Next 16 **ainda aceita React 18**, e a base não
usa `cookies()`/`headers()` nem `params`/`searchParams` em server component. Três
quebras reais vieram junto e estão documentadas em `docs/TODO.md`: o Turbopack
virou padrão (daí o `--webpack`, [D-51](docs/DECISIONS.md)), `next lint` foi
removido (o script chama o ESLint direto) e o Next 16 bloqueia recurso de
desenvolvimento cross-origin (daí `allowedDevOrigins`, sem o qual o E2E não
hidratava).

**S2 (o resto das CVEs) entregue:** `npm audit` em `apps/web` de **27 para 14**.
`vitest` 2 → **5** (com `vite` 7 e `@vitejs/plugin-react` 5) fechou o único
crítico de então; `eslint` 8 → **9** com `eslint-config-next` 16 levou a config
para *flat config*; `@lhci/cli` 0.13 → **0.15.1**. Três armadilhas estão no §10
de `docs/CLAUDE.md`. E um achado que desmente o enunciado original do S2: o
lockfile antigo tinha `resolved`/`integrity` em **59 de 1095** entradas, então o
`npm audit` não enxergava a maior parte da árvore — os dois críticos de
`plotly.js`/`maplibre-gl` já estavam lá e não eram reportados. Eles **não**
chegam ao navegador (o Plotly é montado à la carte e nenhum traço de mapa é
registrado — medido no pacote, com controle positivo), mas a frase "nenhuma CVE
em código de produção" era subcontagem, não fato. O que resta é **S3**, e
nenhuma das cadeias tem versão corrigida publicada.

**Patch de design "Prisma" entregue** (sete tarefas dirigidas por
subagentes mais uma verificação final; detalhe completo em
`docs/TODO.md` — "Débitos já quitados"). Fase 1: paleta por rota substitui
a paleta única de D-38, um matiz de `--accent`/`--brand-*` por seção
trocado via `[data-section]` no `<html>`, sem revogar o método de medição
de D-38 ([D-49](docs/DECISIONS.md)). Fase 2: `/` virou vitrine pública sem
sidebar nem portão de login, nove árvores de rota migraram para
`/app/*` — as seis rotas do produto (`selecao`, `mapas`, `comparar`,
`catalogo`, `painel`, `importar`) mais `estilo`, `admin` e `materiais`, as
últimas três descobertas só durante a Tarefa 5 por não constarem na lista
de rotas da própria especificação — levando `AuthGate` junto — achado
nesta sessão, não previsto no README do patch —, `BottomNav` chegou para
telefone e o catálogo passou a
alternar `MaterialCards`/`MaterialTable` por breakpoint em vez do toggle
manual que existia antes ([D-50](docs/DECISIONS.md)). A verificação final
achou e corrigiu dois defeitos que nenhum teste automatizado pegava: um
locator do E2E que virou ambíguo pela duplicação de DOM cartão/tabela do
catálogo, e um bug de CSS — os seis blocos `[data-theme="dark"]
[data-section="…"]` usavam combinador descendente em vez de seletor
composto (as duas variáveis vivem no mesmo elemento `<html>`, nunca em
elementos aninhados), o que zerava a paleta por rota inteira no tema
escuro sem erro nenhum. Corrigidos e confirmados ao vivo em Chromium, não
só relidos no código.

**Desempenho medido**, com os números em `docs/PROJECT_CONTEXT.md §12`: o maior
*chunk* de JavaScript caiu de 4,5 MB para 981 KB (o Plotly completo era 79% de
todo o JS), as chaves estrangeiras ganharam índice, e o `upload` — único endpoint
`async` da aplicação — passou a rodar o serviço em *threadpool*, porque inline
ele congelava o event loop inteiro e não só a própria requisição. Duas
"otimizações" foram medidas e **recusadas** (índices de cobertura e `ANALYZE`,
este último 85% mais lento no `overview`).

**A ferramenta está no ar** ([D-52](docs/DECISIONS.md),
[13-deploy.md](docs/13-deploy.md)): frontend na Vercel
(`material-select-ai-web.vercel.app`), API no Fly (`materialselect-ai.fly.dev`),
Postgres no Neon, login pelo Google funcionando de ponta a ponta. **A API é
servida pela origem do frontend** por `rewrites()` — sem isso o cookie
`SameSite=Lax` não viajaria entre os dois domínios e o login entraria em laço
sem erro em log nenhum. O deploy e as operações de banco são feitos por dois
workflows de disparo manual (`deploy-api.yml`, `admin-banco.yml`), não por
terminal. Publicar exigiu corrigir cinco defeitos que nenhum teste pegava, e
duas armadilhas do Fly cuja assinatura é a mesma: **o job fica verde e a
aplicação não funciona**. Na instância publicada a camada de IA usa a Groq por
`openai-compat` (o `mock` segue sendo o padrão do código e o que os testes
exercitam) e o Stripe responde 503 — configuração, não defeito. **Ligar a IA
em produção custou mais dois defeitos do mesmo feitio**: o `AIUnavailableError`
sem tratador, que virava 500 de corpo em texto puro e apagava a mensagem do
provedor, e a requisição sem `User-Agent`, barrada pela Cloudflare na frente da
Groq com `error code: 1010` — um 403 que a mensagem antiga atribuía à chave.
Ambos em `docs/09-camada-ia.md`.

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
