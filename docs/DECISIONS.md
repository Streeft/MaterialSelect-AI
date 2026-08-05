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
