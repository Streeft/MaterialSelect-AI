"""The Cérebro's retrieval index, resident in the API process.

**Why it exists.** Before this module every AI call loaded the whole corpus
from the database twice — every passage for BM25 and every passage again with
its vector for the semantic ranking. At the Cérebro's size (≈18k passages,
768-dimension vectors) that is ≈135–300 MB of transfer and a 300–500 MB peak
per call: enough to kill a 512 MB VM and to spend a free database's monthly
transfer in a few dozen questions. Here the corpus is read **once per process**
and kept in two compact structures, and a search costs two tiny fingerprint
queries plus the few rows it actually returns.

**Two structures, two lifecycles.**

* :class:`LexicalIndex` — an inverted index over ``search_text``. Its scores
  are *exactly* :func:`app.knowledge.lexical.bm25_scores` over the same corpus
  (same IDF, same length normalisation, same order of floating-point
  additions), which a golden test holds it to: the index changes how the
  numbers are reached, never which numbers come out. Rebuilt whole when the
  corpus fingerprint changes, because an ingestion rewrites passages and
  document frequencies are corpus-wide. The old index is let go before the
  new one is built, so a rebuild never holds two. An ingestion commits per
  document, so a first ingestion changes the fingerprint on every commit and
  a query during it rebuilds each time: run ``ingerir`` outside class hours.
* :class:`VectorStore` — the stored vectors of **one** ``(model, dimensions)``,
  unpacked into ``array('f')`` (4 bytes a component, as stored). Vectors arrive
  a batch a night, so a store grows **incrementally**: rows above the cached
  highest id are appended, and anything else — a count or an id sum that does
  not add up (a deletion, a vector rewritten in place from another model) —
  forces a full reload. Only one store is kept: a model change replaces it rather than
  leaving the old one resident.

**What this does not change.** Vectors of another model or dimension are
ignored, never compared (a similarity across them is a number that looks like
an answer and is not). A blob whose length disagrees with its declared
dimension is skipped at load with a warning, never raised, so one corrupted row
cannot take semantic search down. And nothing here is a source of numbers for
the user — retrieval only ever feeds prompts (see ``app/knowledge/__init__.py``).

**Threads.** Uvicorn serves the synchronous endpoints from a thread pool, so a
build or refresh runs under a lock. Readers are never blocked by a refresh of a
store they already hold: a lexical index is immutable once built, and a vector
store only ever grows at the end, with readers reading up to the length they
saw when they started.
"""

from __future__ import annotations

import heapq
import logging
import math
import operator
import sys
import threading
import time
from array import array
from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, field

from app.knowledge.lexical import BM25_B, BM25_K1, idf, tokenize
from app.repositories.knowledge_index_repository import (
    CorpusFingerprint,
    KnowledgeIndexRepository,
    VectorFingerprint,
)

logger = logging.getLogger(__name__)

#: ``math.sumprod`` exists from Python 3.12 (the API image); CI also runs 3.11,
#: where the dot product falls back to ``map`` — slower, same result up to the
#: last bits (``sumprod`` accumulates in extended precision).
_sumprod: Callable[[Iterable[float], Iterable[float]], float] | None = getattr(
    math, "sumprod", None
)

#: Stored vectors are little-endian float32 (``app/knowledge/embeddings.py``);
#: ``array('f')`` follows the machine, so a big-endian host swaps after reading.
_SWAP_BYTES = sys.byteorder != "little"


def dot(left: Iterable[float], right: Iterable[float]) -> float:
    """Dot product of two equal-length vectors; cosine for unit vectors."""
    if _sumprod is not None:
        return _sumprod(left, right)
    return sum(map(operator.mul, left, right))


# --- lexical ---------------------------------------------------------------


