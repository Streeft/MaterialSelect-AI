# Regras por área

> Regras operacionais copiadas **literalmente** do antigo "Estado atual" do
> `CLAUDE.md` (movido em 07/10/2026), agrupadas por área de código. Leia a
> seção da área antes de mexer nela. A narrativa completa, na ordem
> histórica, está em [`ESTADO_ATUAL.md`](ESTADO_ATUAL.md); as decisões, em
> [`DECISIONS.md`](DECISIONS.md). A regra do D-102 (catálogo oficial licenciado)
> continua no corpo do `CLAUDE.md`.

## Seleção e estágios (D-47 a D-62, D-84 a D-89)

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
([D-56](DECISIONS.md)): um estudo é uma **pilha ordenada de
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
([D-55](DECISIONS.md)), com `AND` como padrão e ligando mais forte que
`OR`.

**O P0-3 deu ao estudo o universo do resultado** ([D-58](DECISIONS.md)):
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

**O P1-2 fez o gráfico reprovar** ([D-60](DECISIONS.md)), e com ele os três
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
([D-61](DECISIONS.md)). Uma pasta era rótulo; agora carrega `applications` e
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

**O P2 deu o fim do fluxo do manual** ([D-63](DECISIONS.md)):
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

**Preparação para a turma de 29/09 (D-84 a D-89).** Um estudo de processos voltou
a ter o passo Objetivo (D-84). A Seleção virou assistente guiado — um passo de
cada vez, Voltar em todo passo e no navegador, **o recolhido nunca esconde o que
está em uso**, exemplo em um clique, resultado que começa pelo vencedor (D-85) —,
e o resto do produto ficou enxuto: capa com um botão, menu por papel, Mapas com
"Personalizar", Comparar por busca, ferramentas com premissas recolhidas **e os
valores no resumo** (D-86). Os pesos do ranking somam 1, com orçamento, sugestão e
top 5 calculados em `POST /api/selection/weights-preview`; **o `/run` continua
renormalizando**, porque o laudo reexecuta estudos antigos (D-87). Na tela,
Objetivo é o passo 2 e Restrições o 3 — o motor não mudou (D-88). E a explicação
por IA só pede `sources` quando há trecho para citar (D-89).

## Processos (D-57, D-59)

**O P0-2 deu o segundo universo** ([D-57](DECISIONS.md)): `ProcessClass`
hierárquica, `Process` e a associação N–N `material_process`, que é o que torna
o Tree Stage a **junção entre tabelas** do método — materiais filtrados pelos
processos que os servem. Três decisões que não se mexem: a **família do processo
é a raiz da taxonomia**, não uma coluna enum (dado semeado, não schema, e uma
verdade só); a **associação não carrega número nenhum** — um valor sobre o par
precisaria da proveniência de `MaterialPropertyValue`, e inventá-lo violaria o
princípio 1; e a semântica é **\"algum\"**, porque "soldável E forjável" são dois
estágios e a pilha já os intersecta. Material sem processo vinculado **não**
passa por um estágio de processo — mesma regra da restrição numérica. O funil
distingue `in_tree` de `in_process`, ou diria que a seleção filtrou por classe
quando filtrou por processo. A ficha do material lista os processos compatíveis,
no próprio payload da ficha.

**O P0-4 deu atributo ao processo** ([D-59](DECISIONS.md)), e é o que fecha o
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

## Casos de carga, Solver, Custo, Eco Audit e Bateria (D-64 a D-66, D-69)

**O P2 restante fechou a faixa** ([D-64](DECISIONS.md)), e a primeira coisa
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
([D-65](DECISIONS.md)) — duas escalas de uma pergunta só.
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

**O Eco Audit fechou a faixa P3 menos o Synthesizer** ([D-66](DECISIONS.md)):
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

**O Battery Designer fechou a faixa P4 do lado do método** ([D-69](DECISIONS.md)),
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

## Sintetizador e painéis sanduíche (D-67, D-68)

**O Synthesizer fechou a terceira linha em zero da faixa P3**
([D-67](DECISIONS.md)): compósito de dois constituintes e espuma de um
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

**Os Sandwich Panels fecharam a faixa P3** ([D-68](DECISIONS.md)): duas
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

## Unidades e unidade de leitura (D-70)

**A unidade de leitura fechou a matriz do EduPack em 32 de 32**
([D-70](DECISIONS.md)), e o desenho sai de uma assimetria: **ler não é
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

