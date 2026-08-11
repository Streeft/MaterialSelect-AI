"""Claude through the Anthropic Messages API, with the operator's own key.

The SDK is imported inside the call, not at module import: someone running the
deterministic product — or the CLI provider — should not have to install it.
When it is missing, the error names the extra to install, in the same voice as
every other configuration failure in this layer.

Structured output does the schema work server-side, so what comes back is
already the shape ``app/ai/prompts.py`` asked for. It is still parsed and
normalised like any other provider output, and it still passes through the
guardrails afterwards: being well-formed is not the same as being allowed.
"""

from __future__ import annotations

from typing import Any

from app.ai.claude_base import ClaudeProviderBase, parse_json_object
from app.ai.provider import AIProvider, AIUnavailableError
from app.config import Settings
from app.config import settings as default_settings


class ClaudeAPIProvider(ClaudeProviderBase):
    """Claude via ``POST /v1/messages``."""

    name = "claude-api"
    simulated = False

    def __init__(self, settings: Settings = default_settings, client: Any | None = None) -> None:
        self.settings = settings
        # Injectable so the request can be exercised in tests without a network
        # call and without the SDK installed.
        self._client = client

    @classmethod
    def from_settings(cls, settings: Settings) -> AIProvider:
        return cls(settings=settings)

    # --- transport --------------------------------------------------------

    def _complete(self, system: str, user: str, schema: dict) -> dict:
        # The client comes first on purpose: it is the only step that genuinely
        # needs the SDK, so it is where the "install the extra" error belongs.
        # With a client injected, this method runs with anthropic absent.
        client = self._get_client()
        anthropic = _error_types()
        try:
            response = client.messages.create(
                model=self.settings.ai_model or "claude-opus-5",
                max_tokens=self.settings.ai_max_output_tokens,
                system=system,
                messages=[{"role": "user", "content": user}],
                output_config={"format": {"type": "json_schema", "schema": schema}},
            )
        except anthropic.APITimeoutError as exc:
            raise AIUnavailableError(
                f"O modelo não respondeu em {self.settings.ai_timeout_seconds:g}s. "
                "Tente novamente ou aumente AI_TIMEOUT_SECONDS."
            ) from exc
        except anthropic.AuthenticationError as exc:
            raise AIUnavailableError(
                "Credencial da API da Anthropic ausente ou inválida. Defina "
                "ANTHROPIC_API_KEY (ou AI_API_KEY) — ou use AI_PROVIDER=claude-cli, "
                "que aproveita a sessão do Claude Code já autenticada."
            ) from exc
        except anthropic.PermissionDeniedError as exc:
            raise AIUnavailableError(
                "A credencial configurada não tem permissão para este modelo."
            ) from exc
        except anthropic.NotFoundError as exc:
            raise AIUnavailableError(
                f"Modelo não encontrado: '{self.settings.ai_model}'. Ajuste AI_MODEL."
            ) from exc
        except anthropic.RateLimitError as exc:
            raise AIUnavailableError(
                "Limite de requisições da API atingido. Tente de novo em instantes."
            ) from exc
        except anthropic.BadRequestError as exc:
            raise AIUnavailableError(f"A API recusou a requisição: {exc}") from exc
        except anthropic.APIConnectionError as exc:
            raise AIUnavailableError(
                "Não foi possível falar com a API da Anthropic. Verifique a rede."
            ) from exc
        except anthropic.APIStatusError as exc:
            raise AIUnavailableError(f"A API respondeu com erro: {exc}") from exc

        # Checked before the content is read: a refusal has no content worth
        # reading, and treating it as empty JSON would report the wrong problem.
        stop_reason = getattr(response, "stop_reason", None)
        if stop_reason == "refusal":
            raise AIUnavailableError(
                "O modelo recusou-se a responder a esta requisição; nada foi proposto."
            )
        if stop_reason == "max_tokens":
            raise AIUnavailableError(
                "A resposta do modelo foi truncada antes de fechar o JSON. "
                "Aumente AI_MAX_OUTPUT_TOKENS ou encurte o enunciado."
            )
        return parse_json_object(_text_of(response))

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        anthropic = _import_anthropic()
        try:
            self._client = anthropic.Anthropic(
                # Empty means "let the SDK resolve ANTHROPIC_API_KEY", which is
                # the better arrangement: the key never passes through settings.
                api_key=self.settings.ai_api_key.strip() or None,
                timeout=self.settings.ai_timeout_seconds,
                max_retries=2,
            )
        except Exception as exc:  # missing key, malformed base URL, ...
            raise AIUnavailableError(
                f"Não foi possível inicializar o cliente da Anthropic: {exc}"
            ) from exc
        return self._client


def _import_anthropic() -> Any:
    try:
        import anthropic
    except ModuleNotFoundError as exc:
        raise AIUnavailableError(
            "O provedor 'claude-api' precisa do pacote anthropic, que não é "
            'instalado por padrão. Instale com: pip install -e ".[ai]" — ou use '
            "AI_PROVIDER=mock, que não depende de nenhum serviço."
        ) from exc
    return anthropic


class _Unraisable(Exception):
    """Stand-in for an SDK exception class when the SDK is not installed.

    Nothing ever raises it, so ``except _Unraisable`` is inert. It exists so the
    translation block in ``_complete`` can be written once, against the SDK's
    class names, and still be *reachable* when ``anthropic`` is absent — which
    is exactly the case when a client is injected.
    """


class _NoSDKErrors:
    """Every attribute is an exception class that never fires."""

    def __getattr__(self, _name: str) -> type[BaseException]:
        return _Unraisable


def _error_types() -> Any:
    """The SDK's exception namespace, or an inert stand-in when it is absent.

    Absence is not an error here: the caller already has a working client, so
    there is nothing to install. Catching nothing is the correct behaviour —
    whatever the injected client raises reaches the caller unchanged instead of
    being translated into a message about an API that was never called.
    """
    try:
        import anthropic
    except ModuleNotFoundError:
        return _NoSDKErrors()
    return anthropic


def _text_of(response: Any) -> str:
    """Concatenate the text blocks, ignoring thinking and anything else."""
    parts = [
        str(getattr(block, "text", ""))
        for block in getattr(response, "content", [])
        if getattr(block, "type", "") == "text"
    ]
    return "".join(parts)
