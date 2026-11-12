"""Contracts for the optional AI layer.

Every type here describes a **proposal**, never a result. The wording is
deliberate: the layer returns things the user may choose to apply, and the API
never applies them itself. Numeric property values do not appear anywhere in
these schemas, which is the structural half of the guarantee that the AI cannot
invent one — the other half is enforced in ``app/ai/guardrails.py``.
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.selection import ConstraintIn, GoalLiteral, StudyIn

# Longest problem statement accepted. Generous for a design brief, bounded so a
# provider call cannot be driven by an arbitrarily large body.
MAX_STATEMENT_LENGTH = 4000


CapabilityKey = Literal["texto", "json_estrito", "embeddings", "busca_web"]


class AICapabilityOut(BaseModel):
    """One capability of the layer and whether this server has it configured (D-228)."""

    key: CapabilityKey
    label: str
    configured: bool
    detail: str


class AIStatusOut(BaseModel):
    """Whether the layer is available, and under what terms.

    D-228: also *which* model and host answer, and each capability configured or
    not. The host only — never the path or the key, which can travel in a URL.
    """

    enabled: bool
    provider: str
    simulated: bool = Field(
        description="True quando o provedor é a implementação simulada, sem serviço externo"
    )
    disclaimer: str
    model: str = Field(default="", description="Modelo de texto; vazio no simulado")
    host: str = Field(default="", description="Só o host do provedor, nunca a chave")
    json_mode: str = Field(default="", description="schema, object ou prompt")
    embedding_model: str = ""
    capabilities: list[AICapabilityOut] = Field(default_factory=list)


DiagnosticKey = Literal["json", "embeddings", "busca_web"]
DiagnosticStatus = Literal["ok", "erro", "nao_configurado"]


class AIDiagnosticCheckOut(BaseModel):
    """One live check of the diagnosis: a JSON answer, an embedding, a web search."""

    key: DiagnosticKey
    label: str
    status: DiagnosticStatus
    latency_ms: int | None = None
    message: str


class AIDiagnosticoOut(BaseModel):
    """The result of ``POST /ai/diagnostico`` (D-228)."""

    ok: bool = Field(description="True quando o texto/JSON respondeu e nada configurado falhou")
    provider: str
    simulated: bool
    model: str
    host: str
    checked_at: datetime
    checks: list[AIDiagnosticCheckOut]
    remaining: int = Field(description="Diagnósticos que esta pessoa ainda pode rodar nesta hora")


class InterpretRequest(BaseModel):
    """A free-text engineering problem to be structured."""

    statement: str = Field(min_length=1, max_length=MAX_STATEMENT_LENGTH)


class SuggestedConstraint(BaseModel):
    """A constraint the layer believes the statement expresses.

    ``evidence`` quotes the fragment of the user's own text the reading came
    from, so the person reviewing it can check the interpretation instead of
    trusting it.
    """

    constraint: ConstraintIn
    evidence: str = Field(max_length=300)
    rationale: str = Field(max_length=300)


class SuggestedIndex(BaseModel):
    """A performance index proposed from the catalogue.

    ``slug`` must name an index that already exists: the layer selects, it does
    not author expressions.
    """

    slug: str
    name: str
    expression: str
    goal: GoalLiteral
    rationale: str = Field(max_length=300)


class SuggestedProperty(BaseModel):
    """A catalogue property the statement seems to care about."""

    slug: str
    name: str
    rationale: str = Field(max_length=300)


class SuggestedChart(BaseModel):
    """A property map worth opening for this problem."""

    x: str
    y: str
    scale: Literal["linear", "log"]
    rationale: str = Field(max_length=300)


class InterpretationOut(BaseModel):
    """The structured, editable reading of a problem statement.

    Nothing here is applied. The client shows it for review; the user accepts,
    edits or discards each item before it becomes part of a selection.
    """

    statement: str
    function_text: str | None = None
    objective_text: str | None = None
    free_variables: list[str] = Field(default_factory=list)
    constraints: list[SuggestedConstraint] = Field(default_factory=list)
    properties: list[SuggestedProperty] = Field(default_factory=list)
    indices: list[SuggestedIndex] = Field(default_factory=list)
    chart: SuggestedChart | None = None
    # What the layer could not read, and what it discarded on the way out.
    open_questions: list[str] = Field(default_factory=list)
    rejected: list[str] = Field(default_factory=list)
    provider: str
    simulated: bool
    disclaimer: str


class ExplainRequest(BaseModel):
    """Ask for prose about an already-computed selection.

    Only a study id is accepted: the explanation is written about numbers the
    deterministic pipeline produced, re-run server-side, never about numbers
    supplied by the caller.
    """

    study_id: int


class CitedSourceOut(BaseModel):
    """One reference passage the explanation actually drew on.

    Only the fields a reader needs to go check the source — never the
    passage's own text, which stays server-side context, not something the
    interface repeats back.
    """

    document_title: str
    page_start: int | None = None
    page_end: int | None = None


class ExplanationOut(BaseModel):
    """Prose about a computed result, plus what it deliberately does not say."""

    study_id: int
    study_name: str
    summary: str
    paragraphs: list[str]
    caveats: list[str]
    sources: list[CitedSourceOut] = Field(default_factory=list)
    provider: str
    simulated: bool
    disclaimer: str


# --- project assistant (D-224) ------------------------------------------------
#
# A plan is a proposal like everything above, with one difference stated in the
# open: its limits carry numbers, and every number says where it came from.
# ``origin`` is ``usuario`` (in the person's text), ``cenario:<id>`` (the curated
# table in app/domain/use_scenarios.py, with its source), ``sugestao_ia`` (a
# range the model proposed — "Sugestão da IA, revise" — never applied until the
# person confirms it) or ``indice`` (a property the ranking reads must have data;
# no number at all).

PlanModeLiteral = Literal["project", "single"]
PlanDirectionLiteral = Literal["max", "min"]
PlanOperatorLiteral = Literal["gt", "gte", "lt", "lte", "between", "exists", "level_at_least"]
#: The four origins, as a pattern: a scenario origin names its id.
ORIGIN_PATTERN = r"^(usuario|sugestao_ia|indice|cenario:[a-z0-9-]+)$"
#: Components a plan may carry, and limits one component may carry.
MAX_PLAN_COMPONENTS = 6
MAX_PLAN_CONSTRAINTS = 30
MAX_PLAN_CRITERIA = 8


class PlanRequest(BaseModel):
    """A plain-language request: "quero fazer uma roupa de esqui"."""

    text: str = Field(min_length=1, max_length=MAX_STATEMENT_LENGTH)
    #: ``project`` asks for the parts of a product (home page); ``single`` for
    #: one component (the Selection's assistant).
    mode: PlanModeLiteral = "project"


class PlanScenarioOut(BaseModel):
    """A curated use scenario the plan used, with its source."""

    id: str
    name: str
    source: str


class PlanConstraintOut(BaseModel):
    """One limit of a component, with where its number came from."""

    property: str
    property_name: str
    operator: PlanOperatorLiteral
    value: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    unit: str | None = None
    #: The minimum level, for ``level_at_least`` over an ordinal property.
    level: str | None = None
    origin: str = Field(pattern=ORIGIN_PATTERN)
    #: The person's own words, the scenario's source, or "Sugestão da IA, revise".
    source: str
    note: str = ""
    #: How the limit reads, e.g. "Temperatura mínima de serviço ≤ −30 °C".
    label: str
    #: Whether the automatic run used it. ``sugestao_ia`` never is.
    applied: bool
    #: True for ``sugestao_ia``: shown for review, applied only once confirmed.
    needs_confirmation: bool = False
    #: The same limit in the shape every selection endpoint accepts.
    constraint: ConstraintIn


class PlanCriterionOut(BaseModel):
    """A ranking criterion of a component (a numeric property and its direction)."""

    property: str
    property_name: str
    direction: PlanDirectionLiteral
    #: ``ia``, ``cenario:<id>`` or ``servidor`` (picked when nothing else ranked).
    origin: str


class PlanIndexOut(BaseModel):
    """A catalogue index, read from the catalogue — never written by the model."""

    slug: str
    name: str
    expression: str
    goal: GoalLiteral


class PlanMaterialOut(BaseModel):
    """One of the first materials of a component's deterministic run."""

    record_id: int
    name: str
    class_name: str
    rank: int | None = None
    index_value: float | None = None
    score: float | None = None
    #: Why it is here, read from the run (limits passed, position).
    reason: str


