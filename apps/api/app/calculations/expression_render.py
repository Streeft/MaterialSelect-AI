"""Readable renderings of a performance-index expression (D-191).

An expression is stored and evaluated in its grammar form —
``sqrt(modulo_young) / densidade`` — and that form is backend information: a
reader should see "√(Módulo de Young) / Densidade", or the same thing typeset
as a fraction. This module turns the AST that :func:`expressions.parse` already
validated into three presentations, all from the tree and never by string
substitution over the source text:

* :func:`to_latex` — LaTeX for KaTeX, with each variable written as its friendly
  name (``\\text{Módulo de Young}``) or, on request, as its symbol (``E``);
* :func:`to_text` — the same reading in plain Unicode, for places that cannot
  typeset (a Plotly axis title, a table caption, a TSV header);
* :func:`to_tree` — a JSON-able tree, so a client that wants to draw the
  structure never has to parse the grammar itself.

Nothing here computes a value. Numbers are printed as written, with the pt-BR
decimal comma (D-30).
"""

from __future__ import annotations

import ast
import unicodedata
from collections.abc import Iterable
from dataclasses import dataclass

from app.calculations.expressions import CONSTANTS, ExpressionError, parse, safe_variable


@dataclass(frozen=True)
class VariableLabel:
    """How one expression variable is shown: its property's name and symbol."""

    name: str
    symbol: str | None = None


# --- precedence ------------------------------------------------------------
# Higher binds tighter. A child is parenthesised when it binds looser than its
# parent requires; ``\frac`` and ``\sqrt`` group by themselves and never need it.
_ADD = 1
_MUL = 2
_UNARY = 3
_POW = 4
_ATOM = 5

_GREEK = {
    "α": r"\alpha",
    "β": r"\beta",
    "γ": r"\gamma",
    "δ": r"\delta",
    "ε": r"\varepsilon",
    "ζ": r"\zeta",
    "η": r"\eta",
    "θ": r"\theta",
    "κ": r"\kappa",
    "λ": r"\lambda",
    "μ": r"\mu",
    "ν": r"\nu",
    "ξ": r"\xi",
    "π": r"\pi",
    "ρ": r"\rho",
    "σ": r"\sigma",
    "τ": r"\tau",
    "φ": r"\varphi",
    "χ": r"\chi",
    "ψ": r"\psi",
    "ω": r"\omega",
    "Γ": r"\Gamma",
    "Δ": r"\Delta",
    "Θ": r"\Theta",
    "Λ": r"\Lambda",
    "Σ": r"\Sigma",
    "Φ": r"\Phi",
    "Ψ": r"\Psi",
    "Ω": r"\Omega",
}

_SUBSCRIPT_DIGITS = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")
_SUPERSCRIPT_DIGITS = str.maketrans("0123456789-", "⁰¹²³⁴⁵⁶⁷⁸⁹⁻")

_TEXT_ESCAPES = {
    "\\": r"\textbackslash{}",
    "{": r"\{",
    "}": r"\}",
    "$": r"\$",
    "&": r"\&",
    "#": r"\#",
    "%": r"\%",
    "_": r"\_",
    "^": r"\textasciicircum{}",
    "~": r"\textasciitilde{}",
}


def escape_text(text: str) -> str:
    """Escape ``text`` for use inside ``\\text{...}``."""
    return "".join(_TEXT_ESCAPES.get(char, char) for char in text)


# --- numbers ---------------------------------------------------------------


def _number_text(value: int | float) -> str:
    """A literal as written, with the pt-BR decimal comma: ``0.5`` → ``0,5``."""
    if isinstance(value, float) and value.is_integer() and abs(value) < 1e15:
        value = int(value)
    raw = repr(value)
    return raw.replace(".", ",")


def _number_latex(value: int | float) -> str:
    text = _number_text(value)
    if "e" in text:  # scientific notation from repr: 1e-06 → 1 × 10^{-6}
        mantissa, exponent = text.split("e")
        exponent_value = int(exponent)
        if mantissa in ("1", "1,0"):
            return f"10^{{{exponent_value}}}"
        return f"{mantissa.replace(',', '{,}')} \\times 10^{{{exponent_value}}}"
    return text.replace(",", "{,}")


def _number_plain(value: int | float) -> str:
    text = _number_text(value)
    if "e" in text:
        mantissa, exponent = text.split("e")
        power = f"10{str(int(exponent)).translate(_SUPERSCRIPT_DIGITS)}"
        return power if mantissa in ("1", "1,0") else f"{mantissa} × {power}"
    return text


# --- symbols ---------------------------------------------------------------


