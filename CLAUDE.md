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

**Os quatro gargalos P0 e o P1-1 da plataforma de seleção entregues.** Depois de
comparar a ferramenta com o modelo funcional dos manuais do Granta EduPack —
matriz de maturidade e roteiro em `docs/14-plataforma-selecao.md` —, P0-1 a P0-4
saíram, e com o P0-4 o **exercício 11 do manual fecha por inteiro**. **A seleção deixou de ser de estágio único**
([D-56](docs/DECISIONS.md)): um estudo é uma **pilha ordenada de
`SelectionStage`**, e o resultado é a interseção dos habilitados. **Três** tipos,
e um estágio é uma pergunta só — enviar os campos de outro é recusado, nunca
ignorado: `limit` carrega a árvore AND/OR do M6, `tree` carrega uma seleção de
pastas da taxonomia, e `process` carrega a junção com o universo de processos. **`include_descendants` é o que `in_class` não sabe
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

1141 testes de backend (nenhum skip) e 232 de frontend, todos verdes. CI no
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
