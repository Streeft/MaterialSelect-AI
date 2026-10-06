# Limpeza do histórico do Cérebro: tirar o material de curso de todos os commits

> **Executado em 30/09/2026.** O autor seguiu este guia depois do merge do
> PR #85: `main` passou de `873dd53` para `b7dd105`, com a árvore idêntica; os
> 71 caminhos e os nomes dos alunos aparecem 0 vezes no histórico; a *ruleset*
> foi religada. Faltam o pedido ao suporte (passo 10) e refazer todo clone
> anterior a 30/09/2026 (passo 9). Registro completo no
> [D-100](DECISIONS.md), "Execução"; pendências em [TODO.md](TODO.md) A7. O
> guia fica como referência para uma próxima remoção.

Guia passo a passo para o autor apagar do **histórico inteiro** do git os
arquivos que saíram do Cérebro no [D-100](DECISIONS.md) — o material de curso da
ENG02016 e os trabalhos entregues. O PR do D-100 tirou esses arquivos da árvore
atual, mas `git rm` não reescreve o passado: até esta limpeza, quem abrir um
commit antigo ainda lê os 71 arquivos. Eles entraram por mais de um commit e
por mais de um PR, e a formulação que vale — aqui e no pedido ao suporte do
GitHub (passo 10) — é **todo commit e todo PR anteriores à reescrita**, não uma
lista de SHAs.

A lista do que sai é a mesma que a remoção do banco usa:
[`Cérebro/removidos.txt`](../Cérebro/removidos.txt). Não mantenha outra. Ela
tem três tipos de linha: caminhos, que este guia usa; `sha256:<conteúdo>`,
que só o banco e a ingestão usam — o git-filter-repo remove por caminho, e o
passo 4 descarta essas linhas —; e `mantido-no-historico:<caminho>`, um caminho
que sai do banco e da ingestão mas **fica** no histórico, e que o passo 4 também
descarta. Este último existe para o que sai do RAG por outro motivo que não o
do D-100: a edição duplicada do Ashby em português
(`01-Bibliografia/Selecao_de_Materiais_no_Projeto_Mecanico.pdf` e a cópia
byte a byte dele na raiz, `Selecao_de_Materiais_no_Projeto_Mecanico.pdf`;
D-101, atualização de 06/10/2026) saiu da base para o texto não aparecer em dobro, e o
autor **não** quer o histórico reescrito por ela.

> **Nada aqui é feito por agente nem por CI.** É uma operação manual, feita uma
> vez, pelo dono do repositório, depois do merge do PR do D-100. Ela reescreve
> todos os SHAs a partir do primeiro commit que tocou esses arquivos e exige um
> *force-push* em `main`. Leia o guia inteiro antes de começar.

## 0. O que isto faz, e o que não faz

**Faz:** remove dos commits, em todas as branches e tags, cada caminho da lista
de remoção — menos os marcados `mantido-no-historico:`, que ficam. Os commits continuam existindo, com SHAs novos e sem esses arquivos
— **quase todos**: commits que, sem os arquivos removidos, ficam idênticos a
outro são colapsados num só. Em 30/09/2026 isso levou 76 duplicatas que uma
reescrita anterior tinha deixado em `main`, que foi de 659 para 583 commits;
nenhum conteúdo fora da lista se perde, só a cópia. **As assinaturas GPG se
perdem**: o "Verified" do GitHub some de todo commit reescrito, porque a
assinatura era sobre o SHA antigo, e não há como refazê-la sem a chave de quem
assinou. O resto do Cérebro — livros, extratos, fichas Granta, diagramas, artigos —
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
- **Não apaga os logs do GitHub Actions.** Os logs das execuções de
  `conhecimento_simular_remocao` e `conhecimento_remover` são públicos e ficam
  guardados pelo prazo de retenção; o `--redact` já os tira de nomes de
  arquivo, e o passo 1.3 manda apagá-los mesmo assim.
- **Não apaga o texto que outros arquivos guardam sobre eles.** Versões antigas
  de `Cérebro/manifesto.json` citam os caminhos e títulos dos trabalhos — e um
  deles tem nomes de colegas no nome do arquivo. Remover o caminho não altera o
  conteúdo de outro arquivo; o passo 5 trata disso.

## 1. Antes de começar

1. **O PR do D-100 está mesclado em `main`.** A lista de remoção que o passo 4
   lê vem de `main`.
