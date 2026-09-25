"""Contracts of the Cadernos (D-92)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ChatGoal = Literal["padrao", "guia", "personalizado"]
ResponseLength = Literal["curta", "padrao", "longa"]
SourceKind = Literal["arquivo", "texto", "ficha", "estudo"]


class NotebookIn(BaseModel):
    title: str = Field(default="Caderno sem título", min_length=1, max_length=200)
    emoji: str = Field(default="📓", min_length=1, max_length=16)


class NotebookUpdate(BaseModel):
    """Only what is sent changes. ``chat_instructions`` accepts ``""`` to clear."""

    title: str | None = Field(default=None, min_length=1, max_length=200)
    emoji: str | None = Field(default=None, min_length=1, max_length=16)
    chat_goal: ChatGoal | None = None
    chat_instructions: str | None = Field(default=None, max_length=4000)
    response_length: ResponseLength | None = None


class CitationOut(BaseModel):
    """One passage an answer cites, copied into the answer.

    Copied rather than joined: a citation stays readable after its source is
    removed from the notebook, which is when a student most needs to know what
    an old answer rested on. ``source_id`` is then a dangling reference, and the
    screen says the source is gone.
    """

    number: int
    chunk_id: int
    source_id: int
    source_title: str
    heading: str | None = None
    page_start: int | None = None
    page_end: int | None = None
    excerpt: str


class ParagraphOut(BaseModel):
    text: str
    #: Numbers of ``citations`` below, 1-based, in reading order.
    citations: list[int] = []


class AnswerOut(BaseModel):
    paragraphs: list[ParagraphOut] = []
    citations: list[CitationOut] = []
    #: The model said the sources do not answer the question.
    not_found: bool = False
    #: Why a paragraph was left out — a figure no cited passage contains. Said,
    #: never silently repaired (the guardrails' rule).
    withheld: list[str] = []


class MessageOut(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    created_at: datetime
    #: The question, for a user turn.
    text: str | None = None
    #: The answer, for an assistant turn.
    answer: AnswerOut | None = None


class SourceOut(BaseModel):
    id: int
    kind: str
    title: str
    origin: str | None = None
    status: str
    error: str | None = None
    char_count: int
    page_count: int | None = None
    selected: bool
    truncated: bool = False
    created_at: datetime


class SourceDetailOut(SourceOut):
    content: str


class NoteOut(BaseModel):
    id: int
    title: str
    body: str
    origin: str
    citations: list[CitationOut] | None = None
    created_at: datetime
    updated_at: datetime


class UsageOut(BaseModel):
    """Today's AI calls against the per-student limit."""

    used: int
    limit: int
    remaining: int


class NotebookSummaryOut(BaseModel):
    id: int
    title: str
    emoji: str
    source_count: int
    created_at: datetime
    updated_at: datetime


class NotebookOut(BaseModel):
    id: int
    title: str
    emoji: str
    created_at: datetime
    updated_at: datetime
    chat_goal: ChatGoal
    chat_instructions: str | None = None
    response_length: ResponseLength
    #: The notebook guide. ``None`` is "not written yet", never "nothing to say".
    summary: AnswerOut | None = None
    suggested_questions: list[str] = []
    sources: list[SourceOut]
    notes: list[NoteOut]
    usage: UsageOut
    max_sources: int
    #: Whether the AI layer is on and whether it is the simulated provider — the
    #: screen shows the free-plan privacy notice only for a real one.
    ai_enabled: bool
    ai_simulated: bool
    ai_notice: str


class TextSourceIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    text: str = Field(min_length=1, max_length=800_000)


class AppSourceIn(BaseModel):
    kind: Literal["ficha", "estudo"]
    record_id: int = Field(gt=0)


class SourceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    selected: bool | None = None


class SelectAllIn(BaseModel):
    selected: bool


class AskIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class ChatOut(BaseModel):
    question: MessageOut
    answer: MessageOut
    usage: UsageOut


class NoteIn(BaseModel):
    title: str = Field(default="Nova nota", min_length=1, max_length=200)
    body: str = Field(default="", max_length=20_000)


class NoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, max_length=20_000)


# --- Estúdio (D-94) ----------------------------------------------------------

StudioTool = Literal["report", "flashcards", "quiz", "table", "mindmap"]
ArtifactStatus = Literal["gerando", "pronto", "falhou"]


class StudioIn(BaseModel):
    """What the "Criar …" modal sends. Every choice is a slug from the catalogue;
    a choice the tool does not have is refused, never ignored (the D-56 rule)."""

    tool: StudioTool
    format: str | None = Field(default=None, max_length=32)
    template: str | None = Field(default=None, max_length=64)
    #: The template's instruction as the student left it under the pencil.
    #: Omitted means the template's own.
    instructions: str | None = Field(default=None, max_length=2000)
    topic: str | None = Field(default=None, max_length=500)
    count: str | None = Field(default=None, max_length=16)
    difficulty: str | None = Field(default=None, max_length=16)
    columns: list[str] | None = Field(default=None, max_length=8)


class ArtifactUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ArtifactSummaryOut(BaseModel):
    id: int
    tool: StudioTool
    format: str | None = None
    template: str | None = None
    title: str
    #: "gerando" past its deadline reads as "falhou" — derived, never written by
    #: a GET.
    status: ArtifactStatus
    error: str | None = None
    source_count: int
    #: Sections, cards, questions, rows or nodes. ``None`` until it is ready.
    item_count: int | None = None
    created_at: datetime
    updated_at: datetime


class MindMapNodeOut(BaseModel):
    id: int
    parent: int | None = None
    label: str
    #: The label broken into lines by the backend, so the screen wraps where
    #: the SVG export does.
    lines: list[str]
    depth: int
    x: float
    y: float
    width: float
    height: float
    citations: list[int] = []


class MindMapEdgeOut(BaseModel):
    source: int
    target: int
    x1: float
    y1: float
    x2: float
    y2: float


class MindMapLayoutOut(BaseModel):
    """The mind map's geometry, computed once in the backend for the screen and
    the SVG export alike (one truth for one figure, the D-53 rule)."""

    width: float
    height: float
    nodes: list[MindMapNodeOut]
    edges: list[MindMapEdgeOut]


class ArtifactOut(ArtifactSummaryOut):
    options: dict = {}
    #: The tool's content (see ``app.notebooks.studio_content``).
    content: dict | None = None
    citations: list[CitationOut] = []
    withheld: list[str] = []
    exports: list[str] = []
    layout: MindMapLayoutOut | None = None


class StudioListOut(BaseModel):
    artifacts: list[ArtifactSummaryOut]
    #: Generations finished today against the daily limit; ones still running
    #: are already taken out of ``remaining``.
    usage: UsageOut


class StudioChoiceOut(BaseModel):
    slug: str
    label: str
    description: str
    instructions: str = ""
    columns: list[str] = []
    amount: int | None = None


class StudioToolOut(BaseModel):
    slug: StudioTool
    label: str
    description: str
    formats: list[StudioChoiceOut]
    templates: list[StudioChoiceOut]
    counts: list[StudioChoiceOut]
    difficulties: list[StudioChoiceOut]
    columns: bool
    exports: list[str]


class StudioCatalogOut(BaseModel):
    tools: list[StudioToolOut]
    max_columns: int
