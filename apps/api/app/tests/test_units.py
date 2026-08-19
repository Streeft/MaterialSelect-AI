"""Tests for the deterministic unit-handling layer."""

from __future__ import annotations

import math
import time

import pytest

from app.calculations.units import (
    UnitError,
    parse_decimal_comma,
    to_canonical,
    validate_dimension,
)


def test_gpa_to_pa():
    value, method = to_canonical(210.0, "GPa", "Pa")
    assert value == pytest.approx(210e9)
    assert method == "pint:GPa->Pa"


def test_g_per_cm3_to_kg_per_m3():
    value, _ = to_canonical(2.70, "g/cm**3", "kg/m**3")
    assert value == pytest.approx(2700.0)


def test_degc_to_kelvin_is_offset_not_scale():
    value, _ = to_canonical(150.0, "degC", "kelvin")
    assert value == pytest.approx(423.15)


def test_identity_conversion_keeps_value():
    value, method = to_canonical(500.0, "MPa", "MPa")
    assert value == 500.0
    assert method.startswith("identity")


def test_incompatible_units_raise():
    # length cannot be converted to a pressure
    with pytest.raises(UnitError):
        to_canonical(1.0, "meter", "Pa")


def test_unknown_unit_raises():
    with pytest.raises(UnitError):
        to_canonical(1.0, "not_a_unit", "Pa")


# A unit is free text typed by a person — during import, when creating a
# property, when writing a constraint. Pint does not answer a malformed string
# with a single exception type: an unfinished operator raises AssertionError
# from inside its parser, an unbalanced parenthesis raises tokenize.TokenError,
# and neither descends from ValueError. Anything not converted into UnitError
# here leaves the service layer as HTTP 500 — the user typed a typo and the
# application reports a defect of its own.
@pytest.mark.parametrize(
    "unit",
    [
        "m**",  # AssertionError: operator without an operand
        "1/",  # AssertionError
        "m/",  # AssertionError
        "(m",  # tokenize.TokenError: parenthesis never closed
        "$",  # AssertionError: not a token pint accepts
        "m ** ** 2",
        ")",
    ],
)
def test_malformed_unit_raises_uniterror_not_internal_error(unit):
    with pytest.raises(UnitError):
        to_canonical(1.0, unit, "Pa")
    with pytest.raises(UnitError):
        to_canonical(1.0, "Pa", unit)
    with pytest.raises(UnitError):
        validate_dimension(unit, "[mass] / [length] / [time] ** 2")


# Pint evaluates the unit string as an arithmetic expression, so "9**9**9" —
# ten characters — asks Python for an integer with some 370 million digits. The
# call never returns: one core pegged and memory climbing, from a field a person
# types. A length limit does not help (ten characters is enough) and neither
# does a bound on the exponent alone (the chained form keeps every digit small),
# which is why the guard checks the *shape* of the exponent.
@pytest.mark.parametrize(
    "unit",
    [
        "m**9**9**9",  # chained: 9**(9**9)
        "9**9**9",
        "m^9^9^9",  # pint reads "^" as a power operator too
        "9**999999999",  # a single, enormous exponent
        "m**(9**9)",
        "2**(3+999999999)",  # arithmetic inside the exponent
        "m**2**2**2**2**2",
        "m" * 200,  # nothing legitimate is this long
    ],
)
def test_pathological_unit_is_rejected_quickly(unit):
    started = time.perf_counter()
    with pytest.raises(UnitError):
        to_canonical(1.0, unit, "Pa")
    with pytest.raises(UnitError):
        validate_dimension(unit, "[length]")
    # The point of the guard is that it answers *before* doing the work.
    assert time.perf_counter() - started < 1.0


@pytest.mark.parametrize(
    "unit",
    [
        "Pa",
        "GPa",
        "kg/m**3",
        "g/cm**3",
        "W/(m*K)",
        "MPa*m**0.5",
        "m**-3",
        "m**(1/2)",
        "m**2/s**2",
        "1/K",
        "degC",
    ],
)
def test_real_units_survive_the_guard(unit):
    # The guard is worthless if it also rejects the units this project actually
    # uses; these are the canonical and imported forms in the seed.
    validate_dimension(unit, "")
    to_canonical(1.0, unit, unit)


def test_validate_dimension_accepts_matching():
    assert validate_dimension("GPa", "[mass] / [length] / [time] ** 2") is True


def test_validate_dimension_rejects_mismatch():
    assert validate_dimension("meter", "[mass] / [length] / [time] ** 2") is False


def test_validate_dimension_empty_expectation_passes():
    assert validate_dimension("dimensionless", "") is True


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("69,5", 69.5),
        ("2.5", 2.5),
        ("1,2e3", 1200.0),
        ("1 000,5", 1000.5),
        (42, 42.0),
        (3.14, 3.14),
    ],
)
def test_parse_decimal_comma(raw, expected):
    assert parse_decimal_comma(raw) == pytest.approx(expected)


def test_parse_decimal_comma_thousands_and_decimal():
    assert parse_decimal_comma("1.234,56") == pytest.approx(1234.56)


def test_parse_decimal_comma_invalid():
    with pytest.raises(UnitError):
        parse_decimal_comma("abc")


def test_conversion_is_finite():
    value, _ = to_canonical(1.0, "g/cm**3", "kg/m**3")
    assert math.isfinite(value)


def test_nonfinite_input_raises():
    with pytest.raises(UnitError):
        to_canonical(math.inf, "GPa", "Pa")
    with pytest.raises(UnitError):
        to_canonical(math.nan, "GPa", "Pa")
    with pytest.raises(UnitError):
        to_canonical(math.inf, "Pa", "Pa")  # identity path is guarded too


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1500", 1500.0),
        ("1234", 1234.0),
        ("12345", 12345.0),
        ("10000,5", 10000.5),
    ],
)
def test_parse_plain_integers_with_four_plus_digits(raw, expected):
    # Regression: the old regex capped the ungrouped integer part at 3 digits,
    # rejecting common values like "1500".
    assert parse_decimal_comma(raw) == pytest.approx(expected)
