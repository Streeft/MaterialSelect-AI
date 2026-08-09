# Registro de decisões

Índice das decisões arquiteturais e o **porquê** de cada uma, com as
alternativas descartadas. As quatro decisões de maior peso têm ADR próprio em
[`adr/`](adr/); as demais estão registradas aqui.

Uma decisão só entra neste arquivo se alguém razoável pudesse ter escolhido
diferente. O que é óbvio não precisa de registro.

---

## Índice

| # | Decisão | Status | Detalhe |
|---|---|---|---|
| ADR 0001 | SQLite agora, PostgreSQL depois | aceito | [ADR](adr/0001-sqlite-agora-postgres-depois.md) |
| ADR 0002 | Pint para unidades | aceito | [ADR](adr/0002-pint-para-unidades.md) |
| ADR 0003 | IA desacoplada do cálculo | aceito | [ADR](adr/0003-ia-desacoplada-do-calculo.md) |
| ADR 0004 | Geometria de gráficos no backend | aceito | [ADR](adr/0004-geometria-de-graficos-no-backend.md) |
| D-05 | Parser de expressões sem `eval` | aceito | abaixo |
| D-06 | Dimensão do índice derivada, não declarada | aceito | abaixo |
| D-07 | Dado ausente exclui, não penaliza | aceito | abaixo |
| D-08 | Números da IA ancorados no texto do usuário | aceito | abaixo |
| D-09 | Unidade explícita obrigatória em limiar dimensionado | aceito | abaixo |
| D-10 | Provedor de IA simulado é determinístico | aceito | abaixo |
| D-11 | Falha alta em provedor de IA desconhecido | aceito | abaixo |
| D-12 | Coordenadas paralelas sem `parcoords` do Plotly | aceito | abaixo |
| D-13 | Escape de fórmula visível e não destrutivo | aceito | abaixo |
| D-14 | Exportador reexecuta o pipeline em vez de guardar resultado | aceito | abaixo |
| D-15 | stdlib `csv` + `openpyxl` em vez de pandas | aceito | abaixo |
| D-16 | Contrato de tipos duplicado conscientemente | aceito, com débito | abaixo |
| D-17 | BEGIN explícito nos testes (pysqlite) | aceito | abaixo |
| D-18 | Sem autenticação no MVP | aceito, com risco | abaixo |
| D-19 | Merge commit em vez de squash | aceito | abaixo |
| D-20 | HTML imprimível em vez de biblioteca de PDF | aceito | abaixo |
| D-21 | Campo opcional não preenchido continua `NULL` | aceito | abaixo |
| D-22 | Repositório público para o portão de CI ser real | aceito, com consequência | abaixo |
| D-23 | Sistema de design próprio, sem biblioteca de componentes | aceito | abaixo |
| D-24 | Qualidade do dado codificada em três canais, nunca só cor | aceito | abaixo |
| D-25 | Hipóteses do índice antes da escolha, não depois | aceito | abaixo |
| D-26 | Navegação agrupada por tarefa, sem menus suspensos | aceito | abaixo |

---

## D-05 — Parser de expressões sem `eval`

**Contexto.** Índices de desempenho são fórmulas escritas pelo usuário
(`sqrt(modulo_young) / densidade`). Alguém precisa avaliá-las.

**Decisão.** `ast.parse` + whitelist recursiva + interpretador manual
(`app/calculations/expressions.py`). Aceita apenas números, variáveis,
`+ - * / **`, unário `+/-`, parênteses e `sqrt`/`cbrt`/`abs`. Qualquer outro nó
— atributo, índice, chamada, lambda, comprehension, string — é rejeitado.

**Alternativas descartadas.**
- `eval` com `__builtins__` limpo: escapável por atributos de objetos; a
  literatura de sandbox escape em Python é longa. Inaceitável num sistema que
  aceita expressão de usuário.
- `sympy`: dependência pesada para um subconjunto pequeno, e ainda exigiria
  restringir a entrada.
- Linguagem própria com parser dedicado: mais código para o mesmo resultado; o
  AST do Python já dá a árvore pronta.

**Consequência.** ~130 linhas testadas contra injeção, e o mesmo interpretador
serve dois domínios numéricos (`float` e `Quantity`), o que habilita a D-06.

---

## D-06 — Dimensão do índice derivada, não declarada

