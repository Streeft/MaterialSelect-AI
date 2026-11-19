"""The engineering report (laudo) as a PowerPoint deck (D-243).

The deck for the meeting where the engineer presents the result: a cover, **one summary
slide** (the recommended material, the key-figure cards, the reasons and the traffic light as
a coloured table), **one slide per section** of the laudo (cost, environmental impact,
fabrication… each with its cards and its charts as pictures), the AI's interpretation, the
signature block and the notices.

It is built from the same :class:`~app.exporters.laudo.LaudoDocument` as the HTML and the Word
copy, with the same tokens, so the three cannot disagree on a number. The charts are the
very same SVG rasterised to PNG (``svg_png``); one that cannot be drawn becomes a line saying
which, never a silent hole.

D-249 brought the **technical annex** into the deck, as an appendix after the signature: every
table of the study (problem, limits and funnel, candidates, contributions, exclusions,
sensitivity, composition, provenance), ``A1``, ``A2``… like the Word copy and the issued HTML.
A table of hundreds of rows is not a set of slides, so each one is **capped** at
``ANNEX_MAX_ROWS`` rows (ten to a slide) and the slide title says so — "primeiras 60 de 312
linhas" — never a silent cut; the whole table stays in the Word copy and in the issued laudo.
Like the Word copy, this is an editable presentation, **not** the issued laudo: no seal, no
code.

python-pptx is imported inside the function (D-235); lengths come from ``emu`` so the
module costs nothing at boot.
"""

from __future__ import annotations

import io

from app.exporters.emu import Inches, Pt
from app.exporters.laudo import KeyFigure, LaudoDocument, LaudoSection, long_date
from app.exporters.laudo_theme import STATUS, token
from app.exporters.pptx import MARGIN, SLIDE_HEIGHT, SLIDE_WIDTH, _add_sheet_slides
from app.exporters.report import Report, Sheet
from app.exporters.svg_png import FigureRasterError, figure_alt, svg_to_png
from app.exporters.xml_text import xml_legal, xml_legal_report

EDITABLE_NOTE = (
    "Apresentação editável gerada com os dados de hoje. Não é o laudo emitido: não tem código "
    "de verificação nem QR."
)
#: The same note for a deck made from the **frozen** version (D-252).
ISSUED_COPY_NOTE = (
    "Cópia editável da versão emitida {version}, código {code}. Os números e o texto são os do "
    "documento congelado na emissão. Não é o laudo emitido: não tem selo nem QR."
)
#: Rows of one annex table that go into the deck (D-249). The Word copy and the issued laudo
#: carry every row; a deck is for presenting, and a candidate table of hundreds is not a slide.
ANNEX_MAX_ROWS = 60
ANNEX_NOTE = (
    "O anexo técnico está ao final desta apresentação, com as primeiras "
    f"{ANNEX_MAX_ROWS} linhas de cada tabela. As tabelas completas estão na cópia em Word e no "
    "laudo emitido (HTML)."
)

_TONES: dict[str, tuple[str, str]] = {
    "brand": (token("brand-700"), token("brand-50")),
    "ok": (STATUS["ok"].colour, STATUS["ok"].soft),
    "warn": (STATUS["warn"].colour, STATUS["warn"].soft),
    "fail": (STATUS["fail"].colour, STATUS["fail"].soft),
    "na": (STATUS["na"].colour, STATUS["na"].soft),
    "neutral": (token("edge-strong"), token("surface-sunken")),
}

#: Slide content area below the title bar.
_TITLE_H = Inches(1.0)
_BODY_TOP = Inches(1.25)
_BODY_BOTTOM = SLIDE_HEIGHT - Inches(0.35)
_BODY_W = SLIDE_WIDTH - 2 * MARGIN
_MAX_FIGURES_PER_SLIDE = 2


def _rgb(value: str):
    from pptx.dml.color import RGBColor

    return RGBColor.from_string(value.lstrip("#").upper())


