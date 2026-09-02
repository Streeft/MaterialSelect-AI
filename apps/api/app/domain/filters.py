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
    """One line of the elimination funnel.

    Same status as ``FilterResult``/``apply_constraints`` below: no production
    path constructs one any more (the service layer builds ``FunnelStepOut``
    from ``_apply_group`` instead) — retained only for the flat-tree
    equivalence test.
    """

    label: str
    operator: str
    passed: int  # materials passing this constraint on its own
    remaining: int  # cumulative candidates remaining after applying up to here


@dataclass
class FilterResult:
    """Outcome of applying a set of constraints.

    No production path builds one of these any more (M6 routes everything
    through ``apply_constraint_tree``/``_apply_group``) — kept as the return
    type of ``apply_constraints`` below, itself kept only as the reference
    implementation ``test_single_root_group_matches_flat_apply_constraints``
    compares against for the flat-tree equivalence proof.
    """

    initial_count: int
    combinator: str
    steps: list[FunnelStep]
    candidate_ids: list[int]

    @property
    def final_count(self) -> int:
        return len(self.candidate_ids)


@dataclass
class ConstraintGroupNode:
    """One node of a nested constraint tree, independent of the ORM — domain
    code never imports SQLAlchemy (CLAUDE.md §4).

    A leaf group has constraints and no children; an internal group combines
    its children (constraints evaluated directly, plus any nested sub-groups'
    own recursive result) with its own operator.
    """

    operator: str  # "AND" | "OR"
    constraints: list[Constraint]
    children: list[ConstraintGroupNode]


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

    Retained only as the reference implementation
    ``test_single_root_group_matches_flat_apply_constraints`` compares
    against, proving a single-root, no-children ``ConstraintGroupNode``
    evaluates identically through ``apply_constraint_tree``. No production
    code path calls this function any more — everything routes through
    ``apply_constraint_tree``/``SelectionService._apply_group``.
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


def _group_passes(material: MaterialSnapshot, group: ConstraintGroupNode) -> bool:
    """One group's own AND/OR of its direct constraints and child groups'
    recursive results — the tree-walk step apply_constraint_tree repeats
    per material.
    """
    results = [evaluate_constraint(constraint, material) for constraint in group.constraints]
    results.extend(_group_passes(material, child) for child in group.children)

    if not results:
        # An empty group (no constraints, no children) imposes no restriction —
        # vacuously true for AND (nothing to fail), and for OR only if that's
        # this codebase's existing convention for an empty flat constraint list
        # in apply_constraints. We match that: all() and any() both return True
        # on empty lists semantically, but more importantly, apply_constraints
        # returns all materials when constraints is empty, regardless of
        # combinator. So we return True here for both AND and OR.
        return True

    if group.operator == "AND":
        return all(results)
    return any(results)


def apply_constraint_tree(
    materials: list[MaterialSnapshot], root: ConstraintGroupNode
) -> list[MaterialSnapshot]:
    """Filter materials by a nested AND/OR constraint tree — the M6
    generalization of apply_constraints's single global operator.

    A root group with an empty children list and a flat constraints list
    behaves identically to apply_constraints(materials, root.constraints,
    root.operator) — this is what lets a pre-M6 study (backfilled into one
    root group with no nesting) keep evaluating exactly as before.
    """
    return [material for material in materials if _group_passes(material, root)]
