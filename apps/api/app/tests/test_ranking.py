"""Tests for the weighted-normalized-sum ranking domain."""

from __future__ import annotations

import pytest

from app.domain.errors import ValidationError
from app.domain.ranking import (
    PROMETHEE_TOO_FEW_CANDIDATES,
    Criterion,
    Direction,
    Normalization,
    degrade_promethee_for_few_candidates,
    normalize_column,
    rank,
    rank_promethee,
    rank_topsis,
)


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


def test_topsis_ranks_by_closeness_to_ideal():
    materials = [
        (1, "A", {"rigidez": 200.0, "densidade": 8.0}),
        (2, "B", {"rigidez": 70.0, "densidade": 2.7}),
        (3, "C", {"rigidez": 400.0, "densidade": 19.0}),
    ]
    criteria = [
        _crit("rigidez", Direction.MAX, 1.0),
        _crit("densidade", Direction.MIN, 1.0),
    ]
    result = rank_topsis(materials, criteria, run_sensitivity=False)
    assert len(result.ranked) == 3
    assert result.normalization == "topsis"
    # Every score is the TOPSIS closeness coefficient, always in [0, 1].
    for material in result.ranked:
        assert 0.0 <= material.score <= 1.0
    # Ranks are assigned 1..n with no gaps, best (highest score) first.
    assert [m.rank for m in result.ranked] == sorted(m.rank for m in result.ranked)
    assert result.ranked[0].score >= result.ranked[-1].score


def test_topsis_excludes_missing_data_never_zero():
    materials = [
        (1, "A", {"rigidez": 200.0, "densidade": 8.0}),
        (2, "B", {"rigidez": None, "densidade": 2.7}),
    ]
    criteria = [_crit("rigidez", Direction.MAX, 1.0), _crit("densidade", Direction.MIN, 1.0)]
    result = rank_topsis(materials, criteria, run_sensitivity=False)
    assert len(result.ranked) == 1
    assert len(result.excluded) == 1
    assert result.excluded[0].missing_keys == ["rigidez"]


def test_topsis_identical_materials_tie_at_half():
    # Every material identical on every criterion: ideal best == ideal worst,
    # so the distance-ratio score is undefined by the raw formula — this
    # must resolve to a genuine tie (0.5, per the docstring), not a
    # ZeroDivisionError.
    materials = [(1, "A", {"x": 5.0}), (2, "B", {"x": 5.0})]
    criteria = [_crit("x", Direction.MAX, 1.0)]
    result = rank_topsis(materials, criteria, run_sensitivity=False)
    assert result.ranked[0].score == result.ranked[1].score == 0.5
    assert result.ranked[0].rank == result.ranked[1].rank == 1


def test_topsis_requires_at_least_one_criterion():
    with pytest.raises(ValidationError):
        rank_topsis([(1, "A", {})], [], run_sensitivity=False)


def test_promethee_contributions_sum_to_score():
    materials = [
        (1, "A", {"rigidez": 200.0, "densidade": 8.0}),
        (2, "B", {"rigidez": 70.0, "densidade": 2.7}),
        (3, "C", {"rigidez": 400.0, "densidade": 19.0}),
    ]
    criteria = [
        _crit("rigidez", Direction.MAX, 2.0),
        _crit("densidade", Direction.MIN, 1.0),
    ]
    result = rank_promethee(materials, criteria, run_sensitivity=False)
    assert result.normalization == "promethee"
    for material in result.ranked:
        total_contribution = sum(c.contribution for c in material.contributions)
        assert total_contribution == pytest.approx(material.score, abs=1e-9)
    # Net flow scores sum to (approximately) zero across all materials —
    # a structural property of PROMETHEE II's net flow (every pairwise
    # preference is counted once as +1 for the winner and once as -1 for
    # the loser, so the total cancels).
    assert sum(m.score for m in result.ranked) == pytest.approx(0.0, abs=1e-9)