## Gráficos, figuras e MSDS (D-80, D-81)

**D-80 aplicou o MSDS de verdade depois de um relatório do autor com o app no
ar** ([D-80](DECISIONS.md)): `msds.css` redefinia `--accent` em hex e
anulava a paleta de D-73 (o "M" preto) — removido, uma paleta só; `msds.css`
é importado **antes** de `globals.css`; `@material/web` saiu (a fonte
serifada e o seletor de tema ilegível no trilho vinham dele); `className` num
`Input`/`Select` volta a estilizar o **campo inteiro**, não o controle; a
coluna principal foi a 1536 px; as telas de ferramenta viraram `StepCard`s
com o resultado na tela desde o início; e cinco falhas funcionais saíram no
caminho (prévia do Sintetizar que nunca rodava, Dimensionar sem caso inicial,
links de material para família inexistente, seletor de processo vazio em Eco,
limite ausente impresso como `0`).

**D-81 fechou o pendente do D-80** ([D-81](DECISIONS.md)): a caixa do
Chart Stage atravessa entre a unidade de leitura do mapa (g/cm³, GPa) e a
canônica do estágio (kg/m³, Pa) por `POST /api/charts/map-box`, nos dois
sentidos, e **pela mesma regra que desenha o mapa** (`ChartService._map_reading`):
eixo de índice, unidade com offset e universo de processos não se movem num
nem noutro. O cliente nunca aplica fator.

## Acesso, portão e registros próprios (D-42, D-43, D-46, D-62, D-83)

**Portão de assinatura concluído** — em cima do login de A5, todo usuário
autenticado agora também precisa de uma assinatura Stripe ativa para usar
qualquer rota da ferramenta; tenant é o usuário individual, sem
`Organization` nem `tenant_id` — mesma fronteira de isolamento de D-42, só
com verificação de plano por cima; um preço só no v1
([D-43](DECISIONS.md)). `/entrar`, `/assinatura`, `/health` e as rotas
de `/billing` continuam fora do portão; o webhook do Stripe tem guarda de
ordem para uma reentrega fora de ordem não reativar assinatura cancelada.

**O portão global de assinatura está ligado** ([D-46](DECISIONS.md)):
entre os dois desenhos que o PR #18 deixou coexistindo em código, o autor
escolheu o binário do plano de 18/08 — `require_active_subscription` exige
`Subscription.status == "active"` em todo router exceto
`health`/`auth`/`billing`, e `AuthGate.tsx` voltou a ser um portão de dois
estágios (`/auth/me` → `/billing/status`). O plano Free/Pro de 21/08 fica
registrado como alternativa não implementada. `STRIPE_API_KEY` continua vazio
por padrão (D-36) — o portão bloqueia sem assinatura, mas `checkout`/`portal`
respondem 503 até um operador configurar o Stripe de verdade.

**O P1-4 fechou a faixa P1** ([D-62](DECISIONS.md)): o catálogo ganhou
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

**O portão virou um modo** ([D-83](DECISIONS.md)): `ACCESS_MODE`
(`subscription`, o padrão e o D-46 intacto; ou `open`) deixa uma turma usar a
ferramenta com qualquer conta Google, sem assinatura. Login continua
obrigatório, e **escrever no catálogo compartilhado continua exigindo
assinatura** — material compartilhado, classe, propriedade, importação e
ingestão; o estudante cria os próprios registros e estudos. A regra é uma só,
pura, em `app/domain/access.py`, lida pelo portão e por `/billing/status`
(que agora separa `active` — a assinatura — de `has_access` — o que o portão
lê — e de `can_edit_catalog`). **Rota nova que escreva no catálogo
compartilhado precisa de `require_catalog_curator`.** A troca em produção é o
workflow **Modo de acesso** (`modo-acesso.yml`, `abrir`/`restaurar_assinatura`),
que só fica verde depois de ler o modo novo em `/api/health`.

## Demo e seed (D-71, D-72)

