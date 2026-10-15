"""Contrato de saída do glossário de propriedades (D-130)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class GlossaryEntryOut(BaseModel):
    """One conceptual entry: what the quantity means, never what it is worth."""

    slug: str
    summary: str
    definition: str
    how_measured: str | None
    reference: str | None
    license: str
    review_status: Literal["rascunho", "revisado"]
    lang: str
