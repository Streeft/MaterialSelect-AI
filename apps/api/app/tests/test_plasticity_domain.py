"""The plastic hardening table (D-119, TM5-b): conversion, E, discard and anchor.

Every series here is invented for the test (round numbers, no real alloy): the
domain is pure, and what is proved is the rule, not a material.
"""

from __future__ import annotations

import math

import pytest

from app.calculations.units import to_canonical
from app.domain.plasticity import (
    TEMPERATURE_MATCH_K,
    YIELD_TOLERANCE,
    ModulusPoint,
    PlasticityError,
    match_temperature,
    plastic_table,
)

E = 200e9  # Pa, invented
SIGMA_Y = 250e6  # Pa, invented
EPS_Y = SIGMA_Y / E


def _true_series() -> list[tuple[float, float]]:
    # Origin, one elastic point, the elastic limit, then hardening.
    return [
        (0.0, 0.0),
        (EPS_Y / 2, SIGMA_Y / 2),
        (EPS_Y, SIGMA_Y),
        (0.01, 300e6),
        (0.05, 380e6),
    ]


def test_a_true_series_becomes_stress_against_plastic_strain() -> None:
    table = plastic_table(_true_series(), strain_measure="true", youngs_modulus=E)
    assert [p.plastic_strain for p in table.points] == pytest.approx(
        [0.0, 0.01 - 300e6 / E, 0.05 - 380e6 / E]
    )
    assert [p.true_stress for p in table.points] == [SIGMA_Y, 300e6, 380e6]
    assert table.yield_stress == SIGMA_Y
    assert table.discarded_elastic == 2  # the origin and the half-yield point
    assert table.discarded_after_necking == 0
    assert table.anchor_residual == pytest.approx(0.0, abs=1e-15)
    assert [p.source_position for p in table.points] == [2, 3, 4]


def test_an_engineering_series_is_converted_to_true_values() -> None:
    eng = [(0.0, 0.0), (EPS_Y, SIGMA_Y), (0.1, 500e6), (0.2, 520e6)]
    table = plastic_table(eng, strain_measure="engineering", youngs_modulus=E)
    last = table.points[-1]
    assert last.true_stress == pytest.approx(520e6 * 1.2)
    assert last.plastic_strain == pytest.approx(math.log(1.2) - 520e6 * 1.2 / E)
    middle = table.points[1]
    assert middle.true_stress == pytest.approx(500e6 * 1.1)
    assert middle.plastic_strain == pytest.approx(math.log(1.1) - 550e6 / E)
    # The yield point moves by the conversion too, and stays on the elastic line
    # within the tolerance: sigma(1+eps) against ln(1+eps).
    assert table.yield_stress == pytest.approx(SIGMA_Y * (1 + EPS_Y))


def test_engineering_points_after_the_maximum_stress_are_dropped_as_necking() -> None:
    eng = [(0.0, 0.0), (EPS_Y, SIGMA_Y), (0.1, 500e6), (0.2, 520e6), (0.25, 480e6), (0.3, 400e6)]
    table = plastic_table(eng, strain_measure="engineering", youngs_modulus=E)
    assert table.discarded_after_necking == 2
    assert table.points[-1].source_position == 3


def test_a_true_series_is_not_truncated_at_its_maximum() -> None:
    series = [*_true_series(), (0.08, 370e6)]
    table = plastic_table(series, strain_measure="true", youngs_modulus=E)
    assert table.discarded_after_necking == 0
    assert table.points[-1].true_stress == 370e6


@pytest.mark.parametrize("measure", [None, "", "nominal", "TRUE"])
def test_an_undeclared_measure_is_never_presumed(measure) -> None:
    with pytest.raises(PlasticityError, match="não declara"):
        plastic_table(_true_series(), strain_measure=measure, youngs_modulus=E)


def test_a_series_starting_at_the_elastic_limit_is_anchored() -> None:
    # Plastic part only, as some sources publish it: first point is the yield.
    series = [(EPS_Y * 1.02, SIGMA_Y), (0.01, 300e6)]
    table = plastic_table(series, strain_measure="true", youngs_modulus=E)
    assert table.points[0].plastic_strain == 0.0
    assert table.anchor_residual == pytest.approx(0.02 * EPS_Y)
    assert table.discarded_elastic == 0


def test_a_series_that_starts_already_plastic_is_refused() -> None:
    with pytest.raises(PlasticityError, match="não começa no limite elástico"):
        plastic_table([(0.01, 300e6), (0.05, 380e6)], strain_measure="true", youngs_modulus=E)


