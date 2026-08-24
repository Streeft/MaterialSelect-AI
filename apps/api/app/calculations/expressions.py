"""Safe evaluator for performance-index expressions.

Performance indices (e.g. ``E / rho`` or ``sqrt(E) / rho``) are user-authored
formulas over material properties. They must be evaluated **without** ``eval``
or any dynamic execution. This module parses an expression into a Python AST,
rejects everything outside a small whitelist, and walks the tree with a manual
evaluator.

The same tree walker runs over two numeric domains:

* plain ``float`` values -> the numeric index value for a material;
* Pint ``Quantity`` values (one per property, ``1 * canonical_unit``) ->
  dimensional analysis, so the index's physical dimension is derived rather than
  assumed.

Whitelist: numeric constants, the property variables, ``+ - * / **`` and unary
``+/-``, parentheses, and the functions ``sqrt``, ``cbrt`` and ``abs`` (each is
defined via ``**`` / builtin ``abs`` so it works on floats and Quantities
alike). Names, attributes, subscripts, comprehensions, lambdas, calls to
anything else — all rejected.
"""

from __future__ import annotations

import ast
import math
import re
from functools import lru_cache

from pint.errors import DimensionalityError, OffsetUnitCalculusError

from app.calculations.units import ureg

_MAX_EXPRESSION_LENGTH = 500

_BINARY_OPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)
_UNARY_OPS = (ast.UAdd, ast.USub)


class ExpressionError(ValueError):
    """An expression is empty, malformed, unsafe, or dimensionally invalid."""


def _sqrt(x):  # works on float and pint.Quantity
    return x**0.5


def _cbrt(x):
    return x ** (1.0 / 3.0)


_FUNCTIONS = {"sqrt": _sqrt, "cbrt": _cbrt, "abs": abs}


def safe_variable(slug: str) -> str:
    """Map a property slug to a valid Python identifier for use as a variable.

    Slugs may contain hyphens (``modulo-de-young``); expression variables must be
    identifiers, so non-identifier characters collapse to ``_``. Seeded slugs
    already use underscores and map to themselves.
    """
    name = re.sub(r"\W", "_", slug)
    if name and name[0].isdigit():
        name = f"_{name}"
    return name


@lru_cache(maxsize=256)
def parse(expression: str) -> ast.Expression:
    """Parse and validate an expression, returning its AST.

    Memoised, because an index is evaluated once per material and parsing the
    same string again dominated the work: 17.5 µs of the 33.7 µs it takes to
    evaluate ``sqrt(modulo_young) / densidade``, or 87 ms of pure re-parsing on
    a five-thousand-material map.

    Three things make the cache safe, and all three have to stay true:

    * **Nobody mutates the tree.** All four callers only read it — the two
      walkers here and the two in ``powerlaw``. A memoised parser handing out a
      shared tree that someone rewrites in place would corrupt every later
      evaluation of that expression, and silently.
    * **Failures are not cached.** ``lru_cache`` stores return values, never
      exceptions, so a rejected expression is re-validated on every attempt and
      can never be remembered as accepted.
    * **The cache is bounded.** Expressions are user-authored (the custom index
      on the map screen), and an unbounded cache keyed by user input is a
      memory vector rather than an optimisation.

    Raises:
        ExpressionError: on empty/oversized input, syntax errors, or any node
            outside the whitelist.
    """
    if not expression or not expression.strip():
        raise ExpressionError("Expressão vazia.")
    if len(expression) > _MAX_EXPRESSION_LENGTH:
        raise ExpressionError("Expressão muito longa.")
    try:
        tree = ast.parse(expression, mode="eval")
    except SyntaxError as exc:
        raise ExpressionError(f"Sintaxe inválida: {exc.msg}") from exc
    _check(tree)
    return tree


def _check(node: ast.AST) -> None:
    """Recursively reject any node that is not explicitly whitelisted."""
    if isinstance(node, ast.Expression):
        _check(node.body)
    elif isinstance(node, ast.BinOp):
        if not isinstance(node.op, _BINARY_OPS):
            raise ExpressionError("Operador não permitido.")
        _check(node.left)
        _check(node.right)
    elif isinstance(node, ast.UnaryOp):
        if not isinstance(node.op, _UNARY_OPS):
            raise ExpressionError("Operador unário não permitido.")
        _check(node.operand)
    elif isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise ExpressionError("Apenas números são permitidos como constantes.")
    elif isinstance(node, ast.Name):
        if not isinstance(node.ctx, ast.Load):
            raise ExpressionError("Atribuição não é permitida.")
    elif isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in _FUNCTIONS:
            raise ExpressionError("Função não permitida (use sqrt, cbrt ou abs).")
        if node.keywords:
            raise ExpressionError("Argumentos nomeados não são permitidos.")
        if len(node.args) != 1:
            raise ExpressionError("As funções aceitam exatamente um argumento.")
        _check(node.args[0])
    else:
        raise ExpressionError(f"Construção não permitida: {type(node).__name__}.")


