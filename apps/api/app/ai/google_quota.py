"""The free Google quota, said once and the same way everywhere (D-228).

Gemini's free plan limits requests per minute *and* per day, and answers both
with ``429 RESOURCE_EXHAUSTED``. A student reading "429" learns nothing; a
student reading "a cota gratuita do Google acabou por agora; tente em 37 s"
knows what happened and what to do. The chat model, the embeddings and the
diagnosis all word it through :func:`quota_message`.
"""

from __future__ import annotations

import math
from urllib.parse import urlsplit

#: The host of the Gemini API — the free Google AI Studio plan (D-93).
GOOGLE_AI_HOST = "generativelanguage.googleapis.com"


def host_of(base_url: str) -> str:
    """The host of a URL, lower-cased, never the path (a path can carry a key)."""
    try:
        return (urlsplit(base_url.strip()).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""


def is_google_host(base_url: str) -> bool:
    return host_of(base_url) == GOOGLE_AI_HOST


def wait_text(retry_after: float | None, daily: bool) -> str:
    """When to try again, in words: "amanhã", "37 s", "2 min" or "alguns minutos"."""
    if daily:
        return "amanhã (a cota diária volta à meia-noite do horário do Pacífico)"
    if retry_after is None or not math.isfinite(retry_after) or retry_after <= 0:
        return "alguns minutos"
    seconds = math.ceil(retry_after)
    if seconds < 90:
        return f"{seconds} s"
    return f"{math.ceil(seconds / 60)} min"


def quota_message(retry_after: float | None, daily: bool, what: str = "") -> str:
    """The PT-BR notice for a 429 from Google. ``what`` names the service
    ("ao gerar embeddings") when the reader could not tell it from the screen."""
    where = f" {what}" if what else ""
    when = wait_text(retry_after, daily)
    if daily:
        return (
            f"A cota gratuita do Google acabou{where} por hoje; tente em {when}. "
            "O restante do app continua funcionando sem a IA."
        )
    return (
        f"A cota gratuita do Google acabou{where} por agora; tente em {when}. "
        "O restante do app continua funcionando sem a IA."
    )
