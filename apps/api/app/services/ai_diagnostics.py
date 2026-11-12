"""What the AI layer has configured, and whether it actually answers (D-228).

``capabilities`` reads the settings only — no call, cheap enough for every page
load. ``run_checks`` makes the smallest call of each kind: a JSON of two fields
from the model, the embedding of one word and, when configured, one web
search. Each is timed and reported in PT-BR, ok or not, without stopping at
the first failure — the point is to see all three at once.

Neither ever prints a key: a host is ``scheme://host`` cut to the host, and a
message from a server is the provider's own PT-BR text, which already omits it.
"""

from __future__ import annotations

import time
from collections.abc import Callable

from app.ai.google_quota import host_of, quota_message
from app.ai.provider import AIProvider, AIUnavailableError
from app.config import Settings
from app.integrations import gemini_search
from app.integrations.errors import ExternalUnavailableError
from app.knowledge.embeddings import EmbeddingClient, EmbeddingHttpError, EmbeddingUnavailableError
from app.schemas.ai import AICapabilityOut, AIDiagnosticCheckOut

_PROVIDER_HOSTS = {"claude-api": "api.anthropic.com", "claude-cli": "claude (CLI local)"}


def provider_model(settings: Settings, provider: AIProvider | None) -> str:
    if provider is None or provider.simulated:
        return ""
    return settings.ai_model.strip()


def provider_host(settings: Settings, provider: AIProvider | None) -> str:
    if provider is None or provider.simulated:
        return ""
    if provider.name == "openai-compat":
        return host_of(settings.ai_base_url)
    return _PROVIDER_HOSTS.get(provider.name, "")


def json_mode(settings: Settings, provider: AIProvider | None) -> str:
    if provider is None:
        return ""
    if provider.simulated:
        return "schema"
    effective = getattr(provider, "effective_json_mode", None)
    if callable(effective):
        try:
            return str(effective())
        except AIUnavailableError:
            return settings.ai_json_mode
    # The Claude providers enforce the schema with the tool/output contract.
    return "schema"


def capabilities(
    settings: Settings, provider: AIProvider | None, off_reason: str = ""
) -> list[AICapabilityOut]:
    """The four capabilities, each configured or not, with what to set if not."""
    enabled = provider is not None
    mode = json_mode(settings, provider)
    embeddings = EmbeddingClient(settings)
    web_on, web_reason = gemini_search.enabled(settings)
    if not web_on and not settings.web_search_provider.strip():
        web_reason = (
            "Desligada: defina WEB_SEARCH_PROVIDER=gemini (a chave é WEB_SEARCH_API_KEY, ou "
            "AI_API_KEY quando a IA já é o Gemini)."
        )
    if provider is not None and provider.simulated:
        text_detail = "Provedor simulado: regras locais, sem rede e sem cota."
    elif enabled:
        text_detail = (
            f"{provider.name} com o modelo {settings.ai_model or 'padrão'} em "
            f"{provider_host(settings, provider) or 'servidor local'}."
        )
    else:
        text_detail = off_reason or "Camada de IA desativada (AI_PROVIDER vazio)."
    strict = enabled and mode == "schema"
    if not enabled:
        json_detail = "Sem provedor de IA."
    elif strict:
        json_detail = "Saída validada por JSON Schema estrito no servidor do modelo."
    else:
        json_detail = (
            f"Modo {mode}: o formato vai descrito no pedido e o app confere a resposta "
            "(AI_JSON_MODE ou recusa do servidor)."
        )
    if embeddings.configured:
        dims = settings.knowledge_embedding_dimensions
        emb_detail = (
            f"{embeddings.model} em {embeddings.host()}"
            + (f", {dims} dimensões" if dims else "")
            + "."
        )
    else:
        emb_detail = (
            "Desligados: defina KNOWLEDGE_EMBEDDING_MODEL (no Gemini, gemini-embedding-001). "
            "A busca continua só léxica."
        )
    return [
        AICapabilityOut(key="texto", label="Texto", configured=enabled, detail=text_detail),
        AICapabilityOut(
            key="json_estrito", label="JSON estrito", configured=strict, detail=json_detail
        ),
        AICapabilityOut(
            key="embeddings",
            label="Embeddings",
            configured=embeddings.configured,
            detail=emb_detail,
        ),
        AICapabilityOut(
            key="busca_web",
            label="Busca na web",
            configured=web_on,
            detail=(
                f"Grounding do Google com o modelo {settings.web_search_model}."
                if web_on
                else web_reason or gemini_search.OFF_REASON
            ),
        ),
    ]


