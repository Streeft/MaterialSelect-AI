# Deploy

Como colocar a ferramenta no ar. Substitui a antiga seção "Não há deploy" do
[CLAUDE.md](CLAUDE.md) §8.

Três peças, em três provedores:

| Peça | Onde | Por quê |
|---|---|---|
| Postgres | **Neon** | Plano gratuito que não expira, e `sa-east-1` fica perto de quem apresenta. |
| API (FastAPI) | **Fly.io** | Aceita o `Dockerfile.api` como está, e deixa manter uma máquina acordada — ver "Sem hibernação" abaixo. |
| Frontend (Next) | **Vercel** | Zero configuração para Next, e não hiberna. |

---

## 0. Por que existe um proxy no meio

O navegador só manda o cookie de sessão para a API se considerar as duas
metades o **mesmo site**. Com os domínios gratuitos (`algo.vercel.app` chamando
`algo.fly.dev`) elas são sites diferentes, e um cookie `SameSite=Lax` — o
padrão, e o mais seguro — simplesmente não viaja nas chamadas `fetch`. O
sintoma é cruel: o login parece funcionar, o cookie é gravado, e toda
requisição seguinte volta anônima. Nada aparece em log nenhum.

A saída escolhida **não** foi afrouxar o cookie para `SameSite=None` (o que o
transformaria em cookie de terceiros, que o Safari bloqueia por padrão), e sim
eliminar o problema: o `rewrites()` do `next.config.mjs` serve `/api/*` a
partir da própria origem do frontend, repassando para o Fly. Do ponto de vista
do navegador existe **uma origem só** — cookie first-party, `SameSite=Lax`
correto, e nenhum CORS.

Duas consequências que não são detalhe:

- **O callback do OAuth também passa pelo proxy.** É isso que faz o cookie ser
  gravado no domínio do frontend. Por isso `BACKEND_BASE_URL` na API é a URL do
  **frontend**, e é esse o `redirect_uri` que se registra no Google.
- **`NEXT_PUBLIC_API_URL` fica vazio**, o que aqui é valor com significado e não
  ausência: `lib/api.ts` usa `??`, então `""` produz chamadas relativas
  (`/api/materiais`). Trocar por `||` mandaria o frontend publicado falar com o
  `localhost` de quem abrisse.

Verificado ao vivo antes de entrar aqui: com o proxy ligado, o navegador
contatou uma única origem e `/api/auth/me` e `/api/billing/status` responderam
200 — o cookie chegou à API através do proxy.

**Custo aceito:** todo o tráfego da API passa pela borda da Vercel, o que
acrescenta um salto de rede. Um domínio próprio com `app.` e `api.` no mesmo
registrável dispensaria o proxy e é o caminho a seguir se um dia houver
domínio — o `rewrites()` é condicional, então basta não definir
`API_PROXY_TARGET`.

## 1. Neon (banco)

1. Crie um projeto em <https://neon.tech>, região `AWS sa-east-1` (São Paulo).
2. Copie a *connection string*. Ela vem no formato
   `postgresql://usuario:senha@ep-xxx.sa-east-1.aws.neon.tech/neondb?sslmode=require`.
3. **Troque o esquema para `postgresql+psycopg://`** — é o driver que o
   `pyproject.toml` declara no extra `postgres`, e sem isso o SQLAlchemy tenta
   o psycopg2, que não está instalado.
4. **Apague o `-pooler` do host.** O Neon devolve por padrão o endpoint com
   pooler (`ep-xxx-pooler.…`), e o `DATABASE_URL` aqui é um só: o mesmo valor
   serve o `release_command`, que roda DDL, e a aplicação. O pooler (PgBouncer
   em modo de transação) serve bem ao tráfego normal e é exatamente o que não
   foi feito para intermediar migração. Nesta escala — uma máquina, um punhado
   de conexões — o endpoint direto não custa nada e evita o problema.
   `channel_binding=require`, se vier na string, pode ficar; o psycopg 3 o
   suporta.

Não rode as migrações à mão: o passo de release do Fly faz isso (§2), e é bom
que seja sempre pelo mesmo caminho.

## 2. Fly.io (API)

> **Sem terminal?** O §5-bis faz este passo e o `fly deploy` abaixo por dois
> *workflows* do GitHub, sem instalar nada.

```bash
curl -L https://fly.io/install.sh | sh
fly auth login

# na raiz do repositório — o fly.toml já está lá
fly apps create materialselect-ai        # outro nome? ajuste o fly.toml
```

