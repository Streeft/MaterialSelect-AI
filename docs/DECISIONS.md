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
| D-18 | Sem autenticação no MVP | **superado por D-42** | abaixo |
| D-19 | Merge commit em vez de squash | aceito | abaixo |
| D-20 | HTML imprimível em vez de biblioteca de PDF | aceito | abaixo |
| D-21 | Campo opcional não preenchido continua `NULL` | aceito | abaixo |
| D-22 | Repositório público para o portão de CI ser real | aceito, com consequência | abaixo |
| D-23 | Sistema de design próprio, sem biblioteca de componentes | aceito, exceção em **D-48** | abaixo |
| D-24 | Qualidade do dado codificada em três canais, nunca só cor | aceito | abaixo |
| D-25 | Hipóteses do índice antes da escolha, não depois | aceito | abaixo |
| D-26 | Navegação agrupada por tarefa, sem menus suspensos | aceito | abaixo |
| D-27 | Composição da qualidade contada no banco, não no navegador | aceito | abaixo |
| D-28 | Uma paleta só, compartilhada entre interface e gráfico | aceito | abaixo |
| D-29 | Contraste medido contra a superfície mais escura em que o token é usado | aceito | abaixo |
| D-30 | Todo número na tela usa a convenção do pt-BR | aceito | abaixo |
| D-31 | A alternativa textual de um gráfico é a tabela que o originou | aceito | abaixo |
| D-32 | O painel de uma aba é filho do componente de abas | aceito | abaixo |
| D-33 | A repaginação lumimotion troca os tokens, e só os tokens | **superado por D-38** (o método permanece) | abaixo |
| D-34 | A borda de um controle é informação, não moldura | aceito | abaixo |
| D-35 | O provedor real escolhe índice por slug; expressão e ressalvas não são dele | aceito | abaixo |
| D-36 | A IA gratuita é um protocolo, não um fornecedor | aceito | abaixo |
| D-37 | A navegação vira barra lateral, e a barra pode recolher | aceito | abaixo |
| D-38 | A paleta troca de família, e o verde-limão sai com data marcada | aceito | abaixo |
| D-39 | O painel separa tipo de evidência de existência do campo, com duas paletas | aceito | abaixo |
| D-40 | Um eixo do mapa pode ser um índice; overlay e eixo-índice são exclusivos | aceito | abaixo |
| D-41 | O laudo de engenharia é um documento à parte | aceito | abaixo |
| D-42 | Login só por terceiros (Google); catálogo compartilhado; um projeto por usuário no v1 | aceito | abaixo |
| D-47 | Busca híbrida (RRF) sobre o Cérebro, Jina AI como receita gratuita, citação verificada | aceito | abaixo |
| D-48 | `@material/web` para primitivas de baixo nível — exceção pontual a D-23 | aceito | abaixo |

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

## D-16 — Contrato de tipos duplicado conscientemente (superado por M4, abaixo)

**Decisão original.** `packages/shared-types/index.ts` é canônico e
`apps/web/lib/types.ts` o espelha manualmente.

**Por quê.** Unificar exigiria npm workspaces + `transpilePackages`, complicando
o build do Next no MVP.

**Custo aceito.** Ao alterar um contrato é preciso alterar dois arquivos.
Registrado como débito em [TODO.md](TODO.md).

**Por que deixou de valer.** O custo aceito deixou de ser hipotético: os dois
arquivos **já tinham divergido** quando M4 foi atacado — `x_quality`/
`y_quality` em `PropertyMapOut` eram `DataQuality` (não-nulo) em
`shared-types/index.ts` e `DataQuality | null` (correto — nulo quando o eixo é
um índice, sem propriedade única para atribuir proveniência) em
`apps/web/lib/types.ts`. `packages/shared-types` nunca era importado por
código nenhum, então nada do build ou dos testes acusava a divergência —
exatamente o modo de falha "só aparece em runtime" que D-16 já previa. npm
workspaces + `transpilePackages` foram implementados (`package.json` na raiz
com `workspaces`, `@materialselect/shared-types` como dependência de
`apps/web`); `apps/web/lib/types.ts` virou um barril de reexportação
(`export * from "@materialselect/shared-types"`) em vez de conteúdo
duplicado, preservando os 39 pontos de importação existentes (`@/lib/types`)
sem precisar trocar cada um pelo nome do pacote. Ver M4 em
[TODO.md](TODO.md).

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

## D-18 — Sem autenticação no MVP (superado por D-42)

**Decisão original.** Nenhuma autenticação, autorização, sessão ou usuário.

**Por quê.** O MVP rodava localmente, para um trabalho acadêmico, com dados
fictícios. Autenticação seria escopo grande sem servir à contribuição
metodológica — enquanto o risco (API totalmente aberta, incluindo escrita e
exclusão) ficasse contido a rodar só localmente.

