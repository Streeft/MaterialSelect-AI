"""The engineering report (laudo) as a Word document, in the visual laudo's structure (D-243).

The HTML laudo (``laudo.py``) is the document that gets issued, signed and frozen. This is
its **editable twin**, for the engineer who wants to adjust the wording in Word: same
reading order — cover, executive summary (the recommended material, key-figure cards, the
traffic light as a coloured table, the ranking), one section per tool, the AI's
interpretation, the signature block and the technical annex — and the same
:class:`~app.exporters.laudo.LaudoDocument` behind it, so the two cannot disagree on a number.

What differs is only what Word can hold. Cards and the traffic light are **tables with
shaded cells** (a picture of text is not editable); the charts are **PNG images**, rasterised
from the very same SVG (``svg_png``), with the chart's title and description as the picture's
alternative text. A chart that cannot be rasterised is replaced by one line saying which one
is missing — absence is declared, never silent.

This is **not** the issued laudo: it carries no seal, no code and no QR (they identify the
frozen version, and an editable copy is by definition not it), and the cover says so.

python-docx is imported inside the functions that use it (D-235).
"""

from __future__ import annotations

import io

from app.exporters.docx import add_sheet
from app.exporters.laudo import KeyFigure, LaudoDocument, LaudoSection, long_date
from app.exporters.laudo_theme import STATUS, token
from app.exporters.report import Report
from app.exporters.svg_png import FigureRasterError, figure_alt, svg_to_png
from app.exporters.xml_text import xml_legal, xml_legal_report

EDITABLE_NOTE = (
    "Cópia editável (Word) gerada com os dados de hoje. Não é o laudo emitido: não tem código "
    "de verificação nem QR. O documento que se assina e se verifica é o PDF do laudo emitido."
)
FOOTER = "Gerado por MaterialSelect AI — cálculo determinístico, proveniência rastreável."

#: Usable width of an A4 page with 0.8 in margins, in inches.
PAGE_WIDTH_IN = 6.67

#: Card tone → (top rule, soft ground), from the same tokens the HTML laudo uses.
_TONES: dict[str, tuple[str, str]] = {
    "brand": (token("brand-700"), token("brand-50")),
    "ok": (STATUS["ok"].colour, STATUS["ok"].soft),
    "warn": (STATUS["warn"].colour, STATUS["warn"].soft),
    "fail": (STATUS["fail"].colour, STATUS["fail"].soft),
    "na": (STATUS["na"].colour, STATUS["na"].soft),
    "neutral": (token("edge-strong"), token("surface-sunken")),
}


def _hex(value: str) -> str:
    return value.lstrip("#").upper()


def _rgb(value: str):
    from docx.shared import RGBColor

    return RGBColor.from_string(_hex(value))


# --- Small building blocks ---------------------------------------------------


def _write(
    paragraph,
    text: str,
    *,
    size: float = 10,
    bold: bool = False,
    italic: bool = False,
    color: str | None = None,
):
    from docx.shared import Pt

    run = paragraph.add_run(xml_legal(text))
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = _rgb(color or token("ink"))
    return run


def _para(
    container,
    text: str = "",
    *,
    size: float = 10,
    bold: bool = False,
    italic: bool = False,
    color: str | None = None,
    align=None,
    before: float = 0,
    after: float = 4,
    first: bool = False,
    style: str | None = None,
):
    """A paragraph in a document or a cell; ``first`` reuses the cell's empty first paragraph."""
    from docx.shared import Pt

    paragraph = container.paragraphs[0] if first else container.add_paragraph(style=style)
    paragraph.paragraph_format.space_before = Pt(before)
    paragraph.paragraph_format.space_after = Pt(after)
    if align is not None:
        paragraph.alignment = align
    if text:
        _write(paragraph, text, size=size, bold=bold, italic=italic, color=color)
    return paragraph


def _shade(cell, colour: str) -> None:
    from app.exporters.docx import _set_cell_background

    _set_cell_background(cell, _hex(colour))


