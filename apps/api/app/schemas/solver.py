"""Contracts for the Engineering Solver and the Performance Index Finder (P2).

One catalogue serves both: a load case *is* the (função, restrição, objetivo,
variável livre) tuple the Finder browses, and the brief the Solver runs. They
are two readings of one derivation, so they share one shape.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.calculations.load_cases import COST_OBJECTIVE, MASS_OBJECTIVE

#: A brief with more design variables than this is not one of our cases; the
#: bound exists so an oversized payload is refused before it reaches the parser.
MAX_DESIGN_VARIABLES = 12


class DesignVariableOut(BaseModel):
    key: str
    label: str
    unit: str
    help_text: str


class SupportConditionOut(BaseModel):
    key: str
    label: str
    variable_key: str
    value: float
    note: str | None = None


class LoadCaseOut(BaseModel):
    """One case, with everything a reader needs to re-derive the number by hand."""

    key: str
    label: str
    summary: str
    #: The facets the Finder browses by.
    function_label: str
    constraint_label: str
    objective_label: str
    free_variable_label: str
    fixed_labels: list[str]
    #: The derivation, step by step, and where the method comes from.
    derivation: list[str]
    reference: str
    #: The index this case yields — read from the catalogue, never authored here.
    index_slug: str
    index_name: str | None = None
    index_expression: str | None = None
    index_goal: str | None = None
    #: The same derivation read against cost (D-65): ρ·Cm in place of ρ. Carried
    #: beside the mass index rather than in place of it, because the Finder
    #: browses a case's *two* answers to one brief.
    cost_index_slug: str
    cost_index_name: str | None = None
    cost_index_expression: str | None = None
    cost_objective_label: str
    objective_unit: str
    free_unit: str
    variables: list[DesignVariableOut]
    supports: list[SupportConditionOut]


class SolveRequest(BaseModel):
    case_key: str = Field(min_length=1, max_length=80)
    #: One value per design variable, in that variable's canonical unit.
    inputs: dict[str, float]
    #: Which of the case's two indices to run. Defaults to the mass, which is
    #: what the endpoint answered before D-65 — an older client keeps its answer.
    objective: Literal[MASS_OBJECTIVE, COST_OBJECTIVE] = MASS_OBJECTIVE
    limit: int = Field(default=10, ge=1, le=50)

    @field_validator("inputs")
    @classmethod
    def _bounded_and_finite(cls, value: dict[str, float]) -> dict[str, float]:
        if not value:
            raise ValueError("Informe as variáveis de projeto.")
        if len(value) > MAX_DESIGN_VARIABLES:
            raise ValueError("Variáveis de projeto demais.")
        for key, number in value.items():
            # NaN and infinity survive JSON in most clients and would produce a
            # mass that is neither a number nor an error.
            if number != number or number in (float("inf"), float("-inf")):
                raise ValueError(f"Valor inválido para {key}.")
        return value


class SolvedRecordOut(BaseModel):
    record_id: int
    name: str
    class_name: str
    class_slug: str
    is_demo: bool
    is_own_record: bool
    rank: int
    index_value: float
    objective_value: float
    free_value: float


class SolverExcludedOut(BaseModel):
    record_id: int
    name: str
    missing_slugs: list[str]
    missing_labels: list[str]
    reason: str


class SolveResultOut(BaseModel):
    """The answer, with the factor that produced it in the open."""

    case: LoadCaseOut
    inputs: dict[str, float]
    #: Which objective ran, and the index that answered it. Both are on the
    #: result rather than read off the case, because a case carries two indices
    #: and a screen showing the other one would be the second truth D-60 and
    #: D-63 each refused in their own layer.
    objective: str
    objective_label: str
    index_slug: str
    index_name: str | None = None
    index_expression: str | None = None
    #: Pure geometry and load — identical for every material in this run, which
    #: is what makes the ordering the index's ordering.
    structural_factor: float
    free_structural_factor: float
    objective_unit: str
    free_unit: str
    #: Derived by Pint from the canonical units, never declared by hand — and on
    #: a cost run *not* the answer's unit, which is what ``objective_note`` says.
    objective_dimension: str
    free_dimension: str
    objective_note: str | None = None
    solved: list[SolvedRecordOut]
    excluded: list[SolverExcludedOut]
