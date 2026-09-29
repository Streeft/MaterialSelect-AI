"""Exporting what the Studio made (D-94, D-98): DOCX, CSV, XLSX, SVG, PPTX and TXT.

The same two promises as every other export of this project:

* **Every file carries the limitation notice** (item 5 of the proposal), and a
  second one saying what an AI-made file is: made from the notebook's sources,
  each item citing the passage it rests on — to be checked there.
* **The escape is by format.** Spreadsheets go through ``Report``/``Sheet`` and
  :mod:`app.exporters.spreadsheet`, which neutralises formula injection cell by
  cell; the SVG escapes every string with ``html.escape``; python-docx writes
  text runs, never markup.

The mind map is drawn from the layout the screen draws
(``app.notebooks.mindmap``, handed over on ``ArtifactOut.layout``) — never laid
out again here.

The infographic (D-98) follows the same rule: its SVG draws the layout of
``app.notebooks.infographic`` — the very call the service makes for the
screen —, so screen and file cannot disagree about where a box is. Slides and
video go to :mod:`app.exporters.studio_pptx`; the audio script is a DOCX or a
plain TXT.

An external source's address and the attribution its licence asks for (D-97)
travel on each citation, and every "Referências" block prints them: a CC BY-SA
passage keeps its credit in every file that quotes it. They are text like any
other and go through the same per-format escape. A citation without them —
every phase 1 kind, and every citation stored before phase 3 — renders exactly
as it did before.
"""

from __future__ import annotations

import io
import re
from html import escape

from docx import Document
from docx.shared import Pt, RGBColor

# How a line of the audio script names who says it. The hosts are unnamed
# (D-98): the screen says "Apresentador(a) 1/2", and so does every file and a
# note saved from the artifact — one constant, in the reader's module.
from app.ai.studio import SPEAKER_LABEL
from app.exporters.report import LIMITATION_NOTICE, Report, Sheet
from app.exporters.spreadsheet import to_csv, to_xlsx
from app.exporters.studio_pptx import deck_to_pptx
from app.notebooks import infographic
from app.notebooks.mindmap import wrap
from app.notebooks.studio_content import cell_text
from app.schemas.notebook import ArtifactOut, CitationOut

AI_NOTICE = (
    "Gerado por IA a partir das fontes do caderno. Cada item cita o trecho em que se "
    "apoia; confira nas fontes antes de usar. Números só aparecem quando estão "
    "escritos no trecho citado."
)

NOTICES = [LIMITATION_NOTICE, AI_NOTICE]

_MEDIA = {
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "csv": "text/csv; charset=utf-8",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "svg": "image/svg+xml",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "txt": "text/plain; charset=utf-8",
}

#: Printed where an artifact cites nothing (D-24: absence is a sentence).
NO_CITATIONS = "Nenhum trecho citado."

#: Heading over the sentences the grounding check withheld — the screen's words.
WITHHELD_TITLE = "Parte do que foi gerado foi omitida"

#: Written in a references column when *another* citation of the same file
#: fills it (D-24: absence is a phrase, never a blank cell). "Registrada", not
#: "exigida": an absent attribution says nothing was recorded, not that the
#: source's licence asks for none.
NO_URL_LABEL = "sem endereço externo"
NO_ATTRIBUTION_LABEL = "sem atribuição registrada"

#: Characters XML cannot carry. python-docx and openpyxl raise on them, an SVG
#: holding one does not parse, and a lone surrogate cannot even be encoded as
#: UTF-8 — so text read from outside becomes a space instead of breaking the
#: export. The reader (``app.ai.studio``) already strips them from what a model
#: writes; this is the second wall, for an address, an attribution, a title the
#: student typed and anything stored before the reader did.
_NOT_XML = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\ud800-\udfff\ufffe\uffff]")

_INK = RGBColor(15, 23, 42)
_SUBTLE = RGBColor(100, 116, 139)


