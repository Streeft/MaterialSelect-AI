"""When a search had to give up its embeddings, the answer says so (D-252).

The Cérebro's search and the Cadernos' retrieval have always fallen back to the lexical half
(BM25) when the query's embedding was unavailable, answered 429 or outran its time budget —
silently. ``semantic_degraded`` is the fact that was missing: "the semantic half was meant to
rank and did not". It is **not** set for a deployment with no embeddings at all (lexical is its
normal mode), nor for the simulated provider (offline by contract). The three screens that
show an answer built on a search carry it: the notebook chat, the project assistant's plan and
the explanation of a study.
"""

# ruff: noqa: F811  (fixtures imported from other test files are used by name)

from __future__ import annotations

import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ai.provider import AIProvider
from app.config import Settings
from app.knowledge.embeddings import EmbeddingUnavailableError, pack_vector
from app.knowledge.lexical import fold
from app.knowledge.retrieval import SearchResult, search_detailed
from app.knowledge.service import KnowledgeService
from app.notebooks import retrieval as notebook_retrieval
from app.services import ai_service, notebook_service
from app.tests.test_ai_plan import SKI, _CountingModel, _raw, use_provider  # noqa: F401
from app.tests.test_knowledge_retrieval import (  # noqa: F401
    _FakeEmbeddingClient,
    _write,
    corpus,
)
from app.tests.test_notebooks import _notebook, _text_source

EMBEDDING_SETTINGS = {
    "knowledge_embedding_base_url": "https://fake/v1",
    "knowledge_embedding_model": "fake-embed",
}


@pytest.fixture()
def indexed(db_session: Session, corpus, monkeypatch: pytest.MonkeyPatch):
    """A corpus whose passages have stored vectors, and the settings that ask for them."""
    _write(corpus, "termico.pdf", ["Materiais para ambientes de alta temperatura, quente."])
    _write(corpus, "outro.pdf", ["Processos de fabricação e usinagem convencional."])
    KnowledgeService(db_session).ingest()
    settings = Settings(knowledge_dir=str(corpus), **EMBEDDING_SETTINGS)
    fake = _FakeEmbeddingClient()
    monkeypatch.setattr("app.knowledge.retrieval.EmbeddingClient", lambda _s: fake)
    service = KnowledgeService(db_session, settings)
    monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
    monkeypatch.setattr(service, "_embedding_client", lambda: fake)
    service.ingest()
    return settings, fake


