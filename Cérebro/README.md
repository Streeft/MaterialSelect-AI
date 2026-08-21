# Cérebro

> Base de conhecimento de Engenharia de Materiais que fundamenta a camada de IA
> do MaterialSelect AI. Material da disciplina **ENG02016 — Seleção de Materiais
> A (Turma U, 2026/1)**, UFRGS, mais a bibliografia por ela indicada.

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
"bibliografia com peer review / editora" de "material de aula do professor" de
"trabalho de aluno" — os três podem coexistir, mas carregam pesos de confiança
diferentes.

```
Cérebro/
├── 01-Bibliografia/                        Livros comerciais completos (não indexados no git)
│   └── Extratos-de-Capitulos/              Capítulos avulsos extraídos de um dos livros (versionados)
├── 02-Material-de-Curso-ENG02016/          Tudo que é específico desta oferta da disciplina
│   ├── Plano de Aulas...pdf
│   ├── Topicos-de-Aula/                    Tópico 1 a 6 (slides do professor)
│   ├── Ferramentas-Avaliativas/            Instruções, grupos e trios das F.A. 1B/2B
│   └── Trabalhos-Entregues/                Produção dos alunos (F.A.1B, F.A.2B) — NÃO é fonte de verdade,
│                                            é contexto de curso; pode ter erros dos próprios autores
├── 03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/   Banco de dados licenciado ANSYS/Granta (não indexado no git)
├── 04-Ferramentas-e-Diagramas/             Diagramas de Ashby, diagrama de barras de preço
├── 05-Artigos-Cientificos/                 Artigos avulsos de periódico (bromélias, impressão 3D de terra)
├── _Duplicados-Para-Revisao/               Cópias redundantes isoladas na reorganização — ver seção abaixo
├── Links.md                                Links indicados na disciplina
└── README.md                               Este arquivo
```

A estrutura interna de `03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/` (por
família de material: Metais e ligas, Cerâmicas e vidros, Polímeros e
elastômeros, Híbridos/compósitos/espumas/materiais naturais, com subpastas por
subfamília) já veio bem organizada do EduPack e foi mantida como estava —
não precisa de retrabalho.

## Recomendação de ingestão — evitar travamentos

Os arquivos aqui variam de ~20 KB (fichas técnicas) a **151 MB** (o maior
livro). Indexar tudo com o mesmo pipeline, do mesmo jeito, é a causa mais
provável de travamento/timeout numa consulta:

- **`03-*` (fichas Granta) e `04-*`/`05-*`**: arquivos pequenos (a maioria
  < 1 MB, nenhum > 20 MB). Seguros para indexação direta, arquivo inteiro de
  uma vez.
- **`02-*` (material de curso)**: pequenos/médios (a maioria < 10 MB). Também
  seguros para indexação direta.
- **`01-Bibliografia/` (livros completos)**: vários arquivos entre 40 MB e
  151 MB. **Não indexar o PDF inteiro de uma vez.** Ou (a) fatiar por
  capítulo/faixa de página antes de indexar — o padrão já existe nos
  `Extratos-de-Capitulos/` —, ou (b) tratar como fonte de consulta sob
  demanda (RAG com leitura de página específica) em vez de embutir o livro
  inteiro no índice vetorial.

Dois arquivos merecem checagem manual antes da próxima ingestão: `Michael
Ashby (Auth.)-Seleção De Materiais No Projeto Mecânico (2012).pdf` (151 MB) e
`Selecao_de_Materiais_no_Projeto_Mecanico.pdf` (103 MB), em `01-Bibliografia/`,
parecem ser a mesma tradução PT do livro do Ashby em dois scans diferentes.
Não foram mesclados/removidos nesta reorganização por falta de confirmação de
conteúdo — abra os dois e decida se um deles pode sair.

## Duplicatas isoladas em `_Duplicados-Para-Revisao/`

Não apagadas — só tiradas do caminho principal para não indexar conteúdo
repetido nem confundir a IA com duas versões da "mesma" fonte:

- `Selecao_de_Materiais_no_Projeto_Mecanico - Capítulo 3 ... (copia
  identica).pdf` — bit-a-bit idêntico ao que ficou em
  `01-Bibliografia/Extratos-de-Capitulos/`.
