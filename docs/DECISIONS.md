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
| D-49 | Paleta por rota ("Prisma") substitui a paleta única de D-38, sem revogar seu método de medição | aceito | abaixo |
| D-50 | Toggle manual "Tabela/Cartões" do catálogo substituído por troca automática de breakpoint | aceito | abaixo |
| D-51 | Next 16 traz Turbopack por padrão; a build fica no webpack, por medição | aceito | abaixo |

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

> **Status (D-80): sem objeto.** Os últimos usuários (`IconButton`,
> `ButtonGroup`/`ButtonGroupItem`, `ToggleChip`) viraram `<button>` nativos com
> as classes do MSDS e `@material/web` saiu do `package.json`. O texto abaixo
> fica como registro de por que a exceção existiu.

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

---

## D-49 — Paleta por rota ("Prisma") substitui a paleta única de D-38, sem revogar seu método de medição

**Contexto.** D-38 fixou uma paleta única, medida (`--brand-700`/`--brand-50`
a 5,01:1), com dois matizes deliberados (`--info` ciano,
`--quality-importado` violeta). O patch "Prisma" (aplicado nesta sessão,
[spec](superpowers/specs/2026-09-02-design-system-prisma-design.md)) muda o
mecanismo: cada rota tem seu próprio matiz de `--accent`/`--brand-*`,
trocado via `[data-section]` no `<html>` (escrito por
`components/layout/SectionTheme.tsx`), com `--md-sys-color-primary` e
`--md-sys-color-primary-container` acompanhando no mesmo escopo.

**Decisão.** Adotar a paleta por rota. O método que D-38 estabeleceu —
medir cada par antes de aceitar, documentar o par mais apertado — continua
valendo e foi seguido pelo patch: par mais apertado 5,59:1 (era 5,01:1),
nenhum par abaixo de 6,2:1 (verificado em
`lib/design/materialTheme.test.ts`, que trava as sete seções × dois temas
contra o limiar WCAG AA). `--ink-subtle` foi escurecido porque a nova
superfície mais clara reprovava o valor antigo (4,3:1).

**O que continua intocado.** `--quality-*`, `--success`/`--warning`/
`--danger`/`--info` e a paleta categórica Okabe–Ito — nenhum dos dois
matizes deliberados de D-38 muda de propósito ou de posição; a rota nunca
os sobrescreve.

**Consequência aceita.** A paleta deixa de ser "uma cor por conceito em todo
lugar" e passa a ser "uma cor por conceito, modulada por onde a tela está" —
uma leitura a mais para quem edita a paleta pela primeira vez (qual valor é
o de uma seção específica vs. o de um token semântico como `--success`).
Mitigado por manter os dois tipos de token em blocos CSS visivelmente
distintos em `globals.css` (`:root` vs. `[data-section]`).

---

## D-50 — O toggle manual "Tabela/Cartões" do catálogo é substituído por troca automática de breakpoint

**Contexto.** Antes do patch "Prisma" (Task 6,
[spec](superpowers/specs/2026-09-02-design-system-prisma-design.md)), a página
`/app/catalogo` tinha um controle manual — um `ButtonGroup` guardado em
`catalog.view`/`viewTable`/`viewCards` (`lib/i18n.ts`) — que deixava o usuário
forçar a visão de tabela ou de cartões em qualquer largura de tela, independente
do viewport. O patch introduziu um novo `components/catalog/MaterialCards.tsx`
e removeu esse controle, substituindo-o por `MaterialCards` e `MaterialTable`
montados lado a lado, cada um escondido no breakpoint do outro
(`sm:hidden` / `hidden sm:block`) — a página escolhe a visão pela largura da
tela, não mais por um clique do usuário.

A remoção não estava pedida no brief da Task 6, que só instruía "encaixar
`MaterialCards` ao lado da tabela" partindo da premissa (falsa) de que nenhuma
visão em cartões existia ainda. A revisão independente confirmou que a leitura
técnica está correta: a spec (§3.1, §3.3) é explícita — "cada um escondido no
breakpoint do outro", "não uma reformatação CSS da mesma marcação" — e um
toggle manual coexistindo com esse par automático produziria uma combinação
quebrada (escolher "Cartões" numa tela larga enquanto o CSS de breakpoint
mantém `sm:hidden` nos cartões). Mas a execução ficou incompleta: uma
funcionalidade de usuário, testada e em uso, foi removida sem que a decisão
fosse registrada — exatamente o tipo de lacuna que este arquivo existe para
fechar (mesmo padrão de D-46/D-48: uma divergência resolvida no código sem
registro é pior que uma exceção documentada).

**Decisão.** Manter a remoção como está — não reintroduzir o toggle manual — e
registrar aqui por que. Auto-troca por breakpoint é o que a spec do redesign
pede para o par tabela/cartões, e as duas visões continuam existindo: nenhuma
informação nem funcionalidade foi perdida, só a forma de acionar cada uma
mudou de um clique do usuário para a largura da janela. `catalog.view`/
`viewTable`/`viewCards` foram removidos de `lib/i18n.ts` sem deixar referência
órfã (confirmado por grep: o único outro `viewTable` no código é
`compare.viewTable`, chave distinta usada por `ComparisonView.tsx`).

**Alternativas descartadas.**
- **Manter o toggle como override por cima do par automático** (a alternativa
  que a revisão apontou como menos destrutiva): tecnicamente viável — o
  controle escolheria qual dos dois `hidden`/`sm:hidden` vale, ignorando o
  breakpoint enquanto ativo — mas reintroduz exatamente a superfície que a
  spec pediu para eliminar (dois mecanismos concorrentes decidindo o que
  aparece), por um ganho que nenhum uso real do catálogo até hoje pediu:
  nenhum teste, ticket ou nota de usabilidade em `docs/` menciona alguém
  precisando forçar tabela numa tela estreita ou cartões numa tela larga.
- **Reverter a remoção e não montar `MaterialCards` lado a lado**: contradiria
  a spec diretamente e desfaria a Task 6 inteira.

**Consequência aceita.** Um usuário que preferia forçar a visão de tabela numa
tela larga estreitada (ex.: janela redimensionada, não um celular) perde esse
controle explícito — a visão passa a seguir só a largura real do viewport.
Não há perda de dado nem de recurso: as mesmas quatro colunas/estados
aparecem nos dois formatos, só a seleção entre eles deixou de ser manual.

## D-51 — O Next 16 traz o Turbopack por padrão; a build continua no webpack, por medição

**Contexto.** S1 (upgrade de segurança) subiu o Next de 14.2.35 para 16.3.4.
A 14.2.35 é a **última versão que a linha 14 recebeu** — os 21 CVEs não tinham
correção dentro do major, então "só aplicar o patch" não era uma opção que
existisse. O Next 16 tornou o Turbopack o bundler padrão e passou a **recusar a
build** quando encontra uma chave `webpack` no `next.config.mjs` sem uma
`turbopack` correspondente.

Essa chave `webpack` não é acessório: é ela que aponta o
`plotly.js/dist/plotly` exigido pelo `react-plotly.js` para
`lib/plotly-custom.ts` — o Plotly montado à la carte que derrubou o maior chunk
de 4,5 MB para 981 KB ([PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) §12). Registre-se
a favor do Next: ele falha **alto**. Ignorar o alias em silêncio teria publicado
a build completa do Plotly sem aviso nenhum, que é a pior versão possível deste
problema.

**Decisão.** Passar `--webpack` explicitamente em `npm run dev`, `npm run build`
e no `webServer` do `playwright.config.ts` — este último invoca `next` direto,
sem passar pelo script, então o flag precisa ser repetido lá ou a suíte E2E roda
num bundler diferente do que a build produz. Um `turbopack.resolveAlias`
equivalente fica no `next.config.mjs` como rede de segurança para quem largar o
flag: com ele, esquecer o `--webpack` custa 16% de chunk, não 350%.

Medido na mesma versão do Next 16, tudo o mais constante:

| bundler | maior chunk | total de JS |
|---|---|---|
| webpack | **980 KB** | 2856 KB |
| turbopack | 1136 KB (+16%) | 2556 KB (−10%) |

Os dois **aplicam** o alias — se não aplicassem, os 4,5 MB estariam de volta. A
diferença é só como cada um fatia os chunks.

**Alternativas descartadas.**
- **Migrar para o Turbopack agora.** O total de JS até melhora 10%, mas o número
  que este projeto defende publicamente é o maior chunk (§12), e ele piora 16%.
  Some-se que o `resolveAlias` do Turbopack não distingue grafo de cliente e de
  servidor, e este alias **precisa** valer só para o cliente: aplicá-lo ao
  servidor quebra o runtime de desenvolvimento com um erro que não reproduz em
  `next build`. Migrar é uma opção real e provavelmente o futuro — mas é
  migração de bundler, com medição própria e verificação ao vivo, não uma linha
  de carona num patch de segurança.
- **Aceitar o Turbopack sem alias** (`turbopack: {}` vazio, só para calar o
  erro): devolveria os 4,5 MB. É exatamente a regressão que §12 documenta ter
  custado trabalho para eliminar.

**Consequência aceita.** O projeto fica atrelado a um bundler que o Next está
deixando para trás: hoje o webpack já exige flag explícita, e um major futuro
pode removê-lo. A dívida está registrada em [TODO.md](TODO.md); quando for paga,
quem decide é a medição acima refeita, não a preferência.

## D-52 — A ferramenta é publicada em Neon + Fly + Vercel, com a API servida pela origem do frontend

**Contexto.** Até esta sessão o `docs/CLAUDE.md` §8 dizia "não há deploy", e o
`docker-compose.yml` com os `Dockerfile.*` eram andaime documentado e nunca
exercitado. O §3.5 da proposta pede a ferramenta *funcionando*, e uma banca não
assiste a um `uvicorn --reload`.

Exercitar o andaime revelou que **nada dele subiria**. Os defeitos não eram de
configuração; eram de coisas que a máquina de desenvolvimento escondia:

- A migração de autenticação forçava `recreate="always"` no `batch_alter_table`
  — contorno de SQLite que no Postgres vira `DROP TABLE`, recusado porque duas
  tabelas têm chave estrangeira para `selection_study`. E a correção óbvia
  (`recreate="auto"`) seria **pior**: passaria verde deixando a `UNIQUE(name)`
  antiga viva, com o nome do estudo globalmente único em vez de único por
  projeto.
- `psycopg` não estava declarado em lugar nenhum, embora o compose já usasse
  `postgresql+psycopg://`.
- O `requirements.txt` tinha derivado em silêncio: sem `google-auth` — o login —,
  `httpx`, `python-pptx` nem `charset-normalizer`. Uma imagem construída a
  partir dele quebrava no import.
- `NEXT_PUBLIC_API_URL` chegava como variável de runtime, mas o Next substitui
  `NEXT_PUBLIC_*` **durante o build**: a imagem saía apontando para
  `localhost:8000`.

**Decisão.** Postgres no **Neon**, API no **Fly.io**, frontend na **Vercel** —
os três em plano gratuito, com `sa-east-1`/`gru` para ficar perto de quem
apresenta. As migrações rodam no `release_command` do `fly.toml`, num contêiner à
parte, **antes** de a versão nova receber tráfego; se falharem, o deploy aborta e
a versão anterior continua servindo.

**E a API é servida pela origem do frontend**, por `rewrites()` no
`next.config.mjs`. Esta é a parte que mais mexeu no código, e a razão é o
cookie: com `…vercel.app` chamando `…fly.dev` o navegador considera as duas
metades sites diferentes, e um cookie `SameSite=Lax` **não viaja** nas chamadas
`fetch`. O sintoma seria cruel — o login grava o cookie, toda requisição
seguinte volta anônima, e **nada aparece em log nenhum**.

Três consequências que não são detalhe de configuração:

1. **O callback do OAuth também passa pelo proxy**, e é isso que grava o cookie
   no domínio do frontend. Por isso `BACKEND_BASE_URL` na API é a URL do
   **frontend**, e é essa que se registra no Google.
2. **`NEXT_PUBLIC_API_URL` vazio é valor com significado, não ausência.**
   `lib/api.ts` usa `??`, então `""` produz chamadas relativas; trocar por `||`
   trataria `""` como ausente e mandaria o site publicado falar com o
   `localhost` de quem o abrisse.
3. O `rewrites()` é **condicional**: sem `API_PROXY_TARGET` não há reescrita, e
   o desenvolvimento local e a suíte E2E seguem falando direto com a API.

**Alternativas descartadas.**

- **`SameSite=None`**: resolveria transformando-o em cookie de terceiros —
  bloqueado pelo Safari por padrão e em descontinuação no Chrome. Um avaliador
  abrindo pelo iPhone não entraria. O campo `SESSION_COOKIE_SAMESITE` existe,
  com validador que recusa `none` sem `Secure`, mas o padrão é `lax`.
- **Domínio próprio com `app.` e `api.`**: resolve na origem e dispensa o proxy.
  É o caminho a seguir se um dia houver domínio — e por isso o `rewrites()` é
  condicional, não incondicional.
- **Deploy por terminal**: o operador deste projeto não tem shell disponível.
  Dois workflows de `workflow_dispatch` fazem o deploy e as operações de banco
  pelo navegador (13-deploy.md §5-bis). Num repositório público isso obriga: só
  disparo manual, nenhum gatilho de fork, e entrada de usuário por `env` e nunca
  interpolada dentro do `run:`.

**Consequência aceita.** Todo o tráfego da API passa pela borda da Vercel, o
que acrescenta um salto de rede. É o preço de não depender de política de cookie
de terceiros.

**Duas armadilhas que só o deploy real revelou**, ambas com a mesma assinatura —
o job fica **verde** e a aplicação não funciona:

- **App sem endereço público.** O `<app>.fly.dev` só existe no DNS enquanto o
  app tem IP, e o `flyctl deploy` só aloca um sozinho quando o app ainda não tem
  máquinas. Um app criado pelo painel chega ao primeiro deploy com máquinas de
  pé e nenhum endereço: o deploy passa, os health checks passam, o flyctl imprime
  "Visit your newly deployed app at …" — e o navegador devolve `NXDOMAIN`.
- **`flyctl ips allocate-v6` não é idempotente.** Ele aloca **outro** endereço a
  cada chamada, em silêncio e com sucesso. Um passo escrito como
  `allocate-v6 || true` acumulava um IPv6 por deploy.

O passo "Garantir endereço público" do `deploy-api.yml` conta antes de alocar e
**falha o job** se ao final não houver endereço público. Essa asserção é a lição
das duas: num passo de deploy, verde sem verificação é pior que vermelho.

---

## D-53 — O mapa de seleção entra nos documentos exportados, com os eixos lidos do índice

**Contexto.** `app/exporters/figures.py` sempre teve `render_scatter` — pontos,
envelopes de classe, linha de iso-índice, escala log. Ele foi escrito na Fase 9,
tem teste, e **nenhuma exportação o chamava**: só `render_bars` estava ligado,
no gráfico de barras do laudo (D-41). O documento que a metodologia de Ashby
produz sem o mapa é uma tabela de números; o mapa é onde o argumento acontece.

**Decisão.**

- **O relatório de seleção e o laudo carregam o mapa.** `Report.figure` (um SVG)
  virou `Report.figures` (uma lista), porque um documento de seleção tem mais de
  uma figura e a ordem é a ordem da leitura: o mapa é o argumento, o ranking é a
  conclusão. CSV e XLSX seguem ignorando figuras — não é escolha, é o formato.
- **O relatório leva só o mapa; o laudo leva mapa e ranking.** A D-41 distingue
  os dois documentos, e o gráfico de barras continua sendo marca do laudo. O
  mapa é de ambos porque sem ele o relatório de seleção não mostra seleção
  nenhuma.
- **Os eixos saem da expressão do índice, na ordem em que ela os nomeia.**
  `sqrt(modulo_young) / densidade` desenha módulo contra densidade — que é como
  a figura aparece na literatura, e não por acaso: é exatamente nesse par que o
  índice é uma reta. Um estudo sem índice, ou cujo índice nomeie uma
  propriedade só, **não tem plano onde ser desenhado**: o mapa é omitido, nunca
  substituído por um par arbitrário que o catálogo oferecesse.
- **A geometria não é calculada aqui.** O mapa vem de
  `ChartService.property_map`, a mesma chamada que `/api/charts/property-map`
  serve à tela. Reimplementar a projeção no exportador criaria duas verdades
  sobre a mesma figura — exatamente o que o ADR 0004 existe para impedir.
- **A linha passa pelo líder do ranking** (`index_level_material_ids`), porque é
  isso que torna o desenho um *mapa de seleção* e não um gráfico de dispersão:
  tudo do lado favorável da linha supera o primeiro colocado no índice.
- **Falhar a figura nunca falha a exportação.** Uma propriedade sem valores
  plotáveis, ou um índice sem contorno reto, omite o mapa e diz por quê na
  legenda. O leitor pediu o relatório, não a figura.

**Um defeito que só apareceu ao ligar.** A linha de iso-índice é resolvida sobre
o *intervalo do eixo*, não sobre os dados, e legitimamente sai do quadro. O
`maps()` do renderizador pergunta se um valor é representável na escala, não se
ele cai dentro da moldura — então a linha era desenhada por cima dos rótulos de
eixo e do título, com um endpoint em `y = -61,8` num `viewBox` que começa em 0.
Invisível enquanto `render_scatter` não tinha chamador. Corrigido com um
`clipPath` sobre a área de plotagem.

---

## D-54 — O envelope de classe é uma nuvem, e a nuvem é indicativa

**Contexto.** A [D-53](#d-53) pôs o mapa nos documentos exportados, e ele saiu
**sem envelope nenhum**: um fecho convexo precisa de três pontos, e no catálogo
semeado quase toda classe tem um ou dois materiais. O mapa virou um gráfico de
dispersão — e a vitrine pública (`components/marketing/AshbyPreview.tsx`)
prometia, num SVG desenhado à mão, as nuvens que o produto não desenhava.

O pedido do autor foi explícito: aproximar do que o Ansys Granta EduPack gera.

**Decisão.** O envelope elíptico do B6 passa a aceitar dois ajustes, ambos
desligados por padrão — quem quiser a elipse *limitante* de antes continua
recebendo exatamente ela:

- **`pad`** (1,18) afasta os dois semi-eixos do centro. Uma mancha que encosta
  no material mais externo é lida como fronteira; com um pouco de ar, é lida
  como família — que é o que o gráfico afirma.
- **`min_semi_axis`** (5,5% da extensão do que está plotado) dá piso a cada
  semi-eixo. Sem ele, uma classe com um material é um ponto e uma com dois é um
  segmento: invisíveis como famílias, e é assim que quase toda classe se
  apresenta num catálogo didático.

As duas constantes são **relativas à extensão do desenho**, então significam a
mesma coisa em escala log (onde a extensão está em décadas) e linear, com cinco
materiais ou quinhentos.

**A nuvem é indicativa, e isso é dito onde ela é lida.** Ambos os ajustes
*alargam* a região desenhada além dos materiais que ela contém — a mancha deixa
de ser a afirmação "a classe ocupa exatamente esta área". A legenda da figura
diz isso em português, e o rótulo do controle em `/mapas` deixou de ser "Elipse
ajustada" para ser **"Nuvem da classe"**. Não é firula: é a mesma regra que
proíbe renderizar ausência como zero — uma figura não pode afirmar mais do que
foi medido sem avisar.

**O fecho convexo continua literal.** Ele responde a outra pergunta — *qual
região exatamente estes materiais ocupam* —, e respondê-la com folga nas bordas
seria responder errado. Nenhum `pad` é aplicado a ele, e há teste para isso.

**A nuvem é o padrão nas duas superfícies**: o mapa exportado pede `ellipse`, e
`/app/mapas` abre nela, com o fecho a um clique. O padrão é o que o leitor
reconhece como um mapa de Ashby; o fecho é a escolha de quem sabe por que a
quer.

**Observação medida, não corrigida.** O piso vale no espaço de dados, então uma
classe de um material vira um círculo *em décadas* — que na tela aparece
esticado quando os dois eixos não cobrem o mesmo número de décadas por pixel. É
honesto (igual em ambas as direções na unidade que o eixo mede) e legível;
arredondá-lo na tela exigiria pisar em coordenadas de pixel dentro do que hoje é
cálculo, e o ADR 0004 é claro sobre onde isso pertence.

---

## D-55 — A busca do catálogo ganha linguagem de consulta, com analisador próprio

**Contexto.** A busca era `LIKE '%termo%'` sobre nome, classe e palavra-chave.
O fluxo de referência de uma ferramenta de seleção oferece `AND`, `OR`, `NOT`,
busca por frase, parênteses e curingas, e insere `AND` entre termos soltos — e
essa é a porta de entrada da ferramenta, a diferença mais visível entre "lista
de materiais" e "plataforma". Ver [14-plataforma-selecao.md](14-plataforma-selecao.md).

**Decisão.**

- **Analisador próprio em `app/domain/search_query.py`**, não um motor de busca.
  O catálogo cabe em três colunas indexadas e responde em microssegundos; uma
  dependência que precisa ser implantada, versionada e mantida em sincronia com
  o dado canônico seria **uma segunda verdade sobre quais materiais existem**.
  A árvore que o analisador produz sobrevive à troca: quando o catálogo crescer,
  só o compilador muda.
- **`AND` é o padrão entre termos soltos.** Duas palavras digitadas juntas
  significam "as duas", não "qualquer uma". É a única decisão aqui que muda
  resultado em silêncio, e por isso tem teste próprio.
- **`AND` liga mais forte que `OR`.** `a OR b AND c` é `a OR (b AND c)`; ler ao
  contrário descartaria registros que o usuário pediu.
- **Termo sem curinga casa como subcadeia**, então digitar `inox` continua
  achando `Aço inox 304`. O curinga é como se pede precisão, não o padrão.
- **Curinga à esquerda é recusado.** Um padrão que começa com `*` não usa índice
  e varre a tabela inteira; recusar é mais gentil que uma busca que parece
  travar quando o catálogo crescer.
- **O que o usuário digitou é escapado antes de virar padrão.** Um `%` em
  `100%` é literal e não pode transformar o resto da consulta em curinga.
- **Consulta malformada é 400 com a razão, nunca 500.** `SearchQueryError` vira
  `ValidationError` no serviço, e a mensagem nomeia **o que quebra primeiro**:
  em `(polímero OR`, o operador sem termo, não o parêntese — apontar o
  parêntese mandaria o leitor consertar a ponta errada da consulta.

A interface declara os operadores na dica do campo, ligada por
`aria-describedby`: uma linguagem de consulta que ninguém descobre não existe.

---

## D-56 — A seleção é uma pilha ordenada de estágios

**Contexto.** `SelectionStudy` carregava *uma* árvore de restrições, *um*
índice, *um* método. A análise de lacunas ([14-plataforma-selecao.md](14-plataforma-selecao.md))
apontou isso como o gargalo arquitetural P0-1: tudo que a metodologia faz
combinando estágios — um estágio de limites estreitando o que um de classes
admitiu, desabilitar o estágio 2 para ver o efeito, apagar o 3 e manter os
outros — não tinha onde morar, e os módulos E, F, G, H ficavam sem encaixe.

**Decisão.**

- **`SelectionStage` é entidade de primeira classe**, ordenada por `position`,
  e o resultado é a **interseção dos estágios habilitados**. Migração aditiva
  com backfill: cada estudo existente vira um estágio `limit` habilitado na
  posição 0, dono do grupo raiz que o M6 já lhe dera. Estudo salvo antes disso
  avalia exatamente como antes.
- **`enabled` é coluna, não exclusão.** Desligar e religar um estágio é *como*
  se vê o efeito de um critério; um estágio apagado para tentar isso teria de
  ser redigitado. E um estágio desligado ainda reporta **quantos admitiria
  sozinho**, que é precisamente a pergunta que desligar faz.
- **Dois tipos de estágio, e um estágio é uma pergunta só.** `limit` carrega a
  árvore AND/OR do M6; `tree` carrega uma seleção de pastas da taxonomia.
  Enviar os campos do outro tipo é **recusado**, não ignorado — descartar em
  silêncio um filtro que o usuário escreveu é a forma exata do bug "por que
  minha seleção não estreita".
- **O estágio de classes anda a hierarquia; `in_class` não.** `in_class`
  compara o slug da própria classe, então marcar um galho não admite material
  nenhum — todo material mora numa folha. `include_descendants` (padrão) é o
  que torna a hierarquia navegável, e desligá-lo devolve o pertencimento exato
  para quem quer exatamente isso. Os dois continuam existindo porque respondem
  a perguntas diferentes.
- **Retrocompatibilidade é do funil, não só do resultado.** Com **um** estágio
  o funil plano sai idêntico ao de antes — sem prefixo, sem linha extra. Com
  mais de um, cada linha nomeia seu estágio, ou um passo do estágio 1 e um do
  estágio 3 ficariam indistinguíveis.
- **`RunResultOut.combinator` diz a verdade ou "AND".** Com um estágio de
  limites é o operador do grupo raiz, como sempre; com mais de um é "AND",
  porque é assim que estágios se combinam — reportar o "OU" interno de um
  estágio descreveria a pilha como algo que ela não é. `stages` é a verdade
  completa nos dois casos.
- **Pilha vazia não existe.** Nem no banco (todo estudo tem ao menos um
  estágio), nem na API (`stages: []` é 400), nem na tela (o último estágio não
  pode ser removido). Um estudo cujas linhas descrevem estágio nenhum **degrada**
  para um estágio sobre a árvore inteira, em vez de admitir o catálogo todo em
  silêncio.

**Consequência que não estava no pedido.** `StudyOut` devolvia as restrições de
um estudo aninhado como lista plana — reabrir o estudo perdia os parênteses, e o
M6 deixou isso anotado em código como lacuna conhecida. `StageOut.root_group`
devolve a árvore de verdade, e a tela a reconstrói: a lacuna fechou porque a
leitura por estágio precisava da estrutura de qualquer jeito.

**E o que os documentos passaram a dizer.** A linha "Combinação das restrições"
do relatório e do laudo virou **"Lógica da seleção"** e descreve a pilha inteira;
`describe_root_group` (que renderizava só o primeiro grupo raiz e teria
descartado os demais) virou `describe_pipeline`. Há uma seção **"Estágios"**
nos dois documentos, sempre presente: um documento de auditoria cujas seções
aparecem e somem conforme a forma do estudo é mais difícil de ler que um que
sempre responde às mesmas perguntas.

**Método.** `app/tests/test_migration_selection_stage.py` roda a migração de
verdade, nos dois sentidos, contra um banco temporário que já contém um estudo
com grupo raiz, grupo aninhado e restrição — o M6 registrou que seu backfill foi
"verificado à mão" por não haver precedente; agora há. Conferido por mutação:
quebrando o `UPDATE` do backfill, os cinco testes falham no travamento do NOT
NULL, exatamente onde um banco de produção quebraria.

---

## D-57 — Existe um segundo universo, e o estágio de árvore é uma junção entre tabelas

**Contexto.** O catálogo tinha **um** universo: materiais. Um estágio de árvore
só podia ser "filtre por pasta da taxonomia de materiais", e a pergunta que o
método de Ashby realmente faz — *que materiais este processo conforma*, *que
processos unem estes materiais* — não tinha onde ser feita. A análise de lacunas
([14-plataforma-selecao.md](14-plataforma-selecao.md)) apontou isso como o
gargalo P0-2, e o exercício 9 do manual é literalmente esse cruzamento.

**Decisão.**

- **`ProcessClass`, `Process` e `material_process`.** A taxonomia de processos
  tem exatamente a forma de `MaterialClass` — hierárquica, dirigida por dado —,
  e o vínculo é uma associação N–N com chave composta.
- **A família do processo é a raiz da taxonomia, não uma coluna enum.**
  Conformação, União e Tratamento de superfície são dado semeado. Assim um
  operador acrescenta família sem migração, `app/domain/taxonomy.py` é
  reaproveitado sem uma linha nova, e não existe uma segunda verdade capaz de
  discordar da árvore de classes.
- **A associação não carrega propriedade nenhuma.** Um vínculo diz "este
  processo se aplica a este material". Qualquer número sobre o par (faixa de
  espessura, custo por peça) é propriedade *do par* e precisaria do mesmo
  aparato de proveniência de `MaterialPropertyValue` — valor original, unidade,
  normalizado, fonte, qualidade. Inventar um número solto ali violaria o
  princípio 1, então o vínculo continua vínculo; no dia em que o par precisar de
  números, ganha tabela própria com proveniência.
- **Um terceiro tipo de estágio, `process`, e não um subdiscriminador do
  `tree`.** A regra do D-56 continua valendo sem exceção: um estágio é uma
  pergunta só, e enviar os campos de outro tipo é **recusado**, nunca ignorado.
  Três tipos, três conjuntos de campos, três recusas.
- **Duas listas, não uma:** `process_slugs` (folhas) e `process_class_slugs`
  (pastas). Um slug de processo e um slug de classe de processo são namespaces
  diferentes, e uma lista só deixaria o leitor adivinhando qual tabela cada
  entrada nomeia. `include_descendants` vale para as pastas, como no estágio de
  classes.
- **Semântica de "algum", não de "todos".** Um material passa quando *algum*
  processo selecionado se aplica a ele. "Soldável **e** forjável" são dois
  estágios, e a pilha do P0-1 já os intersecta — dizer isso duas vezes criaria
  duas formas de expressar a mesma coisa, uma delas fadada a divergir da outra.
