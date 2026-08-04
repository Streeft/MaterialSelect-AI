"""Tests for the power-law analysis behind Ashby index lines."""

from __future__ import annotations

import math

import pytest

from app.calculations.expressions import ExpressionError
from app.calculations.powerlaw import as_monomial, index_line

# In every case below the map is E (y axis) against rho (x axis), the classic
# Ashby layout; the expected slopes are the textbook ones.
E = "modulo_young"
RHO = "densidade"


class TestAsMonomial:
    def test_single_variable(self) -> None:
        monomial = as_monomial(E)
        assert monomial.coefficient == 1.0
        assert monomial.exponents == {E: 1.0}

    def test_quotient(self) -> None:
        monomial = as_monomial(f"{E} / {RHO}")
        assert monomial.coefficient == 1.0
        assert monomial.exponents == {E: 1.0, RHO: -1.0}

    def test_sqrt_and_constant(self) -> None:
        monomial = as_monomial(f"2 * sqrt({E}) / {RHO}")
        assert monomial.coefficient == 2.0
        assert monomial.exponents[E] == pytest.approx(0.5)
        assert monomial.exponents[RHO] == -1.0

    def test_cbrt(self) -> None:
        assert as_monomial(f"cbrt({E})").exponents[E] == pytest.approx(1 / 3)

    def test_fractional_exponent_written_as_division(self) -> None:
        monomial = as_monomial(f"{E} ** (1/2)")
        assert monomial.exponents[E] == pytest.approx(0.5)

    def test_cancelling_variables_disappear(self) -> None:
        # E * rho / (E * rho) is the constant 1: no phantom variables left over.
        monomial = as_monomial(f"{E} * {RHO} / ({E} * {RHO})")
        assert monomial.exponents == {}
        assert monomial.coefficient == pytest.approx(1.0)

    def test_constant_folding_in_denominator(self) -> None:
        monomial = as_monomial(f"{E} / (2 + 3)")
        assert monomial.coefficient == pytest.approx(0.2)

    def test_negation(self) -> None:
        assert as_monomial(f"-{E}").coefficient == -1.0

    @pytest.mark.parametrize(
        "expression",
        [
            f"{E} + {RHO}",  # a sum is not a monomial
            f"{E} - {RHO}",
            f"abs({E})",  # abs over a variable breaks the power law
            f"{E} ** {RHO}",  # variable exponent
            f"{E} / 0",  # division by zero
        ],
    )
    def test_rejects_non_monomials(self, expression: str) -> None:
        with pytest.raises(ExpressionError):
            as_monomial(expression)

    def test_rejects_unsafe_expression(self) -> None:
        # Delegated to the AST whitelist in `expressions.parse`.
        with pytest.raises(ExpressionError):
            as_monomial("__import__('os')")


class TestIndexLine:
    @pytest.mark.parametrize(
        ("expression", "expected_slope"),
        [
            (f"{E} / {RHO}", 1.0),  # specific stiffness
            (f"sqrt({E}) / {RHO}", 2.0),  # light stiff beam, E^(1/2)/rho
            (f"cbrt({E}) / {RHO}", 3.0),  # light stiff plate, E^(1/3)/rho
            (f"{E} / {RHO} ** 2", 2.0),
            (f"{E}", 0.0),  # no dependence on x: horizontal line
        ],
    )
    def test_classic_slopes(self, expression: str, expected_slope: float) -> None:
        line = index_line(expression, x_variable=RHO, y_variable=E)
        assert line.orientation == "oblique"
        assert line.slope == pytest.approx(expected_slope)

    def test_index_independent_of_y_is_a_vertical_line(self) -> None:
        line = index_line(f"1 / {RHO}", x_variable=RHO, y_variable=E)
        assert line.orientation == "vertical"
        assert line.slope is None
        # 1/rho = 0.001 -> rho = 1000
        assert line.x_for_level(1e-3) == pytest.approx(1000.0)

    def test_line_passes_through_a_material(self) -> None:
        # A material with rho = 2700, E = 69e9 has E/rho = 25_555_555.6; the
        # contour at that level must return exactly its own E at its own rho.
        line = index_line(f"{E} / {RHO}", x_variable=RHO, y_variable=E)
        level = 69e9 / 2700.0
        assert line.y_for_x(level, 2700.0) == pytest.approx(69e9)

    def test_slope_two_line_geometry(self) -> None:
        line = index_line(f"sqrt({E}) / {RHO}", x_variable=RHO, y_variable=E)
        level = math.sqrt(69e9) / 2700.0
        y_at_double_rho = line.y_for_x(level, 5400.0)
        assert y_at_double_rho is not None
        # Slope 2 in log-log: doubling rho quadruples E along the contour.
        assert y_at_double_rho == pytest.approx(4 * 69e9)

    def test_rejects_third_property(self) -> None:
        with pytest.raises(ExpressionError, match="apenas dos dois eixos"):
            index_line(f"{E} / ({RHO} * limite_escoamento)", x_variable=RHO, y_variable=E)

    def test_rejects_index_unrelated_to_both_axes(self) -> None:
        with pytest.raises(ExpressionError, match="não depende de nenhum dos eixos"):
            index_line("5", x_variable=RHO, y_variable=E)

    def test_rejects_identically_zero_index(self) -> None:
        with pytest.raises(ExpressionError, match="nulo"):
            index_line(f"0 * {E} / {RHO}", x_variable=RHO, y_variable=E)

    def test_non_positive_abscissa_has_no_point(self) -> None:
        line = index_line(f"{E} / {RHO}", x_variable=RHO, y_variable=E)
        assert line.y_for_x(1.0, 0.0) is None
        assert line.y_for_x(1.0, -5.0) is None

    def test_vertical_solver_returns_none_for_oblique_line(self) -> None:
        line = index_line(f"{E} / {RHO}", x_variable=RHO, y_variable=E)
        assert line.x_for_level(1.0) is None
