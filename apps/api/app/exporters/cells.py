"""Safe cell writing for spreadsheet exports.

A CSV or XLSX file is not inert: Excel and LibreOffice execute any cell whose
text begins with ``=``, ``+``, ``-``, ``@``, TAB or CR. A material named
``=HYPERLINK("http://…")`` — perfectly storable in this system, and reachable
through the import wizard — would therefore run when the exported file is
opened, on a machine the exporter never sees.

The importer already strips those prefixes on the way in
(``app/importers/parsing.sanitize_text_cell``). This module closes the other
end, because the two ends protect against different things: the importer
protects *this* system's data, while this module protects *the reader's*
spreadsheet — and data can reach the database by paths the importer never saw
(the manual form, a future API client, a restored backup).

Escaping here is visible rather than destructive: the value keeps its
characters and gains a leading apostrophe, the spreadsheet convention for
"treat as text". Nothing exported is silently altered.
"""

from __future__ import annotations

# Characters that make a spreadsheet cell executable.
FORMULA_PREFIXES = ("=", "+", "-", "@", "\t", "\r")

# Prefixed to a dangerous value so the spreadsheet reads it as literal text.
TEXT_MARKER = "'"

# Digits kept when a number is rendered as text. Twelve is far beyond the
# precision of any measured material property (two to four, in practice) and
# still absorbs the residue a unit conversion leaves in the last bits of a
# double, which is the artifact readers actually notice.
SIGNIFICANT_DIGITS = 12


def is_dangerous(text: str) -> bool:
    """True when a spreadsheet would treat this text as a formula."""
    return text.startswith(FORMULA_PREFIXES)


def safe_text(value: object) -> str:
    """Render any value as a cell that cannot execute.

    Numbers are formatted by ``format_number`` and never need escaping — a
    negative number is written through :func:`safe_number`, which keeps it
    numeric rather than turning it into text.
    """
    if value is None:
        return ""
    text = str(value)
    return f"{TEXT_MARKER}{text}" if is_dangerous(text) else text


def safe_number(value: float | int | None) -> float | int | str:
    """Pass a real number through untouched, so spreadsheets keep it numeric.

    A negative number starts with ``-`` but is not an injection risk: it is
    written as a numeric cell, not as text, and a numeric cell is never parsed
    as a formula. Escaping it would make arithmetic in the exported sheet
    impossible for no gain.
    """
    return "" if value is None else value


def format_number(value: float | None, *, missing: str = "ausente") -> str:
    """Render a number for a text column, keeping missing data explicitly absent.

    ``missing`` is a word, never ``0`` and never an empty cell that a reader
    could mistake for zero — the same rule the rest of the system follows.

    The digit count is not cosmetic. A density entered as ``3.9 g/cm**3``
    normalizes to ``3899.9999999999995 kg/m**3`` in IEEE-754, and printing all
    seventeen digits would claim a precision the measurement never had — the
    same fabrication this project refuses everywhere else. Rounding to
    :data:`SIGNIFICANT_DIGITS` reports the number the user gave; it does not
    invent one. The stored value is untouched, and :func:`safe_number` still
    writes the full float to numeric spreadsheet cells, where a reader may do
    arithmetic on it.
    """
    if value is None:
        return missing
    if value == int(value) and abs(value) < 1e15:
        return str(int(value))
    return f"{value:.{SIGNIFICANT_DIGITS}g}"
