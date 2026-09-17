# Da ferramenta de TCC à plataforma de seleção (gap analysis e roteiro)

Este documento compara o MaterialSelect AI com o modelo funcional descrito nos
manuais *Getting Started with Granta EduPack* (releases 2023 R1 e R2) e define o
roteiro para fechar a distância.

**Escopo e propriedade intelectual.** O alvo é equivalência **funcional** em
arquitetura aberta. Nada de banco de dados, texto, ícone, imagem ou dataset da
ANSYS entra aqui; os conceitos (exploração hierárquica, seleção multiestágio,
índices de desempenho, similaridade, síntese) são de domínio público da
metodologia de Ashby, e a implementação é própria. Todo valor de propriedade
continua sujeito ao princípio 1 e ao licenciamento de M1.

---

## 1. O que os manuais descrevem

Os dois documentos descrevem o mesmo produto; o R2 é o R1 rediagramado, com os
mesmos nove capítulos. O fluxo canônico é:

```
Browse ─┐
Search ─┼─→ Select (o hub) ─→ Chart ─→ Results ─→ Report
        │      ├── Chart Stage
        │      ├── Limit Stage
        │      └── Tree Stage
        └─→ Datasheet ─→ Find Similar ─→ Comparison Table
```

Três coisas nesse desenho não são detalhe de interface:

1. **A seleção é uma pilha ordenada de estágios heterogêneos.** Um projeto tem
   N estágios, cada um Limit, Tree ou Chart, cada um habilitável
   individualmente, e o resultado é a interseção. O manual monta e **apaga**
   estágios o tempo todo (`Delete this stage` aparece em quase todo exercício).
2. **Tree Stage é uma junção entre tabelas diferentes.** O exercício 9 filtra
   materiais *pelos processos que os moldam*, e depois processos *pelos
   materiais que eles unem* — nos dois sentidos.
3. **Um registro pode ser derivado.** Sintetizados (Synthesizer) e definidos
   pelo usuário convivem com o catálogo nos mesmos gráficos, seleções e
   relatórios.

---

## 2. Matriz de maturidade

Níveis: **0** não existe · **1** rudimentar · **2** existe, precisa melhorar ·
**3** funciona · **4** profissional · **5** comparável a plataforma madura.

