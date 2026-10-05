"""Counts behind ``python -m app.knowledge.status`` — the Cérebro's snapshot.

Every query here returns integers or short identifying columns (path, checksum,
status, error): never a passage's text and never a vector. The command runs in a
public Actions log against the production database, and what it proves is *how
much* is there, not *what* is there.

Kept apart from ``KnowledgeRepository`` on purpose: that one serves ingestion
and the embedding backfill, which write; this one only reads, and its size
queries are PostgreSQL-specific.
"""

from __future__ import annotations

from typing import Any, NamedTuple

from sqlalchemy import Select, func, inspect, select, text
from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding
from app.models.notebook import NotebookChunk, NotebookEmbedding, NotebookSource

#: Tables whose size the snapshot reports: the Cérebro's three and the notebooks'
#: three, which share the same database quota (D-92).
SIZED_TABLES: tuple[str, ...] = (
    KnowledgeDocument.__tablename__,
    KnowledgeChunk.__tablename__,
    KnowledgeEmbedding.__tablename__,
    NotebookSource.__tablename__,
    NotebookChunk.__tablename__,
    NotebookEmbedding.__tablename__,
)


class DocumentRow(NamedTuple):
    """What the snapshot needs of one document — no text."""

    path: str
    checksum: str
    status: str
    error: str | None
    chunk_count: int


class VectorGroup(NamedTuple):
    """How many stored vectors share one (model, dimensions) identity."""

    model: str
    dimensions: int
    count: int


class DatabaseSize(NamedTuple):
    """Bytes on disk: the whole database and each table of :data:`SIZED_TABLES`."""

    total_bytes: int
    tables: dict[str, int]


class KnowledgeStatusRepository:
    """Read-only aggregates over the knowledge and notebook tables."""

    def __init__(self, db: Session) -> None:
        self.db = db

    @property
    def dialect(self) -> str:
        return self.db.get_bind().dialect.name

    def notebook_tables_present(self) -> bool:
        """Whether the notebook tables exist (a database migrated before D-92 has none)."""
        inspector = inspect(self.db.connection())
        return all(
            inspector.has_table(model.__tablename__)
            for model in (NotebookSource, NotebookChunk, NotebookEmbedding)
        )

    def documents(self) -> list[DocumentRow]:
        """Every document, ordered by path. A few hundred rows at most."""
        rows = self.db.execute(
            select(
                KnowledgeDocument.path,
                KnowledgeDocument.checksum,
                KnowledgeDocument.status,
                KnowledgeDocument.error,
                KnowledgeDocument.chunk_count,
            ).order_by(KnowledgeDocument.path)
        ).all()
        return [
            DocumentRow(
                path=path,
                checksum=checksum or "",
                status=getattr(status, "value", str(status)),
                error=error,
                chunk_count=int(chunk_count or 0),
            )
            for path, checksum, status, error, chunk_count in rows
        ]

    def chunk_totals(self) -> tuple[int, int]:
        """``(chunks, characters)`` across the whole base."""
        count, chars = self.db.execute(
            select(
                func.count(KnowledgeChunk.id), func.coalesce(func.sum(KnowledgeChunk.char_count), 0)
            )
        ).one()
        return int(count or 0), int(chars or 0)

    def knowledge_vector_groups(self) -> list[VectorGroup]:
        """Cérebro vectors grouped by identity, joined to their chunk.

        The join is the rule of ``KnowledgeRepository.embedding_totals``: a
        vector left behind where ``ondelete`` is not enforced (SQLite without
        the pragma) belongs to no passage and must not be counted as coverage.
        """
        return self._groups(
            select(
                KnowledgeEmbedding.model,
                KnowledgeEmbedding.dimensions,
                func.count(KnowledgeEmbedding.id),
            )
            .join(KnowledgeChunk, KnowledgeEmbedding.chunk_id == KnowledgeChunk.id)
            .group_by(KnowledgeEmbedding.model, KnowledgeEmbedding.dimensions)
        )

    def notebook_vector_groups(self) -> list[VectorGroup]:
        """Notebook vectors grouped by identity — counts only, no owner, no text."""
        return self._groups(
            select(
                NotebookEmbedding.model,
                NotebookEmbedding.dimensions,
                func.count(NotebookEmbedding.id),
            )
            .join(NotebookChunk, NotebookEmbedding.chunk_id == NotebookChunk.id)
            .group_by(NotebookEmbedding.model, NotebookEmbedding.dimensions)
        )

    def _groups(self, statement: Select[Any]) -> list[VectorGroup]:
        rows = self.db.execute(statement).all()
        groups = [VectorGroup(str(m), int(d), int(n)) for m, d, n in rows]
        return sorted(groups, key=lambda g: (-g.count, g.model, g.dimensions))

    def database_size(self) -> DatabaseSize | None:
        """On-disk size, or ``None`` where the database cannot say (SQLite).

        ``pg_total_relation_size`` includes indexes and TOAST — where the
        vectors actually live —, which is what counts against a storage quota.
        The table names come from the models, never from input.
        """
        if self.dialect != "postgresql":
            return None
        total = int(
            self.db.execute(text("SELECT pg_database_size(current_database())")).scalar_one()
        )
        tables: dict[str, int] = {}
        for name in SIZED_TABLES:
            size = self.db.execute(
                text("SELECT pg_total_relation_size(to_regclass(:name))"), {"name": name}
            ).scalar_one()
            # to_regclass() is NULL for a table that does not exist yet (the
            # notebooks' before their migration), and so is the size.
            if size is not None:
                tables[name] = int(size)
        return DatabaseSize(total_bytes=total, tables=tables)
