"""Selection of the configured AI provider.

One place decides whether the layer exists at all. Everything downstream either
gets a provider or an :class:`AIUnavailableError`; nothing has to reason about
configuration.
"""

from __future__ import annotations

from app.ai.mock import MockAIProvider
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

_PROVIDERS: dict[str, type[AIProvider]] = {
    "mock": MockAIProvider,
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
    return provider_class()


def disclaimer_for(provider: AIProvider) -> str:
    """The notice shown alongside every AI output."""
    return f"{DISCLAIMER} {SIMULATED_NOTE}" if provider.simulated else DISCLAIMER
