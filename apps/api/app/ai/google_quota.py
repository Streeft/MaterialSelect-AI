"""The free Google quota, said once and the same way everywhere (D-228).

Gemini's free plan limits requests per minute *and* per day, and answers both
with ``429 RESOURCE_EXHAUSTED``. A student reading "429" learns nothing; a
student reading "a cota gratuita do Google acabou por agora; tente em 37 s"
knows what happened and what to do. The chat model, the embeddings and the
diagnosis all word it through :func:`quota_message`.
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from typing import Any
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


_MAX_FIELD = 120


def quota_violations(payload: object) -> list[dict[str, str]]:
    """Which quota a Google 429 says was spent: ``quotaId``, ``quotaMetric`` and
    the limit (``quotaValue``), from ``error.details[].violations[]``.

    For the operator's log only (D-234): it tells a per-minute limit from a
    per-day one and a model's quota from the project's. Only these three text
    fields are copied, each clipped — never the message, which could echo what
    was sent, and never a key.
    """
    error = payload.get("error") if isinstance(payload, Mapping) else None
    details = error.get("details") if isinstance(error, Mapping) else None
    found: list[dict[str, str]] = []
    for detail in details if isinstance(details, list) else []:
        violations = detail.get("violations") if isinstance(detail, Mapping) else None
        for violation in violations if isinstance(violations, list) else []:
            if not isinstance(violation, Mapping):
                continue
            entry: dict[str, str] = {}
            for source, name in (
                ("quotaId", "quota_id"),
                ("quotaMetric", "quota_metric"),
                ("quotaValue", "limit"),
            ):
                value: Any = violation.get(source)
                if isinstance(value, (str, int)) and not isinstance(value, bool):
                    entry[name] = str(value)[:_MAX_FIELD]
            if entry:
                found.append(entry)
    return found


def describe_violations(payload: object) -> str:
    """The violations of :func:`quota_violations` as one log fragment."""
    entries = quota_violations(payload)
    if not entries:
        return "sem detalhe de cota"
    return "; ".join(
        ", ".join(f"{name}={value}" for name, value in entry.items()) for entry in entries[:3]
    )
