"""Structural limits on what the AI layer is allowed to say.

The methodology forbids the AI from producing numeric values and from inventing
entities. Prompt wording cannot enforce that; this module can. Every provider
output — simulated or from a real model — passes through here before it reaches
a user, and anything that fails is **dropped and reported**, never silently
repaired.

Four rules:

1. **Entities must exist.** A proposed property, class, index or chart axis must
   name something already in the catalogue. The layer selects; it never creates.
2. **Numbers must be grounded.** Every number in a proposed constraint has to
   appear in the user's own statement. This is what makes "the AI does not
   compute" checkable rather than aspirational — and note that it also rejects
   *correct* arithmetic: a statement saying "300 °C" grounds ``300 degC`` but not
   ``573.15 kelvin``, because converting is the backend's job (and only the
   backend records the conversion trail).
3. **Units must be compatible.** A threshold's unit must convert to the
   property's canonical unit, or the constraint is meaningless.
4. **Prose must not introduce numbers.** An explanation may only mention figures
   that the deterministic pipeline actually produced.

Pure functions only: the catalogue arrives as plain data, so these rules are
testable without a database.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

from app.calculations.units import UnitError, to_canonical

# Relative tolerance when matching a proposed number against the text it should
# have come from. Tight enough that 300 does not match 301.
_MATCH_TOLERANCE = 1e-9

# Numeric literals, in the forms an engineering brief actually uses:
# grouped thousands ("1.234.567,89", "1 234,5") first, so the greedy grouped
# form wins over the plain form, then plain decimals and scientific notation.
_NUMBER_TOKEN = re.compile(
    r"[+-]?\d{1,3}(?:[.  ]\d{3})+(?:,\d+)?" r"|[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?"
)

# Operators that carry a numeric threshold.
_NUMERIC_OPERATORS = {"gt", "gte", "lt", "lte", "between", "outside"}
_RANGE_OPERATORS = {"between", "outside"}
_CLASS_OPERATORS = {"in_class", "not_in_class"}
_EXISTENCE_OPERATORS = {"exists", "not_exists"}


@dataclass(frozen=True)
class Catalogue:
    """What the AI is allowed to refer to.

    ``properties`` maps a property slug to its canonical unit; membership in the
    mapping is what makes a slug legitimate.
    """

    properties: dict[str, str]
    class_slugs: set[str]
    index_slugs: set[str]


def _interpretations(token: str) -> set[float]:
    """Every number a written token could plausibly denote.

    ``"1.500"`` is 1500 in pt-BR grouping and 1.5 in en-US decimal notation, and
    the statement does not say which. Grounding is generous about the reading
    and strict about the number having a source at all, so both are returned.
    """
    cleaned = token.replace(" ", "").replace(" ", "")
    candidates: set[str] = set()

    has_dot = "." in cleaned
    has_comma = "," in cleaned
    if has_dot and has_comma:
        # The rightmost separator is the decimal one; the other groups thousands.
        if cleaned.rfind(",") > cleaned.rfind("."):
            candidates.add(cleaned.replace(".", "").replace(",", "."))
        else:
            candidates.add(cleaned.replace(",", ""))
    elif has_comma:
        candidates.add(cleaned.replace(",", "."))  # decimal comma
        candidates.add(cleaned.replace(",", ""))  # thousands comma
    elif has_dot:
        candidates.add(cleaned)  # decimal point
        candidates.add(cleaned.replace(".", ""))  # thousands point
    else:
        candidates.add(cleaned)

    values: set[float] = set()
    for candidate in candidates:
        try:
            value = float(candidate)
        except ValueError:
            continue
        if math.isfinite(value):
            values.add(value)
    return values


def numeric_tokens(text: str) -> list[set[float]]:
    """Group the readings of each written numeral, one set per token.

    Callers that judge a *token* (is this figure legitimate?) must not treat its
    alternative readings as separate figures — "0.847" offers the readings 0.847
    and 847, and finding either one is enough to accept the token.
    """
    return [_interpretations(match.group()) for match in _NUMBER_TOKEN.finditer(text or "")]


def numbers_in(text: str) -> set[float]:
    """Return every number the text could be read as stating.

    Union over all tokens and all readings — the generous side of the
    asymmetry, used when the text is the *source* a proposal must be traced to.
    """
    values: set[float] = set()
    for readings in numeric_tokens(text):
        values.update(readings)
    return values


def is_grounded(value: float, sources: set[float]) -> bool:
    """True when ``value`` matches a number that actually appeared in the source."""
    return any(math.isclose(value, source, rel_tol=_MATCH_TOLERANCE) for source in sources)


def ungrounded_numbers(text: str, allowed: set[float]) -> list[float]:
    """Figures a piece of prose introduces that the computation never produced.

    Judged per written token: a token is only an invention when *no* reading of
    it was computed. Small integers are exempt throughout — ordinals and counts
    ("o 1º colocado", "3 de 5 candidatos") describe the result's shape rather
    than asserting a measurement.
    """
    invented: set[float] = set()
    for readings in numeric_tokens(text):
        if any(is_grounded(reading, allowed) for reading in readings):
            continue
        if all(reading.is_integer() and abs(reading) <= 100 for reading in readings):
            continue
        # Report the most conservative reading; this is a diagnostic message.
        invented.add(min(readings, key=abs))
    return sorted(invented)


def units_compatible(unit: str, canonical_unit: str) -> bool:
    """True when a threshold's unit can be converted to the canonical one."""
    try:
        to_canonical(1.0, unit, canonical_unit)
    except UnitError:
        return False
    return True


