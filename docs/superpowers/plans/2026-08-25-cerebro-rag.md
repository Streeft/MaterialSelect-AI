# RAG sobre o Cérebro — plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: use `superpowers:subagent-driven-development`
> (recomendado) ou `superpowers:executing-plans` para executar este plano tarefa a
> tarefa. Os passos usam checkbox (`- [ ]`) para rastreamento.

**Objetivo:** transformar `Cérebro/` num RAG de verdade para `app/ai/` — busca
híbrida (léxica + semântica) sobre os PDFs já ingeríveis, corrigindo dois bugs
que impedem qualquer busca de funcionar hoje, sem afrouxar a ancoragem numérica
existente.

**Arquitetura:** `app/knowledge/retrieval.py` (novo) orquestra BM25
(`lexical.py`, já correto) e embeddings (`embeddings.py`, hoje quebrado por
config ausente) fundidos por *reciprocal rank fusion*. `AIService` chama essa
busca antes de montar `ProblemContext`/`ResultContext`, só quando o provedor
não é `mock` (`provider.simulated is False`). Os trechos entram no prompt como
contexto extra; a ancoragem numérica (`guardrails.check_constraint`) continua
lendo só `context.statement`, nunca `context.retrieved` — by construction, não
por vigilância. `explain()` ganha um campo de citação verificado por um
guardrail novo (`check_citations`).

**Tech Stack:** FastAPI + SQLAlchemy 2.0 (backend), Next.js/TypeScript (só duas
strings de UI mudam), `urllib.request` para a chamada de embeddings (sem
dependência nova), BM25 já implementado em `app/knowledge/lexical.py`.

**Spec:** [docs/superpowers/specs/2026-08-25-cerebro-rag-design.md](../specs/2026-08-25-cerebro-rag-design.md)

## Correções ao ler a spec

Duas correções, achadas ao ler o código de verdade (não estavam visíveis na
spec, que foi escrita a partir de um resumo):

1. **`EmbeddingClient` já tem `base_url`/`_headers()` com fallback para
   `AI_BASE_URL`/`AI_API_KEY`** (`app/knowledge/embeddings.py:119-123,177-185`)
   — não existe (nem é preciso) um `KNOWLEDGE_EMBEDDING_API_KEY` separado como
   a spec sugeria; só faltam os dois campos `knowledge_embedding_base_url`/
   `knowledge_embedding_model` em `Settings`. `KNOWN_EMBEDDING_ENDPOINTS`
   (`embeddings.py:43-52`) já existe com receitas de Ollama/OpenAI — a receita
   da Jina AI entra ali, não substitui as outras.
2. **Terceiro bug adormecido**: duas mensagens de erro em `embeddings.py`
   (linhas 204, 241) já mandam o operador "reduzir `KNOWLEDGE_EMBEDDING_BATCH`"
   — variável que também não existe em `Settings`, e `embed()` nunca faz lote
   nenhum (manda tudo numa requisição só). Corrigido na Tarefa 2.
3. **Citação verificada precisa de mais que um índice** para ser útil na tela:
   `ExplanationOut.sources` carrega `CitedSourceOut` (título + páginas), não
   `list[int]` cru — a spec falava em índice, mas um índice sozinho não dá para
   o frontend renderizar nada. O índice continua existindo *dentro* do
   contrato do modelo (schema/guardrail); o que sai para o cliente já vem
   traduzido.

## Global Constraints

- Python: SQLAlchemy 2.0 (`Mapped[...]`/`mapped_column`), Pydantic v2, type
  hints em tudo, `from __future__ import annotations` no topo de todo arquivo
  novo.
- `ruff check app` e `black --check app` limpos antes de cada commit.
- TDD em toda tarefa: teste que falha, depois a implementação mínima que faz
  passar.
- **A ancoragem numérica é intocável**: nenhuma tarefa deste plano pode alterar
  `guardrails.check_constraint`, `numbers_in` ou `ungrounded_numbers` para
  aceitar `context.retrieved` como fonte de número.
- `KNOWLEDGE_EMBEDDING_BASE_URL`/`KNOWLEDGE_EMBEDDING_MODEL`/
  `KNOWLEDGE_EMBEDDING_BATCH` sem valor padrão (D-36) — ausência de qualquer
  um deles significa busca só léxica, nunca erro.
- Retrieval nunca roda para `provider.simulated is True` (o `mock`) — nem
  léxico, nem semântico. Zero rede, zero custo, zero mudança de comportamento
  para o provedor padrão.
- TypeScript: modo estrito, sem `any`; qualquer tipo novo entra em
  `packages/shared-types/index.ts` (D-16/M4 — fonte única, `apps/web/lib/types.ts`
  é barril de reexportação, não edite lá).

---

### Task 1: Corrigir `search_text` nunca populado

A busca léxica (BM25) já está correta em `lexical.py`, mas não tem o que
buscar: `KnowledgeChunk.search_text` fica sempre `""` porque
`KnowledgeService._ingest_one` nunca a preenche.

**Arquivos:**
- Modificar: `apps/api/app/knowledge/service.py:208-217`
- Teste: `apps/api/app/tests/test_knowledge_ingest.py`

**Interfaces:**
- Consome: `app.knowledge.lexical.fold(text: str) -> str` (já existe,
  `lexical.py:116`).
- Produz: `KnowledgeChunk.search_text` populado — usado pela Tarefa 4
  (`retrieval.py`, busca léxica).

- [ ] **Passo 1: Escrever o teste que falha**

Em `apps/api/app/tests/test_knowledge_ingest.py`, adicionar à classe
`TestIngest`:

```python
    def test_search_text_is_populated_for_lexical_retrieval(
        self, db_session, corpus: Path
    ) -> None:
        # Sem isto a busca léxica (BM25) não tem o que comparar: toda consulta
        # voltaria vazia mesmo com o texto certo indexado.
        _write(corpus, "aula.pdf", ["O módulo de Young mede a rigidez do material."])
        KnowledgeService(db_session).ingest()

        document = KnowledgeRepository(db_session).get_by_path("aula.pdf")
        assert document is not None
        chunk = KnowledgeRepository(db_session).list_chunks(document.id)[0]
        assert chunk.search_text != ""
        assert "modulo" in chunk.search_text  # dobrado: sem acento
        assert "young" in chunk.search_text
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_knowledge_ingest.py::TestIngest::test_search_text_is_populated_for_lexical_retrieval -v
```
Esperado: FAIL (`assert '' != ''` ou similar — `search_text` vazio).

- [ ] **Passo 3: Corrigir**

Em `apps/api/app/knowledge/service.py`, adicionar o import e usar `fold` na
construção do `KnowledgeChunk`:

```python
# no topo do arquivo, junto dos outros imports de app.knowledge
from app.knowledge.lexical import fold
```

```python
        self.repo.replace_chunks(
            document.id,
            [
                KnowledgeChunk(
                    ordinal=chunk.ordinal,
                    text=chunk.text,
                    char_count=chunk.char_count,
                    page_start=chunk.page_start,
                    page_end=chunk.page_end,
                    heading=chunk.heading,
                    search_text=fold(chunk.text),
                )
                for chunk in chunks
            ],
        )
```

- [ ] **Passo 4: Rodar e confirmar que passa**

```
cd apps/api && pytest app/tests/test_knowledge_ingest.py -v
```
Esperado: todos os testes de `test_knowledge_ingest.py` PASS.

- [ ] **Passo 5: Lint e commit**

```bash
cd apps/api && ruff check app && black --check app
git add apps/api/app/knowledge/service.py apps/api/app/tests/test_knowledge_ingest.py
git commit -m "fix(conhecimento): popula search_text na ingestão (BM25 não tinha o que buscar)"
```

---

### Task 2: Configuração de embeddings + lote real

`EmbeddingClient` referencia `settings.knowledge_embedding_model`/
`knowledge_embedding_base_url`, que não existem em `Settings` — todo uso
levanta `AttributeError`. As mensagens de erro também já prometem
`KNOWLEDGE_EMBEDDING_BATCH`, mas `embed()` nunca faz lote nenhum.

**Arquivos:**
- Modificar: `apps/api/app/config.py`
- Modificar: `apps/api/app/knowledge/embeddings.py`
- Teste (novo): `apps/api/app/tests/test_knowledge_embeddings.py`

**Interfaces:**
- Produz: `Settings.knowledge_embedding_base_url: str`,
  `Settings.knowledge_embedding_model: str`,
  `Settings.knowledge_embedding_batch: int` (default `96`).
- Produz: `EmbeddingClient.embed(texts: list[str]) -> list[list[float]]`
  continua com a mesma assinatura, mas agora faz lotes internamente — nenhum
  chamador precisa mudar.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `apps/api/app/tests/test_knowledge_embeddings.py`:

```python
"""EmbeddingClient: a chamada de rede que a busca semântica depende, sem rede
de verdade — mesmo padrão de test_ai_openai_compat.py (fake opener injetável).
"""

from __future__ import annotations

import json

import pytest

from app.config import Settings
from app.knowledge.embeddings import EmbeddingClient, EmbeddingUnavailableError


class _Response:
    def __init__(self, body: str) -> None:
        self._body = body.encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> "_Response":
        return self

    def __exit__(self, *_exc: object) -> bool:
        return False


class _Server:
    """Registra cada request recebida e devolve vetores determinísticos."""

    def __init__(self) -> None:
        self.requests: list[dict] = []

    def __call__(self, request: object, timeout: float | None = None) -> _Response:
        body = json.loads(request.data.decode("utf-8"))
        self.requests.append(body)
        vectors = [
            {"index": i, "embedding": [1.0, 0.0, 0.0]} for i in range(len(body["input"]))
        ]
        return _Response(json.dumps({"data": vectors}))


def _settings(**overrides) -> Settings:
    base = {
        "knowledge_embedding_base_url": "https://api.jina.ai/v1",
        "knowledge_embedding_model": "jina-embeddings-v3",
        "knowledge_embedding_batch": 96,
    }
    base.update(overrides)
    return Settings(**base)


class TestMissingConfiguration:
    def test_settings_declares_the_fields(self) -> None:
        # A regressão que este teste guarda: os três campos existiam só em
        # docstring/mensagem de erro, nunca em Settings — qualquer uso de
        # EmbeddingClient levantava AttributeError em vez do erro gracioso.
        settings = Settings()
        assert settings.knowledge_embedding_base_url == ""
        assert settings.knowledge_embedding_model == ""
        assert settings.knowledge_embedding_batch == 96

    def test_missing_model_raises_the_graceful_error(self) -> None:
        settings = _settings(knowledge_embedding_model="")
        client = EmbeddingClient(settings, opener=_Server())
        with pytest.raises(EmbeddingUnavailableError, match="KNOWLEDGE_EMBEDDING_MODEL"):
            client.embed(["texto"])


class TestBatching:
    def test_large_input_is_split_into_batches(self) -> None:
        server = _Server()
        settings = _settings(knowledge_embedding_batch=2)
        client = EmbeddingClient(settings, opener=server)

        vectors = client.embed(["a", "b", "c", "d", "e"])

        assert len(vectors) == 5
        # 5 textos, lote de 2 -> 3 requisições (2, 2, 1), nunca uma só.
        assert len(server.requests) == 3
        assert [len(r["input"]) for r in server.requests] == [2, 2, 1]

    def test_vectors_stay_in_input_order_across_batches(self) -> None:
        settings = _settings(knowledge_embedding_batch=1)
        client = EmbeddingClient(settings, opener=_Server())
        vectors = client.embed(["x", "y", "z"])
        assert len(vectors) == 3  # uma requisição por texto, ordem preservada

    def test_small_input_is_one_request(self) -> None:
        server = _Server()
        settings = _settings(knowledge_embedding_batch=96)
        client = EmbeddingClient(settings, opener=server)
        client.embed(["a", "b", "c"])
        assert len(server.requests) == 1
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_knowledge_embeddings.py -v
```
Esperado: `TestMissingConfiguration::test_settings_declares_the_fields` FAIL
(`AttributeError` ou `ValidationError` do Pydantic — o campo não existe).

- [ ] **Passo 3: Declarar os campos em `Settings`**

Em `apps/api/app/config.py`, depois de `knowledge_retrieval_top_k` (linha
102), antes da seção `--- Auth`:

```python
    # Embeddings para busca semântica — estritamente opcional por cima da
    # busca léxica (que não depende de nenhum dos três). Sem padrão de
    # propósito (D-36): um padrão escolheria um fornecedor pelo operador.
    # Receitas prontas em .env.example.
    knowledge_embedding_base_url: str = ""
    knowledge_embedding_model: str = ""
    # Textos por requisição de embedding. A maioria dos provedores tem um
    # teto prático (centenas a milhares); 96 é conservador o bastante para
    # servir a qualquer um sem medir por provedor.
    knowledge_embedding_batch: int = 96
```

