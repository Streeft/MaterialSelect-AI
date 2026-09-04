# Backlog priorizado

Documento canônico do que falta. Substitui `backlog.md`, que agora aponta para
cá.

**Dificuldade:** ▁ baixa (horas) · ▃ média (1–2 dias) · ▆ alta (uma semana ou mais).

Identificadores (`A1`, `M7`…) são **estáveis**: um item concluído sai da lista e
vai para "Débitos já quitados", deixando lacuna na numeração em vez de renumerar
os vizinhos — outros documentos citam esses códigos.

---

## Alta prioridade

**S2 — CVEs remanescentes, todos no toolchain de desenvolvimento.** ▃ Depois
do S1 (ver "Débitos já quitados"), `npm audit` em `apps/web` sai de 30 para 27
achados — e **nenhum dos 27 é código que vai para produção**. São três cadeias,
cada uma presa a um major:

- **`vitest` 2.x → 5** (1 crítico, mais `vite`/`esbuild`/`vite-node`/
  `@vitest/mocker`): o crítico só vale com o *UI server* do Vitest escutando,
  que não sobe nem em CI nem em produção.
- **`@lhci/cli`** (arrasta `lighthouse`, `puppeteer-core`, `tar-fs`, `tmp`,
  `ws`, `extract-zip`, `inquirer`, `uuid`, `cookie`): só roda no job de
  Lighthouse. Atenção: o `fixAvailable` que o `npm audit` sugere aqui é
  `@lhci/cli@0.1.0` — uma versão **anterior** à instalada, não uma correção;
  não siga essa recomendação às cegas.
- **`eslint-config-next` 14 → 16** (com `@next/eslint-plugin-next` e `glob`):
  exige ESLint 9, e o projeto está no 8 com `.eslintrc.json`. Migrar significa
  ir para *flat config* — trabalho real, não um bump. Ficou de fora do S1 de
  propósito: nenhum desses CVEs é alcançável pela aplicação publicada, e
  misturar a migração do ESLint com a do Next dobraria a superfície de quebra
  num único PR.

A6 (Cérebro em `main`) foi decidido, não executado: ver "Débitos já
quitados".

---

## Média prioridade

Nenhum item aberto no momento — M6 foi entregue nesta sessão (ver
"Débitos já quitados").

---

## Baixa prioridade

Nenhum item aberto no momento — B1 a B10 foram entregues nesta sessão (ver
"Débitos já quitados").

---

## Entidades ainda não modeladas

`GeneratedReport`. A entidade fica apenas aguardando especificação de caso de uso.
(`User` e `Project` saíram desta lista com A5; `AuditEvent` saiu com M2;
`SavedChart` saiu com B7 — salvar e reabrir configurações de mapa.)

---

## Débitos já quitados

Registrados para não voltarem por engano:

- ~~**S1** — upgrade de segurança do Next e do PostCSS~~ — `next` 14.2.35 →
  **16.3.4** e `postcss` → **8.5.28**, fechando os **21 CVEs do Next** (SSRF em
  rewrites e em Server Actions, DoS em Server Components e no Image Optimizer,
  XSS com nonce de CSP, envenenamento de cache, divulgação de endpoints internos
  de Server Function) e os **4 do PostCSS** (path traversal por
  `sourceMappingURL`, XSS por `</style>` não escapado). Os dois saíram limpos do
  `npm audit`; o que restou virou **S2** e é todo de desenvolvimento.

  **Não havia caminho menor:** `14.2.35` é a última versão que a linha 14
  recebeu, então nenhum desses CVEs tinha correção dentro do major — o upgrade
  de major era a única opção, e não uma preferência. O que tornou isso viável
  com risco baixo é que o Next 16 **ainda aceita React 18**
  (`peerDependencies`), então a migração para o React 19 não veio junto; e a
  base não usa `cookies()`/`headers()` nem `params`/`searchParams` em server
  component, que são as duas maiores quebras do Next 15.

  **Três quebras reais apareceram, e nenhuma delas é bump mecânico:**

  1. **O Turbopack virou o bundler padrão** e o Next 16 recusa a build ao ver
     uma chave `webpack` sem uma `turbopack` — e essa chave é o alias que monta
     o Plotly à la carte. `--webpack` explícito em `dev`, `build` e no
     `webServer` do `playwright.config.ts`, com medição comparativa e o porquê
     em [D-51](DECISIONS.md). Maior chunk continua **980 KB**.
  2. **`next lint` foi removido.** O script `lint` passou a chamar o ESLint
     direto (`eslint app components lib --ext .ts,.tsx`), cobrindo os mesmos
     diretórios que o `next lint` cobria por padrão — nem mais, nem menos.
  3. **O Next 16 bloqueia requisição cross-origin a recurso de desenvolvimento
     (`/_next/*`)**, e trata `127.0.0.1` como origem diferente de `localhost`.
     Como a suíte E2E serve e navega em `127.0.0.1:3011`, o runtime do cliente
     era recusado, **a página não hidratava** e os dois specs morriam olhando
     para o "Verificando sessão…" renderizado no servidor. O diagnóstico foi
     difícil justamente porque não havia requisição falhando para apontar: o
     recurso bloqueado era o que dispararia as requisições. Corrigido com
     `allowedDevOrigins: ["127.0.0.1"]` no `next.config.mjs`.

  **E um quarto achado, que não é do Next mas veio à tona por ele:**
  `selectMwcOption` (`e2e/mwc.ts`) devolvia o controle enquanto o menu do
  `md-outlined-select` ainda fechava; o clique seguinte do spec caía sobre um
  `md-select-option` e repetia até estourar o teste. É corrida antiga, não
  regressão do upgrade: passava porque a primeira visita à rota compilava
  devagar e dava tempo de tudo assentar — com a rota já compilada (spec rodando
  em segundo lugar no mesmo worker) ela perde. Intermitente, aliás: reproduziu
  em algumas execuções e não em outras. O helper agora espera a **opção** sumir.
  Medido, e não suposto: o `md-menu` (role=listbox) reporta `visible=false` ao
  Playwright mesmo aberto, então esperar por ele seria um no-op; quem fica
  visível — e quem intercepta o clique — é a opção.