def _collect_names(node: ast.AST, names: set[str]) -> None:
    """Collect variable names, skipping function-name positions in calls."""
    if isinstance(node, ast.Call):
        for arg in node.args:  # node.func is a function name, not a variable
            _collect_names(arg, names)
        return
    if isinstance(node, ast.Name):
        names.add(node.id)
        return
    for child in ast.iter_child_nodes(node):
        _collect_names(child, names)


def variables_in(expression: str) -> set[str]:
    """Return the set of variable names referenced by the expression."""
    tree = parse(expression)
    names: set[str] = set()
    _collect_names(tree, names)
    return names


def validate_names(expression: str, allowed: set[str]) -> set[str]:
    """Validate that every variable used is in ``allowed``; return the ones used.

    Raises:
        ExpressionError: if the expression references unknown variables.
    """
    used = variables_in(expression)
    unknown = used - allowed
    if unknown:
        raise ExpressionError(f"Variáveis desconhecidas: {', '.join(sorted(unknown))}")
    return used


def _walk(node: ast.AST, variables: dict):
    """Evaluate a validated AST over a numeric domain (float or Quantity)."""
    if isinstance(node, ast.Expression):
        return _walk(node.body, variables)
    if isinstance(node, ast.Constant):
        return float(node.value)
    if isinstance(node, ast.Name):
        if node.id not in variables:
            raise ExpressionError(f"Variável sem valor: {node.id}")
        return variables[node.id]
    if isinstance(node, ast.UnaryOp):
        operand = _walk(node.operand, variables)
        return +operand if isinstance(node.op, ast.UAdd) else -operand
    if isinstance(node, ast.BinOp):
        left = _walk(node.left, variables)
        right = _walk(node.right, variables)
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
        return left**right  # Pow (only remaining whitelisted op)
    if isinstance(node, ast.Call):  # pragma: no branch - validated by _check
        return _FUNCTIONS[node.func.id](_walk(node.args[0], variables))
    raise ExpressionError("Construção não permitida.")  # pragma: no cover


def evaluate(expression: str, variables: dict[str, float]) -> float:
    """Evaluate the expression numerically for one material.

    Raises:
        ExpressionError: on unknown variable, division by zero, overflow, or a
            non-finite / complex result (e.g. negative base to a fractional
            power). Callers treat these as "index undefined for this material".
    """
    tree = parse(expression)
    try:
        result = _walk(tree, variables)
    except ZeroDivisionError as exc:
        raise ExpressionError("Divisão por zero.") from exc
    except OverflowError as exc:
        raise ExpressionError("Resultado excede o limite numérico.") from exc
    if isinstance(result, complex):
        raise ExpressionError("Resultado complexo (base negativa com expoente fracionário).")
    result = float(result)
    if not math.isfinite(result):
        raise ExpressionError("Resultado não finito.")
    return result


def result_dimension(expression: str, canonical_units: dict[str, str]) -> str:
    """Return the Pint dimensionality of the expression (for display/validation).

    ``canonical_units`` maps each variable name to its property's canonical unit.
    Adding dimensionally incompatible terms, or raising a quantity to a
    non-dimensionless power, is reported as an error.

    Raises:
        ExpressionError: if the expression is dimensionally inconsistent.
    """
    tree = parse(expression)
    quantities = {name: ureg.Quantity(1.0, unit) for name, unit in canonical_units.items()}
    try:
        result = _walk(tree, quantities)
    except ExpressionError:
        raise
    except ZeroDivisionError as exc:
        raise ExpressionError("Divisão por zero na análise dimensional.") from exc
    except (DimensionalityError, OffsetUnitCalculusError) as exc:
        raise ExpressionError("Expressão dimensionalmente inconsistente.") from exc
    except Exception as exc:  # pint raises assorted types on invalid powers
        raise ExpressionError(f"Análise dimensional falhou: {exc}") from exc

    dimensionality = getattr(result, "dimensionality", None)
    if dimensionality is None or str(dimensionality) == "dimensionless":
        return "dimensionless"
    return str(dimensionality)
