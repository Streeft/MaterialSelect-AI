"""Find Similar: the distance, and the basis it is honest about (P2)."""

from __future__ import annotations

import math

import pytest

from app.domain.errors import ValidationError
from app.domain.nearness import find_similar

#: A pool where the answer is arguable by hand: B is nearest to A on density,
#: C is far on both, D lacks the modulus entirely.
POOL = [
    (1, "A", {"densidade": 1000.0, "modulo_young": 100.0}),
    (2, "B", {"densidade": 1100.0, "modulo_young": 110.0}),
    (3, "C", {"densidade": 9000.0, "modulo_young": 900.0}),
    (4, "D", {"densidade": 1050.0, "modulo_young": None}),
]


def test_the_nearest_record_comes_first() -> None:
    result = find_similar(1, POOL, ["densidade", "modulo_young"])

    assert [n.name for n in result.neighbours] == ["B", "C"]
    assert result.neighbours[0].rank == 1


def test_a_record_missing_a_basis_property_is_excluded_and_named() -> None:
    """Not compared on what it does have, and not silently absent either.

    The same contract ``ranking.py`` already keeps: the reader sees the shorter
    list *and* the reason it is shorter.
    """
    result = find_similar(1, POOL, ["densidade", "modulo_young"])

    assert [e.name for e in result.excluded] == ["D"]
    assert result.excluded[0].missing_keys == ["modulo_young"]
    assert "D" not in [n.name for n in result.neighbours]


def test_the_same_record_is_comparable_on_a_narrower_basis() -> None:
    """Which is the point of the basis being the question, not the catalogue:
    D has a density, so a density-only question can answer for it."""
    result = find_similar(1, POOL, ["densidade"])

    assert result.excluded == []
    assert "D" in [n.name for n in result.neighbours]


def test_the_reference_is_never_its_own_neighbour() -> None:
    """Distance zero from itself is not an answer to "what else is like this"."""
    result = find_similar(1, POOL, ["densidade"])

    assert 1 not in [n.record_id for n in result.neighbours]


def test_the_basis_is_reported_in_the_order_it_was_asked() -> None:
    result = find_similar(1, POOL, ["modulo_young", "densidade"])

    assert result.basis == ["modulo_young", "densidade"]


def test_distance_is_measured_in_log_space_when_the_property_allows_it() -> None:
    """The decisive case, and the reason the flag exists.

    On a linear axis, a property ranging over decades swamps every other one. In
    log space, "twice as dense" is the same distance wherever it happens — which
    is what makes an Ashby map log-log in the first place.
    """
    pool = [
        (1, "ref", {"p": 1.0}),
        (2, "dez vezes", {"p": 10.0}),
        (3, "cem vezes", {"p": 100.0}),
    ]

    linear = find_similar(1, pool, ["p"], log_scale={"p": False})
    logged = find_similar(1, pool, ["p"], log_scale={"p": True})

    # Linear: 10 is nearly as far as 100, because 99 dwarfs 9.
    by_name_linear = {n.name: n.distance for n in linear.neighbours}
    assert by_name_linear["cem vezes"] / by_name_linear["dez vezes"] > 9

    # Log: each decade is one equal step, so 100 is exactly twice as far as 10.
    by_name_log = {n.name: n.distance for n in logged.neighbours}
    assert math.isclose(by_name_log["cem vezes"] / by_name_log["dez vezes"], 2.0, rel_tol=1e-9)


def test_log_space_is_abandoned_for_the_whole_property_and_the_fallback_is_named() -> None:
    """Per property, never per record: two records on different axes are not on
    one axis, and the distance between them would mean nothing."""
    pool = [
        (1, "ref", {"p": 1.0}),
        (2, "zero", {"p": 0.0}),
        (3, "dez", {"p": 10.0}),
    ]

    result = find_similar(1, pool, ["p"], log_scale={"p": True})

    assert result.linear_fallback == ["p"]


def test_a_property_nobody_differs_on_contributes_nothing_and_says_so() -> None:
    """Silently dropping it would leave the documented basis wider than the one
    that ran — the reader would credit the answer with evidence it never used."""
    pool = [
        (1, "ref", {"p": 5.0, "q": 1.0}),
        (2, "outro", {"p": 5.0, "q": 2.0}),
    ]

    result = find_similar(1, pool, ["p", "q"])

    assert result.degenerate == ["p"]
    assert result.neighbours[0].contributions["p"] == 0.0


def test_a_wider_basis_does_not_inflate_the_distance() -> None:
    """The mean and not the sum. Two records identical in one respect and apart
    in another must not read as further away simply for having answered more
    questions."""
    two = find_similar(
        1,
        [(1, "ref", {"a": 0.0, "b": 0.0}), (2, "x", {"a": 1.0, "b": 0.0})],
        ["a", "b"],
    )
    one = find_similar(1, [(1, "ref", {"a": 0.0}), (2, "x", {"a": 1.0})], ["a"])

    # Same disagreement on `a`, and `b` agrees: the wider basis must come out
    # *closer*, never further, because agreement is evidence of similarity.
    assert two.neighbours[0].distance < one.neighbours[0].distance


def test_the_limit_caps_the_answer_without_dropping_the_exclusions() -> None:
    """The excluded list answers "why is this short", so truncating it would
    take away the explanation for the truncation."""
    result = find_similar(1, POOL, ["densidade", "modulo_young"], limit=1)

    assert len(result.neighbours) == 1
    assert len(result.excluded) == 1


def test_ties_break_by_name_so_the_answer_is_reproducible() -> None:
    """Determinism is the claim the whole methodology rests on."""
    pool = [
        (1, "ref", {"p": 0.0}),
        (3, "zebra", {"p": 1.0}),
        (2, "alfa", {"p": 1.0}),
    ]

    result = find_similar(1, pool, ["p"])

    assert [n.name for n in result.neighbours] == ["alfa", "zebra"]


def test_an_empty_basis_is_refused() -> None:
    with pytest.raises(ValidationError):
        find_similar(1, POOL, [])


def test_an_unknown_reference_is_refused() -> None:
    with pytest.raises(ValidationError):
        find_similar(99, POOL, ["densidade"])


def test_a_reference_that_cannot_be_placed_is_refused_with_the_reason() -> None:
    """Not an empty result: if the reference has no modulus, "what is similar in
    modulus" has no meaning, and an empty list would read as "nothing is"."""
    with pytest.raises(ValidationError) as excinfo:
        find_similar(4, POOL, ["densidade", "modulo_young"])

    assert "modulo_young" in str(excinfo.value)


def test_an_empty_pool_answers_nothing_rather_than_failing() -> None:
    result = find_similar(1, [(1, "ref", {"p": 1.0}), (2, "sem p", {"p": None})], ["p"])

    assert result.neighbours == []
    assert [e.name for e in result.excluded] == ["sem p"]