def _borders(cell, **sides: tuple[str, int] | None) -> None:
    """Cell borders by side (``top``, ``bottom``, ``left``, ``right``): ``(colour, eighths of a point)``."""
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    tc_pr = cell._element.get_or_add_tcPr()
    borders = tc_pr.find(qn("w:tcBorders"))
    if borders is None:
        borders = OxmlElement("w:tcBorders")
        tc_pr.append(borders)
    for side in ("top", "left", "bottom", "right"):
        spec = sides.get(side)
        element = OxmlElement(f"w:{side}")
        if spec is None:
            element.set(qn("w:val"), "nil")
        else:
            element.set(qn("w:val"), "single")
            element.set(qn("w:sz"), str(spec[1]))
            element.set(qn("w:space"), "0")
            element.set(qn("w:color"), _hex(spec[0]))
        borders.append(element)


def _cell_margins(cell, *, top: int = 80, bottom: int = 80, left: int = 120, right: int = 120):
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    tc_pr = cell._element.get_or_add_tcPr()
    margins = OxmlElement("w:tcMar")
    for side, value in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        node = OxmlElement(f"w:{side}")
        node.set(qn("w:w"), str(value))
        node.set(qn("w:type"), "dxa")
        margins.append(node)
    tc_pr.append(margins)


def _table(doc, rows: int, columns: int, widths: list[float] | None = None):
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.shared import Inches

    table = doc.add_table(rows=rows, cols=columns)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    sizes = widths or [PAGE_WIDTH_IN / columns] * columns
    for column, width in zip(table.columns, sizes, strict=True):
        column.width = Inches(width)
        for cell in column.cells:
            cell.width = Inches(width)
    return table


def _spacer(doc, points: float = 6) -> None:
    from docx.shared import Pt

    paragraph = doc.add_paragraph()
    paragraph.paragraph_format.space_before = Pt(0)
    paragraph.paragraph_format.space_after = Pt(points)
    paragraph.paragraph_format.line_spacing = Pt(2)


def _heading(doc, number: int | str, text: str, *, page_break: bool = False) -> None:
    from docx.shared import Pt

    heading = doc.add_heading(xml_legal(f"{number}. {text}"), level=1)
    heading.paragraph_format.space_before = Pt(10)
    heading.paragraph_format.space_after = Pt(6)
    heading.paragraph_format.keep_with_next = True
    heading.paragraph_format.page_break_before = page_break


def _subheading(doc, text: str) -> None:
    _para(
        doc, text, size=11, bold=True, color=token("brand-900"), before=8, after=3
    ).paragraph_format.keep_with_next = True


# --- Cards, hero, lights -----------------------------------------------------


def _cards(doc, cards: list[KeyFigure]) -> None:
    """The key figures as one row of shaded cells with a coloured top rule."""
    if not cards:
        return
    table = _table(doc, 1, len(cards))
    for cell, card in zip(table.rows[0].cells, cards, strict=True):
        rule, soft = _TONES.get(card.tone, _TONES["neutral"])
        _shade(cell, soft)
        _borders(cell, top=(rule, 24), bottom=(token("edge-subtle"), 4))
        _cell_margins(cell)
        _para(cell, card.label, size=8, color=token("ink-muted"), after=2, first=True)
        line = _para(cell, after=2)
        quiet = card.tone == "na"
        _write(
            line,
            card.value,
            size=11 if quiet else 15,
            bold=True,
            italic=quiet,
            color=token("ink-subtle") if quiet else token("ink"),
        )
        if card.unit:
            _write(line, f" {card.unit}", size=9, color=token("ink-muted"))
        if card.hint:
            _para(cell, card.hint, size=8, italic=True, color=token("ink-muted"), after=0)
    _spacer(doc)


