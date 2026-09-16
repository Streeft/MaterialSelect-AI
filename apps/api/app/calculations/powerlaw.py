"""Power-law (monomial) analysis of performance-index expressions.

Ashby's method exploits a geometric fact: on a log-log property map, the locus
of materials sharing the same value of an index ``M = C · X^a · Y^b`` is a
**straight line**. Sliding that line (keeping its slope) until it isolates the
top-left/top-right region is how a designer reads the map. This module derives
that line's geometry **deterministically**, from the expression itself — the
slope is never assumed, typed in by hand, or produced by an AI layer.

Two steps:

1. :func:`as_monomial` re-walks the AST already validated by
   :mod:`app.calculations.expressions` and, when the expression is a pure
   power-law monomial, returns its coefficient and one exponent per variable.
   Sums, differences and ``abs()`` over variables are *not* monomials and are
   rejected — an index containing them simply has no straight-line contour.
2. :func:`index_line` combines those exponents with the two plotted properties
   to produce the contour geometry (slope in log-log space, plus a solver for
   the iso-index level lines).

Sign convention: with the x axis carrying exponent ``a`` and the y axis exponent
``b``, ``log M = log C + a·log X + b·log Y``, so along a constant-M contour

    log Y = (log M - log C)/b - (a/b)·log X

i.e. the log-log slope is ``-a/b``. For ``E^(1/2)/ρ`` plotted as E (y) against
ρ (x) this gives ``-(-1)/(1/2) = 2``, the classic light-stiff-beam line.
"""

from __future__ import annotations

import ast
import math
from dataclasses import dataclass
from typing import Literal

from app.calculations.expressions import ExpressionError, parse

# Exponents below this magnitude are treated as exactly zero, so that
# ``E / E`` or ``E**1 * E**-1`` do not leave a phantom variable behind.
_EXPONENT_EPSILON = 1e-12


@dataclass(frozen=True)
class Monomial:
    """An expression rewritten as ``coefficient · Π variable^exponent``."""

    coefficient: float
    exponents: dict[str, float]

    @property
    def variables(self) -> set[str]:
        return set(self.exponents)


Orientation = Literal["oblique", "vertical"]


@dataclass(frozen=True)
class IndexLine:
    """Geometry of the iso-index contour on a two-property map.

    ``orientation`` is ``"vertical"`` when the index does not depend on the y
    axis at all (the contour is then a vertical line at a fixed x); otherwise it
    is ``"oblique"`` and ``slope`` is the log-log slope (0 for a horizontal
    line, when the index does not depend on the x axis).
    """

    orientation: Orientation
    slope: float | None
    coefficient: float
    x_exponent: float
    y_exponent: float

    def y_for_x(self, level: float, x: float) -> float | None:
        """Return y such that the index equals ``level`` at abscissa ``x``.

        Returns ``None`` when the point is not representable (non-positive
        base under a fractional root, division by zero, overflow) — an
        undrawable point is reported as absent, never clamped to an invented
        coordinate.
        """
        if self.orientation != "oblique" or x <= 0:
            return None
        try:
            base = level / (self.coefficient * x**self.x_exponent)
            value = base ** (1.0 / self.y_exponent)
        except (ZeroDivisionError, OverflowError, ValueError):
            return None
        if isinstance(value, complex) or not math.isfinite(value) or value <= 0:
            return None
        return float(value)

    def x_for_level(self, level: float) -> float | None:
        """Return the abscissa of a vertical contour at ``level``."""
        if self.orientation != "vertical":
            return None
        try:
            value = (level / self.coefficient) ** (1.0 / self.x_exponent)
        except (ZeroDivisionError, OverflowError, ValueError):
            return None
        if isinstance(value, complex) or not math.isfinite(value) or value <= 0:
            return None
        return float(value)


def as_monomial(expression: str) -> Monomial:
    """Rewrite ``expression`` as a power-law monomial.

    Raises:
        ExpressionError: if the expression is unsafe (delegated to
            :func:`app.calculations.expressions.parse`) or is not a monomial —
            for instance ``E + rho``, ``abs(E)`` or ``E ** rho``.
    """
    return _walk(parse(expression).body)


