"""Any server that speaks the OpenAI chat-completions protocol.

This is the provider for someone who does not have — and does not want to pay
for — an API key from a specific vendor. One implementation reaches Groq, Ollama
running on the machine, OpenRouter, Together, Cloudflare Workers AI, a corporate
gateway, and OpenAI itself, because they all accept the same
``POST {base_url}/chat/completions``. Which one is in use is a matter of two
environment variables, and none of them is a code change.

Two properties of this file are deliberate and worth keeping.

**No dependency.** The request is built with :mod:`urllib.request` from the
standard library. ``claude-api`` needs an SDK installed; this provider needs
nothing, so the cheapest way to run the AI layer is also the one with the fewest
moving parts. Nothing here justifies adding an HTTP client to a project that
does not otherwise make outbound requests.

**No credential is also a valid configuration.** With ``AI_API_KEY`` empty the
``Authorization`` header is simply not sent, which is exactly what a local
Ollama expects. That is the one arrangement in this whole layer where
authentication cannot fail, because there is none — and it is the reason this
provider exists alongside the two that talk to Claude.

What this provider does *not* relax: the model still only picks index slugs, the
catalogue still overwrites its answer, the caveats are still the backend's, and
every proposal still passes ``app/ai/guardrails.py``. Those live in
:mod:`app.ai.model_base` precisely so a new transport cannot forget them.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from typing import Any

from app import __version__
from app.ai.model_base import ModelProviderBase, parse_json_object
from app.ai.provider import AIProvider, AIUnavailableError
from app.config import Settings
from app.config import settings as default_settings

# Endpoints known to work with this provider, shown when no base URL is set.
# The error a misconfiguration produces is the only documentation anyone reads,
# so it carries the URLs rather than pointing at a file that carries them.
KNOWN_ENDPOINTS = (
    "  Gemini (gratuito pelo Google AI Studio, sem cartão; a IA oficial do projeto, D-93):\n"
    "    AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai\n"
    "    AI_MODEL=gemini-flash-latest\n"
    "  Groq (gratuito, cadastro sem cartão):\n"
    "    AI_BASE_URL=https://api.groq.com/openai/v1\n"
    "    AI_MODEL=openai/gpt-oss-20b\n"
    "  Ollama (local, nenhuma credencial, funciona sem internet):\n"
    "    AI_BASE_URL=http://localhost:11434/v1\n"
    "    AI_MODEL=llama3.1\n"
    "  OpenRouter:\n"
    "    AI_BASE_URL=https://openrouter.ai/api/v1\n"
    "  OpenAI:\n"
    "    AI_BASE_URL=https://api.openai.com/v1"
)

# Modes for constraining the answer's shape, in decreasing order of guarantee.
JSON_MODES = ("schema", "object", "prompt")

#: Statuses that say "the server is struggling right now", not "the request is
#: wrong". A free hosted model answers 503 "high demand" in bursts (Gemini,
#: 2026), and one click should not have to become three.
_TRANSIENT_STATUSES = frozenset({500, 502, 503, 504})
#: Waits before each new attempt, in seconds — two retries, short enough that
#: the whole call stays well inside the request timeout of the page.
_RETRY_DELAYS = (2.0, 5.0)
#: A ``Retry-After`` longer than this is not waited out inside a request; the
#: message tells the reader to try again later instead.
_MAX_RETRY_AFTER = 10.0


class OpenAICompatProvider(ModelProviderBase):
    """A model behind an OpenAI-compatible ``/chat/completions`` endpoint."""

    name = "openai-compat"
    simulated = False

    def __init__(
        self,
        settings: Settings = default_settings,
        opener: Any | None = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.settings = settings
        # Injectable so the request can be exercised without a network call.
        self._opener = opener
        # Injectable so a test of the retries does not wait for them.
        self._sleep = sleep

    @classmethod
    def from_settings(cls, settings: Settings) -> AIProvider:
        return cls(settings=settings)

    @property
    def data_note(self) -> str:
        """Where the statement goes — which is not obvious for this provider."""
        return (
            "O enunciado que você escrever é enviado a "
            f"{_host_of(self.settings.ai_base_url)}. Serviços gratuitos costumam "
            "reservar o direito de usar o conteúdo enviado para treinar seus "
            "modelos e de submetê-lo a revisão humana; verifique os termos do "
            "serviço configurado antes de digitar algo que não possa sair daqui. "
            "Um servidor local (Ollama) não envia nada para fora da máquina."
        )

    # --- transport --------------------------------------------------------

    def _complete(self, system: str, user: str, schema: dict) -> dict:
        mode = self._json_mode()
        # In every mode but "schema" the contract has to travel in words,
        # because the server will not enforce it.
        prompt = system if mode == "schema" else self.system_for(system, schema)

        body: dict[str, Any] = {
            "model": self.settings.ai_model or "openai/gpt-oss-20b",
            "messages": [
                {"role": "system", "content": prompt},
                {"role": "user", "content": user},
            ],
            # Not reproducibility — a hosted model has none to give — but the
            # closest thing available, and this task has no use for invention.
            "temperature": 0,
            # `max_tokens` and not `max_completion_tokens`: it is the field every
            # compatible server still accepts. Recent OpenAI models are the
            # exception, and they are not why this provider exists.
            "max_tokens": self.settings.ai_max_output_tokens,
        }
        if mode == "schema":
            body["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "resposta", "strict": True, "schema": schema},
            }
        elif mode == "object":
            body["response_format"] = {"type": "json_object"}

        try:
            payload = self._post(body)
        except _GenerationRejected:
            # The server checked the generated JSON against the schema and
            # threw it away (D-89). That is the model missing the shape once,
            # not the configuration being wrong: ask again, once. A second
            # miss is reported for what it is. `failed_generation` is never
            # salvaged — degrading the contract is the operator's call (D-36).
            try:
                payload = self._post(body)
            except _GenerationRejected as exc:
                raise AIUnavailableError(
                    (
                        "O modelo gerou uma resposta fora do formato pedido, mesmo após "
                        "uma nova tentativa. Não é configuração: tente de novo; se "
                        f"persistir, AI_JSON_MODE=object é a alternativa. {exc.detail}"
                    ).strip()
                ) from exc
        return parse_json_object(_strip_fence(_answer_of(payload)))

    def _json_mode(self) -> str:
        mode = self.settings.ai_json_mode.strip().lower() or "schema"
        if mode not in JSON_MODES:
            raise AIUnavailableError(
                f"AI_JSON_MODE inválido: '{self.settings.ai_json_mode}'. "
                f"Use um de: {', '.join(JSON_MODES)}."
            )
        return mode

    def _post(self, body: dict) -> dict:
        """One request, retried while the server says it is only overloaded.

        A transient status (``_TRANSIENT_STATUSES``) is asked again after a
        short wait, twice at most. Anything else — a wrong key, a missing
        model, a quota — is not going to change in five seconds, and is
        reported at once.
        """
        attempts = len(_RETRY_DELAYS) + 1
        for attempt in range(attempts):
            try:
                return self._post_once(body)
            except _Transient as exc:
                if attempt == attempts - 1 or exc.retry_after > _MAX_RETRY_AFTER:
                    raise AIUnavailableError(self._transient_message(exc, retried=attempt)) from exc
                self._sleep(max(_RETRY_DELAYS[attempt], exc.retry_after))
        raise AssertionError("unreachable")  # pragma: no cover

    def _transient_message(self, exc: _Transient, retried: int) -> str:
        tried = (
            f" O pedido foi repetido {retried} {'vez' if retried == 1 else 'vezes'}."
            if retried
            else ""
        )
        if exc.code == 503:
            return (
                "O modelo está sobrecarregado agora (503) — é passageiro e do lado "
                f"do servidor, não da configuração.{tried} Tente de novo em alguns "
                "minutos; se continuar, um modelo mais leve costuma ter menos fila "
                "(no Gemini, gemini-flash-lite-latest pelo workflow Provedor de IA). "
                f"Motivo do servidor: {exc.detail or 'não informado'}"
            ).strip()
        return (
            f"O servidor falhou ao responder ({exc.code}).{tried} Costuma ser "
            f"passageiro: tente de novo em alguns minutos. {exc.detail}"
        ).strip()

    def _post_once(self, body: dict) -> dict:
        request = urllib.request.Request(
            self._endpoint(),
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers=self._headers(),
            method="POST",
        )
        opener = self._opener or urllib.request.urlopen
        try:
            with opener(request, timeout=self.settings.ai_timeout_seconds) as response:
                payload = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            # The body can be read once, so it is read here and handed on.
            detail, generation_rejected = _error_of(exc)
            if exc.code == 400 and generation_rejected:
                raise _GenerationRejected(detail) from exc
            if exc.code in _TRANSIENT_STATUSES:
                raise _Transient(exc.code, detail, _retry_after(exc)) from exc
            raise AIUnavailableError(self._http_message(exc, detail)) from exc
        except TimeoutError as exc:
            raise AIUnavailableError(
                f"O servidor não respondeu em {self.settings.ai_timeout_seconds:g}s. "
                "Aumente AI_TIMEOUT_SECONDS ou use AI_PROVIDER=mock."
            ) from exc
        except urllib.error.URLError as exc:
            raise AIUnavailableError(
                f"Não foi possível falar com {_host_of(self.settings.ai_base_url)}: "
                f"{exc.reason}. Verifique AI_BASE_URL e a rede — se o servidor for "
                "local, verifique se ele está no ar."
            ) from exc
        except OSError as exc:
            raise AIUnavailableError(f"Falha de rede ao chamar o modelo: {exc}") from exc

        return parse_json_object(payload)

    def _endpoint(self) -> str:
        base = self.settings.ai_base_url.strip().rstrip("/")
        if not base:
            raise AIUnavailableError(
                "O provedor 'openai-compat' precisa de AI_BASE_URL, que não tem "
                "padrão de propósito: um padrão escolheria um fornecedor por "
                "você. Opções conhecidas:\n" + KNOWN_ENDPOINTS
            )
        if not base.startswith(("http://", "https://")):
            raise AIUnavailableError(
                f"AI_BASE_URL precisa começar com http:// ou https://: '{base}'"
            )
        return f"{base}/chat/completions"

    def _headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            # Without this, urllib announces itself as `Python-urllib/3.x`, and
            # a WAF in front of the API can refuse the request before the API
            # ever sees it. Groq sits behind Cloudflare, which answered 403 with
            # `error code: 1010` — "client signature banned" — and the provider
            # reported a rejected credential for a key that was perfectly good.
            # Identifying the caller is also plain HTTP hygiene: the server on
            # the other end is entitled to know who is talking to it.
            "User-Agent": f"MaterialSelect-AI/{__version__}",
        }
        key = self.settings.ai_api_key.strip()
        # No key is a supported state, not a degraded one: it is how a local
        # server is addressed. Sending an empty bearer would turn "no
        # authentication needed" into "authentication failed".
        if key:
            headers["Authorization"] = f"Bearer {key}"
        return headers

    def _http_message(self, exc: urllib.error.HTTPError, detail: str) -> str:
        if exc.code == 401:
            return (
                "O servidor recusou a credencial (401). Defina AI_API_KEY com uma "
                "chave válida para AI_BASE_URL — ou aponte AI_BASE_URL para um "
                f"Ollama local, que não pede nenhuma. {detail}"
            ).strip()
        if exc.code == 403:
            # 403 é ambíguo de propósito, e confundi-lo com 401 já custou tempo:
            # pode ser a API recusando a chave, mas também um intermediário (CDN
            # ou WAF) barrando o cliente antes de a API ver qualquer coisa. Um
            # detalhe que não tem a forma de erro da API — um código de CDN, uma
            # página HTML — é sinal do segundo caso, e aí trocar a chave não
            # resolve nada.
            return (
                "Acesso recusado (403). Pode ser a chave: confira AI_API_KEY para "
                "AI_BASE_URL. Mas 403 também vem de um intermediário (CDN/WAF) "
                "barrando o cliente antes da API — se o detalhe abaixo não tiver a "
                f"forma de um erro da API, é esse o caso, e a chave não é o problema. {detail}"
            ).strip()
        if exc.code == 404:
            # The model is the usual culprit — a retired or restricted model
            # answers 404 on a perfectly good URL (Gemini 2.5, for a new key,
            # in 2026) — and the server's own reason, below, says which.
            return (
                f"Modelo ou endpoint não encontrado (404). Confira se "
                f"AI_MODEL='{self.settings.ai_model}' está disponível para esta chave "
                f"e se AI_BASE_URL aponta para a raiz da API. Motivo do servidor: "
                f"{detail or 'não informado'}"
            ).strip()
        if exc.code == 429:
            # A free plan limits per minute *and* per day, and the reader cannot
            # tell which from a 429 alone — both are named, with what each means.
            return (
                "Limite de requisições do plano gratuito atingido (429): o limite por "
                "minuto volta em instantes; o diário, no dia seguinte. Tente de novo "
                f"em alguns minutos ou use AI_PROVIDER=mock, que não tem limite. {detail}"
            ).strip()
        if exc.code == 400:
            return (
                f"O servidor recusou a requisição (400). {detail} Se a queixa for sobre "
                "response_format ou json_schema, este modelo não suporta saída "
                "estruturada: defina AI_JSON_MODE=object ou AI_JSON_MODE=prompt."
            ).strip()
        return f"O servidor respondeu com erro {exc.code}. {detail}".strip()


# --- reading the answer ----------------------------------------------------


def _answer_of(payload: dict) -> str:
    """The assistant's text, or a stated reason why there is none."""
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        # A compatible server reports its own failures in this envelope too.
        error = payload.get("error")
        detail = error.get("message") if isinstance(error, dict) else error
        raise AIUnavailableError(
            f"O servidor não devolveu nenhuma resposta: {detail}"
            if detail
            else "O servidor devolveu uma resposta sem conteúdo."
        )

    first = choices[0] if isinstance(choices[0], dict) else {}
    reason = first.get("finish_reason")
    if reason == "length":
        raise AIUnavailableError(
            "A resposta do modelo foi truncada antes de fechar o JSON. "
            "Aumente AI_MAX_OUTPUT_TOKENS ou encurte o enunciado."
        )
    if reason == "content_filter":
        raise AIUnavailableError(
            "O filtro de conteúdo do servidor bloqueou a resposta; nada foi proposto."
        )

    message = first.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if isinstance(message, dict) and message.get("refusal"):
        raise AIUnavailableError(f"O modelo recusou-se a responder: {message['refusal']}"[:300])
    if isinstance(content, list):
        # Some servers answer with content parts instead of a plain string.
        content = "".join(str(part.get("text", "")) for part in content if isinstance(part, dict))
    if not isinstance(content, str) or not content.strip():
        raise AIUnavailableError("O modelo devolveu uma resposta vazia.")
    return content