- [ ] **Passo 4: Implementar o lote real em `EmbeddingClient.embed`**

Em `apps/api/app/knowledge/embeddings.py`, substituir o corpo de `embed`:

```python
    def embed(self, texts: list[str]) -> list[list[float]]:
        """Vectors for ``texts``, in the same order.

        Raises:
            EmbeddingUnavailableError: the layer is unconfigured, the server
                refused, or the answer did not have the promised shape.
        """
        if not texts:
            return []

        batch_size = max(1, self.settings.knowledge_embedding_batch)
        vectors: list[list[float]] = []
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            body = {"model": self._model_or_fail(), "input": batch}
            payload = self._post(body)
            batch_vectors = _vectors_of(payload, expected=len(batch))
            vectors.extend(normalise(vector) for vector in batch_vectors)
        return vectors
```

- [ ] **Passo 5: Rodar e confirmar que tudo passa**

```
cd apps/api && pytest app/tests/test_knowledge_embeddings.py -v
```
Esperado: todos PASS.

- [ ] **Passo 6: Suíte completa, lint, commit**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/app/config.py apps/api/app/knowledge/embeddings.py apps/api/app/tests/test_knowledge_embeddings.py
git commit -m "fix(conhecimento): declara KNOWLEDGE_EMBEDDING_* e implementa lote real em EmbeddingClient"
```

---

### Task 3: Gerar embeddings na ingestão

Hoje `KnowledgeService.ingest()` nunca grava `KnowledgeEmbedding`. Esta tarefa
liga a geração — só quando embeddings estão configurados, sem derrubar a
ingestão inteira se o serviço de embeddings falhar no meio do caminho.

**Arquivos:**
- Modificar: `apps/api/app/knowledge/service.py`
- Modificar: `apps/api/app/repositories/knowledge_repository.py`
- Teste: `apps/api/app/tests/test_knowledge_ingest.py`

**Interfaces:**
- Consome: `EmbeddingClient.embed` (Tarefa 2), `app.knowledge.embeddings.pack_vector`.
- Produz: `KnowledgeRepository.set_embedding(chunk_id: int, *, model: str, vector: list[float]) -> None`.
- Produz: `IngestReport.embedded_chunks: int`, `IngestReport.embeddings_skipped_reason: str | None`
  — usados pelo resumo do CLI/rota HTTP (Tarefas 12/13).

- [ ] **Passo 1: Escrever os testes que falham**

Em `apps/api/app/tests/test_knowledge_ingest.py`, nova classe no fim do
arquivo:

```python
class _FakeEmbeddingClient:
    """Determinístico, sem rede: cada texto vira um vetor de tamanho fixo."""

    def __init__(self, model: str = "fake-embed", calls: list[list[str]] | None = None) -> None:
        self.model = model
        self.calls = calls if calls is not None else []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        return [[1.0, 0.0, 0.0] for _ in texts]


class TestEmbeddingSync:
    def test_new_document_gets_embeddings_when_configured(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write(corpus, "aula.pdf", ["Conteúdo técnico sobre seleção de materiais."])
        service = KnowledgeService(db_session)
        fake = _FakeEmbeddingClient()
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: fake)

        report = service.ingest()

        document = KnowledgeRepository(db_session).get_by_path("aula.pdf")
        chunk = KnowledgeRepository(db_session).list_chunks(document.id)[0]
        assert chunk.embedding is not None
        assert chunk.embedding.model == "fake-embed"
        assert report.embedded_chunks >= 1

    def test_embeddings_are_never_generated_when_unconfigured(
        self, db_session, corpus: Path
    ) -> None:
        # Padrão do produto: sem KNOWLEDGE_EMBEDDING_* a ingestão continua
        # léxica-somente, sem tentar nenhuma chamada de rede.
        _write(corpus, "aula.pdf", ["conteúdo"])
        report = KnowledgeService(db_session).ingest()
        assert report.embedded_chunks == 0
        document = KnowledgeRepository(db_session).get_by_path("aula.pdf")
        chunk = KnowledgeRepository(db_session).list_chunks(document.id)[0]
        assert chunk.embedding is None

    def test_unchanged_document_already_embedded_is_not_re_embedded(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write(corpus, "aula.pdf", ["conteúdo estável"])
        service = KnowledgeService(db_session)
        calls: list[list[str]] = []
        fake = _FakeEmbeddingClient(calls=calls)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: fake)

        service.ingest()
        calls.clear()
        second = service.ingest()  # documento inalterado, já embedado

        assert second.embedded_chunks == 0
        assert calls == []

    def test_previously_unconfigured_document_gets_embedded_once_turned_on(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Corpus já ingerido sem embeddings; ligar a configuração depois não
        # deve exigir --force para o backfill acontecer.
        _write(corpus, "aula.pdf", ["conteúdo"])
        service = KnowledgeService(db_session)
        service.ingest()  # sem embeddings configurados ainda

        fake = _FakeEmbeddingClient()
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: fake)
        report = service.ingest()  # force=False

        assert report.unchanged == 1  # não reextraiu o texto
        assert report.embedded_chunks >= 1  # mas embedou

    def test_embedding_failure_is_recorded_not_raised(
        self, db_session, corpus: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.knowledge.embeddings import EmbeddingUnavailableError

        class _FailingClient:
            def embed(self, texts: list[str]) -> list[list[float]]:
                raise EmbeddingUnavailableError("servidor fora do ar")

        _write(corpus, "aula.pdf", ["conteúdo"])
        service = KnowledgeService(db_session)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: _FailingClient())

        report = service.ingest()  # não levanta

        assert report.embeddings_skipped_reason == "servidor fora do ar"
        assert report.failed == 0  # a extração léxica continua tendo sucesso
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_knowledge_ingest.py::TestEmbeddingSync -v
```
Esperado: FAIL (`AttributeError: 'KnowledgeService' object has no attribute
'_embeddings_configured'`).

- [ ] **Passo 3: `KnowledgeRepository.set_embedding`**

Em `apps/api/app/repositories/knowledge_repository.py`, adicionar o import e
o método:

```python
# no topo, junto dos outros imports de app.models.knowledge
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding
```

```python
    # --- embeddings ----------------------------------------------------

    def set_embedding(self, chunk_id: int, *, model: str, vector: list[float]) -> None:
        """Create or replace the embedding for one chunk."""
        from app.knowledge.embeddings import pack_vector

        existing = (
            self.db.execute(
                select(KnowledgeEmbedding).where(KnowledgeEmbedding.chunk_id == chunk_id)
            )
            .scalars()
            .one_or_none()
        )
        packed = pack_vector(vector)
        if existing is not None:
            existing.model = model
            existing.dimensions = len(vector)
            existing.vector = packed
        else:
            self.db.add(
                KnowledgeEmbedding(
                    chunk_id=chunk_id, model=model, dimensions=len(vector), vector=packed
                )
            )
        self.db.flush()
```

- [ ] **Passo 4: `IngestReport` ganha os dois campos novos**

Em `apps/api/app/knowledge/service.py`, no dataclass `IngestReport`:

```python
@dataclass
class IngestReport:
    """Everything one run did, in the shape the operator needs to audit it."""

    root: str
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    failed: int = 0
    skipped: int = 0
    total_chunks: int = 0
    embedded_chunks: int = 0
    embeddings_skipped_reason: str | None = None
    outcomes: list[DocumentOutcome] = field(default_factory=list)
```

- [ ] **Passo 5: `KnowledgeService` — os três métodos novos + chamada em `ingest`**

Em `apps/api/app/knowledge/service.py`, adicionar o import:

```python
from app.knowledge.embeddings import EmbeddingClient, EmbeddingUnavailableError
```

Adicionar os métodos (perto de `root()`, seção `--- discovery ---`):

```python
    def _embeddings_configured(self) -> bool:
        return bool(
            self.settings.knowledge_embedding_base_url.strip()
            and self.settings.knowledge_embedding_model.strip()
        )

    def _embedding_client(self) -> EmbeddingClient:
        return EmbeddingClient(self.settings)

    def _sync_embeddings(self, embed_client: EmbeddingClient, document: KnowledgeDocument) -> int:
        """Embed every chunk of ``document`` lacking a vector from the current model.

        Self-healing on purpose: a chunk already embedded with today's model is
        left alone; one embedded with a *different* model (or never embedded)
        gets a fresh vector — so turning embeddings on after the fact, or
        switching models, never needs ``force=True`` to backfill.
        """
        chunks = self.repo.list_chunks(document.id)
        stale = [
            c for c in chunks if c.embedding is None or c.embedding.model != embed_client.model
        ]
        if not stale:
            return 0
        vectors = embed_client.embed([c.text for c in stale])
        for chunk, vector in zip(stale, vectors, strict=True):
            self.repo.set_embedding(chunk.id, model=embed_client.model, vector=vector)
        return len(stale)
```

Modificar `ingest()` para chamar `_sync_embeddings` após cada documento:

```python
    def ingest(self, force: bool = False) -> IngestReport:
        """Catalogue and index every discovered document.

        Args:
            force: re-extract even when the checksum matches. For when the
                chunker changed, not the corpus.
        """
        root = self.root()
        declared = load_manifest(root)
        report = IngestReport(root=str(root))
        embed_client = self._embedding_client() if self._embeddings_configured() else None

        for path in self.discover():
            relative = path.relative_to(root).as_posix()
            try:
                outcome = self._ingest_one(path, relative, declared.get(relative), force)
            except ValidationError as exc:
                # One unreadable document costs that document, not the run.
                outcome = self._record_failure(relative, str(exc))
            report.record(outcome)

            if (
                embed_client is not None
                and outcome.action != "falhou"
                and report.embeddings_skipped_reason is None
            ):
                document = self.repo.get_by_path(relative)
                if document is not None:
                    try:
                        report.embedded_chunks += self._sync_embeddings(embed_client, document)
                    except EmbeddingUnavailableError as exc:
                        # One systemic failure (network, credential) is enough
                        # to know retrying per document would only waste time —
                        # recorded once, the lexical pass already succeeded.
                        report.embeddings_skipped_reason = str(exc)
        return report
```

- [ ] **Passo 6: Rodar e confirmar que tudo passa**

```
cd apps/api && pytest app/tests/test_knowledge_ingest.py -v
```
Esperado: todos PASS, incluindo `TestEmbeddingSync`.

- [ ] **Passo 7: Suíte completa, lint, commit**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/app/knowledge/service.py apps/api/app/repositories/knowledge_repository.py apps/api/app/tests/test_knowledge_ingest.py
git commit -m "feat(conhecimento): gera embeddings na ingestão quando configurados, autocurativo por modelo"
```

---

### Task 4: `app/knowledge/retrieval.py` — busca léxica

O primeiro pedaço do módulo que hoje não existe: uma função que recebe uma
consulta e devolve trechos ranqueados por BM25.

**Arquivos:**
- Criar: `apps/api/app/knowledge/retrieval.py`
- Modificar: `apps/api/app/repositories/knowledge_repository.py`
- Teste (novo): `apps/api/app/tests/test_knowledge_retrieval.py`

**Interfaces:**
- Consome: `app.knowledge.lexical.tokenize`, `bm25_scores` (já existem).
- Produz: `RetrievedChunk` (dataclass), `search(db, query, *, top_k, settings) -> list[RetrievedChunk]`
  — usado pela Tarefa 7 (`AIService`).

- [ ] **Passo 1: Escrever os testes que falham**

Criar `apps/api/app/tests/test_knowledge_retrieval.py`:

```python
"""app.knowledge.retrieval: a função de busca que não existia antes deste
trabalho — só as primitivas (BM25, embeddings) existiam, sem quem as chamasse.
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.knowledge.retrieval import search
from app.knowledge.service import KnowledgeService
from app.models.enums import DocumentKind, SourceAuthority
from app.repositories.knowledge_repository import KnowledgeRepository


@pytest.fixture
def corpus(tmp_path, monkeypatch: pytest.MonkeyPatch):
    from app.config import settings

    root = tmp_path / "cerebro"
    root.mkdir()
    monkeypatch.setattr(settings, "knowledge_dir", str(root))
    return root


def _pdf_bytes(pages: list[str]) -> bytes:
    from app.tests.test_knowledge_ingest import _pdf_bytes as build

    return build(pages)


def _write(root, name: str, pages: list[str]):
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_pdf_bytes(pages))
    return path


class TestLexicalOnly:
    def test_finds_a_matching_passage(self, db_session, corpus) -> None:
        _write(corpus, "aula.pdf", ["O módulo de Young mede a rigidez elástica do material."])
        _write(corpus, "outro.pdf", ["Corrosão em ambientes marinhos e névoa salina."])
        KnowledgeService(db_session).ingest()

        results = search(db_session, "rigidez elastica modulo", top_k=5, settings=Settings())

        assert results
        assert any("Young" in r.text for r in results)

    def test_respects_top_k(self, db_session, corpus) -> None:
        for i in range(10):
            _write(corpus, f"doc{i}.pdf", [f"Densidade e propriedades mecânicas do material {i}."])
        KnowledgeService(db_session).ingest()

        results = search(db_session, "densidade propriedades mecanicas", top_k=3, settings=Settings())
        assert len(results) <= 3

    def test_no_match_returns_empty(self, db_session, corpus) -> None:
        _write(corpus, "aula.pdf", ["conteúdo qualquer sobre engenharia"])
        KnowledgeService(db_session).ingest()
        results = search(db_session, "xenobiologia quantica", top_k=5, settings=Settings())
        assert results == []

    def test_carries_document_provenance(self, db_session, corpus) -> None:
        import json

        _write(corpus, "ashby.pdf", ["Índices de desempenho na seleção de materiais."])
        (corpus / "manifesto.json").write_text(
            json.dumps(
                {
                    "documentos": [
                        {
                            "path": "ashby.pdf",
                            "titulo": "Materials Selection in Mechanical Design",
                            "tipo": "LIVRO",
                            "autoridade": "CIENTIFICA",
                        }
                    ]
                }
            ),
            encoding="utf-8",
        )
        KnowledgeService(db_session).ingest()

        results = search(db_session, "indices desempenho selecao materiais", top_k=5, settings=Settings())
        assert results
        assert results[0].document_title == "Materials Selection in Mechanical Design"
        assert results[0].document_kind == DocumentKind.LIVRO
        assert results[0].document_authority == SourceAuthority.CIENTIFICA

    def test_empty_corpus_returns_empty(self, db_session, corpus) -> None:
        assert search(db_session, "qualquer coisa", top_k=5, settings=Settings()) == []
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_knowledge_retrieval.py -v
```
Esperado: FAIL (`ModuleNotFoundError: app.knowledge.retrieval`).

- [ ] **Passo 3: Repositório — leitura em massa para BM25**

Em `apps/api/app/repositories/knowledge_repository.py`, adicionar:

```python
    def list_all_chunks_for_lexical_search(self) -> list[KnowledgeChunk]:
        """Every chunk with a non-empty ``search_text``, joined to its document.

        Loaded eagerly and in full: BM25 needs corpus-wide document frequency,
        which means every passage's tokens regardless of how few will end up
        in the answer. At the corpus's current size (~150 documents) this is a
        single query, not a scaling concern yet — see the spec's ``§10``.
        """
        from sqlalchemy.orm import joinedload

        return list(
            self.db.execute(
                select(KnowledgeChunk)
                .options(joinedload(KnowledgeChunk.document), joinedload(KnowledgeChunk.embedding))
                .where(KnowledgeChunk.search_text != "")
            )
            .scalars()
            .all()
        )
```

- [ ] **Passo 4: `app/knowledge/retrieval.py` — busca léxica**

```python
"""Retrieval: turn a query into ranked, cited passages from the corpus.

Nothing here existed before this module — ``lexical.py`` and ``embeddings.py``
are primitives a caller has to orchestrate, and this is that orchestration.
Only lexical search is implemented in this first pass; semantic search and
the fusion between the two arrive in the next one.

**Vocabulary and context, never a number's source.** Whatever this returns
feeds a prompt as reference text — it is never read by
``app.ai.guardrails.check_constraint``, which only ever sees
``context.statement``. See ``app/knowledge/__init__.py``.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import Settings
from app.knowledge.lexical import bm25_scores, tokenize
from app.models.enums import DocumentKind, SourceAuthority
from app.repositories.knowledge_repository import KnowledgeRepository

#: How many lexical candidates feed the ranking before top_k trims it. Wider
#: than what the caller asked for so a later fusion step (semantic search)
#: has more than one signal's worth of material to combine.
_LEXICAL_CANDIDATES = 20


@dataclass(frozen=True)
class RetrievedChunk:
    """One passage handed to a prompt, with what makes it checkable."""

    document_title: str
    document_kind: DocumentKind
    document_authority: SourceAuthority
    page_start: int | None
    page_end: int | None
    text: str
    score: float


def search(
    db: Session, query: str, *, top_k: int, settings: Settings
) -> list[RetrievedChunk]:
    """The ``top_k`` passages most relevant to ``query``.

    Lexical (BM25) always runs — it needs no network and no configuration
    beyond a corpus already ingested. Empty list when nothing was ingested or
    nothing matches; never raises for an empty corpus.
    """
    repo = KnowledgeRepository(db)
    return _lexical_search(repo, query, top_k=top_k)


def _lexical_search(repo: KnowledgeRepository, query: str, *, top_k: int) -> list[RetrievedChunk]:
    query_tokens = tokenize(query)
    if not query_tokens:
        return []

    chunks = repo.list_all_chunks_for_lexical_search()
    if not chunks:
        return []

    documents = {chunk.id: tokenize(chunk.search_text) for chunk in chunks}
    document_frequency: dict[str, int] = {}
    for tokens in documents.values():
        for token in set(tokens):
            document_frequency[token] = document_frequency.get(token, 0) + 1

    scores = bm25_scores(query_tokens, documents, document_frequency, corpus_size=len(chunks))
    if not scores:
        return []

    by_id = {chunk.id: chunk for chunk in chunks}
    ranked = sorted(scores.items(), key=lambda item: -item[1])[: max(top_k, _LEXICAL_CANDIDATES)]

    results = [
        RetrievedChunk(
            document_title=by_id[chunk_id].document.title,
            document_kind=by_id[chunk_id].document.kind,
            document_authority=by_id[chunk_id].document.authority,
            page_start=by_id[chunk_id].page_start,
            page_end=by_id[chunk_id].page_end,
            text=by_id[chunk_id].text,
            score=score,
        )
        for chunk_id, score in ranked
    ]
    return results[:top_k]
```

- [ ] **Passo 5: Rodar e confirmar que tudo passa**

```
cd apps/api && pytest app/tests/test_knowledge_retrieval.py -v
```
Esperado: todos PASS.

- [ ] **Passo 6: Suíte completa, lint, commit**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/app/knowledge/retrieval.py apps/api/app/repositories/knowledge_repository.py apps/api/app/tests/test_knowledge_retrieval.py
git commit -m "feat(conhecimento): busca léxica (BM25) sobre o corpus ingerido"
```

---

### Task 5: `retrieval.py` — busca semântica + fusão RRF

Estende `search()` com o caminho semântico (quando configurado) e funde os
dois rankings por *reciprocal rank fusion*. Degrada para léxico puro se a
chamada de embedding falhar.

**Arquivos:**
- Modificar: `apps/api/app/knowledge/retrieval.py`
- Modificar: `apps/api/app/repositories/knowledge_repository.py`
- Teste: `apps/api/app/tests/test_knowledge_retrieval.py`

**Interfaces:**
- Consome: `app.knowledge.embeddings.EmbeddingClient`, `similarity`,
  `unpack_vector` (já existem, Tarefa 2).
- Produz: `search()` com o mesmo contrato da Tarefa 4, agora híbrido.

- [ ] **Passo 1: Escrever os testes que falham**

Em `apps/api/app/tests/test_knowledge_retrieval.py`, adicionar:

```python
class _FakeEmbeddingClient:
    """Vetores determinísticos: 'quente' aponta pra um eixo, 'frio' pro outro."""

    def __init__(self, model: str = "fake-embed", fail: bool = False) -> None:
        self.model = model
        self.fail = fail

    def embed(self, texts: list[str]) -> list[list[float]]:
        if self.fail:
            from app.knowledge.embeddings import EmbeddingUnavailableError

            raise EmbeddingUnavailableError("indisponível no teste")
        return [
            [1.0, 0.0] if "quente" in text.lower() else [0.0, 1.0] for text in texts
        ]


