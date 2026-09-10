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


@dataclass(frozen=True)
class ProcessReach:
    """One process a material can be made with, and the folders that process
    sits in (P0-2).

    Carrying the process's class lineage *here*, on the material's side of the
    join, is what keeps this module free of the taxonomy: matching a process
    folder becomes a local question about a snapshot, exactly as
    ``class_lineage`` made matching a material folder local. The alternative —
    passing a process-taxonomy map down through ``apply_stage`` — would thread
    a lookup table through three signatures to answer the same question.
    """

    process_slug: str
    #: The process's class lineage, root→leaf. Empty when unknown, in which case
    #: the process is matchable by its own slug alone.
    class_path: tuple[str, ...] = ()


@dataclass
class RecordSnapshot:
    """In-memory view of one selectable record, in **either** universe (P0-3).

    Materials were the only universe until the process one arrived, so
    everything the engine does to a record — evaluate a constraint against its
    values, match its class lineage against a folder selection, count it in a
    funnel — was written against ``MaterialSnapshot``. None of it is actually
    about materials: it is about *a record with a class and some values*. This
    base is that record, and it is what lets one engine run a material study and
    a process study without a second implementation to keep in agreement.

    ``values`` maps a property slug to its canonical (normalized) numeric value.
    Missing / absent properties are simply absent from the dict — never 0.
    """

    id: int
    name: str
    class_name: str
    class_slug: str
    keywords: list[str] = field(default_factory=list)
    values: dict[str, float] = field(default_factory=dict)
    #: The record's class lineage, root→leaf, its own slug last — what makes a
    #: tree stage able to say "everything under Metais" (P0-1). Defaults to
    #: empty because ancestry is something the service reads from the taxonomy;
    #: a snapshot built without it is matchable by its own class only, which is
    #: exactly the pre-P0-1 ``IN_CLASS`` behaviour. Read it through
    #: ``class_lineage``, never directly.
    class_path: list[str] = field(default_factory=list)

    @property
    def class_lineage(self) -> tuple[str, ...]:
        """The class slugs a tree selection may match this record by.

        Absent ancestry is absent, not an empty set that matches nothing: with
        no ``class_path`` this is the record's own class alone.
        """
        return tuple(self.class_path) if self.class_path else (self.class_slug,)


@dataclass
class MaterialSnapshot(RecordSnapshot):
    """A record in the material universe."""

    #: The processes this material can be made with, each with its own folder
    #: lineage (P0-2). Empty is the honest default: a snapshot built without it
    #: simply has no process side to its join, which is what every snapshot
    #: built before P0-2 looks like.
    processes: list[ProcessReach] = field(default_factory=list)


@dataclass
class ProcessSnapshot(RecordSnapshot):
    """A record in the process universe (P0-3).

    The join's other side is *folder lineages*, not slugs: the material stage
    selects folders of the material taxonomy, because a ``Material`` has no slug
    to name a leaf by and the method's own exercise selects a folder. Carrying
    the lineages here — rather than a taxonomy map passed down through
    ``apply_stage`` — keeps matching a local question about one snapshot, the
    same reasoning ``ProcessReach`` follows on the material side.
    """

    #: One entry per material this process serves: that material's class
    #: lineage, root→leaf.
    material_paths: list[tuple[str, ...]] = field(default_factory=list)


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


@dataclass(frozen=True)
class TreeSelection:
    """A folder selection over the material taxonomy — a Tree stage's payload.

    Different from the ``IN_CLASS`` constraint in one way that matters: with
    ``include_descendants`` (the default) picking a folder picks everything
    under it, which is what makes a hierarchy navigable. ``IN_CLASS`` compares
    the material's own class slug and nothing else, so ticking a branch node
    there admits nothing — every material sits in a leaf.

    Selecting nothing imposes no restriction, the same convention an empty
    constraint group follows: a stage with nothing ticked is a stage that does
    not narrow, not a stage that rejects everything.

    Reused verbatim by the **material** stage of a process study (P0-3): a
    folder selection is a folder selection, and what changes is only whether it
    is matched against the record's own lineage or against the lineages of the
    records it links to — see ``matches_linked_tree``.
    """

    class_slugs: tuple[str, ...] | list[str] = field(default_factory=tuple)
    include_descendants: bool = True


