"""Retrieval inside one notebook (D-92): it ranks what it is handed and nothing
else, and falls back to each source's opening — round-robin — when nothing
matches."""

from __future__ import annotations

from types import SimpleNamespace

from app.config import Settings
from app.knowledge.lexical import fold
from app.notebooks.retrieval import openings, search, spread


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


# --- spread (D-94): what the Studio reads when no topic narrows it ----------

LONG = [_chunk(100 + i, 30, i, f"Trecho {i}.") for i in range(10)] + [
    _chunk(200 + i, 40, i, f"Outro {i}.") for i in range(2)
]


def test_spread_reaches_past_the_opening_of_a_long_source():
    picked = [c.id for c in spread(LONG, 6)]
    # The short source gives both of its passages; the long one gets the
    # other four, evenly spaced from its first passage to its last third.
    assert picked == [100, 102, 105, 107, 200, 201]


def test_spread_never_repeats_and_stops_at_what_there_is():
    picked = spread(LONG, 50)
    assert len(picked) == len(LONG)
    assert len({c.id for c in picked}) == len(LONG)


def test_spread_reads_each_source_in_order():
    ordinals = [(c.source_id, c.ordinal) for c in spread(LONG, 8)]
    assert ordinals == sorted(ordinals)


def test_spread_of_nothing_is_nothing():
    assert spread([], 5) == []
