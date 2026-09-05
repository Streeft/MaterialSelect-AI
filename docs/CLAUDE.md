# Guia permanente para sessões do Claude Code

Memória de longo prazo do projeto. O `CLAUDE.md` da raiz é a versão curta que o
Claude Code carrega automaticamente; **este arquivo é a versão completa**. Se os
dois divergirem, o da raiz vence para o que ele cobre, e este expande o resto.

---

## 1. Decisões que NÃO devem ser alteradas

Estas não são preferências. São o que sustenta a alegação central do trabalho —
que a seleção é reprodutível e auditável. Mudar qualquer uma exige conversar com
o autor primeiro.

### 1.1 Não inventar propriedades de materiais
Só existem valores explicitamente cadastrados ou importados. Nenhum valor
estimado, interpolado ou "razoável" entra no sistema sem ser marcado como tal.

### 1.2 Todo cálculo numérico é determinístico e vive no backend
Nas camadas `calculations` e `domain`. **Inclusive o que parece apresentação**:
inclinação de linha de índice, vértices de envelope, escores normalizados.
Nunca calcule uma dessas grandezas num componente React
([ADR 0004](adr/0004-geometria-de-graficos-no-backend.md)).

### 1.3 Dado ausente nunca vira zero
`is_missing=True` com campos numéricos `NULL`. Centralizado em
`app/domain/data_quality.py`. Em gráficos, uma lacuna é uma lacuna: heatmap com
`hoverongaps: false`, coordenadas paralelas com `connectgaps: false`, radar que
omite o material incompleto e diz quem omitiu.

E não vale só para número: **nenhum campo opcional é preenchido na gravação com
um valor plausível**, porque o palpite depois se comporta como se tivesse sido
informado e passa à frente da fonte que ele deveria substituir
([D-21](DECISIONS.md)).

### 1.4 Rastreabilidade de unidades
Preserve **valor original + unidade original + valor normalizado + unidade
canônica + método de conversão**. Conversão só via `app/calculations/units.py`.

> Cuidado que já causou bug: `value_min`, `value_max` e `uncertainty` ficam
> gravados na unidade **original**. Limites convertem com `to_canonical`;
> incertezas com `to_canonical_delta` (±5 °C é ±5 K, não ±278 K).

### 1.5 A IA nunca produz números
Ela interpreta, sugere e explica. Ao mexer em `app/ai/`, não afrouxe:
- **ancoragem numérica** — todo número de uma restrição proposta tem de aparecer
  no enunciado do usuário, *inclusive quando uma conversão estaria correta*;
- **unidade explícita** — limiar sobre propriedade dimensionada não pode omitir
  a unidade;
- **trechos recuperados são vocabulário, nunca número** — o que `app/knowledge/`
  traz do Cérebro (`ProblemContext.retrieved`/`ResultContext.retrieved`) pode
  ensinar terminologia ao modelo e, em `explain()`, ser citado; não pode virar
  o número de uma restrição. Isso é garantido por `guardrails.check_constraint`
  e `guardrails.ungrounded_numbers` nunca lerem `context.retrieved` — nenhuma
  das duas sabe que o campo existe —, não por convenção de prompt nem por
  disciplina do provedor.

O provedor recebe só o catálogo e o texto. Nunca lhe passe uma sessão de banco
nem o avaliador de expressões.

Com provedor real (`claude-api`, `claude-cli`, `openai-compat`), duas coisas não
são negociáveis e já estão estruturadas em `app/ai/model_base.py`
([D-35](DECISIONS.md)) — o nome do arquivo não traz "claude" de propósito, porque
as garantias são da camada e não de um fornecedor ([D-36](DECISIONS.md)): o
modelo escolhe um índice **pelo slug** e a expressão vem do catálogo depois — não
peça esse campo ao modelo; e as ressalvas da explicação vivem em
`app/ai/caveats.py`, fora do esquema enviado. O padrão continua `mock`, o único
determinístico.

