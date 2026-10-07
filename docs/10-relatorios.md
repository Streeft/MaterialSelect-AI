# Relatórios e exportação (Fase 7)

A exportação é onde o trabalho sai da ferramenta e passa a circular sozinho.
Um arquivo entregue a um orientador, anexado à monografia ou aberto meses
depois precisa carregar consigo tudo o que sustenta seus números — e precisa
dizer o que **não** é.

## O que todo arquivo exportado carrega

Três avisos, sempre, sem opção de desligar
(`app/exporters/report.py`):

1. **Limitação de uso** — compromisso do item 5 da proposta: a ferramenta apoia
   ensino e triagem preliminar, e não substitui validação experimental, análise
   estrutural detalhada nem julgamento de engenharia. Um relatório que viaja sem
   essa frase pode ser lido como conclusão de engenharia, que ele não é.
2. **Reprodutibilidade** — os números vieram de cálculo determinístico no
   backend sobre valores cadastrados; reexecutar reproduz o mesmo resultado.
3. **Dados demonstrativos** — quando algum material exportado é fictício, este
   aviso vem **primeiro**: quem parar na primeira linha deve parar naquela que
   diz que os valores são inventados.

## Injeção de fórmula

Um CSV não é inerte. Excel e LibreOffice executam qualquer célula que comece com
`=`, `+`, `-`, `@`, TAB ou CR. Um material chamado `=HYPERLINK("http://…")` —
perfeitamente armazenável neste sistema, e alcançável pelo assistente de
importação — rodaria ao abrir o arquivo, numa máquina que o exportador nunca vê.

O importador já retira esses prefixos na entrada
(`app/importers/parsing.sanitize_text_cell`). `app/exporters/cells.py` fecha a
outra ponta, porque as duas protegem coisas diferentes: o importador protege os
dados *deste* sistema; o exportador protege a *planilha de quem recebe* — e um
dado pode chegar ao banco por caminhos que o importador nunca viu (o formulário
manual, um cliente futuro da API, um backup restaurado).

O escape é **visível, não destrutivo**: o valor mantém seus caracteres e ganha
um apóstrofo à frente, a convenção de planilha para "trate como texto". Nada
exportado é silenciosamente alterado.

Números negativos são exceção deliberada: saem como célula **numérica**, que
nenhuma planilha interpreta como fórmula. Escapá-los inviabilizaria aritmética
na planilha exportada sem ganho de segurança.

## Injeção de marcação (o caso do HTML)

O relatório imprimível corre um risco **diferente**, e por isso tem escape
próprio em `app/exporters/html.py`. Nada ali executa fórmula; o que é perigoso é
marcação: o mesmo nome de material que chegaria à planilha chega ao documento,
e um `<script>` não escapado roda ao abrir a página — servida, ainda por cima,
na origem da própria API.

Aplicar aqui o escape da planilha seria errado nas duas direções. Um `=` à
frente é inerte em HTML, então o apóstrofo do `cells.py` não protegeria de nada
e ainda apareceria na tela como corrupção visível do dado exportado. O que vale
é `html.escape` em **todo** valor — célula, cabeçalho, título de seção e nota.

Como segunda camada independente, o router serve o documento sob
`Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`: mesmo
que o escape falhasse, a página não pode carregar nem executar nada. As duas
proteções são deliberadamente independentes — uma erra sem levar a outra junto.

## O relatório de seleção

`GET /api/exports/estudos/{id}.{csv|xlsx|html|docx|pptx}` reexecuta o estudo pelo pipeline
determinístico e organiza o resultado em seções:

| Seção | O que responde |
|---|---|
| Aviso | os três avisos obrigatórios (aba própria no XLSX; cabeçalho no CSV, no HTML e no DOCX; slide no PPTX) |
| Problema | função, objetivo, variáveis livres, contagens |
| Restrições e funil | qual restrição eliminou o quê |
| Candidatos | ordenação, índice e pontuação |
| Índice de desempenho | expressão, objetivo e **dimensão derivada** |
| Contribuições | por critério: valor bruto, normalizado, peso, contribuição |
| Excluídos por dado ausente | quem não foi ranqueado, e por falta de qual dado |
| Sensibilidade | se o 1º colocado muda ao variar os pesos |
| Proveniência | origem de cada número usado na decisão |

