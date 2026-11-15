"""The CSV a curator downloads to start an import (D-239).

One header row the importer already recognises (``ImportService._suggest``
maps every column without a click) and **one example row**. The example is
there to show the format — a unit in brackets, a range as ``_min``/``_max``
columns, a decimal comma — and not to be imported: its numbers are
placeholders, not measurements, so ``ImportService`` refuses a row with this
exact name (principle 1: no invented property reaches the catalogue, not even
by a curator who forgot to delete a line).

Semicolon-separated and UTF-8 with a BOM, so Excel in Portuguese opens it in
columns with the accents intact; the reader sniffs ``;`` like it sniffs ``,``.
"""

from __future__ import annotations

import csv
import io

#: The example row's name. A row named like this is an error at validation.
TEMPLATE_EXAMPLE_NAME = "EXEMPLO - apague esta linha"

#: (header, example cell). Units follow the importer's header syntax.
TEMPLATE_COLUMNS: tuple[tuple[str, str], ...] = (
    ("nome", TEMPLATE_EXAMPLE_NAME),
    ("classe", "Metais"),
    ("descricao", "Troque esta linha pelos seus materiais, um por linha."),
    ("densidade [kg/m3]", "1000"),
    ("modulo_young [GPa]", "10,5"),
    ("limite_escoamento_min [MPa]", "100"),
    ("limite_escoamento_max [MPa]", "150"),
)

TEMPLATE_FILENAME = "modelo-importacao-materiais.csv"


def template_csv() -> bytes:
    """The template as bytes: BOM, ``;`` separator, CRLF line ends (Excel's own)."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", lineterminator="\r\n")
    writer.writerow([header for header, _ in TEMPLATE_COLUMNS])
    writer.writerow([example for _, example in TEMPLATE_COLUMNS])
    return buffer.getvalue().encode("utf-8-sig")
