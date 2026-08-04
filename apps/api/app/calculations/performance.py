"""Evaluation of a performance index for a single material.

Shared by the selection pipeline and the property maps so both report the *same*
value and the *same* reason when the index is undefined. Keeping this in one
place is what makes "a saved study and a chart agree" a property of the code
rather than a coincidence.

The rule it enforces: an index is undefined — never zero, never estimated —
whenever the material lacks any property the expression references, or the
arithmetic itself fails (division by zero, complex result, overflow).
"""

from __future__ import annotations

from dataclasses import dataclass

from app.calculations.expressions import ExpressionError, evaluate


@dataclass(frozen=True)
class IndexEvaluation:
    """Outcome of evaluating an index for one material."""

    value: float | None
    undefined_reason: str | None = None

    @property
    def is_defined(self) -> bool:
        return self.value is not None


def evaluate_index(
    expression: str, used_variables: set[str], variables: dict[str, float]
) -> IndexEvaluation:
    """Evaluate ``expression`` for one material.

    Args:
        expression: an already-validated index expression.
        used_variables: the variable names the expression actually references.
        variables: the material's canonical values, keyed by safe variable name.

    Returns:
        The numeric value, or an :class:`IndexEvaluation` carrying the reason the
        index could not be computed for this material.
    """
    missing = used_variables - set(variables)
    if missing:
        return IndexEvaluation(
            value=None, undefined_reason=f"Dados ausentes: {', '.join(sorted(missing))}"
        )
    try:
        return IndexEvaluation(
            value=evaluate(expression, {k: variables[k] for k in used_variables})
        )
    except ExpressionError as exc:
        return IndexEvaluation(value=None, undefined_reason=str(exc))
