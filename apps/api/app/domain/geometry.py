"""Planar geometry used by property maps.

Ashby charts group materials of the same class inside an envelope ("bubble").
The honest envelope of a finite set of plotted materials is its **convex
hull** — it encloses exactly the materials that exist and claims nothing about
regions where no data was cadastred.

The hull must be computed in the space the chart actually displays: on a
log-log map, the hull of the log-transformed coordinates is not the log of the
hull of the linear coordinates. Callers therefore transform the points first
and transform the resulting polygon back (see
:func:`app.services.chart_service`).

Pure functions only — no I/O, no ORM.
"""

from __future__ import annotations

Point = tuple[float, float]


def _cross(origin: Point, first: Point, second: Point) -> float:
    """Z component of the cross product (origin→first) × (origin→second).

    Positive for a counter-clockwise turn, negative for clockwise, zero when
    the three points are collinear.
    """
    return (first[0] - origin[0]) * (second[1] - origin[1]) - (first[1] - origin[1]) * (
        second[0] - origin[0]
    )


def convex_hull(points: list[Point]) -> list[Point]:
    """Return the convex hull of ``points`` in counter-clockwise order.

    Andrew's monotone chain, O(n log n). Duplicate points are collapsed and
    collinear points are dropped, so a set of collinear materials yields the
    two extremes rather than a degenerate polygon with redundant vertices.

    Degenerate inputs are returned as-is rather than rejected: an empty list
    stays empty, a single material yields one point and two materials yield a
    segment. The caller decides how to render each case.
    """
    unique = sorted(set(points))
    if len(unique) <= 2:
        return unique

    lower: list[Point] = []
    for point in unique:
        while len(lower) >= 2 and _cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)

    upper: list[Point] = []
    for point in reversed(unique):
        while len(upper) >= 2 and _cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)

    # The first point of each chain repeats the last point of the other, so the
    # closing vertex of each is dropped. An all-collinear set collapses both
    # chains to the two extremes, which is the correct degenerate answer.
    return lower[:-1] + upper[:-1]


def bounding_box(points: list[Point]) -> tuple[Point, Point] | None:
    """Return ``((x_min, y_min), (x_max, y_max))`` or ``None`` for no points."""
    if not points:
        return None
    xs = [x for x, _ in points]
    ys = [y for _, y in points]
    return (min(xs), min(ys)), (max(xs), max(ys))