| Capacidade | Nível | Onde está / o que falta |
|---|---|---|
| Arquitetura de dados (materiais) | **3** | `Material` + `MaterialClass` auto-referencial + `MaterialPropertyValue` com proveniência. Sólido. |
| Rastreabilidade de unidade e proveniência | **5** | Valor original + unidade + normalizado + método + qualidade + fonte licenciada. **Acima do EduPack** — ver §4. |
| Banco de processos | **4** | `ProcessClass` hierárquica, `Process`, a associação N–N (P0-2), a **seleção de processos** como resultado (P0-3) e **atributos com proveniência** (P0-4, [D-59](DECISIONS.md)): envelope de capacidade, escalar e discreto, com Limit Stage e ranqueamento sobre eles. Falta catálogo de processos **editável** (hoje só semeado, sem a trilha de auditoria que o de materiais tem) e gráfico de atributo de processo. |
| Browse hierárquico | **5** | **Entregue (P1-3, [D-61](DECISIONS.md))**: árvore navegável nos dois universos, trilha de navegação, e a família aberta como página própria — com o que está nela *e abaixo dela*. Favoritos e recentes chegaram com o P1-4 ([D-62](DECISIONS.md)). |
| Registro de família (folder-level) | **3** | **Entregue (P1-3)**: `MaterialClass` e `ProcessClass` carregam descrição, aplicações e características, com a prosa ausente escrita como ausência (D-24) e editável pela mesma rota auditada. Faltam as *Science Notes* e imagem de família. |
| Search | **3** | Analisador próprio com AND/OR/NOT, frase, parênteses e curinga ([D-55](DECISIONS.md)). Falta relevância, fuzzy e destaque do trecho. |
| Datasheet | **4** | Propriedades com proveniência e **processos compatíveis** (P0-2), agora **links** para a ficha de cada um — a junção lê nos dois sentidos. A **ficha do processo** saiu (P1-3): atributos com o trilho inteiro e o *tipo de valor* ao lado, que é o que diz por qual regra cada um é comparado (D-59). Faltam aplicações, vantagens, limitações, similares e Science Notes do material. |
| Motor de gráficos | **3** | Plotly à la carte no cliente + SVG determinístico no servidor; envelope, nuvem, linha de índice, escala log, e a **região do Chart Stage** desenhada no documento (P1-2). Faltam desenhar a caixa arrastando, anotações, rótulos arrastáveis e destaque de referência. |
| **Seleção multiestágio** | **4** | **Entregue (P0-1, [D-56](DECISIONS.md))**: `SelectionStage` ordenada, habilitável e nomeável, com funil por estágio. Falta reordenar por arraste e duplicar um estágio. |
| Limit Stage | **4** | Restrições com AND/OR aninhado (M6), operadores, unidades, nos **dois universos**, sobre as três formas de valor — escalar, envelope de capacidade (comparado por alcance) e discreto por pertinência (P0-4). Falta a barra de distribuição que orienta o valor. |
| Tree Stage | **4** | **A junção existe nos dois sentidos**: materiais filtrados pelos processos que os servem (P0-2) e processos filtrados pelos materiais que atendem (P0-3). Falta escolher **registros** avulsos do outro universo — hoje só pastas, porque `Material` não tem slug. |
| Chart Stage (gráfico que filtra) | **4** | **Entregue (P1-2, [D-60](DECISIONS.md))**: a caixa e a linha iso-índice reprovam, nos dois universos, e um eixo pode ser uma quantidade **derivada** — que é o que um Limit Stage não alcança. Registro não plotável não passa. Falta desenhar a caixa arrastando no gráfico da tela (hoje ela é digitada em coordenadas de dados) e o mapa do universo de processos. |
| Ranking | **4** | Soma ponderada, TOPSIS, PROMETHEE II, AHP (M5), com normalização declarada. |
| Índice de desempenho | **3** | Catálogo de índices + expressão livre, com avaliador seguro e dimensão verificada. |
| Performance Index Finder | **3** | **Entregue (P2, [D-64](DECISIONS.md))**: sete casos de carga padrão, cada um trazendo função, restrição, objetivo e variável livre, a derivação escrita por extenso e o índice que ela produz — **lido do catálogo**, nunca reescrito ao lado. Todo índice semeado é alcançável por algum caso, com teste que varre isso. Falta navegar por faceta (hoje se escolhe o caso inteiro, não "tenho esta restrição, quais índices servem?"). **O objetivo custo saiu** (P3, [D-65](DECISIONS.md)): cada caso nomeia também o gêmeo de custo do seu índice, e a tela mostra os dois lado a lado. |
| Find Similar / Nearness | **4** | **Entregue (P2, [D-63](DECISIONS.md))**: distância em espaço log onde a propriedade permite, escalada pela dispersão do conjunto e promediada, com a **base declarada na resposta** e os registros que não puderam ser medidos nomeados com o que lhes falta. Falta similaridade no universo de processos. |
| Registro de referência | **3** | **Entregue (P2)**: a referência é parâmetro da pergunta e vive na URL, nunca no servidor. Falta fixá-la como estado de um projeto — o *reference record* propriamente dito — e destacá-la nas figuras. |
| Tabela de comparação | **4** | **Entregue (P2)**: referência, "definir como referência" e diferença percentual por propriedade — calculada só onde a unidade tem zero verdadeiro, e com cada uma das cinco ausências escrita por extenso (D-24). |
| Engineering Solver | **3** | **Entregue (P2, [D-64](DECISIONS.md))**: tirante (rigidez, resistência, escoamento), viga (rigidez, momento), placa (rigidez) e coluna (flambagem de Euler), respondidos com **massa e variável livre em unidade derivada**, o fator estrutural à vista para a conta poder ser refeita à mão, e ausência tratada como exclusão nomeada. **O objetivo custo saiu** (P3, [D-65](DECISIONS.md)): o mesmo fator estrutural dividido pelo gêmeo de custo do índice responde quanto a peça custa em material, e o resultado diz qual objetivo rodou em palavras — a dimensão sai como massa porque `custo_massa` é adimensional. Faltam seções além de maciça quadrada/retangular e amarrar um dimensionamento a um estudo salvo e ao laudo. |
| Projetos e notas | **3** | `Project` isola estudos por usuário, e um estágio tem rótulo próprio (P0-1). Falta nota livre por projeto. |
| Geração de relatório | **5** | Relatório de seleção, laudo, CSV/XLSX/HTML/DOCX nativo, com mapa, ranking e oito seções de auditoria. DOCX entregue (P4, python-docx puro, sem dependências C de PDF). |
| Eco Audit | **3** | **Entregue (P3, [D-66](DECISIONS.md))**: cinco fases (material, manufatura, transporte, uso, fim de vida) em energia e carbono, com **dois modelos de uso** que não são variantes de um — no estático a massa não entra, e é por isso que escolher errado inverte a auditoria. A resposta não é o total: é qual fase domina, uma vez em energia e outra em carbono, e faltando uma fase o pódio é **recusado com o motivo escrito**. Faltam a figura de barras por fase, comparar dois materiais lado a lado na mesma auditoria e as rotas de fim de vida que v1 deixou sem energia catalogada.
| Part Cost Estimator | **3** | **Entregue (P3, [D-65](DECISIONS.md))**: `C = m·Cm/(1−f) + C_t/n + Ċ_oh/ṅ + C_c/(ṅ·t_wo·L)` sobre os processos compatíveis com o material, devolvida **termo a termo** — porque o que o leitor veio buscar é como cada parcela anda com o lote, e o cruzamento entre dois processos conforme *n* cresce. Premissas de oficina são entrada com valor visível; processo sem dado econômico é nomeado, nunca zerado; e a resposta declara a unidade monetária em palavras, porque dinheiro não está em sistema de unidades nenhum. Falta a curva custo × lote desenhada e o custo por família de processo. |
| Synthesizer / registros sintetizados | **3** | **Entregue (P3, [D-67](DECISIONS.md))**: compósito de dois constituintes e espuma de um sólido, com a receita inteira gravada e o registro **declarado sintetizado**. Cada valor nomeia a lei que o produziu e a **base** dela — exata, par de limites ou empírica —, e a qualidade do dado é a pior dos pais que a regra leu. A regra de mistura é propriedade da propriedade: densidade por volume, módulo como **par de limites** porque a direção não está catalogada, grandezas por massa por fração mássica, temperatura de serviço pelo mínimo, e resistência de compósito **sem regra nenhuma**, porque quem a controla é a interface. Faltam laminados com orientação declarada, sintetizar sobre um sintetizado e a figura do par de limites no mapa. |
| Sandwich Panels | **3** | **Entregue (P3, [D-68](DECISIONS.md))**: terceiro tipo do Synthesizer — duas faces sobre um núcleo. Densidade e grandezas por massa saem pelas **mesmas regras do compósito** (massa é massa), e o módulo é o de **flexão equivalente**, que passa do limite de Voigt nas mesmas frações — a prova de que é arranjo e não mistura. Só a razão *t/c* decide, o que é o que torna legítimo plotar o painel ao lado de sólidos. Resistência é recusada com o motivo escrito: ela é competição entre modos de falha e só um é calculável. Faltam a figura do painel em corte, o núcleo em colmeia (que tem escalas próprias) e os modos de falha que pedem dados de cisalhamento do núcleo. |
| Battery Designer | **3** | **Entregue (P4, [D-69](DECISIONS.md))**: dado um requisito elétrico, quantas células em série e em paralelo o atendem, quanto o conjunto pesa, ocupa e custa, e qual química serve melhor. A álgebra do pack mora em código (é argumento, como os casos de carga do D-64); as nove químicas moram no **catálogo**, cada uma nomeando a sua `Source` e a sua citação própria — porque energia específica é medida, não argumento. Tabela própria e não `Material`, pela mesma razão do `TransportMode`. Faltam a degradação por temperatura e por taxa, o dimensionamento térmico do BMS e química de estado sólido. |
| My Records (usuário / sintetizados / favoritos) | **4** | **Entregue (P1-4, [D-62](DECISIONS.md))**: `Material.owner_id` dá registro próprio, `Favorite` e `RecentRecord` dão favoritos e recentes nos dois universos, e `/app/meus-registros` é o espaço. Os **sintetizados** chegaram com o P3 ([D-67](DECISIONS.md)) e são sempre próprios, por `CheckConstraint`. Falta um registro próprio de *processo*, que pede o catálogo de processos editável.
| Unidades de exibição | **2** | Canônica correta; o usuário não escolhe a unidade de leitura (B11). |
| Explicabilidade | **3** | Funil por restrição e por estágio (`in_chart` inclusive) e proveniência por número; falta o *porquê* por registro reprovado. |
| Camada de IA | **4** | Interpretação e explicação com guardrails, ancoragem numérica e citação verificada. |
| Testes | **5** | 1683 backend, 356 frontend, E2E e Lighthouse na CI — e desde o P0-1 a migração é exercitada de verdade, nos dois sentidos, contra um banco que já contém dados, conferida por mutação. |
| Desempenho | **3** | Índices, threadpool, Plotly fatiado. Não preparado para centenas de milhares de registros. |

