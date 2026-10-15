"""Schemas for ordinal material properties (D-126)."""

from __future__ import annotations

from pydantic import BaseModel


class OrdinalPropertyOut(BaseModel):
    """One ordinal property and its scale, worst level first.

    ``kind`` is always ``"ORDINAL"``: it is what lets the constraint editor tell
    this apart from a numeric property or a discrete process attribute without
    a second lookup.
    """

    slug: str
    name: str
    description: str | None = None
    kind: str = "ORDINAL"
    levels: list[str]
    #: ``Muito pobre < … < Excelente`` — the order as a sentence, from the backend.
    scale_text: str
    is_demo: bool = False


class MaterialOrdinalValueOut(BaseModel):
    """The level a material holds on one ordinal property.

    One row per **defined** property, held or not: a property the material has
    no row for is ``status="sem_dado"`` with ``level`` NULL, exactly as one
    recorded missing is ``status="ausente"``. Neither is ever a level.
    """

    slug: str
    name: str
    status: str  # "nivel" | "ausente" | "sem_dado"
    status_text: str
    level: str | None = None
    rank: int | None = None
    scale: list[str]
    source_label: str | None = None
    data_quality: str | None = None
    measurement_condition: str | None = None
    notes: str | None = None
    is_demo: bool = False


class MaterialOrdinalValuesOut(BaseModel):
    material_id: int
    material_name: str
    values: list[MaterialOrdinalValueOut]
