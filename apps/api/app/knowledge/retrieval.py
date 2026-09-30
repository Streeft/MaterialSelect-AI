"""Retrieval: turn a query into ranked, cited passages from the corpus.

Hybrid by default: lexical (BM25, no network) and semantic (embeddings, one
network call for the query) are ranked separately, then combined by
*reciprocal rank fusion* — each candidate's score is the sum of
``1 / (k + rank)`` across whichever lists it appears in, ``k = 60`` (the
constant the RRF literature converged on; no tuning knob here because there
is nothing yet to tune it against).

Semantic search degrades to lexical-only, silently to the caller, whenever
embeddings are unconfigured or the call fails — a knowledge base is more
useful with half its retrieval working than with none of it, and the
alternative (raising) would make one flaky embedding provider take down every
AI call in the product.

**Ranked in memory, read from the database only when it changed.** The
Cérebro's search ranks over a process-resident index (``app/knowledge/index.py``)
instead of loading every passage and vector per call; the notebooks keep
:func:`lexical_rank` over the handful of passages they are handed.

**Vocabulary and context, never a number's source.** Whatever this returns
feeds a prompt as reference text — it is never read by
``app.ai.guardrails.check_constraint``, which only ever sees
``context.statement``. See ``app/knowledge/__init__.py``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import Settings
from app.domain.errors import ValidationError
from app.knowledge.embeddings import EmbeddingClient, EmbeddingUnavailableError
from app.knowledge.index import get_cache
from app.knowledge.lexical import bm25_scores, tokenize
from app.models.enums import DocumentKind, SourceAuthority
from app.models.knowledge import KnowledgeChunk
from app.repositories.knowledge_index_repository import KnowledgeIndexRepository

logger = logging.getLogger(__name__)

#: How many candidates each ranking (lexical, semantic) contributes before
#: fusion trims to top_k. Wider than top_k so fusion has real material to
#: combine instead of comparing two already-truncated lists.
_CANDIDATES = 20
#: RRF's smoothing constant — the value the technique's literature settled on.
_RRF_K = 60


@dataclass(frozen=True)
class RetrievedChunk:
    """One passage handed to a prompt, with what makes it checkable."""

    document_title: str
    document_kind: DocumentKind
    document_authority: SourceAuthority
    page_start: int | None
    page_end: int | None
    text: str
    score: float


def search(db: Session, query: str, *, top_k: int, settings: Settings) -> list[RetrievedChunk]:
    """The ``top_k`` passages most relevant to ``query``, lexical + semantic.

    Ranked over the process-resident index (``app/knowledge/index.py``), which
    two small fingerprint queries keep in step with the database; only the
    passages returned are read in full, with their document.
    """
    query_tokens = tokenize(query)
    if not query_tokens:
        return []

    repo = KnowledgeIndexRepository(db)
    cache = get_cache()
    lexical_ranked = cache.lexical(repo).rank(query_tokens, _CANDIDATES)
    semantic_ranked = _semantic_rank(repo, query, settings)

    fused = reciprocal_rank_fusion([lexical_ranked, semantic_ranked])
    if not fused:
        return []
    return _materialise(repo, fused, top_k)


def lexical_rank(chunks: list[KnowledgeChunk], query_tokens: list[str]) -> list[tuple[int, float]]:
    """BM25 over ``chunks`` alone. Duck-typed on ``id`` and ``search_text``, so
    a notebook's passages (D-92) are ranked by the same function over *their*
    corpus — the document frequencies are the notebook's, never the Cérebro's.
    """
    if not chunks:
        return []
    documents = {chunk.id: tokenize(chunk.search_text) for chunk in chunks}
    document_frequency: dict[str, int] = {}
    for tokens in documents.values():
        for token in set(tokens):
            document_frequency[token] = document_frequency.get(token, 0) + 1
    scores = bm25_scores(query_tokens, documents, document_frequency, corpus_size=len(chunks))
    return sorted(scores.items(), key=lambda item: -item[1])[:_CANDIDATES]


def _semantic_rank(
    repo: KnowledgeIndexRepository, query: str, settings: Settings
) -> list[tuple[int, float]]:
    client = EmbeddingClient(settings)
    if not client.configured:
        return []
    # Asked before embedding the query: with no vector of this model stored,
    # the embedding call would spend a request of the daily quota for nothing.
    stored = repo.vector_fingerprints(client.model)
    if not stored:
        return []
    try:
        query_vector = client.embed([query])[0]
        # Only vectors of this model *and* the query's own length are compared
        # (embedding_matches' rule, applied in SQL by the fingerprint and the
        # loader). The actual length, never the configured one: 0 there means
        # "any", and a query must not meet vectors of another size.
        fingerprint = stored.get(len(query_vector))
        if fingerprint is None:
            logger.warning(
                "Busca semântica sem vetores de %s com %d dimensões; usando só léxica.",
                client.model,
                len(query_vector),
            )
            return []
        vectors = get_cache().vectors(repo, client.model, len(query_vector), fingerprint)
        return vectors.rank(query_vector, _CANDIDATES)
    except EmbeddingUnavailableError as exc:
        logger.warning("Busca semântica indisponível, usando só léxica: %s", exc)
        return []
    except ValidationError as exc:
        # EmbeddingUnavailableError is itself a ValidationError subclass, so
        # it's already caught above; this clause is for any other plain
        # ValidationError on the way. A corrupted stored vector no longer
        # lands here — the index skips it at load, with a warning — but the
        # promise stands: half the retrieval working beats a flaky row taking
        # down the call.
        logger.warning("Pontuação semântica falhou, usando só léxica: %s", exc)
        return []


def reciprocal_rank_fusion(rankings: list[list[tuple[int, float]]]) -> list[tuple[int, float]]:
    """RRF over any number of ``(id, score)`` rankings; shared with the notebooks."""
    fused: dict[int, float] = {}
    for ranking in rankings:
        for position, (chunk_id, _score) in enumerate(ranking):
            fused[chunk_id] = fused.get(chunk_id, 0.0) + 1.0 / (_RRF_K + position + 1)
    return sorted(fused.items(), key=lambda item: -item[1])


def _materialise(
    repo: KnowledgeIndexRepository, fused: list[tuple[int, float]], top_k: int
) -> list[RetrievedChunk]:
    """Read the first ``top_k`` fused passages in full, in fused order.

    Only those rows are fetched. An id the index still knows but the database
    no longer has (deleted since the fingerprint was read) is skipped, and the
    next candidate takes its place — the answer the old full load gave.
    """
    results: list[RetrievedChunk] = []
    position = 0
    while len(results) < top_k and position < len(fused):
        batch = fused[position : position + top_k - len(results)]
        position += len(batch)
        rows = repo.chunks_with_documents([chunk_id for chunk_id, _ in batch])
        results.extend(
            _to_retrieved_chunk(rows[chunk_id], score)
            for chunk_id, score in batch
            if chunk_id in rows
        )
    return results


def _to_retrieved_chunk(chunk: KnowledgeChunk, score: float) -> RetrievedChunk:
    return RetrievedChunk(
        document_title=chunk.document.title,
        document_kind=chunk.document.kind,
        document_authority=chunk.document.authority,
        page_start=chunk.page_start,
        page_end=chunk.page_end,
        text=chunk.text,
        score=score,
    )
