"""The expression calculator's backend (D-191): palette and description.

Two read-only answers, neither of which evaluates an index over a material:

* :meth:`ExpressionService.palette` — the properties (or process attributes)
  an expression may name, with name, symbol, unit and category, plus the
  functions and constants of the grammar. The calculator draws its cards and
  keys from this, so a property added to the catalogue appears without a
  client release, and a function added to the grammar gets its key.
* :meth:`ExpressionService.describe` — for one expression: the friendly LaTeX
  (generated from the AST, ``expression_render``), the plain-text label, the
  dimension and unit, the variables used, and every refusal with its position.

Evaluating stays where it was (``/selection/index``, the chart and comparison
services); validation here applies the same rules in the same order, so an
expression this service calls valid is one those endpoints accept.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.calculations.expression_render import (
    escape_text,
    normalized,
    symbol_latex,
    to_latex,
    to_text,
    to_tree,
    variable_labels,
)
from app.calculations.expressions import (
    CONSTANTS,
    FUNCTIONS,
    ExpressionError,
    is_multiplicative,
    name_span,
    parse,
    result_dimension,
    result_unit,
    safe_variable,
    variables_in,
)
from app.models.enums import ProcessAttributeKind
from app.models.user import User
from app.repositories.ordinal_repository import OrdinalRepository
from app.repositories.selection_repository import SelectionRepository
from app.schemas.expression import (
    ExpressionConstantOut,
    ExpressionDescribeOut,
    ExpressionFunctionOut,
    ExpressionIssueOut,
    ExpressionPaletteOut,
    ExpressionUniverse,
    ExpressionVariableOut,
)

#: Category of every process attribute in the palette: the table has none.
PROCESS_CATEGORY = "PROCESSO"

#: How each function key reads, in the order the keypad shows them.
_FUNCTION_HELP: dict[str, tuple[str, str, str]] = {
    # name: (key label, LaTeX of the key, what it does)
    "sqrt": ("√x", r"\sqrt{x}", "Raiz quadrada. Ashby: E^{1/2}/ρ é a viga leve e rígida."),
    "cbrt": ("∛x", r"\sqrt[3]{x}", "Raiz cúbica. Ashby: E^{1/3}/ρ é a placa leve e rígida."),
    "sq": ("x²", r"x^{2}", "Quadrado do valor."),
    "pow": ("xʸ", r"x^{y}", "Potência: o primeiro valor elevado ao segundo."),
    "inv": ("1/x", r"\frac{1}{x}", "Inverso do valor (um sobre x)."),
    "abs": ("|x|", r"\left|x\right|", "Valor absoluto (módulo), sem sinal."),
    "ln": ("ln", r"\ln(x)", "Logaritmo natural. Só para valor adimensional e positivo."),
    "log10": (
        "log",
        r"\log_{10}(x)",
        "Logaritmo na base 10. Só para valor adimensional e positivo.",
    ),
    "exp": ("eˣ", r"\mathrm{e}^{x}", "Exponencial. Só para valor adimensional."),
    "min": ("mín", r"\min(a;\ b)", "O menor de dois ou mais valores de mesma dimensão."),
    "max": ("máx", r"\max(a;\ b)", "O maior de dois ou mais valores de mesma dimensão."),
}

_CONSTANT_HELP: dict[str, tuple[str, str, str]] = {
    "pi": (r"\pi", "π", "A constante π ≈ 3,14159."),
    "e": (r"\mathrm{e}", "e", "A constante de Euler e ≈ 2,71828."),
}


class ExpressionService:
    def __init__(self, db: Session, user: User | None) -> None:
        viewer_id = user.id if user is not None else None
        self.repo = SelectionRepository(db, viewer_id)
        self.ordinal_repo = OrdinalRepository(db, viewer_id)

    # --- catalogue ---------------------------------------------------------

    def _definitions(self, universe: ExpressionUniverse) -> list:
        """Definitions an expression may name: numeric ones only."""
        if universe == "process":
            return [
                a
                for a in self.repo.list_process_attributes()
                if a.kind is not ProcessAttributeKind.DISCRETO and a.canonical_unit
            ]
        return list(self.repo.list_properties())

    @staticmethod
    def _variable_out(definition, universe: ExpressionUniverse) -> ExpressionVariableOut:
        category = getattr(definition, "category", None)
        return ExpressionVariableOut(
            variable=safe_variable(definition.slug),
            slug=definition.slug,
            name=definition.name,
            symbol=definition.symbol,
            symbol_latex=(
                symbol_latex(definition.symbol)
                if definition.symbol
                else rf"\text{{{escape_text(definition.name)}}}"
            ),
            unit=definition.canonical_unit,
            display_unit=getattr(definition, "display_unit", None),
            category=(
                PROCESS_CATEGORY
                if universe == "process" or category is None
                else getattr(category, "value", str(category))
            ),
            description=definition.description,
        )

    def palette(self, universe: ExpressionUniverse) -> ExpressionPaletteOut:
        variables = sorted(
            (self._variable_out(d, universe) for d in self._definitions(universe)),
            key=lambda v: (v.category, v.name.casefold()),
        )
        return ExpressionPaletteOut(
            universe=universe,
            variables=variables,
            functions=[
                ExpressionFunctionOut(
                    name=name,
                    min_args=FUNCTIONS[name].min_args,
                    max_args=FUNCTIONS[name].max_args,
                    label=label,
                    latex=latex,
                    description=description,
                )
                for name, (label, latex, description) in _FUNCTION_HELP.items()
                if name in FUNCTIONS
            ],
            constants=[
                ExpressionConstantOut(name=name, latex=latex, label=label, description=description)
                for name, (latex, label, description) in _CONSTANT_HELP.items()
                if name in CONSTANTS
            ],
        )

    # --- describe ----------------------------------------------------------

    def describe(self, expression: str, universe: ExpressionUniverse) -> ExpressionDescribeOut:
        out = ExpressionDescribeOut(expression=expression, valid=False)
        try:
            parse(expression)
        except ExpressionError as exc:
            out.errors.append(_issue(exc))
            return out

        definitions = self._definitions(universe)
        by_variable = {safe_variable(d.slug): d for d in definitions}
        labels = variable_labels(definitions)
        out.normalized = normalized(expression)
        out.latex = to_latex(expression, labels)
        out.latex_symbols = to_latex(expression, labels, use_symbols=True)
        out.label = to_text(expression, labels)
        out.tree = to_tree(expression)
        out.is_multiplicative = is_multiplicative(expression)

        used = variables_in(expression)
        out.variables = [
            self._variable_out(by_variable[v], universe)
            for v in sorted(used, key=lambda name: expression.find(name))
            if v in by_variable
        ]

        unknown = used - set(by_variable)
        if unknown:
            out.errors.append(self._unknown_issue(expression, unknown, universe))
            return out

        units = {v: by_variable[v].canonical_unit for v in used}
        try:
            out.dimension = result_dimension(expression, units)
            out.unit = result_unit(expression, units)
        except ExpressionError as exc:
            out.errors.append(_issue(exc))
            return out
        out.valid = True
        return out

    def _unknown_issue(
        self, expression: str, unknown: set[str], universe: ExpressionUniverse
    ) -> ExpressionIssueOut:
        """Name the refusal the evaluating endpoints would give, by name."""
        start, end = name_span(expression, unknown)
        if universe == "material":
            ordinal = {safe_variable(d.slug): d.name for d in self.ordinal_repo.list_definitions()}
            hit = sorted(ordinal[v] for v in unknown if v in ordinal)
            if hit:
                return ExpressionIssueOut(
                    message=(
                        "Propriedade ordinal não entra em expressão de índice, porque um nível "
                        f"não tem magnitude: {', '.join(hit)}."
                    ),
                    start=start,
                    end=end,
                )
        if universe == "process":
            discrete = {
                safe_variable(a.slug): a.name
                for a in self.repo.list_process_attributes()
                if a.kind is ProcessAttributeKind.DISCRETO
            }
            hit = sorted(discrete[v] for v in unknown if v in discrete)
            if hit:
                return ExpressionIssueOut(
                    message=(
                        "Atributo discreto não entra em expressão de índice, porque não tem "
                        f"magnitude: {', '.join(hit)}."
                    ),
                    start=start,
                    end=end,
                )
        return ExpressionIssueOut(
            message=(
                f"Variáveis desconhecidas: {', '.join(sorted(unknown))}. "
                "Escolha a propriedade na lista em vez de digitar o nome."
            ),
            start=start,
            end=end,
        )


def _issue(exc: ExpressionError) -> ExpressionIssueOut:
    return ExpressionIssueOut(message=str(exc), start=exc.start, end=exc.end)
