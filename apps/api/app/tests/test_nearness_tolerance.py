"""Nearness tolerance: "100% se dentro de ±x%" (D-152)."""

from __future__ import annotations

import math

import pytest

from app.domain.errors import ValidationError
from app.domain.nearness import (
    MAX_TOLERANCE_PCT,
    ToleranceBand,
    find_similar,
    is_within,
    tolerance_band,
    validate_tolerance,
)

BASIS = ["densidade", "modulo_young"]
RATIO = {"densidade": True, "modulo_young": True}
LOG = {"densidade": True, "modulo_young": True}

#: Reference A = (100, 100). With ±10%: B sits exactly on both upper edges,
#: C exactly on both lower edges, D just outside on density, E far on modulus,
#: F lacks the modulus.
POOL = [
    (1, "A", {"densidade": 100.0, "modulo_young": 100.0}),
    (2, "B", {"densidade": 110.0, "modulo_young": 110.0}),
    (3, "C", {"densidade": 90.0, "modulo_young": 90.0}),
    (4, "D", {"densidade": 110.01, "modulo_young": 100.0}),
    (5, "E", {"densidade": 100.0, "modulo_young": 400.0}),
    (6, "F", {"densidade": 100.0, "modulo_young": None}),
]


def _by_name(result):
    return {n.name: n for n in result.neighbours}


def _run(**kwargs):
    return find_similar(1, POOL, BASIS, log_scale=LOG, ratio_scale=RATIO, **kwargs)


def test_without_tolerance_nothing_changes() -> None:
    plain = find_similar(1, POOL, BASIS, log_scale=LOG)
    same = _run()
    assert [(n.name, n.distance) for n in plain.neighbours] == [
        (n.name, n.distance) for n in same.neighbours
    ]
    assert same.tolerance_pct is None
    assert same.tolerance_bands == {}
    assert all(n.within_tolerance == [] for n in same.neighbours)


def test_band_edges_are_inclusive() -> None:
    result = _run(tolerance_pct=10)
    by_name = _by_name(result)
    assert by_name["B"].within_tolerance == BASIS
    assert by_name["C"].within_tolerance == BASIS
    assert by_name["D"].within_tolerance == ["modulo_young"]
    assert result.tolerance_bands["densidade"] == ToleranceBand(low=90.0, high=110.0)


def test_inside_the_band_counts_as_identical() -> None:
    """'100%': the property contributes nothing, as the D-120 accepted side."""
    by_name = _by_name(_run(tolerance_pct=10))
    assert by_name["B"].distance == 0.0
    assert by_name["B"].contributions == {"densidade": 0.0, "modulo_young": 0.0}


def test_outside_the_band_keeps_the_full_difference() -> None:
    plain = _by_name(find_similar(1, POOL, BASIS, log_scale=LOG))
    banded = _by_name(_run(tolerance_pct=10))
    # E is outside on modulus: that share is not softened by the band's width.
    assert banded["E"].contributions["modulo_young"] == plain["E"].contributions["modulo_young"]
    assert banded["D"].contributions["densidade"] == plain["D"].contributions["densidade"]


def test_a_missing_value_is_never_inside_a_band() -> None:
    result = _run(tolerance_pct=100)
    assert "F" not in _by_name(result)
    assert [(e.name, e.missing_keys) for e in result.excluded] == [("F", ["modulo_young"])]


def test_no_band_on_a_scale_without_a_true_zero() -> None:
    result = find_similar(
        1,
        POOL,
        BASIS,
        log_scale=LOG,
        ratio_scale={"densidade": True, "modulo_young": False},
        tolerance_pct=10,
    )
    assert result.tolerance_not_applicable == ["modulo_young"]
    assert "modulo_young" not in result.tolerance_bands
    assert _by_name(result)["B"].within_tolerance == ["densidade"]


def test_an_unknown_scale_gets_no_band() -> None:
    """Nobody said it is a ratio scale: the conservative answer invents nothing."""
    result = find_similar(1, POOL, BASIS, log_scale=LOG, tolerance_pct=10)
    assert result.tolerance_not_applicable == BASIS
    assert all(n.within_tolerance == [] for n in result.neighbours)


def test_a_wider_band_never_moves_a_record_away() -> None:
    narrow = _by_name(_run(tolerance_pct=5))
    wide = _by_name(_run(tolerance_pct=50))
    for name, neighbour in narrow.items():
        assert wide[name].distance <= neighbour.distance
        assert set(neighbour.within_tolerance) <= set(wide[name].within_tolerance)


def test_tolerance_is_deterministic() -> None:
    first = _run(tolerance_pct=10)
    second = _run(tolerance_pct=10)
    assert [(n.name, n.distance, n.within_tolerance) for n in first.neighbours] == [
        (n.name, n.distance, n.within_tolerance) for n in second.neighbours
    ]


def test_bands_are_stated_even_when_nobody_compares() -> None:
    pool = [POOL[0], POOL[5]]
    result = find_similar(1, pool, BASIS, log_scale=LOG, ratio_scale=RATIO, tolerance_pct=10)
    assert result.neighbours == []
    assert set(result.tolerance_bands) == set(BASIS)


@pytest.mark.parametrize("value", [0, -5, MAX_TOLERANCE_PCT + 0.1, math.inf, -math.inf, math.nan])
def test_invalid_tolerance_is_refused(value: float) -> None:
    with pytest.raises(ValidationError):
        validate_tolerance(value)
    with pytest.raises(ValidationError):
        _run(tolerance_pct=value)


def test_the_ceiling_itself_is_accepted() -> None:
    assert validate_tolerance(MAX_TOLERANCE_PCT) == MAX_TOLERANCE_PCT


def test_band_around_a_negative_reference_is_ordered() -> None:
    band = tolerance_band(-200.0, 10)
    assert band == ToleranceBand(low=-220.0, high=-180.0)
    assert is_within(-220.0, band) and is_within(-180.0, band)
    assert not is_within(-179.0, band)


def test_float_rounding_on_the_edge_stays_inside() -> None:
    band = tolerance_band(0.3, 10)  # 0.3 * 10 / 100 is not exact in binary
    assert is_within(0.33, band)
    assert is_within(0.27, band)