- **Ausência não passa.** Material sem processo vinculado **não** sobrevive a um
  estágio de processo, pela mesma regra da restrição numérica: não se seleciona
  sobre dado que não se tem. E processo inativo não admite ninguém, mesmo com o
  vínculo ainda no banco.
- **A ancestralidade do processo mora no snapshot do material**, em
  `ProcessReach(process_slug, class_path)`. Assim casar uma pasta de processo
  continua sendo uma pergunta local sobre um snapshot — exatamente o que
  `class_lineage` fez pela pasta de material — e o domínio segue sem conhecer a
  taxonomia. A alternativa, passar o mapa de classes por `apply_stage`, enfiaria
  uma tabela de consulta em três assinaturas para responder a mesma coisa.

**O que os documentos passaram a dizer.** A planilha "Estágios" nomeia o tipo
novo ("Processos"), e a "Lógica da seleção" descreve a seleção por extenso, com
os nomes de exibição e a palavra **"algum de"** dita em voz alta — um leitor que
assumisse conjunção leria a lista de candidatos errado.

**Um defeito real que só apareceu lendo o documento renderizado**, não a
asserção: a linha do funil de um estágio de processo reportava o operador
`in_tree`, ou seja, afirmava que a seleção havia filtrado por classe de
material. Virou `in_process`, com `in_tree` preservado literalmente para que o
funil de um estudo anterior leia igual.

**E a ficha do material ganhou os processos compatíveis**, no próprio payload da
ficha e não atrás de um segundo endpoint: ler a ficha é ler a junção. Fecha
parte da lacuna do Datasheet que a matriz aponta.

**O que isto ainda não é.** O exercício 11 do manual seleciona **processos** como
resultado — o universo de saída é a tabela de processos, não a de materiais.
O P0-2 faz o sentido do exercício 9; o sentido inverso é peça distinta, e está
registrada como o próximo item do roteiro (P0-3).

**Método.** `app/tests/test_migration_process_universe.py` roda a migração de
verdade, nos dois sentidos, contra um banco que já contém um estudo com dois
estágios; conferido por mutação — sem o backfill, os cinco testes falham no
travamento do NOT NULL, exatamente onde a produção quebraria. O universo do
seed é fictício e marcado (`is_demo`), e o que é inventado ali é a
**compatibilidade**, dito no próprio arquivo: os nomes dos processos são
vocabulário corrente de manufatura, domínio público da metodologia.

---

## D-58 — O estudo escolhe o universo do resultado, e o motor é um só