2. **Confira as suas pastas locais antes de tudo.** O banco foi povoado do
   **seu disco**, não da árvore do git, e o caminho gravado em cada documento é
   o do disco: uma cópia do material de curso em
   `Cérebro/_Duplicados-Para-Revisao/` (a pasta de triagem que o `.gitignore`
   deixa só local), numa pasta renomeada ou num layout antigo tem um caminho
   que nenhuma linha da lista nomeia. As linhas `sha256:` da lista pegam essas
   cópias pelo conteúdo, desde que os bytes sejam os mesmos — então, antes da
   remoção, abra essas pastas, apague as cópias de material de curso que
   encontrar, e leia a simulação do item 3 inteira, não só o total. Se ela
   mostrar, entre o que fica, um documento de material de curso que nenhuma
   linha casou (uma cópia com bytes diferentes, por exemplo), acrescente a
   `removidos.txt`, num PR e antes do `conhecimento_remover`, uma linha
   **`sha256:`** com o conteúdo dele — o `sha256sum` do arquivo no seu disco
   (confira que os 8 primeiros dígitos são os que o log mostra) ou o
   `knowledge_document.checksum` da base. **Não acrescente o caminho.** O
   caminho de uma cópia local nunca esteve no git, então não serve à limpeza do
   histórico; e `removidos.txt` é público, e o nome de uma cópia pode trazer
   justamente os nomes de alunos ou os títulos de aula que se quer apagar. A
   linha `sha256:` faz o mesmo trabalho no banco e na ingestão sem publicar
   nome nenhum.
3. **A remoção em produção já rodou.** Na aba **Actions** →
   **Administração do banco** → **Run workflow**: primeiro
   `conhecimento_simular_remocao`, conferir no log os documentos e os totais, e
   depois `conhecimento_remover`. A simulação lista **cada documento que
   fica** (`[prune] ficaria: …`) e a contagem por pasta de primeiro nível: é ali
   que aparece uma pasta que ninguém esperava, como
   `_Duplicados-Para-Revisao (N)`. O log do `conhecimento_remover` tem de conter
   `[prune] REMOVIDOS: N documentos, M trechos, K embeddings.` com os mesmos
   totais da simulação ([13-deploy.md](13-deploy.md) §5-bis). Faça isso
   **antes** do *force-push*: depois dele, o workflow roda sobre o histórico
   novo, e é melhor não misturar as duas operações.

   **O log do Actions é público, como o repositório.** Por isso as duas ações
   rodam o `prune` com `--redact`: no lugar do nome de cada arquivo, removido
   ou que fica, sai a pasta de primeiro nível e o começo do conteúdo —
   `02-Material-de-Curso-ENG02016/… sha256:1a2b3c4d` —, e um arquivo da raiz
   aparece como `(raiz)/…`. Trechos, embeddings, o motivo do casamento, a
   contagem por pasta e os totais continuam lá: é isso que prova o que foi
   apagado. Os caminhos completos só saem numa execução local, sem a opção
   (item 4). E, como segunda camada, **apague os logs das duas execuções**
   depois de copiar os totais para o `CHANGELOG_SESSION.md`: Actions → a
   execução → ⋯ → **Delete all logs**. Um log fica guardado pelo prazo de
   retenção do repositório (90 dias, por padrão), e nem a reescrita do
   histórico nem o suporte o tocam.
4. **E nas bases locais e de desenvolvimento.** Toda base em que você já rodou
   `python -m app.knowledge.ingest` (a do seu computador, uma de teste, um
   Postgres de desenvolvimento) guarda os mesmos trechos. Rode, apontando
   `DATABASE_URL` para cada uma:

   ```bash
   cd apps/api
   python -m app.knowledge.prune --list "../../Cérebro/removidos.txt"           # simulação
   python -m app.knowledge.prune --list "../../Cérebro/removidos.txt" --apply   # apaga
   ```

   Uma ingestão local também avisa: todo arquivo pulado pela lista sai como
   `[ingest] IGNORADO …`, e, se ele ainda tiver linha naquela base, a mensagem
   diz para rodar o `prune`.
5. **Nenhum PR aberto.** Mescle ou feche todos. Um PR aberto sobre o histórico
   antigo fica impossível de mesclar depois, e reabri-lo traria os arquivos de
   volta.
6. **Avise quem tem clone, e que ninguém envia nada até o fim.** Depois do
   *force-push*, todo clone existente está do lado errado da reescrita e
   **precisa ser refeito do zero** (passo 9). Isso inclui os seus, os de outras
   máquinas e os ambientes de agente. E, do clone do passo 2 até o *push* do
   passo 8, **ninguém pode enviar nada ao GitHub** — nem você de outra máquina,
   nem um agente, nem um bot: um commit que chegue a `main` nesse intervalo é
   sobrescrito pelo *force-push* e se perde, e uma branch criada nesse
   intervalo continua com o histórico antigo inteiro.