### 1.6 Nenhum `eval`/`exec`
Expressões passam por `ast.parse` + whitelist + interpretador manual em
`app/calculations/expressions.py`.

### 1.7 Não altere o tratamento de BEGIN em `app/tests/conftest.py`
O pysqlite emite BEGIN sozinho, e só antes de DML — nunca antes de SAVEPOINT.
Sem os listeners que tiram o BEGIN do driver, **um teste cuja primeira instrução
seja uma escrita escapa do rollback e vaza para todos os testes seguintes**.
`app/tests/test_isolation.py` é o canário que protege isso; se ele ficar
vermelho, o isolamento quebrou.

### 1.8 Todo arquivo exportado carrega o aviso de limitação
Compromisso do item 5 da proposta. Sem opção de desligar.

### 1.9 Sem segredos versionados
Configuração por variáveis de ambiente. Há `.env.example`.

### 1.10 Login é só por terceiros (Google). Nunca senha
Nenhum formulário de e-mail/senha, nenhum hash de senha para gerenciar. A
sessão é uma linha de banco (`UserSession`), não um JWT — logout precisa
revogar de verdade. O catálogo continua compartilhado entre todo usuário
autenticado; só `SelectionStudy` é escopado por `Project`. Ver
[D-42](DECISIONS.md).

---

## 2. Idiomas

| Onde | Idioma |
|---|---|
| Interface e conteúdo para o usuário | **Português do Brasil** |
| Código: identificadores, funções, comentários, docstrings | **Inglês** |
| Mensagens de erro da API | **Português** (chegam ao usuário) |
| Mensagens de commit e documentação | **Português** |
| Rótulos de UI | Português, via `apps/web/lib/i18n.ts` |

Regra prática: se um humano lê na tela, é português; se um programador lê no
editor, é inglês.

---

## 3. Padrões de código

### Python
- SQLAlchemy 2.0: `Mapped[...]` / `mapped_column`.
- Pydantic v2. Campos numéricos com `allow_inf_nan=False`.
- Type hints em tudo. `from __future__ import annotations` no topo.
- `ruff` (E, F, I, UP, B) + `black`, ambos com `line-length = 100`.
- Docstrings explicam **por que**, não o que. O código já diz o que.

### TypeScript
- Modo estrito: `strict` + `noUncheckedIndexedAccess`. Indexar array devolve
  `T | undefined` — trate, não faça cast.
- Componentes acessíveis; estados de loading/erro/vazio **sempre** tratados.
- Nada de `any`. Se faltar tipo de biblioteca, declare em `apps/web/types/`.

### Nomenclatura
| Item | Convenção | Exemplo |
|---|---|---|
| Módulo Python | `snake_case` | `chart_service.py` |
| Classe Python | `PascalCase` | `ChartService` |
| Função/variável Python | `snake_case` | `to_canonical_delta` |
| Privado | prefixo `_` | `_draw_levels` |
| Componente React | `PascalCase.tsx` | `AshbyMap.tsx` |
| Rota Next | pasta em português | `app/mapas/page.tsx` |
| Slug de propriedade | `snake_case` | `modulo_young` |
| Slug de classe/índice | `kebab-case` | `viga-leve-rigidez` |
| Schema de saída | sufixo `Out` | `PropertyMapOut` |
| Schema de entrada | sufixo `In` ou `Request` | `ConstraintIn` |

---

## 4. Regras de arquitetura

- **Sem lógica de negócio nos routers.** Router valida HTTP e delega.
- **Só `repositories` toca o banco**, sempre parametrizado. Nunca SQL concatenado.
- **`domain` não importa SQLAlchemy nem FastAPI.** Se precisar, o desenho está
  errado.
- **Alembic é a fonte de verdade do schema.** Gere com
  `alembic revision --autogenerate` depois de alterar models. Nunca edite o banco
  à mão. `create_all` só no seed e nos testes.
