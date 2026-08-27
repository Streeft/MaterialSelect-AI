"""EmbeddingClient: a chamada de rede que a busca semântica depende, sem rede
de verdade — mesmo padrão de test_ai_openai_compat.py (fake opener injetável).
"""

from __future__ import annotations

import json
import math

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
    """Registra cada request recebida e devolve vetores determinísticos.

    Each vector is keyed to its input text so order can be verified after normalization.
    The vector stays distinguishable after L2-normalization because it has non-zero
    components in multiple dimensions (ord(text[0]) and 1.0).
    """

    def __init__(self) -> None:
        self.requests: list[dict] = []

    def __call__(self, request: object, timeout: float | None = None) -> _Response:
        body = json.loads(request.data.decode("utf-8"))
        self.requests.append(body)
        # Return a vector keyed to the input text so order can be verified.
        # Use [ord(text[0]), 1.0, 0.0] so that after L2 normalization, each text
        # gets a unique vector with distinguishable first component.
        vectors = [
            {"index": i, "embedding": [float(ord(text[0])), 1.0, 0.0]}
            for i, text in enumerate(body["input"])
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


def _expected_vector(text: str) -> list[float]:
    """The expected L2-normalized vector for a given input text.

    The fake server returns [ord(text[0]), 1.0, 0.0] for each text, which gets
    L2-normalized before being returned to the caller.
    """
    raw = [float(ord(text[0])), 1.0, 0.0]
    norm = math.sqrt(sum(v * v for v in raw))
    return [v / norm for v in raw]


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


class TestDedicatedApiKey:
    def test_dedicated_key_is_used_when_set(self) -> None:
        settings = _settings(
            knowledge_embedding_api_key="jina_dedicated",
            ai_api_key="groq_chat_key",
        )
        client = EmbeddingClient(settings)
        assert client._headers()["Authorization"] == "Bearer jina_dedicated"

    def test_falls_back_to_ai_api_key_when_unset(self) -> None:
        # Regression guard: every other test in this file relies on exactly
        # this fallback, since none of them set knowledge_embedding_api_key.
        settings = _settings(ai_api_key="groq_chat_key")
        client = EmbeddingClient(settings)
        assert client._headers()["Authorization"] == "Bearer groq_chat_key"

    def test_no_key_at_all_omits_the_header(self) -> None:
        settings = _settings()
        client = EmbeddingClient(settings)
        assert "Authorization" not in client._headers()


class TestConfiguredGate:
    def test_configured_when_base_url_and_model_are_set_directly(self) -> None:
        settings = _settings()
        assert EmbeddingClient(settings).configured is True

    def test_configured_via_ai_base_url_fallback(self) -> None:
        # The documented fallback: only KNOWLEDGE_EMBEDDING_MODEL is set,
        # base URL is inherited from AI_BASE_URL. .base_url already resolves
        # this; .configured must consult it rather than the raw setting.
        settings = Settings(
            knowledge_embedding_base_url="",
            knowledge_embedding_model="jina-embeddings-v3",
            ai_base_url="https://api.groq.com/openai/v1",
        )
        assert EmbeddingClient(settings).configured is True

    def test_not_configured_when_neither_base_url_is_set(self) -> None:
        settings = Settings(knowledge_embedding_model="jina-embeddings-v3")
        assert EmbeddingClient(settings).configured is False

    def test_not_configured_without_a_model(self) -> None:
        settings = Settings(knowledge_embedding_base_url="https://api.jina.ai/v1")
        assert EmbeddingClient(settings).configured is False


class TestBatching:
    def test_large_input_is_split_into_batches(self) -> None:
        server = _Server()
        settings = _settings(knowledge_embedding_batch=2)
        client = EmbeddingClient(settings, opener=server)

        texts = ["a", "b", "c", "d", "e"]
        vectors = client.embed(texts)

        # Verify request batching.
        assert len(vectors) == 5
        # 5 textos, lote de 2 -> 3 requisições (2, 2, 1), nunca uma só.
        assert len(server.requests) == 3
        assert [len(r["input"]) for r in server.requests] == [2, 2, 1]

        # Verify each batch contains the expected slice of texts.
        assert server.requests[0]["input"] == ["a", "b"]
        assert server.requests[1]["input"] == ["c", "d"]
        assert server.requests[2]["input"] == ["e"]

        # Verify output vectors match input texts in order.
        for i, text in enumerate(texts):
            assert vectors[i] == pytest.approx(_expected_vector(text))

    def test_vectors_stay_in_input_order_across_batches(self) -> None:
        settings = _settings(knowledge_embedding_batch=1)
        client = EmbeddingClient(settings, opener=_Server())
        texts = ["x", "y", "z"]
        vectors = client.embed(texts)

        # Verify order is preserved: each vector matches its corresponding input text.
        # _Server returns [ord(text[0]), 1.0, 0.0] for each text, L2-normalized.
        assert len(vectors) == 3
        for i, text in enumerate(texts):
            assert vectors[i] == pytest.approx(_expected_vector(text))

    def test_small_input_is_one_request(self) -> None:
        server = _Server()
        settings = _settings(knowledge_embedding_batch=96)
        client = EmbeddingClient(settings, opener=server)
        texts = ["a", "b", "c"]
        vectors = client.embed(texts)

        # Verify single request when input fits in one batch.
        assert len(server.requests) == 1
        assert server.requests[0]["input"] == texts

        # Verify output vectors match input texts in order.
        for i, text in enumerate(texts):
            assert vectors[i] == pytest.approx(_expected_vector(text))