7. **Instale o git-filter-repo** (é um script Python; exige Python 3):

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
comentários, linhas em branco e as linhas `sha256:` e `mantido-no-historico:`,
e pôr `Cérebro/` na frente:

```bash
git -C repo.git show 'HEAD:Cérebro/removidos.txt' \
  | sed '1s/^\xEF\xBB\xBF//' \
  | tr -d '\r' \
  | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' \
  | grep -v -e '^#' -e '^[[:space:]]*$' -e '^sha256:' -e '^mantido-no-historico:' \
  | sed 's|^|Cérebro/|' > caminhos-para-remover.txt
cat caminhos-para-remover.txt
```

As linhas `sha256:` saem aqui de propósito: o `--paths-from-file` só entende
caminho, e uma linha `sha256:…` viraria um caminho que não existe. É por isso
que os 12 arquivos avulsos da raiz continuam listados pelo nome na lista, mesmo
tendo o conteúdo coberto pelas linhas `sha256:` — sem o nome, este passo não os
tiraria do histórico. As linhas `mantido-no-historico:` saem pelo motivo
oposto: o caminho é real, e é justamente o que **não** se quer reescrever — sem
esse `-e`, o Ashby duplicado do D-101 iria para o `--paths-from-file` e sairia
do histórico junto com o material de curso. Se um dia uma versão deste bloco
sem esse filtro for usada, tire a linha à mão do `caminhos-para-remover.txt`
antes do passo 6; o teste `TestHistoryPurgeConversion`
(`apps/api/app/tests/test_knowledge_prune.py`) roda este bloco sobre a lista
real e confere que ele produz exatamente o que `RemovalList.history_purge_entries`
diz. O primeiro `sed` tira uma eventual marca de ordem de
bytes (BOM), que o PowerShell 5.1 grava e que colaria na primeira linha; o
segundo tira espaços nas pontas de cada linha, como faz a leitura da lista no
banco e na ingestão — sem isso, um espaço esquecido no fim de uma linha faria o
git-filter-repo procurar um caminho que não existe, enquanto o `prune` casava
normalmente.

O resultado são 14 linhas — as mesmas antes e depois do D-101: as duas pastas
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
cada arquivo avulso casa 1. Uma cópia que só existia no seu disco entra na lista
como `sha256:` (passo 1.2), e por isso não chega a este arquivo.

## 5. Os nomes que ficam no texto de outros arquivos

As versões antigas de `Cérebro/manifesto.json` descrevem os trabalhos entregues
pelo caminho e pelo título, e uma dessas entradas traz os nomes dos integrantes
do grupo — no caminho e no título. Tirar o arquivo do histórico não altera o
manifesto antigo. Para limpar esse texto, use o `--replace-text` do
git-filter-repo **na mesma execução** do passo 6.

As duas regras abaixo trocam, em todo o histórico, o valor de toda entrada
`"path"` do material de curso e o título do trabalho F.A.2B por um marcador. Elas
casam pela forma, não pelos nomes, e por isso podem ficar escritas aqui sem
publicar de novo o que se quer apagar. A primeira termina em `\.pdf"` de
propósito: o `--replace-text` vale para **todo** arquivo de todo commit, este
guia incluído, e uma regra que casasse o próprio texto se reescreveria no
histórico novo. Assim ela ainda pega as 21 entradas do manifesto antigo (todas
PDF) e não a si mesma. Salve-as como `substituicoes.txt`, ao
lado de `repo.git`:

```text
regex:"path": "02-Material-de-Curso-ENG02016/[^"]*\.pdf"==>"path": "[material de curso removido]"
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
  repositório (git-filter-repo 2.47.0), primeiro em 29/09/2026 e de novo na
  revisão, em 30/09/2026, com a regra do passo 5 na forma atual e o envio do
  passo 8: as 14 linhas casaram, a diferença de `main` antes e depois foi
  exatamente os 71 arquivos da lista mais o `manifesto.json`, a regra ancorada
  em `\.pdf"` não reescreveu este guia, e o envio foi para uma cópia local —
  com um *hook* que recusava `main`, as duas refs voltaram recusadas e nada
  mudou; sem o *hook*, as duas foram atualizadas. Nada foi enviado ao GitHub.

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

