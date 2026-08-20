"""Knowledge-base models: catalogued reference documents and their text chunks.

This is the schema behind ``Cérebro/`` — the curated Engineering-of-Materials
reference material that grounds the AI layer's prose. Two tables, and the split
is the whole point:

* :class:`KnowledgeDocument` is *provenance*. One row per file on disk, keyed by
  its path, carrying who wrote it, how much authority it has and what licence it
  came under. A document may be catalogued and never indexed — a book whose
  licence forbids redistribution is still a legitimate row here, because knowing
  a source exists is separate from having its text.
* :class:`KnowledgeChunk` is *retrievable text*. One row per passage, each
  pointing back at the page it came from, so an answer can be traced
  chunk → document → source → page without guessing.

Deliberately **not** an extension of :class:`app.models.source.Source`. That
model is a citation label attached to one numeric property value ("this density
came from the ASM Handbook"); its identity is a short free-text string. A
document has a path, a checksum, a licence and a lifecycle. Overloading one
table with both would join two different cardinalities and two different
lifetimes for the sake of sharing a word.

The checksum is what makes re-ingestion idempotent: a document whose bytes did
not change is skipped, and one whose bytes did change has its chunks replaced
rather than duplicated.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import DocumentKind, IngestStatus, SourceAuthority


def _utcnow() -> datetime:
    return datetime.now(UTC)


class KnowledgeDocument(Base):
    """One reference document in the knowledge base, with its provenance."""

    __tablename__ = "knowledge_document"

    id: Mapped[int] = mapped_column(primary_key=True)

    # Path relative to the knowledge root, POSIX-style. Unique: the same file is
    # one document, and re-ingesting finds it by path rather than creating a
    # twin. Never used to open a file without being re-joined to the configured
    # root — a stored path is data, not a capability.
    path: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)

    kind: Mapped[DocumentKind] = mapped_column(
        Enum(DocumentKind, native_enum=False, length=12),
        default=DocumentKind.OUTRO,
        nullable=False,
    )
    authority: Mapped[SourceAuthority] = mapped_column(
        Enum(SourceAuthority, native_enum=False, length=16),
        default=SourceAuthority.NAO_VERIFICADA,
        nullable=False,
    )

    # Free text, never validated and never inferred: author and citation as a
    # human wrote them. Empty means nobody has said, which is honest; a
    # plausible-looking guess would later be indistinguishable from a fact.
    author: Mapped[str | None] = mapped_column(String(300), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(1000), nullable=True)

    # Why this file is or is not redistributable. The reason a public repository
    # can describe its whole knowledge base while hosting only part of it.
    licence_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    #: False when the file is deliberately outside version control.
    is_versioned: Mapped[bool] = mapped_column(default=True, nullable=False)

    # SHA-256 of the file's bytes. Re-ingestion compares this before doing any
    # work, which is what keeps the pipeline idempotent.
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[IngestStatus] = mapped_column(
        Enum(IngestStatus, native_enum=False, length=10),
        default=IngestStatus.PENDENTE,
        nullable=False,
    )
    # Why extraction failed, in the words the operator needs to fix it. A
    # document that could not be read says so rather than looking empty.
    error: Mapped[str | None] = mapped_column(String(500), nullable=True)

    chunk_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    chunks: Mapped[list[KnowledgeChunk]] = relationship(
        back_populates="document",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class KnowledgeChunk(Base):
    """One retrievable passage of a document, with its page locator."""

    __tablename__ = "knowledge_chunk"
    __table_args__ = (
        # Re-ingestion rewrites a document's chunks; the pair stays unique so a
        # partial failure cannot leave two chunks claiming the same position.
        UniqueConstraint("document_id", "ordinal", name="uq_knowledge_chunk_position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(
        ForeignKey("knowledge_document.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )

    #: Position within the document, 0-based. Ordering is the document's own.
    ordinal: Mapped[int] = mapped_column(Integer, nullable=False)
    # Page range this passage came from, 1-based and inclusive. Nullable because
    # not every format has pages — but when it does, this is what turns a cited
    # answer into something a reader can go and check.
    page_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    #: Nearest preceding heading, when one was detected. Context for the reader.
    heading: Mapped[str | None] = mapped_column(String(300), nullable=True)

    text: Mapped[str] = mapped_column(Text, nullable=False)
    char_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    document: Mapped[KnowledgeDocument] = relationship(back_populates="chunks")
