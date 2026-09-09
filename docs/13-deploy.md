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

## 5-bis. Sem terminal: o mesmo deploy pelo navegador

Tudo acima pressupõe um shell com `flyctl` instalado. Quem não tem — máquina
emprestada, tablet, política de TI — faz o mesmo por dois *workflows* de
disparo manual em `.github/workflows/`, na aba **Actions** do repositório.

| Workflow | Faz o quê | Substitui |
|---|---|---|
| **Deploy da API (Fly.io)** | `flyctl deploy --remote-only` | o `fly deploy` do §2 |
| **Administração do banco** | `migrar`, `semear`, `conceder`, `revogar` | o `fly ssh console` do §2 e do §5 |

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
- **O passo "Garantir endereço público" conta antes de alocar.** `flyctl ips
  allocate-v6` **não é idempotente**: ele aloca outro endereço a cada chamada,
  em silêncio e com sucesso. Escrito como `allocate-v6 || true`, acumulava um
  IPv6 por deploy. E a asserção do fim — falhar o job se não houver endereço
  público — existe porque o desfecho contrário já aconteceu aqui: deploy verde,
  máquinas saudáveis, aplicação inalcançável.

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
| Painel de IA com erro genérico ("Falha na requisição …") em vez do texto do provedor | Versão da API anterior ao tratador de `AIUnavailableError`. Reimplante — um *secrets deploy* não basta, porque reusa a imagem. |

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
  RAG só liga com provedor de IA real.
