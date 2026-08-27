# RAG sobre o Cérebro — design

Spec de arquitetura para transformar `Cérebro/` (a base de conhecimento
licenciada — livros, fichas Granta EduPack, material de curso, artigos —
mantida em `main` por decisão explícita do autor, [D-45](../../DECISIONS.md))
num pipeline de recuperação que alimenta `app/ai/` com vocabulário e contexto
reais, para reduzir alucinação sem afrouxar nenhuma garantia existente da
camada de IA.

**Fora deste spec:** reescrever a camada de IA em si (`app/ai/model_base.py`,
os quatro provedores) — este trabalho só acrescenta um insumo novo ao que já
existe. Métodos multicritério (M5), parênteses lógicos em restrições (M6) e
qualquer coisa fora de `app/knowledge/`/`app/ai/` ficam de fora.

---

## 1. Decisões de escopo já tomadas

Fechadas em conversa com o autor antes deste spec, não estão em aberto:

| Decisão | Resposta |
|---|---|
| Busca só léxica (BM25) ou também semântica (embeddings)? | **As duas**, fundidas por *reciprocal rank fusion* (RRF). |
| Backend de embeddings? | **Jina AI** (`api.jina.ai/v1/embeddings`) — formato OpenAI-compatível de verdade (`model`+`input` → `data[].embedding`), 1M tokens grátis/mês, sem cartão, hospedado (o app vai ser SaaS — nada de depender da máquina do autor). |
| RAG entra em `interpret()`, `explain()` ou os dois? | **Os dois.** `interpret()` só recebe contexto (vocabulário); `explain()` recebe contexto **e** pode citar fonte, verificado pelo backend. |
| Como a ingestão (ler PDF → indexar) é disparada? | **CLI e rota HTTP**, os dois. Nunca acontece durante uma requisição de cliente — é operação do autor, separada da consulta em tempo real. |
| UX de carregamento na consulta? | Estado de carregamento dedicado ("Consultando a base de conhecimento…"), só quando o provedor ativo não é `mock`. |
| `manifesto.json` do `Cérebro/` — escrever agora? | **Sim**, inferido de pasta/nome de arquivo. `autor` só quando o próprio nome do arquivo deixa inequívoco — nunca por dedução de conteúdo. |
| Retrieval roda para o provedor `mock`? | **Nunca.** `mock` é descrito no `CLAUDE.md` como determinístico e sem rede — isso teria que continuar valendo, e ligar retrieval nele quebraria a garantia (e deixaria a suíte de 713 testes mais lenta à toa). |

## 2. Dois bugs adormecidos, corrigidos antes de qualquer coisa nova

A pesquisa que precedeu este spec achou dois defeitos em `app/knowledge/`,
nunca exercitados porque nada importava o módulo:

- **`KnowledgeChunk.search_text` nunca é populado** na ingestão
  (`KnowledgeService._ingest_one`, `app/knowledge/service.py`) — mesmo a
  busca léxica (BM25), que está correta, não tem o que buscar, porque a
  coluna de que ela depende fica sempre `""`. Correção: preencher
  `search_text` com o texto normalizado (minúsculo, sem acento) na hora de
  gravar cada `KnowledgeChunk`, reaproveitando a função de *folding* que
  `lexical.py` já expõe internamente — sem duplicar lógica.
- **`app/knowledge/embeddings.py` referencia
  `settings.knowledge_embedding_model`/`knowledge_embedding_base_url`, que
  não existem em `app/config.py`.** Qualquer uso de `EmbeddingClient` hoje
  levanta `AttributeError`, não o `EmbeddingUnavailableError` gracioso que o
  módulo promete. Correção: declarar os três campos novos em `Settings`
  (seção 8), seguindo o mesmo padrão de `AI_BASE_URL`/`AI_API_KEY` (D-36) —
  sem valor padrão, chave vazia é configuração válida.

Cada correção ganha um teste que falha antes e passa depois (TDD, como o
resto do projeto já pratica em bug corrigido — ver `docs/CLAUDE.md` §5).

## 3. `manifesto.json`

`Cérebro/manifesto.json` não existe hoje — sem ele, todo documento é
catalogado `NAO_VERIFICADA`, sem autor, com `titulo` = nome do arquivo. Vou
gerar um manifesto inferido da estrutura de pastas, conservador por
princípio (mesma regra de D-21: dado incerto fica ausente, nunca vira palpite
plausível):

