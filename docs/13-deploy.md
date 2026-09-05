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
4. Prefira o endpoint **sem** `-pooler` para as migrações. O pooler (PgBouncer)
   serve bem ao tráfego normal, mas DDL em transação longa é exatamente o que
   ele não foi feito para intermediar.

Não rode as migrações à mão: o passo de release do Fly faz isso (§2), e é bom
que seja sempre pelo mesmo caminho.

## 2. Fly.io (API)

```bash
curl -L https://fly.io/install.sh | sh
fly auth login

# na raiz do repositório — o fly.toml já está lá
fly apps create materialselect-api        # outro nome? ajuste o fly.toml
```

Você vai precisar da URL da Vercel antes de definir os segredos, porque três
deles apontam para ela. Crie o projeto na Vercel primeiro (§4, os dois
primeiros passos), anote a URL — algo como
`https://materialselect.vercel.app` — e volte aqui.

```bash
fly secrets set \
  DATABASE_URL='postgresql+psycopg://…neon…' \
  GOOGLE_CLIENT_ID='…' \
  GOOGLE_CLIENT_SECRET='…' \
  BACKEND_BASE_URL='https://materialselect.vercel.app' \
  FRONTEND_URL='https://materialselect.vercel.app' \
  CORS_ORIGINS='https://materialselect.vercel.app'
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
  `https://materialselect.vercel.app/api/auth/google/callback`
  — a URL do **frontend**, porque é ela que serve o callback através do proxy.
  O Google compara caractere a caractere; um `/` a mais já derruba.
- **Origem JavaScript autorizada:** `https://materialselect.vercel.app`.
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
   | `API_PROXY_TARGET` | `https://materialselect-api.fly.dev` | Destino do `rewrites()`. Lida na configuração, então vale no build. |
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

O mesmo comando libera cada avaliador, e `--revoke` desfaz. A concessão é uma
linha no banco, feita por quem já tem credencial de banco — privilégio bem
menor e mais visível que uma variável que desliga o portão inteiro. Ver o
cabeçalho de `app/admin/grant_subscription.py`.

## 6. Conferir que está de pé

Nesta ordem, porque cada uma isola uma camada:

```bash
# Direto na API, para saber se ela está viva:
curl https://materialselect-api.fly.dev/api/health

# E através do proxy, que é o caminho que o navegador usa:
curl https://materialselect.vercel.app/api/health
curl -i https://materialselect.vercel.app/api/materiais   # deve dar 401, não 500
```

As duas primeiras devem devolver o mesmo corpo. Se a direta funciona e a
proxiada não, o problema é `API_PROXY_TARGET` na Vercel.

Um **500** no passo 2 é banco: `DATABASE_URL` errada ou migração que não rodou.
Um **401** é o esperado — o portão funcionando.

Depois, no navegador:

3. Abra `https://materialselect.vercel.app` — a vitrine pública carrega sem login.
4. Entre pelo Google. **Se voltar para a tela de login em laço**, confira se
   `BACKEND_BASE_URL` é a URL da Vercel e não a do Fly (§2): é o erro mais
   provável, porque o cookie acaba gravado no domínio errado.
5. Depois de rodar o §5, `/app/catalogo` deve listar os materiais do seed.
6. Exporte um estudo e confirme que o aviso de limitação de uso está no arquivo
   (item 5 da proposta, sem opção de desligar).

## Falhas comuns

| Sintoma | Causa provável |
|---|---|
| Login em laço, sem erro em log nenhum | `BACKEND_BASE_URL` apontando para o Fly em vez da Vercel (§2), ou `API_PROXY_TARGET` ausente. |
| `ModuleNotFoundError: psycopg` | `DATABASE_URL` com `postgresql://` em vez de `postgresql+psycopg://`. |
| Frontend chamando `localhost:8000` | `NEXT_PUBLIC_API_URL` **ausente** (não é o mesmo que vazio) no build. Defina-a vazia e reconstrua. |
| `redirect_uri_mismatch` do Google | O URI registrado não é exatamente `{BACKEND_BASE_URL}/api/auth/google/callback`. |
| Toda rota em 403 mesmo logado | Falta a concessão do §5. |
| Primeira requisição demorando segundos | Hibernação — confira `min_machines_running` no `fly.toml`. |

## O que este deploy não cobre

- **Stripe em produção.** `STRIPE_API_KEY` vazio mantém `/billing` em 503; a
  cobrança de verdade exige configurar chave, preço e webhook.
- **Backup do banco.** O Neon tem *point-in-time restore* no plano pago; no
  gratuito, exporte com `pg_dump` antes de qualquer coisa importante.
- **O Cérebro.** `KNOWLEDGE_DIR` fica vazio: a ingestão é operação offline e o
  RAG só liga com provedor de IA real.
