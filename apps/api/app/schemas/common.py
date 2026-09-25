"""Shared response schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Health-check payload."""

    status: str
    app_name: str
    version: str
    environment: str
    # D-83: public on purpose. It says only whether the tool is open to any
    # login, and it is what modo-acesso.yml reads to prove the switch took —
    # a secret set on an API too old to read it would otherwise pass green.
    access_mode: Literal["subscription", "open"]
    # D-93: public for the same reason — `provedor-ia.yml` reads them to prove a
    # provider switch took. The provider name and the model name only; never the
    # base URL (a gateway path can carry a token) and never anything about keys.
    ai_provider: str
    ai_model: str | None = None
