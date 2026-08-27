"""Finding the passages that bear on a question, and saying how they were found.

Two rankings, fused. The lexical pass (:mod:`app.knowledge.lexical`) needs
nothing but the database and always runs; the semantic pass needs an embedding
provider and runs when one is configured. Neither is trusted to be right alone.

**Why fusion and not a weighted sum.** BM25 scores and cosine similarities live
on incomparable scales — one is unbounded and corpus-dependent, the other sits
in [-1, 1] — so any weighting of the two raw numbers encodes an arbitrary
exchange rate that shifts with the corpus. Reciprocal rank fusion uses only the
*positions*, which is the part both rankings actually agree on the meaning of.
It is also why adding a third ranking later would not require re-tuning the
first two.

**Degradation is declared, never silent.** If embeddings are configured and the
provider fails, the search still answers from the lexical pass — and says so, in
:attr:`RetrievalResult.degraded_reason`, which the AI layer puts in front of the
reader. A quietly lexical answer that the operator believes is semantic is the
failure mode this whole project is built to avoid; the same reasoning that makes
``AI_PROVIDER`` fail loudly rather than fall back to ``mock``.

**Authority breaks ties and nothing more.** A passage from a course handout does
not outrank a better-matching passage from a textbook. But when two passages are
ranked equally, the one whose provenance someone actually vouched for goes
first, and an undeclared source goes last. Authority is a curator's judgement,
so it decides only where the ranking has nothing left to say.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config import Settings
from app.config import settings as default_settings
from app.knowledge.embeddings import (
    EmbeddingClient,
    EmbeddingUnavailableError,
    similarity,
    unpack_vector,
)
from app.knowledge.lexical import bm25_scores, tokenize
from app.models.enums import SourceAuthority
from app.models.knowledge import KnowledgeChunk
from app.repositories.knowledge_repository import KnowledgeRepository

#: Reciprocal rank fusion's smoothing constant. 60 is the value the original
#: paper reports and the one every implementation since has used; it is large
#: enough that the top few positions do not dominate outright.
RRF_K = 60

#: Most to least authoritative. Ties only — see the module docstring.
AUTHORITY_ORDER: dict[SourceAuthority, int] = {
    SourceAuthority.OFICIAL: 0,
    SourceAuthority.CIENTIFICA: 1,
    SourceAuthority.TECNICA: 2,
    SourceAuthority.SECUNDARIA: 3,
    SourceAuthority.NAO_VERIFICADA: 4,
}


@dataclass(frozen=True)
class RetrievedPassage:
    """One passage and everything needed to cite it back to its source."""

    chunk_id: int
    document_id: int
    path: str
    title: str
    authority: SourceAuthority
    author: str | None
    reference: str | None
    source_url: str | None
    page_start: int | None
    page_end: int | None
    heading: str | None
    text: str
    score: float

    @property
    def locator(self) -> str:
        """Where to look, in the words a reader would use.

        Built here rather than in the frontend because it is the last link of
        the citation chain, and a chain whose last link is assembled twice in
        two places eventually disagrees with itself.
        """
        parts = [self.title]
        if self.heading:
            parts.append(self.heading)
        if self.page_start and self.page_end and self.page_end != self.page_start:
            parts.append(f"p. {self.page_start}-{self.page_end}")
        elif self.page_start:
            parts.append(f"p. {self.page_start}")
        return " — ".join(parts)


@dataclass(frozen=True)
class RetrievalResult:
    """The passages, and an honest account of how they were found."""

    passages: list[RetrievedPassage]
    #: "lexical" or "hibrido" — what actually ran, not what was configured.
    method: str
    #: Set when the semantic pass was configured but did not run. Shown to the
    #: reader; never swallowed.
    degraded_reason: str | None = None

    @property
    def is_empty(self) -> bool:
        return not self.passages


class KnowledgeRetriever:
    """Retrieval over the ingested corpus."""

    def __init__(
        self,
        db: Session,
        settings: Settings = default_settings,
        embedder: EmbeddingClient | None = None,
    ) -> None:
        self.db = db
        self.settings = settings
        self.repo = KnowledgeRepository(db)
        self._embedder = embedder

    @property
    def embedder(self) -> EmbeddingClient:
        if self._embedder is None:
            self._embedder = EmbeddingClient(self.settings)
        return self._embedder

    def search(self, query: str, top_k: int | None = None) -> RetrievalResult:
        """The passages most relevant to ``query``, best first.

        An empty result is a legitimate answer and not an error: a corpus that
        has nothing to say about a question should say nothing, so that the AI
        layer can state it had no grounding rather than invent some.
        """
        limit = top_k if top_k is not None else self.settings.knowledge_retrieval_top_k
        tokens = tokenize(query)
        if not tokens or limit <= 0:
            return RetrievalResult(passages=[], method="lexical")

        candidates = self.repo.search_candidates(
            tokens, self.settings.knowledge_retrieval_candidates
        )
        if not candidates:
            return RetrievalResult(passages=[], method="lexical")

        lexical = self._lexical_scores(tokens, candidates)
        semantic, degraded = self._semantic_scores(query, candidates)

        method = "hibrido" if semantic else "lexical"
        fused = self._fuse([lexical, semantic] if semantic else [lexical])
        ordered = self._order(fused, candidates)

        return RetrievalResult(
            passages=[self._passage(chunk, fused[chunk.id]) for chunk in ordered[:limit]],
            method=method,
            degraded_reason=degraded,
        )

    # --- the two passes ----------------------------------------------------

    def _lexical_scores(
        self, tokens: list[str], candidates: list[KnowledgeChunk]
    ) -> dict[int, float]:
        frequencies = {
            token: self.repo.document_frequency(token) for token in dict.fromkeys(tokens)
        }
        return bm25_scores(
            query_tokens=tokens,
            documents={chunk.id: tokenize(chunk.text) for chunk in candidates},
            document_frequency=frequencies,
            corpus_size=self.repo.count_chunks(),
        )

    def _semantic_scores(
        self, query: str, candidates: list[KnowledgeChunk]
    ) -> tuple[dict[int, float], str | None]:
        """Cosine similarity against the stored vectors, or why there is none."""
        if not self.settings.knowledge_embeddings_enabled:
            # Not degradation: nobody asked for semantic retrieval. Saying so
            # would be noise on every single search.
            return {}, None

        model = self.settings.knowledge_embedding_model.strip()
        stored = self.repo.embeddings_for([chunk.id for chunk in candidates])
        usable = {chunk_id: row for chunk_id, row in stored.items() if row.model == model}
        if not usable:
            return {}, (
                "Busca semântica configurada, mas nenhum trecho candidato tem vetor "
                f"para o modelo '{model}'. Rode a indexação de embeddings; até lá a "
                "recuperação é apenas léxica."
            )

        try:
            vector = self.embedder.embed([query])[0]
        except EmbeddingUnavailableError as exc:
            return {}, f"Busca semântica indisponível ({exc}). A recuperação foi só léxica."

        scores: dict[int, float] = {}
        for chunk_id, row in usable.items():
            candidate = unpack_vector(row.vector)
            if len(candidate) != len(vector):
                # A vector from another model that kept this model's name. Skip
                # it rather than compare incomparable things.
                continue
            scores[chunk_id] = similarity(vector, candidate)
        if not scores:
            return {}, (
                "Os vetores armazenados têm dimensão diferente da que o modelo "
                f"'{model}' devolve agora. Reindexe os embeddings."
            )
        return scores, None

    # --- fusion and ordering ------------------------------------------------

    @staticmethod
    def _fuse(rankings: list[dict[int, float]]) -> dict[int, float]:
        """Reciprocal rank fusion over one or more rankings.

        Equal scores share a rank, rather than being separated by whichever id
        happened to sort first. Without that, two passages a ranking considers
        indistinguishable would still come out of fusion with different numbers,
        and the authority tie-break below would have nothing left to break.
        """
        fused: dict[int, float] = {}
        for ranking in rankings:
            ordered = sorted(ranking.items(), key=lambda item: (-item[1], item[0]))
            rank = 0
            previous: float | None = None
            for position, (key, score) in enumerate(ordered):
                if previous is None or score != previous:
                    rank = position
                    previous = score
                fused[key] = fused.get(key, 0.0) + 1.0 / (RRF_K + rank + 1)
        return fused

    @staticmethod
    def _order(fused: dict[int, float], candidates: list[KnowledgeChunk]) -> list[KnowledgeChunk]:
        """Best first; authority and then id break ties, deterministically."""
        scored = [chunk for chunk in candidates if chunk.id in fused]
        return sorted(
            scored,
            key=lambda chunk: (
                -fused[chunk.id],
                AUTHORITY_ORDER.get(chunk.document.authority, len(AUTHORITY_ORDER)),
                chunk.id,
            ),
        )

    @staticmethod
    def _passage(chunk: KnowledgeChunk, score: float) -> RetrievedPassage:
        document = chunk.document
        return RetrievedPassage(
            chunk_id=chunk.id,
            document_id=document.id,
            path=document.path,
            title=document.title,
            authority=document.authority,
            author=document.author,
            reference=document.reference,
            source_url=document.source_url,
            page_start=chunk.page_start,
            page_end=chunk.page_end,
            heading=chunk.heading,
            text=chunk.text,
            score=score,
        )
