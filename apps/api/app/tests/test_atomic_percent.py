"""Atomic percent derived from mass percent (TM2-c, D-117).

Pure: the function sees (element, stored row) pairs and the IUPAC table, and
answers either the derived interval of every element or an absence with its
reason — never an estimate, never a renormalized incomplete sum.
"""

from __future__ import annotations

import itertools
import random

import pytest

from app.calculations.atomic_percent import (
    DERIVED_LABEL,
    SUM_TOLERANCE,
    AtomicAbsentReason,
    derive_atomic_percent,
)
from app.domain.atomic_weights import ATOMIC_WEIGHTS, TABLE_VERSION, atomic_weight
from app.domain.composition import EntryFacts
from app.domain.elements import SYMBOLS


def facts(
    low: float | None = None,
    high: float | None = None,
    nominal: float | None = None,
    *,
    balance: bool = False,
    missing: bool = False,
) -> EntryFacts:
    return EntryFacts(
        is_balance=balance,
        is_missing=missing,
        normalized_min=low,
        normalized_max=high,
        normalized_nominal=nominal,
    )


def point(value: float) -> EntryFacts:
    return facts(nominal=value)


def atomic(masses: dict[str, float]) -> dict[str, float]:
    """The textbook formula, written independently of the module under test."""
    moles = {s: w / ATOMIC_WEIGHTS[s] for s, w in masses.items()}
    total = sum(moles.values())
    return {s: 100.0 * m / total for s, m in moles.items()}


class TestTable:
    def test_values_pinned_against_the_iupac_abridged_table(self) -> None:
        assert atomic_weight("Fe") == 55.845
        assert atomic_weight("Cu") == 63.546
        assert atomic_weight("Cr") == 51.996
        assert atomic_weight("Ni") == 58.693
        assert atomic_weight("C") == 12.011
        assert atomic_weight("Al") == 26.982
        assert atomic_weight("Ti") == 47.867
        assert atomic_weight("U") == 238.03

    def test_every_symbol_is_an_element_and_every_weight_positive(self) -> None:
        assert set(ATOMIC_WEIGHTS) <= set(SYMBOLS)
        assert all(w > 0 for w in ATOMIC_WEIGHTS.values())

    @pytest.mark.parametrize("symbol", ["Tc", "Pm", "Po", "Ra", "Pu", "Og"])
    def test_an_element_without_a_standard_weight_is_absent(self, symbol: str) -> None:
        assert atomic_weight(symbol) is None

    def test_the_table_names_its_version(self) -> None:
        assert "IUPAC" in TABLE_VERSION and "2021" in TABLE_VERSION


class TestDerived:
    def test_a_nominal_binary_alloy_is_the_formula(self) -> None:
        result = derive_atomic_percent([("Cu", point(70.0)), ("Zn", point(30.0))])
        assert result.is_derived and result.reason is None
        expected = atomic({"Cu": 70.0, "Zn": 30.0})
        by_element = {r.element: r for r in result.rows}
        for symbol, value in expected.items():
            assert by_element[symbol].atomic_min == pytest.approx(value)
            assert by_element[symbol].atomic_max == pytest.approx(value)
        assert by_element["Cu"].atomic_min == pytest.approx(70.59, abs=0.01)

    def test_a_pure_element_is_one_hundred_percent(self) -> None:
        (row,) = derive_atomic_percent([("Al", point(100.0))]).rows
        assert (row.atomic_min, row.atomic_max) == (pytest.approx(100.0), pytest.approx(100.0))

    def test_the_source_order_is_kept(self) -> None:
        result = derive_atomic_percent([("Zn", point(30.0)), ("Cu", point(70.0))])
        assert [r.element for r in result.rows] == ["Zn", "Cu"]

    def test_the_atomic_fractions_of_a_point_add_up_to_one_hundred(self) -> None:
        result = derive_atomic_percent(
            [("Fe", point(70.0)), ("Cr", point(18.0)), ("Ni", point(10.0)), ("Mn", point(2.0))]
        )
        assert sum(r.atomic_min for r in result.rows) == pytest.approx(100.0)

    def test_rounding_within_the_tolerance_still_closes(self) -> None:
        result = derive_atomic_percent([("Cu", point(69.98)), ("Zn", point(30.0))])
        assert result.is_derived
        assert sum(r.atomic_min for r in result.rows) == pytest.approx(100.0)

    def test_the_label_and_basis(self) -> None:
        result = derive_atomic_percent([("Cu", point(100.0))])
        assert DERIVED_LABEL == "derivada"
        assert result.basis == TABLE_VERSION