def _hero(doc, document: LaudoDocument, *, large: bool) -> None:
    table = _table(doc, 1, 1)
    cell = table.cell(0, 0)
    _cell_margins(cell, top=160, bottom=160, left=200, right=200)
    recommendation = document.recommendation
    if recommendation is not None:
        _shade(cell, token("brand-50"))
        _borders(cell, left=(token("brand-700"), 36))
        _para(
            cell,
            "MATERIAL RECOMENDADO",
            size=8,
            bold=True,
            color=token("brand-700"),
            after=2,
            first=True,
        )
        _para(
            cell,
            recommendation.name,
            size=22 if large else 17,
            bold=True,
            color=token("brand-900"),
            after=2,
        )
        standing = recommendation.standing
        if recommendation.class_name:
            standing = f"{standing} · {recommendation.class_name}"
        _para(cell, standing, size=10, color=token("ink-muted"), after=0)
    else:
        _shade(cell, token("quality-ausente-soft"))
        _borders(cell, left=(token("quality-ausente"), 36))
        _para(
            cell,
            "MATERIAL RECOMENDADO",
            size=8,
            bold=True,
            color=token("ink-muted"),
            after=2,
            first=True,
        )
        _para(
            cell,
            document.no_recommendation or "Nenhum material recomendado.",
            size=11,
            italic=True,
            color=token("ink-muted"),
            after=0,
        )
    _spacer(doc, 8)


def _lights_table(doc, document: LaudoDocument) -> None:
    """The traffic light as a table: state (word and glyph, on its colour), requirement, detail."""
    if not document.lights:
        return
    rows = document.lights[:14]
    table = _table(doc, len(rows), 3, [1.35, 2.35, 2.97])
    for row, light in zip(table.rows, rows, strict=True):
        status = STATUS.get(light.status, STATUS["na"])
        first, second, third = row.cells
        _shade(first, status.soft)
        _borders(first, left=(status.colour, 36), bottom=(token("edge-subtle"), 4))
        _borders(second, bottom=(token("edge-subtle"), 4))
        _borders(third, bottom=(token("edge-subtle"), 4))
        for cell in row.cells:
            _cell_margins(cell, top=50, bottom=50)
        _para(
            first,
            f"{status.glyph} {status.word}",
            size=9,
            bold=True,
            color=status.ink,
            after=0,
            first=True,
        )
        _para(second, light.label, size=9.5, bold=True, after=0, first=True)
        _para(third, light.detail or " ", size=8.5, color=token("ink-muted"), after=0, first=True)
    _spacer(doc)


