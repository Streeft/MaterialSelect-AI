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
    # D-101: the embedding identity the query side uses for the Cérebro's
    # semantic search, from settings alone (Fly probes this every 30 s; no
    # database query). The workflow "Base de conhecimento (Cérebro)" compares it
    # with the identity it writes vectors under: a mismatch means every stored
    # vector is ignored at query time and the search is lexical only. ``None``
    # when embeddings are not configured (model or endpoint missing); the
    # dimensions are also ``None`` when the model answers at its native size.
    knowledge_embedding_model: str | None = None
    knowledge_embedding_dimensions: int | None = None
