"""Tests for the safe performance-index expression evaluator (no eval)."""

from __future__ import annotations

import pytest

from app.calculations.expressions import (
    ExpressionError,
    evaluate,
    result_dimension,
    safe_variable,
    validate_names,
    variables_in,
)


def test_basic_evaluation():
    assert evaluate("E / rho", {"E": 210e9, "rho": 7850.0}) == pytest.approx(210e9 / 7850.0)


def test_sqrt_and_cbrt_and_pow():
    assert evaluate("sqrt(E) / rho", {"E": 100.0, "rho": 2.0}) == pytest.approx(10.0 / 2.0)
    assert evaluate("cbrt(E) / rho", {"E": 27.0, "rho": 3.0}) == pytest.approx(3.0 / 3.0)
    assert evaluate("E ** (1/2)", {"E": 16.0}) == pytest.approx(4.0)


def test_variables_in():
    assert variables_in("sqrt(modulo_young) / densidade") == {"modulo_young", "densidade"}


def test_validate_names_rejects_unknown():
    with pytest.raises(ExpressionError):
        validate_names("E / foo", {"E", "rho"})


def test_safe_variable_maps_hyphens():
    assert safe_variable("modulo-de-young") == "modulo_de_young"
    assert safe_variable("densidade") == "densidade"


# --- security: dangerous constructs must be rejected ----------------------

@pytest.mark.parametrize(
    "expr",
    [
        "__import__('os').system('echo hi')",
        "().__class__",
        "E.__class__",
        "open('x')",
        "[x for x in range(3)]",
        "lambda: 1",
        "E if rho else 1",
        "E; rho",
        "min(E, rho)",          # non-whitelisted function
        "E & rho",              # bitwise operator
        "E[0]",                 # subscript
        "'string'",             # string constant
        "E = 1",                # assignment (syntax error in eval mode)
    ],
)
def test_dangerous_expressions_rejected(expr):
    with pytest.raises(ExpressionError):
        # Either at parse/validate time or when checking names.
        validate_names(expr, {"E", "rho"})


def test_division_by_zero_is_expression_error():
    with pytest.raises(ExpressionError):
        evaluate("E / rho", {"E": 1.0, "rho": 0.0})


def test_negative_base_fractional_power_rejected():
    with pytest.raises(ExpressionError):
        evaluate("E ** 0.5", {"E": -8.0})


def test_unknown_variable_at_eval_raises():
    with pytest.raises(ExpressionError):
        evaluate("E / rho", {"E": 1.0})


def test_empty_expression_rejected():
    with pytest.raises(ExpressionError):
        evaluate("   ", {})


# --- dimensional analysis -------------------------------------------------

def test_specific_stiffness_dimension():
    # E [Pa] / rho [kg/m^3]  ->  m^2 / s^2 in base SI
    dim = result_dimension("E / rho", {"E": "Pa", "rho": "kg/m**3"})
    assert "[length]" in dim and "[time]" in dim


def test_dimensionally_inconsistent_sum_rejected():
    # Pa + kg/m^3 is not dimensionally valid.
    with pytest.raises(ExpressionError):
        result_dimension("E + rho", {"E": "Pa", "rho": "kg/m**3"})


def test_dimensionless_expression():
    assert result_dimension("E / rho", {"E": "Pa", "rho": "Pa"}) == "dimensionless"