| Pasta | `tipo` | `autoridade` |
|---|---|---|
| `01-Bibliografia/` (+ `Extratos-de-Capitulos/`) | `LIVRO` | `CIENTIFICA` |
| `02-Material-de-Curso-ENG02016/Topicos-de-Aula/` | `SLIDE` | `TECNICA` |
| `02-Material-de-Curso-ENG02016/Trabalhos-Entregues/` | `EXERCICIO` | `TECNICA` |
| `03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/` | `FICHA` | `TECNICA` |
| `04-Ferramentas-e-Diagramas/` | `OUTRO` | `TECNICA` |
| `05-Artigos-Cientificos/` | `ARTIGO` | `CIENTIFICA` |

`titulo` vem do nome do arquivo, limpo (troca `-`/`_` por espaço, sem
inventar capitalização que o nome não sugira). `autor` só é preenchido
quando o nome do arquivo já traz um sobrenome reconhecível de forma
inequívoca (ex.: um PDF chamado `Ashby - Materials Selection...pdf` rende
`autor: "Ashby"`; um nome genérico como `Topico-3.pdf` não rende autor
nenhum). `versionado: true` por padrão — não há como saber se uma edição
específica está desatualizada só pelo nome do arquivo. `referencia`/`url`
ficam de fora: nenhum dos dois é seguro de inferir de nome de arquivo.

## 4. `app/knowledge/retrieval.py` (módulo novo)

Não existe hoje nenhuma função de busca em `app/knowledge/` — só as
primitivas (`lexical.bm25_scores`, `embeddings.EmbeddingClient.embed`) que um
chamador precisa orquestrar. Este módulo é essa orquestração:

```python
@dataclass(frozen=True)
class RetrievedChunk:
    document_title: str
    document_kind: DocumentKind
    document_authority: SourceAuthority
    page_start: int | None
    page_end: int | None
    text: str
    score: float  # já fundido (RRF)

def search(
    db: Session, query: str, *, top_k: int, settings: Settings
) -> list[RetrievedChunk]: ...
```

Passos:

1. **Léxico** — `KnowledgeRepository` ganha um método novo que traz
   `(chunk_id, search_text, document_id)` de todo `KnowledgeChunk` numa
   query só. Tokeniza a consulta com o mesmo *folding* da ingestão, roda
   `lexical.bm25_scores`, pega os top-N (N maior que `top_k`, ex. 20 — dá
   material à fusão).
2. **Semântico** — só roda se `settings.knowledge_embedding_base_url`
   estiver configurado. Embeda a consulta (uma chamada de rede), lê os
   vetores já armazenados em `knowledge_embedding` (`struct.unpack`, sem
   chamar a API de novo por chunk — só a ingestão grava vetor de documento),
   calcula cosseno contra todos, pega top-N. **Se a chamada de embedding
   falhar** (rede, chave inválida, indisponibilidade), a busca degrada para
   léxico puro nesta consulta — log de aviso, nunca exceção que derruba a
   chamada de IA inteira.
3. **Fusão** — RRF (`score = Σ 1/(k + posição)`, `k=60`) dos dois top-N (ou
   só do léxico, se semântico indisponível), corta em `top_k`
   (`settings.knowledge_retrieval_top_k`, já existe, default 5), junta
   proveniência do documento (`join` com `KnowledgeDocument`).

**Custo por consulta**: uma leitura de todo `search_text`/vetor em memória
(aceitável no tamanho atual do `Cérebro`, ~150 documentos — sem índice
vetorial dedicado) + no máximo uma chamada de rede (embedding da consulta).
Registrado como limitação conhecida (seção 10) — não escala indefinidamente
se o `Cérebro` crescer muito; fica pendente no `TODO.md` como item de baixa
prioridade, não resolvido aqui.

## 5. Integração com `app/ai/`

`ProblemContext`/`ResultContext` (`app/ai/provider.py`) ganham um campo novo:

```python
retrieved: tuple[RetrievedChunk, ...] = ()
```

Vazio por padrão — nenhum teste existente que constrói esses dataclasses sem
o campo quebra.