- ~~**Prisma** — patch de sistema de design (paleta por rota, vitrine
  pública, migração para `/app`)~~ — sete tarefas dirigidas por subagentes
  mais uma rodada final de verificação (plano em
  `.superpowers/sdd/2026-09-03-design-system-prisma/`). **Fase 1** (tokens e
  primitivas): `app/globals.css` ganhou blocos `[data-section="…"]` por
  rota — cada área do produto com seu próprio matiz de `--brand-*`/
  `--accent`, trocado via `data-section` no `<html>`
  (`components/layout/SectionTheme.tsx`) — substituindo a paleta única de
  D-38 sem revogar o método de medição dela: par mais apertado 5,59:1 (era
  5,01:1), nenhum par abaixo de 6,2:1 ([D-49](DECISIONS.md)).
  `--quality-*`/`--success`/`--warning`/`--danger`/`--info` e a paleta
  Okabe–Ito continuam intocados de propósito — proveniência e alerta não
  variam por rota. **Fase 2** (camada comercial): `/` virou a vitrine
  pública (`components/marketing/Landing.tsx`, sem sidebar nem portão de
  login), nove árvores de rota migraram para `/app/*` — as seis rotas do
  produto (`selecao`, `mapas`, `comparar`, `catalogo`, `painel`,
  `importar`) mais `estilo`, `admin` e `materiais`, as últimas três fora
  da lista de rotas da própria spec e descobertas só durante a Tarefa 5 —
  levando `AuthGate` junto — achado nesta sessão e não no README do
  patch, que só falava em mover `AppSidebar`/`LimitationNotice`: é
  `AuthGate` que hoje condiciona toda rota a sessão + assinatura ativa, e
  deixá-lo no layout raiz teria vazado o portão de login para a vitrine
  pública. `BottomNav` chegou para telefone e `MaterialCards` passou a
  renderizar ao lado de `MaterialTable` no catálogo (`sm:hidden`/`hidden
  sm:block`), DOM duplicado de propósito — custo aceito porque o catálogo
  é paginado. `PageHeader` substitui o `<h1>` manual em dez arquivos de
  rota (`group="estudar"`: seleção/mapas/comparar; `group="dados"`:
  catálogo/painel/importar; mais admin/classes, admin/propriedades,
  materiais/novo e materiais/[id]/editar);
  `/entrar` e `/assinatura` ficam de fora por decisão do próprio spec, que
  não lhes dá seção. **Descartado por decisão do spec, não por omissão:** a
  "coluna de cobertura" do catálogo que o README do patch pedia para ganhar
  `Bar` — não existe tal coluna nesta base, e o item foi abandonado já na
  Fase 1 em vez de forçado. Preços na vitrine ficam com `R$ —` (três
  planos, eixo definido — número de materiais, quem pode importar — nenhum
  valor inventado, item 1 da metodologia). Os cinco "refinamentos ainda
  opcionais" do README do patch continuam fora de escopo, registrados aqui
  em vez de silenciosamente descartados: `tabular-nums` generalizado,
  `PanelShell` em todo shell de rota, estudos-modelo por query string em
  `/selecao`, aviso de demonstração como convite de ativação, e qualquer
  copy adicional de vitrine além da que o patch já trouxe pronta.

  **Dois defeitos que a revisão de cada tarefa já tinha achado e corrigido
  antes desta entrega chegar aqui:** a Task 6 devolveu um badge
  `is_demo`/`keywords` que faltava em `MaterialCards` (presente na tabela,
  ausente no cartão) e documentou a remoção do toggle manual
  "Tabela/Cartões" do catálogo como [D-50](DECISIONS.md) — a troca por
  breakpoint automático era a leitura técnica certa (a spec pede
  exatamente isso), mas tinha saído sem registro.

  **Esta tarefa (verificação final) achou e corrigiu mais dois, nenhum
  coberto por teste automatizado até agora:** (1) `apps/web/e2e/golden-
  path.spec.ts` quebrava em modo estrito do Playwright —
  `getByText(MATERIAL_RIGIDO)` resolvia a dois elementos (o cartão novo da
  Task 6 e a linha da tabela, ambos no DOM ao mesmo tempo por desenho, só
  um visível por CSS de breakpoint) — corrigido escopando a leitura para
  `page.getByRole("table").getByText(…)`. (2) um bug de CSS real, achado só
  em navegador de verdade: os seis blocos `[data-theme="dark"]
  [data-section="…"]` em `globals.css` usavam combinador descendente
  (espaço) em vez de seletor composto, mas `data-theme` e `data-section`
  são escritos no mesmo elemento (`<html>`, não em dois aninhados) — a
  regra nunca casava, e as seis rotas caíam silenciosamente na cor de
  fallback única do tema escuro, zerando D-49 inteiro no escuro sem erro
  algum. `materialTheme.test.ts` não pega isso porque testa o *gerador* dos
  tokens, não a sintaxe deste arquivo CSS. Corrigido removendo o espaço;
  confirmado ao vivo com Chromium real que as seis rotas voltam a ter
  `--accent` distinto no tema escuro depois da correção.

  D-24 (ausência nunca vira zero) verificado ao vivo com um caso construído
  na hora, já que os cinco materiais de seed não tinham nenhum candidato
  sem escore: um material importado sem `modulo_young` recebe `score: null`
  no ranking e `Bar` não renderiza nenhum preenchimento — nem 0%, nem
  100% — só o rótulo "Dados ausentes: modulo_young"; o material com escore
  completo (único candidato pontuável) recebe 100%. 872 testes de backend
  (intocado por esta tarefa), 193 de frontend, 2 E2E e Lighthouse (11
  rotas, 33 execuções) verdes ao final.

  **Débito aberto pela revisão final de branch, não quitado nesta
  entrega:** `/app/estilo` (a página viva do guia de estilo, de onde saem
  as capturas usadas como figuras de interface na monografia) não foi
  atualizada para este patch — falta nela as três primitivas novas do
  barril (`Bar`, `PageHeader`, `PanelShell`), o token de raio
  `rounded-panel`, os seis tokens de superfície `rail-*` e, a lacuna mais
  visível, ela só mostra a rampa da seção `inicio`, sem forma de ver as
  outras seis paletas por rota que D-49 introduziu. A nota já existente no
  `CLAUDE.md` da raiz sobre as figuras da monografia precisarem ser
  refeitas depois de D-38 agora também vale depois de D-49/Prisma.