**Cobertura de capacidades inspiradas no EduPack: ~97%** — contado como
capacidades em nível ≥ 3 sobre as **32** avaliadas (31 de 32). **Nível médio:
3,56.** O P3 moveu quatro linhas que estavam em **zero**: o Part Cost Estimator,
o Eco Audit, o Synthesizer e os Sandwich Panels. Com o primeiro veio também o
objetivo custo, que destravou o Engineering Solver e o Performance Index Finder —
os dois já acima do corte, e por isso invisíveis no percentual embora seja ali
que a faixa ficou mais completa. É o mesmo descompasso entre métrica e ferramenta
que o P0-4 expôs, na direção oposta. O Synthesizer moveu **duas** linhas: a sua
própria e `My Records` 3→4, porque os registros sintetizados eram uma das duas
ausências nomeadas dela. O **P4** moveu a última que estava em zero: o *Battery
Designer* ([D-69](DECISIONS.md)), e fechou a exportação nativa em DOCX
(`app/exporters/docx.py`), elevando `Geração de relatório` a nível 5.

**Sobra uma linha abaixo de 3**, e ela não é capacidade pela metade:
`Unidades de exibição` (B11, que é uma escolha de leitura e não um módulo).
**A faixa P3 e a faixa P4 fecharam integralmente** — tanto do lado da seleção
quanto do lado do gerador de relatório com DOCX nativo.