**Uma auditoria ao vivo achou os 70 materiais fictícios do PR #59 ausentes em
produção, e a causa era mais funda do que "esqueceram de rodar o seed"**
([D-71](DECISIONS.md)): eles viviam em `apps/api/app/db/seed_extended.py`,
um módulo próprio que nenhum script — nem `admin-banco.yml`, nem
`scripts/seed.ps1`, nem a CI — jamais chamava. Rodar `semear` terminava verde
porque o script que ele de fato executava (`app.db.seed`) não lançava erro
nenhum; só não continha os 70 materiais. A separação em dois módulos
continua certa — `conftest.py` reexecuta `app.db.seed` como base de todo
teste do backend, e dobrar esse baseline para 75 materiais quebraria dezenas
de asserções por contagem fixa —, o que faltava era ligar o segundo módulo a
algo que roda. `admin-banco.yml` (`semear_demo`) e `scripts/seed.ps1` agora
executam os dois, em sequência; o stub vestigial `seed_patch.py`, do mesmo
PR e nunca importado por nada, foi removido.

**Apagar dado de demonstração ganhou um único caminho** ([D-72](DECISIONS.md),
[D-102](DECISIONS.md)): `apps/api/app/db/clear_demo.py`
(`python -m app.db.clear_demo`, ação `excluir_demo` de `admin-banco.yml`)
apaga toda linha fictícia dos modelos que possuem `is_demo`: `Material`,
`Process`, `TransportMode`, `BatteryChemistry`, `PerformanceIndex` e
`Source`. Fonte demo ainda citada por registro real faz o comando abortar. A
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

## Estúdio e Cadernos (D-92, D-94, D-97, D-98)

**Cadernos: o NotebookLM dentro do app, fase 1** ([D-92](DECISIONS.md)), e
**o Gemini gratuito como IA oficial** ([D-93](DECISIONS.md)). Cada aluno tem
cadernos privados (`/app/cadernos`) com fontes próprias — PDF, DOCX, TXT, MD,
texto colado, ficha de material, estudo salvo —, conversa citada e notas, na tela
de três painéis do NotebookLM (Fontes | Conversa | Estúdio). Três regras não se
afrouxam: **os trechos de caderno moram em tabelas próprias** (a busca do Cérebro
não tem dono; as funções dela são reaproveitadas, os dados não), **a busca só
ranqueia a lista que recebe** (as fontes marcadas de um caderno, carregadas pelo
repositório que não existe sem dono), e **todo número de uma resposta tem de
estar no trecho que aquele parágrafo cita** — uma nova tentativa nomeando o
número, depois o parágrafo sai com o motivo escrito. Cota diária por aluno
(`NOTEBOOK_DAILY_REQUESTS`). O Gemini entra por configuração do `openai-compat`
(chave do AI Studio **sem faturamento**, trocada pelo workflow **Provedor de
IA**, `provedor-ia.yml`, que confere em `/api/health`); **o `mock` continua o
padrão do código e dos testes**. As fontes da web são a fase 3 (D-97, abaixo);
slides, infográfico, áudio e vídeo (pela voz do navegador) são a fase 4
(D-98, abaixo).

**O Estúdio de texto é a fase 2** ([D-94](DECISIONS.md)): relatório,
cartões didáticos, teste, tabela de dados e mapa mental, no modal "Criar …" de
Formato e Modelo com lápis (a instrução do modelo mora no catálogo do backend,
`app/ai/studio.py`, e a tela a lê por `GET /notebooks/studio-catalog`). A
geração **responde 202 e roda em segundo plano** numa sessão própria
(`get_session_factory`, que os testes sobrescrevem); artefato `gerando` além do
prazo é **lido** como falho, nunca escrito por um GET. **Todo número de todo
item tem de estar no trecho que o item cita — distratores do teste inclusive**
(`app/notebooks/grounding.py`, a regra do chat); a célula de tabela que falha
**fica**, com rótulo escrito ("não consta nas fontes" ≠ "omitida"). O layout do
mapa mental é calculado em `app/notebooks/mindmap.py` e serve a tela e o SVG
exportado — não recalcule no cliente. Cota própria (`NOTEBOOK_DAILY_ARTIFACTS`),
com as gerações em andamento já descontadas.

**As fontes externas são a fase 3** ([D-97](DECISIONS.md)): o link de um
site, o YouTube (a transcrição é colada; a legenda automática exige um token
*Proof-of-Origin*) e a pesquisa em OpenAlex, Wikipédia e web. Regras que não se
afrouxam:

- **URL escrita pelo aluno só passa por `app/integrations/safe_fetch.py`.** A
  lista de bloqueio é explícita (nunca `is_global`, que muda entre o 3.11 e o
  3.12). O IP fica fixado com `Host` + SNI, e cada redirecionamento é
  conferido de novo. Há tetos de tamanho e de prazo, DNS incluído, nada de
  cookie, `Connection: close` e `trust_env=False`.
- **A duplicata é barrada pela origem canônica, antes da rede** — e, num
  artigo da OpenAlex, pelo id mesclado guardado em `meta.merged_from`.
- **A cota `NOTEBOOK_DAILY_FETCHES` é consumida de forma atômica**
  ([D-99](DECISIONS.md)): reservada
  antes de a requisição sair, por **um** `UPDATE … WHERE fetches < limite` (e
  nunca ler-e-escrever: um teste da forma do SQL falha se voltar), e gravada com
  commit. Conta quando a requisição sai do servidor — a consulta ao DNS de um
  nome também, respondida ou não —, porque é pela falha que se sonda uma rede
  interna; só volta se nada saiu. As cotas da conversa e do Estúdio seguem o
  mesmo modelo, e uma geração devolve a unidade **uma vez só**: quem a tira de
  `gerando`, num `UPDATE`/`DELETE` condicionado ao status.
- **O extrator de HTML descarta nós ocultos**, onde se esconde injeção de
  prompt — pelo atributo e pelo **CSS inline** (`display`, `visibility`,
  opacidade, `clip`, fora da página, caixa zero, escala a nada). **Qualquer**
  declaração que oculta conta, não só a última (o navegador ignora um valor
  inválido e mantém o anterior, D-99), e a propriedade personalizada vazia é
  valor (`--off: ;` com `display:var(--off) none` oculta). Fonte minúscula e
  tinta transparente são herdadas: sai só o texto ilegível, nunca o filho que
  as desfaz. **O leitor tem orçamento** (atributo, escopo, expansão de
  `var()`, trabalho por página), e o que passa dele — ou o faz tropeçar —
  **oculta o nó**, nunca lança exceção. Não afrouxe essa direção (D-99).
- **A atribuição vai do `meta` da fonte a `CitationOut`** e às exportações do
  Estúdio, CC BY-SA 4.0 inteira para a Wikipédia. O marcador de seção é `N.`,
  porque o conferidor lê `3 200` como 3200.
- **O Gemini só busca**: um cliente nativo que descarta o texto gerado. As
  Sugestões da Pesquisa ficam num `iframe` `sandbox` sem script, e a chave de
  outro fornecedor **nunca** vai ao Google.
- **Custo zero.** OpenAlex e web vêm desligadas até haver uma chave gratuita,
  de conta sem forma de pagamento. Esgotada a franquia, a função para com o
  motivo escrito, e nada sugere faturamento.
- **Os testes não têm rede:** o `conftest.py` reprova quem tentar sair.

**O Estúdio visual e sonoro é a fase 4** ([D-98](DECISIONS.md)): resumo em
áudio, resumo em vídeo, apresentação de slides e infográfico, no mesmo catálogo
e no mesmo modal do D-94. Regras que não se afrouxam:

- **A voz é a do navegador** (`speechSynthesis`), por custo zero — e por isso
  **não há MP3 nem MP4**: baixa-se o roteiro (DOCX/TXT) e o deck com a narração
  nas notas (PPTX). Áudio e vídeo têm o mesmo controle de velocidade. As vozes variam por aparelho; a tela diz quando não há
  pt-BR. `useSpeech` fala uma frase por vez, e `playLine` move e fala na mesma
  chamada, porque o iOS só fala dentro do toque.
- **O vídeo é o deck mais a narração, numa chamada só**; o item conferido é a
  fala, o slide inteiro, a cena inteira e cada dado, ponto e etapa.
- **O dado em destaque do infográfico segue a regra estrita**
  (`grounding.strict_ungrounded`): sem a isenção de inteiros até 100, sem as
  palavras do aluno, e a unidade tem de estar no trecho, **comparada com
  maiúsculas** — mPa ≠ MPa. Não afrouxe nenhuma das três. A **manchete**
  (título e subtítulo do infográfico, título de capa do deck e do vídeo) segue
  a mesma regra, e reprovada vira o título neutro com a frase no `withheld`.
- **Nenhum texto é partido dentro de um número**: `mindmap.wrap` quebra entre
  átomos ("1 200 MPa" é um só), e o teto do leitor (`_cap`, em
  `app/ai/studio.py`) corta entre os mesmos átomos — o que não cabe sai
  inteiro, nunca "1 2".