def _scope_table(doc, document: LaudoDocument) -> None:
    """What this laudo evaluated: one shaded cell per tool of the app, with the state in words."""
    if not document.scope:
        return
    table = _table(doc, 1, min(len(document.scope), 3))
    columns = len(table.columns)
    # More than three tools wrap onto further rows of the same table.
    for _ in range((len(document.scope) - 1) // columns):
        table.add_row()
    for index, item in enumerate(document.scope):
        status = STATUS.get(item.status, STATUS["na"])
        cell = table.cell(index // columns, index % columns)
        _shade(cell, status.soft)
        _borders(
            cell,
            top=(token("surface-raised"), 8),
            bottom=(token("surface-raised"), 8),
            left=(token("surface-raised"), 8),
            right=(token("surface-raised"), 8),
        )
        _cell_margins(cell, top=60, bottom=60)
        _para(
            cell,
            f"{status.glyph} {item.label}",
            size=9,
            bold=True,
            color=status.ink,
            after=0,
            first=True,
        )
        _para(cell, status.word, size=8.5, color=status.ink, after=0)
    _spacer(doc)


# --- Figures -----------------------------------------------------------------


def _new_paragraph(container):
    """A fresh paragraph, or a cell's own empty first one (so a cell has no blank line above)."""
    first = container.paragraphs[0] if hasattr(container, "_tc") and container.paragraphs else None
    if first is not None and len(container.paragraphs) == 1 and not first.runs:
        return first
    return container.add_paragraph()


def _picture(container, svg: str, width_in: float) -> bool:
    """One chart as a PNG at ``width_in``; ``False`` (and a line saying so) when it cannot be drawn."""
    from docx.shared import Inches

    paragraph = _new_paragraph(container)
    paragraph.paragraph_format.space_after = 0
    try:
        raster = svg_to_png(svg)
    except FigureRasterError:
        _write(
            paragraph,
            f"Figura indisponível nesta cópia: {figure_alt(svg).split('.')[0]}. "
            "Ela está no laudo emitido (HTML).",
            size=9,
            italic=True,
            color=token("ink-muted"),
        )
        return False
    shape = paragraph.add_run().add_picture(io.BytesIO(raster.png), width=Inches(width_in))
    shape._inline.docPr.set("descr", figure_alt(svg))
    return True


def _figures(doc, figures: list[str], *, paired: bool) -> None:
    if paired and len(figures) > 1:
        # Two charts side by side, then the rest stacked.
        table = _table(doc, 1, 2)
        for cell, svg in zip(table.rows[0].cells, figures[:2], strict=True):
            _picture(cell, svg, PAGE_WIDTH_IN / 2 - 0.2)
        figures = figures[2:]
    for svg in figures:
        _picture(doc, svg, PAGE_WIDTH_IN - 0.2)


# --- Sections ----------------------------------------------------------------


def _mini_table(doc, section: LaudoSection) -> None:
    """The section's small table: same cells as the HTML laudo, absent data as the word."""
    sheet = section.table
    if sheet is None or not sheet.rows:
        return
    columns = max(len(sheet.header), 1)
    table = _table(doc, len(sheet.rows) + 1, columns)
    for cell, name in zip(table.rows[0].cells, sheet.header, strict=False):
        _shade(cell, token("surface-sunken"))
        _borders(cell, bottom=(token("edge-strong"), 8))
        _cell_margins(cell, top=40, bottom=40)
        _para(cell, name, size=8.5, bold=True, color=token("ink-muted"), after=0, first=True)
    from app.exporters.docx import _set_repeat_header_and_cant_split

    _set_repeat_header_and_cant_split(table.rows[0])
    for position, values in enumerate(sheet.rows, start=1):
        for index in range(columns):
            value = values[index] if index < len(values) else ""
            text = "ausente" if value is None else str(value)
            cell = table.cell(position, index)
            _borders(cell, bottom=(token("edge-subtle"), 4))
            _cell_margins(cell, top=40, bottom=40)
            absent = text == "ausente"
            _para(
                cell,
                text,
                size=8.5,
                italic=absent,
                color=token("ink-subtle") if absent else None,
                after=0,
                first=True,
            )
    _spacer(doc, 8)


def _section(doc, section: LaudoSection, number: int, *, new_page: bool) -> None:
    _heading(doc, number, section.title, page_break=new_page)
    if section.lead:
        _para(doc, section.lead, size=9.5, color=token("ink-muted"), after=6)
    if section.unavailable:
        line = _para(doc, after=6)
        _write(line, "Não avaliado. ", size=10, bold=True, color=STATUS["na"].ink)
        _write(line, section.unavailable, size=10, color=token("ink-muted"))
    _cards(doc, section.cards)
    if section.table_first:
        _mini_table(doc, section)
    _figures(doc, section.figures, paired=section.paired)
    for group, chips in section.chips:
        line = _para(doc, after=4)
        _write(line, f"{group}: ", size=9, bold=True, color=token("ink-muted"))
        _write(line, "  ·  ".join(chips), size=9)
    if not section.table_first:
        _mini_table(doc, section)
    for note in section.notes:
        _para(doc, note, size=8.5, color=token("ink-muted"), after=2, style="List Bullet")


# --- Footer ------------------------------------------------------------------


def _field(paragraph, instruction: str, *, size: float = 8) -> None:
    """A Word field (``PAGE``, ``NUMPAGES``) that updates itself when the document opens."""
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.shared import Pt

    run = paragraph.add_run()
    run.font.size = Pt(size)
    run.font.color.rgb = _rgb(token("ink-muted"))
    for kind, text in (
        ("begin", None),
        (None, instruction),
        ("separate", None),
        (None, "1"),
        ("end", None),
    ):
        if kind is not None:
            node = OxmlElement("w:fldChar")
            node.set(qn("w:fldCharType"), kind)
        elif text == instruction:
            node = OxmlElement("w:instrText")
            node.set(qn("xml:space"), "preserve")
            node.text = f" {instruction} "
        else:
            node = OxmlElement("w:t")
            node.text = text
        run._r.append(node)


def _footer(doc, study_name: str) -> None:
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    for section in doc.sections:
        paragraph = section.footer.paragraphs[0]
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _write(
            paragraph,
            f"Laudo de engenharia — {study_name} · cópia editável · página ",
            size=8,
            color=token("ink-muted"),
        )
        _field(paragraph, "PAGE")
        _write(paragraph, " de ", size=8, color=token("ink-muted"))
        _field(paragraph, "NUMPAGES")
        second = section.footer.add_paragraph()
        second.alignment = WD_ALIGN_PARAGRAPH.CENTER
        _write(second, FOOTER, size=7.5, color=token("ink-subtle"))


# --- The document ------------------------------------------------------------


def _cover(doc, document: LaudoDocument) -> None:
    band = _table(doc, 1, 1)
    cell = band.cell(0, 0)
    _shade(cell, token("brand-900"))
    _cell_margins(cell, top=360, bottom=360, left=320, right=320)
    white = token("surface-raised")
    _para(
        cell,
        "LAUDO DE ENGENHARIA · SELEÇÃO DE MATERIAIS",
        size=9,
        bold=True,
        color=token("brand-200"),
        after=8,
        first=True,
    )
    _para(
        cell,
        f"Laudo de engenharia — {document.study_name}",
        size=24,
        bold=True,
        color=white,
        after=6,
    )
    if document.description:
        _para(cell, document.description, size=11, color=token("brand-100"), after=0)
    _spacer(doc, 10)

    engineer = document.engineer
    engineer_line = engineer.name
    if engineer.name and engineer.title:
        engineer_line = f"{engineer.name} — {engineer.title}"
    when = long_date(engineer.issue_date) if engineer.issue_date else None
    place = ", ".join(part for part in (engineer.city, when) if part) or None
    facts = [
        ("Cliente", document.client_name, "não informado"),
        ("Projeto", document.client_project, "não informado"),
        ("Responsável técnico", engineer_line, "não informado"),
        ("Registro profissional", engineer.registration, "não informado"),
        ("Local e data de emissão", place, "não informado"),
        ("ART", engineer.art, "não informada"),
    ]
    table = _table(doc, len(facts), 2, [2.0, 4.67])
    for row, (label, value, absent) in zip(table.rows, facts, strict=True):
        first, second = row.cells
        for cell in row.cells:
            _borders(cell, bottom=(token("edge-subtle"), 4))
            _cell_margins(cell, top=50, bottom=50)
        _para(first, label, size=9, color=token("ink-muted"), after=0, first=True)
        if value:
            _para(second, value, size=10.5, bold=True, after=0, first=True)
        else:
            _para(
                second, absent, size=10, italic=True, color=token("ink-subtle"), after=0, first=True
            )
    _spacer(doc, 10)

    _hero(doc, document, large=True)
    _cards(doc, document.key_figures[:5])
    note = _para(doc, after=0, before=4)
    _write(note, "Versão editável — não emitida. ", size=9.5, bold=True, color=STATUS["warn"].ink)
    _write(note, EDITABLE_NOTE, size=9, color=token("ink-muted"))


def _summary(doc, document: LaudoDocument, number: int) -> None:
    _heading(doc, number, "Resumo executivo", page_break=True)
    _hero(doc, document, large=False)
    _cards(doc, document.key_figures[:5])
    if document.why:
        _subheading(doc, "Por que este material")
        for line in document.why:
            _para(doc, line, size=10, after=3, style="List Bullet")
    if document.lights:
        _subheading(doc, "Requisitos e verificações")
        _lights_table(doc, document)
    if document.donut:
        _picture(doc, document.donut, 4.2)
    _subheading(doc, "Escopo deste laudo")
    _scope_table(doc, document)
    if document.ranking_mini:
        _picture(doc, document.ranking_mini, PAGE_WIDTH_IN - 0.2)


def _narrative(doc, document: LaudoDocument, number: int) -> None:
    _heading(doc, number, "Interpretação técnica (IA)")
    if document.narrative:
        for text in document.narrative:
            _para(doc, text, size=10, after=5)
        for caveat in document.narrative_caveats or []:
            _para(
                doc,
                caveat,
                size=9,
                italic=True,
                color=token("ink-muted"),
                after=2,
                style="List Bullet",
            )
    else:
        _para(
            doc,
            "Interpretação por IA não disponível.",
            size=9.5,
            italic=True,
            color=token("ink-muted"),
        )
    if document.narrative_note:
        _para(doc, document.narrative_note, size=8.5, color=token("ink-muted"), before=4)
    _para(
        doc,
        "A IA só interpreta: todo número deste laudo foi calculado pelo servidor, de forma determinística.",
        size=8,
        color=token("ink-subtle"),
        before=4,
    )


def _signature(doc, document: LaudoDocument, number: int) -> None:
    engineer = document.engineer
    _heading(doc, number, "Responsabilidade técnica e assinatura")
    _para(
        doc,
        "Este laudo é assinado pelo responsável técnico sobre o PDF do laudo emitido, à mão, pela "
        "assinatura gov.br ou com certificado digital. O código e o QR identificam a versão "
        "emitida; esta cópia editável não os carrega.",
        size=9.5,
        color=token("ink-muted"),
        after=14,
    ).paragraph_format.keep_with_next = True
    when = long_date(engineer.issue_date) if engineer.issue_date else "data não informada"
    place = f"{engineer.city}, {when}" if engineer.city else when
    _para(doc, f"{place}.", size=10, after=26).paragraph_format.keep_with_next = True
    line = _para(doc, "_" * 46, size=10, color=token("edge-strong"), after=2)
    line.paragraph_format.keep_with_next = True
    _para(
        doc, engineer.name or "Responsável técnico não informado", size=11, bold=True, after=0
    ).paragraph_format.keep_with_next = True
    if engineer.title:
        _para(doc, engineer.title, size=10, after=0).paragraph_format.keep_with_next = True
    _para(
        doc,
        f"Registro: {engineer.registration or 'não informado'} · ART: {engineer.art or 'não informada'}",
        size=9.5,
        color=token("ink-muted"),
    )


def _annex(doc, document: LaudoDocument, number: int) -> None:
    _heading(doc, number, "Anexo técnico", page_break=True)
    _para(
        doc,
        "As tabelas completas do estudo, para auditoria: o problema, os limites e o funil, os "
        "candidatos, as contribuições, os excluídos por dado ausente, a sensibilidade e a "
        "proveniência de cada valor.",
        size=9.5,
        color=token("ink-muted"),
        after=6,
    )
    cleaned = xml_legal_report(
        Report(title="", subtitle="", notices=document.notices, sheets=document.annex)
    )
    if cleaned.notices:
        box = _table(doc, 1, 1)
        cell = box.cell(0, 0)
        _shade(cell, token("surface-sunken"))
        _cell_margins(cell)
        for position, notice in enumerate(cleaned.notices):
            _para(cell, notice, size=9, color=token("ink-muted"), after=3, first=position == 0)
        _spacer(doc, 8)
    for position, sheet in enumerate(cleaned.sheets, start=1):
        add_sheet(doc, sheet, f"A{position}. {sheet.name}", level=2)


def _style_document(doc) -> None:
    from docx.shared import Inches, Pt

    for section in doc.sections:
        section.page_width = Inches(8.27)
        section.page_height = Inches(11.69)
        section.top_margin = Inches(0.8)
        section.bottom_margin = Inches(0.8)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10)
    for name, size in (("Heading 1", 16), ("Heading 2", 13)):
        style = doc.styles[name]
        style.font.name = "Calibri"
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = _rgb(token("brand-900"))


def render_laudo_docx(document: LaudoDocument) -> bytes:
    """The laudo as one standalone DOCX (editable copy; no seal, no code)."""
    from docx import Document

    doc = Document()
    _style_document(doc)
    doc.core_properties.title = xml_legal(f"Laudo de engenharia — {document.study_name}")
    doc.core_properties.author = xml_legal(document.engineer.name or "MaterialSelect AI")
    doc.core_properties.subject = "Laudo de engenharia (cópia editável)"

    _cover(doc, document)
    number = 1
    _summary(doc, document, number)
    for section in document.sections:
        number += 1
        # Each tool with figures opens a page of its own, as in the printed laudo.
        rich = not section.unavailable and bool(section.figures)
        _section(doc, section, number, new_page=rich)
    number += 1
    _narrative(doc, document, number)
    number += 1
    _signature(doc, document, number)
    number += 1
    _annex(doc, document, number)
    _footer(doc, xml_legal(document.study_name))

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
