"""app.knowledge.index: o índice do Cérebro residente no processo.

O que se prova aqui: o BM25 do índice invertido é **o mesmo número** de
``lexical.bm25_scores`` (igualdade exata, não aproximada); uma segunda busca
não recarrega nada; ingestão e remoção reconstroem; vetores novos entram por
acréscimo e uma contagem que não fecha força recarga inteira; vetor de outro
modelo ou dimensão é ignorado, nunca comparado; blob corrompido é pulado com
aviso; e só os ``top_k`` trechos devolvidos são lidos por inteiro.
"""

from __future__ import annotations

import logging
import random
import struct
import threading
import time
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.config import Settings
from app.knowledge import index as index_module
from app.knowledge.embeddings import pack_vector
from app.knowledge.index import (
    KnowledgeIndexCache,
    VectorStore,
    build_lexical_index,
    dot,
    get_cache,
    reset_cache,
)
from app.knowledge.lexical import bm25_scores, fold, tokenize
from app.knowledge.prune import prune
from app.knowledge.removal import parse_removal_list
from app.knowledge.retrieval import lexical_rank, search
from app.knowledge.service import KnowledgeService
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding
from app.repositories.knowledge_index_repository import (
    CorpusFingerprint,
    KnowledgeIndexRepository,
    VectorFingerprint,
)
from app.repositories.knowledge_repository import KnowledgeRepository

MODEL = "fake-embed"
SETTINGS = Settings(knowledge_embedding_base_url="https://fake/v1", knowledge_embedding_model=MODEL)

# --- helpers ------------------------------------------------------------------

_stamp = [datetime(2026, 1, 1, tzinfo=UTC)]


def _document(db, path: str, texts: list[str]) -> list[KnowledgeChunk]:
    """A document with one chunk per text, as ingestion would leave it."""
    _stamp[0] += timedelta(seconds=1)
    document = KnowledgeDocument(
        path=path, title=path, checksum="0" * 64, chunk_count=len(texts), indexed_at=_stamp[0]
    )
    db.add(document)
    db.flush()
    chunks = [
        KnowledgeChunk(
            document_id=document.id,
            ordinal=ordinal,
            text=text,
            char_count=len(text),
            search_text=fold(text),
        )
        for ordinal, text in enumerate(texts)
    ]
    db.add_all(chunks)
    db.flush()
    return chunks


def _embed(db, chunk: KnowledgeChunk, vector: list[float], model: str = MODEL) -> None:
    db.add(
        KnowledgeEmbedding(
            chunk_id=chunk.id, model=model, dimensions=len(vector), vector=pack_vector(vector)
        )
    )
    db.flush()


class _FakeClient:
    """'quente'/'calor' on one axis, everything else on the other; ``dims`` wide."""

    def __init__(self, dims: int = 2) -> None:
        self.model = MODEL
        self.configured = True
        self.dims = dims
        # 0 = "não envia dimensions", como o EmbeddingClient real: só a
        # resposta diz o tamanho da consulta.
        self.dimensions = 0
        self.calls = 0

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls += 1
        out = []
        for text in texts:
            hot = "quente" in text.lower() or "calor" in text.lower()
            vector = [1.0, 0.0] if hot else [0.0, 1.0]
            out.append(vector + [0.0] * (self.dims - 2))
        return out


@pytest.fixture
def fake_client(monkeypatch: pytest.MonkeyPatch) -> _FakeClient:
    client = _FakeClient()
    monkeypatch.setattr("app.knowledge.retrieval.EmbeddingClient", lambda _settings: client)
    return client


@pytest.fixture
def spy(monkeypatch: pytest.MonkeyPatch) -> dict[str, list]:
    """Record every loader and materialisation call the index makes."""
    calls: dict[str, list] = {"texts": [], "vectors": [], "materialised": []}
    original_texts = KnowledgeIndexRepository.iter_search_texts
    original_vectors = KnowledgeIndexRepository.iter_vectors
    original_materialise = KnowledgeIndexRepository.chunks_with_documents

    def texts(self, max_id):
        calls["texts"].append(max_id)
        return original_texts(self, max_id)

    def vectors(self, model, dimensions, *, after_id, max_id):
        calls["vectors"].append((model, dimensions, after_id, max_id))
        return original_vectors(self, model, dimensions, after_id=after_id, max_id=max_id)

    def materialise(self, chunk_ids):
        calls["materialised"].append(list(chunk_ids))
        return original_materialise(self, chunk_ids)

    monkeypatch.setattr(KnowledgeIndexRepository, "iter_search_texts", texts)
    monkeypatch.setattr(KnowledgeIndexRepository, "iter_vectors", vectors)
    monkeypatch.setattr(KnowledgeIndexRepository, "chunks_with_documents", materialise)
    return calls