def test_promethee_direction_min_prefers_lower_value():
    materials = [(1, "Leve", {"densidade": 2.0}), (2, "Pesado", {"densidade": 8.0})]
    criteria = [_crit("densidade", Direction.MIN, 1.0)]
    result = rank_promethee(materials, criteria, run_sensitivity=False)
    assert result.ranked[0].name == "Leve"
    assert result.ranked[0].score > result.ranked[1].score


def test_promethee_requires_at_least_two_materials_with_data():
    materials = [(1, "A", {"x": 5.0})]
    criteria = [_crit("x", Direction.MAX, 1.0)]
    with pytest.raises(ValidationError) as exc_info:
        rank_promethee(materials, criteria, run_sensitivity=False)
    # The exact message is a contract SelectionService relies on to tell this
    # specific, recoverable case apart from any other ValidationError the
    # same call can raise — see PROMETHEE_TOO_FEW_CANDIDATES's own docstring.
    assert str(exc_info.value) == PROMETHEE_TOO_FEW_CANDIDATES


def test_promethee_requires_at_least_one_criterion():
    with pytest.raises(ValidationError):
        rank_promethee([(1, "A", {}), (2, "B", {})], [], run_sensitivity=False)


# Twin of test_topsis_excludes_missing_data_never_zero: the same guarantee,
# for PROMETHEE — a material missing a criterion value is excluded and
# reported, never scored as if the gap were a zero.
def test_promethee_excludes_missing_data_never_zero():
    materials = [
        (1, "A", {"rigidez": 200.0, "densidade": 8.0}),
        (2, "B", {"rigidez": None, "densidade": 2.7}),
        (3, "C", {"rigidez": 400.0, "densidade": 19.0}),
    ]
    criteria = [_crit("rigidez", Direction.MAX, 1.0), _crit("densidade", Direction.MIN, 1.0)]
    result = rank_promethee(materials, criteria, run_sensitivity=False)
    assert len(result.ranked) == 2
    assert len(result.excluded) == 1
    assert result.excluded[0].name == "B"
    assert result.excluded[0].missing_keys == ["rigidez"]


class TestDegradePrometheeForFewCandidates:
    """The service-layer fallback for the case rank_promethee's own
    ValidationError refuses to handle: fewer than two complete candidates.
    See app.services.selection_service._rank for where this is actually
    wired in behind that caught exception.
    """

    def test_zero_complete_candidates_returns_empty_ranking(self):
        materials = [(1, "A", {"x": None})]
        criteria = [_crit("x", Direction.MAX, 1.0)]
        result = degrade_promethee_for_few_candidates(materials, criteria)
        assert result.ranked == []
        assert result.normalization == "promethee"
        # The material is still reported as excluded-for-missing-data, same
        # as every other ranking path — this fallback does not skip that.
        assert len(result.excluded) == 1
        assert result.excluded[0].missing_keys == ["x"]

    def test_one_complete_candidate_gets_a_neutral_score_not_an_invented_one(self):
        materials = [(1, "A", {"x": 5.0})]
        criteria = [_crit("x", Direction.MAX, 2.0)]
        result = degrade_promethee_for_few_candidates(materials, criteria)
        assert len(result.ranked) == 1
        material = result.ranked[0]
        assert material.material_id == 1
        assert material.rank == 1
        # PROMETHEE has no peer to compare this material against — zero, not
        # a fabricated "best possible" score the way weighted_sum's own
        # single-candidate normalization would (that method treats the lone
        # candidate as trivially the best on every criterion; PROMETHEE has
        # no basis to claim that).
        assert material.score == 0.0
        assert len(material.contributions) == 1
        assert material.contributions[0].contribution == 0.0
        assert material.contributions[0].weight == pytest.approx(1.0)

    def test_no_criteria_still_raises(self):
        with pytest.raises(ValidationError):
            degrade_promethee_for_few_candidates([(1, "A", {})], [])