**Por que deixou de valer.** O sistema **vai ser hospedado**, o que torna a API
aberta o maior risco pendente do projeto — a própria decisão já dizia isso.
[D-42](#d-42--login-só-por-terceiros-google-catálogo-compartilhado-entre-usuários-um-projeto-por-usuário-no-v1)
resolve isso com login Google e projetos isolados; ver lá.

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

**Exceção registrada depois, sem revisar esta decisão:** desde a Fase 9,
primitivas de baixo nível (botão, checkbox, radio, select, chip, diálogo,
abas) são Web Components de `@material/web`, por cima da API deste
componente — ver [D-48](#d-48--materialweb-para-primitivas-de-baixo-nível--exceção-pontual-a-d-23).
O que esta decisão continua a proibir — nenhuma abstração de layout ou de
tema de terceiros, o vocabulário de API é sempre o de `components/ui/` — vale
como antes.

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

---

## D-31 — A alternativa textual de um gráfico é a tabela que o originou

**Contexto.** A Entrega E do redesign exige "alternativa textual real" para as
figuras. Um mapa de Ashby renderizado pelo Plotly é uma tela de `<path>` e
rótulos de eixo: para quem usa leitor de tela, ou é silêncio, ou é um fluxo de
números de escala sem sujeito. Um `alt` mais longo não resolve — a informação
da figura são os pontos, e uma frase não os contém.

**Decisão.** Toda figura carrega uma tabela de dados aberta a partir dela mesma
(`components/charts/FigureData.tsx`), dentro de um `<details>`: o mapa, a
miniatura da ficha e os quatro modos de figura do comparador. O contêiner do
Plotly recebe `role="img"` com nome acessível, o que faz a tecnologia assistiva
tratar a figura como um objeto só em vez de percorrer seus milhares de nós.

Os números vêm prontos do cliente — são os mesmos que a figura desenha, sem
recálculo nem resumo, o que mantém o ADR 0004 de pé. A coluna de uma célula sem
dado devolve `null`, e é o `FigureData` que decide renderizar `<MissingValue />`:
a regra de nunca exibir ausência como `0`, `—` ou célula vazia deixa de depender
de cada chamador lembrar dela.

**Alternativas descartadas.**
- **`aria-hidden` na figura:** esconde junto os botões da barra de ferramentas
  do Plotly, e conteúdo focável dentro de subárvore escondida é violação.
- **Descrição textual gerada:** seria a camada de apresentação afirmando algo
  sobre os dados — e, na prática, inventando um resumo.
- **Reaproveitar a aba "Tabela" do comparador:** ela existe só ali, e é uma
  visão irmã da figura, não uma alternativa alcançável *a partir* dela.

**Consequência aceita.** A tabela repete o título da figura no `<caption>`, o que
faz o mesmo texto aparecer duas vezes na tela — motivo pelo qual os testes de
rota procuram o título por `role="heading"` e não por texto.

---

## D-32 — O painel de uma aba é filho do componente de abas

**Contexto.** `Tabs` gerava os ids com `useId()` internamente e exportava um
`TabPanel` que pedia o mesmo id como propriedade — um valor que nenhum chamador
tinha como conhecer. O resultado é que `TabPanel` nunca foi usado em lugar
nenhum, e todo `aria-controls` da aplicação apontava para um elemento
inexistente. O axe sobre a rota `/comparar` foi o que revelou isso; nenhum teste
de componente pegaria, porque a aba isolada parece correta.

**Decisão.** O painel virou `children` de `Tabs`, que renderiza os dois lados e
é dono dos dois ids. `TabPanel` deixou de existir. Só a aba selecionada declara
`aria-controls`, porque só o painel dela está no documento.

**Alternativas descartadas.**
- **Exigir um `idBase` do chamador:** transfere para cada tela a chance de errar
  o que o primitivo já sabe.
- **Remover o `aria-controls`:** cala o aviso e mantém a aba sem relação
  declarada com o que ela controla.

**Consequência aceita.** O painel tem `tabIndex={0}` mesmo quando contém
controles focáveis, acrescentando uma parada de tabulação. É o preço de um
primitivo que também serve painéis de texto puro — e a parada anuncia ao leitor
que as setas mudaram o conteúdo abaixo.

---

## D-33 — A repaginação lumimotion troca os tokens, e só os tokens

**Contexto.** O autor trouxe um pacote de design pronto (`lumimotion-ai-ui-prompt`,
extraído do aura.build): página quase preta `#05080A`, painéis em `#0B0F12`,
fios de borda feitos de branco a 2–8% de opacidade, um lima elétrico `#C6F91F`
carregando toda a interação, Inter com entressilhas apertadas nos títulos.
Junto vinham GSAP, ScrollTrigger, o SDK WebGL do Unicorn Studio e um efeito de
lanterna que segue o cursor.

**Decisão.** A linguagem visual entrou inteira; o maquinário, não. A mudança
está confinada a `globals.css`, `tailwind.config.ts`, o espelho em
`lib/design/palette.ts` e a carga da fonte em `app/layout.tsx`. Nenhuma
primitiva foi tocada — elas já consumiam token, que é justamente o que torna uma
repaginação desse tamanho uma edição de quatro arquivos.

O tema escuro é onde essa linguagem é nativa. O claro é a contraparte dela: a
mesma família de lima, escurecida até poder carregar texto, sobre papel neutro
quente em vez do ardósia frio de antes.

**O que a rampa `brand` teve de ceder.** O lima de exibição fica em `400` e o
seu hover em `500`, como no pacote. Abaixo disso a rampa é comprimida de
propósito: `700` é o tom que os componentes querem dizer com "tinta segura sobre
o fundo mais fraco", e com um lima isso só acontece por volta de `#54700E`. Uma
rampa de passos iguais teria colocado um verde-oliva de 3,5:1 nessa posição —
medido, reprovado, refeito. Pelo mesmo motivo o `--accent` do tema claro é
`--brand-700`, e não o lima de exibição: o par que lê como a marca numa página
preta é exatamente o par que falha no papel.

**O que não se mexeu.** Os quatro tokens `--quality-*` continuam onde estavam.
Eles não são decoração: são a afirmação do produto sobre proveniência (§3.3 da
proposta). Puxá-los para a família do lima colocaria "estimado" na mesma cor de
todo botão da página. Só os fundos tingidos desceram, para assentar na
superfície mais escura.

**Alternativas descartadas.**
- **Adotar o pacote como veio, só no escuro:** é o modo nativo dele, mas
  descartaria o alternador de tema e metade da verificação de contraste que a
  Entrega E acabara de fazer.
- **Trazer GSAP, ScrollTrigger e o WebGL:** proibido pelo §13 do REDESIGN.md, e
  a razão continua valendo — só o UMD do Unicorn Studio pesa mais que os 87 kB
  de JS compartilhado por toda a aplicação, num público que a proposta descreve
  como estudante num notebook modesto.
- **Só a tipografia e os raios:** seguro e quase invisível; não é o que foi
  pedido.

**Consequência aceita.** Inter entra por `next/font` — o §5 do REDESIGN.md já a
admitia — e isso muda o portão: `next build` passa a precisar de rede, e não
mais só o `npm ci`. Em troca a fonte é servida por esta origem, sem terceiro em
runtime e sem salto de layout.

**Como se sabe que passa.** Os pares de token são medidos por script fora da
árvore, e as telas são medidas no navegador: para cada elemento com texto, a cor
computada contra o fundo pintado de verdade, nos dois temas. Cerca de 590
elementos em `/estilo`, `/selecao`, `/materiais/1` e `/comparar` (tabela e
figura), nenhuma reprovação. O par mais apertado do sistema é `--ink-subtle`
sobre `--brand-50` no tema escuro, a 4,74:1 — folga maior que a do sistema azul
que ele substitui, que fechava em 4,58:1.

---

## D-34 — A borda de um controle é informação, não moldura

**Contexto.** A repaginação [D-33](DECISIONS.md) mediu o contraste de **texto**
em cerca de 590 elementos e passou nos dois temas. Faltava um critério: um campo
de formulário tem o mesmo fundo do cartão em que está (`--surface-raised`), de
modo que a **borda é a única coisa que informa que existe um controle ali**. Isso
não é contraste de texto, é a WCAG 1.4.11 (contraste de não-texto), e o mínimo é
3:1. Medido no navegador, `--edge` sobre `--surface-raised` dava **1,12:1** no
tema escuro e 1,15:1 no claro — dezessete campos por tela, todos reprovados. Nem
`--edge-strong` resolvia: sobre o painel quase preto ele chega a 1,66:1.

**Decisão.** Um token novo, `--edge-control`, separado da família de fios de
cabelo e definido pelo requisito, não pelo gosto: `122 118 114` no claro (4,5:1
sobre o painel) e `106 112 110` no escuro (3,81:1). Ele vale para o contorno de
tudo que se opera — campos, seletores, áreas de texto, caixas de seleção,
botões `secondary`, chips e as etapas do `Stepper` — e o `hover` passa a
`--ink-subtle` em vez de `--edge-strong`, que era mais claro que o repouso e
agora seria mais escuro.

As demais bordas continuam sendo fios de cabelo. A distinção é o ponto: `--edge`
separa dois painéis, `--edge-control` diz que algo aceita o cursor.

**Alternativas descartadas.**
- **Clarear `--edge` até 3:1:** resolveria os campos e transformaria toda linha
  divisória da aplicação num traço grosso. O fio de cabelo é uma escolha de
  desenho; o contorno do campo é um requisito.
- **Preencher o campo com `--surface-sunken` e manter a borda fraca:** o
  contraste passaria a vir do fundo, o que é legítimo — mas no tema escuro o
  afundado (`2 4 5`) é mais escuro que a página e o campo viraria um buraco.
- **Tratar a etapa bloqueada do `Stepper` como as outras:** ela é `disabled`, e
  a 1.4.11 isenta componente inativo. Ficou com `--edge-strong` tracejado, que é
  legível sem prometer interação.

**Consequência aceita.** Os formulários ficaram visualmente mais marcados do que
o pacote lumimotion desenha — lá os campos são quase invisíveis até receberem
foco. É a troca certa para uma ferramenta em que o usuário digita valor,
unidade e incerteza, e não uma página de apresentação.

**Como se sabe que passa.** O script de tokens ganhou o par com mínimo 3:1, e a
verificação no navegador passou a medir também a borda computada de cada
controle habilitado contra o fundo realmente pintado. Sete rotas, dois temas:
nenhuma reprovação de texto e nenhuma de controle; a borda mais apertada é
3,81:1 no escuro e 4,31:1 no claro.

---

## D-35 — O provedor real escolhe por slug; a expressão e as ressalvas nunca são dele

**Contexto.** A Fase 6 entregou a camada de IA com um único provedor, o
simulado. Ligar um modelo de verdade reabre a pergunta que a fase inteira existe
para responder: o que exatamente o modelo pode dizer que chega ao usuário? O
contrato `AIProvider` devolve um dicionário, e o serviço construía a sugestão de
índice com **os campos que o provedor mandasse** — `name`, `expression`, `goal`.
Com o simulado isso é inofensivo, porque ele copia do catálogo. Com um modelo,
é um caminho para uma expressão de índice escrita por IA entrar no sistema.

O mesmo vale, do outro lado, para as ressalvas de uma explicação: elas vinham do
provedor. O simulado sempre as escreve; um modelo pode simplesmente não escrever
— e as ressalvas são justamente o que o trabalho promete que sempre aparece.

**Decisão.** Dois provedores reais entram atrás do mesmo `AIProvider`, ambos
falando com o Claude: `claude-api` (API de Mensagens da Anthropic, com chave
própria) e `claude-cli` (o Claude Code já instalado e autenticado na máquina).
`mock` continua o padrão. Os três compartilham `app/ai/claude_base.py`, e nele:

- **O modelo devolve um slug de índice e mais nada.** Nome, expressão e objetivo
  são lidos do catálogo depois da resposta. Não é uma checagem — é a ausência do
  campo: por esse caminho um modelo não tem onde escrever uma expressão.
- **As ressalvas são do backend** (`app/ai/caveats.py`), compartilhadas com o
  simulado. O esquema JSON enviado ao modelo nem tem o campo.
- **Slug inventado passa adiante.** Filtrá-lo ali seria mais limpo e seria pior:
  o guardrail o recusa *e diz por quê*, e ver o que foi recusado é como o
  usuário passa a acreditar no que não foi.

**Alternativas descartadas.**
- **Um provedor só.** "Meu próprio Claude" é ambíguo entre a assinatura que a
  pessoa já paga e uma chave de API que ela talvez não tenha. Os dois cabem no
  mesmo contrato e custam um módulo de transporte cada.
- **Validar a expressão vinda do modelo em vez de ignorá-la.** Trocaria uma
  impossibilidade estrutural por uma verificação — e verificação se afrouxa.
- **Deixar o modelo escrever as ressalvas com uma checagem de que apareceram.**
  Verificar presença de frase é frágil; não pedir o campo não é.

**Consequência aceita.** Com um provedor real a leitura **deixa de ser
determinística**: o mesmo enunciado pode ser lido de dois jeitos. Por isso o
padrão continua sendo `mock`, que é o provedor sobre o qual o argumento de
reprodutibilidade do trabalho se apoia, e por isso a ressalva mostrada ao
usuário passou a dizer isso com todas as letras em vez de apenas omitir o aviso
de "simulado". O que não varia é o cálculo — ele não passa por aqui.

**Como se sabe que passa.** Os testes roteiram a resposta do modelo em vez de
chamar a rede, e cobrem o caso hostil: uma conversão *correta* (300 °C → 573,15 K)
continua recusada, uma expressão inventada é descartada pelo catálogo, e a
explicação que cita cifra não calculada derruba a resposta inteira. O teste mais
afiado devolve o próprio bloco de dados do prompt como prosa: se algo que o
modelo vê não puder ser citado, o guardrail dispara sobre um texto que obedeceu.

Além dos testes, as duas rotas foram exercidas ao vivo pelo `claude-cli` contra o
catálogo semeado: o enunciado com "300 °C" e "3 g/cm3" saiu com os dois números
copiados na unidade escrita, nenhuma recusa; e "no mínimo 300", sem unidade,
saiu como pergunta aberta e nenhuma restrição — a regra 4 obedecida por um
modelo que nunca a viu no código. O `claude-api` foi verificado apenas contra um
cliente falso: não há chave de API neste ambiente.

---

## D-36 — A IA gratuita é um protocolo, não um fornecedor

**Data:** 11/08/2026 · **Status:** aceita · **Fase:** 9

**Contexto.** O pedido foi por "uma IA gratuita, uma API de IA gratuita, pode
ser da OpenAI", com uma condição explícita: "que não dê problema de
autenticação". A pesquisa de fornecedores desmontou a primeira metade do pedido
e endureceu a segunda.

A OpenAI **não tem camada gratuita de API**. A linha "Free" na documentação de
limites é um teto de gasto de US$ 100/mês, não uma concessão — o nível "$5 paid"
exibe o mesmo teto. O Brasil é atendido; a barreira é dinheiro, não geografia.

Entre os que de fato são gratuitos, nenhum é estável o bastante para ser *o*
fornecedor do trabalho:

| Fornecedor | Situação em 11/08/2026 |
|---|---|
| **Groq** | Plano gratuito real, sem cartão, limites publicados (30 req/min, 1000 req/dia). JSON Schema estrito só em `openai/gpt-oss-20b` e `120b`. |
| **Ollama (local)** | Gratuito para sempre, sem conta, sem rede, sem limite. |
| **Gemini (AI Studio)** | Gratuito e permanente, sem cartão. Mas o conteúdo enviado **é usado para treinar**, revisores humanos podem lê-lo, e a isenção geográfica dos termos cobre apenas EEE, Suíça e Reino Unido — **não o Brasil**. O Google parou de publicar limites por modelo. |
| **OpenRouter** | 15 modelos `:free`, só 4 com saída estruturada; 50 requisições/dia. |
| **GitHub Models** | **Desligado em 30/07/2026.** |
| **Cerebras** | Deixou de ter camada gratuita: US$ 5 de crédito que expiram em 30 dias. |

**Decisão.** Não escolher um fornecedor. Implementar **um provedor por
protocolo** — `openai-compat`, que fala `POST {AI_BASE_URL}/chat/completions` —
e deixar a escolha em duas variáveis de ambiente. Groq, Ollama, OpenRouter,
Together, Cloudflare, um gateway corporativo e a própria OpenAI passam a caber
no mesmo código.

`AI_BASE_URL` **não tem valor padrão**, de propósito: um padrão escolheria um
fornecedor pelo operador. Sem ele, o erro traz as três receitas prontas — é a
única documentação que alguém lê no momento em que precisa.

**Como a condição "sem problema de autenticação" foi cumprida.** Com
`AI_API_KEY` vazia, o cabeçalho `Authorization` não é enviado. Não é degradação:
é o que um Ollama local espera, e mandar um bearer vazio transformaria "este
servidor não pede credencial" em "sua credencial foi recusada". É o único
arranjo desta camada em que a autenticação não pode falhar, porque não existe.

**Alternativas descartadas.**

- **Gemini como provedor recomendado**, que a pesquisa apontou primeiro. A
  qualidade em português é a melhor do conjunto gratuito, mas o enunciado que o
  usuário digita vira material de treino e a proteção contratual não alcança o
  Brasil. Recomendar isso a um aluno de graduação, num trabalho que ele assina,
  não se sustenta. Continua alcançável — o Gemini expõe endpoint compatível com
  OpenAI —, só não é o caminho que a documentação empurra.
- **Adicionar `httpx` como dependência.** O provedor usa `urllib.request`. A
  camada de IA é opcional; a maneira mais barata de ligá-la também deveria ser a
  que instala menos coisa.
- **Cair silenciosamente para `json_object` quando o servidor recusa o schema.**
  Um provedor que parou de exigir o contrato ficaria idêntico a um que nunca o
  teve. `AI_JSON_MODE` é decisão do operador, e o 400 diz qual é o ajuste.

**Consequência aceita.** O provedor gratuito é o mais fraco dos quatro: modelos
menores erram mais a leitura, e o plano gratuito tem limite diário. Isso é
sustentável porque o guardrail não distingue provedor — o que um modelo pequeno
erra é recusado e **relatado**, exatamente como o de um modelo grande. E o
`mock` continua o padrão (D-35): só um provedor determinístico sustenta comparar
duas execuções do mesmo estudo.

**Um subproduto para a defesa.** Em menos de um ano, o GitHub Models foi
desligado e a Cerebras trocou camada gratuita por teste de 30 dias. É a
evidência empírica de que manter a camada de IA opcional, substituível e com
padrão determinístico não era conservadorismo — era a leitura certa do terreno.

**Efeito colateral no código.** `claude_base.py` passou a `model_base.py` e
`ClaudeProviderBase` a `ModelProviderBase`. As garantias de D-35 são da camada,
não da Anthropic; um provedor da Groq herdando de uma classe chamada "Claude"
seria uma mentira de nomenclatura num repositório que trata nome como contrato.

**Aviso ao usuário.** `AIProvider` ganhou `data_note`, e a ressalva mostrada ao
lado de cada sugestão passa a nomear **o host** para onde o enunciado está indo
— nunca o caminho, que pode carregar um token. Quem decide o que digitar é quem
precisa saber para onde aquilo vai.

---

## D-37 — A navegação vira barra lateral, e a barra pode recolher

**Data:** 11/08/2026 · **Status:** aceita · **Fase:** 9 · **Revisa:** D-33

**Contexto.** O cabeçalho da Fase 8 já era a segunda tentativa: os oito links
tinham virado três grupos porque a fileira plana não dizia quais telas andam
juntas e estourava a página a 375 px. Agrupar resolveu o estouro e não resolveu
o resto — a fileira agrupada só cabia a partir de 1280 px (medido: 1079 px de
conteúdo dentro de `max-w-6xl`), abaixo disso virava gaveta, e o agrupamento
desaparecia exatamente na largura em que ele mais ajudaria.

**Decisão.** Trocar o cabeçalho por uma barra lateral persistente a partir de
`lg`, com gaveta modal abaixo disso, e dar a ela um controle de recolher
(256 px ↔ 76 px).

Três consequências que valem mais que a estética:

1. **O agrupamento fica visível enquanto se trabalha.** É a única disposição em
   que "Estudar / Dados / Administrar" está na tela ao mesmo tempo que a tela.
2. **A largura passa a ser do usuário.** Num aplicativo cujo conteúdo central é
   um mapa de propriedades, o menu tem de saber sair da frente.
3. **A ordem do DOM e a ordem de leitura concordam nos dois eixos.** A barra é o
   primeiro filho tanto na coluna (abaixo de `lg`) quanto na linha (acima).

**Cada destino ganhou um ícone**, o que o cabeçalho não precisava. Recolhida, a
barra não tem espaço para palavra nenhuma: o glifo *é* o rótulo. Por isso cada um
desenha o que a tela faz — funil para o funil de seleção, pontos plotados para o
mapa — e não um documento genérico, que deixaria os oito indistinguíveis a 18 px.

**O rótulo nunca sai da árvore.** Ao recolher, o texto vira `sr-only`. Um link
cujo texto é removido é um link sem nome acessível, e a barra recolhida viraria
oito glifos anônimos para quem lê em voz alta. `title` entra junto, para quem
enxerga e não adivinha o desenho.

**O estado recolhido não é persistido.** Ele sobrevive a toda navegação no
cliente — o componente vive no layout raiz e nunca desmonta — e volta a aberto
num recarregamento. As duas formas de guardá-lo são piores: ler o `localStorage`
durante o render discorda da marcação do servidor e faz o React reclamar na
hidratação; aplicá-lo num efeito fecha a barra *depois* da primeira pintura, que
é um salto de layout na cara do leitor. Se um dia valer a pena, o caminho certo é
um cookie lido no servidor, não um `useEffect`.

**Sobre o movimento — e por que D-33 não é revogada.** O pedido foi por algo
"menos duro e mais maleável". A pílula cresce a partir da borda esquerda sob o
ponteiro e cede sob o clique; a marca é um squircle que arredonda mais no hover;
o item da página atual ganha um halo. São três propriedades de CSS
(`transform`, `border-radius`, `box-shadow`) com a duração que já existia no
tema. **Nenhuma biblioteca de animação** — a proibição do §13 do REDESIGN.md
vale igual quando a animação vem bonita. O halo é o único `box-shadow` do sistema
que não é preto: ele lê `--brand-300`/`--brand-400`, e portanto tinge em vez de
escurecer, que é a única forma de ele existir nos dois temas. Continua sendo
token, continua sendo `tailwind.config.ts`, e D-28 segue de pé.

**O que esta decisão *não* faz.** Não recolore o produto. O pedido de "mais
colorido e mais redondo, como um aplicativo do Google" é maior que a navegação e
vai numa mudança própria, com os tokens declarados de uma vez para tabela,
cartão, gráfico e formulário. Contrabandear três matizes decorativos para dentro
de uma refatoração de navegação daria, num sistema onde cor significa alguma
coisa (qualidade do dado, estado semântico), um ponto colorido ao lado de
"Seleção" que não significa nada.

**Como se sabe que passa.** 12 testes no lugar dos 5 do cabeçalho, com axe limpo
em três estados (aberta, recolhida, gaveta aberta) — os dois últimos não
existiam. Além deles, verificação no navegador a 1440 px e a 375 px: 256/76 px de
largura com a coluna de conteúdo acompanhando, nenhum estouro horizontal, e a
gaveta abrindo com foco no painel, travando a rolagem do corpo e devolvendo o
foco no Esc.

---

## D-38 — A paleta troca de família, e o verde-limão sai com data marcada

**11/08/2026.** Substitui a paleta de D-33; mantém o método dela.

O pedido foi: *"Quero que de forma geral as coisas sejam mais coloridas,
redondas e amigáveis, como se fosse um aplicativo do Google. Use os apps do
Google como referência visual e interativa."*

**Antes de recolorir, a pergunta.** "Mais colorido" tem dois sentidos opostos
num aplicativo de dados, e escolher errado é refazer. Foram oferecidos três
caminhos: (a) ampliar o que já significa alguma coisa — fundos tingidos, selos
de qualidade mais presentes, zero matiz novo; (b) cor de seção, à la
Gmail/Drive/Agenda, com roxo e rosa dizendo apenas "onde você está"; (c) trocar
a marca. A recomendação era (a), pelo risco. **A escolha foi (c)**, com os riscos
declarados na tela: é a maior das três, e as figuras da monografia já capturadas
ficam desatualizadas. Esta decisão registra (c) — e registra que o preço foi
aceito de olhos abertos.

**Por que a marca sai inteira, e não só a superfície.** O verde-limão sobre
#05080A é uma língua coerente: ela diz "instrumento". O público desta aplicação
é aluno de graduação em Engenharia de Materiais, e a resposta certa para
"parece duro demais" não era baixar o brilho do limão — era admitir que a
identidade estava mirando outra pessoa.

**Dois matizes tiveram de se mover, e nenhum dos dois é cosmética.**

- `--info` **manteve o ciano**. Marca azul mais "informação" azul faria todo
  alerta informativo parecer cromo de marca. Em Material 3 o `info` *é* o
  primário; aqui isso custaria a distinção, então não se copiou.
- `--quality-importado` **saiu do azul para o violeta**. É um de quatro matizes
  ordinais de procedência, e o único matiz com que ele não pode ser confundido é
  justamente aquele em que se clica — senão "importado" começa a ser lido como
  "interativo". Violeta é o assento mais próximo que não colide com nada: nem
  com o ciano de `info`, nem com o âmbar de `estimado`, nem com o eixo
  vermelho/verde que a deuteranopia colapsa.

O que **não** se moveu: a paleta categórica de classes (Okabe–Ito, em
`lib/design/palette.ts`) não é da marca — ela responde a deficiência de visão de
cores e a impressão monocromática, e trocá-la por cores do Google seria
substituir uma escolha medida por uma escolha estética.

**Contraste: a repaginação ganhou margem, não gastou.** Todo par foi medido no
navegador nos dois temas, lendo os tokens computados. O par mais apertado da
paleta antiga era `--ink-subtle` sobre `--brand-50` no tema escuro, a 4,74:1. O
mais apertado agora é `--brand-700` sobre `--brand-50` no tema claro, a
**5,01:1**; nenhum outro par de texto fica abaixo de 5,2:1, e as bordas de
controle medem 3,68:1 (claro) e 5,19:1 (escuro) contra os 3:1 da WCAG 1.4.11.

Duas medidas explicam escolhas que parecem arbitrárias no arquivo. O
`--accent` do tema claro **não** é o #1A73E8 que o Google usa em botão: com
branco por cima ele dá 4,51:1 — passa, com uma margem fina o bastante para um
arredondamento futuro derrubar. #1565C0 dá 5,75:1 pela diferença que ninguém
enxerga. E `--warning` deixou de ser o amarelo de exibição (#F9AB00, 1,7:1 sobre
branco) porque `DEFAULT` é *traço* — borda, ícone — e portanto responde aos 3:1
da 1.4.11; o laranja #E8710A cumpre a 3,09:1 e ainda é mais colorido.

**Um defeito antigo apareceu durante a troca.** `hover:bg-brand-700` era o
estado de hover do botão primário — e `--accent` *é* `--brand-700`, nos dois
temas. Ou seja: no tema claro o botão principal nunca teve hover, e ninguém
notou porque no escuro o token caía noutra casa da rampa. Agora hover é `800` e
press é `900`, que funcionam nos dois temas justamente porque a rampa é
espelhada: mais escuro no papel, mais claro na grafite — a direção em que
"apertei mais" corre em cada um.

**O tema escuro deixa de ser quase-preto.** #05080A é uma página sem nada atrás;
#131314 é uma página em que um painel pode *pousar*, e é isso que faz a
superfície elevada parecer elevada sem depender de uma sombra que o tema escuro
mal consegue mostrar.

**A forma é token, e por isso é barata.** `card` foi de 12 px para 20 px e
`control` de 8 px para 12 px — os dois cobrem 26 dos 30 pontos arredondados da
aplicação, de modo que a metade "mais redonda" do pedido é literalmente uma
mudança de token. O 27º era um `rounded-[0.375rem]` cravado no segmento do
`ButtonGroup`; virou o token `seat`, que existe porque duas formas concêntricas
no mesmo raio parecem erro de impressão.

**O movimento é uma classe, não uma biblioteca.** `.pressable`, em
`globals.css`: cresce 2% sob o ponteiro, cede 2% sob o clique, na curva padrão
do Material 3 (`cubic-bezier(0.2, 0, 0, 1)`). Só `transform` — nada de
`translate`, que empurraria o vizinho. **Nenhum framework de animação**: a
proibição do §13 do REDESIGN.md vale igual quando a animação vem bonita. Quem
pede menos movimento no sistema operacional continua recebendo a mudança de
estado, sem a animação, pelo bloco `prefers-reduced-motion` que já existia.

**O que esta decisão não faz.** Não move cálculo nenhum para o cliente (ADR
0004 segue de pé), não introduz biblioteca de componentes, e não torna a cor o
único canal de nada: os selos de qualidade continuam com rótulo escrito e glifo
antes da cor, e todo gráfico continua tendo a tabela que o originou como
alternativa textual (D-31). D-28 — cor só via token — não só continua valendo
como foi o que tornou esta troca viável: nenhum componente precisou ser tocado
para mudar de cor.

**O que ela custa.** As figuras da monografia que são capturas de `/estilo`
precisam ser refeitas. `/estilo` ganhou a seção "Forma e movimento", que a
página não tinha e sem a qual a escala de raio e o gesto ficariam documentados
só no código.

**Como se sabe que passa.** Portão do frontend inteiro verde (typecheck, lint,
130 testes, build limpo das 13 rotas) e verificação no navegador por DOM — nesta
máquina o painel não compõe quadros, então captura de tela não é evidência.
Foram lidos os tokens computados nos dois temas e calculados os 17 pares de
contraste acima; conferidos raio de cartão (20 px), de controle (12 px) e a
curva aplicada de fato; e vistos os quatro estados de qualidade renderizando com
dado real do backend, com "Importado" já em violeta a 7,75:1 (claro) e 6,97:1
(escuro). Sem estouro horizontal a 375 px na rota de tabela larga.

---

## D-39 — O painel separa "que tipo de evidência é essa" de "o campo existe", com duas paletas que não se confundem

**11/08/2026.** Quarta das seis frentes da Fase 9: os dashboards
interativos, sobre um backend (`app/services/dashboard_service.py`,
`app/calculations/statistics.py`) já concluído numa sessão anterior. Esta
decisão é só do frontend — cinco componentes novos e a rota `/painel`.

**A cobertura de um par (material, propriedade) tem três estados, não dois.**
`filled` / `declared_missing` / `not_recorded` é a regra 1.3 — dado ausente
nunca vira zero — aplicada um nível abaixo de onde ela já vale: não só "este
valor está nulo" tem rótulo escrito, como "não existe linha nenhuma para este
par" precisa de um rótulo *diferente* de "existe linha e ela diz que falta".
Sem os três estados, o gráfico de cobertura por classe somaria as duas coisas
num "não preenchido" só, e a leitura mudaria — um catálogo com metade das
propriedades nunca importadas pareceria ter o mesmo problema que um catálogo
que documentou a ausência de metade delas.

**`NAO_REGISTRADO` é um quinto estado, não uma variação de `AUSENTE`.** O selo
de qualidade da Fase 6 (`MEDIDO`/`IMPORTADO`/`ESTIMADO`/`AUSENTE`) continua com
quatro valores em todo lugar que já existia — `DataQualityBadge` não mudou.
Só o `QualityMixChart` do painel estende esse vocabulário para cinco, porque é
o único lugar que precisa responder "de todo par possível no catálogo, quantos
têm cada tipo de evidência" — e "não têm linha" é uma resposta a essa pergunta
que `AUSENTE` não cobre (`AUSENTE` é `is_missing=True`: alguém registrou a
ausência; `NAO_REGISTRADO` é a ausência da própria linha).

**Duas visualizações de cobertura, duas paletas, de propósito.**
`QualityMixChart` reaproveita os tokens de qualidade existentes via
`qualityBucketColor` (`lib/design/palette.ts`), porque a pergunta que ele
responde é "que tipo de evidência é essa" — a mesma pergunta que o selo já
responde em todo o resto da interface. `ClassCoverageChart` usa tokens neutros
(`--success`, `--quality-ausente`, `--edge-strong`) para os mesmos três
estados de cobertura, porque a pergunta ali é mais grossa — "o campo está
preenchido, foi declarado ausente, ou nunca chegou a existir" — e reaproveitar
a paleta de qualidade faria uma cor (o âmbar de `ESTIMADO`, por exemplo)
significar duas perguntas diferentes na mesma tela. As duas paletas nunca
aparecem juntas no mesmo gráfico, então a ambiguidade não chega a existir na
prática — mas existiria se fosse só uma paleta para as duas perguntas.

**Todo gráfico novo carrega a tabela que o originou (D-31), sem exceção.** Os
cinco componentes — `CoverageSummary`, `QualityMixChart`, `ClassCoverageChart`,
`GapsList`, `PropertyDistributionPanel` — têm `FigureData` pareada, exceto
`GapsList`, que já nasce tabela (os dados chegam pré-ranqueados do backend, não
há geometria para desenhar). O box-plot de distribuição por propriedade segue
o ADR 0004 à risca: `PropertyDistributionPanel` nunca deriva um quartil — recebe
mínimo/Q1/mediana/Q3/máximo já calculados e só entrega ao traço `box` do Plotly
via `q1`/`median`/`q3`/`lowerfence`/`upperfence`, o modo "quartis
precomputados" que existe exatamente para isto.

**Um defeito de layout conhecido reapareceu.** O wrapper novo
`<div className="grid gap-4 xl:grid-cols-2">` empurrou a página inteira para
907 px de largura a 375 px, porque um item de grid/flex por padrão não encolhe
abaixo da largura intrínseca do que tem dentro — o comentário do próprio
`Section` em `Card.tsx` já avisa disso, e mesmo assim o SVG do Plotly
(`.main-svg`) achou a brecha de novo. Corrigido com `min-w-0` no `Card` de
`QualityMixChart` e `ClassCoverageChart`; verificado depois por
`getBoundingClientRect` que `scrollWidth` voltou a bater com `clientWidth`.

**O que esta decisão não faz.** Não move geometria nenhuma para o cliente (ADR
0004 segue de pé — quartis, percentuais de cobertura e participação são todos
computados em `statistics.py`/`dashboard_service.py`), não introduz biblioteca
de componentes ou de animação, e não renderiza ausência como `0`, `—` ou
célula vazia em lugar nenhum das cinco visualizações novas.

**Como se sabe que passa.** Portão do frontend inteiro verde (typecheck, lint,
138 testes — 8 novos em `painel.test.tsx`, mais o ajuste ao teste da gaveta
para o nono link da barra lateral —, build limpo) e o backend da sessão
anterior intacto (`pytest`, `ruff`, `black`, sem alteração). Verificação no
navegador por DOM, não por captura (nesta máquina o painel não compõe
quadros): dado real do seed renderizando (55,0% de cobertura, 22/40 pares,
percentuais por classe, ranking de lacunas, quartis do box-plot em pt-BR), a
alternância linear/log de fato trocando `yaxis.type`, e o estouro de 375 px
acima — encontrado e corrigido nesta mesma verificação, não pelos testes de
unidade, que não exercitam largura de viewport real.

---

## D-40 — Um eixo do mapa pode ser um índice, não só uma propriedade — e as duas linhas de índice (overlay e eixo) são mutuamente exclusivas

**11/08/2026.** Quinta das seis frentes da Fase 9: os mapas personalizáveis.
"Personalizável" tinha quatro leituras possíveis e nenhuma delas estava
escrita em lugar nenhum — mapa compartilhável por URL, presets nomeados, um
eixo virar índice, ou outra coisa. Perguntado, o autor escolheu a terceira: um
eixo (X ou Y) passa a poder ser uma propriedade cadastrada *ou* um índice de
desempenho — do catálogo ou expressão personalizada — e não só a linha de
índice que já existia sobre dois eixos de propriedade.

**Backend: o mesmo caminho de avaliação, três consumidores.**
`evaluate_index()` (`app/calculations/performance.py`) já era a única rota
para o valor de um índice — usada pela seleção e pela linha sobreposta. Um
eixo-índice passou a ser o terceiro consumidor, sem duplicar a lógica: novo
`ChartService._resolve_axis()` devolve `(metadata, rótulo, getter)` tanto para
uma propriedade quanto para um índice, e o loop por material que monta
`MapPointOut` não sabe qual dos dois está por trás do getter. A garantia do
D-35 — um estudo salvo e um gráfico têm de concordar sobre o valor de um
índice para um material — se estende de graça: `_material_variables()` é o
mesmo snapshot do catálogo usado tanto pela avaliação do eixo-índice quanto
pela linha sobreposta, calculado uma vez por requisição.

**Overlay e eixo-índice são incompatíveis por desenho, não por acidente.** A
linha de índice sobreposta (`index` do request) só existe traçada sobre dois
eixos de *propriedade* — a inclinação log-log parte de duas dimensões
conhecidas do catálogo, e um eixo que já é ele mesmo um índice não tem essa
dimensão fixa para a reta atravessar. `ChartService.property_map` rejeita a
combinação com um `ValidationError` explícito em vez de tentar desenhar uma
linha sem sentido; o frontend replica a regra antes da requisição (esconde o
grupo "Linha de índice" e mostra o motivo, em vez de deixar o usuário
descobrir pelo erro 422).

**Ausência continua sem virar zero, agora também para uma variável que falta
numa expressão.** Um material sem `dureza`, por exemplo, é excluído do mapa
com um motivo nomeado pelo rótulo do eixo — "Sem valor para: Rigidez
específica." — em vez de cair do gráfico em silêncio ou entrar como zero. É a
regra 1.3 aplicada ao mesmo lugar de sempre (`ExcludedPointOut`), só que agora
a causa pode ser uma variável de expressão, não só uma propriedade ausente.

**Qualidade de dado deixa de fazer sentido para um eixo-índice, e o schema diz
isso em vez de inventar um valor.** `MapPointOut.x_quality`/`y_quality` viraram
opcionais: um índice é derivado de várias propriedades, cada uma com sua
própria proveniência, e atribuir uma quality única ao eixo inventaria um fato
que o catálogo nunca declarou. `AshbyMap.tsx` omite o selo e o trecho da
qualidade no hover quando é `null` — não um selo com valor forçado, e não
`AUSENTE` (que já significa outra coisa: um dado que existe na tabela e foi
declarado como faltante). O mesmo raciocínio vale para `property_slug`/
`category` em `MapAxisOut`, que só existem num eixo de propriedade; `is_index`
é o campo que um leitor deve checar primeiro, porque nenhum dos dois pares
sozinho desambigua "isto é um índice" de "esta propriedade genuinamente não
tem categoria".

**Compatibilidade retroativa por desenho do schema, não por acaso.** `x`/`y`
viraram `str | None` e ganharam os irmãos `x_index`/`y_index: IndexIn | None`,
em vez de um tipo de união que quebraria todo payload existente. A validação
"exatamente um dos dois, nunca os dois, nunca nenhum" mora no serviço
(`ChartService.property_map`), não num `model_validator` do Pydantic — o
projeto já não usa `model_validator` em nenhum schema, e esta decisão manteve
o padrão em vez de abrir uma exceção. Resultado prático: os 48 testes
pré-existentes de `test_charts_api.py` passaram sem alteração depois do
refactor.

**Frontend: cada eixo ganha seu próprio estado de "propriedade ou índice", sem
herdar o `IndexPicker` de cartões do overlay.** O seletor de eixo usa um
`<select>` compacto (predefinido ou "Expressão personalizada") em vez da grade
de cartões do overlay — o overlay é uma decisão exploratória que já ocupava
uma seção inteira; replicá-la duas vezes ao lado dos outros dez controles do
mapa teria custado a legibilidade que D-39 acabou de consertar. O `IndexCard`
com as condições de validade continua aparecendo assim que um índice é
escolhido — a garantia de "nenhum índice é caixa-preta" não muda pela via de
entrada.

**Como se sabe que passa.** Backend: `black --check`, `ruff check` e `pytest`
verdes (541 testes — 10 novos em `TestIndexAxis`, cobrindo valor correto,
qualidade/bounds nulos em eixo-índice, nome derivado da expressão quando o
índice é anônimo, direção derivada do objetivo, os dois eixos como índice ao
mesmo tempo, exclusão por material com rótulo do eixo, e as quatro
combinações rejeitadas). Frontend: `typecheck`, `lint`, 138 testes e `build`
verdes. Verificação ao vivo no navegador (por DOM, não por captura — mesma
ressalva desta máquina): eixo X trocado para "Rigidez específica" plotou 5/5
materiais com o eixo lendo o valor computado e sem selo de qualidade na
coluna do índice; os dois eixos como o mesmo índice mostrou a mensagem de
conflito sem disparar requisição; os dois eixos como índices diferentes
plotou 2/5 materiais com os três ausentes listados por "Sem valor para:
Resistência específica." — a mesma frase do rótulo do eixo, não um texto
genérico.

## D-41 — O laudo de engenharia é um documento à parte, montado a partir de peças que já existiam

**12/08/2026.** Sexta e última das seis frentes da Fase 9. "Laudo de
engenharia completo" não tinha elaboração em lugar nenhum — nem na proposta
original, nem em `DECISIONS.md`, `TODO.md`, `backlog.md` ou
`10-relatorios.md` — a mesma situação de D-40 antes de perguntar. A única
pista era a própria frase deste arquivo de "falta a montagem do laudo",
escolhida sem querer, mas reveladora: sugeria montagem, não invenção.
Perguntado, o autor escolheu a interpretação de maior escopo entre as três
oferecidas: um **documento novo e dedicado**
(`GET /api/exports/estudos/{id}/laudo.html`), distinto do relatório de
seleção da Fase 7 — pensado para ser anexado sozinho à monografia, não lido
como um resumo das tabelas voltadas a planilha.

**"Montagem" era literal.** Nada do que o laudo precisa foi escrito do zero:
`app/exporters/figures.py` (a renderização SVG de Fase 9, até então só
exercitada em teste) desenha o gráfico; `ExportService._sheets()` — extraído
de `study_report()` sem mudar uma linha de conteúdo — fornece as oito seções
de auditoria; e `AIService.explain()` (Fase 6) escreve a interpretação. O
serviço do laudo (`ExportService.study_laudo()`) só reexecuta o estudo uma
vez (`_run()`, também compartilhado com `study_report()`) e arruma o que os
três já produzem — a mesma disciplina de "o serviço nunca calcula" que já
regia o relatório de seleção.

**A figura é um gráfico de barras do ranking, não o mapa de propriedades.**
Um mapa X-Y exigiria decidir quais duas propriedades plotar a partir de uma
expressão de índice arbitrária — o `mock.py` da IA já faz isso, mas só para
monômios de duas variáveis; a maioria dos índices do catálogo tem mais. O
gráfico de barras de `result.ranking.ranked` não tem essa limitação: desenha
para qualquer estudo com ranking, com a mesma regra de ausência do resto do
projeto (um candidato sem pontuação não é uma barra de zero — é omitido do
gráfico e listado à parte na tabela de excluídos, que já existia).

**A interpretação por IA é opcional no laudo porque é opcional em todo o
resto do sistema (regra 1.5), e a ausência é declarada, não silenciosa.**
`ExportService._narrative()` chama `AIService.explain()` e captura
`ValidationError`/`AIUnavailableError` — desligada, mal configurada ou uma
falha de rede momentânea do provedor real degradam só esta seção, nunca o
documento inteiro. A seção "Interpretação técnica (IA)" **sempre aparece**;
quando não há narrativa, ela mostra "Interpretação por IA não disponível: —"
em vez de desaparecer, porque um leitor que não visse a seção não saberia se
ela nunca existiu ou se foi omitida por acidente. É a mesma disciplina da
regra 1.3 (ausência nunca é silêncio), estendida de uma célula de tabela para
uma seção de documento.

**O responsável técnico é texto declarado, nunca validado contra nada** — um
parâmetro de consulta opcional (`?responsavel=`) que só é escapado, do mesmo
jeito que um nome de material hostil já era. Não há campo de assinatura
digital nem carimbo de data: o laudo herda a mesma razão do relatório de
seleção para não ter data — o pipeline é determinístico, então o mesmo
catálogo tem de produzir os mesmos bytes.

**`Report` ganhou três campos opcionais em vez de o laudo virar um renderizador
paralelo.** `responsible`, `figure` e `narrative*` (`app/exporters/report.py`)
são lidos só por `to_html()`; `to_csv()`/`to_xlsx()` continuam iterando
apenas `sheets` e nem sabem que os campos existem — o relatório de seleção
existente não muda uma linha de saída. A alternativa (um módulo de
renderização HTML paralelo só para o laudo) duplicaria 150 linhas de CSS e
escape só para reaproveitar o resto; a extensão do dataclass é retrocompatível
por não ter default diferente de `None` em lugar nenhum.

**Como se sabe que passa.** Backend: `black --check`, `ruff check` e `pytest`
verdes (558 testes — 17 novos: 11 em `TestStudyLaudo`, cobrindo as oito
seções de auditoria, a figura embutida, a narrativa presente por padrão
(`AI_PROVIDER=mock`), a narrativa declaradamente ausente com a IA desligada,
o responsável presente/ausente, o nome hostil escapado, a política de
execução e o 404 de estudo inexistente; 6 em `TestHtmlRendering`, cobrindo o
escape do responsável, a marcação confiável da figura própria, o escape da
narrativa com sua numeração após as seções, e a seção de ausência declarada).
Frontend: `typecheck`, `lint`, 138 testes e `build` verdes — sem teste novo
dedicado, mesmo padrão de `ExportButtons`/`StudyExplanation`, componentes de
ligação cobertos pela verificação ao vivo em vez de um arquivo próprio.
Verificação ao vivo no navegador (por DOM, não por captura): um estudo criado
via API, o campo "Responsável técnico" preenchido atualizando o `href` a cada
tecla, o documento aberto mostrando as nove seções na ordem esperada — a
figura de barras com a primeira colocada destacada na cor de realce, e a
seção 9 com a prosa determinística do provedor simulado, ressalvas e
disclaimer.

---

## D-42 — Login só por terceiros (Google); catálogo compartilhado entre usuários; um projeto por usuário no v1

**Contexto.** [D-18](#d-18--sem-autenticação-no-mvp-superado-por-d-42) aceitava
a API aberta enquanto o sistema rodasse só localmente. O usuário confirmou que
o sistema **vai ser hospedado**, o que torna a API aberta (escrita e exclusão
inclusas) o maior risco pendente do projeto. Isto implementa A5 do
[TODO.md](TODO.md), o que também destrava M2 (auditoria), que depende de
"quem" existir.

**Decisão.**
- **Login exclusivamente por terceiros — Google, via OAuth 2.0.** Sem
  cadastro com senha, sem formulário de e-mail/senha, sem hash de senha para
  gerenciar. `User.google_sub` (o `sub` do ID token, estável mesmo que o
  e-mail mude) é o identificador; `google_client_id`/`google_client_secret`
  vazios desligam o login com 503, mesmo padrão de `AI_BASE_URL` sem valor
  padrão perigoso ([D-36](#d-36--a-ia-gratuita-é-um-protocolo-não-um-fornecedor)).
- **Sessão em cookie `httpOnly`**, não token JWT client-side: `UserSession` é
  uma linha de banco (`app/models/user.py`), não algo assinado e stateless —
  logout precisa revogar de verdade, e só uma linha que pode ser apagada torna
  isso verdade. 14 dias fixos na criação, sem renovação deslizante.
- **O catálogo (materiais, classes, propriedades) continua global e
  compartilhado** entre todo usuário autenticado, escrita inclusa — a mesma
  curadoria compartilhada que já existia implicitamente, agora exigindo login
  em vez de estar aberta a qualquer um na internet. Só `SelectionStudy` é
  privado, escopado por `Project`. Introduzir papéis (admin vs. colaborador)
  ficou fora deste escopo — não é pedido por A5 nem pelo TODO.
- **Um `Project` por `User`, criado automaticamente no primeiro login**
  ("Meu projeto"), dono único, sem colaboração multiusuário. Dá ao esquema um
  `Project` real (pronto para múltiplos projetos por usuário no futuro) sem
  exigir hoje uma tela de troca de projeto — não há UI nenhuma para isso
  ainda, e construí-la antes de haver dois projetos por usuário para trocar
  entre si seria antecipar um caso de uso que não existe.

**Alternativas descartadas.**
- Login com e-mail/senha: exigiria hash, recuperação de senha, verificação de
  e-mail — infraestrutura inteira só para autenticação, quando o produto não é
  sobre isso.
- JWT stateless em vez de sessão em banco: logout deixaria de revogar de
  verdade (o token continuaria válido até expirar) ou exigiria uma lista de
  revogação — que é, na prática, reinventar a tabela `user_session`.
- `Project` isolando também o catálogo: cada usuário passaria a ter seu
  próprio conjunto de materiais/classes/propriedades, duplicando dado de
  referência que é o mesmo para todo mundo — contradiz o princípio de não
  inventar/duplicar propriedade de material.
- Papéis (admin/colaborador) desde já: nenhum caso de uso concreto os pede
  ainda; a tabela de sessão e o dependency `get_current_user` já dão o ponto
  de extensão quando pedirem.

**Como funciona.** `AuthService` (`app/services/auth_service.py`) monta a URL
de autorização do Google com um `state` de CSRF num cookie efêmero próprio
(`msai_oauth_state`) — não no `SessionMiddleware`/Authlib, para não ter duas
noções de sessão concorrentes e manter a comparação sensível visível no código
do projeto. No callback: troca `code` por tokens, verifica o `id_token`
localmente com `google-auth` (assinatura, `aud`, `iss`, `exp` — sem round-trip
ao endpoint `tokeninfo`, que o próprio Google desaconselha para produção),
rejeita `email_verified=False`, aplica `google_allowed_domain` se configurado
(pensado para travar login a um domínio antes de hospedar para uma turma), faz
upsert do `User` por `google_sub`, garante o `Project` padrão, cria a
`UserSession` e seta o cookie `msai_session` (`HttpOnly`, `SameSite=Lax`,
`Secure` conforme `session_cookie_secure`). `get_current_user`
(`app/dependencies.py`) é o único ponto de verdade de "quem está logado" — todo
router depende dele, exceto os três públicos de `auth.py` e `/health`. Acesso
de um usuário a um estudo de outro projeto não vira um erro novo: o
repositório, filtrado por `project_id`, simplesmente não encontra a linha, e
`NotFoundError` (404) já cobre isso — não vale revelar que o id existe.

**Consequência que muda comportamento existente.** A unicidade de nome de
estudo, antes global, passa a ser **por projeto** — dois usuários podem ter um
estudo chamado "Estudo 1" cada um.

**E o Playwright?** A suíte (`apps/web/e2e/`) não tem cliente OAuth de teste
utilizável em CI. Em vez de um endpoint de bypass no backend — superfície de
ataque real, difícil de travar com segurança total —, `app/db/seed.py` só
grava um `User`/`Project`/`UserSession` fixos quando `ENVIRONMENT=development`
**e** `E2E_SESSION_TOKEN` está no ambiente (`seed_e2e_session`); a suíte injeta
esse token direto no navegador como cookie `msai_session`
(`apps/web/e2e/session.ts`, via `context.addCookies`) antes da primeira
navegação. O navegador chega "logado" sem passar pelo Google e sem nenhuma
rota de bypass exposta pela API.

**Como se sabe que passa.** Backend: `pytest`, `ruff check` e `black --check`
verdes, incluindo `test_auth_service.py` (upsert, criação do projeto padrão,
rejeição por domínio e por `email_verified=False`, com a verificação do
`id_token` injetada — sem chamada de rede real) e a extensão de
`test_selection_api.py` (um usuário não vê/apaga o estudo de outro; dois
projetos podem repetir nome de estudo). Frontend: `typecheck`, `lint`,
`test` e `build` verdes, com `AuthGate` e a página `/entrar` cobertos por
teste. Playwright (`npm run test:e2e`): os dois specs passam com a sessão
injetada, sem tocar o Google.

---

## D-43 — A trilha de auditoria guarda retratos, não junções vivas; e não cobre a importação em lote

**Contexto.** M2 do [TODO.md](TODO.md) — nenhuma alteração de catálogo ou de
estudo tinha "quem" e "quando" registrados, apesar de A5 ([D-42](#d-42--login-só-por-terceiros-google-catálogo-compartilhado-entre-usuários-um-projeto-por-usuário-no-v1))
já ter dado ao esquema um `User` para atribuir a mudança. Ficou pendente desde
então; nada bloqueava mais.

**Decisão.**
- **`AuditEvent`** (`app/models/audit.py`) registra `quem` (retrato de
  `user_email`, mais `user_id` como FK `SET NULL` — a FK existe para consulta
  enquanto a conta existir, o retrato existe para quando ela não existir mais),
  `o quê` (`entity_type` + `entity_id`, mais um retrato de `entity_label`) e
  `quando` (`created_at`), para as entidades que uma pessoa edita à mão:
  material, classe, propriedade, índice de desempenho e estudo de seleção.
- **`changes` é um diff só nos campos que mudaram** (`{campo: {before, after}}`),
  calculado pelo próprio serviço antes do commit — nunca no roteador, nunca em
  SQL. Uma atualização que não muda nada de fato (`PATCH` repetindo o valor já
  gravado) não grava evento nenhum: um log de "nada mudou" registrado toda vez
  que alguém reenvia o mesmo formulário seria ruído, não trilha.
- **A troca de valores de propriedade de um material (`PUT .../values`) vira
  um evento `ATUALIZADO` diffado por slug de propriedade**, não um evento por
  linha da tabela `material_property_value`: a operação já é "substitua o
  conjunto inteiro", e a proveniência de cada valor (unidade, fonte, método de
  conversão) já é rastreada à parte por linha (princípio 4 do `CLAUDE.md`) —
  isto rastreia *quem* mexeu, não reproduz *o que* já está rastreado alhures.
- **Para `SELECTION_STUDY`, o evento guarda um retrato de `project_id`** — não
  uma junção contra `selection_study.project_id` em tempo de leitura. Depois
  que um estudo é excluído, `entity_id` deixa de resolver a qualquer linha; um
  filtro de privacidade por junção quebraria em silêncio bem na hora em que
  mais importa (auditar a própria exclusão). Catálogo (material, classe,
  propriedade, índice) não tem dono e o campo fica `NULL`.
- **A importação em lote não passa por aqui, de propósito.** `ImportService`
  monta `Material`/`MaterialPropertyValue` diretamente
  (`app/importers/service.py`), sem os métodos públicos de `MaterialService`
  onde o `record_change` está — auditar por linha um commit de milhares
  produziria ruído, não trilha útil. `ImportJob` (com seu próprio `status`,
  contagens e `committed_at`) já *é* a trilha desse fluxo; document limitation,
  não bug — coberto por `test_import_commit_does_not_record_material_events`.
- **`record_change` é um no-op silencioso quando `user is None`.** Todo
  endpoint que muta hoje passa um usuário real (login é obrigatório desde A5),
  mas os serviços também são instanciados por código sem ator — a importação
  acima, e a reexecução de estudo salvo por `ExportService`/`AIService`. Um
  parâmetro opcional em vez de obrigatório evita forçar um ator fabricado
  nesses caminhos só para satisfazer uma assinatura — a mesma lógica de nunca
  inventar um valor ausente (princípio 3), aplicada a "quem fez isto".

**Alternativas descartadas.**
- Guardar o objeto inteiro (antes/depois) em vez de só os campos que mudaram:
  mais fácil de escrever, muito mais ruidoso de ler — um `PATCH` de um campo
  não deveria imprimir os outros dez inalterados.
- Um evento por linha de `material_property_value` na troca de valores: exige
  IDs estáveis através de um delete+recreate (a operação atual apaga e recria
  todas as linhas do material, não faz UPDATE por linha), e duplicaria a
  proveniência que a própria linha já carrega.
- Filtrar a privacidade de `SELECTION_STUDY` por junção contra a tabela viva:
  mais simples de escrever, mas perde a visibilidade do dono sobre o evento
  mais importante — a própria exclusão — no instante em que ele acontece.
- Cobrir a importação também: o commit de um `ImportJob` já grava contagens e
  status; replicar isso material a material não acrescenta rastreabilidade,
  só volume. Fica registrado como limite conhecido, não como pendência.

**Como funciona.** `app/services/audit_service.py` expõe `record_change`
(grava o evento, no-op se `user is None`) e `diff_fields` (compara dois dicts
e devolve só as chaves que mudaram). Cada serviço mutante
(`MaterialService`, `TaxonomyService`, `PropertyService`, `SelectionService`)
ganhou um `user: User | None = None` no construtor e chama `record_change`
depois de mutar o objeto mas **antes** do próprio `commit()` — o evento entra
na mesma transação da mudança que descreve, então um nunca fica sem o outro.
`GET /api/audit` (`app/routers/audit.py`) lista por `entity_type`/`entity_id`
paginado, sob o mesmo `get_current_project` que todo endpoint de estudo já
usa; `AuditRepository.list_events` aplica o filtro de privacidade de
`SELECTION_STUDY` na própria consulta.

**Como se sabe que passa.** `pytest`, `ruff check` e `black --check` verdes,
com `test_audit.py` cobrindo: evento criado/atualizado/excluído para cada tipo
de entidade; diff correto por campo e por slug de propriedade; nenhum evento
espúrio numa atualização sem mudança real; exclusão duas vezes grava um único
`EXCLUIDO`; um usuário não vê o estudo de outro nem por id nem numa listagem
mista; o dono continua vendo o evento de exclusão do próprio estudo depois
dele sumir da tabela; e a importação em lote não grava evento nenhum de
material. `alembic upgrade head` + seed num banco limpo, como todo PR.

---

## D-44 — A licença de uma fonte é decidida uma vez, no registro; reusar o rótulo não reabre a decisão

**Contexto.** M1 do [TODO.md](TODO.md) — nenhuma base importada tinha
procedência ou licença registrada, e nada impedia incorporar dado
possivelmente protegido sem uma decisão humana explícita. Compromisso do item
4.2 da proposta, e o repositório é público desde
[D-22](#d-22--repositório-público-para-o-portão-de-ci-ser-real).

**Decisão.**
- **`Source` ganha `license_label`/`license_url`, a sinalização explícita
  `contains_third_party_data` e um carimbo de quem registrou a fonte e
  quando** (`reviewed_by_user_id`/`reviewed_at`). Nenhum desses campos é
  inferido — todos vêm do que quem importa escreveu no mapeamento.
- **O portão fica na importação, não no cadastro manual.** O item do backlog
  fala em "base... importada"; um material só (`POST /materials`) já passa
  por uma pessoa logada decidindo linha a linha, o mesmo nível de decisão
  humana que o portão de importação está formalizando para um lote inteiro de
  uma vez. Estender o portão ao cadastro manual exigiria mudar o contrato de
  `PropertyValueIn` (e os dois arquivos de tipos que o espelham) por um ganho
  que o item não pede — fica registrado como extensão natural, não como
  lacuna.
- **A licença é obrigatória só para uma fonte nova.** `source_label` já
  registrado → o rótulo é reaproveitado como está, sem reabrir a decisão a
  cada importação seguinte. Rótulo novo sem `source_license_label` → 400,
  antes de qualquer linha ser escrita — tanto em `/imports/{id}/validate`
  (feedback cedo) quanto em `/imports/{id}/commit` (o portão que realmente
  importa, caso o mapeamento tenha sido alterado entre as duas chamadas).
- **`contains_third_party_data=True` exige `source_review_confirmed=True`
  explícito.** É a "decisão humana obrigatória antes da incorporação" do
  item do backlog: uma marcação por si só não basta, precisa de uma segunda
  confirmação — o mesmo padrão de duas etapas que a IA já segue para uma
  restrição não bastar sem o número aparecer no enunciado (princípio 1.5 do
  `docs/CLAUDE.md`).
- **`GET /api/sources`** lista toda fonte registrada com sua licença e
  revisor, sob login — mesma lógica de M2: uma trilha que só grava e nunca
  se mostra não sustenta alegação nenhuma de conformidade.

**Alternativas descartadas.**
- Um fluxo de aprovação assíncrono (fonte fica "pendente" até um segundo
  usuário aprovar): não existe estado "pendente" em nenhuma outra parte da
  aplicação — tudo aqui é CRUD síncrono por uma pessoa logada. Inventar uma
  máquina de estados para um único caso de uso teria sido a exceção, não a
  regra.
- Licença obrigatória em toda importação, mesmo reaproveitando uma fonte já
  registrada: reabriria a mesma decisão a cada linha nova de uma base que já
  foi revisada — ruído, não rastreabilidade.
- Estender o portão ao cadastro manual de material: ver "A decisão" acima.
- Inferir `contains_third_party_data` automaticamente (por exemplo, por
  domínio da URL da referência): um heurístico errado — silencioso — é pior
  que exigir que a pessoa marque explicitamente, e o princípio 1 do
  `CLAUDE.md` já rejeita qualquer palpite automático no lugar do dado
  explícito.

**Como funciona.** `ImportService._check_source_licensing`
(`app/importers/service.py`) roda em `validate()` e de novo em `commit()` —
o catálogo pode mudar entre as duas chamadas, e o portão de verdade é o
segundo. `MaterialRepository.get_or_create_source` (estendido, não duplicado)
grava os campos de licença só quando cria a linha; reutilizar um `label`
existente devolve a linha como está, licença e carimbo de revisor inclusos.
`MaterialService._build_value_from_input` ganhou os mesmos parâmetros
opcionais para repassá-los — o cadastro manual nunca os define, então nunca
aciona o carimbo (por quê: ver "A decisão" acima). `app/db/seed.py` e a
própria migration (`fc5a731dd162`) registram a licença da fonte de
demonstração (`"Dado fictício de demonstração — não é conteúdo de terceiro"`)
para que ela nunca apareça como "sem licença" num banco já semeado antes
desta migration.

**Como se sabe que passa.** `pytest`, `ruff check` e `black --check` verdes,
com `test_source_licensing.py` cobrindo: fonte nova sem licença rejeitada;
fonte marcada como terceiro sem confirmação rejeitada; fonte válida commitada
e `GET /api/sources` mostrando licença, sinalização e revisor certos; reusar
uma fonte já registrada não exige licença de novo e não duplica a linha;
importação sem `source_label` nenhum não aciona o portão; `GET /api/sources`
exige login. `alembic upgrade head` + seed num banco limpo, como todo PR —
inclusive o backfill da fonte de demonstração.

## D-45 — O Cérebro (livros comerciais, fichas Granta EduPack) fica versionado em `main`, por decisão explícita do autor

**Contexto.** O commit `565a6d2` (PR #17) versionou `Cérebro/` inteira em
`main` via Git LFS — 158 arquivos, 653 MB: 11 livros comerciais e 2 extratos
de capítulo (`01-Bibliografia/`), 103 fichas técnicas do Granta EduPack
(`03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/`), mais material de curso do
professor, trabalhos entregues pelo autor, diagramas e dois artigos
científicos. O repositório é público desde
[D-22](#d-22--repositório-público-para-o-portão-de-ci-ser-real). Ao levantar
a reconciliação das branches de fase, o material licenciado (livros +
Granta) foi identificado como candidato a purga do histórico — o mesmo
procedimento (`git filter-repo`) já tinha sido executado com sucesso em
`fase-9-ia-e-laudo` antes daquela branch ser trazida para `main`.

**Decisão.** O autor optou por **não purgar** — os 158 arquivos continuam no
histórico e na árvore atual de `main`, incluindo os 11 livros e as 103
fichas. A razão declarada: **o Cérebro é a base de conhecimento que a
camada `ai/` usa para as validações** — vocabulário, método e contexto de
domínio para o modelo escrever sobre seleção de materiais em vez de
escrever a partir do que ele "sabe" (mesmo raciocínio do commit original).
Isso é uma decisão de risco aceito, tomada com informação completa sobre o
que está exposto — não um descuido. **A6, que registrava isto como pendência
de purga no [TODO.md](TODO.md), foi removido**; não há ação de código
pendente aqui.

**O que isso não muda.** O guardrail de `app/ai/guardrails.py` continua
valendo por inteiro: o Cérebro dá vocabulário e contexto, **nunca** um
número — todo cálculo segue vindo do pipeline determinístico
(princípio 1.5/2 do `CLAUDE.md`), e um valor lido de um livro não vira
citável só por estar indexado. A decisão é sobre **hospedar o material**,
não sobre **como a IA o usa** — essas são questões independentes.

**Alternativas descartadas.**
- Purgar só os 116 arquivos inequivocamente comerciais (livros + Granta),
  mantendo o material de curso e os trabalhos entregues: foi a proposta
  levada ao autor; recusada em favor de manter tudo.
- Purgar tudo: nem chegou a ser considerada pelo autor — descartaria também
  conteúdo que ele tem razão para manter (seus próprios trabalhos
  entregues).

## D-46 — M9 resolvido: o portão global de assinatura (plano de 18/08) é o que fica ligado

**Contexto.** O PR #18 trouxe duas arquiteturas de cobrança nunca reconciliadas:
o plano de 18/08 (`docs/superpowers/plans/2026-08-18-multi-tenant-billing.md`) —
um portão binário, `require_active_subscription` aplicado em bloco a todo
router — já totalmente codificado mas não ligado; e o plano de 21/08
(`docs/superpowers/plans/2026-08-21-assinatura-e-limites.md`) — Free/Pro com
quatro recursos limitados por um `EntitlementService`, nunca implementado.
D-44 tinha registrado a ambiguidade sem decidir; o teste que afirmava o
portão global ficou com `skip` até esta decisão ser tomada explicitamente.

**Decisão.** Ativar o plano de 18/08 como está. `require_active_subscription`
passou a ser aplicado a todo router em `main.py`, exceto `health`, `auth` e
`billing` — incluindo `audit` e `sources`, que chegaram depois do desenho
original mas seguem o mesmo princípio ("tudo atrás do portão, exceto o que
não pode ficar"). O plano de 21/08 (Free/Pro) não foi implementado; fica como
desenho alternativo registrado, não como próximo passo.

**Por que o binário, e não o Free/Pro.** O binário já estava pronto —
`Subscription`, `SubscriptionRepository`, `BillingService`,
`SubscriptionRequiredError`, o router `/billing/*` e até o `AuthGate` de dois
estágios (revertido a um estágio só na reconciliação do PR #18) já existiam.
Faltava só ligar a dependência em `main.py` e reescrever `AuthGate.tsx` — uma
tarde de trabalho contra uma reimplementação do zero (`EntitlementService`,
nova migration, quatro services a mudar) que o Free/Pro exigiria.

**O que isso muda de verdade.**
- Toda rota exceto `/api/health`, `/api/auth/*` e `/api/billing/*` responde
  403 (`SubscriptionRequiredError`) a um usuário autenticado sem
  `Subscription.status == "active"`. `GET /api/billing/status` continua
  público a qualquer usuário logado — é a rota que o `AuthGate` consulta
  para decidir se redireciona a `/assinatura`.
- `AuthGate.tsx` volta a ser um portão de dois estágios: `/auth/me` primeiro
  (não autenticado → `/entrar`), depois `/billing/status` (autenticado sem
  assinatura ativa → `/assinatura`). `/assinatura` e `/entrar` são as únicas
  rotas que o portão nunca bloqueia.
- A sessão fixa de E2E/Lighthouse (`seed_e2e_session`, `ENVIRONMENT=development`
  + `E2E_SESSION_TOKEN`) já escrevia uma `Subscription` `status="active"`
  junto da sessão — preparada de propósito para este momento (ver o
  docstring da função). Confirmado ao vivo: sem essa preparação, o gate teria
  quebrado toda a suíte de Playwright e o job de Lighthouse.
- O teste `test_protected_route_without_active_subscription_is_forbidden`
  perdeu o `skip`.

**Verificação ao vivo, além dos 713 testes.** Subida a API com a sessão fixa
semeada: sem cookie → 401; com a sessão de e2e (assinatura ativa) →
`GET /api/materials` 200; um segundo usuário logado sem nenhuma
`Subscription` → 403 em `/api/materials` e 200 em `/api/billing/status` (a
rota continua alcançável para renderizar o convite a assinar).

**O que fica em aberto.** Nenhum plano de preço real está configurado
(`STRIPE_API_KEY` vazio nos ambientes de desenvolvimento e CI, então
`checkout`/`portal` respondem 503) — o portão está ligado, mas ninguém
consegue assinar de verdade sem um operador configurar o Stripe. Isso é
esperado: D-36 já estabeleceu que nenhuma credencial tem valor padrão.

**Alternativas descartadas.**
- Implementar o Free/Pro (plano de 21/08) agora: mais amigável para um
  produto real, mas full-rewrite não pedido — o autor escolheu explicitamente
  o binário já pronto quando confrontado com os dois.
- Manter os dois desenhos coexistindo, sem nenhum ligado: era o estado desde
  o PR #18: preservava opcionalidade, mas deixava o sistema sem cobrança
  nenhuma de verdade indefinidamente.

**Checkout real testado ao vivo (25/08).** O autor configurou um produto de
teste na própria conta Stripe (modo de teste — `sk_test_...`,
`STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`) e um cliente OAuth real no Google
Cloud Console, na própria máquina local (fora deste ambiente de execução, que
bloqueia todo domínio `*.stripe.com` por política de rede da organização) e
rodou o fluxo completo: login Google → `/assinatura` → checkout hospedado da
Stripe → pagamento em modo de teste → redirecionamento de volta com
`?status=sucesso`, com `stripe listen` encaminhando os webhooks para a API
local.

Essa verificação expôs um bug real que nenhum dos 713 testes pegava: **todo**
evento de webhook devolvia 500. `billing_service.py` chamava `.get()` no
`event`/`data` que o SDK de verdade devolve (`stripe>=10`, testado com
15.5.1) — um `Event`/`StripeObject`, que aceita `[]` e `in` mas **bloqueia
`.get()` de propósito** (força `.to_dict()`). O fake de teste sempre injetou
um dict Python puro, que suporta `.get()` normalmente — a suíte nunca
reproduzia a restrição do SDK real. Corrigido no PR #21: `_get(obj, key,
default)` substitui os cinco `.get()` do serviço, e o fake de teste passou a
envolver o evento com `_StrictStripeObject` (aceita `[]`/`in`, rejeita
`.get()`) para que o mesmo bug não volte a passar despercebido. Depois da
correção: `checkout.session.completed` processado sem erro, `Subscription`
criada com `status="active"`, `/assinatura` refletindo a assinatura ativa e
o portão liberando as rotas antes bloqueadas — confirmado pelo autor no
próprio ambiente, não só pelos testes automatizados.

## D-47 — Busca híbrida (RRF) sobre o Cérebro, Jina AI como receita gratuita, citação verificada em vez de citação livre

**26/08/2026.** O Cérebro (`Cérebro/`) estava em `main` desde D-45 — hospedado,
íntegro, mas inerte: nada em `app/ai/` o lia. Este spec
(`docs/superpowers/specs/2026-08-25-cerebro-rag-design.md`) fechou quatro
escolhas de arquitetura antes de qualquer linha de código, em conversa com o
autor.

**Léxica e semântica, fundidas por RRF — não uma ou outra.** BM25 sozinho
(`app/knowledge/lexical.py`) já funciona sem rede assim que a ingestão roda; é
a via que qualquer instalação tem de graça. Semântica sozinha exigiria um
backend de embeddings configurado para que o Cérebro servisse a algo, o que
recriaria o mesmo problema que D-36 já resolveu para a IA: uma dependência
externa obrigatória onde o produto promete funcionar sem nenhuma. *Reciprocal
rank fusion* (`app/knowledge/retrieval.py`, `_reciprocal_rank_fusion`,
`k=60`) deixa as duas coexistirem sem que uma dependa da outra: o léxico
cobre a instalação sem nenhuma chave, o semântico melhora a mesma busca por
cima quando configurado, e a fusão nunca precisa saber qual das duas listas
está vazia — soma `1/(60+posição)` sobre as que existirem.

**Jina AI como receita documentada em `.env.example`, não como dependência.**
A pesquisa que precedeu o spec (seção 1, "Decisões de escopo já tomadas")
verificou `api.jina.ai/v1/embeddings`: formato compatível com OpenAI de
verdade (`model` + `input` → `data[].embedding`, o mesmo contrato que
`EmbeddingClient` já fala para qualquer servidor), cadastro sem cartão, 1M
tokens grátis por mês — hospedado, o que importa porque o produto é pensado
como SaaS e não pode depender da máquina do autor ter um Ollama no ar. Isso
não torna a Jina AI obrigatória: `KNOWLEDGE_EMBEDDING_BASE_URL` **não tem
padrão**, pelo mesmo raciocínio de `AI_BASE_URL` (D-36) — um padrão escolheria
um fornecedor pelo operador — e o mesmo `.env.example` documenta Ollama local
e OpenAI como alternativas com o mesmo cliente. Sem nenhuma das três
configuradas, a busca cai para léxico puro, silenciosamente para quem chama.

**Retrieval gated por `provider.simulated`, nunca pelo nome do provedor.**
`AIService._retrieve` (`app/services/ai_service.py`) checa
`provider.simulated`, não `provider.name == "mock"` — a mesma disciplina de
D-35/D-36, onde a garantia mora na camada e não num fornecedor nomeado. Um
provedor futuro que se declare `simulated = True` herda a isenção de rede
automaticamente; um que não se declare simulado não precisa ser adicionado a
lista nenhuma para ganhar retrieval. O motivo de existir o portão é duplo:
preservar a promessa de que `mock` é determinístico e sem rede (`CLAUDE.md`
§1.5, `docs/09-camada-ia.md`), e não deixar a suíte inteira — a maioria dela
rodando com `AI_PROVIDER=mock` — mais lenta por uma consulta que a maior parte
dos testes não precisa.

**Citação verificada por índice, não citação livre por título e trecho.** A
alternativa mais óbvia — deixar o modelo escrever de qual documento tirou uma
afirmação — foi descartada: um provedor real pode errar o título, parafrasear
o trecho errado ou inventar uma fonte plausível, e nada no formato livre
permitiria distinguir uma citação real de uma alucinada. `EXPLAIN_SCHEMA`
pede só `sources: list[int]` — o índice `[1]`, `[2]`… do bloco numerado que o
próprio backend construiu (`prompts.py`, `_reference_block`) — e
`guardrails.check_citations(sources, retrieved)` descarta qualquer índice
fora do intervalo dos trechos **de fato entregues naquela chamada**. Uma
citação inválida não derruba a explicação inteira (diferente de
`ungrounded_numbers`): é metadado sobre a própria resposta, não uma alegação
numérica, e o pior caso de descartá-la é uma fonte a menos listada, nunca uma
informação errada mostrada como verificada.

**O que não mudou, e é o ponto do spec inteiro.**
`guardrails.check_constraint`/`ungrounded_numbers` continuam lendo só
`context.statement`/`context.numbers` — nenhuma das duas foi tocada para
saber que `context.retrieved` existe. Um número presente só num trecho
recuperado, ausente do enunciado do usuário, é recusado do mesmo jeito que
antes desta feature existir; a Tarefa 10 do plano de implementação cravou
essa garantia com um teste dedicado, e dois revisores confirmaram
separadamente que nenhum caminho novo alcança as duas funções. Ver
`CLAUDE.md` §1.5 (terceira regra) e [09-camada-ia.md](09-camada-ia.md).

**Alternativas descartadas.**
- **Semântica pura, sem BM25.** Exigiria embeddings configurados para o
  Cérebro servir a qualquer coisa — voltaria a depender de uma credencial
  externa onde o resto do produto (D-36) já tinha decidido o contrário.
- **Citação livre (título e trecho escritos pelo modelo).** Nada verificável
  do lado do backend; um título ou trecho plausível e errado passaria
  exatamente como um verdadeiro. O índice numérico é o único formato em que
  "esta citação existe de verdade" é uma checagem, não uma torcida.

**Como se sabe que passa.** 795 testes de backend (0 falhas, 0 pulados) —
`test_knowledge_retrieval.py` (BM25 sozinho, semântico sozinho com fake,
fusão RRF, degradação, `top_k`), o teste dedicado de `test_ai_api.py`
(`TestRetrievedTextNeverGroundsANumber`) que prova a ancoragem intacta com um
número presente só no trecho recuperado,
`check_citations` (índice fora do intervalo descartado, índice válido passa)
e o portão `provider.simulated` verificado explicitamente para `interpret` e
`explain`. 162 testes de frontend — 768/157 logo após esta entrega (o texto
original desta seção); os dois números finais aqui refletem a rodada de
correção da revisão final de branch e a PR #26, sincronizados na sessão 9
de `CHANGELOG_SESSION.md`.

---

## D-48 — `@material/web` para primitivas de baixo nível — exceção pontual a D-23

**Contexto.** [D-23](#d-23--sistema-de-design-próprio-sem-biblioteca-de-componentes)
decidiu escrever as primitivas de interface neste repositório, sem biblioteca
de componentes — decisão reafirmada no §13 de `REDESIGN.md` ("nenhuma
biblioteca de componentes"). Entre a Fase 9 (PR #8, 18/08) e a reconciliação
da `fase-9-ia-e-laudo` (PR #26, 27/08), `components/ui/` passou a envolver
`@material/web` — a biblioteca de Web Components do Material Design 3 do
Google — para botão, ícone-botão, checkbox, radio, select, chip,
segmented-button, e por fim diálogo e abas. Essa mudança **não gerou uma
entrada de decisão na época**: só foi percebida e registrada nesta sessão,
ao sincronizar a documentação depois da PR #26. Uma decisão descoberta
retroativamente no código, não proposta antes dele, é o tipo de lacuna que
este arquivo existe para fechar — daí este registro, em vez de simplesmente
apagar a tensão com D-23.

**Decisão.** Aceitar `@material/web` como exceção pontual a D-23, restrita ao
que já está em uso: primitivas de baixo nível sem estado de aplicação
(botão, checkbox, radio, select, chip, diálogo, abas). Cada uma é registrada
uma vez em `components/ui/material/elements.ts` (via `@lit/react`,
`createComponent()`) e só é alcançada pelo resto do app através do wrapper
próprio em `components/ui/` (`Dialog.tsx`, `Tabs.tsx` etc.) — nunca
importada diretamente por uma tela. O vocabulário de API continua sendo o do
projeto; o que muda é a implementação por trás dele.

**O que D-23 continua a proibir.** Nenhuma abstração de *layout* ou de
composição de tela vem de terceiro (grid, formulário, tabela, popover de
proveniência inteiro continuam próprios); nenhum sistema de tema concorrente
governa a interface — o de `@material/web` só estiliza o próprio Web
Component. `shadcn/ui`, MUI e Chakra seguem descartados pelas razões
originais de D-23.

**Alternativas descartadas.**
- **Reverter para implementação própria (a leitura literal de D-23).**
  Perderia o que motivou a troca: `@material/web` implementa de graça os
  padrões de teclado que D-23 já registrava como "responsabilidade nossa"
  (foco preso no diálogo, setas/Home/End nas abas, `Escape` cancelável) —
  cada um hand-rolled antes, cada um com bug de acessibilidade já corrigido
  ao menos uma vez no histórico do projeto.
- **Não registrar nada, deixar D-23 como está.** É o estado em que isto foi
  encontrado: o código diverge do que a documentação promete, sem que
  ninguém tenha decidido a divergência. Silenciosamente incorreto é pior do
  que uma exceção registrada.

**Consequência aceita, ainda sem mitigação.** A camada de tema de
`@material/web` (as ~100 variáveis `--md-sys-color-*` em `globals.css`) é
hoje **um segundo sistema de cor**, escrito à mão em paralelo aos tokens
`--brand-*`/`--accent` de [D-28](#d-28--uma-paleta-só-compartilhada-entre-interface-e-gráfico) —
exatamente o "tema concorrente" que D-23 rejeitou em MUI/Chakra, só que
sem o framework de tema completo por trás. Os dois já divergiram: o claro
`--brand-700` é `rgb(21 101 192)` (`#1565c0`), e `--md-sys-color-primary` é
`#005bbf` — próximos, não iguais. Não há hoje uma ponte automática (nenhum
`var(--brand-700)` dentro do bloco `--md-sys-*`); manter os dois em sincronia
depende de quem edita a paleta lembrar de editar os dois blocos. Fica como
item de acompanhamento, não como bloqueio: nenhuma tela hoje mistura os dois
sistemas de um jeito que produza contraste incorreto (verificado nos dois
temas em `/estilo`), mas o risco de nova divergência é real a cada mudança
de paleta.