- ~~**M5** — Métodos multicritério adicionais (TOPSIS, AHP, PROMETHEE)~~ —
  implementado **por pedido explícito do orientador**, revertendo a nota "só
  faça se o orientador pedir" que este item carregava antes: o usuário
  confirmou explicitamente que o orientador pediu, então o item deixou de
  estar fora de escopo. `app/domain/ranking.py` ganhou `rank_topsis` e
  `rank_promethee`, ambos reaproveitando a mesma entrada genérica (critérios
  com direção/peso/normalização) da soma ponderada já existente via o
  auxiliar compartilhado `_split_complete_and_excluded` — exclusão de dado
  ausente e renormalização de pesos idênticas nos três métodos, nunca
  reimplementadas. **TOPSIS** decide por proximidade a um ponto ideal/anti-
  ideal; decisão de escopo registrada no próprio docstring: ao contrário da
  soma ponderada, a contribuição por critério não soma o escore (a razão de
  distâncias não é uma agregação linear). **PROMETHEE II** decide por fluxo
  de saída líquido de comparações pareadas; decisão de escopo: só a função de
  preferência "usual" (tipo I), sem limiares de indiferença/preferência, e
  exige ao menos dois materiais completos para comparar. `app/domain/ahp.py`
  ganhou `derive_weights` para obter pesos de critério a partir de uma matriz
  de comparação pareada (escala 1–9 de Saaty): pesos por **média normalizada
  das colunas** (a aproximação documentada de Saaty ao autovetor principal,
  não um solver numérico) e rejeição dura de qualquer matriz com razão de
  consistência acima de 0,1 — nunca devolve pesos parciais de julgamentos
  autocontraditórios. `RankingIn`/`StudyIn` ganharam `method`
  (`weighted_sum`/`topsis`/`promethee`), persistido em
  `SelectionStudy.method` (migration `f8c93a1d8844`) para que um estudo
  salvo reexecute com o mesmo método; `POST /api/selection/ahp-weights`
  chama `derive_weights` diretamente, sem persistência. No frontend,
  `apps/web/app/selecao/page.tsx` ganhou o seletor de método e
  `apps/web/components/selection/AhpMatrixInput.tsx` a entrada de matriz de
  comparação (só o triângulo superior é editável; diagonal e triângulo
  inferior seguem por construção). 852 testes de backend (nenhum skip) e 171
  de frontend, todos verdes ao final. Ver
  `docs/04-metodologia-selecao.md` para a descrição de cada método.
  **Addendo da revisão final de branch (corrigido na mesma sessão):**
  `AhpWeightsIn.matrix` aceitava `NaN`/`Infinity` e produzia 500 em vez de
  422 (faltava `allow_inf_nan=False`); um estudo PROMETHEE com menos de dois
  candidatos completos após o filtro derrubava a resposta inteira em vez de
  degradar como `weighted_sum`/TOPSIS já faziam; e `method` passou a
  aparecer de fato no painel de proveniência dos resultados e na nota de
  "Contribuições" do relatório/laudo, que antes afirmavam algo falso para
  TOPSIS especificamente. Detalhe completo em
  `.superpowers/sdd/2026-09-01-m5-m6-multicriterio-e-restricoes-aninhadas/final-fix-wave-report.md`.
- ~~**M6** — Restrições com parênteses lógicos~~ — `ConstraintGroup`
  (`app/models/selection.py`), um nó de árvore booleana AND/OR que se
  autorreferencia por `parent_group_id`; a migration `6845a9523f17` cria a
  tabela e faz o backfill — exatamente um grupo raiz por estudo já existente,
  com o `combinator` que o estudo já tinha, reapontando cada
  `SelectionConstraint` para esse grupo via a nova coluna `group_id`
  (nullable até o backfill terminar, só então travada `NOT NULL` — a ordem
  importa contra um banco com estudos salvos). `app/domain/filters.py` ganhou
  `ConstraintGroupNode` (dataclass simples, sem SQLAlchemy — `domain` não
  importa isso) e `apply_constraint_tree`, que percorre a árvore
  recursivamente por material; `test_single_root_group_matches_flat_apply_
  constraints` prova que um grupo raiz sem filhos avalia **identicamente** ao
  `apply_constraints` plano de antes — a garantia de compatibilidade
  retroativa do backfill, não só descrita, testada. Na API,
  `ConstraintGroupIn` (`app/schemas/selection.py`) é opcional em
  `StudyIn`/`FilterRequest`/`RunRequest` — a ausência de `root_group`
  preserva o formato plano `constraints`/`combinator` que essas rotas já
  tinham; quando presente, `SelectionService._persist_group_tree` grava a
  árvore de verdade, raiz primeiro e filhos em profundidade. No frontend,
  `apps/web/components/selection/ConstraintEditor.tsx` virou um editor de
  árvore recursivo — cada grupo com seu próprio alternador AND/OR e
  "Adicionar grupo"/"Adicionar restrição" em qualquer profundidade — e
  `/selecao` passa a enviar `root_group` ao rodar ou salvar. **Limitação
  conhecida, registrada e não corrigida nesta entrega:** `GET
  /api/selection/studies/{id}` (`StudyOut`, montado por
  `SelectionService._study_to_out`) ainda devolve as restrições como lista
  plana — não recompõe a árvore para a resposta. Reabrir ("Abrir") um estudo
  salvo com grupos de verdade mostra tudo achatado num único grupo AND no
  editor, sem aviso na tela. Não é perda de dado: não existe endpoint de
  edição in-place ainda, então a árvore real do estudo original continua
  intacta no banco e continua avaliando corretamente sempre que o estudo é
  **reexecutado** — mas é uma lacuna real de exibição/round-trip, não um
  "não se aplica". Ver `docs/07-selecao-deterministica.md` para a descrição
  do modelo de árvore e o exemplo trabalhado. 862 testes de backend (nenhum
  skip, antes 852) e 176 de frontend (antes 171), todos verdes ao final.
  **Addendo da revisão final de branch (corrigido na mesma sessão):** o
  laudo de engenharia (D-41) descrevia a lógica de um estudo aninhado como
  um único combinador achatado, com linhas de subgrupo opacas — corrigido
  com `SelectionService.describe_root_group`, que renderiza a árvore
  AND/OR real na aba "Problema" do relatório/laudo. Total final: 872 testes
  de backend, 179 de frontend.