def check_property(slug: str, catalogue: Catalogue) -> str | None:
    """Return a rejection reason, or None when the property is legitimate."""
    if slug not in catalogue.properties:
        return f"Propriedade sugerida não existe no catálogo: '{slug}'."
    return None


def check_index(slug: str, catalogue: Catalogue) -> str | None:
    """Return a rejection reason, or None when the index is legitimate."""
    if slug not in catalogue.index_slugs:
        return f"Índice sugerido não existe no catálogo: '{slug}'."
    return None


def check_chart(x: str, y: str, catalogue: Catalogue) -> str | None:
    """Return a rejection reason, or None when both axes are legitimate."""
    for axis, slug in (("X", x), ("Y", y)):
        if slug not in catalogue.properties:
            return f"Eixo {axis} sugerido não existe no catálogo: '{slug}'."
    if x == y:
        return "Gráfico sugerido usa a mesma propriedade nos dois eixos."
    return None


def check_constraint(constraint, statement: str, catalogue: Catalogue) -> str | None:
    """Validate one proposed constraint against the catalogue and the statement.

    Args:
        constraint: a ``ConstraintIn``-shaped object (duck-typed so this module
            stays free of schema imports and remains a pure rule set).
        statement: the user's own text, the only legitimate source of numbers.
        catalogue: the entities the AI may refer to.

    Returns:
        A human-readable rejection reason, or ``None`` when the constraint is
        acceptable for the user to review.
    """
    operator = constraint.operator

    if operator in _CLASS_OPERATORS:
        if not constraint.class_slugs:
            return "Restrição de classe sem nenhuma classe indicada."
        unknown = sorted(set(constraint.class_slugs) - catalogue.class_slugs)
        if unknown:
            return f"Classes sugeridas não existem: {', '.join(unknown)}."
        return None

    if operator == "text_contains":
        if not (constraint.text or "").strip():
            return "Restrição de texto sem termo de busca."
        return None

    slug = constraint.property_slug
    if not slug or slug not in catalogue.properties:
        return f"Propriedade da restrição não existe no catálogo: '{slug}'."

    if operator in _EXISTENCE_OPERATORS:
        return None

    if operator not in _NUMERIC_OPERATORS:
        return f"Operador não reconhecido: '{operator}'."

    canonical = catalogue.properties[slug]
    unit = constraint.unit or canonical
    if not units_compatible(unit, canonical):
        return (
            f"Unidade '{unit}' é incompatível com a propriedade '{slug}' "
            f"(canônica: '{canonical}')."
        )

    if operator in _RANGE_OPERATORS:
        values = [constraint.value_min, constraint.value_max]
        if any(value is None for value in values):
            return "Faixa sugerida sem mínimo ou sem máximo."
    else:
        values = [constraint.value]
        if constraint.value is None:
            return f"Operador '{operator}' sugerido sem valor."

    sources = numbers_in(statement)
    for value in values:
        if not is_grounded(float(value), sources):  # type: ignore[arg-type]
            return (
                f"O valor {value} não aparece no enunciado. A camada de IA não "
                "produz nem converte números; informe-o no texto ou edite a "
                "restrição manualmente."
            )
    return None
