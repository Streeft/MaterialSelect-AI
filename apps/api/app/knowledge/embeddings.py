"""Vectors for semantic retrieval, from an OpenAI-compatible ``/embeddings``.

Same shape as :mod:`app.ai.openai_compat` and for the same reasons: the request
is built with :mod:`urllib.request` from the standard library, so the semantic
path costs the project no dependency, and an empty key is a valid configuration
because that is how a local Ollama is addressed.

**Why a separate base URL exists.** ``KNOWLEDGE_EMBEDDING_BASE_URL`` falls back
to ``AI_BASE_URL`` and will usually be left empty — but not always, and the most
likely case is the one the documentation recommends: Groq is the free chat
provider named in ``KNOWN_ENDPOINTS`` and it serves no embeddings endpoint at
all. Forcing both through one variable would mean the cheapest chat setup
cannot have semantic retrieval, which is precisely the combination this project
should support.

**Vectors are stored L2-normalised.** Cosine similarity between unit vectors is
their dot product, so normalising once at write time removes two square roots
from every comparison at read time, and the stored number means one thing
regardless of which model produced it. The dimension is stored alongside so a
vector from a different model is detected rather than silently compared.

Packed little-endian via :mod:`struct` and not :class:`array.array`, whose
layout follows the machine. A database file written on one host and read on
another must not depend on that.
"""

from __future__ import annotations

import json
import math
import struct
import urllib.error
import urllib.request
from typing import Any

from app.config import Settings
from app.config import settings as default_settings
from app.domain.errors import ValidationError

#: Endpoints known to serve embeddings, shown when none is configured. Groq is
#: absent because it does not offer one — the whole reason this setting is
#: separate from AI_BASE_URL.
KNOWN_EMBEDDING_ENDPOINTS = (
    "  Ollama (local, nenhuma credencial, funciona sem internet):\n"
    "    KNOWLEDGE_EMBEDDING_BASE_URL=http://localhost:11434/v1\n"
    "    KNOWLEDGE_EMBEDDING_MODEL=nomic-embed-text\n"
    "  OpenAI:\n"
    "    KNOWLEDGE_EMBEDDING_BASE_URL=https://api.openai.com/v1\n"
    "    KNOWLEDGE_EMBEDDING_MODEL=text-embedding-3-small\n"
    "  Voyage / Jina / OpenRouter e afins: qualquer servidor com /embeddings.\n"
    "  A Groq não serve embeddings — por isso esta variável é separada de AI_BASE_URL."
)


class EmbeddingUnavailableError(ValidationError):
    """The semantic path is off or unreachable.

    A subclass of :class:`ValidationError` so it travels the same way as every
    other configuration problem, but its own type so retrieval can catch exactly
    this and fall back to the lexical path — declaring the fallback rather than
    hiding it.
    """


def pack_vector(values: list[float]) -> bytes:
    """Serialise a vector, little-endian float32, after normalising it."""
    return struct.pack(f"<{len(values)}f", *normalise(values))


def unpack_vector(blob: bytes) -> list[float]:
    """Read back a vector written by :func:`pack_vector`."""
    count, remainder = divmod(len(blob), 4)
    if remainder:
        raise ValidationError("Vetor corrompido: o tamanho não é múltiplo de 4 bytes.")
    return list(struct.unpack(f"<{count}f", blob))


def normalise(values: list[float]) -> list[float]:
    """Scale a vector to unit length; a zero vector is returned unchanged.

    A zero vector has no direction to preserve, and dividing by its norm would
    raise. It scores 0 against everything, which is the right answer for a
    passage the model had nothing to say about.
    """
    norm = math.sqrt(sum(value * value for value in values))
    if norm == 0.0:
        return list(values)
    return [value / norm for value in values]


def similarity(left: list[float], right: list[float]) -> float:
    """Cosine similarity of two stored (already unit-length) vectors.

    Raises:
        ValidationError: the dimensions differ, which means the two vectors came
            from different models. Comparing them would produce a number that
            looks like a similarity and is not.
    """
    if len(left) != len(right):
        raise ValidationError(
            f"Vetores de dimensões diferentes ({len(left)} e {len(right)}): "
            "provavelmente de modelos diferentes."
        )
    return sum(a * b for a, b in zip(left, right, strict=True))