- **O layout do infográfico é do backend** (`app/notebooks/infographic.py`),
  com os `styles` de tipografia (as marcas `[n]` incluídas, `marks_*`, na tinta
  esmaecida `--ink-muted` na tela e no SVG) e o `artifact.title` como manchete:
  a tela e o SVG desenham as mesmas coordenadas — não recalcule nem fixe
  tipografia no cliente. O PNG é rasterizado no navegador (o Fly não tem
  libcairo) por **um** rasterizador só, `lib/rasterize.ts`, que serve também às
  figuras dos gráficos; então o SVG não pode ter `foreignObject` nem referência
  externa. O PDF dos slides é a impressão do navegador.
- **\"Salvar como nota\" encurta, não corta**: numa quebra de linha que guarde ao
  menos metade do espaço, nunca dentro de um número (`guardrails.NUMBER_TOKEN`,
  o átomo da conferência), e diz que encurtou (`studio_service.note_body`).
- **Nenhuma migração**: as quatro cabem nos campos JSON da fase 1.

## Cérebro e ingestão (D-47, D-100, D-101)

**O material de curso da ENG02016 saiu do Cérebro** ([D-100](DECISIONS.md)):
a pedido do professor, que não quer o material de sua autoria no RAG, e por
decisão do autor, que estendeu a retirada aos trabalhos dos alunos. Saíram 71
arquivos; livros, extratos, fichas Granta, diagramas e artigos ficam.
**`Cérebro/removidos.txt` é a fonte única do que saiu** — caminho exato ou
prefixo terminado em `/`, relativo a `KNOWLEDGE_DIR`, comparado em NFC, e uma
linha `sha256:<hex>` por conteúdo removido, porque o caminho gravado no banco é
o do disco que fez a ingestão, não o do git — e três coisas a leem, nenhuma com
cópia própria: `python -m app.knowledge.prune` (**simulação por padrão**, que
lista também **tudo o que fica**; casa por caminho **ou** conteúdo; `--apply`
apaga documento, trechos e embeddings numa transação, com a cascata em Python;
`--redact` troca o nome de cada arquivo pela pasta e o começo do sha256, porque
o log do Actions é público; ações `conhecimento_simular_remocao` e
`conhecimento_remover` de `admin-banco.yml`, as duas com `--redact`), a ingestão (que pula o que casa, em qualquer caminho, e o
declara `ignorado`) e a limpeza do histórico, que só lê as linhas de caminho
— **menos** as `mantido-no-historico:<caminho>`, que casam no banco e na
ingestão e ficam no histórico: é para o que sai do RAG por outro motivo, como a
edição duplicada do Ashby em português (D-101, 06/10), e não se mistura com o
que o D-100 apaga
([`docs/17-limpeza-historico-cerebro.md`](17-limpeza-historico-cerebro.md):
`push --force --atomic` de branches e tags, nunca `--mirror`, com a *ruleset*
suspensa). **A ingestão só acrescenta**: tirar um arquivo do repositório não
tira o texto dele do RAG — quem tira é o `prune`. **Feito em 30/09/2026:** o
autor rodou a remoção em produção (não há bases locais) e o histórico foi
reescrito (`main` `873dd53` → `b7dd105`, árvore idêntica, 76 commits duplicados
colapsados, assinaturas GPG perdidas; os 71 caminhos a 0). Reescrever não apaga
as refs de PR nem os objetos Git LFS guardados no GitHub: o pedido ao suporte
e refazer os clones antigos seguem como ações exclusivas do proprietário (TODO
A7 e `docs/17-limpeza-historico-cerebro.md`). **`Links.md` fica e é
indexado** — em produção, pela ação `ingerir` do workflow do Cérebro (D-101,
abaixo), sozinho com a entrada `arquivos: Links.md`, ou pela ação
`conhecimento_indexar_links` do `admin-banco.yml`; as duas usam o `--file` da
CLI de ingestão e nenhuma baixa o LFS —, por decisão do autor, com o link do
OneDrive que ele contém: a ingestão lê PDF e **só o Markdown que o
`manifesto.json` declara**; `README.md`, `manifesto.json` e `removidos.txt`
nunca entram.