class PlanFunnelStepOut(BaseModel):
    label: str
    remaining: int


class PlanRunOut(BaseModel):
    """What the selection service returned for one component."""

    initial_count: int = 0
    final_count: int = 0
    funnel: list[PlanFunnelStepOut] = Field(default_factory=list)
    materials: list[PlanMaterialOut] = Field(default_factory=list)
    #: Plain words when the list is empty or short, e.g. where the funnel zeroed.
    message: str | None = None
    #: The selection's own refusal, when the run could not happen at all.
    error: str | None = None


class PlanComponentOut(BaseModel):
    """One part of the product, its limits, its ranking and its first materials."""

    key: str
    name: str
    role: str = ""
    function_text: str = ""
    objective_text: str = ""
    index: PlanIndexOut | None = None
    criteria: list[PlanCriterionOut] = Field(default_factory=list)
    constraints: list[PlanConstraintOut] = Field(default_factory=list)
    scenarios: list[str] = Field(default_factory=list)
    #: What the guardrails refused for this component, with the reason.
    rejected: list[str] = Field(default_factory=list)
    result: PlanRunOut | None = None
    #: A ready study for the Selection: the applied limits (never an
    #: unconfirmed suggestion), the index and the criteria.
    study: StudyIn


class ProjectPlanOut(BaseModel):
    """A proposal for a whole project — never empty, never applied by itself."""

    text: str
    mode: PlanModeLiteral
    summary: str
    assumptions: list[str] = Field(default_factory=list)
    open_questions: list[str] = Field(default_factory=list)
    scenarios_used: list[PlanScenarioOut] = Field(default_factory=list)
    components: list[PlanComponentOut]
    rejected: list[str] = Field(default_factory=list)
    #: True when the proposal came from the local rules because the model did
    #: not answer usefully (timeout, quota, malformed JSON); ``notice`` says why.
    degraded: bool = False
    #: True when the model's plan for this same text was reused (no quota spent).
    cached: bool = False
    notice: str | None = None
    provider: str
    simulated: bool
    disclaimer: str


