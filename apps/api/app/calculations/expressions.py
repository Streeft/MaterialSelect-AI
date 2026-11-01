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

Whitelist: numeric constants, the property variables, the named constants
``pi`` and ``e``, ``+ - * / **`` and unary ``+/-``, parentheses, and the
functions in :data:`FUNCTIONS` (D-191): ``sqrt``, ``cbrt``, ``abs``, ``sq``,
``inv``, ``pow``, ``min``, ``max``, ``ln``, ``log10`` and ``exp``. Each is
written so it works on floats and Quantities alike; the three transcendental
ones refuse a dimensional argument, because ``ln(1 Pa)`` has no meaning.
Names, attributes, subscripts, comprehensions, lambdas, calls to anything
else — all rejected.

Every refusal carries the character span it is about (:class:`ExpressionError`
``start``/``end``), so the calculator can underline the offending piece instead
of only describing it.
"""

from __future__ import annotations

import ast
import math
import re
from collections.abc import Callable
from dataclasses import dataclass
from fractions import Fraction
from functools import lru_cache

from pint.errors import DimensionalityError, OffsetUnitCalculusError
from pint.util import UnitsContainer

from app.calculations.units import ureg

_MAX_EXPRESSION_LENGTH = 500

_BINARY_OPS = (ast.Add, ast.Sub, ast.Mult, ast.Div, ast.Pow)
_UNARY_OPS = (ast.UAdd, ast.USub)


class ExpressionError(ValueError):
    """An expression is empty, malformed, unsafe, or dimensionally invalid.

    ``start``/``end`` are the 0-based character span the message is about, when
    one is known (a syntax error, a refused node). They are additive: ``str()``
    of the error is the same Portuguese sentence every caller already shows.
    """

    def __init__(self, message: str, *, start: int | None = None, end: int | None = None):
        super().__init__(message)
        self.start = start
        self.end = end


def _sqrt(x):  # works on float and pint.Quantity
    return x**0.5


def _cbrt(x):
    return x ** (1.0 / 3.0)


def _sq(x):
    return x**2


def _inv(x):
    return 1.0 / x


def _pow(base, exponent):
    return base**exponent


def _transcendental(x, name: str, function: Callable[[float], float], positive: bool):
    """Apply ``function`` to a dimensionless argument, in either numeric domain.

    Over a Pint Quantity (dimensional analysis) only the dimension is checked:
    the magnitudes there are the artificial ``1 * unit`` of each property, so a
    sign test on them would refuse ``ln(a - b)`` for a reason that is not true of
    any material. Over a float (evaluation for one material) the domain is real
    and is enforced.
    """
    dimensionless = getattr(x, "dimensionless", None)
    if dimensionless is False:
        raise ExpressionError(
            f"{name}() só aceita argumento adimensional: divida a propriedade por outra "
            "de mesma dimensão antes (por exemplo, uma razão)."
        )
    if dimensionless is True:
        value = float(x.to("dimensionless").magnitude)
        if positive and value <= 0:
            return 1.0  # any dimensionless number: only the dimension matters here
        return function(value)
    value = float(x)
    if positive and value <= 0:
        raise ExpressionError(f"{name}() só existe para valores positivos.")
    return function(value)


def _ln(x):
    return _transcendental(x, "ln", math.log, positive=True)


def _log10(x):
    return _transcendental(x, "log10", math.log10, positive=True)


def _exp(x):
    return _transcendental(x, "exp", math.exp, positive=False)


def _min(*args):
    return min(args)


def _max(*args):
    return max(args)


@dataclass(frozen=True)
class FunctionSpec:
    """One whitelisted function: how many arguments it takes and what it does."""

    implementation: Callable
    min_args: int
    max_args: int


#: The whole function whitelist (D-191). ``pow`` is ``**`` written as a call;
#: ``sq``/``inv`` are the calculator's ``x²`` and ``1/x`` keys. ``min``/``max``
#: take two or more arguments of the same dimension.
FUNCTIONS: dict[str, FunctionSpec] = {
    "sqrt": FunctionSpec(_sqrt, 1, 1),
    "cbrt": FunctionSpec(_cbrt, 1, 1),
    "abs": FunctionSpec(abs, 1, 1),
    "sq": FunctionSpec(_sq, 1, 1),
    "inv": FunctionSpec(_inv, 1, 1),
    "pow": FunctionSpec(_pow, 2, 2),
    "min": FunctionSpec(_min, 2, 8),
    "max": FunctionSpec(_max, 2, 8),
    "ln": FunctionSpec(_ln, 1, 1),
    "log10": FunctionSpec(_log10, 1, 1),
    "exp": FunctionSpec(_exp, 1, 1),
}

#: Named constants. They are names in the grammar, so a property whose variable
#: would be ``pi`` or ``e`` is shadowed — no catalogue slug is either.
CONSTANTS: dict[str, float] = {"pi": math.pi, "e": math.e}

_FUNCTION_LIST = ", ".join(FUNCTIONS)


def node_span(expression: str, node: ast.AST) -> tuple[int | None, int | None]:
    """The 0-based character span of ``node`` in ``expression``.

    ``ast`` reports UTF-8 *byte* offsets; an expression is short, so turning them
    into character offsets by decoding the prefix is cheap and exact.
    """
    start = getattr(node, "col_offset", None)
    end = getattr(node, "end_col_offset", None)
    raw = expression.encode("utf-8")

    def chars(offset: int | None) -> int | None:
        if offset is None:
            return None
        return len(raw[:offset].decode("utf-8", errors="ignore"))

    return chars(start), chars(end)


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
        # Python's own wording is English and says nothing a reader can act on.
        raise _syntax_error(expression, exc) from exc
    _check(tree, expression)
    return tree


def _syntax_error(expression: str, exc: SyntaxError) -> ExpressionError:
    """A Portuguese syntax error, pointing at where Python stopped reading."""
    size = len(expression)
    detail = exc.msg or ""
    offset = exc.offset or 0
    if "never closed" in detail:
        what = "um parêntese foi aberto e não foi fechado (falta um ')')."
        start = max(0, min(size - 1, offset - 1))
    elif "unmatched" in detail:
        what = "há um ')' sem o '(' correspondente."
        start = max(0, min(size - 1, offset - 1))
    elif offset <= 0 or offset > size:
        what = "a expressão termina incompleta; falta um número ou uma propriedade no fim."
        start = size
    else:
        what = (
            "confira operadores, parênteses e se cada variável está escrita como na "
            "lista de variáveis disponíveis."
        )
        start = offset - 1
    hint = " A potência se escreve ** (por exemplo, E ** 0.5), não ^." if "^" in expression else ""
    return ExpressionError(f"Sintaxe inválida: {what}{hint}", start=start, end=min(size, start + 1))


def _refuse(message: str, expression: str, node: ast.AST) -> ExpressionError:
    start, end = node_span(expression, node)
    return ExpressionError(message, start=start, end=end)


def _check(node: ast.AST, expression: str = "") -> None:
    """Recursively reject any node that is not explicitly whitelisted."""
    if isinstance(node, ast.Expression):
        _check(node.body, expression)
    elif isinstance(node, ast.BinOp):
        if isinstance(node.op, ast.BitXor):
            raise _refuse(
                "Operador ^ não é potência aqui: use ** (por exemplo, E ** 0.5).",
                expression,
                node,
            )
        if not isinstance(node.op, _BINARY_OPS):
            raise _refuse("Operador não permitido.", expression, node)
        _check(node.left, expression)
        _check(node.right, expression)
    elif isinstance(node, ast.UnaryOp):
        if not isinstance(node.op, _UNARY_OPS):
            raise _refuse("Operador unário não permitido.", expression, node)
        _check(node.operand, expression)
    elif isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise _refuse("Apenas números são permitidos como constantes.", expression, node)
    elif isinstance(node, ast.Name):
        if not isinstance(node.ctx, ast.Load):
            raise _refuse("Atribuição não é permitida.", expression, node)
    elif isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name) or node.func.id not in FUNCTIONS:
            raise _refuse(f"Função não permitida (use {_FUNCTION_LIST}).", expression, node)
        if node.keywords:
            raise _refuse("Argumentos nomeados não são permitidos.", expression, node)
        spec = FUNCTIONS[node.func.id]
        count = len(node.args)
        if count < spec.min_args or count > spec.max_args:
            raise _refuse(_arity_message(node.func.id, spec), expression, node)
        for arg in node.args:
            if isinstance(arg, ast.Starred):
                raise _refuse("Argumento desempacotado não é permitido.", expression, arg)
            _check(arg, expression)
    else:
        raise _refuse(
            "Construção não permitida: use só números, variáveis, + - * / ** e as funções "
            f"{_FUNCTION_LIST}.",
            expression,
            node,
        )


def _arity_message(name: str, spec: FunctionSpec) -> str:
    if spec.min_args == spec.max_args == 1:
        return f"{name}() aceita exatamente um argumento."
    if spec.min_args == spec.max_args:
        return f"{name}() aceita exatamente {spec.min_args} argumentos, separados por vírgula."
    return (
        f"{name}() aceita de {spec.min_args} a {spec.max_args} argumentos, "
        "separados por vírgula."
    )


def _collect_names(node: ast.AST, names: set[str]) -> None:
    """Collect variable names, skipping function-name positions and constants."""
    if isinstance(node, ast.Call):
        for arg in node.args:  # node.func is a function name, not a variable
            _collect_names(arg, names)
        return
    if isinstance(node, ast.Name):
        if node.id not in CONSTANTS:
            names.add(node.id)
        return
    for child in ast.iter_child_nodes(node):
        _collect_names(child, names)


def is_multiplicative(expression: str) -> bool:
    """Whether the expression has no addition or subtraction anywhere.

    A product, quotient, power or root of quantities with a true zero keeps a
    true zero, so a *ratio* between two of its values still means something
    (D-128). Adding or subtracting anything — even a constant — moves the zero
    (``T - 300``), and a percentage of such a number is a claim nobody checked.
    """
    return not any(
        isinstance(node, ast.BinOp) and isinstance(node.op, (ast.Add, ast.Sub))
        for node in ast.walk(parse(expression))
    )


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
        start, end = name_span(expression, unknown)
        raise ExpressionError(
            f"Variáveis desconhecidas: {', '.join(sorted(unknown))}", start=start, end=end
        )
    return used


def name_span(expression: str, names: set[str]) -> tuple[int | None, int | None]:
    """The span of the first occurrence of any of ``names`` used as a variable."""
    found = [
        node
        for node in ast.walk(parse(expression))
        if isinstance(node, ast.Name) and node.id in names
    ]
    if not found:
        return None, None
    first = min(found, key=lambda node: node.col_offset)
    return node_span(expression, first)


def _walk(node: ast.AST, variables: dict):
    """Evaluate a validated AST over a numeric domain (float or Quantity)."""
    if isinstance(node, ast.Expression):
        return _walk(node.body, variables)
    if isinstance(node, ast.Constant):
        return float(node.value)
    if isinstance(node, ast.Name):
        if node.id in CONSTANTS:
            return CONSTANTS[node.id]
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
        args = [_walk(arg, variables) for arg in node.args]
        return FUNCTIONS[node.func.id].implementation(*args)
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
    except (ValueError, TypeError) as exc:
        # ``ExpressionError`` is a ValueError and is re-raised as itself; the rest
        # is a math domain error (e.g. ``min`` of a complex intermediate).
        if isinstance(exc, ExpressionError):
            raise
        raise ExpressionError("Operação fora do domínio da função.") from exc
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
    return str(_without_numerical_residue(dimensionality))


def result_unit(expression: str, canonical_units: dict[str, str]) -> str:
    """The unit the index comes out in, from the canonical units of its inputs.

    ``E / rho`` over Pa and kg/m**3 gives ``"Pa * m ** 3 / kg"`` — the same
    spelling as a property's ``canonical_unit``, so the screen formats it with
    the formatter it already has. ``"dimensionless"`` for a pure number. Run
    :func:`result_dimension` first: this assumes the expression is consistent.
    """
    tree = parse(expression)
    quantities = {name: ureg.Quantity(1.0, unit) for name, unit in canonical_units.items()}
    try:
        result = _walk(tree, quantities)
    except Exception as exc:  # consistency was already checked; be defensive
        raise ExpressionError(f"Análise dimensional falhou: {exc}") from exc
    if not hasattr(result, "units") or result.dimensionless:
        return "dimensionless"
    reduced = result.to_reduced_units()
    terms = [
        (ureg.get_symbol(name), exponent)
        for name, exponent in dict(reduced.units._units).items()
        if abs(exponent) > _DIMENSION_EPSILON
    ]
    if not terms:
        return "dimensionless"

    def term(symbol: str, exponent: float) -> str:
        power = Fraction(abs(exponent)).limit_denominator(12)
        if power == 1:
            return symbol
        if power.denominator == 1:
            return f"{symbol}**{power.numerator}"
        return f"{symbol}**({power.numerator}/{power.denominator})"

    numerator = [term(symbol, e) for symbol, e in terms if e > 0]
    denominator = [term(symbol, e) for symbol, e in terms if e < 0]
    text = "*".join(numerator) or "1"
    if len(denominator) == 1:
        text += f"/{denominator[0]}"
    elif denominator:
        text += f"/({'*'.join(denominator)})"
    return text


#: Below this, an exponent is binary-arithmetic residue and not a dimension.
#: An expression with a fractional power — ``σy ** (2 / 3)``, the bending-strength
#: index — cannot cancel exactly against another such power, because ``2 / 3`` is
#: not a binary fraction. Combining that index with the load case that yields it
#: leaves ``[mass] / [length] ** 2.22e-16`` where the physics says ``[mass]``, and
#: that string is displayed to a reader. No physical dimension has an exponent
#: anywhere near this size, so dropping these terms cannot hide a real one: an
#: algebra error shows up as an exponent of order one.
_DIMENSION_EPSILON = 1e-9


def _without_numerical_residue(dimensionality):
    """Drop dimension terms whose exponent is floating-point noise."""
    cleaned = {
        name: exponent
        for name, exponent in dict(dimensionality).items()
        if abs(exponent) > _DIMENSION_EPSILON
    }
    if len(cleaned) == len(dict(dimensionality)):
        return dimensionality
    if not cleaned:
        return "dimensionless"
    return UnitsContainer(cleaned)
