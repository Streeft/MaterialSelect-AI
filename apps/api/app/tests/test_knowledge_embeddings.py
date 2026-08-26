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

    def __enter__(self) -> _Response:
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
        vectors = [{"index": i, "embedding": [1.0, 0.0, 0.0]} for i in range(len(body["input"]))]
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