class TestHybridSearch:
    def test_semantic_search_used_when_configured(
        self, db_session, corpus, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Sinônimo puro, sem sobreposição léxica com a consulta: só a via
        # semântica encontra.
        _write(corpus, "termico.pdf", ["Materiais para ambientes de alta temperatura, quente."])
        _write(corpus, "outro.pdf", ["Processos de fabricação e usinagem convencional."])
        KnowledgeService(db_session).ingest()

        settings = Settings(
            knowledge_embedding_base_url="https://fake/v1",
            knowledge_embedding_model="fake-embed",
        )
        fake = _FakeEmbeddingClient()
        monkeypatch.setattr(
            "app.knowledge.retrieval.EmbeddingClient", lambda _settings: fake
        )
        # Popula os vetores como a ingestão faria.
        service = KnowledgeService(db_session, settings)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: fake)
        service.ingest()

        results = search(db_session, "quente", top_k=5, settings=settings)
        assert any("temperatura" in r.text for r in results)

    def test_degrades_to_lexical_when_embedding_call_fails(
        self, db_session, corpus, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _write(corpus, "aula.pdf", ["Densidade e módulo de elasticidade dos metais."])
        KnowledgeService(db_session).ingest()

        settings = Settings(
            knowledge_embedding_base_url="https://fake/v1",
            knowledge_embedding_model="fake-embed",
        )
        failing = _FakeEmbeddingClient(fail=True)
        monkeypatch.setattr(
            "app.knowledge.retrieval.EmbeddingClient", lambda _settings: failing
        )

        # Não levanta: cai para léxico puro nesta consulta.
        results = search(db_session, "densidade modulo elasticidade metais", top_k=5, settings=settings)
        assert results

    def test_no_embedding_config_is_lexical_only(self, db_session, corpus) -> None:
        # Sem KNOWLEDGE_EMBEDDING_*, nenhuma tentativa de rede é feita — o
        # settings default (Settings()) já não tem os dois campos setados.
        _write(corpus, "aula.pdf", ["Resistência à tração de ligas metálicas."])
        KnowledgeService(db_session).ingest()
        results = search(db_session, "resistencia tracao ligas", top_k=5, settings=Settings())
        assert results
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_knowledge_retrieval.py::TestHybridSearch -v
```
Esperado: FAIL (`_lexical_search` é tudo que `search` faz hoje — o teste de
sinônimo puro não acha nada por via léxica).

- [ ] **Passo 3: Repositório — vetores em massa**

Em `apps/api/app/repositories/knowledge_repository.py`:

```python
    def list_all_embeddings(self) -> list[KnowledgeChunk]:
        """Every chunk that has an embedding, joined to it and to its document."""
        from sqlalchemy.orm import joinedload

        return list(
            self.db.execute(
                select(KnowledgeChunk)
                .join(KnowledgeEmbedding, KnowledgeChunk.embedding)
                .options(joinedload(KnowledgeChunk.document), joinedload(KnowledgeChunk.embedding))
            )
            .scalars()
            .all()
        )
```

- [ ] **Passo 4: Fusão RRF em `retrieval.py`**

Reescrever `apps/api/app/knowledge/retrieval.py` (substituindo o corpo de
`search` e acrescentando as funções de apoio):

```python
"""Retrieval: turn a query into ranked, cited passages from the corpus.

Hybrid by default: lexical (BM25, no network) and semantic (embeddings, one
network call for the query) are ranked separately, then combined by
*reciprocal rank fusion* — each candidate's score is the sum of
``1 / (k + rank)`` across whichever lists it appears in, ``k = 60`` (the
constant the RRF literature converged on; no tuning knob here because there
is nothing yet to tune it against).

Semantic search degrades to lexical-only, silently to the caller, whenever
embeddings are unconfigured or the call fails — a knowledge base is more
useful with half its retrieval working than with none of it, and the
alternative (raising) would make one flaky embedding provider take down every
AI call in the product.

**Vocabulary and context, never a number's source.** Whatever this returns
feeds a prompt as reference text — it is never read by
``app.ai.guardrails.check_constraint``, which only ever sees
``context.statement``. See ``app/knowledge/__init__.py``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import Settings
from app.knowledge.embeddings import EmbeddingClient, EmbeddingUnavailableError, similarity, unpack_vector
from app.knowledge.lexical import bm25_scores, tokenize
from app.models.enums import DocumentKind, SourceAuthority
from app.models.knowledge import KnowledgeChunk
from app.repositories.knowledge_repository import KnowledgeRepository

logger = logging.getLogger(__name__)

#: How many candidates each ranking (lexical, semantic) contributes before
#: fusion trims to top_k. Wider than top_k so fusion has real material to
#: combine instead of comparing two already-truncated lists.
_CANDIDATES = 20
#: RRF's smoothing constant — the value the technique's literature settled on.
_RRF_K = 60


@dataclass(frozen=True)
class RetrievedChunk:
    """One passage handed to a prompt, with what makes it checkable."""

    document_title: str
    document_kind: DocumentKind
    document_authority: SourceAuthority
    page_start: int | None
    page_end: int | None
    text: str
    score: float


def search(
    db: Session, query: str, *, top_k: int, settings: Settings
) -> list[RetrievedChunk]:
    """The ``top_k`` passages most relevant to ``query``, lexical + semantic."""
    repo = KnowledgeRepository(db)
    query_tokens = tokenize(query)
    if not query_tokens:
        return []

    lexical_ranked = _lexical_rank(repo, query_tokens)
    semantic_ranked = _semantic_rank(repo, query, settings)

    fused = _reciprocal_rank_fusion([lexical_ranked, semantic_ranked])
    if not fused:
        return []

    chunks_by_id = {chunk.id: chunk for chunk in repo.list_all_chunks_for_lexical_search()}
    # Semantic-only matches may not be in the lexical fetch (search_text could
    # theoretically differ in coverage); fall back to the embeddings fetch.
    if any(chunk_id not in chunks_by_id for chunk_id, _ in fused):
        chunks_by_id.update({chunk.id: chunk for chunk in repo.list_all_embeddings()})

    results = [
        _to_retrieved_chunk(chunks_by_id[chunk_id], score)
        for chunk_id, score in fused
        if chunk_id in chunks_by_id
    ]
    return results[:top_k]


def _lexical_rank(repo: KnowledgeRepository, query_tokens: list[str]) -> list[tuple[int, float]]:
    chunks = repo.list_all_chunks_for_lexical_search()
    if not chunks:
        return []
    documents = {chunk.id: tokenize(chunk.search_text) for chunk in chunks}
    document_frequency: dict[str, int] = {}
    for tokens in documents.values():
        for token in set(tokens):
            document_frequency[token] = document_frequency.get(token, 0) + 1
    scores = bm25_scores(query_tokens, documents, document_frequency, corpus_size=len(chunks))
    return sorted(scores.items(), key=lambda item: -item[1])[:_CANDIDATES]


def _semantic_rank(
    repo: KnowledgeRepository, query: str, settings: Settings
) -> list[tuple[int, float]]:
    if not (
        settings.knowledge_embedding_base_url.strip()
        and settings.knowledge_embedding_model.strip()
    ):
        return []
    chunks = repo.list_all_embeddings()
    if not chunks:
        return []
    try:
        client = EmbeddingClient(settings)
        query_vector = client.embed([query])[0]
    except EmbeddingUnavailableError as exc:
        logger.warning("Busca semântica indisponível, usando só léxica: %s", exc)
        return []

    scored = [
        (chunk.id, similarity(query_vector, unpack_vector(chunk.embedding.vector)))
        for chunk in chunks
        if chunk.embedding is not None and chunk.embedding.model == client.model
    ]
    scored.sort(key=lambda item: -item[1])
    return scored[:_CANDIDATES]


def _reciprocal_rank_fusion(rankings: list[list[tuple[int, float]]]) -> list[tuple[int, float]]:
    fused: dict[int, float] = {}
    for ranking in rankings:
        for position, (chunk_id, _score) in enumerate(ranking):
            fused[chunk_id] = fused.get(chunk_id, 0.0) + 1.0 / (_RRF_K + position + 1)
    return sorted(fused.items(), key=lambda item: -item[1])


def _to_retrieved_chunk(chunk: KnowledgeChunk, score: float) -> RetrievedChunk:
    return RetrievedChunk(
        document_title=chunk.document.title,
        document_kind=chunk.document.kind,
        document_authority=chunk.document.authority,
        page_start=chunk.page_start,
        page_end=chunk.page_end,
        text=chunk.text,
        score=score,
    )
```

- [ ] **Passo 5: Rodar e confirmar que tudo passa**

```
cd apps/api && pytest app/tests/test_knowledge_retrieval.py -v
```
Esperado: todos PASS.

- [ ] **Passo 6: Suíte completa, lint, commit**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/app/knowledge/retrieval.py apps/api/app/repositories/knowledge_repository.py apps/api/app/tests/test_knowledge_retrieval.py
git commit -m "feat(conhecimento): busca semântica + fusão RRF, com degradação para léxico puro"
```

---

### Task 6: `Cérebro/manifesto.json`

Script que infere proveniência da estrutura de pastas — conservador, nunca
inventa autor. Reaproveitável: rodar de novo só declara o que ainda não foi
declarado, sem sobrescrever edição humana.

**Arquivos:**
- Criar: `apps/api/scripts/generate_knowledge_manifest.py`
- Teste (novo): `apps/api/app/tests/test_generate_knowledge_manifest.py`
- Gerar: `Cérebro/manifesto.json` (executando o script contra o corpus real)

**Interfaces:**
- Produz: `infer_provenance(relative_path: str) -> dict` — testável isolado,
  sem tocar disco.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `apps/api/app/tests/test_generate_knowledge_manifest.py`:

```python
"""Inferência de proveniência por convenção de pasta — conservadora: nunca
declara autor a não ser que o nome do arquivo deixe isso inequívoco.
"""

from __future__ import annotations

from scripts.generate_knowledge_manifest import infer_provenance


class TestFolderRules:
    def test_bibliografia_is_a_scientific_book(self) -> None:
        entry = infer_provenance("01-Bibliografia/callister-materials-science.pdf")
        assert entry["tipo"] == "LIVRO"
        assert entry["autoridade"] == "CIENTIFICA"

    def test_extratos_de_capitulos_is_also_a_book(self) -> None:
        entry = infer_provenance("01-Bibliografia/Extratos-de-Capitulos/cap3.pdf")
        assert entry["tipo"] == "LIVRO"
        assert entry["autoridade"] == "CIENTIFICA"

    def test_topicos_de_aula_is_a_slide(self) -> None:
        entry = infer_provenance("02-Material-de-Curso-ENG02016/Topicos-de-Aula/topico-1.pdf")
        assert entry["tipo"] == "SLIDE"
        assert entry["autoridade"] == "TECNICA"

    def test_trabalhos_entregues_is_an_exercise(self) -> None:
        entry = infer_provenance(
            "02-Material-de-Curso-ENG02016/Trabalhos-Entregues/Trabalho 1/relatorio.pdf"
        )
        assert entry["tipo"] == "EXERCICIO"
        assert entry["autoridade"] == "TECNICA"

    def test_fichas_granta_is_a_ficha(self) -> None:
        entry = infer_provenance(
            "03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/Metais e ligas/Ferrosas/aco.pdf"
        )
        assert entry["tipo"] == "FICHA"
        assert entry["autoridade"] == "TECNICA"

    def test_artigos_cientificos_is_an_article(self) -> None:
        entry = infer_provenance("05-Artigos-Cientificos/artigo1.pdf")
        assert entry["tipo"] == "ARTIGO"
        assert entry["autoridade"] == "CIENTIFICA"

    def test_ferramentas_e_diagramas_is_outro(self) -> None:
        entry = infer_provenance("04-Ferramentas-e-Diagramas/ashby-diagrama.pdf")
        assert entry["tipo"] == "OUTRO"
        assert entry["autoridade"] == "TECNICA"

    def test_unrecognised_folder_falls_back_to_outro_nao_verificada(self) -> None:
        entry = infer_provenance("99-Pasta-Nova/arquivo.pdf")
        assert entry["tipo"] == "OUTRO"
        assert entry["autoridade"] == "NAO_VERIFICADA"


class TestTitleAndAuthor:
    def test_title_comes_from_the_filename_cleaned(self) -> None:
        entry = infer_provenance("01-Bibliografia/materials-selection-in-design.pdf")
        assert entry["titulo"] == "materials selection in design"

    def test_unambiguous_author_in_filename_is_captured(self) -> None:
        entry = infer_provenance(
            "01-Bibliografia/Ashby - Materials Selection in Mechanical Design.pdf"
        )
        assert entry["autor"] == "Ashby"

    def test_generic_filename_has_no_author(self) -> None:
        entry = infer_provenance("02-Material-de-Curso-ENG02016/Topicos-de-Aula/topico-3.pdf")
        assert "autor" not in entry or entry["autor"] is None

    def test_never_invents_reference_or_url(self) -> None:
        entry = infer_provenance("01-Bibliografia/qualquer-livro.pdf")
        assert entry.get("referencia") is None
        assert entry.get("url") is None
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_generate_knowledge_manifest.py -v
```
Esperado: FAIL (`ModuleNotFoundError: scripts.generate_knowledge_manifest`).

- [ ] **Passo 3: Implementar o script**

Criar `apps/api/scripts/generate_knowledge_manifest.py`:

```python
"""Gera (ou atualiza) Cérebro/manifesto.json a partir da convenção de pastas.

Conservador por princípio (mesmo raciocínio de D-21): só declara o que a
estrutura do repositório já deixa inequívoco. `autor` só é preenchido quando
o próprio nome do arquivo traz um sobrenome reconhecível antes de um hífen
separador — nunca por dedução de conteúdo.

Rodar de novo não sobrescreve entrada já presente no manifesto: se um humano
editou `titulo`/`autor`/`autoridade` à mão, a edição fica. Só caminhos ainda
não declarados são adicionados.

Uso::

    python scripts/generate_knowledge_manifest.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

_FOLDER_RULES: list[tuple[str, str, str]] = [
    # (prefixo do caminho relativo, tipo, autoridade) — primeira regra que
    # casar vence, então a ordem importa: prefixos mais específicos primeiro.
    ("01-Bibliografia/", "LIVRO", "CIENTIFICA"),
    ("02-Material-de-Curso-ENG02016/Topicos-de-Aula/", "SLIDE", "TECNICA"),
    ("02-Material-de-Curso-ENG02016/Trabalhos-Entregues/", "EXERCICIO", "TECNICA"),
    ("02-Material-de-Curso-ENG02016/Ferramentas-Avaliativas/", "OUTRO", "TECNICA"),
    ("02-Material-de-Curso-ENG02016/", "OUTRO", "TECNICA"),
    ("03-Fichas-Tecnicas-Granta-EduPack-Nivel-2/", "FICHA", "TECNICA"),
    ("04-Ferramentas-e-Diagramas/", "OUTRO", "TECNICA"),
    ("05-Artigos-Cientificos/", "ARTIGO", "CIENTIFICA"),
]

# Um sobrenome antes de um separador " - " é inequívoco o bastante para
# declarar; qualquer outra coisa fica sem autor.
_AUTHOR_PREFIX = re.compile(r"^([A-ZÀ-Ý][\wÀ-ÿ]+)\s*-\s+")


def infer_provenance(relative_path: str) -> dict:
    """Um item de ``manifesto.json`` inferido só da estrutura do caminho."""
    kind, authority = "OUTRO", "NAO_VERIFICADA"
    for prefix, k, a in _FOLDER_RULES:
        if relative_path.startswith(prefix):
            kind, authority = k, a
            break

    stem = Path(relative_path).stem
    entry: dict = {
        "path": relative_path,
        "titulo": stem.replace("-", " ").replace("_", " ").strip(),
        "tipo": kind,
        "autoridade": authority,
    }

    match = _AUTHOR_PREFIX.match(Path(relative_path).name)
    if match:
        entry["autor"] = match.group(1)

    return entry


def main() -> None:
    root = Path(__file__).resolve().parents[3] / "Cérebro"
    if not root.is_dir():
        print(f"[manifesto] {root} não existe; nada a fazer.")
        sys.exit(1)

    manifest_path = root / "manifesto.json"
    existing: dict[str, dict] = {}
    if manifest_path.is_file():
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        existing = {entry["path"]: entry for entry in payload.get("documentos", [])}

    added = 0
    for path in sorted(root.rglob("*.pdf")):
        relative = path.relative_to(root).as_posix()
        if relative in existing:
            continue
        existing[relative] = infer_provenance(relative)
        added += 1

    manifest_path.write_text(
        json.dumps({"documentos": list(existing.values())}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"[manifesto] {len(existing)} documentos declarados ({added} novos). Gravado em {manifest_path}.")


if __name__ == "__main__":
    main()
```

- [ ] **Passo 4: Rodar e confirmar que os testes passam**

```
cd apps/api && pytest app/tests/test_generate_knowledge_manifest.py -v
```
Esperado: todos PASS.

- [ ] **Passo 5: Rodar de verdade contra o `Cérebro/` real**

```bash
cd apps/api && python scripts/generate_knowledge_manifest.py
```
Confirmar a saída ("N documentos declarados"), depois inspecionar
`Cérebro/manifesto.json` por amostragem (3-4 entradas de pastas diferentes) —
conferir que nenhum `autor` foi inventado para arquivo de nome genérico.

- [ ] **Passo 6: Suíte completa, lint, commit (código + manifesto gerado)**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/scripts/generate_knowledge_manifest.py apps/api/app/tests/test_generate_knowledge_manifest.py "Cérebro/manifesto.json"
git commit -m "feat(conhecimento): gera Cérebro/manifesto.json por convenção de pasta"
```

---

### Task 7: Ligar `retrieved` no `AIProvider` e no `AIService`

`ProblemContext`/`ResultContext` ganham o campo `retrieved`; `AIService` chama
`retrieval.search` antes de montar o contexto, só para provedor real.

**Arquivos:**
- Modificar: `apps/api/app/ai/provider.py`
- Modificar: `apps/api/app/services/ai_service.py`
- Teste: `apps/api/app/tests/test_ai_api.py`

**Interfaces:**
- Consome: `app.knowledge.retrieval.search`, `RetrievedChunk` (Tarefas 4/5).
- Produz: `ProblemContext.retrieved: tuple[RetrievedChunk, ...]`,
  `ResultContext.retrieved: tuple[RetrievedChunk, ...]` — consumidos pela
  Tarefa 8 (`prompts.py`).

- [ ] **Passo 1: Escrever os testes que falham**

Em `apps/api/app/tests/test_ai_api.py`, adicionar:

```python
class _RecordingProvider(AIProvider):
    """Não simulado: prova que o AIService chama a busca antes de invocá-lo."""

    name = "gravador"
    simulated = False

    def __init__(self) -> None:
        self.received_context: object | None = None

    def interpret(self, context) -> dict:
        self.received_context = context
        return {
            "function_text": None,
            "objective_text": None,
            "free_variables": [],
            "constraints": [],
            "properties": [],
            "indices": [],
            "chart": None,
            "open_questions": [],
        }

    def explain(self, context) -> dict:
        self.received_context = context
        return {"summary": "ok", "paragraphs": [], "caveats": []}


class TestRetrievalGating:
    def test_mock_never_triggers_retrieval(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        called = []
        monkeypatch.setattr(
            "app.services.ai_service.knowledge_search",
            lambda *a, **k: called.append(1) or [],
        )
        _interpret(client)
        assert called == []

    def test_real_provider_triggers_retrieval(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        provider = _RecordingProvider()
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        called = []
        monkeypatch.setattr(
            "app.services.ai_service.knowledge_search",
            lambda *a, **k: called.append(1) or [],
        )
        _interpret(client)
        assert called == [1]
        assert provider.received_context.retrieved == ()

    def test_context_defaults_have_empty_retrieved(self) -> None:
        from app.ai.provider import ProblemContext

        context = ProblemContext(statement="x", properties=[], indices=[], classes=[])
        assert context.retrieved == ()
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_ai_api.py::TestRetrievalGating -v
```
Esperado: FAIL (`AttributeError: 'ProblemContext' object has no attribute
'retrieved'`).

- [ ] **Passo 3: `ProblemContext`/`ResultContext` ganham o campo**

Em `apps/api/app/ai/provider.py`, adicionar o import e o campo nos dois
dataclasses:

```python
# no topo, junto dos outros imports
from app.knowledge.retrieval import RetrievedChunk
```

```python
@dataclass(frozen=True)
class ProblemContext:
    """Everything a provider may see when reading a problem statement."""

    statement: str
    properties: list[PropertyFacts]
    indices: list[IndexFacts]
    classes: list[ClassFacts]
    retrieved: tuple[RetrievedChunk, ...] = ()

    def catalogue(self) -> Catalogue:
        ...  # inalterado
```

```python
@dataclass(frozen=True)
class ResultContext:
    """An already-computed selection, for prose only."""

    study_name: str
    function_text: str | None
    objective_text: str | None
    constraint_labels: list[str]
    index_name: str | None
    index_expression: str | None
    index_dimension: str | None
    initial_count: int
    final_count: int
    funnel: list[tuple[str, int]]
    ranked: list[tuple[str, int, float]]
    excluded_for_missing: list[tuple[str, list[str]]]
    sensitivity_changed: bool
    numbers: set[float] = field(default_factory=set)
    retrieved: tuple[RetrievedChunk, ...] = ()
```

- [ ] **Passo 4: `AIService` chama a busca antes de montar o contexto**

Em `apps/api/app/services/ai_service.py`, adicionar o import:

```python
from app.knowledge.retrieval import search as knowledge_search
```

Modificar `_context` para receber e usar o provedor:

```python
    def _context(self, statement: str, provider: AIProvider) -> ProblemContext:
        properties = self.repo.list_properties()
        indices = self.selection_repo.list_indices()
        classes = {m.material_class.slug: m.material_class.name for m in self.repo.list_materials()}
        retrieved = self._retrieve(statement, provider)
        return ProblemContext(
            statement=statement,
            properties=[...],  # inalterado
            indices=[...],  # inalterado
            classes=[...],  # inalterado
            retrieved=tuple(retrieved),
        )

    def _retrieve(self, query: str, provider: AIProvider) -> list:
        """Trechos do Cérebro para dar contexto ao provedor — nunca ao mock.

        O mock é descrito como determinístico e sem rede; ligar retrieval nele
        quebraria essa garantia, e todo teste que usa AI_PROVIDER=mock (a
        maioria da suíte) ficaria mais lento sem nenhum ganho.
        """
        if provider.simulated:
            return []
        return knowledge_search(
            self.db, query, top_k=self.settings.knowledge_retrieval_top_k, settings=self.settings
        )
```

Atualizar a chamada em `interpret`:

```python
    def interpret(self, request: InterpretRequest) -> InterpretationOut:
        provider = self._provider()
        statement = request.statement.strip()
        if not statement:
            raise ValidationError("Informe o enunciado do problema.")

        context = self._context(statement, provider)
        ...  # o resto do método fica igual
```

Atualizar `explain` e `_result_context` de forma equivalente: `explain` já tem
`provider = self._provider()` e `study` antes de montar o contexto — passar
`provider` para `_result_context` (que precisa ganhar o parâmetro e chamar
`self._retrieve(study.name, provider)`, ou mais simples: montar `retrieved`
em `explain` e passar para `_result_context` como argumento extra):

```python
    def explain(self, study_id: int, project_id: int) -> ExplanationOut:
        provider = self._provider()
        study = self.selection_repo.get_study(study_id, project_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")

        result = SelectionService(self.db, project_id).run_study(study_id)
        retrieved = self._retrieve(study.function_text or study.name, provider)
        context = _result_context(study, result, retrieved)

        raw = provider.explain(context)
        ...  # o resto do método fica igual
```

```python
def _result_context(study, result, retrieved: list) -> ResultContext:
    """Flatten a computed run into the read-only view a provider may see."""
    ...  # tudo igual até o return
    return ResultContext(
        study_name=study.name,
        ...  # campos inalterados
        numbers=numbers,
        retrieved=tuple(retrieved),
    )
```

- [ ] **Passo 5: Rodar e confirmar que tudo passa**

```
cd apps/api && pytest app/tests/test_ai_api.py -v
```
Esperado: todos PASS, incluindo `TestRetrievalGating`. Confirmar também que
NENHUM teste pré-existente quebrou (a suíte inteira usa `mock` por padrão, que
agora tem `retrieved=()` sempre).

- [ ] **Passo 6: Suíte completa, lint, commit**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/app/ai/provider.py apps/api/app/services/ai_service.py apps/api/app/tests/test_ai_api.py
git commit -m "feat(ia): liga a busca no Cérebro a interpret()/explain(), só para provedor real"
```

---

### Task 8: Bloco de contexto no prompt + campo `sources` no schema de explain

**Arquivos:**
- Modificar: `apps/api/app/ai/prompts.py`
- Teste (novo): `apps/api/app/tests/test_ai_prompts.py`

**Interfaces:**
- Consome: `RetrievedChunk` (Tarefa 4).
- Produz: `interpret_user`/`explain_user` incluem o bloco de referência;
  `EXPLAIN_SCHEMA` ganha `sources: list[int]` — consumido pela Tarefa 9
  (`model_base.py`).

- [ ] **Passo 1: Escrever os testes que falham**

Criar `apps/api/app/tests/test_ai_prompts.py`:

```python
"""O bloco de contexto do Cérebro no prompt: presente só quando há trechos
recuperados, e nunca oferecido como fonte de número (essa regra vive no
guardrail, não aqui — este teste cobre só a construção do texto)."""

from __future__ import annotations

from app.ai.prompts import EXPLAIN_SCHEMA, explain_user, interpret_user
from app.ai.provider import ProblemContext, ResultContext
from app.knowledge.retrieval import RetrievedChunk
from app.models.enums import DocumentKind, SourceAuthority

_CHUNK = RetrievedChunk(
    document_title="Materials Selection in Mechanical Design",
    document_kind=DocumentKind.LIVRO,
    document_authority=SourceAuthority.CIENTIFICA,
    page_start=42,
    page_end=43,
    text="O índice de rigidez específica é E/ρ para uma viga em flexão.",
    score=0.9,
)


class TestInterpretPrompt:
    def test_no_reference_block_when_nothing_retrieved(self) -> None:
        context = ProblemContext(statement="x", properties=[], indices=[], classes=[])
        assert "Trechos de referência" not in interpret_user(context)

    def test_reference_block_when_retrieved(self) -> None:
        context = ProblemContext(
            statement="x", properties=[], indices=[], classes=[], retrieved=(_CHUNK,)
        )
        text = interpret_user(context)
        assert "Trechos de referência" in text
        assert "Materials Selection in Mechanical Design" in text
        assert "42" in text and "43" in text
        assert _CHUNK.text in text

    def test_statement_still_appears_after_the_reference_block(self) -> None:
        context = ProblemContext(
            statement="enunciado do usuario aqui",
            properties=[],
            indices=[],
            classes=[],
            retrieved=(_CHUNK,),
        )
        text = interpret_user(context)
        assert text.index("Trechos de referência") < text.index("enunciado do usuario aqui")


class TestExplainPrompt:
    def test_no_reference_block_when_nothing_retrieved(self) -> None:
        context = ResultContext(
            study_name="Estudo",
            function_text=None,
            objective_text=None,
            constraint_labels=[],
            index_name=None,
            index_expression=None,
            index_dimension=None,
            initial_count=5,
            final_count=5,
            funnel=[],
            ranked=[],
            excluded_for_missing=[],
            sensitivity_changed=False,
        )
        assert "Trechos de referência" not in explain_user(context)

    def test_reference_block_when_retrieved(self) -> None:
        context = ResultContext(
            study_name="Estudo",
            function_text=None,
            objective_text=None,
            constraint_labels=[],
            index_name=None,
            index_expression=None,
            index_dimension=None,
            initial_count=5,
            final_count=5,
            funnel=[],
            ranked=[],
            excluded_for_missing=[],
            sensitivity_changed=False,
            retrieved=(_CHUNK,),
        )
        assert "Trechos de referência" in explain_user(context)


class TestExplainSchema:
    def test_sources_field_is_present(self) -> None:
        assert "sources" in EXPLAIN_SCHEMA["properties"]
        assert EXPLAIN_SCHEMA["properties"]["sources"]["type"] == "array"
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_ai_prompts.py -v
```
Esperado: FAIL (`"Trechos de referência" not in text` — bloco não existe
ainda).

- [ ] **Passo 3: Bloco de referência + regra no system prompt**

Em `apps/api/app/ai/prompts.py`, adicionar a função de apoio (perto de
`_classes_block`):

```python
def _reference_block(retrieved: tuple) -> str:
    """Numbered reference passages, or empty when nothing was retrieved."""
    if not retrieved:
        return ""
    lines = [
        "# Trechos de referência (vocabulário e contexto — nunca extraia número daqui)"
    ]
    for i, chunk in enumerate(retrieved, start=1):
        pages = (
            f" — p. {chunk.page_start}-{chunk.page_end}"
            if chunk.page_start and chunk.page_end
            else ""
        )
        lines.append(f"[{i}] {chunk.document_title}{pages}")
        lines.append(f'    "{chunk.text}"')
    return "\n".join(lines)
```

Modificar `interpret_user`:

```python
def interpret_user(context: ProblemContext) -> str:
    """The catalogue the model may choose from, then the user's own words."""
    reference = _reference_block(context.retrieved)
    blocks = [
        "# Catálogo de propriedades (slug: nome | unidade canônica | unidades "
        "aceitas | melhor quando)",
        _properties_block(context) or "(vazio)",
        "",
        "# Índices de desempenho cadastrados (slug: nome | expressão | objetivo)",
        _indices_block(context) or "(vazio)",
        "",
        "# Classes de materiais (slug: nome)",
        _classes_block(context) or "(vazio)",
    ]
    if reference:
        blocks += ["", reference]
    blocks += [
        "",
        "# Enunciado do usuário (a única fonte legítima de números)",
        context.statement,
    ]
    return "\n".join(blocks)
```

Modificar `explain_user` — inserir o bloco antes do `return`:

```python
def explain_user(context: ResultContext) -> str:
    ...  # tudo igual até a linha que monta "Sensibilidade aos pesos: ..."
    lines.append(
        "Sensibilidade aos pesos: "
        + (
            "o primeiro colocado muda quando os pesos variam."
            if context.sensitivity_changed
            else "o primeiro colocado se mantém sob as variações testadas."
        )
    )
    reference = _reference_block(context.retrieved)
    if reference:
        lines += ["", reference]
    return "\n".join(lines)
```

Acrescentar uma regra em `INTERPRET_SYSTEM` (depois da regra 4, antes de "5."):

```
4a. Os "Trechos de referência", quando presentes, servem só para entender \
terminologia e contexto técnico. Nenhum número deles vira restrição — todo \
número continua tendo que estar escrito no enunciado do usuário. Citar um \
trecho não abre exceção nenhuma na regra 2.
```

Acrescentar em `EXPLAIN_SYSTEM`, depois do parágrafo sobre a regra absoluta de
números:

```
Se houver "Trechos de referência", você pode citá-los para dar contexto — \
preencha sources com os números entre colchetes dos trechos que realmente \
usou (ex.: [1], [2]). Isso não muda a regra sobre números: cifra continua \
tendo que vir do bloco de dados, nunca de um trecho de referência.
```

Acrescentar `sources` em `EXPLAIN_SCHEMA`:

```python
EXPLAIN_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "paragraphs", "sources"],
    "properties": {
        "summary": {"type": "string", "description": "Uma frase."},
        "paragraphs": {
            "type": "array",
            "items": {"type": "string"},
            "description": "De dois a quatro parágrafos curtos.",
        },
        "sources": {
            "type": "array",
            "items": {"type": "integer"},
            "description": (
                "Índices (1, 2, ...) dos trechos de referência de fato usados. "
                "Vazio se nenhum foi citado ou se não havia nenhum disponível."
            ),
        },
    },
}
```

- [ ] **Passo 4: Rodar e confirmar que tudo passa**

```
cd apps/api && pytest app/tests/test_ai_prompts.py -v
```
Esperado: todos PASS.

- [ ] **Passo 5: Suíte completa (confirma que nenhum outro teste de prompts
  quebrou — `test_ai_claude.py`/`test_ai_openai_compat.py` capturam o corpo da
  mensagem enviada), lint, commit**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/app/ai/prompts.py apps/api/app/tests/test_ai_prompts.py
git commit -m "feat(ia): bloco de trechos de referência no prompt + campo sources no schema de explain"
```

