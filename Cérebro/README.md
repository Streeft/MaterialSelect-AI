# Cérebro

> Base de conhecimento de Engenharia de Materiais que fundamenta a camada de IA
> do MaterialSelect AI: bibliografia publicada, extratos de capítulos, fichas do
> Granta EduPack, diagramas de Ashby e artigos científicos.
>
> **Material de curso não entra aqui** ([D-100](../docs/DECISIONS.md)). Os
> slides, o plano de aulas, as instruções das ferramentas avaliativas e os
> trabalhos entregues da disciplina ENG02016 foram retirados a pedido do
> professor e por decisão do autor; a lista do que saiu é
> [`removidos.txt`](removidos.txt), e a ingestão pula tudo o que casar com ela.

## Por que existe

O princípio 1 do [`CLAUDE.md`](../CLAUDE.md) proíbe o sistema de inventar
propriedades de materiais: só existe valor explicitamente cadastrado ou
importado. O Cérebro estende esse princípio ao **conhecimento de domínio** que
sustenta as explicações da IA — a camada `ai/` deixa de escrever sobre seleção
de materiais a partir do que o modelo "sabe" e passa a escrever a partir do que
esta base contém, com a fonte rastreável até o documento.

Uma consequência que **não** é negociável: o Cérebro fornece à IA vocabulário,
método e contexto conceitual — **nunca números**. O guardrail de
[`app/ai/guardrails.py`](../apps/api/app/ai/guardrails.py) continua exigindo que
toda cifra da prosa tenha saído do pipeline determinístico, e um valor de
propriedade lido de um livro não passa a ser citável só porque está indexado.
Ver [`docs/09-camada-ia.md`](../docs/09-camada-ia.md) §5.

## Arquitetura da pasta

Reorganizada em 2026-08 por categoria de conteúdo — critério: **de onde vem o
documento e qual autoridade ele tem**, não o formato do arquivo. Isso importa
porque quem consulta esta base (a IA e você) precisa saber diferenciar
"bibliografia com peer review / editora" de "banco de dados licenciado" de
"artigo avulso" — podem coexistir, mas carregam pesos de confiança diferentes.
A numeração pula o `02-` de propósito: era a pasta do material de curso,
retirada no D-100, e renumerar as outras mudaria o caminho — a chave — de todo
documento já indexado.

```
Cérebro/
├── 01-Bibliografia/                        Livros comerciais completos (no git, via LFS)
│   └── Extratos-de-Capitulos/              Capítulos avulsos extraídos de um dos livros (versionados)
├── 03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/   Banco de dados licenciado ANSYS/Granta (no git, via LFS)
├── 04-Ferramentas-e-Diagramas/             Diagramas de Ashby, diagrama de barras de preço
├── 05-Artigos-Cientificos/                 Artigos avulsos de periódico (bromélias, impressão 3D de terra)
├── Links.md                                Links indicados na disciplina (indexado; declarado no manifesto)
├── manifesto.json                          Proveniência declarada de cada documento
├── removidos.txt                           O que saiu da base e não volta (D-100)
└── README.md                               Este arquivo
```

A estrutura interna de `03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/` (por
família de material: Metais e ligas, Cerâmicas e vidros, Polímeros e
elastômeros, Híbridos/compósitos/espumas/materiais naturais, com subpastas por
subfamília) já veio bem organizada do EduPack e foi mantida como estava —
não precisa de retrabalho.

## Como esta pasta chega ao RAG

**O que a ingestão lê:** todo PDF desta pasta e, de Markdown, só o que o
`manifesto.json` declara — hoje, `Links.md`. Este README, o `manifesto.json` e o
`removidos.txt` são arquivos de operação e nunca são indexados, mesmo que alguém
os declare. Um `.md` novo só vira fonte citável quando ganha entrada no
manifesto.

**Em produção, pelo GitHub Actions** ([D-101](../docs/DECISIONS.md)): o
workflow **Base de conhecimento (Cérebro)** (`.github/workflows/conhecimento.yml`),
ação `ingerir`, baixa os PDFs do Git LFS (com cache), confere que nenhum
ficou como ponteiro e roda `python -m app.knowledge.ingest --no-embed` contra o
banco de produção. Os vetores da busca semântica vêm depois, pela ação
`embeddings` e por uma execução noturna, com a sobra da cota gratuita do Gemini
(768 dimensões). A API não lê esta pasta: ela lê o banco. Passo a passo em
[`docs/13-deploy.md`](../docs/13-deploy.md) §5-septies. **Mudou algo aqui
(PDF novo, trocado, entrada nova no manifesto)? Rode `ingerir` depois do
merge** — fora do horário de aula. Tirar algo daqui é outro caminho: a lista
de remoção e o `prune` (D-100), porque a ingestão só acrescenta.

