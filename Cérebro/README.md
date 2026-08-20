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

## O que está aqui

| Conjunto | Origem | No git? |
|---|---|---|
| `Tópico 1` a `Tópico 6` | slides do professor | sim |
| `Plano de Aulas`, `Instruções - Ferramenta avaliativa 1B/2B`, grupos e trios | material da disciplina | sim |
| `⚙Seleção de Materiais/` | trabalhos dos alunos (F.A.1B, F.A.2B) e os gráficos gerados | sim |
| `Links.md` | links indicados na disciplina (vídeos, sites, MatWeb, Khan Academy…) | sim |
| Artigos avulsos (bromélias, 3D printing, Diagramas de Ashby) | periódicos e material didático | sim |
| ~9 livros comerciais (Ashby, Callister, Apelian…) | bibliografia indicada | **não** |
| `Fichas descritivas de materiais - Granta Edupack - Nível 2/` (103 fichas) | banco de dados licenciado ANSYS/Granta | **não** |
| 6 fichas EduPack avulsas em `Trabalho 2/Arquivos para gerar slide/` | idem | **não** |

## O que não é versionado, e por quê

Este repositório é **público**. Livros comerciais íntegros e o extrato do banco
de dados licenciado do Granta EduPack ficam fora do controle de versão: eles
continuam no disco, alimentam a indexação normalmente — **indexar não é
redistribuir** — mas o repositório não os hospeda. Os padrões estão no
[`.gitignore`](../.gitignore) da raiz, comentados um a um.

Publicar qualquer um deles é decisão humana explícita, arquivo a arquivo:

```bash
git add -f "Cérebro/<arquivo>.pdf"
```

O Git LFS já está configurado em [`.gitattributes`](../.gitattributes) para
`*.pdf` e `*.pptx`, então um arquivo desses entra como ponteiro sem passo
adicional — o que importa porque o maior deles tem 145 MB e o teto de um blob
comum no GitHub é 100 MB.

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