class LexicalIndex:
    """BM25 over the Cérebro's searchable passages, as postings lists.

    Positions (0..N-1, in chunk-id order) index three arrays: the chunk id, the
    token count, and — per term — an interleaved ``(position, frequency)``
    postings array. Immutable once built.
    """

    def __init__(
        self,
        fingerprint: CorpusFingerprint,
        chunk_ids: array,
        lengths: array,
        postings: dict[str, array],
    ) -> None:
        self.fingerprint = fingerprint
        self._chunk_ids = chunk_ids
        self._lengths = lengths
        self._postings = postings
        self._size = len(chunk_ids)
        total = sum(lengths)
        # bm25_scores(): ``sum(lengths) / len(lengths) or 1.0`` — the same
        # expression, so the same float.
        self._average_length = (total / self._size or 1.0) if self._size else 1.0

    def __len__(self) -> int:
        return self._size

    @property
    def term_count(self) -> int:
        return len(self._postings)

    def scores(self, query_tokens: list[str]) -> dict[int, float]:
        """chunk id -> BM25 score, identical to :func:`bm25_scores` over the corpus.

        Identical, not approximately equal: the weights are built from the same
        ``set(query_tokens)`` iteration, and each passage's score is the sum of
        its terms in that same order, so every floating-point addition happens
        in the order ``bm25_scores`` performs it.
        """
        if not query_tokens or not self._size:
            return {}
        corpus_size = self._size
        weights = {
            token: idf(min(self._document_frequency(token), corpus_size), corpus_size)
            for token in set(query_tokens)
        }
        average_length = self._average_length
        lengths = self._lengths
        totals: dict[int, float] = {}
        for token, weight in weights.items():
            postings = self._postings.get(token)
            if postings is None:
                continue
            for index in range(0, len(postings), 2):
                position = postings[index]
                frequency = postings[index + 1]
                length_ratio = lengths[position] / average_length if average_length else 1.0
                saturated = frequency * (BM25_K1 + 1.0)
                normaliser = frequency + BM25_K1 * (1.0 - BM25_B + BM25_B * length_ratio)
                totals[position] = totals.get(position, 0.0) + weight * saturated / normaliser
        chunk_ids = self._chunk_ids
        return {chunk_ids[position]: total for position, total in totals.items() if total > 0.0}

    def rank(self, query_tokens: list[str], limit: int) -> list[tuple[int, float]]:
        """The ``limit`` best ``(chunk id, score)``, ties by chunk id.

        The same list :func:`app.knowledge.retrieval.lexical_rank` returns over
        the corpus loaded in id order (its sort is stable over that order).
        """
        scores = self.scores(query_tokens)
        return heapq.nsmallest(limit, scores.items(), key=lambda item: (-item[1], item[0]))

    def _document_frequency(self, token: str) -> int:
        postings = self._postings.get(token)
        # bm25_scores() reads ``document_frequency.get(token, 1)``.
        return len(postings) // 2 if postings is not None else 1


def build_lexical_index(
    rows: Iterable[tuple[int, str]], fingerprint: CorpusFingerprint
) -> LexicalIndex:
    """Build from ``(chunk id, search_text)`` rows, which must come in id order."""
    chunk_ids = array("q")
    lengths = array("I")
    postings: dict[str, array] = {}
    for chunk_id, search_text in rows:
        position = len(chunk_ids)
        tokens = tokenize(search_text)
        chunk_ids.append(chunk_id)
        lengths.append(len(tokens))
        frequencies: dict[str, int] = {}
        for token in tokens:
            frequencies[token] = frequencies.get(token, 0) + 1
        for token, frequency in frequencies.items():
            entry = postings.get(token)
            if entry is None:
                entry = postings[token] = array("I")
            entry.append(position)
            entry.append(frequency)
    return LexicalIndex(fingerprint, chunk_ids, lengths, postings)


# --- vectors ---------------------------------------------------------------


