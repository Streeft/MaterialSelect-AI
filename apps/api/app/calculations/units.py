"""Unit handling built on Pint.

Responsibilities:
  * convert an input value from its original unit to a property's canonical unit,
    returning a traceable ``conversion_method`` string;
  * validate that a unit matches an expected physical dimension, rejecting
    incompatible units instead of silently coercing them;
  * parse numbers written with a decimal comma or in scientific notation, as they
    appear in the professor's future spreadsheet.

A single shared ``UnitRegistry`` is used process-wide (creating one per call is
expensive and breaks unit identity comparisons).
"""

from __future__ import annotations

import re

from pint import UnitRegistry
from pint.errors import DimensionalityError, UndefinedUnitError

# One registry for the whole process.
ureg = UnitRegistry()


class UnitError(ValueError):
    """Raised for any unit-related problem (unknown unit or wrong dimension)."""


# Matches an optional sign, digits with optional decimal comma/point, and an
# optional scientific-notation exponent. Used to normalise "69,5" and "1,2e3".
_NUMBER_RE = re.compile(r"^[+-]?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d+)?(?:[eE][+-]?\d+)?$")


def parse_decimal_comma(raw: str | float | int) -> float:
    """Parse a number that may use a decimal comma or scientific notation.

    Examples::

        parse_decimal_comma("69,5")   -> 69.5
        parse_decimal_comma("1,2e3")  -> 1200.0
        parse_decimal_comma("2.5")    -> 2.5
        parse_decimal_comma(42)       -> 42.0

    Raises:
        UnitError: if ``raw`` cannot be interpreted as a number.
    """
    if isinstance(raw, (int, float)):
        return float(raw)

    text = raw.strip()
    if not text or not _NUMBER_RE.match(text):
        raise UnitError(f"Valor numérico inválido: {raw!r}")

    # Remove thousands separators expressed as spaces, then normalise the decimal
    # comma to a point. We intentionally do not support ambiguous "1.234,56"
    # grouping here beyond the space form; the import wizard will handle locale
    # explicitly in a later phase.
    text = text.replace(" ", "")
    if "," in text:
        text = text.replace(".", "") if text.count(".") and text.rfind(",") > text.rfind(".") else text
        text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError as exc:  # pragma: no cover - guarded by regex above
        raise UnitError(f"Valor numérico inválido: {raw!r}") from exc


def validate_dimension(unit: str, expected_dimension: str) -> bool:
    """Return True if ``unit`` has the ``expected_dimension``.

    ``expected_dimension`` is a Pint dimensionality string such as
    ``"[mass] / [length] ** 3"``. An empty expected dimension means "no
    constraint" and always passes (used for dimensionless / unspecified
    properties).

    Raises:
        UnitError: if the unit is unknown to Pint.
    """
    if not expected_dimension:
        return True
    try:
        quantity = ureg.Quantity(1.0, unit)
    except (UndefinedUnitError, AssertionError, ValueError) as exc:
        raise UnitError(f"Unidade desconhecida: {unit!r}") from exc
    return quantity.check(expected_dimension)


def to_canonical(
    value: float, from_unit: str, canonical_unit: str
) -> tuple[float, str]:
    """Convert ``value`` from ``from_unit`` to ``canonical_unit``.

    Returns a ``(normalized_value, conversion_method)`` tuple, where
    ``conversion_method`` is a human-readable, reproducible trail such as
    ``"pint:GPa->Pa"``. When the units are identical the value is returned
    unchanged with an ``"identity"`` method.

    Raises:
        UnitError: if either unit is unknown or the two units are dimensionally
            incompatible (e.g. converting a length into a pressure).
    """
    if from_unit == canonical_unit:
        return value, f"identity:{canonical_unit}"
    try:
        converted = ureg.Quantity(value, from_unit).to(canonical_unit)
    except (UndefinedUnitError, ValueError) as exc:
        raise UnitError(f"Unidade desconhecida em conversão {from_unit!r}->{canonical_unit!r}") from exc
    except DimensionalityError as exc:
        raise UnitError(
            f"Unidades incompatíveis: {from_unit!r} não pode ser convertido para {canonical_unit!r}"
        ) from exc
    return float(converted.magnitude), f"pint:{from_unit}->{canonical_unit}"
