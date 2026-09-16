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
from app.knowledge.embeddings import (
    EmbeddingClient,
    EmbeddingUnavailableError,
    similarity,
    unpack_vector,
)
from app.knowledge.lexical import bm25_scores, tokenize
from app.models.enums import DocumentKind, SourceAuthority
from app.models.knowledge import KnowledgeChunk
from app.repositories.knowledge_repository import KnowledgeRepository

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
    """The ``top_k`` passages most relevant to ``query``, lexical + semantic."""
    repo = KnowledgeRepository(db)
    query_tokens = tokenize(query)
    if not query_tokens:
        return []

    # Loaded once and shared: lexical scoring, the semantic-fallback fetch
    # below, and _to_retrieved_chunk() all need the same rows, and the corpus
    # is loaded whole (see list_all_chunks_for_lexical_search's docstring).
    all_chunks = repo.list_all_chunks_for_lexical_search()

    lexical_ranked = _lexical_rank(all_chunks, query_tokens)
    semantic_ranked = _semantic_rank(repo, query, settings)

    fused = _reciprocal_rank_fusion([lexical_ranked, semantic_ranked])
    if not fused:
        return []

    chunks_by_id = {chunk.id: chunk for chunk in all_chunks}
    # Semantic-only matches may not be in the lexical fetch (search_text could
    # theoretically differ in coverage); fall back to the embeddings fetch.
    if any(chunk_id not in chunks_by_id for chunk_id, _ in fused):
        chunks_by_id.update({chunk.id: chunk for chunk in repo.list_all_embeddings()})

    results = [
        _to_retrieved_chunk(chunks_by_id[chunk_id], score)
        for chunk_id, score in fused
        if chunk_id in chunks_by_id
    ]
    return results[:top_k]


def _lexical_rank(chunks: list[KnowledgeChunk], query_tokens: list[str]) -> list[tuple[int, float]]:
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
    repo: KnowledgeRepository, query: str, settings: Settings
) -> list[tuple[int, float]]:
    client = EmbeddingClient(settings)
    if not client.configured:
        return []
    chunks = repo.list_all_embeddings()
    if not chunks:
        return []
    try:
        query_vector = client.embed([query])[0]
        scored = [
            (chunk.id, similarity(query_vector, unpack_vector(chunk.embedding.vector)))
            for chunk in chunks
            if chunk.embedding is not None and chunk.embedding.model == client.model
        ]
    except EmbeddingUnavailableError as exc:
        logger.warning("Busca semântica indisponível, usando só léxica: %s", exc)
        return []
    except ValidationError as exc:
        # Not EmbeddingUnavailableError: the call succeeded, but a stored
        # vector is corrupted or from an incompatible dimensionality.
        # EmbeddingUnavailableError is itself a ValidationError subclass, so
        # it's already caught above; this clause is for the plain
        # ValidationError that similarity()/unpack_vector() raise instead.
        # Same degradation, different cause: half the retrieval working
        # beats a flaky/corrupted row taking down the call.
        logger.warning(
            "Pontuação semântica falhou com um vetor corrompido, usando só léxica: %s", exc
        )
        return []
    scored.sort(key=lambda item: -item[1])
    return scored[:_CANDIDATES]


def _reciprocal_rank_fusion(rankings: list[list[tuple[int, float]]]) -> list[tuple[int, float]]:
    fused: dict[int, float] = {}
    for ranking in rankings:
        for position, (chunk_id, _score) in enumerate(ranking):
            fused[chunk_id] = fused.get(chunk_id, 0.0) + 1.0 / (_RRF_K + position + 1)
    return sorted(fused.items(), key=lambda item: -item[1])


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
