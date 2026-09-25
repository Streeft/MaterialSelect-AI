"""Retrieval inside one notebook (D-92).

The Cérebro's hybrid search (D-47) — BM25 plus embeddings, fused by reciprocal
rank — over a corpus of exactly one notebook's **selected** sources.

The scoping is by construction, not by filter: :func:`search` ranks the list
of chunks it is given and nothing else. It has no session and cannot go and
fetch more, so a passage from another notebook — or another student — cannot
reach an answer through here, whatever a query says. The caller loads that
list through the owner-scoped repository.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.config import Settings
from app.domain.errors import ValidationError
from app.knowledge.embeddings import (
    EmbeddingClient,
    EmbeddingUnavailableError,
    similarity,
    unpack_vector,
)
from app.knowledge.lexical import tokenize
from app.knowledge.retrieval import lexical_rank, reciprocal_rank_fusion
from app.models.notebook import NotebookChunk

logger = logging.getLogger(__name__)

_CANDIDATES = 20


@dataclass(frozen=True)
class Retrieval:
    chunks: list[NotebookChunk]
    #: True when nothing matched and the opening of each source was handed over
    #: instead — the model is told, and the mock answers "não encontrei".
    fallback: bool


def search(
    chunks: list[NotebookChunk],
    query: str,
    *,
    top_k: int,
    settings: Settings,
    semantic: bool,
) -> Retrieval:
    """The ``top_k`` passages of ``chunks`` most relevant to ``query``.

    ``semantic`` is False for the simulated provider: it is offline by
    contract, and an embedding call would make it neither.
    """
    if not chunks:
        return Retrieval(chunks=[], fallback=False)

    rankings = [lexical_rank(chunks, tokenize(query))] if tokenize(query) else []
    if semantic:
        rankings.append(_semantic_rank(chunks, query, settings))
    fused = reciprocal_rank_fusion(rankings)

    if not fused:
        return Retrieval(chunks=openings(chunks, top_k), fallback=True)
    by_id = {chunk.id: chunk for chunk in chunks}
    return Retrieval(
        chunks=[by_id[chunk_id] for chunk_id, _ in fused[:top_k] if chunk_id in by_id],
        fallback=False,
    )


def openings(chunks: list[NotebookChunk], limit: int) -> list[NotebookChunk]:
    """The first passages of each source, round-robin, up to ``limit``.

    Round-robin so that a long first source cannot fill the whole context: a
    guide of three sources should hear from all three.
    """
    by_source: dict[int, list[NotebookChunk]] = {}
    for chunk in sorted(chunks, key=lambda c: (c.source_id, c.ordinal)):
        by_source.setdefault(chunk.source_id, []).append(chunk)
    picked: list[NotebookChunk] = []
    depth = 0
    while len(picked) < limit:
        layer = [passages[depth] for passages in by_source.values() if depth < len(passages)]
        if not layer:
            break
        picked.extend(layer[: limit - len(picked)])
        depth += 1
    return picked


def _semantic_rank(
    chunks: list[NotebookChunk], query: str, settings: Settings
) -> list[tuple[int, float]]:
    client = EmbeddingClient(settings)
    if not client.configured:
        return []
    embedded = [c for c in chunks if c.embedding is not None and c.embedding.model == client.model]
    if not embedded:
        return []
    try:
        query_vector = client.embed([query])[0]
        scored = [
            (chunk.id, similarity(query_vector, unpack_vector(chunk.embedding.vector)))  # type: ignore[union-attr]
            for chunk in embedded
        ]
    except (EmbeddingUnavailableError, ValidationError) as exc:
        # Same degradation as the Cérebro: half the retrieval beats none.
        logger.warning("Busca semântica do caderno indisponível, usando só léxica: %s", exc)
        return []
    scored.sort(key=lambda item: -item[1])
    return scored[:_CANDIDATES]
