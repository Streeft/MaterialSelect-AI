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

import math
import re
from tokenize import TokenError

from pint import UnitRegistry
from pint.errors import DimensionalityError, UndefinedUnitError

# One registry for the whole process.
ureg = UnitRegistry()


class UnitError(ValueError):
    """Raised for any unit-related problem (unknown unit or wrong dimension)."""


# A unit string is free text a person types, and Pint answers a malformed one
# with whatever its parser happens to raise on the way down: ``AssertionError``
# for an operator left without an operand ("m**", "1/", "$"),
# ``tokenize.TokenError`` for a parenthesis never closed ("(m"),
# ``UndefinedUnitError`` (an ``AttributeError``) for a name it does not know,
# a plain ``TypeError`` for a hyphenated string ("not-a-real-unit"): Pint parses
# a unit as an arithmetic expression, so the hyphens read as subtraction between
# two unresolved terms, and ``ValueError`` for the rest. They share no common
# base — ``UndefinedUnitError`` descends from ``AttributeError`` and
# ``DimensionalityError`` from ``TypeError`` too, which is exactly why callers
# that also catch ``DimensionalityError`` must catch it *first*: this tuple's
# plain ``TypeError`` would otherwise swallow it under the wrong message. Every
# one of these left uncaught leaves the service layer as HTTP 500: the user
# made a typo and the application answers with a defect of its own.
_UNIT_PARSE_FAILURES = (UndefinedUnitError, AssertionError, TokenError, TypeError, ValueError)


# Pint parses a unit by *evaluating* it as an arithmetic expression, which means
# a ten-character string decides how much work the process does: "9**9**9" is
# 9**387420489, an integer of some 370 million digits, and the call never
# returns — one core pegged and memory climbing, from a field a person types
# during an import. Neither a length limit nor a bound on the exponent alone
# closes it: ten characters are enough for the first, and the chained form keeps
# every digit small. So the guard checks the *shape*: every power operator must
# be followed by a plain literal exponent — a number, or a fraction in
# parentheses — and nothing else. That admits every unit a material has
# (kg/m**3, MPa*m**0.5, m**(1/2), m**-3) and refuses arithmetic.
_MAX_UNIT_LENGTH = 64
_MAX_ABS_EXPONENT = 12.0

# The operand of "**", anchored so that what follows it is the end of the
# string or a separator — never another power operator, which is what makes the
# chained form fail to match and be counted as malformed below.
_POWER_OPERAND_RE = re.compile(
    r"""\*\*\s*
        (?:
            (?P<plain>[+-]?\d+(?:\.\d+)?)             # m**3, m**-3, m**0.5
          | \(\s*(?P<num>[+-]?\d+(?:\.\d+)?)          # m**(1/2), m**(3)
            \s*(?:/\s*(?P<den>\d+(?:\.\d+)?)\s*)?\)
        )
        \s*(?=$|\*(?!\*)|[/)\s])
    """,
    re.VERBOSE,
)


def _reject_pathological_unit(unit: str) -> None:
    """Refuse a unit string that would make Pint's parser do unbounded work.

    Raises:
        UnitError: if the string is absurdly long, or contains a power whose
            exponent is not a plain literal within :data:`_MAX_ABS_EXPONENT`.
    """
    if len(unit) > _MAX_UNIT_LENGTH:
        raise UnitError(f"Unidade longa demais ({len(unit)} caracteres): {unit[:32]!r}…")

    # Pint accepts "^" as a synonym for "**"; normalising first means the guard
    # cannot be walked around by writing the same expression the other way.
    normalized = unit.replace("^", "**")
    operators = normalized.count("**")
    if operators == 0:
        return

    matches = list(_POWER_OPERAND_RE.finditer(normalized))
    if len(matches) != operators:
        raise UnitError(f"Expoente inválido em unidade: {unit!r}")

    for match in matches:
        raw = match.group("plain") or match.group("num")
        exponent = float(raw)
        denominator = match.group("den")
        if denominator is not None:
            divisor = float(denominator)
            if divisor == 0:
                raise UnitError(f"Expoente inválido em unidade: {unit!r}")
            exponent /= divisor
        if abs(exponent) > _MAX_ABS_EXPONENT:
            raise UnitError(f"Expoente fora da faixa em unidade: {unit!r}")


