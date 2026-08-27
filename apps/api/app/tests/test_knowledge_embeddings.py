"""Embeddings: the wire format, the request, and the ways it is allowed to fail.

No test here reaches the network. The client takes an injectable opener for
exactly that reason, and what is being pinned down is the part that would
otherwise only be discovered in production: that a vector written on one machine
reads back the same on another, that a vector is never matched to the wrong
passage, and that a misconfiguration produces a sentence someone can act on
rather than a stack trace.
"""

from __future__ import annotations

import json
import struct
import urllib.error
from io import BytesIO
from typing import Any

import pytest

from app.config import Settings
from app.domain.errors import ValidationError
from app.knowledge.embeddings import (
    EmbeddingClient,
    EmbeddingUnavailableError,
    normalise,
    pack_vector,
    similarity,
    unpack_vector,
)


def _settings(**overrides: Any) -> Settings:
    base: dict[str, Any] = {
        "knowledge_embedding_model": "text-embedding-3-small",
        "knowledge_embedding_base_url": "https://exemplo.invalido/v1",
        "ai_api_key": "",
        "ai_timeout_seconds": 5.0,
    }
    base.update(overrides)
    return Settings(**base)


class _FakeResponse:
    def __init__(self, payload: str) -> None:
        self._body = BytesIO(payload.encode("utf-8"))

    def read(self) -> bytes:
        return self._body.read()

    def __enter__(self) -> _FakeResponse:
        return self

    def __exit__(self, *_exc: object) -> None:
        return None


def _opener_returning(payload: dict, captured: list[Any] | None = None):
    def opener(request: Any, timeout: float | None = None) -> _FakeResponse:
        if captured is not None:
            captured.append(request)
        return _FakeResponse(json.dumps(payload))

    return opener


def _opener_raising(exc: Exception):
    def opener(_request: Any, timeout: float | None = None) -> _FakeResponse:
        raise exc

    return opener


def _payload(*vectors: list[float]) -> dict:
    return {"data": [{"index": i, "embedding": v} for i, v in enumerate(vectors)]}


class TestWireFormat:
    def test_roundtrip_preserves_direction(self) -> None:
        restored = unpack_vector(pack_vector([3.0, 4.0]))
        assert restored == pytest.approx([0.6, 0.8])

    def test_packing_is_little_endian_regardless_of_machine(self) -> None:
        # A database written on one host and read on another must not depend on
        # the machine's byte order, which is what array.array would have given.
        assert pack_vector([1.0, 0.0]) == struct.pack("<2f", 1.0, 0.0)

    def test_stored_vectors_are_unit_length(self) -> None:
        # Because they are, cosine similarity is a plain dot product — two
        # square roots removed from every comparison at read time.
        restored = unpack_vector(pack_vector([5.0, 12.0]))
        assert sum(value * value for value in restored) == pytest.approx(1.0)

    def test_zero_vector_survives_normalisation(self) -> None:
        # It has no direction to preserve and dividing by its norm would raise.
        assert normalise([0.0, 0.0]) == [0.0, 0.0]

    def test_corrupt_blob_is_reported(self) -> None:
        with pytest.raises(ValidationError, match="múltiplo de 4"):
            unpack_vector(b"\x00\x01\x02")


class TestSimilarity:
    def test_identical_direction_scores_one(self) -> None:
        vector = unpack_vector(pack_vector([1.0, 1.0]))
        assert similarity(vector, vector) == pytest.approx(1.0)

    def test_orthogonal_scores_zero(self) -> None:
        assert similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)

    def test_mismatched_dimensions_refuse_to_compare(self) -> None:
        # Two models' vectors would produce a number that looks like a
        # similarity and is not.
        with pytest.raises(ValidationError, match="dimensões diferentes"):
            similarity([1.0, 0.0], [1.0, 0.0, 0.0])


class TestRequest:
    def test_posts_model_and_inputs_to_the_embeddings_endpoint(self) -> None:
        captured: list[Any] = []
        client = EmbeddingClient(
            _settings(), opener=_opener_returning(_payload([1.0, 0.0]), captured)
        )

        client.embed(["um trecho"])

        request = captured[0]
        assert request.full_url == "https://exemplo.invalido/v1/embeddings"
        body = json.loads(request.data.decode("utf-8"))
        assert body == {"model": "text-embedding-3-small", "input": ["um trecho"]}

    def test_no_key_sends_no_authorization_header(self) -> None:
        # An empty bearer would turn "no authentication needed" into
        # "authentication failed" — which is how a local Ollama is addressed.
        captured: list[Any] = []
        client = EmbeddingClient(
            _settings(ai_api_key=""), opener=_opener_returning(_payload([1.0]), captured)
        )
        client.embed(["x"])
        assert "Authorization" not in dict(captured[0].header_items())

    def test_key_is_sent_when_present(self) -> None:
        captured: list[Any] = []
        client = EmbeddingClient(
            _settings(ai_api_key="segredo"), opener=_opener_returning(_payload([1.0]), captured)
        )
        client.embed(["x"])
        headers = {name.lower(): value for name, value in captured[0].header_items()}
        assert headers["authorization"] == "Bearer segredo"

    def test_base_url_falls_back_to_the_chat_provider(self) -> None:
        client = EmbeddingClient(
            _settings(knowledge_embedding_base_url="", ai_base_url="http://localhost:11434/v1")
        )
        assert client.base_url == "http://localhost:11434/v1"

    def test_empty_input_never_reaches_the_network(self) -> None:
        client = EmbeddingClient(_settings(), opener=_opener_raising(AssertionError("chamou")))
        assert client.embed([]) == []

    def test_vectors_come_back_normalised(self) -> None:
        client = EmbeddingClient(_settings(), opener=_opener_returning(_payload([3.0, 4.0])))
        assert client.embed(["x"])[0] == pytest.approx([0.6, 0.8])