def render(artifact: ArtifactOut, fmt: str, notebook_title: str) -> tuple[bytes, str]:
    """One ready artifact as the bytes of ``fmt`` and its media type."""
    subtitle = f"Caderno “{notebook_title}” — Estúdio do MaterialSelect AI"
    if fmt == "svg":
        draw = infographic_svg if artifact.tool == "infographic" else mindmap_svg
        return draw(artifact, subtitle).encode("utf-8"), _MEDIA["svg"]
    if fmt == "docx":
        return _docx(artifact, subtitle), _MEDIA["docx"]
    if fmt == "pptx":
        deck = deck_to_pptx(
            artifact.title,
            artifact.content,
            artifact.citations,
            artifact.withheld,
            notices=NOTICES,
            narration=artifact.tool == "video",
            subtitle=subtitle,
        )
        return deck, _MEDIA["pptx"]
    if fmt == "txt":
        return _txt(artifact, subtitle).encode("utf-8"), _MEDIA["txt"]
    report = _report(artifact, subtitle)
    if fmt == "csv":
        return to_csv(report).encode("utf-8"), _MEDIA["csv"]
    if fmt == "xlsx":
        return to_xlsx(report), _MEDIA["xlsx"]
    raise ValueError(f"Formato desconhecido: {fmt}")


def _marks(citations: list[int]) -> str:
    return " ".join(f"[{n}]" for n in citations)


def _reference(citation: CitationOut) -> str:
    where = citation.source_title
    if citation.page_start is not None:
        pages = (
            f"p. {citation.page_start}"
            if citation.page_end in (None, citation.page_start)
            else f"p. {citation.page_start}–{citation.page_end}"
        )
        where += f", {pages}"
    if citation.heading:
        where += f" — {citation.heading}"
    return where


def _script(body: dict) -> list[str]:
    """The audio script, one line per spoken turn: "Apresentador(a) 1: … [n]"."""
    return [
        f"{SPEAKER_LABEL} {line['speaker']}: {line['text']} {_marks(line['citations'])}".strip()
        for line in body.get("lines", [])
    ]


def _xml(text: object) -> str:
    """Any text, XML-legal."""
    return _NOT_XML.sub(" ", str(text))


def _plain(text: str | None) -> str | None:
    """An external address or attribution, XML-legal; ``None`` stays ``None``."""
    return _xml(text) if text else None


def _credit(citation: CitationOut) -> tuple[str | None, str | None]:
    """The citation's address and attribution, ready for any format."""
    return _plain(citation.source_url), _plain(citation.source_attribution)


# --- spreadsheets --------------------------------------------------------------


def _references_sheet(artifact: ArtifactOut) -> Sheet:
    """The references, one row per citation.

    An "Endereço" or "Atribuição" column exists only when some citation fills
    it, so an artifact made from phase 1 sources keeps the three columns it
    always had. The cells are handed over raw: the spreadsheet writer puts
    every one through ``cells.safe_text`` — escaping here too would print the
    apostrophe twice.
    """
    credits = [_credit(c) for c in artifact.citations]
    with_url = any(url for url, _ in credits)
    with_attribution = any(attribution for _, attribution in credits)
    header = ["Nº", "Fonte", "Trecho citado"]
    header += ["Endereço"] if with_url else []
    header += ["Atribuição"] if with_attribution else []
    rows: list[list[object]] = []
    for citation, (url, attribution) in zip(artifact.citations, credits, strict=True):
        row: list[object] = [citation.number, _reference(citation), citation.excerpt]
        if with_url:
            row.append(url or NO_URL_LABEL)
        if with_attribution:
            row.append(attribution or NO_ATTRIBUTION_LABEL)
        rows.append(row)
    return Sheet(
        name="Referências",
        header=header,
        rows=rows,
        notes=[] if artifact.citations else ["Nenhum trecho citado."],
    )


