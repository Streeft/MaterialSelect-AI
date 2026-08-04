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
    """
    if value is None:
        return missing
    if value == int(value) and abs(value) < 1e15:
        return str(int(value))
    return repr(value)
