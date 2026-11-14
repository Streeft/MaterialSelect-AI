"""Rendering a :class:`~app.exporters.report.Report` to CSV and XLSX bytes.

Both writers put every cell through :mod:`app.exporters.cells`, so a material
named ``=cmd|'/c calc'!A1`` leaves as inert text in either format.

CSV holds one table per file by convention, but a selection report is only
trustworthy whole — the funnel means nothing without the constraints that
produced it. So the CSV carries every section in one file, separated by a blank
line and a title row. It reads fine in a spreadsheet and stays a single
attachment.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable, Sequence

from app.exporters.cells import safe_number, safe_text
from app.exporters.report import Report, Sheet
from app.exporters.xml_text import xml_legal

# Excel rejects : \ / ? * [ ] in sheet names and caps them at 31 characters.
_INVALID_SHEET_CHARS = str.maketrans({c: "-" for c in ":\\/?*[]"})
_MAX_SHEET_NAME = 31

# UTF-8 BOM: without it Excel on Windows opens a UTF-8 CSV as Latin-1 and turns
# "Módulo" into "MÃ³dulo". The report is in Portuguese, so this is not optional.
_BOM = "﻿"


def _cell(value: object) -> object:
    """Escape a value for a spreadsheet, keeping real numbers numeric."""
    if isinstance(value, bool):
        return safe_text("sim" if value else "não")
    if isinstance(value, (int, float)):
        return safe_number(value)
    return safe_text(value)


def _csv_text(rows: Iterable[Sequence[object]]) -> str:
    """Rows as CSV text: ``\\r\\n`` line endings, QUOTE_MINIMAL, cells as given."""
    buffer = io.StringIO()
    csv.writer(buffer, lineterminator="\r\n", quoting=csv.QUOTE_MINIMAL).writerows(rows)
    return buffer.getvalue()


def csv_preamble(title: str, subtitle: str, notices: Sequence[str]) -> str:
    """The BOM, the title, the subtitle when there is one and the notices."""
    rows = [[safe_text(title)]]
    if subtitle:
        rows.append([safe_text(subtitle)])
    rows.extend([safe_text(notice)] for notice in notices)
    return _BOM + _csv_text(rows)


def csv_sheet_head(name: str, notes: Sequence[str], header: Sequence[str]) -> str:
    """The blank line, the section title, its notes and its header row."""
    rows: list[list[object]] = [[], [safe_text(name)]]
    rows.extend([safe_text(note)] for note in notes)
    if header:
        rows.append([safe_text(column) for column in header])
    return _csv_text(rows)


def csv_rows(rows: Iterable[Sequence[object]]) -> str:
    """Body rows, every cell escaped for a spreadsheet (``_cell``)."""
    return _csv_text([_cell(value) for value in row] for row in rows)


def to_csv(report: Report) -> str:
    """Render the whole report as one CSV document.

    ``\\r\\n`` line endings and QUOTE_MINIMAL match what spreadsheets expect;
    the writer quotes any field containing a separator or newline itself.
    The pieces are the same ones a streamed export writes one at a time
    (``csv_preamble``, ``csv_sheet_head``, ``csv_rows``), so the two cannot
    drift apart (D-237).
    """
    parts = [csv_preamble(report.title, report.subtitle, report.notices)]
    for sheet in report.sheets:
        parts.append(csv_sheet_head(sheet.name, sheet.notes, sheet.header))
        parts.append(csv_rows(sheet.rows))
    return "".join(parts)


def _unique_sheet_name(raw: str, taken: set[str]) -> str:
    """Excel-legal, unique worksheet name."""
    name = xml_legal(raw).translate(_INVALID_SHEET_CHARS)[:_MAX_SHEET_NAME] or "Planilha"
    if name not in taken:
        return name
    for suffix in range(2, 100):
        candidate = f"{name[: _MAX_SHEET_NAME - len(str(suffix)) - 1]} {suffix}"
        if candidate not in taken:
            return candidate
    return name[: _MAX_SHEET_NAME - 4] + " ..."  # pragma: no cover - absurd input


def _write_sheet(worksheet, sheet: Sheet) -> None:
    """Write ``sheet`` into a write-only worksheet: streamed, never held as cells.

    A normal workbook keeps one Python object per cell — a catalogue export has
    ~330 thousand — and the peak was that, not the data (D-235). The write-only
    mode streams each row to the file. The column widths (longest value per
    column, so the trail is readable without resizing) must then be known before
    the first row, so they are measured over the same values in a first pass.
    """
    # openpyxl is imported inside the functions that use it (D-235): the module
    # loads at boot, and the library is memory the API only needs to export.
    from openpyxl.cell import WriteOnlyCell
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter

    notes = [[safe_text(note)] for note in sheet.notes]
    header = [safe_text(column) for column in sheet.header] if sheet.header else None

    widths: dict[int, int] = {}

    def measure(values: list[object]) -> None:
        for column, value in enumerate(values, start=1):
            if value is not None:
                widths[column] = max(widths.get(column, 0), len(str(value)))

    for note in notes:
        measure(note)
    if header is not None:
        measure(header)
    for row in sheet.rows:
        measure([_cell(value) for value in row])
    for column, width in widths.items():
        worksheet.column_dimensions[get_column_letter(column)].width = min(max(width + 2, 10), 60)

    bold = Font(bold=True)
    for note in notes:
        worksheet.append(note)
    if header is not None:
        cells = []
        for value in header:
            cell = WriteOnlyCell(worksheet, value=value)
            cell.font = bold
            cells.append(cell)
        worksheet.append(cells)
    for row in sheet.rows:
        worksheet.append([_cell(value) for value in row])


def to_xlsx(report: Report) -> bytes:
    """Render the report as a workbook, one worksheet per section plus a cover."""
    from openpyxl import Workbook
    from openpyxl.cell import WriteOnlyCell
    from openpyxl.styles import Alignment, Font

    workbook = Workbook(write_only=True)
    cover = workbook.create_sheet(title="Aviso")
    cover.column_dimensions["A"].width = 110
    title = WriteOnlyCell(cover, value=safe_text(report.title))
    title.font = Font(bold=True, size=14)
    cover.append([title])
    if report.subtitle:
        cover.append([safe_text(report.subtitle)])
    cover.append([])
    for notice in report.notices:
        cell = WriteOnlyCell(cover, value=safe_text(notice))
        cell.alignment = Alignment(wrap_text=True, vertical="top")
        cover.append([cell])

    taken = {"Aviso"}
    for sheet in report.sheets:
        name = _unique_sheet_name(sheet.name, taken)
        taken.add(name)
        _write_sheet(workbook.create_sheet(title=name), sheet)

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