def _letter_latex(text: str) -> str:
    """One run of characters as math: Greek to commands, dotted letters to \\dot."""
    out: list[str] = []
    for char in text:
        if char in _GREEK:
            out.append(_GREEK[char] + " ")
            continue
        decomposed = unicodedata.normalize("NFD", char)
        if len(decomposed) == 2 and decomposed[1] == "̇" and decomposed[0].isascii():
            out.append(rf"\dot{{{decomposed[0]}}}")
            continue
        if char.isascii():
            out.append(escape_text(char) if not char.isalnum() else char)
        else:
            out.append(rf"\text{{{escape_text(char)}}}")
    return "".join(out).strip()


def symbol_latex(symbol: str) -> str:
    """Typeset a catalogue symbol the way Ashby writes it.

    ``σy`` → ``\\sigma_{\\mathrm{y}}``, ``Tmax`` → ``T_{\\mathrm{max}}``,
    ``K_IC`` → ``K_{\\mathrm{IC}}``, ``CO₂m`` → ``\\mathrm{CO_{2}m}``. A symbol
    that starts with two capitals (``HV``, ``CO₂m``) is an abbreviation and is
    kept whole; otherwise the first letter is the quantity and the rest its
    subscript.
    """
    symbol = symbol.strip()
    if "_" in symbol:
        base, sub = symbol.split("_", 1)
    elif len(symbol) > 1 and not (symbol[1].isupper()):
        base, sub = symbol[0], symbol[1:]
    else:
        base, sub = symbol, ""

    def run(text: str) -> str:
        # Unicode subscript digits inside a run become real subscripts.
        parts: list[str] = []
        for char in text:
            translated = char.translate(_SUBSCRIPT_DIGITS)
            if translated != char:
                parts.append(f"_{{{translated}}}")
            else:
                parts.append(_letter_latex(char))
        return "".join(parts)

    base_latex = run(base)
    if len(base) > 1 and all(c.isascii() or c in "₀₁₂₃₄₅₆₇₈₉" for c in base):
        base_latex = rf"\mathrm{{{base_latex}}}"
    if not sub:
        return base_latex
    sub_text = sub.translate(_SUBSCRIPT_DIGITS)
    sub_latex = (
        rf"\mathrm{{{escape_text(sub_text)}}}" if sub_text.isascii() else _letter_latex(sub_text)
    )
    return f"{base_latex}_{{{sub_latex}}}"


# --- LaTeX -----------------------------------------------------------------


class _Latex:
    def __init__(self, labels: dict[str, VariableLabel], use_symbols: bool) -> None:
        self.labels = labels
        self.use_symbols = use_symbols

    def render(self, node: ast.AST) -> tuple[str, int]:
        if isinstance(node, ast.Expression):
            return self.render(node.body)
        if isinstance(node, ast.Constant):
            return _number_latex(node.value), _ATOM
        if isinstance(node, ast.Name):
            return self.name(node.id), _ATOM
        if isinstance(node, ast.UnaryOp):
            operand, prec = self.render(node.operand)
            if prec <= _ADD:
                operand = rf"\left({operand}\right)"
            sign = "-" if isinstance(node.op, ast.USub) else "+"
            return f"{sign}{operand}", _UNARY
        if isinstance(node, ast.BinOp):
            return self.binary(node)
        if isinstance(node, ast.Call):
            return self.call(node)
        raise ValueError(f"unexpected node {type(node).__name__}")  # pragma: no cover

    def name(self, identifier: str) -> str:
        if identifier == "pi":
            return r"\pi"
        if identifier == "e":
            return r"\mathrm{e}"
        label = self.labels.get(identifier)
        if label is None:
            return rf"\mathtt{{{escape_text(identifier)}}}"
        if self.use_symbols and label.symbol:
            return symbol_latex(label.symbol)
        return rf"\text{{{escape_text(label.name)}}}"

    def wrap(self, text: str, prec: int, minimum: int) -> str:
        return rf"\left({text}\right)" if prec < minimum else text

    def power(self, base_node: ast.AST, exponent_node: ast.AST | None, exponent: str = ""):
        base, base_prec = self.render(base_node)
        if _is_spaced_name(base_node, self.labels, self.use_symbols):
            base_prec = _POW  # "Módulo de Young^½" would read as Young alone
        base = self.wrap(base, base_prec, _ATOM)
        if exponent_node is not None:
            exponent = self.exponent(exponent_node)
        return f"{base}^{{{exponent}}}", _POW

    def exponent(self, node: ast.AST) -> str:
        """An exponent; a ratio of two numbers stays inline (``E^{1/2}``, as Ashby)."""
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
            left, right = node.left, node.right
            if _is_number(left) and _is_number(right):
                return f"{self.render(left)[0]}/{self.render(right)[0]}"
        return self.render(node)[0]

    def binary(self, node: ast.BinOp) -> tuple[str, int]:
        op = node.op
        if isinstance(op, ast.Div):
            # A fraction groups itself everywhere except under an exponent,
            # where (a/b)^2 must keep its parentheses: hence _POW, not _ATOM.
            return rf"\frac{{{self.render(node.left)[0]}}}{{{self.render(node.right)[0]}}}", _POW
        if isinstance(op, ast.Pow):
            return self.power(node.left, node.right)
        left, left_prec = self.render(node.left)
        right, right_prec = self.render(node.right)
        if isinstance(op, ast.Mult):
            return (
                rf"{self.wrap(left, left_prec, _MUL)} \cdot {self.wrap(right, right_prec, _MUL)}",
                _MUL,
            )
        sign = "+" if isinstance(op, ast.Add) else "-"
        # A sum on the right of a minus keeps its parentheses: a − (b + c).
        right = self.wrap(right, right_prec, _MUL) if sign == "-" else right
        return f"{left} {sign} {right}", _ADD

    def call(self, node: ast.Call) -> tuple[str, int]:
        name = node.func.id  # type: ignore[union-attr]  # validated by parse()
        args = node.args
        if name == "sqrt":
            return rf"\sqrt{{{self.render(args[0])[0]}}}", _ATOM
        if name == "cbrt":
            return rf"\sqrt[3]{{{self.render(args[0])[0]}}}", _ATOM
        if name == "abs":
            return rf"\left|{self.render(args[0])[0]}\right|", _ATOM
        if name == "sq":
            return self.power(args[0], None, "2")
        if name == "pow":
            return self.power(args[0], args[1])
        if name == "inv":
            return rf"\frac{{1}}{{{self.render(args[0])[0]}}}", _POW
        if name == "exp":
            return rf"\mathrm{{e}}^{{{self.render(args[0])[0]}}}", _POW
        inner = r";\ ".join(self.render(arg)[0] for arg in args)
        command = {"ln": r"\ln", "log10": r"\log_{10}", "min": r"\min", "max": r"\max"}[name]
        return rf"{command}\left({inner}\right)", _ATOM


