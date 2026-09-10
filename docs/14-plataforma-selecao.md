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
| Banco de processos | **3** | **Entregue (P0-2, [D-57](DECISIONS.md))**: `ProcessClass` hierárquica, `Process` e a associação N–N. Falta atributo de processo (faixa de espessura, custo) com proveniência, e seleção *de* processo (exercício 11). |
| Browse hierárquico | **2** | A hierarquia agora é lida na seleção (P0-1), mas o catálogo ainda não tem árvore navegável, breadcrumb, favoritos nem recentes. |
| Registro de família (folder-level) | **0** | `MaterialClass` é rótulo, não registro com descrição, aplicações e ciência. |
| Search | **3** | Analisador próprio com AND/OR/NOT, frase, parênteses e curinga ([D-55](DECISIONS.md)). Falta relevância, fuzzy e destaque do trecho. |
| Datasheet | **3** | Propriedades com proveniência e **processos compatíveis** (P0-2), agrupados por família. Faltam aplicações, vantagens, limitações, similares e Science Notes. |
| Motor de gráficos | **3** | Plotly à la carte no cliente + SVG determinístico no servidor; envelope, nuvem, linha de índice, escala log. Faltam caixa de seleção, anotações, rótulos arrastáveis e destaque de referência. |
| **Seleção multiestágio** | **4** | **Entregue (P0-1, [D-56](DECISIONS.md))**: `SelectionStage` ordenada, habilitável e nomeável, com funil por estágio. Falta reordenar por arraste e duplicar um estágio. |
| Limit Stage | **3** | Restrições com AND/OR aninhado (M6), operadores, unidades. Falta a barra de distribuição que orienta o valor. |
| Tree Stage | **4** | **A junção entre tabelas existe (P0-2)**: um estágio de processo filtra materiais pelos processos que os servem, por pasta ou por folha, com descendentes. Falta o sentido inverso — processos como resultado (exercício 11). |
| Chart Stage (gráfico que filtra) | **1** | O gráfico mostra; não seleciona. Sem caixa nem linha de índice que reprove registro. |
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
| Explicabilidade | **3** | Funil por restrição e proveniência por número; falta o *porquê* por registro reprovado. |
| Camada de IA | **4** | Interpretação e explicação com guardrails, ancoragem numérica e citação verificada. |
| Testes | **5** | 987 backend, 210 frontend, E2E e Lighthouse na CI — e desde o P0-1 a migração é exercitada de verdade, nos dois sentidos, contra um banco que já contém dados. |
| Desempenho | **3** | Índices, threadpool, Plotly fatiado. Não preparado para centenas de milhares de registros. |

**Cobertura de capacidades inspiradas no EduPack: ~57%** — contado como
capacidades em nível ≥ 3 sobre as 30 avaliadas (17 de 30). Eram 10 de 30 (~34%)
quando este documento foi escrito; P1-1 (busca) e P0-1 (multiestágio, com Tree
Stage e o efeito colateral em projetos/testes) levaram a 14, e o P0-2 subiu as
três restantes — banco de processos (0→3), Tree Stage (2→4) e Datasheet (2→3).

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
arraste, duplicar um estágio, e o Chart Stage que **filtra** (P1, que agora tem
onde encaixar).

### P0-2 — Não existe ProcessUniverse — **entregue**

Tree Stage, no manual, é uma junção: *materiais que este processo molda*,
*processos que unem estes materiais*. Com só uma tabela, era filtro por pasta.

**Entregue** ([D-57](DECISIONS.md)): `ProcessClass` hierárquica, `Process`,
a associação N–N `material_process`, um **terceiro tipo de estágio** (`process`)
que filtra materiais por pasta ou por folha do universo de processos, os
processos compatíveis na ficha do material, e um universo demonstrativo
semeado — fictício e marcado, sendo a **compatibilidade** o que é inventado ali.

### P0-3 — A seleção só devolve materiais

O exercício 11 do manual seleciona **processos**: o universo de saída é a tabela
de processos, não a de materiais. O P0-2 fez o sentido do exercício 9 — materiais
filtrados pelos processos que os servem —; o sentido inverso precisa de um
estudo cujo universo de resultado seja escolhido, o que toca `SelectionStudy`,
o ranking (um processo não tem `densidade`) e os documentos exportados. É o
próximo gargalo, e o único item do manual sem lugar no roteiro antes dele.

### P1-1 — Search é `LIKE` — **entregue**

O manual dedica uma seção a operadores (AND, OR, NOT, frase, parênteses, `*`,
`?`). Hoje é uma varredura por substring. É a porta de entrada da ferramenta e
a diferença mais visível entre "lista de materiais" e "plataforma".

### P1-2 — Não há espaço do usuário

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
| **P0** | Seleção **de processos** (universo de saída escolhido — exercício 11) | G | P0-2 |
| **P1** | ~~Search com operadores~~ **entregue**; falta relevância e destaque | C | — |
| **P1** | Chart Stage que **filtra** (caixa de seleção e linha de índice reprovando) | H, I | P0-1 |
| **P1** | `My Records`: definidos pelo usuário, favoritos, recentes | T, U | — |
| **P1** | Browse: árvore navegável, breadcrumb, registro de família | B, D | P0-2 |
| **P2** | Find Similar + Nearness + registro de referência | K, L | P1 My Records |
| **P2** | Tabela de comparação com referência e diferença percentual | M | P2 referência |
| **P2** | Engineering Solver (viga em flexão, tração, compressão) | N | P0-1 |
| **P2** | Performance Index Finder | J | P2 Solver |
| **P3** | Eco Audit (material, manufatura, transporte, uso, fim de vida) | O | A ampliado |
| **P3** | Part Cost Estimator | P | P0-2 |
| **P3** | Synthesizer + Sandwich Panels | Q, R | P1 My Records |
| **P4** | Battery Designer | S | P3 Synthesizer |
| **P4** | PDF e DOCX no gerador de relatório | V | — |

**Ordem de execução:** ~~P0-1~~ → ~~P0-2~~ → **P0-3** → P1 → P2 → P3 → P4.

### O que isto não é

Um cronograma de TCC. A monografia tem uma pendência que nenhum módulo acima
resolve — o §3.5 exige sessões de teste com usuários, e a tabela de melhorias de
[`11-usabilidade.md`](11-usabilidade.md) está vazia. Nada deste roteiro deve
passar na frente disso, e **nenhum item aqui é pré-requisito da defesa**: a
ferramenta atual já sustenta a alegação central da monografia (seleção
reprodutível e auditável). Este documento descreve a evolução do produto depois
dela.