**Decisão.** O mesmo interpretador roda sobre `Quantity` do Pint, com cada
variável valendo `1 * unidade_canônica`. A dimensão do resultado sai da
avaliação.

**Alternativa descartada.** Pedir ao usuário que declare a dimensão do índice:
seria mais uma coisa para errar, e um índice com dimensão declarada errada passa
despercebido para sempre.

**Consequência.** Somar termos dimensionalmente incompatíveis é rejeitado
automaticamente, e a dimensão exibida no relatório é verificável.

---

## D-07 — Dado ausente exclui do ranking, não penaliza

**Contexto.** Um material sem valor para um critério precisa de tratamento.

**Decisão.** Ele é **excluído do ranking e reportado**, com a lista do que
faltou. Nunca preenchido com zero, média ou mediana.

**Alternativas descartadas.**
- Preencher com zero: transforma "não sei" em "é o pior", que é uma afirmação
  que o dado não sustenta.
- Preencher com a média: inventa um valor de propriedade — viola o princípio nº 1.
- Ignorar o critério para aquele material: torna as pontuações incomparáveis
  entre si sem avisar.

**Consequência.** A interface e o relatório têm uma seção própria de excluídos
que diz *por falta de qual dado*. É informação útil sobre a base, não ruído.

---

## D-08 — Todo número da IA tem de aparecer no enunciado

**Contexto.** "A IA não calcula" precisava deixar de ser promessa e virar
verificação.

**Decisão.** Guardrail: todo número de uma restrição proposta tem de ocorrer no
texto que o usuário escreveu. A comparação é generosa quanto à *leitura*
("1.500" pode ser 1500 ou 1,5) e estrita quanto à *existência*.

**A regra rejeita até aritmética correta**: "300 °C" ancora `300 degC` mas não
`573.15 kelvin`. Converter é trabalho do backend, que registra a trilha; se a IA
converter, o valor perde proveniência.

**Alternativa descartada.** Confiar na instrução do prompt. Prompt não é
verificação; um modelo diferente, ou o mesmo modelo em outro dia, ignora.

---

## D-09 — Limiar dimensionado tem de declarar a unidade

**Contexto.** Descoberto ao demonstrar a Fase 6 ao vivo, não por teste. Quando o
provedor não identificava a unidade, a restrição saía com `unit: null` — e a
jusante unidade ausente significa "já está na canônica". "No mínimo 300 graus C"
virava `≥ 300 K`, ou seja −173 °C: nenhuma restrição.

**Decisão.** Guardrail adicional. Adimensionais são isentas. O provedor
simulado, em vez de esbarrar na regra, deixa de propor e devolve pergunta aberta
citando a cláusula.

**Alternativa descartada.** Assumir a unidade canônica quando ausente — é
exatamente o comportamento que causou o defeito.

---

## D-10 — O provedor simulado é determinístico

**Decisão.** `MockAIProvider` usa regras lexicais sobre o catálogo vivo. Sem
aleatoriedade: o mesmo enunciado sempre produz a mesma leitura. A ordenação de
índices sugeridos desempata por slug justamente para não variar.

**Por quê.** Sem isso, a camada de IA não poderia aparecer num argumento de
reprodutibilidade — e ela é a parte do sistema sob maior suspeita metodológica.

---

## D-11 — Provedor desconhecido falha alto

**Decisão.** `AI_PROVIDER` com valor não reconhecido levanta erro em vez de cair
para o simulado.

**Por quê.** Um fallback silencioso deixaria um deploy acreditando que fala com
um modelo quando não fala. Falhar alto é a única leitura honesta.

---

## D-12 — Coordenadas paralelas sem `parcoords`

**Contexto.** O Plotly tem um traçado dedicado a coordenadas paralelas.

**Decisão.** Não usá-lo. A visualização é um gráfico de linhas sobre eixo
categórico com `connectgaps: false`.

**Por quê.** `parcoords` não sabe expressar coordenada ausente — seria preciso
inventar um valor, violando o princípio nº 3. Com linhas, a falta simplesmente
interrompe a linha, que é a representação honesta.

---

## D-13 — Escape de fórmula visível e não destrutivo

**Contexto.** Excel e LibreOffice executam célula iniciada por `=`, `+`, `-`,
`@`, TAB ou CR.