def _is_spaced_name(node: ast.AST, labels: dict[str, VariableLabel], use_symbols: bool) -> bool:
    """Whether ``node`` is a variable shown as a name with more than one word."""
    if not isinstance(node, ast.Name) or node.id not in labels:
        return False
    label = labels[node.id]
    if use_symbols and label.symbol:
        return False
    return any(char.isspace() for char in label.name.strip())


def _is_number(node: ast.AST) -> bool:
    if isinstance(node, ast.UnaryOp):
        return _is_number(node.operand)
    return isinstance(node, ast.Constant)


def to_latex(
    expression: str, labels: dict[str, VariableLabel], *, use_symbols: bool = False
) -> str:
    """LaTeX for ``expression``, each variable shown by name (or by symbol)."""
    return _Latex(labels, use_symbols).render(parse(expression))[0]


# --- plain text ------------------------------------------------------------

_PLAIN_FUNCTIONS = {"ln": "ln", "log10": "log₁₀", "min": "mín", "max": "máx", "exp": "exp"}


class _Plain:
    def __init__(self, labels: dict[str, VariableLabel]) -> None:
        self.labels = labels

    def render(self, node: ast.AST) -> tuple[str, int]:
        if isinstance(node, ast.Expression):
            return self.render(node.body)
        if isinstance(node, ast.Constant):
            return _number_plain(node.value), _ATOM
        if isinstance(node, ast.Name):
            if node.id == "pi":
                return "π", _ATOM
            if node.id == "e":
                return "e", _ATOM
            label = self.labels.get(node.id)
            return (label.name if label else node.id), _ATOM
        if isinstance(node, ast.UnaryOp):
            operand, prec = self.render(node.operand)
            operand = f"({operand})" if prec <= _MUL else operand
            return ("−" if isinstance(node.op, ast.USub) else "+") + operand, _UNARY
        if isinstance(node, ast.BinOp):
            return self.binary(node)
        if isinstance(node, ast.Call):
            return self.call(node)
        raise ValueError(f"unexpected node {type(node).__name__}")  # pragma: no cover

    @staticmethod
    def wrap(text: str, prec: int, minimum: int) -> str:
        return f"({text})" if prec < minimum else text

    def exponent(self, node: ast.AST) -> tuple[str, int]:
        """An exponent; a ratio of two numbers is written tight: ``^(1/2)``."""
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
            if _is_number(node.left) and _is_number(node.right):
                return f"{self.render(node.left)[0]}/{self.render(node.right)[0]}", _MUL
        return self.render(node)

    def power(self, base_node: ast.AST, exponent: str, exponent_prec: int):
        base, base_prec = self.render(base_node)
        if _is_spaced_name(base_node, self.labels, False):
            base_prec = _POW
        base = self.wrap(base, base_prec, _ATOM)
        if exponent == "2" and exponent_prec == _ATOM:
            return f"{base}²", _POW
        if exponent == "3" and exponent_prec == _ATOM:
            return f"{base}³", _POW
        return f"{base}^{self.wrap(exponent, exponent_prec, _ATOM)}", _POW

    def binary(self, node: ast.BinOp) -> tuple[str, int]:
        op = node.op
        if isinstance(op, ast.Pow):
            exponent, exponent_prec = self.exponent(node.right)
            return self.power(node.left, exponent, exponent_prec)
        left, left_prec = self.render(node.left)
        right, right_prec = self.render(node.right)
        if isinstance(op, (ast.Mult, ast.Div)):
            symbol = "×" if isinstance(op, ast.Mult) else "/"
            # Division is not associative: a / (b × c) keeps its parentheses.
            right_min = _MUL + 1 if isinstance(op, ast.Div) else _MUL
            return (
                f"{self.wrap(left, left_prec, _MUL)} {symbol} "
                f"{self.wrap(right, right_prec, right_min)}",
                _MUL,
            )
        sign = "+" if isinstance(op, ast.Add) else "−"
        right = self.wrap(right, right_prec, _MUL) if sign == "−" else right
        return f"{left} {sign} {right}", _ADD

    def call(self, node: ast.Call) -> tuple[str, int]:
        name = node.func.id  # type: ignore[union-attr]
        args = node.args
        if name == "sqrt":
            return f"√({self.render(args[0])[0]})", _ATOM
        if name == "cbrt":
            return f"∛({self.render(args[0])[0]})", _ATOM
        if name == "abs":
            return f"|{self.render(args[0])[0]}|", _ATOM
        if name == "sq":
            return self.power(args[0], "2", _ATOM)
        if name == "pow":
            exponent, exponent_prec = self.exponent(args[1])
            return self.power(args[0], exponent, exponent_prec)
        if name == "inv":
            inner, prec = self.render(args[0])
            return f"1 / {self.wrap(inner, prec, _MUL + 1)}", _MUL
        inner = "; ".join(self.render(arg)[0] for arg in args)
        return f"{_PLAIN_FUNCTIONS[name]}({inner})", _ATOM


