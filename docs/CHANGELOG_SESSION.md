# Registro de sessões

Uma seção por sessão de trabalho, **da mais recente para a mais antiga**. O
arquivo respondia a "o que mudou na última sessão" enquanto houve uma só; com
quatro, guardar apenas a última apagaria justamente o que explica por que o
código está como está.

As sessões 1 e 2 foram escritas ao vivo. A seção da **sessão 2 foi reconstruída
depois**, a partir do `git log` e do `DECISIONS.md` — está marcada como tal, e é
por isso que ela tem menos detalhe de processo que as outras.

| Sessão | Quando | O que | Backend | Frontend |
|---|---|---|---|---|
| [11](#sessão-11--010926-a-020926--m5-topsis-promethee-ii-ahp-e-m6-restrições-aninhadas-entregues-via-sdd) | 01 e 02/09/2026 | M5 (TOPSIS, PROMETHEE II, AHP) e M6 (restrições aninhadas), dez tarefas mais uma rodada de correção da revisão final de branch, via SDD | 831 → 872 | 165 → 179 |
| [10](#sessão-10--270826-a-310826--backlog-b1b10-entregue-por-inteiro-via-sdd) | 27 a 31/08/2026 | Backlog B1–B10 (dez tarefas de baixa prioridade) entregue por inteiro, dirigido por subagentes | 795 → 831 | 162 → 165 |
| [9](#sessão-9--260826-a-270826--rag-sobre-o-cérebro-d-47-e-a-pr-26-fechada-e-remesclada) | 26 e 27/08/2026 | RAG sobre o Cérebro (D-47, 18 tarefas via SDD), PR #26 investigada/fechada e depois remesclada pelo autor | 713 → 795 | 157 → 162 |
| [8](#sessão-8--240826-a-250826--reconciliação-de-branches-m9-e-o-checkout-do-stripe-testado-ao-vivo) | 24 e 25/08/2026 | Reconciliação de branches, M9 (portão de assinatura, D-46) e checkout do Stripe testado ao vivo | 639 → 713 | 148 → 157 |
| [7](#sessão-7--210826--triagem-de-licenciamento-m1) | 21/08/2026 | Triagem de licenciamento (M1) | 632 → 639 | 148 (inalterado) |
| [6](#sessão-6--210826--estudo-de-caso-didático-a2) | 21/08/2026 | Estudo de caso didático (A2) | 630 → 632 | 148 (inalterado) |
| [5](#sessão-5--210826--auditoria-m2-e-a-instalação-do-ambiente-de-assistente) | 21/08/2026 | Fase 7: auditoria de alterações (M2) | 617 → 630 | 148 (inalterado) |
| [4](#sessão-4--110826-a-120826--fase-9-e-a-varredura-que-a-fechou) | 11 e 12/08/2026 | Fase 9 (seis frentes) e a varredura de fechamento | 436 → 591 | 123 → 141 |
| [3](#sessão-3--110826--os-provedores-reais-da-camada-de-ia) | 11/08/2026 | Fase 6: provedores reais de IA | 391 → 436 | 123 |
| [2](#sessão-2--050826-a-100826--fase-7-parcial-ci-obrigatória-e-fase-8) | 05/08 a 10/08/2026 | Fase 7 (relatório HTML), CI obrigatória, Fase 8 (redesign) | 362 → 391 | 44 → 123 |
| [1](#sessão-1--300726-a-040826--fases-5-a-7) | 30/07 a 04/08/2026 | Fases 5, 6 e 7 (exportação) | 169 → 362 | 13 → 44 |

---

# Sessão 11 — 01/09/26 a 02/09/26 — M5 (TOPSIS/PROMETHEE II/AHP) e M6 (restrições aninhadas) entregues via SDD

Ponto de partida: fim da sessão 10 (B1–B10 mesclados, commit `a97248d`).
Pedido: M5 e M6, os dois itens de `docs/TODO.md` que restavam além de baixa
prioridade — M6 já estava em "Média prioridade", pronto para ser feito; M5
carregava a nota "só faça se o orientador pedir", e o usuário confirmou
explicitamente, nesta sessão, que o orientador pediu — revertendo a nota e
tirando o item de fora de escopo, registrado assim sem meias palavras no
próprio TODO.md. Testes de backend: 831 → 872 (0 skip); frontend: 165 → 179.

## 1. Planejamento

Duas investigações de código em paralelo (`ranking.py`/`filters.py`/models
de seleção existentes) antes do plano —
`docs/superpowers/plans/2026-09-01-m5-m6-multicriterio-e-restricoes-aninhadas.md`,
dez tarefas em duas frentes sem sobreposição real: M5
(Tarefas 1–5, `rank_topsis`/`rank_promethee`/`derive_weights` até a UI) e M6
(Tarefas 6–10, `ConstraintGroup` até o editor recursivo), ordenadas
sequencialmente para que cada tarefa que toca um arquivo já mexido por uma
tarefa anterior (ex.: Tarefa 6 e a Tarefa 3 disputando o head do Alembic)
releia o estado real do arquivo em vez de supor números de linha do plano.

## 2. Execução — `subagent-driven-development`

Um implementador e um revisor por tarefa, como nas sessões 9 e 10. Três
episódios de limite de taxa, nenhum deles um bug de código:

- **Tarefa 1** despachada em haiku porque o sonnet ainda estava no limite
  semanal (reset por volta das 22h UTC); voltou a sonnet a partir da
  Tarefa 3, já com o limite semanal resetado.
- **Tarefa 4** (seletor de método + entrada de matriz AHP no frontend) teve
  dois implementadores sonnet parados pelo limite de sessão em sequência — o
  primeiro deixou um diff substancial não commitado (verificado por
  inspeção antes de redespachar, não descartado), o segundo travou numa
  segunda vez à espera do próprio processo de verificação em background sem
  nunca reportar. Em vez de despachar um terceiro implementador no mesmo
  padrão de trava, o controlador assumiu diretamente: acompanhou o processo
  Playwright do implementador anterior até o fim (ainda rodando de verdade,
  não morto), confirmou a aprovação, leu o diff e o gate completo pessoalmente
  e commitou como `0b1b128`.
- **Tarefa 9** (editor recursivo `ConstraintEditor.tsx`) — o implementador
  construiu a funcionalidade inteira corretamente, mas entrou num laço de
  mais de seis rodadas tentando fazer seu próprio script descartável de
  verificação manual clicar um alternador segmentado via um seletor
  encadeado que resolvia para zero elementos neste Chromium de sandbox. O
  controlador observou o diagnóstico do implementador, confirmou a causa
  raiz, corrigiu só o script descartável (nunca o código de produção),
  verificou o resultado manualmente e terminou a tarefa como controlador —
  commit `6a9d307`.
- Uma rerrevisão (rodada de correção da Tarefa 9, abaixo) também foi
  interrompida pelo limite de sessão do sonnet a meio caminho e retomada
  depois do reset, sem perda de trabalho.

**Achado Crítico da Tarefa 9, corrigido numa rodada.** A revisão de tarefa
pegou uma colisão de geradores de id: `page.tsx` mantinha seu próprio
contador `nextId()` e `ConstraintEditor.tsx` um `internalId()` separado,
ambos zerados em 0 e no mesmo formato `row-N`/`group-N` — as duas fontes
podiam produzir o mesmo id, quebrando a premissa de id único que
`updateConstraintById`/`removeConstraintById` fazem sobre a árvore inteira
(reabrir um estudo e clicar "Adicionar restrição" podia reaproveitar um id
já existente, fazendo editar ou remover uma linha afetar silenciosamente
outra). Corrigido unificando os dois num gerador só, `nextEditorId`,
exportado por `ConstraintEditor.tsx` (commit `db1caa5`), com teste de
regressão que reproduz o cenário exato — uma linha vinda de fora do editor
mais uma linha adicionada pelo próprio editor, provando que os ids nunca
colidem. Rerrevisão escopada confirmou.

## 3. Revisão final de branch e a rodada de correção

Com as dez tarefas revisadas uma a uma, a revisão final de branch inteira —
despachada no modelo mais capaz disponível, como o processo exige — achou
zero Crítico e 4 Importantes, todos do tipo que nenhuma revisão de tarefa
isolada alcança: código novo (M5/M6) encontrando código antigo intocado.

1. O campo `method` (TOPSIS/PROMETHEE/soma ponderada) não chegava a nenhuma
   tela, e duas superfícies pré-existentes afirmavam algo **falso**
   especificamente para TOPSIS: o painel de proveniência dos resultados
   caía no `else` e mostrava "Normalização: Min-máx", e a nota de
   "Contribuições" do relatório/laudo exportado (`export_service.py`)
   afirmava que a pontuação é a soma das contribuições — o próprio
   docstring de `rank_topsis` nega isso.
2. `AhpWeightsIn.matrix` aceitava `NaN`/`Infinity` — faltava o
   `allow_inf_nan=False` que todo outro campo numérico do arquivo já tem —,
   derrotando silenciosamente a rejeição dura de matriz inconsistente e
   produzindo 500 em vez do 422 padrão.
3. Um estudo PROMETHEE cujas restrições filtravam para 0–1 candidatos
   derrubava a resposta inteira com erro, descartando funil e resultado,
   enquanto `weighted_sum`/TOPSIS já degradavam para o estado vazio da
   tela — uma interação genuína M5×M6, porque o aninhamento de M6 torna
   esse funil bem mais alcançável.
4. O laudo de engenharia (D-41) descrevia a lógica de um estudo aninhado
   como um único combinador achatado, com linhas de subgrupo opacas —
   números corretos, mas a árvore booleana real não dava para reconstruir a
   partir do documento.

Despachada **uma** rodada de correção cobrindo os 4 Importantes mais as
limpezas Menores baratas do mesmo achado (chaves de i18n mortas, renomeação
de prefixo de id, limite explícito em `root_group.groups`, nota de
código-só-de-teste, dois testes novos) — nunca um corretor por achado. O
implementador verificou por conta própria uma instrução do próprio
despacho: a identidade soma-das-contribuições-igual-à-pontuação é
**verdadeira** para PROMETHEE (fluxo líquido, confirmado contra
`_score_promethee` e o teste já existente) e falsa só para TOPSIS — manteve
a afirmação para PROMETHEE e a retirou só de TOPSIS, divergindo da instrução
literal (equivocada nesse ponto) a favor do fato verificado. Commit
`73eb4a2` sobre `0d00ee7`. Rerrevisão escopada confirmou os 4 achados
corrigidos e os testes novos passando, sem achado novo.

## 4. Estado final

872 testes de backend (nenhum skip, antes 831) e 179 de frontend (antes
165), `ruff`/`black --check`/`typecheck`/`lint`/`build` limpos, `alembic
heads` num só head. `docs/TODO.md`: M5 e M6 saem de "Média prioridade" para
"Débitos já quitados", com a autorização do orientador e a limitação
conhecida de `StudyOut` (M6) registradas ali mesmo. Detalhe completo da
rodada de correção final em
`.superpowers/sdd/2026-09-01-m5-m6-multicriterio-e-restricoes-aninhadas/final-fix-wave-report.md`.

---

# Sessão 10 — 27/08/26 a 31/08/26 — Backlog B1–B10 entregue por inteiro, via SDD

Ponto de partida: fim da sessão 9 (PR #27 mesclada, D-48 registrado). Pedido:
"fazer as demandas de baixa prioridade B1-B10" — as dez pendências de
`docs/TODO.md` §"Baixa prioridade", cada uma pequena isoladamente (▁/▃ de
dificuldade) mas as dez juntas cobrindo praticamente todo o sistema:
importação, mapa de Ashby, catálogo de materiais, exportação. Testes de
backend: 795 → 831 (0 skip); frontend: 162 → 165.

## 1. Planejamento

Investigação de código (três agentes em paralelo, um por área: frontend/mapas,
importadores/encoding, geometria/busca/exportação) antes de escrever o plano —
`superpowers:writing-plans`, salvo em
`docs/superpowers/plans/2026-08-27-backlog-b1-b10.md` (removido ao final,
junto com o resto do workspace de SDD; o histórico do git é o registro).
Dez tarefas, uma por item do backlog, ordenadas para serializar as poucas
sobreposições de arquivo entre elas (ex.: B4 antes de B3, ambas em
`readers.py`; B6 antes de B8, ambas em `_envelopes`).

## 2. Execução — `subagent-driven-development`

Um implementador por tarefa, revisão de tarefa a cada uma, revisão final de
branch ao final — o mesmo processo já usado na sessão do RAG. Três achados
valem registro:

- **B3 (importação de JSON/SQLite):** a revisão de tarefa pegou um risco real
  de injeção SQL em `read_sqlite` — o nome de tabela era interpolado direto
  numa f-string, e embora o único chamador atual nunca passe um nome
  controlado por usuário, a função é pública com um parâmetro (`sheet_name`)
  desenhado explicitamente para reuso futuro (um seletor de tabela na UI,
  espelhando o que já existe para XLSX). Corrigido com o escape padrão de
  identificador SQL (duplicar aspas embutidas) antes da correção ser aceita;
  um teste de regressão usa exatamente o payload malicioso da PoC do
  revisor.
- **Limites de taxa, não bugs.** Duas vezes um implementador foi interrompido
  por "session limit"/"weekly limit" da API, não por um erro de código —
  verificado a cada vez via `git status`/`git diff` antes de redespachar (uma
  vez havia um diff correto sem commit, recuperado; a outra, nada a
  recuperar, redespachado do zero). O modelo usado nos despachos caiu de
  sonnet para haiku por cerca de um dia e meio até a janela semanal
  resetar, com avisos mais explícitos nos briefs para compensar.
- **Revisão final pegou dois bugs reais que dez revisões de tarefa (mais
  leves, em haiku) tinham deixado passar** — exatamente o motivo de uma
  revisão de branch inteira existir:
  - **B7:** o seletor "carregar gráfico salvo" era um no-op silencioso — a
    página aplicava os dados da *lista* de gráficos salvos
    (`SavedChartListItem`, que omite `configuration` de propósito, para não
    enviar o blob de filtro inteiro de cada gráfico só para popular um
    seletor) através de um duplo cast `as unknown as Partial<MapUrlState>`,
    em vez de buscar o registro completo com `getSavedChart(id)` — que já
    existia em `lib/api.ts` mas nunca era chamado.
  - **B8:** o objetivo de "trocar de escala sem recarregar" não era
    cumprido — faltava `placeholderData` no `useQuery` do mapa; sem ele, o
    React Query zera os dados a cada troca de `scale` (que faz parte da
    chave da consulta), desmontando o gráfico e mostrando o carregamento
    completo — exatamente o problema que B8 devia eliminar, com a lógica de
    troca instantânea que a Tarefa 7 construiu (`envelopes_alt`/
    `displayScale`) nunca chegando a rodar. O mesmo padrão
    (`placeholderData: (previous) => previous`) já existia em
    `apps/web/app/selecao/page.tsx` — só precisava ser copiado.
  - Uma única rodada de correção resolveu os dois, mais o achado (já
    rebaixado a Minor numa revisão de tarefa) de um `except` genérico
    demais em `property_service.py` mascarando um bug real de conversão de
    unidade como um 409 esperado — a correção expôs uma lacuna pré-existente
    em `app/calculations/units.py` (Pint levanta `TypeError` bruto para uma
    string de unidade malformada, antes silenciosamente engolida pelo
    `except` largo demais); a rerrevisão confirmou por leitura direta do
    arquivo que a ordem das cláusulas `except` continua correta (`Dimensio
    nalityError` não fica sombreado pela cláusula mais ampla).

## 3. Estado final

831 testes de backend, 165 de frontend, `ruff`/`black`/`typecheck`/`lint`
limpos, `alembic upgrade head` + seed confirmados contra um banco limpo (a
cadeia de duas migrations novas — `SavedChart` de B7, `MaterialKeyword` de
B5 — é linear). `docs/TODO.md` atualizado: B1–B10 saem de "Baixa
prioridade" (agora vazia) para "Débitos já quitados"; `SavedChart` sai de
"Entidades ainda não modeladas".

---

# Sessão 9 — 26/08/26 a 27/08/26 — RAG sobre o Cérebro (D-47) e a PR #26 fechada e remesclada

Ponto de partida: fim da sessão 8 (PR #21 mesclada, portão de assinatura
ligado). Testes de backend: 713 → 795 (0 skip); frontend: 157 → 162.

## 1. RAG sobre o Cérebro — busca híbrida, D-47

Plano de 18 tarefas (`docs/superpowers/plans/2026-08-25-cerebro-rag.md`),
executado por `subagent-driven-development`: um subagente implementador por
tarefa, revisão de tarefa a cada uma, revisão de branch inteira ao final.

O Cérebro (`Cérebro/`, hospedado em `main` desde D-45) estava íntegro mas
inerte — nada em `app/ai/` o lia. Passou a alimentar `interpret()`/
`explain()`: busca léxica (BM25) + semântica (embeddings, receita gratuita
Jina AI documentada em `.env.example`), fundidas por *reciprocal rank
fusion* (`app/knowledge/retrieval.py`), ligada só quando o provedor não é o
`mock`, com citação **verificada** por índice em `explain()` — nunca citação
livre (`guardrails.check_citations`). A garantia que mais importava foi
**provada**, não só mantida: `check_constraint`/`ungrounded_numbers` nunca
leem `context.retrieved`, então um número presente só num trecho recuperado
continua sendo recusado como restrição exatamente como antes — teste
dedicado, confirmado por dois revisores independentes.

A revisão final de branch (modelo mais capaz) encontrou 8 achados
importantes + 6 menores — nenhum crítico. Uma rodada de correção (9 itens:
tratamento de `ValidationError` na pontuação semântica, chave de embedding
dedicada, propriedade `configured` consolidada, corpus léxico carregado uma
vez em vez de recarregado por chamada, lock contra ingestão concorrente,
filtro `isinstance(i, int) and not isinstance(i, bool)` em índices de
citação, classe de teste morta removida, teste novo para fontes vazias em
`StudyExplanation`) mais uma rerrevisão escopada, ambas limpas. Decisão
completa em [D-47](DECISIONS.md). PR #25, mesclada pelo autor.

## 2. PR #26 (`fase-9-ia-e-laudo`) — investigada, fechada, depois remesclada pelo autor

Pedido: resolver as pendências da PR #26 (62 commits à frente de `main`,
aberta desde a sessão 8) para poder mesclar ou fechar. Antes de tentar
resolver conflitos, a arqueologia de git (comparação arquivo a arquivo do
branch contra `origin/main`, não só o resumo do `git`) mostrou que o
conteúdo substantivo da PR já estava em `main` — reconciliado por um
caminho diferente na sessão 8 (ver seção 1 daquela sessão, D-45). Fechada
sem merge, com comentário explicativo citando a reconciliação anterior.

O autor então reabriu a PR pessoalmente, reconciliou o branch contra o
`main` já atualizado e mesclou (commit `3ec451e`, 209 arquivos — bem menor
que os 363 originais, porque a maior parte já estava presente). A mudança
substantiva que restava: `Dialog.tsx` e `Tabs.tsx` migraram de
implementação própria para `md-dialog`/`md-tabs` do `@material/web`
(`8b74799`), estendendo o mesmo padrão já usado por botões, checkbox, radio,
select e chips desde a Fase 9 (`components/ui/material/elements.ts`, em
`main` desde o PR #8, 18/08 — portanto anterior a esta sessão).

**Achado não resolvido nesta sessão:** nenhum documento registrava o uso de
`@material/web`, e o padrão conflita textualmente com [D-23](DECISIONS.md)
("sistema de design próprio, sem biblioteca de componentes") e com a
proibição do §13 de [REDESIGN.md](REDESIGN.md). `@material/web` é a
biblioteca de Web Components do Material Design 3, com sua própria camada
de tema (100 variáveis `--md-sys-*` em `globals.css`, paralela aos tokens
`--brand-*`/`--accent` de D-28). Sinalizado ao autor, que decidiu: registrar
como decisão aceita em vez de reverter. Ver **D-48**.

## 3. D-48 — `@material/web` reconciliado com D-23

Confrontado via `AskUserQuestion` com três caminhos (registrar como exceção
aceita / reverter Dialog e Tabs para implementação própria / deixar
sinalizado sem decidir), o autor escolheu registrar. `DECISIONS.md` ganhou
D-48: exceção pontual a D-23, restrita a primitivas de baixo nível sem
estado de aplicação (botão, checkbox, radio, select, chip, diálogo, abas),
sempre atrás do wrapper próprio em `components/ui/` — nunca importadas
diretamente por uma tela. Nenhuma linha de código mudou; só a documentação
passou a descrever o que já estava em produção desde a Fase 9.

Um risco fica registrado, não mitigado: as ~100 variáveis `--md-sys-color-*`
são um segundo sistema de cor, escrito à mão em paralelo aos tokens
`--brand-*`/`--accent` de D-28, sem ponte automática entre os dois — e já
divergiram (`--brand-700` claro é `#1565c0`, `--md-sys-color-primary` é
`#005bbf`). Nenhuma tela mistura os dois de um jeito que quebre contraste
hoje, mas o risco de nova divergência existe a cada mudança de paleta.

## 4. Sincronização de documentação

`docs/PROJECT_CONTEXT.md`, `CLAUDE.md` (raiz) e este changelog atualizados
com a contagem de testes real pós-fix-wave e pós-PR #26 (795/162, não os
768/157 que a PR #25 tinha deixado registrado), e com o resumo do que a PR
#26 realmente trouxe — que não constava em nenhum lugar até este ponto.

---

# Sessão 8 — 24/08/26 a 25/08/26 — Reconciliação de branches, M9 e o checkout do Stripe testado ao vivo

Ponto de partida: fim da sessão 7 (PR #13 mesclada, M1 verde). Testes de
backend: 639 → 713 (0 skip); frontend: 148 → 157. A sessão teve quatro frentes
encadeadas — nenhuma pedida isoladamente, cada uma abrindo a próxima.

## 1. Branches de fase divergentes, reconciliadas com `main`

`git status`/`git log` mostravam quatro branches de fase (`fase-5-visualizacao`,
`fase-6-provedores-claude`, `fase-8-redesign-interface`, `fase-9-ia-e-laudo`)
como `N ahead / M behind` de `main`, mesmo depois de supostamente mescladas.
Verificação arquivo a arquivo (não confiar no resumo do git) mostrou que três
delas (PRs #15, #7, #14) eram **ilusão de squash-merge** — squash não cria
vínculo de parentesco, então o git segue reportando divergência de conteúdo já
presente; foram apenas fechadas de volta, sem conteúdo novo.

A quarta, `fase-9-ia-e-laudo`, tinha ~1.600 linhas genuinamente não
mescladas: a **camada de conhecimento** (ingestão do Cérebro para a IA,
`app/knowledge/`) e a **cobrança com Stripe** (`Subscription`,
`routers/billing.py`, `services/billing_service.py`). Trazida por inteiro no
PR #18, com duas ressalvas que viraram trabalho de sessão à parte:

- O **portão global de assinatura** (`require_active_subscription`) entrou
  desligado — a fase-9 e o plano Free/Pro de 21/08
  (`docs/superpowers/plans/`) discordavam sobre a arquitetura de cobrança, e
  ligar um dos dois por omissão decidiria a reconciliação sem que o autor
  tivesse escolhido. Isso virou **M9** no `TODO.md`, resolvido na frente 2
  desta sessão.
- O **Cérebro licenciado** (11 livros comerciais + 2 extratos + 103 fichas
  ANSYS/Granta EduPack) chegou a `main` por um caminho paralelo, o PR #17,
  antes mesmo desta reconciliação — e continua lá por decisão explícita do
  autor ao ser confrontado com a opção de purgar (**D-45**): risco aceito,
  não descuido, porque é a base de conhecimento da camada de IA.

`docs/CLAUDE.md`, `PROJECT_CONTEXT.md` e `TODO.md` foram sincronizados com o
estado real pós-reconciliação (PR #19) — contagem de testes, menções à
camada de conhecimento e à cobrança, e o registro das duas ressalvas acima
como pendências explícitas (não escondidas).

## 2. M9 — a arquitetura de cobrança, decidida

Duas arquiteturas coexistiam em código, nenhuma ligada: o portão binário do
plano de 18/08 (`require_active_subscription` em bloco, já totalmente
codificado) e o Free/Pro do plano de 21/08 (`EntitlementService`, nunca
implementado). Confrontado com os dois via `AskUserQuestion`, o autor
escolheu o binário — já pronto contra uma reimplementação do zero.

- **Backend:** `main.py` passa a aplicar `require_active_subscription` a
  todo router exceto `health`/`auth`/`billing` (inclusive `audit` e
  `sources`, que chegaram depois do desenho original mas seguem o mesmo
  princípio); o teste que afirmava o portão perdeu o `skip`.
- **Frontend:** `AuthGate.tsx` volta a ser um portão de dois estágios —
  `/auth/me` primeiro (não autenticado → `/entrar`), depois
  `/billing/status` (autenticado sem assinatura ativa → `/assinatura`).
- **Verificação ao vivo**, além dos testes: sem cookie → 401; sessão de
  e2e (que já escrevia uma `Subscription` ativa, preparada de propósito para
  este momento) → `GET /api/materials` 200; segundo usuário sem assinatura
  nenhuma → 403 em `/api/materials`, 200 em `/api/billing/status` (a rota
  continua alcançável para o `AuthGate` decidir o redirecionamento).

Decisão completa em [D-46](DECISIONS.md); M9 passou para "Débitos já
quitados" no `TODO.md`. PR #20.

## 3. Configurar o Stripe de verdade e testar o checkout — ao vivo, na máquina do autor

Pedido seguinte: "configura o Stripe de verdade e testa o checkout". Este
ambiente remoto bloqueia por política de rede **todo** domínio `*.stripe.com`
e `packages.stripe.dev` (confirmado via o proxy de saída, `403` em toda
tentativa de `CONNECT`) — sem contorno possível nem tentado, como a política
de negação exige. O trabalho de configuração e teste aconteceu inteiramente
na máquina Windows do autor, guiado turno a turno por este agente sem
nenhum acesso a ela: Stripe CLI, conta de teste, produto e preço; cliente
OAuth real no Google Cloud Console; Python nunca instalado (instalação do
zero, com o checkbox "Add python.exe to PATH"); `.venv` inexistente;
checkout local desatualizado sem o extra `billing` do `pyproject.toml`;
banco sem migrations aplicadas (`no such table: user`); porta 3000 ocupada
por processo zumbi, derrubando o CORS do `AuthGate`. Cada obstáculo foi
diagnosticado a partir do que o autor colava (traceback, log, captura de
tela) e resolvido com o comando exato para CMD do Windows — nunca PowerShell,
por restrição da máquina do autor.

Resultado da primeira tentativa: **pagamento completo** na Stripe (modo de
teste, cartão `4242 4242 4242 4242`), redirecionamento de volta com
`?status=sucesso` — mas `/assinatura` continuava mostrando "não assinado", e
`stripe listen` mostrava **todo** evento de webhook voltando `500`.

## 4. O bug do webhook: `.get()` num objeto que não é um dict

Diagnóstico a partir do traceback colado pelo autor:
`AttributeError: 'get' is a dict method, but a Event is not a dict. Use
.to_dict() to convert it.` — `billing_service.py` chamava `.get()` no
`event`/`data` que o SDK real da Stripe (`stripe>=10`, testado com `15.5.1`)
devolve como `Event`/`StripeObject`: aceita `[]` e `in`, mas **bloqueia
`.get()` de propósito**. Nenhum dos 713 testes pegava isso porque o fake de
teste sempre injetava um **dict Python puro**, que suporta `.get()`
normalmente — a suíte nunca exercitava essa restrição do SDK real.

Seguindo TDD para o bug: `test_billing_service.py` ganhou `_StrictStripeObject`
(aceita `[]`/`in`, rejeita `.get()`, espelhando de verdade o SDK real — o
próprio objetivo já declarado no cabeçalho do arquivo), e o fake de webhook
passou a devolver o evento embrulhado nele. Rodado sozinho, isso reproduziu
o exato `AttributeError` do autor num teste antes verde. A correção:
`_get(obj, key, default=None)` — lê via `obj[key] if key in obj else
default`, funcionando igual em `Event`/`StripeObject` real e em dict fake —
substituiu os cinco `.get()` em `handle_webhook` e nos três handlers de
evento. 713 testes voltaram a passar, `ruff`/`black` limpos. PR #21.

Novo teste ao vivo do autor, já com a correção: `stripe listen` mostrou todo
webhook voltando `204`, e `/assinatura` passou a refletir a assinatura
ativa — M9 testado de ponta a ponta, não só pelos 713 testes automatizados.

## 5. Documentação do teste ao vivo

`D-46` (com uma nova seção "Checkout real testado ao vivo"), a entrada de M9
em `TODO.md` e as seções 4/9 de `PROJECT_CONTEXT.md` foram atualizadas para
registrar a verificação de ponta a ponta e o bug encontrado/corrigido. A
limitação que resta deixou de ser "ninguém testou o fluxo" e passou a ser só
"nenhuma credencial de **produção** (`sk_live_...`) está configurada em
lugar nenhum" — D-36 já estabelece que nenhuma credencial tem valor padrão,
de propósito. PR #22.

## 6. Verificação

`ruff`, `black --check`, **713 testes de backend** (0 skip, matriz 3.11 e
3.12), **157 de frontend**, `alembic upgrade head` + seed num banco limpo —
tudo verde nos quatro PRs (#20, #21, #22) e nas quatro reconciliações (#15,
#14, #7, #18) mais o PR #19 de docs. Além dos testes: o checkout completo
foi executado de verdade contra a Stripe em modo de teste, não só simulado
contra um cliente falso — a mesma prática de "verificação ao vivo além dos
testes" que já tinha achado a unidade nula na camada de IA em sessão
anterior.

## 7. O que fica em aberto

- **Nenhuma sessão de teste de usabilidade** (§3.5) — a única pendência do
  trabalho como um todo que não é código, inalterada por esta sessão.
- **Nenhuma credencial de produção da Stripe configurada** — o portão está
  ligado e o fluxo foi testado em modo de teste; vender de verdade exige um
  operador configurar `sk_live_...` (D-36, decisão deliberada de não ter
  padrão).

---

# Sessão 7 — 21/08/26 — Triagem de licenciamento (M1)

Ponto de partida: o merge da PR #10 (sessões 5+6, M2+A2) em `main`
(`5f8b7f0`). Testes de backend: 632 → 639. O usuário mesclou a PR direto
("tire do rascunho e faça o merge, eu já revisei"), então este trabalho
reinicia o branch designado a partir de `main`, como as instruções de tarefa
preveem para uma PR já mesclada — não empilha em cima de histórico já
integrado.

## 1. Uma sessão que ganhou um segundo participante

No meio do trabalho de M2/A2, uma sessão desconhecida (`observer-sessions-e7`)
começou a mandar mensagens ecoando o progresso da sessão de volta — inclusive
anunciando que ia commitar/pushar/abrir PR na mesma branch. Sem confirmação de
quem era, isso foi tratado como um evento a reportar, não a obedecer: o
trabalho já verificado foi commitado e pushado primeiro, a outra sessão foi
instruída a não tocar na branch, e o usuário foi avisado no fim do turno. O
usuário confirmou depois que a sessão era dele mesmo, noutra máquina — registro
aqui porque a resposta (push primeiro, avisar, não assumir) é o comportamento
correto independente de a origem acabar sendo benigna ou não.

## 2. O pedido e a escolha do que atacar

Passado o merge, o usuário perguntou "qual o próximo passo?" sem apontar um
item. Restavam dois: M1 (triagem de licenciamento) e a sessão de teste de
usabilidade do §3.5 — esta última exige participantes reais, não é código que
uma sessão feche sozinha. M1 foi a escolha natural e confirmada pelo usuário.

(Um pedido paralelo — "estruture a pasta Cérebro" — apareceu antes disso.
"Cérebro" não é um conceito que existe em nenhum lugar do repositório; a
pergunta de esclarecimento foi interrompida pelo usuário com "esqueça por
enquanto", então fica registrada como não resolvida, não como decidida.)

## 3. O que foi implementado

`Source` (`app/models/source.py`) ganha `license_label`, `license_url`, a
sinalização explícita `contains_third_party_data` e um carimbo de quem
registrou a fonte e quando (`reviewed_by_user_id`/`reviewed_at`).

- **O portão fica na importação** (`ImportService._check_source_licensing`,
  `app/importers/service.py`), rodando tanto em `validate()` (feedback cedo)
  quanto de novo em `commit()` (o portão que realmente importa — o catálogo
  pode mudar entre as duas chamadas). Uma fonte **nova** sem
  `source_license_label` é recusada antes de qualquer linha ser escrita; uma
  fonte marcada `source_contains_third_party_data=True` exige também
  `source_review_confirmed=True` explícito — a "decisão humana obrigatória
  antes da incorporação" que o item do backlog pede.
- **Reusar um `source_label` já registrado não reabre a decisão.** A licença
  é fixada uma vez, na primeira importação que registra aquela fonte; a
  segunda, a terceira, todas as seguintes reaproveitam a linha como está.
- **O portão não cobre o cadastro manual de material**, de propósito — o
  item do backlog fala em "base... importada", e um material só já passa por
  uma pessoa logada decidindo linha a linha, o mesmo nível de decisão que o
  portão está formalizando para um lote inteiro de uma vez. Estender ao
  cadastro manual mudaria o contrato de `PropertyValueIn` (e os dois arquivos
  de tipos que o espelham) por um ganho que o item não pede.
- **`GET /api/sources`** lista toda fonte registrada com licença, sinalização
  e revisor — a mesma lógica de M2: uma trilha que só grava e nunca se mostra
  não sustenta alegação nenhuma de conformidade.
- **Backfill da fonte de demonstração do seed**, tanto na migration
  (`fc5a731dd162`, para um banco de desenvolvimento já semeado antes desta
  sessão) quanto em `app/db/seed.py` (para um banco novo) — a única fonte que
  já existia antes de M1 nunca aparece como "sem licença".

Decisão completa (com alternativas descartadas) em [D-44](DECISIONS.md).

## 4. Correções incidentais

Duas fixtures de teste já mescladas (`test_imports_api.py`,
`test_case_study.py`) registravam uma fonte nova sem licença — o próprio
portão que esta sessão introduziu as teria quebrado. Corrigidas com
`source_license_label` nos seus mapeamentos; `docs/12-estudo-de-caso.md`
ganhou uma nota apontando que reproduzir o caso hoje, contra uma fonte ainda
não registrada, exige o mesmo campo.

## 5. Verificação

`pytest` (639 testes, +7 desta sessão, em `test_source_licensing.py`),
`ruff check` e `black --check` verdes, `alembic upgrade head` + seed num
banco limpo (inclusive o backfill da fonte de demonstração). Sem verificação
de frontend — o pedido era só de backend, como M2.

## 6. O que continua em aberto

Só a sessão de teste de usabilidade do §3.5 — a única pendência do trabalho
como um todo que não é código e não pode ser fechada por quem programa
sozinho.

---

# Sessão 6 — 21/08/26 — Estudo de caso didático (A2)

Ponto de partida: fim da sessão 5 (PR #10 aberta, M2 verde). Testes de
backend: 630 → 632. Continuação da mesma sessão de trabalho após uma pausa —
o usuário voltou ("bom dia") e escolheu A2 entre as pendências restantes do
`TODO.md`, a mesma pergunta feita no início da sessão 5.

## 1. O caso escolhido

O tirante leve e rígido ("light, stiff tie") de Ashby: elemento sob tração
pura, minimizar massa para rigidez axial especificada, índice a maximizar
`M = E/ρ`. Três razões concretas, não só "é um exemplo clássico":

- O índice `rigidez-especifica` (`modulo_young / densidade`) **já estava
  semeado** no catálogo (`app/db/seed.py`), com a referência a Ashby nas
  próprias hipóteses — o caso reusa o que já existia, não inventa um índice
  novo.
- O resultado é genuinamente consolidado na literatura, com uma conclusão
  contraintuitiva bem documentada (cerâmicas vencem no índice bruto, e é
  exatamente por isso que o caso precisa de uma segunda restrição para
  chegar à resposta de engenharia real) — o tipo de caso onde "os candidatos
  batem com o esperado" é uma afirmação verificável, não uma opinião.
- A restrição de fragilidade usa `not_in_class`, que já existe na
  aplicação — nenhuma propriedade nova (tenacidade à fratura) precisou ser
  adicionada ao catálogo.

## 2. Dados: reais, não fictícios, e a rede bloqueada no meio do caminho

Princípio 1 do `CLAUDE.md` proíbe inventar propriedade de material. Nove
materiais (três metais, dois compósitos, dois polímeros, uma cerâmica, um
elastômero) precisavam de densidade e módulo de Young **reais**, não
fabricados. `WebFetch` para as fontes candidatas (MIT OpenCourseWare, en.wikipedia.org)
retornou `EGRESS_BLOCKED` — a política de rede deste ambiente não permite
essas requisições — em três domínios diferentes; só `WebSearch` (que devolve
um resumo sintetizado, não a página inteira) funcionou. As cifras finais
vieram desses resumos, cross-checadas entre duas a três buscas independentes
por material, e o documento (§3 abaixo) registra essa limitação em vez de
escondê-la atrás de uma citação com precisão que a própria coleta não tinha.

## 3. Execução real, não simulada

Servidor subido localmente contra um banco limpo (`alembic upgrade head` +
seed), autenticado pela mesma sessão fixa que o Playwright usa
(`ENVIRONMENT=development` + `E2E_SESSION_TOKEN`, sem bypass exposto por
rota nenhuma — mecanismo documentado em `docs/CLAUDE.md §5`, não um atalho
novo). Sequência real, via HTTP: upload → validação → commit da planilha
(`docs/estudo-de-caso/materiais-haste-leve-rigida.csv`) → `POST
/selection/run` (restrições + índice + ranking) → `POST /selection/studies`
(salvar) → exportação do relatório e do laudo. As sugestões automáticas de
coluna da importação acertaram as nove colunas sozinhas — a mesma
funcionalidade cujo bug de hífen/underscore a suíte A4 corrigiu numa sessão
anterior, funcionando corretamente aqui.

O resultado bateu exatamente com o previsto: CFRP em primeiro (35,3), os três
metais estruturais num platô de 1,8% entre si (25,48–25,93), a cerâmica
excluída pela restrição de fragilidade apesar de ter, de longe, o melhor
índice bruto (100,0, quase 3× o CFRP). Os três pontos que o exemplo do
tirante existe para ilustrar, reproduzidos por uma execução real, não
citados de memória.

A auditoria (M2, sessão anterior) registrou o próprio `POST
/selection/studies` deste estudo — a primeira vez que a trilha gravou algo
fora dos próprios testes que a exercitaram.

## 4. O que foi criado

- `docs/estudo-de-caso/` — a planilha real (não o `sample-data/` fictício), um
  `README.md` com as fontes, e `evidencias/` com as respostas reais da
  aplicação (JSON do `/selection/run`, relatório de seleção e laudo em HTML,
  relatório em CSV) — nada composto à mão fora da aplicação.
- `docs/12-estudo-de-caso.md` — o roteiro: caso escolhido, enunciado no
  formato Função/Restrições/Objetivo/Variáveis livres, dados e fontes (com a
  ressalva de precisão do §2 acima), execução real, resultado, comparação
  com a literatura em três pontos verificáveis, limitações, como reproduzir.
- `app/tests/test_case_study.py` — a mesma planilha embutida (mesmo padrão
  que `test_imports_api.py` já usa para sua própria fixture), a mesma
  seleção, e a asserção de que a ordenação e o platô dos metais se repetem a
  cada execução da suíte — a verificação do item 2.6/6 da proposta vira
  regressão de CI, não só um resultado manual documentado uma vez.

## 5. Verificação

`pytest` (632 testes, +2 desta sessão), `ruff check` e `black --check`
verdes. Sem verificação de frontend — o caso é inteiramente backend/API,
como o pedido original de A2 já era.

## 6. O que continua em aberto

Do backlog: M1 (triagem de licenciamento) e a sessão de teste de usabilidade
do §3.5 — esta última é a única pendência do trabalho como um todo que não é
código e não pode ser fechada por quem programa sozinho.

---

# Sessão 5 — 21/08/26 — Auditoria (M2) e a instalação do ambiente de assistente

Ponto de partida: `d20e7df` (fim da sessão 4 registrada aqui). Testes de
backend: 617 → 630. Testes de frontend: 148 (inalterado — o pedido era só de
backend).

> **A contagem de partida não bate com o fim da sessão 4** (591, não 617) — a
> diferença (26 testes) veio de trabalho entre as duas sessões que não ganhou
> uma seção própria neste arquivo (a autenticação A5, [D-42](DECISIONS.md), já
> estava em produção no início desta sessão). Registrado aqui para quem for
> reconciliar os números depois; não investigado nesta sessão, que tratava de
> outro assunto.

## 0. Ambiente do assistente

Sessão iniciada num container novo, sem nada instalado além do Claude Code em
si. Antes do trabalho de código, os três marketplaces e os dois plugins de
[`docs/CLAUDE_SETUP.md`](CLAUDE_SETUP.md) foram reconectados
(`claude-plugins-official`, `superpowers-dev`, `thedotmack`;
`superpowers@superpowers-dev`, `claude-mem@thedotmack`), e o gstack foi
clonado e instalado. A receita documentada (clonar em `~/.agents/skills/gstack`)
não registra as skills onde este ambiente as espera: qualquer diretório
literalmente chamado `skills/` faz o instalador do gstack tratar a instalação
como "já dentro de um diretório de skills" e symlinkar os comandos *ao lado*
do clone em vez de para dentro de `~/.claude/skills/`, então em
`~/.agents/skills/gstack` os comandos foram parar em `~/.agents/skills/*` —
onde o Claude Code deste ambiente não os enxerga. Clonar direto em
`~/.claude/skills/gstack` (mesmo nome de diretório final, container diferente)
ativa o mesmo caminho de código de um jeito que resolve para o lugar certo. À
parte disso, o instalador tenta baixar seu próprio Chromium via Playwright
para a função `/browse`; a rede deste ambiente bloqueia esse host
(`cdn.playwright.dev`) e o instalador, sem tratamento de erro nesse trecho,
aborta antes de chegar ao passo que registra as skills — contornado
comentando as duas chamadas de instalação do Chromium no script (o ambiente
já tem um Chromium próprio em `/opt/pw-browsers`, só não na revisão que este
Playwright vendorizado espera). Nenhuma mudança de projeto — só do ambiente do
assistente, fora do repositório.

## 1. O pedido e a escolha do que atacar

O pedido desta sessão foi genérico — "leia a documentação, baixe as skills do
projeto, continue de onde parou" — sem apontar qual pendência. `TODO.md`
listava quatro itens de peso comparável e natureza bem diferente: A2 (estudo
de caso, exige curar dado real citável — julgamento de domínio), a sessão de
teste de usabilidade do §3.5 (exige pessoas reais, não pode ser feita por um
agente), M1 (triagem de licenciamento) e M2 (auditoria, com dependência já
satisfeita por A5, spec autocontida, zero dependência de dado externo).
Perguntado, o usuário escolheu M2 — o item mais adequado a uma sessão autônoma
de uma vez só, e o único das quatro pendências que não dependia de julgamento
de domínio ou de um humano fora do teclado.

## 2. O que foi implementado

`AuditEvent` (`app/models/audit.py`, migration `d063cad4ae8b`): quem mudou o
quê e quando, para as entidades que uma pessoa edita à mão — material, classe,
propriedade, índice de desempenho e estudo de seleção.

- **Retrato, não junção viva.** `user_email`/`entity_label`/`project_id` são
  capturados no momento do evento, não lidos de uma junção em tempo de
  leitura — sobrevivem à conta, à entidade ou ao estudo desaparecerem depois.
  É a mesma lógica de proveniência que já vale para `material_property_value`
  (princípio 4 do `CLAUDE.md`), aplicada a "quem fez isto".
- **`changes` é um diff, não um dump.** Só os campos que de fato mudaram
  (`app/services/audit_service.diff_fields`) — um `PATCH` de um campo não
  imprime os outros dez inalterados, e um `PATCH` que não muda nada não grava
  evento nenhum.
- **A troca de valores de propriedade vira um diff por slug**, não um evento
  por linha — `PUT .../values` já é "substitua o conjunto inteiro", e a
  proveniência de cada valor já é rastreada à parte por linha.
- **A importação em lote fica de fora, de propósito.** `ImportService` monta
  `Material` diretamente (`app/importers/service.py`), sem os métodos
  públicos de `MaterialService` onde o `record_change` está — `ImportJob` já é
  a trilha desse fluxo, e auditar por linha um commit de milhares seria ruído.
- **`GET /api/audit`** lista por `entity_type`/`entity_id`, paginado, sob a
  mesma fronteira de projeto de todo endpoint de estudo — catálogo visível a
  qualquer usuário logado, `selection_study` só ao dono, inclusive depois de
  excluído (é exatamente o retrato de `project_id` que torna isso possível).

Quatro serviços (`MaterialService`, `TaxonomyService`, `PropertyService`,
`SelectionService`) ganharam um `user: User | None = None` no construtor,
todo roteador que os instancia passou a repassar o usuário logado, e
`AuditRepository`/`audit_service.record_change` fazem a escrita — sempre antes
do `commit()` do próprio serviço, para que o evento nunca fique numa
transação diferente da mudança que descreve.

Decisão registrada em [D-43](DECISIONS.md), com as alternativas descartadas
(dump completo em vez de diff, evento por linha de valor, filtro de
privacidade por junção viva, cobrir a importação).

## 3. Correções incidentais

Duas classes de repositório não tinham `flush()` (`PropertyDefinitionRepository`)
ou não seguiam o padrão de outras (mesmo método, só faltando) — descobertas
pelos próprios testes de auditoria ao precisar do `id` do objeto recém-criado
antes do `commit()`. Corrigidas junto, sem afetar nenhum comportamento
existente.

## 4. Verificação

`pytest` (630 testes, +13 desta sessão), `ruff check` e `black --check`
verdes; `alembic upgrade head` + `python -m app.db.seed` num banco limpo (o
mesmo portão que a CI roda). `test_audit.py` cobre: evento por ação e por tipo
de entidade; diff correto por campo e por slug de propriedade; nenhum evento
numa atualização sem mudança real; exclusão duas vezes grava um único
`EXCLUIDO`; um usuário não vê o estudo de outro nem por id nem numa listagem
mista; o dono continua vendo a exclusão do próprio estudo depois dela
acontecer; a importação em lote não grava evento de material. Sem verificação
de frontend — o pedido era só de backend, e nenhuma tela consome `GET
/api/audit` ainda (fica para quando houver pedido de interface para isto).

## 5. O que continua em aberto

Da Fase 7, só a arquitetura para PPTX (B2, baixa prioridade, fora de escopo
salvo pedido). Do trabalho como um todo: a sessão de teste de usabilidade do
§3.5 (nenhuma foi realizada), o estudo de caso didático completo (A2) e a
triagem de licenciamento (M1) — nenhum dos três é código que um agente possa
fechar sozinho numa sessão como esta.

---

# Sessão 4 — 11/08/26 a 12/08/26 — Fase 9 e a varredura que a fechou

Ponto de partida: `7c1d59f` (Fase 6 com provedores reais). **61 arquivos
alterados, +6.512 / −771** nos commits da Fase 9, mais a varredura de
fechamento. Testes de backend: 436 → 591. Testes de frontend: 123 → 141.

O pedido da Fase 9 tinha **seis frentes** — IA gratuita, barra lateral,
repaginação mais colorida e arredondada, painéis interativos, mapas
personalizáveis e laudo de engenharia completo. As seis saíram. Depois veio um
segundo pedido, de natureza diferente: *"verifique todas as fases, quero tudo
redondo, sem travar e consumindo menos máquina"* — uma varredura, não uma
funcionalidade.

## 1. A Fase 9

| Frente | O que entrou | Decisão |
|---|---|---|
| IA gratuita | provedor `openai-compat` (Groq, Ollama, OpenRouter, OpenAI) | [D-36](DECISIONS.md) |
| Barra lateral | `AppSidebar`, fixa em `lg`, gaveta abaixo, recolhível a 76 px | [D-37](DECISIONS.md) |
| Repaginação | paleta azul, forma e movimento como token | [D-38](DECISIONS.md) |
| Painel | cobertura, composição, ranking de lacunas, box-plot | [D-39](DECISIONS.md) |
| Mapas personalizáveis | um eixo do mapa pode ser um índice, não só uma propriedade | [D-40](DECISIONS.md) |
| Laudo | documento à parte, com figura do backend e interpretação da IA | [D-41](DECISIONS.md) |

Duas escolhas se repetem nessas seis e valem por si: **o backend passou a
desenhar figuras** (`app/exporters/figures.py`), porque um laudo que abre
offline anos depois não pode depender de uma captura de tela; e **quartis,
percentuais e escores continuaram no backend** (ADR 0004), mesmo quando o
consumidor é um gráfico.

## 2. A varredura de fechamento

Ela encontrou três defeitos de travamento, e nenhum deles aparecia nos testes:

| O que | Sintoma | Correção |
|---|---|---|
| `normalize_column` vetorial | acima de ~1e154 a soma de quadrados estourava e **todo material virava 0,0** — um empate silencioso, não um erro | `math.hypot`, que reescalona internamente |
| `to_canonical` | um erro de digitação comum (`"m**"`, `"(m"`, `"$"`) escapava do pint como `AssertionError`/`TokenError` e virava **HTTP 500** | as três exceções passaram a ser tratadas juntas — elas não têm base comum |
| Unidade patológica | `'m**9**9**9'`, dez caracteres, **prende um núcleo indefinidamente**: o pint interpreta unidade *avaliando* aritmética | guarda por forma nas duas portas de entrada; nem limite de tamanho nem de expoente sozinho resolvem, e `^` também é potência |

E dois de desempenho, ambos medidos antes e depois — os números estão em
[PROJECT_CONTEXT.md §12](PROJECT_CONTEXT.md): o Plotly completo (4,5 MB, 79% de
todo o JS) virou um bundle à la carte de cinco traços, e `parse()` de expressão
passou a ser memoizada, o que tirou 80% do custo de avaliar um índice por
material.

**O que a auditoria alegou e a medição desmentiu** importa tanto quanto o que
ela acertou: `ANALYZE` deixa o `overview` 85% **mais lento**; índices de
cobertura mais largos rendiam 13% por +33% de arquivo; o `DashboardService` não
tinha N+1 nenhum; e o `.env.example` já estava completo. Nada disso foi
aplicado, e o motivo ficou escrito para ninguém tentar de novo.

## 3. O que continua em aberto

Da Fase 7: PPTX, testes end-to-end, autenticação e auditoria. Do §3.5 da
proposta: **nenhuma sessão de teste com usuários foi realizada** — o
`11-usabilidade.md` está instrumentado e a tabela de melhorias dele continua
vazia. E as figuras da monografia que são capturas de `/estilo` precisam ser
refeitas depois de D-38.

---

# Sessão 3 — 11/08/26 — Os provedores reais da camada de IA

Ponto de partida: `9bd935e` (Fase 8 concluída). Ponto final: `7c1d59f`.

**23 arquivos alterados, +2.227 / −79.** Testes de backend: 391 → 436.
Testes de frontend: 123 (inalterado).

O pedido foi: *"desenvolva toda a camada de IA opcional; quero que a IA seja do
meu próprio Claude"*. "Meu próprio Claude" é ambíguo entre a API da Anthropic
com chave própria e o Claude Code já instalado e autenticado na máquina.
**Foram implementados os dois**, atrás da mesma interface e sem perguntar —
qualquer uma das leituras fica atendida, e a diferença entre elas virou uma
variável de ambiente.

## 1. Commits

| Commit | O que |
|---|---|
| `f98c772` | `docs:` CLAUDE.md e PROJECT_CONTEXT.md param de descrever um projeto que já mudou |
| `6917af3` | `feat(fase 6):` a camada de IA passa a falar com o Claude do usuário, sem mudar de forma |
| `9e5209a` | `fix(fase 6):` o cliente injetado do claude-api não pode depender do SDK que ele existe para dispensar |
| `7c1d59f` | `docs:` a contagem de testes acompanha os testes que a correção trouxe |

PR [#7](https://github.com/Streeft/MaterialSelect-AI/pull/7), com os três checks
obrigatórios verdes.

## 2. Funcionalidades criadas

### Dois provedores reais, um contrato inalterado

| `AI_PROVIDER` | Provedor | Autenticação | Determinístico |
|---|---|---|---|
| `mock` (padrão) | simulado, sem rede | — | **sim** |
| `claude-api` | API da Anthropic | `AI_API_KEY` / `ANTHROPIC_API_KEY` | não |
| `claude-cli` | o Claude Code da máquina | a assinatura já autenticada | não |

- `ai/prompts.py` — os prompts em português e os esquemas JSON compartilhados
  pelos dois provedores reais. O esquema enumera **os slugs do catálogo**, então
  o modelo escolhe de uma lista fechada em vez de escrever texto livre.
- `ai/claude_base.py` — a metade sem transporte: monta o pedido, lê a resposta,
  e reconstrói cada índice a partir do catálogo.
- `ai/claude_api.py` — transporte por `client.messages.create(...)` com
  `output_config` de `json_schema`. Sem `temperature` e sem prefill (ambos são
  400 nos modelos atuais); sem campo de *thinking* (adaptativo por padrão).
- `ai/claude_cli.py` — transporte por `claude --print --output-format json
  --json-schema ...`. O enunciado viaja por **stdin**, nunca por argv;
  `shell=False`; `cwd` num diretório temporário.
- `ai/caveats.py` — as ressalvas obrigatórias, extraídas do `mock` para serem
  compartilhadas.
- `AIService`, `guardrails`, `schemas` e a interface **não mudaram**. É essa a
  demonstração de que a camada é mesmo opcional e substituível.

### Duas garantias que viraram estruturais ([D-35](DECISIONS.md))

Não são checagens feitas depois. São campos que o modelo **nunca recebe**:

1. **O modelo escolhe um índice pelo slug.** Nome, expressão e objetivo vêm do
   catálogo depois. O campo da expressão não existe no esquema enviado — não há
   como inventar uma.
2. **As ressalvas da explicação são do backend.** O campo não existe no esquema
   — não há como omiti-las.

Slug desconhecido **passa adiante de propósito**, para o guardrail o recusar em
voz alta. Filtrar ali seria mais limpo e pior: o usuário nunca veria que algo
foi recusado.

### Interface

`AIAssistPanel` passa a distinguir "Provedor simulado" de "Modelo externo:
`<provedor>`", e o aviso ganha a frase que faltava — a leitura pode variar entre
execuções com o mesmo enunciado; o cálculo não, porque não passa por ali.

### Dependência

`anthropic` entra como **extra opcional** (`pip install -e ".[ai]"`). A CI
instala só `.[dev]` e não importa o SDK em nenhum caminho — verificado com
`'anthropic' in sys.modules` depois de `import app.main`.

## 3. Correções

| # | Defeito | Como apareceu |
|---|---|---|
| 1 | **Nome de material não entrava na ancoragem numérica.** `_result_context` nunca incluía os nomes no conjunto de termos permitidos. Com o catálogo de demonstração nada quebrava — nenhum nome tem dígito. Com um catálogo real, escrever "Aço AISI 1020 lidera" descartaria a explicação inteira com HTTP 400. | Revisão do próprio código, ao escrever o provedor real. |
| 2 | **O cliente injetado do `claude-api` dependia do SDK que ele existe para dispensar.** `_complete` importava `anthropic` na primeira linha, antes de olhar para o cliente. O comentário do `__init__` prometia por escrito que a injeção funcionava sem o pacote; não funcionava. | **Só na CI.** Aqui o pacote está instalado e os quatro testes passavam; na CI, que instala só `.[dev]`, falharam os quatro. |
| 3 | **Contagem de testes errada na documentação.** Os documentos diziam 389 backend / 44 frontend quando o repositório tinha 391 / 123 — a Fase 8 acrescentara 79 testes de frontend sem que o número fosse atualizado. | Conferência antes de reescrever o contexto. |

O defeito 2 rendeu a regra que vale a pena guardar: **um extra opcional só é
realmente opcional se algum teste rodar sem ele.** A correção inverteu a ordem
(cliente primeiro, que é o único passo que precisa do pacote e portanto o lugar
certo do erro que manda instalá-lo) e passou as classes de exceção por um
`_error_types()` que devolve um substituto inerte quando o SDK está ausente —
sem SDK não há exceção de SDK para traduzir, e o que o cliente levantar chega ao
chamador como está. Três testes novos fixam isso com `None` em `sys.modules`,
que é o que o CPython trata como módulo ausente.

## 4. Verificação

Além dos portões, **verificação ao vivo no navegador** com `claude-cli`:

- Enunciado com "no mínimo 300 °C" e "no máximo 3 g/cm3" → os dois números
  **copiados sem conversão**, com o trecho do enunciado citado como evidência;
  índices com as expressões do catálogo; `rejected` vazio.
- O mesmo enunciado **sem unidade** ("no mínimo 300") → **nenhuma restrição** e
  uma pergunta em aberto pedindo a unidade. A regra 4 do guardrail obedecida por
  um modelo que nunca viu o código.

**`claude-api` não foi exercitado contra a API real** — não havia chave no
ambiente. Ele foi testado contra um cliente falso, e a limitação está registrada
em [D-35](DECISIONS.md) e no §9 do [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

## 5. Decisões

[D-35](DECISIONS.md) — O provedor real escolhe por slug; a expressão e as
ressalvas nunca são dele.

## 6. Documentação

Atualizados: `CLAUDE.md` (raiz), `docs/CLAUDE.md`, `PROJECT_CONTEXT.md`,
`ARCHITECTURE.md`, `09-camada-ia.md`, `DECISIONS.md`, `README.md`,
`.env.example` e este arquivo.

---

# Sessão 2 — 05/08/26 a 10/08/26 — Fase 7 parcial, CI obrigatória e Fase 8

> **Seção reconstruída** a partir do `git log`, do `DECISIONS.md` e do
> `REDESIGN.md`. Não foi escrita durante a sessão, e por isso registra o que
> ficou no repositório, não como se chegou lá.

Ponto de partida: `2e70162`. Ponto final: `9bd935e`.

**116 arquivos alterados, +14.458 / −2.865.** Testes de backend: 362 → 391.
Testes de frontend: 44 → 123.

## 1. Commits

| Commit | O que |
|---|---|
| `ef0844d` | `docs:` checkpoint completo para reinício de contexto |
| `c008967` | `feat(fase 7):` relatório HTML imprimível e unicidade de valor por propriedade |
| `b9fa644` | `fix(fase 7):` ausência não vira palpite — nem em número, nem em rótulo |
| `a474e39` | `chore(ci):` torna os checks obrigatórios em `main` e registra o que isso custou |
| `24e2003` | Merge PR #5 |
| `9bd935e` | `feat(fase 8):` redesign da interface (#6) |

## 2. Fase 7 — relatório imprimível

- `exporters/html.py` — o mesmo modelo `Report` da planilha, renderizado como
  HTML de impressão. Escape por `html.escape` em todo valor, cabeçalho, título e
  nota, servido sob `Content-Security-Policy: default-src 'none'`.
- **O escape é por formato e não é intercambiável** — um `=` é inerte em HTML, e
  o apóstrofo da planilha apareceria na tela como corrupção do dado.
- Unicidade de valor por propriedade no banco.
- [D-20](DECISIONS.md) — HTML imprimível em vez de biblioteca de PDF.
- [D-21](DECISIONS.md) — campo opcional não preenchido continua `NULL`, nascida
  do defeito em que um rótulo defaultado imprimiu `__index__` no relatório e uma
  direção defaultada inverteu o ranking de um estudo salvo.

## 3. CI obrigatória

`scripts/protect-main.ps1` aplica a *ruleset* que faz o GitHub **recusar** o
merge sem os três checks. Sem ator de exceção — vale para o dono do repositório.
[D-22](DECISIONS.md) registra o custo: o repositório teve de virar público, e a
lista de nomes de job na ruleset passou a ser um acoplamento que precisa ser
mantido à mão.

## 4. Fase 8 — redesign da interface

O maior bloco da sessão: 89 arquivos de frontend. Um **sistema de design
próprio**, sem biblioteca de componentes.

- `components/ui/` — 19 primitivas novas (Button, Card, Field, Table, Tabs,
  Dialog, Popover, Alert, Badge, Stepper, ThemeToggle, DataQualityBadge,
  ProvenancePopover, focusTrap, icons…), com barril `index.ts`.
- `app/estilo/page.tsx` — o espécime vivo do sistema, de onde saem as figuras da
  monografia.
- `app/globals.css` + `tailwind.config.ts` — a paleta inteira como tokens
  `"R G B"`, lidos pelo Tailwind e, em runtime, por `lib/design/palette.ts`.
- `components/layout/AppHeader.tsx` — navegação agrupada por tarefa.
- `app/routes.a11y.test.tsx` — acessibilidade medida com axe em todas as rotas.
- `docs/REDESIGN.md` e `docs/11-usabilidade.md`.

Decisões [D-23](DECISIONS.md) a [D-34](DECISIONS.md). As de maior consequência:

- **D-23** — sistema de design próprio, sem biblioteca de componentes.
- **D-24** — qualidade do dado em três canais, nunca só cor; ausência nunca é
  `0`, `—` nem célula vazia.
- **D-28** — uma paleta só, compartilhada entre interface e gráfico.
- **D-30** — todo número na tela usa a convenção do pt-BR.
- **D-31** — a alternativa textual de um gráfico é a tabela que o originou.
- **D-34** — a borda de um controle é informação, não moldura (WCAG 1.4.11).

## 5. O que ficou pendente

`docs/11-usabilidade.md` ficou **instrumentado e vazio**: nenhuma sessão de
teste com usuários foi realizada. Enquanto a tabela de melhorias dele estiver
vazia, o §3.5 da proposta não foi cumprido.

---

# Sessão 1 — 30/07/26 a 04/08/26 — Fases 5 a 7

Ponto de partida: `8dbbd62` (Fase 4 concluída). Ponto final: `2e70162`.

**96 arquivos alterados, +9.593 / −372.** Testes de backend: 169 → 362.
Testes de frontend: 13 → 44.

## 1. Commits

| Commit | O que |
|---|---|
| `a1ea56d` | Fase 5: visualização (mapas de Ashby, linhas de índice, comparador) |
| `7dd7e68` | Fase 6: camada de IA desacoplada e painel de assistência |
| `3e27604` | Merge PR #1 |
| `bbea0ad` | Formatação do backend inteiro com black |
| `9522e4a` | CI no GitHub Actions |
| `8757872` | Actions para runtime Node 24; app para Node 22 |
| `94d6022` | Merge PR #2 |
| `a7cc413` | Correção: unidade explícita em limiar dimensionado (IA) |
| `29f95f9` | Merge PR #3 |
| `6be4664` | Fase 7 (1/n): exportação CSV/XLSX com relatório auditável |
| `2e70162` | Merge PR #4 |

> O commit da Fase 6 (`7dd7e68`) **não segue** o padrão `Fase N:` dos demais.
> Isso já causou a impressão de que a fase tinha sido pulada. Registrado aqui
> para quem for ler o `git log`.

## 2. Funcionalidades criadas

### Fase 5 — Visualização

**Backend**
- `calculations/powerlaw.py` — reescreve o índice como monômio `C·Πp^e` e
  **deriva** a inclinação log-log `−a/b`. `E/ρ`→1, `E^(1/2)/ρ`→2, `E^(1/3)/ρ`→3.
  Rejeita, com o motivo, o que não é lei de potência.
- `domain/geometry.py` — fecho convexo (monotone chain) dos envelopes.
- `calculations/performance.py` — avaliação de índice compartilhada entre seleção
  e mapas, com teste garantindo que concordam.
- `calculations/units.py` — `to_canonical_delta` para converter **diferenças**.
- `services/chart_service.py`, `schemas/charts.py`,
  `repositories/chart_repository.py`, `routers/charts.py`.
- `domain/ranking.py` — `normalize_column` tornada pública e reutilizada.

**Frontend**
- `/mapas` — eixos, escala, filtro por classe, envelopes, barras de erro,
  rótulos, linha de índice por material ou valor livre, exportação PNG/SVG.
- `/comparar` — tabela, barras, radar, coordenadas paralelas, heatmap.
- `lib/charts.ts`, `components/charts/AshbyMap.tsx`, `ComparisonView.tsx`.
- `types/plotly-dist.d.ts`.

### Fase 6 — Camada de IA

- `ai/provider.py` — interface estreita; o provedor recebe só catálogo e texto.
- `ai/mock.py` — provedor simulado **determinístico**, sem chave e sem rede.
- `ai/guardrails.py` — as regras executáveis.
- `ai/factory.py`, `schemas/ai.py`, `services/ai_service.py`, `routers/ai.py`.
- Frontend: `AIAssistPanel.tsx` (revisão opt-in item a item, incluindo o que os
  guardrails recusaram) e `StudyExplanation.tsx`.

### Fase 7 — Exportação

- `exporters/cells.py` — neutralização de injeção de fórmula.
- `exporters/report.py` — modelo do relatório e avisos obrigatórios.
- `exporters/spreadsheet.py` — CSV e XLSX.
- `services/export_service.py` — relatório de estudo em 9 abas e do catálogo.
- `routers/exports.py`, `components/ExportButtons.tsx`.

### Infraestrutura

- `.github/workflows/ci.yml` — backend em matriz 3.11/3.12 (`ruff`,
  `black --check`, `pytest`, `alembic upgrade` + seed) e frontend (`npm ci`,
  `typecheck`, `lint`, `test`, `build`).
- `.claude/launch.json` e `.claude/settings.local.json` (este último ignorado).

## 3. Correções

| # | Defeito | Como apareceu |
|---|---|---|
| 1 | **Isolamento de testes quebrado.** pysqlite emite BEGIN sozinho e nunca antes de SAVEPOINT; um teste que começasse por escrita escapava do rollback e vazava para todos os seguintes. A suíte ficava verde perdendo isolamento em silêncio. | Ao adicionar um teste cuja primeira instrução era um POST. |
| 2 | **Dados do usuário sem escape no hover do Plotly.** Nomes de material vêm de planilhas importadas e eram interpolados crus em texto que o Plotly renderiza como rich text. | Revisão do próprio código. |
| 3 | **Unidade nula virando canônica na IA.** "no mínimo 300 graus C" saía com `unit: null` e virava ≥ 300 K, isto é −173 °C: nenhuma restrição. Os quatro guardrails existentes não pegavam. | Demonstração ao vivo dos endpoints. |
| 4 | **`prettyUnit` renderizava `** 2.5` como `·· 2.5`** nas dimensões derivadas. | Conferência da tela no navegador. |
| 5 | **Rótulos de eixo colidindo no comparador.** Duas propriedades com o mesmo símbolo viravam a mesma categoria no Plotly e as séries se fundiam em silêncio. | Revisão do próprio código. |
| 6 | **Reta de índice vertical exigia intervalo positivo em X** que ela não usa. | Revisão do próprio código. |

Todos com teste de regressão. Vale notar que **os defeitos 3 e 4 só apareceram
ao abrir o navegador** — nenhum teste os pegava.

## 4. Melhorias e refatorações

- **Formatação:** backend inteiro passado pelo black (32 arquivos), em commit
  próprio, para viabilizar `black --check` como portão de CI.
- **Avaliação de índice extraída** para `calculations/performance.py`, eliminando
  a duplicação entre seleção e mapas.
- **`normalize_column` tornada pública** e reutilizada pelo comparador, para que
  barra e escore não possam divergir.
- **Envelopes deixaram de refazer requisição** ao alternar o checkbox — passaram
  a ser filtro de exibição.
- **Níveis numéricos de índice ligados na interface**, usando capacidade da API
  que já existia e estava sem uso.
- **Actions atualizadas** para runtime Node 24 e app para Node 22.

## 5. Decisões tomadas nesta sessão

Registradas em [DECISIONS.md](DECISIONS.md): ADR 0004 e as decisões D-08 a D-19.
As de maior consequência:

- **Geometria de gráfico é cálculo** (ADR 0004).
- **Todo número da IA tem de aparecer no enunciado** (D-08) — rejeita até
  conversão correta.
- **Limiar dimensionado tem de declarar unidade** (D-09) — nasceu do defeito 3.
- **Coordenadas paralelas sem `parcoords`** (D-12) — porque ele não expressa
  ausência.
- **Escape de fórmula visível, não destrutivo** (D-13).
- **Exportador reexecuta o pipeline** (D-14).

## 6. Documentação

Criados: `08-visualizacao.md`, `09-camada-ia.md`, `10-relatorios.md`,
`adr/0004-geometria-de-graficos-no-backend.md` e, neste checkpoint,
`PROJECT_CONTEXT.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `TODO.md`,
`DECISIONS.md` e este arquivo.

Atualizados: `CLAUDE.md` (raiz), `README.md`, `02-arquitetura.md`,
`04-metodologia-selecao.md`, `backlog.md`.

## 7. Processo

Quatro PRs, todos com CI verde a partir do #2 (que criou a CI):

| PR | Conteúdo | Merge |
|---|---|---|
| #1 | Fases 5 e 6 | `3e27604` |
| #2 | CI + formatação | `94d6022` |
| #3 | Correção de unidade na IA | `29f95f9` |
| #4 | Fase 7: exportação | `2e70162` |

Também nesta sessão: `main` publicado no remote e definido como branch padrão
(antes o `HEAD` apontava para `fase-5-visualizacao`), e o GitHub CLI instalado e
autenticado.

**Branches mescladas ainda existentes** (local e remoto): `fase-5-visualizacao`,
`fase-7-ci`, `fase-6-unidade-explicita`, `fase-7-relatorios`. Podem ser
removidas.
