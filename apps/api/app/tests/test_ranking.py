"""Tests for the weighted-normalized-sum ranking domain."""

from __future__ import annotations

import pytest

from app.domain.errors import ValidationError
from app.domain.ranking import Criterion, Direction, Normalization, normalize_column, rank


def _crit(key, direction, weight, label=None):
    return Criterion(key=key, label=label or key, direction=direction, weight=weight)


def test_minmax_ranking_orders_by_weighted_score():
    materials = [
        (1, "A", {"stiffness": 200.0, "cost": 10.0}),
        (2, "B", {"stiffness": 100.0, "cost": 2.0}),
        (3, "C", {"stiffness": 150.0, "cost": 6.0}),
    ]
    criteria = [
        _crit("stiffness", Direction.MAX, 1.0),
        _crit("cost", Direction.MIN, 1.0),
    ]
    result = rank(materials, criteria, Normalization.MINMAX, run_sensitivity=False)
    # A: max stiffness (1.0) but max cost (0.0) -> 0.5
    # B: min stiffness (0.0) but min cost (1.0) -> 0.5
    # C: mid on both (0.5, 0.5) -> 0.5 ; all tie at 0.5 here
    scores = {r.name: round(r.score, 6) for r in result.ranked}
    assert scores == {"A": 0.5, "B": 0.5, "C": 0.5}


def test_weights_change_ranking():
    materials = [
        (1, "A", {"stiffness": 200.0, "cost": 10.0}),
        (2, "B", {"stiffness": 100.0, "cost": 2.0}),
    ]
    criteria = [_crit("stiffness", Direction.MAX, 3.0), _crit("cost", Direction.MIN, 1.0)]
    result = rank(materials, criteria, run_sensitivity=False)
    assert result.ranked[0].name == "A"  # stiffness dominates


def test_contributions_sum_to_score():
    materials = [(1, "A", {"x": 5.0}), (2, "B", {"x": 1.0})]
    result = rank([*materials], [_crit("x", Direction.MAX, 2.0)], run_sensitivity=False)
    for r in result.ranked:
        assert r.score == pytest.approx(sum(c.contribution for c in r.contributions))


def test_missing_data_excludes_material_not_zero_filled():
    materials = [
        (1, "A", {"x": 5.0, "y": 1.0}),
        (2, "B", {"x": 3.0, "y": None}),  # missing y
    ]
    result = rank(
        materials,
        [_crit("x", Direction.MAX, 1.0), _crit("y", Direction.MAX, 1.0)],
        run_sensitivity=False,
    )
    assert [r.name for r in result.ranked] == ["A"]
    assert len(result.excluded) == 1
    assert result.excluded[0].name == "B"
    assert result.excluded[0].missing_keys == ["y"]


def test_zero_total_weight_raises():
    with pytest.raises(ValidationError):
        rank([(1, "A", {"x": 1.0})], [_crit("x", Direction.MAX, 0.0)])


def test_no_criteria_raises():
    with pytest.raises(ValidationError):
        rank([(1, "A", {"x": 1.0})], [])


def test_weights_are_renormalized():
    materials = [(1, "A", {"x": 10.0}), (2, "B", {"x": 0.0})]
    result = rank(materials, [_crit("x", Direction.MAX, 5.0)], run_sensitivity=False)
    # single criterion -> weight renormalizes to 1.0; best gets score 1.0
    assert result.ranked[0].score == pytest.approx(1.0)
    assert result.ranked[0].contributions[0].weight == pytest.approx(1.0)


def test_sensitivity_reports_scenarios():
    materials = [
        (1, "A", {"stiffness": 200.0, "cost": 10.0}),
        (2, "B", {"stiffness": 100.0, "cost": 2.0}),
    ]
    criteria = [_crit("stiffness", Direction.MAX, 1.0), _crit("cost", Direction.MIN, 1.0)]
    result = rank(materials, criteria, run_sensitivity=True)
    assert len(result.sensitivity) >= 1
    descriptions = [s.description for s in result.sensitivity]
    assert "Pesos iguais" in descriptions


def test_ties_share_rank():
    materials = [(1, "A", {"x": 5.0}), (2, "B", {"x": 5.0})]
    result = rank(materials, [_crit("x", Direction.MAX, 1.0)], run_sensitivity=False)
    assert result.ranked[0].rank == result.ranked[1].rank == 1


# The Euclidean norm computed as sum(v*v) ** 0.5 overflows to +inf long before
# any single value does: squaring reaches the float ceiling at ~1e154, while the
# values themselves only reach it at ~1e308. Dividing by inf gives 0.0 for every
# material, so the column stops distinguishing anything and the ranking silently
# ties — no exception, no warning, a wrong answer. A performance index is a
# product of powers of properties (E**(1/2)/rho and friends), which is exactly
# how a column of ordinary numbers turns into 1e200.
def test_vector_normalisation_survives_huge_values():
    scaled = normalize_column([1e200, 2e200, 3e200], Direction.MAX, Normalization.VECTOR)
    plain = normalize_column([1.0, 2.0, 3.0], Direction.MAX, Normalization.VECTOR)
    # Scale-invariance is the defining property of the Euclidean norm; the two
    # columns describe the same materials in different units.
    assert scaled == pytest.approx(plain)
    assert scaled[0] < scaled[1] < scaled[2]


def test_vector_normalisation_all_zero_column_is_a_tie():
    assert normalize_column([0.0, 0.0], Direction.MAX, Normalization.VECTOR) == [1.0, 1.0]
