"""Data access for the knowledge base (documents and their chunks)."""

from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

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

    def list_all_chunks_for_lexical_search(self) -> list[KnowledgeChunk]:
        """Every chunk with a non-empty ``search_text``, joined to its document.

        Loaded eagerly and in full: BM25 needs corpus-wide document frequency,
        which means every passage's tokens regardless of how few will end up
        in the answer. At the corpus's current size (~150 documents) this is a
        single query, not a scaling concern yet — see the spec's ``§10``.
        """
        from sqlalchemy.orm import joinedload

        return list(
            self.db.execute(
                select(KnowledgeChunk)
                .options(joinedload(KnowledgeChunk.document))
                .where(KnowledgeChunk.search_text != "")
            )
            .scalars()
            .all()
        )

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

    def list_all_embeddings(self) -> list[KnowledgeChunk]:
        """Every chunk that has an embedding, joined to it and to its document."""
        from sqlalchemy.orm import joinedload

        return list(
            self.db.execute(
                select(KnowledgeChunk)
                .join(KnowledgeEmbedding, KnowledgeChunk.embedding)
                .options(joinedload(KnowledgeChunk.document), joinedload(KnowledgeChunk.embedding))
            )
            .scalars()
            .all()
        )