- **Contrato de tipos: um arquivo só.** `packages/shared-types/index.ts` é
  canônico; `apps/web` o importa via npm workspace (`@materialselect/shared-types`,
  transpilado por `transpilePackages` em `next.config.mjs`), não mais por cópia
  manual. `apps/web/lib/types.ts` é um barril de reexportação — não escreva
  tipo novo ali (D-16/M4).

---

## 5. Testes

**Todo cálculo precisa de teste**: unidades, dado ausente, índices, ranking,
geometria, lei de potência, guardrails, exportação.

- Backend: pytest, SQLite em memória, isolamento transacional por teste.
- Frontend: Vitest para helpers puros; Testing Library para componentes.
- Ao corrigir um bug, **escreva o teste que falha antes da correção**. Vários
  testes atuais nasceram assim e o comentário diz qual bug guardam.

```powershell
cd apps\api; .\.venv\Scripts\Activate.ps1; pytest
cd apps\web; npm run typecheck; npm run lint; npm run test; npm run build
```

**End-to-end (A4):** `cd apps\web; npm run test:e2e` roda o Playwright
(`apps/web/e2e/`) — importar → selecionar → visualizar → exportar, contra API e
banco próprios (`apps/api/scripts/e2e_server.py`), em portas isoladas das de
desenvolvimento (8811/3011). É check obrigatório de CI (`E2E (Playwright)` em
`ci.yml`); rode localmente antes do PR para não descobrir uma falha só lá.

Toda rota exceto `/entrar` exige login (A5) — sem cliente OAuth de teste
utilizável em CI, a suíte não passa pelo Google: `playwright.config.ts` passa
`E2E_SESSION_TOKEN` para o processo da API, `app/db/seed.py`
(`seed_e2e_session`) grava uma sessão fixa com esse token só quando
`ENVIRONMENT=development`, e `apps/web/e2e/session.ts` injeta o mesmo token
como cookie `msai_session` no navegador antes da primeira navegação de cada
spec. Nenhuma rota de bypass é exposta pela API.

---

## 6. Como executar

### Backend
```powershell
cd apps\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
copy .env.example .env
python -m alembic upgrade head
python -m app.db.seed
uvicorn app.main:app --reload      # http://localhost:8000
```

### Frontend
```powershell
cd apps\web
npm install
copy .env.local.example .env.local
npm run dev                        # http://localhost:3000
```

Atalhos em `scripts/`: `dev-api.ps1`, `dev-web.ps1`, `seed.ps1`. Há ainda
`protect-main.ps1`, que não é de desenvolvimento: aplica a *ruleset* de checks
obrigatórios no GitHub (seção 7).

### Variáveis de ambiente relevantes
A lista completa, com as receitas prontas de cada provedor, está em
`apps/api/.env.example` — ele é a fonte, esta tabela é o resumo.