class TestRangeByReach:
    def test_a_range_converts_to_the_interval_its_ends_reach(self) -> None:
        # Minima 99.96 % (closed within tolerance), maxima 100.04 %: the total
        # is 100 %, and Cu reaches 70.04 % only with Zn at 29.96 %.
        result = derive_atomic_percent([("Cu", facts(70.0, 70.04)), ("Zn", facts(29.96, 30.0))])
        cu = next(r for r in result.rows if r.element == "Cu")
        assert cu.atomic_min == pytest.approx(atomic({"Cu": 70.0, "Zn": 30.0})["Cu"])
        assert cu.atomic_max == pytest.approx(atomic({"Cu": 70.04, "Zn": 29.96})["Cu"])
        assert cu.atomic_min < cu.atomic_max

    def test_a_maximum_admits_zero_and_the_reach_starts_there(self) -> None:
        # Fe 99,97–100 and C ≤ 0,03: a heat of pure iron conforms, so C reaches 0.
        result = derive_atomic_percent([("Fe", facts(99.97, 100.0)), ("C", facts(high=0.03))])
        carbon = next(r for r in result.rows if r.element == "C")
        assert carbon.atomic_min == 0.0
        assert carbon.atomic_max == pytest.approx(atomic({"Fe": 99.97, "C": 0.03})["C"])

    def test_a_point_leaves_no_room_for_a_maximum(self) -> None:
        # Fe nominal 99,97 % is a point: closing at 100 % pins C at 0,03 %.
        result = derive_atomic_percent([("Fe", point(99.97)), ("C", facts(high=0.03))])
        carbon = next(r for r in result.rows if r.element == "C")
        assert carbon.atomic_min == pytest.approx(carbon.atomic_max)
        assert carbon.atomic_min > 0

    def test_the_nominal_does_not_narrow_the_range(self) -> None:
        with_nominal = derive_atomic_percent(
            [("Cu", facts(70.0, 70.04, 70.02)), ("Zn", facts(29.96, 30.0))]
        )
        without = derive_atomic_percent([("Cu", facts(70.0, 70.04)), ("Zn", facts(29.96, 30.0))])
        assert with_nominal.rows == without.rows

    def test_every_conforming_composition_lies_inside_the_reach(self) -> None:
        bounds = {"Fe": (69.97, 70.0), "Cr": (18.0, 18.02), "Ni": (12.0, 12.01)}
        entries = [(s, facts(lo, hi)) for s, (lo, hi) in bounds.items()]
        result = derive_atomic_percent(entries)
        reach = {r.element: (r.atomic_min, r.atomic_max) for r in result.rows}
        rng = random.Random(117)
        seen = {s: [] for s in bounds}
        # Vertices of the box cut by the plane Σ = 100, plus random interior points.
        candidates = []
        for corner in itertools.product(*bounds.values()):
            candidates.append(dict(zip(bounds, corner, strict=True)))
        for _ in range(400):
            candidates.append({s: rng.uniform(lo, hi) for s, (lo, hi) in bounds.items()})
        for masses in candidates:
            # Pin the total at 100 % by moving Fe; skip points that leave its range.
            masses["Fe"] = 100.0 - masses["Cr"] - masses["Ni"]
            if not bounds["Fe"][0] <= masses["Fe"] <= bounds["Fe"][1]:
                continue
            for symbol, value in atomic(masses).items():
                low, high = reach[symbol]
                assert low - 1e-9 <= value <= high + 1e-9
                seen[symbol].append(value)
        for symbol in bounds:
            assert seen[symbol], symbol


class TestAbsent:
    def test_no_composition(self) -> None:
        result = derive_atomic_percent([])
        assert result.reason is AtomicAbsentReason.SEM_COMPOSICAO
        assert result.rows == ()

    def test_a_declared_balance_is_never_computed(self) -> None:
        result = derive_atomic_percent(
            [("Cr", facts(16.0, 18.0)), ("Fe", facts(balance=True)), ("Ni", facts(10.0, 14.0))]
        )
        assert result.reason is AtomicAbsentReason.RESTO_DECLARADO
        assert not result.is_derived
        assert result.rows == ()
        assert "Fe" in (result.message or "")

    def test_a_declared_absent_content(self) -> None:
        result = derive_atomic_percent([("Cu", point(99.0)), ("O", facts(missing=True))])
        assert result.reason is AtomicAbsentReason.DECLARADO_AUSENTE
        assert "O" in (result.message or "")

    def test_an_element_outside_the_table(self) -> None:
        result = derive_atomic_percent([("Fe", point(99.0)), ("Tc", point(1.0))])
        assert result.reason is AtomicAbsentReason.SEM_MASSA_ATOMICA
        assert "Tc" in (result.message or "")
        assert result.rows == ()

    def test_an_incomplete_sum_is_not_renormalized(self) -> None:
        # Cr 16–18 and Ni 8–10 only: the rest may be elements nobody listed.
        result = derive_atomic_percent([("Cr", facts(16.0, 18.0)), ("Ni", facts(8.0, 10.0))])
        assert result.reason is AtomicAbsentReason.SOMA_INCOMPLETA
        assert "24" in (result.message or "")
        assert result.rows == ()

    def test_maxima_reaching_one_hundred_do_not_close_a_range(self) -> None:
        # The maxima could add to 100 %, but a heat at the minima would carry
        # 2 % of something unlisted: closed-world would assume it is 0 %.
        result = derive_atomic_percent([("Cu", facts(69.0, 71.0)), ("Zn", facts(29.0, 31.0))])
        assert result.reason is AtomicAbsentReason.SOMA_INCOMPLETA

    def test_a_sum_above_one_hundred(self) -> None:
        result = derive_atomic_percent([("Cu", point(70.0)), ("Zn", point(40.0))])
        assert result.reason is AtomicAbsentReason.SOMA_ACIMA_DE_100
        assert "110" in (result.message or "")

    def test_just_outside_the_tolerance_is_incomplete(self) -> None:
        result = derive_atomic_percent(
            [("Cu", point(70.0 - 2 * SUM_TOLERANCE)), ("Zn", point(30.0))]
        )
        assert result.reason is AtomicAbsentReason.SOMA_INCOMPLETA

    def test_the_balance_reason_wins_over_the_sum(self) -> None:
        # With a balance the sum is incomplete too; the reason names the cause.
        result = derive_atomic_percent([("Al", point(6.0)), ("Ti", facts(balance=True))])
        assert result.reason is AtomicAbsentReason.RESTO_DECLARADO
