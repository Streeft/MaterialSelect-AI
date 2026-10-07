# MaterialSelect AI

[![CI](https://github.com/Streeft/MaterialSelect-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/Streeft/MaterialSelect-AI/actions/workflows/ci.yml)

Plataforma web para **ensinar e praticar a seleção de materiais de engenharia**
pelo método de Michael Ashby — mapas de propriedades, índices de desempenho e
seleção em etapas. Trabalho de Conclusão de Curso em Engenharia de Materiais
(UFRGS).

A contribuição não é um catálogo de materiais: é tornar o método
**reprodutível e auditável**. Todo número que aparece na tela ou num documento
exportado sai de um cálculo determinístico do backend, com a trilha de onde
veio. A IA interpreta, sugere e explica — e nunca produz um número.

> ⚠️ **Os dados de demonstração são fictícios.** Estão marcados como tal no
> banco (`is_demo`) e na interface. A ferramenta apoia o ensino e a triagem
> preliminar; não substitui validação experimental nem dado de fornecedor.

No ar: frontend em <https://material-select-ai-web.vercel.app> (login pelo
Google). Estado detalhado em [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md).

## O que a ferramenta faz

**Estudar**

- **Seleção** — um assistente guiado, um passo de cada vez: Função → Objetivo →
  Restrições → Resultados. Por trás, a seleção é uma **pilha de estágios**
  (limites com AND/OR aninhados, árvore de classes, processo compatível, região
  de um gráfico), e o resultado é a interseção deles. Ranking por soma
  ponderada, TOPSIS ou PROMETHEE II, pesos por AHP, funil de eliminação,
  excluídos por dado ausente e análise de sensibilidade. Estudos salvos
  reexecutam para a mesma resposta.
- **Mapas** — mapas de Ashby com escala log, envelopes por classe e linhas de
  índice cuja inclinação é derivada da própria expressão (`E/ρ` → 1,
  `E^(1/2)/ρ` → 2). Um eixo pode ser uma propriedade ou um índice.
- **Comparar** — tabela com proveniência de cada valor, gráficos e busca de
  **materiais semelhantes** a uma referência.
- **Cadernos** — o NotebookLM dentro do app: cadernos privados com fontes
  próprias (PDF, DOCX, TXT, MD, texto colado, ficha de material, estudo salvo)
  e **fontes externas** (link de site, vídeo do YouTube com a transcrição
  colada, Wikipédia, artigos da OpenAlex, busca na web). Conversa com citação
  por trecho e um **Estúdio** que gera, a partir das fontes:
  - **relatório**, **cartões didáticos**, **teste**, **tabela de dados** e
    **mapa mental** (DOCX, CSV/XLSX, SVG e PNG);
  - **resumo em áudio** — dois apresentadores lidos pela voz do navegador, com
    transcrição e velocidade (roteiro em DOCX e TXT);
  - **resumo em vídeo** — os slides avançam com a narração, com legenda e
    velocidade (PPTX com a narração nas notas);
  - **apresentação de slides** — com notas do apresentador e tela cheia (PPTX,
    e PDF pela impressão do navegador);
  - **infográfico** — dados em destaque, pontos e etapas em paisagem, retrato
    ou quadrado (SVG e PNG).

  Todo número de uma resposta ou de um item tem de estar no trecho que ele
  cita, e todo arquivo exportado leva os avisos e as referências.

**Ferramentas**

- **Dimensionar** — sete casos de carga padrão (tirante, viga, placa, coluna);
  a massa sai como `fator estrutural / índice`, e o objetivo custo reaproveita
  a mesma derivação.
- **Custo** — custo por peça sobre os processos compatíveis, termo a termo
  (material, ferramental, operação, capital), com a curva custo × lote.
- **Eco** — auditoria ecológica em cinco fases (material, manufatura,
  transporte, uso, fim de vida), em energia e carbono.
- **Sintetizar** — compósito de dois constituintes, espuma e **painel
  sanduíche**, cada valor com a lei que o produziu e a sua base.
- **Baterias** — dimensionamento de um pack a partir de químicas de célula
  catalogadas, cada uma com a sua fonte.

**Dados**

- **Catálogo** e **Processos** — materiais e processos em taxonomias
  navegáveis, com ficha e proveniência de cada valor.
- **Meus registros** — registros próprios de cada pessoa, ao lado do catálogo
  compartilhado; favoritos e recentes.
- **Painel** — cobertura do catálogo, lacunas e distribuição por propriedade.
- **Importar** — CSV/XLSX com mapeamento de colunas, validação linha a linha,
  licença da fonte e reversão por lote.
- **Catálogo oficial licenciado** — pipeline administrativo separado, com identidade externa/GRUID, SHA-256 por artefato, dry-run, proveniência de release e preservação lossless de valores que ainda não cabem no motor numérico. Os bytes licenciados ficam fora do Git; ver [`docs/18-catalogo-oficial-granta.md`](docs/18-catalogo-oficial-granta.md).

**Documentos** — CSV, XLSX e HTML imprimível do catálogo e de cada estudo; o
**laudo de engenharia** de um estudo, com mapa de seleção e gráfico de ranking
desenhados no backend. Todo arquivo exportado carrega o aviso de limitação de
uso.

## Princípios que não se negociam

São o que sustenta a alegação de que a seleção é reprodutível. Detalhe e
motivo de cada um em [`CLAUDE.md`](CLAUDE.md) e [`docs/CLAUDE.md`](docs/CLAUDE.md).

1. **Não inventar propriedades de materiais.** Só existe o valor cadastrado ou
   importado, com fonte.
2. **Todo cálculo numérico é determinístico e vive no backend** — inclusive o
   que parece apresentação, como a inclinação de uma linha de índice.
3. **A IA nunca produz números.** Toda saída dela passa por guardrails que
   recusam número sem âncora no enunciado ou no trecho citado.
4. **Ausência nunca vira zero** — nem no banco (`is_missing=True`, campos
   `NULL`), nem na tela, onde ela tem rótulo escrito.
5. **Rastreabilidade de unidades:** valor e unidade originais, valor
   normalizado, unidade canônica e método de conversão, sempre pelo Pint.
6. **Sem segredos versionados.** Tudo por variável de ambiente; há
   `.env.example`.
7. **Dados de demonstração são marcados** (`is_demo`) e criados ou apagados só
   pelo caminho de [`docs/15-dados-demonstrativos.md`](docs/15-dados-demonstrativos.md).

## Arquitetura

Monorepo com backend e frontend desacoplados e um contrato de tipos único:

| Pasta | O quê |
|---|---|
| `apps/api` | FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, Pint. SQLite em desenvolvimento e nos testes; PostgreSQL em produção. |
| `apps/web` | Next.js 16 (App Router, build com `--webpack`), React 18, TypeScript estrito, Tailwind, TanStack Query. Sistema de design próprio (MSDS), sem biblioteca de componentes; Plotly só para os mapas. |
| `packages/shared-types` | O contrato de tipos canônico, importado por `apps/web` via npm workspace. |
| `docs/` | Documentação, decisões ([`DECISIONS.md`](docs/DECISIONS.md)) e ADRs. |

No backend o fluxo é `routers` (HTTP fino) → `services` (regras e orquestração)
→ `repositories` (único acesso ao banco, sempre parametrizado) → `models`.
Regras puras em `domain`, cálculo em `calculations`, e ainda `importers`,
`exporters`, `ai`, `knowledge`, `notebooks` e `integrations` (a única porta de
saída para a rede, por `safe_fetch.py`). Visão completa em
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Como rodar localmente

Pré-requisitos: **Python 3.11+**, **Node.js** com npm (a CI usa Node 22) e git.

### Backend

```powershell
# Windows / PowerShell
cd apps\api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"            # extras: postgres, billing, ai, knowledge
copy .env.example .env
python -m alembic upgrade head
python -m app.db.seed              # base de demonstração
python -m app.db.seed_extended     # opcional: os materiais de exercício
uvicorn app.main:app --reload      # http://localhost:8000/docs
```

```bash
# Linux / macOS
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
python -m alembic upgrade head
python -m app.db.seed
python -m app.db.seed_extended
uvicorn app.main:app --reload
```

### Frontend

```powershell
cd apps\web                        # bash: cd apps/web
npm install
copy .env.local.example .env.local # bash: cp .env.local.example .env.local
npm run dev                        # http://localhost:3000
```

Atalhos para Windows em [`scripts/`](scripts/): `seed.ps1`, `dev-api.ps1`,
`dev-web.ps1`.

**Login.** Toda tela da ferramenta exige login pelo Google — não existe senha
em lugar nenhum do sistema. Para entrar localmente, crie um cliente OAuth e
preencha `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` e `SESSION_COOKIE_SECURE=false`
no `apps/api/.env` (o passo a passo está comentado no próprio `.env.example`).
Depois, ou use `ACCESS_MODE=open`, ou conceda a assinatura à sua conta com
`python -m app.admin.grant_subscription --email voce@exemplo.com`.

## Testes e integração contínua

```powershell
cd apps\api; .\.venv\Scripts\Activate.ps1   # bash: source .venv/bin/activate
ruff check app; black --check app; pytest

cd apps\web
npm run typecheck; npm run lint; npm run test; npm run build
npm run test:e2e                            # Playwright, API e banco próprios
```

Os testes do backend rodam em SQLite em memória e **não têm rede** — o
`conftest.py` reprova quem tentar sair. Pelo último registro em
[`CLAUDE.md`](CLAUDE.md), são **3864 testes de backend** e 778 de frontend.

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda em todo PR e em
todo push para `main`: **Backend** (Python 3.11 e 3.12: ruff, black, pytest com
serviço PostgreSQL e SQLite em memória, migrações e seed num banco limpo),
**Migrações (PostgreSQL)** (com testes de concorrência multithread de cotas),
**Frontend** (typecheck, lint, test, build), **E2E (Playwright)** e
**Lighthouse**. Nenhum passo é informativo; os checks obrigatórios impedem o
merge.

## Deploy

| Peça | Onde |
|---|---|
| Frontend | Vercel — publica sozinho a cada push em `main` |
| API | Fly.io — `release_command` aplica as migrações antes do tráfego |
| Postgres | Neon |

**A API é servida pela origem do frontend** (`rewrites()` no
`next.config.mjs`): com `…vercel.app` chamando `…fly.dev` direto, o cookie de
sessão `SameSite=Lax` não viajaria e o login entraria em laço sem erro em log
nenhum.

Mesclar um PR **não** implanta a API nem semeia o banco. As operações são
workflows de disparo manual na aba *Actions*:

| Workflow | Quando |
|---|---|
| **Deploy da API** (`deploy-api.yml`) | Depois de todo merge que toque `apps/api/**`. |
| **Administração do banco** (`admin-banco.yml`) | `semear_referencia` para referência real; `semear_demo` somente para ambiente fictício; também `migrar`, `excluir_demo`, `catalogo_oficial_validar`, `catalogo_oficial_importar`, `conceder` e `revogar`. |
| **Provedor de IA** (`provedor-ia.yml`) | Trocar a IA (`gemini`, `groq`, `mock`); confere em `/api/health`. |
| **Modo de acesso** (`modo-acesso.yml`) | `abrir` para uma turma, `restaurar_assinatura` depois. |
| **Base de conhecimento (Cérebro)** (`conhecimento.yml`) | `ingerir` depois de um PR que mexa em `Cérebro/` ou no manifesto — baixa do LFS só o que o banco ainda não tem (com `arquivos: Links.md`, só ele, sem baixar nada); `embeddings` para gerar vetores já; `status` para o retrato. Uma execução **noturna agendada** gera os vetores sozinha, com a sobra da cota gratuita (até 1000 pedidos), e nunca envia trecho de documento da lista de remoção. |

Roteiro completo, com o porquê de cada passo, em
[`docs/13-deploy.md`](docs/13-deploy.md).

## IA a custo zero

- **O padrão do código e dos testes é o `mock`**: determinístico, sem rede e
  sem chave. `AI_PROVIDER=` (vazio) desliga a camada, e o resto do sistema
  funciona igual.
- **A IA oficial é o Gemini no plano gratuito do Google AI Studio**, pelo
  provedor `openai-compat`. A chave sai de um projeto **sem faturamento**: ao
  passar do limite a API responde 429, nunca cobra. **Nunca ligue o
  faturamento** — nem crédito promocional.
- O **áudio e o vídeo do Estúdio falam pela voz do navegador**
  (`speechSynthesis`), sem TTS pago — por isso não há MP3 nem MP4 para baixar,
  só o roteiro e o deck. As vozes em português dependem do sistema do aluno; a
  tela avisa quando não há voz pt-BR e a transcrição continua lá.
- A **busca na web** e a **OpenAlex** dos Cadernos vêm **desligadas** até haver
  uma chave gratuita de conta sem forma de pagamento. Esgotada a franquia, a
  função para com o motivo escrito na tela.
- O **RAG sobre o Cérebro** (livros, fichas Granta, artigos e o `Links.md`)
  junta busca por palavras (BM25) e por vetores do `gemini-embedding-001` com
  768 dimensões, gerados à noite com a sobra da cota gratuita. Esgotada a
  cota, a busca cai para as palavras, sem erro na tela. No plano gratuito o
  Google pode usar o texto enviado — o autor aceitou isso para os livros do
  Cérebro ([D-101](docs/DECISIONS.md)).
- Outros provedores (`claude-api`, `claude-cli`, Groq, Ollama local) são troca
  de variável; serviço, guardrails e interface não mudam.

Detalhes em [`docs/09-camada-ia.md`](docs/09-camada-ia.md) e
[`docs/13-deploy.md`](docs/13-deploy.md) §5-quinquies e §5-sexies.

## Contribuir

Todo PR atualiza, **no mesmo PR**, o texto que a mudança tornou falso: este
README, as decisões, o backlog, o registro de sessão e o documento da área
tocada. PR sem isso está incompleto — a regra completa está em
[`docs/CLAUDE.md`](docs/CLAUDE.md) §9, e o modelo de PR em
[`.github/pull_request_template.md`](.github/pull_request_template.md).

## Para agentes de IA

Leia [`AGENTS.md`](AGENTS.md) antes de escrever qualquer código: ele dá a ordem
de leitura obrigatória. As regras vivem em [`CLAUDE.md`](CLAUDE.md) e
[`docs/CLAUDE.md`](docs/CLAUDE.md); os arquivos de instrução de cada ferramenta
(`GEMINI.md`, `.cursor/rules/`, `.github/copilot-instructions.md`,
`.windsurf/rules/`, `.clinerules/`, `.agent/rules/`, `.rules`,
`CONVENTIONS.md`) apenas apontam para eles.

## Documentação

**Comece por [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md).**

| Documento | Para quê |
|---|---|
| [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) | Estado do projeto, o que falta, riscos. |
| [`docs/CLAUDE.md`](docs/CLAUDE.md) | Guia de desenvolvimento: regras, armadilhas, o que não alterar. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Módulos, dados, APIs, banco. |
| [`docs/DECISIONS.md`](docs/DECISIONS.md) · [`docs/adr/`](docs/adr/) | Por que foi decidido assim, com as alternativas. |
| [`docs/TODO.md`](docs/TODO.md) | Backlog priorizado. |
| [`docs/CHANGELOG_SESSION.md`](docs/CHANGELOG_SESSION.md) | O que mudou em cada sessão. |
| [`docs/01-visao-geral.md`](docs/01-visao-geral.md) · [`04`](docs/04-metodologia-selecao.md) | Problema e metodologia de Ashby. |
| [`docs/03-modelo-de-dados.md`](docs/03-modelo-de-dados.md) · [`05`](docs/05-tratamento-unidades.md) | Modelo de dados; unidades e proveniência. |
| [`docs/06-importacao.md`](docs/06-importacao.md) | Importação e segurança. |
| [`docs/07-selecao-deterministica.md`](docs/07-selecao-deterministica.md) | Estágios, índices, ranking. |
| [`docs/08-visualizacao.md`](docs/08-visualizacao.md) | Mapas, linhas de índice, comparador. |
| [`docs/09-camada-ia.md`](docs/09-camada-ia.md) | Camada de IA, guardrails, Cadernos, o Estúdio e as fontes externas. |
| [`docs/10-relatorios.md`](docs/10-relatorios.md) | Exportação, relatório e laudo. |
| [`docs/11-usabilidade.md`](docs/11-usabilidade.md) | Instrumento do teste com usuários. |
| [`docs/12-estudo-de-caso.md`](docs/12-estudo-de-caso.md) | O tirante leve e rígido, do enunciado ao relatório. |
| [`docs/13-deploy.md`](docs/13-deploy.md) | Deploy e operação pelos workflows. |
| [`docs/14-plataforma-selecao.md`](docs/14-plataforma-selecao.md) | Comparação com o modelo funcional do Granta EduPack. |
| [`docs/15-dados-demonstrativos.md`](docs/15-dados-demonstrativos.md) | Como criar e apagar dado fictício. |
| [`docs/18-catalogo-oficial-granta.md`](docs/18-catalogo-oficial-granta.md) | Pipeline, identidade, bundle e cutover do catálogo oficial licenciado. |
| [`docs/19-inventario-instalacao-granta.md`](docs/19-inventario-instalacao-granta.md) | Inventário auditado dos bancos, ProductConfig, Templates, Attribute Notes, Exporters e módulos da instalação. |

## Licença

MIT — ver [`LICENSE`](LICENSE).
