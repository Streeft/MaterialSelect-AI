"""The infographic's layout, computed once for the screen and the SVG (D-98).

A poster read top to bottom in fixed bands: the header (title, then subtitle),
a grid of highlighted figures, the key points as cards, and the steps as a
numbered flow joined by connectors. The screen draws these coordinates and the
SVG export draws the same ones — the D-53 rule, as in ``mindmap.py``: laying
the poster out in two places would give one figure two truths.

Text is measured by character count, never by a font (the backend has none,
and the SVG must not depend on one). Every block is a box with optional
heading lines on top and body lines below; the lines are part of the layout,
so the screen breaks them where the export does. How a kind is typeset —
padding, font size, line height, where the citation marks sit — is in
``STYLES`` and travels in ``to_dict()``, so a renderer places text without a
constant of its own.

**Nothing is cut.** Every item was checked on its whole text, so the poster
prints the whole text: a line never breaks inside a figure (``mindmap.wrap``),
and no text ends in "…" — a cut in "1 200 MPa" would print "1 20", a number no
source states. What the layout does instead is make room. A style's
``*_max_lines`` is the budget of a block, not a limit on it: a band whose items
would run past their budget, or hold a figure wider than a line, is laid out
wider — fewer stats or points per row, the steps stacked instead of side by
side — and a block that still runs past it at the widest grows taller.

A band with nothing in it is omitted and takes no height: zero stats (every
one withheld by the grounding check) is a poster without a stats band, never
an empty grid.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

from app.notebooks.mindmap import wrap

#: Canvas width per orientation. An unknown orientation falls back to landscape.
WIDTHS: dict[str, int] = {"paisagem": 1200, "retrato": 800, "quadrado": 1000}
DEFAULT_ORIENTATION = "paisagem"

#: Stats per row and point columns per orientation.
STAT_COLUMNS: dict[str, int] = {"paisagem": 4, "retrato": 2, "quadrado": 3}
POINT_COLUMNS: dict[str, int] = {"paisagem": 2, "retrato": 1, "quadrado": 2}

MARGIN = 40
BAND_GAP = 32
GAP = 24
#: A horizontal step flow is used only while every step stays this wide;
#: below it (and always in portrait) the flow is vertical.
MIN_STEP_WIDTH = 200
#: The gap between two steps, where the connector is drawn.
STEP_GAP = 40
#: Number of palette tones a block can take (``tone`` is ``0..TONES-1``).
TONES = 6


@dataclass(frozen=True)
class Style:
    """How one kind of block is typeset; all sizes in pixels.

    ``heading_max_lines``/``body_max_lines`` are a budget, not a cut: a band
    whose text would run past them is laid out wider (see the module).
    """

    pad_x: int
    pad_y: int
    heading_size: int
    heading_line: int
    heading_char: float
    heading_max_lines: int
    body_size: int
    body_line: int
    body_char: float
    body_max_lines: int
    #: Space between the last heading line and the first body line.
    gap: int
    #: The citation marks ("[1] [2]") of a card: font size, and where the end
    #: of their baseline sits — this far from the card's right and bottom
    #: edges. Zero for a kind drawn without marks (title, subtitle).
    marks_size: int = 0
    marks_right: int = 0
    marks_bottom: int = 0


#: Character widths are generous averages for a proportional sans-serif at
#: that size (bold for headings), so a line is never clipped by its own box.
STYLES: dict[str, Style] = {
    "title": Style(0, 0, 30, 36, 16.5, 3, 0, 0, 0.0, 0, 0),
    "subtitle": Style(0, 0, 0, 0, 0.0, 0, 17, 24, 9.4, 4, 0),
    "stat": Style(18, 16, 30, 36, 17.0, 2, 13, 18, 7.2, 6, 6, 10, 8, 6),
    "point": Style(18, 16, 15, 20, 8.6, 3, 13, 18, 7.2, 12, 8, 10, 8, 6),
    "step": Style(18, 16, 15, 20, 8.6, 1, 13, 18, 7.2, 8, 8, 10, 8, 6),
}


@dataclass(frozen=True)
class Block:
    kind: str  # "title" | "subtitle" | "stat" | "point" | "step"
    x: int
    y: int
    width: int
    height: int
    heading_lines: list[str]
    body_lines: list[str]
    citations: list[int]
    tone: int
    #: Position within its band, from 0. A step's number is ``index + 1``.
    index: int


@dataclass(frozen=True)
class Connector:
    x1: int
    y1: int
    x2: int
    y2: int


@dataclass(frozen=True)
class Layout:
    width: int
    height: int
    orientation: str
    blocks: list[Block] = field(default_factory=list)
    connectors: list[Connector] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Plain structure for the service to serialise (styles included)."""
        return {
            "width": self.width,
            "height": self.height,
            "orientation": self.orientation,
            "blocks": [asdict(block) for block in self.blocks],
            "connectors": [asdict(connector) for connector in self.connectors],
            "styles": {kind: asdict(style) for kind, style in STYLES.items()},
        }