- ~~**B1–B10**~~ — as dez pendências de baixa prioridade, entregues numa
  sessão dirigida por subagentes (o plano de implementação existiu em
  `docs/superpowers/plans/2026-08-27-backlog-b1-b10.md`; o histórico do git é
  o registro agora). **B1** filtros compartilháveis por URL
  (`apps/web/app/mapas/url-state.ts`, um parâmetro `estado` opaco em
  base64url, com o link antigo `?x=&y=` continuando a funcionar). **B7**
  `SavedChart` — configuração de mapa salva e reaberta, isolada por projeto
  no mesmo padrão de `SelectionStudy` (D-42); a revisão final de branch
  pegou um bug real (o botão "carregar" aplicava os dados da *lista*, que
  omite `configuration` de propósito, em vez de buscar o registro completo —
  corrigido). **B6** envelope elíptico ajustado como alternativa ao fecho
  convexo (`app/domain/geometry.py::fitted_ellipse`, autovalores em forma
  fechada de uma matriz 2×2, sempre backend, nunca no React — ADR 0004).
  **B8** evitar a segunda requisição ao alternar linear/log — o backend
  devolve `envelopes_alt` (o envelope na escala oposta) na mesma resposta; a
  revisão final também pegou que faltava `placeholderData` no `useQuery` do
  frontend, sem o qual a troca de escala continuava recarregando a tela
  inteira em vez de trocar instantaneamente — corrigido. **B9**
  renormalização em massa ao trocar só a unidade canônica de uma propriedade
  (dimensão física inalterada): todo `MaterialPropertyValue.normalized_value`
  é recalculado numa única transação atômica — computa tudo antes de
  escrever qualquer linha, um valor incompatível aborta a operação inteira
  sem gravação parcial; `value_min`/`value_max`/`uncertainty`/`original_unit`
  nunca são tocados (CLAUDE.md §1.4). **B5** busca por palavra-chave migrou
  de `LIKE` sobre `Material.keywords` convertido de JSON para texto para uma
  tabela de associação indexada (`MaterialKeyword`), mantendo `keywords`
  como fonte de verdade e sincronizando o índice a cada gravação. **B3**
  importação de JSON e SQLite — a revisão pegou um risco real de injeção SQL
  no nome de tabela interpolado em `read_sqlite` (inofensivo no único
  chamador atual, mas uma função pública com um parâmetro pensado para reuso
  futuro); corrigido com escape padrão de identificador SQL antes de
  mesclar. **B4** detecção de encoding além de UTF-8/Latin-1, via
  `charset-normalizer`. **B2** arquitetura de exportação PPTX
  (`to_pptx(report) -> bytes`), deliberadamente sem rota exposta, como o
  próprio item pedia. **B10** `httpx2` instalado para calar o aviso de
  depreciação do TestClient do Starlette. 831 testes de backend (0 skip,
  antes 795) e 165 de frontend (antes 162) ao final; a revisão final de
  branch rodou `alembic upgrade head` + seed num banco limpo para confirmar
  que a cadeia das duas migrations novas (`SavedChart`, `MaterialKeyword`) é
  linear.