**RAG sobre o Cérebro entregue** ([D-47](DECISIONS.md)): busca híbrida
(léxica BM25 + semântica, fundidas por *reciprocal rank fusion*) em
`app/knowledge/retrieval.py`, ligada só quando o provedor não é o `mock`, com
citação **verificada** por índice em `explain()` — nunca citação livre. A
ancoragem numérica foi provada intacta: `check_constraint` e
`ungrounded_numbers` nunca leem `context.retrieved`.

**O Cérebro entra em produção pelo GitHub Actions** ([D-101](DECISIONS.md)),
a pedido do autor ("resolva a ingestão do Links.md e ative o RAG"), com busca
por palavras **e** vetores — ele aceitou que o texto dos livros vá ao Gemini no
plano gratuito. O workflow **Base de conhecimento (Cérebro)**
(`conhecimento.yml`) tem `status`, `ingerir` e `embeddings`, e uma execução
noturna agendada. Regras que não se afrouxam:

- **A ingestão roda no runner, não na API, e sem chave de IA**: `ingerir` baixa
  do LFS **só o que o banco não tem** (`python -m app.knowledge.lfs_plan`: o
  `oid` do ponteiro é o sha256 do arquivo, o mesmo checksum da base — a banda
  de LFS gratuita é 1 GB/mês e a primeira ingestão completa baixa ≈528 MB) e roda
  `python -m app.knowledge.ingest --no-embed`. Um **ponteiro LFS nunca toca o
  banco** — o que aponta para os bytes já indexados no mesmo caminho sai
  `inalterado` sem ser lido, e o plano é a mesma decisão da ingestão, nunca
  uma cópia das regras; uma **cópia byte a byte** entra uma vez só (a declarada
  no manifesto, depois a já indexada, depois a primeira em ordem) e conta em
  `skipped`; uma **versão nova ilegível mantém a anterior**. O log público só
  mostra caminho declarado no manifesto.
- **A ingestão direcionada não fura nenhuma dessas garantias**: `--file`/`--path`
  (entrada `arquivos` de `ingerir`) só lê os arquivos nomeados — `Links.md`
  sozinho não precisa dos PDFs —, e a lista de remoção, a recusa do ponteiro LFS
  e a versão anterior mantida valem igual; `--force` reextrai, mas não libera
  ponteiro, arquivo removido nem cópia. Um nomeado cujos bytes já estão
  indexados noutro caminho ainda presente sai como cópia dele (salvo se for o
  declarado); uma cópia só no disco não conta; entre nomeados, a cópia entra
  uma vez. Um `--file` inválido sai como `ERRO: --file nº N`, sem o caminho.
- **Uma identidade de vetor: `gemini-embedding-001` com 768 dimensões**
  (`KNOWLEDGE_EMBEDDING_DIMENSIONS`), no `env:` de `conhecimento.yml` e repetida
  no `provedor-ia.yml` — mude os dois juntos. A busca compara só vetores do
  mesmo modelo **e** dimensão, no Cérebro e nos Cadernos, e `/api/health` diz
  qual identidade a API usa.
- **`python -m app.knowledge.embed` para verde** na cota diária, no limite de
  pedidos e no prazo; três 400 seguidos disparam um trecho-canário, e só um
  canário recusado falha (chave ruim: cinco pedidos no máximo). A chave sai do
  log como `[chave omitida]`, trocada antes do corte da mensagem. **Ele nunca
  envia trecho de documento que esteja em `removidos.txt`** (pelo leitor único
  `app/knowledge/removal.py`, caminho e sha256), e com a lista ilegível sai com
  1 antes de pedir; a noturna para em 1000 pedidos, para uma chave que um dia
  ganhe faturamento não passar do volume gratuito. A noturna das 05:07 UTC
  pode cancelar uma ação de `admin-banco` na fila: confira que ela rodou.
- **A busca ranqueia num índice residente** (`app/knowledge/index.py`), com BM25
  igual bit a bit ao de `lexical.bm25_scores` e duas impressões digitais por
  consulta; nunca volte a carregar o corpus por chamada (≈100 MB por processo a
  18 mil trechos, contra 300–500 MB de pico por chamada antes). Rode `ingerir`
  **fora do horário de aula**: cada documento gravado muda a impressão digital.