- `Tópico 1 - ... (versao sem data, superada).pdf` — versão mais antiga e menor
  do Tópico 1; a versão datada `- atualizado em 17-03-26` ficou em
  `02-Material-de-Curso-ENG02016/Topicos-de-Aula/` como a canônica.

Quando revisar, ou apague de vez ou reintegre — não deixe parado por muito
tempo, esta pasta é propositalmente provisória.

## O que está aqui

| Conjunto | Origem | No git? |
|---|---|---|
| `02-Material-de-Curso-ENG02016/Topicos-de-Aula/` (Tópico 1 a 6) | slides do professor | sim |
| `02-Material-de-Curso-ENG02016/` (Plano de Aulas, Ferramentas-Avaliativas) | material da disciplina | sim |
| `02-Material-de-Curso-ENG02016/Trabalhos-Entregues/` | trabalhos dos alunos (F.A.1B, F.A.2B) e os gráficos gerados | sim |
| `Links.md` | links indicados na disciplina (vídeos, sites, MatWeb, Khan Academy…) | sim |
| `05-Artigos-Cientificos/`, `04-Ferramentas-e-Diagramas/` | periódicos e material didático | sim |
| `01-Bibliografia/` (~9 livros comerciais: Ashby, Callister, Apelian…) | bibliografia indicada | **não** |
| `01-Bibliografia/Extratos-de-Capitulos/` | capítulos extraídos da bibliografia | sim |
| `03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/` (103 fichas) | banco de dados licenciado ANSYS/Granta | **não** |
| 6 fichas EduPack avulsas em `Trabalhos-Entregues/Trabalho 2/Arquivos para gerar slide/` | idem | **não** |

## O que não é versionado, e por quê

Este repositório é **público**. Livros comerciais íntegros e o extrato do banco
de dados licenciado do Granta EduPack ficam fora do controle de versão: eles
continuam no disco, alimentam a indexação normalmente — **indexar não é
redistribuir** — mas o repositório não os hospeda. Os padrões estão no
[`.gitignore`](../.gitignore) da raiz, comentados um a um (ver o patch
entregue junto com esta reorganização, atualizado para a nova estrutura de
pastas).

Publicar qualquer um deles é decisão humana explícita, arquivo a arquivo:

```bash
git add -f "Cérebro/01-Bibliografia/<arquivo>.pdf"
```

O Git LFS já está configurado em [`.gitattributes`](../.gitattributes) para
`*.pdf` e `*.pptx` — casa por extensão, então não muda com o novo caminho —,
então um arquivo desses entra como ponteiro sem passo adicional — o que
importa porque o maior deles tem 151 MB e o teto de um blob comum no GitHub é
100 MB.

Isto é, em espírito, o item **M1** do backlog ([`docs/TODO.md`](../docs/TODO.md))
— "triagem de licenciamento das bases incorporadas" — aplicado a arquivo em
disco antes de existir a tabela que o fará no banco.

## Proveniência

Todo documento indexado carrega origem, autoridade da fonte e data de acesso.
Enquanto o catálogo em banco não existe, a tabela acima e o `.gitignore` são o
registro; quando existir, esta seção aponta para ele.

Fonte sem proveniência conhecida é um estado explícito, nunca uma omissão
silenciosa — a mesma disciplina que `is_missing=True` aplica a dado de material
em [`app/domain/data_quality.py`](../apps/api/app/domain/data_quality.py).

## Alimentando esta base ao longo do tempo

Novo material sempre entra pela categoria certa:

- Livro/manual comercial inteiro → `01-Bibliografia/` (fora do git; se for
  grande, considere já chegar fatiado por capítulo).
- Capítulo avulso, artigo de periódico com peer review → `01-Bibliografia/Extratos-de-Capitulos/`
  ou `05-Artigos-Cientificos/`, conforme a origem.
- Slide/material desta ou de outra oferta da disciplina → `02-Material-de-Curso-ENG02016/`,
  na subpasta correspondente.
- Ficha técnica de material (Granta ou outra base licenciada) → `03-Fichas-Tecnicas-*/`,
  seguindo a taxonomia por família já existente.
- Diagrama, ferramenta de apoio, referência metodológica → `04-Ferramentas-e-Diagramas/`.

Se surgir uma categoria nova (ex.: normas técnicas, estudos de caso
industriais), crie uma pasta numerada seguinte (`06-...`) em vez de forçar em
uma existente.