**`AIService`** (`app/services/ai_service.py`), antes de montar o contexto:
se `provider.simulated` for `False`, chama
`knowledge.retrieval.search(self.db, texto_da_consulta, top_k=settings.knowledge_retrieval_top_k, settings=self.settings)`
e passa o resultado como `retrieved=`. Para `mock`, o campo fica sempre
vazio — comportamento hoje preservado byte a byte, zero rede, zero custo.

**`prompts.py`** — `interpret_user()`/`explain_user()` ganham um bloco novo,
só quando `context.retrieved` não está vazio:

```
# Trechos de referência (vocabulário e contexto — nunca extraia número daqui)
[1] Ashby, Materials Selection in Mechanical Design — p. 42-43
    "<texto do trecho>"
[2] ...
```

`INTERPRET_SYSTEM`/`EXPLAIN_SYSTEM` ganham uma regra nova, explícita: os
trechos servem só para terminologia e contexto — todo número continua tendo
que vir do enunciado do usuário (`interpret`) ou dos fatos já calculados
(`explain`); citar uma fonte não abre exceção nenhuma na ancoragem numérica.

**Ancoragem numérica — deliberadamente intocada.**
`guardrails.check_constraint` e `guardrails.ungrounded_numbers` continuam
lendo só `context.statement`/`context.numbers`, exatamente como hoje. Isso
não é reforço — é a garantia estrutural de que um número dentro de um trecho
recuperado **não pode** virar restrição aceita, porque essas funções nem
enxergam `context.retrieved`. Teste dedicado: um trecho recuperado com um
número ausente do enunciado do usuário, e a restrição correspondente sendo
rejeitada do mesmo jeito que hoje.

**Citação — só em `explain()`.** `EXPLAIN_SCHEMA` ganha `sources: list[int]`
— índices `[1]`, `[2]`... referenciando os trechos numerados no bloco de
contexto (não pede título nem texto do modelo, só o índice, o mínimo
verificável). Guardrail novo, `guardrails.check_citations(sources,
retrieved)`: qualquer índice fora do intervalo dos trechos de fato
recuperados **nesta chamada** é descartado — diferente de
`ungrounded_numbers` (que derruba a explicação inteira), aqui só a citação
inválida é descartada, porque é metadado extra, não uma alegação numérica.
`interpret()` não ganha esse campo — já devolve `evidence` como trecho do
próprio enunciado do usuário; `retrieved` ali serve só para o modelo mapear
vocabulário para o catálogo, sem UI de citação.

**`MockAIProvider`** aceita `context.retrieved` sem usá-lo — é sempre vazio
quando chega nele (a única mudança visível é que o dataclass aceita o campo
sem erro).

## 6. Ingestão operacional

**CLI** — `python -m app.knowledge.ingest`, mesmo padrão de
`python -m app.db.seed`. Chama `KnowledgeService(db).ingest()` (já existe, só
falta o ponto de entrada), imprime um resumo (documentos novos/inalterados/
com falha, chunks, embeddings gerados) e sai com código de erro se algum
documento falhar na extração — visível, não escondido em log.

**Rota HTTP** — `POST /api/knowledge/ingest`, atrás de `get_current_user`
(a mesma autorização de qualquer rota logada — não crio um papel de
"administrador" que o projeto não tem hoje em nenhum outro lugar). Roda a
ingestão síncrona, devolve o mesmo resumo em JSON. Operação rara (o autor,
ocasionalmente) e demorada por natureza (centenas de PDFs + chamadas de
embedding) — uma chamada síncrona longa é aceitável aqui, ao contrário do
`upload` (que já roda em threadpool por atender todo usuário, a qualquer
hora — este não precisa do mesmo tratamento).

## 7. Frontend

`lib/i18n.ts` ganha `interpretingWithKnowledge: "Consultando a base de
conhecimento…"`, usado em `AIAssistPanel.tsx`/`StudyExplanation.tsx` só
quando `AIStatusOut` (já consultado hoje via `/api/ai/status`) indicar que o
provedor ativo não é `mock`. Para `mock`, continua `"Interpretando…"` — não
há consulta acontecendo. Nenhum cálculo novo no cliente; é troca de string
condicionada a um dado que a API já expõe.

