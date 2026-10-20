"""Schemas for Find Similar (P2).

The answer carries its own basis. A list of neighbours without the properties
they were measured on, the records that could not be measured, and the ones that
turned out to separate nobody is a verdict rather than a result — and the whole
point of the feature is that a reader can check it.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from app.domain.nearness import MAX_TOLERANCE_PCT, MAX_WEIGHT

#: Enough to describe a material without turning the request into a survey. The
#: basis is a question, and a question over twenty properties is not one.
MAX_BASIS_PROPERTIES = 20


class SimilarRequest(BaseModel):
    """Which properties "similar" means, and how many neighbours to return.

    ``property_slugs`` has **no default**, deliberately. Defaulting to "every
    property the reference happens to have" would let the catalogue's recording
    habits choose the question, and the reader would never see that it had been
    chosen for them. The interface proposes a basis; the request states one.
    """

    property_slugs: list[str] = Field(min_length=1, max_length=MAX_BASIS_PROPERTIES)
    limit: int = Field(default=10, ge=1, le=50)
    #: Nearness settings (D-120). A slug left out runs with weight 1 and
    #: criterion ``both``; zero is refused, because "this property does not
    #: matter" is said by taking it out of the basis, where the answer shows it.
    weights: dict[str, Annotated[float, Field(gt=0, le=MAX_WEIGHT)]] = Field(default_factory=dict)
    criteria: dict[str, Literal["both", "at_most", "at_least"]] = Field(default_factory=dict)
    #: "100% se dentro de ±x%" (D-152): one percentage for every basis property,
    #: drawn around the reference's canonical value. Omitted = no band, and the
    #: answer is exactly the one before D-152.
    tolerance_pct: float | None = Field(
        default=None, gt=0, le=MAX_TOLERANCE_PCT, allow_inf_nan=False
    )

    @model_validator(mode="after")
    def _settings_belong_to_the_basis(self) -> SimilarRequest:
        stray = sorted((set(self.weights) | set(self.criteria)) - set(self.property_slugs))
        if stray:
            raise ValueError("Peso ou critério para propriedade fora da base: " + ", ".join(stray))
        return self


class NeighbourOut(BaseModel):
    record_id: int
    name: str
    class_name: str
    class_slug: str
    is_demo: bool
    is_own_record: bool = False
    #: Dimensionless, and comparable only **within this answer**: the scaling
    #: comes from this pool's own spread, so a distance of 0,4 here and 0,4 in
    #: another run are not the same statement.
    distance: float
    rank: int
    #: Per-property squared contribution, so a neighbour's position can be
    #: explained property by property instead of asserted.
    contributions: dict[str, float] = Field(default_factory=dict)
    #: Properties where a one-sided criterion accepted a real difference
    #: ("100% se igual ou menor/maior"). Never a property the record lacks.
    satisfied: list[str] = Field(default_factory=list)
    #: Basis properties inside ``reference ± x%`` (D-152), in basis order.
    #: Never a property the record lacks: a missing value excludes the record.
    within_tolerance: list[str] = Field(default_factory=list)
    #: How many basis properties fall inside the band; ``None`` when no
    #: tolerance was asked — "not asked" is not "zero matches".
    tolerance_matches: int | None = None


class ToleranceBandOut(BaseModel):
    """The band one basis property ran with, in the unit the reader reads."""

    slug: str
    label: str
    #: Bounds included. ``None`` on both when the property's scale has no true
    #: zero, where a percentage of the value means nothing (``applicable`` false).
    low: float | None
    high: float | None
    unit: str
    applicable: bool


class ExcludedOut(BaseModel):
    """A record that could not be placed on this basis, and what it lacked."""

    record_id: int
    name: str
    missing_slugs: list[str]
    missing_labels: list[str]


class SimilarOut(BaseModel):
    reference_id: int
    reference_name: str
    basis: list[str]
    basis_labels: list[str]
    neighbours: list[NeighbourOut]
    excluded: list[ExcludedOut]
    #: Basis properties on which every record in the pool agreed: they
    #: contributed nothing, so the basis that ran was narrower than the one
    #: asked for, and the reader has to be told rather than left to assume.
    degenerate: list[str] = Field(default_factory=list)
    degenerate_labels: list[str] = Field(default_factory=list)
    #: Basis properties that asked to be measured in log space and were measured
    #: linearly, because some record in the pool held a non-positive value.
    linear_fallback: list[str] = Field(default_factory=list)
    linear_fallback_labels: list[str] = Field(default_factory=list)
    #: The settings that ran, defaults written out (D-120): part of the basis.
    weights: dict[str, float] = Field(default_factory=dict)
    criteria: dict[str, Literal["both", "at_most", "at_least"]] = Field(default_factory=dict)
    #: The tolerance that ran (D-152), ``None`` when none was asked.
    tolerance_pct: float | None = None
    #: One band per basis property, in basis order; empty without a tolerance.
    tolerance_bands: list[ToleranceBandOut] = Field(default_factory=list)