**Decisão.** Prefixar com apóstrofo — a convenção de planilha para "trate como
texto". O valor mantém todos os seus caracteres.

**Alternativas descartadas.**
- Remover o prefixo perigoso (como faz o importador): altera o dado exportado
  em silêncio. Na entrada é aceitável; na saída, não — o arquivo deve refletir o
  que está no banco.
- Não escapar e confiar no leitor: o arquivo circula fora do nosso controle.

**Exceção deliberada.** Números negativos saem como célula **numérica**, que
nenhuma planilha lê como fórmula. Escapá-los inviabilizaria aritmética na
planilha exportada sem ganho de segurança.

**Nota.** Importador e exportador sanitizam pontas diferentes: o importador
protege os dados *deste* sistema, o exportador protege *a planilha de quem
recebe*. Um dado pode chegar ao banco por caminhos que o importador nunca viu.

---

## D-14 — O exportador reexecuta o pipeline

**Decisão.** `ExportService` chama `SelectionService.run_study` e organiza o
retorno. Não guarda nem recalcula resultado.

**Alternativa descartada.** Persistir o resultado do estudo no momento em que
foi executado. Seria mais rápido, mas um relatório exportado meses depois
mostraria números que não correspondem mais ao catálogo, sem avisar.

**Consequência.** Exportação e tela não podem divergir, por construção.

---

## D-15 — stdlib `csv` + `openpyxl` em vez de pandas

**Decisão.** Ler e escrever planilhas com a biblioteca padrão e `openpyxl`.

**Por quê.** pandas traria ~50 MB e um modelo de dados (DataFrame, `NaN`) cuja
semântica de valor ausente é justamente a que o projeto recusa: `NaN` se propaga
silenciosamente em aritmética. O controle célula a célula é o que se quer aqui.

---

## D-16 — Contrato de tipos duplicado conscientemente

**Decisão.** `packages/shared-types/index.ts` é canônico e
`apps/web/lib/types.ts` o espelha manualmente.

**Por quê.** Unificar exigiria npm workspaces + `transpilePackages`, complicando
o build do Next no MVP.

**Custo aceito.** Ao alterar um contrato é preciso alterar dois arquivos.
Registrado como débito em [TODO.md](TODO.md).

---

## D-17 — BEGIN explícito nos testes

**Contexto.** O isolamento transacional por teste estava **quebrado sem que a
suíte acusasse**: pysqlite emite BEGIN sozinho e nunca antes de SAVEPOINT, então
um teste cuja primeira instrução fosse uma escrita escapava do rollback e vazava
para todos os seguintes. Nenhum teste existente tinha essa forma.

**Decisão.** Receita documentada do SQLAlchemy: `isolation_level = None` no
connect e `BEGIN` emitido por listener. Mais `test_isolation.py` como canário.

**Alternativa descartada.** Convencionar "todo teste começa lendo" — depende de
disciplina humana para uma propriedade que a máquina pode garantir.

---

## D-18 — Sem autenticação no MVP

**Decisão.** Nenhuma autenticação, autorização, sessão ou usuário.

**Por quê.** O MVP roda localmente, para um trabalho acadêmico, com dados
fictícios. Autenticação seria escopo grande sem servir à contribuição
metodológica.

**Risco explícito.** A API é totalmente aberta, incluindo escrita e exclusão.
**Não exponha em rede sem resolver isso.** É o primeiro item de alta prioridade
do [TODO.md](TODO.md).

---

## D-19 — Merge commit em vez de squash ou rebase

**Decisão.** PRs entram com merge commit.

**Por quê.** As mensagens de commit por fase são documentação substancial do
trabalho — squash as colapsaria; rebase reescreveria os hashes que os corpos de
PR citam nominalmente.

**Custo aceito.** O histórico do `main` deixou de ser estritamente linear.

---

## D-20 — HTML imprimível em vez de biblioteca de geração de PDF

**Contexto.** O formato que se anexa a uma monografia é PDF. CSV e XLSX servem a
planilhas, não à leitura.

**Decisão.** Renderizar o mesmo `Report` em HTML autocontido com folha de estilo
de impressão (`app/exporters/html.py`) e deixar o PDF sair do "imprimir para
PDF" do navegador.

**Alternativas descartadas.**
- WeasyPrint: traz GTK/Pango/Cairo como dependências de sistema. Instalar o
  projeto no Windows deixaria de ser `pip install -e .`, o que é caro demais
  para um trabalho que precisa ser reproduzido por outra pessoa.