class EmbeddingClient:
    """A model behind an OpenAI-compatible ``/embeddings`` endpoint."""

    def __init__(self, settings: Settings = default_settings, opener: Any | None = None) -> None:
        self.settings = settings
        # Injectable so the request can be exercised without a network call.
        self._opener = opener

    @property
    def model(self) -> str:
        return self.settings.knowledge_embedding_model.strip()

    @property
    def base_url(self) -> str:
        """The embedding endpoint's root, falling back to the chat provider's."""
        configured = self.settings.knowledge_embedding_base_url.strip()
        return configured or self.settings.ai_base_url.strip()

    @property
    def configured(self) -> bool:
        """Whether embeddings can be attempted at all.

        The single place this decision is made — through :attr:`base_url`, so
        the AI_BASE_URL fallback documented above actually takes effect for
        every caller that gates on this, instead of each caller duplicating
        the raw-setting check and missing the fallback.
        """
        return bool(self.base_url and self.settings.knowledge_embedding_model.strip())

    def host(self) -> str:
        """The host, for a message shown to a user — never the path.

        A gateway path can carry a token; the host cannot.
        """
        stripped = self.base_url
        if not stripped:
            return "o servidor configurado"
        without_scheme = stripped.split("://", 1)[-1]
        return without_scheme.split("/", 1)[0] or "o servidor configurado"

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

    # --- transport --------------------------------------------------------

    def _model_or_fail(self) -> str:
        if not self.model:
            raise EmbeddingUnavailableError(
                "A busca semântica precisa de KNOWLEDGE_EMBEDDING_MODEL. Sem ela a "
                "recuperação usa apenas a via léxica, que não depende de rede. "
                "Opções conhecidas:\n" + KNOWN_EMBEDDING_ENDPOINTS
            )
        return self.model

    def _endpoint(self) -> str:
        base = self.base_url.rstrip("/")
        if not base:
            raise EmbeddingUnavailableError(
                "A busca semântica precisa de KNOWLEDGE_EMBEDDING_BASE_URL (ou de "
                "AI_BASE_URL, do qual ela herda). Nenhum dos dois tem padrão: um "
                "padrão escolheria um fornecedor por você. Opções conhecidas:\n"
                + KNOWN_EMBEDDING_ENDPOINTS
            )
        if not base.startswith(("http://", "https://")):
            raise EmbeddingUnavailableError(
                f"A URL de embeddings precisa começar com http:// ou https://: '{base}'"
            )
        return f"{base}/embeddings"

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        # KNOWLEDGE_EMBEDDING_API_KEY, when set, is for an embeddings
        # provider distinct from the chat one (e.g. Groq for chat, which has
        # no /embeddings endpoint, paired with Jina for embeddings) — it
        # takes priority. Empty falls back to AI_API_KEY, the historical
        # (and still most common) behaviour: one provider serving both.
        key = self.settings.knowledge_embedding_api_key.strip() or self.settings.ai_api_key.strip()
        # No key is a supported state, not a degraded one: it is how a local
        # server is addressed. An empty bearer would turn "no authentication
        # needed" into "authentication failed".
        if key:
            headers["Authorization"] = f"Bearer {key}"
        return headers

    def _post(self, body: dict) -> dict:
        request = urllib.request.Request(
            self._endpoint(),
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers=self._headers(),
            method="POST",
        )
        opener = self._opener or urllib.request.urlopen
        try:
            with opener(request, timeout=self.settings.ai_timeout_seconds) as response:
                raw = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            raise EmbeddingUnavailableError(self._http_message(exc)) from exc
        except TimeoutError as exc:
            raise EmbeddingUnavailableError(
                f"O servidor de embeddings não respondeu em "
                f"{self.settings.ai_timeout_seconds:g}s. Aumente AI_TIMEOUT_SECONDS "
                "ou reduza KNOWLEDGE_EMBEDDING_BATCH."
            ) from exc
        except urllib.error.URLError as exc:
            raise EmbeddingUnavailableError(
                f"Não foi possível falar com {self.host()}: {exc.reason}. Verifique a "
                "URL de embeddings e a rede — se o servidor for local, verifique se "
                "ele está no ar."
            ) from exc
        except OSError as exc:
            raise EmbeddingUnavailableError(f"Falha de rede ao pedir embeddings: {exc}") from exc

        try:
            payload = json.loads(raw)
        except ValueError as exc:
            raise EmbeddingUnavailableError(
                f"O servidor de embeddings não devolveu JSON: {raw[:200]}"
            ) from exc
        if not isinstance(payload, dict):
            raise EmbeddingUnavailableError("O servidor de embeddings devolveu JSON inesperado.")
        return payload

    def _http_message(self, exc: urllib.error.HTTPError) -> str:
        detail = _detail_of(exc)
        if exc.code in (401, 403):
            return (
                f"O servidor de embeddings recusou a credencial ({exc.code}). Defina "
                f"AI_API_KEY com uma chave válida para {self.host()}. {detail}"
            ).strip()
        if exc.code == 404:
            return (
                f"Endpoint ou modelo de embeddings não encontrado (404). Confira se a "
                f"URL termina na raiz da API (…/v1) e se '{self.model}' existe nesse "
                f"servidor — a Groq, por exemplo, não serve /embeddings. {detail}"
            ).strip()
        if exc.code == 429:
            return (
                "Limite de requisições atingido ao gerar embeddings (429). Reduza "
                f"KNOWLEDGE_EMBEDDING_BATCH e tente de novo. {detail}"
            ).strip()
        return f"O servidor de embeddings respondeu com erro {exc.code}. {detail}".strip()


