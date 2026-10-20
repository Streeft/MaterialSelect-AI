"""Contrato de saída das notas de família de materiais (D-151)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class FamilyNoteOut(BaseModel):
    """One conceptual note: what the family is, never what its properties are worth."""

    slug: str
    summary: str
    body: list[str]
    when_to_use: list[str]
    watch_out: list[str]
    reference: str | None
    license: str
    review_status: Literal["rascunho", "revisado"]
    lang: str
