"""EmbeddingClient: a chamada de rede que a busca semântica depende, sem rede
de verdade — mesmo padrão de test_ai_openai_compat.py (fake opener injetável).
"""

from __future__ import annotations

import io
import json
import math
import urllib.error
from dataclasses import dataclass

import pytest
from pydantic import ValidationError as PydanticValidationError

from app.config import Settings
from app.knowledge.embeddings import (
    EmbeddingClient,
    EmbeddingHttpError,
    EmbeddingUnavailableError,
    embedding_matches,
)


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


# --- dimensions (T0 / D-101) -------------------------------------------------


class _SizedServer:
    """Devolve vetores de ``size`` componentes, qualquer que seja o pedido."""

    def __init__(self, size: int) -> None:
        self.size = size
        self.requests: list[dict] = []

    def __call__(self, request: object, timeout: float | None = None) -> _Response:
        body = json.loads(request.data.decode("utf-8"))
        self.requests.append(body)
        vectors = [
            {"index": i, "embedding": [1.0] + [0.0] * (self.size - 1)}
            for i, _ in enumerate(body["input"])
        ]
        return _Response(json.dumps({"data": vectors}))


class TestDimensions:
    def test_setting_defaults_to_zero(self) -> None:
        assert Settings().knowledge_embedding_dimensions == 0

    def test_setting_is_read_from_the_environment(self, monkeypatch) -> None:
        monkeypatch.setenv("KNOWLEDGE_EMBEDDING_DIMENSIONS", "768")
        assert Settings().knowledge_embedding_dimensions == 768

    def test_negative_setting_is_refused(self) -> None:
        with pytest.raises(PydanticValidationError):
            Settings(knowledge_embedding_dimensions=-1)

    def test_client_exposes_the_setting(self) -> None:
        assert EmbeddingClient(_settings()).dimensions == 0
        assert EmbeddingClient(_settings(knowledge_embedding_dimensions=768)).dimensions == 768

    def test_dimensions_sent_when_positive(self) -> None:
        server = _SizedServer(768)
        client = EmbeddingClient(_settings(knowledge_embedding_dimensions=768), opener=server)
        vectors = client.embed(["a", "b"])
        assert server.requests[0]["dimensions"] == 768
        assert [len(v) for v in vectors] == [768, 768]

    def test_dimensions_absent_when_zero(self) -> None:
        server = _SizedServer(3)
        client = EmbeddingClient(_settings(knowledge_embedding_dimensions=0), opener=server)
        client.embed(["a"])
        assert "dimensions" not in server.requests[0]

    def test_dimensions_sent_on_every_batch(self) -> None:
        server = _SizedServer(4)
        settings = _settings(knowledge_embedding_dimensions=4, knowledge_embedding_batch=1)
        EmbeddingClient(settings, opener=server).embed(["a", "b", "c"])
        assert [r["dimensions"] for r in server.requests] == [4, 4, 4]

    def test_length_mismatch_raises(self) -> None:
        # Servidor que ignora o campo e responde no tamanho nativo do modelo.
        server = _SizedServer(3072)
        client = EmbeddingClient(_settings(knowledge_embedding_dimensions=768), opener=server)
        with pytest.raises(EmbeddingUnavailableError, match="ignorou dimensions=768") as info:
            client.embed(["a"])
        assert "3072" in str(info.value)
        # Não é um erro HTTP: a resposta veio, com o formato errado.
        assert not isinstance(info.value, EmbeddingHttpError)

    def test_any_length_accepted_when_zero(self) -> None:
        client = EmbeddingClient(_settings(), opener=_SizedServer(5))
        assert len(client.embed(["a"])[0]) == 5


# --- HTTP errors ---------------------------------------------------------------


def _http_error(
    code: int, payload: object = None, headers: dict | None = None, raw: str | None = None
) -> urllib.error.HTTPError:
    body = raw if raw is not None else json.dumps(payload if payload is not None else {})
    return urllib.error.HTTPError(
        "https://api.jina.ai/v1/embeddings",
        code,
        "erro",
        headers or {},  # type: ignore[arg-type]
        io.BytesIO(body.encode("utf-8")),
    )


class _Failing:
    def __init__(self, error: Exception) -> None:
        self.error = error

    def __call__(self, request: object, timeout: float | None = None) -> _Response:
        raise self.error


def _raised(error: Exception) -> EmbeddingHttpError:
    client = EmbeddingClient(_settings(), opener=_Failing(error))
    with pytest.raises(EmbeddingHttpError) as info:
        client.embed(["a"])
    return info.value


def _gemini_429(message: str, *details: dict) -> list[dict]:
    """O corpo que o endpoint OpenAI-compatível do Gemini devolve: numa lista."""
    return [
        {
            "error": {
                "code": 429,
                "message": message,
                "status": "RESOURCE_EXHAUSTED",
                "details": list(details),
            }
        }
    ]


def _quota_failure(quota_id: str) -> dict:
    return {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        "violations": [
            {
                "quotaMetric": "generativelanguage.googleapis.com/embed_content_free_tier_requests",
                "quotaId": quota_id,
                "quotaValue": "100",
            }
        ],
    }