def _box(slide, left, top, width, height, fill: str | None, line: str | None = None):
    from pptx.enum.shapes import MSO_SHAPE

    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.shadow.inherit = False
    if fill is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = _rgb(fill)
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = _rgb(line)
        shape.line.width = Pt(0.75)
    return shape


def _text(
    slide,
    left,
    top,
    width,
    height,
    lines: list[tuple[str, float, bool, str]] | str,
    *,
    size: float = 14,
    bold: bool = False,
    color: str | None = None,
    italic: bool = False,
    bullets: bool = False,
):
    """A text box. ``lines`` is a string, or ``(text, size, bold, colour)`` per paragraph."""
    box = slide.shapes.add_textbox(left, top, width, height)
    frame = box.text_frame
    frame.word_wrap = True
    frame.margin_left = frame.margin_right = Inches(0.05)
    frame.margin_top = frame.margin_bottom = Inches(0.03)
    items = [(lines, size, bold, color or token("ink"))] if isinstance(lines, str) else list(lines)
    for index, (text, item_size, item_bold, item_color) in enumerate(items):
        paragraph = frame.paragraphs[0] if index == 0 else frame.add_paragraph()
        run = paragraph.add_run()
        run.text = xml_legal(f"• {text}" if bullets else text)
        run.font.size = Pt(item_size)
        run.font.bold = item_bold
        run.font.italic = italic
        run.font.color.rgb = _rgb(item_color)
        paragraph.space_after = Pt(4)
    return box


def _new_slide(presentation, title: str | None = None):
    slide = presentation.slides.add_slide(presentation.slide_layouts[6])  # blank
    if title is not None:
        _box(slide, 0, 0, SLIDE_WIDTH, _TITLE_H, token("brand-900"))
        _text(
            slide,
            MARGIN,
            Inches(0.2),
            _BODY_W,
            Inches(0.65),
            title,
            size=26,
            bold=True,
            color=token("surface-raised"),
        )
    return slide


def _cards(slide, cards: list[KeyFigure], top, height: int | None = None) -> None:
    """One row of up to five cards: coloured top rule, soft ground, label, value and hint."""
    cards = cards[:5]
    if not cards:
        return
    height = Inches(1.25) if height is None else height
    gap = Inches(0.15)
    width = int((_BODY_W - gap * (len(cards) - 1)) / len(cards))
    for index, card in enumerate(cards):
        rule, soft = _TONES.get(card.tone, _TONES["neutral"])
        left = MARGIN + index * (width + gap)
        _box(slide, left, top, width, height, soft)
        _box(slide, left, top, width, Inches(0.06), rule)
        quiet = card.tone == "na"
        value = f"{card.value} {card.unit}".strip()
        _text(
            slide,
            left + Inches(0.08),
            top + Inches(0.1),
            width - Inches(0.16),
            height - Inches(0.12),
            [
                (card.label, 10, False, token("ink-muted")),
                (
                    value,
                    13 if quiet else 20,
                    True,
                    token("ink-subtle") if quiet else token("ink"),
                ),
                *([(card.hint, 9, False, token("ink-muted"))] if card.hint else []),
            ],
        )


def _picture(slide, svg: str, left, top, max_w, max_h) -> bool:
    """A chart as a PNG fitted in the box and centred; a line saying so when it cannot be drawn."""
    try:
        raster = svg_to_png(svg)
    except FigureRasterError:
        _text(
            slide,
            left,
            top,
            max_w,
            Inches(0.6),
            f"Figura indisponível nesta cópia: {figure_alt(svg).split('.')[0]}.",
            size=12,
            italic=True,
            color=token("ink-muted"),
        )
        return False
    width = min(max_w, int(max_h / raster.aspect))
    height = int(width * raster.aspect)
    picture = slide.shapes.add_picture(
        io.BytesIO(raster.png),
        left + int((max_w - width) / 2),
        top + int((max_h - height) / 2),
        width,
        height,
    )
    picture._element.nvPicPr.cNvPr.set("descr", figure_alt(svg))
    return True


