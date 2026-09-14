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
| Browse hierárquico | **4** | **Entregue (P1-3, [D-61](DECISIONS.md))**: árvore navegável nos dois universos, trilha de navegação, e a família aberta como página própria — com o que está nela *e abaixo dela*. Faltam favoritos e recentes, que são `My Records` (P1-4). |
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
| Performance Index Finder | **0** | Não existe o fluxo função→restrição→objetivo→índice. |
| Find Similar / Nearness | **0** | Não existe. |
| Registro de referência | **0** | Não existe o conceito. |
| Tabela de comparação | **2** | `ChartService.compare` compara propriedades; sem referência, sem diferença percentual, sem "definir como referência". |
| Engineering Solver | **0** | Não existe. |
| Projetos e notas | **3** | `Project` isola estudos por usuário, e um estágio tem rótulo próprio (P0-1). Falta nota livre por projeto. |
| Geração de relatório | **4** | Relatório de seleção, laudo, CSV/XLSX/HTML, com mapa, ranking e oito seções de auditoria. Falta PDF e DOCX. |
| Eco Audit | **0** | Não existe. |
| Part Cost Estimator | **0** | Não existe. |
| Synthesizer / registros sintetizados | **0** | Não existe. |
| Sandwich Panels | **0** | Não existe. |
| Battery Designer | **0** | Não existe. |
| My Records (usuário / sintetizados / favoritos) | **0** | Catálogo é compartilhado; não há espaço do usuário. |
| Unidades de exibição | **2** | Canônica correta; o usuário não escolhe a unidade de leitura (B11). |
| Explicabilidade | **3** | Funil por restrição e por estágio (`in_chart` inclusive) e proveniência por número; falta o *porquê* por registro reprovado. |
| Camada de IA | **4** | Interpretação e explicação com guardrails, ancoragem numérica e citação verificada. |
| Testes | **5** | 1234 backend, 277 frontend, E2E e Lighthouse na CI — e desde o P0-1 a migração é exercitada de verdade, nos dois sentidos, contra um banco que já contém dados, conferida por mutação. |
| Desempenho | **3** | Índices, threadpool, Plotly fatiado. Não preparado para centenas de milhares de registros. |

**Cobertura de capacidades inspiradas no EduPack: ~62%** — contado como
capacidades em nível ≥ 3 sobre as **32** avaliadas (20 de 32). **Nível médio:
2,44.**

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
| **P1** | `My Records`: definidos pelo usuário, favoritos, recentes | T, U | — |
| ~~P1~~ | ~~Browse: árvore navegável, breadcrumb, registro de família, **ficha do processo**~~ **entregue** | B, D | P0-2 |
| **P2** | Find Similar + Nearness + registro de referência | K, L | P1 My Records |
| **P2** | Tabela de comparação com referência e diferença percentual | M | P2 referência |
| **P2** | Engineering Solver (viga em flexão, tração, compressão) | N | P0-1 |
| **P2** | Performance Index Finder | J | P2 Solver |
| **P3** | Eco Audit (material, manufatura, transporte, uso, fim de vida) | O | A ampliado |
| **P3** | Part Cost Estimator | P | P0-2 |
| **P3** | Synthesizer + Sandwich Panels | Q, R | P1 My Records |
| **P4** | Battery Designer | S | P3 Synthesizer |
| **P4** | PDF e DOCX no gerador de relatório | V | — |

**Ordem de execução:** ~~P0-1~~ → ~~P0-2~~ → ~~P0-3~~ → ~~P0-4~~ → ~~P1-1~~ → ~~P1-2~~ → ~~P1-3 (browse)~~ → **P1-4 (`My Records`)** → P2 → P3 → P4.

### O que isto não é

Um cronograma de TCC. A monografia tem uma pendência que nenhum módulo acima
resolve — o §3.5 exige sessões de teste com usuários, e a tabela de melhorias de
[`11-usabilidade.md`](11-usabilidade.md) está vazia. Nada deste roteiro deve
passar na frente disso, e **nenhum item aqui é pré-requisito da defesa**: a
ferramenta atual já sustenta a alegação central da monografia (seleção
reprodutível e auditável). Este documento descreve a evolução do produto depois
dela.