| Variável | Padrão | Efeito |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./materialselect.db` | Banco. |
| `CORS_ORIGINS` | `http://localhost:3000` | Origens permitidas. |
| `ENVIRONMENT` | `development` | Rótulo livre de ambiente. |
| `APP_NAME` | `MaterialSelect AI` | Nome exibido nos metadados da API. |
| `UPLOAD_DIR` | `var/uploads` | Onde o arquivo espera enquanto o job de importação está aberto. |
| `MAX_UPLOAD_BYTES` | `5242880` (5 MiB) | Teto de um arquivo enviado. |
| `MAX_IMPORT_ROWS` | `5000` | Teto de linhas por importação; limita o tempo de validação e commit. |
| `AI_PROVIDER` | `mock` | `""` desliga a camada de IA por completo; `claude-api`, `claude-cli` e `openai-compat` ligam um modelo real ([09](09-camada-ia.md)). |
| `AI_API_KEY` | vazio | Token do `openai-compat`; no `claude-api` prefira exportar `ANTHROPIC_API_KEY`. Vazio é configuração válida (Ollama local). |
| `AI_MODEL` | `claude-opus-5` | O valor certo depende do provedor. |
| `AI_BASE_URL` | vazio, **sem padrão** | Raiz da API compatível com OpenAI, terminando em `/v1`. Sem padrão de propósito ([D-36](DECISIONS.md)). |
| `AI_JSON_MODE` | `schema` | `schema`/`object`/`prompt`. Degradar é decisão do operador, nunca queda silenciosa. |
| `AI_TIMEOUT_SECONDS` | `90` | O provedor de CLI precisa da ponta alta: ele sobe um processo antes de perguntar. |
| `AI_MAX_OUTPUT_TOKENS` | `16000` | Teto de uma resposta, pensamento e texto juntos. |
| `AI_CLI_COMMAND` | `claude` | Executável do `claude-cli`, resolvido no PATH. |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | URL da API no frontend. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | vazio | Login desligado (503) sem os dois. Sem padrão de propósito — não existe cliente OAuth que sirva para todo mundo ([D-42](DECISIONS.md)). |
| `GOOGLE_ALLOWED_DOMAIN` | vazio | Vazio permite qualquer conta Google; setado, restringe por sufixo de e-mail (ex.: antes de hospedar para uma turma). |
| `BACKEND_BASE_URL` | `http://localhost:8000` | Monta o `redirect_uri` exato que o Google exige pré-registrado (`{BACKEND_BASE_URL}/api/auth/google/callback`). |
| `FRONTEND_URL` | `http://localhost:3000` | Para onde o navegador volta após o login. |
| `SESSION_COOKIE_SECURE` | `true` | Seguro por padrão (só HTTPS); dev local em HTTP precisa `false` explicitamente. |
| `SESSION_TTL_HOURS` | `336` (14 dias) | Vida fixa da sessão desde a criação, sem renovação deslizante. |
| `OAUTH_STATE_TTL_SECONDS` | `600` | Janela entre o redirect ao Google e o callback voltar. |

---

## 7. Integração contínua

`.github/workflows/ci.yml` roda em todo push para `main` e em todo PR, com
**exatamente os comandos da seção 5**. Nenhum passo é informativo.

- Backend, matriz Python 3.11 e 3.12: `ruff`, `black --check`, `pytest`, e
  `alembic upgrade head` + seed num banco limpo. Este último existe porque os
  testes usam `create_all` em memória e **nunca exercitam as migrações**.
  Instala `pip install -e ".[dev,knowledge]"` — sem o extra `knowledge` os
  testes de ingestão do Cérebro (`test_knowledge_ingest.py`) não têm `pypdf` e
  falham.
- Frontend: `npm ci`, `typecheck`, `lint`, `test`, `build`.
- **Migrações (PostgreSQL)**: aplica `alembic upgrade head` + seed contra um
  Postgres 16 de serviço e confere o schema resultante. O passo equivalente do
  job `backend` roda em SQLite e por isso não pega incompatibilidade de
  dialeto — foi assim que uma migração que não subia em Postgres ficou
  invisível até a primeira tentativa de deploy.
- E2E: Playwright (`apps/web/e2e/`) contra API e banco próprios da suíte —
  Python + Node no mesmo runner, Chromium via `--with-deps`. Relatório HTML
  publicado como artefato quando falha.
- Lighthouse: build de produção, sobe API e frontend em portas isoladas
  (8811, as mesmas do E2E), sessão fixa via `E2E_SESSION_TOKEN` para que as
  11 rotas auditadas sejam as telas reais e não repetidamente `/entrar`, e
  limiares de desempenho/acessibilidade/boas práticas por rota
  (`apps/web/lighthouserc.json`). É a métrica de "tempo até interativo" que
  M8 deixava pendente — ver `TODO.md`.

