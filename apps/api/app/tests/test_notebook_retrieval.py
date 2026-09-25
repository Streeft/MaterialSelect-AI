"""Retrieval inside one notebook (D-90): it ranks what it is handed and nothing
else, and falls back to each source's opening — round-robin — when nothing
matches."""

from __future__ import annotations

from types import SimpleNamespace

from app.config import Settings
from app.knowledge.lexical import fold
from app.notebooks.retrieval import openings, search


def _chunk(chunk_id: int, source_id: int, ordinal: int, text: str):
    return SimpleNamespace(
        id=chunk_id,
        source_id=source_id,
        ordinal=ordinal,
        text=text,
        search_text=fold(text),
        embedding=None,
    )


CHUNKS = [
    _chunk(1, 10, 0, "Aços carbono são ligas de ferro."),
    _chunk(2, 10, 1, "A têmpera aumenta a dureza do aço."),
    _chunk(3, 20, 0, "Polímeros termoplásticos amolecem com calor."),
]


def test_ranks_the_matching_passage_first():
    found = search(CHUNKS, "dureza têmpera", top_k=2, settings=Settings(), semantic=False)
    assert found.fallback is False
    assert [c.id for c in found.chunks] == [2]


def test_no_match_hands_over_the_openings():
    found = search(CHUNKS, "zzz", top_k=3, settings=Settings(), semantic=False)
    assert found.fallback is True
    assert [c.id for c in found.chunks] == [1, 3, 2]


def test_openings_are_round_robin_across_sources():
    assert [c.id for c in openings(CHUNKS, 2)] == [1, 3]


def test_nothing_to_search_is_nothing_found():
    found = search([], "aço", top_k=3, settings=Settings(), semantic=False)
    assert found.chunks == [] and found.fallback is False


def test_semantic_without_embeddings_configured_is_lexical():
    found = search(CHUNKS, "polímeros", top_k=1, settings=Settings(), semantic=True)
    assert [c.id for c in found.chunks] == [3]