def _ms(started: float) -> int:
    return max(0, round((time.monotonic() - started) * 1000))


def check_json(
    settings: Settings, provider: AIProvider | None, off_reason: str
) -> AIDiagnosticCheckOut:
    label = "Texto e JSON"
    if provider is None:
        return AIDiagnosticCheckOut(
            key="json", label=label, status="nao_configurado", message=off_reason
        )
    started = time.monotonic()
    try:
        provider.probe()
    except AIUnavailableError as exc:
        return AIDiagnosticCheckOut(
            key="json", label=label, status="erro", latency_ms=_ms(started), message=str(exc)
        )
    except Exception as exc:  # a provider's defect is reported, not raised
        return AIDiagnosticCheckOut(
            key="json",
            label=label,
            status="erro",
            latency_ms=_ms(started),
            message=f"Falha inesperada do provedor: {type(exc).__name__}.",
        )
    elapsed = _ms(started)
    where = provider_host(settings, provider)
    mode = json_mode(settings, provider)
    if provider.simulated:
        message = "O provedor simulado respondeu o JSON de teste (sem rede, sem cota)."
    else:
        message = (
            f"{settings.ai_model} respondeu o JSON de teste em {elapsed} ms"
            + (f" ({where})" if where else "")
            + f", no modo {mode}."
        )
    return AIDiagnosticCheckOut(
        key="json", label=label, status="ok", latency_ms=elapsed, message=message
    )


def check_embeddings(settings: Settings) -> AIDiagnosticCheckOut:
    label = "Embeddings"
    client = EmbeddingClient(settings)
    if not client.configured:
        return AIDiagnosticCheckOut(
            key="embeddings",
            label=label,
            status="nao_configurado",
            message="Embeddings desligados: a busca dos Cadernos e do Cérebro fica só léxica.",
        )
    started = time.monotonic()
    try:
        vectors = client.embed(["material"])
    except EmbeddingHttpError as exc:
        if exc.status == 429:
            message = quota_message(exc.retry_after, exc.daily, "ao gerar embeddings")
        else:
            message = str(exc)
        return AIDiagnosticCheckOut(
            key="embeddings", label=label, status="erro", latency_ms=_ms(started), message=message
        )
    except EmbeddingUnavailableError as exc:
        return AIDiagnosticCheckOut(
            key="embeddings", label=label, status="erro", latency_ms=_ms(started), message=str(exc)
        )
    elapsed = _ms(started)
    size = len(vectors[0]) if vectors else 0
    return AIDiagnosticCheckOut(
        key="embeddings",
        label=label,
        status="ok",
        latency_ms=elapsed,
        message=f"{client.model} devolveu um vetor de {size} dimensões em {elapsed} ms.",
    )


def check_web_search(
    settings: Settings, search: Callable[[str], object] | None = None
) -> AIDiagnosticCheckOut:
    label = "Busca na web"
    on, reason = gemini_search.enabled(settings)
    if not on:
        return AIDiagnosticCheckOut(
            key="busca_web",
            label=label,
            status="nao_configurado",
            message=reason or gemini_search.OFF_REASON,
        )
    started = time.monotonic()
    try:
        if search is not None:
            result = search("material")
        else:
            import httpx

            with httpx.Client() as client:
                result = gemini_search.search(client, settings, "seleção de materiais")
    except ExternalUnavailableError as exc:
        return AIDiagnosticCheckOut(
            key="busca_web", label=label, status="erro", latency_ms=_ms(started), message=str(exc)
        )
    except Exception as exc:
        return AIDiagnosticCheckOut(
            key="busca_web",
            label=label,
            status="erro",
            latency_ms=_ms(started),
            message=f"Falha inesperada na busca na web: {type(exc).__name__}.",
        )
    elapsed = _ms(started)
    hits = len(getattr(result, "hits", []) or [])
    return AIDiagnosticCheckOut(
        key="busca_web",
        label=label,
        status="ok",
        latency_ms=elapsed,
        message=f"A busca do Google respondeu em {elapsed} ms com {hits} links.",
    )
