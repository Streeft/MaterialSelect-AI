"""Selection of the configured AI provider.

One place decides whether the layer exists at all. Everything downstream either
gets a provider or an :class:`AIUnavailableError`; nothing has to reason about
configuration.
"""

from __future__ import annotations

from app.ai.claude_api import ClaudeAPIProvider
from app.ai.claude_cli import ClaudeCLIProvider
from app.ai.mock import MockAIProvider
from app.ai.openai_compat import OpenAICompatProvider
from app.ai.provider import AIProvider, AIUnavailableError
from app.config import Settings
from app.config import settings as default_settings

DISCLAIMER = (
    "Interpretação assistida por IA: sugestões editáveis, sem valor numérico "
    "produzido pela IA. Todo cálculo é determinístico no backend e todo critério "
    "passa pela sua revisão."
)

SIMULATED_NOTE = (
    "Provedor simulado: as sugestões vêm de regras determinísticas locais, sem "
    "nenhum serviço externo."
)

MODEL_NOTE = (
    "Provedor externo: a leitura vem de um modelo de linguagem e pode variar entre "
    "execuções com o mesmo enunciado. O cálculo não varia — ele não passa por aqui."
)

_PROVIDERS: dict[str, type[AIProvider]] = {
    "mock": MockAIProvider,
    "claude-api": ClaudeAPIProvider,
    "claude-cli": ClaudeCLIProvider,
    "openai-compat": OpenAICompatProvider,
}


def get_provider(settings: Settings = default_settings) -> AIProvider:
    """Return the configured provider.

    Raises:
        AIUnavailableError: when the layer is switched off, or when the
            configured name is unknown. Failing loudly here is deliberate: a
            silent fallback to the simulated provider would let a deployment
            believe it was talking to a model when it was not.
    """
    name = settings.ai_provider.strip().lower()
    if not name:
        raise AIUnavailableError(
            "A camada de IA está desativada. Defina AI_PROVIDER para habilitá-la; "
            "o restante do sistema funciona integralmente sem ela."
        )
    provider_class = _PROVIDERS.get(name)
    if provider_class is None:
        raise AIUnavailableError(
            f"Provedor de IA desconhecido: '{settings.ai_provider}'. "
            f"Disponíveis: {', '.join(sorted(_PROVIDERS))}."
        )
    return provider_class.from_settings(settings)


def disclaimer_for(provider: AIProvider) -> str:
    """The notice shown alongside every AI output.

    A real provider gets its own sentence rather than merely losing the
    simulated one: non-determinism is a property the reader has to be told
    about, not one they should infer from an absence. A provider that can point
    anywhere adds a third sentence naming where the text actually goes — the
    user is the one deciding what to type into it, so the user is the one who
    has to be told.
    """
    parts = [DISCLAIMER, SIMULATED_NOTE if provider.simulated else MODEL_NOTE, provider.data_note]
    return " ".join(part for part in parts if part)
