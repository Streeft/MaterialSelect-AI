"""The part-cost equation: its terms, their behaviour with batch size, refusals.

The tests that matter here are not "does it add up" — they are the three that
pin *why* the model is a sum rather than a single number: the material term is
a floor no batch can get under, the tooling term falls as 1/n, and the time
terms do not move with n at all. Those three behaviours are the lesson the
estimator exists to show, so each has a test of its own.
"""

from __future__ import annotations

import pytest

from app.calculations.part_cost import (
    DEFAULT_CURVE_BATCH_SIZES,
    PartCostError,
    ShopAssumptions,
    cost_curve,
    cost_terms,
    curve_batch_sizes,
)

SHOP = ShopAssumptions(write_off_years=5.0, load_factor=0.5)

BRIEF = {
    "part_mass": 2.0,
    "material_cost_per_mass": 8.0,
    "tooling_cost": 20_000.0,
    "production_rate": 60.0,
    "capital_cost": 400_000.0,
    "overhead_rate": 90.0,
    "scrap_fraction": 0.2,
    "batch_size": 1_000.0,
    "assumptions": SHOP,
}


def _terms(**overrides):
    return cost_terms(**{**BRIEF, **overrides})


def test_each_term_matches_the_equation_computed_by_hand() -> None:
    terms = _terms()

    assert terms.material == pytest.approx(2.0 * 8.0 / 0.8)  # 20.0
    assert terms.tooling == pytest.approx(20_000.0 / 1_000.0)  # 20.0
    assert terms.overhead == pytest.approx(90.0 / 60.0)  # 1.5
    assert terms.capital == pytest.approx(400_000.0 / (60.0 * 8760.0 * 5.0 * 0.5))
    assert terms.total == pytest.approx(
        terms.material + terms.tooling + terms.overhead + terms.capital
    )


def test_the_material_term_is_a_floor_no_batch_size_can_get_under() -> None:
    """It does not move with n. Everything else does, or is small."""
    small = _terms(batch_size=1.0)
    huge = _terms(batch_size=1_000_000.0)

    assert small.material == huge.material
    assert huge.total > huge.material


def test_the_tooling_term_falls_as_one_over_the_batch() -> None:
    """The entire reason a process can be absurd at ten parts and cheap at 10⁵."""
    ten = _terms(batch_size=10.0)
    thousand = _terms(batch_size=1_000.0)

    assert ten.tooling == pytest.approx(thousand.tooling * 100.0)
    assert ten.total > thousand.total


def test_the_time_terms_do_not_move_with_the_batch() -> None:
    ten = _terms(batch_size=10.0)
    thousand = _terms(batch_size=1_000.0)

    assert ten.overhead == thousand.overhead
    assert ten.capital == thousand.capital


def test_batch_sensitive_names_the_share_a_larger_run_can_still_remove() -> None:
    terms = _terms()
    assert terms.batch_sensitive == terms.tooling


def test_scrap_raises_the_material_term_and_only_that_one() -> None:
    clean = _terms(scrap_fraction=0.0)
    wasteful = _terms(scrap_fraction=0.5)

    assert wasteful.material == pytest.approx(clean.material * 2.0)
    assert wasteful.tooling == clean.tooling
    assert wasteful.overhead == clean.overhead


def test_a_faster_process_spreads_overhead_and_capital_over_more_parts() -> None:
    slow = _terms(production_rate=10.0)
    fast = _terms(production_rate=100.0)

    assert fast.overhead == pytest.approx(slow.overhead / 10.0)
    assert fast.capital == pytest.approx(slow.capital / 10.0)
    assert fast.material == slow.material


def test_the_load_factor_and_the_horizon_are_separate_knobs() -> None:
    """Halving the load factor doubles the capital term; so does halving years."""
    base = _terms()
    idle = _terms(assumptions=ShopAssumptions(write_off_years=5.0, load_factor=0.25))
    short = _terms(assumptions=ShopAssumptions(write_off_years=2.5, load_factor=0.5))

    assert idle.capital == pytest.approx(base.capital * 2.0)
    assert short.capital == pytest.approx(base.capital * 2.0)