**O denominador estava errado até o P0-4.** As versões anteriores deste parágrafo
diziam "30 avaliadas" e publicavam ~57%; a tabela acima sempre teve 32 linhas.
Recontado, o número é 17 de 32 (≈ 53%) no fim do P0-4 — e as leituras históricas
se corrigem pelo mesmo denominador: 10 de 32 (~31%) quando este documento foi
escrito, 14 de 32 (~44%) depois de P1-1 e P0-1, 17 de 32 (~53%) depois do P0-2.

**Por três marcos seguidos o percentual não se moveu, e isso disse mais sobre a
métrica do que sobre a ferramenta.** O P0-3 não cruzou nenhum nível; o P0-4
levantou **duas** capacidades — banco de processos 3→4 e Limit Stage 3→4 — mas as
duas já estavam acima do corte, então a contagem de "≥ 3" não registrou nada.
Subir o corte ali seria mover o gol no meio do jogo. Em vez disso este documento
passou a publicar também o **nível médio**, onde crescimento dentro da faixa
aparece: **2,25** (era 2,16 depois do P0-4, 2,09 antes dele, 1,3 quando o
documento foi escrito).

O P1-2 é o primeiro marco desde o P0-2 a mover o percentual, e move porque partiu
do único nível **1** da tabela: o Chart Stage foi de 1 a 4 de uma vez. Não é um
salto maior que os anteriores — é o mesmo tamanho de trabalho aplicado à
capacidade que estava mais atrás.

O **P1-3** move duas linhas de uma vez (Browse 2→4 e Registro de família 0→3) e
leva o Datasheet a 4, o que tira a cobertura de ~56% para **~62%**. A leitura
honesta é a mesma do parágrafo anterior, e vale dizê-la antes que o número
sugira outra coisa: o salto é grande porque o trabalho caiu sobre as duas
capacidades **mais atrasadas da tabela** — uma delas a única em zero —, e quase
tudo que ele precisou já existia no backend desde o P0-2 e o P0-4. Foi
apresentação sobre modelo pronto, não motor novo.

O **P1-4** fecha a faixa P1 e move duas linhas: `My Records` 0→3 — era a última
capacidade em zero da tabela — e Browse 4→5, porque favoritos e recentes eram
justamente o que faltava a ele. A cobertura vai de ~62% para **~66%** e o nível
médio de 2,44 para **2,56**.

E aqui a leitura honesta é o contrário da do P1-3. Aquele foi apresentação sobre
modelo pronto; este teve de **abrir uma fronteira que não existia**. Até agora o
catálogo era compartilhado por todo usuário autenticado (D-42) e só o estudo era
isolado; um registro que pertence a uma pessoa obriga toda leitura de material do
sistema a saber quem está perguntando — quatro repositórios, seis serviços, o
motor de seleção, o painel, as figuras e os dois documentos. O percentual move
pouco e o trabalho por baixo dele foi o maior da faixa.

`My Records` fica em **3** e não em 4 por duas ausências nomeadas: os registros
**sintetizados**, que são o Synthesizer (P3), e um registro próprio de *processo*,
que pede o catálogo de processos editável — item aberto desde o P0-2.

O **P2** move **três linhas de uma vez** — Find Similar 0→4, Registro de
referência 0→3 e Tabela de comparação 2→4 —, e leva a cobertura de ~66% para
**~75%**, com o nível médio em **2,84**. É o maior salto de percentual do
roteiro inteiro, e a leitura honesta tem duas metades.

A primeira: as três capacidades estavam entre as mais atrasadas da tabela, duas
delas em zero, e **fecham juntas porque são um fluxo só** — o manual vai de
`Datasheet` a `Find Similar` e daí à `Comparison Table` —, então o trabalho que
destrava uma destrava as três. A segunda, e é o que o número não mostra: quase
nada disto é apresentação sobre modelo pronto. A distância entre dois materiais
não existia em lugar nenhum do sistema, e decidir **em que espaço** medi-la é
escolha de método, não de implementação (D-63).