- ~~**RAG sobre o Cérebro**~~ — o Cérebro (D-45) deixou de estar inerte em
  `main`: `app/knowledge/retrieval.py` faz busca híbrida (BM25 + semântica,
  fundidas por *reciprocal rank fusion*) e alimenta `interpret()`/`explain()`
  da camada de IA com trechos numerados, *gated* por `provider.simulated` — o
  `mock` nunca aciona a busca, preservando a garantia de determinístico e sem
  rede. `explain()` ganhou citação **verificada** por índice
  (`guardrails.check_citations`), não citação livre: um índice fora do que
  foi de fato recuperado naquela chamada é descartado. A garantia mais
  importante da metodologia ficou intacta e provada, não só prometida: um
  número presente só num trecho recuperado continua sendo recusado como
  restrição, porque `check_constraint`/`ungrounded_numbers` nunca leem
  `context.retrieved` — teste dedicado cobre exatamente isso, e dois
  revisores confirmaram separadamente que nenhum caminho novo alcança essas
  funções. Receita gratuita de embeddings (Jina AI, 1M tokens/mês sem
  cartão) documentada em `.env.example`, sem padrão de propósito (mesmo
  raciocínio de `AI_BASE_URL`, D-36); sem nada configurado, cai para busca só
  léxica. 55 testes novos de backend nesta entrega; 795 no total (nenhum
  skip) depois da rodada de correção da revisão final e da PR #26. Ver
  [D-47](DECISIONS.md) e [09-camada-ia.md](09-camada-ia.md).
- ~~**M4** — Unificar o contrato de tipos~~ — npm workspaces (`package.json`
  na raiz, `workspaces: ["apps/web", "packages/shared-types"]`) +
  `transpilePackages` em `next.config.mjs`. `packages/shared-types/index.ts`
  passa a ser importado de verdade por `apps/web` (como
  `@materialselect/shared-types`), não só copiado à mão; `apps/web/lib/types.ts`
  virou um barril de reexportação, preservando os 39 pontos de importação que já
  usavam `@/lib/types`. A divergência que a duplicação escondia (`x_quality`/
  `y_quality` não-nulos em `shared-types`, corretamente nulos em
  `apps/web/lib/types.ts`) foi resolvida ao consolidar num arquivo só — a
  versão de `apps/web`, que era a exercitada pelo typechecker. Ver [D-16](DECISIONS.md).
- ~~**M9** — Reconciliar as duas arquiteturas de cobrança~~ — **decidido: o
  portão binário do plano de 18/08 é o que fica ligado.** `require_active_
  subscription` passou a valer em todo router exceto `health`/`auth`/`billing`;
  o plano Free/Pro de 21/08 fica registrado como desenho alternativo, não
  implementado. `AuthGate.tsx` voltou a dois estágios (`/auth/me` →
  `/billing/status`); a sessão fixa de E2E/Lighthouse já escrevia uma
  `Subscription` ativa para este momento. Verificado ao vivo: sem cookie →
  401, com assinatura ativa → 200, autenticado sem assinatura → 403 (com
  `/billing/status` continuando alcançável). **Checkout real testado de
  ponta a ponta** (25/08): o autor configurou Stripe em modo de teste e um
  cliente OAuth do Google na própria máquina e completou o fluxo completo —
  login → checkout hospedado → pagamento de teste → webhook → `/assinatura`
  com assinatura ativa. Essa verificação achou um bug real que os 713 testes
  não pegavam (webhook sempre devolvia 500 contra o SDK de verdade); corrigido
  e coberto por teste no PR #21. Ver [D-46](DECISIONS.md).
- ~~**A6** — Purgar o material licenciado do Cérebro em `main`~~ — **decidido
  não purgar.** O autor optou por manter os 158 arquivos (11 livros
  comerciais, 103 fichas Granta EduPack, material de curso e trabalhos
  entregues) como base de conhecimento da camada de IA, com informação
  completa sobre a exposição. Risco aceito, não descuido. Ver
  [D-45](DECISIONS.md).