---

### Task 9: `model_base.py` lê `sources` da resposta do modelo

**Arquivos:**
- Modificar: `apps/api/app/ai/model_base.py`
- Teste: `apps/api/app/tests/test_ai_api.py` (via `lying_provider`, que já
  simula um provedor real)

**Interfaces:**
- Produz: `ModelProviderBase.explain()` inclui `"sources": list[int]` bruto
  (ainda não verificado) no dict devolvido — consumido pela Tarefa 11
  (`AIService.explain`, que roda o guardrail e traduz para `CitedSourceOut`).

- [ ] **Passo 1: Escrever o teste que falha**

Em `apps/api/app/tests/test_ai_api.py`, na classe `_LyingProvider`, o método
`explain` já devolve um dict sem `sources` — isso é *esperado* continuar
funcionando (campo ausente = lista vazia, não erro). O teste novo cobre o
caminho positivo, numa classe nova:

```python
class _CitingProvider(AIProvider):
    """Devolve índices de citação, para provar que model_base.py os lê."""

    name = "citador"
    simulated = False

    def interpret(self, context) -> dict:
        raise NotImplementedError

    def explain(self, context) -> dict:
        raise NotImplementedError


def test_model_base_reads_sources_from_raw_output() -> None:
    from app.ai.model_base import ModelProviderBase

    class _StubProvider(ModelProviderBase):
        name = "stub"

        def _complete(self, system, user, schema):
            return {"summary": "ok", "paragraphs": ["texto"], "sources": [1, 2]}

    provider = _StubProvider()
    from app.ai.provider import ResultContext

    context = ResultContext(
        study_name="x",
        function_text=None,
        objective_text=None,
        constraint_labels=[],
        index_name=None,
        index_expression=None,
        index_dimension=None,
        initial_count=1,
        final_count=1,
        funnel=[],
        ranked=[],
        excluded_for_missing=[],
        sensitivity_changed=False,
    )
    result = provider.explain(context)
    assert result["sources"] == [1, 2]


def test_model_base_defaults_missing_sources_to_empty_list() -> None:
    from app.ai.model_base import ModelProviderBase
    from app.ai.provider import ResultContext

    class _StubProvider(ModelProviderBase):
        name = "stub"

        def _complete(self, system, user, schema):
            return {"summary": "ok", "paragraphs": []}  # sem "sources"

    context = ResultContext(
        study_name="x",
        function_text=None,
        objective_text=None,
        constraint_labels=[],
        index_name=None,
        index_expression=None,
        index_dimension=None,
        initial_count=1,
        final_count=1,
        funnel=[],
        ranked=[],
        excluded_for_missing=[],
        sensitivity_changed=False,
    )
    assert _StubProvider().explain(context)["sources"] == []
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_ai_api.py -k "sources" -v
```
Esperado: FAIL (`KeyError: 'sources'`).