Você vai precisar da URL da Vercel antes de definir os segredos, porque três
deles apontam para ela. Crie o projeto na Vercel primeiro (§4, os dois
primeiros passos) e anote a URL atribuída.

> As URLs deste guia são as **desta instalação** — API em
> `materialselect-ai.fly.dev`, frontend em `material-select-ai-web.vercel.app`.
> Numa instalação nova, troque as duas em todo o documento e ajuste `app` no
> `fly.toml`.

```bash
fly secrets set \
  DATABASE_URL='postgresql+psycopg://…neon…' \
  GOOGLE_CLIENT_ID='…' \
  GOOGLE_CLIENT_SECRET='…' \
  BACKEND_BASE_URL='https://material-select-ai-web.vercel.app' \
  FRONTEND_URL='https://material-select-ai-web.vercel.app' \
  CORS_ORIGINS='https://material-select-ai-web.vercel.app'
```

**`BACKEND_BASE_URL` é a URL do frontend, e não é engano.** Ele existe só para
montar o `redirect_uri` que o Google exige pré-registrado, e com o proxy esse
caminho é servido pela Vercel (§0). Apontá-lo para o `…fly.dev` faria o Google
devolver o usuário direto na API, que gravaria o cookie no domínio errado — e o
login voltaria a não firmar.

`SESSION_COOKIE_SAMESITE` fica no padrão `lax`: o proxy torna tudo mesma origem,
então não há por que afrouxar. `ENVIRONMENT` e `PORT` vêm do `fly.toml`, e
`SESSION_COOKIE_SECURE` é `true` por padrão e deve continuar assim.

```bash
fly deploy
```

O `[deploy] release_command` roda `alembic upgrade head` num contêiner à parte
**antes** de a versão nova receber tráfego. Se a migração falhar, o deploy é
abortado e a versão anterior continua servindo — é de propósito que as migrações
não rodem no startup da aplicação: isso executaria uma vez por máquina, e duas
máquinas subindo juntas competiriam pela mesma tabela.

Semeie o catálogo de demonstração uma vez:

```bash
fly ssh console -C "python -m app.db.seed"
```

### Sem hibernação

O `fly.toml` traz `auto_stop_machines = false` e `min_machines_running = 1`.
O padrão do Fly é hibernar a máquina ociosa e acordá-la na próxima requisição,
o que custa alguns segundos — irrelevante num hobby, péssimo numa apresentação,
e pior aqui porque a primeira coisa que a aplicação faz é `/auth/me`: o
avaliador ficaria olhando para "Verificando sessão…" enquanto a máquina liga.
Manter uma máquina de pé custa mais que zero, e é uma troca consciente.

## 3. Google OAuth

