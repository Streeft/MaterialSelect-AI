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

## 0. Antes de começar: a decisão do domínio

**Esta escolha muda o resto do roteiro, e é melhor fazê-la agora do que
descobrir na véspera.**

O navegador só manda o cookie de sessão para a API se considerar as duas
metades o *mesmo site*. Com os domínios gratuitos (`algo.vercel.app` chamando
`algo.fly.dev`) elas são sites diferentes, e o cookie `SameSite=Lax` — o padrão,
e o mais seguro — simplesmente não é enviado nas chamadas `fetch`. O sintoma é
cruel: o login parece funcionar, o cookie é gravado, e toda requisição seguinte
volta anônima. Nada aparece em log nenhum.

Há dois caminhos:

**A. Domínio próprio (recomendado).** Um domínio (`materialselect.com.br`, ~R$
40/ano), com `app.` apontando para a Vercel e `api.` para o Fly. As duas metades
passam a ser o mesmo site registrável, `SameSite=Lax` volta a estar certo, e
não existe cookie de terceiro para navegador nenhum bloquear. Também é o que
parece profissional na hora de mostrar.

**B. Só os domínios gratuitos.** Funciona, com `SESSION_COOKIE_SAMESITE=none`.
O custo é real: o cookie vira de terceiros, o **Safari bloqueia por padrão** e
o Chrome está descontinuando. Se qualquer avaliador abrir pelo iPhone, o login
falha. Serve para validar o deploy antes de comprar domínio, não para o dia da
apresentação.

O roteiro abaixo assume **A**, e marca o que muda no **B**.

---

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
# uma vez, na sua máquina
curl -L https://fly.io/install.sh | sh
fly auth login

# na raiz do repositório — o fly.toml já está lá
fly apps create materialselect-api        # ou outro nome; ajuste o fly.toml
```

Os segredos, todos de uma vez (nenhum deles vai para o repositório):

```bash
fly secrets set \
  DATABASE_URL='postgresql+psycopg://…neon…' \
  GOOGLE_CLIENT_ID='…' \
  GOOGLE_CLIENT_SECRET='…' \
  BACKEND_BASE_URL='https://api.seudominio.com.br' \
  FRONTEND_URL='https://app.seudominio.com.br' \
  CORS_ORIGINS='https://app.seudominio.com.br'
```

No caminho **B** (sem domínio próprio), use as URLs `…fly.dev` e
`…vercel.app` e acrescente `SESSION_COOKIE_SAMESITE=none`.

`ENVIRONMENT`, `PORT` e o resto já vêm do `fly.toml`. `SESSION_COOKIE_SECURE`
é `true` por padrão e deve continuar assim.

```bash
fly deploy
```

O `[deploy] release_command` roda `alembic upgrade head` num contêiner à parte
**antes** de a versão nova receber tráfego. Se a migração falhar, o deploy é
abortado e a versão anterior continua servindo — é de propósito que as
migrações não rodem no startup da aplicação: isso executaria uma vez por
máquina, e duas máquinas subindo juntas competiriam pela mesma tabela.

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

- **URI de redirecionamento autorizado:** `{BACKEND_BASE_URL}/api/auth/google/callback`
  — exatamente isso, com o mesmo esquema e host que você pôs em
  `BACKEND_BASE_URL`. O Google compara caractere a caractere.
- Copie o *client id* e o *secret* para os segredos do Fly (§2).

Se quiser restringir a uma turma ou instituição, `GOOGLE_ALLOWED_DOMAIN` filtra
por sufixo de e-mail.

## 4. Vercel (frontend)

1. *Import Project* apontando para o repositório; **Root Directory: `apps/web`**.
2. Variável de ambiente: `NEXT_PUBLIC_API_URL = https://api.seudominio.com.br`.
   **É variável de build, não de runtime** — `lib/api.ts` lê `process.env` em
   nível de módulo e o valor vira literal no pacote. Trocar a URL depois exige
   *redeploy*, não basta editar a variável.
3. Domínio: aponte `app.seudominio.com.br` para o projeto.

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
curl https://api.seudominio.com.br/api/health          # 1. API viva
curl -i https://api.seudominio.com.br/api/materiais    # 2. deve dar 401, não 500
```

Um **500** no passo 2 é banco: `DATABASE_URL` errada ou migração que não rodou.
Um **401** é o esperado — o portão funcionando.

Depois, no navegador:

3. Abra `https://app.seudominio.com.br` — a vitrine pública carrega sem login.
4. Entre pelo Google. **Se voltar para a tela de login em laço, é o cookie**:
   confira o `SameSite` (§0) e se `CORS_ORIGINS` bate exatamente com a origem
   do frontend.
5. Depois de rodar o §5, `/app/catalogo` deve listar os materiais do seed.
6. Exporte um estudo e confirme que o aviso de limitação de uso está no arquivo
   (item 5 da proposta, sem opção de desligar).

## Falhas comuns

| Sintoma | Causa provável |
|---|---|
| Login em laço, sem erro em log nenhum | `SameSite` — §0. É a falha mais provável em domínios diferentes. |
| `ModuleNotFoundError: psycopg` | `DATABASE_URL` com `postgresql://` em vez de `postgresql+psycopg://`. |
| Frontend chamando `localhost:8000` | `NEXT_PUBLIC_API_URL` ausente **no build**. Redeploy depois de definir. |
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
