"""Response schemas for the catalogue panel.

Everything numeric here is counted or computed in the backend — including the
quartiles of every box (ADR 0004) and every percentage. The client draws what it
receives and formats it for pt-BR; it does not divide, average or round.

The vocabulary of the panel is deliberately three-valued where the rest of the
world is two-valued. A (material, property) slot is *filled*, *declared missing*
or *never recorded*, and collapsing the last two into "missing" would hide the
distinction the methodology exists to make: a value someone looked for and could
not find is evidence, and a value nobody has entered yet is a to-do list.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.enums import PropertyCategory

# The four provenance states the interface already paints, plus the fifth thing
# that is not a provenance at all — a slot with no row behind it. It is reported
# separately rather than folded into "ausente" because no one declared it.
QualityBucket = Literal["MEDIDO", "IMPORTADO", "ESTIMADO", "AUSENTE", "NAO_REGISTRADO"]


class Coverage(BaseModel):
    """How a set of (material, property) slots is filled.

    ``slots`` is the denominator and is always ``filled + declared_missing +
    not_recorded``; it is sent rather than left for the client to add up so the
    figure and its data table cannot disagree about the total.
    """

    filled: int = Field(ge=0, description="Valores com número")
    declared_missing: int = Field(ge=0, description="Valores marcados explicitamente como ausentes")
    not_recorded: int = Field(ge=0, description="Pares material×propriedade sem nenhum registro")
    slots: int = Field(ge=0, description="Total de pares possíveis")
    # `None`, never 0.0: an empty catalogue has no coverage, and "0%" would read
    # as a verdict on data that does not exist.
    filled_pct: float | None = Field(
        default=None, description="Percentual preenchido; nulo se 0 pares"
    )


class ClassCoverageOut(BaseModel):
    """One material class, and how complete its rows are."""

    slug: str
    name: str
    materials: int
    coverage: Coverage


class PropertyCoverageOut(BaseModel):
    """One property definition, and how many materials actually carry it."""

    slug: str
    name: str
    category: PropertyCategory
    canonical_unit: str | None = None
    coverage: Coverage


class QualitySliceOut(BaseModel):
    """One slice of the provenance breakdown."""

    bucket: QualityBucket
    count: int = Field(ge=0)
    share_pct: float | None = None


class OverviewOut(BaseModel):
    """Everything the panel needs for its first screen."""

    materials: int
    demo_materials: int = Field(description="Quantos dos materiais ativos são de demonstração")
    classes: int
    properties: int
    coverage: Coverage
    by_quality: list[QualitySliceOut]
    by_class: list[ClassCoverageOut]
    by_property: list[PropertyCoverageOut]
    gaps: list[PropertyCoverageOut] = Field(
        description="As propriedades menos preenchidas, da pior para a melhor"
    )


class BoxOut(BaseModel):
    """The five-number summary of one class, in canonical units."""

    class_slug: str
    class_name: str
    count: int = Field(ge=1, description="Quantos materiais entraram nesta caixa")
    minimum: float
    q1: float
    median: float
    q3: float
    maximum: float


class DistributionOut(BaseModel):
    """How one property is distributed across the classes that have it."""

    property_slug: str
    property_name: str
    category: PropertyCategory
    canonical_unit: str | None = None
    # Sent rather than guessed by the client: properties in this catalogue span
    # decades (density and Young's modulus are not on the same kind of axis),
    # and the definition already knows which of its own axes is honest.
    allows_log_scale: bool = True
    boxes: list[BoxOut]
    # Named, not dropped. A class that vanishes from the figure looks like a
    # class that does not exist; a class listed as having no data for this
    # property is the honest version of the same fact.
    classes_without_data: list[str] = Field(
        default_factory=list, description="Nomes das classes sem nenhum valor desta propriedade"
    )