@dataclass
class VectorStore:
    """The vectors of one ``(model, dimensions)``, ready to score.

    ``chunk_ids[i]`` owns ``vectors[i]``. Appended to at the end only; a
    reader takes ``len(chunk_ids)`` once and never reads past it, and the
    vector is appended before its id, so what a reader sees is always whole.
    """

    model: str
    dimensions: int
    fingerprint: VectorFingerprint = field(default_factory=lambda: VectorFingerprint(0, 0))
    chunk_ids: array = field(default_factory=lambda: array("q"))
    vectors: list[array] = field(default_factory=list)
    #: Rows skipped at load because the blob did not match ``dimensions``.
    skipped: int = 0

    def __len__(self) -> int:
        return len(self.chunk_ids)

    def rank(self, query_vector: list[float], limit: int) -> list[tuple[int, float]]:
        """The ``limit`` passages whose vector is closest to ``query_vector``.

        ``query_vector`` must have :attr:`dimensions` components — the caller
        picked this store by that length; any other length ranks nothing.
        """
        if len(query_vector) != self.dimensions:
            return []
        size = len(self.chunk_ids)
        chunk_ids = self.chunk_ids
        vectors = self.vectors
        scored = [(chunk_ids[i], dot(query_vector, vectors[i])) for i in range(size)]
        return heapq.nlargest(limit, scored, key=lambda item: item[1])

    def load(self, rows: Iterable[tuple[int, int, bytes]]) -> int:
        """Append ``(embedding id, chunk id, blob)`` rows; returns rows read,
        corrupted ones included (what a fingerprint's count is compared with)."""
        expected = 4 * self.dimensions
        read = 0
        corrupted: list[int] = []
        for embedding_id, chunk_id, blob in rows:
            read += 1
            if len(blob) != expected:
                corrupted.append(embedding_id)
                continue
            vector = array("f")
            vector.frombytes(blob)
            if _SWAP_BYTES:
                vector.byteswap()
            self.vectors.append(vector)
            self.chunk_ids.append(chunk_id)
        if corrupted:
            self.skipped += len(corrupted)
            logger.warning(
                "Índice do Cérebro: %d vetor(es) de %s ignorado(s) por tamanho "
                "diferente de %d dimensões (ids %s); os demais seguem na busca.",
                len(corrupted),
                self.model,
                self.dimensions,
                ", ".join(str(i) for i in corrupted[:10]) + ("…" if len(corrupted) > 10 else ""),
            )
        return read


# --- the process-wide cache --------------------------------------------------


