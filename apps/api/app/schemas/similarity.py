"""Schemas for Find Similar (P2).

The answer carries its own basis. A list of neighbours without the properties
they were measured on, the records that could not be measured, and the ones that
turned out to separate nobody is a verdict rather than a result — and the whole
point of the feature is that a reader can check it.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator

from app.domain.nearness import MAX_WEIGHT

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
