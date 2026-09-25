"""Cadernos (D-90): a student's private notebook of sources, chat and notes.

The NotebookLM shape inside this product. A notebook holds sources the student
brought — an uploaded file, pasted text, a material datasheet, a saved study —
cut into passages that answers cite by position.

**Separate tables from the knowledge base (Cérebro), on purpose.** The Cérebro
is shared: ``app.knowledge.retrieval.search`` reads every chunk it has, with no
owner at all, because it is the curated reference shelf every AI call may draw
on. Putting a student's private upload there would put it into another
student's answers. So a notebook's passages live here, under a notebook that
has an owner, and every read goes through that owner — while the *functions*
that read, chunk, score and embed text are the Cérebro's, unchanged.

**Only extracted text is kept.** The uploaded file itself is never written to
disk: it is read, cut into passages and dropped. Less to protect, less to
delete, and nothing on the API machine's small disk.

**Nothing here is catalogue data.** A number quoted from a source is prose in a
passage; it never becomes a ``MaterialPropertyValue`` (principle 1).
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class Notebook(Base):
    """One student's notebook. ``owner_id`` is never NULL: there is no shared
    notebook, and a row nobody owns would be a row everybody could reach."""

    __tablename__ = "notebook"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    emoji: Mapped[str] = mapped_column(String(16), default="📓", nullable=False)

    #: The notebook guide: paragraphs with citations, the same shape as a chat
    #: answer. NULL means "not written yet" — never an empty summary, which
    #: would read as "these sources say nothing".
    summary: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    suggested_questions: Mapped[list | None] = mapped_column(JSON, nullable=True)

    #: How the chat answers: "padrao", "guia" (a tutor that asks back) or
    #: "personalizado" (``chat_instructions`` is the brief).
    chat_goal: Mapped[str] = mapped_column(String(16), default="padrao", nullable=False)
    chat_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: "curta", "padrao" or "longa".
    response_length: Mapped[str] = mapped_column(String(8), default="padrao", nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    sources: Mapped[list[NotebookSource]] = relationship(
        back_populates="notebook",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="NotebookSource.id",
    )
    messages: Mapped[list[NotebookMessage]] = relationship(
        back_populates="notebook",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="NotebookMessage.id",
    )
    notes: Mapped[list[NotebookNote]] = relationship(
        back_populates="notebook",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="NotebookNote.id",
    )
    artifacts: Mapped[list[StudioArtifact]] = relationship(
        back_populates="notebook",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="StudioArtifact.id",
    )


class NotebookSource(Base):
    """One source in a notebook, as text.

    ``kind`` names where the text came from: "arquivo", "texto", "ficha",
    "estudo" — and, from phase 3, "url", "youtube", "openalex", "wikipedia".
    ``selected`` is the checkbox beside it: only selected sources are searched
    when the student asks.
    """

    __tablename__ = "notebook_source"

    id: Mapped[int] = mapped_column(primary_key=True)
    notebook_id: Mapped[int] = mapped_column(
        ForeignKey("notebook.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    #: File name, or the record the text was generated from. Shown, never opened.
    origin: Mapped[str | None] = mapped_column(String(500), nullable=True)
    #: "pronto" or "falhou". Ingestion is synchronous today; the column is here
    #: for the sources that will not be (a web page, a long PDF).
    status: Mapped[str] = mapped_column(String(12), default="pronto", nullable=False)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    char_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    selected: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    #: True when the text was cut at ``notebook_max_source_chars``. Said on
    #: screen: a source that silently lost its second half would answer
    #: "not in the sources" about something that was.
    truncated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    #: The whole extracted text, so the student can read the source in place.
    content: Mapped[str] = mapped_column(Text, default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    notebook: Mapped[Notebook] = relationship(back_populates="sources")
    chunks: Mapped[list[NotebookChunk]] = relationship(
        back_populates="source",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="NotebookChunk.ordinal",
    )


class NotebookChunk(Base):
    """One citable passage of a source. Same shape as ``KnowledgeChunk``."""

    __tablename__ = "notebook_chunk"
    __table_args__ = (UniqueConstraint("source_id", "ordinal", name="uq_notebook_chunk_position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(
        ForeignKey("notebook_source.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    page_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    heading: Mapped[str | None] = mapped_column(String(300), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    #: Folded for matching (see app/knowledge/lexical.py); never shown.
    search_text: Mapped[str] = mapped_column(Text, default="", nullable=False)

    source: Mapped[NotebookSource] = relationship(back_populates="chunks")
    embedding: Mapped[NotebookEmbedding | None] = relationship(
        back_populates="chunk",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )


class NotebookEmbedding(Base):
    """The vector of one passage. Same reasoning as ``KnowledgeEmbedding``."""

    __tablename__ = "notebook_embedding"

    id: Mapped[int] = mapped_column(primary_key=True)
    chunk_id: Mapped[int] = mapped_column(
        ForeignKey("notebook_chunk.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    model: Mapped[str] = mapped_column(String(120), nullable=False)
    dimensions: Mapped[int] = mapped_column(Integer, nullable=False)
    vector: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    chunk: Mapped[NotebookChunk] = relationship(back_populates="embedding")


class NotebookMessage(Base):
    """One turn of the chat. ``content`` is the answer as structured data —
    paragraphs, each with its citations, and the passages they point at — so
    a citation stays clickable after the source that produced it is gone."""

    __tablename__ = "notebook_message"

    id: Mapped[int] = mapped_column(primary_key=True)
    notebook_id: Mapped[int] = mapped_column(
        ForeignKey("notebook.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: "user" or "assistant".
    role: Mapped[str] = mapped_column(String(12), nullable=False)
    content: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    notebook: Mapped[Notebook] = relationship(back_populates="messages")


class NotebookNote(Base):
    """A note: written by the student, or an answer saved from the chat."""

    __tablename__ = "notebook_note"

    id: Mapped[int] = mapped_column(primary_key=True)
    notebook_id: Mapped[int] = mapped_column(
        ForeignKey("notebook.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    #: "manual", "chat" or "estudio".
    origin: Mapped[str] = mapped_column(String(12), default="manual", nullable=False)
    #: The passages a saved answer cited, copied with it.
    citations: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    notebook: Mapped[Notebook] = relationship(back_populates="notes")


class StudioArtifact(Base):
    """Something the Studio generated (phase 2): a report, flashcards, a quiz.

    Stored, never regenerated without a request — on the free plan every
    generation spends from a daily limit shared by the whole class.
    """

    __tablename__ = "studio_artifact"

    id: Mapped[int] = mapped_column(primary_key=True)
    notebook_id: Mapped[int] = mapped_column(
        ForeignKey("notebook.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tool: Mapped[str] = mapped_column(String(32), nullable=False)
    format: Mapped[str | None] = mapped_column(String(32), nullable=True)
    template: Mapped[str | None] = mapped_column(String(64), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    options: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    #: "gerando", "pronto" or "falhou".
    status: Mapped[str] = mapped_column(String(12), default="gerando", nullable=False)
    content: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    source_ids: Mapped[list | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    notebook: Mapped[Notebook] = relationship(back_populates="artifacts")


class AIUsage(Base):
    """How many AI calls one user made on one day — the per-student quota.

    One row per (user, day), counted up. The free plan's limit is shared by
    every student behind one key, and a counter per person is what keeps one
    curious student from spending the class's day.
    """

    __tablename__ = "ai_usage"
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_ai_usage_user_day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day: Mapped[date] = mapped_column(Date, nullable=False)
    requests: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    artifacts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
