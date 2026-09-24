"""Request/response schemas for the deterministic selection pipeline."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

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
    # P0-4: set membership over a discrete process attribute's closed vocabulary.
    "has_any_label",
    "has_no_label",
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

# Belt-and-suspenders, not a currently-exploitable gap: Pydantic's own
# recursion guard already stops a deeply/widely nested ConstraintGroupIn tree
# from a stack-overflow DoS before this bound is ever reached. It exists
# because this file's own convention (see MAX_AHP_CRITERIA above) is to bound
# every array input explicitly rather than lean on an incidental library
# behavior nobody chose as a limit on purpose.
MAX_CONSTRAINT_GROUP_CHILDREN = 25

# A study's pipeline. Bounded like every other array here; twenty ordered stages
# is already far past what a selection argument stays readable at, and each one
# costs a full pass over the catalogue.
MAX_STAGES = 20

#: Which universe a study returns (P0-3). "material" is the default and what
#: every study saved before P0-3 does.
UniverseLiteral = Literal["material", "process"]


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
    # P0-4: the labels a has_any_label / has_no_label constraint names. A field of
    # its own and not `class_slugs`, because a class slug and an attribute label
    # are different namespaces — the same reason the process stage keeps its two
    # slug lists apart.
    labels: list[str] = Field(default_factory=list)


class ConstraintGroupIn(BaseModel):
    """One node of a nested AND/OR constraint tree (M6).

    Self-referencing via ``groups: list["ConstraintGroupIn"]`` — resolved by
    this module's ``from __future__ import annotations`` at class-creation
    time, no explicit ``model_rebuild()`` needed for a direct self-reference.
    Optional everywhere it plugs into ``StudyIn``/``FilterRequest``/
    ``RunRequest``: its absence (``root_group=None``) preserves the flat
    ``constraints``/``combinator`` shape those schemas already had.

    ``groups`` (direct children of one node) is capped at
    ``MAX_CONSTRAINT_GROUP_CHILDREN`` — belt-and-suspenders, since Pydantic's
    own recursion guard already prevents a stack-overflow DoS from a deep or
    wide tree; see that constant's own comment.
    """

    operator: CombinatorLiteral
    constraints: list[ConstraintIn] = Field(default_factory=list)
    groups: list[ConstraintGroupIn] = Field(
        default_factory=list, max_length=MAX_CONSTRAINT_GROUP_CHILDREN
    )


class ChartAxisIn(BaseModel):
    """One axis of a chart stage: what it plots, and where the box cuts it.

    Exactly one of ``property_slug`` and ``expression`` — the two are different
    namespaces that happen to overlap (``densidade`` is a valid expression as
    well as a slug), so which one the reader meant cannot be inferred from the
    string. The same rule the database enforces on the stage's own columns.

    ``min_value``/``max_value`` are in **data coordinates and canonical units**,
    never pixels (ADR 0004) and never the unit the value was entered in. There is
    no ``unit`` field here, unlike a constraint's: a constraint's threshold is
    typed by a reader who picks the unit, while these numbers are read off an
    axis that ``ChartService`` already draws in canonical units. Either bound may
    be absent — a box open on one side is a real thing to draw.
    """

    property_slug: str | None = Field(default=None, min_length=1, max_length=160)
    expression: str | None = Field(default=None, min_length=1, max_length=500)
    min_value: float | None = Field(default=None, allow_inf_nan=False)
    max_value: float | None = Field(default=None, allow_inf_nan=False)


class ChartStageIn(BaseModel):
    """The plane a chart stage selects on, and what was drawn on it (P1-2).

    Two things can be drawn, and either may be absent: the **box** (bounds on
    each axis, in :class:`ChartAxisIn`) and the **index line**
    (``index_expression`` + ``index_level``, admitting the favourable side).
    A stage with neither still selects, and means "must be plottable here".

    ``index_level`` is a number, not "the line through material 7": sliding the
    line until it passes through a record is how a reader *finds* the level, but
    storing the record would move the line whenever that record's data changed,
    and a saved study has to re-run to the same answer.

    Deliberately not shaped like ``PropertyMapRequest``, which the map endpoint
    takes: that one carries scale and envelope options and no bounds, because it
    describes a *drawing*. This one describes a *criterion*, and the axis is the
    only thing the two share.
    """

    x: ChartAxisIn
    y: ChartAxisIn
    index_expression: str | None = Field(default=None, min_length=1, max_length=500)
    index_goal: GoalLiteral = "maximize"
    index_level: float | None = Field(default=None, allow_inf_nan=False)


class StageIn(BaseModel):
    """One stage of the selection pipeline (P0-1).

    A stage is one kind of question, and supplying the other kind's fields is
    rejected rather than ignored — silently dropping a filter the user wrote is
    the shape of a "why does my selection not narrow" bug.

    * ``kind="limit"``: ``constraints`` + ``combinator``, or a nested
      ``root_group`` (M6), exactly as the top-level payload accepts them.
    * ``kind="tree"``: ``class_slugs``, with ``include_descendants`` deciding
      whether picking a folder picks everything under it.
    * ``kind="process"``: ``process_slugs`` and/or ``process_class_slugs``
      (P0-2) — the join into the process universe. Any-of: the stage keeps the
      materials some selected process applies to. ``include_descendants``
      applies to the folders here too.
    * ``kind="chart"``: ``chart`` (P1-2) — a region of one plane. The only stage
      that reaches a *derived* quantity, because a limit stage names property
      slugs and an index is not one.
    """

    kind: Literal["limit", "tree", "process", "material", "chart"] = "limit"
    label: str | None = Field(default=None, max_length=200)
    enabled: bool = True

    combinator: CombinatorLiteral = "AND"
    constraints: list[ConstraintIn] = Field(default_factory=list)
    root_group: ConstraintGroupIn | None = None

    class_slugs: list[str] = Field(default_factory=list)
    process_slugs: list[str] = Field(default_factory=list)
    process_class_slugs: list[str] = Field(default_factory=list)
    # kind === "material" (P0-3): folders of the material taxonomy, in a process
    # study. Folders only — a Material has no slug to name a leaf by.
    material_class_slugs: list[str] = Field(default_factory=list)
    # kind === "chart" (P1-2): the plane, the box and the line.
    chart: ChartStageIn | None = None
    # Shared by every folder-selecting stage: a folder means what is under it.
    include_descendants: bool = True


class StageOut(BaseModel):
    """A persisted stage, read back whole.

    ``root_group`` carries the real tree, nesting included — which also closes
    the gap M6 left on the read side, where a saved nested study came back as a
    flat constraint list and reopening it silently lost the parentheses.
    """

    position: int
    kind: Literal["limit", "tree", "process", "material", "chart"]
    label: str | None = None
    enabled: bool
    root_group: ConstraintGroupIn | None = None
    class_slugs: list[str] = Field(default_factory=list)
    process_slugs: list[str] = Field(default_factory=list)
    process_class_slugs: list[str] = Field(default_factory=list)
    material_class_slugs: list[str] = Field(default_factory=list)
    chart: ChartStageIn | None = None
    include_descendants: bool = True


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
    # P0-3: which universe to filter. The stage kinds a pipeline may use follow
    # from it, and the service refuses a stage that belongs to the other one.
    universe: UniverseLiteral = "material"
    combinator: CombinatorLiteral = "AND"
    constraints: list[ConstraintIn] = Field(default_factory=list)
    # M6: an explicit nested tree overrides combinator/constraints entirely.
    # Omitting it reproduces the flat behavior exactly; supplying both this
    # and a non-empty `constraints` is rejected by the service layer.
    root_group: ConstraintGroupIn | None = None
    # P0-1: an explicit pipeline overrides the three fields above entirely.
    # Supplying it together with any of them is rejected by the service layer,
    # for the same reason: two descriptions of the same filter, one silently
    # ignored.
    stages: list[StageIn] | None = Field(default=None, max_length=MAX_STAGES)


class IndexRequest(BaseModel):
    expression: str = Field(min_length=1, max_length=500)
    goal: GoalLiteral = "maximize"


class RunRequest(BaseModel):
    universe: UniverseLiteral = "material"
    combinator: CombinatorLiteral = "AND"
    constraints: list[ConstraintIn] = Field(default_factory=list)
    # M6: see FilterRequest.root_group — same override/compatibility rule.
    root_group: ConstraintGroupIn | None = None
    # P0-1: see FilterRequest.stages — same override/exclusivity rule.
    stages: list[StageIn] | None = Field(default=None, max_length=MAX_STAGES)
    index: IndexIn | None = None
    ranking: RankingIn | None = None


# --- Outputs ---------------------------------------------------------------


class FunnelStepOut(BaseModel):
    label: str
    operator: str
    passed: int
    remaining: int


class StageResultOut(BaseModel):
    """What one stage of the pipeline did (P0-1).

    ``passed`` is what the stage admits **on its own**, over the whole
    catalogue — reported for a disabled stage too, because that is exactly the
    question switching a stage off asks. ``remaining`` is the running count
    after this stage: unchanged for a disabled one, since it did not narrow.

    ``steps`` is the inner funnel of a limit stage — one line per constraint or
    nested sub-group, the same shape the single-tree funnel always had. A tree
    or process stage has no inner steps: its whole question is the selection
    itself.
    """

    position: int
    kind: str
    label: str | None = None
    enabled: bool
    passed: int
    remaining: int
    steps: list[FunnelStepOut] = Field(default_factory=list)


class CandidateOut(BaseModel):
    """One surviving record of the pipeline.

    ``record_id`` and not ``material_id`` since P0-3: in a process study this
    row *is* a process, and a field named for one universe while carrying the
    other's id is the same class of lie the funnel's ``in_tree`` was. The
    ranking outputs below keep their material-specific names on purpose — a
    process study cannot rank yet (no attributes), so they provably never
    describe a process.
    """

    record_id: int
    name: str
    class_name: str
    index_value: float | None = None
    score: float | None = None
    rank: int | None = None


class FilterResultOut(BaseModel):
    # P0-3: which universe the candidates are records of. Stated, never left to
    # be inferred from the ids.
    universe: UniverseLiteral = "material"
    initial_count: int
    combinator: str
    final_count: int
    steps: list[FunnelStepOut]
    candidates: list[CandidateOut]
    # P0-1: same per-stage report `RunResultOut` carries. Filtering accepts a
    # pipeline, so it has to be able to describe one — reporting only the flat
    # funnel here would make the two endpoints disagree about the same request.
    stages: list[StageResultOut] = Field(default_factory=list)


class IndexValueOut(BaseModel):
    # ``record_id`` and not ``material_id`` since P0-4, for the reason
    # ``CandidateOut`` gives: in a process study this is a process's id, and a
    # field named after materials would have a reader resolve it against them.
    record_id: int
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
    record_id: int
    name: str
    score: float
    rank: int
    contributions: list[ContributionOut]


class ExcludedMaterialOut(BaseModel):
    record_id: int
    name: str
    missing_keys: list[str]
    missing_labels: list[str]


class SensitivityScenarioOut(BaseModel):
    description: str
    weights: dict[str, float]
    top_record_id: int | None = None
    top_record_name: str | None = None
    changed: bool


class RankingResultOut(BaseModel):
    normalization: str
    method: str
    criteria: list[str]
    ranked: list[RankedMaterialOut]
    excluded: list[ExcludedMaterialOut]
    sensitivity: list[SensitivityScenarioOut]


class RunResultOut(BaseModel):
    universe: UniverseLiteral = "material"
    initial_count: int
    # The operator that combined the candidates. With a single limit stage this
    # is its root group's own AND/OR, exactly as before P0-1. With more than one
    # stage it is "AND": stages intersect, and reporting a stage's internal "OR"
    # here would describe the pipeline as something it is not. `stages` below is
    # the full truth either way.
    combinator: str
    final_count: int
    funnel: list[FunnelStepOut]
    candidates: list[CandidateOut]
    # P0-1: the pipeline, stage by stage. A study saved before P0-1 (or through
    # the flat payload) reports exactly one entry, and `funnel` then holds
    # precisely the steps it always did.
    stages: list[StageResultOut] = Field(default_factory=list)
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
    universe: UniverseLiteral = "material"
    combinator: CombinatorLiteral = "AND"
    constraints: list[ConstraintIn] = Field(default_factory=list)
    # M6: see FilterRequest.root_group — same override/compatibility rule.
    root_group: ConstraintGroupIn | None = None
    # P0-1: see FilterRequest.stages — same override/exclusivity rule.
    stages: list[StageIn] | None = Field(default=None, max_length=MAX_STAGES)
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
    stage_count: int = 1
    universe: UniverseLiteral = "material"


class StudyOut(BaseModel):
    id: int
    name: str
    description: str | None = None
    function_text: str | None = None
    objective_text: str | None = None
    free_variables: list[str]
    universe: UniverseLiteral = "material"
    # Kept as they always were, for every caller that reads them: the flat list
    # of every constraint in the study, and the first stage's root operator.
    # `stages` below is what carries the study's actual structure.
    combinator: str
    constraints: list[ConstraintIn]
    stages: list[StageOut] = Field(default_factory=list)
    index: IndexIn | None = None
    normalization: str
    method: str
    criteria: list[CriterionIn]
    created_at: datetime


# --- AHP (pairwise-comparison weight derivation) ----------------------------


class AhpWeightsIn(BaseModel):
    """A pairwise comparison matrix (Saaty's 1-9 scale) to derive weights from."""

    criteria: list[str] = Field(min_length=2, max_length=MAX_AHP_CRITERIA)
    # allow_inf_nan=False, same guard every other numeric field in this file
    # uses (ConstraintIn.value/.value_min/.value_max, CriterionIn.weight):
    # json.loads accepts literal NaN/Infinity, and derive_weights's own
    # rejection checks are all `>` comparisons — always False against NaN —
    # so a NaN-poisoned matrix would silently pass the consistency-ratio
    # check instead of being rejected by it, and then fail to serialize
    # (FastAPI's JSONResponse sets allow_nan=False) as an unhandled 500
    # instead of the normal 400/422 a malformed matrix gets everywhere else.
    matrix: list[list[Annotated[float, Field(allow_inf_nan=False)]]]


class AhpWeightsOut(BaseModel):
    weights: dict[str, float]
    lambda_max: float
    consistency_index: float
    consistency_ratio: float


# --- Weight budget and top-N preview (D-87) ---------------------------------

#: Mirrors ``app.domain.weights.MAX_WEIGHT_CRITERIA`` (and ``MAX_AHP_CRITERIA``):
#: past a dozen criteria a weighted average stops meaning anything a reader can
#: check.
MAX_WEIGHT_CRITERIA = 12


class WeightCriterionIn(BaseModel):
    """A criterion row **as the reader has it while typing**.

    Unlike ``CriterionIn`` — which is what a ranking runs on, and so requires a
    key and a positive weight — every field here may still be empty: the preview
    exists to say what is missing, and refusing the request with a 422 would
    turn "you have not typed the weight yet" into an error.
    """

    key: str = Field(default="", max_length=160)
    label: str | None = Field(default=None, max_length=200)
    direction: DirectionLiteral | None = None
    weight: float | None = Field(default=None, allow_inf_nan=False)


class WeightsPreviewRequest(BaseModel):
    universe: UniverseLiteral = "material"
    # The stages the screen holds right now; none (or an empty list) means the
    # whole catalogue — the preview is often read before any constraint exists.
    stages: list[StageIn] | None = Field(default=None, max_length=MAX_STAGES)
    index: IndexIn | None = None
    method: MethodLiteral = "weighted_sum"
    normalization: NormalizationLiteral = "minmax"
    criteria: list[WeightCriterionIn] = Field(default_factory=list, max_length=MAX_WEIGHT_CRITERIA)
    top_n: int = Field(default=5, ge=1, le=10)


class WeightRowOut(BaseModel):
    position: int
    key: str | None = None
    weight: float | None = None
    share: float | None = None
    share_percent: float | None = None
    issue: (
        Literal[
            "missing_key",
            "missing_weight",
            "zero",
            "negative",
            "duplicate_key",
            "unknown_key",
            "index_missing",
        ]
        | None
    ) = None


class WeightSuggestionOut(BaseModel):
    kind: Literal["fill_blanks", "spread_remaining", "split_equally", "scale_to_limit"]
    weights: list[float]


class WeightBudgetOut(BaseModel):
    limit: float
    tolerance: float
    total: float
    remaining: float
    excess: float
    status: Literal["empty", "incomplete", "complete", "exceeds"]
    rows: list[WeightRowOut]
    suggestion: WeightSuggestionOut | None = None
    can_run: bool


class PreviewCandidateOut(BaseModel):
    rank: int
    record_id: int
    name: str
    class_name: str | None = None
    score: float


class WeightsPreviewOut(BaseModel):
    """The budget always; the top-N when there is something to rank.

    ``unavailable_reason`` says why there is no top-N instead of an error: a
    reader half-way through typing a constraint or an expression is not doing
    anything wrong, and a 400 on every keystroke would say they were.
    """

    budget: WeightBudgetOut
    method: str
    top: list[PreviewCandidateOut] = Field(default_factory=list)
    initial_count: int = 0
    candidate_count: int = 0
    ranked_count: int = 0
    #: Whether any constraint narrowed the list the preview ranks. Before the
    #: constraints exist, the top-N is over the whole catalogue — and since the
    #: normalization is over the survivors, the scores will move once they do.
    constraints_applied: bool = False
    #: Whether the typed weights did not close at 1 and the preview ranked with
    #: them renormalized (what ``/run`` does).
    renormalized: bool = False
    unavailable_reason: (
        Literal["no_criteria", "no_candidates", "all_excluded", "pipeline_error"] | None
    ) = None
    unavailable_message: str | None = None
