"""app.knowledge.retrieval: a função de busca que não existia antes deste
trabalho — só as primitivas (BM25, embeddings) existiam, sem quem as chamasse.
"""

from __future__ import annotations

import pytest

from app.config import Settings
from app.knowledge.retrieval import search
from app.knowledge.service import KnowledgeService
from app.models.enums import DocumentKind, SourceAuthority


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

        results = search(
            db_session, "densidade propriedades mecanicas", top_k=3, settings=Settings()
        )
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

        results = search(
            db_session, "indices desempenho selecao materiais", top_k=5, settings=Settings()
        )
        assert results
        assert results[0].document_title == "Materials Selection in Mechanical Design"
        assert results[0].document_kind == DocumentKind.LIVRO
        assert results[0].document_authority == SourceAuthority.CIENTIFICA

    def test_empty_corpus_returns_empty(self, db_session, corpus) -> None:
        assert search(db_session, "qualquer coisa", top_k=5, settings=Settings()) == []


class _FakeEmbeddingClient:
    """Vetores determinísticos: 'quente' aponta pra um eixo, 'frio' pro outro."""

    def __init__(self, model: str = "fake-embed", fail: bool = False, dimensions: int = 0) -> None:
        self.model = model
        self.fail = fail
        # 0 = "não envia dimensions", como o EmbeddingClient real.
        self.dimensions = dimensions
        self.calls = 0
        # Every test that builds this fake already sets
        # knowledge_embedding_base_url/model, so gating should pass — mirrors
        # EmbeddingClient.configured without depending on it.
        self.configured = True

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls += 1
        if self.fail:
            from app.knowledge.embeddings import EmbeddingUnavailableError

            raise EmbeddingUnavailableError("indisponível no teste")
        return [
            [1.0, 0.0] if "quente" in text.lower() or "calor" in text.lower() else [0.0, 1.0]
            for text in texts
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
            knowledge_dir=str(corpus),
            knowledge_embedding_base_url="https://fake/v1",
            knowledge_embedding_model="fake-embed",
        )
        fake = _FakeEmbeddingClient()
        monkeypatch.setattr("app.knowledge.retrieval.EmbeddingClient", lambda _settings: fake)
        # Popula os vetores como a ingestão faria.
        service = KnowledgeService(db_session, settings)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: fake)
        service.ingest()

        results = search(db_session, "calor", top_k=5, settings=settings)
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
        monkeypatch.setattr("app.knowledge.retrieval.EmbeddingClient", lambda _settings: failing)

        # Não levanta: cai para léxico puro nesta consulta.
        results = search(
            db_session, "densidade modulo elasticidade metais", top_k=5, settings=settings
        )
        assert results

    def test_stored_vector_of_another_size_degrades_to_lexical_instead_of_raising(
        self, db_session, corpus, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A stored vector whose size differs from the query's is never compared.

        With the dimension unconfigured (0), only the answer tells the query's
        size; no stored vector has it, so the semantic half is skipped and the
        request is served by the lexical half, never an error. (A *corrupted*
        blob is a different path — the index skips it at load; see
        ``test_knowledge_index.py``.)
        """
        import struct

        from app.models.knowledge import KnowledgeEmbedding

        _write(corpus, "termico.pdf", ["Materiais para ambientes de alta temperatura, quente."])
        KnowledgeService(db_session).ingest()

        settings = Settings(
            knowledge_dir=str(corpus),
            knowledge_embedding_base_url="https://fake/v1",
            knowledge_embedding_model="fake-embed",
        )
        fake = _FakeEmbeddingClient()
        monkeypatch.setattr("app.knowledge.retrieval.EmbeddingClient", lambda _settings: fake)
        service = KnowledgeService(db_session, settings)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: fake)
        service.ingest()

        # Store a vector of 3 dimensions where the query embedding (from
        # _FakeEmbeddingClient) has 2.
        embedding = db_session.query(KnowledgeEmbedding).one()
        embedding.vector = struct.pack("<3f", 1.0, 0.0, 0.0)
        embedding.dimensions = 3
        db_session.flush()

        # Must not raise. Lexical still finds the passage by its own words.
        results = search(db_session, "temperatura", top_k=5, settings=settings)
        assert any("temperatura" in r.text for r in results)

    def test_no_query_embedding_when_nothing_is_stored_at_the_configured_size(
        self, db_session, corpus, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Mid-migration: every stored vector is at the old size. Embedding the
        # query would spend a request of the daily quota for a vector that
        # nothing stored can be compared with.
        _write(corpus, "termico.pdf", ["Materiais para ambientes de alta temperatura, quente."])
        settings = Settings(
            knowledge_dir=str(corpus),
            knowledge_embedding_base_url="https://fake/v1",
            knowledge_embedding_model="fake-embed",
        )
        service = KnowledgeService(db_session, settings)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: _FakeEmbeddingClient())
        service.ingest()  # vectors of 2 dimensions
        query_client = _FakeEmbeddingClient(dimensions=768)
        monkeypatch.setattr(
            "app.knowledge.retrieval.EmbeddingClient", lambda _settings: query_client
        )

        results = search(db_session, "temperatura", top_k=5, settings=settings)

        assert query_client.calls == 0
        assert any("temperatura" in r.text for r in results)

    def test_no_embedding_config_is_lexical_only(self, db_session, corpus) -> None:
        # Sem KNOWLEDGE_EMBEDDING_*, nenhuma tentativa de rede é feita — o
        # settings default (Settings()) já não tem os dois campos setados.
        _write(corpus, "aula.pdf", ["Resistência à tração de ligas metálicas."])
        KnowledgeService(db_session).ingest()
        results = search(db_session, "resistencia tracao ligas", top_k=5, settings=Settings())
        assert results