def test_curve_batch_sizes_includes_current_batch_in_sorted_order() -> None:
    sizes = curve_batch_sizes(current_batch=350.0)
    assert 350.0 in sizes
    assert sizes == sorted(sizes)
    assert sizes[0] == 1.0
    assert 1_000_000.0 in sizes


def test_curve_batch_sizes_expands_if_current_batch_exceeds_million() -> None:
    sizes = curve_batch_sizes(current_batch=5_000_000.0)
    assert 5_000_000.0 in sizes
    assert max(sizes) >= 5_000_000.0


def test_cost_curve_monotonically_decreases_with_batch_size() -> None:
    base = 25.0
    tooling = 10_000.0
    curve = cost_curve(base_cost=base, tooling_cost=tooling)
    assert len(curve) == len(DEFAULT_CURVE_BATCH_SIZES)
    for i in range(len(curve) - 1):
        assert curve[i].cost > curve[i + 1].cost
    # Asymptotes towards base_cost
    assert curve[-1].cost > base
    assert curve[-1].cost == pytest.approx(base + tooling / 1_000_000.0)


def test_cost_curve_matches_total_at_current_batch() -> None:
    terms = _terms(batch_size=250.0)
    base_cost = terms.material + terms.overhead + terms.capital
    curve = cost_curve(base_cost=base_cost, tooling_cost=BRIEF["tooling_cost"], current_batch=250.0)
    pt = next(p for p in curve if p.batch_size == 250.0)
    assert pt.cost == pytest.approx(terms.total)


def test_cost_curve_with_zero_tooling_is_flat() -> None:
    curve = cost_curve(base_cost=15.0, tooling_cost=0.0)
    assert all(pt.cost == 15.0 for pt in curve)


# --- refusals --------------------------------------------------------------


def test_a_non_positive_mass_is_refused() -> None:
    with pytest.raises(PartCostError, match="massa"):
        _terms(part_mass=0.0)


def test_a_batch_below_one_part_is_refused() -> None:
    with pytest.raises(PartCostError, match="lote"):
        _terms(batch_size=0.5)


def test_a_non_positive_rate_is_refused() -> None:
    with pytest.raises(PartCostError, match="taxa"):
        _terms(production_rate=0.0)


def test_total_scrap_is_refused_rather_than_dividing_by_zero() -> None:
    """f = 1 says every gram is lost, and the part is never made."""
    with pytest.raises(PartCostError, match="refugo"):
        _terms(scrap_fraction=1.0)


def test_a_negative_cost_is_refused() -> None:
    with pytest.raises(PartCostError, match="negativo"):
        _terms(tooling_cost=-1.0)


def test_the_shop_assumptions_validate_themselves() -> None:
    with pytest.raises(PartCostError, match="amortização"):
        ShopAssumptions(write_off_years=0.0, load_factor=0.5)
    with pytest.raises(PartCostError, match="fator de carga"):
        ShopAssumptions(write_off_years=5.0, load_factor=0.0)
    with pytest.raises(PartCostError, match="fator de carga"):
        ShopAssumptions(write_off_years=5.0, load_factor=1.5)


def test_a_load_factor_of_exactly_one_is_allowed() -> None:
    """A shop that never stops is unrealistic, not impossible — and it is a bound."""
    assert ShopAssumptions(write_off_years=1.0, load_factor=1.0).load_factor == 1.0


def test_zero_scrap_and_zero_tooling_are_allowed() -> None:
    """Neither is nonsense: a process can waste nothing and need no dedicated die."""
    terms = _terms(scrap_fraction=0.0, tooling_cost=0.0)
    assert terms.tooling == 0.0
    assert terms.material == pytest.approx(16.0)