`Registro de referência` fica em **3** e não em 4 por uma ausência nomeada: a
referência é parâmetro da pergunta, e falta poder fixá-la como estado de um
projeto — o *reference record* propriamente dito — e destacá-la nas figuras.

O **P3 Part Cost Estimator** tira uma linha do zero e, no mesmo movimento, fecha
a omissão que o [D-64](DECISIONS.md) tinha deixado nomeada. O módulo responde
"quanto custa **fazer** esta peça, processo a processo" com os quatro termos à
vista, porque é o comportamento de cada termo com o lote — e o cruzamento entre
dois processos conforme *n* cresce — que decide alguma coisa; um total sozinho
seria oráculo. O objetivo *custo* responde a pergunta irmã, "que material a faz
**mais barata**", e é literalmente a mesma derivação: ρ vira ρ·Cm no agrupamento
material, o fator estrutural não se mexe, e por isso um caso de carga passou a
nomear dois índices em vez de carregar duas derivações ([D-65](DECISIONS.md)).

A consequência que o número da tabela não mostra: `custo_massa` é adimensional
de propósito (dinheiro não está em sistema de unidades nenhum), então a análise
dimensional devolve a mesma dimensão nas duas execuções. Ela continua provando a
álgebra e deixou de nomear a resposta — que é por que o objetivo, a unidade e a
razão disso são ditos em palavras na resposta e na tela.

O **P3 Eco Audit** tira a outra linha do zero, e a decisão que o carrega é a
mesma em espírito: **a resposta não é o total, é qual fase domina**, porque é
nela que esforço de projeto muda alguma coisa. Uma porta de carro se decide na
fase de uso; uma sacola plástica, na de material. E é por isso que a fase de uso
tem **dois modelos que não são variantes de um** — no estático a massa da peça
não aparece, então aliviar a peça economiza *exatamente nada* ali, e escolher
errado inverte a auditoria inteira.

O que o número não mostra, de novo: faltando o dado de uma fase, o pódio é
**recusado com o motivo escrito**, e o total também. A fase que ninguém calculou
pode ser justamente a que domina, e uma soma sobre quatro das cinco não é um
total — é uma parcela que parece um. É o princípio 3 aplicado a uma estatística
de resumo em vez de a uma célula, e é a razão de aterro e incineração ficarem
declarados sem energia em vez de valerem zero: um aterro grátis faria enterrar a
peça parecer a coisa mais barata que se pode fazer com ela.

O que o P0-4 fez, antes dele: fechou o exercício 11 do manual por inteiro — passo
1 (universo de saída, P0-3), passo 2 (Limit Stage sobre atributo do processo) e
passo 3 (Tree Stage no universo de materiais, P0-3) — e retirou a recusa de
ranqueamento que o [D-58](DECISIONS.md) tinha escrito.

---

## 3. Os quatro gargalos, em ordem

### P0-1 — A seleção é de estágio único — **entregue**

`SelectionStudy` carrega *uma* árvore de restrições, *um* índice e *um* método.
Tudo que o EduPack faz de interessante — combinar Limit com Tree e com Chart,
desabilitar um estágio para ver o efeito, apagar o estágio 3 e manter os outros
— exige uma **lista ordenada de estágios heterogêneos**. Sem isso, os módulos F,
G, H, J e a maior parte de V ficam sem onde encaixar.

Nada mais no roteiro compensa não ter isto.

**Entregue** ([D-56](DECISIONS.md)): `SelectionStage` ordenada, com tipos
`limit` e `tree`, habilitável individualmente, com migração aditiva e backfill,
funil por estágio, seção "Estágios" nos documentos e a pilha editável em
`/app/selecao`. O que ficou de fora, e é melhoria e não bloqueio: reordenar por
arraste, duplicar um estágio, e o Chart Stage que **filtra** (P1-2, que agora tem
onde encaixar — e que foi entregue ali, [D-60](DECISIONS.md)).

### P0-2 — Não existe ProcessUniverse — **entregue**

Tree Stage, no manual, é uma junção: *materiais que este processo molda*,
*processos que unem estes materiais*. Com só uma tabela, era filtro por pasta.

**Entregue** ([D-57](DECISIONS.md)): `ProcessClass` hierárquica, `Process`,
a associação N–N `material_process`, um **terceiro tipo de estágio** (`process`)
que filtra materiais por pasta ou por folha do universo de processos, os
processos compatíveis na ficha do material, e um universo demonstrativo
semeado — fictício e marcado, sendo a **compatibilidade** o que é inventado ali.

### P0-3 — A seleção só devolve materiais — **entregue**

O exercício 11 do manual seleciona **processos**: o universo de saída é a tabela
de processos, não a de materiais.