class TestAnswerOrdering:
    def test_out_of_order_indices_are_honoured(self) -> None:
        # The protocol permits any order. Trusting the list position would
        # silently attach a vector to the wrong passage, and nothing downstream
        # would ever flag it.
        payload = {
            "data": [
                {"index": 1, "embedding": [0.0, 1.0]},
                {"index": 0, "embedding": [1.0, 0.0]},
            ]
        }
        client = EmbeddingClient(_settings(), opener=_opener_returning(payload))
        assert client.embed(["a", "b"]) == [[1.0, 0.0], [0.0, 1.0]]

    def test_repeated_index_is_refused(self) -> None:
        payload = {
            "data": [
                {"index": 0, "embedding": [1.0, 0.0]},
                {"index": 0, "embedding": [0.0, 1.0]},
            ]
        }
        client = EmbeddingClient(_settings(), opener=_opener_returning(payload))
        with pytest.raises(EmbeddingUnavailableError, match="repetiu um índice"):
            client.embed(["a", "b"])

    def test_wrong_count_is_refused(self) -> None:
        client = EmbeddingClient(_settings(), opener=_opener_returning(_payload([1.0])))
        with pytest.raises(EmbeddingUnavailableError, match="1 vetores para 2"):
            client.embed(["a", "b"])


class TestConfigurationErrors:
    def test_missing_model_names_the_variable_and_the_alternatives(self) -> None:
        client = EmbeddingClient(_settings(knowledge_embedding_model=""))
        with pytest.raises(EmbeddingUnavailableError, match="KNOWLEDGE_EMBEDDING_MODEL"):
            client.embed(["x"])

    def test_missing_base_url_says_there_is_no_default(self) -> None:
        client = EmbeddingClient(_settings(knowledge_embedding_base_url="", ai_base_url=""))
        with pytest.raises(EmbeddingUnavailableError, match="Nenhum dos dois tem padrão"):
            client.embed(["x"])

    def test_url_without_scheme_is_refused(self) -> None:
        client = EmbeddingClient(_settings(knowledge_embedding_base_url="exemplo.invalido/v1"))
        with pytest.raises(EmbeddingUnavailableError, match="http://"):
            client.embed(["x"])


class TestFailureMessages:
    def _http_error(self, code: int, body: str = "{}") -> urllib.error.HTTPError:
        return urllib.error.HTTPError(
            url="https://exemplo.invalido/v1/embeddings",
            code=code,
            msg="erro",
            hdrs=None,  # type: ignore[arg-type]
            fp=BytesIO(body.encode("utf-8")),
        )

    def test_timeout_names_the_knob(self) -> None:
        client = EmbeddingClient(_settings(), opener=_opener_raising(TimeoutError()))
        with pytest.raises(EmbeddingUnavailableError, match="AI_TIMEOUT_SECONDS"):
            client.embed(["x"])

    def test_unreachable_host_is_named_without_its_path(self) -> None:
        # A gateway path can carry a token; the host cannot.
        client = EmbeddingClient(
            _settings(), opener=_opener_raising(urllib.error.URLError("recusado"))
        )
        with pytest.raises(EmbeddingUnavailableError, match="exemplo.invalido") as excinfo:
            client.embed(["x"])
        assert "/v1" not in str(excinfo.value)

    def test_401_tells_the_operator_which_key(self) -> None:
        client = EmbeddingClient(_settings(), opener=_opener_raising(self._http_error(401)))
        with pytest.raises(EmbeddingUnavailableError, match="AI_API_KEY"):
            client.embed(["x"])

    def test_404_mentions_that_groq_has_no_embeddings(self) -> None:
        # The most likely 404 in this project by a wide margin: the free chat
        # provider the docs recommend does not serve this endpoint.
        client = EmbeddingClient(_settings(), opener=_opener_raising(self._http_error(404)))
        with pytest.raises(EmbeddingUnavailableError, match="Groq"):
            client.embed(["x"])

    def test_429_suggests_a_smaller_batch(self) -> None:
        client = EmbeddingClient(_settings(), opener=_opener_raising(self._http_error(429)))
        with pytest.raises(EmbeddingUnavailableError, match="KNOWLEDGE_EMBEDDING_BATCH"):
            client.embed(["x"])

    def test_non_json_answer_is_quoted_back(self) -> None:
        client = EmbeddingClient(_settings(), opener=lambda *_a, **_k: _FakeResponse("<html>"))
        with pytest.raises(EmbeddingUnavailableError, match="não devolveu JSON"):
            client.embed(["x"])

    def test_server_error_envelope_is_surfaced(self) -> None:
        payload = {"error": {"message": "modelo desconhecido"}}
        client = EmbeddingClient(_settings(), opener=_opener_returning(payload))
        with pytest.raises(EmbeddingUnavailableError, match="modelo desconhecido"):
            client.embed(["x"])