def to_text(expression: str, labels: dict[str, VariableLabel]) -> str:
    """The expression in plain Unicode, each variable by its friendly name."""
    return _Plain(labels).render(parse(expression))[0]


# --- tree ------------------------------------------------------------------

_OPERATORS = {
    ast.Add: "+",
    ast.Sub: "-",
    ast.Mult: "*",
    ast.Div: "/",
    ast.Pow: "**",
    ast.UAdd: "+",
    ast.USub: "-",
}


def to_tree(expression: str) -> dict:
    """The validated AST as plain JSON: number, constant, variable, unary, binary, call."""

    def walk(node: ast.AST) -> dict:
        if isinstance(node, ast.Expression):
            return walk(node.body)
        if isinstance(node, ast.Constant):
            return {"kind": "number", "value": float(node.value)}
        if isinstance(node, ast.Name):
            if node.id in CONSTANTS:
                return {"kind": "constant", "name": node.id}
            return {"kind": "variable", "name": node.id}
        if isinstance(node, ast.UnaryOp):
            return {"kind": "unary", "op": _OPERATORS[type(node.op)], "operand": walk(node.operand)}
        if isinstance(node, ast.BinOp):
            return {
                "kind": "binary",
                "op": _OPERATORS[type(node.op)],
                "left": walk(node.left),
                "right": walk(node.right),
            }
        if isinstance(node, ast.Call):
            return {
                "kind": "call",
                "function": node.func.id,  # type: ignore[union-attr]
                "args": [walk(arg) for arg in node.args],
            }
        raise ValueError(f"unexpected node {type(node).__name__}")  # pragma: no cover

    return walk(parse(expression))


def normalized(expression: str) -> str:
    """The canonical spelling of ``expression`` (spacing and redundant parens)."""
    return ast.unparse(parse(expression))


# --- catalogue labels -------------------------------------------------------


def variable_labels(definitions: Iterable) -> dict[str, VariableLabel]:
    """``{grammar variable: VariableLabel}`` for a catalogue of definitions."""
    return {safe_variable(d.slug): VariableLabel(name=d.name, symbol=d.symbol) for d in definitions}


def friendly_label(expression: str, definitions: Iterable) -> str:
    """The plain-text reading of ``expression``, or the expression if it does not parse.

    For a server-side caption (an axis title, a column name) that would
    otherwise print the grammar form. Never raises: a caption is not where an
    expression is validated.
    """
    try:
        return to_text(expression, variable_labels(definitions))
    except ExpressionError:
        return expression