**Entregue** ([D-58](DECISIONS.md)): `SelectionStudy.universe`, um motor só para
os dois universos (`RecordSnapshot`), o estágio `material` fechando a junção
inversa, os documentos declarando o universo, e o controle na tela. Ranqueamento
e índice são **recusados com o motivo escrito** num estudo de processos — no
salvamento e na execução.

### P0-4 — Processo não tem atributo — **entregue**

O passo 2 do exercício 11 é um Limit Stage sobre atributos do processo: *Shape*,
*Mass range*, *Range of section thickness*, *Process characteristics*,
*Economic batch size*. Nenhum deles existia.

Não era "mais uma tabela": era a mesma proveniência de `MaterialPropertyValue`
(valor original, unidade, normalizado, método, qualidade, fonte licenciada)
aplicada ao processo — e **dois tipos de valor que o modelo não cobria
inteiro**: *discreto* (`Shape: Dished sheet`, `Process characteristics: Primary
shaping`) e *intervalo* como critério de seleção.

**Entregue** ([D-59](DECISIONS.md)): `ProcessAttributeDefinition` e
`ProcessAttributeValue` com o trilho inteiro mais `normalized_min`/`normalized_max`;
`ProcessAttributeKind` (escalar, envelope, discreto) load-bearing e garantido por
`CheckConstraint`; o motor compara envelope por **alcance** e discreto por
pertinência, com a regra escrita onde o número aparece; catálogo de atributos e
ficha do processo na API; cinco atributos demonstrativos fictícios com ausência
nas duas formas; proveniência de processo no relatório, no laudo e na planilha; e
o editor de restrições de `/app/selecao` selecionando sobre o catálogo certo.
A recusa de ranqueamento do [D-58](DECISIONS.md) foi retirada.

O que ficou de fora, nomeado:

- **A ficha do processo na tela.** `GET /api/processes/{slug}` já devolve os
  atributos com proveniência e tem teste; falta a rota de apresentação
  (`/app/processos/[slug]`), que é superfície de navegação nova e não o gargalo do
  exercício. Fica em P1, junto de *Browse hierárquico*.
- **Catálogo de processos editável.** Hoje o universo de processos vem do seed, e
  editá-lo à mão pede a trilha de auditoria que o catálogo de materiais tem (M2).
- **Intervalo de material lido como envelope.** Item próprio de propósito: mudaria
  a semântica de comparação de todo intervalo já cadastrado e moveria toda
  contagem de funil existente.
- **Gráfico de atributo de processo.** O motor de gráficos lê o catálogo de
  materiais; um mapa de processos é a próxima coisa que o *Chart Stage* pediria.

### P1-1 — Search é `LIKE` — **entregue**

O manual dedica uma seção a operadores (AND, OR, NOT, frase, parênteses, `*`,
`?`). Hoje é uma varredura por substring. É a porta de entrada da ferramenta e
a diferença mais visível entre "lista de materiais" e "plataforma".

### P1-2 — O gráfico mostra e não seleciona — **entregue**

O manual usa o gráfico três vezes: para mostrar, para desenhar uma caixa em torno
dos candidatos, e para deslizar a linha de índice até isolá-los. Aqui ele só
mostrava — era o único dos três tipos de estágio do método que faltava, e o
único nível **1** da matriz.

**Entregue** ([D-60](DECISIONS.md)): um quarto tipo de estágio, `chart`, que
carrega o plano, a caixa (um limite por eixo, em coordenadas de dados) e a linha
iso-índice no nível guardado. Três coisas que valem mais do que parecem:

- **Um eixo pode ser uma quantidade derivada.** É o que este estágio acrescenta
  ao Limit Stage, que nomeia *slug de propriedade*: "todo material cujo
  E^(1/2)/ρ bate este" não são quatro limiares sobre duas propriedades.
- **Registro não plotável não passa**, mesmo onde a caixa não limita aquele eixo
  — o critério é a região do plano, e quem não está na figura não está no
  resultado.
- **O documento redesenha o plano em que a decisão foi desenhada**, com a região
  como figura e a linha no nível que o estágio guardou.

Ficou de fora, e é melhoria e não bloqueio: **desenhar a caixa arrastando** no
gráfico da tela (hoje os limites são digitados, já em coordenadas de dados, que é
a metade que importa para a auditoria) e o mapa do universo de processos — um
estudo de processos pode ter um estágio de gráfico, mas o plano dele não é
desenhado.

> **Numeração.** Rascunhos anteriores deste documento chamavam de "P1-2" o item
> `My Records`, que a tabela do §5 sempre listou *depois* do Chart Stage. A
> numeração aqui passou a seguir a ordem do §5, e depois a ordem em que as
> coisas saíram; `My Records` é o P1-4.