class PlanConstraintIn(BaseModel):
    """One limit as the person left it, sent back to run the plan again."""

    property: str = Field(min_length=1, max_length=160)
    operator: PlanOperatorLiteral
    value: float | None = Field(default=None, allow_inf_nan=False)
    value_min: float | None = Field(default=None, allow_inf_nan=False)
    value_max: float | None = Field(default=None, allow_inf_nan=False)
    unit: str | None = Field(default=None, max_length=60)
    level: str | None = Field(default=None, max_length=80)
    origin: str = Field(pattern=ORIGIN_PATTERN)
    #: An ``sugestao_ia`` limit runs only when this is true.
    confirmed: bool = False
    note: str = Field(default="", max_length=300)


class PlanCriterionIn(BaseModel):
    property: str = Field(min_length=1, max_length=160)
    direction: PlanDirectionLiteral


class PlanComponentRunIn(BaseModel):
    """One component with the person's choices: what to keep, what to confirm."""

    key: str | None = Field(default=None, max_length=40)
    name: str = Field(min_length=1, max_length=160)
    role: str = Field(default="", max_length=300)
    function_text: str = Field(default="", max_length=300)
    objective_text: str = Field(default="", max_length=300)
    index_slug: str | None = Field(default=None, max_length=160)
    criteria: list[PlanCriterionIn] = Field(default_factory=list, max_length=MAX_PLAN_CRITERIA)
    constraints: list[PlanConstraintIn] = Field(
        default_factory=list, max_length=MAX_PLAN_CONSTRAINTS
    )


