"""Engineering Solver: what the brief actually weighs, material by material.

The performance index orders materials; it does not say how heavy the part
comes out. This module closes that gap by running the factorisation that
``load_cases`` writes down::

    massa = fator estrutural / índice
    área  = fator estrutural da área × agrupamento material da área

Two things follow, and both are the point of the item rather than details.

**The solver never re-derives the index.** It receives the catalogued
expression and evaluates it through the same ``evaluate_index`` the selection
pipeline and the property maps use — so a ranking, a map and a mass estimate
cannot disagree about a material, ever. Reimplementing the index here would
create the second truth that D-35 and D-60 each refused in their own layer.

**The structural factor is computed once per run, not once per material.** It
has no material term in it; recomputing it per record would be both wasteful
and an invitation to let a property leak into it.

Absence is handled exactly as everywhere else in the tool (principle 3): a
material missing a property the case needs is **excluded and named**, never
given a zero, an average or an estimate. The exclusion carries the slugs it
lacks, the shape ``ranking.ExcludedMaterial`` and ``nearness.ExcludedRecord``
already use, so a screen that renders one renders this.

The unit of every answer is *derived*, not assumed: the design variables carry
canonical units, the properties carry theirs, and Pint multiplies them out
through ``result_dimension``. That is what makes "2,4 kg" a claim the reader
can audit rather than a number with a label typed next to it.

**The one exception is the cost objective, and it is the reason the objective is
named in words** (D-65). Running the same brief against the case's cost twin
answers "how much material does this part cost?" instead of "how heavy is it?",
and the arithmetic is identical because the structural factor never changed. But
``custo_massa`` is dimensionless — money is in no unit system — so Pint derives
the *same* dimension for both runs. The derived dimension therefore still proves
the algebra (a slip in a cost expression breaks it exactly as it would in a mass
one) and no longer names the answer: ``objective`` and ``objective_unit`` do
that, and ``objective_note`` says why the dimension reads as a mass.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.calculations.expressions import (
    ExpressionError,
    evaluate,
    result_dimension,
    variables_in,
)
from app.calculations.load_cases import (
    COST_OBJECTIVE,
    MASS_OBJECTIVE,
    OBJECTIVES,
    LoadCase,
)
from app.calculations.part_cost import MONETARY_UNIT
from app.calculations.performance import evaluate_index

#: Why a cost answer comes out with the dimension of a mass. Written once, and
#: carried in the result, because a reader who sees "[mass]" under a column of
#: money is owed the reason rather than left to spot it.
COST_DIMENSION_NOTE = (
    "O custo é obtido do mesmo fator estrutural dividido pelo índice de custo. "
    "Como custo_massa é adimensional (dinheiro não está em sistema de unidades "
    "nenhum), a análise dimensional devolve a mesma dimensão da massa — ela prova "
    "a álgebra, não nomeia a resposta."
)

#: One candidate's raw values: (id, name, {property slug: canonical value | None}).
RecordValues = tuple[int, str, dict[str, float | None]]


class SolverError(ValueError):
    """The brief itself cannot be solved — bad inputs, or a mismatched index."""


@dataclass(frozen=True)
class SolvedRecord:
    """One material dimensioned against the brief."""

    record_id: int
    name: str
    rank: int
    #: The catalogued index, evaluated for this material.
    index_value: float
    #: The objective — a mass, or a material cost, in ``SolverResult.objective_unit``.
    objective_value: float
    #: The free variable — section area, in ``case.free_unit``.
    free_value: float


@dataclass(frozen=True)
class ExcludedRecord:
    """A material that could not be dimensioned, and what it lacked."""

    record_id: int
    name: str
    missing_keys: list[str]
    reason: str


@dataclass(frozen=True)
class SolverResult:
    """The answer to one brief, with the factor that produced it in the open."""

    #: Pure geometry and load: the same number for every material in this run.
    structural_factor: float
    free_structural_factor: float
    #: Which of the two objectives ran — ``massa`` or ``custo``.
    objective: str
    objective_unit: str
    free_unit: str
    #: Derived by Pint, and for the cost objective *not* the answer's unit; see
    #: ``objective_note`` and the module docstring.
    objective_dimension: str
    free_dimension: str
    objective_note: str | None
    solved: list[SolvedRecord]
    excluded: list[ExcludedRecord]


def _require_inputs(case: LoadCase, inputs: dict[str, float]) -> dict[str, float]:
    """Validate that every design variable has a usable value.

    Every variable in these cases is a length, a load, a stiffness, a moment or
    an end-condition constant, and none of them is meaningful at zero or below:
    a zero length collapses the part, a zero constant divides by zero, and a
    negative value under a fractional power gives a complex "mass". Refusing
    here is what lets the expressions below assume a real, finite result.
    """
    missing = sorted(case.variable_keys - set(inputs))
    if missing:
        raise SolverError(f"Faltam variáveis de projeto: {', '.join(missing)}.")
    values: dict[str, float] = {}
    for key in sorted(case.variable_keys):
        raw = inputs[key]
        try:
            value = float(raw)
        except (TypeError, ValueError) as exc:
            raise SolverError(f"Valor não numérico para {key}.") from exc
        if not (value > 0):
            variable = case.variable(key)
            label = variable.label if variable else key
            raise SolverError(f"{label} precisa ser maior que zero.")
        values[key] = value
    return values


def structural_factors(case: LoadCase, inputs: dict[str, float]) -> tuple[float, float]:
    """Return (objective factor, free-variable factor) for this brief."""
    values = _require_inputs(case, inputs)
    try:
        objective = evaluate(case.objective_structural, values)
        free = evaluate(case.free_structural, values)
    except ExpressionError as exc:  # pragma: no cover - guarded by _require_inputs
        raise SolverError(f"Fator estrutural indefinido: {exc}") from exc
    return objective, free


def dimensions(
    case: LoadCase, index_expression: str, property_units: dict[str, str]
) -> tuple[str, str]:
    """Derive the dimension of the objective and of the free variable.

    The two namespaces are disjoint by construction (``load_cases`` proves the
    structural half at import time), so merging their unit maps is safe and the
    result is the dimension of the whole product.

    Raises:
        SolverError: if either combination is dimensionally inconsistent — which
            for a new load case means the algebra is wrong, not the data.
    """
    units = {**case.design_units, **property_units}
    try:
        objective = result_dimension(f"({case.objective_structural}) / ({index_expression})", units)
        free = result_dimension(f"({case.free_structural}) * ({case.free_material})", units)
    except ExpressionError as exc:
        raise SolverError(f"Análise dimensional falhou: {exc}") from exc
    return objective, free


def solve(
    case: LoadCase,
    *,
    index_expression: str,
    index_goal: str,
    index_variables: set[str],
    inputs: dict[str, float],
    records: list[RecordValues],
    property_units: dict[str, str],
    objective: str = MASS_OBJECTIVE,
    limit: int = 20,
) -> SolverResult:
    """Dimension every candidate against one brief.

    Args:
        case: the load case, which owns the derivation and the structural half.
        index_expression: the **catalogued** expression for the index this case
            yields under ``objective`` — ``case.index_slug_for(objective)``.
        index_goal: that index's goal; only ``maximize`` can be inverted into a
            mass, because the factorisation makes the index the reciprocal of
            the material grouping.
        index_variables: the property names the index references.
        inputs: one value per design variable, in canonical units.
        records: the candidate pool, with canonical values.
        property_units: canonical unit per property slug, for the dimensions.
        objective: ``massa`` or ``custo``. It selects nothing in the arithmetic —
            the caller already chose the index — and everything in how the answer
            is named, which is the whole of D-65's contract.
        limit: how many solved records to return, cheapest or lightest first.

    Raises:
        SolverError: on an unusable brief or an index that cannot be inverted.
    """
    if objective not in OBJECTIVES:
        raise SolverError(f"Objetivo desconhecido: {objective}.")
    if index_goal != "maximize":
        raise SolverError(
            "O solver só inverte índice de maximizar: a massa é o recíproco do "
            "agrupamento material, e um índice de minimizar inverteria o sentido."
        )
    is_cost = objective == COST_OBJECTIVE
    # Written out here so the one message that names the answer does not promise
    # a mass on a cost run (and so the agreement stays Portuguese).
    non_positive = (
        "Índice não positivo: o custo seria negativo ou infinito."
        if is_cost
        else "Índice não positivo: a massa seria negativa ou infinita."
    )
    objective_factor, free_factor = structural_factors(case, inputs)
    objective_dimension, free_dimension = dimensions(case, index_expression, property_units)

    free_variables = variables_in(case.free_material)
    needed = index_variables | free_variables
    solved: list[SolvedRecord] = []
    excluded: list[ExcludedRecord] = []

    for record_id, name, values in records:
        present = {slug: value for slug, value in values.items() if value is not None}
        missing = sorted(needed - set(present))
        if missing:
            excluded.append(
                ExcludedRecord(
                    record_id=record_id,
                    name=name,
                    missing_keys=missing,
                    reason=f"Dados ausentes: {', '.join(missing)}",
                )
            )
            continue
        evaluation = evaluate_index(index_expression, index_variables, present)
        if evaluation.value is None:
            excluded.append(
                ExcludedRecord(
                    record_id=record_id,
                    name=name,
                    missing_keys=[],
                    reason=evaluation.undefined_reason or "Índice indefinido.",
                )
            )
            continue
        if evaluation.value <= 0:
            excluded.append(
                ExcludedRecord(
                    record_id=record_id,
                    name=name,
                    missing_keys=[],
                    reason=non_positive,
                )
            )
            continue
        try:
            free_value = free_factor * evaluate(
                case.free_material, {k: present[k] for k in free_variables}
            )
        except ExpressionError as exc:
            excluded.append(
                ExcludedRecord(record_id=record_id, name=name, missing_keys=[], reason=str(exc))
            )
            continue
        solved.append(
            SolvedRecord(
                record_id=record_id,
                name=name,
                rank=0,
                index_value=evaluation.value,
                objective_value=objective_factor / evaluation.value,
                free_value=free_value,
            )
        )

    solved.sort(key=lambda record: (record.objective_value, record.name))
    ranked = [
        SolvedRecord(
            record_id=record.record_id,
            name=record.name,
            rank=position,
            index_value=record.index_value,
            objective_value=record.objective_value,
            free_value=record.free_value,
        )
        for position, record in enumerate(solved[:limit], start=1)
    ]
    excluded.sort(key=lambda record: record.name)
    return SolverResult(
        structural_factor=objective_factor,
        free_structural_factor=free_factor,
        objective=objective,
        objective_unit=MONETARY_UNIT if is_cost else case.objective_unit,
        free_unit=case.free_unit,
        objective_dimension=objective_dimension,
        free_dimension=free_dimension,
        objective_note=COST_DIMENSION_NOTE if is_cost else None,
        solved=ranked,
        excluded=excluded,
    )
