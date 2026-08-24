"""Data access for the knowledge base (documents and their chunks)."""

from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models.knowledge import KnowledgeChunk, KnowledgeDocument


class KnowledgeRepository:
    """Reads and writes for catalogued documents and their passages."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # --- documents ---------------------------------------------------------

    def get_by_path(self, path: str) -> KnowledgeDocument | None:
        """Find a document by its path relative to the knowledge root."""
        return (
            self.db.execute(select(KnowledgeDocument).where(KnowledgeDocument.path == path))
            .scalars()
            .one_or_none()
        )

    def get(self, document_id: int) -> KnowledgeDocument | None:
        return self.db.get(KnowledgeDocument, document_id)

    def list_documents(self) -> list[KnowledgeDocument]:
        return list(
            self.db.execute(select(KnowledgeDocument).order_by(KnowledgeDocument.path))
            .scalars()
            .all()
        )

    def add(self, document: KnowledgeDocument) -> KnowledgeDocument:
        self.db.add(document)
        self.db.flush()
        return document

    # --- chunks ------------------------------------------------------------

    def replace_chunks(self, document_id: int, chunks: list[KnowledgeChunk]) -> None:
        """Swap a document's passages for a new set.

        Delete-then-insert rather than upsert: a re-extraction renumbers every
        ordinal, so matching old rows to new ones would be guesswork. The
        uniqueness constraint on (document_id, ordinal) makes a half-finished
        run fail loudly instead of leaving two passages in the same position.
        """
        self.db.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id))
        self.db.flush()
        for chunk in chunks:
            chunk.document_id = document_id
            self.db.add(chunk)
        self.db.flush()

    def list_chunks(self, document_id: int) -> list[KnowledgeChunk]:
        return list(
            self.db.execute(
                select(KnowledgeChunk)
                .where(KnowledgeChunk.document_id == document_id)
                .order_by(KnowledgeChunk.ordinal)
            )
            .scalars()
            .all()
        )

    def count_chunks(self) -> int:
        return int(self.db.execute(select(func.count(KnowledgeChunk.id))).scalar_one())

    def count_documents(self) -> int:
        return int(self.db.execute(select(func.count(KnowledgeDocument.id))).scalar_one())