- ReportLab: desenhar cada tabela em coordenadas, reimplementando paginação e
  quebra de linha que o navegador já resolve — e um segundo layout para manter
  em sincronia com o primeiro.
- `wkhtmltopdf`/headless Chrome no servidor: um binário externo e um processo
  por exportação, para produzir o mesmo PDF que o navegador do usuário já
  produz de graça.

**Consequência aceita.** O PDF depende de uma ação do usuário (Ctrl+P) e sua
paginação exata varia com o navegador. Em troca, zero dependência nova, um único
modelo de relatório e um artefato que abre em qualquer lugar.

**Corolário — o escape é por formato, não global.** `cells.py` protege planilha
contra fórmula; `html.py` protege documento contra marcação. Reaproveitar o
primeiro no segundo seria errado nas duas pontas: um `=` é inerte em HTML, e o
apóstrofo apareceria na tela como corrupção visível do dado exportado. O router
ainda serve a página sob `default-src 'none'`, como camada independente do
escape.

**Corolário — sem carimbo de data/hora.** O relatório reexecuta o pipeline
determinístico; o mesmo catálogo tem de produzir os mesmos bytes. Um relógio
quebraria isso sem acrescentar nada ao aviso de reprodutibilidade.

## D-21 — Campo opcional não preenchido continua `NULL`

**Contexto.** Um critério de ranking salvo sem rótulo e sem direção guardava a
chave e `"max"` no lugar deles. Os dois campos são derivados: sem rótulo, a
execução usa o nome do índice ou da propriedade; sem direção, usa o
`better_direction` cadastrado. Preencher na gravação congelava um palpite que
depois passava à frente da fonte que ele só deveria substituir.

O rótulo fabricado imprimia `__index__` e `modulo_young` no relatório. A direção
fabricada é pior: um critério salvo como "automático" sobre densidade — em que
menor é melhor — voltava como maximizar e **invertia o ranking** do estudo
reexecutado. O mesmo estudo dava resultados diferentes conforme tivesse sido
salvo, que é exatamente o que a metodologia afirma ser impossível.

**Decisão.** Colunas de campo opcional são anuláveis, e `NULL` significa "o
usuário não disse". Quem executa deriva a resposta, toda vez, da mesma fonte que
já usava para um estudo não salvo (migration `07b420ca5122`).

Isto é o princípio nº 3 — *dado ausente nunca vira zero* — aplicado onde ele não
tinha sido notado. A regra vale para o dado numérico e vale para o resto: a
ausência não pode ser substituída por um valor plausível que depois se comporta
como se tivesse sido informado.

**Alternativa descartada.** Resolver o rótulo na gravação, guardando o nome real
em vez da chave. Continuaria sendo uma cópia de dado derivado, que envelhece
quando o índice ou a propriedade é renomeado, e não resolveria a direção — para
essa, não há nada de sensato a congelar.

**Consequência aceita.** A migration repõe para `NULL` o rótulo que apenas
repetia a chave: a chave continua na coluna `key`, então nada se perde. A
direção **não** é tocada, porque não há como distinguir um `"max"` fabricado de
um `"max"` escolhido, e reescrever mudaria em silêncio o resultado de estudos já
salvos — o defeito que a decisão existe para acabar.

**Corolário — chave é identificador, não palavra.** Onde um rótulo faltava, três
superfícies imprimiam a chave crua: contribuições e sensibilidade, a tabela de
excluídos e a linha de proveniência de uma propriedade que o material sequer
tem. `ExcludedMaterial` passou a carregar `missing_keys` *e* `missing_labels` —
o identificador estável para quem compara, o nome para quem lê.

---

## D-22 — Repositório público para o portão de CI ser real

**Contexto.** A CI existia desde a Fase 6 e rodava em todo PR, mas era
**convenção, não portão**: um merge com CI vermelha passava. Enquanto isso, a
alegação central do trabalho é que a seleção é reprodutível — e reprodutibilidade
verificada por um check que ninguém é obrigado a esperar não está verificada.

Tornar os checks obrigatórios esbarrou num limite de plano, não de configuração:
**o GitHub Free não protege branch em repositório privado.** Tanto
`PUT /repos/{owner}/{repo}/branches/main/protection` quanto
`POST /repos/{owner}/{repo}/rulesets` respondem
`403 — "Upgrade to GitHub Pro or make this repository public"`.

