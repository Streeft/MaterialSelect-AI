"""The issued laudo read back into a :class:`LaudoDocument`, for Word and PowerPoint (D-252).

An issued version is frozen as the HTML it was issued with (``IssuedReport.html``): that
document is what the engineer signed and what the client verifies, and **it is the only
copy of the content that is never re-derived**. The editable twins (Word, PowerPoint) used to
be made from today's study, which can differ from the version on paper; this module makes
them from the frozen bytes instead.

The HTML is ours (``laudo.render_laudo``), so reading it back is a matter of knowing its
markup: the same classes the renderer writes (``card``, ``hero``, ``why``, ``scope``,
``mini-table``…) and the same SVG figures, which are lifted out *verbatim* so the Word and
the deck rasterise the very drawing the client holds. Nothing here calculates: every number is
a string already formatted in the frozen document, and a string is all it stays.

What the frozen HTML does not keep, the copy does not invent:

* a traffic-light row is the HTML's, so a label clipped at 72 characters in the picture
  (the issued document clips it too) is clipped in the copy;
* a table cell is the text the HTML printed (an absent value is the word "ausente");
* the signatory, the client, the version and the date come from the columns of the row, which
  are the inputs the document was rendered from.

``lxml`` is already installed (python-docx and python-pptx need it).
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from lxml import etree
from lxml import html as lxml_html

from app.domain.errors import ValidationError
from app.exporters.figures import Light
from app.exporters.laudo import (
    Engineer,
    KeyFigure,
    LaudoDocument,
    LaudoSection,
    Recommendation,
    ScopeItem,
    short_code,
)
from app.exporters.laudo_theme import STATUS
from app.exporters.report import Sheet
from app.models.issued_report import IssuedReport

UNREADABLE = (
    "Não foi possível ler o laudo congelado desta versão para gerar a cópia editável. "
    "O laudo emitido continua disponível em HTML."
)

_FIGURE = re.compile(r"<figure>(<svg\b.*?</svg>)</figure>", re.DOTALL)
_SVG_NS = "{http://www.w3.org/2000/svg}"
_WORD_TO_STATUS = {status.word.lower(): key for key, status in STATUS.items()}
_ANNEX_NUMBER = re.compile(r"^A\d+\.\s*")
_NOT_EVALUATED = "Não avaliado."
_SPECIAL_SECTIONS = frozenset({"resumo", "interpretacao", "assinatura"})


def _has_class(name: str) -> str:
    return f"contains(concat(' ', normalize-space(@class), ' '), ' {name} ')"


def _first(node, xpath: str):
    found = node.xpath(xpath)
    return found[0] if found else None


def _text(node) -> str:
    return "" if node is None else node.text_content()


def _lift_figures(document: str) -> tuple[str, list[str]]:
    """Take every ``<figure><svg/></figure>`` out of the markup, leaving an indexed hole.

    The HTML parser lower-cases attribute names, and an SVG needs its ``viewBox`` intact to be
    drawn: the drawings are therefore kept as the raw substrings the renderer wrote.
    """
    figures: list[str] = []

    def take(match: re.Match[str]) -> str:
        figures.append(match.group(1))
        return f'<figure data-figure="{len(figures) - 1}"></figure>'

    return _FIGURE.sub(take, document), figures


def _svg_of(figure, figures: list[str]) -> str:
    index = figure.get("data-figure")
    return figures[int(index)] if index is not None and index.isdigit() else ""


def _cards(container, xpath: str = ".//div[" + _has_class("card") + "]") -> list[KeyFigure]:
    cards: list[KeyFigure] = []
    for card in container.xpath(xpath):
        classes = (card.get("class") or "").split()
        tone = next((c[5:] for c in classes if c.startswith("tone-")), "neutral")
        value = _first(card, "./div[" + _has_class("value") + "]")
        unit = _first(value, "./span[" + _has_class("unit") + "]") if value is not None else None
        cards.append(
            KeyFigure(
                label=_text(_first(card, "./div[" + _has_class("label") + "]")),
                value=(value.text or "") if value is not None else "",
                unit=_text(unit),
                hint=_text(_first(card, "./div[" + _has_class("hint") + "]")),
                tone=tone,
            )
        )
    return cards


def lights_from_svg(svg: str) -> list[Light]:
    """The rows of the traffic-light picture, read from its own ``<text>`` elements.

    Each row of ``figures.render_traffic_light`` writes, in order: the glyph (size 12), the
    requirement (size 11), its detail when there is one (size 9.5, with the full text in a
    ``<title>``) and the state's word (size 10). The word names the state, so the glyph and
    the colour never have to be guessed.
    """
    try:
        root = etree.fromstring(svg.encode("utf-8"))
    except etree.XMLSyntaxError:
        return []
    rows: list[dict[str, str]] = []
    for node in root.iter(f"{_SVG_NS}text"):
        size = node.get("font-size")
        if size == "12":
            rows.append({})
        elif not rows:
            continue
        elif size == "11":
            rows[-1]["label"] = "".join(node.itertext())
        elif size == "9.5":
            full = node.find(f"{_SVG_NS}title")
            rows[-1]["detail"] = full.text or "" if full is not None else (node.text or "")
        elif size == "10":
            rows[-1]["word"] = "".join(node.itertext())
    return [
        Light(
            label=row.get("label", ""),
            status=_WORD_TO_STATUS.get(row.get("word", "").lower(), "na"),
            detail=row.get("detail", ""),
        )
        for row in rows
        if row.get("label")
    ]


def _scope(root) -> list[ScopeItem]:
    items: list[ScopeItem] = []
    for li in root.xpath("//ul[" + _has_class("scope") + "]/li"):
        text = li.text_content().strip()
        glyph = _first(li, "./span[" + _has_class("glyph") + "]")
        if glyph is not None and text.startswith(glyph.text_content()):
            text = text[len(glyph.text_content()) :].strip()
        label, _, word = text.rpartition(": ")
        items.append(
            ScopeItem(
                label=label or text,
                status=_WORD_TO_STATUS.get(word.strip().lower(), "na"),
                detail=li.get("title") or "",
            )
        )
    return items


def _table(wrapper) -> Sheet | None:
    table = _first(wrapper, ".//table")
    if table is None:
        return None
    header = [_text(th) for th in table.xpath(".//thead//th")]
    rows = [[_text(td) for td in tr.xpath("./td")] for tr in table.xpath(".//tbody/tr")]
    return Sheet(name="", header=header, rows=rows)


def _heading_title(section) -> str:
    h2 = _first(section, "./h2")
    return "".join(h2.xpath("text()")).strip() if h2 is not None else ""


def _section(node, figures: list[str]) -> LaudoSection:
    section = LaudoSection(key=node.get("id") or "", title=_heading_title(node))
    seen_body = False
    for child in node:
        classes = (child.get("class") or "").split()
        if child.tag == "h2":
            continue
        if child.tag == "p" and "muted" in classes:
            section.lead = _text(child)
        elif child.tag == "p" and "unavailable" in classes:
            strong = _first(child, "./strong")
            lead = (strong.tail or "") if strong is not None else _text(child)
            if strong is None and lead.startswith(_NOT_EVALUATED):
                lead = lead[len(_NOT_EVALUATED) :]
            section.unavailable = lead.strip()
        elif child.tag == "div" and "cards" in classes:
            section.cards = _cards(child)
        elif child.tag == "figure":
            section.figures.append(_svg_of(child, figures))
            seen_body = True
        elif child.tag == "div" and "pair" in classes:
            section.figures += [_svg_of(f, figures) for f in child.xpath("./figure")]
            section.paired = True
            seen_body = True
        elif child.tag == "div" and "chips" in classes:
            group = _text(_first(child, "./div[" + _has_class("group") + "]"))
            section.chips.append(
                (group, [_text(chip) for chip in child.xpath("./span[" + _has_class("chip") + "]")])
            )
            seen_body = True
        elif child.tag == "div" and "table-scroll" in classes:
            section.table = _table(child)
            section.table_first = not seen_body
        elif child.tag == "ul" and "notes" in classes:
            section.notes = [_text(li) for li in child.xpath("./li")]
    return section


def _annex(root) -> tuple[list[str], list[Sheet]]:
    annex = _first(root, "//div[" + _has_class("annex") + "]")
    if annex is None:
        return [], []
    notices = [_text(p) for p in annex.xpath(".//p[" + _has_class("notice") + "]")]
    sheets: list[Sheet] = []
    for node in annex.xpath("./section"):
        h2 = _first(node, "./h2")
        sheet = _table(node) or Sheet(name="", header=[], rows=[])
        sheet.name = _ANNEX_NUMBER.sub("", _text(h2).strip())
        sheet.notes = [_text(p) for p in node.xpath("./p[" + _has_class("note") + "]")]
        sheets.append(sheet)
    return notices, sheets


@dataclass(frozen=True)
class _Summary:
    recommendation_name: str | None
    standing: str
    no_recommendation: str | None
    why: list[str]
    donut: str
    traffic_light: str
    ranking_mini: str
    lights: list[Light]


def _summary(root, figures: list[str], cover_standing: str) -> tuple[_Summary, str | None]:
    node = _first(root, "//section[@id='resumo']")
    if node is None:
        return _Summary(None, "", None, [], "", "", "", []), None
    hero = _first(node, ".//div[" + _has_class("hero") + "]")
    none_hero = hero is not None and "none" in (hero.get("class") or "").split()
    name = _text(_first(hero, ".//div[" + _has_class("name") + "]")) if hero is not None else ""
    standing = (
        _text(_first(hero, ".//div[" + _has_class("standing") + "]")) if hero is not None else ""
    )
    class_name = None
    if standing.startswith(cover_standing) and cover_standing:
        rest = standing[len(cover_standing) :]
        class_name = rest[3:] if rest.startswith(" · ") and rest[3:] else None
    donut = ""
    loose: list[str] = []
    for figure in node.xpath(".//figure"):
        svg = _svg_of(figure, figures)
        if figure.xpath("ancestor::div[" + _has_class("pair-wide") + "]"):
            donut = svg
        else:
            loose.append(svg)
    traffic = loose[0] if loose else ""
    return (
        _Summary(
            recommendation_name=None if none_hero or not name else name,
            standing=cover_standing,
            no_recommendation=name if none_hero and name else None,
            why=[_text(li) for li in node.xpath(".//ul[" + _has_class("why") + "]/li")],
            donut=donut,
            traffic_light=traffic,
            ranking_mini=loose[1] if len(loose) > 1 else "",
            lights=lights_from_svg(traffic) if traffic else [],
        ),
        class_name,
    )


def _narrative(root) -> tuple[list[str] | None, list[str] | None, str | None]:
    node = _first(root, "//section[@id='interpretacao']//div[" + _has_class("narrative") + "]")
    if node is None:
        return None, None, None
    paragraphs = [_text(p) for p in node.xpath("./p[not(@class)]")]
    caveats = [_text(li) for li in node.xpath("./ul[" + _has_class("caveats") + "]/li")]
    note = _first(node, "./p[" + _has_class("narrative-note") + "]")
    return (
        paragraphs or None,
        (caveats or None) if paragraphs else None,
        _text(note) if note is not None else None,
    )


def document_from_issued(report: IssuedReport) -> LaudoDocument:
    """The frozen laudo of ``report`` as a document the Word and PowerPoint writers take.

    Raises ``ValidationError`` when the stored HTML has neither a cover nor a summary (it
    would be an empty copy, and an empty file passed off as the laudo is worse than a refusal).
    """
    stripped, figures = _lift_figures(report.html or "")
    try:
        root = lxml_html.fromstring(stripped)
    except (etree.ParserError, etree.XMLSyntaxError, ValueError):
        raise ValidationError(UNREADABLE) from None
    cover = _first(root, "//div[" + _has_class("cover") + "]")
    if cover is None and _first(root, "//section[@id='resumo']") is None:
        raise ValidationError(UNREADABLE)

    cover_name = (
        _text(
            _first(
                cover, ".//div[" + _has_class("cover-hero") + "]/div[" + _has_class("name") + "]"
            )
        )
        if cover is not None
        else ""
    )
    cover_standing = (
        _text(
            _first(
                cover, ".//div[" + _has_class("cover-hero") + "]/div[" + _has_class("support") + "]"
            )
        )
        if cover is not None
        else ""
    )
    summary, class_name = _summary(root, figures, cover_standing)
    name = summary.recommendation_name or cover_name or None
    recommendation = (
        Recommendation(name=name, class_name=class_name, standing=summary.standing)
        if name and summary.no_recommendation is None
        else None
    )
    no_recommendation = (
        None if recommendation is not None else summary.no_recommendation or cover_standing or None
    )
    narrative, caveats, note = _narrative(root)
    notices, annex = _annex(root)
    lead = _first(cover, ".//p[" + _has_class("lead") + "]") if cover is not None else None
    sections = [
        _section(node, figures)
        for node in root.xpath("//section[@id]")
        if node.get("id") not in _SPECIAL_SECTIONS
    ]
    return LaudoDocument(
        study_name=report.study_name,
        description=_text(lead),
        client_name=report.client_name,
        client_project=report.client_project,
        engineer=Engineer(
            name=report.engineer_name,
            title=report.engineer_title,
            registration=report.engineer_registration,
            art=report.art_number,
            city=report.city,
            issue_date=report.issue_date,
        ),
        recommendation=recommendation,
        no_recommendation=no_recommendation,
        key_figures=(
            _cards(cover, ".//div[" + _has_class("cards") + "]/div[" + _has_class("card") + "]")
            if cover is not None
            else []
        ),
        why=summary.why,
        traffic_light=summary.traffic_light,
        lights=summary.lights,
        donut=summary.donut,
        ranking_mini=summary.ranking_mini,
        scope=_scope(root),
        sections=sections,
        narrative=narrative,
        narrative_caveats=caveats,
        narrative_note=note,
        notices=notices,
        annex=annex,
        version=report.version,
        issued_code=short_code(report.content_sha256),
    )