def _strip_fence(text: str) -> str:
    """Drop a Markdown code fence around the object, if the model added one.

    Only the modes that ask for JSON in words need this, and it is the single
    liberty this provider takes with a reply: a fence is packaging, not content.
    Anything else that is not JSON still fails loudly in ``parse_json_object``.
    """
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    without_open = stripped.split("\n", 1)[1] if "\n" in stripped else ""
    closing = without_open.rfind("```")
    return (without_open[:closing] if closing != -1 else without_open).strip()


class _Transient(Exception):
    """A status that says the server is overloaded, not that the request is
    wrong — asked again by ``_post``."""

    def __init__(self, code: int, detail: str, retry_after: float) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.retry_after = retry_after


def _retry_after(exc: urllib.error.HTTPError) -> float:
    """``Retry-After`` in seconds when the server sent one as a number; 0 if not.

    The HTTP-date form is not parsed: a server that asks to be left alone
    until a given date is not one to wait for inside a request anyway.
    """
    headers = getattr(exc, "headers", None)
    value = headers.get("Retry-After") if headers is not None else None
    try:
        return max(float(value), 0.0) if value is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


class _GenerationRejected(Exception):
    """A 400 in which the server rejected the *generated* JSON against the
    schema — the model's miss, not a malformed request (D-89)."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


#: Error codes with which a server says the generation, not the request, failed
#: schema validation. Groq's is ``json_validate_failed``, sent together with the
#: rejected text under ``failed_generation``.
_GENERATION_REJECTED_CODES = {"json_validate_failed"}


def _error_of(exc: urllib.error.HTTPError) -> tuple[str, bool]:
    """The server's own explanation, and whether it says the generated JSON —
    rather than the request — failed the schema."""
    try:
        body = exc.read().decode("utf-8", errors="replace")
    except Exception:  # the body was already consumed, or never arrived
        return "", False
    try:
        payload = json.loads(body)
    except ValueError:
        return body.strip()[:300], False
    error = error_object(payload)
    if isinstance(error, dict):
        rejected = error.get("code") in _GENERATION_REJECTED_CODES or "failed_generation" in error
        return str(error.get("message", ""))[:300], rejected
    return str(error or "")[:300], False


def error_object(payload: object) -> object:
    """The ``error`` member of an error body, in either shape a server sends.

    OpenAI and Groq answer ``{"error": {...}}``. Gemini's OpenAI-compatible
    endpoint answers the same object **inside a list** — ``[{"error": {...}}]``
    — and reading only the first shape left every Gemini failure without its
    reason: a 404 said "model not found" and never which model, or why.
    """
    if isinstance(payload, list) and payload:
        payload = payload[0]
    return payload.get("error") if isinstance(payload, dict) else None


def _host_of(base_url: str) -> str:
    """The host in an error message, never the path — a path can carry a key."""
    stripped = base_url.strip()
    if not stripped:
        return "o servidor configurado"
    without_scheme = stripped.split("://", 1)[-1]
    return without_scheme.split("/", 1)[0] or "o servidor configurado"
