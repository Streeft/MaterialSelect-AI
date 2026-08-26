"""Retrieval: turn a query into ranked, cited passages from the corpus.

Nothing here existed before this module — ``lexical.py`` and ``embeddings.py``
are primitives a caller has to orchestrate, and this is that orchestration.
Only lexical search is implemented in this first pass; semantic search and
the fusion between the two arrive in the next one.

**Vocabulary and context, never a number's source.** Whatever this returns
feeds a prompt as reference text — it is never read by
``app.ai.guardrails.check_constraint``, which only ever sees
``context.statement``. See ``app/knowledge/__init__.py``.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import Settings
from app.knowledge.lexical import bm25_scores, tokenize
from app.models.enums import DocumentKind, SourceAuthority
from app.repositories.knowledge_repository import KnowledgeRepository

#: How many lexical candidates feed the ranking before top_k trims it. Wider
#: than what the caller asked for so a later fusion step (semantic search)
#: has more than one signal's worth of material to combine.
_LEXICAL_CANDIDATES = 20


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
    """The ``top_k`` passages most relevant to ``query``.

    Lexical (BM25) always runs — it needs no network and no configuration
    beyond a corpus already ingested. Empty list when nothing was ingested or
    nothing matches; never raises for an empty corpus.
    """
    repo = KnowledgeRepository(db)
    return _lexical_search(repo, query, top_k=top_k)


def _lexical_search(repo: KnowledgeRepository, query: str, *, top_k: int) -> list[RetrievedChunk]:
    query_tokens = tokenize(query)
    if not query_tokens:
        return []

    chunks = repo.list_all_chunks_for_lexical_search()
    if not chunks:
        return []

    documents = {chunk.id: tokenize(chunk.search_text) for chunk in chunks}
    document_frequency: dict[str, int] = {}
    for tokens in documents.values():
        for token in set(tokens):
            document_frequency[token] = document_frequency.get(token, 0) + 1

    scores = bm25_scores(query_tokens, documents, document_frequency, corpus_size=len(chunks))
    if not scores:
        return []

    by_id = {chunk.id: chunk for chunk in chunks}
    ranked = sorted(scores.items(), key=lambda item: -item[1])[: max(top_k, _LEXICAL_CANDIDATES)]

    results = [
        RetrievedChunk(
            document_title=by_id[chunk_id].document.title,
            document_kind=by_id[chunk_id].document.kind,
            document_authority=by_id[chunk_id].document.authority,
            page_start=by_id[chunk_id].page_start,
            page_end=by_id[chunk_id].page_end,
            text=by_id[chunk_id].text,
            score=score,
        )
        for chunk_id, score in ranked
    ]
    return results[:top_k]
