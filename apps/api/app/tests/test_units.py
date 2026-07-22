"""Tests for the deterministic unit-handling layer."""

from __future__ import annotations

import math

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
