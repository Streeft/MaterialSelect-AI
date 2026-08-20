"""Lexical retrieval: the path that works with no network and no provider.

This is the floor the knowledge base stands on. Embeddings are better at finding
a passage that says the same thing in different words, but they need a service,
a key and a working connection; this needs none of the three, and it is what
answers when any of them is missing. Same reasoning as the ``mock`` AI provider
being the default: the deterministic path is the one that always exists.

Scoring is BM25, unmodified. It is the standard for a reason — term frequency
saturates, long passages do not win by being long, and a rare word counts for
more than a common one — and the project has no business inventing a ranking
function when the well-understood one fits.

Matching folds diacritics, so "resistencia" typed in a hurry finds
"resistência", and it does **not** stem: "tenacidade" will not match "tenaz".
Stemming Portuguese correctly means a dependency or a few hundred lines of
rules, and a wrong stem silently merges two concepts. The honest trade is to
under-match and let the embedding layer cover the rest.

Numbers survive tokenisation on purpose. "6061" and "AISI" are how an alloy is
named, and dropping digits would make half the catalogue unsearchable; a number
that is merely common ("200") is handled by its own low IDF rather than by a
rule. Note that this is about *finding* a passage — a number read out of one
still cannot reach the user, which is ``app/ai/guardrails.py``'s job.
"""

from __future__ import annotations

import math
import re
import unicodedata

#: BM25's usual constants. k1 controls how fast term frequency saturates, b how
#: strongly length is penalised. These are the values the literature settled on;
#: changing them is a tuning decision that needs a measurement behind it.
BM25_K1 = 1.5
BM25_B = 0.75

#: Shorter than this and a token is noise — "de", "da", "no", stray letters left
#: by PDF extraction.
MIN_TOKEN_CHARS = 3

# Portuguese and English together, because the corpus is both: the course
# material is in Portuguese and half the reference books are not. Deliberately
# short — an aggressive stopword list removes words that carry meaning in a
# technical query ("sem", "não", "acima").
STOPWORDS = frozenset(
    {
        # pt-BR
        "aos", "com", "como", "das", "dos", "ela", "ele", "eles", "entre", "essa",
        "esse", "esta", "este", "foi", "isso", "mais", "mas", "nas", "nos", "ohh",
        "ou", "para", "pela", "pelo", "por", "que", "seja", "sem", "ser", "seu",
        "sua", "são", "também", "tem", "uma", "uns", "vez",
        # en
        "and", "are", "but", "can", "for", "from", "has", "have", "its", "not",
        "the", "that", "their", "then", "there", "these", "this", "those", "was",
        "were", "which", "with",
    }
)

_WORD = re.compile(r"[0-9a-z]+")


def fold(text: str) -> str:
    """Lowercase and strip diacritics, for matching only.

    The folded form is what gets stored in ``KnowledgeChunk.search_text`` and
    what a query is compared against; the passage the reader is shown is always
    the original. Folding one side only would make the comparison asymmetric,
    which is why both go through here.
    """
    lowered = text.lower()
    decomposed = unicodedata.normalize("NFKD", lowered)
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def tokenize(text: str) -> list[str]:
    """Split folded text into searchable terms, dropping stopwords."""
    return [
        token
        for token in _WORD.findall(fold(text))
        if len(token) >= MIN_TOKEN_CHARS and token not in STOPWORDS
    ]


def idf(document_frequency: int, corpus_size: int) -> float:
    """BM25's inverse document frequency, in its non-negative form.

    The ``+ 1`` inside the logarithm is what keeps this from going negative for
    a term present in more than half the corpus. Without it a very common word
    would actively *penalise* the passages containing it, which reads as a bug
    every time someone rediscovers it.
    """
    numerator = corpus_size - document_frequency + 0.5
    denominator = document_frequency + 0.5
    return math.log(1.0 + numerator / denominator)


def bm25_scores(
    query_tokens: list[str],
    documents: dict[int, list[str]],
    document_frequency: dict[str, int],
    corpus_size: int,
    average_length: float | None = None,
) -> dict[int, float]:
    """Score each document against the query.

    Args:
        query_tokens: the query, already tokenised.
        documents: candidate id -> that candidate's tokens.
        document_frequency: term -> how many passages in the **whole corpus**
            contain it. Corpus-wide and not candidate-wide on purpose: within a
            candidate set every query term looks rare, and IDF computed there
            would flatten the one signal that separates a distinctive term from
            a filler one.
        corpus_size: total passages in the corpus, for the same reason.
        average_length: mean token count across the corpus. Estimated from the
            candidates when not supplied — b-normalisation only needs a
            reference scale, and candidates drawn from the same corpus give a
            usable one without a second full scan.

    Returns:
        candidate id -> score. Documents matching nothing are simply absent.
    """
    if not query_tokens or not documents:
        return {}

    lengths = {key: len(tokens) for key, tokens in documents.items()}
    if average_length is None or average_length <= 0:
        average_length = sum(lengths.values()) / len(lengths) or 1.0

    corpus_size = max(corpus_size, len(documents))
    weights = {
        token: idf(min(document_frequency.get(token, 1), corpus_size), corpus_size)
        for token in set(query_tokens)
    }

    scores: dict[int, float] = {}
    for key, tokens in documents.items():
        frequencies: dict[str, int] = {}
        for token in tokens:
            frequencies[token] = frequencies.get(token, 0) + 1

        length_ratio = lengths[key] / average_length if average_length else 1.0
        total = 0.0
        for token in weights:
            frequency = frequencies.get(token, 0)
            if not frequency:
                continue
            saturated = frequency * (BM25_K1 + 1.0)
            normaliser = frequency + BM25_K1 * (1.0 - BM25_B + BM25_B * length_ratio)
            total += weights[token] * saturated / normaliser
        if total > 0.0:
            scores[key] = total
    return scores
