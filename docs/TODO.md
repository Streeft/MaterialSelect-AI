# Backlog priorizado

Documento canônico do que falta. Substitui `backlog.md`, que agora aponta para
cá.

**Dificuldade:** ▁ baixa (horas) · ▃ média (1–2 dias) · ▆ alta (uma semana ou mais).

Identificadores (`A1`, `M7`…) são **estáveis**: um item concluído sai da lista e
vai para "Débitos já quitados", deixando lacuna na numeração em vez de renumerar
os vizinhos — outros documentos citam esses códigos.

---

## Alta prioridade

**S3 — as cadeias de CVE que nenhum upgrade fecha.** ▃ O S2 (ver "Débitos já
quitados") derrubou o `npm audit` de 27 para **14** achados e fechou as duas
cadeias que tinham caminho de upgrade. As três que sobraram **não têm versão
corrigida publicada**, e por isso são acompanhamento, não tarefa:

- **`plotly.js` → `maplibre-gl` (2 críticos).** *XSS sanitizer bypass*
  ([GHSA-jrc7-96c5-q579](https://github.com/advisories/GHSA-jrc7-96c5-q579)),
  que atinge `maplibre-gl <= 6.4.0`. O `plotly.js` 3.7.0 depende de
  `maplibre-gl ^4.7.1`, e nem a 4.1.0 do Plotly ajuda: ela pede `^5.24.0`,
  ainda dentro da faixa vulnerável. O `fixAvailable` do npm aponta
  `plotly.js@2.34.0`, que é **downgrade de major** — a mesma armadilha do
  `@lhci/cli`, e pela mesma razão: a versão sugerida é anterior à que
  introduziu a dependência.

  **Medido: o código vulnerável não chega ao navegador.** O Plotly é montado à
  la carte (`lib/plotly-custom.ts` registra `bar`, `box`, `heatmap`, `scatter`
  e `scatterpolar`), e nenhum traço de mapa entra no pacote. Numa build de
  produção com 22 chunks, `Plotly` aparece em 2 deles e `maplibre` em
  **nenhum** — controle positivo feito junto, para que o zero não fosse o zero
  de um diretório vazio. Reavalie **se um sexto traço for registrado**: um
  `scattermap` ou `choroplethmap` puxaria o maplibre para dentro do pacote e
  transformaria isto num problema alcançável em produção.
- **`@lhci/cli` (9 achados).** A 0.15.1 — a mais nova — ainda depende de
  `tmp ^0.1.0`, `uuid ^8.3.1` e `inquirer ^6.3.1`, todos em faixa vulnerável.
  Só roda no job de Lighthouse.
- **`express`/`qs` (2 moderados).** Presos dentro do próprio `@lhci/cli`.

**Débito de lint aberto pelo S2 — quitado (P4).** ▁ Os seis pontos de
`react-hooks/set-state-in-effect` foram corrigidos e a regra voltou a `error`,
que é o que o débito pedia. Cinco viraram ajuste durante a renderização / estado
derivado (semeadura de seleção padrão em `/app/comparar`, `/app/mapas` e
`/app/painel`, a queda de log para linear do B8 e o fechamento da gaveta do
D-37). O sexto, o `ThemeToggle`, era de outra natureza e ganhou outra correção:
a preferência de tema mora em `localStorage`, que é fonte **externa** ao React,
e o certo ali é `useSyncExternalStore` — que resolve os dois renders e traz o par
de snapshots que preserva a hidratação (servidor devolve `null`, nada é pintado
antes de montar). O clique agora escreve na fonte e a fonte notifica; não sobrou
`setState` nenhum no componente. Resta 1 aviso de
`react-hooks/incompatible-library` no `MaterialForm.tsx` (o `watch()` do
react-hook-form não é memoizável) que é informativo e não tem correção local.

A6 (Cérebro em `main`) foi decidido, não executado: ver "Débitos já
quitados".

---

## Média prioridade

Nenhum item aberto no momento — M6 foi entregue nesta sessão (ver
"Débitos já quitados").

---

## Baixa prioridade

**B11 — a unidade canônica impressa como o Pint a escreve — quitado (P4).** ▁
`app/calculations/units.py` ganhou `pretty_unit()`, e o `export_service` o aplica
nas tabelas do relatório, nas do laudo, na folha de proveniência e nos rótulos de
eixo do mapa — os dois lugares de uma vez, que era o ponto: consertar só o eixo
deixaria a figura discordando da tabela ao lado.

**Uma coisa deliberadamente não é embelezada: o método de conversão.**
`identity:kg/m**3` e `pint:GPa->Pa` permanecem exatos, e um teste fixa isso. O
docstring de `to_canonical` promete que aquele campo é **reproduzível** — é o
trilho de auditoria, não texto de leitura —, e o Pint não sabe ler `kg/m³` de
volta. Só a unidade de **exibição** é embelezada.

Isto **não** move a linha `Unidades de exibição` da matriz do §5 de
[`14-plataforma-selecao.md`](14-plataforma-selecao.md), que continua em **2**:
nela mede se o usuário pode *escolher* a unidade de leitura (MPa em vez de Pa), e
isso não existe. São duas perguntas diferentes que dividiam o mesmo rótulo.

---

## Entidades ainda não modeladas

`GeneratedReport`, e nada mais de estrutural no roteiro imediato. Aguarda
especificação de caso de uso. (`User` e `Project` saíram desta lista com A5;
`AuditEvent` saiu com M2; `SavedChart` saiu com B7 — salvar e reabrir
configurações de mapa; `SelectionStage` saiu com P0-1; `Process`,
`ProcessClass` e `MaterialProcess` saíram com P0-2;
`ProcessAttributeDefinition` e `ProcessAttributeValue` saíram com P0-4; `TransportMode` saiu com o Eco Audit e `BatteryChemistry` com o Battery Designer — as duas na mesma forma, vocabulário fechado e semeado fora dos dois universos.)

**Nada de estrutural pendente no roteiro imediato, e a faixa P1 fechou.** Os
quatro gargalos P0 estão entregues, mais o P1-1 (busca), o P1-2 (Chart Stage), o
P1-3 (browse) e o P1-4 (`My Records`) — este último o que mexeu na fronteira que
o D-42 estabeleceu, e o único da faixa a mexer nela. O **P2**, a **P3**, o **Battery Designer** (P4) e o **DOCX** (P4 restante) saíram em seguida, e a matriz
está em 31 de 32 com `Geração de relatório` em nível 5 (3,56 de nível médio).

---

## Débitos já quitados

Registrados para não voltarem por engano:

- ~~**Atualização do Guia de Estilo (`/app/estilo`)**~~ — As três primitivas
  novas do barril (`Bar`, `PageHeader`, `PanelShell`), o token de raio
  `rounded-panel` (24 px / 1.5 rem), os seis tokens de superfície `rail-*`
  com mini-frame de navegação, e a vitrine completa das 7 paletas por rota de
  D-49 combinando galeria comparativa simultânea e alternador interativo de
  matiz (`document.documentElement.dataset.section`). Quita o débito remanescente
  da revisão final do patch Prisma.
- ~~**P4 restante (DOCX)** — exportação nativa em DOCX~~ — `app/exporters/docx.py`
  renderiza `Report` em documentos Word (.docx) nativos via `python-docx` puro,
  sem dependências de sistema operacional em C (D-20). Cobertura completa de
  `/api/exports/catalogo.docx` e `/api/exports/estudos/{id}.docx`, com tabelas
  formatadas (`w:tblHeader` para repetir cabeçalhos na quebra de página, `w:cantSplit`
  para não partir linhas), os três avisos de auditoria, e suporte nos botões do
  frontend (`ExportButtons.tsx`, `api.ts`, `i18n.ts`).
- ~~**P0-1** — a seleção era de estágio único~~ — o gargalo arquitetural que a
  análise de lacunas apontou, entregue em seis passos
  ([D-56](DECISIONS.md), [07-selecao-deterministica.md](07-selecao-deterministica.md)).
  `SelectionStage` é entidade de primeira classe, ordenada e habilitável, com
  dois tipos: `limit` (a árvore do M6) e `tree` (seleção de pastas da taxonomia,
  **com descendentes** — o que `in_class` não sabe fazer, porque compara o slug
  da própria classe e todo material mora numa folha). Migração aditiva
  `a1c4f2e8b7d3` com backfill; funil por estágio e seção "Estágios" nos dois
  documentos; a pilha editável em `/app/selecao`, que continua abrindo com um
  único estágio para quem faz um estudo simples. **O P0-2 acrescentou o terceiro
  tipo, `process`** — ver a entrada abaixo. Fechou de passagem a lacuna de
  round-trip que o M6 deixou anotada. **O que ficou de fora, e é melhoria e não
  bloqueio:** reordenar por arraste e duplicar um estágio. O Chart Stage que
  filtra, também listado ali, saiu depois como P1-2 — ver a entrada abaixo.
- ~~**P0-2** — não existia universo de processos~~ — `ProcessClass`
  hierárquica, `Process` e a associação N–N `material_process`, entregues em
  sete passos ([D-57](DECISIONS.md)). O Tree Stage virou a **junção entre
  tabelas** do método: um terceiro tipo de estágio, `process`, mantém os
  materiais que *algum* processo selecionado serve, por pasta ou por folha, com
  descendentes. Migração aditiva `b7e2d9c4a105` com backfill, conferida por
  mutação. A ficha do material lista os processos compatíveis, agrupados por
  família — parte da lacuna do Datasheet. Universo demonstrativo semeado,
  fictício e marcado, sendo a **compatibilidade** o que é inventado ali.
  Pegou dois defeitos pré-existentes de passagem (o funil que reportava
  `in_tree` para um estágio de processo; a sugestão da IA descartada em silêncio
  numa pilha sem estágio de limites). **O que ficou de fora, e é o próximo
  gargalo e não uma lacuna deste item:** selecionar **processos** como resultado
  (exercício 11 do manual) — o P0-3.
- ~~**P0-3** — a seleção só devolvia materiais~~ — `SelectionStudy.universe`,
  um **motor só** para os dois universos (`RecordSnapshot`), o estágio
  `material` fechando a junção inversa, os documentos declarando o universo e o
  controle na tela ([D-58](DECISIONS.md)). Ranqueamento e índice recusados com
  o motivo escrito num estudo de processos. Quatro defeitos achados no caminho,
  **dois deles lendo o documento renderizado**: o exportador resolvendo id de
  processo contra a tabela de materiais (imprimiria proveniência de material sob
  nome de processo), a coluna Tipo com o slug cru, a validação de `class_slugs`
  contra a taxonomia errada e o `switch` de reabertura não-exaustivo. **O que
  ficou de fora, e virou o P0-4:** atributos de processo.
- ~~**P0-4** — processo não tinha atributo~~ — `ProcessAttributeDefinition` e
  `ProcessAttributeValue` com o trilho de proveniência inteiro, mais os **dois
  tipos de valor que o modelo não cobria**: envelope de capacidade (comparado por
  **alcance**, não pelo ponto médio) e discreto por pertinência a vocabulário
  fechado ([D-59](DECISIONS.md)). Fecha o exercício 11 do manual: Limit Stage
  sobre atributo de processo na API e na tela, e o ranqueamento que o D-58
  recusava. Duas migrações aditivas — `d4a8c1f70b93` (a primeira **sem backfill**,
  e honestamente: a informação é nova) e `e6c3f45a91d8` (`selection_constraint.labels`)
  —, cinco atributos demonstrativos fictícios com ausência nas duas formas, e a
  folha de proveniência de processo com a coluna *Tipo de valor* que diz por qual
  regra cada número foi comparado.

  Três defeitos no caminho, **dois deles não por asserção que falhou**: um
  estágio de limites num estudo de processos resolvia slugs contra o catálogo de
  materiais e então não admitia ninguém, sem explicação; a interpretação da IA
  dizia "Partindo de 13 **materiais**" numa seleção de processos (achado lendo o
  laudo renderizado, e a mesma palavra chegava ao prompt de um provedor real); e
  habilitar o ranqueamento abriu a possibilidade de o mapa do laudo destacar
  materiais com ids de processo, fechada por guard de universo com teste que
  constrói a colisão de slug de propósito.

  **O que ficou de fora, nomeado e registrado em P1:** a **ficha do processo na
  tela** (`GET /api/processes/{slug}` já devolve tudo, falta a rota), catálogo de
  processos **editável** (pede a trilha de auditoria do M2), **intervalo de
  material lido como envelope** (mudaria toda contagem de funil existente, então é
  item próprio) e gráfico de atributo de processo.
- ~~**P1-1** — busca era `LIKE`~~ — analisador próprio com AND/OR/NOT, frase,
  parênteses e curinga ([D-55](DECISIONS.md)). Falta relevância, *fuzzy* e
  destaque do trecho, registrados como melhoria e não como bloqueio.
- ~~**P1-3** — não havia porta de entrada para navegar~~ — uma pasta da taxonomia
  virou **registro** e o segundo universo passou a se navegar
  ([D-61](DECISIONS.md)). `applications` e `characteristics` em `MaterialClass` e
  `ProcessClass` (texto editorial, **fora do princípio 1 por construção**, preso
  pela regra oposta: NULL é "ninguém escreveu" e a tela escreve isso — D-24);
  `GET /api/classes/{slug}` e `GET /api/processes/classes/{slug}` devolvendo
  prosa, trilha e subpastas, com o breadcrumb saindo de
  `app.domain.taxonomy.lineages` — a mesma travessia do Tree Stage, então trilha
  e estágio não podem discordar sobre quem está sob quem. Cinco rotas novas,
  entre elas a **ficha do processo**, que a API devolvia desde o P0-4 sem ninguém
  renderizar. Migração aditiva `a7d51c93e084`, sem backfill.

  **Uma decisão anterior foi revertida:** `process_count` passou a contar só
  processos ativos. Raciocínio inteiro no D-61 — o resumo é que o docstring do
  repositório sempre disse que a contagem responde "esta pasta está vazia", que o
  operador servido pela razão antiga não tem tela, e que o registro de família põe
  a contagem ao lado da lista, onde "2 processos" seguido de um lê como página que
  perdeu uma linha.

  **O que ficou de fora, e é melhoria e não bloqueio:** *Science Notes* e imagem
  de família, e o catálogo de processos **editável** — registrado desde o P0-2,
  porque pede a trilha de auditoria que o catálogo de materiais tem. (Favoritos e
  recentes saíram com o P1-4.)
- ~~**P1-4** — o catálogo não tinha dono e o usuário não tinha espaço~~ —
  entregue em sete passos ([D-62](DECISIONS.md)). `Material.owner_id` anulável dá
  o registro próprio (NULL é o catálogo compartilhado); `Favorite` e
  `RecentRecord` dão favoritos e recentes nos dois universos, com XOR entre as
  duas colunas de registro para haver chave estrangeira de verdade;
  `/app/meus-registros` é o espaço. A regra de visibilidade vive num lugar só e
  falha fechada, e o canário varre `app.openapi()` em vez de uma lista escrita à
  mão. **Escrita não ganhou predicado próprio**, porque não teria ramo
  alcançável. O documento declara registro próprio no topo e na folha de
  proveniência.

  **O defeito que a própria decisão previu, e que apareceu na hora:** o padrão
  seguro (`None` = só o compartilhado) estreita a leitura, e o `SelectionService`
  recebia `user` opcional porque só a auditoria o lia — então por um commit o
  registro próprio de uma pessoa sumiu do estudo dela, em toda seleção e todo
  documento. O canário não pega isso por construção: ele falha quando um registro
  **aparece** para quem não pode vê-lo, nunca quando **some** para quem pode.
  `user` virou obrigatório (o erro passa a ser `TypeError`) e entrou o controle
  positivo. Ver D-62.

  **O que ficou de fora:** um registro próprio de *processo* (os registros
  **sintetizados**, que eram a outra ausência, saíram com o Synthesizer —
  [D-67](DECISIONS.md)) e
  registro próprio de *processo*, que pede o catálogo de processos editável.
- ~~**P2** — o fluxo do manual não tinha fim~~ — `Find Similar`, registro de
  referência e a tabela de comparação com diferença percentual, entregues em
  seis passos ([D-63](DECISIONS.md)). `app/domain/nearness.py` mede a distância
  em espaço log onde a propriedade permite, escala pela dispersão do conjunto e
  **promedia** (soma penalizaria a base mais larga por ter respondido mais); a
  **base é tudo ou nada** e volta na resposta com os excluídos nomeados;
  `units.is_ratio_scale` decide, por comportamento, onde um percentual significa
  alguma coisa; a referência é **parâmetro da pergunta** e vive na URL.

  **O que ficou de fora:** similaridade no universo de processos, fixar a
  referência como estado de um projeto (o *reference record* propriamente dito,
  e a razão de a capacidade ficar em 3), e destacá-la nas figuras.
- ~~**P2 restante** — o método parava antes de dimensionar~~ — Engineering Solver
  e Performance Index Finder, entregues em três passos
  ([D-64](DECISIONS.md)). São **uma derivação só**: `app/calculations/
  load_cases.py` guarda sete casos padrão com a derivação escrita por extenso, e
  a fatoração de Ashby vira literal — `massa = fator estrutural / índice`, com o
  índice **lido do catálogo pelo slug** e nunca reescrito no caso. Os dois
  espaços de nomes (variável de projeto × slug de propriedade) são separados e a
  separação é conferida **no import**. A variável livre é área numa viga e
  espessura numa placa, cada caso declara qual, e a prova dimensional lê a
  unidade declarada. `/app/dimensionar` mostra o fator estrutural ao lado do
  resultado, para a massa poder ser conferida à mão.

  **O que ficou de fora:** seções além de maciça quadrada e retangular, navegar
  por faceta em vez de por caso, e amarrar um dimensionamento a um estudo salvo
  e ao laudo. O objetivo **custo** estava nesta lista e **saiu no P3**, junto com
  o Part Cost Estimator de que dependia ([D-65](DECISIONS.md)).
- ~~**P3 (primeiro item)** — o Part Cost Estimator, e com ele o objetivo custo~~
  — `POST /api/custo/estimar` estima `C = m·Cm/(1−f) + C_t/n + Ċ_oh/ṅ +
  C_c/(ṅ·t_wo·L)` sobre os processos compatíveis com o material e devolve os
  **quatro termos**, porque é o comportamento de cada um com o lote — material
  como piso, ferramental caindo com 1/n, os dois de tempo imóveis — que decide
  alguma coisa; `/app/custo` imprime coluna por coluna e o dimensionamento liga
  nele com a massa que acabou de calcular. Premissa de oficina é entrada com
  valor visível; processo sem dado econômico é nomeado, nunca zerado; e a unidade
  monetária é dita em palavras, porque dinheiro não está em sistema de unidades
  nenhum.

  No mesmo item, o **objetivo custo** ([D-65](DECISIONS.md)): seis índices gêmeos
  no seed, `LoadCase.cost_index_slug`, e `objective` em `POST
  /api/solver/resolver`. A mesma derivação, lida outra vez — quem chama nomeia o
  objetivo e o caso escolhe o índice, como o D-35 exige. A consequência que a
  tela carrega: `custo_massa` é adimensional, então a análise dimensional devolve
  a dimensão da massa nas duas execuções; ela prova a álgebra e deixou de nomear
  a resposta.

  **O que ficou de fora:** a curva custo × lote desenhada, o custo por família de
  processo, e custo como objetivo em estudo de **processos** — um processo não
  tem `custo_massa`, e ali a pergunta é a do estimador.
- ~~**P3 (segundo item)** — o Eco Audit~~ — `POST /api/eco/auditar` e
  `/app/eco` somam energia e carbono da peça em cinco fases
  ([D-66](DECISIONS.md)). A resposta não é o total: é **qual fase domina**, uma
  vez em energia e outra em carbono, porque as duas podem discordar. Faltando o
  dado de qualquer fase, o pódio e o total são **recusados com o motivo
  escrito** — a fase que ninguém calculou pode ser a que domina.

  Quatro decisões que não se mexem: a fase de uso tem **dois modelos que não são
  variantes de um** (no estático a massa não entra, e os campos do outro modelo
  são recusados, nunca ignorados); a fase de material é cobrada sobre a **massa
  comprada**, `massa / (1 − f)`, o que é também por que a auditoria exige
  processo; a reciclagem é gasto no fim desta vida e poupança no início da
  próxima, e **não se abate crédito**; e aterro e incineração ficam declarados
  sem energia em vez de valerem zero.

  Dados novos: quatro propriedades ambientais (categoria `AMBIENTAL`, que
  existia sem uso), dois atributos de processo e `TransportMode` — nem material
  nem processo, com a justificativa no modelo.

  **O que ficou de fora:** a figura de barras por fase, comparar dois materiais
  na mesma auditoria, e energia catalogada para aterro e incineração.
- ~~**P3 (terceiro item)** — o Synthesizer~~ — `POST /api/synthesis/previa`,
  `POST /api/synthesis` e `/app/sintetizar` criam **materiais hipotéticos** a
  partir de materiais catalogados mais uma receita: compósito de dois
  constituintes com fração volumétrica, ou espuma de um sólido com densidade
  relativa ([D-67](DECISIONS.md)). É o item que mais perto passa de violar o
  princípio 1, e o que o separa é uma frase: **um valor sintetizado não é
  inventado; é calculado, e a diferença é que ele carrega a derivação.**

  A decisão que carrega o item: **a regra de mistura é propriedade da
  propriedade, não da receita.** Densidade linear por volume (exata); módulo como
  **par de limites** de Voigt e Reuss, porque a direção não está catalogada;
  custo e as quatro grandezas ambientais por **fração mássica**, o que exige as
  duas densidades; temperatura de serviço pelo **mínimo**. E **resistência de
  compósito sem regra nenhuma** — quem a controla é a interface, sobre a qual o
  catálogo nada sabe —, enquanto a **espuma tem** regra de resistência, por ser o
  mesmo material com vazios e ter mecanismo de falha que escala (Gibson–Ashby):
  a diferença não está na fórmula, está no que se sabe.

  Três garantias: cada valor nomeia a lei e a **base** dela (exata, limites,
  empírica); a qualidade do dado é a **pior dos pais que a regra leu** (incerteza
  de entrada propagada, incerteza de modelo dita em palavras); e um sintetizado é
  **sempre registro próprio**, por `CheckConstraint` portável
  (`NOT (is_synthesized AND owner_id IS NULL)` — o PostgreSQL recusa
  `boolean = 1`). A prévia vem **antes** da identidade: o passo do nome só
  aparece depois de haver prévia. Migração `ebf6d9eb737a`, com
  `server_default` posto e depois retirado, conferida por mutação.

  **O que ficou de fora:** laminados com orientação declarada, sintetizar sobre
  um sintetizado e a figura do par de limites no mapa.
- ~~**P3 (quarto item)** — os Sandwich Panels~~ — terceiro tipo do Synthesizer:
  duas faces de espessura *t* sobre um núcleo de espessura *c*
  ([D-68](DECISIONS.md)). **Fecha a faixa P3.**

  Metade dele é o Synthesizer sem adaptação nenhuma: densidade e grandezas por
  massa saem pelas **mesmas regras do compósito**, na fração de espessura das
  faces, porque massa é massa e o arranjo não a move. A outra metade é uma regra
  só, e ela não é mistura: o **módulo de flexão equivalente**, que nas mesmas
  frações volumétricas fica **2,7× acima do limite de Voigt** — o teto de
  qualquer regra das misturas. É a afirmação central do item, e é medida, não
  declarada. Duas degenerescências conferem a fórmula inteira (sem núcleo
  devolve `Ef`; sem faces, `Ec`), e **só a razão t/c decide**, o que é o que
  torna legítimo plotar o painel ao lado de sólidos.

  A recusa: **resistência é competição entre modos de falha** — escoamento da
  face, cisalhamento do núcleo, enrugamento da face — e vale o menor. Só o
  primeiro é calculável, e o mínimo sobre parte dos modos é um limite superior,
  não a resistência. Mesma forma da recusa do pódio no D-66. Condutividade e
  dureza também ficam fora, cada uma com seu motivo.

  Sem migração: `MaterialSynthesis.kind` já é texto e `parameters` já é JSON.
  Oito mutações conferidas; a que dá regra de resistência ao painel morre no
  import.

  **O que ficou de fora:** núcleo em colmeia (tem escalas próprias), a figura do
  painel em corte, e os modos de falha que pedem dados de cisalhamento do
  núcleo.
- ~~**P1-2** — o gráfico mostrava e não selecionava~~ — quarto tipo de estágio,
  `chart`, entregue em seis passos ([D-60](DECISIONS.md),
  [07-selecao-deterministica.md](07-selecao-deterministica.md)). Carrega o plano,
  a caixa (um limite por eixo, em coordenadas de dados, nunca pixel) e a linha
  iso-índice no nível **guardado** — número e não "a linha que passa pelo
  material 7", porque um estudo salvo tem de reexecutar para a mesma resposta.
  Três coisas que valem mais do que parecem: **um eixo pode ser quantidade
  derivada** (é o que um estágio de limites, que nomeia slug de propriedade, não
  alcança); **registro não plotável não passa**, mesmo onde a caixa não limita
  aquele eixo; e o documento **redesenha o plano em que a decisão foi
  desenhada**, com a região como figura e a geometria vinda de
  `ChartService.property_map`, a mesma chamada que serve a tela. Migração aditiva
  `f2b6d0e39c47`, a segunda **sem backfill** (a informação é nova), conferida por
  mutação nas duas direções — sem a guarda `kind <> 'chart'` a própria migração
  não roda.

  **O que ficou de fora, e é melhoria e não bloqueio:** ~~desenhar a caixa
  **arrastando** no gráfico da tela~~ (entregue no Opção A / D-60: seleção
  interativa por cursor com modo `select2d`, conversão de escala linear/log,
  sincronização bidirecional de shapes no Plotly, preview dinâmico no estágio e
  atalho direto "Criar estágio na Seleção" via deep link) — resta o mapa
  do universo de processos: um estudo de processos pode ter um estágio de
  gráfico, mas o plano dele não é desenhado, porque `property_map` lê o catálogo
  de materiais. Esse segundo item já estava registrado em P1 desde o P0-4.
- ~~**S2** — CVEs do toolchain de desenvolvimento~~ — `npm audit` em
  `apps/web` de **27 para 14** achados, com as duas cadeias que tinham caminho
  de upgrade fechadas por inteiro. `vitest` 2 → **5** (com `vite` 7,
  `@vitejs/plugin-react` 5 e `@types/node` 22) fechou o **único crítico** de
  então, mais `vite`, `esbuild`, `vite-node` e `@vitest/mocker`. `eslint` 8 →
  **9** e `eslint-config-next` 14 → **16** fecharam `@next/eslint-plugin-next`,
  `eslint-config-next` e `glob`. `@lhci/cli` 0.13 → **0.15.1** fechou `tar-fs`,
  `ws`, `@sentry/node` e `cookie`. Sobraram `brace-expansion`, `js-yaml` e
  `body-parser`, que caíram junto na re-resolução do lockfile. O que **não**
  fecha é o S3, acima.

  **Três coisas que não eram bump mecânico:**

  1. **O `npm audit fix` cego quebrou a instalação e foi revertido.** Ele
     re-hoistou o `vitest` para a raiz e deixou o `jsdom` em
     `apps/web/node_modules`; como o vitest resolve o `jsdom` a partir da
     própria localização, os 24 arquivos de teste morreram com
     `Cannot find package 'jsdom'` — reproduzido com `npm ci` limpo, para não
     confundir com estado sujo de `node_modules`. O caminho que funcionou foi
     declarar as versões no `package.json` e deixar o npm re-resolver a árvore
     inteira de uma vez.
  2. **A migração do Vite 6 mudou de lugar as condições de resolução do SSR, e
     isso derrubou nove testes de shadow DOM.** O `vitest.config.ts` já trazia
     `resolve.conditions: ["browser"]` com um comentário explicando por quê: sem
     ele o `lit-html` resolve pelo build `node/`, que tem `isServer` fixo em
     `true` e desliga em silêncio o mixin de delegação de ARIA do
     `@material/web`. Desde o Vite 6 o pipeline de SSR lê as **suas próprias**
     condições, e `resolve.conditions` deixou de alcançá-lo — a falha que aquele
     comentário previa, acontecendo. Corrigido repetindo a condição em
     `ssr.resolve.conditions`/`externalConditions`. **As duas listas têm de
     concordar.**
  3. **O ESLint 9 aboliu o `.eslintrc.json` e a flag `--ext`.** O conteúdo da
     config não mudou (`next/core-web-vitals` e nada mais), mas o alcance passou
     a ser glob explícito no script `lint`: ao receber um diretório, o ESLint 9
     linta só `.js`, e o portão passaria verde **sem ter olhado uma linha de
     TypeScript**. Falha silenciosa, do tipo que este projeto já pagou caro.

  **E um achado que não estava no enunciado do S2:** o lockfile antigo tinha
  `resolved`/`integrity` em apenas **59 de 1095** entradas, então o `npm audit`
  não conseguia identificar a maior parte da árvore para conferir contra a base
  de avisos. Os "27 achados, nenhum deles em código de produção" eram
  subcontagem: os dois críticos de `plotly.js`/`maplibre-gl` já estavam lá, nas
  mesmas versões, e simplesmente não eram reportados. O lockfile regenerado é
  completo, e por isso o número de agora é comparável ao que qualquer outra
  máquina veria.

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
     direto, cobrindo os mesmos diretórios que o `next lint` cobria por padrão —
     nem mais, nem menos. (A forma exata mudou de novo no S2, com a migração
     para *flat config*: a flag `--ext` não existe mais no ESLint 9 e o alcance
     virou glob explícito.)
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

  **Débito aberto pela revisão final de branch — quitado:** `/app/estilo`
  (a página viva do guia de estilo, de onde saem as capturas usadas como
  figuras de interface na monografia) foi atualizada com as três primitivas
  novas do barril (`Bar`, `PageHeader`, `PanelShell`), o token de raio
  `rounded-panel`, os seis tokens de superfície `rail-*`, e a vitrine
  comparativa e alternador interativo das sete paletas por rota introduzidas
  por D-49.
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
  `/selecao` passa a enviar `root_group` ao rodar ou salvar. ~~**Limitação
  conhecida, registrada e não corrigida nesta entrega:**~~ `GET
  /api/selection/studies/{id}` devolvia as restrições como lista plana, então
  reabrir um estudo aninhado mostrava tudo achatado num único grupo AND, sem
  aviso na tela. **Fechada no P0-1** ([D-56](DECISIONS.md)):
  `StageOut.root_group` devolve a árvore inteira e `fromConstraintPayload` a
  reconstrói no editor — a leitura por estágio precisava da estrutura de
  qualquer jeito. Ver `docs/07-selecao-deterministica.md` para a descrição
  do modelo de árvore e o exemplo trabalhado. 862 testes de backend (nenhum
  skip, antes 852) e 176 de frontend (antes 171), todos verdes ao final.
  **Addendo da revisão final de branch (corrigido na mesma sessão):** o
  laudo de engenharia (D-41) descrevia a lógica de um estudo aninhado como
  um único combinador achatado, com linhas de subgrupo opacas — corrigido
  com `SelectionService.describe_root_group` (hoje `describe_pipeline`, D-56), que renderiza a árvore
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