class KnowledgeIndexCache:
    """The lexical index and one vector store, built lazily and kept."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._lexical: LexicalIndex | None = None
        self._vectors: VectorStore | None = None

    def reset(self) -> None:
        """Forget everything; the next search rebuilds from the database."""
        with self._lock:
            self._lexical = None
            self._vectors = None

    def lexical(self, repo: KnowledgeIndexRepository) -> LexicalIndex:
        """The lexical index of the corpus as it is now in the database."""
        fingerprint = repo.corpus_fingerprint()
        current = self._lexical
        if current is not None and current.fingerprint == fingerprint:
            return current
        with self._lock:
            current = self._lexical
            if current is not None and current.fingerprint == fingerprint:
                return current
            started = time.perf_counter()
            # Released first, as the vectors are: a rebuild never holds two
            # indexes at once. A reader already holding the old one keeps it
            # alive until it is done; a new reader waits on the lock.
            self._lexical = None
            if fingerprint.chunk_max_id is None:
                rows: Iterable[tuple[int, str]] = ()
            else:
                rows = repo.iter_search_texts(fingerprint.chunk_max_id)
            built = build_lexical_index(rows, fingerprint)
            self._lexical = built
            logger.info(
                "Índice léxico do Cérebro construído: %d trechos, %d termos, em %.2f s; %s.",
                len(built),
                built.term_count,
                time.perf_counter() - started,
                process_memory(),
            )
            return built

    def vectors(
        self,
        repo: KnowledgeIndexRepository,
        model: str,
        dimensions: int,
        fingerprint: VectorFingerprint,
    ) -> VectorStore:
        """The vectors of ``(model, dimensions)`` as of ``fingerprint``.

        Incremental when only new rows appeared above the cached highest id and
        the counts add up; a full reload otherwise.
        """
        current = self._vectors
        if (
            current is not None
            and (current.model, current.dimensions) == (model, dimensions)
            and current.fingerprint == fingerprint
        ):
            return current
        with self._lock:
            current = self._vectors
            same_identity = current is not None and (current.model, current.dimensions) == (
                model,
                dimensions,
            )
            if current is not None and same_identity and current.fingerprint == fingerprint:
                return current
            started = time.perf_counter()
            if (
                current is not None
                and same_identity
                and fingerprint.max_id > current.fingerprint.max_id
                and self._append(repo, current, fingerprint)
            ):
                return current
            store = VectorStore(model=model, dimensions=dimensions, fingerprint=fingerprint)
            # Released first, so a reload never holds two stores at once.
            self._vectors = None
            store.load(repo.iter_vectors(model, dimensions, after_id=0, max_id=fingerprint.max_id))
            self._vectors = store
            logger.info(
                "Vetores do Cérebro carregados (%s, %d dimensões): %d vetores, em %.2f s; %s.",
                model,
                dimensions,
                len(store),
                time.perf_counter() - started,
                process_memory(),
            )
            return store

    @staticmethod
    def _append(
        repo: KnowledgeIndexRepository, store: VectorStore, fingerprint: VectorFingerprint
    ) -> bool:
        """Load the rows above the cached max; False when the counts disagree.

        Disagreeing counts or id sums mean something below the cached max
        changed — a deletion, or a vector rewritten in place from another model
        — and only a full reload sees that. The new rows are read into a scratch store and
        only then appended, vectors before ids, so a failure half-way leaves
        ``store`` exactly as it was and a reader never sees an id without its
        vector.
        """
        previous = store.fingerprint
        fresh = VectorStore(model=store.model, dimensions=store.dimensions)
        id_sum = 0

        def tallied(rows: Iterable[tuple[int, int, bytes]]) -> Iterator[tuple[int, int, bytes]]:
            nonlocal id_sum
            for row in rows:
                id_sum += row[0]
                yield row

        read = fresh.load(
            tallied(
                repo.iter_vectors(
                    store.model,
                    store.dimensions,
                    after_id=previous.max_id,
                    max_id=fingerprint.max_id,
                )
            )
        )
        if (
            previous.count + read != fingerprint.count
            or previous.id_sum + id_sum != fingerprint.id_sum
        ):
            return False
        store.vectors.extend(fresh.vectors)
        store.chunk_ids.extend(fresh.chunk_ids)
        store.skipped += fresh.skipped
        store.fingerprint = fingerprint
        logger.info(
            "Vetores do Cérebro: %d novo(s) acrescentado(s) (%s, %d dimensões), total %d.",
            len(fresh),
            store.model,
            store.dimensions,
            len(store),
        )
        return True


def process_memory() -> str:
    """Resident and peak memory of this process, for the build log line."""
    parts: list[str] = []
    try:
        with open("/proc/self/status", encoding="ascii") as status:
            for line in status:
                if line.startswith("VmRSS:"):
                    parts.append(f"memória residente {int(line.split()[1]) // 1024} MB")
                    break
    except OSError:
        pass
    try:
        import resource

        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        # Kilobytes on Linux, bytes on macOS.
        peak_mb = peak // (1024 * 1024) if sys.platform == "darwin" else peak // 1024
        parts.append(f"pico {peak_mb} MB")
    except (ImportError, OSError, AttributeError):
        pass
    return ", ".join(parts) or "memória do processo indisponível"


_cache = KnowledgeIndexCache()


def get_cache() -> KnowledgeIndexCache:
    """The process-wide cache the Cérebro search reads."""
    return _cache


def reset_cache() -> None:
    """Drop the process-wide cache (tests; SQLite reuses ids after a rollback)."""
    _cache.reset()