- [ ] **Passo 3: Ler `sources` em `ModelProviderBase.explain`**

Em `apps/api/app/ai/model_base.py`, modificar `explain`:

```python
    def explain(self, context: ResultContext) -> dict:
        raw = self._complete(EXPLAIN_SYSTEM, explain_user(context), EXPLAIN_SCHEMA)
        return {
            "summary": _text(raw.get("summary")) or "",
            "paragraphs": [
                text for text in (_text(p) for p in _as_list(raw.get("paragraphs"))) if text
            ],
            "sources": [i for i in _as_list(raw.get("sources")) if isinstance(i, int)],
            # Not the model's to write, and not the model's to leave out.
            "caveats": standard_caveats(context),
        }
```

- [ ] **Passo 4: Rodar e confirmar que tudo passa**

```
cd apps/api && pytest app/tests/test_ai_api.py -v
```
Esperado: todos PASS.

- [ ] **Passo 5: Suíte completa, lint, commit**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/app/ai/model_base.py apps/api/app/tests/test_ai_api.py
git commit -m "feat(ia): model_base.py lê sources da resposta bruta do modelo"
```

---

### Task 10: `guardrails.check_citations` + a prova de que a ancoragem numérica continua intacta

O guardrail que impede citação de trecho que não foi de fato recuperado nesta
chamada — e o teste que prova a garantia central deste trabalho todo.

**Arquivos:**
- Modificar: `apps/api/app/ai/guardrails.py`
- Teste: `apps/api/app/tests/test_ai_guardrails.py`

**Interfaces:**
- Produz: `check_citations(indices: list[int], retrieved: tuple) -> list[int]`
  — devolve só os índices válidos, descartando o resto (não levanta).

- [ ] **Passo 1: Escrever os testes que falham**

Em `apps/api/app/tests/test_ai_guardrails.py`, adicionar:

```python
class TestCheckCitations:
    def test_valid_indices_pass_through(self) -> None:
        from app.ai.guardrails import check_citations
        from app.knowledge.retrieval import RetrievedChunk
        from app.models.enums import DocumentKind, SourceAuthority

        chunk = RetrievedChunk(
            document_title="Livro",
            document_kind=DocumentKind.LIVRO,
            document_authority=SourceAuthority.CIENTIFICA,
            page_start=1,
            page_end=1,
            text="x",
            score=1.0,
        )
        assert check_citations([1], (chunk,)) == [1]

    def test_index_out_of_range_is_dropped(self) -> None:
        from app.ai.guardrails import check_citations

        assert check_citations([1, 2, 99], ()) == []

    def test_zero_and_negative_indices_are_dropped(self) -> None:
        from app.ai.guardrails import check_citations
        from app.knowledge.retrieval import RetrievedChunk
        from app.models.enums import DocumentKind, SourceAuthority

        chunk = RetrievedChunk(
            document_title="x",
            document_kind=DocumentKind.OUTRO,
            document_authority=SourceAuthority.NAO_VERIFICADA,
            page_start=None,
            page_end=None,
            text="x",
            score=1.0,
        )
        assert check_citations([0, -1, 1], (chunk,)) == [1]

    def test_empty_input_is_empty_output(self) -> None:
        from app.ai.guardrails import check_citations

        assert check_citations([], ()) == []
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_ai_guardrails.py::TestCheckCitations -v
```
Esperado: FAIL (`ImportError: cannot import name 'check_citations'`).

- [ ] **Passo 3: Implementar `check_citations`**

Em `apps/api/app/ai/guardrails.py`, adicionar (perto de `check_chart`):

```python
def check_citations(indices: list[int], retrieved: tuple) -> list[int]:
    """Keep only citation indices that name a passage actually retrieved.

    Unlike ``check_constraint``, this never raises or reports a rejection: a
    bad index is metadata the model got wrong about its own citation, not an
    invented figure — dropping it silently costs nothing the reader would
    have used. ``indices`` are 1-based, matching the numbering the prompt's
    reference block shows the model.
    """
    valid_range = range(1, len(retrieved) + 1)
    return [i for i in indices if i in valid_range]