**Decisão.** Tornar o repositório público, e sobre ele aplicar a ruleset
`CI obrigatoria em main` — `Backend (Python 3.11)`, `Backend (Python 3.12)` e
`Frontend` obrigatórios, **sem ator de exceção**, com a branch obrigada a estar
atualizada com `main`.

Não há bypass para o dono de propósito. Um portão que o autor contorna sozinho é
o mesmo portão que não existia antes, com mais passos.

**Alternativas descartadas.**
- **GitHub Education** (Pro gratuito para estudante verificado, repositório
  segue privado): seria a saída de menor consequência, mas a verificação leva
  dias e o portão ficaria dependendo de aprovação de terceiro.
- **Assinar o GitHub Pro:** resolve na hora e mantém privado, ao custo de uma
  assinatura mensal por um repositório de TCC.
- **Deixar como convenção:** é a opção que a decisão existe para recusar.

**Consequências aceitas.** Auditadas antes de publicar: nenhum segredo, `.env`,
banco ou chave jamais foi commitado — só os três `.env.example`. Ficam públicos
e permanentes o e-mail do autor nos 18 commits e o número de cartão UFRGS em
[`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) §1, ambos com o autor ciente. O
código já era MIT. Publicidade não se desfaz revertendo: o que for clonado ou
indexado permanece.

**Corolário — a lista de checks é fixa e tem de ser mantida.** A ruleset exige
nomes literais. Um job acrescentado ao `ci.yml` e ausente da lista roda, aparece
vermelho no PR e **não impede o merge**; um nome exigido que nunca é reportado
bloqueia todo merge para sempre. Por isso a configuração é código versionado —
`scripts/protect-main.ps1`, idempotente — e não um clique em *Settings* que
ninguém revisa.

---

## D-23 — Sistema de design próprio, sem biblioteca de componentes

**Contexto.** A Fase 8 precisava de primitivas de interface: o "botão primário"
existia em **sete grafias diferentes**, havia 639 `className` inline em 5.014
linhas de TSX, nenhum componente reutilizável e nenhuma escala de token além de
cinco tons de `brand`. Alguma camada tinha de aparecer.

**Decisão.** Escrever as primitivas neste repositório
(`apps/web/components/ui/`), sobre Tailwind, com duas dependências utilitárias
minúsculas: `clsx` e `tailwind-merge`.

**Alternativas descartadas.**
- **shadcn/ui:** copia o código para dentro do projeto, o que resolveria a
  autoria, mas traz Radix inteiro como dependência e um vocabulário de API que
  não é o do projeto. Seriam ~15 dependências novas para substituir 20 arquivos.
- **MUI / Chakra:** impõem um sistema de temas concorrente ao dos tokens CSS, e
  o tema do Plotly teria de ser derivado de um terceiro lugar.
- **Nenhuma abstração, só disciplina:** é o estado que a fase existe para
  corrigir. Convenção sem primitiva já falhou sete vezes, uma por botão.

**Consequências aceitas.** Cobertura menor que a de uma biblioteca madura: não
há combobox, date picker nem menu com submenu — nenhum deles é necessário aqui.
Os padrões de teclado (foco preso no diálogo, setas nas abas, `Escape` que
devolve o foco) são responsabilidade nossa, e por isso cada um tem teste.

**Corolário — o painel do popover vive num portal.** Não é preferência de
implementação: os gatilhos de proveniência ficam dentro de células de tabela, e
tabela vive dentro de `overflow-x: auto`. Um painel posicionado no fluxo é
recortado pelo próprio contêiner de rolagem — e, quando o gatilho está inline
num parágrafo, um `<div>` dentro de `<p>` derruba a hidratação do React.

---

## D-24 — Qualidade do dado codificada em três canais, nunca só cor

**Contexto.** A proposta compromete a ferramenta a **distinguir na interface**
dados importados, estimados e ausentes (§3.3). O que existia era micro-texto
cinza indiferenciado — `Qualidade: Estimado` no mesmo peso visual de `Fonte:` e
`Condição:`, que é o peso do ruído.

**Decisão.** Todo estado de qualidade é exibido com **rótulo escrito + glifo +
cor**, nessa ordem de confiabilidade, e o rótulo permanece disponível à
tecnologia assistiva mesmo quando ocultado visualmente. A ausência é um quarto
estado, com borda tracejada.

A paleta categórica de classes é **Okabe–Ito**, cujos pares permanecem
distinguíveis sob deuteranopia e protanopia — o que exclui de saída o par
vermelho/verde. Em impressão monocromática cinco matizes não se separam por
luminância; ali quem carrega a classe é a **forma do marcador** e o rótulo
escrito.

**Alternativas descartadas.**
- **Só cor, com legenda:** a legenda fica longe do dado, e a impressão em preto
  e branco — o formato em que um relatório de TCC costuma ser lido — apaga a
  distinção inteira.
- **Uma rampa monocromática ordinal:** seria segura em escala de cinza e ruim
  para varredura; e a ordem medido > importado > estimado sugeriria uma
  precisão de ordenação que os três rótulos não têm.

**Consequência aceita.** O badge ocupa mais espaço horizontal que uma bolinha
colorida. Numa tabela de comparação de 12 colunas isso pesa, e é o preço de a
distinção continuar existindo fora da tela.

---

## D-25 — As hipóteses do índice aparecem antes da escolha, não depois

**Contexto.** O §3.1 da proposta compromete a ferramenta a exibir, junto de cada
índice de desempenho, a **função**, a **geometria**, o **objetivo** e a
**restrição** sob os quais ele foi derivado. O backend sempre devolveu esses
campos em `assumptions`, e `docs/04-metodologia-selecao.md` já afirmava que o
sistema os exibia. A interface os descartava: o seletor era um `<select>` cujas
`<option>` mostravam nome e expressão, e nada mais. Um `E^(1/2)/ρ` sem "viga em
flexão, seção livre, comprimento fixo, rigidez à flexão especificada" é
exatamente a caixa-preta que o trabalho promete não ser.

**Decisão.** Substituir o `<select>` por um grupo de cartões selecionáveis
(`components/selection/IndexCard.tsx`), em que cada opção mostra as hipóteses
**antes** de ser escolhida, e um cartão de validade abaixo do grupo mostra o
conjunto completo depois da escolha — hipóteses, expressão, dimensão do
resultado, inclinação da reta no mapa e referência bibliográfica.

**Alternativas descartadas.**
- **Manter o `<select>` e pôr as hipóteses num tooltip:** o tooltip só existe
  depois do apontamento, não existe no toque e não sobrevive à impressão. E o
  problema é justamente decidir antes, não conferir depois.
- **Mostrar as hipóteses só depois da escolha:** resolve a exibição e não
  resolve a decisão. A pergunta que o índice responde é "este se aplica ao meu
  problema?", e ela precede a seleção.

**Consequências aceitas.** O passo do objetivo ficou visualmente mais pesado:
cinco cartões com quatro linhas cada ocupam bem mais que um `<select>` de cinco
linhas. É o custo de a hipótese estar onde a decisão é tomada.

**Corolário — nada é inventado quando não há hipótese declarada.** Uma expressão
digitada pelo usuário não tem função nem geometria registradas, e o cartão diz
isso com todas as letras em vez de preencher com algo plausível. Chaves de
`assumptions` que a interface não conhece são exibidas mesmo assim, com o nome
humanizado: escondê-las faria o cartão afirmar que o índice diz menos do que diz.

---

## D-26 — Navegação agrupada por tarefa, e sem menu suspenso

**Contexto.** O cabeçalho tinha oito links numa única linha, na ordem em que as
rotas foram nascendo, sem nenhuma indicação de qual estava aberta. A 375 px a
linha estourava a viewport e a página inteira rolava de lado — o único caso de
rolagem horizontal que restava fora das tabelas.

**Decisão.** Três grupos rotulados, na ordem em que o trabalho acontece:
**Estudar** (Seleção, Mapas, Comparar), **Dados** (Catálogo, Importar) e
**Administrar** (Classes, Propriedades). Cada grupo é uma `<ul>` com
`aria-labelledby`, então o rótulo que se vê é o mesmo que o leitor de tela
anuncia. A rota atual leva `aria-current="page"`; a cor sozinha não diz onde se
está. Abaixo de `xl`, os mesmos grupos empilhados numa gaveta modal com foco
preso, `Esc` para fechar e `aria-expanded` no gatilho.

**Alternativas descartadas.**
- **Menus suspensos por grupo:** um `menu`/`menubar` correto exige navegação por
  setas, `Home`/`End`, digitação para busca e fechamento por foco perdido —
  muito widget para sete links que cabem na tela. E esconde atrás de um clique o
  que hoje se lê de uma vez.
- **Manter a fila de oito links e só deixá-la quebrar linha:** resolve o
  transbordo e não resolve o que estava errado — nada dizia que Mapas e Comparar
  são a mesma atividade e Classes é outra.

**Consequência aceita.** Os rótulos de grupo custam largura no cabeçalho, e por
isso a navegação inteira só aparece a partir de `xl`. Até 1280 px — tablet e
notebook de 1024 — vê-se a gaveta, não a barra; é a troca que mantém o cabeçalho
numa linha em vez de espremido.

**Correção medida (fase 8, PR 4).** O corte era `lg` e estava errado: a marca
(222 px), os sete links agrupados (721 px) e o controle de tema (236 px) somam
mais do que o `max-w-6xl` do cabeçalho oferece, e entre 1024 px e 1280 px a barra
transbordava — a página inteira voltava a rolar de lado, exatamente o defeito que
esta decisão existia para eliminar. Três mudanças, todas verificadas com o
navegador em 1024, 1085, 1280 e 1400 px:

- o corte passou para `xl`, onde a linha de fato cabe;
- o `ThemeToggle` ganhou `compact`, que deixa os três rótulos apenas para
  tecnologia assistiva (`title` e nome acessível seguem lá) e devolve 124 px;
- a linha do cabeçalho ganhou `flex-wrap` — não como layout, mas como rede: se um
  nono link voltar a estourar, ele quebra linha em vez de empurrar o documento.

A lição fica registrada porque o teste que faltava é o barato: verificar 375 px
não diz nada sobre 1100 px, e um cabeçalho com largura fixa quebra nos dois
extremos por motivos diferentes.

**Corolário — o gatilho da gaveta não vira "Fechar".** Enquanto a gaveta está
aberta, o botão do cabeçalho fica atrás da camada modal e a gaveta tem o próprio
botão de fechar. Dois controles com o mesmo nome acessível e a mesma função são
um labirinto para quem navega por nome; o estado vai em `aria-expanded`, que é
onde ele é esperado.

---

## D-27 — A composição da qualidade do dado é contada no banco, não no navegador

**Contexto.** O catálogo listava nome, classe e palavras-chave. Se os números de
um material foram medidos, importados, estimados ou simplesmente não existem só
aparecia na ficha — isto é, um clique depois de a lista já ter sido usada para
montar uma seleção. O filtro "com lacunas" que a fase 8 pede não tinha como ser
honesto: `MaterialListItem` não carregava nada sobre os valores.

**Decisão.** `GET /api/materials` passou a devolver `quality`
(`medido`/`importado`/`estimado`/`missing`) e `class_slug` por material. A soma é
feita em `MaterialService._summarise_quality`, com `selectinload` dos valores —
uma consulta a mais para a página inteira, não uma por linha. `missing` é contado
à parte: um valor ausente carrega `data_quality` como qualquer outro, e somá-lo
sob essa qualidade afirmaria que algo foi medido quando nada foi.

**Alternativas descartadas.**
- **Derivar no React a partir do que a lista já manda:** a lista não manda os
  valores. Derivar exigiria buscar a ficha de cada material — ou inventar.
- **Um endpoint novo de estatística:** dois pedidos para desenhar uma linha da
  tabela, e duas respostas que podem discordar entre si.
- **Contar no cliente depois de baixar tudo:** é cálculo em componente React,
  proibido pela mesma razão que a geometria dos gráficos (ADR 0004) — vira uma
  segunda resposta, divergente, para uma pergunta que o banco já responde.

**Consequência aceita.** A resposta da lista cresceu. É o preço de a tela dizer
o que sustenta cada linha antes de alguém escolher a linha.

**Corolário — ausência nunca é célula vazia.** Um material sem nenhuma
propriedade cadastrada mostra "Nenhuma propriedade cadastrada", não um espaço em
branco; um com lacunas mostra quantas. Vazio se lê como "não sei se olhei".

---

## D-28 — Uma paleta só, compartilhada entre interface e gráfico

**Contexto.** `lib/charts.ts` tinha o próprio mapa de cores por classe e a
própria cor de destaque; `lib/design/palette.ts` tinha outro, nascido com o
sistema de design. Duas paletas é como um relatório termina parecendo feito com
duas ferramentas — e a de `charts.ts` era só cor, sem forma nem traço: nada
sobrava num impresso monocromático.

**Decisão.** `classVisual(slug)` em `lib/design/palette.ts` é a única fonte de
cor, símbolo de marcador e padrão de traço por classe, e vale para catálogo,
ficha, mapa, comparador e `/estilo`. `chartTheme(theme)` recebe o tema resolvido
como argumento em vez de lê-lo: assim a figura é reconstruída quando o tema muda,
em vez de guardar as cores da primeira pintura — e a dependência fica declarada
de verdade no `useMemo`.

**Alternativas descartadas.**
- **Manter as duas e sincronizar na revisão:** é a mesma promessa que já falhou.
- **Ler os tokens direto do CSS dentro do componente:** funciona no navegador e
  falha no teste, onde não há documento para medir; e esconde do linter que a
  cor depende do tema.

**Consequência aceita.** `ClassVisual.symbol` e `.dash` são uniões literais, não
`string` — o vocabulário do Plotly entra no tipo. Um símbolo novo exige mexer no
array, que é exatamente onde a decisão de "como esta classe se distingue" mora.

---

## D-29 — Contraste medido contra a superfície mais escura em que o token é usado

**Contexto.** `--ink-subtle` foi aprovado no tema claro contra `--surface`
(4,6:1). Só que ele é usado sobre `--surface-sunken` — o cabeçalho fixo da
tabela, o controle desabilitado, a linha em hover — onde o mesmo par mede 4,37:1,
e sobre `--brand-50`, onde mede 4,46:1. Os dois abaixo de AA. O botão `danger`
tinha um problema irmão: `text-white` fixo, sobre um `--danger` que no tema
escuro é um vermelho *claro* — 2,8:1 no único botão cuja função é ser lido antes
de ser apertado.

**Decisão.** O token claro escureceu de `100 116 139` para `100 112 130`, o
bastante para passar de 4,5:1 contra a mais escura das três superfícies —
o que resolve as outras duas de brinde — mantendo degrau visível para
`--ink-muted`. O botão `danger` passou a `text-ink-inverted`, que inverte junto
com o tema. A regra que fica: um par ink/superfície se mede contra a superfície
mais escura em que o token de fato aparece, não contra a superfície padrão.

**Alternativas descartadas.**
- **Trocar os chamadores para `--ink-muted`:** conserta as telas de hoje e deixa
  a armadilha montada para a próxima.
- **Usar `--danger-fg` no botão:** é o texto que vai sobre o fundo tingido
  (`soft`), não sobre o preenchimento saturado. No tema escuro seria vermelho
  claro sobre vermelho claro.

**Consequência aceita.** A distância visual entre `--ink-subtle` e `--ink-muted`
diminuiu. Preferível a um nível da escala que só é legível em metade das
superfícies do próprio sistema.

---

## D-30 — Todo número na tela usa a convenção do pt-BR

**Contexto.** A tabela do comparador mostrava a densidade como `3.900` e o escore
normalizado ao lado como `0.00` — o mesmo glifo significando milhar numa coluna e
decimal na seguinte. Vinha de `toFixed`, que escreve ponto sempre. No cartão do
índice era pior: uma inclinação de 2 aparecia como `2.000`, que em português se
lê como dois mil.

**Decisão.** `formatScore(valor, casas)` em `lib/format.ts`, com
`toLocaleString("pt-BR")` e número de casas fixo, para todo valor adimensional
exibido — escores, pesos, contribuições, inclinação. `formatNumber` continua
responsável pelos valores com unidade.

**Alternativas descartadas.**
- **Deixar `toFixed` e aceitar a mistura:** o público da ferramenta é brasileiro
  e a interface inteira é em pt-BR; o número é o conteúdo, não a decoração.
- **Casas variáveis:** numa coluna ordenada, `1` e `0,75` com larguras
  diferentes se leem como precisões diferentes.

**Consequência aceita.** Um teste que afirmava `"2.000"` passou a afirmar
`"2,000"`. A expectativa antiga estava documentando o defeito.
