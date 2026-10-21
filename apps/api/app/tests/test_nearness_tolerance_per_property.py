"""Per-property tolerance in Find Similar (D-158), domain side."""

from __future__ import annotations

import math

import pytest

from app.domain.errors import ValidationError
from app.domain.nearness import (
    MAX_TOLERANCE_PCT,
    ToleranceBand,
    find_similar,
    resolve_tolerances,
)

BASIS = ["densidade", "modulo_young"]
RATIO = {"densidade": True, "modulo_young": True}
LOG = {"densidade": True, "modulo_young": True}

#: Reference A = (100, 100). B is 5% off on density and 30% off on modulus.
POOL = [
    (1, "A", {"densidade": 100.0, "modulo_young": 100.0}),
    (2, "B", {"densidade": 105.0, "modulo_young": 130.0}),
    (3, "C", {"densidade": 120.0, "modulo_young": 100.0}),
    (4, "F", {"densidade": 100.0, "modulo_young": None}),
]


def _run(**kwargs):
    return find_similar(1, POOL, BASIS, log_scale=LOG, ratio_scale=RATIO, **kwargs)


def _by_name(result):
    return {n.name: n for n in result.neighbours}


def test_without_either_tolerance_nothing_changes() -> None:
    plain = find_similar(1, POOL, BASIS, log_scale=LOG)
    same = _run(tolerances={})
    assert [(n.name, n.distance, n.contributions) for n in plain.neighbours] == [
        (n.name, n.distance, n.contributions) for n in same.neighbours
    ]
    assert same.tolerance_by_property == {}
    assert same.tolerance_bands == {}
    assert same.tolerance_not_applicable == []


def test_per_property_overrides_the_global_only_there() -> None:
    result = _run(tolerance_pct=10, tolerances={"modulo_young": 40})
    assert result.tolerance_by_property == {"densidade": 10.0, "modulo_young": 40.0}
    assert result.tolerance_bands["densidade"] == ToleranceBand(low=90.0, high=110.0)
    assert result.tolerance_bands["modulo_young"] == ToleranceBand(low=60.0, high=140.0)
    assert _by_name(result)["B"].within_tolerance == BASIS


def test_global_alone_matches_the_d155_answer() -> None:
    """Writing the global value per property asks the same question."""
    global_only = _run(tolerance_pct=10)
    spelled_out = _run(tolerances={"densidade": 10, "modulo_young": 10})
    assert [(n.name, n.distance, n.within_tolerance) for n in global_only.neighbours] == [
        (n.name, n.distance, n.within_tolerance) for n in spelled_out.neighbours
    ]
    assert global_only.tolerance_bands == spelled_out.tolerance_bands


def test_a_property_with_neither_gets_no_band_and_full_difference() -> None:
    plain = _by_name(find_similar(1, POOL, BASIS, log_scale=LOG))
    result = _run(tolerances={"densidade": 10})
    assert list(result.tolerance_by_property) == ["densidade"]
    assert "modulo_young" not in result.tolerance_bands
    # Not asked is not "inapplicable": the reader never said a percentage here.
    assert result.tolerance_not_applicable == []
    b = _by_name(result)["B"]
    assert b.within_tolerance == ["densidade"]
    assert b.contributions["densidade"] == 0.0
    assert b.contributions["modulo_young"] == plain["B"].contributions["modulo_young"]


def test_per_property_band_on_a_scale_without_true_zero_is_not_applicable() -> None:
    result = find_similar(
        1,
        POOL,
        BASIS,
        log_scale=LOG,
        ratio_scale={"densidade": True, "modulo_young": False},
        tolerances={"modulo_young": 50},
    )
    assert result.tolerance_not_applicable == ["modulo_young"]
    assert result.tolerance_bands == {}
    assert result.tolerance_by_property == {"modulo_young": 50.0}
    assert all(n.within_tolerance == [] for n in result.neighbours)


def test_a_missing_value_is_never_inside_a_per_property_band() -> None:
    result = _run(tolerances={"modulo_young": MAX_TOLERANCE_PCT})
    assert "F" not in _by_name(result)
    assert [(e.name, e.missing_keys) for e in result.excluded] == [("F", ["modulo_young"])]


def test_a_wider_per_property_band_never_moves_a_record_away() -> None:
    narrow = _by_name(_run(tolerance_pct=5, tolerances={"modulo_young": 10}))
    wide = _by_name(_run(tolerance_pct=5, tolerances={"modulo_young": 50}))
    for name, neighbour in narrow.items():
        assert wide[name].distance <= neighbour.distance


def test_resolution_follows_basis_order() -> None:
    resolved = resolve_tolerances(BASIS, 5.0, {"modulo_young": 20, "densidade": 1})
    assert list(resolved) == BASIS
    assert resolved == {"densidade": 1.0, "modulo_young": 20.0}


def test_a_slug_outside_the_basis_is_refused() -> None:
    with pytest.raises(ValidationError, match="fora da busca: resistividade"):
        _run(tolerances={"resistividade": 10})


@pytest.mark.parametrize("value", [0, -1, MAX_TOLERANCE_PCT + 0.5, math.inf, math.nan])
def test_an_invalid_per_property_value_is_refused_by_name(value: float) -> None:
    with pytest.raises(ValidationError, match="tolerância de densidade"):
        _run(tolerances={"densidade": value})
