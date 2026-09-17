"""Rendering a :class:`~app.exporters.report.Report` as a DOCX document.

Mirrors the CSV/XLSX renderers in spreadsheet.py and the HTML renderer in
html.py: same Report input, same "every export carries the limitation notice"
guarantee (CLAUDE.md §1.8) and "missing data stays missing" rule (Principle 3,
D-24).

Generates a native Microsoft Word (.docx) document via python-docx (pure Python,
cross-platform, zero C/GTK dependencies). Tables preserve the full provenance
trail, headers repeat across pages, and absent data is explicitly marked as
"ausente" rather than a misleading zero or empty cell.
"""

from __future__ import annotations

import io

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

from app.exporters.cells import format_number
from app.exporters.report import DEMO_DATA_NOTICE, Report

_PRIMARY_COLOR = RGBColor(15, 23, 42)  # #0f172a (ink)
_SUBTLE_COLOR = RGBColor(100, 116, 139)  # #64748b (ink-subtle)
_DEMO_COLOR = RGBColor(154, 52, 18)  # #9a3412 (warning-deep)


def _text(value: object) -> str:
    """Render one cell value as formatted, human-readable text."""
    if isinstance(value, bool):
        return "sim" if value else "não"
    if value is None:
        return format_number(None)
    if isinstance(value, (int, float)):
        return format_number(float(value))
    return str(value)


def _set_cell_background(cell, hex_color: str) -> None:
    """Set cell background shading in OpenXML."""
    tcPr = cell._element.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:val"), "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"), hex_color)
    tcPr.append(shd)


def _set_repeat_header_and_cant_split(row) -> None:
    """Mark table row to repeat as header on every page and prevent splitting."""
    trPr = row._element.get_or_add_trPr()
    tblHeader = OxmlElement("w:tblHeader")
    cantSplit = OxmlElement("w:cantSplit")
    trPr.append(tblHeader)
    trPr.append(cantSplit)


def _set_cant_split(row) -> None:
    """Prevent row from breaking across pages."""
    trPr = row._element.get_or_add_trPr()
    cantSplit = OxmlElement("w:cantSplit")
    trPr.append(cantSplit)


