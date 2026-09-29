"""The mind map's layout, computed once for the screen and the SVG (D-94).

A tidy horizontal tree: the central theme on the left, each level a column to
its right, leaves stacked top to bottom in reading order and every parent
centred on its children. The screen draws these coordinates and the SVG export
draws the same ones — computing the layout in two places would give one figure
two truths (the D-53 rule), and the export would drift from what the student
saw.

Text is measured by character count, not by a font: the backend has no font to
measure with, and the SVG export must not depend on one. A label is wrapped
into at most three lines at word boundaries — never inside a figure —, and the
lines themselves are part of the layout, so the screen breaks them where the
export does.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.ai.guardrails import NUMBER_TOKEN

#: Pixels per character at the 13 px label size — a generous average for a
#: proportional sans-serif, so a label is never clipped by its own box.
CHAR_WIDTH = 7.2
LINE_HEIGHT = 17.0
PAD_X = 12.0
PAD_Y = 9.0
MIN_WIDTH = 72.0
MAX_WIDTH = 248.0
MAX_LINES = 3
GAP_X = 48.0
GAP_Y = 12.0
MARGIN = 16.0

_CHARS_PER_LINE = int((MAX_WIDTH - 2 * PAD_X) // CHAR_WIDTH)


@dataclass
class Node:
    id: int
    parent: int | None
    label: str
    lines: list[str]
    depth: int
    citations: list[int]
    width: float
    height: float
    x: float = 0.0
    y: float = 0.0
    children: list[Node] = field(default_factory=list)


@dataclass(frozen=True)
class Edge:
    source: int
    target: int
    x1: float
    y1: float
    x2: float
    y2: float


@dataclass(frozen=True)
class Layout:
    width: float
    height: float
    nodes: list[Node]
    edges: list[Edge]


def _has_digit(text: str) -> bool:
    # Decimal digits only: the "³" of "kg/m³" is a digit to ``str.isdigit``.
    return any(char.isdecimal() for char in text)


def _unit_like(word: str) -> bool:
    """A word short enough to be the unit written after a figure ("MPa",
    "kg/m³", "%", "°C", "anos") — kept on the figure's line."""
    return len(word.rstrip(".,;:!?)»”")) <= 6 and not _has_digit(word)


def atoms(text: str, units: bool = True) -> list[str]:
    """``text`` as the pieces a line may never be broken inside.

    A plain word is one piece. A figure is one piece however it is written —
    "1 200" and "12 345 678" (pt-BR thousands separated by spaces) are read as
    one number by the grounding check (``app.ai.guardrails``), and a line break
    inside them would print two numbers no source states. With ``units``, the
    short word right after a figure goes with it too: "1 200 MPa" is one claim.
    """
    words = text.split()
    joined = " ".join(words)
    starts: list[int] = []
    position = 0
    for word in words:
        starts.append(position)
        position += len(word) + 1
    glued = [False] * len(words)
    for match in NUMBER_TOKEN.finditer(joined):
        for index, start in enumerate(starts):
            if match.start() < start < match.end():
                glued[index] = True
        last = max(i for i, start in enumerate(starts) if start < match.end())
        ends_word = starts[last] + len(words[last]) == match.end()
        if units and ends_word and last + 1 < len(words) and _unit_like(words[last + 1]):
            glued[last + 1] = True
    pieces: list[str] = []
    for word, glue in zip(words, glued, strict=True):
        if glue and pieces:
            pieces[-1] += f" {word}"
        else:
            pieces.append(word)
    return pieces


