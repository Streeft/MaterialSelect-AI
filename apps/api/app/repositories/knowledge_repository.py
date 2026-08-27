"""Data access for the knowledge base (documents and their chunks)."""

from __future__ import annotations

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload

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

    # --- retrieval ---------------------------------------------------------

    def search_candidates(self, tokens: list[str], per_token_limit: int) -> list[KnowledgeChunk]:
        """Passages containing any of ``tokens``, as a pool to be ranked.

        One query per token rather than one query with OR, so a rare term's
        matches all fit under the cap instead of being crowded out by a common
        term's. The cap is a recall limit and nothing subtler: within a term,
        the passages kept are the lowest ids, which favours whichever document
        was ingested first. That bias is acceptable because the cap only binds
        for terms common enough to have low IDF anyway — and it is the reason
        `search_text` is a scan and not an index. Above roughly 10^5 passages,
        replace this with SQLite FTS5 or a Postgres tsvector; the ranking above
        it does not change.

        Tokens arrive from :func:`app.knowledge.lexical.tokenize`, which emits
        only ``[0-9a-z]`` — so no LIKE wildcard can reach the pattern. The
        parameter binding is SQLAlchemy's regardless.
        """
        found: dict[int, KnowledgeChunk] = {}
        for token in dict.fromkeys(tokens):
            rows = (
                self.db.execute(
                    select(KnowledgeChunk)
                    .options(joinedload(KnowledgeChunk.document))
                    .where(KnowledgeChunk.search_text.like(f"%{token}%"))
                    .order_by(KnowledgeChunk.id)
                    .limit(per_token_limit)
                )
                .scalars()
                .all()
            )
            for chunk in rows:
                found[chunk.id] = chunk
        return list(found.values())

    def document_frequency(self, token: str) -> int:
        """How many passages in the whole corpus contain ``token``.

        Counted rather than inferred from the candidate pool: inside a pool
        every query term looks rare, and an IDF computed there would rank a
        filler word alongside a distinctive one.
        """
        return int(
            self.db.execute(
                select(func.count(KnowledgeChunk.id)).where(
                    KnowledgeChunk.search_text.like(f"%{token}%")
                )
            ).scalar_one()
        )

    # --- embeddings --------------------------------------------------------

    def embeddings_for(self, chunk_ids: list[int]) -> dict[int, KnowledgeEmbedding]:
        """The stored vectors for these passages, keyed by chunk id."""
        if not chunk_ids:
            return {}
        rows = (
            self.db.execute(
                select(KnowledgeEmbedding).where(KnowledgeEmbedding.chunk_id.in_(chunk_ids))
            )
            .scalars()
            .all()
        )
        return {row.chunk_id: row for row in rows}

    def chunks_missing_embedding(self, model: str, limit: int) -> list[KnowledgeChunk]:
        """Passages with no vector for ``model``, oldest first.

        A vector stored under a different model counts as missing, which is what
        makes changing KNOWLEDGE_EMBEDDING_MODEL a resumable re-index rather
        than a manual cleanup.
        """
        stale = select(KnowledgeEmbedding.chunk_id).where(KnowledgeEmbedding.model == model)
        return list(
            self.db.execute(
                select(KnowledgeChunk)
                .where(KnowledgeChunk.id.not_in(stale))
                .order_by(KnowledgeChunk.id)
                .limit(limit)
            )
            .scalars()
            .all()
        )

    def set_embedding(self, chunk_id: int, model: str, dimensions: int, vector: bytes) -> None:
        """Store or replace the vector for one passage."""
        existing = (
            self.db.execute(
                select(KnowledgeEmbedding).where(KnowledgeEmbedding.chunk_id == chunk_id)
            )
            .scalars()
            .one_or_none()
        )
        if existing is None:
            self.db.add(
                KnowledgeEmbedding(
                    chunk_id=chunk_id, model=model, dimensions=dimensions, vector=vector
                )
            )
        else:
            existing.model = model
            existing.dimensions = dimensions
            existing.vector = vector
        self.db.flush()

    def count_embeddings(self, model: str | None = None) -> int:
        statement = select(func.count(KnowledgeEmbedding.id))
        if model is not None:
            statement = statement.where(KnowledgeEmbedding.model == model)
        return int(self.db.execute(statement).scalar_one())