def _retry_info(delay: str) -> dict:
    return {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": delay}


class TestHttpError:
    def test_is_still_the_unavailable_error(self) -> None:
        # Quem cai para a via léxica pega EmbeddingUnavailableError; isso não muda.
        error = _raised(_http_error(500, {"error": {"message": "boom"}}))
        assert isinstance(error, EmbeddingUnavailableError)
        assert error.status == 500

    @pytest.mark.parametrize(
        ("code", "expected"),
        [
            (401, "O servidor de embeddings recusou a credencial (401). Defina AI_API_KEY"),
            (403, "O servidor de embeddings recusou a credencial (403)."),
            (404, "Endpoint ou modelo de embeddings não encontrado (404)."),
            (429, "Limite de requisições atingido ao gerar embeddings (429). Reduza"),
            (503, "O servidor de embeddings respondeu com erro 503. motivo"),
        ],
    )
    def test_messages_are_unchanged(self, code: int, expected: str) -> None:
        error = _raised(_http_error(code, {"error": {"message": "motivo"}}))
        assert error.status == code
        assert expected in str(error)
        assert str(error).endswith("motivo")
        assert error.detail == "motivo"

    def test_list_wrapped_gemini_body_gives_its_detail(self) -> None:
        error = _raised(_http_error(404, [{"error": {"message": "models/x is not found"}}]))
        assert str(error).endswith("models/x is not found")

    def test_non_json_body_is_the_detail(self) -> None:
        error = _raised(_http_error(502, raw="Bad Gateway"))
        assert str(error) == "O servidor de embeddings respondeu com erro 502. Bad Gateway"
        assert error.retry_after is None
        assert error.daily is False

    def test_no_hint_means_no_retry_after(self) -> None:
        error = _raised(_http_error(429, {"error": {"message": "slow down"}}))
        assert error.retry_after is None
        assert error.daily is False

    def test_retry_after_header(self) -> None:
        error = _raised(_http_error(429, {}, headers={"Retry-After": "12"}))
        assert error.retry_after == 12.0

    def test_retry_after_header_wins_over_body(self) -> None:
        payload = _gemini_429("Please retry in 37.5s.", _retry_info("40s"))
        error = _raised(_http_error(429, payload, headers={"Retry-After": "3"}))
        assert error.retry_after == 3.0

    def test_http_date_header_falls_through_to_the_body(self) -> None:
        payload = _gemini_429("Please retry in 37.5s.")
        headers = {"Retry-After": "Wed, 30 Sep 2026 07:28:00 GMT"}
        assert _raised(_http_error(429, payload, headers=headers)).retry_after == 37.5

    def test_retry_delay_from_retry_info(self) -> None:
        payload = _gemini_429("Quota exceeded.", _retry_info("37s"))
        assert _raised(_http_error(429, payload)).retry_after == 37.0

    def test_retry_delay_wins_over_the_message(self) -> None:
        payload = _gemini_429("Please retry in 37.5s.", _retry_info("40s"))
        assert _raised(_http_error(429, payload)).retry_after == 40.0

    def test_retry_in_from_the_message(self) -> None:
        payload = _gemini_429("Quota exceeded for metric ... Please retry in 37.5s.")
        assert _raised(_http_error(429, payload)).retry_after == 37.5

    def test_retry_in_past_the_displayed_cut(self) -> None:
        # O detalhe mostrado é cortado em 300 caracteres; a espera não pode ser.
        payload = _gemini_429("x" * 400 + " Please retry in 8s.")
        error = _raised(_http_error(429, payload))
        assert len(error.detail) == 300
        assert error.retry_after == 8.0

    def test_per_minute_quota_is_not_daily(self) -> None:
        payload = _gemini_429(
            "Please retry in 37.5s.",
            _quota_failure("EmbedContentRequestsPerMinutePerProjectPerModel-FreeTier"),
            _retry_info("37s"),
        )
        error = _raised(_http_error(429, payload))
        assert error.daily is False
        assert error.retry_after == 37.0

    def test_per_day_quota_id_is_daily(self) -> None:
        payload = _gemini_429(
            "You exceeded your current quota.",
            _quota_failure("EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier"),
        )
        error = _raised(_http_error(429, payload))
        assert error.daily is True
        assert error.status == 429

    def test_per_day_in_the_message_is_daily(self) -> None:
        payload = {"error": {"message": "Limit of 1000 requests per day reached."}}
        assert _raised(_http_error(429, payload)).daily is True

    def test_malformed_details_are_ignored(self) -> None:
        payload = [{"error": {"message": "x", "details": ["?", {"violations": "?"}, 3]}}]
        error = _raised(_http_error(429, payload))
        assert error.retry_after is None
        assert error.daily is False


# --- embedding_matches ---------------------------------------------------------


@dataclass
class _Stored:
    model: str
    dimensions: int


class TestEmbeddingMatches:
    @pytest.mark.parametrize(
        ("stored", "model", "dims", "expected"),
        [
            (_Stored("gemini-embedding-001", 768), "gemini-embedding-001", 768, True),
            (_Stored("gemini-embedding-001", 3072), "gemini-embedding-001", 768, False),
            (_Stored("gemini-embedding-001", 3072), "gemini-embedding-001", 0, True),
            (_Stored("gemini-embedding-001", 768), "gemini-embedding-001", 0, True),
            (_Stored("nomic-embed-text", 768), "gemini-embedding-001", 768, False),
            (_Stored("nomic-embed-text", 768), "gemini-embedding-001", 0, False),
            (None, "gemini-embedding-001", 768, False),
            (None, "gemini-embedding-001", 0, False),
        ],
    )
    def test_table(self, stored, model: str, dims: int, expected: bool) -> None:
        assert embedding_matches(stored, model, dims) is expected

    def test_reads_the_orm_row(self) -> None:
        from app.models.knowledge import KnowledgeEmbedding

        row = KnowledgeEmbedding(chunk_id=1, model="m", dimensions=768, vector=b"")
        assert embedding_matches(row, "m", 768) is True
        assert embedding_matches(row, "m", 1536) is False