- ~~**M8** — Desempenho medido (Lighthouse)~~ — job `Lighthouse` em `ci.yml`:
  build de produção, API e frontend em portas isoladas (8811), sessão fixa via
  `E2E_SESSION_TOKEN` para que as 11 rotas auditadas sejam as telas reais
  autenticadas (sem isso, todas cairiam em `/entrar` e o Lighthouse mediria só
  a tela de login), com limiares por assertiva
  (`apps/web/lighthouserc.json`): performance ≥0,7, acessibilidade ≥0,9,
  boas práticas ≥0,8, interativo ≤5 s, FCP ≤2,5 s, LCP ≤4 s, CLS ≤0,1, TBT
  ≤500 ms. `scripts/protect-main.ps1` já lista `Lighthouse` entre os nomes
  exigidos — falta confirmar que o script foi de fato executado contra a
  ruleset viva no GitHub (ver `CLAUDE.md` §7).
- ~~**M1** — Triagem de licenciamento das bases incorporadas~~ — `Source`
  ganhou `license_label`/`license_url`, a sinalização explícita
  `contains_third_party_data` e um carimbo de quem registrou a fonte e
  quando. O portão fica na importação (`ImportService._check_source_licensing`,
  rodando em `validate()` e de novo em `commit()`): uma fonte **nova** sem
  licença registrada é recusada antes de qualquer linha ser escrita, e uma
  fonte marcada como possivelmente contendo dado de terceiro exige uma
  segunda confirmação humana explícita (`source_review_confirmed`). Reusar
  um `source_label` já registrado não reabre a decisão a cada importação.
  `GET /api/sources` lista toda fonte com sua licença e revisor. Ver
  [D-44](DECISIONS.md).
- ~~**A2** — Estudo de caso didático completo~~ — o tirante leve e rígido
  ("light, stiff tie") de Ashby, reproduzido do enunciado ao relatório
  exportado contra a aplicação real (não simulado): nove materiais reais de
  literatura (não o `sample-data/` fictício) importados pelo assistente de
  importação, o índice `rigidez-especifica` já semeado, uma restrição de
  fragilidade que exclui a cerâmica mesmo com o melhor índice bruto, e a
  ordenação resultante batendo com os três pontos consolidados na literatura
  de Ashby: compósitos à frente de metais, os três metais estruturais num
  platô de menos de 2% entre si, cerâmica excluída por fragilidade apesar do
  índice. Roteiro completo, com as respostas reais da API como evidência, em
  [`docs/12-estudo-de-caso.md`](12-estudo-de-caso.md); regressão automatizada
  em `app/tests/test_case_study.py`.
- ~~**M2** — Auditoria de alterações~~ — `AuditEvent`
  (`app/models/audit.py`) registra quem, o quê e quando para material, classe,
  propriedade, índice de desempenho e estudo de seleção: um retrato de
  `user_email`/`entity_label` (sobrevive à conta ou à entidade sumirem depois)
  e um diff só dos campos que mudaram. `GET /api/audit` lista por
  entidade, com a mesma fronteira de projeto de todo endpoint de estudo — o
  catálogo é visível a qualquer usuário logado, um estudo só ao seu dono,
  inclusive depois de excluído (retrato de `project_id`, não junção viva). A
  importação em lote fica de fora de propósito: `ImportService` monta
  `Material` direto, sem os métodos públicos de `MaterialService` que
  chamam o audit — `ImportJob` já é a trilha desse fluxo. Ver
  [D-43](DECISIONS.md).
- ~~**A5** — Autenticação e autorização por projeto~~ — login exclusivamente
  por terceiros (Google, OAuth 2.0; sem senha em lugar nenhum), sessão em
  cookie `httpOnly` (`UserSession` é linha de banco, não JWT — logout revoga
  de verdade), catálogo global compartilhado entre usuários autenticados, um
  `Project` por `User` criado no primeiro login, `SelectionStudy` escopado por
  `project_id` (ver [D-42](DECISIONS.md), [ARCHITECTURE.md §7](ARCHITECTURE.md)).
  O Playwright (A4/B11) não passa pelo Google: `app/db/seed.py` grava uma
  sessão fixa só quando `ENVIRONMENT=development` **e** `E2E_SESSION_TOKEN`
  está no ambiente, e a suíte injeta esse token como cookie antes da primeira
  navegação — sem nenhuma rota de bypass exposta pela API. Destrava M2.