## 8. Variáveis de ambiente

| Variável | Padrão | Efeito |
|---|---|---|
| `KNOWLEDGE_EMBEDDING_BASE_URL` | vazio, **sem padrão** | Raiz da API de embeddings compatível com OpenAI, terminando em `/v1`. Sem padrão de propósito (mesmo raciocínio de `AI_BASE_URL`, D-36) — receita pronta da Jina AI em `.env.example`. Ausente = busca só léxica, sem quebrar nada. |
| `KNOWLEDGE_EMBEDDING_MODEL` | vazio | Ex.: `jina-embeddings-v3`. |
| `KNOWLEDGE_EMBEDDING_API_KEY` | vazio | Chave do backend de embeddings. Vazio é configuração válida (mesmo espírito de `AI_API_KEY`). |

`KNOWLEDGE_RETRIEVAL_TOP_K` já existe (`config.py`, default 5) — reaproveitado,
não duplicado.

## 9. Testes

- `test_knowledge_ingest.py`: teste que falha antes/passa depois para
  `search_text` populado.
- `test_knowledge_embeddings.py` (novo): a correção de `Settings` + o
  cliente de embeddings, com um fake HTTP (sem rede de verdade — mesmo
  padrão de `_FakeStripeClient`).
- `test_knowledge_retrieval.py` (novo): BM25 sozinho, semântico sozinho (com
  fake), fusão RRF, degradação quando o embedding falha, `top_k` respeitado.
- `test_ai_api.py` (`TestRetrievalGating`): `interpret`/`explain` só chamam retrieval quando
  `provider.simulated is False`; `mock` nunca aciona rede nenhuma
  (verificável explicitamente).
- Teste dedicado: número presente **só** num trecho recuperado não vira
  restrição aceita (a prova de que a ancoragem numérica continua intacta —
  ver seção 5).
- Teste dedicado para `check_citations`: índice de citação fora do conjunto
  recuperado é descartado; índice válido passa.
- `test_knowledge_api.py` (novo, rota admin): exige login, devolve o resumo.

## 10. O que fica de fora, de propósito

- **Sem índice vetorial dedicado** (FAISS, sqlite-vec, etc.) — busca
  semântica é `O(n)` em memória sobre os vetores já armazenados. Aceitável
  no tamanho atual do `Cérebro` (~150 documentos); vira item de backlog se
  crescer muito (seção 4).
- **Sem cache de estatísticas do BM25** (frequência de documento, tamanho
  médio) — recalculado a cada consulta a partir do banco. Simples e correto
  para o tamanho atual; otimização futura se o custo se tornar visível.
- **Sem papel de "administrador"** — a rota de ingestão usa a mesma
  autorização de qualquer rota logada, porque o projeto não tem hierarquia
  de usuário hoje (D-42: todo usuário autenticado compartilha o catálogo).
- **Sem citação em `interpret()`** — decisão explícita (seção 5): o campo
  `retrieved` ali serve só para vocabulário, sem contrapartida de UI.
- **Sem reconciliação/atualização automática do `Cérebro`** — a ingestão
  roda por comando explícito do autor; nenhum job agendado ou *watcher* de
  arquivo.

## 11. Auto-revisão do spec

- Nenhum "TBD" ou seção incompleta restando.
- Consistente com os princípios inegociáveis do `CLAUDE.md` §1.5 (a IA nunca
  produz número) — a seção 5 explica por que a ancoragem numérica continua
  estruturalmente impossível de contornar via retrieval, não é só uma
  promessa.
- Consistente com D-36 (sem valor padrão para endpoint externo,
  configuração vazia é válida) e D-45 (o `Cérebro` já está em `main` por
  decisão aceita — este spec só o torna útil, não muda a decisão de
  hospedá-lo).
- Escopo focado: `app/knowledge/` (correção + busca) e a integração mínima
  necessária em `app/ai/`. Nenhuma mudança na camada de cálculo
  determinístico, no schema de seleção, ou no sistema de design.
- Ambiguidade checada: os dois pontos de integração (`interpret`/`explain`)
  têm contrato explícito e diferente entre si (contexto puro vs. contexto +
  citação verificada); o comportamento de degradação (embedding
  indisponível, provedor `mock`) está definido para os dois casos.