O código está pronto; a execução em produção é do autor (TODO A7, 13-deploy.md
§5-septies). **A primeira `ingerir` no Neon (06/10; segunda execução do
workflow, a primeira só rodou `status`) achou três defeitos**, corrigidos na
atualização de 06/10 do D-101: o pypdf devolve U+0000, que o
SQLite guarda e o PostgreSQL recusa — `storable_text()` em
`app/knowledge/readers.py` é a regra única, aplicada nos leitores, no
`normalise()` do fatiador e na fonte de caderno —; a recusa de **um**
documento encerrava a execução inteira — agora cada documento grava num
*savepoint* e o recusado sai `falhou` só com a classe do erro —; e o
traceback publicou SQL e parâmetros, **texto de livro licenciado**, no log
público. **Todo CLI do Cérebro que fala com o banco captura `SQLAlchemyError`
e imprime só o nome da classe, sem traceback; um CLI novo também**, e o motor
de `app/db/base.py` tem `hide_parameters=True` por baixo. O log da execução
37415600025 foi apagado pelo dono em 06/10/2026 (TODO, "Débitos já quitados");
apagar não desfaz uma cópia feita enquanto esteve público. **A
segunda `ingerir` achou o teto de 75 MB por fluxo do pypdf** nos dois Ashby em
português: o Cérebro (`extract_text`) lê com `CORPUS_MAX_STREAM_BYTES` (200 MB
— eram 500, até a revisão do PR #98 medir que um fluxo de operadores custa
~37× o tamanho), aplicado no `ContextVar` do pypdf (`apply_configuration`, piso
6.18) e nunca num global, com orçamento por documento (16 GB decodificados,
15 min) e pula a página que ainda não decodifica, contada por classe de erro
numa anotação `::warning:: … PÁGINAS IGNORADAS`; mais de um quinto das páginas
de fora (e ao menos 2, ou metade de um documento curto — revisão do PR #100)
é `FALHOU`, e `forcar` + `arquivos` em `ingerir`
reextrai um livro. **O teto é por fluxo; o que limita o documento é soltar as
cópias decodificadas do pypdf entre páginas (`readers._release_decoded`) —
sem isso a memória soma as páginas. O upload dos Cadernos (`read_upload`) lê
*abaixo* do padrão do pypdf (4 MB por fluxo, 32 MB por arquivo, páginas
contadas antes de decodificar), sob medida para a VM de 512 MB, e falha na
primeira página ilegível — não passe o teto do Cérebro a bytes de usuário.**
**O orçamento é cobrado a cada decodificação** (`readers._metered_decoding`,
um medidor em `ContextVar` na frente de `pypdf.filters.decode_stream_data`),
não entre páginas: conferido só entre páginas, uma página de 160 formas chegou
a 639 MB; a parada é uma `BaseException` porque o pypdf engole `Exception` em
cada forma, e no upload o que se lê de uma vez (formas aninhadas) não passa de
4 MB. Esses limites são **por leitura**: o upload lê **um PDF por vez no
processo** (`_UPLOAD_PDF_SLOT`) e tem **30 s** de relógio, conferido a cada
decodificação e a cada parse (uma forma redesenhada não decodifica nada); o
primeiro upload confere que os medidores são alcançados e, se não, recusa todo
PDF — o pypdf está fixado em `<6.20`; não suba sem reler `_install_meters`.
**`Cérebro/removidos.txt` falha fechada**: só `sha256:` e
`mantido-no-historico:`, escritos exatamente assim, valem como prefixo; outro
prefixo no primeiro trecho (dois-pontos, de largura cheia, espaço no lugar
deles, `sha256 <hex>`) ou um caminho com `Cérebro/` na frente para todos os
leitores, e nenhuma recusa cita a linha, só o número (D-101, revisão do PR
#100).

## Exportação CAE (D-104)

**O cartão de material para CAE saiu** ([D-104](DECISIONS.md), TM5,
Sessão 59): `app/exporters/cae/` tem um renderizador por formato — Ansys MAPDL,
MatML 3.1, Abaqus, Nastran `MAT1`, LS-DYNA `*MAT_ELASTIC` —, escrito a partir
da documentação **pública** (nunca de arquivo ou modelo do Granta/EduPack), e
`GET /api/exports/materiais/{id}/cae?formato=&unidades=` o serve com a
visibilidade do D-62. Regras que não se afrouxam: o **sistema de unidades é
escolhido, nunca padrão** (`m-kg-s`, `mm-t-s`, `in-lbf-s`; não é a unidade de
leitura do D-70) e a conversão sai do canônico por `units.from_canonical`;
**ausente é omitido com "não cadastrado", nunca 0**; faltando o mínimo do
formato (E e ν nos decks, ρ também no LS-DYNA) a resposta é **422**
(`ExportRefusedError`) — o branco seria preenchido pelo padrão do solver; todo
arquivo leva o aviso de limitação, a proveniência e a marca de fictício quando
o material **ou a fonte de um valor** é demo; o escape é por formato (XML no
MatML; nome sem quebra de linha e rótulo saneado nos decks). Poisson, expansão
e calor específico são lidos de `coef_poisson`, `coef_expansao_termica` e
`calor_especifico`, que o catálogo ainda não define — até lá os decks recusam
todo material e só o MatML sai (TM5-a).

**O demo é completo desde o D-107**: os 75 materiais demo têm designação,
composição e (salvo a Cerâmica Demo D, sem resistência para ancorar) curva, tudo
`is_demo`. Os 5 do baseline ficam em `app.db.seed` quase intactos; o que os
outros 70 recebem mora em `seed_extended_identity.py`/`demo_identity_data.py` e
roda por `python -m app.db.seed_extended`, com o **mesmo escritor** do baseline.
As curvas são derivadas das propriedades do próprio material, e a premissa tomada
onde elas faltam ou se contradizem fica na descrição da curva.
`python -m app.db.demo_coverage` lista a cobertura e a razão de cada ausência.

## Composição e busca (D-105)

**Composição química e designações entraram no catálogo e na busca**
([D-105](DECISIONS.md), TM2, Sessão 60): `MaterialDesignation` e
`MaterialCompositionEntry` (% em massa, trilha de unidade, fonte obrigatória),
e a linguagem do D-55 ganhou `comp:`, `norma:` e `designacao:`. Regras que não
se afrouxam: o **resto é declarado, nunca calculado** e resto/ausente não
carregam número (`CHECK` no banco); **sem linha de composição não é 0 %**; a
faixa é lida por **alcance** (`≥ x` quando o máximo chega a x; "≤ máx." admite
`[0, máx.]`) em **lógica de três valores** — o dado ausente não passa, nem sob
`NOT`, e `GET /api/materials/busca` conta quem ficou de fora; a regra mora só em
`app/domain/composition.evaluate`, e o repositório compila os ids, nunca uma
cópia em SQL; designação **não** declara equivalência (`code_key` só tira caixa
e espaço). O bundle do D-102 aceita `material_designations.ndjson` e
`material_compositions.ndjson`. Só o demo (códigos `DEMO-`) tem esses dados — desde o D-107, os 75 materiais demo.

**Equivalência é declarada, nunca inferida** ([D-115](DECISIONS.md), TM1, Sessão
70): `EquivalenceGroup` (tipo `EQUIVALENTE`/`APROXIMADA`/`SIMILAR` + `Source`
obrigatória, com licença para dado real) liga `EquivalenceMember`s, que apontam
para **designações**, não para materiais. Só o curador escreve
(`require_catalog_curator`); a ficha mostra tipo, fonte, licença e localização, e
"nenhuma equivalência declarada" por extenso. Nenhuma função compara códigos ou
nomes (teste: dois materiais com o mesmo código, sem grupo, não têm equivalência);
a busca por `norma:`/`designacao:` **não** expande por equivalência. Demo e real
não se misturam no mesmo grupo, e `clear_demo` recusa apagar designação demo
ligada por grupo real.

## Catálogo oficial e fontes abertas (D-102, D-103)

**O portão de licença das fontes abertas foi reconciliado com o D-102**
([D-103](DECISIONS.md), rascunho, Sessão 58): fonte aberta entra só com
veredito APROVADA em `docs/catalogo/fontes.md` e pelo pipeline do D-102, sem
importador paralelo; nenhuma está APROVADA ainda (condição C0). Regra em
[`docs/20-catalogo-fontes-abertas.md`](20-catalogo-fontes-abertas.md).
Só documentação.

4079 testes de backend (nenhum skip na CI; sem `POSTGRES_TEST_URL`, 4073 passam
e 6 pulam) e 797 de frontend, todos verdes. CI no
GitHub Actions roda em todo PR e push para `main`, agora com um quinto job
(`Lighthouse`, medindo desempenho/acessibilidade em 11 rotas — ver §12 do
PROJECT_CONTEXT.md).