A aba de proveniência é o ponto do exercício. Uma tabela de ranking sozinha é
uma afirmação; a mesma tabela ao lado de "este 69 GPa foi informado como 69 GPa
e convertido por `pint:GPa->Pa`, estimado, do dataset demonstrativo" é um
argumento que outra pessoa pode conferir.

O serviço **nunca calcula**: ele reexecuta o pipeline e arruma o que volta. Uma
exportação tem de mostrar os mesmos números que a aplicação mostra, e a única
forma de garantir isso é haver um único lugar que os produz.

## O relatório imprimível

`…{id}.html` e `…catalogo.html` renderizam **o mesmo `Report`** que alimenta CSV,
XLSX, DOCX e PPTX — não uma versão resumida. CSV e XLSX são formatos para planilha; o que
se anexa a uma monografia é um documento que alguém lê, e o "imprimir para PDF"
do navegador transforma este arquivo exatamente nisso. É por isso que o projeto
**não** carrega uma dependência de geração de PDF.

Três propriedades que não são detalhe:

- **Autocontido.** Estilo embutido, sem script, sem requisição externa. Um
  relatório auditável tem de abrir igual numa máquina que nunca ouviu falar
  deste sistema — offline, anos depois, a partir de um anexo de e-mail.
- **Servido inline**, único formato que não é download: ele existe para o
  navegador abrir e imprimir.
- **Sem carimbo de data/hora**, de propósito. O relatório reexecuta o pipeline
  determinístico, então o mesmo catálogo tem de produzir os mesmos bytes; uma
  leitura de relógio quebraria isso sem acrescentar nada ao aviso de
  reprodutibilidade que já vai no topo.

A folha de impressão repete o cabeçalho da tabela a cada página
(`table-header-group`) e evita quebrar uma linha ao meio ou deixar um título
órfão no pé da página — as duas formas de uma tabela impressa deixar de ser
legível. As seções são numeradas para que se possa citar "seção 4" sem depender
da paginação, que é do navegador e não nossa.

## O relatório em DOCX (Word)

`…{id}.docx` e `…catalogo.docx` renderizam **o mesmo `Report`** em documentos
Word (.docx) formatados nativamente através de `python-docx` (`app/exporters/docx.py`),
sem necessidade de bibliotecas C pesadas (alinhado a D-20).

Três propriedades de formatação documental:

- **Tabelas estruturadas e paginação:** repete a linha de cabeçalho da tabela a cada
  página (`w:tblHeader`) e impede a quebra de linhas no meio entre páginas (`w:cantSplit`).
- **Avisos obrigatórios destacados:** os avisos de limitação de uso, reprodutibilidade e
  dados demonstrativos abrem o documento com formatação visual destacada.
- **Formatação de células e ausência explícita:** números formatados com os mesmos 12 dígitos
  significativos de `cells.py`, e dados ausentes impressos com o texto `"ausente"` explícito (D-24).

## O relatório em PPTX (PowerPoint)

`…{id}.pptx`, `…catalogo.pptx` e `…laudo.pptx` renderizam **o mesmo `Report`** em
apresentações de slides widescreen 16:9 nativas através de `python-pptx` (`app/exporters/pptx.py`).

Três propriedades de formatação para apresentação:

- **Paginação de tabelas em múltiplos slides:** tabelas com mais de 10 linhas são
  divididas automaticamente em blocos sequenciais com numeração de continuação `(1/N)`.
- **Interpretação técnica e laudo executivo:** no laudo, a interpretação gerada pela IA
  ganha slide dedicado com layout tipográfico refinado e indicação clara de disponibilidade/degradação.
- **Avisos obrigatórios de engenharia:** slide final mandatório com os três avisos de limitação
  de uso, reprodutibilidade e dados demonstrativos.

## O laudo de engenharia (Fase 9)

`GET /api/exports/estudos/{id}/laudo.{html,docx,pptx}` é **um documento distinto**, não uma
variante do anterior. A mesma reexecução determinística e as mesmas oito seções
de auditoria, mais três coisas que o relatório de seleção não tem: o gráfico de
barras do ranking (SVG do backend, por `app/exporters/figures.py`), um campo de
responsável técnico, e — quando a camada de IA está ligada — a interpretação de
`AIService.explain()` como nona seção.

O que isso obriga:

- **A figura é do backend.** Um SVG montado em `figures.py`, não uma imagem
  capturada da tela: o laudo tem de abrir offline, anos depois, e uma captura
  não é reproduzível a partir do catálogo ([ADR 0004](adr/0004-geometria-de-graficos-no-backend.md)).
- **Ausência de IA é declarada.** Provedor desligado, mal configurado ou fora do
  ar degrada **aquela seção**, com o motivo escrito, e não o documento. O que
  não pode acontecer é a seção sumir em silêncio e o laudo parecer completo.
- **Responsável técnico é texto livre e nunca validado.** O sistema não sabe
  quem é engenheiro registrado, e fingir que sabe seria pior do que não
  perguntar. Ele é escapado como todo o resto.
- **O pipeline roda duas vezes**, de propósito: `AIService.explain()` recomputa
  o estudo em vez de aceitar o resultado que o exportador já tem. Ver
  [D-41](DECISIONS.md) e a medição em [PROJECT_CONTEXT.md §12](PROJECT_CONTEXT.md).

## Catálogo

`GET /api/exports/catalogo.{csv|xlsx|html|docx|pptx}` exporta todos os materiais ativos em
unidade canônica, com uma seção de proveniência completa. Dado não cadastrado
sai como `ausente` — nunca célula vazia, que um leitor poderia confundir com
zero.

## Cartão de material para CAE (D-104)

`GET /api/exports/materiais/{id}/cae?formato=…&unidades=…` gera o cartão de
**um** material para um solver ou para o formato aberto MatML
(`app/exporters/cae/`, [D-104](DECISIONS.md)). Na tela, é o item "Cartão de
material para CAE…" do "Exportar ▾" da ficha.

| `formato` | O que sai | Exige |
|---|---|---|
| `mapdl` | Ansys MAPDL: `/UNITS`, `MP,DENS/EX/PRXY/ALPX/KXX/C` | E e ν |
| `abaqus` | Abaqus `.inp`: `*MATERIAL`, `*ELASTIC`, `*DENSITY`, `*EXPANSION`, `*CONDUCTIVITY`, `*SPECIFIC HEAT` | E e ν |
| `nastran` | Nastran `MAT1` em campo largo (E, NU, RHO, A) | E e ν |
| `lsdyna` | LS-DYNA `*MAT_ELASTIC_TITLE` (RO, E, PR) | ρ, E e ν |
| `matml` | MatML 3.1 (XML) | ao menos uma propriedade |

`unidades` é o **sistema consistente** do modelo, sem padrão: `m-kg-s` (Pa),
`mm-t-s` (t/mm³, MPa) ou `in-lbf-s` (lbf·s²/in⁴, psi, °F). Não é a unidade de
leitura por propriedade do D-70 — um solver multiplica os números que recebe, e
precisa de um sistema inteiro. A conversão sai do valor canônico pelo Pint
(`units.from_canonical`); nenhum fator em literal.

Regras que não se afrouxam:

- **Ausente nunca vira 0.** Propriedade não cadastrada é omitida e o arquivo diz
  "não cadastrado" em comentário. Quando falta o mínimo do formato a resposta é
  **422** com a frase que nomeia o que falta — um campo em branco seria
  preenchido pelo padrão do solver (ν = 0,3 no MAPDL; 0 no Abaqus, no Nastran e
  no LS-DYNA), nunca pelo catálogo.
- **Faixa sai pelo ponto representativo**, e o arquivo diz isso e traz os
  limites convertidos.
- **Todo arquivo carrega** o aviso de limitação de uso, a fonte, a qualidade e
  a licença de cada valor, e o aviso de fictício quando o material **ou a fonte
  de algum valor** é de demonstração. Registro próprio (D-62) é declarado.
- **Escape por formato.** MatML é escapado como XML (e os caracteres que o XML
  1.0 não carrega saem); nos decks o nome nunca quebra linha, vira rótulo
  `[A-Za-z0-9_-]` de até 80 caracteres no `*MATERIAL, NAME=` do Abaqus, perde
  `$`/`*` iniciais no título do LS-DYNA e `$` nos comentários do MAPDL. Os
  comentários dos decks saem em ASCII, porque Nastran e LS-DYNA leem por
  coluna.