# --- reading the answer ----------------------------------------------------


def _vectors_of(payload: dict, expected: int) -> list[list[float]]:
    """The vectors, in the order the inputs were sent.

    The ``index`` field is honoured rather than trusted to be sorted: the
    protocol permits any order, and silently mismatching a vector to the wrong
    passage would poison every later search in a way nothing would ever flag.
    """
    data = payload.get("data")
    if not isinstance(data, list) or not data:
        error = payload.get("error")
        detail = error.get("message") if isinstance(error, dict) else error
        raise EmbeddingUnavailableError(
            f"O servidor de embeddings não devolveu vetores: {detail}"
            if detail
            else "O servidor de embeddings devolveu uma resposta sem vetores."
        )
    if len(data) != expected:
        raise EmbeddingUnavailableError(
            f"O servidor devolveu {len(data)} vetores para {expected} trechos."
        )

    ordered: list[list[float] | None] = [None] * expected
    for position, item in enumerate(data):
        if not isinstance(item, dict):
            raise EmbeddingUnavailableError("Vetor em formato inesperado na resposta.")
        index = item.get("index", position)
        if not isinstance(index, int) or not 0 <= index < expected:
            raise EmbeddingUnavailableError(f"Índice de vetor fora da faixa: {index!r}")
        vector = item.get("embedding")
        if not isinstance(vector, list) or not vector:
            raise EmbeddingUnavailableError("Vetor vazio ou ausente na resposta.")
        try:
            ordered[index] = [float(value) for value in vector]
        except (TypeError, ValueError) as exc:
            raise EmbeddingUnavailableError("Vetor com valor não numérico.") from exc

    if any(vector is None for vector in ordered):
        raise EmbeddingUnavailableError("O servidor repetiu um índice e omitiu outro.")
    return [vector for vector in ordered if vector is not None]


def _detail_of(exc: urllib.error.HTTPError) -> str:
    """The server's own explanation, when it sent one."""
    try:
        body = exc.read().decode("utf-8", errors="replace")
    except Exception:  # the body was already consumed, or never arrived
        return ""
    try:
        payload = json.loads(body)
    except ValueError:
        return body.strip()[:300]
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict):
        return str(error.get("message", ""))[:300]
    return str(error or "")[:300]
