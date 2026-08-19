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
import urllib.error
import urllib.request
from typing import Any

from app.ai.model_base import ModelProviderBase, parse_json_object
from app.ai.provider import AIProvider, AIUnavailableError
from app.config import Settings
from app.config import settings as default_settings

# Endpoints known to work with this provider, shown when no base URL is set.
# The error a misconfiguration produces is the only documentation anyone reads,
# so it carries the URLs rather than pointing at a file that carries them.
KNOWN_ENDPOINTS = (
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


class OpenAICompatProvider(ModelProviderBase):
    """A model behind an OpenAI-compatible ``/chat/completions`` endpoint."""

    name = "openai-compat"
    simulated = False

    def __init__(self, settings: Settings = default_settings, opener: Any | None = None) -> None:
        self.settings = settings
        # Injectable so the request can be exercised without a network call.
        self._opener = opener

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

        return parse_json_object(_strip_fence(_answer_of(self._post(body))))

    def _json_mode(self) -> str:
        mode = self.settings.ai_json_mode.strip().lower() or "schema"
        if mode not in JSON_MODES:
            raise AIUnavailableError(
                f"AI_JSON_MODE inválido: '{self.settings.ai_json_mode}'. "
                f"Use um de: {', '.join(JSON_MODES)}."
            )
        return mode

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
                payload = response.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            raise AIUnavailableError(self._http_message(exc)) from exc
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
        headers = {"Content-Type": "application/json"}
        key = self.settings.ai_api_key.strip()
        # No key is a supported state, not a degraded one: it is how a local
        # server is addressed. Sending an empty bearer would turn "no
        # authentication needed" into "authentication failed".
        if key:
            headers["Authorization"] = f"Bearer {key}"
        return headers

    def _http_message(self, exc: urllib.error.HTTPError) -> str:
        detail = _detail_of(exc)
        if exc.code in (401, 403):
            return (
                f"O servidor recusou a credencial ({exc.code}). Defina AI_API_KEY com "
                "uma chave válida para AI_BASE_URL — ou aponte AI_BASE_URL para um "
                f"Ollama local, que não pede nenhuma. {detail}"
            ).strip()
        if exc.code == 404:
            return (
                f"Endpoint ou modelo não encontrado (404). Confira se AI_BASE_URL "
                f"termina na raiz da API (…/v1) e se AI_MODEL='{self.settings.ai_model}' "
                f"existe nesse servidor. {detail}"
            ).strip()
        if exc.code == 429:
            return (
                "Limite de requisições do plano gratuito atingido (429). Tente de novo "
                f"em instantes ou use AI_PROVIDER=mock, que não tem limite. {detail}"
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


def _host_of(base_url: str) -> str:
    """The host in an error message, never the path — a path can carry a key."""
    stripped = base_url.strip()
    if not stripped:
        return "o servidor configurado"
    without_scheme = stripped.split("://", 1)[-1]
    return without_scheme.split("/", 1)[0] or "o servidor configurado"