def _report(artifact: ArtifactOut, subtitle: str) -> Report:
    body = artifact.content or {}
    notes = list(artifact.withheld)
    if artifact.tool == "table":
        columns = body.get("columns", [])
        rows = []
        for row in body.get("rows", []):
            cells = row["cells"]
            sources = "; ".join(
                f"{column} {_marks(cell['citations'])}"
                for column, cell in zip(columns, cells, strict=False)
                if cell["citations"]
            )
            rows.append([cell_text(cell) for cell in cells] + [sources])
        main = Sheet(name="Tabela", header=[*columns, "Fontes"], rows=rows, notes=notes)
    elif artifact.tool == "flashcards":
        main = Sheet(
            name="Cartões",
            header=["Frente", "Verso", "Fontes"],
            rows=[
                [card["front"], card["back"], _marks(card["citations"])]
                for card in body.get("cards", [])
            ],
            notes=notes,
        )
    elif artifact.tool == "quiz":
        rows = []
        for number, question in enumerate(body.get("questions", []), start=1):
            options = question["options"]
            answer = question["answer_index"]
            rows.append(
                [
                    number,
                    question["prompt"],
                    " | ".join(f"{chr(97 + i)}) {o}" for i, o in enumerate(options)),
                    f"{chr(97 + answer)}) {options[answer]}",
                    question["explanation"],
                    _marks(question["citations"]),
                ]
            )
        main = Sheet(
            name="Questões",
            header=["Nº", "Enunciado", "Alternativas", "Resposta", "Explicação", "Fontes"],
            rows=rows,
            notes=notes,
        )
    else:  # pragma: no cover - the service offers only the tool's formats
        raise ValueError(f"{artifact.tool} não tem planilha")
    return Report(
        title=_xml(artifact.title),
        subtitle=_xml(subtitle),
        notices=list(NOTICES),
        sheets=[_xml_sheet(main), _xml_sheet(_references_sheet(artifact))],
    )


def _xml_sheet(sheet: Sheet) -> Sheet:
    """``sheet`` with every string through :func:`_xml`: openpyxl raises on a
    control character, so one in a renamed title, a withheld line or a PDF
    excerpt would turn the XLSX download into a 500. Numbers pass untouched,
    and the formula escape stays ``cells.safe_text``'s — a different defence."""
    return Sheet(
        name=sheet.name,
        header=[_xml(h) for h in sheet.header],
        rows=[[_xml(c) if isinstance(c, str) else c for c in row] for row in sheet.rows],
        notes=[_xml(n) for n in sheet.notes],
    )


# --- DOCX ----------------------------------------------------------------------