- **Três slugs são contrato, não seed:** `coef_poisson`,
  `coef_expansao_termica` e `calor_especifico` não existem no catálogo de
  demonstração. Até alguém que cura o catálogo criá-los (ou o bundle oficial do
  D-102 trazê-los), os quatro decks recusam todo material e só o MatML sai.
- Sempre `attachment`, com `nosniff`; o MatML não é renderizado na origem da
  API.

## Quantos dígitos, e com que nome

Duas escolhas de renderização que o relatório compartilha com CSV, XLSX, DOCX e PPTX, porque
os cinco saem do mesmo `Report`.

**Dígitos.** Uma densidade informada como `3.9 g/cm**3` normaliza para
`3899.9999999999995 kg/m**3` — o valor exato do `double`, não um erro do
sistema. Imprimir os dezessete dígitos afirmaria uma precisão que a medida nunca
teve, que é a mesma fabricação recusada em todo o resto do projeto. Coluna de
texto sai com doze dígitos significativos (`cells.SIGNIFICANT_DIGITS`), muito
além dos dois a quatro de qualquer propriedade medida e o bastante para absorver
o resíduo da conversão. O valor guardado não muda, e `safe_number` continua
escrevendo o `float` inteiro na célula **numérica** da planilha, onde o leitor
pode fazer conta com ele.

**Nomes.** Chave é identificador, não palavra: `__index__` e `modulo_young`
nunca aparecem onde cabe um nome. O rótulo de um critério vem do índice ou da
propriedade ([D-21](DECISIONS.md)); a tabela de excluídos usa `missing_labels`,
não `missing_keys`; e a linha de proveniência de uma propriedade que o material
sequer possui busca o nome no catálogo, em vez de lê-lo no valor que está
faltando.

## Detalhes que costumam passar batido

- **BOM UTF-8 no CSV.** Sem ele o Excel no Windows abre o arquivo como Latin-1 e
  transforma "Módulo" em "MÃ³dulo". O relatório é em português, então não é
  opcional.
- **Nome de arquivo.** O cabeçalho `Content-Disposition` leva a forma ASCII
  saneada *e* a forma RFC 5987 (`filename*`), para que acentos sobrevivam onde
  houver suporte e degradem limpo onde não houver.
- **`X-Content-Type-Options: nosniff`.** Impede o navegador de reinterpretar um
  CSV como HTML, o que transformaria nomes de material em marcação.
- **Nomes de aba do Excel.** Máximo de 31 caracteres, sem `: \\ / ? * [ ]`, e
  únicos. Saneados na escrita.
- **DOCX e PPTX sem dependências em C.** Os formatos DOCX e PPTX são gerados inteiramente em Python
  puro via `python-docx` (`app/exporters/docx.py`) e `python-pptx` (`app/exporters/pptx.py`),
  permitindo edição posterior ou conversão nativa em PDF no leitor de documentos do usuário sem exigir
  dependências complexas do sistema operacional.

## Endpoints

| Método | Rota | Função |
|---|---|---|
| GET | `/api/exports/catalogo.{csv,xlsx,html,docx,pptx}` | catálogo ativo com proveniência |
| GET | `/api/exports/estudos/{id}.{csv,xlsx,html,docx,pptx}` | relatório completo de um estudo |
| GET | `/api/exports/estudos/{id}/laudo.{html,docx,pptx}` | laudo de engenharia (figura, responsável, IA) |
| GET | `/api/exports/materiais/{id}/cae?formato=&unidades=` | cartão de material para CAE (D-104) |

O `html` é o único servido `inline`; os outros formatos — o cartão CAE incluído — baixam. O laudo aceita
`?responsavel=` — texto livre, escapado, opcional.

## Ainda fora desta fatia

Autenticação por projeto (A5), auditoria (M2), os testes end-to-end de
interface (A4 — Playwright cobrindo importar → selecionar → visualizar →
exportar, `apps/web/e2e/`, check obrigatório de CI em `ci.yml`), a exportação
nativa em DOCX (P4 restante), a exportação nativa em PPTX (B2) e o cartão para
CAE (TM5, D-104) já foram entregues; ver "Débitos já quitados" no `TODO.md`.
Do cartão CAE ficaram de fora a curva tensão-deformação plástica, os dados
dependentes de temperatura (`MPTEMP`/`MPDATA`), o XML do Engineering Data do
Workbench e os cartões térmicos (`MAT4`, material térmico do LS-DYNA).
