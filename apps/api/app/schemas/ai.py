"""Contracts for the optional AI layer.

Every type here describes a **proposal**, never a result. The wording is
deliberate: the layer returns things the user may choose to apply, and the API
never applies them itself. Numeric property values do not appear anywhere in
these schemas, which is the structural half of the guarantee that the AI cannot
invent one — the other half is enforced in ``app/ai/guardrails.py``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.selection import ConstraintIn, GoalLiteral

# Longest problem statement accepted. Generous for a design brief, bounded so a
# provider call cannot be driven by an arbitrarily large body.
MAX_STATEMENT_LENGTH = 4000


class AIStatusOut(BaseModel):
    """Whether the layer is available, and under what terms."""

    enabled: bool
    provider: str
    simulated: bool = Field(
        description="True quando o provedor é a implementação simulada, sem serviço externo"
    )
    disclaimer: str


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
