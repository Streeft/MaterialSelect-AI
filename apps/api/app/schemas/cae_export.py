"""Contract of ``GET /api/exports/cae/formatos`` (D-171): what each CAE format asks for."""

from __future__ import annotations

from pydantic import BaseModel


class CaeRequirementOut(BaseModel):
    key: str
    #: Portuguese name, the same one the 422 refusal uses.
    label: str


class CaeFormatOut(BaseModel):
    key: str
    label: str
    #: Elastoplastic card (D-119): the route also needs ``curva`` (and ``serie``).
    plastic: bool
    #: Quantities the record must carry; a card missing one is refused with 422.
    required: list[CaeRequirementOut]
    #: Most points of the plastic table the format admits; None when it has no limit.
    plastic_max_points: int | None = None