def _table(slide, left, top, width, header: list[str], rows: list[list[str]], *, size: float = 10):
    """A plain table: shaded header, one line per row, absent data as the word."""
    shape = slide.shapes.add_table(
        len(rows) + 1, max(len(header), 1), left, top, width, Inches(0.3) * (len(rows) + 1)
    )
    table = shape.table
    for column, name in enumerate(header):
        cell = table.cell(0, column)
        cell.fill.solid()
        cell.fill.fore_color.rgb = _rgb(token("surface-sunken"))
        cell.text = xml_legal(name)
        for run in cell.text_frame.paragraphs[0].runs:
            run.font.size = Pt(size)
            run.font.bold = True
            run.font.color.rgb = _rgb(token("ink-muted"))
    for r, values in enumerate(rows, start=1):
        for column in range(len(header)):
            cell = table.cell(r, column)
            cell.fill.solid()
            cell.fill.fore_color.rgb = _rgb(token("surface-raised"))
            text = values[column] if column < len(values) else ""
            cell.text = xml_legal(text)
            for run in cell.text_frame.paragraphs[0].runs:
                run.font.size = Pt(size)
                run.font.italic = text == "ausente"
                run.font.color.rgb = _rgb(
                    token("ink-subtle") if text == "ausente" else token("ink")
                )
    return table


# --- Slides ------------------------------------------------------------------


def _cover(presentation, document: LaudoDocument) -> None:
    slide = _new_slide(presentation)
    _box(slide, 0, 0, SLIDE_WIDTH, SLIDE_HEIGHT, token("brand-900"))
    _text(
        slide,
        MARGIN,
        Inches(0.9),
        _BODY_W,
        Inches(0.4),
        "LAUDO DE ENGENHARIA · SELEÇÃO DE MATERIAIS",
        size=13,
        bold=True,
        color=token("brand-200"),
    )
    _text(
        slide,
        MARGIN,
        Inches(1.4),
        _BODY_W,
        Inches(1.6),
        f"Laudo de engenharia — {document.study_name}",
        size=38,
        bold=True,
        color=token("surface-raised"),
    )
    if document.description:
        _text(
            slide,
            MARGIN,
            Inches(3.0),
            _BODY_W,
            Inches(0.9),
            document.description,
            size=16,
            color=token("brand-100"),
        )
    recommendation = document.recommendation
    _box(slide, MARGIN, Inches(4.1), Inches(7.6), Inches(1.5), token("brand-50"))
    _box(slide, MARGIN, Inches(4.1), Inches(0.08), Inches(1.5), token("brand-700"))
    _text(
        slide,
        MARGIN + Inches(0.25),
        Inches(4.2),
        Inches(7.2),
        Inches(1.3),
        [
            ("MATERIAL RECOMENDADO", 11, True, token("brand-700")),
            (
                (
                    recommendation.name
                    if recommendation
                    else (document.no_recommendation or "Nenhum material recomendado.")
                ),
                28 if recommendation else 16,
                True,
                token("brand-900"),
            ),
            *([(recommendation.standing, 12, False, token("ink-muted"))] if recommendation else []),
        ],
    )
    engineer = document.engineer
    line = engineer.name or "Responsável técnico não informado"
    if engineer.name and engineer.title:
        line = f"{engineer.name} — {engineer.title}"
    when = long_date(engineer.issue_date) if engineer.issue_date else None
    place = ", ".join(part for part in (engineer.city, when) if part)
    _text(
        slide,
        MARGIN,
        Inches(5.85),
        _BODY_W,
        Inches(1.2),
        [
            (line, 15, True, token("surface-raised")),
            *([(place, 13, False, token("brand-100"))] if place else []),
            *(
                [(f"Cliente: {document.client_name}", 13, False, token("brand-100"))]
                if document.client_name
                else []
            ),
            (
                (
                    ISSUED_COPY_NOTE.format(version=document.version, code=document.issued_code)
                    if document.issued_code is not None
                    else "Versão editável — não emitida. " + EDITABLE_NOTE
                ),
                10,
                False,
                token("brand-200"),
            ),
        ],
    )


