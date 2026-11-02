"""Squarified treemap layout (Bruls, Huizing & van Wijk, 2000) — D-193.

Pure geometry: rectangles in the data coordinates of a fixed box, computed here
and not in the browser because ADR 0004 puts every piece of chart geometry in
the backend. The client scales the box to its width and draws what it receives.

The squarified algorithm lays items out in rows along the shorter side of the
remaining space, adding an item to the current row only while that improves the
row's worst aspect ratio. The result keeps cells close to square, which is what
makes their areas comparable by eye.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class Rect:
    x0: float
    y0: float
    x1: float
    y1: float

    @property
    def width(self) -> float:
        return self.x1 - self.x0

    @property
    def height(self) -> float:
        return self.y1 - self.y0


def _worst(row: Sequence[float], side: float) -> float:
    """Worst aspect ratio of ``row`` (areas) laid along a side of ``side``."""
    total = sum(row)
    if total <= 0 or side <= 0:
        return float("inf")
    big, small = max(row), min(row)
    s2 = side * side
    t2 = total * total
    return max(s2 * big / t2, t2 / (s2 * small))


def squarify(weights: Sequence[float], box: Rect) -> list[Rect]:
    """One rectangle per weight, in input order, tiling ``box`` by area.

    Weights must be non-negative. A zero weight gets a zero-area rectangle at
    the box's corner (it exists, it is just empty) so the output stays aligned
    with the input. Sorting is the caller's job: the algorithm assumes
    descending weights to produce square-ish cells, and the panel wants to keep
    the order it chose (largest first) anyway.
    """
    if any(w < 0 for w in weights):
        raise ValueError("Peso negativo no treemap")
    out: list[Rect | None] = [None] * len(weights)
    positive = [(i, float(w)) for i, w in enumerate(weights) if w > 0]
    for i, w in enumerate(weights):
        if w == 0:
            out[i] = Rect(box.x0, box.y0, box.x0, box.y0)
    total = sum(w for _, w in positive)
    if total <= 0 or box.width <= 0 or box.height <= 0:
        return [r or Rect(box.x0, box.y0, box.x0, box.y0) for r in out]

    scale = box.width * box.height / total
    items = [(i, w * scale) for i, w in positive]
    x0, y0, x1, y1 = box.x0, box.y0, box.x1, box.y1

    while items:
        width, height = x1 - x0, y1 - y0
        side = min(width, height)
        row = [items[0]]
        rest = items[1:]
        while rest and _worst([a for _, a in row] + [rest[0][1]], side) <= _worst(
            [a for _, a in row], side
        ):
            row.append(rest[0])
            rest = rest[1:]
        row_area = sum(a for _, a in row)
        if width >= height:
            # Column along the left edge.
            col_w = row_area / height if height > 0 else 0.0
            cursor = y0
            for index, area in row:
                h = area / col_w if col_w > 0 else 0.0
                out[index] = Rect(x0, cursor, x0 + col_w, cursor + h)
                cursor += h
            x0 += col_w
        else:
            # Row along the top edge.
            row_h = row_area / width if width > 0 else 0.0
            cursor = x0
            for index, area in row:
                w = area / row_h if row_h > 0 else 0.0
                out[index] = Rect(cursor, y0, cursor + w, y0 + row_h)
                cursor += w
            y0 += row_h
        items = rest

    return [r or Rect(box.x0, box.y0, box.x0, box.y0) for r in out]
