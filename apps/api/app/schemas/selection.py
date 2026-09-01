"""Request/response schemas for the deterministic selection pipeline."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

OperatorLiteral = Literal[
    "gt",
    "gte",
    "lt",
    "lte",
    "between",
    "outside",
    "exists",
    "not_exists",
    "in_class",
    "not_in_class",
    "text_contains",
]
GoalLiteral = Literal["maximize", "minimize"]
DirectionLiteral = Literal["max", "min"]
NormalizationLiteral = Literal["minmax", "vector"]
MethodLiteral = Literal["weighted_sum", "topsis", "promethee"]
CombinatorLiteral = Literal["AND", "OR"]

# TOPSIS/PROMETHEE have no tunable pairwise-comparison count of their own,
# but AHP's matrix is O(n^2) judgments to review by hand — this caps it at
# the same size charts.py's MAX_COMPARE_PROPERTIES uses for a similar
# "how many things can a user usefully compare" limit.
MAX_AHP_CRITERIA = 12


# --- Inputs ----------------------------------------------------------------


class ConstraintIn(BaseModel):
    """One constraint. Numeric thresholds are in ``unit`` (converted server-side)."""

    operator: OperatorLiteral
    label: str | None = Field(default=None, max_length=200)
    property_slug: str | None = None
    value: float | None = Field(default=None, allow_inf_nan=False)
    value_min: float | None = Field(default=None, allow_inf_nan=False)
    value_max: float | None = Field(default=None, allow_inf_nan=False)
    unit: str | None = None
    class_slugs: list[str] = Field(default_factory=list)
    text: str | None = Field(default=None, max_length=200)


class IndexIn(BaseModel):
    """A performance index to compute over the candidates."""

    name: str | None = Field(default=None, max_length=160)
    expression: str = Field(min_length=1, max_length=500)
    goal: GoalLiteral = "maximize"


class CriterionIn(BaseModel):
    """One ranking criterion. ``key`` is a property slug or ``__index__``."""

    key: str = Field(min_length=1, max_length=160)
    label: str | None = Field(default=None, max_length=200)
    direction: DirectionLiteral | None = None  # defaults from property / index goal
    weight: float = Field(gt=0, allow_inf_nan=False)


class RankingIn(BaseModel):
    # ``normalization`` stays meaningful only when method == "weighted_sum":
    # TOPSIS and PROMETHEE each fix their own normalization internally.
    normalization: NormalizationLiteral = "minmax"
    method: MethodLiteral = "weighted_sum"
    criteria: list[CriterionIn]
    run_sensitivity: bool = True


class FilterRequest(BaseModel):
    combinator: CombinatorLiteral = "AND"
    constraints: list[ConstraintIn] = Field(default_factory=list)


class IndexRequest(BaseModel):
    expression: str = Field(min_length=1, max_length=500)
    goal: GoalLiteral = "maximize"


class RunRequest(BaseModel):
    combinator: CombinatorLiteral = "AND"
    constraints: list[ConstraintIn] = Field(default_factory=list)
    index: IndexIn | None = None
    ranking: RankingIn | None = None


# --- Outputs ---------------------------------------------------------------


class FunnelStepOut(BaseModel):
    label: str
    operator: str
    passed: int
    remaining: int


class CandidateOut(BaseModel):
    material_id: int
    name: str
    class_name: str
    index_value: float | None = None
    score: float | None = None
    rank: int | None = None


class FilterResultOut(BaseModel):
    initial_count: int
    combinator: str
    final_count: int
    steps: list[FunnelStepOut]
    candidates: list[CandidateOut]


class IndexValueOut(BaseModel):
    material_id: int
    name: str
    class_name: str
    value: float | None = None
    undefined_reason: str | None = None


class IndexResultOut(BaseModel):
    name: str | None = None
    expression: str
    goal: str
    dimension: str
    variables: list[str]
    values: list[IndexValueOut]
    defined_count: int
    undefined_count: int


class ContributionOut(BaseModel):
    key: str
    label: str
    raw: float
    normalized: float
    weight: float
    contribution: float


class RankedMaterialOut(BaseModel):
    material_id: int
    name: str
    score: float
    rank: int
    contributions: list[ContributionOut]


class ExcludedMaterialOut(BaseModel):
    material_id: int
    name: str
    missing_keys: list[str]
    missing_labels: list[str]


class SensitivityScenarioOut(BaseModel):
    description: str
    weights: dict[str, float]
    top_material_id: int | None = None
    top_material_name: str | None = None
    changed: bool


class RankingResultOut(BaseModel):
    normalization: str
    method: str
    criteria: list[str]
    ranked: list[RankedMaterialOut]
    excluded: list[ExcludedMaterialOut]
    sensitivity: list[SensitivityScenarioOut]


class RunResultOut(BaseModel):
    initial_count: int
    combinator: str
    final_count: int
    funnel: list[FunnelStepOut]
    candidates: list[CandidateOut]
    index: IndexResultOut | None = None
    ranking: RankingResultOut | None = None


# --- Performance-index catalogue -------------------------------------------


class PerformanceIndexIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    expression: str = Field(min_length=1, max_length=500)
    goal: GoalLiteral = "maximize"
    description: str | None = Field(default=None, max_length=500)
    assumptions: dict | None = None


class PerformanceIndexOut(BaseModel):
    id: int
    name: str
    slug: str
    expression: str
    goal: str
    description: str | None = None
    assumptions: dict | None = None
    dimension: str | None = None
    is_demo: bool


# --- Saved studies ---------------------------------------------------------


class StudyIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    function_text: str | None = Field(default=None, max_length=1000)
    objective_text: str | None = Field(default=None, max_length=1000)
    free_variables: list[str] = Field(default_factory=list)
    combinator: CombinatorLiteral = "AND"
    constraints: list[ConstraintIn] = Field(default_factory=list)
    index: IndexIn | None = None
    normalization: NormalizationLiteral = "minmax"
    method: MethodLiteral = "weighted_sum"
    criteria: list[CriterionIn] = Field(default_factory=list)


class StudySummaryOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    created_at: datetime
    constraint_count: int
    criterion_count: int


class StudyOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    function_text: str | None = None
    objective_text: str | None = None
    free_variables: list[str]
    combinator: str
    constraints: list[ConstraintIn]
    index: IndexIn | None = None
    normalization: str
    method: str
    criteria: list[CriterionIn]
    created_at: datetime


# --- AHP (pairwise-comparison weight derivation) ----------------------------


class AhpWeightsIn(BaseModel):
    """A pairwise comparison matrix (Saaty's 1-9 scale) to derive weights from."""

    criteria: list[str] = Field(min_length=2, max_length=MAX_AHP_CRITERIA)
    matrix: list[list[float]]


class AhpWeightsOut(BaseModel):
    weights: dict[str, float]
    lambda_max: float
    consistency_index: float
    consistency_ratio: float