def _summary(presentation, document: LaudoDocument) -> None:
    slide = _new_slide(presentation, "Resumo executivo")
    recommendation = document.recommendation
    _box(slide, MARGIN, _BODY_TOP + Inches(0.1), _BODY_W, Inches(0.95), token("brand-50"))
    _box(slide, MARGIN, _BODY_TOP + Inches(0.1), Inches(0.08), Inches(0.95), token("brand-700"))
    standing = ""
    if recommendation:
        standing = recommendation.standing
        if recommendation.class_name:
            standing = f"{standing} · {recommendation.class_name}"
    _text(
        slide,
        MARGIN + Inches(0.2),
        _BODY_TOP + Inches(0.14),
        _BODY_W - Inches(0.3),
        Inches(0.9),
        [
            ("MATERIAL RECOMENDADO", 10, True, token("brand-700")),
            (
                (
                    recommendation.name
                    if recommendation
                    else (document.no_recommendation or "Nenhum material recomendado.")
                ),
                22 if recommendation else 14,
                True,
                token("brand-900"),
            ),
            *([(standing, 11, False, token("ink-muted"))] if standing else []),
        ],
    )
    _cards(slide, document.key_figures, _BODY_TOP + Inches(1.2))
    lower = _BODY_TOP + Inches(2.65)
    half = int((_BODY_W - Inches(0.3)) / 2)
    if document.why:
        _text(
            slide,
            MARGIN,
            lower,
            half,
            _BODY_BOTTOM - lower,
            [("Por que este material", 13, True, token("brand-900"))]
            + [(line, 11, False, token("ink")) for line in document.why[:6]],
        )
    if document.lights:
        lights = document.lights[:8]
        shape_left = MARGIN + half + Inches(0.3)
        table_shape = slide.shapes.add_table(
            len(lights), 2, shape_left, lower, half, Inches(0.3) * len(lights)
        )
        table = table_shape.table
        table.columns[0].width = Inches(1.5)
        table.columns[1].width = half - Inches(1.5)
        for row, light in zip(table.rows, lights, strict=True):
            status = STATUS.get(light.status, STATUS["na"])
            first, second = row.cells
            first.fill.solid()
            first.fill.fore_color.rgb = _rgb(status.soft)
            first.text = xml_legal(f"{status.glyph} {status.word}")
            second.fill.solid()
            second.fill.fore_color.rgb = _rgb(token("surface-raised"))
            second.text = xml_legal(light.label)
            for run in first.text_frame.paragraphs[0].runs:
                run.font.size = Pt(10)
                run.font.bold = True
                run.font.color.rgb = _rgb(status.ink)
            for run in second.text_frame.paragraphs[0].runs:
                run.font.size = Pt(10)
                run.font.color.rgb = _rgb(token("ink"))
        if len(document.lights) > len(lights):
            _text(
                slide,
                shape_left,
                _BODY_BOTTOM - Inches(0.3),
                half,
                Inches(0.3),
                f"+ {len(document.lights) - len(lights)} verificações no laudo emitido e no Word.",
                size=9,
                italic=True,
                color=token("ink-muted"),
            )