def to_docx(report: Report) -> bytes:
    """Render the whole report as one standalone DOCX document."""
    doc = Document()

    # Page setup: A4 with standard margins
    for section in doc.sections:
        section.page_width = Inches(8.27)
        section.page_height = Inches(11.69)
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Document Title
    title_p = doc.add_paragraph()
    title_run = title_p.add_run(report.title)
    title_run.font.size = Pt(20)
    title_run.font.bold = True
    title_run.font.color.rgb = _PRIMARY_COLOR
    title_p.paragraph_format.space_after = Pt(4)

    # Subtitle
    if report.subtitle:
        sub_p = doc.add_paragraph()
        sub_run = sub_p.add_run(report.subtitle)
        sub_run.font.size = Pt(12)
        sub_run.font.color.rgb = _SUBTLE_COLOR
        sub_p.paragraph_format.space_after = Pt(12)

    # Responsible engineer (if present)
    if report.responsible:
        resp_p = doc.add_paragraph()
        resp_run = resp_p.add_run(f"Responsável técnico: {report.responsible}")
        resp_run.font.size = Pt(10)
        resp_run.font.bold = True
        resp_run.font.color.rgb = _PRIMARY_COLOR
        resp_p.paragraph_format.space_after = Pt(12)

    # Mandatory Notices block
    if report.notices:
        notice_box = doc.add_table(rows=1, cols=1)
        notice_box.alignment = WD_TABLE_ALIGNMENT.CENTER
        notice_box.autofit = False
        notice_box.columns[0].width = Inches(6.67)

        cell = notice_box.cell(0, 0)
        _set_cell_background(cell, "F8FAFC")

        cell_p = cell.paragraphs[0]
        cell_p.paragraph_format.space_before = Pt(4)
        cell_p.paragraph_format.space_after = Pt(4)

        for idx, notice in enumerate(report.notices):
            p = cell_p if idx == 0 else cell.add_paragraph()
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            run = p.add_run(notice)
            run.font.size = Pt(9.5)
            if notice == DEMO_DATA_NOTICE:
                run.font.bold = True
                run.font.color.rgb = _DEMO_COLOR
            else:
                run.font.color.rgb = _SUBTLE_COLOR

        doc.add_paragraph().paragraph_format.space_after = Pt(8)

    # Render Sheets (Tables & Sections)
    for i, sheet in enumerate(report.sheets, start=1):
        heading = doc.add_heading(f"{i}. {sheet.name}", level=2)
        heading.paragraph_format.space_before = Pt(16)
        heading.paragraph_format.space_after = Pt(6)

        for note in sheet.notes:
            note_p = doc.add_paragraph()
            note_run = note_p.add_run(note)
            note_run.font.size = Pt(9)
            note_run.font.italic = True
            note_run.font.color.rgb = _SUBTLE_COLOR
            note_p.paragraph_format.space_after = Pt(4)

        if sheet.rows:
            num_cols = max(len(sheet.header), 1)
            num_rows = len(sheet.rows) + (1 if sheet.header else 0)
            table = doc.add_table(rows=num_rows, cols=num_cols)
            table.style = "Table Grid"
            table.alignment = WD_TABLE_ALIGNMENT.CENTER

            current_row = 0
            if sheet.header:
                header_tr = table.rows[0]
                _set_repeat_header_and_cant_split(header_tr)
                for col_idx, col_name in enumerate(sheet.header):
                    c = header_tr.cells[col_idx]
                    _set_cell_background(c, "F1F5F9")
                    cp = c.paragraphs[0]
                    cp.paragraph_format.space_before = Pt(2)
                    cp.paragraph_format.space_after = Pt(2)
                    hrun = cp.add_run(col_name)
                    hrun.font.bold = True
                    hrun.font.size = Pt(9)
                    hrun.font.color.rgb = _PRIMARY_COLOR
                current_row = 1

            for row_data in sheet.rows:
                tr = table.rows[current_row]
                _set_cant_split(tr)
                for col_idx in range(num_cols):
                    val = row_data[col_idx] if col_idx < len(row_data) else ""
                    c = tr.cells[col_idx]
                    cp = c.paragraphs[0]
                    cp.paragraph_format.space_before = Pt(2)
                    cp.paragraph_format.space_after = Pt(2)
                    val_str = _text(val)
                    crun = cp.add_run(val_str)
                    crun.font.size = Pt(8.5)
                    if val is None or val_str == "ausente":
                        crun.font.italic = True
                        crun.font.color.rgb = _SUBTLE_COLOR
                    elif isinstance(val, (int, float)):
                        cp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                current_row += 1

            doc.add_paragraph().paragraph_format.space_after = Pt(8)
        elif not sheet.notes:
            empty_p = doc.add_paragraph()
            empty_run = empty_p.add_run("Nenhum registro nesta seção.")
            empty_run.font.size = Pt(9)
            empty_run.font.italic = True
            empty_run.font.color.rgb = _SUBTLE_COLOR
            empty_p.paragraph_format.space_after = Pt(6)

    # Narrative Section (when applicable, e.g. engineering reports / laudo)
    if report.narrative is not None or report.narrative_note is not None:
        narrative_idx = len(report.sheets) + 1
        heading = doc.add_heading(f"{narrative_idx}. Interpretação técnica (IA)", level=2)
        heading.paragraph_format.space_before = Pt(16)
        heading.paragraph_format.space_after = Pt(6)

        if report.narrative:
            for p_text in report.narrative:
                p = doc.add_paragraph()
                r = p.add_run(p_text)
                r.font.size = Pt(9.5)
                p.paragraph_format.space_after = Pt(4)
            if report.narrative_caveats:
                for caveat in report.narrative_caveats:
                    p = doc.add_paragraph(style="List Bullet")
                    r = p.add_run(caveat)
                    r.font.size = Pt(9)
                    r.font.italic = True
                    r.font.color.rgb = _SUBTLE_COLOR
                    p.paragraph_format.space_after = Pt(2)
        else:
            p = doc.add_paragraph()
            r = p.add_run("Interpretação por IA não disponível.")
            r.font.size = Pt(9)
            r.font.italic = True
            r.font.color.rgb = _SUBTLE_COLOR

        if report.narrative_note:
            note_p = doc.add_paragraph()
            note_r = note_p.add_run(report.narrative_note)
            note_r.font.size = Pt(8.5)
            note_r.font.color.rgb = _SUBTLE_COLOR
            note_p.paragraph_format.space_before = Pt(4)

    # Footer
    for section in doc.sections:
        footer = section.footer
        footer_p = footer.paragraphs[0]
        footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        footer_run = footer_p.add_run(
            "Gerado por MaterialSelect AI — seleção de materiais pela metodologia de Ashby, "
            "com cálculo determinístico e proveniência rastreável."
        )
        footer_run.font.size = Pt(8)
        footer_run.font.color.rgb = _SUBTLE_COLOR

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