Os checks `Backend (Python 3.11)`, `Backend (Python 3.12)`, `Frontend` e
`E2E (Playwright)` são **obrigatórios**: a ruleset `CI obrigatoria em main` faz
o GitHub recusar o merge, e não há ator de exceção (vale para o dono do
repositório também). A branch ainda precisa estar atualizada com `main` antes
do merge, para que a combinação testada seja a combinação mesclada.
`scripts/protect-main.ps1` já lista `Lighthouse` entre os nomes exigidos, mas
**isso só vale depois que o script for de fato executado contra o
repositório** — o arquivo é a intenção, não a prova de que a ruleset viva no
GitHub já a inclui. Confirme antes de contar com o Lighthouse como portão.

> **Ao acrescentar um job ao `ci.yml`, acrescente o nome em
> `scripts/protect-main.ps1` e rode o script.** A ruleset exige uma lista fixa de
> nomes; um job que não esteja nela roda, aparece vermelho no PR e **não impede
> o merge** — o pior dos mundos, porque parece um portão e não é. O inverso
> também trava: nome exigido que nunca é reportado bloqueia todo merge para
> sempre. Os nomes têm de bater exatamente com o `name:` de cada job.

---

## 8. Deploy

O roteiro completo está em **[13-deploy.md](13-deploy.md)**. Resumo: Postgres no
Neon, API no Fly (`fly.toml`, com `release_command` rodando as migrações antes
de a versão nova receber tráfego) e frontend na Vercel. O `docker-compose.yml`
continua servindo para reproduzir as três peças numa máquina só.

Três coisas que não são detalhe de configuração:

- **O cookie de sessão e o domínio.** `SameSite=Lax` só funciona se o navegador
  considerar frontend e API o mesmo site. Em domínios diferentes
  (`…vercel.app` chamando `…fly.dev`), o cookie deixa de ser enviado nas
  chamadas `fetch` e o login entra em laço **sem erro em log nenhum**. Um
  domínio próprio com `app.` e `api.` resolve na origem; `SESSION_COOKIE_SAMESITE=none`
  resolve com o custo de virar cookie de terceiros, que o Safari bloqueia.
- **`NEXT_PUBLIC_API_URL` é entrada de build, não de implantação.**
  `lib/api.ts` lê `process.env` em nível de módulo, então o valor vira literal
  no pacote. Trocar a URL exige reconstruir.
- **Ninguém entra sem concessão.** O portão de D-46 não tem exceção e o Stripe
  responde 503 sem chave (D-36): use
  `python -m app.admin.grant_subscription --email …` depois do primeiro login.

## 9. Práticas adotadas nesta base

- **Commits por fase**, com corpo estruturado em Backend / Frontend / Qualidade /
  Docs, explicando *por quê*. Veja `git log` para o padrão.
- **Mudança mecânica em commit próprio** (a formatação com black foi separada da
  CI justamente para manter esta revisável).
- **PR com corpo que argumenta**, não que lista arquivos.
- **Verificação ao vivo** além dos testes: subir a aplicação e conferir no
  navegador encontrou bugs que os testes não pegaram (a unidade nula na camada
  de IA foi um deles).
- **Documentar o defeito junto da regra que ele originou** — ver a regra 4 em
  `09-camada-ia.md`.

---

## 10. Cuidados importantes

