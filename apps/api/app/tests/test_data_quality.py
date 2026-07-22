"""Tests for the missing-value / data-quality domain rules."""

from __future__ import annotations

import pytest

from app.domain.data_quality import (
    build_interval_value,
    build_scalar_value,
    missing_value,
)


def test_missing_value_is_never_zero():
    nv = missing_value()
    assert nv.is_missing is True
    # Every numeric field must be None — not 0.
    assert nv.value_scalar is None
    assert nv.value_min is None
    assert nv.value_max is None
    assert nv.value_typical is None
    assert nv.normalized_value is None


def test_scalar_value_records_conversion_trail():
    nv = build_scalar_value(2.70, "g/cm**3", "kg/m**3")
    assert nv.is_missing is False
    assert nv.value_scalar == 2.70          # original preserved
    assert nv.original_unit == "g/cm**3"
    assert nv.normalized_value == pytest.approx(2700.0)
    assert nv.canonical_unit == "kg/m**3"
    assert nv.conversion_method == "pint:g/cm**3->kg/m**3"


def test_interval_value_defaults_typical_to_midpoint():
    nv = build_interval_value(40.0, 60.0, "MPa", "Pa")
    assert nv.value_min == 40.0
    assert nv.value_max == 60.0
    assert nv.value_typical == pytest.approx(50.0)
    assert nv.normalized_value == pytest.approx(50e6)


def test_interval_value_uses_explicit_typical():
    nv = build_interval_value(40.0, 60.0, "MPa", "Pa", value_typical=48.0)
    assert nv.value_typical == 48.0
    assert nv.normalized_value == pytest.approx(48e6)


def test_inverted_interval_raises():
    with pytest.raises(ValueError):
        build_interval_value(60.0, 40.0, "MPa", "Pa")


def test_typical_outside_interval_raises():
    # The typical is the representative chart point; out-of-range typicals
    # would silently misplace the material on property maps.
    with pytest.raises(ValueError):
        build_interval_value(100.0, 200.0, "MPa", "Pa", value_typical=5000.0)
    with pytest.raises(ValueError):
        build_interval_value(100.0, 200.0, "MPa", "Pa", value_typical=50.0)


def test_typical_at_interval_bounds_is_accepted():
    nv = build_interval_value(100.0, 200.0, "MPa", "Pa", value_typical=200.0)
    assert nv.value_typical == 200.0


def test_missing_value_skips_conversion():
    # A missing value must not attempt any unit conversion.
    nv = missing_value()
    assert nv.conversion_method is None
    assert nv.canonical_unit is None
