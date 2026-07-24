"""Deterministic constraint evaluation for material selection.

Pure domain logic: given in-memory :class:`MaterialSnapshot` objects and a list
of :class:`Constraint` objects (with thresholds already converted to canonical
units by the service), decide which materials pass and produce a funnel report
of how many candidates remain after each constraint.

Design choices, aligned with the Ashby methodology:

* A numeric constraint on a property the material does **not** have is treated
  as *not satisfied* — you cannot select on data you do not have. The explicit
  ``EXISTS`` / ``NOT_EXISTS`` operators let the user filter on data completeness
  on purpose.
* Thresholds are compared against the canonical (normalized) value, so units are
  always consistent. Conversion happens once, in the service, not per material.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Operator(str, Enum):
    """Supported constraint operators."""

    GT = "gt"
    GTE = "gte"
    LT = "lt"
    LTE = "lte"
    BETWEEN = "between"
    OUTSIDE = "outside"
    EXISTS = "exists"
    NOT_EXISTS = "not_exists"
    IN_CLASS = "in_class"
    NOT_IN_CLASS = "not_in_class"
    TEXT_CONTAINS = "text_contains"


_NUMERIC_OPERATORS = {
    Operator.GT,
    Operator.GTE,
    Operator.LT,
    Operator.LTE,
    Operator.BETWEEN,
    Operator.OUTSIDE,
}


@dataclass
class MaterialSnapshot:
    """In-memory view of one active material used across the selection pipeline.

    ``values`` maps a property slug to its canonical (normalized) numeric value.
    Missing / absent properties are simply absent from the dict — never 0.
    """

    id: int
    name: str
    class_name: str
    class_slug: str
    keywords: list[str]
    values: dict[str, float]


@dataclass
class Constraint:
    """One selection constraint with thresholds already in canonical units."""

    operator: Operator
    label: str = ""
    property_slug: str | None = None
    value: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    class_slugs: list[str] = field(default_factory=list)
    text: str | None = None


@dataclass
class FunnelStep:
    """One line of the elimination funnel."""

    label: str
    operator: str
    passed: int  # materials passing this constraint on its own
    remaining: int  # cumulative candidates remaining after applying up to here


@dataclass
class FilterResult:
    """Outcome of applying a set of constraints."""

    initial_count: int
    combinator: str
    steps: list[FunnelStep]
    candidate_ids: list[int]

    @property
    def final_count(self) -> int:
        return len(self.candidate_ids)


def evaluate_constraint(constraint: Constraint, material: MaterialSnapshot) -> bool:
    """Return True if ``material`` satisfies ``constraint``."""
    op = constraint.operator

    if op is Operator.EXISTS:
        return constraint.property_slug in material.values
    if op is Operator.NOT_EXISTS:
        return constraint.property_slug not in material.values

    if op is Operator.IN_CLASS:
        return material.class_slug in set(constraint.class_slugs)
    if op is Operator.NOT_IN_CLASS:
        return material.class_slug not in set(constraint.class_slugs)

    if op is Operator.TEXT_CONTAINS:
        needle = (constraint.text or "").strip().lower()
        if not needle:
            return True
        haystack = " ".join([material.name.lower(), *(k.lower() for k in material.keywords)])
        return needle in haystack

    # Numeric operators: the property value must be present to be verifiable.
    if op in _NUMERIC_OPERATORS:
        if constraint.property_slug not in material.values:
            return False
        x = material.values[constraint.property_slug]
        if op is Operator.GT:
            return constraint.value is not None and x > constraint.value
        if op is Operator.GTE:
            return constraint.value is not None and x >= constraint.value
        if op is Operator.LT:
            return constraint.value is not None and x < constraint.value
        if op is Operator.LTE:
            return constraint.value is not None and x <= constraint.value
        if op is Operator.BETWEEN:
            return (
                constraint.value_min is not None
                and constraint.value_max is not None
                and constraint.value_min <= x <= constraint.value_max
            )
        if op is Operator.OUTSIDE:
            return (
                constraint.value_min is not None
                and constraint.value_max is not None
                and (x < constraint.value_min or x > constraint.value_max)
            )

    return False  # pragma: no cover - all operators handled above


def apply_constraints(
    materials: list[MaterialSnapshot],
    constraints: list[Constraint],
    combinator: str = "AND",
) -> FilterResult:
    """Apply constraints and build the elimination funnel.

    ``AND`` (default) yields a cumulative funnel: each step shows how many
    candidates survive after that constraint is added. ``OR`` reports how many
    materials each constraint admits and the growing union.
    """
    initial = len(materials)
    combinator = combinator.upper()

    if not constraints:
        return FilterResult(initial, combinator, [], [m.id for m in materials])

    steps: list[FunnelStep] = []

    if combinator == "OR":
        passing: dict[int, MaterialSnapshot] = {}
        for constraint in constraints:
            admitted = [m for m in materials if evaluate_constraint(constraint, m)]
            for m in admitted:
                passing[m.id] = m
            steps.append(
                FunnelStep(
                    label=constraint.label,
                    operator=constraint.operator.value,
                    passed=len(admitted),
                    remaining=len(passing),
                )
            )
        return FilterResult(initial, combinator, steps, sorted(passing))

    # AND
    remaining = list(materials)
    for constraint in constraints:
        standalone = sum(1 for m in materials if evaluate_constraint(constraint, m))
        remaining = [m for m in remaining if evaluate_constraint(constraint, m)]
        steps.append(
            FunnelStep(
                label=constraint.label,
                operator=constraint.operator.value,
                passed=standalone,
                remaining=len(remaining),
            )
        )
    return FilterResult(initial, combinator, steps, [m.id for m in remaining])