### P1-3 — Não havia porta de entrada para navegar — **entregue**

O manual abre no *browse*: uma árvore de pastas, uma trilha que diz onde se está,
e a pasta aberta como página própria — com o que a família **é**, não só o que
está dentro dela. Aqui a hierarquia existia no motor desde o P0-1 e não existia
na tela: o catálogo tinha uma caixa de seleção plana, que lista classe aninhada e
raiz indistintamente, e o universo de processos não tinha porta de entrada
nenhuma — era alcançável só de dentro de um estágio e da ficha de um material.

**Entregue** ([D-61](DECISIONS.md)): `applications` e `characteristics` em
`MaterialClass` e `ProcessClass`, `GET /api/classes/{slug}` e
`GET /api/processes/classes/{slug}` devolvendo a pasta como registro (prosa,
trilha e subpastas), e cinco rotas novas — `/app/processos`,
`/app/processos/{slug}`, `/app/processos/familia/{slug}`,
`/app/catalogo/{slug}` e a árvore no próprio catálogo. A **ficha do processo**
saiu junto: `GET /api/processes/{slug}` devolvia tudo desde o P0-4 e nada
renderizava.

Ficou de fora, e é melhoria e não bloqueio: favoritos e recentes (que são
`My Records`, o P1 seguinte), *Science Notes* e imagem de família, e o catálogo
de processos **editável** — registrado desde o P0-2, porque pede a trilha de
auditoria que o catálogo de materiais tem.

> **Numeração.** Este item era a quarta linha de P1 na tabela do §5 e foi feito
> antes de `My Records`, que a tabela lista primeiro. A ordem dentro de uma
> faixa é lista e não sequência; a numeração aqui segue a ordem em que as coisas
> saíram, e `My Records` é o P1-4.

### P1-4 — Não há espaço do usuário

Sem `My Records`, o Synthesizer não tem onde gravar, o Find Similar não tem
referência persistente e o usuário não pode cadastrar o material do orientador
sem virar administrador do catálogo compartilhado.

---

## 4. Onde já somos melhores, e por que não abrir mão

Duas coisas neste projeto são **mais rigorosas** do que o manual descreve, e o
roteiro não pode regredi-las:

- **Proveniência por valor.** Cada número carrega valor original, unidade
  original, valor normalizado, unidade canônica, método de conversão, qualidade
  e fonte com licença verificada (M1). O EduPack apresenta o número; nós
  apresentamos o número e de onde ele veio.
- **Ausência é um estado.** Nunca zero, nunca célula vazia, nunca `—`: dado
  ausente tem rótulo escrito e o material some do gráfico com contagem na
  legenda. Qualquer módulo novo herda essa regra.

E a camada de IA continua sendo **interpretação, nunca fonte**: ancoragem
numérica, unidade explícita, índice escolhido por slug e citação verificada.
O Módulo Y do pedido descreve exatamente o que já existe.

---

## 5. Roteiro priorizado

Cada item entra pela mesma porta: migração quando o schema muda, teste antes da
correção, portão completo, decisão registrada.

| | Item | Módulos do pedido | Depende de |
|---|---|---|---|
| ~~P0~~ | ~~`SelectionStage` como entidade de primeira classe~~ **entregue** | E, F, G, H | — |
| ~~P0~~ | ~~`Process`, `ProcessClass`, associação N–N com `Material`~~ **entregue** | A, G | — |
| ~~P0~~ | ~~Seleção **de processos** (universo de saída escolhido)~~ **entregue** | G | P0-2 |
| ~~P0~~ | ~~Atributos de processo com proveniência (discreto e envelope)~~ **entregue** | A, G | P0-3 |
| **P1** | ~~Search com operadores~~ **entregue**; falta relevância e destaque | C | — |
| ~~P1~~ | ~~Chart Stage que **filtra** (caixa de seleção e linha de índice reprovando)~~ **entregue** | H, I | P0-1 |
| ~~P1~~ | ~~`My Records`: definidos pelo usuário, favoritos, recentes~~ **entregue** | T, U | — |
| ~~P1~~ | ~~Browse: árvore navegável, breadcrumb, registro de família, **ficha do processo**~~ **entregue** | B, D | P0-2 |
| ~~P2~~ | ~~Find Similar + Nearness + registro de referência~~ **entregue** | K, L | P1 My Records |
| ~~P2~~ | ~~Tabela de comparação com referência e diferença percentual~~ **entregue** | M | P2 referência |
| ~~**P2**~~ | ~~Engineering Solver (viga em flexão, tração, compressão)~~ | N | ~~P0-1~~ |
| ~~**P2**~~ | ~~Performance Index Finder~~ | J | ~~P2 Solver~~ |
| ~~**P3**~~ | ~~Eco Audit (material, manufatura, transporte, uso, fim de vida)~~ **entregue** | O | ~~A ampliado~~ |
| ~~**P3**~~ | ~~Part Cost Estimator~~ **entregue** (com o objetivo *custo* nos casos de carga) | P | ~~P0-2~~ |
| ~~**P3**~~ | ~~Synthesizer + Sandwich Panels~~ **entregue** | Q, R | ~~P1 My Records~~ |
| ~~**P4**~~ | ~~Battery Designer~~ **entregue** | S | ~~P3 Synthesizer~~ |
| ~~**P4**~~ | ~~Exportação nativa em DOCX no gerador de relatório~~ **entregue** (PDF viabilizado via DOCX / HTML de impressão sem libs C) | V | — |