No [Google Cloud Console](https://console.cloud.google.com) → *APIs e serviços*
→ *Credenciais* → *ID do cliente OAuth* (tipo: aplicação web):

- **URI de redirecionamento autorizado:**
  `https://material-select-ai-web.vercel.app/api/auth/google/callback`
  — a URL do **frontend**, porque é ela que serve o callback através do proxy.
  O Google compara caractere a caractere; um `/` a mais já derruba.
- **Origem JavaScript autorizada:** `https://material-select-ai-web.vercel.app`.
- Copie o *client id* e o *secret* para os segredos do Fly (§2).

Se quiser restringir a uma turma ou instituição, `GOOGLE_ALLOWED_DOMAIN` filtra
por sufixo de e-mail.

## 4. Vercel (frontend)

1. *Add New → Project* apontando para o repositório; **Root Directory:
   `apps/web`**.
2. Anote a URL que a Vercel atribuir — ela é o que vai nos segredos do Fly (§2)
   e no Google (§3).
3. Variáveis de ambiente:

   | Variável | Valor | Por quê |
   |---|---|---|
   | `API_PROXY_TARGET` | `https://materialselect-ai.fly.dev` | Destino do `rewrites()`. Lida na configuração, então vale no build. |
   | `NEXT_PUBLIC_API_URL` | *(vazio)* | Vazio faz o cliente chamar `/api/...` na própria origem. Deixe a variável existir com valor vazio — ver §0. |

4. *Redeploy* depois de definir as duas. **`NEXT_PUBLIC_*` é entrada de build**:
   `lib/api.ts` lê `process.env` em nível de módulo e o valor vira literal no
   pacote, então editar a variável sem reconstruir não muda nada.

## 5. Destravar o acesso

Todo router de produto exige assinatura ativa ([D-46](DECISIONS.md)), e o
`/billing/checkout` responde 503 enquanto `STRIPE_API_KEY` estiver vazio
([D-36](DECISIONS.md)). Ou seja: recém-implantada, a ferramenta não deixa
ninguém entrar — nem você.

Entre uma vez pelo Google (para a conta existir), e então:

```bash
fly ssh console -C "python -m app.admin.grant_subscription --email voce@exemplo.com"
```

**Vários de uma vez.** Uma banca tem três avaliadores e uma sessão de
usabilidade tem de cinco a oito participantes, então `--email` aceita a lista
inteira, separada por vírgula ou espaço:

```bash
fly ssh console -C "python -m app.admin.grant_subscription --email 'ana@x.br, bruno@x.br carla@x.br'"
```

Cada endereço é aplicado por conta própria: **um erro de digitação não custa as
outras concessões**, e o comando sai com erro se qualquer uma falhar — um visto
verde nunca deve deixar você concluir que a turma toda entrou. `--revoke`
desfaz, com a mesma lista.

Cada pessoa precisa **entrar pelo Google uma vez antes**; este comando concede
acesso a quem já existe, não cria conta. Se você rodar cedo demais, a mensagem
diz exatamente isso. A concessão é uma linha no banco, feita por quem já tem
credencial de banco — privilégio bem menor e mais visível que uma variável que
desliga o portão inteiro. Ver o cabeçalho de
`app/admin/grant_subscription.py`.

**Para uma turma inteira, a concessão não serve** — a lista de e-mails não
existe antes da aula, e cada um precisaria ter entrado antes. Para isso há o
modo de acesso aberto, no §5-quater.

## 5-bis. Sem terminal: o mesmo deploy pelo navegador

Tudo acima pressupõe um shell com `flyctl` instalado. Quem não tem — máquina
emprestada, tablet, política de TI — faz o mesmo por dois *workflows* de
disparo manual em `.github/workflows/`, na aba **Actions** do repositório.

| Workflow | Faz o quê | Substitui |
|---|---|---|
| **Deploy da API (Fly.io)** | `flyctl deploy --remote-only` | o `fly deploy` do §2 |
| **Administração do banco** | `migrar`, `semear`, `excluir_demo`, `conhecimento_simular_remocao`, `conhecimento_remover`, `conceder`, `revogar` | o `fly ssh console` do §2 e do §5 |
| **Modo de acesso** | `abrir`, `restaurar_assinatura` — grava `ACCESS_MODE` no Fly e confere em `/api/health` | o `fly secrets set` do §5-quater |

Dois segredos, em *Settings → Secrets and variables → Actions*:

- **`FLY_API_TOKEN`** — criado em <https://fly.io/dashboard> → *Tokens*.
- **`DATABASE_URL`** — a mesma string do §1, com `postgresql+psycopg://` e o
  host **sem** `-pooler`. O workflow recusa a execução se o esquema estiver
  errado, em vez de falhar lá dentro com `ModuleNotFoundError`.

Os **segredos da aplicação** (`GOOGLE_*`, `BACKEND_BASE_URL`, `FRONTEND_URL`,
`CORS_ORIGINS`, `DATABASE_URL`) continuam sendo do app no Fly, e a aba
*Secrets* do painel do Fly os define sem terminal nenhum. `FLY_API_TOKEN` e
`DATABASE_URL` no GitHub são outra coisa: servem ao runner, não à aplicação.

Três detalhes que não são arbitrários:

- **Só `workflow_dispatch`.** Um gatilho em `push` deixaria `main` vermelha
  enquanto os segredos não existissem, e um vermelho que não significa defeito
  é pior que sinal nenhum. Num repositório público isso também garante que
  nenhum evento vindo de *fork* alcance os segredos.
- **Os dois jobs não entram em `scripts/protect-main.ps1`.** A regra do §7 de
  [CLAUDE.md](CLAUDE.md) vale para os jobs do `ci.yml`, que reportam em todo PR;
  exigir um job que só roda sob demanda travaria todo merge para sempre.
- **A ação `semear` roda `alembic upgrade head` antes do seed.** `app.db.seed`
  chama `create_all` por conveniência, e num banco vazio isso criaria as tabelas
  sem carimbo do Alembic — a migração seguinte quebraria.
- **`excluir_demo` é irreversível**, e não é algo para disparar depois de um
  merge comum — só quando o catálogo oficial estiver pronto para substituir o
  de demonstração. Apaga todo `Material` com `is_demo=True`, não importa em
  qual módulo de seed a linha nasceu ([D-72](DECISIONS.md#d-72)). Ver
  [`docs/15-dados-demonstrativos.md`](15-dados-demonstrativos.md).
- **`conhecimento_simular_remocao` antes de `conhecimento_remover`, sempre.**
  As duas leem `Cérebro/removidos.txt`, a lista do que saiu do Cérebro
  ([D-100](DECISIONS.md)), e rodam `python -m app.knowledge.prune`. A primeira
  só lê: imprime cada documento que casa — pelo caminho ou pelo conteúdo (as
  linhas `sha256:` da lista), e diz qual —, com trechos e embeddings, as
  entradas que não casaram nada, os totais e **cada documento que fica**
  (`[prune] ficaria: …`), com a contagem por pasta de primeiro nível. Leia essa
  parte: o caminho gravado é o do disco que fez a ingestão, e uma pasta que
  ninguém esperava (`_Duplicados-Para-Revisao (N)`, uma cópia renomeada)
  aparece ali, não nos acertos. A segunda apaga do banco, numa transação,
  esses documentos com os trechos e embeddings deles, e é **irreversível** — o
  que ela apaga só volta por uma nova ingestão, que a própria lista impede. O
  log da segunda contém `[prune] REMOVIDOS: N documentos, M trechos, K
  embeddings.` (seguida da lista do que fica e de `a base tinha X documentos;
  ficam Y.`), e é essa linha, não o ✅, que prova o que foi apagado (a lição
  do D-71). Existe porque a ingestão só acrescenta: tirar um arquivo do
  repositório deixa o texto dele no RAG. Um banco sem as tabelas do Cérebro
  para com a mensagem para rodar `migrar`, e uma linha da lista que é pasta sem
  a `/` final sai como `ATENÇÃO`. **As duas rodam com `--redact`**, porque o
  log do Actions é público como o repositório: cada documento sai como a pasta
  de primeiro nível e o começo do sha256 (`02-Material-de-Curso-ENG02016/…
  sha256:1a2b3c4d`), nunca pelo nome do arquivo — o de um trabalho entregue
  traz os nomes do grupo. Contagens, histograma e totais ficam. Copiados os
  totais, apague os logs das duas execuções (a execução → ⋯ → *Delete all
  logs*); o passo a passo está em
  [`17-limpeza-historico-cerebro.md`](17-limpeza-historico-cerebro.md) §1.
- **O passo "Garantir endereço público" conta antes de alocar.** `flyctl ips
  allocate-v6` **não é idempotente**: ele aloca outro endereço a cada chamada,
  em silêncio e com sucesso. Escrito como `allocate-v6 || true`, acumulava um
  IPv6 por deploy. E a asserção do fim — falhar o job se não houver endereço
  público — existe porque o desfecho contrário já aconteceu aqui: deploy verde,
  máquinas saudáveis, aplicação inalcançável.

## 5-ter. Depois de cada PR mesclado: o que disparar

Nenhum dos dois workflows do §5-bis dispara sozinho — mesclar um PR **não**
implanta nada por si. É regra fixa, para qualquer agente ou pessoa que mesclar
um PR nesta base:

| O PR tocou em… | Disparar | Por quê |
|---|---|---|
| `apps/api/**` (rotas, serviços, modelos, migração) | **Deploy da API** (`deploy-api.yml`, sem entrada nenhuma) | `flyctl deploy` constrói a imagem nova; o `release_command` aplica `alembic upgrade head` antes do primeiro tráfego. |
| `apps/api/app/db/seed.py` **ou** `apps/api/app/db/seed_extended.py` (material novo, química de bateria, modo de transporte, qualquer dado de demonstração) | **Administração do banco** (`admin-banco.yml`, ação `semear`) | O deploy da API **não** roda seed nenhum — só a migração. Sem este passo o código do dado novo está no ar e a linha correspondente não existe no banco. |
| `Cérebro/removidos.txt` (algo saiu da base de conhecimento) | **Administração do banco**, `conhecimento_simular_remocao`, conferir o log, depois `conhecimento_remover` | A ingestão só acrescenta: sem este passo o documento sai do repositório e continua sendo citado pelo RAG ([D-100](DECISIONS.md)). |
| Só `apps/web/**` | Nada | A Vercel publica sozinha a cada push em `main` — não há workflow manual para o frontend. |

**Por que dois módulos de seed, e não um.** `app.db.seed` é a base que
`apps/api/app/tests/conftest.py` reexecuta antes de **todo** teste do backend
— dezenas de asserções contam materiais/classes/lacunas por número fixo, e
esse número parte de exatamente 5 materiais de demonstração. Um material
novo de exercício (os 70 de `seed_extended.py`, por exemplo) **não entra
ali**, propositalmente — entraria no baseline de todo teste e quebraria
essas contagens. `semear` roda os dois em sequência (`app.db.seed` depois
`app.db.seed_extended`, nessa ordem: o segundo lê a classe/propriedade/fonte
que o primeiro cria) para que a produção tenha tudo, sem que o teste tenha
mais do que o mínimo que precisa.

Os dois workflows sobre `apps/api/**` **não dependem um do outro**:
`admin-banco.yml` faz seu próprio checkout de `main` e fala direto com o
Postgres, sem passar pelo Fly. Por isso a ordem entre eles não importa. Na
dúvida sobre se um PR mexeu em algum dos dois módulos de seed, dispare o
`semear` de qualquer forma — os dois são idempotentes (não duplicam linha
existente por nome), então rodá-lo "por garantia" depois de qualquer merge
em `apps/api/**` não tem custo.

Passo a passo, sem terminal, pela aba **Actions** do repositório:

1. `github.com/Streeft/MaterialSelect-AI/actions/workflows/deploy-api.yml` →
   **Run workflow** → confirmar. Sem campos a preencher.
2. Se o PR tocou `seed.py` ou `seed_extended.py` (ou na dúvida):
   `github.com/Streeft/MaterialSelect-AI/actions/workflows/admin-banco.yml` →
   **Run workflow** → em "O que executar" escolher **`semear`** → **Run
   workflow**.
3. Acompanhar até o ✅ verde em cada um, na lista de execuções no topo da mesma
   aba — um ❌ aqui significa produção desatualizada até ser refeito, nunca
   "vai passar na próxima".

## 5-quater. Abrir para uma turma, e fechar depois

Para estudantes testarem com a própria conta Google, sem assinatura
([D-83](DECISIONS.md#d-83)). O login continua obrigatório; o que deixa de ser
exigido é a assinatura. **O catálogo compartilhado continua protegido:** no
modo aberto, só quem tem assinatura ativa altera material compartilhado,
classe, propriedade, importa planilha ou ingere documento. O estudante usa
toda a ferramenta e cria os próprios registros, estudos e gráficos.

**Abrir** — pela aba **Actions**:

1. Garanta que a **sua** conta tem assinatura ativa (**Administração do
   banco** → `conceder` com o seu e-mail). É ela que mantém você como curador
   do catálogo durante a abertura, e que deixa você entrar depois de fechar.
2. Se a API publicada ainda não tem o D-83 (primeira vez), dispare **Deploy da
   API** antes.
3. **Modo de acesso** → **Run workflow** → `abrir`.
4. O job grava `ACCESS_MODE=open` no Fly (as máquinas reiniciam, sem deploy) e
   **só fica verde depois de ler `"access_mode": "open"`** em
   `https://materialselect-ai.fly.dev/api/health`. Se falhar dizendo que a API
   não informa o modo, é o passo 2 que faltou.

Opcional: para restringir a abertura a uma instituição, defina
`GOOGLE_ALLOWED_DOMAIN` (por exemplo `ufrgs.br`) nos segredos do app no Fly.

**Fechar (voltar a exigir o pacote)** — **Modo de acesso** → **Run workflow**
→ `restaurar_assinatura`. Mesmo mecanismo, mesma conferência. Os registros e
estudos que os estudantes criaram continuam no banco, só deixam de ser
alcançáveis por eles sem assinatura. Para dar acesso contínuo a alguém
específico depois disso, use `conceder` (§5).

A interface acompanha sozinha: ela lê o modo em `/billing/status`, então nada
na Vercel precisa ser refeito em nenhum dos dois sentidos.

## 5-quinquies. Trocar a IA: Gemini, de graça

A IA oficial do projeto é o **Gemini no plano gratuito do Google AI Studio**
([D-93](DECISIONS.md#d-93)), falando pelo mesmo `openai-compat` que antes
servia a Groq. Nada disso custa dinheiro — **desde que o faturamento continue
desligado**.

**Uma vez só — criar a chave:**

1. Entre em `aistudio.google.com` com a sua conta Google → **Get API key** →
   **Create API key**. Deixe o Google criar um projeto novo.
2. **Não** clique em "Set up billing", "Upgrade" nem ative crédito nenhum —
   nem o crédito do Google Developer Program que vem com a assinatura. Um
   projeto sem faturamento fica no plano gratuito para sempre: ao passar do
   limite, a API responde 429, nunca cobra.
3. Copie a chave (`AIza…`) e grave-a em **Settings → Secrets and variables →
   Actions → New repository secret**, com o nome `GEMINI_API_KEY`. Ela não vai
   para o código nem para `.env` versionado.

**Ligar** — pela aba **Actions**:

1. Se a API publicada ainda não tem o D-93 (primeira vez), dispare **Deploy da
   API** antes.
2. **Provedor de IA** → **Run workflow** → `gemini`. O modelo padrão é
   `gemini-flash-latest`, o apelido do Google que acompanha o Flash vigente; o
   `gemini-flash-lite-latest` aguenta mais pedidos por dia, útil numa aula
   cheia. Para um modelo específico, escreva o nome em "modelo_personalizado".
3. **Antes de mexer no Fly, o job pergunta ao Google, com a própria chave, se
   o modelo responde.** Se não responder, o job falha com o motivo do Google e
   a lista dos modelos Flash que a chave enxerga — escolha um e rode de novo.
   Foi o que faltou na primeira troca: em 2026 o Google restringe o Gemini 2.5
   a quem já o usava, e uma chave nova recebia 404 com a URL certa.
4. O job grava os segredos no Fly (as máquinas reiniciam, sem deploy) e **só
   fica verde depois de ler o provedor e o modelo novos** em
   `https://materialselect-ai.fly.dev/api/health`. A mesma chave serve a busca
   semântica do Cérebro (`gemini-embedding-001`); se esse modelo não responder,
   o job avisa e a busca segue só léxica, sem falhar a troca.

**Voltar** — o mesmo workflow com `groq` (precisa do segredo `GROQ_API_KEY`)
ou `mock` (simulado, sem rede nem chave).

**O que o plano gratuito cobra em troca, e a tela diz:**

- **Limites.** Algumas requisições por minuto e algumas centenas por dia. Ao
  estourar, a mensagem diz qual dos dois limites pode ter sido e quando volta.
- **Privacidade.** No plano gratuito o Google pode usar o conteúdo enviado para
  melhorar os modelos, e revisores humanos podem lê-lo. Não envie material
  sigiloso nem dados pessoais.

Se a IA responder que o servidor recusou `response_format`/`json_schema`, rode
o **Provedor de IA** de novo com "Saída estruturada" em `object`.

## 5-sexies. Fontes externas dos Cadernos: as chaves opcionais

As fontes externas ([D-97](DECISIONS.md#d-97)) chegam com o **Deploy da API**
(§5-ter): o `release_command` aplica a migração que elas trazem, e não há seed.
Sem nenhuma chave nova já funcionam o **link de site**, o **vídeo do YouTube**
(com a transcrição colada pelo aluno) e a **Wikipédia**, todos gratuitos e sem
conta. As outras duas buscas vêm **desligadas**, e a tela diz por quê.

**A regra de custo não tem exceção.** Toda chave desta seção sai de uma conta
ou de um projeto **sem nenhuma forma de pagamento cadastrada e sem faturamento
ligado**. É essa ausência que garante o custo zero: quando a franquia gratuita
acaba, a função para até a franquia voltar, com o motivo escrito na tela, e as
outras fontes continuam funcionando. Nada aqui se resolve contratando plano ou
comprando crédito.

Os segredos vão **no app do Fly**, não no GitHub, pela aba *Secrets* do painel
do Fly ou por `fly secrets set NOME='…'`. Gravar um segredo reinicia as
máquinas com a imagem que já está no ar. Por isso, na primeira vez, o **Deploy
da API** vem antes.

| Segredo | Liga o quê | Sem ele |
|---|---|---|
| `EXTERNAL_CONTACT` | Nada; é o contato que vai no `User-Agent` de toda requisição para fora. A política da Wikimedia pede um. | Vai o `FRONTEND_URL`, que já basta. Não ponha um e-mail pessoal que você não queira divulgado. |
| `OPENALEX_API_KEY` | A busca de **Artigos** (OpenAlex). | "Artigos" aparece desligado, com o motivo. |
| `OPENALEX_MAILTO` | Nada; é o contato opcional que a OpenAlex aceita junto da chave. | — |
| `WEB_SEARCH_PROVIDER=gemini` | A busca na **Web** (*grounding* do Gemini). | Vazio é o padrão: "Web" aparece desligado, com o motivo. |
| `WEB_SEARCH_API_KEY` | A chave dessa busca. | Com a IA oficial do §5-quinquies (`AI_BASE_URL` no Google), vale a própria `AI_API_KEY`. Com a IA em outro fornecedor, a busca fica desligada: a chave dele **nunca** é enviada ao Google. |

**OpenAlex — uma vez só:**

1. Crie uma conta gratuita em `openalex.org` e copie a chave em
   `openalex.org/settings/api`. Não cadastre forma de pagamento: a conta
   gratuita traz um crédito diário, e quando ele acaba a busca de artigos para
   até o dia seguinte.
2. Grave `OPENALEX_API_KEY` (e, se quiser, `OPENALEX_MAILTO`) nos segredos do
   app no Fly.

A chave nunca aparece em log nem em mensagem de erro: ela vai na URL, que é a
forma documentada, e os loggers do httpx ficam em WARNING justamente para não
registrá-la.

**Busca na web — só se for usar:**

1. Com a IA já no Gemini (§5-quinquies), basta gravar
   `WEB_SEARCH_PROVIDER=gemini`: a chave gratuita do AI Studio que já está em
   `AI_API_KEY` serve. Com a IA em outro fornecedor, crie uma chave no AI
   Studio **num projeto sem faturamento**, pelo mesmo passo a passo e com os
   mesmos cuidados do §5-quinquies, e grave-a como `WEB_SEARCH_API_KEY`.
2. O plano gratuito tem uma cota própria de buscas com *grounding*, e cada busca
   também gasta do limite por minuto e por dia **da mesma chave** que a turma
   usa na conversa. Numa aula cheia, a conversa e a busca disputam a mesma
   franquia.
3. **Confira ao vivo, uma vez, as "Sugestões da Pesquisa Google".** Os termos
   do *grounding* exigem mostrá-las junto dos resultados, e a tela as desenha
   numa moldura isolada, sem script. O formato foi deduzido da documentação,
   porque os testes não têm rede. Faça uma busca no modo Web e confirme que a
   faixa de sugestões aparece legível e que uma ficha abre a pesquisa do Google
   numa aba nova. Se não aparecer, é a pendência registrada em
   [TODO.md](TODO.md).

**Desligar** é apagar o segredo, ou deixar `WEB_SEARCH_PROVIDER` vazio. Para
desligar todas as fontes externas de uma vez, grave
`NOTEBOOK_EXTERNAL_SOURCES=false`: as telas continuam lá e dizem que está
desligado.

**Onde conferir:** no caderno, a caixa de pesquisa das Fontes mostra Artigos,
Wikipédia e Web. Um provedor desligado continua visível e diz o motivo, que é
exatamente o texto de `GET /api/notebooks/source-capabilities`.

## 6. Conferir que está de pé

Nesta ordem, porque cada uma isola uma camada:

```bash
# Direto na API, para saber se ela está viva:
curl https://materialselect-ai.fly.dev/api/health

# E através do proxy, que é o caminho que o navegador usa:
curl https://material-select-ai-web.vercel.app/api/health
curl -i https://material-select-ai-web.vercel.app/api/materiais   # deve dar 401, não 500
```

As duas primeiras devem devolver o mesmo corpo. Se a direta funciona e a
proxiada não, o problema é `API_PROXY_TARGET` na Vercel.

Um **500** no passo 2 é banco: `DATABASE_URL` errada ou migração que não rodou.
Um **401** é o esperado — o portão funcionando.

Depois, no navegador:

3. Abra `https://material-select-ai-web.vercel.app` — a vitrine pública carrega sem login.
4. Entre pelo Google. **Se voltar para a tela de login em laço**, confira se
   `BACKEND_BASE_URL` é a URL da Vercel e não a do Fly (§2): é o erro mais
   provável, porque o cookie acaba gravado no domínio errado.
5. Depois de rodar o §5, `/app/catalogo` deve listar os materiais do seed.
6. Exporte um estudo e confirme que o aviso de limitação de uso está no arquivo
   (item 5 da proposta, sem opção de desligar).

## Falhas comuns

| Sintoma | Causa provável |
|---|---|
| `DNS_PROBE_FINISHED_NXDOMAIN` em `…fly.dev`, com o deploy verde e as máquinas saudáveis | O app não tem endereço público. Ver abaixo — é a falha mais desnorteante das listadas aqui. |
| Login em laço, sem erro em log nenhum | `BACKEND_BASE_URL` apontando para o Fly em vez da Vercel (§2), ou `API_PROXY_TARGET` ausente. |
| `ModuleNotFoundError: psycopg` | `DATABASE_URL` com `postgresql://` em vez de `postgresql+psycopg://`. |
| Frontend chamando `localhost:8000` | `NEXT_PUBLIC_API_URL` **ausente** (não é o mesmo que vazio) no build. Defina-a vazia e reconstrua. |
| `redirect_uri_mismatch` do Google | O URI registrado não é exatamente `{BACKEND_BASE_URL}/api/auth/google/callback`. |
| Toda rota em 403 mesmo logado | Falta a concessão do §5. |
| Primeira requisição demorando segundos | Hibernação — confira `min_machines_running` no `fly.toml`. |
| Painel de IA em `403` acusando a credencial, com `error code: 1010` no fim da mensagem | **Não é a chave.** `1010` é da Cloudflare, que fica na frente da Groq: ela barrou a assinatura do cliente antes de a API ver a requisição. Ver [09-camada-ia.md](09-camada-ia.md). |
| No caderno, a busca de Artigos ou da Web diz que a cota gratuita acabou, ou que está desligada | Nenhum defeito. É a franquia gratuita do dia que acabou, ou a chave que não está configurada (§5-sexies). Espere a franquia voltar, ou configure a chave. **Não** ligue faturamento. |
| Painel de IA com erro genérico ("Falha na requisição …") em vez do texto do provedor | Versão da API anterior ao tratador de `AIUnavailableError`. Reimplante — um *secrets deploy* não basta, porque reusa a imagem. |
| PR mesclado em `main`, `deploy-api.yml` verde, mas o dado novo (material, química de bateria, modo de transporte) não aparece na tela | Duas causas possíveis, nessa ordem de verificação. (1) `admin-banco.yml` (`semear`) não foi disparado depois do merge — o deploy da API só roda a migração, nunca o seed. Ver §5-ter. (2) O `semear` rodou mas o log da execução (aba Actions → a execução → job `semear`) mostra a contagem certa em `Concluído: {...}` — se o campo relevante (`materials_created`, `battery_chemistries`, `transport_modes`, …) ficou em `0` quando deveria ter subido, o dado novo não está chegando a nenhum dos dois módulos de seed que `semear` executa (`app.db.seed` e `app.db.seed_extended`, §5-ter): confira se o PR de fato adicionou o dado a um dos dois, e não a um terceiro arquivo nunca importado por nenhum — foi exatamente isso que aconteceu com os 70 materiais do PR #59, que viveram meses em `seed_extended.py` sem que `semear` soubesse que esse módulo existia. |

### O app sem endereço público

Vale a explicação porque nenhum sinal aponta para ela. O `<app>.fly.dev` só
existe no DNS enquanto o app tem um IP público, e o `flyctl deploy` **só aloca
um sozinho quando o app ainda não tem máquinas**. Um app criado pelo painel — ou
que já recebeu um *secrets deploy*, que reinicia as máquinas com a imagem
existente — chega ao primeiro `deploy` com máquinas de pé e nenhum endereço.

O resultado é o pior tipo de falha: o deploy termina verde, as duas máquinas
passam nos health checks, o `release_command` roda as migrações, e o próprio
flyctl imprime *"Visit your newly deployed app at https://…fly.dev/"* — porque
ele imprime essa linha sempre, tenha ou não IP. Do lado de fora, o navegador
devolve `NXDOMAIN`: o endereço nunca existiu.

O passo **"Garantir endereço público"** do `deploy-api.yml` (§5-bis) aloca o
IPv4 compartilhado e o IPv6 e **falha o job** se ao final não houver nenhum —
sem essa asserção o workflow seguiria verde com a aplicação inalcançável, que é
exatamente o que já aconteceu uma vez aqui. Um `private_v6` sozinho não conta:
não é endereço público.

Um *secrets deploy* também não roda o `release_command`. Se as migrações
precisarem correr sem um deploy de código, use a ação `migrar` do workflow de
administração (§5-bis).

## O que este deploy não cobre

- **Stripe em produção.** `STRIPE_API_KEY` vazio mantém `/billing` em 503; a
  cobrança de verdade exige configurar chave, preço e webhook.
- **Backup do banco.** O Neon tem *point-in-time restore* no plano pago; no
  gratuito, exporte com `pg_dump` antes de qualquer coisa importante.
- **O Cérebro.** `KNOWLEDGE_DIR` fica vazio: a ingestão é operação offline e o
  RAG só liga com provedor de IA real. Ela lê os PDFs e o Markdown que o
  `manifesto.json` declara — hoje o `Links.md` ([D-100](DECISIONS.md)). A
  **remoção**, ao contrário, tem ação no workflow de administração (§5-bis),
  porque ela é o que a ingestão não faz; e uma base local ou de
  desenvolvimento que já recebeu ingestão precisa do mesmo `prune`, rodado à
  mão contra ela.