def _section_slides(presentation, section: LaudoSection, number: int) -> None:
    title = f"{number}. {section.title}"
    slide = _new_slide(presentation, title)
    top = _BODY_TOP + Inches(0.05)
    if section.lead:
        _text(
            slide,
            MARGIN,
            top,
            _BODY_W,
            Inches(0.5),
            section.lead,
            size=12,
            color=token("ink-muted"),
        )
        top += Inches(0.55)
    if section.unavailable:
        _text(
            slide,
            MARGIN,
            top,
            _BODY_W,
            Inches(1.2),
            [
                ("Não avaliado", 16, True, STATUS["na"].ink),
                (section.unavailable, 13, False, token("ink-muted")),
            ],
        )
        return
    if section.cards:
        _cards(slide, section.cards, top, Inches(1.1))
        top += Inches(1.25)
    figures = list(section.figures)
    first, rest = figures[:_MAX_FIGURES_PER_SLIDE], figures[_MAX_FIGURES_PER_SLIDE:]
    notes_h = Inches(0.3) * min(len(section.notes), 3) if section.notes else 0
    room = _BODY_BOTTOM - top - notes_h
    if first:
        gap = Inches(0.2)
        width = int((_BODY_W - gap * (len(first) - 1)) / len(first))
        for index, svg in enumerate(first):
            _picture(slide, svg, MARGIN + index * (width + gap), top, width, room)
    elif section.table is not None and section.table.rows:
        _section_table(slide, section, top)
    if section.notes:
        _text(
            slide,
            MARGIN,
            _BODY_BOTTOM - notes_h,
            _BODY_W,
            notes_h,
            [(note, 10, False, token("ink-muted")) for note in section.notes[:3]],
            bullets=True,
        )
    for chunk_start in range(0, len(rest), _MAX_FIGURES_PER_SLIDE):
        more = _new_slide(presentation, f"{title} (continuação)")
        chunk = rest[chunk_start : chunk_start + _MAX_FIGURES_PER_SLIDE]
        width = int((_BODY_W - Inches(0.2) * (len(chunk) - 1)) / len(chunk))
        for index, svg in enumerate(chunk):
            _picture(
                more,
                svg,
                MARGIN + index * (width + Inches(0.2)),
                _BODY_TOP + Inches(0.05),
                width,
                _BODY_BOTTOM - _BODY_TOP,
            )
    if first and section.table is not None and section.table.rows:
        table_slide = _new_slide(presentation, f"{title} (tabela)")
        _section_table(table_slide, section, _BODY_TOP + Inches(0.1))
    if section.chips:
        chips_slide = _new_slide(presentation, f"{title} (processos)")
        _text(
            chips_slide,
            MARGIN,
            _BODY_TOP + Inches(0.1),
            _BODY_W,
            _BODY_BOTTOM - _BODY_TOP,
            [
                (f"{group}: {'  ·  '.join(chips)}", 13, False, token("ink"))
                for group, chips in section.chips
            ],
        )


def _section_table(slide, section: LaudoSection, top) -> None:
    sheet = section.table
    assert sheet is not None
    rows = [
        ["ausente" if value is None else str(value) for value in row] for row in sheet.rows[:12]
    ]
    _table(slide, MARGIN, top, _BODY_W, [str(name) for name in sheet.header], rows, size=10)


def _narrative(presentation, document: LaudoDocument, number: int) -> None:
    slide = _new_slide(presentation, f"{number}. Interpretação técnica (IA)")
    lines: list[tuple[str, float, bool, str]] = []
    if document.narrative:
        lines += [(text, 13, False, token("ink")) for text in document.narrative]
        lines += [
            (f"• {c}", 11, False, token("ink-muted")) for c in document.narrative_caveats or []
        ]
    else:
        lines.append(("Interpretação por IA não disponível.", 14, False, token("ink-muted")))
    if document.narrative_note:
        lines.append((document.narrative_note, 11, False, token("ink-muted")))
    lines.append(
        (
            "A IA só interpreta: todo número deste laudo foi calculado pelo servidor, de forma "
            "determinística.",
            10,
            False,
            token("ink-subtle"),
        )
    )
    _text(slide, MARGIN, _BODY_TOP + Inches(0.1), _BODY_W, _BODY_BOTTOM - _BODY_TOP, lines)