def _docx(artifact: ArtifactOut, subtitle: str) -> bytes:
    """Every string goes through :func:`_xml`: python-docx raises on a control
    character, and one in a title would turn the whole download into a 500."""
    doc = Document()
    title = doc.add_paragraph()
    run = title.add_run(_xml(artifact.title))
    run.font.size, run.font.bold, run.font.color.rgb = Pt(20), True, _INK
    sub = doc.add_paragraph()
    run = sub.add_run(_xml(subtitle))
    run.font.size, run.font.color.rgb = Pt(11), _SUBTLE
    for notice in [*NOTICES, *artifact.withheld]:
        paragraph = doc.add_paragraph()
        run = paragraph.add_run(_xml(notice))
        run.font.size, run.font.italic, run.font.color.rgb = Pt(9.5), True, _SUBTLE

    body = artifact.content or {}
    if artifact.tool == "report":
        bullets = artifact.format == "topicos"
        for section in body.get("sections", []):
            doc.add_heading(_xml(section["heading"]), level=2)
            for paragraph in section["paragraphs"]:
                doc.add_paragraph(
                    _xml(f"{paragraph['text']} {_marks(paragraph['citations'])}".strip()),
                    style="List Bullet" if bullets else None,
                )
    elif artifact.tool == "flashcards":
        table = doc.add_table(rows=1, cols=2)
        table.style = "Table Grid"
        table.rows[0].cells[0].text, table.rows[0].cells[1].text = "Frente", "Verso"
        for card in body.get("cards", []):
            cells = table.add_row().cells
            cells[0].text = _xml(card["front"])
            cells[1].text = _xml(f"{card['back']} {_marks(card['citations'])}".strip())
    elif artifact.tool == "quiz":
        questions = body.get("questions", [])
        doc.add_heading("Questões", level=2)
        for number, question in enumerate(questions, start=1):
            doc.add_paragraph(_xml(f"{number}. {question['prompt']}"))
            for i, option in enumerate(question["options"]):
                option_line = doc.add_paragraph(_xml(f"{chr(97 + i)}) {option}"))
                option_line.paragraph_format.left_indent = Pt(18)
        doc.add_heading("Gabarito", level=2)
        for number, question in enumerate(questions, start=1):
            answer = question["answer_index"]
            text = f"{number}. {chr(97 + answer)}) {question['options'][answer]}"
            if question["explanation"]:
                text += f" — {question['explanation']}"
            doc.add_paragraph(_xml(f"{text} {_marks(question['citations'])}".strip()))
    elif artifact.tool == "audio":
        doc.add_heading("Roteiro", level=2)
        for line in _script(body):
            doc.add_paragraph(_xml(line))
    else:  # pragma: no cover - the service offers only the tool's formats
        raise ValueError(f"{artifact.tool} não tem DOCX")

    doc.add_heading("Referências", level=2)
    if not artifact.citations:
        doc.add_paragraph(NO_CITATIONS)
    for citation in artifact.citations:
        paragraph = doc.add_paragraph()
        paragraph.add_run(_xml(f"[{citation.number}] {_reference(citation)}")).bold = True
        # Address and credit on their own lines, before the excerpt: they say
        # whose the text below is. python-docx writes them as text runs.
        for line in _credit(citation):
            if line:
                credit = paragraph.add_run(f"\n{line}")
                credit.font.size = Pt(9)
        excerpt = paragraph.add_run(f"\n{_xml(citation.excerpt)}")
        excerpt.font.size, excerpt.font.color.rgb = Pt(9), _SUBTLE

    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()


# --- TXT -----------------------------------------------------------------------


def _txt(artifact: ArtifactOut, subtitle: str) -> str:
    """The audio script as plain text: notices first, then the script, then
    the references — the file a student pastes into a text-to-speech tool or a
    podcast editor, still saying what it is and where each line came from."""
    if artifact.tool != "audio":  # pragma: no cover - the service offers only the tool's formats
        raise ValueError(f"{artifact.tool} não tem TXT")
    lines = [artifact.title, subtitle, "", *NOTICES]
    if artifact.withheld:
        lines += ["", f"{WITHHELD_TITLE}:", *(f"- {sentence}" for sentence in artifact.withheld)]
    lines += ["", *_script(artifact.content or {}), "", "Referências"]
    if not artifact.citations:
        lines.append(NO_CITATIONS)
    for citation in artifact.citations:
        lines.append(f"[{citation.number}] {_reference(citation)}")
        lines += [line for line in _credit(citation) if line]
        lines += [f"    {excerpt}" for excerpt in citation.excerpt.splitlines() if excerpt]
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


# --- SVG -----------------------------------------------------------------------

_SVG_INK = "#0f172a"
_SVG_SUBTLE = "#475569"
_SVG_EDGE = "#94a3b8"
_SVG_SURFACE = "#ffffff"
#: Fill and stroke per depth: the central theme strongest, leaves lightest.
_SVG_LEVELS = (
    ("#1e3a8a", "#1e3a8a", "#ffffff"),
    ("#dbeafe", "#1d4ed8", "#0f172a"),
    ("#eef2ff", "#6366f1", "#0f172a"),
    ("#f8fafc", "#94a3b8", "#0f172a"),
)
_HEADER_LINE = 16.0


