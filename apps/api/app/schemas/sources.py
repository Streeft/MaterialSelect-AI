"""Schemas for the source registry (M1)."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class SourceOut(BaseModel):
    """A registered data source, with its procedência/licença and reviewer."""

    id: int
    label: str
    reference: str | None = None
    is_demo: bool
    license_label: str | None = None
    license_url: str | None = None
    contains_third_party_data: bool
    reviewed_by_email: str | None = None
    reviewed_at: datetime | None = None
