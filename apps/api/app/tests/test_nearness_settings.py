"""Nearness settings: weight and one-sided criterion per property (D-122)."""

from __future__ import annotations

import math

import pytest

from app.domain.errors import ValidationError
from app.domain.nearness import find_similar, one_sided_difference, resolve_settings

BASIS = ["densidade", "modulo_young"]

#: Reference A. B is lighter and stiffer; C is heavier and less stiff, by the
#: same amounts in the opposite direction. D lacks the modulus.
POOL = [
    (1, "A", {"densidade": 100.0, "modulo_young": 100.0}),
    (2, "B", {"densidade": 50.0, "modulo_young": 200.0}),
    (3, "C", {"densidade": 200.0, "modulo_young": 50.0}),
    (4, "D", {"densidade": 100.0, "modulo_young": None}),
    (5, "E", {"densidade": 100.0, "modulo_young": 400.0}),
]
LOG = {"densidade": True, "modulo_young": True}


def _by_name(result):
    return {n.name: n for n in result.neighbours}


def test_default_settings_reproduce_the_unweighted_distance() -> None:
    plain = find_similar(1, POOL, BASIS, log_scale=LOG)
    explicit = find_similar(
        1,
        POOL,
        BASIS,
        log_scale=LOG,
        weights={"densidade": 1.0, "modulo_young": 1.0},
        criteria={"densidade": "both", "modulo_young": "both"},
    )
    assert [(n.name, n.distance) for n in plain.neighbours] == [
        (n.name, n.distance) for n in explicit.neighbours
    ]
    assert plain.weights == {"densidade": 1.0, "modulo_young": 1.0}
    assert plain.criteria == {"densidade": "both", "modulo_young": "both"}


def test_at_most_does_not_penalise_a_lower_value() -> None:
    """'100% se igual ou menor': B is lighter, so density costs it nothing."""
    result = find_similar(1, POOL, BASIS, log_scale=LOG, criteria={"densidade": "at_most"})
    b = _by_name(result)["B"]
    c = _by_name(result)["C"]
    assert b.contributions["densidade"] == 0.0
    assert "densidade" in b.satisfied
    assert c.contributions["densidade"] > 0
    assert "densidade" not in c.satisfied


def test_at_least_does_not_penalise_a_higher_value() -> None:
    result = find_similar(1, POOL, BASIS, log_scale=LOG, criteria={"modulo_young": "at_least"})
    assert _by_name(result)["B"].contributions["modulo_young"] == 0.0
    assert _by_name(result)["C"].contributions["modulo_young"] > 0


def test_one_sided_keeps_the_full_difference_on_the_wrong_side() -> None:
    both = find_similar(1, POOL, BASIS, log_scale=LOG)
    one = find_similar(1, POOL, BASIS, log_scale=LOG, criteria={"densidade": "at_most"})
    assert math.isclose(
        _by_name(both)["C"].contributions["densidade"],
        _by_name(one)["C"].contributions["densidade"],
    )


def test_equal_value_is_not_reported_as_satisfied() -> None:
    """Equality is 100% under any criterion; ``satisfied`` names only absorbed differences."""
    result = find_similar(1, POOL, BASIS, log_scale=LOG, criteria={"densidade": "at_most"})
    assert "densidade" not in _by_name(result)["E"].satisfied


def test_weight_two_changes_the_order_and_contributions_explain_it() -> None:
    # Pool where X is close on density, far on modulus; Y the reverse.
    pool = [
        (1, "R", {"densidade": 100.0, "modulo_young": 100.0}),
        (2, "X", {"densidade": 110.0, "modulo_young": 300.0}),
        (3, "Y", {"densidade": 250.0, "modulo_young": 110.0}),
    ]
    base = find_similar(1, pool, BASIS)
    weighted = find_similar(1, pool, BASIS, weights={"densidade": 3.0})
    assert [n.name for n in base.neighbours][0] != [n.name for n in weighted.neighbours][0]
    for neighbour in weighted.neighbours:
        expected = math.sqrt(sum(neighbour.contributions.values()) / 4.0)
        assert math.isclose(neighbour.distance, expected)


def test_raising_a_weight_never_brings_a_record_closer() -> None:
    """Monotonic: more weight on a property with a nonzero difference never shrinks
    that property's share of the distance."""
    shares = []
    for weight in (0.5, 1.0, 2.0, 5.0):
        result = find_similar(1, POOL, BASIS, log_scale=LOG, weights={"densidade": weight})
        c = _by_name(result)["C"]
        shares.append(c.contributions["densidade"] / sum(c.contributions.values()))
    assert shares == sorted(shares)
    assert shares[0] < shares[-1]


def test_a_missing_value_is_excluded_before_any_criterion() -> None:
    """No criterion turns absence into '100%' (principle 3)."""
    result = find_similar(
        1,
        POOL,
        BASIS,
        log_scale=LOG,
        criteria={"modulo_young": "at_most"},
        weights={"modulo_young": 10.0},
    )
    assert [e.name for e in result.excluded] == ["D"]
    assert "D" not in _by_name(result)


@pytest.mark.parametrize("weight", [0.0, -1.0, 10.5, math.inf, math.nan])
def test_invalid_weights_are_refused(weight: float) -> None:
    with pytest.raises(ValidationError):
        find_similar(1, POOL, BASIS, weights={"densidade": weight})


def test_settings_outside_the_basis_are_refused() -> None:
    with pytest.raises(ValidationError):
        resolve_settings(["densidade"], {"modulo_young": 2.0}, None)
    with pytest.raises(ValidationError):
        resolve_settings(["densidade"], None, {"modulo_young": "at_most"})


def test_unknown_criterion_is_refused() -> None:
    with pytest.raises(ValidationError):
        resolve_settings(["densidade"], None, {"densidade": "nearly"})


@pytest.mark.parametrize(
    ("difference", "criterion", "expected"),
    [
        (-1.0, "at_most", 0.0),
        (1.0, "at_most", 1.0),
        (1.0, "at_least", 0.0),
        (-1.0, "at_least", -1.0),
        (-1.0, "both", -1.0),
        (0.0, "at_most", 0.0),
    ],
)
def test_one_sided_difference(difference: float, criterion: str, expected: float) -> None:
    assert one_sided_difference(difference, criterion) == expected  # type: ignore[arg-type]