**Cópias idênticas são indexadas uma vez.** Esta pasta guarda 120 cópias byte a
byte (as pastas `Fichas descritivas …` e as cópias avulsas da raiz, na tabela
abaixo), mais a cópia da raiz do Ashby que saiu (abaixo), que a lista de
remoção casa pelo conteúdo. A ingestão agrupa os arquivos pelo sha256 e indexa um de cada grupo:
o que o `manifesto.json` declara; sem declaração, o que já está na base; sem
nenhum dos dois, o primeiro em ordem alfabética. As outras cópias saem como
`ignorado` e o log as conta por pasta (`[ingest] CÓPIAS em …`). Tirá-las do
git é decisão do autor, pendente em [`docs/TODO.md`](../docs/TODO.md) — não
muda o RAG, só o tamanho do clone e da banda de LFS.

**Tamanho.** Os arquivos variam de ~20 KB (fichas técnicas) a **152 MB** (o
maior livro). A ingestão lê o livro inteiro, num runner do Actions e não na API,
com teto de 200 MiB por documento (`KNOWLEDGE_MAX_DOCUMENT_BYTES`) e de 4 000
trechos por documento (`KNOWLEDGE_MAX_CHUNKS_PER_DOCUMENT`, para um livro enorme
não ocupar a busca inteira). A consulta nunca abre um PDF: ela ranqueia trechos
num índice em memória da API. Um PDF digitalizado, sem texto extraível, sai no
log como `SEM TEXTO` e não entra na busca.

**O Ashby em português fica numa edição só** (D-101, atualização de
06/10/2026). `01-Bibliografia/` tinha dois scans de *Seleção de Materiais no
Projeto Mecânico*, não byte a byte iguais, e os dois eram indexados — o texto
saía em dobro na busca e custava o dobro de vetores. Fica `Michael Ashby
(Auth.)-Seleção De Materiais No Projeto Mecânico (2012).pdf` (152 MB, a 4ª
edição); saiu `Selecao_de_Materiais_no_Projeto_Mecanico.pdf` (103,5 MB, sem
data no arquivo). Que o de 2012 é a edição mais nova é **provável, não
confirmado**. O que saiu está em `removidos.txt` pelo caminho e pelo conteúdo,
marcado `mantido-no-historico:`: sai do banco e da ingestão, mas não é material
a apagar do histórico do git. A cópia byte a byte que está na raiz desta
pasta, com o mesmo nome, continua no git (é uma das cópias da tabela abaixo) e é
ignorada pelo conteúdo. Os extratos de capítulo em
`01-Bibliografia/Extratos-de-Capitulos/` não mudam.

## O que está aqui

| Conjunto | Origem | No git? |
|---|---|---|
| `Links.md` | links indicados na disciplina (vídeos, sites, MatWeb, Khan Academy…) | sim |
| `05-Artigos-Cientificos/`, `04-Ferramentas-e-Diagramas/` | periódicos e material didático | sim |
| `01-Bibliografia/` (11 livros comerciais: Ashby, Callister, Apelian…) | bibliografia indicada | sim (LFS) |
| `01-Bibliografia/Extratos-de-Capitulos/` | capítulos extraídos da bibliografia | sim (LFS) |
| `03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/` (103 fichas) | banco de dados licenciado ANSYS/Granta | sim (LFS) |
| `Fichas descritivas de materiais - Granta Edupack - Nível 2/` | cópia idêntica das 103 fichas acima — **não indexada** (a ingestão fica com a de `03-`) | sim (LFS) |
| Cópias avulsas na raiz (18: livros, extratos, diagramas, artigos) | as mesmas obras das pastas numeradas — **não indexadas** | sim (LFS) |

**O que saiu** ([D-100](../docs/DECISIONS.md)): a pasta
`02-Material-de-Curso-ENG02016/` inteira (tópicos de aula 1 a 6, plano de aulas,
ferramentas avaliativas, trabalhos entregues), a pasta `⚙Seleção de Materiais/`
(cópia dos trabalhos) e as cópias avulsas desse material na raiz — 71 arquivos.
Sair do repositório não basta: o que já foi indexado continua no banco até a ação
`conhecimento_remover` do workflow de administração, e continua no histórico do
git até a limpeza descrita em
[`docs/17-limpeza-historico-cerebro.md`](../docs/17-limpeza-historico-cerebro.md).

## Tudo está versionado — e o que isso custa

Por decisão explícita, o Cérebro inteiro está no git: os 11 livros comerciais
de `01-Bibliografia/`, as 103 fichas do Granta EduPack e todo o resto. Nada
fica só no disco — e o que saiu (o material de curso, D-100) saiu do disco
também, não ficou fora do git. Três consequências que é melhor conhecer antes de esbarrar
nelas.