| Armadilha | O que fazer |
|---|---|
| `value_min`/`max`/`uncertainty` estão na unidade original | Converter antes de plotar em eixo canônico. |
| `prettyUnit` recebe dimensões com `** 2.5` | Já tratado; não simplifique a regex. |
| Nome de material é texto livre e não confiável | Escapar no hover do Plotly (`escapeHover`) e em planilha (`cells.py`). |
| Fecho convexo em escala log | Calcular no espaço exibido; o fecho dos logaritmos não é o logaritmo do fecho. |
| Dois eixos com o mesmo símbolo no comparador | `axisLabels` já desambigua; não volte a usar `symbol ?? name`. |
| Campo opcional preenchido "por conveniência" na gravação | Deixe `NULL`. Um rótulo defaultado para a chave imprimiu `__index__` no relatório; uma direção defaultada para `"max"` inverteu o ranking de um estudo salvo ([D-21](DECISIONS.md)). |
| `black --check` faz parte do portão | Rode `black app` antes de commitar. |
| Testes que começam por escrita | Cobertos pelo conftest; não mexa nos listeners. |
| Migration que só foi exercitada em SQLite | O alvo de produção é Postgres. `recreate="always"` em `batch_alter_table` é contorno de SQLite e vira `DROP TABLE` no Postgres — recusado se outra tabela tiver FK para ela. Mas trocar por `"auto"` sem pensar é pior: onde havia `copy_from` para descartar uma constraint sem nome, ela **sobrevive** e o schema fica errado em silêncio. O job `Migrações (PostgreSQL)` da CI guarda os dois casos. |
| Invocar `next dev`/`next build` sem `--webpack` | Desde o Next 16 o padrão é Turbopack, e o alias que monta o Plotly à la carte muda de comportamento. Os scripts e o `playwright.config.ts` já passam o flag; se você chamar o `next` direto, repita-o ([D-51](DECISIONS.md)). |
| E2E parado em "Verificando sessão…" sem nenhuma requisição falhando | O Next 16 bloqueia recurso de desenvolvimento (`/_next/*`) vindo de outra origem, e `127.0.0.1` ≠ `localhost`. Sem `allowedDevOrigins` no `next.config.mjs` a página não hidrata — e não há requisição falhando para apontar, porque o bloqueado é justamente quem dispararia as requisições. |
| Clique interceptado por `md-select-option` no E2E | O menu do `md-outlined-select` fecha por animação. Use `selectMwcOption` (`e2e/mwc.ts`), que espera o listbox sumir antes de devolver o controle; não clique na opção "na mão". |
| `next-env.d.ts` apontando para `.next-e2e/` | Reverta (`git checkout -- apps/web/next-env.d.ts`). O Next 16 grava ali um `import` para o `distDir` que você usou por último, e este projeto tem *dois* (`.next` e `.next-e2e`, ver `next.config.mjs`). A versão commitada é a do `npm run build` (`.next/types/…`), para que o caminho comum deixe a árvore limpa; rodar o E2E troca para `.next-e2e` e isso é ruído, não informação. **Medido:** apontar para diretório inexistente **não** quebra o `typecheck` — o `tsc` tolera o import não resolvido num `.d.ts` —, então isto é higiene de diff, não armadilha. |
| `apps/web/AGENTS.md` e `apps/web/CLAUDE.md` aparecendo do nada | São gerados pelo próprio Next 16 (`node_modules/next/dist/server/lib/generate-agent-files.js`) a cada `next dev`, e por isso estão versionados: apagá-los só recria o arquivo não rastreado. O conteúdo é um aviso de que o Next 16 diverge do que um modelo "sabe" — útil, e não conflita com a hierarquia deste projeto: o `CLAUDE.md` da raiz continua sendo a versão curta e este arquivo a completa. |

---

## 11. Onde procurar o quê

| Pergunta | Arquivo |
|---|---|
| Estado do projeto, o que falta | [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) |
| Como o sistema é organizado | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Por que foi decidido assim | [DECISIONS.md](DECISIONS.md) e [adr/](adr/) |
| O que fazer a seguir | [TODO.md](TODO.md) |
| O que mudou na última sessão | [CHANGELOG_SESSION.md](CHANGELOG_SESSION.md) |
| Metodologia de Ashby | [04-metodologia-selecao.md](04-metodologia-selecao.md) |
| Unidades e proveniência | [05-tratamento-unidades.md](05-tratamento-unidades.md) |
| Detalhe de uma fase | `06-` a `10-` |