def test_the_anchor_tolerance_is_a_fraction_of_the_elastic_strain() -> None:
    inside = EPS_Y * (1 + YIELD_TOLERANCE * 0.9)
    outside = EPS_Y * (1 + YIELD_TOLERANCE * 1.1)
    ok = plastic_table([(inside, SIGMA_Y), (0.01, 300e6)], strain_measure="true", youngs_modulus=E)
    assert ok.points[0].plastic_strain == 0.0
    with pytest.raises(PlasticityError, match="não começa no limite elástico"):
        plastic_table([(outside, SIGMA_Y), (0.01, 300e6)], strain_measure="true", youngs_modulus=E)


def test_a_last_elastic_point_left_of_the_elastic_line_is_refused() -> None:
    # Stiffer than E: the point that would be yield has eps_p well below zero.
    series = [(0.0, 0.0), (EPS_Y * 0.8, SIGMA_Y), (0.01, 300e6)]
    with pytest.raises(PlasticityError, match="à esquerda da reta elástica"):
        plastic_table(series, strain_measure="true", youngs_modulus=E)


def test_a_jump_from_the_origin_to_the_plastic_range_is_refused() -> None:
    with pytest.raises(PlasticityError, match="não registra o limite elástico"):
        plastic_table([(0.0, 0.0), (0.01, 300e6)], strain_measure="true", youngs_modulus=E)


def test_a_point_after_yield_with_negative_plastic_strain_is_dropped() -> None:
    series = [
        (EPS_Y, SIGMA_Y),
        (0.01, 300e6),
        (0.0105, 2.2e9),  # eps_p = 0.0105 - 0.011 < 0: dropped, counted
        (0.05, 380e6),
    ]
    table = plastic_table(series, strain_measure="true", youngs_modulus=E)
    assert table.discarded_negative == 1
    assert [p.source_position for p in table.points] == [0, 1, 3]


def test_plastic_strain_that_does_not_grow_is_refused_not_reordered() -> None:
    series = [(EPS_Y, SIGMA_Y), (0.01, 300e6), (0.0102, 360e6), (0.05, 380e6)]
    with pytest.raises(PlasticityError, match="não cresce"):
        plastic_table(series, strain_measure="true", youngs_modulus=E)


def test_a_curve_with_no_plastic_point_is_refused() -> None:
    with pytest.raises(PlasticityError, match="Nenhum ponto"):
        plastic_table([(0.0, 0.0), (EPS_Y, SIGMA_Y)], strain_measure="true", youngs_modulus=E)


def test_a_compression_curve_is_refused() -> None:
    with pytest.raises(PlasticityError, match="compressão"):
        plastic_table([(0.0, 0.0), (-0.001, -2e8)], strain_measure="true", youngs_modulus=E)


def test_zero_stress_after_yield_is_refused() -> None:
    with pytest.raises(PlasticityError, match="tensão nula"):
        plastic_table(
            [(EPS_Y, SIGMA_Y), (0.01, 300e6), (0.06, 0.0)],
            strain_measure="true",
            youngs_modulus=E,
        )


@pytest.mark.parametrize("modulus", [0.0, -1.0, math.inf, math.nan])
def test_a_modulus_that_is_not_positive_and_finite_is_refused(modulus: float) -> None:
    with pytest.raises(PlasticityError):
        plastic_table(_true_series(), strain_measure="true", youngs_modulus=modulus)


def test_the_conversion_is_deterministic() -> None:
    first = plastic_table(_true_series(), strain_measure="engineering", youngs_modulus=E)
    second = plastic_table(_true_series(), strain_measure="engineering", youngs_modulus=E)
    assert first == second


# --- E at the series' temperature ------------------------------------------------


def _k(value: float, unit: str) -> float:
    return to_canonical(value, unit, "K")[0]


def test_the_modulus_is_read_at_the_exact_temperature() -> None:
    points = [ModulusPoint(7, _k(20, "degC"), 200e9), ModulusPoint(7, _k(300, "degC"), 180e9)]
    assert match_temperature(_k(300, "degC"), points).modulus == 180e9


def test_the_same_temperature_in_another_unit_is_the_same_point() -> None:
    points = [ModulusPoint(7, _k(20, "degC"), 200e9)]
    # 68 degF is 293.15000000000003 K: conversion residue, not a neighbour.
    assert abs(_k(68, "degF") - _k(20, "degC")) <= TEMPERATURE_MATCH_K
    assert match_temperature(_k(68, "degF"), points).modulus == 200e9


def test_a_temperature_between_points_is_not_interpolated() -> None:
    points = [ModulusPoint(7, _k(20, "degC"), 200e9), ModulusPoint(7, _k(300, "degC"), 180e9)]
    with pytest.raises(PlasticityError, match="não é interpolado"):
        match_temperature(_k(150, "degC"), points)


def test_two_moduli_at_the_same_temperature_are_not_chosen_between() -> None:
    points = [ModulusPoint(7, _k(20, "degC"), 200e9), ModulusPoint(8, _k(20, "degC"), 195e9)]
    with pytest.raises(PlasticityError, match="não escolhe"):
        match_temperature(_k(20, "degC"), points)
