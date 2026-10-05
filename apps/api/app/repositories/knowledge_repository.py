"""Data access for the knowledge base (documents and their chunks)."""

from __future__ import annotations

from sqlalchemy import ColumnElement, and_, delete, func, not_, or_, select
from sqlalchemy.orm import Session

from app.models.enums import IngestStatus
from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding


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

    def indexed_paths_with_checksum(self, checksum: str) -> list[str]:
        """Paths of the documents indexed (``EXTRAIDO``) with these bytes, sorted."""
        return list(
            self.db.execute(
                select(KnowledgeDocument.path)
                .where(
                    KnowledgeDocument.checksum == checksum,
                    KnowledgeDocument.status == IngestStatus.EXTRAIDO,
                )
                .order_by(KnowledgeDocument.path)
            )
            .scalars()
            .all()
        )

    def document_fingerprints(self) -> list[tuple[int, str, str]]:
        """``(id, path, checksum)`` of every document — what a removal list matches."""
        rows = self.db.execute(
            select(KnowledgeDocument.id, KnowledgeDocument.path, KnowledgeDocument.checksum)
        ).all()
        return [(int(doc_id), path, checksum or "") for doc_id, path, checksum in rows]

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

        The vectors are deleted here, explicitly, before their passages — the
        cascade is written in Python and not only declared in the schema, as in
        ``prune`` and D-72. SQLite (the development and test database) does not
        enforce ``ondelete`` without a pragma this project does not turn on, and
        it reuses a freed id: a new passage would inherit the old one's vector,
        which then counts as current, is never re-embedded and is ranked by the
        semantic search against text it was never computed from.
        """
        chunk_ids = select(KnowledgeChunk.id).where(KnowledgeChunk.document_id == document_id)
        self.db.execute(
            delete(KnowledgeEmbedding).where(KnowledgeEmbedding.chunk_id.in_(chunk_ids))
        )
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

    # --- embeddings ----------------------------------------------------

    def set_embedding(self, chunk_id: int, *, model: str, vector: list[float]) -> None:
        """Create or replace the embedding for one chunk."""
        from app.knowledge.embeddings import pack_vector

        existing = (
            self.db.execute(
                select(KnowledgeEmbedding).where(KnowledgeEmbedding.chunk_id == chunk_id)
            )
            .scalars()
            .one_or_none()
        )
        packed = pack_vector(vector)
        if existing is not None:
            existing.model = model
            existing.dimensions = len(vector)
            existing.vector = packed
        else:
            self.db.add(
                KnowledgeEmbedding(
                    chunk_id=chunk_id, model=model, dimensions=len(vector), vector=packed
                )
            )
        self.db.flush()

    @staticmethod
    def _embedding_is_current(model: str, dims: int) -> ColumnElement[bool]:
        """SQL twin of :func:`app.knowledge.embeddings.embedding_matches`.

        The same rule, evaluated by the database so a count or a to-do list
        never has to load a single vector: same model and, unless ``dims`` is
        0 ("the model's own size"), the same dimension.
        """
        condition = KnowledgeEmbedding.model == model
        if dims:
            condition = and_(condition, KnowledgeEmbedding.dimensions == dims)
        return condition

    def embedding_totals(self, model: str, dims: int) -> tuple[int, int, int]:
        """``(total, current, pending)`` chunks for the embedding ``model``/``dims``.

        *Current* is a chunk whose vector matches that identity; *pending* is
        every other chunk — never embedded, or embedded by another model or at
        another size. Two count queries, no vector read.

        Counted through the chunk join: a vector left behind by a chunk deleted
        where ``ondelete`` is not enforced (SQLite without the pragma) is not a
        passage anyone can retrieve, and must not inflate the covered share.
        """
        total = self.count_chunks()
        current = int(
            self.db.execute(
                select(func.count(KnowledgeEmbedding.id))
                .join(KnowledgeChunk, KnowledgeEmbedding.chunk_id == KnowledgeChunk.id)
                .where(self._embedding_is_current(model, dims))
            ).scalar_one()
        )
        return total, current, total - current

    def pending_chunk_ids(self, model: str, dims: int) -> list[int]:
        """Ids of the chunks lacking a current vector, smallest documents first.

        Ordered by the document's chunk count, then document, then position:
        a night's quota then completes many short documents (a datasheet, an
        article) instead of a slice of one long book, so what becomes
        searchable first is whole documents.
        """
        return [chunk_id for chunk_id, _ in self.pending_chunks(model, dims)]

    def pending_chunks(self, model: str, dims: int) -> list[tuple[int, int]]:
        """``(chunk id, document id)`` of :meth:`pending_chunk_ids`, in its order.

        The document id lets the backfill leave out the passages of a document
        on the removal list, which is matched in Python (Unicode
        normalisation has no portable SQL spelling — the reason of ``prune``).
        """
        rows = self.db.execute(
            select(KnowledgeChunk.id, KnowledgeChunk.document_id)
            .join(KnowledgeDocument, KnowledgeChunk.document_id == KnowledgeDocument.id)
            .outerjoin(KnowledgeEmbedding, KnowledgeEmbedding.chunk_id == KnowledgeChunk.id)
            .where(
                or_(
                    KnowledgeEmbedding.id.is_(None),
                    not_(self._embedding_is_current(model, dims)),
                )
            )
            .order_by(KnowledgeDocument.chunk_count, KnowledgeDocument.id, KnowledgeChunk.ordinal)
        ).all()
        return [(int(chunk_id), int(document_id)) for chunk_id, document_id in rows]

    def chunk_texts(self, chunk_ids: list[int]) -> dict[int, str]:
        """The text of each chunk in ``chunk_ids`` that still exists, by id."""
        if not chunk_ids:
            return {}
        rows = self.db.execute(
            select(KnowledgeChunk.id, KnowledgeChunk.text).where(KnowledgeChunk.id.in_(chunk_ids))
        ).all()
        return {int(chunk_id): text for chunk_id, text in rows}