def _t(text: object) -> str:
    """SVG text: XML-legal first (a control character makes the file one no
    browser opens), then escaped."""
    return escape(_xml(text), quote=True)


def _svg_reference(citation: CitationOut, chars: int) -> list[str]:
    """One citation's lines under the map: the reference, then its address and
    attribution on lines of their own. The address is cut at the width and
    never hyphenated — a hyphen would be read as part of it —, and the
    attribution is never shortened: a licence credit cut with "…" is not the
    credit the licence asks for."""
    lines = wrap(f"[{citation.number}] {_reference(citation)}", chars, 2)
    url, attribution = _credit(citation)
    if url:
        lines += [url[i : i + chars] for i in range(0, len(url), chars)]
    if attribution:
        lines += wrap(attribution, chars, max_lines=len(attribution))
    return lines


def mindmap_svg(artifact: ArtifactOut, subtitle: str) -> str:
    """The mind map as a standalone SVG, drawn from the backend's layout."""
    layout = artifact.layout
    if layout is None:  # pragma: no cover - a ready mind map always has one
        raise ValueError("Mapa mental sem layout")
    width = max(layout.width, 640.0)
    chars = int((width - 32) // 6.4)
    header: list[tuple[str, int, str, str]] = [(artifact.title, 16, "600", _SVG_INK)]
    header += [(line, 11, "400", _SVG_SUBTLE) for line in wrap(subtitle, chars, 2)]
    for notice in [*NOTICES, *artifact.withheld]:
        header += [(line, 10, "400", _SVG_SUBTLE) for line in wrap(notice, chars, 4)]
    top = 16 + len(header) * _HEADER_LINE + 8
    # The references go below the map: an SVG carried alone still says where
    # every bracketed number points.
    references = [
        line for citation in artifact.citations for line in _svg_reference(citation, chars)
    ]
    bottom = top + layout.height
    height = bottom + (len(references) * 14 + 24 if references else 0)

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:g} {height:g}" '
        f'width="{width:g}" height="{height:g}" role="img" aria-label="{_t(artifact.title)}" '
        'font-family="ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif">',
        f"<title>{_t(artifact.title)}</title>",
        f"<desc>{_t(AI_NOTICE)}</desc>",
        f'<rect x="0" y="0" width="{width:g}" height="{height:g}" fill="{_SVG_SURFACE}"/>',
    ]
    for index, (line, size, weight, colour) in enumerate(header):
        y = 16 + (index + 1) * _HEADER_LINE - 4
        parts.append(
            f'<text x="16" y="{y:g}" font-size="{size}" font-weight="{weight}" '
            f'fill="{colour}">{_t(line)}</text>'
        )
    parts.append(f'<g transform="translate(0 {top:g})">')
    for edge in layout.edges:
        bend = (edge.x2 - edge.x1) / 2
        parts.append(
            f'<path d="M {edge.x1:g} {edge.y1:g} C {edge.x1 + bend:g} {edge.y1:g}, '
            f'{edge.x2 - bend:g} {edge.y2:g}, {edge.x2:g} {edge.y2:g}" fill="none" '
            f'stroke="{_SVG_EDGE}" stroke-width="1.5"/>'
        )
    for node in layout.nodes:
        fill, stroke, ink = _SVG_LEVELS[min(node.depth, len(_SVG_LEVELS) - 1)]
        parts.append(
            f'<rect x="{node.x:g}" y="{node.y:g}" width="{node.width:g}" '
            f'height="{node.height:g}" rx="10" fill="{fill}" stroke="{stroke}"/>'
        )
        marks = _marks(node.citations)
        lines = list(node.lines)
        for index, line in enumerate(lines):
            y = node.y + 9 + 13 + index * 17
            parts.append(
                f'<text x="{node.x + 12:g}" y="{y:g}" font-size="13" fill="{ink}">'
                f"{_t(line)}</text>"
            )
        if marks:
            parts.append(
                f'<text x="{node.x + node.width - 6:g}" y="{node.y + node.height - 5:g}" '
                f'font-size="9" text-anchor="end" fill="{ink}" opacity="0.7">{_t(marks)}</text>'
            )
    parts.append("</g>")
    for index, line in enumerate(references):
        parts.append(
            f'<text x="16" y="{bottom + 8 + (index + 1) * 14:g}" font-size="10" '
            f'fill="{_SVG_SUBTLE}">{_t(line)}</text>'
        )
    parts.append("</svg>")
    return "".join(parts)


