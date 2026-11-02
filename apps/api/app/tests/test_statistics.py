"""Unit tests for the panel's descriptive statistics.

Two things are being pinned here, and only one of them is arithmetic. The other
is the project's third principle expressed as a return type: nothing in this
module is allowed to turn an absence into a number.
"""

from __future__ import annotations

import pytest

from app.calculations.statistics import (
    MAX_BINS,
    MIN_BINS,
    FiveNumber,
    average_ranks,
    bin_count,
    five_number_summary,
    histogram,
    mean,
    pearson,
    quantile,
    share,
    spearman,
)


class TestQuantileUsesTheDocumentedDefinition:
    """Type 7 — linear interpolation between order statistics.

    Pinned with hand-computed values because there are nine quantile definitions
    in common use and they disagree precisely on the small samples this
    catalogue is made of. If someone swaps the implementation for one that
    rounds to the nearest order statistic, these numbers move.
    """

    def test_interpolates_between_neighbours(self) -> None:
        values = [1.0, 2.0, 3.0, 4.0]
        assert quantile(values, 0.25) == 1.75
        assert quantile(values, 0.5) == 2.5
        assert quantile(values, 0.75) == 3.25

    def test_lands_exactly_on_an_order_statistic_when_it_can(self) -> None:
        values = [1.0, 2.0, 3.0, 4.0, 5.0]
        assert quantile(values, 0.25) == 2.0
        assert quantile(values, 0.5) == 3.0
        assert quantile(values, 0.75) == 4.0

    def test_a_single_value_is_every_quantile_of_itself(self) -> None:
        assert quantile([7.5], 0.0) == 7.5
        assert quantile([7.5], 0.5) == 7.5
        assert quantile([7.5], 1.0) == 7.5

    def test_the_extremes_are_the_extremes(self) -> None:
        values = [2.0, 4.0, 8.0, 16.0]
        assert quantile(values, 0.0) == 2.0
        assert quantile(values, 1.0) == 16.0

    def test_an_empty_sequence_has_no_quantile(self) -> None:
        with pytest.raises(ValueError, match="vazia"):
            quantile([], 0.5)

    @pytest.mark.parametrize("q", [-0.01, 1.01, 2.0])
    def test_a_quantile_outside_zero_to_one_is_refused(self, q: float) -> None:
        with pytest.raises(ValueError, match="fora de"):
            quantile([1.0, 2.0], q)


class TestTheFiveNumberSummary:
    def test_summarises_and_counts(self) -> None:
        summary = five_number_summary([4.0, 1.0, 3.0, 2.0])
        assert summary == FiveNumber(
            count=4, minimum=1.0, q1=1.75, median=2.5, q3=3.25, maximum=4.0
        )

    def test_sorts_its_own_input(self) -> None:
        # The repository returns rows in whatever order the join produced. A
        # summary that assumed sorted input would be wrong without ever failing.
        scrambled = five_number_summary([16.0, 2.0, 8.0, 4.0])
        ordered = five_number_summary([2.0, 4.0, 8.0, 16.0])
        assert scrambled == ordered

    def test_one_material_still_makes_a_box(self) -> None:
        summary = five_number_summary([9.0])
        assert summary is not None
        assert summary.count == 1
        assert summary.minimum == summary.median == summary.maximum == 9.0

    def test_nothing_to_summarise_is_none_and_not_zeros(self) -> None:
        # The whole point. A class with no data for a property has no minimum;
        # writing 0 there would put it at the bottom of every axis as though it
        # had been measured and found to be nothing.
        assert five_number_summary([]) is None