def matches_tree(record: RecordSnapshot, selection: TreeSelection) -> bool:
    """Return True if ``record`` falls inside ``selection``'s folders.

    Universe-agnostic: it reads the record's own lineage, which a material and a
    process both have.
    """
    picked = set(selection.class_slugs)
    if not picked:
        return True
    if selection.include_descendants:
        return any(slug in picked for slug in record.class_lineage)
    return record.class_slug in picked


def matches_linked_tree(
    paths: list[tuple[str, ...]] | tuple[tuple[str, ...], ...], selection: TreeSelection
) -> bool:
    """Return True if **some** linked record falls inside ``selection``'s folders.

    The folder half of the join, seen from the other side (P0-3): given the
    class lineages of the records this one links to, does any of them sit in a
    picked folder. Any-of and not all-of, for the same reason
    ``ProcessSelection`` gives — the conjunction is two stages.

    A record that links to nothing never passes a non-empty selection: same rule
    as everywhere else here, you cannot select on data you do not have.
    """
    picked = set(selection.class_slugs)
    if not picked:
        return True
    for path in paths:
        if selection.include_descendants:
            if any(slug in picked for slug in path):
                return True
        elif path and path[-1] in picked:
            # Without descendants a folder means the records filed directly in
            # it — the linked record's own class, not an ancestor of it.
            return True
    return False


@dataclass(frozen=True)
class ProcessSelection:
    """The processes a stage keeps materials for — the join's other direction.

    In the Ashby method a Tree stage is not "filter by folder", it is a join
    between two universes: *the materials this process shapes*, and *the
    processes that join these materials*. ``TreeSelection`` above walks the
    material taxonomy; this one walks the process taxonomy and lands on
    materials through the N–N link.

    **Any-of, not all-of.** A material passes when *some* selected process
    applies to it. "Weldable **and** injection-mouldable" is two stages, and the
    pipeline already intersects them — which is precisely the composition the
    ordered stack exists for, so expressing it twice would be two ways to say
    one thing, one of them redundant.

    Selecting nothing imposes no restriction, the same convention an empty
    constraint group and an empty ``TreeSelection`` follow.
    """

    #: Individual processes, by slug — the leaves of the process tree.
    process_slugs: tuple[str, ...] | list[str] = field(default_factory=tuple)
    #: Process *folders*, by slug. A separate field and not the same list
    #: because a process slug and a process-class slug are different
    #: namespaces, and one list would leave the reader guessing which table
    #: each entry names.
    process_class_slugs: tuple[str, ...] | list[str] = field(default_factory=tuple)
    include_descendants: bool = True


def matches_processes(material: MaterialSnapshot, selection: ProcessSelection) -> bool:
    """Return True if some selected process applies to ``material``.

    Material-side by construction: only a material carries ``processes``. The
    mirror question — which processes serve a material folder — is
    ``matches_linked_tree`` over a ``ProcessSnapshot``.
    """
    picked_processes = set(selection.process_slugs)
    picked_folders = set(selection.process_class_slugs)
    if not picked_processes and not picked_folders:
        return True

    for reach in material.processes:
        if reach.process_slug in picked_processes:
            return True
        if not picked_folders:
            continue
        if selection.include_descendants:
            if any(slug in picked_folders for slug in reach.class_path):
                return True
        elif reach.class_path and reach.class_path[-1] in picked_folders:
            # Without descendants a folder means the processes filed directly
            # in it — the process's own class, not an ancestor of it.
            return True
    return False


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