**Git LFS não é opcional aqui.** Todo `*.pdf` e `*.pptx` é ponteiro, não blob —
ver [`.gitattributes`](../.gitattributes). Sem `git lfs` instalado, o clone traz
arquivos de texto de três linhas no lugar dos PDFs:

```bash
git lfs install
git clone https://github.com/Streeft/MaterialSelect-AI.git
```

**A cota do plano gratuito do GitHub é 1 GB de armazenamento LFS e 1 GB de banda
por mês.** O Cérebro ocupa ~653 MB do armazenamento, e um clone completo consome
~653 MB da banda mensal. Esgotada a cota, o LFS fica bloqueado na conta inteira
— inclusive para push — até comprar um data pack ou virar o mês. Quem só precisa
do código, e não dos PDFs, evita o custo assim:

```bash
GIT_LFS_SKIP_SMUDGE=1 git clone https://github.com/Streeft/MaterialSelect-AI.git
```

Pelo mesmo motivo, nenhum job de CI deve baixar objetos LFS: o `actions/checkout`
não os baixa por padrão, e `lfs: true` não deve ser ligado sem necessidade real.
A exceção é uma só: a ação `ingerir` do workflow **Base de conhecimento
(Cérebro)**, que baixa **só os PDFs que o banco ainda não tem** com aqueles
bytes — o `oid` do ponteiro LFS é o sha256 do arquivo, o mesmo checksum que a
base guarda (`python -m app.knowledge.lfs_plan`). A primeira ingestão completa
baixa os 119 PDFs distintos (≈528 MB, mais da metade da banda do mês); as
seguintes, só os novos ou mudados e os que falharam antes, e o plano imprime os
MB antes de baixar. O que foi baixado fica no `actions/cache` por 7 dias sem
uso, o que poupa só uma repetição próxima. As outras ações do workflow não
baixam nada.

**O licenciamento continua em aberto.** Este repositório é público, e livro
comercial íntegro e extrato de banco licenciado ANSYS/Granta agora estão
publicados nele. É o item **M1** do backlog ([`docs/TODO.md`](../docs/TODO.md))
— "triagem de licenciamento das bases incorporadas" —, e ele não foi resolvido,
só adiado: quem revisar decide arquivo a arquivo o que pode continuar aqui.
Tirar um arquivo do histórico depois de publicado exige reescrever o histórico,
não basta um `git rm` — o passo a passo está em
[`docs/17-limpeza-historico-cerebro.md`](../docs/17-limpeza-historico-cerebro.md).

Um detalhe de Windows que custa uma hora se pegar de surpresa: os nomes de
arquivo desta pasta são descritivos de propósito, e os caminhos mais longos
(as fichas Granta de `Fichas descritivas de materiais - Granta Edupack - Nível 2/`)
passam de 190 caracteres. Somado a um diretório de clone fundo, estoura o `MAX_PATH` de
260 e o git falha com `Filename too long`. A correção é por clone, uma vez:

```bash
git config core.longpaths true
```

## Proveniência

Todo documento indexado carrega origem, autoridade da fonte e data de acesso.
Enquanto o catálogo em banco não existe, a tabela acima é o registro; quando
existir, esta seção aponta para ele.

Fonte sem proveniência conhecida é um estado explícito, nunca uma omissão
silenciosa — a mesma disciplina que `is_missing=True` aplica a dado de material
em [`app/domain/data_quality.py`](../apps/api/app/domain/data_quality.py).

## Alimentando esta base ao longo do tempo

Novo material sempre entra pela categoria certa:

- Livro/manual comercial inteiro → `01-Bibliografia/` (entra por LFS; se for
  grande, considere já chegar fatiado por capítulo).
- Capítulo avulso, artigo de periódico com peer review → `01-Bibliografia/Extratos-de-Capitulos/`
  ou `05-Artigos-Cientificos/`, conforme a origem.
- Material de curso (slides de aula, plano de aulas, enunciados, trabalhos de
  alunos) **não entra** — é conteúdo autoral do professor e dos colegas, não
  fonte publicada (D-100).
- Ficha técnica de material (Granta ou outra base licenciada) → `03-Fichas-Tecnicas-*/`,
  seguindo a taxonomia por família já existente.
- Diagrama, ferramenta de apoio, referência metodológica → `04-Ferramentas-e-Diagramas/`.

Se surgir uma categoria nova (ex.: normas técnicas, estudos de caso
industriais), crie uma pasta numerada seguinte (`06-...`) em vez de forçar em
uma existente.
