"""Reads behind the in-process retrieval index (``app/knowledge/index.py``).

Three kinds of query, and the split is the point of the module:

* **Fingerprints** run on every search, so they return a handful of integers
  and never a passage or a vector. They are what decides whether the resident
  index is still the database's corpus.
* **Loaders** run only when a fingerprint changed. They stream plain columns —
  never ORM objects — so building the index never holds the whole corpus as
  mapped rows, and they are bounded above by the fingerprint's ``max_id`` so a
  row written between the fingerprint and the load cannot enter the index
  without being counted.
* **Materialisation** fetches the few passages a search actually returns,
  joined to their document.
"""

from __future__ import annotations

from collections.abc import Iterator
from datetime import datetime
from typing import NamedTuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.models.knowledge import KnowledgeChunk, KnowledgeDocument, KnowledgeEmbedding

#: Rows fetched per round trip by the loaders. Large enough that a rebuild is a
#: few dozen round trips, small enough that one batch of vectors stays in the
#: low megabytes.
_STREAM_BATCH = 500


class CorpusFingerprint(NamedTuple):
    """What the lexical index was built from, in four numbers.

    Chunk count and highest id catch an insertion or a deletion; the document
    side catches a re-ingestion that SQLite satisfies by reusing the very ids it
    just freed (Postgres sequences never do, but the tests run on SQLite).
    """

    chunk_count: int
    chunk_max_id: int | None
    document_count: int
    last_indexed_at: datetime | str | None


class VectorFingerprint(NamedTuple):
    """The stored vectors of one ``(model, dimensions)``: how many, and up to where."""

    count: int
    max_id: int


class KnowledgeIndexRepository:
    """Queries for building and refreshing the Cérebro retrieval index."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # --- fingerprints (every search) ---------------------------------------

    def corpus_fingerprint(self) -> CorpusFingerprint:
        """One round trip, four aggregates, no text."""
        row = self.db.execute(
            select(
                select(func.count(KnowledgeChunk.id)).scalar_subquery(),
                select(func.max(KnowledgeChunk.id)).scalar_subquery(),
                select(func.count(KnowledgeDocument.id)).scalar_subquery(),
                select(func.max(KnowledgeDocument.indexed_at)).scalar_subquery(),
            )
        ).one()
        return CorpusFingerprint(
            chunk_count=int(row[0] or 0),
            chunk_max_id=row[1],
            document_count=int(row[2] or 0),
            last_indexed_at=row[3],
        )

    def vector_fingerprints(self, model: str) -> dict[int, VectorFingerprint]:
        """Per stored dimension, the vectors ``model`` produced.

        Grouped by dimension rather than filtered by one because the query's
        dimension is only known once the query has been embedded — and asking
        first is what spares the embedding call when no vector of this model
        exists at all.
        """
        rows = self.db.execute(
            select(
                KnowledgeEmbedding.dimensions,
                func.count(KnowledgeEmbedding.id),
                func.max(KnowledgeEmbedding.id),
            )
            .where(KnowledgeEmbedding.model == model)
            .group_by(KnowledgeEmbedding.dimensions)
        ).all()
        return {
            int(dimensions): VectorFingerprint(count=int(count), max_id=int(max_id))
            for dimensions, count, max_id in rows
        }

    # --- loaders (only when a fingerprint changed) --------------------------

    def iter_search_texts(self, max_id: int) -> Iterator[tuple[int, str]]:
        """``(chunk id, search_text)`` of every searchable chunk, in id order.

        The same corpus ``KnowledgeRepository.list_all_chunks_for_lexical_search``
        returns — chunks with a non-empty ``search_text`` — without the text a
        reader is shown or the document join.
        """
        result = self.db.execute(
            select(KnowledgeChunk.id, KnowledgeChunk.search_text)
            .where(KnowledgeChunk.search_text != "", KnowledgeChunk.id <= max_id)
            .order_by(KnowledgeChunk.id)
            .execution_options(yield_per=_STREAM_BATCH)
        )
        for chunk_id, search_text in result:
            yield int(chunk_id), search_text

    def iter_vectors(
        self, model: str, dimensions: int, *, after_id: int, max_id: int
    ) -> Iterator[tuple[int, int, bytes]]:
        """``(embedding id, chunk id, blob)`` in ``(after_id, max_id]``, in id order.

        Joined to the chunk so a vector whose passage is gone — possible where
        the database does not enforce ``ON DELETE CASCADE``, as the tests'
        SQLite does not — never reaches the index.
        """
        result = self.db.execute(
            select(KnowledgeEmbedding.id, KnowledgeEmbedding.chunk_id, KnowledgeEmbedding.vector)
            .join(KnowledgeChunk, KnowledgeChunk.id == KnowledgeEmbedding.chunk_id)
            .where(
                KnowledgeEmbedding.model == model,
                KnowledgeEmbedding.dimensions == dimensions,
                KnowledgeEmbedding.id > after_id,
                KnowledgeEmbedding.id <= max_id,
            )
            .order_by(KnowledgeEmbedding.id)
            .execution_options(yield_per=_STREAM_BATCH)
        )
        for embedding_id, chunk_id, blob in result:
            yield int(embedding_id), int(chunk_id), bytes(blob)

    # --- materialisation (the passages a search returns) --------------------

    def chunks_with_documents(self, chunk_ids: list[int]) -> dict[int, KnowledgeChunk]:
        """The given chunks, each joined to its document, keyed by id.

        An id that no longer exists is simply absent: the index may be one
        search behind a deletion.
        """
        if not chunk_ids:
            return {}
        chunks = (
            self.db.execute(
                select(KnowledgeChunk)
                .options(joinedload(KnowledgeChunk.document))
                .where(KnowledgeChunk.id.in_(chunk_ids))
            )
            .scalars()
            .all()
        )
        return {chunk.id: chunk for chunk in chunks}