def _chars(width: int, char: float) -> int:
    return max(1, int(width // char))


def _lines(text: str, width: int, char: float) -> list[str]:
    """``text`` in lines of ``width`` pixels — all of it: never cut, never
    broken inside a figure."""
    if not text or not text.strip():
        return []
    return wrap(text, _chars(width, char), max_lines=len(text))


def _fits(kind: str, width: int, heading: str, body: str) -> bool:
    """True when a ``kind`` block ``width`` wide holds ``heading`` and ``body``
    within its budget of lines, every line within the box."""
    style = STYLES[kind]
    inner = width - 2 * style.pad_x
    for text, char, budget in (
        (heading, style.heading_char, style.heading_max_lines),
        (body, style.body_char, style.body_max_lines),
    ):
        lines = _lines(text, inner, char)
        if len(lines) > budget or any(len(line) > _chars(inner, char) for line in lines):
            return False
    return True


def _block(
    kind: str,
    x: int,
    y: int,
    width: int,
    heading: str,
    body: str,
    citations: list[int] | None,
    index: int,
) -> Block:
    style = STYLES[kind]
    inner = width - 2 * style.pad_x
    heading_lines = _lines(heading, inner, style.heading_char)
    body_lines = _lines(body, inner, style.body_char)
    height = 2 * style.pad_y
    height += len(heading_lines) * style.heading_line + len(body_lines) * style.body_line
    if heading_lines and body_lines:
        height += style.gap
    return Block(
        kind=kind,
        x=x,
        y=y,
        width=width,
        height=height,
        heading_lines=heading_lines,
        body_lines=body_lines,
        citations=[int(c) for c in citations or []],
        tone=index % TONES,
        index=index,
    )


def _with(block: Block, **changes: int) -> Block:
    data = asdict(block)
    data.update(changes)
    return Block(**data)


def _grid(
    kind: str,
    items: list[tuple[str, str, list[int] | None]],
    most_columns: int,
    content_width: int,
    top: int,
) -> tuple[list[Block], int]:
    """Lay ``items`` in rows of at most ``most_columns``; every block in a row as
    tall as the tallest, so the grid reads as a grid. Return the blocks and the
    bottom.

    The band takes the most columns at which every item fits (:func:`_fits`),
    down to one — so a long figure widens its whole band, never only its own
    card, and the grid stays a grid.
    """
    for columns in range(most_columns, 0, -1):
        cell = (content_width - (columns - 1) * GAP) // columns
        if columns == 1 or all(_fits(kind, cell, heading, body) for heading, body, _ in items):
            break
    blocks: list[Block] = []
    y = top
    for start in range(0, len(items), columns):
        row = [
            _block(kind, MARGIN + col * (cell + GAP), y, cell, heading, body, cites, start + col)
            for col, (heading, body, cites) in enumerate(items[start : start + columns])
        ]
        tallest = max(block.height for block in row)
        blocks.extend(_with(block, height=tallest) for block in row)
        y += tallest + GAP
    return blocks, y - GAP


def _steps(
    steps: list[dict], orientation: str, content_width: int, top: int
) -> tuple[list[Block], list[Connector], int]:
    count = len(steps)
    horizontal_width = (content_width - (count - 1) * STEP_GAP) // count
    # Side by side only while every step fits its card: a step that would run
    # past its budget there stacks the flow, where a line is five times wider.
    horizontal = (
        orientation != "retrato"
        and horizontal_width >= MIN_STEP_WIDTH
        and all(
            _fits("step", horizontal_width, str(i + 1), step.get("text") or "")
            for i, step in enumerate(steps)
        )
    )
    blocks: list[Block] = []
    connectors: list[Connector] = []
    if horizontal:
        row = [
            _block(
                "step",
                MARGIN + i * (horizontal_width + STEP_GAP),
                top,
                horizontal_width,
                str(i + 1),
                step.get("text") or "",
                step.get("citations"),
                i,
            )
            for i, step in enumerate(steps)
        ]
        tallest = max(block.height for block in row)
        blocks = [_with(block, height=tallest) for block in row]
        for left, right in zip(blocks, blocks[1:], strict=False):
            mid = left.y + left.height // 2
            connectors.append(Connector(left.x + left.width, mid, right.x, mid))
        return blocks, connectors, top + tallest
    y = top
    for i, step in enumerate(steps):
        block = _block(
            "step",
            MARGIN,
            y,
            content_width,
            str(i + 1),
            step.get("text") or "",
            step.get("citations"),
            i,
        )
        if blocks:
            above = blocks[-1]
            centre = MARGIN + content_width // 2
            connectors.append(Connector(centre, above.y + above.height, centre, block.y))
        blocks.append(block)
        y += block.height + STEP_GAP
    return blocks, connectors, y - STEP_GAP


def layout(content: dict | None, orientation: str | None = None) -> Layout | None:
    """Lay out a checked infographic body.

    ``content`` is ``{title, subtitle, stats:[{value, label, citations}],
    points:[{heading, text, citations}], steps:[{text, citations}]}``, already
    through the grounding check. Returns ``None`` for no content at all.
    """
    if not content:
        return None
    orientation = orientation if orientation in WIDTHS else DEFAULT_ORIENTATION
    width = WIDTHS[orientation]
    content_width = width - 2 * MARGIN
    blocks: list[Block] = []
    connectors: list[Connector] = []
    bottom: int | None = None

    def next_top() -> int:
        return MARGIN if bottom is None else bottom + BAND_GAP

    title = (content.get("title") or "").strip()
    if title:
        block = _block("title", MARGIN, next_top(), content_width, title, "", None, 0)
        blocks.append(block)
        bottom = block.y + block.height
    subtitle = (content.get("subtitle") or "").strip()
    if subtitle:
        # Subtitle belongs to the header: it follows the title at a small gap.
        top = MARGIN if bottom is None else bottom + GAP // 2
        block = _block("subtitle", MARGIN, top, content_width, "", subtitle, None, 0)
        blocks.append(block)
        bottom = block.y + block.height

    stats = [s for s in content.get("stats") or [] if (s.get("value") or "").strip()]
    if stats:
        items = [(s["value"], s.get("label") or "", s.get("citations")) for s in stats]
        placed, bottom = _grid("stat", items, STAT_COLUMNS[orientation], content_width, next_top())
        blocks.extend(placed)

    points = [
        p
        for p in content.get("points") or []
        if (p.get("heading") or "").strip() or (p.get("text") or "").strip()
    ]
    if points:
        items = [(p.get("heading") or "", p.get("text") or "", p.get("citations")) for p in points]
        placed, bottom = _grid(
            "point", items, POINT_COLUMNS[orientation], content_width, next_top()
        )
        blocks.extend(placed)

    steps = [s for s in content.get("steps") or [] if (s.get("text") or "").strip()]
    if steps:
        placed, joins, bottom = _steps(steps, orientation, content_width, next_top())
        blocks.extend(placed)
        connectors.extend(joins)

    height = (bottom if bottom is not None else MARGIN) + MARGIN
    return Layout(
        width=width,
        height=height,
        orientation=orientation,
        blocks=blocks,
        connectors=connectors,
    )