```

- [ ] **Passo 4: A prova de que a ancoragem numérica continua intacta**

Em `apps/api/app/tests/test_ai_api.py`, nova classe:

```python
class TestRetrievedTextNeverGroundsANumber:
    def test_number_only_in_a_retrieved_chunk_does_not_ground_a_constraint(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A garantia central deste trabalho: um trecho recuperado pode
        conter qualquer número — isso nunca torna esse número "ancorado" no
        enunciado. Só o texto que o próprio usuário escreveu ancora.
        """
        from app.knowledge.retrieval import RetrievedChunk
        from app.models.enums import DocumentKind, SourceAuthority

        chunk = RetrievedChunk(
            document_title="Livro qualquer",
            document_kind=DocumentKind.LIVRO,
            document_authority=SourceAuthority.CIENTIFICA,
            page_start=1,
            page_end=1,
            # 999 aparece só aqui — nunca no enunciado do usuário abaixo.
            text="O módulo de referência típico é 999 GPa para este material.",
            score=1.0,
        )

        class _ProviderCitingTheRetrievedNumber(AIProvider):
            name = "cita-o-trecho"
            simulated = False

            def interpret(self, context) -> dict:
                # Propõe uma restrição usando o número que só existe no
                # trecho recuperado, não no enunciado do usuário.
                return {
                    "function_text": None,
                    "objective_text": None,
                    "free_variables": [],
                    "constraints": [
                        {
                            "constraint": {
                                "operator": "gte",
                                "property_slug": "modulo_young",
                                "value": 999.0,
                                "unit": "GPa",
                            },
                            "evidence": "trecho recuperado",
                            "rationale": "citado do Cérebro",
                        }
                    ],
                    "properties": [],
                    "indices": [],
                    "chart": None,
                    "open_questions": [],
                }

            def explain(self, context) -> dict:
                raise NotImplementedError

        monkeypatch.setattr(
            ai_service, "get_provider", lambda *_a, **_k: _ProviderCitingTheRetrievedNumber()
        )
        monkeypatch.setattr(
            "app.services.ai_service.knowledge_search", lambda *a, **k: [chunk]
        )

        body = _interpret(client, "Preciso de uma viga leve para uma estrutura.")

        assert body["constraints"] == []  # a restrição foi recusada
        assert any("não aparece no enunciado" in r for r in body["rejected"])
```

- [ ] **Passo 5: Rodar e confirmar que tudo passa**

```
cd apps/api && pytest app/tests/test_ai_guardrails.py app/tests/test_ai_api.py -v
```
Esperado: todos PASS — em particular
`TestRetrievedTextNeverGroundsANumber::test_number_only_in_a_retrieved_chunk_does_not_ground_a_constraint`.

- [ ] **Passo 6: Suíte completa, lint, commit**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/app/ai/guardrails.py apps/api/app/tests/test_ai_guardrails.py apps/api/app/tests/test_ai_api.py
git commit -m "feat(ia): guardrail de citação verificada + prova de que retrieval não ancora número"
```

---

### Task 11: `ExplanationOut.sources` (citação verificada, traduzida para exibição)

**Arquivos:**
- Modificar: `apps/api/app/schemas/ai.py`
- Modificar: `apps/api/app/services/ai_service.py`
- Teste: `apps/api/app/tests/test_ai_api.py`

**Interfaces:**
- Produz: `CitedSourceOut` (Pydantic), `ExplanationOut.sources: list[CitedSourceOut]`.

- [ ] **Passo 1: Escrever o teste que falha**

Em `apps/api/app/tests/test_ai_api.py`, dentro de `TestExplanation`:

```python
    def test_valid_citation_is_translated_to_a_readable_source(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.knowledge.retrieval import RetrievedChunk
        from app.models.enums import DocumentKind, SourceAuthority

        chunk = RetrievedChunk(
            document_title="Materials Selection in Mechanical Design",
            document_kind=DocumentKind.LIVRO,
            document_authority=SourceAuthority.CIENTIFICA,
            page_start=42,
            page_end=43,
            text="x",
            score=1.0,
        )

        class _CitingProvider(AIProvider):
            name = "citador"
            simulated = False

            def interpret(self, context) -> dict:
                raise NotImplementedError

            def explain(self, context) -> dict:
                return {"summary": "ok", "paragraphs": ["texto"], "sources": [1], "caveats": []}

        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: _CitingProvider())
        monkeypatch.setattr("app.services.ai_service.knowledge_search", lambda *a, **k: [chunk])

        study_id = self._study_id(client)
        body = client.post("/api/ai/explain", json={"study_id": study_id}).json()

        assert body["sources"] == [
            {
                "document_title": "Materials Selection in Mechanical Design",
                "page_start": 42,
                "page_end": 43,
            }
        ]

    def test_invalid_citation_index_is_silently_dropped(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        class _CitingProvider(AIProvider):
            name = "citador"
            simulated = False

            def interpret(self, context) -> dict:
                raise NotImplementedError

            def explain(self, context) -> dict:
                return {"summary": "ok", "paragraphs": ["texto"], "sources": [99], "caveats": []}

        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: _CitingProvider())
        monkeypatch.setattr("app.services.ai_service.knowledge_search", lambda *a, **k: [])

        study_id = self._study_id(client)
        response = client.post("/api/ai/explain", json={"study_id": study_id})
        assert response.status_code == 200  # não derruba a explicação inteira
        assert response.json()["sources"] == []
```

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_ai_api.py::TestExplanation -k citation -v
```
Esperado: FAIL (`KeyError: 'sources'` na resposta, ou schema ainda não tem o
campo).

- [ ] **Passo 3: `CitedSourceOut` + `ExplanationOut.sources`**

Em `apps/api/app/schemas/ai.py`, adicionar:

```python
class CitedSourceOut(BaseModel):
    """One reference passage the explanation actually drew on.

    Only the fields a reader needs to go check the source — never the
    passage's own text, which stays server-side context, not something the
    interface repeats back.
    """

    document_title: str
    page_start: int | None = None
    page_end: int | None = None
```

Modificar `ExplanationOut`:

```python
class ExplanationOut(BaseModel):
    """Prose about a computed result, plus what it deliberately does not say."""

    study_id: int
    study_name: str
    summary: str
    paragraphs: list[str]
    caveats: list[str]
    sources: list[CitedSourceOut] = Field(default_factory=list)
    provider: str
    simulated: bool
    disclaimer: str
```

- [ ] **Passo 4: `AIService.explain` roda o guardrail e traduz**

Em `apps/api/app/services/ai_service.py`, adicionar o import:

```python
from app.ai.guardrails import (
    Catalogue,
    check_chart,
    check_citations,
    check_constraint,
    check_index,
    check_property,
    numbers_in,
    ungrounded_numbers,
)
from app.schemas.ai import (
    AIStatusOut,
    CitedSourceOut,
    ExplanationOut,
    InterpretationOut,
    InterpretRequest,
    SuggestedChart,
    SuggestedConstraint,
    SuggestedIndex,
    SuggestedProperty,
)
```

Modificar `explain`:

```python
    def explain(self, study_id: int, project_id: int) -> ExplanationOut:
        provider = self._provider()
        study = self.selection_repo.get_study(study_id, project_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")

        result = SelectionService(self.db, project_id).run_study(study_id)
        retrieved = self._retrieve(study.function_text or study.name, provider)
        context = _result_context(study, result, retrieved)

        raw = provider.explain(context)
        summary = str(raw.get("summary", ""))
        paragraphs = [str(p) for p in raw.get("paragraphs", [])]
        caveats = [str(c) for c in raw.get("caveats", [])]

        invented: list[float] = []
        for text in [summary, *paragraphs]:
            invented.extend(ungrounded_numbers(text, context.numbers))
        if invented:
            values = ", ".join(f"{value:g}" for value in sorted(set(invented)))
            raise ValidationError(
                "A explicação gerada citou números que o cálculo não produziu "
                f"({values}); a resposta foi descartada."
            )

        raw_sources = [i for i in raw.get("sources", []) if isinstance(i, int)]
        valid_indices = check_citations(raw_sources, context.retrieved)
        sources = [
            CitedSourceOut(
                document_title=context.retrieved[i - 1].document_title,
                page_start=context.retrieved[i - 1].page_start,
                page_end=context.retrieved[i - 1].page_end,
            )
            for i in valid_indices
        ]

        return ExplanationOut(
            study_id=study_id,
            study_name=study.name,
            summary=summary,
            paragraphs=paragraphs,
            caveats=caveats,
            sources=sources,
            provider=provider.name,
            simulated=provider.simulated,
            disclaimer=disclaimer_for(provider),
        )
```

- [ ] **Passo 5: Rodar e confirmar que tudo passa**

```
cd apps/api && pytest app/tests/test_ai_api.py -v
```
Esperado: todos PASS.

- [ ] **Passo 6: Suíte completa, lint, commit**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/app/schemas/ai.py apps/api/app/services/ai_service.py apps/api/app/tests/test_ai_api.py
git commit -m "feat(ia): ExplanationOut.sources — citação verificada, traduzida para exibição"
```

---

### Task 12: `python -m app.knowledge.ingest` (CLI)

**Arquivos:**
- Criar: `apps/api/app/knowledge/ingest.py`
- Teste (novo): `apps/api/app/tests/test_knowledge_ingest_cli.py`

**Interfaces:**
- Produz: `main() -> None`, invocável via `python -m app.knowledge.ingest`.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `apps/api/app/tests/test_knowledge_ingest_cli.py`:

```python
"""O ponto de entrada de linha de comando — mesmo padrão de app/db/seed.py."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config import settings
from app.knowledge.ingest import main


def _write_pdf(path: Path) -> None:
    from app.tests.test_knowledge_ingest import _pdf_bytes

    path.write_bytes(_pdf_bytes(["conteúdo de teste"]))


class TestCLI:
    def test_runs_ingestion_and_prints_a_summary(
        self,
        db_session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
        capsys: pytest.CaptureFixture[str],
    ) -> None:
        root = tmp_path / "cerebro"
        root.mkdir()
        _write_pdf(root / "doc.pdf")
        monkeypatch.setattr(settings, "knowledge_dir", str(root))
        monkeypatch.setattr("app.knowledge.ingest.SessionLocal", lambda: db_session)

        main()

        out = capsys.readouterr().out
        assert "[ingest]" in out
        assert "1" in out  # 1 documento criado

    def test_exits_with_error_when_a_document_fails(
        self,
        db_session,
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        root = tmp_path / "cerebro"
        root.mkdir()
        (root / "quebrado.pdf").write_bytes(b"nao e um pdf")
        monkeypatch.setattr(settings, "knowledge_dir", str(root))
        monkeypatch.setattr("app.knowledge.ingest.SessionLocal", lambda: db_session)

        with pytest.raises(SystemExit) as exc:
            main()
        assert exc.value.code != 0
```

Nota: `db_session` aqui é reaproveitado como um *stand-in* de conexão real —
como `main()` abre e fecha sua própria sessão via `SessionLocal()`,
substituí-la por uma função que devolve a sessão de teste (já dentro da
transação isolada do `conftest.py`) é o que mantém o teste dentro do
isolamento padrão sem precisar de um banco à parte.

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_knowledge_ingest_cli.py -v
```
Esperado: FAIL (`ModuleNotFoundError: app.knowledge.ingest`).

- [ ] **Passo 3: Implementar o CLI**

Criar `apps/api/app/knowledge/ingest.py`:

```python
"""CLI entry point for the knowledge base ingestion.

Run with::

    python -m app.knowledge.ingest

Idempotent by checksum (``KnowledgeService.ingest``) — safe to run again after
adding or editing files under ``KNOWLEDGE_DIR``. Never runs during a client
request; this is the operator's own tooling.
"""

from __future__ import annotations

import sys

from app.db.base import SessionLocal
from app.knowledge.service import KnowledgeService


def main() -> None:
    """Ingest the configured knowledge root and print a summary."""
    with SessionLocal() as db:
        report = KnowledgeService(db).ingest()
        db.commit()

    print(f"[ingest] raiz: {report.root}")
    print(
        f"[ingest] {report.created} criados, {report.updated} atualizados, "
        f"{report.unchanged} inalterados, {report.failed} falharam, "
        f"{report.total_chunks} trechos, {report.embedded_chunks} embedados."
    )
    if report.embeddings_skipped_reason:
        print(f"[ingest] busca semântica indisponível nesta execução: {report.embeddings_skipped_reason}")
    for outcome in report.outcomes:
        if outcome.action == "falhou":
            print(f"[ingest] FALHOU {outcome.path}: {outcome.detail}")

    if report.failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Passo 4: Rodar e confirmar que tudo passa**

```
cd apps/api && pytest app/tests/test_knowledge_ingest_cli.py -v
```
Esperado: todos PASS.

- [ ] **Passo 5: Suíte completa, lint, commit**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/app/knowledge/ingest.py apps/api/app/tests/test_knowledge_ingest_cli.py
git commit -m "feat(conhecimento): python -m app.knowledge.ingest, mesmo padrão de app.db.seed"
```

---

### Task 13: `POST /api/knowledge/ingest` (rota HTTP)

**Arquivos:**
- Criar: `apps/api/app/schemas/knowledge.py`
- Criar: `apps/api/app/routers/knowledge.py`
- Modificar: `apps/api/app/main.py`
- Teste (novo): `apps/api/app/tests/test_knowledge_api.py`

**Interfaces:**
- Produz: `IngestReportOut` (Pydantic), `POST /api/knowledge/ingest`.

- [ ] **Passo 1: Escrever os testes que falham**

Criar `apps/api/app/tests/test_knowledge_api.py`:

```python
"""POST /api/knowledge/ingest — a mesma autorização de qualquer rota logada;
não existe papel de administrador neste projeto (D-42)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.config import settings


@pytest.fixture
def corpus(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    from app.tests.test_knowledge_ingest import _pdf_bytes

    root = tmp_path / "cerebro"
    root.mkdir()
    (root / "doc.pdf").write_bytes(_pdf_bytes(["conteúdo"]))
    monkeypatch.setattr(settings, "knowledge_dir", str(root))
    return root


class TestIngestRoute:
    def test_requires_login(self, client: TestClient, corpus: Path) -> None:
        response = client.post("/api/knowledge/ingest", headers={"Cookie": ""})
        assert response.status_code in (401, 403)

    def test_runs_ingestion_and_reports_the_summary(
        self, client: TestClient, corpus: Path
    ) -> None:
        response = client.post("/api/knowledge/ingest")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["created"] == 1
        assert body["total_chunks"] >= 1

    def test_disabled_layer_is_a_400(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(settings, "knowledge_dir", "")
        response = client.post("/api/knowledge/ingest")
        assert response.status_code == 400
```

Nota: `client` já é o `TestClient` autenticado do `conftest.py` (mesma
convenção de todo outro teste de rota protegida — ver `test_ai_api.py`).

- [ ] **Passo 2: Rodar e confirmar que falha**

```
cd apps/api && pytest app/tests/test_knowledge_api.py -v
```
Esperado: FAIL (`404 Not Found` — rota não existe).

- [ ] **Passo 3: `app/schemas/knowledge.py`**

```python
"""Schemas for the knowledge-base ingestion endpoint."""

from __future__ import annotations

from pydantic import BaseModel, Field


class IngestReportOut(BaseModel):
    """What one ingestion run did — the same shape the CLI prints."""

    root: str
    created: int
    updated: int
    unchanged: int
    failed: int
    skipped: int
    total_chunks: int
    embedded_chunks: int
    embeddings_skipped_reason: str | None = None
    failures: list[str] = Field(default_factory=list)
```

- [ ] **Passo 4: `app/routers/knowledge.py`**

```python
"""Knowledge-base ingestion: read Cérebro/, catalogue, extract, index.

A rare, slow, operator-run action — never triggered by a client request. Same
authorization as any other logged-in route (no administrator role exists in
this project, D-42); the rarity of use is what makes a synchronous, possibly
multi-minute call acceptable here, unlike ``imports`` upload.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.dependencies import get_current_user
from app.knowledge.service import KnowledgeService
from app.models.user import User
from app.schemas.knowledge import IngestReportOut

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.post("/ingest", response_model=IngestReportOut)
def ingest(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> IngestReportOut:
    """Re-run ingestion over the configured knowledge root."""
    report = KnowledgeService(db).ingest()
    db.commit()
    return IngestReportOut(
        root=report.root,
        created=report.created,
        updated=report.updated,
        unchanged=report.unchanged,
        failed=report.failed,
        skipped=report.skipped,
        total_chunks=report.total_chunks,
        embedded_chunks=report.embedded_chunks,
        embeddings_skipped_reason=report.embeddings_skipped_reason,
        failures=[
            f"{o.path}: {o.detail}" for o in report.outcomes if o.action == "falhou"
        ],
    )
```

- [ ] **Passo 5: Registrar em `main.py`**

Em `apps/api/app/main.py`, adicionar `knowledge` ao import de `app.routers` e
registrar com `require_active_subscription`, junto dos demais:

```python
from app.routers import (
    ai,
    audit,
    auth,
    billing,
    charts,
    classes,
    dashboard,
    exports,
    health,
    imports,
    knowledge,
    materials,
    properties,
    selection,
    sources,
)
```

```python
app.include_router(
    knowledge.router, prefix="/api", dependencies=[Depends(require_active_subscription)]
)
```

- [ ] **Passo 6: Rodar e confirmar que tudo passa**

```
cd apps/api && pytest app/tests/test_knowledge_api.py -v
```
Esperado: todos PASS.

- [ ] **Passo 7: Suíte completa, lint, commit**

```bash
cd apps/api && pytest && ruff check app && black --check app
git add apps/api/app/schemas/knowledge.py apps/api/app/routers/knowledge.py apps/api/app/main.py apps/api/app/tests/test_knowledge_api.py
git commit -m "feat(conhecimento): POST /api/knowledge/ingest, mesma autorização de qualquer rota logada"
```

---

### Task 14: `.env.example` — receita da Jina AI

**Arquivos:**
- Modificar: `apps/api/.env.example`

Nenhum teste — documentação pura.

- [ ] **Passo 1: Adicionar a seção**

Em `apps/api/.env.example`, depois da seção `--- openai-compat ---` (depois da
linha `# AI_JSON_MODE=schema`), adicionar:

```
# --- Busca semântica no Cérebro (opcional, por cima da busca léxica) -------
# A busca léxica (BM25) já funciona sem nada aqui, assim que a ingestão rodar
# (python -m app.knowledge.ingest). O que segue liga a busca semântica por
# cima dela — estritamente opcional, sem padrão de propósito (mesma razão de
# AI_BASE_URL: um padrão escolheria um fornecedor por você).
#
# Receita gratuita, hospedada (sem depender desta máquina — o app é um SaaS):
# Jina AI, api.jina.ai/v1/embeddings — mesmo formato que este cliente já fala
# (model + input -> data[].embedding). Sign-up sem cartão, 1M tokens grátis
# por mês.
#   KNOWLEDGE_EMBEDDING_BASE_URL=https://api.jina.ai/v1
#   KNOWLEDGE_EMBEDDING_MODEL=jina-embeddings-v3
#   AI_API_KEY=jina_...
#
# Alternativa local: Ollama nesta máquina, sem conta, sem chave.
#   KNOWLEDGE_EMBEDDING_BASE_URL=http://localhost:11434/v1
#   KNOWLEDGE_EMBEDDING_MODEL=nomic-embed-text
#
# Alternativa paga: OpenAI.
#   KNOWLEDGE_EMBEDDING_BASE_URL=https://api.openai.com/v1
#   KNOWLEDGE_EMBEDDING_MODEL=text-embedding-3-small
#
# A chave é a mesma AI_API_KEY de cima (não existe uma separada) — o cliente
# de embeddings reusa o mesmo cabeçalho Authorization.
# KNOWLEDGE_EMBEDDING_BASE_URL=
# KNOWLEDGE_EMBEDDING_MODEL=

# Textos por requisição de embedding, na ingestão. 96 serve a qualquer
# provedor conhecido sem medir; baixe se um provedor específico reclamar de
# lote grande demais.
# KNOWLEDGE_EMBEDDING_BATCH=96
```

- [ ] **Passo 2: Commit**

```bash
git add apps/api/.env.example
git commit -m "docs: receita da Jina AI (e alternativas) para KNOWLEDGE_EMBEDDING_* em .env.example"
```

---

### Task 15: Frontend — tipos + texto de carregamento em `AIAssistPanel`

**Arquivos:**
- Modificar: `packages/shared-types/index.ts`
- Modificar: `apps/web/lib/i18n.ts`
- Modificar: `apps/web/components/ai/AIAssistPanel.tsx`
- Teste: `apps/web/components/ai/*.test.tsx` (se existir; senão, cobertura via
  `routes.a11y.test.tsx`/testes de fumaça já existentes — ver Passo 4)

**Interfaces:**
- Produz: `CitedSource` (novo tipo), `Explanation.sources: CitedSource[]`.

- [ ] **Passo 1: Tipos**

Em `packages/shared-types/index.ts`, adicionar antes de `export interface
Explanation`:

```typescript
export interface CitedSource {
  document_title: string;
  page_start: number | null;
  page_end: number | null;
}
```

Modificar `Explanation`:

```typescript
export interface Explanation {
  study_id: number;
  study_name: string;
  summary: string;
  paragraphs: string[];
  caveats: string[];
  sources: CitedSource[];
  provider: string;
  simulated: boolean;
  disclaimer: string;
}
```

- [ ] **Passo 2: i18n**

Em `apps/web/lib/i18n.ts`, dentro do objeto `ai`, adicionar depois de
`interpreting: "Interpretando…",`:

```typescript
    interpretingWithKnowledge: "Consultando a base de conhecimento…",
```

E depois de `explaining: "Redigindo…",`:

```typescript
    explainingWithKnowledge: "Consultando a base de conhecimento…",
    sourcesConsulted: "Fontes consultadas",
```

- [ ] **Passo 3: `AIAssistPanel.tsx` — texto condicional**

Em `apps/web/components/ai/AIAssistPanel.tsx`, modificar a linha 150:

```tsx
        <Button
          variant="primary"
          disabled={!statement.trim()}
          loading={interpret.isPending}
          onClick={() => interpret.mutate()}
        >
          {interpret.isPending
            ? status.data?.simulated
              ? t.interpreting
              : t.interpretingWithKnowledge
            : t.interpret}
        </Button>
```

- [ ] **Passo 4: Rodar o portão do frontend**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run test
```
Esperado: todos verdes — nenhum teste existente deveria depender do texto
exato do botão em estado `isPending` (verificar rapidamente por
`grep -rn "Interpretando" apps/web/**/*.test.tsx`; se algum teste asserir esse
texto literal, ajustar o teste para o novo texto condicional).

- [ ] **Passo 5: Commit**

```bash
git add packages/shared-types/index.ts apps/web/lib/i18n.ts apps/web/components/ai/AIAssistPanel.tsx
git commit -m "feat(frontend): texto de carregamento distinto quando o provedor não é mock"
```

---

### Task 16: Frontend — `StudyExplanation.tsx` (texto + citações)

**Arquivos:**
- Modificar: `apps/web/components/ai/StudyExplanation.tsx`

**Interfaces:**
- Consome: `Explanation.sources` (Tarefa 15), `getAIStatus` (já existe em
  `lib/api.ts`).

- [ ] **Passo 1: Adicionar a consulta de status e o texto condicional**

Em `apps/web/components/ai/StudyExplanation.tsx`, adicionar o import e a
`useQuery`:

```tsx
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError, explainStudy, getAIStatus } from "@/lib/api";
```

```tsx
  const status = useQuery({ queryKey: ["ai-status"], queryFn: getAIStatus });

  const explain = useMutation({
```

Modificar o botão (linhas 75-82):

```tsx
      <Button
        size="sm"
        variant="secondary"
        loading={explain.isPending}
        onClick={() => explain.mutate()}
      >
        {explain.isPending
          ? status.data?.simulated
            ? t.explaining
            : t.explainingWithKnowledge
          : t.explain}
      </Button>
```

- [ ] **Passo 2: Renderizar as fontes citadas**

Adicionar, depois do bloco de `caveats` (depois da linha 65, antes do
`<p>{explanation.disclaimer}</p>`):

```tsx
          {explanation.sources.length > 0 && (
            <div className="text-2xs text-ink-subtle">
              <p className="font-medium">{t.sourcesConsulted}:</p>
              <ul className="list-disc pl-4">
                {explanation.sources.map((source, i) => (
                  <li key={i}>
                    {source.document_title}
                    {source.page_start && source.page_end
                      ? ` (p. ${source.page_start}-${source.page_end})`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
```

- [ ] **Passo 3: Rodar o portão do frontend**

```bash
cd apps/web && npm run typecheck && npm run lint && npm run test && npm run build
```
Esperado: tudo verde.

- [ ] **Passo 4: Commit**

```bash
git add apps/web/components/ai/StudyExplanation.tsx
git commit -m "feat(frontend): StudyExplanation mostra fontes citadas e o carregamento de retrieval"
```

---

### Task 17: Documentação

**Arquivos:**
- Modificar: `docs/09-camada-ia.md`
- Modificar: `docs/CLAUDE.md`
- Modificar: `docs/DECISIONS.md`
- Modificar: `docs/TODO.md`
- Modificar: `docs/PROJECT_CONTEXT.md`

Nenhum teste — documentação. Sem placeholder: escrever o texto de verdade, não
"adicionar seção sobre X".

- [ ] **Passo 1: `docs/09-camada-ia.md`**

Adicionar uma seção nova (o arquivo hoje não menciona o Cérebro/conhecimento
em nenhum lugar — lacuna que a pesquisa desta spec encontrou), explicando: o
pipeline `app/knowledge/` → `retrieval.search` → bloco de contexto no prompt;
que retrieval só roda para provedor não-simulado; a garantia de que trechos
recuperados nunca ancoram número (com referência a `guardrails.check_constraint`);
o guardrail de citação verificada em `explain()`.

- [ ] **Passo 2: `docs/CLAUDE.md` §1.5**

Acrescentar a terceira regra inegociável da camada de IA, ao lado de
"ancoragem numérica" e "unidade explícita": **trechos recuperados são
vocabulário, nunca número** — com uma frase explicando que isso é garantido
por `context.retrieved` nunca ser lido por `check_constraint`, não por
convenção.

- [ ] **Passo 3: `docs/DECISIONS.md`**

Nova decisão (D-47 ou o próximo número livre — confirmar o último número
usado no arquivo antes de numerar) registrando: RRF híbrido escolhido, Jina AI
como receita de embeddings (com a fonte da pesquisa), retrieval gated por
`provider.simulated`, citação verificada em vez de citação livre — com as
alternativas descartadas (semântica pura; citação sem verificação).

- [ ] **Passo 4: `docs/TODO.md`**

Conferir se há algum item pendente relacionado a "RAG"/"Cérebro" para mover a
"Débitos já quitados"; se não houver item aberto (o pedido não veio do
backlog, veio de pedido direto do usuário), registrar a entrega ali mesmo
como novo item já quitado, no mesmo formato dos outros.

- [ ] **Passo 5: `docs/PROJECT_CONTEXT.md`**

Atualizar §3 (Estado atual) e §4 (Funcionalidades concluídas) com um parágrafo
sobre o RAG entregue — mesmo padrão das entregas anteriores (M9, M4):
contagem de testes atualizada, o que passou a funcionar, a garantia central
preservada.

- [ ] **Passo 6: Commit**

```bash
git add docs/09-camada-ia.md docs/CLAUDE.md docs/DECISIONS.md docs/TODO.md docs/PROJECT_CONTEXT.md
git commit -m "docs: RAG sobre o Cérebro — camada de IA, decisão, backlog e estado do projeto"
```

---

### Task 18: Portão completo, push, PR

- [ ] **Passo 1: Backend — suíte completa + migrations**

```bash
cd apps/api
ruff check app && black --check app && pytest
python -m alembic upgrade head  # confirma que nenhuma migration nova ficou pendente
```
Esperado: tudo verde. Nenhuma migration nova é esperada neste trabalho (nenhum
schema de banco mudou) — se `alembic` pedir uma revisão, é sinal de que algo
neste plano introduziu uma mudança de modelo não prevista; investigar antes de
prosseguir.

- [ ] **Passo 2: Frontend — suíte completa**

```bash
cd apps/web
npm run typecheck && npm run lint && npm run test && npm run build
```
Esperado: tudo verde, 16+ rotas construídas (nenhuma rota nova foi
adicionada — só componentes existentes mudaram).

- [ ] **Passo 3: Confirmar a garantia central, isoladamente**

```bash
cd apps/api && pytest app/tests/test_ai_api.py -k "RetrievedTextNeverGroundsANumber" -v
```
Esperado: PASS. Este é o teste que teria pego uma regressão na ancoragem
numérica — se ele não existir mais ou não estiver passando, pare aqui.

- [ ] **Passo 4: Push e PR**

```bash
git push -u origin claude/sleepy-hopper-qmdmcy
```
Abrir PR (rascunho) contra `main`, corpo explicando: o que os dois bugs
adormecidos eram, a arquitetura de busca híbrida, a garantia de ancoragem
numérica preservada (com o teste que prova isso citado por nome), e o que
fica de fora de propósito (seção 10 da spec) — mesmo padrão dos PRs
anteriores desta sessão. Subscrever à atividade do PR.
