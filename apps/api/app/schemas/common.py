"""Shared response schemas."""

from __future__ import annotations

from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Health-check payload."""

    status: str
    app_name: str
    version: str
    environment: str