class TestShareRefusesToInventAPercentage:
    def test_computes_and_rounds_to_one_decimal(self) -> None:
        assert share(1, 4) == 25.0
        assert share(1, 3) == 33.3
        assert share(2, 3) == 66.7

    def test_all_and_nothing(self) -> None:
        assert share(5, 5) == 100.0
        assert share(0, 5) == 0.0

    def test_a_share_of_nothing_is_none_and_not_zero_percent(self) -> None:
        # An empty catalogue has no coverage — it is not 0% covered. "0%" reads
        # as a verdict on data that does not exist.
        assert share(0, 0) is None

    @pytest.mark.parametrize(("part", "whole"), [(-1, 5), (1, -5)])
    def test_negative_counts_are_a_bug_not_a_percentage(self, part: int, whole: int) -> None:
        with pytest.raises(ValueError, match="negativa"):
            share(part, whole)

    def test_a_part_larger_than_the_whole_means_something_was_counted_twice(self) -> None:
        with pytest.raises(ValueError, match="maior que o todo"):
            share(6, 5)


# --- D-193: histogram, mean, rank correlation --------------------------------


class TestHistogram:
    def test_nothing_to_count_is_none(self) -> None:
        assert histogram([]) is None

    def test_single_distinct_value_is_one_bin(self) -> None:
        h = histogram([3.0, 3.0, 3.0])
        assert h is not None
        assert len(h.bins) == 1
        assert h.bins[0].count == 3

    def test_counts_add_up_and_edges_cover_the_range(self) -> None:
        values = [float(v) for v in range(1, 101)]
        h = histogram(values)
        assert h is not None
        assert sum(b.count for b in h.bins) == 100
        assert h.bins[0].lower == 1.0
        assert h.bins[-1].upper == 100.0
        assert MIN_BINS <= len(h.bins) <= MAX_BINS
        # Contiguous: each bin starts where the previous ended.
        for left, right in zip(h.bins, h.bins[1:], strict=False):
            assert left.upper == pytest.approx(right.lower)

    def test_log_bins_are_equal_in_log10(self) -> None:
        values = [1.0, 10.0, 100.0, 1000.0, 10000.0, 100000.0]
        h = histogram(values, log=True)
        assert h is not None and h.log
        ratios = {round(b.upper / b.lower, 6) for b in h.bins}
        assert len(ratios) == 1

    def test_log_falls_back_to_linear_with_non_positive_values(self) -> None:
        h = histogram([-1.0, 0.0, 5.0, 10.0, 20.0], log=True)
        assert h is not None and not h.log

    def test_bin_count_is_clamped(self) -> None:
        assert bin_count([1.0, 2.0]) == MIN_BINS
        assert bin_count([float(v) for v in range(100000)]) == MAX_BINS


class TestMean:
    def test_mean_of_nothing_is_none(self) -> None:
        assert mean([]) is None

    def test_mean(self) -> None:
        assert mean([1.0, 2.0, 3.0, 6.0]) == 3.0


class TestRankCorrelation:
    def test_ties_share_the_average_rank(self) -> None:
        assert average_ranks([10.0, 20.0, 20.0, 5.0]) == [2.0, 3.5, 3.5, 1.0]

    def test_spearman_hand_worked(self) -> None:
        # ranks (3,5,1,4,2) vs (2,4,1,5,3): Σd² = 4 -> 1 - 24/120 = 0,8.
        xs = [2700.0, 7850.0, 1050.0, 3900.0, 1600.0]
        ys = [69.0, 210.0, 2.5, 380.0, 120.0]
        assert spearman(xs, ys) == pytest.approx(0.8)

    def test_monotone_but_nonlinear_is_one(self) -> None:
        xs = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]
        assert spearman(xs, [x**5 for x in xs]) == pytest.approx(1.0)
        assert spearman(xs, [-(x**3) for x in xs]) == pytest.approx(-1.0)

    def test_too_few_pairs_or_no_variance_is_none(self) -> None:
        assert spearman([1.0, 2.0, 3.0], [3.0, 2.0, 1.0]) is None
        assert spearman([1.0] * 6, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0]) is None
        assert pearson([1.0, 1.0], [2.0, 3.0]) is None

    def test_lengths_must_match(self) -> None:
        with pytest.raises(ValueError):
            spearman([1.0], [1.0, 2.0])