# Matches an optional sign, then either a plain digit run ("1500") or a
# thousands-grouped integer part ("1.234" / "1 234"), an optional decimal part
# (comma or point) and an optional scientific-notation exponent. The plain-run
# alternative is required so ungrouped integers >= 1000 are accepted.
_NUMBER_RE = re.compile(r"^[+-]?(?:\d+|\d{1,3}(?:[.\s]\d{3})+)(?:[.,]\d+)?(?:[eE][+-]?\d+)?$")


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
        text = (
            text.replace(".", "") if text.count(".") and text.rfind(",") > text.rfind(".") else text
        )
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
    _reject_pathological_unit(unit)
    if not expected_dimension:
        return True
    try:
        quantity = ureg.Quantity(1.0, unit)
    except _UNIT_PARSE_FAILURES as exc:
        raise UnitError(f"Unidade desconhecida: {unit!r}") from exc
    return quantity.check(expected_dimension)


def to_canonical(value: float, from_unit: str, canonical_unit: str) -> tuple[float, str]:
    """Convert ``value`` from ``from_unit`` to ``canonical_unit``.

    Returns a ``(normalized_value, conversion_method)`` tuple, where
    ``conversion_method`` is a human-readable, reproducible trail such as
    ``"pint:GPa->Pa"``. When the units are identical the value is returned
    unchanged with an ``"identity"`` method.

    Raises:
        UnitError: if either unit is unknown, the two units are dimensionally
            incompatible (e.g. converting a length into a pressure), or the
            value is not finite (inf/NaN) — a non-finite ``normalized_value``
            would silently corrupt every downstream calculation and chart.
    """
    if not math.isfinite(value):
        raise UnitError(f"Valor não finito não é permitido: {value!r}")
    # Before the identity shortcut on purpose: a pathological unit must not be
    # able to enter the system by being declared on both sides.
    _reject_pathological_unit(from_unit)
    _reject_pathological_unit(canonical_unit)
    if from_unit == canonical_unit:
        return value, f"identity:{canonical_unit}"
    try:
        converted = ureg.Quantity(value, from_unit).to(canonical_unit)
    # DimensionalityError first and separately: it is itself a TypeError
    # subclass, so it must be caught before the broader parse-failure tuple
    # below (which now includes plain TypeError) or it would be reported as
    # an unknown unit instead of an incompatible one.
    except DimensionalityError as exc:
        raise UnitError(
            f"Unidades incompatíveis: {from_unit!r} não pode ser convertido para {canonical_unit!r}"
        ) from exc
    except _UNIT_PARSE_FAILURES as exc:
        raise UnitError(
            f"Unidade desconhecida em conversão {from_unit!r}->{canonical_unit!r}"
        ) from exc
    result = float(converted.magnitude)
    if not math.isfinite(result):
        raise UnitError(
            f"Conversão produziu valor não finito: {value!r} {from_unit!r} -> {canonical_unit!r}"
        )
    return result, f"pint:{from_unit}->{canonical_unit}"


def to_canonical_delta(delta: float, from_unit: str, canonical_unit: str) -> float:
    """Convert a *difference* (tolerance, uncertainty, interval width) between units.

    A difference must not be converted like an absolute value when the units are
    related by an offset: ±5 °C is ±5 K, not ±278.15 K. Converting both ends of
    the difference and subtracting gives the correct result for any affine
    conversion (``y = m·x + c``), reducing to ``|m·delta|`` and therefore staying
    exact for the ordinary multiplicative case as well.

    Raises:
        UnitError: propagated from :func:`to_canonical` (unknown or
            dimensionally incompatible unit, non-finite input).
    """
    origin, _ = to_canonical(0.0, from_unit, canonical_unit)
    shifted, _ = to_canonical(delta, from_unit, canonical_unit)
    return abs(shifted - origin)