@dataclass
class SelectionStageNode:
    """One stage of the selection pipeline, independent of the ORM (P0-1).

    One payload per kind, and the others are ``None`` — a stage is one kind of
    question, not several:

    * ``"limit"`` → ``root``, a constraint tree with M6's nesting.
    * ``"tree"`` → ``tree``, folders of the study's **own** universe.
    * ``"process"`` → ``processes``, the join into the process universe, in a
      material study (P0-2).
    * ``"material"`` → ``materials``, the same join from the other side, in a
      process study (P0-3): folders of the material taxonomy, matched against
      the materials each process serves.
    """

    kind: str  # "limit" | "tree" | "process" | "material"
    label: str | None
    enabled: bool
    root: ConstraintGroupNode | None = None
    tree: TreeSelection | None = None
    processes: ProcessSelection | None = None
    materials: TreeSelection | None = None


def evaluate_constraint(constraint: Constraint, material: RecordSnapshot) -> bool:
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


def _group_passes(material: RecordSnapshot, group: ConstraintGroupNode) -> bool:
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
    materials: list[RecordSnapshot], root: ConstraintGroupNode
) -> list[RecordSnapshot]:
    """Filter materials by a nested AND/OR constraint tree — the M6
    generalization of apply_constraints's single global operator.

    A root group with an empty children list and a flat constraints list
    behaves identically to apply_constraints(materials, root.constraints,
    root.operator) — this is what lets a pre-M6 study (backfilled into one
    root group with no nesting) keep evaluating exactly as before.
    """
    return [material for material in materials if _group_passes(material, root)]


def _material_paths(record: RecordSnapshot) -> tuple[tuple[str, ...], ...]:
    """The material lineages a process serves.

    Raises for anything that is not a process: a material stage over materials
    is a wiring bug (the service refuses that combination), and the tempting
    silent alternative — treat it as "links to nothing", so nothing passes — is
    indistinguishable from a legitimately empty result, which is precisely the
    kind of quiet wrong answer this engine is built not to give.
    """
    if not isinstance(record, ProcessSnapshot):
        raise TypeError(
            f"A material stage applies only to a process study; got {type(record).__name__}."
        )
    return tuple(record.material_paths)


def apply_stage(materials: list[RecordSnapshot], stage: SelectionStageNode) -> list[RecordSnapshot]:
    """Filter ``materials`` by one stage alone, ignoring ``stage.enabled``.

    Ignoring ``enabled`` is what makes the funnel able to answer "how many
    would this stage admit on its own" — including for a stage the user has
    switched off, which is precisely the question switching it off asks.
    Whether a disabled stage narrows the running set is decided by
    ``apply_stages``, not here.
    """
    if stage.kind == "tree":
        if stage.tree is None:
            return list(materials)
        return [m for m in materials if matches_tree(m, stage.tree)]
    if stage.kind == "process":
        if stage.processes is None:
            return list(materials)
        return [m for m in materials if matches_processes(m, stage.processes)]
    if stage.kind == "material":
        if stage.materials is None:
            return list(materials)
        return [
            record
            for record in materials
            if matches_linked_tree(_material_paths(record), stage.materials)
        ]
    if stage.root is None:
        return list(materials)
    return apply_constraint_tree(materials, stage.root)


def apply_stages(
    materials: list[RecordSnapshot], stages: list[SelectionStageNode]
) -> list[RecordSnapshot]:
    """Run the pipeline: the intersection of the **enabled** stages, in order.

    Intersection commutes, so the order does not change the surviving set —
    what it changes is the funnel the service builds around this, which reads
    as an argument and therefore has an order.

    No stages, or every stage disabled, admits every material: same convention
    as an empty constraint group. A pipeline that says nothing does not reject
    everything.
    """
    remaining = list(materials)
    for stage in stages:
        if not stage.enabled:
            continue
        remaining = apply_stage(remaining, stage)
    return remaining