def wrap(label: str, width: int = _CHARS_PER_LINE, max_lines: int = MAX_LINES) -> list[str]:
    """Break a label into at most ``max_lines`` lines of ``width`` characters.

    Lines break between the pieces of :func:`atoms`, so **a figure is never
    split** — neither across two lines nor by a hyphen. A figure (with its unit)
    longer than a line is moved whole to a line of its own and may run past
    ``width``: the caller widens the box (``layout`` here, the infographic's
    grid) rather than print part of a number. A plain word longer than a line
    is hyphenated. Text past the last line ends in "…", cut between pieces, and
    a trailing piece holding a digit is dropped before the "…" — "1 200…"
    would read as a number that goes on.
    """
    lines: list[str] = []
    current = ""
    for atom in atoms(label):
        # A figure glued to its unit that does not fit may leave the unit to the
        # next line; the figure itself stays whole.
        for piece in [atom] if len(atom) <= width else atoms(atom, units=False):
            while len(piece) > width and not _has_digit(piece):
                if current:
                    lines.append(current)
                    current = ""
                lines.append(piece[: width - 1] + "-")
                piece = piece[width - 1 :]
            candidate = f"{current} {piece}".strip()
            if len(candidate) <= width or not current:
                current = candidate
            else:
                lines.append(current)
                current = piece
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        kept = atoms(lines[max_lines - 1], units=False)
        while kept and (len(" ".join(kept)) + 1 > width or _has_digit(kept[-1])):
            kept.pop()
        lines = lines[: max_lines - 1] + [" ".join(kept) + "…"]
    return lines or [""]


def layout(root: dict | None) -> Layout | None:
    """Lay out a checked mind map (``{"label", "citations", "children"}``)."""
    if not root:
        return None
    nodes: list[Node] = []

    def build(item: dict, parent: int | None, depth: int) -> Node:
        lines = wrap(item["label"])
        longest = max(len(line) for line in lines)
        node = Node(
            id=len(nodes) + 1,
            parent=parent,
            label=item["label"],
            lines=lines,
            depth=depth,
            citations=list(item.get("citations") or []),
            # Never narrower than its longest line: a figure longer than a
            # line is kept whole (``wrap``), and the box grows to hold it.
            width=max(MIN_WIDTH, longest * CHAR_WIDTH + 2 * PAD_X),
            height=len(lines) * LINE_HEIGHT + 2 * PAD_Y,
        )
        nodes.append(node)
        node.children = [build(child, node.id, depth + 1) for child in item.get("children", [])]
        return node

    tree = build(root, None, 0)

    # Columns: every level as wide as its widest node.
    columns: dict[int, float] = {}
    for node in nodes:
        columns[node.depth] = max(columns.get(node.depth, 0.0), node.width)
    left: dict[int, float] = {}
    x = MARGIN
    for depth in sorted(columns):
        left[depth] = x
        x += columns[depth] + GAP_X

    cursor = [MARGIN]

    def place(node: Node) -> float:
        """Place a subtree; return the vertical centre of its root."""
        node.x = left[node.depth]
        if not node.children:
            node.y = cursor[0]
            cursor[0] += node.height + GAP_Y
            return node.y + node.height / 2
        centres = [place(child) for child in node.children]
        centre = (centres[0] + centres[-1]) / 2
        node.y = centre - node.height / 2
        # A parent taller than its children's span pushes what comes next down.
        cursor[0] = max(cursor[0], node.y + node.height + GAP_Y)
        return centre

    place(tree)
    top = min(node.y for node in nodes)
    if top < MARGIN:
        for node in nodes:
            node.y += MARGIN - top

    by_id = {node.id: node for node in nodes}
    edges = [
        Edge(
            source=node.parent,
            target=node.id,
            x1=by_id[node.parent].x + by_id[node.parent].width,
            y1=by_id[node.parent].y + by_id[node.parent].height / 2,
            x2=node.x,
            y2=node.y + node.height / 2,
        )
        for node in nodes
        if node.parent is not None
    ]
    width = max(node.x + node.width for node in nodes) + MARGIN
    height = max(node.y + node.height for node in nodes) + MARGIN
    return Layout(width=round(width, 1), height=round(height, 1), nodes=nodes, edges=edges)