**Contexto.** Todo estudo devolvia **materiais**. O exercício 11 do manual do
EduPack seleciona **processos**: a tabela de resultado é o universo de processos,
e um estágio alcança o de materiais ("Insert Material Universe > Polymers >
Thermoplastic"). O P0-2 fez o sentido do exercício 9; este é o inverso.

**Decisão.**

- **`SelectionStudy.universe` é coluna, não inferência a partir dos estágios.**
  Uma pilha de um único estágio de limites não nomeia universo nenhum, e
  inferir deixaria o resultado dependendo de qual estágio o leitor escreveu
  primeiro.
- **Um motor só.** `RecordSnapshot` é a forma compartilhada de um registro
  selecionável, e `MaterialSnapshot`/`ProcessSnapshot` são o que cada universo
  acrescenta. Nada do que o motor faz — avaliar restrição, casar linhagem de
  classe, contar num funil — é sobre *material*; é sobre *um registro com uma
  classe e alguns valores*. Um segundo motor criaria duas verdades sobre a mesma
  pergunta.
- **`tree` anda o universo do próprio estudo; a travessia nomeia o outro.**
  Daí `process` num estudo de materiais e `material` num de processos, cada um
  com as suas colunas. Qual taxonomia valida um `class_slugs` decorre do
  universo, **não do nome do campo**, que é o mesmo nos dois — foi exatamente
  aí que dois defeitos apareceram (404 em slug legítimo; o documento imprimindo
  slug cru no lugar do nome da família).
- **O estágio inverso leva só pastas.** `material` não tem slug para nomear uma
  folha, e o próprio exercício seleciona uma pasta. Inventar um identificador
  seria schema a mais para uma pergunta que o manual não faz.
- **Ranqueamento e índice são recusados num estudo de processos, com o motivo
  escrito** — e **no salvamento**, não só na execução. Processo não tem atributo
  com proveniência; devolver ranking vazio seria lido como "nenhum processo
  pontuou bem" em vez de "isto não é calculável". Estudo que não roda não vale
  guardar, e descobrir depois é pior.
- **`CandidateOut.material_id` virou `record_id`.** Num estudo de processos
  aquela linha *é* um processo, e um campo com o nome de um universo carregando
  o id do outro é a mesma classe de mentira que o `in_tree` do funil era
  ([D-57](DECISIONS.md)). Os tipos de ranking mantêm o nome de propósito: um
  estudo de processos não ranqueia, então eles comprovadamente nunca descrevem
  um processo. Quando os atributos chegarem, o rename acompanha a mudança que o
  motiva.

**O defeito mais grave, e ele era silencioso.** O exportador resolvia os ids
dos candidatos contra a tabela de **materiais**. Num estudo de processos isso
não devolveria vazio — devolveria o material que por acaso carrega aquele id, e
imprimiria a proveniência dele sob o nome de um processo. Num documento cuja
razão de existir é ser auditável, é a pior falha disponível. A busca não
acontece para o outro universo, e há teste afirmando que nome de material nenhum
aparece no documento.

**O que o documento passou a dizer.** O universo do resultado é declarado; a
coluna dos candidatos é nomeada pelo que contém; a seção de proveniência diz
por que está vazia; e a razão de não haver mapa nem ranqueamento fica onde o
leitor procuraria a figura. Na tela, o controle de universo vem **antes** dos
estágios, porque é ele que decide quais estágios existem, e só a travessia que
se aplica é oferecida — o outro botão teria como único desfecho a recusa do
backend.

**O que isto ainda não é.** O passo 2 do exercício 11 é um Limit Stage sobre
**atributos do processo** (*Shape*, *Mass range*, *Range of section thickness*,
*Process characteristics*, *Economic batch size*). Isso exige atributo com a
mesma proveniência de `MaterialPropertyValue` — e, para os dois primeiros,
suporte a valor **discreto** e a **intervalo**, que o modelo atual só tem em
parte. É peça do tamanho do P0-2, está registrada como **P0-4**, e é ela que
destrava o ranqueamento de processos.

**Método.** `app/tests/test_migration_selection_universe.py` roda a migração nos
dois sentidos contra um banco com estudos salvos, e afirma que o backfill grava
`"material"` porque é o que esses estudos **fazem** — não porque seja um padrão
conveniente. Conferido por mutação. Dois dos quatro defeitos desta frente foram
achados **lendo o documento renderizado**, não a asserção.

---

## D-59 — Processo tem atributo, e o envelope de capacidade é comparado por alcance

**Contexto.** Até aqui um processo era nome, família e vínculos. O passo 2 do
exercício 11 do manual é um Limit Stage sobre atributos do processo — forma,
faixa de massa, espessura de seção, característica do processo, lote econômico —
e nenhum existia. Era também a razão escrita pela qual um estudo de processos
recusava ranqueamento ([D-58](DECISIONS.md)).

**Decisão.**

- **Tabelas próprias, não uma coluna `universe` em `PropertyDefinition`.** Mesmo
  raciocínio que deu `ProcessClass` ao universo de processos ([D-57](DECISIONS.md)):
  `property_definition` é lida pelo seletor de propriedade, pelos eixos do
  gráfico, pelo painel e pelo avaliador de índices, e um único descuido ofereceria
  "faixa de massa" como propriedade de material. A forma é compartilhada
  **copiando** a forma, não a linha — e `app/calculations/units.py` e
  `app/domain/data_quality.py` são reaproveitados intocados, que é onde o risco
  real de duplicação estava.

- **`ProcessAttributeKind` é load-bearing, diferente de
  `PropertyDefinition.is_interval`.** O motor compara por regras distintas, então
  o tipo tem de ser legível a partir da definição, antes de existir valor algum:
  a interface desenha o editor a partir dele, e o relatório precisa dizer por qual
  regra o número foi comparado. Uma `CheckConstraint` no banco garante que
  atributo discreto não tem unidade e atributo numérico não fica sem ela — uma
  definição com as duas coisas, ou com nenhuma, deixaria todo valor abaixo dela
  ilegível.

- **O envelope de capacidade é comparado por alcance, e isso *não* é a regra do
  intervalo de material.** Um aço de módulo 200–210 GPa tem *um* módulo
  verdadeiro ali dentro, e o ponto médio o representa. Um processo que conforma
  peças de 0,1 a 10 kg consegue de fato qualquer massa da faixa, então "≥ 5 kg" é
  atendido quando a faixa **alcança** o valor. São dois dados diferentes — e é a
  diferença no dado, não na fórmula, que justifica regras diferentes. O teste
  `test_the_midpoint_rule_would_have_rejected_a_reachable_envelope` mostra o caso
  que a alternativa erraria: envelope 0,1–4 kg alcança 3 kg, o ponto médio (2,05)
  não. `BETWEEN` sobre envelope é **sobreposição**, não contenção.

  **Consequência obrigatória:** a diferença tem de chegar ao leitor. O rótulo
  gerado de uma restrição sobre envelope diz "(alcance do envelope)", e a folha de
  proveniência tem coluna **Tipo de valor** mais a nota da regra. Diferença
  semântica que o leitor não vê é a única coisa que este motor existe para não
  produzir.

  Aplicar semântica de envelope ao **intervalo de material** é item próprio, não
  efeito colateral deste: moveria toda contagem de funil existente.

- **Discreto é pertinência a conjunto, com vocabulário fechado.**
  `HAS_ANY_LABEL`/`HAS_NO_LABEL`, e o operador negativo **não** libera ausência:
  um processo sem `forma` cadastrada não é "um processo cuja forma não é maciça",
  é um processo cuja forma ninguém escreveu — pedir ausência é o que
  `NOT_EXISTS` faz. Vocabulário fechado pela mesma razão que uma classe tem slug:
  duas grafias não podem virar duas capacidades, e rótulo fora do vocabulário é
  404 nomeando o rótulo, nunca zero resultado que pareceria "nenhum processo tem
  essa capacidade".

- **O envelope vive em dois mapas do snapshot, de propósito.** Os limites em
  `envelopes`, que é contra o que um limiar é comparado; o `normalized_value` em
  `values`, que é o número que um ranqueamento ou um índice lê. Não são duas
  verdades — ponto representativo é o que `normalized_value` sempre significou —
  e o motor prefere o envelope ao filtrar. Deixá-lo fora tornaria inranqueável
  todo atributo com faixa, o que é propriedade do mapa em que ele foi arquivado,
  não do dado.

- **A recusa de D-58 foi retirada, não reescrita.** Ela dizia "processo não tem
  atributo cadastrado, e a ferramenta não inventa valor", e era verdade. O que se
  recusa agora é mais estreito e continua declarado: atributo inexistente (404
  nomeando, o que também prova que o catálogo é por universo — `densidade` não
  existe num estudo de processos) e atributo **discreto** onde se exige magnitude,
  como critério de ranqueamento (um rótulo não é melhor que outro) e dentro de
  expressão de índice (recusado pelo nome, em vez do erro de dimensão que a
  unidade NULL produziria depois).

- **`material_id` virou `record_id` em ranking e índice**, exatamente como D-58
  anunciou que aconteceria "quando os atributos chegarem": agora um estudo de
  processos ranqueia, então aquelas linhas de fato carregam id de processo.

**Método.** Dois defeitos reais apareceram, e nenhum dos dois por asserção que
falhou:

1. **Um estágio de limites num estudo de processos resolvia seus slugs contra o
   catálogo de materiais.** "densidade ≥ 1000" era aceito, o limiar convertido, e
   o estágio então não admitia ninguém — porque o snapshot de processo não tinha
   valor nenhum. Zero resultado sem explicação é a pior resposta disponível.
2. **A interpretação dizia "Partindo de 13 materiais" numa seleção de
   processos** — achado lendo o laudo renderizado. É a camada de IA afirmando algo
   que o resultado determinístico não diz, e a mesma palavra chegava ao prompt de
   um provedor real. `ResultContext.universe` é campo obrigatório, sem padrão que
   pudesse mentir por omissão.

E um terceiro que habilitar o ranqueamento criou: o mapa do laudo é desenhado por
`ChartService.property_map`, que lê o catálogo de materiais e recebe os ids
ranqueados para destacar. Os eixos são filtrados contra as propriedades de
material, o que barra o caso comum — mas slug é único por tabela, então nada
impede um atributo de processo chamado `densidade`, e aí os eixos resolvem. Sem o
guard de universo o laudo de uma seleção de processos imprime "Liga Alumínio Demo
A": há teste que constrói a colisão de propósito e falha sem o guard.

A migração `d4a8c1f70b93` é a primeira aditiva **sem backfill**, e é honesto que
seja: a informação é nova, processo sem atributo continua sem, e a regra de não
selecionar sobre dado ausente dá a resposta certa sem inventar nada. Conferida por
`compare_metadata` e por mutação — sem a `CheckConstraint`, dois testes falham. A
`e6c3f45a91d8` acrescenta `selection_constraint.labels` no molde de sempre.

---

## D-60 — O gráfico passa a reprovar, e a região de um plano é um critério

**Contexto.** O manual usa o gráfico três vezes: para mostrar, para desenhar uma
caixa em torno dos candidatos, e para deslizar a linha de índice até isolá-los.
Aqui ele só mostrava. A matriz de maturidade registrava o Chart Stage em nível 1
desde que foi escrita, e ele era o único dos três tipos de estágio do método que
faltava — o P0-1 deixou explicitamente "onde encaixar".

**Decisão.**

- **Nada disso é geometria, e a linha é o caso que parece ser.** O lado favorável
  de um contorno iso-índice é exatamente uma comparação sobre o valor do índice:
  `índice ≥ nível` quando se maximiza, `≤` quando se minimiza. É o que
  `ChartService._draw_levels` já faz para computar `superior_material_ids` e
  *desenhar* a linha. Manter a regra como comparação é o que faz a figura e o
  funil concordarem por construção, em vez de por coincidência — e é a leitura de
  ADR 0004 aplicada a um estágio: o que o cliente manda é a decisão em
  coordenadas de dados, nunca pixels.

- **O que o estágio acrescenta ao Limit Stage é um só, e é real.** Um estágio de
  limites nomeia **slug de propriedade**, então não alcança quantidade derivada.
  "Todo material cujo E^(1/2)/ρ bate este" não são quatro limiares sobre duas
  propriedades — é um limiar sobre uma combinação delas, e é aqui que passa a ser
  expressável. A caixa sozinha *são* quatro limiares, e a documentação diz isso;
  o que ela carrega além disso é o **plano em que a decisão foi desenhada**.

- **Registro que não pode ser posto no plano nunca passa** — mesmo onde a caixa
  não põe limite naquele eixo, e mesmo sem caixa nenhuma. Não é a regra que um
  limiar daria: um limiar só rejeita o que consegue comparar. A diferença é
  deliberada, porque o critério é "dentro desta região deste plano", e registro
  sem coordenada não é desenhado no plano. Se o leitor não o vê na figura, ele
  não pode estar no resultado — o que torna um estágio de gráfico sem caixa e sem
  linha uma coisa com sentido: "tem de ser plotável aqui".

- **Um envelope entra pelo ponto representativo, e um Limit Stage o compara por
  alcance.** Duas regras para o mesmo atributo, de propósito: o ponto
  representativo é o único ponto que o mapa desenha, e alcance é o que responde a
  "este processo consegue esta massa" ([D-59](DECISIONS.md)). O teste
  `test_the_same_envelope_reads_one_way_on_a_plane_and_another_under_a_limit`
  fixa a diferença — mesmo atributo, mesmo limiar, um estágio admite e o outro
  não —, e a obrigação que o D-59 assumiu vale igual aqui: o documento diz qual
  regra rodou.

- **`RecordSnapshot.derived` é um quarto mapa, separado de `values`.** A
  proveniência é outra: um número em `values` foi cadastrado e convertido por
  alguém e se rastreia até uma fonte; um em `derived` foi derivado desses por uma
  expressão que o estudo nomeia. Arquivado sob o texto da própria expressão, então
  dois estágios que nomeiam o mesmo índice compartilham um número. Preenchido pelo
  **serviço** antes de o motor ver o registro, igual a um limiar ser convertido
  antes de chegar lá: o domínio compara números e nunca avalia expressão.
  `_fill_derived` roda dentro de `_apply_stages`, a porta única por onde todo
  caminho de execução passa, o que torna "esqueci de calcular" impossível em vez
  de silenciosamente errado.

- **Cada eixo é *ou* propriedade cadastrada *ou* expressão, em duas colunas e não
  uma.** Slug e expressão são espaços de nomes diferentes que se sobrepõem:
  `densidade` também é expressão válida, e o que o leitor quis dizer não se
  infere da string. Uma `CheckConstraint` faz o banco concordar — exatamente um
  dos dois por eixo —, guardada por `kind <> 'chart'` porque os outros quatro
  tipos deixam essas colunas NULL. Essa guarda é *load-bearing*: sem ela a
  própria migração não roda, porque os estágios já gravados violam a checagem no
  instante em que o `batch_alter_table` recria a tabela.

- **Toda coluna da caixa nasce anulável e fica anulável.** NULL quer dizer "sem
  limite", e `0` é um limite. Uma caixa aberta de um lado é coisa que se desenha
  — "tudo acima de 100 GPa" não devia ter de inventar um teto —, então limite
  ausente e limite zero têm de continuar distinguíveis, do banco até a tinta. Na
  figura, o lado aberto é desenhado indo até a borda do gráfico, e a legenda diz
  que isso não é um limite; na interface, o campo é uma **string**, porque
  `Number("")` é `0` e um campo em branco que virasse zero estreitaria uma
  seleção que ninguém estreitou.

- **O nível da linha é um número, não "a linha que passa pelo material 7".**
  Deslizar a linha até encostar num registro é como o leitor *encontra* o nível,
  mas guardar o registro moveria a linha toda vez que o dado dele mudasse — e um
  estudo salvo tem de reexecutar para a mesma resposta. É a mesma regra do D-35
  vista de outro ângulo.

- **O documento redesenha o plano em que a decisão foi desenhada.** Quando o
  estudo tem um estágio de gráfico habilitado, os eixos do mapa saem **dele** e
  não da expressão do índice: o leitor escolheu aquele par. Estágio desabilitado
  não escolhe o plano, porque não moldou o resultado. A geometria continua vindo
  de `ChartService.property_map`, a mesma chamada que serve a tela; o que o
  estágio acrescenta ao pedido são os eixos, o destaque e o nível guardado.
  Linha sobre eixo que já é índice **não é traçada e o documento declara isso** —
  `property_map` recusa a sobreposição, e desenhá-la exigiria um segundo
  significado para o mesmo eixo.

- **Não há seletor de unidade na caixa**, ao contrário do limiar de uma
  restrição. Um limiar é digitado por quem escolhe a unidade; estes números são
  lidos de um eixo que o `ChartService` já desenha em unidade canônica, e um
  seletor ofereceria uma conversão que ninguém faz. A dica nomeia a unidade do
  eixo escolhido no lugar dele.

**Consequências.**

Um estudo de **processos** pode ter um estágio de gráfico — processo tem
magnitude desde o P0-4 —, mas o plano dele **não é desenhado**: não existe mapa
do universo de processos ainda, e `property_map` lê o catálogo de materiais, de
modo que desenhar marcaria os materiais que por acaso carregam aqueles ids
([D-58](DECISIONS.md)). A seleção acontece e as tabelas dizem o que ela pediu;
só a figura é omitida. Gráfico de atributo de processo continua sendo item de
P1, registrado desde o P0-4.

`Region` é primitiva nova em `app/exporters/figures.py`, e a caixa aberta é a
razão dela: limite ausente chega como `None` e o *renderizador* resolve o lado
aberto, porque onde a moldura do gráfico termina é fato sobre o desenho e não
sobre o dado. A cor é a **cor da tinta** e não um sétimo matiz: os seis da paleta
categórica já são de classes, e `HIGHLIGHT` e `INDEX_LINE` já reaproveitam dois.
Região é anotação sobre o dado, não mais uma série nele.

**Alternativas recusadas.** Desenhar a caixa reimplementando a geometria no
exportador (criaria duas verdades sobre a mesma figura — a regra do
[CLAUDE.md](../CLAUDE.md) vale); guardar a caixa em pixels (mudaria de
significado com o tamanho da janela); tratar limite ausente como zero (inventa um
limite); deixar o estágio admitir registro não plotável quando a caixa não limita
aquele eixo (o critério é a região, e quem não está na figura não está na
região).

---

## D-61 — Uma pasta da taxonomia é um registro, e o segundo universo se navega

**Contexto.** O método abre no *browse*: uma árvore de pastas, uma trilha que diz
onde se está, e a pasta aberta como página própria — com o que a família **é**,
não só o que está dentro dela. Aqui a hierarquia existia no motor desde o P0-1
([D-56](DECISIONS.md)) e não existia na tela. Duas lacunas concretas: o catálogo
tinha uma caixa de seleção plana, que lista classe aninhada e raiz
indistintamente, e o universo de processos não tinha porta de entrada nenhuma —
era alcançável só de dentro de um estágio de seleção e da ficha de um material, o
que fazia dele algo que se *usa* e nunca algo que se *navega*.

**Decisão.**

- **Uma pasta passa a carregar prosa, e essa prosa está fora do princípio 1 por
  construção.** `applications` e `characteristics` em `MaterialClass` e
  `ProcessClass` são texto editorial: nada ali é comparado, convertido,
  ranqueado ou plotado. O princípio 1 governa *valor de propriedade*, e uma frase
  sobre uma família não é um. O que as segura é a regra oposta e ela é estrita:
  **NULL quer dizer "ninguém escreveu"**, estado diferente de string vazia, e a
  tela desenha isso com rótulo escrito (D-24) — um painel em branco leria como
  "esta família não tem aplicações", que é uma afirmação que o catálogo nunca
  fez. O seed deixa `elastomeros` sem texto de propósito, pelo mesmo motivo que
  deixa `condutividade_termica` sem valor.

- **As duas taxonomias mudam juntas.** A assimetria seria pior que a duplicação:
  o [D-57](DECISIONS.md) deu ao universo de processos a mesma taxonomia que ao de
  materiais justamente para que os dois respondessem às mesmas perguntas, e uma
  família de processo que não pudesse ser navegada enquanto uma classe de
  material pudesse seria exatamente o que aquela decisão evitou.

- **O breadcrumb sai de `app.domain.taxonomy.lineages`** — a mesma travessia que
  o Tree Stage usa —, então uma trilha e um estágio não podem discordar sobre
  quem está sob quem. Exclui a própria pasta: a página em que o leitor está não é
  link de volta para ela mesma, e `href` opcional em `Crumb` torna isso
  irrepresentável por acidente.

- **`descendant_*_count` é o que torna a árvore navegável.** A contagem direta é
  0 num galho puro *por desenho* — é o que responde "esta pasta está vazia" —, e
  sem o total da subárvore o leitor não distingue "pasta vazia" de "pasta cujo
  conteúdo está um nível abaixo", e não tem por que abri-la. As duas contagens
  aparecem juntas, para que nenhuma das duas leituras fique escondida.

- **A ficha da família mostra o que está nela *e abaixo dela*.** Galho puro
  renderizaria página vazia de outro jeito, mandando quem abriu "Metais" caçar
  metais nas subclasses. Os cartões de subclasse são como se estreita a partir
  dali.

- **Navegar e filtrar convivem, porque são perguntas diferentes.** O seletor de
  classe estreita a lista da tela do catálogo; um cartão de família *sai* para a
  página daquela família. Colapsar num controle só custaria a pergunta que
  perdesse.

- **A prosa não vai na listagem, só no detalhe.** A lista desenha um seletor e
  uma árvore, e pendurar dois parágrafos por classe nela mandaria o texto
  editorial da taxonomia inteira para renderizar um dropdown — a mesma razão pela
  qual `ProcessDetailOut` é separado de `ProcessOut`. Vai no `_snapshot` da
  auditoria, porque texto de família é parte do registro e o M2 tem de responder
  por uma mudança nele.

- **A ficha do processo é a mesma experiência de leitura da ficha do material.**
  `GET /api/processes/{slug}` devolvia tudo desde o P0-4 e nada renderizava.
  `provenanceOfProcessAttribute` é um terceiro **adaptador** e não um terceiro
  popover: o trilho é o trilho. E o **tipo do valor** aparece ao lado de cada
  atributo, porque envelope é comparado por alcance e escalar pelo próprio valor
  ([D-59](DECISIONS.md)) — quem não vê qual regra se aplica não consegue conferir
  a seleção que a usou. É a obrigação do D-59 trazida para a tela.

- **`process_count` passa a contar só processos ativos.** Isto reverte uma
  decisão anterior, que tinha razão escrita ("a contagem descreve a pasta, e
  esconder um processo retirado faria o operador se perguntar onde ele foi").
  Três coisas resolveram do outro lado: o docstring do próprio repositório sempre
  disse que a contagem responde **"esta pasta está vazia"**, e pasta cujo único
  processo foi retirado não admite ninguém num estágio; o operador que aquela
  razão servia **não tem tela**, porque o catálogo de processos é somente leitura
  e torná-lo editável segue item de P1 aberto; e o registro de família põe a
  contagem **ao lado da lista**, onde "2 processos" seguido de um lê como página
  que perdeu uma linha. Quando a tela de edição existir, ela pede um
  total-arquivado como campo próprio — melhor que reaproveitar este. O filtro
  fica na cláusula **ON** e não num WHERE: movido para WHERE, o outer join vira
  inner e toda pasta vazia some da taxonomia, inclusive todo galho puro.

**Consequências.**

Os selos de processo na ficha do material viraram **links**: a junção do P0-2 lê
nos dois sentidos agora que um processo tem ficha, e um selo que nomeava página
inalcançável era a metade que faltava.

`lib/taxonomy.ts` é o gêmeo cliente de `app/domain/taxonomy.py`, extraído quando
a segunda cópia do percurso apareceu. Percorre `parent_id` em largura em vez de
supor profundidade — a taxonomia é dado semeado e um operador aprofunda sem
migração — e leva as duas defesas da versão do backend: raiz ausente devolve ela
mesma e não conjunto vazio, e ciclo termina em vez de girar.

`Breadcrumb` é primitiva nova, documentada ao vivo em `/estilo`. O teste de
acessibilidade daquela rota pegou um defeito assim que a seção entrou: dois `nav`
com o mesmo nome acessível violam `landmark-unique` — é para isso que a prop
`label` existe.

`BottomNav` fica com cinco destinos. É o que se faz todo dia no telefone, e
navegar o universo de processos não é isso; a barra lateral e a gaveta levam o
link.

**Alternativas recusadas.** Substituir o seletor de classe pela árvore (custaria
o filtro, que responde outra pergunta); mostrar na família só o que está filado
naquele nível exato (deixa todo galho puro numa página vazia); uma coluna
`universe` numa tabela de pastas só (mesma razão do D-57); um cartão de prosa
vazio quando ninguém escreveu nada (duas linhas de "ninguém escreveu" dizem menos
que nenhum cartão).

---

## D-62 — O catálogo ganha dono, e o espaço do usuário existe

**Contexto.** O catálogo é compartilhado entre todo usuário autenticado desde o
[D-42](DECISIONS.md): é dado de referência, não trabalho autoral de um projeto, e
só `SelectionStudy` era isolado por `Project`. O modelo funcional dos manuais tem
uma terceira coisa que nenhuma das duas cobre — `My Records`, o espaço de quem
usa: registros que a pessoa cadastrou para si, os que marcou para voltar, e os
que abriu por último. Era a única capacidade da matriz do §5 de
[`14-plataforma-selecao.md`](14-plataforma-selecao.md) ainda em zero, e é a que o
P2 (*Find Similar*, registro de referência) e o P3 (Synthesizer) dependem.

**Decisão.**

- **Propriedade é uma coluna em `Material`, não uma tabela paralela.**
  `owner_id` anulável: NULL é o catálogo compartilhado — o que o catálogo sempre
  foi —, preenchido é o registro próprio de uma pessoa. Uma `UserMaterial`
  separada bifurcaria o motor de seleção, o repositório de gráficos, o painel e
  os exportadores em dois caminhos respondendo "qual é o módulo deste material?",
  que é a falha de duas verdades que o projeto recusa em todo o resto. O
  [D-57](DECISIONS.md) separou os atributos de processo porque são *outro tipo de
  coisa*; propriedade é a mesma coisa com outro leitor.

- **A regra de visibilidade é escrita uma vez e falha fechada.**
  `Material.is_active` é filtrado à mão em onze lugares de quatro repositórios, e
  essa repetição é sobrevivível: esquecê-la mostra um material retirado, o que é
  um incômodo. Propriedade não é — esquecê-la mostra o registro de outra pessoa.
  Então `app/repositories/visibility.py` guarda o predicado, `viewer_id` é
  argumento de construtor e não parâmetro de oito métodos, e o padrão `None`
  significa **só o catálogo compartilhado**: um ponto de construção nunca
  atualizado renderiza menos do que poderia, nunca mais do que pode.

- **Escrita não ganha predicado próprio, porque ele não teria ramo alcançável.**
  O filtro de leitura já devolve exatamente o conjunto gravável: um material que
  se enxerga ou é compartilhado — comunalmente gravável desde o D-42, e o My
  Records não revoga isso em silêncio — ou é seu. "Visível e não meu" não ocorre,
  então toda mutação já para no `get_material` com 404. Função com ramo morto lê
  como proteção e não protege nada.

- **A propriedade é declarada, nunca inferida de quem digitou.** A mesma pessoa
  alimenta o catálogo compartilhado e guarda registros seus, e só ela sabe qual
  dos dois um formulário era: `is_own_record` no payload, com padrão `False`, que
  mantém todo cliente anterior fazendo o que fazia. Na saída é booleano e não
  `owner_id` — um leitor só enxerga o compartilhado e o próprio, então "tem dono"
  e "é meu" são o mesmo fato, e o booleano é o único dos dois que não identifica
  ninguém.

- **A checagem de nome duplicado é escopada ao conjunto visível.** Verificação
  global recusaria um nome por causa de um registro que a pessoa não enxerga —
  mensagem de erro que denuncia o escondido. O escopo mantém nome único dentro de
  toda tela que chega a ser desenhada, que é tudo o que a legibilidade de um
  gráfico exige: nenhuma vista mistura registros de dois leitores. O importador
  fica **sem** observador de propósito, porque escreve no catálogo compartilhado.

- **Um marcador alcança exatamente um universo, com chave estrangeira de
  verdade.** `Favorite` e `RecentRecord` têm `material_id` e `process_id`
  anuláveis com `CheckConstraint` de XOR — a mesma forma do eixo do Chart Stage
  ([D-60](DECISIONS.md)). O par polimórfico `universe`/`record_id` teria uma
  coluna a menos e **nenhuma** chave estrangeira: apagar um processo deixaria
  marcador apontando para nada, e restrição nenhuma poderia dizê-lo.

- **Marcador não carrega número nenhum**, pela mesma razão que a associação
  material↔processo não carrega (D-57): valor sobre um material precisa da
  proveniência de `MaterialPropertyValue`, e uma cópia guardada aqui por
  conveniência seria uma segunda resposta sem atribuição.

- **Recentes são conjunto com ordem, não log.** Reabrir atualiza a linha que
  existe, e o teto é 20. Log de visitas responde "o que eu fiz", que é outra
  pergunta e que o `AuditEvent` já responde melhor (M2). E a visita é registrada
  por `POST` do cliente, nunca dentro do GET da ficha: leitura que escreve não é
  cacheável nem idempotente, e um relatório relendo um registro reordenaria a
  lista em silêncio.

- **O documento declara um registro próprio.** O valor satisfaz o princípio 1 —
  foi explicitamente cadastrado —, mas nunca passou pela revisão de fonte e
  licença que o M1 exige do catálogo. Aviso no topo e coluna na folha, a mesma
  forma com que dado de demonstração já se declara, porque quem aprendeu a
  procurar um acha o outro no mesmo lugar; e a folha de proveniência ganha a
  coluna *Registro*, pela obrigação que o [D-59](DECISIONS.md) impôs para o tipo
  de valor — a regra tem de chegar ao leitor, e é ali que se audita um número de
  cada vez.

- **Registro próprio é só de material no v1.** Um processo definido pelo usuário
  exigiria o catálogo de processos **editável**, que é item aberto desde o P0-2 e
  pede a trilha de auditoria que o de materiais tem. A assimetria está escrita no
  código que a encontra (`_is_own_record` lê por `getattr`), e não escondida.

**Consequências.** O registro próprio de uma pessoa participa das seleções, dos
gráficos, do painel e dos documentos dela exatamente como uma linha de catálogo —
é para isso que ele existe — e nunca aparece para mais ninguém. O canário
(`test_my_records_isolation.py`) varre `app.openapi()` e não uma lista escrita à
mão, então endpoint novo entra na varredura no dia em que nasce.

**E o custo dessa escolha apareceu na hora.** O `None` seguro-por-padrão estreita
a leitura, e por um commit o `SelectionService` — que recebia `user` opcional
porque só a auditoria o lia — estreitou-a em toda leitura: o registro próprio de
uma pessoa sumia do estudo dela, com cara de perda de dado e não de bug de
permissão. O canário **não pega isso por construção**: toda prova dele falha
quando um registro aparece para quem não pode vê-lo, e nenhuma falha quando ele
some para quem pode. `user` virou obrigatório no `SelectionService` (o erro passa
a ser `TypeError`) e entrou o controle positivo. A lição é a regra: todo padrão
que falha fechado precisa de uma prova de que o caminho aberto ainda abre.

**Alternativas rejeitadas.** Tabela `UserMaterial` paralela (duas verdades sobre
o mesmo material); marcador polimórfico `universe`/`record_id` (sem integridade
referencial); inferir propriedade de quem criou a linha (rouba do catálogo
compartilhado a única porta de entrada que ele tem); `owner_id` na resposta da
API (põe o id de outra pessoa no fio sem necessidade); um predicado de escrita
(sem ramo alcançável); registrar a visita dentro do GET da ficha (leitura que
escreve); `aria-pressed` no hospedeiro do `md-icon-button` e o
`aria-label-selected` que o próprio MWC oferece (o primeiro fica num elemento que
leitor de tela não lê; o segundo não é nome de atributo ARIA válido e reprova
`aria-valid-attr`).

---

## D-63 — "Semelhante" é uma pergunta com base declarada, e um percentual só existe onde há zero verdadeiro

**Contexto.** O fluxo canônico dos manuais termina em
`Datasheet → Find Similar → Comparison Table`, e as três capacidades estavam em
**0, 0 e 2** na matriz do §5 de
[`14-plataforma-selecao.md`](14-plataforma-selecao.md). Com o `My Records`
entregue (P1-4, [D-62](DECISIONS.md)), a dependência que as bloqueava saiu.

Duas perguntas carregam o item, e nenhuma delas é de implementação: *em que
espaço se mede a distância entre dois materiais*, e *quando uma diferença
percentual quer dizer alguma coisa*.

**Decisão.**

- **A base é tudo ou nada, e vai na resposta.** Quem pergunta "o que se parece
  com isto, nestes cinco aspectos" não pode receber na mesma lista um registro
  que não tem um dos cinco: seria comparar duas perguntas e apresentar as
  respostas juntas. Candidato sem uma propriedade da base sai em `excluded` com
  os slugs que lhe faltam — o mesmo contrato do `ranking.py`, de propósito. E a
  base volta **na resposta**, porque uma lista ranqueada sem as propriedades que
  a produziram é um veredito, não um resultado.

- **`property_slugs` não tem padrão no servidor.** Assumir "toda propriedade que
  a referência por acaso tem" deixaria o hábito de cadastro escolher a pergunta,
  e o leitor nunca veria que ela foi escolhida por ele. A interface **propõe**
  uma base, com as marcas visíveis; a requisição **declara** uma.

- **A distância é medida em espaço log onde a propriedade permite.** Propriedade
  de material varre ordens de grandeza, e em eixo linear a de faixa mais larga
  decide toda comparação sozinha — a mesma razão pela qual um mapa de Ashby é
  log-log. A permissão vem de `allows_log_scale`, **a mesma bandeira que os
  gráficos leem**, para figura e semelhança não discordarem sobre em que espaço
  a propriedade vive. Valor não positivo não tem logaritmo, e a queda para linear
  é **da propriedade no run, nunca de um registro**: dois registros em eixos
  diferentes não estão em eixo nenhum.

- **Escala pela dispersão do conjunto, e média — não soma.** Dividir por
  `max - min` torna a coordenada adimensional; a média dos quadrados mantém uma
  distância sobre três propriedades no mesmo pé de uma sobre seis, enquanto a
  soma faria a base mais larga parecer mais distante por ter respondido mais.
  Propriedade em que ninguém difere contribui zero e é **nomeada**, porque
  descartá-la calada deixaria a base documentada maior que a que rodou.

- **A distância só se compara dentro de uma resposta**, e a tela diz isso antes
  do primeiro resultado: a escala vem da dispersão daquele conjunto, então 0,4
  aqui e 0,4 noutra execução não são a mesma afirmação.

- **A referência é parâmetro da pergunta, nunca estado no servidor.** "Comparado
  contra o X" é coisa que um leitor pergunta, não fato sobre o catálogo: viaja na
  requisição e na URL (B1). Referência guardada no servidor faria a mesma URL
  desenhar duas tabelas diferentes para duas pessoas. E tem de ser **um dos
  materiais comparados** — medir as linhas contra algo que o leitor não enxerga
  tornaria todo percentual inconferível.

- **O percentual só existe em escala de razão.** 600 K é mesmo o dobro de 200 K;
  20 °C não é o dobro de 10 °C, e "+100%" ali seria falso com toda a autoridade
  de um número calculado. `units.is_ratio_scale` decide por **comportamento** —
  dobrar a magnitude dobra a grandeza em unidade base *é* a definição —, e não
  por introspecção de tabela privada do Pint, que mudaria sem aviso. Nenhuma
  unidade canônica do catálogo tropeça nisso hoje; `canonical_unit` é
  configurável pelo operador, e é para amanhã que a guarda existe.

- **Cinco maneiras de não haver percentual, cada uma com sua frase.**
  `sem_referencia`, `valor_ausente`, `referencia_ausente`, `referencia_zero` e
  `escala_sem_zero` são todas idênticas como célula em branco e nenhuma quer
  dizer o mesmo (D-24). A **ordem** entre as duas do meio é escolha e está fixada
  por teste: faltando os dois lados, a culpa é da referência, porque consertá-la
  conserta a coluna enquanto consertar a linha conserta uma célula.

**Consequências.** `Find Similar` sai de 0 para 4, `Registro de referência` de 0
para 3 e `Tabela de comparação` de 2 para 4. O registro de referência **não** é
entidade nova: é o parâmetro, e essa é a razão de a capacidade ficar em 3 e não
em 4 — falta poder fixá-lo como estado de um projeto, que é o que o EduPack
chama de *reference record* propriamente dito.

**Alternativas rejeitadas.** Comparar o candidato pelo que ele tem (mistura duas
perguntas numa lista); somar as contribuições em vez de promediar (penaliza a
base mais larga por responder mais); decidir log por registro (dois eixos, uma
distância sem sentido); base padrão no servidor (o catálogo escolhe a pergunta);
referência como linha de banco (a mesma URL deixaria de ser a mesma tabela);
percentual sempre que houver dois números (afirma falsidade em escala com
offset); `—` na célula sem percentual (quatro razões distintas viram um traço).

---

## D-64 — O Solver e o Index Finder são uma derivação só, e a massa é o fator estrutural dividido pelo índice

**Contexto.** O P2 restante tinha dois itens na matriz do §5 de
[`14-plataforma-selecao.md`](14-plataforma-selecao.md), ambos em **0**:
*Engineering Solver* (viga em flexão, tração, compressão) e *Performance Index
Finder* (o fluxo função→restrição→objetivo→índice). Desenhá-los mostra logo que
**não são duas coisas**: o Finder lê simbolicamente ("qual índice esta
combinação produz?") e o Solver numericamente ("quantos quilos dá?") a **mesma
derivação**. Construí-los separados criaria as duas verdades que o
[D-60](#d-60) e o [D-63](#d-63) recusaram cada um na sua camada.

**Decisão.**

**1. Um caso de carga é uma derivação, e mora em código.** `app/calculations/
load_cases.py` guarda sete casos padrão — tirante por rigidez, por resistência e
por escoamento; viga por rigidez e por momento; placa por rigidez; coluna por
flambagem de Euler. Cada um carrega a derivação escrita por extenso: o objetivo,
a restrição, a variável livre e a eliminação.

Tabela e não linha de banco, ao contrário do que o [D-57](#d-57) decidiu para a
família do processo, e a diferença é o tipo de coisa: uma família de processo é
**dado semeado**, uma derivação é **argumento**. Argumento se verifica por
revisão, como `units.py`, não por digitação — um usuário com formulário poderia
cadastrar uma derivação errada e a ferramenta a apresentaria com toda a
autoridade de um número calculado. O custo é nomeado: em v1 ninguém cadastra
caso novo.

**2. `massa = fator estrutural / índice`, e isso vale por construção.** A
fatoração que o método de Ashby torna famosa separa o objetivo em

    m = (fator estrutural) × (agrupamento material)

e o agrupamento material *é* o índice, invertido. Então cada caso guarda só a
metade estrutural, e **o índice é lido do catálogo pelo slug na hora de
resolver** — a mesma regra que o [D-35](#d-35) impõe à camada de IA e pela mesma
razão: duas cópias de uma fórmula viram duas respostas. Um índice novo entrou no
seed para a viga por resistência (σy^(2/3)/ρ), e **todo índice semeado é
alcançável por algum caso**, com teste que varre isso: índice que o Finder não
alcança é fluxo que morre no catálogo.

Consequência que o solver depende e recusa quando falha: só índice de
**maximizar** se inverte em massa. Índice de minimizar inverteria o sentido, e a
recusa traz o motivo escrito.

**3. Os dois espaços de nomes nunca se misturam.** Expressão estrutural só
nomeia variável de projeto (`comprimento`, `rigidez`, `momento`, as duas
constantes de apoio); índice só nomeia slug de propriedade. `_validate` recusa
**no import** um caso que saia disso. Nome compartilhado deixaria um dado de
projeto sombrear uma propriedade — e o número continuaria plausível, que é o
pior desfecho possível.

**4. A variável livre não é sempre a área.** Na placa o desenho fixa a área em
planta e libera a **espessura**. Cada caso declara qual variável libera e em que
unidade, e a prova dimensional lê a unidade declarada em vez de esperar metro
quadrado — o que faz um caso que declare uma unidade e derive outra falhar na
suíte em vez de na tela.

**5. A condição de apoio é escolha visível, não constante escondida.** A
constante C da flecha e o fator de extremidade n² de Euler são exatamente o que
faz dois briefings idênticos darem respostas diferentes. Vão como escolha
nomeada que preenche uma variável de projeto; o valor aproximado da coluna
engastada-rotulada leva a ressalva junto.

**6. Viga em flexão e coluna em flambagem caem no mesmo índice**, e o documento
diz por quê: nos dois a restrição é elástica e a seção entra ao quadrado. Não é
economia de catálogo, é um fato do método que vale a pena o leitor ver.

**7. Ausência é exclusão nomeada, como em todo lugar** (princípio 3). Material
sem uma propriedade que o caso exige sai em `excluded` com os slugs que lhe
faltam — o contrato de `ranking.ExcludedMaterial` e `nearness.ExcludedRecord`,
de propósito.

**8. A unidade de cada resposta é derivada, nunca declarada à mão.** As
variáveis de projeto carregam unidade canônica, as propriedades carregam a
delas, e o Pint multiplica tudo por `result_dimension`. É o que transforma
"2,4 kg" em afirmação auditável em vez de número com rótulo digitado ao lado.

**Como se verifica.** Duas frentes independentes, por caso:

- **Prova dimensional:** fator estrutural sobre índice tem de sair na unidade
  que o caso declara.
- **Forma fechada:** a massa recalculada direto da equação de restrição (isola a
  variável livre, depois m = A·L·ρ) tem de bater com a fatoração.

Trocar `comprimento ** 5` por `** 4` na viga derruba as duas. Trocar a divisão
pelo índice por multiplicação no solver derruba quatro provas; anular a guarda
de dado ausente derruba duas.

**O que se recusou.** Derivar o índice simbolicamente em runtime (exigiria CAS,
e uma derivação que ninguém revisou é pior que uma tabela revisada); guardar a
expressão do índice junto do caso (segunda cópia, segunda resposta); calcular o
fator estrutural por material (não tem termo material nenhum, e recomputá-lo
seria convite a deixar uma propriedade vazar para dentro dele); pré-preencher
vão e carga na tela (seria a ferramenta escrevendo o briefing); e custo como
objetivo, que fica nomeado como omissão de v1 — trocaria ρ por ρ·Cm em todo
agrupamento material e dobraria o catálogo de casos.

**Dois defeitos reais apareceram ao construir isto, e estão registrados porque
nenhum deles era do item.** `result_dimension` publicava resíduo de ponto
flutuante (`[mass] / [length] ** 2.22e-16`) sempre que um índice de expoente
fracionário se combinava com o caso que o produz — `2 / 3` não é fração binária.
E a tabela de sinônimos da camada de IA conhecia "rigidez" e "rigido" mas não o
adjetivo flexionado, então *"uma viga leve e **rígida**"* não nomeava
propriedade nenhuma; ficou invisível enquanto havia um único índice de viga no
catálogo e, no instante em que entrou o segundo, o desempate alfabético entregou
ao leitor um índice de resistência que ele não pediu.

## D-65 — O custo da peça é uma decomposição com quatro termos, e o custo de material é a mesma derivação do D-64 lida outra vez

**Contexto.** O P3 da matriz do §5 de
[`14-plataforma-selecao.md`](14-plataforma-selecao.md) abre com o *Part Cost
Estimator*, em **0**. E o [D-64](#d-64) fechou nomeando a omissão que o
destravaria: custo como objetivo, "que trocaria ρ por ρ·Cm em todo agrupamento
material e depende do Part Cost Estimator". Os dois são um item só porque
respondem à mesma pergunta em duas escalas: quanto custa **fazer** esta peça, e
que material a faz **mais barata**.

**Decisão.**

**1. O estimador devolve os termos, nunca só o total.** O modelo é

    C = m·Cm/(1−f) + C_t/n + Ċ_oh/ṅ + C_c/(ṅ·t_wo·L)

e o que o leitor veio buscar não é o total: é **como cada termo anda com o
lote**. O termo de material é um piso que lote nenhum atravessa; o ferramental
cai com 1/n e é o único que cai; os dois termos de tempo não se mexem com n. Um
total sozinho seria oráculo, e o cruzamento entre dois processos conforme n
cresce é a resposta de verdade — por isso `CostTerms` carrega os quatro mais
`batch_sensitive`, e a tela imprime coluna por coluna.

**2. Dinheiro não está em sistema de unidades nenhum, e a ferramenta admite
isso.** `custo_massa` é catalogado como **adimensional de propósito**: fingir que
dinheiro é grandeza física o poria num sistema a que não pertence. Toda resposta
monetária sai em "unidade monetária não especificada" — `MONETARY_UNIT`, escrito
uma vez em `app/calculations/part_cost.py` e lido por toda superfície que precisa
nomeá-lo. Imprimir "R$" sobre um número cuja moeda ninguém declarou seria
inventar dado, que é o princípio 1 de outro chapéu.

**3. Premissa de oficina é entrada com valor visível, não constante escondida.**
Horizonte de amortização e fator de carga não são fatos de processo nenhum —
duas fábricas com a mesma prensa amortizam em prazos diferentes e a mantêm
ocupada frações diferentes do ano. Vão como campo, com padrão visível e
sobrescrevível, exatamente como o [D-64](#d-64) tratou a constante de apoio. As
8760 h/ano ficam **separadas** do fator de carga: uma é calendário, o outro é
escolha da oficina.

**4. O objetivo custo é a mesma derivação, não uma segunda.** Trocar ρ por ρ·Cm
no agrupamento material faz o caso de carga minimizar o **custo de material da
peça** em vez da massa. O fator estrutural não muda **em nada** — é geometria e
carga —, então um caso passa a nomear **dois slugs de índice** (`index_slug` e
`cost_index_slug`) em vez de carregar duas derivações. Seis índices gêmeos
entraram no seed, um por índice de massa existente, e a regra do [D-64](#d-64)
continua valendo palavra por palavra: **o índice é lido do catálogo pelo slug**,
e quem chama a API nunca o nomeia — nomeia o objetivo, e o caso escolhe
(`LoadCase.index_slug_for`).

**5. A análise dimensional prova a álgebra e deixou de nomear a resposta.** Esta
é a consequência que precisa chegar ao leitor, e a razão de o objetivo ser dito
em palavras. Como `custo_massa` é adimensional, `fator estrutural / índice de
custo` sai com **a mesma dimensão da massa**. O Pint não tem como distinguir as
duas, e isso não é defeito: a prova dimensional continua derrubando um expoente
errado num gêmeo de custo exatamente como derrubaria num de massa. O que ela
deixou de fazer é dizer o que o número é. Daí `objective`, `objective_unit` em
palavras e `objective_note`, que carrega a frase em vez de deixar o leitor
deduzi-la de um "[mass]" embaixo de uma coluna de dinheiro.

**6. Na tela, o gêmeo de custo aparece ao lado do de massa, antes da escolha.**
São duas leituras de uma derivação, e quem não vê as duas ao mesmo tempo não tem
como notar que o fator estrutural não mudou. Pela mesma razão a faceta
"Objetivo" nomeia as duas: o objetivo deixou de ser propriedade do caso e virou
escolha de quem lê, e afirmar "Minimizar massa" numa tela em que o custo está a
um seletor de distância seria falso. E o **link para a estimativa de custo some
numa execução de custo** — ele leva `massa=` na URL, e entregar ali um custo
daria ao estimador um número de outra grandeza sem que ele tivesse como
perceber.

**7. Ausência é exclusão nomeada, nos dois lados** (princípio 3). Processo sem
um atributo econômico que o modelo exige sai em `uncosted` com os slugs e os
rótulos que lhe faltam — ferramental em branco faria o processo mais
capital-intensivo parecer o mais barato. Material sem `custo_massa` catalogado
sai de uma execução de custo pelo mesmo caminho pelo qual material sem módulo
sai de uma de massa.

**Como se verifica.** Um teste por comportamento com o lote (piso do material,
queda 1/n do ferramental, imobilidade dos termos de tempo) mais o cruzamento
entre dois processos conforme n cresce. Para o objetivo custo, três provas
independentes por caso: o gêmeo tem de referenciar `custo_massa`; avaliado sobre
os mesmos números, tem de dar exatamente o índice de massa dividido pelo custo do
quilograma; e a dimensão tem de sair `[mass]`. Ponta a ponta, sobre o catálogo
semeado, o custo de cada material tem de ser a sua própria massa multiplicada
pelo seu próprio `custo_massa`, com o **mesmo** fator estrutural nas duas
execuções. Trocar `sqrt` por `cbrt` num gêmeo derruba quatro provas.

**O que se recusou.** Imprimir símbolo de moeda (inventaria o que o catálogo não
registra); dobrar o catálogo de casos de carga para acomodar o objetivo custo (a
derivação é a mesma; o que muda é um slug); deixar o cliente nomear o índice de
custo (segunda verdade, [D-35](#d-35)); esconder o horizonte de amortização como
constante; e custo como objetivo em **estudo de processos**, que continua fora —
um processo não tem `custo_massa`, e a pergunta ali é a do estimador, não a do
solver.

## D-66 — Uma auditoria ambiental responde qual fase domina, e recusa o pódio quando falta uma fase

**Contexto.** *Eco Audit* é a linha em **0** que restava na faixa P3 da matriz do
§5 de [`14-plataforma-selecao.md`](14-plataforma-selecao.md), e a única que a
matriz marca como dependente de "A ampliado" — o catálogo de materiais precisava
crescer para acomodá-la. Um eco audit soma energia e carbono de uma peça em cinco
fases (material, manufatura, transporte, uso, fim de vida), e **a resposta não é
o total**: é qual fase domina, porque é nela que esforço de projeto muda alguma
coisa. Uma porta de carro se decide na fase de uso; uma sacola plástica, na de
material. Acertar o total e errar a dominância seria uma auditoria que lê bem e
engana.

**Decisão.**

**1. A fase de uso tem dois modelos, e eles não são variantes de um.** Uma
geladeira gasta energia porque funciona — `estatico`: potência × tempo, e a massa
da peça **não aparece em lugar nenhum**. Um painel de carro gasta porque alguém o
carrega — `movel`: massa × distância × intensidade. Escolher errado **inverte** a
auditoria: aliviar a peça economiza muito num modelo e *exatamente nada* no
outro. Por isso o modelo é escolha declarada que carrega os próprios campos, os
campos do outro modelo são **recusados e não ignorados** (a regra que o
[D-56](#d-56) deu ao estágio de seleção, pela mesma razão: um número que o leitor
digitou e a soma não contém), e a resposta diz qual rodou.

**2. A fase de material é cobrada sobre a massa comprada, não sobre a massa da
peça.** Um processo que refuga um quinto do material faz a fundição fundir um
quinto a mais, e essa energia foi gasta tenha ou não saído no produto:
`massa comprada = massa / (1 − f)`, a mesma fatoração que o [D-65](#d-65) usou no
termo de material do custo. Daí decorre uma exigência que parece arbitrária e não
é: **uma auditoria aqui precisa de processo**. Auditar uma peça é auditar *fazer*
a peça — sem processo não há fase de manufatura nem fração de refugo, e sem a
fração de refugo a massa comprada teria de ser adivinhada, que é um zero
disfarçado. A consequência boa é que um processo perdulário **aumenta também a
fase de material**, não só a de manufatura, e é isso que o leitor precisa ver.

**3. A reciclagem aparece duas vezes e nunca se cancela.** Ela é energia
**gasta** no fim desta vida (a rota `reciclagem`) e energia **poupada** no início
da próxima (o teor reciclado de quem comprar o material). Abater um crédito de
reciclagem do total desta peça é escolha de método que normas diferentes fazem de
maneira diferente, então este módulo **não a faz**: reporta a energia da própria
rota e deixa o crédito onde ele pertence, na fase de material da próxima
auditoria. A nota que diz isso viaja com toda resposta.

**4. Auditoria incompleta não se resume, só se lista.** Faltando o dado de
qualquer fase, a **fase dominante é recusada com o motivo escrito** — a fase que
ninguém calculou pode ser justamente a que domina — e o **total também**, porque
uma soma sobre quatro das cinco fases é uma parcela que parece um total. É o
princípio 3 aplicado a uma *estatística de resumo* em vez de a uma célula, e é a
recusa que o leitor mais vai encontrar: **aterro e incineração não têm energia
catalogada nesta versão e não viram zero**. Um aterro de custo zero faria enterrar
a peça parecer a coisa mais barata que se pode fazer com ela, que é exatamente a
falácia que uma auditoria ambiental existe para desfazer.

**5. Os dois pódios são independentes, e podem discordar.** Energia e carbono
leem dados catalogados diferentes, então uma fase pode ser conhecida em MJ e
desconhecida em kg de CO₂. Cada grandeza tem a sua ausência, o seu motivo escrito
(D-24) e o seu pódio. Quando a rede elétrica é limpa, a fase que domina em
energia não é a que domina em carbono — e mostrar as duas é o que torna isso
visível em vez de acidental.

**6. A energia é auditada pelo Pint; o carbono, por declaração.** MJ/kg é
dimensão que o sistema de unidades conhece, então toda energia aqui é derivada
como o D-64 deriva uma massa. Uma pegada de CO₂ é quilograma de uma substância
por quilograma de outra, e o Pint não tem noção de substância — ele reduz a razão
a adimensional, exatamente como faz com dinheiro ([D-65](#d-65)), por motivo
diferente e com o mesmo dever: dizer em palavras. `pegada_co2` e `co2_reciclagem`
são adimensionais no catálogo e "kg de CO₂" em toda superfície que os imprime.

**7. `TransportMode` é tabela própria, e não material nem processo.** Não é
material porque nada nele é propriedade da matéria. E **não é processo** no
sentido do [D-57](#d-57): um `Process` se liga a materiais por `material_process`,
e é essa junção que faz do Tree Stage uma junção entre tabelas. Um navio não é
compatível com um material, e semeá-lo como processo poria uma linha sem sentido
dentro de um estágio de seleção que se lê como se tivesse sentido. As duas
intensidades são **colunas simples e não o trilho de proveniência**, com a
justificativa escrita no modelo: o trilho existe para sobreviver a importação e
digitação, e não há nem uma nem outra em v1 — quatro linhas semeadas com dois
números cada. O compromisso do M1 sobrevive: a linha nomeia a sua `Source`.

**Como se verifica.** Seis mutações sobre a camada de cálculo, todas apanhadas:
multiplicar em vez de dividir pela fração de refugo; deixar o pódio ignorar as
fases ausentes; multiplicar a fase estática pela massa; somar as fases que
existem em vez de recusar o total; trocar as duas frações do teor reciclado; e
cobrar o fim de vida sobre a massa comprada. Sobre o catálogo semeado, os testes
de API provam que as lacunas plantadas de propósito chegam à resposta como motivo
escrito: a cerâmica e o compósito sem figura de reciclagem (os casos clássicos de
"não se recicla de rotina") e o modal ferroviário sem intensidade de carbono.

**O que se recusou.** Abater crédito de reciclagem (escolha de método, não de
implementação); tratar aterro como zero; um modelo de uso único com a massa
entrando "quando fizer sentido" (seria a inversão silenciosa que o item inteiro
existe para evitar); modais como processos; e um pódio calculado sobre as fases
disponíveis, que é a versão desta ferramenta do gráfico com eixo truncado.

---

## D-67 — Um valor sintetizado não é inventado, e a regra de mistura é propriedade da propriedade

**Contexto.** *Synthesizer* é a linha da matriz do §5 de
[`14-plataforma-selecao.md`](14-plataforma-selecao.md) que mais perto passa de
violar o princípio 1 da metodologia — "não inventar propriedades de materiais" —,
e por isso ficou por último na faixa P3. O módulo cria **materiais hipotéticos**:
um compósito de dois constituintes com fração volumétrica declarada, ou uma
espuma de um sólido com densidade relativa declarada. A pergunta que o item
inteiro tem de responder antes de escrever uma linha de código é: em que isso
difere de digitar um número plausível no catálogo?

**Decisão.**

**1. Um valor sintetizado não é inventado; é calculado, e a diferença é que ele
carrega a derivação.** O princípio 1 proíbe valor que veio de lugar nenhum. Um
limite de Voigt calculado a partir de dois módulos catalogados e de uma fração
declarada veio de algum lugar, e o lugar é auditável — a mesma distinção que o
[D-64](#d-64) fez ao dizer que "2,4 kg" é afirmação auditável e não número com
rótulo digitado ao lado. Três coisas sustentam isso, e nenhuma é opcional: o
registro é **declarado sintetizado** com a receita inteira gravada (tipo, pais,
parâmetros), então ninguém o encontra achando que é medido; **cada valor nomeia a
lei que o produziu e a base dela** — exata, par de limites ou empírica —, porque
"regra das misturas" e "Gibson–Ashby" são afirmações diferentes sobre o quanto se
pode confiar no número; e **a qualidade do dado é a pior dos pais que a regra
leu**, porque um valor calculado não pode ser mais confiável que o menos
confiável dos números que entraram nele.

Esse terceiro ponto propaga a incerteza **de entrada**. A incerteza **do modelo**
não vira número nenhum: inventar barra de erro para uma lei empírica seria
exatamente o que o princípio 1 proíbe, então ela é declarada em palavras, na base
da regra. É a mesma escolha do [D-65](#d-65) sobre a unidade monetária — quando a
ferramenta não sabe, ela diz, em vez de imprimir um número que parece saber.

**2. A regra de mistura é propriedade da propriedade, não da receita.** É a
decisão que carrega o item. Aritmeticamente é possível aplicar regra das misturas
a qualquer número, e é aí que uma ferramenta destas mente. Densidade mistura
linearmente **por volume**, e isso é conservação de massa — exato. Módulo mistura
por Voigt ao longo das fibras e por Reuss transversalmente, e como a **direção
não está catalogada**, a resposta honesta é o **par de limites**, não a média
deles. Custo por massa e as quatro grandezas ambientais são *por unidade de
massa*, então misturam por **fração mássica** e não volumétrica — o que exige as
**duas densidades**, e errar isso é invisível até os constituintes terem
densidades diferentes. Temperatura máxima de serviço não mistura: é o **mínimo**,
porque o compósito falha quando o constituinte mais fraco falha.

É o mesmo desenho do `is_ratio_scale` do [D-63](#d-63) — um comportamento da
propriedade decide se a operação faz sentido — e do `ProcessAttributeKind` do
[D-59](#d-59), em que o tipo decide qual comparação roda. A tabela de regras é
indexada por `(tipo de síntese, slug de propriedade)` justamente para que a
pergunta "esta propriedade tem lei aqui?" tenha uma resposta só.

**3. Resistência de compósito não tem regra nenhuma, e a assimetria com a espuma
é o achado.** Num compósito quem controla a resistência é a **interface** entre
fibra e matriz, e a interface é exatamente aquilo sobre o que o catálogo não sabe
nada. Numa espuma, não: uma espuma é *o mesmo material* com vazios, o mecanismo
de falha é entendido e escala (Gibson–Ashby), então ela **tem** regra de
resistência. **A diferença não está na fórmula; está no que se sabe** — e é por
isso que a ausência aqui não é uma lacuna a preencher depois.

Propriedade sem regra declarada **não é sintetizada**: o registro derivado
simplesmente não a tem, com o motivo escrito (princípio 3, [D-24](#d-24)). Na
tela isso é metade do que a prévia mostra, e não uma nota de rodapé.

**4. `_validate()` recusa no import uma propriedade que tenha regra *e* motivo de
ausência.** As duas tabelas descrevem estados mutuamente exclusivos, e uma
propriedade em ambas deixaria a resposta depender da ordem de leitura. Falhar na
importação do módulo é o que torna isso impossível de mesclar — a mesma escolha
do `_validate` dos casos de carga no [D-64](#d-64), e o que apanhou a mutação M6
já na coleta dos testes, antes de qualquer teste rodar.

**5. Um registro sintetizado é sempre próprio, nunca do catálogo
compartilhado.** É `CheckConstraint` no banco e não só regra de serviço, porque a
alternativa é uma hipótese de uma pessoa aparecendo no catálogo de todas — que é
a fronteira do [D-42](#d-42) e do [D-62](#d-62). Escrita portável como
`NOT (is_synthesized AND owner_id IS NULL)`: o PostgreSQL recusa `boolean = 1`, e
a forma que o SQLite aceitaria não é a que a produção roda.

**6. A prévia vem antes da identidade.** A tela calcula e mostra o registro
derivado inteiro — valores, leis, bases, ausências — **antes** de perguntar como
ele se chamaria, e o passo da identidade só existe depois que há prévia. Gravar
primeiro e explicar depois encheria o catálogo de hipóteses que ninguém leu, e a
pergunta "o que sairia daqui" não depende de como o resultado se chamaria. A
prévia é `POST` sem efeito e não `GET` pela mesma razão do `RecentRecord` no
[D-62](#d-62) invertida: ela carrega uma receita no corpo, não um identificador.

**As leis são mecânica dos materiais clássica** (Voigt, Reuss, Gibson–Ashby),
escritas a partir dos resultados padrão. Como os casos de carga do [D-64](#d-64),
elas moram em **código e não em tabela**, porque são argumento e não dado —
argumento se verifica por revisão, como `units.py`. Nada aqui vem de base de
dados licenciada.

**Como se verifica.** Mutações sobre a camada de cálculo, todas apanhadas: trocar
fração volumétrica por mássica no custo (invisível com densidades iguais, e o
teste usa densidades diferentes de propósito); devolver a média de Voigt e Reuss
em vez do par; trocar o mínimo da temperatura de serviço pela média; herdar a
melhor qualidade dos pais em vez da pior; e dar regra de resistência ao
compósito — esta apanhada **no import**, pelo `_validate`, e não por um teste.
Os testes de API provam que a receita gravada reexecuta e que um registro
sintetizado nunca é visível para outro usuário.

**O que se recusou.** Aplicar regra das misturas a toda propriedade numérica
(seria o clone aritmético que mente); uma média entre Voigt e Reuss (um número só
onde a direção decide); barra de erro para lei empírica; síntese sobre registro
já sintetizado em v1 — a propagação de qualidade a suportaria, mas a receita
gravada deixaria de ser legível de uma olhada; e um sintetizado no catálogo
compartilhado.

---

## D-68 — Um painel sanduíche não é uma mistura; é um arranjo

**Contexto.** *Sandwich Panels* era a última linha em **0** da matriz do §5 de
[`14-plataforma-selecao.md`](14-plataforma-selecao.md), e o único item que
restava da faixa P3. A tentação é tratá-lo como um terceiro caso do
[D-67](#d-67): mais um par de pais, mais uma fração, a mesma tabela de regras.
Ele *quase* é isso — e o "quase" é o item inteiro.

**Decisão.**

**1. Densidade e as grandezas por massa são literalmente as regras do
compósito.** Massa é massa: o arranjo não a move. Um painel de área constante
tem fração de espessura igual à fração de volume, então `ρ*` sai por
`_VOLUME_LINEAR` com `f = 2t/d`, e custo e as quatro grandezas ambientais saem
por fração mássica, exigindo as duas densidades como sempre. Não é coincidência
numérica, é a mesma `Rule`, e o teste fixa isso além do valor. É por isso que o
laço de dois pais passou a ser **compartilhado**: compósito e painel diferem em
uma regra só.

**2. O módulo é de flexão equivalente, e ele passa do limite de Voigt.** É a
afirmação que carrega o item, e ela é verificável: Voigt é o teto de *qualquer*
regra das misturas nas mesmas frações. Uma face de 70 GPa e um núcleo de
0,1 GPa com `t/c = 1/18` dão Voigt = 7,09 GPa e **E\* = 19,04 GPa** — 2,7× acima
do teto. Se `E*` fosse uma mistura, isso seria impossível; como é um arranjo, é
exatamente o motivo de se construir um painel em vez de moer os dois materiais
juntos. O teste que compara os dois é o que cai se alguém "simplificar" a regra
um dia.

A fórmula tem três termos — as faces em torno dos próprios eixos, as faces em
torno do eixo do painel (o dominante) e o núcleo —, e duas degenerescências a
conferem por inteiro: **sem núcleo `E*` devolve `Ef`; sem faces, `Ec`**. A
segunda converge mais devagar, porque o termo que sobra anda com
`t·Ef / (c·Ec)`; o teste usa um `t` menor em vez de uma tolerância maior, senão
esconderia um erro de fórmula do tamanho do próprio termo.

**3. Só a razão `t/c` decide, e é isso que torna legítimo tratar o painel como
material.** Escala self-similar não move nem `ρ*` nem `E*`. Um índice de
desempenho assume poder reescalar a seção; sob essa liberdade o par `(E*, ρ*)`
do painel fica parado, que é precisamente o que um par de propriedades de
material faz. Sem esse fato, plotar o painel ao lado de sólidos num mapa
compararia coisas diferentes. Por isso a tela **não pede unidade** de espessura:
pedir uma sugeriria que o valor absoluto muda algo.

**4. Resistência é competição entre modos de falha, e o mínimo sobre um
subconjunto é um limite superior.** Um painel falha por escoamento da face, por
cisalhamento do núcleo ou por enrugamento da face, e vale o **menor** dos três.
Só o primeiro é calculável aqui: os outros dois pedem a resistência ao
cisalhamento e o módulo de cisalhamento do núcleo, e o catálogo não tem nenhum
dos dois. Publicar o único modo que se sabe calcular entregaria um teto com cara
de resistência — então o painel **não declara resistência**, com o motivo
escrito. É a recusa do [D-66](#d-66) aplicada a **modo de falha** em vez de a
fase, e pela mesma razão: uma estatística de resumo sobre parte das parcelas
parece um resumo do todo.

**5. Onde existe convenção o número entra; onde não existe, não entra.** Um
painel é **anisotrópico por construção** e o catálogo é isotrópico. Para o
módulo existe uma convenção — "o módulo de um painel" é o de flexão equivalente
—, e o número entra em `modulo_young` com a lei colada na proveniência, que é o
mecanismo do [D-67](#d-67) fazendo exatamente o trabalho para o qual foi feito:
a nota viaja com o valor até a ficha e diz qual módulo é aquele. Para a
condutividade não existe: através da espessura as camadas estão em série e no
plano em paralelo, os dois valores diferem por muito, e escolher uma das
direções em silêncio daria ao leitor a outra. Ela fica declarada ausente. Dureza
também: seria a da face, e dizer isso esconderia que a indentação é um dos modos
de falha.

**6. Os pais são nomeados por papel, não por posição.** "Face" e "núcleo", nunca
"primeiro" e "segundo" — na tela e na mensagem de dado faltante. Trocá-los muda
o resultado inteiro, e um rótulo posicional não diz qual dos dois é a casca fina
e rígida.

**Como se verifica.** Oito mutações, todas apanhadas: trocar `E*` pela regra das
misturas; zerar o termo de eixo paralelo; usar `c` em vez de `c+t` nele;
esquecer a segunda face na fração e na espessura total; misturar custo por
espessura em vez de por massa; chamar o núcleo de "segundo constituinte". A
oitava — dar regra de resistência ao painel — morre **no import**, pelo
`_validate`, porque a propriedade passaria a ter regra *e* motivo de ausência.

**O que se recusou.** Um slug próprio para o módulo de flexão (uma propriedade
que nenhum sólido pode ter apareceria no painel de indicadores como a maior
lacuna do catálogo, que é uma leitura falsa); publicar o escoamento da face como
"a resistência"; escolher uma direção de condutividade em silêncio; e um teto
para as espessuras, já que só a razão entre elas decide.

## D-69 — O dimensionamento do pack é argumento; a química da célula é dado medido

**Contexto.** *Battery Designer* é o item da faixa P4 na matriz do §5 de
[`14-plataforma-selecao.md`](14-plataforma-selecao.md): dado um requisito
elétrico — tensão de barramento, energia útil, potência de pico —, dizer quantas
células em série e em paralelo o atendem, quanto o conjunto pesa, ocupa e custa,
e qual química serve melhor. O módulo chegou por uma branch escrita fora desta
sessão (PR #56), e a pergunta que decidiu o desenho apareceu na primeira leitura
dela: **160 Wh/kg é argumento ou é dado?**

**Decisão.** São duas camadas, e a fronteira entre elas é a mesma que o
[D-64](#d-64) traçou para os casos de carga.

**1. A álgebra mora em código; os números da química, não.** Contagem em série e
em paralelo, fatores de empacotamento e custo nivelado por ciclo são **álgebra**
— verificam-se por revisão, como `units.py` e como as sete derivações de
`load_cases.py`. Energia específica, vida em ciclos e custo por kWh **não**: são
medidas sobre substâncias reais. Escrever `specific_energy=160.0` num literal
Python seria exatamente o que o princípio 1 proíbe — uma propriedade de material
vinda de lugar nenhum que a ferramenta saiba nomear. Então
`app/calculations/battery.py` recebe um `CellSpec` pronto e **nunca procura
nada**; quem procura é o serviço, no catálogo. É o mesmo corte do
[D-57](#d-57): *dado semeado, não schema*.

**2. Tabela própria, e não `Material`.** Uma química de célula não é um material
no sentido deste catálogo, e forçá-la ali quebraria duas coisas que funcionam.
Energia específica, vida em ciclos e custo por kWh são propriedades que **nenhum
outro registro pode ter**: cada uma ficaria em ~0% de cobertura no painel de
indicadores e subiria ao topo do ranking de lacunas, reportando como o maior
buraco do catálogo algo que não é buraco nenhum — o mesmo argumento pelo qual o
[D-68](#d-68) recusou um slug próprio para o módulo de flexão. E as células
entrariam em mapas, estudos de seleção e na tabela de comparação como se fossem
candidatas ao lado do aço e do epóxi. `BatteryChemistry` segue a forma que o
[D-66](#d-66) já aceitou para `TransportMode`: vocabulário fechado, semeado, numa
tabela fora dos dois universos.

**3. Colunas simples, mas a fonte não se abre mão.** O trilho de proveniência
(valor original + unidade original + valor normalizado + unidade canônica +
método de conversão) existe para sobreviver a **importação** e a **digitação**, e
este vocabulário não tem nenhuma das duas no v1 — nove linhas semeadas, em
unidades canônicas, escritas pelo seed e por mais ninguém. O que **não** se
afrouxa é o compromisso do M1: **toda linha nomeia a sua `Source`**, e cada uma
carrega também uma coluna `citation` própria, porque as nove químicas não saíram
todas do mesmo lugar e achatá-las num rótulo único perderia a única informação
que permite conferir um número. A unidade canônica de cada coluna está escrita no
modelo e não é escolha do chamador. Se um dia existir entrada pelo usuário, isto
gradua para a forma de `ProcessAttributeValue` — e a gradação fica sendo decisão
de alguém, não descoberta por bug.

**4. Segurança térmica é rótulo ordinal, nunca número.** `BAIXA < MODERADA <
MEDIA < ALTA < MUITO_ALTA` é texto. Ranquear químicas por "segurança" numa escala
numérica inventada seria uma magnitude que as fontes nunca afirmaram. A ordem
vive no backend, que elege a mais segura do pódio; a tela só traduz o rótulo — e
traduz por `Record` e não por `switch`, para que um sexto rótulo deixe de
compilar em vez de cair num `default` silencioso.

**5. Dinheiro é dito em palavras, como no [D-65](#d-65) — e aqui a moeda é
conhecida.** O custo por kWh do catálogo está em dólares dos Estados Unidos,
que é a moeda em que a literatura de custo de célula cota; o seed diz isso, o
modelo diz isso, e toda superfície que imprime um custo diz isso ao leitor. A
regra do D-65 nunca foi "não imprima moeda": foi **não infira moeda de um
símbolo**. Nomear a moeda que a fonte declarou é relatar; deduzi-la de um cifrão
é inventar. A nota que acompanha os custos também diz que são ordens de grandeza
de comparação entre químicas, não orçamento.

**6. O arquétipo carrega o requisito; os fatores de empacotamento são premissa
de oficina.** Um `ApplicationArchetype` traz tensão, energia, potência, DoD e a
capacidade típica de célula — o *problema*. Os três fatores (mássico,
volumétrico e de custo) são premissa, como a condição de apoio do [D-64](#d-64)
e as premissas de oficina do [D-65](#d-65): entrada **com valor visível**, e
trocar de arquétipo não os mexe. Esconder dois deles — que foi o estado em que a
tela chegou — deixaria dois números dividindo a massa, o volume e o investimento
sem que ninguém os visse.

**7. Química inexistente é 404, e catálogo vazio é recusa escrita.** O serviço lê
a linha **antes** de entrar no cálculo, porque "esta química não existe" é uma
resposta diferente de "estes números não dimensionam" e as duas não podem sair
com o mesmo código. E comparar sobre um catálogo vazio devolve o motivo por
extenso: um pódio vazio leria como "nenhuma química serve", que é uma afirmação
sobre as químicas e não sobre o catálogo — a recusa do [D-66](#d-66) outra vez.

**Como se verifica.** O teste da álgebra constrói a própria célula e **não toca
no catálogo**: amarrá-lo aos números semeados faria uma correção de dado quebrar
a prova da fórmula. Quem confere o catálogo é o teste de API — as nove químicas
vêm do banco e não do código, cada uma declara de onde veio, as nove citações
são distintas, o conjunto não se declara fictício, e um slug inexistente volta
404 com o slug escrito. Na tela, as fixturas são **tipadas pelos tipos
compartilhados**: a primeira versão desta página foi escrita contra um contrato
imaginado — `cell_nominal_voltage_v`, rótulos térmicos em inglês — e os testes
passavam porque afirmavam o mesmo engano que o código.

**O que se recusou.** Pôr as químicas em `Material` (item 2); um `reference:
str` obrigatório no esquema de saída em vez de `citation`/`source` anuláveis com
rótulo escrito quando faltam (D-24); uma escala numérica de segurança térmica;
`toFixed` para o custo nivelado, que sempre escreve ponto e poria o mesmo glifo
como milhar numa coluna e decimal na seguinte (D-30); e — do PR #56 — as 122
exclusões de `Cérebro/`, o `submeter_pr.bat` e uma segunda implementação de
painel sanduíche, que teria criado as duas verdades que o [D-68](#d-68) existe
para impedir.

## D-70 — A unidade de leitura é propriedade da propriedade, e ler não é guardar

**Contexto.** `Unidades de exibição` era a última linha abaixo de 3 na matriz do
§5 de [`14-plataforma-selecao.md`](14-plataforma-selecao.md). O
[B11](TODO.md) já tinha consertado a metade tipográfica — o documento imprimia
`kg/m**3` onde a tela imprimia `kg/m³` —, mas a linha media outra coisa: se o
usuário pode **escolher** em que unidade lê. Não podia. A ficha mostrava o
módulo de Young como `210000000000`.

**Decisão.**

**1. Ler não é guardar, e a assimetria é o alicerce.** `to_canonical` roda uma
vez, quando um número entra, e devolve um par: o valor e a **trilha**
(`pint:GPa->Pa`). `from_canonical` roda toda vez que alguém olha, e devolve só
um número. Emitir uma trilha na saída poria passos de leitura num campo que
promete descrever **origem**, e um leitor trocando Pa por MPa pareceria ter
aplicado uma segunda conversão ao dado. O valor gravado, a unidade original e
`conversion_method` nunca se movem.

**2. A unidade de leitura é propriedade da propriedade, não da dimensão.** É a
decisão que o dado impôs, contra a hipótese inicial. `modulo_young`,
`limite_escoamento` e `resistencia_tracao` têm a **mesma** dimensão —
`[mass]/[length]/[time]**2` — e ninguém as lê na mesma unidade: módulo é GPa,
resistência é MPa. Uma tabela com "210000 MPa" ao lado de "250 MPa" estaria
tecnicamente correta e seria ilegível. Por isso a convenção mora em
`PropertyDefinition.display_unit`, ao lado de `better_direction` e
`allows_log_scale` — a mesma espécie de fato: algo que se sabe sobre a grandeza,
não sobre o registro nem sobre quem está olhando. `NULL` é resposta legítima
("lê-se como está guardada"), não configuração faltando: cinco das doze
propriedades têm convenção, as outras não.

**3. A escolha do leitor é parâmetro da pergunta, e vive na URL.** Nunca numa
linha de usuário, pela razão que o [D-63](#d-63) fixou para o registro de
referência: uma preferência guardada no servidor faria a mesma URL desenhar duas
tabelas diferentes para duas pessoas, e um documento exportado a partir dela
deixaria de ser reproduzível pelo próprio link. Unidade fora de `accepted_units`
é **recusada com as admitidas escritas** (D-56), e a recusa é 400 e não 500 —
ela chega pela URL, então é entrada do cliente como qualquer outra.

**4. A leitura é acrescentada, nunca substitui.** Esta foi a segunda correção que
o dado impôs: `value_scalar` guarda **o que a fonte disse**, na unidade dela, e
não o canônico. Reescrevê-lo apagaria o registro. Então os campos `display_*`
saem **ao lado**, e quem audita continua vendo os dois. Um documento exportado
carrega as **três** unidades de propósito — a de leitura no cabeçalho da tabela,
a canônica na folha de proveniência e a exata dentro do método de conversão —, e
é isso que permite conferir um número lido em g/cm³ contra o que a fonte disse.

**5. Três coisas a leitura não pode tocar**, cada uma com o seu teste:

- **O avaliador de índices.** Um índice é definido sobre slugs canônicos; se uma
  unidade de leitura chegasse lá, `sqrt(modulo_young)/densidade` mudaria de valor
  conforme a tela em que foi aberto, e continuaria parecendo plausível.
- **A diferença percentual.** Ela só existe em escala de razão
  (`units.is_ratio_scale`), e essa pergunta é feita à unidade **canônica**.
  `temp_max_servico` é canônica em kelvin: lida em °C, "o dobro da temperatura"
  viraria uma afirmação falsa com toda a autoridade de um número calculado. A
  leitura é resolvida *ao lado* de `ratio_scale`, e nunca dentro dele. O teste é
  de **invariância**: a mesma comparação, lida em duas unidades, devolve
  exatamente a mesma coluna.
- **Uma incerteza.** Ela é **diferença** e não valor absoluto: ±5 K lidos em °C
  são ±5 °C, não ±(−268,15). Daí `from_canonical_delta`, espelho de
  `to_canonical_delta`. O número errado apareceria ao lado de uma temperatura
  que converteu certo, e nada na tela pareceria fora do lugar.

**6. No mapa, converte-se no fim — e uma unidade é recusada.** Toda saída
geométrica do mapa é um par de coordenadas (vértices do envelope, extremos da
linha iso-índice, pontos, faixas), e a imagem afim de um par é o par convertido.
Reescalar no fim é exato e deixa intocado o fecho convexo, o ajuste da elipse, a
linha de índice e — o que mais importa — **a comparação que o Chart Stage faz
para reprovar um registro**. O [D-60](#d-60) fez figura e funil concordarem por
construção; converter a montante os separaria, e o funil passaria a reprovar por
um número que a figura não desenha.

E **uma unidade que não é puro fator de escala não entra num mapa**, com a razão
nas notas: kelvin→°C é afim mas não linear, e uma lei de potência só é reta num
eixo logarítmico enquanto a mudança de unidade for multiplicativa —
`log(x − 273,15)` não é `log x` deslocado. A recusa é **do mapa, não da
grandeza**: a ficha continua lendo em °C, porque lá não há eixo logarítmico nem
lei de potência. Duas superfícies, duas respostas, cada uma pela sua razão — o
mesmo padrão do envelope de capacidade do [D-59](#d-59). Um **eixo de índice**
também não converte: a dimensão dele é derivada da expressão e não há unidade de
catálogo para ler (regra do [D-35](#d-35)).

**Como se verifica.** A prova central é a de invariância da diferença
percentual. Ao lado dela: o ida-e-volta exato entre guardar e ler, com a escala
com offset incluída de propósito (é onde um inverso escrito à mão erraria, por
273 unidades — grande demais para passar num teste e pequeno demais para parecer
absurdo numa tela); a ausência atravessando como ausência e nunca como zero; uma
convenção dimensionalmente incompatível recusada **na entrada**, porque ela
imprimiria números plausíveis e falsos em toda a aplicação; e os testes de
gráfico reescritos para afirmar o **invariante** em vez do valor — eixo e pontos
na mesma unidade, o retângulo do intervalo pousando onde o ponto pousa, a linha
vertical caindo sobre a abscissa do material que deu o nível.

**O que se recusou.** Mapear a unidade por **dimensão** (item 2); guardar a
preferência no servidor (item 3); converter `value_scalar` em vez de acrescentar
(item 4); tornar os campos `display_*` opcionais no TypeScript para poupar 38
fixturas de teste — um contrato opcional deixaria uma superfície esquecê-los em
silêncio, que é exatamente como a tela de baterias divergiu do backend; e
embelezar `conversion_method`, que continua guardando `degC` porque é o que o
Pint sabe reler (B11, intacto) mesmo agora que o **rótulo** diz °C.

---

## D-71 — Seed de exercício é módulo separado do seed de teste, de propósito — e "sem erro" não provava que rodava

**O achado.** PR #59 acrescentou 70 materiais fictícios de exercício em
`apps/api/app/db/seed_extended.py` — um módulo com o próprio `main()`,
pensado para rodar com `python -m app.db.seed_extended` depois do seed
principal. Nenhum script chamava esse módulo: nem `scripts/seed.ps1`, nem o
`admin-banco.yml` (a ação `semear` só executava `python -m app.db.seed`),
nem a CI. Os 70 materiais existiam no repositório e nunca existiram em banco
nenhum, de desenvolvimento ou de produção — a auditoria que motivou o
[D-70](#d-70) rodou `semear` contra a produção e reportou sucesso, porque o
script que ela executava de fato terminou sem erro; só não era o script que
continha os materiais.

**Por que dois módulos, e não um só.** Não é acidente que os 70 materiais
ficaram fora de `app.db.seed`: `apps/api/app/tests/conftest.py` chama
`seed()` como base de **todo** teste do backend, e dezenas de asserções em
`apps/api/app/tests/` contam materiais, classes e lacunas por número fixo —
a contagem parte de exatamente 5 materiais de demonstração
(`test_materials_api.py`, `test_dashboard_api.py`, `test_selection_api.py`,
`test_isolation.py`, entre outras). Dobrar esse número para 75 no baseline
de teste quebraria essa faixa inteira de asserções por um motivo que não tem
nada a ver com o que cada teste verifica. A separação do PR #59 estava
certa; o que faltou foi ligar o módulo a alguma coisa que roda.

**A correção.** `admin-banco.yml` (ação `semear`) agora executa os dois, em
sequência — `python -m app.db.seed` primeiro (`seed_extended` lê a
classe/propriedade/fonte que ele cria), `python -m app.db.seed_extended`
depois —, e `scripts/seed.ps1` faz o mesmo para quem semeia localmente.
`seed()` continua intocado, em 5 materiais: a fronteira entre "o que todo
teste vê" e "o que só o catálogo de demonstração tem" é exatamente essa —
um módulo, não um `if ENVIRONMENT == "production"` dentro do mesmo. O stub
`seed_patch.py` (um único docstring, "módulo reservado, não utilizado"),
deixado pelo mesmo PR e nunca importado por nada, foi removido.

**O que isso muda em como se verifica um deploy de dado.** Job verde não é
prova de que o dado certo foi escrito — só de que o script executado não
lançou exceção. `seed()` e `seed_extended_materials()` devolvem (e o `main()`
de cada módulo imprime) a contagem criada por categoria; o log de uma
execução de `semear` mostra essas linhas. `0` onde um merge recente deveria
ter feito crescer um número é o sinal de um módulo desconectado, não de um
seed já aplicado — a diferença só aparece olhando o número, nunca só a cor
do círculo na aba Actions. `docs/13-deploy.md` §5-ter e a tabela de "Falhas
comuns" foram corrigidas para descrever essa verificação, não só "dispare o
workflow".

**O que se recusou.** Dobrar `DEMO_MATERIALS` dentro de `seed()` para eliminar
o segundo módulo — resolveria a integração ao custo de quebrar o baseline de
teste que o próprio PR #59 tinha o cuidado de preservar. Um terceiro
mecanismo (flag de ambiente, tabela de "seeds pendentes") para acoplar os
dois automaticamente — mais uma camada indireta sobre um problema que
`admin-banco.yml` já resolve com duas linhas em sequência.

---

## D-72 — Apagar dado de demonstração é uma pergunta com uma resposta só: a coluna `is_demo`

**A decisão.** `apps/api/app/db/clear_demo.py` (`python -m app.db.clear_demo`,
ação `excluir_demo` de `admin-banco.yml`) apaga todo `Material` com
`is_demo=True`, não importa em qual módulo de seed a linha foi definida.
Nasceu do mesmo incidente do [D-71](#d-71): se um dado fictício pode viver em
mais de um arquivo (`app.db.seed` e `app.db.seed_extended`, por uma razão de
teste que continua válida), **apagá-lo não pode depender de lembrar quais
arquivos existem** — só depende de uma coluna que já é a declaração de que a
linha é fictícia (princípio 6). Um humano pediu, nestes termos: não quero
dificuldade para apagar isto quando for a hora dos materiais oficiais.

**Por que uma exclusão de verdade, e não a desativação que o resto do
catálogo usa.** `DELETE /api/materiais/{id}` sempre fez `is_active=False` —
`material_synthesis.py` documenta por quê: um material real carrega receita
de síntese, estudo salvo, evento de auditoria, e apagar a linha destruiria
essa história sem necessidade. Isso continua certo para material real.
`clear_demo` é uma exceção estreita e nomeada a essa regra, não uma segunda
forma de apagar material: ela só alcança `is_demo=True`, e essa coluna já é a
prova de que não existe história real para proteger ali. As duas regras
coexistem porque respondem perguntas diferentes — "isto pode ter sido usado
de verdade?" (desativar) contra "isto foi sempre fictício?" (apagar) — a
mesma forma de raciocínio que o D-57 usou para não confundir `in_class` com
`in_process`.

**Por que a cascata é escrita em Python, e o schema não basta sozinho.** Todo
`ForeignKey` para `material.id` já declara `ondelete="CASCADE"` ou
`ondelete="SET NULL"` — o Postgres de produção cumpriria isso sem ajuda. Mas
o SQLite dos testes só aplica essas ações com `PRAGMA foreign_keys=ON`, que
`conftest.py` não liga (ligar teria alcance sobre a suíte inteira, para
resolver um problema de um módulo só). Confiar no schema teria deixado
`clear_demo` correto em produção e **inverificável em teste** — a mesma
armadilha que `docs/CLAUDE.md` §10 já registra para migração exercitada só em
SQLite. A solução não é mudar o `PRAGMA` global; é `clear_demo.py` apagar
cada tabela filha explicitamente, na ordem que as chaves exigem — o mesmo
raciocínio que já levou `MaterialRepository.sync_keywords` a um
delete-then-insert em vez de confiar em cascata de relacionamento do ORM.

**O que fica de fora, e por quê.** `MaterialClass`/`Process`/`ProcessClass` —
taxonomia, reutilizável pelo material oficial que ocupar a mesma família.
`BatteryChemistry` e `TransportMode` — dado real de literatura pública
(`is_demo=False`, D-66/D-69), não fictício; a pergunta "isto é demo?" já
responde não. A `Source` "Dataset Demo MaterialSelect" — fica órfã sem custo
algum, e um seed futuro a recria por `get_or_create` se precisar; apagá-la
exigiria decidir se um `MaterialPropertyValue` de material oficial algum dia
citaria essa fonte (nunca citaria) só para economizar uma linha sem
consequência nenhuma de deixar.

**Documentado num lugar que não é só para o Claude Code.**
`docs/15-dados-demonstrativos.md` registra o checklist de como criar dado de
demonstração novo sem repetir o D-71, e como apagá-lo quando chegar a hora —
escrito para qualquer agente ou pessoa que mexer neste repositório, porque
`CLAUDE.md` da raiz já se descreve como instrução para "agentes/contribuidores",
não só para uma ferramenta.

**O que se recusou.** Um campo de confirmação (`"digite EXCLUIR"`) na ação
`excluir_demo` — o pedido foi explícito por menos fricção, não mais, e as
outras ações administrativas do mesmo workflow (`semear` incluído, que também
escreve em produção) não têm esse campo; adicionar um só nesta quebraria a
uniformidade sem um motivo que as outras não tivessem. Apagar
`MaterialClass`/`Source`/`BatteryChemistry`/`TransportMode` junto — nenhum
dos quatro é fictício por definição, e apagar taxonomia reutilizável
obrigaria o catálogo oficial a recriá-la do zero.

---

## D-73 — MSDS (design system da Artifact): tokens de cor por rota entram, o resto fica para outra rodada

**O pedido.** Uma sessão separada de 8 rodadas construiu, inteiramente dentro
de uma Claude Artifact e sem nunca tocar este repositório, um design system
próprio ("MSDS") — biblioteca de componentes, folha de ícones M3, paleta
tonal por rota do NavRail e um hook de física de mola. O usuário pediu que
esse trabalho fosse portado para `apps/web` de verdade, revogando D-23 ("sem
biblioteca de componentes") especificamente para o MSDS, do mesmo jeito que
D-48 já abriu uma exceção pontual para `@material/web`.

**O que esta sessão entregou: só a extensão do mecanismo de cor por rota**
(D-49) de 6 para as **16** rotas reais de `components/layout/AppSidebar.tsx`
— os 9 blocos `[data-section="…"]` novos (`dimensionar`, `custo`, `eco`,
`baterias`, `processos`, `sintetizar`, `meus-registros`, `classes`,
`propriedades`) em `apps/web/app/globals.css`, mais `lib/design/sections.ts`
atualizado com os 16 `SectionId`. Todo o resto do pedido — a biblioteca de
componentes em si (`bundle.js`/`bundle.css`/`index.d.ts` do MSDS), a troca de
ícones, a reescrita de `components/ui/*` e de `AppSidebar.tsx` sobre um
`NavRail` do MSDS, e o hook `useSpring` — **não** foi feito nesta rodada;
ver "o que fica de fora" abaixo.

**Por que os valores de cor não vieram copiados do `tokens.json` do MSDS.**
O plano original previa portar os 16 valores já validados por contraste da
Rodada 8 do MSDS. Mas o gerador que produziu esses valores (CIELCh,
aproximação de HCT/CAM16) não está no material entregue — só o *resultado*
está, em `bundle.css`. Colar hexadecimais sem conseguir re-derivar ou
reconferir o método que os produziu teria violado a regra permanente deste
arquivo: toda cor nova em `globals.css` tem que rastrear a um valor validado,
ou ser validada de novo por quem a escreve. A saída foi reimplementar, a
partir dos próprios *stops* RGB já commitados (as 6 rotas originais de
D-38/D-49), a receita que claramente as gerou — uma escada de luminosidade
OKLCH fixa por degrau `--brand-*`, uma crominância-alvo cortada no gamute
sRGB por matiz, e o tema escuro como a rampa clara lida ao contrário — como
um script pequeno, `scripts/design/generate-route-palette.py`, e usá-lo para
gerar as 9 rotas novas em ângulos de matiz inéditos. `scripts/design/
verify-globals-contrast.py` reconfere as 16 rotas × 2 temas direto do
`globals.css` real (não da saída do gerador) e falha a build se algum par
cair abaixo de 4,5:1; hoje o pior caso é 5,69:1 (claro) / 9,22:1 (escuro).

**Por que os ângulos de matiz não são os do `tokens.json`, nem escolhidos por
igualmente espaçados em OKLCH.** Duas exigências vieram explícitas do
usuário — Eco tem que ler como verde, Custo como laranja — e a Rodada 8 do
MSDS não as garante (o hue dela pra Eco cai perto de amarelo-esverdeado depois
de escurecido para contraste). Espaçar por ângulo OKLCH também não bastou: o
ângulo OKLCH e o matiz HSL percebido não são a mesma escala, sobretudo na
faixa amarelo-verde, e uma primeira tentativa colocou Custo colado em Painel
e Eco colado em Importar apesar de "espaçados" em OKLCH. A escolha final
mede o HSL de *saída* de cada ângulo candidato (a cor depois do corte de
gamute que o contraste exige) e garante ≥15° de separação de toda rota
existente — Eco e Custo primeiro pelo requisito semântico, as outras 7 depois
para preencher os vãos.

**O que fica de fora desta rodada, e por quê não foi tentado pela metade.**
`apps/web/lib/msds/` (o `bundle.js` de ~152 KB e `bundle.css` de ~80 KB
convertidos em módulo ES, com guarda de SSR), a reescrita de
`components/ui/*` (14 arquivos) para delegar ao MSDS mantendo assinatura,
`AppSidebar.tsx` sobre `MSDS.NavRail`/`NavDrawer`, a troca de ícones em
`components/ui/icons.tsx`, e `lib/motion/useSpring.ts` exigem, cada um,
verificação real contra o portão de CI (typecheck/lint/test/build/e2e) depois
de tocar a superfície inteira que os importa — 44 rotas e 72+ arquivos de
componente. Entregar isso pela metade, sem rodar a suíte inteira contra cada
mudança, arriscava exatamente o que este arquivo probe contra: deixar
`npm run build` ou `npm run typecheck` vermelho. Ficam como trabalho
seguinte, um de cada vez, cada um terminando com a suíte verde antes do
próximo começar — o mesmo padrão de "dirigido por subagentes, um item por
vez" que B1–B10 e M5/M6 já usaram neste projeto.

**O que isto significa para D-48.** Nada ainda — `@material/web` continua
cobrindo botão/campo/diálogo/abas/checkbox/radio/select nesta rodada, porque
`components/ui/*` não foi tocado. D-48 só fica parcial ou totalmente
redundante quando a Fase de reescrita de componentes (acima) acontecer, e
esse ponto deve ser revisitado então, não aqui.

## D-74 — MSDS: a biblioteca entra em `lib/msds/`, com dois bugs de origem corrigidos; `components/ui/*` e `AppSidebar` ficam para a próxima rodada

**O que esta sessão entregou, do que D-73 deixou de fora.** `apps/web/lib/msds/`
existe agora: `msds.tsx` (o `bundle.js` inteiro — ~2600 linhas, Button até
`ContainerTransformDemo` — convertido de IIFE que lia `window.React` para
módulo ES com `import * as React from "react"`), `icons.tsx` (a função
`Icon(name)`, ~32 glifos redesenhados na Rodada 6, extraída para arquivo
próprio como `msdsIcon`), `msds.css` (o `bundle.css` de ~1400 linhas, portado
quase byte a byte) e `index.ts` (o barril — `export * from "./msds"` +
`msdsIcon`). `msds.css` é importado uma vez, de `app/layout.tsx`, depois de
`globals.css`.

**O que ainda não foi tocado, deliberadamente.** `components/ui/*` (as ~20
primitivas que hoje envolvem `@material/web`), `components/layout/
AppSidebar.tsx` sobre `NavRail`/`NavDrawer`, a substituição de path data em
`components/ui/icons.tsx`, e `lib/motion/useSpring.ts` como arquivo próprio
(o `useSpring`/`SPRING` do MSDS já existe, mas dentro de `lib/msds/msds.tsx`,
não extraído). A biblioteca portada hoje **não é importada por nenhuma tela
do produto** — é uma dependência nova, testada isoladamente (typecheck, lint,
test, build, spot-check visual em `/` claro e escuro), mas inerte. A razão é
a mesma do D-73: reescrever 44 rotas × 20 arquivos de componente contra o
portão de CI inteiro, numa única rodada já gasta portando e corrigindo a
biblioteca em si, arriscava exatamente o que este arquivo probe contra.
Fica para uma rodada seguinte, um item por vez, com a suíte verde entre cada
um — a mesma disciplina de B1–B10.

**Por que `msds.tsx`/`icons.tsx` carregam `@ts-nocheck`.** São porte mecânico
de módulo, não reescrita: `window.React` → `import`, `function(props)` sem
tipo em ~80 componentes/hooks. Anotar 2600 linhas de JS alheio com tipos
verdadeiros não era um bom uso de uma rodada de acompanhamento limitada, e
`@ts-nocheck` é honesto sobre isso em vez de forçar `any` disperso que só
esconderia o mesmo fato. `index.ts`, o único arquivo que o resto da aplicação
deve importar, não carrega a marca.

**A única mudança funcional real: SSR.** O bundle nasceu numa Artifact, que
nunca roda no servidor; o Next 16 renderiza este módulo no servidor primeiro.
Auditoria de todo acesso a `window`/`document`/`matchMedia` no arquivo achou
um ponto de risco real — `prefersReducedMotion()`, chamado tanto de
manipuladores de evento quanto de corpos de `useEffect` (os dois só rodam no
cliente, portanto já seguros) quanto potencialmente de render direto — e
ganhou `typeof window === "undefined"` na entrada. Todo outro acesso a
`window` no arquivo já vivia dentro de um `useEffect` ou de um manipulador de
evento; nenhum guard adicional foi necessário além desse.

**Dois bugs reais no material de origem, achados e corrigidos, não só
copiados.** (1) `bundle.css` tinha um comentário CSS que se fechava sozinho:
o trecho documentando `outline/surface*/ink*/edge*/cat-*` continha as
sequências `*/` e `/*` adjacentes (um asterisco de "qualquer sufixo" seguido
da barra que separa os nomes), o que fecha um comentário `/* */` no primeiro
`*/` que aparece — a regra é literal em CSS, sem aninhamento. O comentário
real terminava três linhas depois; tudo entre o fechamento acidental e o
fechamento pretendido virou CSS de verdade aos olhos de qualquer parser
real, não só do minificador do Next. Isto **não é uma peculiaridade do
`cssnano-simple`** que só apareceu em produção — é um bug que já existia no
arquivo entregue e que teria quebrado a mesma regra em qualquer navegador;
o build de produção só foi onde ele *apareceu* primeiro, porque o parser de
desenvolvimento (`postcss` completo, via `next dev`) é mais tolerante e
segue até o `*/` certo mesmo depois de um falso positivo, enquanto o parser
simplificado do build de produção não. Corrigido inserindo um espaço nas
três ocorrências (`surface*/ink*` → `surface* /ink*`, etc.), preservando o
texto. (2) Nenhum outro comentário do arquivo tinha o mesmo padrão — conferido
programaticamente (contagem de `/*` vs `*/`, depois busca por
`[caractere não-espaço]*/[caractere não-espaço]` no arquivo inteiro).

**Reconciliação de tokens CSS — o ponto que a tarefa avisou para checar antes
de duplicar.** `msds.css` usa `var(--nome)` como **valor CSS direto**
(`color: var(--ink)`, `background: var(--surface-100)`). Todo token de cor
existente em `globals.css` é uma **tripla "R G B" crua** (`--ink: 23 26 33`),
consumida só via `rgb(var(--ink) / <alpha>)` pelo Tailwind — os dois formatos
não são intercambiáveis sob o mesmo nome. A resolução, em duas partes:

1. Todo nome de token que já existe no app com o mesmo significado (`accent`,
   `accent-fg`, `brand-50/100/200/700/800`, `danger*`, `edge*`, `info*`,
   `ink*`, `quality-*`, `success*`, `warning*`) foi **reusado, nunca
   duplicado**: em `lib/msds/msds.css`, todo `var(--x)` desses nomes foi
   reescrito para `rgb(var(--x))` (ou `rgb(var(--x) / alpha)` quando já havia
   um alfa), mecanicamente, preservando qualquer *fallback* existente
   (`var(--row-accent, var(--accent))` virou
   `var(--row-accent, rgb(var(--accent)))`).
2. Todo nome que o MSDS espera e o app não tinha (`--surface-100/200/300`,
   `--primary`/`--secondary`/`--tertiary` + `-container` + `on-*`,
   `--radius-card/control/panel/seat/xl/full`, `--space-2..5`,
   `--shadow-card/float/glow/overlay/raised`, `--row-accent`) ganhou um bloco
   de ponte em `app/globals.css`, dentro do `:root` de base — não uma cor
   nova: `--surface-100/200/300` apontam para `rgb(var(--surface))` /
   `--surface-raised` / `--surface-sunken` já existentes; `--primary` até
   `--on-tertiary` apontam para `--md-sys-color-primary` etc., o esquema M3
   por seção já medido por contraste em D-49/D-73 (é literalmente o mesmo
   papel de cor que o `@material/web` já usa, só por outro nome); as duas
   exceções sem contraparte exata (`--tertiary-container`,
   `--on-tertiary-container`, que `--md-sys-color-*` nunca precisou definir)
   reusam `--brand-100`/`--ink` em vez de introduzir um hexadecimal novo e
   não medido; `--radius-*` e `--space-*` espelham a escala já existente em
   `tailwind.config.ts` (`borderRadius`, `spacing` padrão do Tailwind) em vez
   de abrir uma segunda escala; `--shadow-*` copia as strings de `boxShadow`
   já existentes. **Nenhuma cor nova, não validada por contraste, foi
   introduzida** — a regra permanente deste arquivo continua de pé. Como os
   tokens de ponte são `var()`/`rgb(var())` sobre os originais (nunca uma
   cópia estática do valor), eles herdam automaticamente qualquer override
   de tema (`[data-theme="dark"]`) ou de seção (`[data-section="…"]") sem
   precisar de um bloco de ponte por seção.

`app/layout.tsx` importa `../lib/msds/msds.css` logo depois de `./globals.css`,
para que o bloco de ponte já esteja na cascata antes de qualquer regra
`.msds-*` o ler.

**Verificação.** `npm run typecheck`, `npm run lint` (0 erros — os avisos
pré-existentes de `MaterialForm.tsx` e os novos avisos de
`react-hooks/exhaustive-deps` dentro de `msds.tsx`, esperados num porte
mecânico de hooks que a regra não foi desenhada para ler, não bloqueiam),
`npm run test` (388 testes, nenhum tocado — nada em `components/ui/*` ou
`app/**` mudou de comportamento) e `npm run build` (valida também que o alias
do Plotly de D-51 continua resolvendo) passam. `npm run start` + Chromium
(`/opt/pw-browsers/chromium`, via `playwright-core`) confirmou `/` renderiza
sem `pageerror` em tema claro e escuro, com `background-color` do `<body>`
diferente entre os dois — a cascata de tokens de seção/tema continua viva
depois da importação do CSS novo. Playwright e2e (`apps/web/e2e/`) não foi
tentado nesta rodada por já ter budget consumido pela investigação acima;
fica na mesma situação que D-73 registrou (proxy bloqueava a instalação do
Chromium do Playwright em si — o binário usado no spot-check é um Chromium
de sistema achado em `/opt/pw-browsers/`, não o gerenciado pelo Playwright).

**O que isto significa para D-48 e para a próxima rodada.** Ainda nada — como
em D-73, `@material/web` continua cobrindo as primitivas porque
`components/ui/*` não foi tocado. A próxima rodada é: reescrever cada arquivo
de `components/ui/*` para delegar a `lib/msds`, mantendo assinatura de export
e prop; substituir o path data em `components/ui/icons.tsx` pelos ~16 glifos
que têm equivalente direto no `msdsIcon` (home, map/compare, catalog/grid,
filter, layers, ruler, leaf, battery, check, close, menu, search, plus,
chevronDown, dashboard→gauge); reconstruir `AppSidebar.tsx` sobre
`NavRail`/`NavDrawer` preservando `--rail-accent` e o colapso existente; e só
então revisitar se D-48 fica redundante.

## D-75 — MSDS: os glifos entram em `icons.tsx`; `components/ui/*` e `AppSidebar` continuam para outra rodada

**O que esta sessão entregou, do que D-74 deixou de fora.** Só a primeira das
três frentes que D-74 apontou como próximo passo: o path data de 20 dos 39
ícones de `components/ui/icons.tsx` foi substituído pelo desenho
correspondente de `msdsIcon(name)` (Rodada 6 do MSDS), **mantendo o nome do
export, a assinatura de props e o wrapper `<Svg>` existente** — nenhum
site de chamada mudou. `components/ui/*` (as ~20 primitivas que hoje
envolvem `@material/web`) e a reconstrução de `AppSidebar.tsx` sobre
`NavRail`/`NavDrawer` **não foram tocados nesta rodada** — ver a razão no
parágrafo de escopo abaixo.

**A tabela de mapeamento**, verificada lendo os `case`s de
`lib/msds/icons.tsx` e os exports de `components/ui/icons.tsx` lado a lado,
não presumindo o esboço do relatório de D-74 como completo (ele estava certo
em 15 dos 16 pares que listou, mas "map" mapeia para `IconScatter` — o ícone
da rota `/app/mapas`, cujo conceito é literalmente "mapa" mesmo com o glifo
do MSDS sendo um pino de localização e não um scatter plot — e não havia um
`IconMap` para receber o nome):

| `msdsIcon` | export em `icons.tsx` | nota |
|---|---|---|
| `home` | `IconHome` | vira glifo preenchido (`fill="currentColor" stroke="none"`) |
| `map` | `IconScatter` | rota `/app/mapas`; pino, não scatter — a rota chama-se "mapa" |
| `compare` | `IconCompare` | |
| `catalog`/`grid` | `IconGrid` | usado o `case "grid"` (mais recente); `IconGrid` só era usado em `/app/estilo`, não na navegação (`IconBook` continua a cobrir a rota do catálogo — sem contraparte no MSDS) |
| `dashboard` | `IconGauge` | rota `/app/painel` |
| `import` | `IconUpload` | seta do MSDS aponta para baixo (glifo de origem, não corrigido aqui) |
| `check` | `IconCheck` | |
| `close` | `IconClose` | |
| `menu` | `IconMenu` | |
| `search` | `IconSearch` | |
| `plus` | `IconPlus` | |
| `chevronDown` | `IconChevronDown` | |
| `chevronRight` | `IconChevronRight` | |
| `alert` | `IconWarning` | vira glifo preenchido com furo em `var(--surface-200)`, igual ao original do MSDS |
| `filter` | `IconFilter` | vira glifo preenchido |
| `ruler` | `IconRuler` | |
| `leaf` | `IconLeaf` | |
| `battery` | `IconBattery` | vira glifo preenchido, com o indicador de carga em `var(--surface-200)` |
| `layers` | `IconLayers` | |
| `star`/`starOutline` | `IconStar` | os dois `case`s do MSDS têm o mesmo `d`; a variante preenchida/contorno já era resolvida pela prop `filled` existente, então só o `d` mudou |

**Ícones sem par, deixados intocados, com o motivo**: `IconInfo`, `IconDanger`,
`IconSun`, `IconMoon`, `IconMonitor`, `IconExternal`, `IconArrowRight`,
`IconArrowLeft`, `IconTrash`, `IconDownload`, `IconTable`, `IconBook`,
`IconBlend`, `IconPanelLeft`, `IconLogout`, `IconQualityMeasured`,
`IconQualityImported`, `IconQualityEstimated`, `IconQualityMissing` — nenhum
tem glifo MSDS que responda ao mesmo conceito (o MSDS não tem "informação",
"perigo", "sol/lua/monitor", "externo", "seta", "lixeira", "baixar", "tabela",
"livro", "mistura", "sair" nem as quatro marcas de qualidade de dado, que são
um vocabulário próprio deste app sem equivalente em nenhum sistema de design
genérico). Do lado do MSDS, `chevrons` (duplo chevron), `minus`, `tag`,
`gear`, `flask`, `bookmark`, `list`, `dots`, `chevronLeft`, `calendar`,
`clock` e `panelRight` também ficaram sem par — nenhum tem um export
correspondente hoje em `icons.tsx` (criar um export novo estava fora do
escopo: a tarefa é substituir path data de ícone existente, não introduzir
glifo novo), e `panelRight`/`chevronLeft` especificamente têm direção oposta
ao que `IconPanelLeft` precisaria (o controle de colapso marca o **lado
esquerdo** do painel).

**`components/ui/*`, `AppSidebar.tsx` e a pergunta sobre D-48 continuam para
a próxima rodada**, pela mesma disciplina de escopo que D-73/D-74 já
registraram: a tarefa completa (~20 arquivos de componente, mais o
`AppSidebar` sobre `NavRail`/`NavDrawer`, mais atualizar `ui.test.tsx` para
o DOM/ARIA que cada componente do MSDS realmente produz, mais Playwright
completo) excede o que esta rodada conseguiu verificar com a mesma disciplina
de "portão verde a cada passo" que as rodadas anteriores mantiveram — e a
regra explícita da tarefa (§4, "prioridade/regra de parada") pede exatamente
isto: entregar o subconjunto que fica totalmente verificado e parar, em vez
de arriscar um diff grande e quebrado. **`@material/web` continua em uso**
em todo `components/ui/*` — nenhum arquivo desse diretório foi tocado —, então
a exceção de D-48 continua válida como estava; não há nada a atualizar ali
nesta rodada.

**Verificação.** `npm run typecheck` (limpo), `npm run lint` (0 erros — os
mesmos avisos pré-existentes de `MaterialForm.tsx` e de `lib/msds/msds.tsx`
de D-74, nada novo), `npm run test` (388 testes, todos verdes — nenhum
tocado, porque a troca de path data não muda export, prop nem estrutura DOM
fora do conteúdo interno do `<svg>`) e `npm run build` (23 rotas, sucesso).
Nenhum teste precisou de atualização porque `ui.test.tsx` não asserta contra
`d` de `<path>`. E2E do Playwright não foi tentado nesta rodada — a mudança
não toca nenhum seletor, comportamento ou rota que os specs exercitam, e o
mesmo bloqueio de proxy das duas rodadas anteriores (instalação do Chromium
gerenciado pelo Playwright) continua de pé; o escopo entregue não justificou
reabrir a investigação do Chromium de sistema (`/opt/pw-browsers/`) que D-74
já documentou como contorno disponível para quando `components/ui/*` de fato
mudar de comportamento visual ou de DOM.

## D-76 — MSDS: `Button`/`ButtonLink` passam a renderizar MSDS por dentro; um bug de nascença em `msds.tsx` é corrigido; o resto de `components/ui/*` fica documentado, não convertido

**Escopo entregue.** De `components/ui/*`, só `Button.tsx` foi convertido —
e parcialmente: `Button` e `ButtonLink` agora renderizam a `Button` do MSDS
(ou suas classes CSS, no caso de `ButtonLink`); `IconButton`, `ButtonGroup`/
`ButtonGroupItem` e `ToggleChip`, no mesmo arquivo, continuam sobre
`@material/web`, cada um com uma incompatibilidade de API concreta
registrada no próprio arquivo (resumo abaixo). Nenhum outro arquivo de
`components/ui/*` foi tocado. A conversão de `Card.tsx`, `Badge.tsx`,
`DataQualityBadge.tsx`, `Dialog.tsx`, `Tabs.tsx`, `Field.tsx`,
`Breadcrumb.tsx`, `Stepper.tsx`, `Popover.tsx`, `Feedback.tsx`, `Bar.tsx`,
`Alert.tsx` e `Table.tsx` **não foi tentada nesta rodada** — a mesma
disciplina de "portão verde a cada passo, parar em vez de arriscar um diff
grande" que D-75 já registrou, mais o tempo que o bug de nascença abaixo
consumiu antes de qualquer componente de aplicação poder sequer importar de
`@/lib/msds`.

**Um bug real em `lib/msds/msds.tsx`, encontrado ao tentar usá-lo pela
primeira vez.** O barril de re-exports no fim do arquivo era
`export const { Button, IconButton, ... } = api;` — uma desestruturação que
tenta declarar um *novo* `const Button` (e assim por diante, para todo nome
da lista) no mesmo escopo de módulo que já tem `function Button(props)
{...}`. Duas declarações do mesmo nome no mesmo escopo top-level é
`SyntaxError` em ECMAScript de verdade, não só uma reclamação do
TypeScript que o `@ts-nocheck` do arquivo pudesse encobrir — e foi
exatamente isso que aconteceu: `tsc --noEmit` ficou quieto porque
`@ts-nocheck` também desliga o diagnóstico de identificador duplicado do
TypeScript para este arquivo, mas o esbuild do Vitest/Vite faz o parse de
verdade e recusou construir o módulo na primeira vez que algo importou de
`@/lib/msds` — o que nunca tinha acontecido antes: `icons.tsx` (usado desde
D-75) não importa `msds.tsx`, e nenhum componente de aplicação importava a
barril até este `Button.tsx`. O defeito era latente desde D-74. Corrigido
trocando a desestruturação por uma lista simples de reexport
(`export { Button, IconButton, ... };`), que marca as ligações **já
existentes** (as mesmas `function Button`, etc.) como exportadas em vez de
tentar declarar novas — mesmo nome, mesmo valor, sem redeclaração.

Corrigir esse bug teve um efeito colateral que também precisou de correção:
uma vez que o arquivo passou a fazer parse completo, as regras do ESLint
React Compiler (`react-hooks/refs`, `react-hooks/immutability`) — que antes
abortavam a análise em silêncio no mesmo erro de sintaxe — passaram a
enxergar o resto do arquivo pela primeira vez, e encontraram 34 violações
reais dentro dos componentes de demonstração do próprio bundle vendorizado
(`ContainerTransformDemo`, `ScreenTransitionDemo`, e o uso interno de refs
da família Dialog/BottomSheet/Popover/Menu/SideSheet/DatePicker) — padrões
que já existiam no Artifact de origem e que reescrever linha a linha
contradiria o propósito de D-74 (porte mecânico de wiring, não reescrita de
comportamento). Silenciadas com um `eslint-disable` no topo do arquivo, na
mesma granularidade que `@ts-nocheck` já usa para o arquivo inteiro —
`react-hooks/exhaustive-deps` continua como aviso (não erro), sem mudança:
já existia antes desta sessão e o portão de lint nunca dependeu dele.

**`Button`/`ButtonLink` — o que foi traduzido.** O vocabulário de variante/
tamanho do MSDS (`msds-btn-{primary,secondary,ghost,danger,link}` ×
`{sm,md}`, em `lib/msds/msds.css`) já bate um-para-um com
`ButtonVariant`/`ButtonSize` deste app, inclusive o sublinhado da variante
`link`, que o MSDS já embute em `.msds-btn-link` — nenhuma classe extra
precisou ser recriada, ao contrário do mapeamento anterior para
`@material/web`. Três traduções reais:
- **`icon`**: a `Button` do MSDS não tem prop `icon` — só desenha os dois
  glifos que já conhece (spinner de `loading`, check de `state="success"`);
  um prop `icon` chegaria ao `rest` spread dela e pousaria como atributo
  inválido no `<button>` real. `icon` nunca é passado à `Button` do MSDS;
  vira um `<span>` decorativo entre os filhos, para não competir com o
  `text-overflow: ellipsis` de `.msds-btn-label`.
- **`ref`**: a `Button` do MSDS é função simples, não `forwardRef` — nunca
  recebe `ref` de verdade em React 18. Nenhum call site deste app lê ref de
  `Button` (confirmado por grep antes da reescrita); o parâmetro continua
  aceito por compatibilidade de tipo e intencionalmente não repassado.
- **`ButtonLink`**: a `Button` do MSDS não tem prop `as`/polimórfica — é
  sempre um `<button>` (`h("button", ...)`, checado em `msds.tsx` antes
  desta decisão). Renderizar um link através dela produziria um botão
  envolvendo um link ou um link se passando por botão — a regressão de
  acessibilidade que a tarefa nomeou explicitamente. Em vez disso,
  `ButtonLink` renderiza um `<a>`/`Link` de verdade, estilizado com as
  classes CSS `.msds-btn`/`.msds-btn-{variant}`/`.msds-btn-{size}` do MSDS
  em vez de chamar a função componente — mesma linguagem visual, semântica
  de link real. O que se perde contra `<MsdsButton>`: o ripple de ponteiro e
  o morph de forma ao pressionar, dois hooks internos
  (`useRipple`/`useShapeMorph`) que o MSDS não exporta do seu barril — um
  floreio cosmético, não uma diferença de correção ou acessibilidade.

**O que ficou em `@material/web`, e por quê, cada um com o motivo escrito no
próprio arquivo:**
- **`IconButton`**: o `IconButton` do MSDS recebe `iconOn`/`iconOff` como
  **nomes** de um vocabulário fechado (`msdsIcon(name)`, um `switch` fixo em
  `lib/msds/icons.tsx`) e sempre desenha um desses — não tem encaixe para um
  `ReactNode` arbitrário. O `icon` deste app é sempre um componente de ícone
  já importado de `components/ui/icons.tsx`; os ~15 call sites passam cerca
  de uma dúzia de ícones diferentes, nenhum nomeável no `switch` do MSDS sem
  estender aquele arquivo vendorizado (fora do escopo de uma tradução em
  wrapper) ou construir uma tabela de nomes — o que não é tradução de API, é
  um segundo conjunto de ícones.
- **`ButtonGroup`/`ButtonGroupItem`**: `ButtonGroup` deste app é um
  componente composto (contêiner + filhos `ButtonGroupItem`, cada um com seu
  próprio `selected`/`onClick`/`label`/`icon`); o `ButtonGroup` do MSDS
  recebe um array plano `options: {value, label}[]` mais um par
  `value`/`onChange`, sem `icon` por opção nem atributo ARIA extra.
  `ThemeToggle.tsx` (fora do escopo desta rodada, e ele mesmo deixado
  intocado pela instrução da tarefa) depende exatamente do que a forma do
  MSDS descarta: seu modo `compact` desenha um botão segmentado só-ícone
  (`label=""` mais um `aria-label` de verdade) — reduzir ao array do MSDS
  perderia o ícone ou deixaria um botão sem nome acessível.
- **`ToggleChip`**: o `Chip` do MSDS não tem tratamento de `disabled`
  nenhum — checado em `msds.tsx` antes desta decisão, seu `onClick` dispara
  independente de qualquer prop `disabled`. `/app/comparar` usa
  `disabled={!chosen && materialsFull}` para impedir de verdade que o
  leitor selecione além do teto de comparação, não só para acinzentar;
  ligar esse chip ao `Chip` do MSDS descartaria esse limite em silêncio.

**`DataQualityBadge.tsx` — considerado e recusado, pela regra D-24.** O
`DataQualityBadge` do MSDS já usa exatamente os quatro tokens de cor deste
projeto (`--quality-{medido,importado,estimado,ausente}`, incluindo a borda
tracejada de "ausente") e sempre emite o rótulo escrito — a âncora que a
tarefa pediu para verificar está de fato presente. Mas o glifo do MSDS é um
ponto colorido **da mesma forma** para os quatro estados (um círculo cheio,
exceto o tracejado de "ausente"); a implementação atual deste app usa quatro
ícones com **formas diferentes** (`IconQualityMeasured` = check,
`IconQualityImported` = seta para dentro, `IconQualityEstimated` = onda,
`IconQualityMissing` = círculo tracejado com corte), justamente para que a
distinção sobreviva sem cor — um leitor com daltonismo ou uma impressão
monocromática ainda distingue por forma. Trocar pelo glifo do MSDS
regrediria esse segundo canal, o que o padrão de parada da tarefa proíbe
explicitamente ("se uma conversão comprometeria D-24, não faça essa
conversão"). Deixado intocado.

**`Card.tsx`, `Badge.tsx` — não tentados, e por quê.** Nenhum dos dois usa
`@material/web` hoje — já são Tailwind bespoke, então não há exceção de
D-48 a fechar ali. `Card`/`CardHeader`/`Section` deste app carregam props
sem equivalente no MSDS (`as` polimórfico, `riseIndex` com a animação
escalonada, `headingLevel` para o esboço do documento, `actions` no
cabeçalho) que uma conversão perderia ou teria que reimplementar por fora —
mais superfície do que uma tradução em wrapper justifica numa rodada já
consumida pelo bug de `msds.tsx`. O `Badge` do MSDS, por sua vez, ignora
qualquer prop além de `tone`/`children` (sem `className`, sem `title`, sem
slot de ícone) — `DemoDataBadge.tsx` usa `title`, `AppSidebar.tsx` (fora de
escopo) usa `className`; oferecer os três exigiria um `<span>` externo só
para carregá-los, uma casca sem função visual. Nenhum dos dois foi
convertido nesta rodada; ficam para a próxima, com a mesma disciplina.

**Verificação, por passo.**
1. Depois de reescrever só `Button.tsx` (antes do bug de `msds.tsx` ser
   corrigido): `npm run typecheck` limpo; `npm run test -- components/ui/
   ui.test.tsx` falhou com o `SyntaxError` de identificador duplicado
   descrito acima — o que expôs o bug.
2. Corrigido o barril de `msds.tsx`: `npm run test -- components/ui/
   ui.test.tsx` — 21 testes verdes (dois reescritos: a suíte de `Button`
   trocou `findByShadowRole`/o host do shadow root por `getByRole` direto
   no `<button>` real, e `data-aria-busy` — a reescrita do mixin de
   aria-delegation do `@material/web` — pelo `aria-busy` real que a `Button`
   do MSDS escreve no elemento).
3. `npm run lint`: 34 erros novos, todos dentro de `lib/msds/msds.tsx`
   (`react-hooks/refs`/`react-hooks/immutability`, ver acima) — corrigidos
   com o `eslint-disable` de arquivo; depois, 0 erros, 21 avisos (os mesmos
   pré-existentes de D-74/D-75, nenhum novo).
4. `npm run test` (suíte completa): 388 testes, 1 falha —
   `components/selection/StageList.test.tsx` › "refuses to remove the last
   remaining stage", que consultava o texto do botão "Remover" por
   `getByShadowText` e chamava `toBeDisabled()` no `<span
   class="msds-btn-label">` que o continha — um `<span>` nunca é
   "disabled" para o `jest-dom`, disabled ou não seu ancestral `<button>`.
   Reescrito para `getByRole("button", { name: ... })`, que resolve o
   `<button>` real. Depois: 388 testes, 0 falhas.
5. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
   (rodados de novo, todos juntos, como confirmação final): limpo, 0
   erros/0 falhas, 23 rotas construídas com sucesso.
6. Verificação ao vivo: `npm run build` + `npm run start`, Chromium de
   sistema (`/opt/pw-browsers/chromium` via `playwright-core`, o mesmo
   contorno que D-74 documentou) contra `/` (pública, dois `ButtonLink` no
   herói mais um no cabeçalho, um deles com ícone) e `/app/estilo` (atrás do
   portão de login — sem API rodando nesta sessão, caiu no `ErrorState` da
   tela, cujo botão "Tentar novamente" é o `Button` convertido). Claro e
   legível nos dois temas (`prefers-color-scheme`), pílula com o raio de
   `.msds-btn`, contraste de texto correto, ícone de seta visível no CTA da
   home; nenhum erro de console além de `ERR_CONNECTION_REFUSED`/404 da API
   ausente, esperado sem backend.

**`@material/web` continua importado** em `Button.tsx` (`MdIconButton`,
`MdFilterChip`, `MdOutlinedSegmentedButton`, `MdOutlinedSegmentedButtonSet`,
para `IconButton`/`ButtonGroup`/`ButtonGroupItem`/`ToggleChip`) e em todo o
resto de `components/ui/*` — nenhum outro arquivo foi tocado. A exceção de
D-48 continua cobrindo exatamente isso.

Nada foi commitado nem enviado por esta sessão (o repositório orquestrador
revisa o diff); `apps/api` e `AppSidebar.tsx` não foram tocados.

## D-77 — MSDS: `Dialog`/`Tabs`/`Field`/`Breadcrumb`/`Stepper` convertidos; nenhum delega para a função MSDS crua, cada um por um motivo diferente

**Escopo entregue.** Os cinco arquivos que D-76 recomendou como próxima
rodada foram convertidos, nesta ordem, cada um com o portão completo
(`typecheck`/`lint`/`test`/`build`) rodado individualmente antes do
seguinte: `Dialog.tsx`, `Tabs.tsx`, `Field.tsx`, `Breadcrumb.tsx`,
`Stepper.tsx`. Todos os cinco removeram `@material/web` por completo — o
único arquivo de `components/ui/*` que ainda o importa é `Button.tsx`
(`IconButton`/`ButtonGroup`/`ToggleChip`, já documentado em D-76) e
`ConstraintEditor.tsx` (o `<select multiple>` nativo, exceção deliberada,
inalterada). Nenhum dos cinco delega para a função exportada por
`lib/msds/msds.tsx` do mesmo nome — cada um tem um motivo concreto e
verificado, não uma preferência de estilo; só `Dialog` chegou perto de um
porte 1:1.

**`Dialog.tsx` — o único que de fato passou a renderizar a `Dialog` do MSDS
por dentro.** A `Dialog` do MSDS (`lib/msds/msds.tsx`, `useFocusTrap`
portado em D-74) tem foco preso, Escape fecha e foco volta ao gatilho —
verificado ao vivo nesta sessão, não presumido do porte: seu próprio
`useFocusTrap` foca o primeiro elemento focável em ordem do DOM ao abrir, o
que agora é o `IconButton` "Fechar" do próprio cabeçalho do MSDS (antes era
o conteúdo, porque a versão em `md-dialog` não tinha botão de fechar
nenhum) — uma mudança real de comportamento, confirmada e testada, não uma
regressão. Duas traduções: `description` (que este app tem e o MSDS não)
vira um `<p>` prefixado ao `children`, no mesmo lugar de sempre; `className`
(que nenhum call site usa hoje) fica no tipo por estabilidade de assinatura
e nunca é repassado, mesmo tratamento que `Button.tsx` já dá a um `ref`
não-encaminhado. O corpo do diálogo encolheu de largura livre para
`max-width: 420px` (`.msds-dialog`, `msds.css`) — a mesma adoção da
linguagem visual do MSDS que já valia para `Button`.

**`Tabs.tsx`, `Field.tsx`, `Breadcrumb.tsx`, `Stepper.tsx` — MSDS por
classe CSS, não pela função.** A função vendorizada de cada um tem uma
lacuna concreta contra o que este app já garantia, e delegar a ela
reabriria um bug já corrigido ou derrubaria uma funcionalidade real —
exatamente o padrão que `ButtonLink` já estabeleceu em D-76 (estilo do MSDS
via classe, semântica própria via elemento nativo), agora estendido a
quatro arquivos:

- **`Tabs`**: a `Tabs` do MSDS não liga aba a painel (`role="tab"` sem
  `id`/`aria-controls`, `role="tabpanel"` sem `id`/`aria-labelledby`) — o
  bug exato que o teste "links the selected tab to a panel that exists" foi
  escrito para fixar ("the panel used to be a sibling component with its
  own id, so `aria-controls` referred to nothing at all"), e só trata
  ArrowLeft/ArrowRight, sem Home/End (também testado). Delegar reabriria os
  dois. Reescrito com a própria marcação — ids, `aria-controls`/
  `aria-labelledby`, roving `tabIndex`, o padrão de teclado completo — e só
  as classes `.msds-tablist`/`.msds-tab`/`.msds-tabpanel` emprestadas do
  MSDS. Perdido contra a função do MSDS: a transição fade-through
  (`useScreenTransition`) e o ripple por aba — nenhum exportado do barril
  para reúso fora de `msds.tsx`, e os dois cosméticos.
- **`Field.tsx`**: a maior conversão e a de maior risco real. `Input`/
  `NumberInput`/`Textarea`/`Select`/`Checkbox`/`RadioGroup` do MSDS são
  controlados (`onChange: (value: string) => void`, nunca um evento), sem
  `ref` e sem `...rest` — o que já bastaria para perder `aria-label` (o
  `Select` de `AhpMatrixInput.tsx`, nomeado só pela célula da tabela, "per
  Input's own documented aria-label exception") em silêncio, mas o achado
  que decidiu a conversão foi outro: `MaterialForm.tsx` — o maior
  formulário real do app, cadastro de material — encadeia **todo** campo
  por `{...register("name")}` do react-hook-form, que entrega `name`,
  `onChange(event)`/`onBlur(event)` reais e um `ref` para leitura
  não-controlada e foco em erro de validação. Passar o `onChange(event)` do
  `register()` direto para o `onChange(value: string)` do MSDS quebraria em
  runtime na primeira tecla (`event.target` de uma string é `undefined`) —
  a "forma de onChange" que a tarefa pediu para verificar, verificada e
  reprovada. Reescrito com `<input>`/`<select>`/`<textarea>`/`<option>`
  nativos, `forwardRef`, `...rest` completo e `onChange` como evento real —
  exatamente o que já havia, só sobre `@material/web` antes — e as classes
  `.msds-field`/`.msds-field-label`/`.msds-control`/`.msds-field-hint`/
  `.msds-checkbox`/`.msds-radio` em vez das classes Tailwind que o arquivo
  escolhia à mão. Um ganho real e não-cosmético saiu de graça: o rótulo
  passou de flutuante (dentro da borda, truque do `@material/web`) para
  fixo acima do controle (convenção do MSDS), e o workaround
  `tabIndex={disabled ? -1 : 0}` — só existia porque o `<input>` do
  `md-outlined-text-field` vivia atrás de um shadow root que o jsdom não
  delega foco através — não tem mais nada para contornar contra um
  `<input>` nativo disabled, então saiu. `Field`/`useWiring`/`CONTROL`
  (a exceção do `<select multiple>` de `ConstraintEditor.tsx`) e `Fieldset`
  não usavam `@material/web` e ficaram como estavam. Efeito colateral:
  `lib/testing/mwc.ts` (`selectMwcOption`/`setMwcTextField`) ficou sem
  nenhum consumidor — apagado, não deixado como vestígio (a mesma disciplina
  do `seed_patch.py` em D-71) — e onze arquivos de teste que dependiam dele
  passaram a usar `userEvent.selectOptions`/`userEvent.clear`+`type`
  diretos contra o `<select>`/`<input>` real, mais simples do que o
  contorno que existia só por causa do shadow DOM.
- **`Breadcrumb`**: o `Breadcrumb` do MSDS nunca navega de verdade — todo
  item não-atual é `<a href="#" onClick={(e) => { e.preventDefault();
  it.onClick() }}>`, nunca um `href` real — e os três call sites reais
  (`catalogo/[slug]`, `processos/[slug]`, `processos/familia/[slug]`) só
  passam `href`, contando com clique do meio, "abrir em nova aba" e
  prefetch do `next/link`; a função do MSDS também não usa `<ol>`/`<li>`
  (uma sequência de `<a>`/`<span>` sem lista) e ignora a prop `label` do
  chamador, sempre emitindo seu próprio `aria-label` fixo. `<nav>`/`<ol>`/
  `<li>`, `next/link` de verdade e o `label` configurável ficaram como
  estavam; só `.msds-breadcrumb`/`.msds-breadcrumb-link`/
  `.msds-breadcrumb-current`/`.msds-breadcrumb-sep` substituem as classes
  Tailwind anteriores.
- **`Stepper`**: o `Stepper` do MSDS é um `<ol>` somente leitura — sem
  `<button>`, sem `onClick`, sem jeito de o leitor pular de etapa —, e os
  dois call sites reais (`/app/selecao`, `/app/importar`) dependem
  exatamente disso via `onSelect`. Também é uma linha do tempo estritamente
  vertical (conector `::before` dimensionado para coluna), enquanto este
  componente é uma fileira responsiva de etapas de largura igual acima do
  conteúdo do assistente. A estrutura de `<button>` por etapa — clique,
  `disabled` na etapa bloqueada, `aria-current="step"`, `title`/texto
  `sr-only` para quem não tem cor nem forma — ficou como estava; só a cor da
  bolinha de cada etapa (antes, classes Tailwind escolhidas à mão por
  status) passou a reproduzir a mesma fórmula de cor que
  `.msds-step-dot[data-state=…]` expressa. Não pôde usar a própria classe
  MSDS com o seletor `data-state` do CSS porque `lib/msds/msds.css` é
  importado depois de `globals.css` (`app/layout.tsx`, de propósito — ver
  D-74) — o que, à mesma especificidade, faz a regra do MSDS ganhar de uma
  utility Tailwind concorrente na ordem da folha de estilo, não o inverso.
  Por isso a cor por estado é `style` inline (a única coisa que a ordem da
  folha não derruba), lendo os mesmos tokens (`--success`/`--accent`/
  `--warning`/`--accent-fg`) que a regra do MSDS lê.

**Verificação, por arquivo — os quatro comandos rodados individualmente
depois de cada arquivo, antes de seguir para o próximo, mais a suíte
inteira ao final:**
1. `Dialog.tsx`: `typecheck` limpo; os dois testes de `describe("Dialog")`
   em `ui.test.tsx` reescritos para a marcação real do MSDS (sem shadow
   root: `getByRole` em vez de `getByShadowRole`, e o foco inicial pousa no
   `IconButton` "Fechar", não mais no wrapper de conteúdo) — 2 testes
   verdes; `lint` 0 erros/21 avisos (a mesma base de D-76); `test` 388/388;
   `build` 23 rotas.
2. `Tabs.tsx`: `typecheck` limpo; os dois testes de `describe("Tabs")`
   passaram **sem alteração nenhuma** — a prova de que a marcação/ARIA/
   teclado ficaram idênticos ao que já havia; `lint`/`test`/`build` limpos
   (388/388, 23 rotas).
3. `Field.tsx`: `typecheck` limpo depois de trocar os tipos de `ref` para
   os elementos nativos (`HTMLInputElement`/`HTMLSelectElement`/
   `HTMLTextAreaElement`/`HTMLOptionElement`). `test` revelou, na primeira
   rodada, 29 falhas em 11 arquivos — todas `host.select is not a function`
   (`selectMwcOption` contra um `<select>` real) ou `md-select-option`
   ausente do DOM (dois helpers de teste, `optionTexts` em
   `ConstraintEditor.test.tsx`/`StageList.test.tsx`, que liam a tag do
   elemento custom diretamente). Corrigidos: onze arquivos passaram a usar
   `userEvent.selectOptions`/`clear`+`type` nativos, os dois helpers
   passaram a consultar `option` em vez de `md-select-option`,
   `lib/testing/mwc.ts` apagado (zero consumidores restantes). Depois:
   `test` 388/388; `lint` 0 erros/21 avisos; `build` 23 rotas.
4. `Breadcrumb.tsx`: `typecheck` limpo; `test` 388/388 sem nenhuma alteração
   de teste (nenhum teste dedicado a `Breadcrumb` existia além do que
   `estilo`/`catalogo`/`processos` já exercitavam indiretamente, e nenhum
   quebrou); `lint`/`build` limpos.
5. `Stepper.tsx`: `typecheck` limpo; `test` 388/388 sem alteração de teste;
   `lint`/`build` limpos.
6. Suíte completa, rodada de novo ao final como confirmação: `typecheck`
   limpo; `lint` 0 erros/21 avisos (os mesmos de D-76, nenhum novo);
   `test` 388/388; `build` 23 rotas, sucesso.
7. Verificação ao vivo: `npm run build` + `npm run start`, Chromium de
   sistema (`/opt/pw-browsers/chromium` via `playwright-core`) contra
   `/app/estilo` em claro e escuro. Sem API nem sessão configuradas nesta
   sessão, a rota cai no mesmo `ErrorState` que D-76 já documentou (o
   portão de login por trás de `/app/*` não tem contorno de bypass) — sem
   nenhum erro de console além dos esperados de rede ausente, nos dois
   temas. A vitrine viva de `Dialog`/`Tabs`/`Field`/`Breadcrumb`/`Stepper`
   em `/app/estilo` **não foi verificada com sessão real** nesta rodada
   (exigiria subir `apps/api` com um venv, o que esta sessão não tinha
   pronto) — a cobertura de comportamento real vem da suíte de testes
   (foco/Escape/Tab do Dialog, ARIA/teclado do Tabs, `axe` no Dialog aberto)
   e do `build` de produção, não de uma captura de tela autenticada.

Nada foi commitado nem enviado por esta sessão (o repositório orquestrador
revisa o diff); `apps/api`, `AppSidebar.tsx`, `Card.tsx` e `Badge.tsx` não
foram tocados.

## D-78 — MSDS: `Card`/`Badge` restilizados sem delegar; `Feedback` convertido
em parte, um bug real de cor achado e revertido ao vivo; `Popover`/`Bar`/
`Alert`/`Table`/o resto de `Button` ficam documentados, não convertidos

**Escopo entregue.** Quatro arquivos foram alterados, cada um com o portão
completo (`typecheck`/`lint`/`test`/`build`) rodado individualmente antes do
seguinte: `Card.tsx`, `Badge.tsx`, `Feedback.tsx` e o teste que a mudança de
`Feedback.tsx` obrigou a atualizar (`app/app/catalogo/catalogo.test.tsx`).
Quatro outros arquivos — `Popover.tsx`, `Bar.tsx`, `Alert.tsx`, `Table.tsx` —
e o restante de `Button.tsx` (`IconButton`/`ButtonGroup`/`ButtonGroupItem`/
`ToggleChip`, já documentados em D-76) foram deixados como estavam, cada um
por um motivo verificado contra o código real, não por falta de tempo.

**`Card.tsx` — classes MSDS sobre marcação própria, sem delegar para a
função `Card`/`Card.Header`/`Card.Body`/`Card.Footer` do MSDS.** `Card`
precisa de `as` polimórfico — `components/selection/ConstraintEditor.tsx`
renderiza `<Card as="fieldset">`, agrupando controles de formulário, uma
exigência semântica e não cosmética — e a `Card` do MSDS
(`lib/msds/msds.tsx`) é sempre um `<div>` fixo, sem prop `as` nenhuma.
`CardHeader` precisa de `headingLevel` variável (2/3/4, ~30 call sites reais:
`AIAssistPanel.tsx`, `app/app/baterias/page.tsx` etc.) e de um slot
`actions` (~20 arquivos), e a `CardHeader` do MSDS só desenha `title`/
`description` num `<h3>` fixo sem lugar para ações. `riseIndex` (entrada
escalonada, `MaterialCards.tsx`, `CoverageSummary.tsx` ×2,
`meus-registros/page.tsx`) também não existe do lado MSDS. As quatro
funções continuam com a marcação de sempre; só as classes Tailwind viraram
`.msds-card`/`.msds-card-header`/`.msds-card-title`/`.msds-card-desc`/
`.msds-card-body`/`.msds-card-footer` (`lib/msds/msds.css`). `riseIndex`
continua sendo a animação própria do app (`rise` + `animationDelay`
inline), independente do MSDS. `PanelShell`/`Section` — sem conceito
equivalente no MSDS — ficaram intocados.

**`Badge.tsx` — mesmo padrão.** A `Badge` do MSDS só aceita `tone`/
`children`; call sites reais precisam de `className`
(`components/layout/AppSidebar.tsx` — arquivo não tocado, mas o componente
`Badge` continua tendo que servi-lo — e `components/dashboard/
CoverageSummary.tsx`) e `title` (`components/DemoDataBadge.tsx`). A função
`Badge` continua um `<span>` próprio com `title`/`icon`/`children`; só as
classes de tom viraram `msds-badge msds-badge-{tone}` — os seis tons
existem idênticos dos dois lados (`neutral/brand/success/warning/danger/
info`, `lib/msds/msds.css:131-140`). `ClassBadge` (selo com swatch de cor
categórica Okabe–Ito, sem equivalente MSDS) manteve sua lógica de dot
própria e passou a herdar a casca `msds-badge msds-badge-neutral` por
consistência visual — decisão de polimento, não obrigatória.

**`Feedback.tsx` — conversão parcial, com um bug real achado e revertido ao
vivo, não só planejado.** `Spinner` passou a renderizar `CircularProgress`
do MSDS (indeterminado) em vez de `MdCircularProgress` do `@material/web`
— removeu o único import de `@material/web` do arquivo. Como a
`CircularProgress` do MSDS só lê `size`/`strokeWidth`/`value`/`label`/
`showValue` do seu objeto de props (confirmado lendo `lib/msds/msds.tsx`),
um `aria-hidden` passado a ela é descartado em silêncio — por isso
`aria-hidden` foi movido para o `<span>` que a envolve, removendo a
subárvore inteira da árvore de acessibilidade quando não há `label`; sem
esse ajuste o `axe` reprovou `/app/painel` com "ARIA progressbar nodes must
have an accessible name" (achado pela própria suíte, `routes.a11y.test.tsx`).
`Skeleton` manteve marcação/props (`className` ainda controla o tamanho) e
só trocou a animação de pulso Tailwind pelo shimmer `.msds-skeleton`.
`LoadingState` **não** foi delegado ao `LoadingState` do MSDS: o do MSDS
desenha três linhas de esqueleto fixas e nunca mostra texto visível (só
`aria-label`), enquanto ~29 call sites reais passam um `label` visível que
tem que continuar na tela — delegar apagaria esse texto, a mesma classe de
regressão que D-24 proíbe para dado ausente, agora sobre um estado de
carregamento. `ErrorState` foi delegado ao MSDS: `title`/`description`
batem diretamente, e o `action` do MSDS recebe o `Button` que o arquivo já
construía a partir de `onRetry`; `role="alert"` (que a marcação do MSDS não
define) foi restaurado num `<div>` por fora.

**`EmptyState` foi delegado, testado ao vivo e revertido — o achado real
desta rodada.** A versão inicial delegava ao `EmptyState` do MSDS, que
sempre desenha sua própria arte decorativa (`EmptyStateArt`, um SVG com três
formas). Um spot-check com o Chromium de sistema contra `npm run start`
(`/app/estilo`, claro e escuro) mostrou as três formas em **preto sólido**
nos dois temas, em vez do azul de marca esperado. Causa: `EmptyStateArt`
usa `fill: "var(--brand-100)"` / `"var(--brand-300)"` / `"var(--accent)"`
puros, e os tokens deste app (`app/globals.css`) são triplos `"R G B"` sem
unidade, lidos sempre por `rgb(var(--x))` — nunca sozinhos. Um `var(--x)`
bruto não é uma cor CSS válida, então o navegador cai no preto padrão de
`fill`. Fabricar uma cor nova para contornar isso violaria a restrição do
projeto de nunca inventar cor sem validar contraste; a saída foi reverter
`EmptyState` para a marcação própria (ícone `IconInfo` por padrão, ou o
`icon` do chamador — a prop continua na assinatura e com efeito, ao
contrário do que a primeira tentativa documentava) e só emprestar as
classes de layout `.msds-state`/`.msds-state-title`/`.msds-state-desc` —
não a classe `.msds-state-icon`, que fixa `color: rgb(var(--danger))` e
tingiria de vermelho um ícone neutro de estado vazio. Isto reproduz o
mesmo layout ícone-à-esquerda/texto-à-direita que `ErrorState` ganhou, sem
passar pela arte quebrada. Nenhum dos ~23 call sites reais de `EmptyState`
usa `className` ou `icon` custom hoje (confirmado por grep antes e depois
da reversão), então a régua de risco era baixa mesmo com o susto.

**Verificação, por arquivo — os quatro comandos rodados individualmente
depois de cada arquivo, antes de seguir para o próximo:**
1. `Card.tsx`: `typecheck` limpo; `lint` 0 erros/21 avisos (a mesma base de
   D-73–D-77); `test` 388/388 sem nenhuma asserção tocada; `build` 23 rotas.
2. `Badge.tsx`: mesmos quatro comandos, mesmo resultado (`typecheck` limpo,
   `lint` 0/21, `test` 388/388, `build` 23 rotas) — nenhum teste depende da
   classe Tailwind antiga de `Badge`/`ClassBadge`.
3. `Feedback.tsx` (primeira passada, `EmptyState` ainda delegado):
   `typecheck` limpo; `lint` 0/21; `test` **2 falhas** — `routes.a11y.test.tsx`
   (`aria-progressbar-name` em `/app/painel`, corrigido movendo
   `aria-hidden` para o wrapper do `Spinner`) e
   `app/app/catalogo/catalogo.test.tsx` ("offers a way out when the filters
   leave nothing on screen", corrigido porque `.closest("div")` a partir do
   texto do título agora resolve para `.msds-state-title` — um `<div>` no
   MSDS, onde antes era um `<p>` — em vez do container inteiro; ajustado
   para `.closest(".msds-state")`, documentado no próprio teste); depois das
   duas correções, `test` 388/388, `build` 23 rotas.
4. `Feedback.tsx` (segunda passada, `EmptyState` revertido após o
   spot-check visual): `typecheck` limpo; `lint` 0/21; `test` 388/388;
   `build` 23 rotas.
5. Verificação ao vivo: API local (`apps/api/scripts/e2e_server.py`, SQLite
   descartável, `ENVIRONMENT=development` + `E2E_SESSION_TOKEN` para semear
   a sessão fixa de D-77) na porta 8000 (a mesma que `NEXT_PUBLIC_API_URL`
   assume por padrão) + `npm run build` + `npm run start`, Chromium de
   sistema (`/opt/pw-browsers/chromium-1194` via `playwright-core`) com o
   cookie `msai_session` injetado, contra `/app/estilo` (claro e escuro) e
   `/app/catalogo` (autenticado). Foi essa verificação — não os testes, que
   não asserram cor — que achou o bug de `EmptyStateArt` acima; depois da
   reversão, capturas em claro e escuro confirmam `EmptyState`/`ErrorState`/
   `Card`/`Badge`/`ClassBadge` corretos nos dois temas.

**`Popover.tsx` — não convertido (`Popover` e `Disclosure`).** O único
consumidor real de `Popover` é `components/ui/ProvenancePopover.tsx`,
sempre dentro de célula de tabela ou de prosa
(`PropertyGroup.tsx`, `ComparisonView.tsx`, `processos/[slug]/page.tsx`). O
próprio docstring do arquivo explica por que existe portal
(`createPortal` para `document.body`): sem ele, o painel seria cortado pelo
`overflow-x: auto` do container de tabela. O `Popover` do MSDS
(`lib/msds/msds.tsx:1432-1445`) não usa portal — `.msds-popover` é
`position: absolute` dentro do próprio wrapper — cairia exatamente nessa
armadilha. `Disclosure` envolve `<details>` nativo; o MSDS não tem conceito
de acordeão/disclosure. Nenhum dos dois usos reais é um menu de ações, então
`Menu` do MSDS também não se aplica. Mesma classe de decisão que
Field/Breadcrumb em D-77 (a função vendorizada tem uma lacuna real).

**`Bar.tsx` — não convertido.** Sem `@material/web` para remover (já era
Tailwind/CSS puro). O `LinearProgress` do MSDS fixa a cor em `--accent`
(`lib/msds/msds.css:609`) e não tem `delay`. Call sites reais precisam de
cor arbitrária da paleta Okabe–Ito (`app/app/estilo/page.tsx:461,468,475`:
`color="bg-[#0072B2]"` etc.) e de `delay` para entrada escalonada —
exatamente o que a seção de sistema de design deste `CLAUDE.md` marca como
"paleta categórica... não é da marca e não se mexe".

**`Alert.tsx` — não convertido.** Sem `@material/web` para remover.
`lib/msds/index.ts` não expõe nenhum banner/alerta persistente — só
`Toast`/`ToastStack`, transitórios e dispensáveis por desenho
(`msds-toast.is-leaving`, `dismiss()`). O propósito de `Alert` aqui é o
oposto: avisos permanentes (dado de demonstração, limite de uso do §3.6)
que não podem ser dispensados — a mesma distinção que D-76 fez entre
`Chip`/`ToggleChip`.

**`Table.tsx` — não convertido.** O MSDS só tem `DataTable`, um componente
de render-prop (`columns`/`rows`/`render`), forma diferente das primitivas
por elemento (`Table/THead/TBody/Tr/Td/Th/RowHeader/TableScroll/
TableCaption`) usadas em dezenas de tabelas reais com `thead` `sticky`,
`scope="row"` em `RowHeader`, `data-numeric` para alinhamento e região de
scroll nomeada. Reimplementar essas tabelas sobre `DataTable` mudaria
semântica em massa — alto risco para D-31 ("todo gráfico tem tabela como
alternativa textual"), baixo retorno; documentado em vez de tentado, dado o
orçamento já gasto no achado de `EmptyState` acima.

**`Button.tsx` — `IconButton`/`ButtonGroup`/`ButtonGroupItem`/`ToggleChip`
reexaminados, mantidos.** As três razões do D-76 foram checadas de novo
contra `lib/msds/msds.tsx` nesta sessão, sem meio-termo novo: `IconButton`
do MSDS usa `iconOn`/`iconOff` como nomes de um vocabulário fechado
(`msdsIcon()`), nunca um `ReactNode` arbitrário, e os ~15 call sites do app
passam ícones já importados de `components/ui/icons.tsx`; `ButtonGroup` do
MSDS recebe um array chato `options: {value,label}[]` sem ícone por opção, e
`ThemeToggle.tsx` depende do modo `compact` (segmento só-ícone) que essa
forma não carrega; `Chip` do MSDS (`lib/msds/msds.tsx:417-452`) nunca lê
`props.disabled` — `onClick` dispara sempre —, e `/app/comparar` depende de
`disabled={!chosen && materialsFull}` bloquear de fato o clique no limite
de comparação. Os quatro continuam exatamente como D-76 os deixou.

Nada foi commitado nem enviado por esta sessão (o repositório orquestrador
revisa o diff); `apps/api` (só executado localmente, como servidor
descartável, para o spot-check — nenhum arquivo dele foi editado) e
`AppSidebar.tsx` não foram tocados.

## D-79 — MSDS: `AppSidebar.tsx` reconstruído sobre a linguagem visual do `NavRail`/`NavDrawer`; nenhum dos dois é usado por dentro; `@material/web` continua load-bearing

**Escopo entregue.** Um arquivo só, `components/layout/AppSidebar.tsx` — o
último item que D-73 apontou como próxima rodada. `NavLink`/`NavGroupList`
passaram a usar o vocabulário CSS do MSDS (`.msds-rail-item`,
`.msds-rail-icon`, `.msds-rail-label`, `.msds-rail-eyebrow`, em
`lib/msds/msds.css`) em vez das classes Tailwind que o arquivo escrevia à
mão; nada além disso mudou — mesmos 17 destinos, mesmos três grupos
(`t.groupStudy`/`t.groupData`/`t.groupAdmin`), mesmo `<Link>` do
`next/link`, mesmo `useFocusTrap` próprio do app na gaveta modal, mesma
regra de `sr-only` no colapso.

**Por que nenhum dos dois — `NavRail`/`NavDrawer` — foi delegado, com a
lacuna concreta de cada um.** A mesma disciplina de D-76/D-77/D-78: delegar
onde a função vendorizada cobre tudo que o app já garante, restilizar com a
classe onde não cobre.

1. **`NavRail` (`lib/msds/msds.tsx`) não navega de verdade.** Cada item é um
   `h("button", { onClick: () => props.onSelect(item.key) })` — nunca um
   `<a href>`. É exatamente a classe de defeito que o `Breadcrumb` do D-77
   já tinha (`<a href="#" onClick={preventDefault}>`): sem `href` real, o
   leitor perde clique do meio, "abrir em nova aba", prefetch do
   `next/link` e a navegação por teclado nativa de um link — uma
   regressão de acessibilidade e de funcionalidade real, não cosmética,
   e inaceitável num componente renderizado em toda rota autenticada.
   Verificado lendo `NavRailItemButton` (`lib/msds/msds.tsx:516-530`) antes
   de decidir, não presumido.
2. **`NavRail`/`msdsIcon` têm um vocabulário fechado de ícones que não cobre
   dois destinos reais.** A tabela de D-75 já registrou que `IconBook`
   (Catálogo) e `IconBlend` (Sintetizar) não têm par no `msdsIcon(name)` do
   MSDS — estender aquele `switch` vendorizado para dois glifos novos estava
   fora do escopo desta tradução em wrapper, a mesma régua que D-75/D-76 já
   aplicaram a outros ícones sem par.
3. **`NavDrawer` (`lib/msds/msds.tsx:2109-2124`) não aceita conteúdo
   próprio.** Ele sempre chama `h(NavRail, Object.assign({}, props.navProps,
   {...}))` por dentro — não há slot de `children`. Mesmo que só o item (1)
   bloqueasse a delegação, o `NavDrawer` não teria como hospedar uma lista
   de navegação com `<Link>` reais em vez do `NavRail` que ele mesmo
   constrói. A gaveta modal deste app continua com a própria marcação
   (`role="dialog"`, `aria-modal`, backdrop clicável, `useFocusTrap` — que já
   prende foco, fecha com Escape e devolve foco ao gatilho, testado ao vivo
   nesta sessão) — só os itens de navegação por dentro dela passaram a usar
   `.msds-rail-item`/`.msds-rail-icon`/`.msds-rail-label`, o mesmo componente
   `NavLink`/`NavGroupList` compartilhado com o rail.

Por isso o `<aside id="navegacao-lateral">`/`<nav>` continuam com sua própria
marcação — nunca a classe `.msds-rail` do MSDS, que impõe fundo escuro fixo
(`#0E1017`, redundante com o `--rail`/`--rail-ink` já tonalizados por tema
que este arquivo já tinha, mas **não** o mesmo valor sob controle de tema),
`border-radius: var(--radius-panel)` (arredondaria os quatro cantos de um
rail que corre até a borda da tela — errado para um rail de borda, certo
para um painel flutuante) e largura fixa de 248px (o rail deste app
transiciona entre `w-64`/`w-[68px]`, e o `!important` que
`.msds-drawer-panel .msds-rail { width: 100% !important }` carrega
entraria em guerra de especificidade com essa transição).

**A cor do item ativo continua sendo o token de rota do D-73, só lido pela
regra do MSDS em vez da própria.** `.msds-rail-item[aria-current="page"]`
(a classe agora emprestada) e seu `::before` (a barra de 3px na borda
esquerda) leem `var(--row-accent, rgb(var(--accent)))` via `color-mix` —
`color-mix` já em uso em `msds.css` desde D-74/D-78 (`.msds-quality-*`, o
próprio `.msds-rail-item`), sem risco novo de suporte de navegador. Nenhuma
cor nova: o `<nav>` do rail e o `<nav>` da gaveta recebem
`style={{ "--row-accent": "rgb(var(--rail-accent))" }}` — o mesmo
`--rail-accent` que D-73 já tonalizou e validou por contraste para as 16
rotas × 2 temas, só entregue ao seletor do MSDS em vez do seletor Tailwind
(`bg-rail-accent/20`/`text-rail-accent`) que o arquivo usava antes. Como
`--row-accent` é uma propriedade customizada, ela herda por toda a subárvore
sem precisar ser repetida por item — um ponto de ajuste só. O ícone do item
ativo ganhou, além disso, `text-rail-accent` (a mesma classe de antes): sem
ela, o `color: #fff` que o MSDS aplica ao item ativo (pensado para um rail
permanentemente escuro, que este é) apagaria o terceiro canal visual que o
comentário original do arquivo já documentava — a cor do ícone seguindo a
rota, ao lado da barra e do preenchimento de fundo.

**O `sr-only` do colapso (D-37) continua sendo o Tailwind do próprio app,
não a regra `[data-collapsed="true"] .msds-rail-label` do MSDS** — que só
dispara sob um ancestral com a classe `.msds-rail`, e este arquivo
deliberadamente não aplica essa classe ao contêiner (parágrafo acima). A
técnica de recorte que o CSS do MSDS usa ali (`position: absolute; width:
1px; height: 1px; clip: rect(0,0,0,0)`) é a mesma receita de `sr-only`, só
não fica acessível pela cadeia de seletor que este arquivo escolheu não
adotar — então a garantia continua vindo de onde sempre veio.

**Verificação.** `npm run typecheck` limpo; `npm run lint` 0 erros/21
avisos (a mesma base de D-73–D-78, nenhum novo); `npm run test` — 388/388,
**nenhum teste tocado ou precisou de ajuste** (`routes.a11y.test.tsx`, que
exercita o rail em todas as rotas, e `components/layout/layout.test.tsx`
passaram sem alteração — a marcação/ARIA real não mudou, só a classe CSS);
`npm run build` — 27 rotas, sucesso.

Verificação ao vivo (a exigida com mais rigor para este arquivo, porque ele
renderiza em toda rota): API local
(`apps/api/scripts/e2e_server.py`, SQLite descartável,
`ENVIRONMENT=development` + `E2E_SESSION_TOKEN`, a mesma receita de D-78) na
porta 8000, `npm run build` + `npm run start`, Chromium de sistema
(`/opt/pw-browsers/chromium-1194` via `playwright-core`) dirigido por um
script descartável (apagado ao final, nunca comitado):

- **Rail em 1440px, tema claro, `/app/selecao`.** 17 links (mais o link da
  marca) resolvidos em `#navegacao-lateral`; os três *eyebrows*
  ("Estudar"/"Dados"/"Administrar") presentes; `aria-current="page"` no link
  de Seleção.
- **Colapso, com árvore de acessibilidade — não só captura visual.** Depois
  de clicar em "Recolher a barra lateral": o link "Mapas" continua
  resolvível por `getByRole("link", { name: "Mapas" })` (nome acessível
  presente); o `<span class="msds-rail-label">` de cada item continua no
  DOM (`count() === 1`, `textContent` intacto) com `boundingBox()`
  `{ width: 1, height: 1 }` — a assinatura exata de `sr-only`, não de um nó
  removido; o `ariaSnapshot()` da `<nav aria-label="Navegação principal">`
  imprimiu os 17 links com seus nomes completos e a estrutura de grupo
  intacta enquanto colapsada — a prova, pela árvore de acessibilidade e não
  pelo pixel, de que D-37 continua de pé.
- **Cor por rota, claro e escuro, quatro rotas incluindo Eco e Custo.** O
  `--row-accent` computado e a cor de fundo do `::before` do item ativo
  variam por rota como esperado (roxo em Seleção, ciano em Mapas, verde em
  Eco, laranja em Custo) nos dois temas; Eco e Custo mostraram o mesmo valor
  entre claro e escuro — conferido contra `app/globals.css` e **não é
  regressão desta rodada**: para essas duas rotas especificamente, o gerador
  de D-73 produziu `--brand-300` (claro) e `--brand-700` (escuro) com o
  mesmo triplo RGB (coincidência do hue, não uma regra geral — Seleção e
  Mapas, na mesma checagem, mostraram valores diferentes entre os dois
  temas, como o resto da matriz).
- **Gaveta modal em 400px.** Abre como `role="dialog"`/`aria-modal="true"`;
  foco entra na gaveta (`document.activeElement` dentro de `#menu-principal`
  logo após o clique); 17 links presentes; Escape fecha (`#menu-principal`
  sai do DOM) **e devolve o foco ao gatilho** (`document.activeElement`
  volta a ser o botão com `aria-controls="menu-principal"`); reaberta e
  fechada por clique no backdrop, mesmo resultado.
- **Console limpo** nos dois viewports e nos dois temas — o único evento
  registrado em todas as passadas foi um 404 de recurso, esperado (favicon
  ou afim) e não relacionado a este arquivo.

Servidor da API e servidor Next de produção, ambos descartáveis, encerrados
ao final da verificação; nenhum arquivo de `apps/api` foi editado.

**Esta é a última peça pendente da integração do MSDS listada por
D-73–D-78.** `AppSidebar.tsx` era o único item que restava nas listas de
"fica para a próxima rodada" desde D-73. Uma varredura de todo `apps/web`
por `@material/web` depois desta mudança encontra só comentários/prosa em
`components/ui/Button.tsx`, `Dialog.tsx`, `Field.tsx`, `Feedback.tsx`,
`focusTrap.ts`, `lib/design/materialTheme.ts`, `components/layout/
SectionTheme.tsx`, `app/globals.css` e cinco arquivos de teste — nenhum
deles um `import` real — **mais os imports reais que já eram esperados**:
`components/ui/material/elements.ts` ainda registra os elementos customizados
do `@material/web`, e `components/ui/Button.tsx` ainda importa
`MdIconButton`/`MdFilterChip`/`MdOutlinedSegmentedButton`/
`MdOutlinedSegmentedButtonSet` de lá para `IconButton`/`ButtonGroup`/
`ButtonGroupItem`/`ToggleChip` — exatamente o que D-76 e D-78 já
documentaram como mantido, com o motivo de cada um ainda de pé (nenhum
motivo dependia de `AppSidebar.tsx`). **A dependência `@material/web` do
`package.json` não pode ser removida** — ela continua load-bearing por esses
quatro componentes. Uma observação fora do escopo desta rodada, não
perseguida aqui: `material/elements.ts` também importa e registra
`MdFilledButton`/`MdOutlinedButton`/`MdTextButton`/`MdCircularProgress`/
`MdOutlinedTextField`/`MdOutlinedSelect`/`MdSelectOption`/`MdCheckbox`/
`MdRadio`/`MdDialog`/`MdTabs`/`MdPrimaryTab` — registros que nenhum
componente de `components/ui/*` mais consome desde as conversões de D-77/
D-78 (`Field`/`Dialog`/`Tabs`/`Feedback` passaram a usar marcação nativa ou
MSDS); podar esses registros mortos reduziria o que o bundle do
`@material/web` ainda carrega, mas é uma limpeza própria, não uma parte de
"reconstruir `AppSidebar.tsx`".

Nada foi commitado nem enviado por esta sessão (o repositório orquestrador
revisa o diff); `apps/api` (só executado localmente, como servidor
descartável, para o spot-check — nenhum arquivo dele foi editado) não foi
tocado.

## D-80 — MSDS aplicado de verdade: uma paleta só, `@material/web` removido, campos que ocupam o grid e as falhas funcionais que o relatório do usuário expôs

**Contexto.** Depois do merge da PR #68 (D-73–D-79), o autor abriu o app no ar
e relatou sete problemas: o "M" da marca ficava preto ao trocar de seção; as
formas não aproveitavam a tela (muito espaço em branco); os gráficos
continuavam os antigos; várias abas estavam "mal otimizadas e bugadas"; ao
clicar no sol do seletor de tema os outros ícones sumiam; a tela Sintetizar
estava "totalmente mal otimizada"; e o pedido de fundo — "aplique
corretamente o design system que projetamos". Cada item foi reproduzido ao
vivo (API e Next descartáveis, Chromium do sandbox) antes de qualquer
correção, e cada um tinha uma causa concreta, não de gosto.

### 1. Duas paletas por rota brigavam, e a errada ganhava

`lib/msds/msds.css` trazia, da Rodada 8 da Artifact, 32 blocos
`:root[data-section=…]` que redefiniam `--accent: var(--primary)` **em hex**.
O app lê `--accent` como triplo `"R G B"` (`rgb(var(--accent))`, D-28); com
hex ali, toda declaração que o usava ficava inválida no tempo de cálculo e
caía no valor inicial — o fundo do "M" (`bg-brand`) virava transparente sobre
o trilho escuro (o "preto" do relato), e os botões primários perdiam o
preenchimento. Como `msds.css` era importado **depois** de `globals.css`, os
blocos da Artifact venciam os de D-73 no empate de especificidade. Os 32
blocos foram removidos; `app/globals.css` (os `[data-section]` gerados e
medidos por contraste em D-73) é a única fonte de cor por rota. Um efeito
colateral que confirma a escolha: na paleta da Artifact, Custo saía
vermelho (`#B12C25`); na de D-73, laranja, como foi validado.

### 2. Ordem de CSS: `msds.css` antes de `globals.css`

A saída do Tailwind 3 não é *layered*, então num empate de especificidade
vence o arquivo carregado por último. Com `msds.css` por último, um
`.msds-*` padrão vencia o utilitário que a chamada passava para refiná-lo
(`w-full`, `text-accent`). `app/layout.tsx` agora importa `msds.css`
primeiro; propriedades customizadas se resolvem no valor computado, então a
ponte de tokens de `globals.css` alcança o `msds.css` em qualquer ordem.

### 3. `@material/web` removido — D-48 deixa de ter objeto

`IconButton`, `ButtonGroup`/`ButtonGroupItem` e `ToggleChip`
(`components/ui/Button.tsx`) eram os últimos usuários reais. Viraram
`<button>` nativos com as classes do MSDS (`.msds-icon-btn-standard`,
`.msds-segmented`/`.msds-segmented-item`, `.msds-chip`), `aria-pressed` no
próprio botão e o *ripple* + a morfologia de pressão do MSDS (`useRipple`/
`useShapeMorph`, agora exportados do barril `@/lib/msds`). As lacunas de API
que D-76 registrou continuam verdadeiras — por isso as **funções** MSDS
desses quatro seguem sem uso —, mas as classes carregam o desenho sem elas.
Dois defeitos de interface tinham a mesma raiz e somem junto:

- **A fonte serifada** nos controles segmentados de Mapas: `@material/web`
  lê `--md-ref-typeface-*`, que este app nunca definiu, e caía no padrão do
  navegador.
- **O seletor de tema "some" ao clicar no sol**: o `md-outlined-segmented-button`
  pinta com `--md-sys-color-on-surface` (escuro), e o trilho é escuro nos dois
  temas. Agora qualquer controle MSDS dentro de `[data-surface="rail"]` lê os
  tokens do trilho (`--rail-ink-muted`, `--rail-accent`) — os mesmos que os
  links de navegação já usavam.

Com zero imports reais restantes, saíram do `package.json` `@material/web`,
`@lit/react`, `lit` e o `element-internals-polyfill` (só existia para os
elementos do MWC em jsdom); `components/ui/material/elements.ts` e seu teste
foram apagados, e os *shims* de `ElementInternals` do `vitest.setup.ts` também.
Os tokens `--md-sys-color-*` ficam: a ponte de D-74 os lê. **D-48 fica sem
objeto** — a exceção a D-23 que resta é a biblioteca interna do MSDS (D-74),
não uma dependência externa.

### 4. `className` num campo volta a estilizar o campo

Depois de D-77, `Input`/`NumberInput`/`Textarea`/`Select` passavam `className`
para o `<input>`, não para o invólucro `.msds-field`. Toda chamada no app
(~30) usava a classe para **layout** — `sm:col-span-2`, `w-40`, `flex-1` —,
que é o que ela fazia sob o `@material/web`, onde o elemento *era* o campo.
Aplicado ao controle, um `col-span` caía num `<input>` dentro de um invólucro
de uma coluna e não fazia nada (Nome do estudo e Variáveis livres em Seleção,
Descrição em Classes), e um `w-40` encolhia a caixa sob um rótulo de largura
inteira. A classe voltou ao invólucro; o limite `max-width: 320px` de
`.msds-field` (herança da Artifact) também saiu — era ele que estreitava os
campos de Seleção no relato.

### 5. Espaço de tela

- A coluna principal de `/app/*` passou de `max-w-6xl` (1152 px) para
  `max-w-screen-2xl` (1536 px) com respiro lateral crescente
  (`px-4 sm:px-6 lg:px-8`): numa tela de 1920 px um terço da janela ficava
  vazio ao lado de um mapa espremido. Texto corrido continua com a própria
  medida (`max-w-prose`).
- As telas de ferramenta (Sintetizar, Dimensionar, Custo, Eco, Baterias) eram
  campos soltos sobre o fundo e um resultado que só aparecia no fim da
  rolagem. Agora cada passo é um `StepCard` (novo em `components/ui/Card.tsx`)
  com a ação no rodapé, e o cartão de resultado está na tela **desde o
  início**, com um estado vazio que diz o que vai aparecer ali — página
  vazia sob dois formulários lia como "não há nada aqui". Sintetizar e
  Dimensionar põem receita e resultado lado a lado a partir de `xl`.
- Escolhas que precisam de uma frase para serem feitas (tipo de síntese,
  índice de desempenho) usam `RadioCard` (novo, `components/ui/RadioCard.tsx`,
  que `IndexPicker` também passou a usar): um `<select>` esconde a regra de
  cada opção até depois da escolha. O `<input>` real cobre o ponto desenhado
  e o ponto ignora o ponteiro, para o clique no ponto ser clique no rádio —
  inclusive para o *hit-target* do Playwright.
- Comparar: a lista de 75 materiais rola na própria caixa (era um muro de
  chips com o dobro da altura da tela), e os dois cartões não se esticam mais
  à mesma altura. Catálogo: os filtros numa linha só. Processos: famílias em
  grade, processos como linhas clicáveis. Meus registros: favoritos e
  recentes lado a lado, em linhas e não cartão dentro de cartão. Mapas:
  "O que desenhar" divide a linha com "Classes exibidas". Seleção: a barra
  "Candidatos restantes" virou um cartão flutuante dentro da coluna (a faixa
  com margem negativa não acompanhava o novo respiro lateral).
- O trilho: 17 destinos em linhas de 38 px deixavam o grupo Administração
  atrás de uma barra de rolagem numa tela de 900 px; no trilho permanente as
  linhas têm 32 px (a gaveta de toque mantém a altura maior), e a barra de
  rolagem, quando existe, é fina e nas cores do trilho.

### 6. Falhas funcionais encontradas no caminho

Nenhuma delas era de layout, e todas estavam em produção:

- **A prévia do Sintetizar nunca rodava.** A API valida o corpo da prévia com
  o mesmo esquema da gravação e recusa `name` vazio (422); o campo de nome só
  aparece *depois* da prévia. A prévia agora manda um nome provisório
  (`"Prévia sem nome"`, nunca gravado). E uma 422 deixou de chegar à tela como
  "Falha na requisição /api/…": `readErrorDetail` (`lib/api.ts`) lê a lista
  de validação do FastAPI como `campo: mensagem`.
- **Dimensionar abria sem nada abaixo do seletor.** O `<select>` mostrava o
  primeiro caso como escolhido enquanto o estado era `""`; só trocar de caso e
  voltar desenhava o resto. O primeiro caso agora é derivado, como o
  material padrão de Custo.
- **Links de material levavam a uma família inexistente.** Dimensionar e Eco
  apontavam para `/app/catalogo/<id>` — rota de *família* por slug —; a ficha
  de um registro é `/app/materiais/<id>`.
- **Eco com material sem processo mostrava um seletor vazio** (ABS, por
  exemplo). D-24: agora diz que não há processo e por que isso impede a
  auditoria.
- **Rótulo duplicado** em Eco ("Processo que faz a peça", "Fim de vida"): um
  `Select`, que já desenha o próprio rótulo, embrulhado num `Field`.
- **Sintetizar:** as notas de tipo chegavam com `**negrito**`/`*itálico*` do
  backend impressos crus; um limite ausente de um par era impresso como `0`
  (`value_min ?? 0`, violação direta de D-24) e agora é `MissingValue`;
  unidades como `kg/m**3` e `(dimensionless)` saem por `prettyUnit` (e a
  adimensional é omitida); a qualidade é o selo de qualidade, não o texto cru.
- `formatNumber` escreve o expoente como sobrescrito (`2,1 × 10¹¹`, não
  `10^11`).
- Classes: a coluna dizia "Slug (opcional)" — o rótulo de um campo que nem
  existe no formulário.
- Importar: o seletor de arquivo nativo imprimia "Choose File / No file
  chosen" em inglês; virou uma área de soltar arquivo que é um `<label>` para
  o mesmo `<input type="file">` (fora da tela, mas no fluxo de tabulação, com
  o anel de foco seguindo-o).

### 7. Gráficos: os desenhos do MSDS entram; os dois mapas ficam no Plotly vestidos de MSDS

As figuras do painel e do comparador passam a ser os desenhos do MSDS
(BarChart, BoxPlot, StatTile, RadarChart, ParallelCoords, Heatmap)
**reimplementados em TSX tipado** em `components/charts/` (`ChartFrame`,
`ChartLegend`, `HorizontalBars`, `BoxPlotChart`, `ComparisonFigures`,
`figureKit`, `figures.css`). As funções vendorizadas **não** são chamadas:
elas pintam com `var(--x)` cru, que neste app é um triplo `"R G B"` e vira
preto (a armadilha de D-78); toda cor passa por `rgb(var(--x))`. Só
`useSpring`/`SPRING` vêm de `@/lib/msds`. São SVG desenhado na largura
medida (`ResizeObserver`), não as `<div>`s do MSDS, porque uma `<div>` não se
exporta como figura.

- **Um cartão só** (`ChartFrame`): título, "Exportar PNG/SVG" e "Ver tabela de
  dados", que troca a figura pela tabela no mesmo lugar. A tabela (D-31) fica
  sempre montada, só oculta.
- **Ausência (D-24) em cada forma:** nas barras, uma pílula "Ausente"
  tracejada; o radar desenha só os materiais completos e lista os outros (o
  `|| 0` do MSDS foi recusado); nas coordenadas paralelas a linha quebra, com
  "N ausentes" sob o eixo; no heatmap a célula é hachurada e a rampa começa em
  `brand-50`, para o pior valor não parecer ausente. Uma classe sem pares diz
  "sem pares", não 0 %.
- **O cliente só escala pixel** (ADR 0004): quartis, percentuais e escores
  normalizados chegam prontos. **Teclado:** um ponto de Tab por figura e setas
  entre as marcas — um heatmap 12×12 seriam 144 paradas.
- **`AshbyMap` e `PropertyChart` continuam no Plotly**, porque precisam de
  log–log, zoom e da caixa do Chart Stage (D-60), que o ScatterMap fixo do MSDS
  não faz. Muda a roupa: fonte de `--font-sans` (antes nomeava Inter, que o app
  nunca carregou), grade nos tokens de borda, contorno fino nos marcadores,
  envelope a 14 %/50 %, *hover* no desenho do tooltip do MSDS e legenda MSDS no
  lugar da do Plotly. A barra de ferramentas do Plotly fica, transparente,
  porque pan, zoom e reset não existem em outro lugar; saem só câmera, laço e
  seleção, que duplicam controles do cartão. `uirevision` preserva o zoom ao
  ligar e desligar classes.
- **Exportação única** (`lib/figureExport.ts`): Plotly e SVG próprio saem com o
  mesmo título, a legenda só das séries ligadas, fundo opaco e as fontes do app
  embutidas; cores computadas, nunca `var(--`; PNG a 2×.
- **O Plotly registra só `scatter`** (`bar`, `box`, `heatmap` e
  `scatterpolar` saíram depois de busca no repositório): o *chunk* dele foi de
  981 KB para 864.731 B, medido no `next build`.

**Três defeitos do D-60, achados ao vivo** (os *mocks* dos testes os
escondiam; dois ganharam teste de regressão): (1) a cada `Plotly.react` a
passada de reseleção reemite `plotly_selected` sem `range`, e o *handler* lia
isso como "limpar" — a região sumia no instante em que era desenhada; (2) em
eixo log o Plotly informa a caixa em unidades de dado, e o código elevava 10
ao valor (2,5 g/cm³ virava 316); (3) no `next dev`, o `react-plotly.js` não
religava `onSelected` depois do duplo *mount* do StrictMode. Com as correções,
uma caixa desenhada fica em `/app/mapas` e preenche o estágio em
`/app/selecao`.

**Pendente quando esta entrada foi escrita, corrigido em [D-81](#d-81):** o mapa
mostra a unidade de leitura (D-70), mas os campos do Chart Stage dizem unidade
canônica — uma caixa desenhada em g/cm³ chegava num campo de kg/m³.

### Verificação

- `npx tsc --noEmit`: limpo. `npm run lint`: 0 erros (os 21 avisos são do
  `lib/msds/msds.tsx` vendorizado, anteriores). `npx vitest run`: 419 testes em
  37 arquivos, todos verdes — incluindo teste novo para cada falha funcional da
  §6 (prévia com nome provisório, caso inicial de Dimensionar, links para
  `/app/materiais/<id>`, Eco sem processo, `readErrorDetail`) e para a seleção
  por caixa do §7. `npm run build`: 23 páginas.
- Ao vivo (API e Next descartáveis, Chromium do *sandbox*): todas as rotas de
  `/app` em 1440 px nos dois temas e em 375 px; nenhuma rola para o lado em
  375 px (medido por `scrollWidth`). Dois transbordos achados e corrigidos
  nessa medição: a faixa de abas de Comparar (agora rola na própria caixa) e os
  rótulos `sr-only` dos selos de qualidade dentro de tabelas largas — com
  `position: absolute` e sem ancestral posicionado, escapavam da caixa de
  rolagem do `TableScroll` e alargavam a página para 990 px; o `TableScroll`
  passou a ser `relative`.
- Os testes de componente continuam usando `shadow-dom-testing-library`: as
  consultas `*ByShadow*` também encontram DOM comum, então nenhum teste precisou
  mudar só por isso, e os comentários que ainda falam do shadow root do MWC
  ficaram como estavam para não inflar o diff.
- Nenhum arquivo de `apps/api` foi alterado.

## D-81 — A região do Chart Stage atravessa a fronteira entre leitura e canônico pelo backend, pela mesma regra que desenha o mapa

**O defeito.** Desde o [D-70](#d-70) o mapa desenha cada eixo na **unidade de
leitura** da propriedade (densidade em g/cm³, módulo em GPa), e desde o
[D-60](#d-60) o Chart Stage guarda e compara a caixa em **unidade canônica**
(kg/m³, Pa) — os campos dele dizem isso. As duas coisas estavam certas sozinhas
e erradas juntas: uma caixa desenhada em 1,646–3,022 g/cm³ era gravada como
"1,646–3,022 kg/m³" e não admitia material nenhum; uma região vinda da URL
(2000–8000 kg/m³) era desenhada fora da escala de um eixo em g/cm³. O mesmo
valia para o botão "Criar estágio na Seleção" de `/app/mapas`, que passava para
a URL os números da tela. Achado ao vivo durante o D-80 e deixado de fora de
propósito, porque a correção pertence ao backend.

**A decisão: a caixa atravessa pelo backend, nos dois sentidos.**
`POST /api/charts/map-box` recebe os slugs dos dois eixos, a caixa e o sentido
(`to: "canonical"` para uma região desenhada, `to: "display"` para uma região
guardada) e devolve a caixa convertida mais a unidade em que cada eixo passou a
estar. A escolha de leitura da URL (`unidades`, D-70) é respeitada como no
próprio mapa. O cliente não multiplica nada — o princípio 4 (conversão só em
`units.py`) continua literal: um *fator* devolvido para o React aplicar seria
uma conversão fora de `units.py`, só que com mais um lugar para errar.

**Uma regra só para desenhar e para converter.** A decisão de quais eixos se
movem já existia, dentro de `ChartService._read_map`. Ela foi extraída para
`ChartService._map_reading(slug)`, e **tanto o desenho do mapa quanto a
conversão da caixa perguntam a ela**. Duas cópias dessa regra poderiam discordar
sobre um eixo, e a região apareceria num lugar diferente dos pontos em torno dos
quais foi desenhada — plausível, sem nada na tela que o denunciasse. Por isso o
que não se move no mapa também não se move na caixa:

- **Eixo de índice** (`x`/`y` nulo): dimensão derivada da expressão (D-35),
  nunca reescalada — atravessa intacto, com unidade `null`.
- **Unidade que não é fator de escala** (°C, com offset): o mapa mantém a
  temperatura de serviço em kelvin (D-70), e a caixa também. Convertê-la para
  °C enquanto o mapa desenha kelvin a deslocaria em 273 unidades.
- **Universo de processos:** só o mapa de materiais lê em unidade de leitura;
  uma caixa de processo atravessa inteira (os slugs ainda são validados, e um
  atributo inexistente é 404).
- **Lado aberto continua aberto** nos dois sentidos: `null` é "sem limite", e
  `0` é um limite (D-60).

**Ruído de ponto flutuante sai no backend.** 1,646 g/cm³ vezes o fator do Pint
dá `1645.9999999999998`, e era isso que aparecia no campo do estágio. A borda de
uma região é onde alguém soltou o mouse, não um valor medido; o resultado é
arredondado a 12 algarismos significativos — o que tira o ruído e não tira nada
que alguém tenha desenhado. Não se aplica a valor de material, que continua com
a conversão exata de sempre.

**No cliente.** O editor do Chart Stage (`StageList.tsx`) converte a caixa
guardada para desenhá-la (`useQuery`, com o valor anterior mantido enquanto a
conversão de uma caixa recém-desenhada volta, para a região não piscar) e
converte a caixa desenhada antes de escrever nos campos; se a conversão falhar,
mostra o erro e **não** escreve os números da tela, que estão em outra unidade.
`/app/mapas` converte antes de montar a URL do novo estágio. `lib/mapBox.ts` só
troca nomes de campo (`xMin` ↔ `x_min`); nenhum número é tocado no cliente.

**Verificação.** Backend: 14 testes novos em `app/tests/test_map_box.py` — os
dois sentidos, o invariante que importa (uma caixa desenhada em volta das
coordenadas *plotadas* de um material contém os valores *canônicos* dele), ida
e volta exata, lado aberto, eixo de índice, °C que fica em kelvin como no mapa,
escolha de leitura da URL, universo de processos, 404 e ausência de ruído.
Frontend: dois testes no `StageList` (a região guardada chega ao mapa na unidade
do mapa; a desenhada chega aos campos em unidade canônica) e um do cliente da
API. Ao vivo: uma caixa arrastada no mapa real em 1,646–3,022 g/cm³ e
16,59–107,6 GPa virou 1646–3022 kg/m³ e 1,659e10–1,076e11 Pa nos campos,
voltou desenhada em 1,646–3,022 g/cm³ no mapa do estágio e admitiu 1 dos 5
materiais de demonstração (a liga de alumínio, 2700 kg/m³ e 69 GPa) — antes, a
mesma caixa virava "1,646 kg/m³" e não admitia nenhum.

**Depois do merge** a API precisa do workflow manual **Deploy da API**
([`docs/13-deploy.md` §5-ter](13-deploy.md)): o endpoint novo não existe na
instância publicada até lá, e o frontend publicado pela Vercel chamaria uma rota
inexistente — o estágio mostraria o erro em vez de gravar números errados.

## D-82 — O mapa de `/app/mapas` veste o desenho do mapa da vitrine, sem perder a forma por classe

**Pedido.** Depois do D-80, o autor pediu que o mapa de Ashby de `/app/mapas`
fosse esteticamente semelhante ao da página inicial (`components/marketing/
AshbyPreview.tsx`). O motor continua o Plotly — log–log, zoom e a caixa do
Chart Stage (D-60/D-81) dependem dele —; muda a roupa, e toda a mudança é de
apresentação: nenhuma coordenada, envelope ou linha de índice passou a ser
calculada no cliente (ADR 0004).

**O que vem da vitrine.** Cabeçalho com sobrescrito mono "MAPA DE ASHBY", título
"Y × X" e a guia do índice à direita (`guia: E / ρ` — a expressão com os slugs
dos eixos lidos como símbolos; se ela nomeia outra propriedade, cai no nome do
índice, porque um slug ao lado de símbolos leria como erro de digitação). O
sobrescrito fica **dentro** do `<h2>`, então o leitor de tela ouve "Mapa de
Ashby, Módulo de Young × Densidade". Eixos rotulados "Densidade · g/cm³", marcas
só em décadas (mais 3× até quatro décadas, 2× e 5× numa só — `lib/charts.ts`
`logTicks`), números no padrão pt-BR (D-30, também no `separators` do Plotly),
fonte mono nas marcas. Pontos maiores com anel na cor do cartão, destaque como
um anel na cor da seção em volta do ponto (e não mais o contorno vermelho de
perigo), envelopes a 15 % com contorno tênue, linha-guia do índice na cor da
seção a 2 px, rótulo de hover no fundo escuro do trilho, e a região do Chart
Stage na cor da seção.

**O que não vem, de propósito: o círculo para todo mundo.** A vitrine desenha
toda classe como círculo; o mapa do produto mantém a **forma por classe**
(losango, triângulo, xis, círculo, quadrado). É a metade da codificação que
sobrevive a daltonismo e a impressão monocromática (`lib/design/palette.ts`,
D-28) — a paleta Okabe–Ito sozinha não basta num relatório impresso em tons de
cinza. A vitrine pode abrir mão disso porque é uma figura ilustrativa de dez
pontos; o mapa é o instrumento. Pela mesma razão o contorno do envelope continua
com o traço da classe, só mais tênue.

## D-83 — Acesso aberto para uma turma: o portão vira um modo, e o catálogo compartilhado continua com quem assina

**O pedido.** Abrir a ferramenta para estudantes testarem com a própria conta
Google, sem assinatura, e poder voltar depois à configuração original — só
entra quem adquiriu o pacote — por um job no GitHub, sem PR.

**A decisão: `ACCESS_MODE`, com dois valores e padrão fechado.** `subscription`
é o portão de [D-46](#d-46), intacto, e é o padrão do código: uma implantação
que nunca definiu a variável continua fechada. `open` faz
`require_active_subscription` admitir qualquer sessão válida. **Login continua
obrigatório nos dois modos** — `get_current_user` segue como dependência do
portão —, porque abrir para uma turma nunca quis dizer abrir para tráfego
anônimo. Quem quiser restringir a abertura a uma instituição já tem
`GOOGLE_ALLOWED_DOMAIN`.

**O que o modo aberto não abre: escrever no catálogo compartilhado.** Até aqui
"quem passou pelo portão pode alterar o catálogo" ([D-62](#d-62)) valia porque
todo mundo que passava era assinante. Com o portão aberto essa equivalência
some, e um estudante poderia renomear, desativar ou substituir os valores de um
material que a turma inteira lê. O autor escolheu, entre as alternativas, "usar
tudo, proteger o catálogo": no modo aberto, **só quem tem assinatura ativa**
cria, altera ou desativa material compartilhado (`owner_id` NULL), cria, altera
ou apaga classe e propriedade, importa planilha e ingere documento no Cérebro. O
estudante usa toda a ferramenta, cria e edita **os próprios registros** (P1-4),
estudos, gráficos salvos e sínteses. No modo `subscription` a regra devolve
"sim" sem consultar nada — o portão já admitiu só assinantes —, então o D-62
fica exatamente como era.

**Uma regra só, pura, lida pelos dois lados.** `app/domain/access.py` tem
`grants_access(mode, subscribed)` e `can_edit_shared_catalog(mode,
subscribed)`; o portão HTTP e `/billing/status` perguntam a elas, e a tela que
diz "você entrou" não pode discordar da API que deixou entrar. As rotas de
curadoria ganharam `require_catalog_curator` como dependência de rota; o
`MaterialService` recebe `can_edit_shared` pelo construtor, porque a mesma rota
(`POST /materials`) escreve no catálogo ou num registro próprio conforme o
payload, e só o serviço sabe qual. A recusa é `CatalogReadOnlyError` → **403**,
com a mensagem em português definida uma vez, na própria exceção.

**`/billing/status` separa assinatura de acesso.** `active` continua sendo a
verdade da assinatura e nada mais; `has_access` é o que o portão lê;
`can_edit_catalog`, o que a interface lê para não oferecer botão que não
funcionaria. Colapsar os dois em `active=true` no modo aberto faria um
assinante e um estudante parecerem iguais — e a página `/assinatura` mostraria
"gerenciar assinatura" a quem não tem nenhuma. Na interface: `AuthGate` lê
`has_access`; `/assinatura` no modo aberto manda para a ferramenta em vez do
checkout; a ficha de um material compartilhado esconde *editar* e *desativar*
de quem não pode; `/app/importar` e as duas telas de administração avisam que o
catálogo é somente leitura; e o formulário de material novo, para um
estudante, grava **registro próprio** e diz isso antes de ele digitar — a única
propriedade que ele pode declarar (a regra "declarada, nunca inferida" do P1-4
continua de pé: o formulário não adivinha, ele só tem uma opção para oferecer, e
a escreve na tela). Esconder é conveniência; quem recusa é o servidor.

**Por que uma variável, se o §5 de `13-deploy.md` preferia a concessão por
linha de banco.** Aquele texto comparava a concessão com "uma variável que
desliga o portão inteiro". Esta não desliga o portão inteiro: o login continua
exigido e o catálogo continua protegido. E ela resolve um problema que a
concessão não resolve: uma turma não é uma lista de e-mails conhecida antes da
aula, e cada `conceder` exige que a pessoa já tenha entrado uma vez. A
concessão continua sendo o caminho para uma banca ou para os participantes de
uma sessão de usabilidade.

**A troca é um workflow, e ele só fica verde depois de ler o modo novo.**
`.github/workflows/modo-acesso.yml` (`abrir` / `restaurar_assinatura`) grava o
segredo `ACCESS_MODE` no Fly — o que reinicia as máquinas, sem deploy de código
e sem PR — e então lê `access_mode` em `/api/health` até ver o valor pedido. O
campo é público de propósito: diz só se a ferramenta está aberta, e é o que
prova que a troca pegou. Sem essa leitura, um segredo gravado numa API anterior
a esta decisão seria descartado em silêncio pela configuração (que ignora
variável desconhecida), e o job passaria com a porta ainda fechada — a mesma
assinatura das armadilhas do Fly no [D-52](#d-52). O workflow divide o grupo de
concorrência com o deploy, porque os dois reiniciam as mesmas máquinas.

**O feed de auditoria deixou de mostrar registro próprio alheio.** Achado ao
revisar o que um estudante passaria a alcançar: `/api/audit` devolvia a
qualquer usuário os eventos de material, inclusive de um registro próprio de
outra pessoa — com o nome dele e o e-mail do dono —, enquanto as rotas de
material respondiam 404 ao mesmo leitor. Era um defeito desde o P1-4 (o
canário do D-62 varre as rotas de material, não o feed), e o modo aberto o
transformaria em "todo estudante vê o e-mail e os registros particulares dos
colegas". `AuditRepository.list_events` recebe o observador e exclui eventos
de material que seja registro próprio de outro; evento de catálogo
compartilhado continua visível a todos, como antes.

**Antes de restaurar**, a conta do autor precisa de assinatura ativa
(`admin-banco.yml` → `conceder`), ou o portão fecha para ele também — e, no
modo aberto, é essa assinatura que o mantém como curador do catálogo.

**Verificação.** Backend: 29 testes novos em `app/tests/test_open_access.py` —
a tabela da regra, o padrão fechado, o 403 do portão no modo `subscription`, a
entrada do estudante no modo aberto, o 401 sem login, o `/billing/status` e o
`/api/health` nos dois modos, o estudante criando/editando/desativando o
próprio registro, o 403 em toda escrita no catálogo compartilhado (material,
classe, propriedade, as seis rotas de importação e a ingestão), o assinante
continuando curador no modo aberto, e o modo `subscription` não ganhando um
segundo portão por cima do D-46. Frontend: o portão admitindo no modo aberto,
`/assinatura` nos dois modos e o aviso de somente leitura.

## D-84 — Estudo de processos volta a ter o passo Objetivo: ranqueia por atributo numérico, e o discreto fica de fora pelo nome

**O defeito.** Desde o P0-4 ([D-59](#d-59)) um processo tem atributo, e a recusa de
ranqueamento do [D-58](#d-58) foi **retirada** — `test_process_attributes.py` prova
que um estudo de processos ranqueia (`test_ranking_a_process_study_works_now`), que
um envelope entra pelo ponto representativo e que só o atributo **discreto** é
recusado, com o motivo escrito. A tela não acompanhou: com o universo em
"Processos", o passo Objetivo inteiro era trocado por um aviso que dizia
"processo não tem atributo cadastrado" — falso havia semanas, e escondendo uma
capacidade que o backend entrega.

**A decisão.** O passo Objetivo é o mesmo nos dois universos; o que muda é o
catálogo de que ele lê:

- **Critério de ranking** num estudo de processos lista os atributos de processo
  **numéricos** (`ESCALAR` e `ENVELOPE`). O `DISCRETO` não aparece: é um conjunto
  de rótulos sem ordem, o backend o recusa pelo nome, e oferecê-lo seria oferecer
  um 400.
- **Índice**: os índices do catálogo são escritos sobre propriedades de material,
  então num estudo de processos sobram "Nenhum índice" e "Expressão
  personalizada", com uma frase dizendo por quê. O botão **Validar** some ali,
  porque `POST /api/selection/index` avalia sobre materiais e o único desfecho
  seria um 400; a frase diz que a expressão é conferida ao executar.
- **O nome de variável vem do backend.** Um slug de atributo tem hífen
  (`faixa-massa`) e uma expressão precisa de identificador; a conversão é a de
  `safe_variable`. `ProcessAttributeOut` passou a carregar `variable`, calculado por
  ela, para a lista de variáveis da tela e o avaliador não poderem discordar — a
  mesma razão pela qual a geometria e a unidade de leitura saem do backend.
- **Trocar o universo limpa o objetivo** (critérios, índice, expressão, AHP), além
  dos estágios. Um critério de propriedade de material num estudo de processos é
  recusado pelo backend; carregá-lo através da troca só produziria o erro.

**Verificação.** Backend: `test_each_attribute_carries_the_name_an_index_expression_uses`
(o `variable` servido é o de `safe_variable`, e um índice escrito com ele executa
num estudo de processos). Frontend, em `selecao.test.tsx`: o seletor lista os
atributos numéricos e não o discreto nem as propriedades de material, os índices do
catálogo não aparecem, o critério de atributo chega à requisição com
`universe: "process"`, e trocar o universo limpa os critérios (conferido por
mutação).

**Depois do merge** a API precisa do **Deploy da API**: sem ele o catálogo de
atributos não traz `variable`, e a lista de variáveis da expressão sai vazia.

## D-85 — Seleção guiada: um passo de cada vez, sempre com volta, e o recolhido nunca esconde o que está em uso

**O pedido.** A ferramenta vai ser usada por uma turma de graduação (29/09), e o
autor pediu uma experiência "super intuitiva, passo a passo, que mostre menos coisa
na tela", em que o aluno complete um passo para ver o seguinte mas possa sempre
voltar — **sem perder nenhuma funcionalidade**. A pesquisa que sustenta o desenho
(Nielsen Norman Group sobre jovens adultos e sobre assistentes; Baymard sobre o
botão voltar; estudos de *onboarding* na CHI 2023) é consistente em cinco pontos:
voltar tem de ser sempre possível e errar tem de ser barato; tela esparsa, com
ajuda no contexto e nunca tour; assistente só onde a tarefa é sequencial; total
corrente ao vivo; botão desabilitado sempre com o motivo à vista.

**As regras, que valem para qualquer tela que adotar o padrão:**

- **Recolhido esconde só como *acrescentar* complexidade, nunca o que já está em
  uso.** "Opções avançadas" (universo em Função; estágios extras, grupos e E/OU
  da raiz em Restrições; método, normalização e AHP em Objetivo) abre sozinha
  quando um estudo carregado, o exemplo ou um link já usa o recurso. Os
  predicados são puros, em `lib/selection/advanced.ts`, com teste. Fechada com um
  método diferente da soma ponderada, uma linha diz qual está em uso.
- **A navegação deriva da ordem de `STEPS`.** Anterior e próximo saem da posição
  (`neighbours`), o Executar fica no último passo de entrada (`LAST_INPUT_STEP`),
  "Voltar" existe em todo passo — no primeiro, "Voltar ao início" — e o botão
  principal diz para onde vai ("Próximo: Objetivo"). Reordenar os passos é mexer
  numa lista.
- **O passo vive na URL** (`?etapa=`, com `pushState`), e o botão Voltar do
  navegador volta um passo. A sincronia é um ouvinte de `popstate`, não um efeito
  sobre `useSearchParams`: o efeito seria um `setState` dentro de `useEffect`, que
  a regra de lint deste repositório recusa com razão.
- **O Stepper é a faixa-resumo.** Cada passo ganhou uma segunda linha com o que já
  guarda (nome, índice e número de critérios, número de restrições, candidatos),
  e continua clicável.
- **Objetivo em dois blocos** (`GuidedBlock`): o índice, depois critérios e pesos,
  travado com o motivo escrito até o índice ser confirmado — "Nenhum índice" é
  confirmação válida. Confirmado, o bloco recolhe a grade mas **o `IndexCard` com
  as hipóteses fica à vista** ([D-25](#d-25)).
- **O resultado começa pelo vencedor e pelo porquê**, com números do backend
  apenas: a pontuação, as contribuições ou a frase do TOPSIS/PROMETHEE, o valor do
  índice, "passou em N restrições". Escolher o primeiro de uma lista já ordenada é
  comparação, não cálculo. Empate nomeia todos; sem índice nem ranking, a tela não
  declara vencedor e diz por quê. Depois vêm o top 5 e as abas (Resumo, Ranking,
  Eliminados, Sensibilidade, Origem dos dados); os ids antigos de seção abrem a aba
  certa, e o **`LimitationNotice` fica fora das abas** (REDESIGN §13).
- **Busca em vez de lista longa** (`Combobox`, padrão ARIA 1.2, busca sem acento,
  lista em portal porque o cartão corta o transbordo). Não `<datalist>`: ele não
  dobra acento, devolve o rótulo em vez do slug e varia de navegador para
  navegador. Um critério já escolhido some das opções.
- **Unidade à vista.** A unidade de uma restrição sobre propriedade de material é
  um seletor sobre `accepted_units`, pré-escolhido na unidade de leitura: em
  branco ela valia a canônica, e "70" num módulo virava 70 Pa. Cada linha se lê
  como frase embaixo ("Módulo de Young ≥ 70 GPa", `describeConstraintRow`).
- **O exemplo é constante do frontend** (`lib/selection/examples.ts`): são
  escolhas de entrada, não dado de material, e por isso não violam o princípio 1
  nem dependem de deploy. Antes de aplicar, confere que os slugs existem; se
  faltar algum, diz o quê e não aplica nada; aplicado, tem **Desfazer**. Um teste
  lê `seed.py` para que o exemplo não envelheça em silêncio.
- **Estudos salvos e IA saem do fluxo**: "Meus estudos (N)" é um painel recolhido
  no topo, com o conteúdo de antes inteiro; o assistente de IA fica atrás de um
  botão com `aria-expanded`.
- **Uma dica de uma linha por campo**, pela prop `hint` que já existia.

O contador de candidatos passou a ter *debounce* sobre a chave serializada dos
estágios — ele disparava uma requisição por tecla, e a aula põe quarenta pessoas
numa máquina só.

**Nada saiu.** Tudo que existia continua alcançável: o que mudou foi a ordem em
que aparece e o que fica recolhido até alguém pedir.

## D-86 — Superfícies enxutas: capa com um botão, menu por papel, Início, Mapas, Comparar e as ferramentas

Mesmo pedido e mesma pesquisa do [D-85](#d-85), aplicados ao resto do produto.

- **A capa (`/`) deixou de ser vitrine de venda** (revê o [D-50](#d-50) no que ele
  punha em `/`). A ferramenta não está sendo vendida agora, e quem chega pelo
  link do professor precisa de uma coisa: entrar. `StartScreen` tem o nome, uma
  linha e **um** botão "Começar um estudo", com os dois avisos em letra miúda —
  são compromissos da proposta, não marketing. A vitrine (`Landing.tsx` e o que
  ela usa) **fica no repositório e continua auditada**: voltar é trocar um import.
  Depois do login o aluno cai em `/app`, não de volta na capa.
- **O menu mostra a cada um o que ele pode usar.** Para quem não é curador
  (`can_edit_catalog`, [D-83](#d-83)) somem "Importar" e o grupo "Administrar" —
  telas só de leitura para o aluno. **Não é segurança**: o backend já recusa;
  é ruído a menos. Cada item tem ícone próprio (Custo, Processos e Propriedades
  dividiam glifos).
- **Início**: um botão principal, o aviso de dados fictícios, o aviso de limitação
  em forma compacta (o texto integral continua no rodapé), "retomar um estudo",
  três atalhos e os quatro passos do método recolhidos em "Como funciona".
- **Mapas**: os eixos são a pergunta e ficam à vista; universo, escala, forma do
  envelope, camadas, classes, linha de índice e a troca de um eixo por índice vão
  para "Personalizar o mapa". O painel abre sozinho quando o link ou um mapa salvo
  já personaliza algo (`mapUsesCustomization`, puro, com teste) e, fechado, diz em
  palavras o que está em uso. Um eixo desenhado como índice mantém o próprio
  seletor à vista.
- **Comparar** em três passos: os materiais entram por busca, e só os escolhidos
  aparecem, como chips removíveis (`RemovableChip`, primitiva nova, em `/estilo`)
  cujo botão carrega o nome do item. Os passos seguintes dizem em palavras o que
  esperam. Um link com `?materiais=` abre com os três preenchidos.
- **Ferramentas** (Custo, Eco, Baterias, Dimensionar, Sintetizar):
  - **Premissas recolhidas, com cada valor impresso no resumo** — a regra do
    [D-65](#d-65)/[D-69](#d-69) é "premissa é entrada com valor visível", e o
    resumo a cumpre. Uma premissa que bloqueia a execução abre o painel sozinha.
  - **Todo botão desabilitado diz o primeiro requisito que falta**, ao lado dele
    e ligado por `aria-describedby`. É validação de entrada, não conta.
  - A **condição de apoio** do Dimensionar continua à vista ([D-64](#d-64)): é a
    constante que faz dois briefings iguais darem respostas diferentes.
  - O **cartão de resultado fica na tela desde o início** ([D-80](#d-80) mantido
    no que ele protege) — Dimensionar, que só o mostrava depois de executar,
    passou a seguir a regra. Dimensionar e Sintetizar usam `StepCard`.
  - Material por busca onde a lista é o catálogo inteiro.
  - **O que o plano previa e ficou de fora de propósito:** revelar o cartão
    seguinte de uma ferramenta só depois do anterior. As ferramentas têm dois ou
    três cartões curtos e um resultado que depende de todos; esconder o segundo
    esconderia justamente as premissas de que o número depende. O que tornava as
    telas pesadas eram as premissas abertas e as listas longas, e é isso que
    mudou.