# --- infographic SVG -----------------------------------------------------------

#: One tone per ``Block.tone`` (``infographic.TONES``): card fill, card stroke
#: and the heading's ink. The screen maps the same index to its tokens; a file
#: carries fixed colours, light fills under dark ink so it prints and reads on
#: any viewer. Every heading ink is well above 4.5:1 on its own fill.
_INFOGRAPHIC_TONES = (
    ("#dbeafe", "#1d4ed8", "#1e3a8a"),
    ("#ccfbf1", "#0f766e", "#134e4a"),
    ("#ede9fe", "#6d28d9", "#4c1d95"),
    ("#fef3c7", "#b45309", "#78350f"),
    ("#ffe4e6", "#be123c", "#881337"),
    ("#dcfce7", "#15803d", "#14532d"),
)
#: A generic family only: the file must not depend on a font it cannot carry
#: (no external reference), and the layout measures text by character count.
_INFOGRAPHIC_FONT = "Arial, Helvetica, sans-serif"
_FOOTER_LINE = 15
_FOOTER_CHAR = 6.4


def _baseline(top: float, line_height: int) -> int:
    """Where to put a text baseline so the glyphs sit inside their line box."""
    return round(top + line_height * 0.75)


def _arrow(x1: int, y1: int, x2: int, y2: int) -> str:
    """A small arrowhead at ``(x2, y2)`` pointing along the connector, drawn as
    a polygon — no ``<marker>``, so every rasteriser draws the same thing."""
    dx, dy = x2 - x1, y2 - y1
    length = (dx * dx + dy * dy) ** 0.5 or 1.0
    ux, uy = dx / length, dy / length
    size = 8.0
    bx, by = x2 - ux * size, y2 - uy * size
    px, py = -uy * size / 2, ux * size / 2
    return f"{x2:g},{y2:g} {bx + px:g},{by + py:g} {bx - px:g},{by - py:g}"


def _infographic_footer(artifact: ArtifactOut, subtitle: str, chars: int) -> list[tuple]:
    """Lines under the poster: subtitle, notices, what was withheld, and the
    references — the file carried alone still says what it is and where every
    bracketed number points."""
    lines: list[tuple[str, int, str, str]] = []
    lines += [(line, 11, "600", _SVG_SUBTLE) for line in wrap(subtitle, chars, 2)]
    for notice in NOTICES:
        lines += [(line, 10, "400", _SVG_SUBTLE) for line in wrap(notice, chars, 6)]
    if artifact.withheld:
        lines.append((WITHHELD_TITLE, 11, "600", _SVG_INK))
        for sentence in artifact.withheld:
            lines += [
                (line, 10, "400", _SVG_SUBTLE)
                for line in wrap(sentence, chars, max_lines=len(sentence) or 1)
            ]
    lines.append(("Referências", 11, "600", _SVG_INK))
    if not artifact.citations:
        lines.append((NO_CITATIONS, 10, "400", _SVG_SUBTLE))
    for citation in artifact.citations:
        lines += [(line, 10, "400", _SVG_SUBTLE) for line in _svg_reference(citation, chars)]
    return lines


