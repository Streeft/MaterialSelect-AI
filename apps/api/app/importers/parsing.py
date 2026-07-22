"""Cell-level parsing for spreadsheet imports.

Turns raw cell text into a structured :class:`ParsedCell`, handling every value
shape the specification requires:

* empty cells and "not available" tokens ("N/A", "n/d", "não disponível", "-");
* plain numbers with decimal comma or point, and scientific notation;
* value + unit in the same cell ("210 GPa");
* ranges in one cell ("120 - 150", "120-150 MPa");
* units declared in the column header ("densidade [g/cm3]").

Parsing never invents data: anything unrecognisable raises
:class:`CellParseError` so the row is reported instead of silently coerced.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from app.calculations.units import UnitError, parse_decimal_comma

# Tokens (lowercase, accent-stripped) treated as an explicitly missing value.
_MISSING_TOKENS = {
    "",
    "-",
    "--",
    "n/a",
    "na",
    "n/d",
    "nd",
    "nao disponivel",
    "indisponivel",
    "null",
    "none",
    "sem dado",
    "sem dados",
}

# One numeric token: sign, digits, optional decimal comma/point, optional
# scientific exponent. Thousands grouping inside cells is NOT supported here on
# purpose — inside a data cell it is ambiguous with ranges ("1.234" vs "1-234").
_NUM = r"[+-]?\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?"

_SCALAR_RE = re.compile(rf"^(?P<num>{_NUM})$")
_SCALAR_UNIT_RE = re.compile(rf"^(?P<num>{_NUM})\s+(?P<unit>[^\s].*)$")
# Ranges: "120 - 150", "120-150", "120 – 150", optionally with trailing unit.
# The separator must not be glued to an exponent sign; digit-hyphen-digit is
# accepted ("120-150") since negative bounds are written with spaces if needed.
_RANGE_RE = re.compile(
    rf"^(?P<min>{_NUM})\s*[-–—]\s*(?P<max>{_NUM})(?:\s+(?P<unit>[^\s].*))?$"
)
# Unit inside a header, e.g. "densidade [g/cm3]" or "custo (R$/kg)".
_HEADER_UNIT_RE = re.compile(r"[\[(]([^\][()]+)[\])]\s*$")
# "cm3" -> "cm**3" etc., so header-style units become Pint-parsable.
_UNIT_EXPONENT_RE = re.compile(r"([a-zA-Zµμ])(\d+)")


class CellParseError(ValueError):
    """A cell's content could not be interpreted as a supported value shape."""


@dataclass(frozen=True)
class ParsedCell:
    """Structured result of parsing one data cell.

    ``kind`` is ``"missing"``, ``"scalar"`` or ``"range"``. ``unit`` is only set
    when the cell itself carried a unit (which then overrides the mapped one).
    """

    kind: str
    value: float | None = None
    value_min: float | None = None
    value_max: float | None = None
    unit: str | None = None


def _strip_accents(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch)
    )


def normalize_unit_text(unit: str) -> str:
    """Make spreadsheet-style unit text Pint-parsable (``g/cm3`` → ``g/cm**3``)."""
    cleaned = unit.strip().replace("³", "**3").replace("²", "**2").replace("^", "**")
    return _UNIT_EXPONENT_RE.sub(r"\1**\2", cleaned)


def unit_from_header(header: str) -> str | None:
    """Extract a unit hint from a column header, if present.

    ``"densidade [g/cm3]"`` → ``"g/cm**3"``; returns None when the header has no
    bracketed/parenthesised suffix.
    """
    match = _HEADER_UNIT_RE.search(header.strip())
    if not match:
        return None
    return normalize_unit_text(match.group(1))


def header_without_unit(header: str) -> str:
    """Return the header with any trailing unit annotation removed."""
    return _HEADER_UNIT_RE.sub("", header.strip()).strip()


def is_missing_token(raw: object) -> bool:
    """True when the cell content means "no data" (never coerced to zero)."""
    if raw is None:
        return True
    text = _strip_accents(str(raw).strip().lower())
    return text in _MISSING_TOKENS


def parse_cell(raw: object) -> ParsedCell:
    """Parse one data cell into a :class:`ParsedCell`.

    Raises:
        CellParseError: when the content is neither missing, a number, a
            number+unit, nor a range.
    """
    if isinstance(raw, bool):  # bool is an int subclass; reject explicitly
        raise CellParseError(f"Valor booleano não é um número: {raw!r}")
    if raw is None or is_missing_token(raw):
        return ParsedCell(kind="missing")
    if isinstance(raw, (int, float)):
        return ParsedCell(kind="scalar", value=float(raw))

    text = str(raw).strip()

    if match := _SCALAR_RE.match(text):
        return ParsedCell(kind="scalar", value=_number(match.group("num")))

    if match := _RANGE_RE.match(text):
        unit = normalize_unit_text(match.group("unit")) if match.group("unit") else None
        return ParsedCell(
            kind="range",
            value_min=_number(match.group("min")),
            value_max=_number(match.group("max")),
            unit=unit,
        )

    if match := _SCALAR_UNIT_RE.match(text):
        return ParsedCell(
            kind="scalar",
            value=_number(match.group("num")),
            unit=normalize_unit_text(match.group("unit")),
        )

    raise CellParseError(f"Conteúdo não reconhecido como valor: {text!r}")


def _number(token: str) -> float:
    try:
        return parse_decimal_comma(token)
    except UnitError as exc:  # normalise the error type for importer callers
        raise CellParseError(str(exc)) from exc


# Characters that make a spreadsheet cell executable in Excel/LibreOffice.
_FORMULA_PREFIXES = ("=", "+", "@", "\t", "\r")


def sanitize_text_cell(raw: object) -> tuple[str | None, bool]:
    """Neutralise formula-injection prefixes in a free-text cell.

    Returns ``(clean_text, was_sanitized)``. Leading formula-trigger characters
    are stripped so imported names/descriptions can never re-emerge as live
    formulas in a later export. ``None``/empty input returns ``(None, False)``.
    """
    if raw is None:
        return None, False
    text = str(raw).strip()
    if not text:
        return None, False
    original = text
    while text and (text.startswith(_FORMULA_PREFIXES) or text.startswith("-")):
        # "-" alone is a missing token handled earlier; a leading "-" on free
        # text is also an Excel formula trigger, so it is stripped here too.
        text = text[1:].lstrip()
    return (text or None), text != original
