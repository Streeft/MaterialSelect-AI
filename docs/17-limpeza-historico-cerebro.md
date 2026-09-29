# Limpeza do histórico do Cérebro: tirar o material de curso de todos os commits

Guia passo a passo para o autor apagar do **histórico inteiro** do git os
arquivos que saíram do Cérebro no [D-100](DECISIONS.md) — o material de curso da
ENG02016 e os trabalhos entregues. O PR do D-100 tirou esses arquivos da árvore
atual, mas `git rm` não reescreve o passado: até esta limpeza, quem abrir um
commit antigo ainda lê os 71 arquivos. Eles entraram em dois momentos: as
cópias da raiz e a pasta `⚙Seleção de Materiais/` no `764b0af` (20/08/2026,
primeira versão do Cérebro), e a pasta `02-Material-de-Curso-ENG02016/` no
`565a6d2` (PR #17).

A lista do que sai é a mesma que a remoção do banco usa:
[`Cérebro/removidos.txt`](../Cérebro/removidos.txt). Não mantenha outra.

> **Nada aqui é feito por agente nem por CI.** É uma operação manual, feita uma
> vez, pelo dono do repositório, depois do merge do PR do D-100. Ela reescreve
> todos os SHAs a partir do primeiro commit que tocou esses arquivos e exige um
> *force-push* em `main`. Leia o guia inteiro antes de começar.

## 0. O que isto faz, e o que não faz

**Faz:** remove dos commits, em todas as branches e tags, cada caminho da lista
de remoção. Os commits continuam existindo, com SHAs novos e sem esses arquivos.
O resto do Cérebro — livros, extratos, fichas Granta, diagramas, artigos —
**fica no histórico como estava** ([D-45](DECISIONS.md), emendado pelo D-100).

**Não faz, e é bom saber antes:**

- **Não apaga os objetos Git LFS já guardados no GitHub.** Os PDFs e PPTX do
  Cérebro são ponteiros LFS; o conteúdo mora no armazenamento LFS do GitHub, que
  a reescrita do histórico não toca. Depois do *force-push*, nenhum commit aponta
  mais para esses objetos, mas eles continuam lá, e quem tiver o identificador
  (de um clone antigo, por exemplo) ainda consegue baixá-los. **Apagar esses
  objetos exige o suporte do GitHub, ou apagar e recriar o repositório.** Não há
  comando do lado do cliente que faça isso.
- **Não limpa o que o GitHub guarda à parte.** Visões em cache de commits
  antigos, as refs de PR (`refs/pull/*`, que só o GitHub escreve) e os *forks*
  continuam servindo o conteúdo antigo até o suporte do GitHub removê-los. Um
  *fork* de outra pessoa é dela: o suporte não o reescreve.
- **Não apaga o texto que outros arquivos guardam sobre eles.** Versões antigas
  de `Cérebro/manifesto.json` citam os caminhos e títulos dos trabalhos — e um
  deles tem nomes de colegas no nome do arquivo. Remover o caminho não altera o
  conteúdo de outro arquivo; o passo 5 trata disso.

## 1. Antes de começar

1. **O PR do D-100 está mesclado em `main`.** A lista de remoção que o passo 4
   lê vem de `main`.
2. **A remoção em produção já rodou.** Na aba **Actions** →
   **Administração do banco** → **Run workflow**: primeiro
   `conhecimento_simular_remocao`, conferir no log os documentos e os totais, e
   depois `conhecimento_remover`. O log tem de terminar em
   `[prune] REMOVIDOS: N documentos, M trechos, K embeddings.` com os mesmos
   totais da simulação ([13-deploy.md](13-deploy.md) §5-bis). Faça isso
   **antes** do *force-push*: depois dele, o workflow roda sobre o histórico
   novo, e é melhor não misturar as duas operações.
3. **Nenhum PR aberto.** Mescle ou feche todos. Um PR aberto sobre o histórico
   antigo fica impossível de mesclar depois, e reabri-lo traria os arquivos de
   volta.
4. **Avise quem tem clone.** Depois do *force-push*, todo clone existente está
   do lado errado da reescrita e **precisa ser refeito do zero** (passo 9).
   Isso inclui os seus, os de outras máquinas e os ambientes de agente.
5. **Instale o git-filter-repo** (é um script Python; exige Python 3):

   ```bash
   pip install git-filter-repo        # ou: brew install git-filter-repo
   git filter-repo --version          # confirma que o git o encontra
   ```

   No Windows, use o **Git Bash** para os comandos deste guia: o PowerShell 5.1
   decodifica a saída do git na página de código do console e estraga os
   acentos dos caminhos.

## 2. Um clone espelho novo

A reescrita é feita num clone **novo**, nunca no seu clone de trabalho.
`--mirror` traz todas as branches e tags, que é o que precisa ser reescrito.

```bash
mkdir limpeza-cerebro && cd limpeza-cerebro
git clone --mirror https://github.com/Streeft/MaterialSelect-AI.git repo.git
cp -r repo.git repo-backup.git      # cópia de segurança, para desfazer
```

O clone espelho só traz os ponteiros LFS, não os PDFs — é o que se quer: a
reescrita mexe nos ponteiros, e nenhum objeto LFS é baixado.

## 3. Veja o que existe no histórico

Antes de apagar, liste os caminhos do histórico que a lista vai pegar. Isso
também confirma que a lista está certa:

```bash
git -C repo.git -c core.quotepath=off log --all --format= --name-only \
  | sort -u > todos-os-caminhos.txt
grep -c '^Cérebro/' todos-os-caminhos.txt
```

## 4. Converta a lista de remoção para o formato do git-filter-repo

`Cérebro/removidos.txt` usa caminhos **relativos à pasta `Cérebro/`**, com `#`
para comentário e `/` no fim para pasta. O `--paths-from-file` do
git-filter-repo quer caminhos **relativos à raiz do repositório**, um por linha;
uma linha que termina em `/` também vale como pasta inteira ali. Basta tirar
comentários e linhas em branco e pôr `Cérebro/` na frente:

```bash
git -C repo.git show 'HEAD:Cérebro/removidos.txt' \
  | tr -d '\r' \
  | grep -v -e '^#' -e '^[[:space:]]*$' \
  | sed 's|^|Cérebro/|' > caminhos-para-remover.txt
cat caminhos-para-remover.txt
```

O resultado são 14 linhas: as duas pastas
(`Cérebro/02-Material-de-Curso-ENG02016/` e `Cérebro/⚙Seleção de Materiais/`) e
12 arquivos avulsos na raiz. Os nomes têm acento e um deles tem **dois espaços
seguidos** (`trios definidos para a FA1B -  Mapeamento…`) — não edite o arquivo
à mão, gere-o como acima.

Confira quantos caminhos do histórico cada linha vai levar:

```bash
while IFS= read -r p; do
  printf '%4d  %s\n' "$(grep -c -F -- "$p" todos-os-caminhos.txt)" "$p"
done < caminhos-para-remover.txt
```

Toda linha deve casar pelo menos um caminho. As duas pastas somam 59 arquivos, e
cada arquivo avulso casa 1.

## 5. Os nomes que ficam no texto de outros arquivos

As versões antigas de `Cérebro/manifesto.json` descrevem os trabalhos entregues
pelo caminho e pelo título, e uma dessas entradas traz os nomes dos integrantes
do grupo — no caminho e no título. Tirar o arquivo do histórico não altera o
manifesto antigo. Para limpar esse texto, use o `--replace-text` do
git-filter-repo **na mesma execução** do passo 6.

As duas regras abaixo trocam, em todo o histórico, o valor de toda entrada
`"path"` do material de curso e o título do trabalho F.A.2B por um marcador. Elas
casam pela forma, não pelos nomes, e por isso podem ficar escritas aqui sem
publicar de novo o que se quer apagar. Salve-as como `substituicoes.txt`, ao
lado de `repo.git`:

```text
regex:"path": "02-Material-de-Curso-ENG02016/[^"]*"==>"path": "[material de curso removido]"
regex:"titulo": "F\.A\.2B [^"]*"==>"titulo": "[material de curso removido]"
```

Para conferir, antes, o que elas vão pegar:

```bash
git -C repo.git log --all -p -- 'Cérebro/manifesto.json' \
  | grep -n -e '"path": "02-Material-de-Curso' -e '"titulo": "F.A.2B'
```

Foi o único texto com nome de aluno fora dos próprios arquivos removidos
(conferido em 29/09/2026 em todo o histórico, mensagens de commit incluídas),
então `--replace-message` não é necessário.

## 6. Reescreva o histórico

```bash
cd repo.git
git filter-repo \
  --invert-paths \
  --paths-from-file ../caminhos-para-remover.txt \
  --replace-text ../substituicoes.txt
cd ..
```

- `--invert-paths` inverte o filtro: em vez de manter só os caminhos da lista,
  **remove** os caminhos da lista e mantém todo o resto.
- Se o git-filter-repo recusar dizendo que o repositório não parece um clone
  novo, confira que você está mesmo em `repo.git`, recém-clonado no passo 2, e só
  então repita com `--force`.
- O git-filter-repo remove o remoto `origin` ao terminar, de propósito, para que
  um *push* não saia sem querer. O passo 8 dá o endereço por extenso.
- Ele também imprime *"Some branches outside the refs/remotes/ hierarchy were
  not removed; to delete them, use: git branch -d …"*. **Ignore.** Num clone
  espelho as branches moram em `refs/heads/`, e são exatamente elas que o
  passo 8 envia; apagá-las apagaria `main` no GitHub.
- Os comandos deste guia foram ensaiados num espelho descartável do
  repositório em 29/09/2026 (git-filter-repo 2.47.0): as 14 linhas casaram, o
  resultado da verificação do passo 7 foi o descrito, e nada foi enviado.

## 7. Verifique antes de enviar

Nenhum caminho da lista pode aparecer em commit nenhum:

```bash
while IFS= read -r p; do
  printf '%4d  %s\n' "$(git -C repo.git log --all --oneline -- "$p" | wc -l)" "$p"
done < caminhos-para-remover.txt
```

Todas as linhas devem começar com `0`. E, individualmente, o comando que diz
"este arquivo nunca existiu":

```bash
git -C repo.git log --all -- 'Cérebro/02-Material-de-Curso-ENG02016/'
git -C repo.git log --all -- 'Cérebro/⚙Seleção de Materiais/'
```

Os dois não devem imprimir nada. Confira também que o resto do Cérebro ficou e
que os nomes sumiram do texto:

```bash
git -C repo.git -c core.quotepath=off ls-tree -r --name-only main | grep -c '^Cérebro/'
git -C repo.git log --all -p -- 'Cérebro/manifesto.json' | grep -c 'Trabalhos-Entregues'
```

O primeiro número deve ser o mesmo de `main` antes da reescrita (246 arquivos em
`Cérebro/` depois do D-100) — sem o `core.quotepath=off`, o git escreve os
caminhos acentuados entre aspas e em octal, e a contagem dá `0` por engano. O
segundo deve ser `0` se o passo 5 foi feito.

## 8. Envie: o *force-push*

1. **Desligue a proteção de `main` que impede *force-push*.** Em *Settings →
   Branches* (ou *Settings → Rules → Rulesets*, conforme como a proteção foi
   criada — ver `scripts/protect-main.ps1`), permita *force-push* em `main`
   temporariamente. Sem isso, o GitHub recusa a atualização de `main`.
2. Envie todas as refs reescritas:

   ```bash
   git -C repo.git push --force --mirror https://github.com/Streeft/MaterialSelect-AI.git
   ```

   Erros `! [remote rejected] refs/pull/…/head (deny updating a hidden ref)` são
   **esperados**: as refs de PR são do GitHub e não aceitam *push*. Elas
   continuam apontando para o histórico antigo — é uma das coisas que só o
   suporte limpa (passo 10). Qualquer outra ref recusada é problema real:
   pare e investigue.
3. **Religue a proteção de `main`** do jeito que estava (reaplicar
   `scripts/protect-main.ps1` restaura as regras do projeto).
4. Confira no GitHub: a página de `main` mostra o histórico novo, e
   `github.com/Streeft/MaterialSelect-AI/tree/main/Cérebro` não tem as pastas
   removidas.

## 9. O que quebra, e o que fazer com cada coisa

- **Todo clone existente.** Apague e clone de novo. Não tente `pull`: o git
  mesclaria o histórico antigo com o novo e traria os arquivos de volta. E
  **não envie nenhuma branch criada antes da reescrita** — ela carrega o
  histórico antigo inteiro, com os arquivos.
- **PRs abertos e *forks*.** Continuam com as refs antigas. PR aberto não pode
  ser mesclado; feche. *Forks* de outras pessoas guardam o histórico antigo e
  só o dono de cada um pode apagá-lo — veja a lista em
  `github.com/Streeft/MaterialSelect-AI/network/members`.
- **Links para commits antigos.** SHAs antigos citados em documentos, issues e
  no `DECISIONS.md` (o `565a6d2` do D-45, por exemplo) deixam de corresponder a
  commits de `main`; o GitHub ainda pode mostrá-los por um tempo, a partir do
  cache.
- **Deploy.** Nada muda na Vercel nem no Fly: a Vercel reconstrói ao ver o *push*
  em `main`, e a API e o banco não dependem do histórico.

## 10. Peça ao suporte do GitHub o que só ele faz

Pelo formulário de contato do suporte do GitHub (`support.github.com`), como
dono do repositório, peça:

1. **A remoção dos objetos Git LFS** que não são mais referenciados — os PDFs e
   PPTX do material de curso. Este é o único jeito de apagá-los sem apagar o
   repositório; a alternativa é apagar e recriar o repositório, o que também
   zera issues, PRs, estrelas e a configuração do GitHub Actions.
2. **A remoção das visões em cache e das refs de PR** que ainda servem os
   arquivos antigos. Informe o nome do repositório, que o histórico foi
   reescrito com git-filter-repo para retirar material de terceiros, os PRs
   afetados (os PRs anteriores à reescrita) e o primeiro commit que tinha os
   arquivos (`764b0af`, de 20/08/2026) e o do PR #17 (`565a6d2`).

Os PNG dos gráficos dos trabalhos não eram LFS, eram objetos comuns do git; a
reescrita já os tira do histórico, e o suporte cuida da cópia que o GitHub ainda
guarda.

## 11. Depois

- Registre em `docs/TODO.md` (A7) e em `docs/CHANGELOG_SESSION.md` que a
  limpeza foi feita, com a data e o resultado da verificação do passo 7.
- Apague `repo-backup.git` só depois de confirmar, com um clone novo, que tudo
  está como deveria.
- Nada a mudar em `Cérebro/removidos.txt`: ela continua valendo para a ingestão
  e para a remoção do banco.