- ~~**A4** — testes end-to-end dos fluxos~~ — Playwright cobre importar →
  selecionar → visualizar → exportar como uma sessão contínua no navegador,
  contra API e banco (SQLite, descartável) próprios, em portas isoladas das de
  desenvolvimento (`apps/web/e2e/`, `apps/web/playwright.config.ts`,
  `apps/api/scripts/e2e_server.py`; `npm run test:e2e`). Achou um bug real de
  produção antes de ir ao ar: a sugestão automática de coluna na importação
  (`_suggest`, `app/importers/service.py`) comparava um slug hifenizado
  (`slugify()` sempre usa `-`) contra o slug armazenado, que usa `_` — então
  **toda propriedade de nome composto** ("Módulo de Young", "Limite de
  escoamento" etc.) nunca era sugerida automaticamente, e só "Densidade"
  (palavra única) por coincidência funcionava. Corrigido comparando os dois
  lados já normalizados; regressão coberta em `test_imports_api.py`.
- ~~**B11** — Playwright (A4) como check obrigatório de CI~~ — job
  `E2E (Playwright)` em `ci.yml`: Python + Node no mesmo runner, Chromium via
  `--with-deps`, `npm run test:e2e`, relatório HTML publicado como artefato
  quando falha. `playwright.config.ts` resolvia o Python fixo em
  `.venv/Scripts/python.exe` (layout Windows) — não existe no runner Ubuntu;
  agora `E2E_API_PYTHON` sobrepõe o caminho, e o workflow passa
  `E2E_API_PYTHON=python`, o que o `setup-python` já deixa no PATH.
  `scripts/protect-main.ps1` ganhou o nome do check e foi rodado contra o
  repositório.
- ~~`black --check` falhava em arquivos anteriores à Fase 5~~ — backend formatado
  por inteiro em commit próprio; `black --check` virou portão de CI.
- ~~Isolamento de testes quebrado com pysqlite~~ — corrigido no `conftest.py`,
  guardado por `test_isolation.py` (ver [DECISIONS.md](DECISIONS.md) D-17).
- ~~Sem CI~~ — `.github/workflows/ci.yml` roda em todo PR e push.
- ~~**A3** — relatório em HTML imprimível~~ — `app/exporters/html.py` renderiza o
  mesmo `Report` que já alimentava CSV e XLSX, com folha de impressão; o PDF sai
  do navegador e nenhuma dependência de geração de PDF entrou no projeto.
  Escape de marcação próprio + CSP `default-src 'none'` como camada
  independente.
- ~~**M7** — unicidade em `material_property_value`~~ —
  `uq_material_property_value_pair` na migration `bfeee728d230`. A migration
  **falha e não apaga nada** se encontrar duplicatas: dizer quais são e deixar a
  escolha com o usuário é preferível a descartar proveniência em silêncio.
- ~~**M3** — acessibilidade~~ — teclado, foco visível nos dois temas, link de
  pular para o conteúdo, rótulos programáticos, contraste AA medido contra a
  superfície mais escura em que cada token aparece ([D-29](DECISIONS.md)) e
  **tabela de dados por figura** ([D-31](DECISIONS.md)), que é o que torna um
  mapa de Ashby legível por leitor de tela. O axe roda sobre as primitivas e
  sobre as telas principais dentro do `npm run test`
  (`apps/web/app/routes.a11y.test.tsx`); a lista do que só se verifica à mão
  está em [11-usabilidade.md](11-usabilidade.md) §6. A metade de **desempenho**
  do item não foi feita e virou **M8**.
- ~~README afirmava que a CI bloqueia o merge~~ — passou a ser verdade com A1;
  antes disso o texto foi corrigido para não prometer garantia que não havia.
- ~~**A1** — checks de CI obrigatórios~~ — ruleset `CI obrigatoria em main`
  exigindo `Backend (Python 3.11)`, `Backend (Python 3.12)` e `Frontend`, **sem
  ator de exceção** (vale para o dono do repositório também) e com a branch
  obrigada a estar atualizada com `main` antes do merge. Só foi possível porque
  o repositório passou a ser **público**: no GitHub Free a proteção de branch
  não existe em repositório privado, e tanto `PUT /branches/main/protection`
  quanto `POST /rulesets` respondiam
  `403 — "Upgrade to GitHub Pro or make this repository public"`
  (ver [DECISIONS.md](DECISIONS.md) D-22). Reaplicável e auditável por
  `scripts/protect-main.ps1`, que é idempotente.
