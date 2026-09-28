"""PPTX renderer for Report (B2 — architecture, not yet a shipped export path).

Mirrors the CSV/XLSX renderers in spreadsheet.py: same Report input, same
"every export carries the limitation notice" guarantee (CLAUDE.md §1.8) —
here as its own slide rather than a header row, since a slide is the native
place for prose in this format. Not wired to a router endpoint; see
docs/TODO.md B2 and the module-level note in exporters/__init__.py.
"""

from __future__ import annotations

from io import BytesIO

from pptx import Presentation
from pptx.util import Inches, Pt

from app.exporters.report import Report

#: 16:9. Public because the Studio deck (``studio_pptx``) is drawn on the same
#: page, and its closing slide is this module's notices slide.
SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)
#: Side margin shared by every slide whose shapes are placed by hand.
MARGIN = Inches(0.6)

# Private aliases kept for the names this module used before they were public.
_SLIDE_WIDTH = SLIDE_WIDTH
_SLIDE_HEIGHT = SLIDE_HEIGHT


def to_pptx(report: Report) -> bytes:
    """Render ``report`` as a .pptx: title slide, one table slide per sheet,
    one closing slide with every notice."""
    presentation = Presentation()
    presentation.slide_width = SLIDE_WIDTH
    presentation.slide_height = SLIDE_HEIGHT

    _add_title_slide(presentation, report)
    for sheet in report.sheets:
        _add_table_slide(presentation, sheet.name, sheet.header, sheet.rows)
    if report.notices:
        add_notices_slide(presentation, report.notices)

    buffer = BytesIO()
    presentation.save(buffer)
    return buffer.getvalue()


def _add_title_slide(presentation: Presentation, report: Report) -> None:
    layout = presentation.slide_layouts[0]  # title layout
    slide = presentation.slides.add_slide(layout)
    slide.shapes.title.text = report.title
    if slide.placeholders and len(slide.placeholders) > 1:
        slide.placeholders[1].text = report.subtitle


def _add_table_slide(
    presentation: Presentation, name: str, header: list[str], rows: list[list[object]]
) -> None:
    layout = presentation.slide_layouts[5]  # title-only layout
    slide = presentation.slides.add_slide(layout)
    slide.shapes.title.text = name

    n_rows = len(rows) + 1
    n_cols = max(len(header), 1)
    left, top = Inches(0.5), Inches(1.5)
    width, height = SLIDE_WIDTH - Inches(1.0), SLIDE_HEIGHT - Inches(2.0)
    table_shape = slide.shapes.add_table(n_rows, n_cols, left, top, width, height)
    table = table_shape.table

    for col_index, label in enumerate(header):
        cell = table.cell(0, col_index)
        cell.text = str(label)
        for paragraph in cell.text_frame.paragraphs:
            for run in paragraph.runs:
                run.font.bold = True
                run.font.size = Pt(14)

    for row_index, row in enumerate(rows, start=1):
        for col_index in range(n_cols):
            value = row[col_index] if col_index < len(row) else ""
            table.cell(row_index, col_index).text = "" if value is None else str(value)


def add_notices_slide(
    presentation: Presentation, notices: list[str], title: str = "Avisos"
) -> None:
    """A closing slide holding every notice, one paragraph each.

    The layout's placeholders are drawn for a 4:3 page; they are stretched to
    the 16:9 width here, and the body is set at a size two paragraphs of
    notice fit in. The caller hands over XML-legal text (python-pptx does not
    refuse a control character — it writes ``_x0000_`` in its place).
    """
    layout = presentation.slide_layouts[1]  # title + content
    slide = presentation.slides.add_slide(layout)
    heading = slide.shapes.title
    heading.text = title
    heading.left, heading.top = MARGIN, Inches(0.4)
    heading.width, heading.height = SLIDE_WIDTH - 2 * MARGIN, Inches(1.1)
    placeholder = slide.placeholders[1]
    placeholder.left, placeholder.top = MARGIN, Inches(1.7)
    placeholder.width, placeholder.height = SLIDE_WIDTH - 2 * MARGIN, SLIDE_HEIGHT - Inches(2.3)
    body = placeholder.text_frame
    body.text = notices[0]
    for notice in notices[1:]:
        paragraph = body.add_paragraph()
        paragraph.text = notice
    for paragraph in body.paragraphs:
        paragraph.font.size = Pt(18)


#: Kept for the name this helper had before it was public.
_add_notices_slide = add_notices_slide