# --- BM25: the same numbers ------------------------------------------------------

_WORDS = (
    "aço alumínio titânio módulo rigidez densidade tenacidade fratura fadiga "
    "corrosão polímero cerâmica compósito resistência tração escoamento "
    "temperatura dureza 6061 AISI 304 liga fibra carbono vidro"
).split()


def _reference_scores(rows: list[tuple[int, str]], tokens: list[str]) -> dict[int, float]:
    """``bm25_scores`` fed exactly as ``lexical_rank`` feeds it."""
    documents = {chunk_id: tokenize(text) for chunk_id, text in rows}
    frequency: dict[str, int] = {}
    for words in documents.values():
        for token in set(words):
            frequency[token] = frequency.get(token, 0) + 1
    return bm25_scores(tokens, documents, frequency, corpus_size=len(rows))


class TestBm25Equivalence:
    QUERIES = [
        "módulo rigidez",
        "aço aço aço corrosão",
        "6061 AISI liga",
        "resistencia a tracao e escoamento",
        "palavra inexistente zirconia",
        "fibra de carbono em compósito polímero",
    ]

    def test_scores_equal_bm25_exactly_on_a_random_corpus(self) -> None:
        rng = random.Random(20260930)
        rows = []
        for chunk_id in range(1, 301):
            words = [rng.choice(_WORDS) for _ in range(rng.randint(0, 60))]
            rows.append((chunk_id * 3, fold(" ".join(words))))
        # A passage made only of stopwords: in the corpus, zero tokens long.
        rows.append((10_000, fold("para com que uma dos")))
        index = build_lexical_index(rows, CorpusFingerprint(len(rows), 10_000, 1, None))

        for query in self.QUERIES:
            tokens = tokenize(query)
            assert index.scores(tokens) == _reference_scores(rows, tokens), query

    def test_rank_equals_lexical_rank_over_the_database(self, db_session) -> None:
        rng = random.Random(7)
        for doc in range(6):
            texts = [" ".join(rng.choice(_WORDS) for _ in range(25)) for _ in range(12)]
            _document(db_session, f"doc{doc}.pdf", texts)
        # Ties on purpose: identical passages score identically, ordered by id.
        _document(db_session, "gemeos.pdf", ["módulo de rigidez do aço"] * 3)

        index = get_cache().lexical(KnowledgeIndexRepository(db_session))
        # The oracle: the whole corpus as ORM rows, as retrieval loaded it per
        # query before the index existed — here, and only here, on purpose.
        chunks = list(
            db_session.execute(
                select(KnowledgeChunk)
                .where(KnowledgeChunk.search_text != "")
                .order_by(KnowledgeChunk.id)
            ).scalars()
        )
        rows = [(c.id, c.search_text) for c in chunks]
        for query in self.QUERIES:
            tokens = tokenize(query)
            assert index.scores(tokens) == _reference_scores(rows, tokens), query
            assert index.rank(tokens, 20) == lexical_rank(chunks, tokens), query

    def test_empty_corpus_scores_nothing(self) -> None:
        index = build_lexical_index([], CorpusFingerprint(0, None, 0, None))
        assert len(index) == 0
        assert index.scores(["aco"]) == {}
        assert index.rank(["aco"], 5) == []


# --- freshness ------------------------------------------------------------------


