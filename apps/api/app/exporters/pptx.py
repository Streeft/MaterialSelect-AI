"""PPTX renderer for Report (B2 — presentation export for studies and reports).

Mirrors the CSV/XLSX renderers in spreadsheet.py, the HTML renderer in html.py,
and the DOCX renderer in docx.py: same Report input, same "every export carries
the limitation notice" guarantee (CLAUDE.md §1.8) and "missing data stays missing"
rule (Principle 3, D-24).

Generates a native Microsoft PowerPoint (.pptx) presentation via python-pptx
(pure Python, cross-platform, zero C/GTK dependencies). Tables preserve the
full provenance trail, missing data is explicitly marked as "ausente" rather
than an empty cell, long tables are cleanly chunked across slides, and technical
narratives (AI interpretation) are rendered natively when present.
"""

from __future__ import annotations

import io

from pptx import Presentation
from pptx.util import Inches, Pt

from app.exporters.cells import format_number
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

_MAX_TABLE_ROWS_PER_SLIDE = 10


def _text(value: object) -> str:
    """Render one cell value as formatted, human-readable text."""
    if isinstance(value, bool):
        return "sim" if value else "não"
    if value is None:
        return format_number(None)
    if isinstance(value, (int, float)):
        return format_number(float(value))
    return str(value)


def to_pptx(report: Report) -> bytes:
    """Render ``report`` as a .pptx presentation: title slide, table slides,
    narrative slide (when present), and closing notice slide."""
    presentation = Presentation()
    presentation.slide_width = SLIDE_WIDTH
    presentation.slide_height = SLIDE_HEIGHT

    _add_title_slide(presentation, report)
    for i, sheet in enumerate(report.sheets, start=1):
        _add_sheet_slides(presentation, i, sheet.name, sheet.header, sheet.rows, sheet.notes)

    if report.narrative is not None or report.narrative_note is not None:
        _add_narrative_slide(presentation, len(report.sheets) + 1, report)

    if report.notices:
        add_notices_slide(presentation, report.notices)

    buffer = io.BytesIO()
    presentation.save(buffer)
    return buffer.getvalue()


def _add_title_slide(presentation: Presentation, report: Report) -> None:
    layout = presentation.slide_layouts[0]  # title layout
    slide = presentation.slides.add_slide(layout)
    slide.shapes.title.text = report.title
    if slide.placeholders and len(slide.placeholders) > 1:
        subtitle_lines = []
        if report.subtitle:
            subtitle_lines.append(report.subtitle)
        if report.responsible:
            subtitle_lines.append(f"Responsável técnico: {report.responsible}")
        slide.placeholders[1].text = "\n".join(subtitle_lines)


def _add_sheet_slides(
    presentation: Presentation,
    index: int,
    name: str,
    header: list[str],
    rows: list[list[object]],
    notes: list[str],
) -> None:
    title_text = f"{index}. {name}"
    if not rows:
        layout = presentation.slide_layouts[1]  # title + content
        slide = presentation.slides.add_slide(layout)
        slide.shapes.title.text = title_text
        body = slide.placeholders[1].text_frame
        msg = notes[0] if notes else "Nenhum registro nesta seção."
        body.text = msg
        for note in notes[1:]:
            p = body.add_paragraph()
            p.text = note
        return

    total_chunks = (len(rows) + _MAX_TABLE_ROWS_PER_SLIDE - 1) // _MAX_TABLE_ROWS_PER_SLIDE
    for chunk_idx in range(total_chunks):
        chunk_start = chunk_idx * _MAX_TABLE_ROWS_PER_SLIDE
        chunk_rows = rows[chunk_start : chunk_start + _MAX_TABLE_ROWS_PER_SLIDE]
        slide_title = (
            title_text
            if total_chunks == 1
            else f"{title_text} ({chunk_idx + 1}/{total_chunks})"
        )
        _add_table_slide(presentation, slide_title, header, chunk_rows)


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
                run.font.size = Pt(13)

    for row_index, row in enumerate(rows, start=1):
        for col_index in range(n_cols):
            value = row[col_index] if col_index < len(row) else None
            cell = table.cell(row_index, col_index)
            cell_text = _text(value)
            cell.text = cell_text
            for paragraph in cell.text_frame.paragraphs:
                for run in paragraph.runs:
                    run.font.size = Pt(11)
                    if cell_text == "ausente":
                        run.font.italic = True


def _add_narrative_slide(presentation: Presentation, index: int, report: Report) -> None:
    layout = presentation.slide_layouts[1]  # title + content
    slide = presentation.slides.add_slide(layout)
    heading = slide.shapes.title
    heading.text = f"{index}. Interpretação técnica (IA)"
    heading.left, heading.top = MARGIN, Inches(0.4)
    heading.width, heading.height = SLIDE_WIDTH - 2 * MARGIN, Inches(1.1)

    placeholder = slide.placeholders[1]
    placeholder.left, placeholder.top = MARGIN, Inches(1.7)
    placeholder.width, placeholder.height = SLIDE_WIDTH - 2 * MARGIN, SLIDE_HEIGHT - Inches(2.3)
    body = placeholder.text_frame
    body.clear()

    if report.narrative:
        for idx, p_text in enumerate(report.narrative):
            p = body.paragraphs[0] if idx == 0 else body.add_paragraph()
            p.text = p_text
            p.font.size = Pt(14)
        if report.narrative_caveats:
            for caveat in report.narrative_caveats:
                p = body.add_paragraph()
                p.text = f"• {caveat}"
                p.font.size = Pt(12)
                p.font.italic = True
    else:
        p = body.paragraphs[0]
        p.text = "Interpretação por IA não disponível."
        p.font.size = Pt(14)
        p.font.italic = True

    if report.narrative_note:
        p = body.add_paragraph()
        p.text = report.narrative_note
        p.font.size = Pt(11)


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