def _signature(presentation, document: LaudoDocument, number: int) -> None:
    slide = _new_slide(presentation, f"{number}. Responsabilidade técnica e assinatura")
    engineer = document.engineer
    when = long_date(engineer.issue_date) if engineer.issue_date else "data não informada"
    place = f"{engineer.city}, {when}" if engineer.city else when
    _text(
        slide,
        MARGIN,
        _BODY_TOP + Inches(0.1),
        _BODY_W,
        Inches(1.0),
        "Este laudo é assinado pelo responsável técnico sobre o PDF do laudo emitido, à mão, pela "
        "assinatura gov.br ou com certificado digital. O código e o QR identificam a versão "
        "emitida; esta apresentação não os carrega.",
        size=13,
        color=token("ink-muted"),
    )
    _text(
        slide,
        MARGIN,
        Inches(3.6),
        Inches(7.5),
        Inches(2.4),
        [
            (f"{place}.", 14, False, token("ink")),
            ("", 14, False, token("ink")),
            ("_" * 44, 14, False, token("edge-strong")),
            (engineer.name or "Responsável técnico não informado", 16, True, token("ink")),
            *([(engineer.title, 13, False, token("ink"))] if engineer.title else []),
            (
                f"Registro: {engineer.registration or 'não informado'} · "
                f"ART: {engineer.art or 'não informada'}",
                12,
                False,
                token("ink-muted"),
            ),
        ],
    )


def _annex(presentation, document: LaudoDocument) -> None:
    """The technical annex as an appendix: one capped table per sheet, ``A1``, ``A2``… (D-249)."""
    if not document.annex:
        return
    slide = _new_slide(presentation, "Anexo técnico")
    _text(
        slide,
        MARGIN,
        _BODY_TOP + Inches(0.1),
        _BODY_W,
        Inches(1.6),
        [
            (
                "As tabelas do estudo, para auditoria: o problema, os limites e o funil, os "
                "candidatos, as contribuições, os excluídos por dado ausente, a sensibilidade, "
                "a composição e a proveniência de cada valor.",
                14,
                False,
                token("ink"),
            ),
            (
                f"Cada tabela traz até {ANNEX_MAX_ROWS} linhas; quando há mais, o título diz "
                "quantas. As tabelas completas estão na cópia em Word e no laudo emitido.",
                12,
                False,
                token("ink-muted"),
            ),
        ],
    )
    for position, sheet in enumerate(document.annex, start=1):
        shown = sheet.rows[:ANNEX_MAX_ROWS]
        name = sheet.name
        if len(sheet.rows) > len(shown):
            name = f"{name} (primeiras {len(shown)} de {len(sheet.rows)} linhas)"
        capped = Sheet(name=name, header=sheet.header, rows=shown, notes=sheet.notes)
        clean = xml_legal_report(Report(title="", subtitle="", notices=[], sheets=[capped])).sheets[
            0
        ]
        _add_sheet_slides(
            presentation, f"A{position}", clean.name, clean.header, clean.rows, clean.notes
        )


def _closing(presentation, document: LaudoDocument) -> None:
    slide = _new_slide(presentation, "Avisos")
    lines = [(notice, 12, False, token("ink")) for notice in document.notices]
    lines.append((ANNEX_NOTE, 12, True, token("ink-muted")))
    _text(slide, MARGIN, _BODY_TOP + Inches(0.1), _BODY_W, _BODY_BOTTOM - _BODY_TOP, lines)


def render_laudo_pptx(document: LaudoDocument) -> bytes:
    """The laudo as a 16:9 deck (editable copy; no seal, no code)."""
    from pptx import Presentation

    presentation = Presentation()
    presentation.slide_width = SLIDE_WIDTH
    presentation.slide_height = SLIDE_HEIGHT
    presentation.core_properties.title = xml_legal(f"Laudo de engenharia — {document.study_name}")
    presentation.core_properties.author = xml_legal(document.engineer.name or "MaterialSelect AI")

    _cover(presentation, document)
    _summary(presentation, document)
    number = 1
    for section in document.sections:
        number += 1
        _section_slides(presentation, section, number)
    number += 1
    _narrative(presentation, document, number)
    number += 1
    _signature(presentation, document, number)
    _annex(presentation, document)
    _closing(presentation, document)

    buffer = io.BytesIO()
    presentation.save(buffer)
    return buffer.getvalue()
