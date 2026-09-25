"""Checking a Studio artifact item by item, and numbering its citations (D-94).

The chat checks paragraphs; the Studio checks whatever the tool calls an item,
by the same rule (``app.notebooks.grounding``): every figure an item writes
must be in a passage **that item** cites, or in the student's own words.

What an item is, and what happens when it fails:

========== ================================================ ===================
Tool       Item (every text of it is checked together)      When a figure fails
========== ================================================ ===================
report     a paragraph                                      it is left out
flashcards a card — front and back                          it is left out
quiz       a question — prompt, every option, hint,         it is left out
           explanation
table      one cell                                         the cell stays, as
                                                            "omitida"
mindmap    a node's label                                   it is left out with
                                                            its branch
========== ================================================ ===================

A table cell is the exception because a row is a record: dropping one cell
would shift the others under the wrong column, and dropping the row would hide
the cells that *are* grounded. So the cell stays, empty of value and labelled
with why (D-24) — and a cell the sources simply do not have is labelled too,
differently: "não consta nas fontes" is the sources' silence, "omitida" is the
check's refusal.

Structural text — the artifact's title, a report's section headings, a table's
column headers, the mind map's central theme — cites nothing. Its figures are
checked against every passage handed over and the student's words; one that
fails there is replaced by a neutral label, never kept.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.ai.guardrails import numbers_in, ungrounded_numbers
from app.ai.studio import StudioRequest
from app.notebooks.grounding import format_figures, passage_numbers, take_citations, ungrounded
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
        count, seen = self.withheld.get(kind, (0, []))
        self.withheld[kind] = (count + 1, [*seen, *format_figures(figures)])


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
    return checked


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


_HANDLERS = {
    "report": _report,
    "flashcards": _flashcards,
    "quiz": _quiz,
    "table": _table,
    "mindmap": _mindmap,
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
        one, many, verb_one, verb_many = _NOUNS[kind]
        subject, verb = (one, verb_one) if count == 1 else (f"{count} {many}", verb_many)
        cited = "citava" if count == 1 else "citavam"
        listed = ", ".join(dict.fromkeys(figures))
        sentences.append(
            f"{subject} {verb} porque {cited} números que não aparecem nos trechos "
            f"citados: {listed}."
        )
    return sentences


def item_count(tool: str, body: dict | None) -> int | None:
    """Items of a stored body, for the list — cards, questions, rows, nodes."""
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
