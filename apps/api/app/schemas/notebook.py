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