class PlanRunRequest(BaseModel):
    """Run a plan again with the person's choices (no model call, no quota)."""

    components: list[PlanComponentRunIn] = Field(min_length=1, max_length=MAX_PLAN_COMPONENTS)


class PlanRunResponse(BaseModel):
    components: list[PlanComponentOut]


# --- suggestions of every tool (D-228) ---------------------------------------

SuggestTool = Literal[
    "mapas",
    "comparar",
    "catalogo",
    "ficha",
    "processos",
    "glossario",
    "sintetizar",
    "painel",
    "registros",
    "importar",
    "dimensionar",
    "custo",
    "eco",
    "baterias",
    "admin_classes",
    "admin_propriedades",
]

#: Largest context a screen may send, as JSON text. A context carries ids,
#: slugs and the screen's parameters — never a table of values.
MAX_SUGGEST_CONTEXT_CHARS = 20_000


class SuggestRequest(BaseModel):
    """One screen asking "what could I do next?".

    ``context`` is what the screen shows (ids, slugs, parameters). The server
    validates it per tool and enriches it from the database or its own
    calculation; numbers a client sends as a "result" are never read.
    """

    tool: SuggestTool
    context: dict[str, Any] = Field(default_factory=dict)

    @field_validator("context")
    @classmethod
    def _bounded(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, ensure_ascii=False, default=str)) > MAX_SUGGEST_CONTEXT_CHARS:
            raise ValueError(
                f"O contexto da sugestão passa de {MAX_SUGGEST_CONTEXT_CHARS} caracteres."
            )
        return value


class _ActionBase(BaseModel):
    #: The button's text, written by the server from the catalogue's names.
    label: str


class SetAxesAction(_ActionBase):
    type: Literal["set_axes"] = "set_axes"
    x: str
    y: str


class ApplyPresetAction(_ActionBase):
    type: Literal["apply_preset"] = "apply_preset"
    id: str


class SetIndexAction(_ActionBase):
    type: Literal["set_index"] = "set_index"
    slug: str


class AddFilterAction(_ActionBase):
    type: Literal["add_filter"] = "add_filter"
    field: str
    value: str


class SortAction(_ActionBase):
    type: Literal["sort"] = "sort"
    prop: str
    dir: Literal["asc", "desc"]


class SearchAction(_ActionBase):
    type: Literal["search"] = "search"
    q: str


class OpenRouteAction(_ActionBase):
    type: Literal["open_route"] = "open_route"
    path: str


class CompareAction(_ActionBase):
    type: Literal["compare"] = "compare"
    ids: list[int]


class SetParamAction(_ActionBase):
    """A parameter of the screen set to a value the context or a scenario holds
    (D-224) — never one the model chose."""

    type: Literal["set_param"] = "set_param"
    name: str
    value: float | str


class MapColumnAction(_ActionBase):
    type: Literal["map_column"] = "map_column"
    col: str
    prop: str


class FillTextAction(_ActionBase):
    type: Literal["fill_text"] = "fill_text"
    field: str
    text: str


SuggestAction = Annotated[
    SetAxesAction
    | ApplyPresetAction
    | SetIndexAction
    | AddFilterAction
    | SortAction
    | SearchAction
    | OpenRouteAction
    | CompareAction
    | SetParamAction
    | MapColumnAction
    | FillTextAction,
    Field(discriminator="type"),
]


class SuggestionOut(BaseModel):
    title: str
    body: str
    actions: list[SuggestAction] = Field(default_factory=list)


class SuggestionsOut(BaseModel):
    """Up to three next steps for one screen, each with checked actions.

    ``degraded`` is True when the cards come from the tool's local rules
    because the model failed, ran out of quota or answered nothing valid —
    ``notice`` says which. ``cached`` is True when the same context was
    answered within ``AI_SUGGEST_CACHE_SECONDS``: no quota was spent.
    """

    tool: SuggestTool
    summary: str
    suggestions: list[SuggestionOut]
    rejected: list[str] = Field(default_factory=list)
    degraded: bool = False
    cached: bool = False
    notice: str | None = None
    provider: str
    simulated: bool
    disclaimer: str
