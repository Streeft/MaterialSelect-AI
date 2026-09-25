"""The mind map's layout, computed once for the screen and the SVG (D-94).

A tidy horizontal tree: the central theme on the left, each level a column to
its right, leaves stacked top to bottom in reading order and every parent
centred on its children. The screen draws these coordinates and the SVG export
draws the same ones — computing the layout in two places would give one figure
two truths (the D-53 rule), and the export would drift from what the student
saw.

Text is measured by character count, not by a font: the backend has no font to
measure with, and the SVG export must not depend on one. A label is wrapped
into at most three lines at word boundaries, and the lines themselves are part
of the layout, so the screen breaks them where the export does.
"""

from __future__ import annotations

from dataclasses import dataclass, field

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


def wrap(label: str, width: int = _CHARS_PER_LINE, max_lines: int = MAX_LINES) -> list[str]:
    """Break a label at spaces into at most ``max_lines`` lines of ``width``.

    A word longer than a line is cut; text past the last line ends in "…".
    """
    lines: list[str] = []
    current = ""
    for word in label.split():
        while len(word) > width:
            if current:
                lines.append(current)
                current = ""
            lines.append(word[: width - 1] + "-")
            word = word[width - 1 :]
        candidate = f"{current} {word}".strip()
        if len(candidate) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        last = lines[max_lines - 1]
        lines = lines[: max_lines - 1] + [last[: width - 1].rstrip() + "…"]
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
            width=min(MAX_WIDTH, max(MIN_WIDTH, longest * CHAR_WIDTH + 2 * PAD_X)),
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