class TestFreshness:
    def test_second_search_reuses_the_index(self, db_session, spy) -> None:
        _document(db_session, "a.pdf", ["Módulo de Young e rigidez."])
        assert search(db_session, "rigidez", top_k=3, settings=Settings())
        assert search(db_session, "modulo", top_k=3, settings=Settings())
        assert len(spy["texts"]) == 1

    def test_new_document_triggers_a_rebuild(self, db_session, spy) -> None:
        _document(db_session, "a.pdf", ["Módulo de Young e rigidez."])
        assert search(db_session, "zirconia", top_k=3, settings=Settings()) == []
        _document(db_session, "b.pdf", ["Zircônia estabilizada com ítria."])
        found = search(db_session, "zirconia", top_k=3, settings=Settings())
        assert [r.text for r in found] == ["Zircônia estabilizada com ítria."]
        assert len(spy["texts"]) == 2

    def test_ingest_and_prune_trigger_rebuilds(
        self, db_session, tmp_path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.config import settings
        from app.tests.test_knowledge_ingest import _pdf_bytes

        root = tmp_path / "cerebro"
        root.mkdir()
        monkeypatch.setattr(settings, "knowledge_dir", str(root))
        (root / "aula.pdf").write_bytes(_pdf_bytes(["Tenacidade à fratura de cerâmicas."]))
        KnowledgeService(db_session).ingest()
        assert search(db_session, "tenacidade", top_k=3, settings=Settings())

        # A changed file: SQLite may hand the freed chunk ids straight back,
        # which is why the fingerprint also reads the documents' indexed_at.
        (root / "aula.pdf").write_bytes(_pdf_bytes(["Fluência de superligas de níquel."]))
        KnowledgeService(db_session).ingest()
        assert search(db_session, "tenacidade", top_k=3, settings=Settings()) == []
        assert search(db_session, "fluencia superligas", top_k=3, settings=Settings())

        prune(db_session, parse_removal_list("aula.pdf\n"), apply=True)
        assert search(db_session, "fluencia superligas", top_k=3, settings=Settings()) == []

    def test_reset_empties_the_cache(self, db_session) -> None:
        _document(db_session, "a.pdf", ["Módulo de Young e rigidez."])
        search(db_session, "rigidez", top_k=3, settings=Settings())
        assert get_cache()._lexical is not None
        reset_cache()
        assert get_cache()._lexical is None and get_cache()._vectors is None


# --- vectors --------------------------------------------------------------------


class TestVectors:
    def test_semantic_hit_without_lexical_overlap(self, db_session, fake_client) -> None:
        hot, cold = _document(db_session, "t.pdf", ["Ambiente quente e seco.", "Usinagem."])
        _embed(db_session, hot, [1.0, 0.0])
        _embed(db_session, cold, [0.0, 1.0])
        found = search(db_session, "calor", top_k=1, settings=SETTINGS)
        assert [r.text for r in found] == ["Ambiente quente e seco."]

    def test_new_vectors_are_appended_not_reloaded(
        self, db_session, fake_client, spy, caplog
    ) -> None:
        a, b, c = _document(db_session, "t.pdf", ["quente um", "frio dois", "quente três"])
        _embed(db_session, a, [1.0, 0.0])
        _embed(db_session, b, [0.0, 1.0])
        search(db_session, "calor", top_k=3, settings=SETTINGS)
        first_max = spy["vectors"][0][3]
        assert spy["vectors"] == [(MODEL, 2, 0, first_max)]

        _embed(db_session, c, [1.0, 0.0])
        caplog.set_level(logging.INFO, logger="app.knowledge.index")
        search(db_session, "calor", top_k=3, settings=SETTINGS)
        assert len(spy["vectors"]) == 2
        _, _, after_id, max_id = spy["vectors"][1]
        assert after_id == first_max and max_id > first_max
        assert len(get_cache()._vectors) == 3
        assert "acrescentado" in caplog.text

    def test_count_mismatch_forces_a_full_reload(self, db_session, fake_client, spy) -> None:
        a, b, c = _document(db_session, "t.pdf", ["quente um", "frio dois", "quente três"])
        _embed(db_session, a, [1.0, 0.0])
        _embed(db_session, b, [0.0, 1.0])
        search(db_session, "calor", top_k=3, settings=SETTINGS)

        # One vector gone below the cached max, one new above it: the count is
        # unchanged, the max grew — appending alone would keep the deleted one.
        db_session.delete(db_session.query(KnowledgeEmbedding).filter_by(chunk_id=a.id).one())
        db_session.flush()
        _embed(db_session, c, [1.0, 0.0])
        found = search(db_session, "calor", top_k=3, settings=SETTINGS)

        after_ids = [call[2] for call in spy["vectors"]]
        assert after_ids[0] == 0 and after_ids[-1] == 0 and len(after_ids) == 3
        store = get_cache()._vectors
        assert sorted(store.chunk_ids) == sorted([b.id, c.id])
        assert found[0].text == "quente três"

    def test_vector_rewritten_in_place_to_this_model_is_seen(self, db_session, fake_client) -> None:
        """Ingestion rewrites a stale vector in place (same row id): the count
        of this model's vectors grows while the max does not."""
        a, b = _document(db_session, "t.pdf", ["quente um", "frio dois"])
        _embed(db_session, a, [1.0, 0.0], model="outro-modelo")
        _embed(db_session, b, [0.0, 1.0])
        search(db_session, "calor", top_k=3, settings=SETTINGS)
        assert len(get_cache()._vectors) == 1

        KnowledgeRepository(db_session).set_embedding(a.id, model=MODEL, vector=[1.0, 0.0])
        found = search(db_session, "calor", top_k=1, settings=SETTINGS)
        assert len(get_cache()._vectors) == 2
        assert found[0].text == "quente um"

    def test_a_deletion_and_a_rewrite_below_the_max_are_seen(self, db_session, fake_client) -> None:
        """Same count, same max, a different set: only the id sum tells."""
        gone, rewritten, kept = _document(
            db_session, "t.pdf", ["quente apagado", "quente reescrito", "frio fica"]
        )
        _embed(db_session, gone, [1.0, 0.0])
        _embed(db_session, rewritten, [1.0, 0.0], model="outro-modelo")
        _embed(db_session, kept, [0.0, 1.0])
        search(db_session, "calor", top_k=3, settings=SETTINGS)
        assert sorted(get_cache()._vectors.chunk_ids) == sorted([gone.id, kept.id])

        db_session.delete(db_session.query(KnowledgeEmbedding).filter_by(chunk_id=gone.id).one())
        db_session.flush()
        KnowledgeRepository(db_session).set_embedding(rewritten.id, model=MODEL, vector=[1.0, 0.0])
        found = search(db_session, "calor", top_k=1, settings=SETTINGS)

        assert sorted(get_cache()._vectors.chunk_ids) == sorted([rewritten.id, kept.id])
        assert found[0].text == "quente reescrito"

    def test_other_model_or_dimensions_are_ignored(self, db_session, fake_client, spy) -> None:
        mine, other_model, other_dims = _document(
            db_session, "t.pdf", ["quente meu", "quente de outro modelo", "quente de 3 dims"]
        )
        _embed(db_session, mine, [1.0, 0.0])
        _embed(db_session, other_model, [1.0, 0.0], model="outro-modelo")
        _embed(db_session, other_dims, [1.0, 0.0, 0.0])

        search(db_session, "calor", top_k=3, settings=SETTINGS)
        store = get_cache()._vectors
        assert (store.model, store.dimensions) == (MODEL, 2)
        assert list(store.chunk_ids) == [mine.id]

    def test_query_of_another_dimension_is_lexical_only(
        self, db_session, monkeypatch: pytest.MonkeyPatch, spy
    ) -> None:
        client = _FakeClient(dims=3)
        monkeypatch.setattr("app.knowledge.retrieval.EmbeddingClient", lambda _s: client)
        (chunk,) = _document(db_session, "t.pdf", ["Temperatura quente de serviço."])
        _embed(db_session, chunk, [1.0, 0.0])

        found = search(db_session, "temperatura", top_k=3, settings=SETTINGS)
        assert [r.text for r in found] == ["Temperatura quente de serviço."]
        assert client.calls == 1
        assert spy["vectors"] == []  # nothing of 3 dimensions to load

    def test_no_vector_of_this_model_spares_the_embedding_call(
        self, db_session, fake_client
    ) -> None:
        (chunk,) = _document(db_session, "t.pdf", ["Temperatura quente."])
        _embed(db_session, chunk, [1.0, 0.0], model="outro-modelo")
        assert search(db_session, "temperatura", top_k=3, settings=SETTINGS)
        assert fake_client.calls == 0

    def test_corrupted_blob_is_skipped_with_a_warning(
        self, db_session, fake_client, caplog
    ) -> None:
        hot, broken = _document(db_session, "t.pdf", ["Ambiente quente.", "Outro quente."])
        _embed(db_session, hot, [1.0, 0.0])
        db_session.add(
            KnowledgeEmbedding(chunk_id=broken.id, model=MODEL, dimensions=2, vector=b"\x00" * 5)
        )
        db_session.flush()

        caplog.set_level(logging.WARNING, logger="app.knowledge.index")
        found = search(db_session, "calor", top_k=2, settings=SETTINGS)
        assert [r.text for r in found] == ["Ambiente quente."]
        assert "ignorado" in caplog.text
        assert get_cache()._vectors.skipped == 1

        # Skipped, yet counted: the next search does not reload.
        search(db_session, "calor", top_k=2, settings=SETTINGS)
        assert get_cache()._vectors.skipped == 1

    def test_only_top_k_rows_are_materialised(self, db_session, spy) -> None:
        _document(db_session, "d.pdf", [f"Densidade do material {i}." for i in range(12)])
        found = search(db_session, "densidade material", top_k=3, settings=Settings())
        assert len(found) == 3
        assert [len(ids) for ids in spy["materialised"]] == [3]

    def test_a_vanished_row_is_replaced_by_the_next_candidate(
        self, db_session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        chunks = _document(db_session, "d.pdf", [f"Densidade do material {i}." for i in range(6)])
        original = KnowledgeIndexRepository.chunks_with_documents
        gone = chunks[0].id

        def lossy(self, chunk_ids):
            return {k: v for k, v in original(self, chunk_ids).items() if k != gone}

        monkeypatch.setattr(KnowledgeIndexRepository, "chunks_with_documents", lossy)
        found = search(db_session, "densidade material", top_k=3, settings=Settings())
        assert len(found) == 3

    def test_build_logs_process_memory(self, db_session, caplog) -> None:
        _document(db_session, "a.pdf", ["Módulo de Young."])
        caplog.set_level(logging.INFO, logger="app.knowledge.index")
        search(db_session, "modulo", top_k=1, settings=Settings())
        assert "Índice léxico do Cérebro construído" in caplog.text
        assert (
            "memória residente" in caplog.text or "memória do processo indisponível" in caplog.text
        )


# --- scoring --------------------------------------------------------------------


class TestScoring:
    def _store(self, vectors: list[list[float]]) -> VectorStore:
        store = VectorStore(model=MODEL, dimensions=len(vectors[0]))
        store.load((i, 100 + i, pack_vector(v)) for i, v in enumerate(vectors, start=1))
        return store

    def test_without_sumprod_the_scores_are_the_same(self, monkeypatch) -> None:
        rng = random.Random(3)
        vectors = [[rng.uniform(-1, 1) for _ in range(64)] for _ in range(50)]
        query = [rng.uniform(-1, 1) for _ in range(64)]
        store = self._store(vectors)

        fast = store.rank(query, 50)
        monkeypatch.setattr(index_module, "_sumprod", None)
        slow = store.rank(query, 50)
        assert [i for i, _ in fast] == [i for i, _ in slow]
        assert [s for _, s in fast] == pytest.approx([s for _, s in slow], rel=1e-12, abs=1e-12)

    def test_dot_is_the_cosine_of_stored_vectors(self) -> None:
        store = self._store([[3.0, 4.0]])
        assert dot([0.6, 0.8], store.vectors[0]) == pytest.approx(1.0, rel=1e-6)

    def test_wrong_length_query_ranks_nothing(self) -> None:
        assert self._store([[1.0, 0.0]]).rank([1.0, 0.0, 0.0], 5) == []

    def test_blob_of_the_wrong_size_is_skipped(self) -> None:
        store = VectorStore(model=MODEL, dimensions=2)
        read = store.load([(1, 10, struct.pack("<3f", 1, 0, 0)), (2, 11, pack_vector([1, 0]))])
        assert read == 2 and list(store.chunk_ids) == [11] and store.skipped == 1


# --- threads --------------------------------------------------------------------


class _SlowRepo:
    """Stands in for the repository: one fingerprint, a build that takes a while."""

    def __init__(self) -> None:
        self.builds = 0
        self._guard = threading.Lock()

    def corpus_fingerprint(self) -> CorpusFingerprint:
        return CorpusFingerprint(1, 1, 1, None)

    def iter_search_texts(self, max_id: int):
        with self._guard:
            self.builds += 1
        time.sleep(0.05)
        yield 1, "modulo rigidez"

    def iter_vectors(self, model, dimensions, *, after_id, max_id):
        with self._guard:
            self.builds += 1
        time.sleep(0.05)
        yield 1, 1, pack_vector([1.0, 0.0])


def test_a_lexical_rebuild_lets_the_old_index_go_first() -> None:
    cache = KnowledgeIndexCache()
    seen_during_build: list[object] = []

    class _ChangingRepo:
        def __init__(self) -> None:
            self.fingerprint = CorpusFingerprint(1, 1, 1, None)

        def corpus_fingerprint(self) -> CorpusFingerprint:
            return self.fingerprint

        def iter_search_texts(self, max_id: int):
            seen_during_build.append(cache._lexical)
            yield 1, "modulo rigidez"

    repo = _ChangingRepo()
    first = cache.lexical(repo)  # type: ignore[arg-type]
    repo.fingerprint = CorpusFingerprint(2, 2, 1, None)
    second = cache.lexical(repo)  # type: ignore[arg-type]

    assert second is not first
    # The first build had nothing to let go; the second let the first go.
    assert seen_during_build == [None, None]


def test_concurrent_searches_build_once() -> None:
    cache = KnowledgeIndexCache()
    repo = _SlowRepo()
    barrier = threading.Barrier(8)
    results: list[object] = []

    def worker() -> None:
        barrier.wait()
        results.append(cache.lexical(repo))  # type: ignore[arg-type]
        results.append(
            cache.vectors(repo, MODEL, 2, VectorFingerprint(1, 1))  # type: ignore[arg-type]
        )

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert repo.builds == 2  # one lexical build, one vector load
    assert len({id(r) for r in results}) == 2
