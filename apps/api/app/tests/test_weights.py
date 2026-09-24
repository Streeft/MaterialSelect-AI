"""The weight budget of a ranking (D-87): total against the limit of 1, each
row's share and issue, and the one suggestion that closes the total exactly."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.weights import (
    INDEX_KEY,
    WEIGHT_LIMIT,
    WeightEntry,
    split_exactly,
    weight_budget,
)


def budget(weights, keys=None, known=None, index_available=True):
    keys = keys if keys is not None else [f"p{i}" for i in range(len(weights))]
    known = known if known is not None else {k for k in keys if k}
    return weight_budget(
        [WeightEntry(key=k, weight=w) for k, w in zip(keys, weights, strict=True)],
        set(known),
        index_available,
    )


def test_no_criteria_is_empty_and_may_run():
    # A run without a ranking is allowed; the gate is about closing the total.
    b = budget([])
    assert b.status == "empty"
    assert b.can_run is True
    assert b.suggestion is None
    assert b.limit == 1.0


def test_a_single_weight_of_one_is_complete():
    b = budget([1.0])
    assert b.status == "complete"
    assert b.can_run is True
    assert b.rows[0].share_percent == pytest.approx(100.0)


def test_missing_amount_is_stated():
    b = budget([0.5, 0.3])
    assert b.status == "incomplete"
    assert b.remaining == pytest.approx(0.2)
    assert b.excess == 0.0
    assert b.can_run is False


def test_decimal_arithmetic_closes_what_the_reader_typed():
    # 0.1 + 0.2 + 0.7 is 0.9999999999999999 in binary floating point.
    b = budget([0.1, 0.2, 0.7])
    assert b.total == 1.0
    assert b.status == "complete"
    assert b.remaining == 0.0


def test_excess_is_stated_and_blocks():
    b = budget([0.6, 0.55])
    assert b.status == "exceeds"
    assert b.excess == pytest.approx(0.15)
    assert b.remaining == 0.0
    assert b.can_run is False


def test_shares_are_the_renormalized_weights():
    b = budget([0.3, 0.1])
    assert [r.share for r in b.rows] == [pytest.approx(0.75), pytest.approx(0.25)]


def test_blank_weight_is_not_zero():
    # D-24: absence has its own state, and it carries no share.
    b = budget([0.5, None])
    assert b.rows[1].issue == "missing_weight"
    assert b.rows[1].share is None
    assert b.total == 0.5


@pytest.mark.parametrize(("weight", "issue"), [(0.0, "zero"), (-0.2, "negative")])
def test_zero_and_negative_weights_are_named_and_do_not_count(weight, issue):
    b = budget([1.0, weight])
    assert b.rows[1].issue == issue
    assert b.total == 1.0
    assert b.status == "incomplete"
    assert b.can_run is False


def test_ahp_rounding_is_inside_the_tolerance():
    assert budget([0.3333, 0.3333, 0.3333]).status == "complete"  # 0.9999
    assert budget([0.5001, 0.5]).status == "complete"  # 1.0001


def test_outside_the_tolerance_is_not_complete():
    assert budget([0.998]).status == "incomplete"
    assert budget([1.002]).status == "exceeds"


def test_key_issues():
    b = budget(
        [0.2, 0.2, 0.2, 0.2, 0.2],
        keys=["densidade", "", "densidade", "fantasma", INDEX_KEY],
        known={"densidade"},
        index_available=False,
    )
    assert [r.issue for r in b.rows] == [
        None,
        "missing_key",
        "duplicate_key",
        "unknown_key",
        "index_missing",
    ]
    # The total closes, but a row is unsound: the gate stays shut.
    assert b.status == "complete"
    assert b.can_run is False


def test_index_row_is_sound_when_the_study_has_an_index():
    b = budget([1.0], keys=[INDEX_KEY], known=set(), index_available=True)
    assert b.rows[0].issue is None
    assert b.can_run is True


# --- suggestions ------------------------------------------------------------


def test_blank_rows_share_what_is_left_and_typed_weights_stay():
    b = budget([0.5, None, None])
    assert b.suggestion is not None
    assert b.suggestion.kind == "fill_blanks"
    assert b.suggestion.weights == [0.5, 0.25, 0.25]


def test_three_blanks_split_as_033_033_034():
    b = budget([None, None, None])
    assert b.suggestion.kind == "fill_blanks"
    assert b.suggestion.weights == [0.33, 0.33, 0.34]


def test_what_is_left_is_spread_equally():
    b = budget([0.5, 0.3])
    assert b.suggestion.kind == "spread_remaining"
    assert b.suggestion.weights == [0.6, 0.4]


def test_a_legacy_study_saved_as_1_1_1_scales_to_the_limit():
    b = budget([1.0, 1.0, 1.0])
    assert b.status == "exceeds"
    assert b.suggestion.kind == "scale_to_limit"
    assert b.suggestion.weights == [0.33, 0.33, 0.34]


def test_scaling_keeps_the_proportion():
    b = budget([2.0, 1.0, 1.0])
    assert b.suggestion.weights == [0.5, 0.25, 0.25]


def test_blanks_with_no_room_left_split_everything_equally():
    b = budget([1.0, None])
    assert b.suggestion.kind == "split_equally"
    assert b.suggestion.weights == [0.5, 0.5]


def test_ahp_digits_survive_a_suggestion():
    b = budget([0.1234, None])
    assert b.suggestion.weights == [0.1234, 0.8766]


def test_complete_budget_has_no_suggestion():
    assert budget([0.4, 0.6]).suggestion is None


@pytest.mark.parametrize("n", range(1, 13))
def test_every_suggestion_sums_to_exactly_one(n):
    for weights in ([None] * n, [1.0] * n, [0.01] * n):
        b = budget(weights)
        if b.suggestion is None:
            continue
        total = sum((Decimal(repr(w)) for w in b.suggestion.weights), Decimal(0))
        assert total == WEIGHT_LIMIT, (weights, b.suggestion)
        assert all(w > 0 for w in b.suggestion.weights)


@pytest.mark.parametrize("n", range(1, 13))
def test_split_exactly_differs_by_at_most_one_quantum(n):
    parts = split_exactly([WEIGHT_LIMIT / n] * n, 2)
    assert sum(parts, Decimal(0)) == WEIGHT_LIMIT
    assert max(parts) - min(parts) <= Decimal("0.01")
    # The rounding lands on the last rows, where a reader looks for it.
    assert parts == sorted(parts)