class TestCerebroSearch:
    def test_a_hybrid_ranking_is_not_degraded(self, db_session, indexed) -> None:
        settings, _ = indexed
        result = search_detailed(db_session, "calor", top_k=5, settings=settings)
        assert result.chunks and result.semantic_degraded is False

    def test_no_embeddings_configured_is_the_normal_mode_not_a_fallback(
        self, db_session, corpus
    ) -> None:
        _write(corpus, "aula.pdf", ["Densidade e módulo de elasticidade dos metais."])
        KnowledgeService(db_session).ingest()
        result = search_detailed(db_session, "densidade metais", top_k=5, settings=Settings())
        assert result.chunks and result.semantic_degraded is False

    def test_a_provider_failure_gives_lexical_results_and_says_so(
        self, db_session, indexed
    ) -> None:
        settings, fake = indexed
        fake.fail = True  # the provider is down (or answers 429) at query time
        result = search_detailed(
            db_session, "temperatura ambientes alta", top_k=5, settings=settings
        )
        assert result.semantic_degraded is True
        assert any("temperatura" in c.text for c in result.chunks), "words alone still find it"

    def test_a_time_budget_that_ran_out_says_so(self, db_session, indexed) -> None:
        settings, fake = indexed
        original = fake.embed

        def slow(texts):
            time.sleep(1.0)
            return original(texts)

        fake.embed = slow  # type: ignore[method-assign]
        started = time.monotonic()
        result = search_detailed(
            db_session, "temperatura", top_k=5, settings=settings, embed_budget=0.05
        )
        assert time.monotonic() - started < 0.8
        assert result.semantic_degraded is True and result.chunks

    def test_vectors_that_do_not_fit_the_configured_size_say_so(
        self, db_session, indexed, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        settings, fake = indexed
        fake.dimensions = 99  # nothing is stored at this size
        result = search_detailed(db_session, "temperatura", top_k=5, settings=settings)
        assert result.semantic_degraded is True

    def test_an_empty_query_is_not_degraded(self, db_session, indexed) -> None:
        settings, _ = indexed
        assert search_detailed(db_session, "", top_k=5, settings=settings) == SearchResult(
            chunks=[]
        )


def _embedded(chunk_id: int, text: str):
    return SimpleNamespace(
        id=chunk_id,
        source_id=chunk_id,
        ordinal=0,
        text=text,
        search_text=fold(text),
        embedding=SimpleNamespace(model="fake-embed", dimensions=2, vector=pack_vector([1.0, 0.0])),
    )


class TestNotebookRetrieval:
    CHUNKS = [_embedded(1, "Ambiente quente e seco."), _embedded(2, "Usinagem convencional.")]

    def _settings(self) -> Settings:
        return Settings(**EMBEDDING_SETTINGS)

    def test_a_working_embedding_is_not_degraded(self, monkeypatch) -> None:
        class Client:
            model = "fake-embed"
            configured = True

            def embed(self, texts):
                return [[1.0, 0.0] for _ in texts]

        monkeypatch.setattr(notebook_retrieval, "EmbeddingClient", lambda _s: Client())
        found = notebook_retrieval.search(
            self.CHUNKS, "calor", top_k=1, settings=self._settings(), semantic=True
        )
        assert found.semantic_degraded is False

    def test_a_429_or_an_outage_says_the_search_fell_back(self, monkeypatch) -> None:
        class Down:
            model = "fake-embed"
            configured = True

            def embed(self, texts):
                raise EmbeddingUnavailableError("429: cota diária")

        monkeypatch.setattr(notebook_retrieval, "EmbeddingClient", lambda _s: Down())
        found = notebook_retrieval.search(
            self.CHUNKS, "quente", top_k=1, settings=self._settings(), semantic=True
        )
        assert found.semantic_degraded is True
        assert [c.id for c in found.chunks] == [1], "the lexical half still answers"

    def test_a_time_budget_that_ran_out_says_so(self, monkeypatch) -> None:
        class Slow:
            model = "fake-embed"
            configured = True

            def embed(self, texts):
                time.sleep(1.0)
                return [[1.0, 0.0]]

        monkeypatch.setattr(notebook_retrieval, "EmbeddingClient", lambda _s: Slow())
        settings = Settings(**EMBEDDING_SETTINGS, notebook_retrieval_budget_seconds=0.05)
        found = notebook_retrieval.search(
            self.CHUNKS, "quente", top_k=1, settings=settings, semantic=True
        )
        assert found.semantic_degraded is True

    def test_without_embeddings_and_for_the_simulated_provider_it_is_not_a_fallback(
        self,
    ) -> None:
        plain = notebook_retrieval.search(
            self.CHUNKS, "quente", top_k=1, settings=Settings(), semantic=True
        )
        offline = notebook_retrieval.search(
            self.CHUNKS, "quente", top_k=1, settings=self._settings(), semantic=False
        )
        assert plain.semantic_degraded is False and offline.semantic_degraded is False


class TestWhatTheScreensGet:
    def test_the_notebook_answer_carries_the_flag_and_keeps_it_in_the_history(
        self, client: TestClient, monkeypatch
    ) -> None:
        real = notebook_service.search

        def degraded(*args, **kwargs):
            found = real(*args, **kwargs)
            return notebook_retrieval.Retrieval(
                chunks=found.chunks, fallback=found.fallback, semantic_degraded=True
            )

        monkeypatch.setattr(notebook_service, "search", degraded)
        notebook = _notebook(client)
        _text_source(client, notebook["id"])
        response = client.post(
            f"/api/notebooks/{notebook['id']}/chat",
            json={"question": "Qual a densidade do alumínio?"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["answer"]["answer"]["retrieval_degraded"] is True
        history = client.get(f"/api/notebooks/{notebook['id']}/messages").json()
        assert history[1]["answer"]["retrieval_degraded"] is True

    def test_the_notebook_answer_without_a_fallback_says_false(self, client: TestClient) -> None:
        notebook = _notebook(client)
        _text_source(client, notebook["id"])
        answer = client.post(
            f"/api/notebooks/{notebook['id']}/chat",
            json={"question": "Qual a densidade do alumínio?"},
        ).json()["answer"]["answer"]
        assert answer["retrieval_degraded"] is False

    def test_the_plan_says_when_its_reference_search_fell_back(
        self, client: TestClient, use_provider, monkeypatch
    ) -> None:
        use_provider(_CountingModel(_raw()))
        monkeypatch.setattr(
            ai_service, "knowledge_search", lambda *a, **k: SearchResult([], semantic_degraded=True)
        )
        body = client.post("/api/ai/plan", json={"text": SKI, "mode": "project"}).json()
        assert body["retrieval_degraded"] is True

    def test_a_plan_reused_from_the_cache_ran_no_search_and_says_false(
        self, client: TestClient, use_provider, monkeypatch
    ) -> None:
        use_provider(_CountingModel(_raw()))
        monkeypatch.setattr(
            ai_service, "knowledge_search", lambda *a, **k: SearchResult([], semantic_degraded=True)
        )
        first = client.post("/api/ai/plan", json={"text": SKI, "mode": "project"}).json()
        second = client.post("/api/ai/plan", json={"text": SKI, "mode": "project"}).json()
        assert first["retrieval_degraded"] is True
        assert second["cached"] is True and second["retrieval_degraded"] is False

    def test_the_simulated_provider_never_searches_and_never_warns(
        self, client: TestClient
    ) -> None:
        body = client.post("/api/ai/plan", json={"text": SKI, "mode": "project"}).json()
        assert body["simulated"] is True and body["retrieval_degraded"] is False

    def test_the_explanation_says_when_its_reference_search_fell_back(
        self, client: TestClient, use_provider, monkeypatch
    ) -> None:
        class Writer(AIProvider):
            name = "redator-de-teste"
            simulated = False

            def interpret(self, context):  # pragma: no cover - not used here
                return {}

            def explain(self, context):
                return {
                    "summary": "Resumo.",
                    "paragraphs": ["Texto."],
                    "caveats": [],
                    "sources": [],
                }

        use_provider(Writer())
        monkeypatch.setattr(
            ai_service, "knowledge_search", lambda *a, **k: SearchResult([], semantic_degraded=True)
        )
        study = client.post(
            "/api/selection/studies",
            json={
                "name": "Estudo",
                "constraints": [
                    {"operator": "gt", "property_slug": "modulo_young", "value": 1.0, "unit": "GPa"}
                ],
            },
        ).json()
        response = client.post("/api/ai/explain", json={"study_id": study["id"]})
        assert response.status_code == 200, response.text
        assert response.json()["retrieval_degraded"] is True