1. **Suspenda a proteção de `main`.** A proteção deste repositório é a
   *ruleset* **`CI obrigatoria em main`** (criada por
   `scripts/protect-main.ps1`), e ela tem uma regra só: *required status
   checks*. Não há chave "permitir *force-push*" para ligar — o que barra o
   envio é essa regra: todo SHA reescrito é novo, nenhum tem checks verdes, e o
   GitHub recusa a atualização de `main`. Então:
   - em **Settings → Rules → Rulesets → `CI obrigatoria em main`**, mude
     **Enforcement status** para **Disabled** e salve; **ou** acrescente você
     mesmo em **Bypass list** (*Add bypass* → o seu usuário ou o papel
     *Repository admin*), o que deixa a regra valendo para os outros;
   - em **Settings → Branches**, veja se existe também uma *branch protection
     rule* clássica para `main`. O projeto não cria uma, mas, se houver, ela
     precisa permitir *force-push* (*Allow force pushes*) ou ser apagada
     temporariamente — anote como estava.
2. **Envie as branches e as tags, numa operação atômica:**

   ```bash
   git -C repo.git push --force --atomic https://github.com/Streeft/MaterialSelect-AI.git \
     'refs/heads/*:refs/heads/*' 'refs/tags/*:refs/tags/*'
   ```

   Por que assim e não `--mirror`: o `--mirror` também tenta enviar as refs de
   PR (`refs/pull/*`), que o GitHub sempre recusa — e não é atômico, então uma
   `main` recusada deixaria as outras branches e as tags já reescritas ao lado
   da `main` antiga, com os arquivos, como branch padrão. Nomeando só
   `refs/heads/*` e `refs/tags/*`, nenhuma recusa é esperada, e o `--atomic`
   garante que ou **todas** as refs são atualizadas, ou **nenhuma**. (O
   `--mirror` também apagaria no GitHub qualquer branch criada depois do clone;
   este comando não apaga nada — mais um motivo para ninguém enviar nada no
   intervalo, passo 1.6.)

   **Se o push for recusado**, a saída diz `! [remote rejected]` (ou
   `atomic push failed`) e o GitHub **fica exatamente como estava**: nenhuma
   ref mudou, e o histórico antigo continua lá, inteiro. O motivo mais provável
   é a proteção do item 1 ainda ativa (a mensagem cita *rule violations* ou
   *protected branch*). Corrija e repita o mesmo comando; `repo.git` não
   precisa ser refeito. Se o seu git for antigo demais para `--atomic` (a
   mensagem diz que o servidor ou o cliente não o suporta), **não** tire o
   `--atomic`: atualize o git.
3. **Religue a proteção de `main`** do jeito que estava: **Enforcement status**
   de volta para **Active** (ou tire você da *Bypass list*), e a regra clássica,
   se havia uma, como você anotou. Reaplicar `scripts/protect-main.ps1` também
   restaura a *ruleset* do projeto.
4. Confira no GitHub: a página de `main` mostra o histórico novo, e
   `github.com/Streeft/MaterialSelect-AI/tree/main/Cérebro` não tem as pastas
   removidas. As refs de PR (`refs/pull/*`) continuam apontando para o
   histórico antigo — só o suporte as limpa (passo 10).

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
   reescrito com git-filter-repo para retirar material de terceiros, e que são
   afetados **todos os commits e todos os PRs anteriores à reescrita** — não
   uma lista de SHAs. Cite nominalmente o **PR #56**: a ref de cabeça dele
   (`refs/pull/56/head`) guarda 65 dos arquivos removidos num commit que não
   está em branch nenhuma, e por isso a reescrita não o alcança — só o suporte
   pode apagá-la.

Os PNG dos gráficos dos trabalhos não eram LFS, eram objetos comuns do git; a
reescrita já os tira do histórico, e o suporte cuida da cópia que o GitHub ainda
guarda.

## 11. Depois

- Registre em `docs/TODO.md` (A7) e em `docs/CHANGELOG_SESSION.md` que a
  limpeza foi feita, com a data e o resultado da verificação do passo 7.
- Confira que os logs das execuções de `conhecimento_simular_remocao` e
  `conhecimento_remover` foram apagados (passo 1.3): a página de cada execução
  em Actions não deve mais mostrar a saída dos passos. Se ainda mostrar,
  Actions → a execução → ⋯ → **Delete all logs**.
- Apague `repo-backup.git` só depois de confirmar, com um clone novo, que tudo
  está como deveria.
- Nada a mudar em `Cérebro/removidos.txt`: ela continua valendo para a ingestão
  e para a remoção do banco.