def index_line(expression: str, x_variable: str, y_variable: str) -> IndexLine:
    """Derive the iso-index contour geometry for a map of ``y`` against ``x``.

    Raises:
        ExpressionError: if the expression is not a monomial, references a
            property other than the two plotted ones (the contour would then
            depend on a hidden third axis), is identically zero, or depends on
            neither axis.
    """
    monomial = as_monomial(expression)

    extra = sorted(monomial.variables - {x_variable, y_variable})
    if extra:
        raise ExpressionError(
            "A linha de índice exige que o índice dependa apenas dos dois eixos; "
            f"também depende de: {', '.join(extra)}."
        )
    if monomial.coefficient == 0.0:
        raise ExpressionError("Índice identicamente nulo: não há linha de índice.")

    x_exponent = monomial.exponents.get(x_variable, 0.0)
    y_exponent = monomial.exponents.get(y_variable, 0.0)
    if x_exponent == 0.0 and y_exponent == 0.0:
        raise ExpressionError(
            "O índice não depende de nenhum dos eixos escolhidos: não há linha de índice."
        )

    if y_exponent == 0.0:
        return IndexLine(
            orientation="vertical",
            slope=None,
            coefficient=monomial.coefficient,
            x_exponent=x_exponent,
            y_exponent=y_exponent,
        )
    return IndexLine(
        orientation="oblique",
        slope=-x_exponent / y_exponent,
        coefficient=monomial.coefficient,
        x_exponent=x_exponent,
        y_exponent=y_exponent,
    )


# --- AST walk --------------------------------------------------------------


def _constant(value: float) -> Monomial:
    return Monomial(coefficient=value, exponents={})


def _scale(monomial: Monomial, factor: float) -> Monomial:
    return Monomial(coefficient=monomial.coefficient * factor, exponents=dict(monomial.exponents))


def _combine(left: Monomial, right: Monomial, sign: float) -> Monomial:
    """Multiply (``sign=+1``) or divide (``sign=-1``) two monomials."""
    if sign > 0:
        coefficient = left.coefficient * right.coefficient
    else:
        if right.coefficient == 0.0:
            raise ExpressionError("Divisão por zero na análise de lei de potência.")
        coefficient = left.coefficient / right.coefficient

    exponents = dict(left.exponents)
    for name, exponent in right.exponents.items():
        exponents[name] = exponents.get(name, 0.0) + sign * exponent
    return Monomial(coefficient=coefficient, exponents=_prune(exponents))


def _power(base: Monomial, exponent: Monomial) -> Monomial:
    if exponent.exponents:
        raise ExpressionError(
            "Expoente variável: a expressão não é uma lei de potência com expoentes fixos."
        )
    k = exponent.coefficient
    if base.coefficient < 0 and not float(k).is_integer():
        raise ExpressionError(
            "Base negativa com expoente fracionário na análise de lei de potência."
        )
    if base.coefficient == 0.0 and k <= 0:
        raise ExpressionError("Zero elevado a expoente não positivo.")
    try:
        coefficient = base.coefficient**k
    except (OverflowError, ZeroDivisionError, ValueError) as exc:
        raise ExpressionError(f"Potência inválida na análise de lei de potência: {exc}") from exc
    return Monomial(
        coefficient=float(coefficient),
        exponents=_prune({name: e * k for name, e in base.exponents.items()}),
    )


def _prune(exponents: dict[str, float]) -> dict[str, float]:
    """Drop exponents that cancelled out, so the variable set stays honest."""
    return {name: e for name, e in exponents.items() if abs(e) > _EXPONENT_EPSILON}


def _walk(node: ast.AST) -> Monomial:
    if isinstance(node, ast.Constant):
        return _constant(float(node.value))

    if isinstance(node, ast.Name):
        return Monomial(coefficient=1.0, exponents={node.id: 1.0})

    if isinstance(node, ast.UnaryOp):
        operand = _walk(node.operand)
        return operand if isinstance(node.op, ast.UAdd) else _scale(operand, -1.0)

    if isinstance(node, ast.BinOp):
        left = _walk(node.left)
        right = _walk(node.right)
        if isinstance(node.op, ast.Mult):
            return _combine(left, right, 1.0)
        if isinstance(node.op, ast.Div):
            return _combine(left, right, -1.0)
        if isinstance(node.op, ast.Pow):
            return _power(left, right)
        # Add / Sub: only foldable when neither side carries a variable.
        if left.exponents or right.exponents:
            raise ExpressionError(
                "Somas e subtrações de propriedades não formam uma lei de potência, "
                "portanto não têm linha de índice reta em escala logarítmica."
            )
        delta = right.coefficient if isinstance(node.op, ast.Add) else -right.coefficient
        return _constant(left.coefficient + delta)

    if isinstance(node, ast.Call):
        name = node.func.id  # type: ignore[union-attr]  # validated by expressions._check
        argument = _walk(node.args[0])
        if name == "sqrt":
            return _power(argument, _constant(0.5))
        if name == "cbrt":
            return _power(argument, _constant(1.0 / 3.0))
        # abs
        if argument.exponents:
            raise ExpressionError("abs() sobre propriedades impede a análise de lei de potência.")
        return _constant(abs(argument.coefficient))

    raise ExpressionError(  # pragma: no cover - parse() already whitelists nodes
        f"Construção não suportada na análise de lei de potência: {type(node).__name__}."
    )
