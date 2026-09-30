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
import re
import struct
import urllib.error
import urllib.request
from typing import Any, Protocol

from app.config import Settings
from app.config import settings as default_settings
from app.domain.errors import ValidationError

#: Endpoints known to serve embeddings, shown when none is configured. Groq is
#: absent because it does not offer one — the whole reason this setting is
#: separate from AI_BASE_URL.
KNOWN_EMBEDDING_ENDPOINTS = (
    "  Gemini (gratuito pelo Google AI Studio; usa a mesma chave de AI_API_KEY):\n"
    "    KNOWLEDGE_EMBEDDING_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai\n"
    "    KNOWLEDGE_EMBEDDING_MODEL=gemini-embedding-001\n"
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


class EmbeddingHttpError(EmbeddingUnavailableError):
    """The embedding server answered with an HTTP error status.

    Still an :class:`EmbeddingUnavailableError` — with the same message as
    before — so every caller that falls back to the lexical path keeps doing
    so. The extra fields are for the one caller that has to *pace* itself
    against a quota (the nightly embedding run): whether to wait and retry, or
    stop until the quota resets.

    Attributes:
        status: the HTTP status code.
        retry_after: seconds the server asked to wait, when it said so — the
            ``Retry-After`` header, else Google's ``RetryInfo.retryDelay``,
            else a "retry in 37.5s" in the message. ``None`` when it did not.
        daily: the refusal names a per-day quota (Gemini's free tier). Waiting
            a minute does not help; only the next day does.
        detail: the server's own explanation, as shown in the message.
    """

    def __init__(
        self,
        message: str,
        *,
        status: int,
        retry_after: float | None = None,
        daily: bool = False,
        detail: str = "",
    ) -> None:
        super().__init__(message)
        self.status = status
        self.retry_after = retry_after
        self.daily = daily
        self.detail = detail


class _StoredEmbedding(Protocol):
    """What :func:`embedding_matches` reads: the identity a vector is stored with.

    Both ``KnowledgeEmbedding`` and the notebook embedding row have it.
    """

    model: str
    dimensions: int


def embedding_matches(embedding: _StoredEmbedding | None, model: str, dims: int) -> bool:
    """Whether a stored vector was produced by ``model`` at ``dims`` dimensions.

    The single definition of "this vector is current": used to decide which
    vectors are stale and must be re-embedded, and which stored vectors may be
    compared with a query vector at all. ``dims`` 0 means the dimension was not
    requested, so any dimension from that model matches — the configuration in
    which the model's native size is what gets stored.

    ``None`` (a chunk never embedded) never matches, so callers can pass
    ``chunk.embedding`` directly.
    """
    if embedding is None:
        return False
    if embedding.model != model:
        return False
    return dims == 0 or embedding.dimensions == dims


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
    def dimensions(self) -> int:
        """Dimensions requested of the model; 0 = not requested (native size)."""
        return max(0, self.settings.knowledge_embedding_dimensions)

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
            EmbeddingHttpError: the server answered with an HTTP error status
                (a subclass of the next one, so catching that still works).
            EmbeddingUnavailableError: the layer is unconfigured, the server
                refused, or the answer did not have the promised shape —
                including vectors of a size other than the one requested.
        """
        if not texts:
            return []

        batch_size = max(1, self.settings.knowledge_embedding_batch)
        dimensions = self.dimensions
        vectors: list[list[float]] = []
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            body: dict[str, Any] = {"model": self._model_or_fail(), "input": batch}
            # Sent only when asked for: a server that does not know the field
            # may reject it, and 0 means "the model's own size".
            if dimensions > 0:
                body["dimensions"] = dimensions
            payload = self._post(body)
            batch_vectors = _vectors_of(payload, expected=len(batch))
            if dimensions > 0:
                _check_dimensions(batch_vectors, dimensions)
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
            raise self._http_error(exc) from exc
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

    def _http_error(self, exc: urllib.error.HTTPError) -> EmbeddingHttpError:
        """The error to raise for an HTTP status, with what pacing needs to know.

        The body is read once here: an :class:`~urllib.error.HTTPError` body is
        a stream, and a second read would find it empty.
        """
        detail, message, error = _error_body(exc)
        return EmbeddingHttpError(
            self._http_message(exc.code, detail),
            status=exc.code,
            retry_after=_retry_after_of(exc, message, error),
            daily=_is_daily_quota(message, error),
            detail=detail,
        )

    def _http_message(self, code: int, detail: str) -> str:
        if code in (401, 403):
            return (
                f"O servidor de embeddings recusou a credencial ({code}). Defina "
                f"AI_API_KEY com uma chave válida para {self.host()}. {detail}"
            ).strip()
        if code == 404:
            return (
                f"Endpoint ou modelo de embeddings não encontrado (404). Confira se a "
                f"URL termina na raiz da API (…/v1) e se '{self.model}' existe nesse "
                f"servidor — a Groq, por exemplo, não serve /embeddings. {detail}"
            ).strip()
        if code == 429:
            return (
                "Limite de requisições atingido ao gerar embeddings (429). Reduza "
                f"KNOWLEDGE_EMBEDDING_BATCH e tente de novo. {detail}"
            ).strip()
        return f"O servidor de embeddings respondeu com erro {code}. {detail}".strip()


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


def _check_dimensions(vectors: list[list[float]], dimensions: int) -> None:
    """Refuse vectors of a size other than the one requested.

    A server that does not honour ``dimensions`` answers at the model's native
    size without saying so. Storing those under a configuration that promised
    another size would mix two sizes in one table — and a mixed table is one
    the similarity comparison cannot use.
    """
    for vector in vectors:
        if len(vector) != dimensions:
            raise EmbeddingUnavailableError(
                f"O servidor de embeddings ignorou dimensions={dimensions}: devolveu "
                f"vetores de {len(vector)} dimensões. Use um modelo que aceite "
                "reduzir a dimensão ou defina KNOWLEDGE_EMBEDDING_DIMENSIONS=0 "
                "(não enviar)."
            )


def _detail_of(exc: urllib.error.HTTPError) -> str:
    """The server's own explanation, when it sent one."""
    return _error_body(exc)[0]


def _error_body(exc: urllib.error.HTTPError) -> tuple[str, str, object]:
    """Read an error body once: ``(detail, full message, error object)``.

    ``detail`` is the explanation shown to a user, cut at 300 characters; the
    full message is kept apart because the "retry in 37.5s" that pacing needs
    can sit past that cut. The error object is Gemini's structured error, when
    there is one, for its ``details`` list.
    """
    try:
        body = exc.read().decode("utf-8", errors="replace")
    except Exception:  # the body was already consumed, or never arrived
        return "", "", None
    try:
        payload = json.loads(body)
    except ValueError:
        return body.strip()[:300], body, None
    # Gemini wraps the error object in a list; see openai_compat.error_object.
    if isinstance(payload, list) and payload:
        payload = payload[0]
    error = payload.get("error") if isinstance(payload, dict) else None
    if isinstance(error, dict):
        message = str(error.get("message", ""))
        return message[:300], message, error
    message = str(error or "")
    return message[:300], message, error


#: "Please retry in 37.5s." — how Gemini words the wait in a 429 message.
_RETRY_IN = re.compile(r"retry in ([\d.]+)s", re.IGNORECASE)
#: A protobuf Duration as JSON: ``"37s"``, ``"1.5s"``.
_DURATION = re.compile(r"^\s*([\d.]+)s\s*$")
#: A quota counted per day, named in a quota id (``…PerDay…``) or in prose.
_PER_DAY = re.compile(r"PerDay|per day", re.IGNORECASE)


def _seconds(value: object) -> float | None:
    try:
        seconds = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return max(seconds, 0.0) if math.isfinite(seconds) else None


def _details_of(error: object) -> list[dict]:
    """The ``details`` list of a Google RPC error, dictionaries only."""
    if not isinstance(error, dict):
        return []
    details = error.get("details")
    if not isinstance(details, list):
        return []
    return [item for item in details if isinstance(item, dict)]


def _retry_after_of(exc: urllib.error.HTTPError, message: str, error: object) -> float | None:
    """Seconds the server asked to wait, from the first place that says so.

    ``Retry-After`` (numeric form only), then ``google.rpc.RetryInfo``'s
    ``retryDelay``, then the prose of the message. ``None`` when none does —
    a caller then chooses its own wait instead of reading 0 as "right now".
    """
    headers = getattr(exc, "headers", None)
    header = headers.get("Retry-After") if headers is not None else None
    if header is not None:
        seconds = _seconds(str(header).strip())
        if seconds is not None:
            return seconds
    for item in _details_of(error):
        if not str(item.get("@type", "")).endswith("RetryInfo"):
            continue
        delay = item.get("retryDelay")
        match = _DURATION.match(delay) if isinstance(delay, str) else None
        if match:
            seconds = _seconds(match.group(1))
            if seconds is not None:
                return seconds
    match = _RETRY_IN.search(message)
    if match:
        return _seconds(match.group(1))
    return None


def _is_daily_quota(message: str, error: object) -> bool:
    """Whether the refusal names a per-day quota — in a quota id or in prose."""
    if _PER_DAY.search(message):
        return True
    for item in _details_of(error):
        violations = item.get("violations")
        if not isinstance(violations, list):
            continue
        for violation in violations:
            if not isinstance(violation, dict):
                continue
            for key in ("quotaId", "quotaMetric"):
                if _PER_DAY.search(str(violation.get(key, ""))):
                    return True
    return False
