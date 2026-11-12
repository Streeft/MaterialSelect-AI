"""Relevance for the palette's quick search (D-207).

Pure string comparison — no number of the domain is computed here, only how
well a typed query matches a name. The rule, in the order a reader expects:

4. the name **starts** with the term ("aço" → "Aço 1020");
3. the term is a **whole word** of the name ("Liga de aço");
2. a word of the name **starts** with the term ("Liga açoforte");
1. the term appears **anywhere** ("Argamassa Traço 1:3");
0. the term is only in the class name.

Accents and case are folded away first, so "aco" finds "aço" and "ACO" too.
A query of several words needs every word (in the name or the class); its tier
is the better of the whole phrase's tier and the weakest word's tier, so
"aço inox" ranks "Aço inoxidável" by its prefix and "Liga de aço inox" by its
weakest word.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from typing import TypeVar

PREFIX = 4
WHOLE_WORD = 3
WORD_PREFIX = 2
CONTAINS = 1
CLASS_ONLY = 0


def fold(text: str) -> str:
    """Lowercase without diacritics: "Aço Inoxidável" → "aco inoxidavel"."""
    decomposed = unicodedata.normalize("NFD", text)
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return " ".join(stripped.casefold().split())


def _tier(term: str, text: str) -> int | None:
    """How ``term`` sits inside ``text`` (both already folded), or None."""
    if not term or term not in text:
        return None
    if text.startswith(term):
        return PREFIX
    escaped = re.escape(term)
    if re.search(rf"(?<!\w){escaped}(?!\w)", text):
        return WHOLE_WORD
    if re.search(rf"(?<!\w){escaped}", text):
        return WORD_PREFIX
    return CONTAINS


def relevance(query: str, name: str, class_name: str | None = None) -> int | None:
    """The tier of ``name`` for ``query`` (higher is better), or None if it does not match."""
    phrase = fold(query)
    words = phrase.split()
    if not words:
        return None
    folded_name = fold(name)
    folded_class = fold(class_name) if class_name else ""
    word_tiers: list[int] = []
    for word in words:
        tier = _tier(word, folded_name)
        if tier is None:
            if word not in folded_class:
                return None
            tier = CLASS_ONLY
        word_tiers.append(tier)
    phrase_tier = _tier(phrase, folded_name) if len(words) > 1 else None
    return max(phrase_tier or CLASS_ONLY, min(word_tiers))


@dataclass(frozen=True)
class Candidate:
    """One row the search may return; ``ref`` is whatever the caller needs back."""

    name: str
    class_name: str | None
    ref: object


T = TypeVar("T", bound=Candidate)


def rank(query: str, candidates: Iterable[T], limit: int) -> Sequence[T]:
    """The ``limit`` best matches, best first; ties go to the shorter, then alphabetical, name."""
    scored: list[tuple[int, int, str, T]] = []
    for candidate in candidates:
        score = relevance(query, candidate.name, candidate.class_name)
        if score is not None:
            scored.append((-score, len(candidate.name), fold(candidate.name), candidate))
    scored.sort(key=lambda row: row[:3])
    return [row[3] for row in scored[:limit]]