def infographic_svg(artifact: ArtifactOut, subtitle: str) -> str:
    """The infographic as a standalone SVG, drawn from the backend's layout.

    The layout is ``infographic.layout(content, format)`` — the call the service
    makes for the screen, so there is one poster with two renderings (D-53).
    Text is placed with the layout's own ``STYLES``. The canvas starts with an
    opaque rectangle: the PNG made from this file in the browser would
    otherwise be transparent. No ``foreignObject`` and no external reference,
    so a canvas can rasterise it without tainting.
    """
    # The title the student gave it wins over the one generated (a rename
    # changes ``artifact.title``, not the body) — as on the screen (``_out``).
    layout = infographic.layout(
        {**(artifact.content or {}), "title": artifact.title}, artifact.format
    )
    if layout is None:  # pragma: no cover - a ready infographic always has content
        raise ValueError("Infográfico sem conteúdo")
    width = layout.width
    margin = infographic.MARGIN
    chars = int((width - 2 * margin) // _FOOTER_CHAR)
    footer = _infographic_footer(artifact, subtitle, chars)
    top = layout.height + 8
    height = top + len(footer) * _FOOTER_LINE + margin

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" '
        f'width="{width}" height="{height}" role="img" aria-label="{_t(artifact.title)}" '
        f'font-family="{_INFOGRAPHIC_FONT}">',
        f"<title>{_t(artifact.title)}</title>",
        f"<desc>{_t(AI_NOTICE)}</desc>",
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="{_SVG_SURFACE}"/>',
    ]
    for connector in layout.connectors:
        parts.append(
            f'<line x1="{connector.x1}" y1="{connector.y1}" x2="{connector.x2}" '
            f'y2="{connector.y2}" stroke="{_SVG_EDGE}" stroke-width="2"/>'
        )
        parts.append(
            f'<polygon points="{_arrow(connector.x1, connector.y1, connector.x2, connector.y2)}" '
            f'fill="{_SVG_EDGE}"/>'
        )
    for block in layout.blocks:
        style = infographic.STYLES[block.kind]
        carded = block.kind in ("stat", "point", "step")
        fill, stroke, accent = _INFOGRAPHIC_TONES[block.tone % len(_INFOGRAPHIC_TONES)]
        if carded:
            parts.append(
                f'<rect x="{block.x}" y="{block.y}" width="{block.width}" '
                f'height="{block.height}" rx="14" fill="{fill}" stroke="{stroke}"/>'
            )
        heading_ink = _SVG_INK if block.kind == "title" else accent
        x = block.x + style.pad_x
        y = block.y + style.pad_y
        for line in block.heading_lines:
            parts.append(
                f'<text x="{x}" y="{_baseline(y, style.heading_line)}" '
                f'font-size="{style.heading_size}" font-weight="700" fill="{heading_ink}">'
                f"{_t(line)}</text>"
            )
            y += style.heading_line
        if block.heading_lines and block.body_lines:
            y += style.gap
        body_ink = _SVG_SUBTLE if block.kind == "subtitle" else _SVG_INK
        for line in block.body_lines:
            parts.append(
                f'<text x="{x}" y="{_baseline(y, style.body_line)}" '
                f'font-size="{style.body_size}" fill="{body_ink}">{_t(line)}</text>'
            )
            y += style.body_line
        marks = _marks(block.citations)
        if carded and marks:
            parts.append(
                f'<text x="{block.x + block.width - style.marks_right}" '
                f'y="{block.y + block.height - style.marks_bottom}" '
                f'font-size="{style.marks_size}" text-anchor="end" fill="{accent}">'
                f"{_t(marks)}</text>"
            )
    parts.append(
        f'<line x1="{margin}" y1="{layout.height}" x2="{width - margin}" '
        f'y2="{layout.height}" stroke="{_SVG_EDGE}" stroke-width="1"/>'
    )
    for index, (line, size, weight, colour) in enumerate(footer):
        parts.append(
            f'<text x="{margin}" y="{_baseline(top + index * _FOOTER_LINE, _FOOTER_LINE)}" '
            f'font-size="{size}" font-weight="{weight}" fill="{colour}">{_t(line)}</text>'
        )
    parts.append("</svg>")
    return "".join(parts)
