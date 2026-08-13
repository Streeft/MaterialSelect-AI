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
  a unidade.

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
- **Ao alterar um contrato, altere os dois arquivos**: `packages/shared-types/index.ts`
  e `apps/web/lib/types.ts` (duplicação consciente, ver [TODO.md](TODO.md)).

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
desenvolvimento (8811/3011). Não está no `ci.yml` ainda ([B11](TODO.md)); rode à
mão antes de um PR que mexa nesses fluxos.

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

---

## 7. Integração contínua

`.github/workflows/ci.yml` roda em todo push para `main` e em todo PR, com
**exatamente os comandos da seção 5**. Nenhum passo é informativo.

- Backend, matriz Python 3.11 e 3.12: `ruff`, `black --check`, `pytest`, e
  `alembic upgrade head` + seed num banco limpo. Este último existe porque os
  testes usam `create_all` em memória e **nunca exercitam as migrações**.
- Frontend: `npm ci`, `typecheck`, `lint`, `test`, `build`.

Os três checks — `Backend (Python 3.11)`, `Backend (Python 3.12)` e `Frontend` —
são **obrigatórios**: a ruleset `CI obrigatoria em main` faz o GitHub recusar o
merge, e não há ator de exceção (vale para o dono do repositório também). A
branch ainda precisa estar atualizada com `main` antes do merge, para que a
combinação testada seja a combinação mesclada.

> **Ao acrescentar um job ao `ci.yml`, acrescente o nome em
> `scripts/protect-main.ps1` e rode o script.** A ruleset exige uma lista fixa de
> nomes; um job que não esteja nela roda, aparece vermelho no PR e **não impede
> o merge** — o pior dos mundos, porque parece um portão e não é. O inverso
> também trava: nome exigido que nunca é reportado bloqueia todo merge para
> sempre. Os nomes têm de bater exatamente com o `name:` de cada job.

---

## 8. Deploy

**Não há deploy.** `docker-compose.yml` e os `Dockerfile.*` são scaffold
documentado do alvo de produção (PostgreSQL + API + Web), não exercitados. O MVP
roda localmente. Antes de qualquer exposição em rede, resolva autenticação
(seção "Alta prioridade" do [TODO.md](TODO.md)).

---

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
