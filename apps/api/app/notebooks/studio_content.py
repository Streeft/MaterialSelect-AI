"""Checking a Studio artifact item by item, and numbering its citations (D-94).

The chat checks paragraphs; the Studio checks whatever the tool calls an item,
by the same rule (``app.notebooks.grounding``): every figure an item writes
must be in a passage **that item** cites, or in the student's own words.

What an item is, and what happens when it fails:

=========== ================================================ ===================
Tool        Item (every text of it is checked together)      When a figure fails
=========== ================================================ ===================
report      a paragraph                                      it is left out
flashcards  a card — front and back                          it is left out
quiz        a question — prompt, every option, hint,         it is left out
            explanation
table       one cell                                         the cell stays, as
                                                             "omitida"
mindmap     a node's label                                   it is left out with
                                                             its branch
audio       a line of the script                             it is left out
slides      a slide — title, every bullet, speaker notes     it is left out
video       a scene — title, every bullet, narration         it is left out
infographic a statistic (strict rule, and its unit), a       it is left out
            point — heading and text —, or a step
=========== ================================================ ===================

A table cell is the exception because a row is a record: dropping one cell
would shift the others under the wrong column, and dropping the row would hide
the cells that *are* grounded. So the cell stays, empty of value and labelled
with why (D-24) — and a cell the sources simply do not have is labelled too,
differently: "não consta nas fontes" is the sources' silence, "omitida" is the
check's refusal.

A slide goes whole: a bullet with an invented figure is a slide that says it,
and a slide with a hole where a bullet was would read as complete. A statistic
of an infographic is held to the strict rule (``grounding.strict_ungrounded``
and ``grounding.foreign_unit``): shown big and alone, "45%" is a finding, so
neither the student's words nor the small-integer allowance can ground it, and
a unit the cited passage does not write is a different claim. An infographic
whose statistics all fail keeps its points and steps — the band of statistics
is simply not drawn.

Structural text — the artifact's title, a report's section headings, a table's
column headers, the mind map's central theme — cites nothing. Its figures are
checked against every passage handed over and the student's words; one that
fails there is replaced by a neutral label, never kept.

A **headline** is held to the strict rule instead: the infographic's title and
subtitle, and the title of a deck or a video, which opens it alone on the cover
slide. Printed big above everything else, "45% das falhas são por fadiga" is a
finding like any statistic, so no small integer is exempt and the student's
words do not count. It cites nothing of its own, so its pool is the text of the
passages the artifact's kept items cite — the references the reader can
check. A headline that fails is not dropped: the title becomes the neutral one
(the tool's or template's name), a subtitle is left out, and a written sentence
says so (D-24).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import partial

from app.ai.guardrails import numbers_in, numeric_tokens, ungrounded_numbers
from app.ai.studio import StudioRequest
from app.notebooks.grounding import (
    foreign_unit,
    format_figures,
    passage_numbers,
    strict_ungrounded,
    take_citations,
    ungrounded,
)
from app.schemas.notebook import CitationOut

#: A table cell's state, as the screen and the exports label it.
CELL_OK = "ok"
CELL_ABSENT = "ausente"
CELL_WITHHELD = "omitida"

ABSENT_LABEL = "não consta nas fontes"
WITHHELD_LABEL = "omitida: número fora do trecho citado"

#: (singular, plural, "was left out" singular, plural) per kind of item.
_NOUNS = {
    "paragraph": ("Um parágrafo", "parágrafos", "foi omitido", "foram omitidos"),
    "card": ("Um cartão", "cartões", "foi omitido", "foram omitidos"),
    "question": ("Uma questão", "questões", "foi omitida", "foram omitidas"),
    "cell": ("Uma célula", "células", "ficou sem valor", "ficaram sem valor"),
    "node": ("Um ramo do mapa", "ramos do mapa", "foi omitido", "foram omitidos"),
    "line": ("Uma fala", "falas", "foi omitida", "foram omitidas"),
    "slide": ("Um slide", "slides", "foi omitido", "foram omitidos"),
    "scene": ("Uma cena", "cenas", "foi omitida", "foram omitidas"),
    "stat": ("Um dado em destaque", "dados em destaque", "foi omitido", "foram omitidos"),
    "point": ("Um ponto", "pontos", "foi omitido", "foram omitidos"),
    "step": ("Uma etapa", "etapas", "foi omitida", "foram omitidas"),
}

#: Withheld kinds whose reason is a unit, not a figure — (kind of item it counts).
_UNIT_KINDS = {"stat_unit": "stat"}

#: The headlines of each tool that has them, checked by the strict rule.
_HEADLINES = {"infographic": ("title", "subtitle"), "slides": ("title",), "video": ("title",)}

#: What became of a headline that failed, and its name in the retry note.
_HEADLINE_FATE = {
    "title": ("O título gerado foi trocado por um título neutro", "o título"),
    "subtitle": ("O subtítulo gerado foi omitido", "o subtítulo"),
}


@dataclass
class Checked:
    title: str
    #: The tool's content, citations numbered as the model saw the passages.
    body: dict
    #: Items kept — an artifact with none is a failed generation.
    items: int
    #: Per kind of item: how many failed and which figures.
    withheld: dict[str, tuple[int, list[str]]] = field(default_factory=dict)

    @property
    def figures(self) -> list[str]:
        return list(dict.fromkeys(f for _, figures in self.withheld.values() for f in figures))

    def refuse(self, kind: str, figures: list[float]) -> None:
        self._withhold(kind, format_figures(figures))

    def refuse_unit(self, value: str) -> None:
        """A statistic whose unit no cited passage writes — named whole."""
        self._withhold("stat_unit", [value])

    def _withhold(self, kind: str, named: list[str]) -> None:
        count, seen = self.withheld.get(kind, (0, []))
        self.withheld[kind] = (count + 1, [*seen, *named])


def check(request: StudioRequest, read: dict, extra: set[float], fallback_title: str) -> Checked:
    """Apply the figure rule to one read model answer (``app.ai.studio.read_studio``).

    ``extra`` holds the figures of the student's own words — topic, template
    instruction, columns. ``fallback_title`` replaces a title that is empty or
    states a figure the sources do not.
    """
    passages = request.passages
    labels = set(extra) | numbers_in(request.notebook_title)
    for passage in passages:
        labels |= passage_numbers(passage)

    def structural(text: str, fallback: str) -> str:
        text, _ = take_citations(text, [], 0)
        return text if text and not ungrounded_numbers(text, labels) else fallback

    checked = Checked(title=structural(read.get("title") or "", fallback_title), body={}, items=0)
    handler = _HANDLERS[request.tool]
    handler(checked, read, passages, extra, structural)
    if request.tool in _HEADLINES:
        _headlines(checked, request.tool, read, passages, fallback_title)
    return checked


def _headlines(checked: Checked, tool: str, read: dict, passages, fallback_title: str) -> None:
    """The strict rule on a tool's headlines, after its items are checked.

    The pool is the text of every passage a kept item cites: a headline cites
    nothing, and the passages of items that were left out are not in the
    artifact's references — a figure only they state is one the reader cannot
    check anywhere.
    """
    pool = sorted({n for item in _items(tool, checked.body) for n in item["citations"]})

    def strict(key: str, fallback: str) -> str:
        text, _ = take_citations(read.get(key) or "", [], 0)
        if not text:
            return fallback
        invented = strict_ungrounded([text], pool, passages)
        if invented:
            checked.refuse(key, invented)
            return fallback
        return text

    checked.title = strict("title", fallback_title)
    checked.body["title"] = checked.title
    if "subtitle" in _HEADLINES[tool]:
        checked.body["subtitle"] = strict("subtitle", "")


def _report(checked: Checked, read: dict, passages, extra, structural) -> None:
    sections = []
    for position, section in enumerate(read.get("sections") or [], start=1):
        kept = []
        for paragraph in section["paragraphs"]:
            text, cited = take_citations(paragraph["text"], paragraph["citations"], len(passages))
            if not text:
                continue
            invented = ungrounded([text], cited, passages, extra)
            if invented:
                checked.refuse("paragraph", invented)
                continue
            kept.append({"text": text, "citations": cited})
        if kept:
            heading = structural(section.get("heading") or "", f"Seção {position}")
            sections.append({"heading": heading, "paragraphs": kept})
            checked.items += len(kept)
    checked.body = {"sections": sections}


def _flashcards(checked: Checked, read: dict, passages, extra, structural) -> None:
    cards = []
    for card in read.get("cards") or []:
        front, cited_front = take_citations(card["front"], card["citations"], len(passages))
        back, cited_back = take_citations(card["back"], [], len(passages))
        cited = list(dict.fromkeys([*cited_front, *cited_back]))
        if not front or not back:
            continue
        invented = ungrounded([front, back], cited, passages, extra)
        if invented:
            checked.refuse("card", invented)
            continue
        cards.append({"front": front, "back": back, "citations": cited})
    checked.body = {"cards": cards}
    checked.items = len(cards)


def _quiz(checked: Checked, read: dict, passages, extra, structural) -> None:
    questions = []
    for question in read.get("questions") or []:
        cited: list[int] = []
        texts: dict[str, str] = {}
        for key in ("prompt", "hint", "explanation"):
            texts[key], found = take_citations(
                question[key], question["citations"] if key == "prompt" else [], len(passages)
            )
            cited.extend(found)
        options = []
        for option in question["options"]:
            text, found = take_citations(option, [], len(passages))
            options.append(text)
            cited.extend(found)
        cited = list(dict.fromkeys(cited))
        if not texts["prompt"] or not all(options) or len(set(options)) != len(options):
            continue
        # Every option, the wrong ones too: a distractor with a figure the
        # sources never state is still a figure the model made up.
        invented = ungrounded([*texts.values(), *options], cited, passages, extra)
        if invented:
            checked.refuse("question", invented)
            continue
        questions.append(
            {
                "prompt": texts["prompt"],
                "options": options,
                "answer_index": question["answer_index"],
                "hint": texts["hint"],
                "explanation": texts["explanation"],
                "citations": cited,
            }
        )
    checked.body = {"questions": questions}
    checked.items = len(questions)


def _table(checked: Checked, read: dict, passages, extra, structural) -> None:
    columns = [
        structural(column, f"Coluna {position}")
        for position, column in enumerate(read.get("columns") or [], start=1)
    ]
    rows = []
    for row in read.get("rows") or []:
        cells = []
        for cell in row["cells"]:
            text, cited = take_citations(cell["text"], cell["citations"], len(passages))
            if not text:
                cells.append({"text": None, "citations": [], "status": CELL_ABSENT})
                continue
            invented = ungrounded([text], cited, passages, extra)
            if invented:
                checked.refuse("cell", invented)
                cells.append({"text": None, "citations": [], "status": CELL_WITHHELD})
                continue
            cells.append({"text": text, "citations": cited, "status": CELL_OK})
        if any(cell["status"] == CELL_OK for cell in cells):
            rows.append({"cells": cells})
    checked.body = {"columns": columns, "rows": rows}
    checked.items = len(rows) if columns else 0


def _mindmap(checked: Checked, read: dict, passages, extra, structural) -> None:
    root = read.get("root")
    if not root:
        checked.body = {"root": None}
        return

    def grow(node: dict) -> dict | None:
        label, cited = take_citations(node["label"], node["citations"], len(passages))
        if not label:
            return None
        invented = ungrounded([label], cited, passages, extra)
        if invented:
            checked.refuse("node", invented)
            return None
        checked.items += 1
        children = [child for child in (grow(c) for c in node["children"]) if child]
        return {"label": label, "citations": cited, "children": children}

    _, root_cited = take_citations(root["label"], root["citations"], len(passages))
    children = [child for child in (grow(c) for c in root["children"]) if child]
    checked.body = {
        "root": {
            "label": structural(root["label"], checked.title),
            "citations": root_cited,
            "children": children,
        }
    }


def _audio(checked: Checked, read: dict, passages, extra, structural) -> None:
    lines = []
    for line in read.get("lines") or []:
        text, cited = take_citations(line["text"], line["citations"], len(passages))
        if not text:
            continue
        invented = ungrounded([text], cited, passages, extra)
        if invented:
            checked.refuse("line", invented)
            continue
        lines.append({"speaker": line["speaker"], "text": text, "citations": cited})
    checked.body = {"title": checked.title, "lines": lines}
    checked.items = len(lines)


def _deck(kind: str, fallback: str, checked: Checked, read, passages, extra, structural) -> None:
    """Slides and video scenes: a slide is one item, title to notes."""
    slides = []
    for slide in read.get("slides") or []:
        title, cited = take_citations(slide["title"], slide["citations"], len(passages))
        bullets = []
        for bullet in slide["bullets"]:
            text, found = take_citations(bullet, [], len(passages))
            cited.extend(found)
            if text:
                bullets.append(text)
        notes, found = take_citations(slide["notes"], [], len(passages))
        cited = list(dict.fromkeys([*cited, *found]))
        if not (title or bullets or notes):
            continue
        # The whole slide: a bullet with an invented figure is a slide saying it.
        invented = ungrounded([title, *bullets, notes], cited, passages, extra)
        if invented:
            checked.refuse(kind, invented)
            continue
        slides.append(
            {
                "title": title or f"{fallback} {len(slides) + 1}",
                "bullets": bullets,
                "notes": notes,
                "citations": cited,
            }
        )
    checked.body = {"title": checked.title, "slides": slides}
    checked.items = len(slides)


def _infographic(checked: Checked, read: dict, passages, extra, structural) -> None:
    stats = []
    for stat in read.get("stats") or []:
        value, cited = take_citations(stat["value"], stat["citations"], len(passages))
        label, found = take_citations(stat["label"], [], len(passages))
        cited = list(dict.fromkeys([*cited, *found]))
        if not value or not numeric_tokens(value):
            continue
        invented = strict_ungrounded([value, label], cited, passages)
        if invented:
            checked.refuse("stat", invented)
            continue
        if foreign_unit(value, cited, passages):
            checked.refuse_unit(value)
            continue
        stats.append({"value": value, "label": label, "citations": cited})
    points = []
    for point in read.get("points") or []:
        heading, cited = take_citations(point["heading"], point["citations"], len(passages))
        text, found = take_citations(point["text"], [], len(passages))
        cited = list(dict.fromkeys([*cited, *found]))
        if not (heading or text):
            continue
        invented = ungrounded([heading, text], cited, passages, extra)
        if invented:
            checked.refuse("point", invented)
            continue
        points.append({"heading": heading, "text": text, "citations": cited})
    steps = []
    for step in read.get("steps") or []:
        text, cited = take_citations(step["text"], step["citations"], len(passages))
        if not text:
            continue
        invented = ungrounded([text], cited, passages, extra)
        if invented:
            checked.refuse("step", invented)
            continue
        steps.append({"text": text, "citations": cited})
    checked.body = {
        "title": checked.title,
        # Title and subtitle are headlines, set by ``_headlines`` once the
        # items — and so the passages they cite — are known.
        "subtitle": "",
        "stats": stats,
        "points": points,
        "steps": steps,
    }
    checked.items = len(stats) + len(points) + len(steps)


_HANDLERS = {
    "report": _report,
    "flashcards": _flashcards,
    "quiz": _quiz,
    "table": _table,
    "mindmap": _mindmap,
    "audio": _audio,
    "slides": partial(_deck, "slide", "Slide"),
    "video": partial(_deck, "scene", "Cena"),
    "infographic": _infographic,
}


# --- numbering ---------------------------------------------------------------


def _items(tool: str, body: dict) -> list[dict]:
    """Every dict that carries ``citations``, in reading order."""
    if tool == "report":
        return [p for s in body.get("sections", []) for p in s["paragraphs"]]
    if tool == "flashcards":
        return list(body.get("cards", []))
    if tool == "quiz":
        return list(body.get("questions", []))
    if tool == "table":
        return [c for r in body.get("rows", []) for c in r["cells"]]
    if tool == "mindmap":
        found: list[dict] = []

        def walk(node: dict | None) -> None:
            if node:
                found.append(node)
                for child in node["children"]:
                    walk(child)

        walk(body.get("root"))
        return found
    if tool == "audio":
        return list(body.get("lines", []))
    if tool in ("slides", "video"):
        return list(body.get("slides", []))
    if tool == "infographic":
        return [*body.get("stats", []), *body.get("points", []), *body.get("steps", [])]
    return []


def finalise(
    tool: str, checked: Checked, handed: list[CitationOut]
) -> tuple[dict, list[CitationOut], list[str]]:
    """Keep only the passages cited, numbered 1, 2, … in reading order.

    Returns the body with its citations renumbered, the citations themselves
    (copied, so the artifact stays readable after a source is removed) and the
    sentences that say what the check left out.
    """
    order: dict[int, int] = {}
    for item in _items(tool, checked.body):
        for number in item["citations"]:
            order.setdefault(number, len(order) + 1)
    for item in _items(tool, checked.body):
        item["citations"] = [order[n] for n in item["citations"]]
    by_number = {citation.number: citation for citation in handed}
    citations = [
        by_number[old].model_copy(update={"number": new})
        for old, new in order.items()
        if old in by_number
    ]
    return checked.body, citations, withheld_sentences(checked)


def withheld_sentences(checked: Checked) -> list[str]:
    sentences = []
    for kind, (count, figures) in checked.withheld.items():
        listed = ", ".join(dict.fromkeys(figures))
        if kind in _HEADLINE_FATE:
            fate, _ = _HEADLINE_FATE[kind]
            sentences.append(
                f"{fate} porque trazia números que não aparecem nos trechos citados: {listed}."
            )
            continue
        one, many, verb_one, verb_many = _NOUNS[_UNIT_KINDS.get(kind, kind)]
        subject, verb = (one, verb_one) if count == 1 else (f"{count} {many}", verb_many)
        if kind in _UNIT_KINDS:
            reason = (
                "sua unidade não aparece no trecho citado"
                if count == 1
                else "suas unidades não aparecem nos trechos citados"
            )
            sentences.append(f"{subject} {verb} porque {reason}: {listed}.")
            continue
        cited = "citava" if count == 1 else "citavam"
        sentences.append(
            f"{subject} {verb} porque {cited} números que não aparecem nos trechos "
            f"citados: {listed}."
        )
    return sentences


def retry_note(checked: Checked) -> str:
    """What the retry is told, by what went wrong — naming the figures, since
    "do better" teaches a model nothing. A unit refused is not a figure missing
    ("210 MPa" beside "210 GPa" has the figure), and a headline cites nothing,
    so each gets its own sentence."""
    figures: list[str] = []
    units: list[str] = []
    headlines: list[str] = []
    headline_figures: list[str] = []
    for kind, (_, named) in checked.withheld.items():
        if kind in _UNIT_KINDS:
            units += named
        elif kind in _HEADLINE_FATE:
            headlines.append(_HEADLINE_FATE[kind][1])
            headline_figures += named
        else:
            figures += named
    parts = []
    if figures:
        parts.append(
            "Na tentativa anterior você escreveu números que não aparecem nos trechos "
            f"citados: {', '.join(dict.fromkeys(figures))}. Reescreva copiando números "
            "somente dos trechos que cada item cita, ou deixe o número de fora."
        )
    if units:
        parts.append(
            "Os dados em destaque a seguir usaram uma unidade que o trecho não escreve; "
            f"copie valor e unidade exatamente como no trecho: {', '.join(dict.fromkeys(units))}."
        )
    if headlines:
        named = " e ".join(headlines)
        cite = "citam" if len(headlines) > 1 else "cita"
        parts.append(
            f"{named[0].upper()}{named[1:]} não {cite} trechos: só pode trazer um número "
            "escrito nos trechos que os itens citam, e "
            f"{', '.join(dict.fromkeys(headline_figures))} não está em nenhum deles. "
            "Reescreva sem esse número."
        )
    return " ".join(parts)


def item_count(tool: str, body: dict | None) -> int | None:
    """Items of a stored body, for the list — cards, questions, rows, nodes,
    lines, slides, scenes, and an infographic's statistics, points and steps."""
    if not body:
        return None
    if tool == "report":
        return len(body.get("sections", []))
    if tool == "table":
        return len(body.get("rows", []))
    return len(_items(tool, body))


def cell_text(cell: dict) -> str:
    """A table cell as read: its text, or the written reason it has none (D-24)."""
    if cell["status"] == CELL_ABSENT:
        return ABSENT_LABEL
    if cell["status"] == CELL_WITHHELD:
        return WITHHELD_LABEL
    return cell["text"] or ""