**Ordem de execução:** ~~P0-1~~ → ~~P0-2~~ → ~~P0-3~~ → ~~P0-4~~ → ~~P1-1~~ → ~~P1-2~~ → ~~P1-3 (browse)~~ → ~~P1-4 (`My Records`)~~ → ~~P2 (Find Similar, referência, comparação)~~ → ~~P2 restante (Engineering Solver, Performance Index Finder)~~ → ~~P3 Part Cost Estimator (+ objetivo custo)~~ → ~~P3 Eco Audit~~ → ~~P3 Synthesizer~~ → ~~P3 Sandwich Panels~~ → ~~P4 Battery Designer~~ → ~~P4 restante (DOCX)~~.

**A faixa P2 fechou, e o Part Cost Estimator saiu junto com o que ele
destravava.** O custo ficou nomeado como omissão no [D-64](DECISIONS.md) em vez
de improvisado porque dependia deste módulo; com ele no lugar, trocar ρ por ρ·Cm
em cada agrupamento material é a mesma fatoração, e um caso de carga passou a
nnomear dois índices em vez de carregar duas derivações
([D-65](DECISIONS.md)). O **Eco Audit** saiu em seguida
([D-66](DECISIONS.md)), e o **Synthesizer** depois dele
([D-67](DECISIONS.md)) — este levando `My Records` de 3 para 4, porque os
registros sintetizados eram exatamente o que faltava a ela.

Os **Sandwich Panels** fecharam a faixa ([D-68](DECISIONS.md)), e eles são de
fato o mecanismo do Synthesizer aplicado a uma geometria — com a diferença que o
item inteiro existe para mostrar: um painel tem **arranjo**, e uma regra de
mistura que ignore *onde* o material está não descreve uma viga em flexão. A
medida disso é que o módulo de flexão equivalente do painel **passa do limite de
Voigt** nas mesmas frações volumétricas, o que nenhuma mistura pode fazer.
Densidade e grandezas por massa, essas sim, saem pelas regras do compósito sem
uma linha de adaptação: massa é massa.

O **Battery Designer** ([D-69](DECISIONS.md)) fechou a última linha em zero da
matriz, e o que decidiu o desenho dele foi uma pergunta só: *160 Wh/kg é
argumento ou é dado?* A contagem em série e em paralelo, os fatores de
empacotamento e o custo nivelado por ciclo são álgebra, e álgebra se verifica por
revisão — moram em código, como as sete derivações de `load_cases.py`. A energia
específica de uma química **não**: é medida sobre uma substância real, e escrevê-la
num literal Python seria a violação do princípio 1 que a ferramenta inteira
existe para não cometer. Daí `BatteryChemistry`, tabela própria e semeada, cada
linha nomeando a sua fonte e a sua citação. O módulo chegou por uma branch escrita
fora da sessão, com as nove químicas num dicionário de código; a reconciliação foi
exatamente mover esse dicionário para o catálogo sem mexer numa vírgula da
álgebra.

A **exportação nativa em DOCX** fechou a pendência de formato de saída de P4.
Alinhada à decisão D-20 (rejeição de bibliotecas pesadas de PDF com bindings C
como WeasyPrint/Cairo/Pango que comprometeriam a portabilidade multiplataforma),
a implementação adota `python-docx` 100% puro em Python, permitindo edição direta
no Word e exportação nativa para PDF na máquina do usuário com tabelas formatadas
(`w:tblHeader`, `w:cantSplit`), avisos obrigatórios e auditoria completa.

### O que isto não é

Um cronograma de TCC. A monografia tem uma pendência que nenhum módulo acima
resolve — o §3.5 exige sessões de teste com usuários, e a tabela de melhorias de
[`11-usabilidade.md`](11-usabilidade.md) está vazia. Nada deste roteiro deve
passar na frente disso, e **nenhum item aqui é pré-requisito da defesa**: a
ferramenta atual já sustenta a alegação central da monografia (seleção
reprodutível e auditável). Este documento descreve a evolução do produto depois
dela.
