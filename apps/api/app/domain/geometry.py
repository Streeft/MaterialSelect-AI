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

import math

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


def _circle(centre: Point, radius: float, samples: int) -> list[Point]:
    """A circle as a sampled polygon — the cloud of a class with one grade."""
    cx, cy = centre
    return [
        (
            cx + radius * math.cos(2 * math.pi * i / samples),
            cy + radius * math.sin(2 * math.pi * i / samples),
        )
        for i in range(samples)
    ]


def fitted_ellipse(
    points: list[Point],
    *,
    samples: int = 48,
    pad: float = 1.0,
    min_semi_axis: float = 0.0,
) -> list[Point]:
    """An ellipse, oriented along the point cloud's principal axes, that
    encloses every point — the "adjusted" alternative envelope to the convex
    hull's literal one.

    Built from the points' covariance matrix: its eigenvectors give the
    ellipse's orientation, its eigenvalues its relative aspect ratio, and the
    scale is then set to the smallest multiple that still contains the
    farthest point (in the eigenbasis) — so unlike a fixed confidence
    ellipse, this one is a *bounding* ellipse, directly comparable to the
    hull it replaces: both enclose every plotted material, one with straight
    edges, one smooth.

    Returned as ``samples`` points approximating the boundary, in the same
    ``Point`` shape ``convex_hull`` returns, so callers that already draw a
    polygon (:class:`app.schemas.charts.ClassEnvelopeOut`) need no new code
    path for this shape.

    ``pad`` and ``min_semi_axis`` turn that bounding ellipse into the *cloud*
    an Ashby chart is read by. Both default to off, so a caller that wants the
    strict enclosure above still gets exactly it.

    - ``pad`` (>= 1) grows both semi-axes about the same centre. A class blob
      that touches its outermost grade reads as a boundary; one with a little
      air reads as a family, which is what the chart is claiming.
    - ``min_semi_axis`` floors each semi-axis, in the caller's coordinates. A
      class with one catalogued grade otherwise collapses to a dot and one with
      two to a segment — invisible as families, on precisely the catalogues a
      teaching tool is used with.

    Both **widen** the drawn region beyond the materials in it, so a padded
    cloud is indicative and no longer a statement that the class occupies
    exactly that area. Whoever draws one has to say so where it is read;
    ``ExportService`` puts it in the figure caption.

    Degenerate inputs: 0 points -> ``[]``; 1 point -> that point (or a circle
    of ``min_semi_axis``); all points collinear -> a zero-width ellipse
    (or one ``min_semi_axis`` wide).
    """
    unique = sorted(set(points))
    if len(unique) == 0:
        return []
    if len(unique) == 1:
        if min_semi_axis > 0.0:
            return _circle(unique[0], min_semi_axis, samples)
        return unique

    n = len(unique)
    cx = sum(p[0] for p in unique) / n
    cy = sum(p[1] for p in unique) / n
    # Population covariance (divide by n, not n-1): this is a geometric
    # bounding construction, not a statistical estimate of a population
    # parameter, so there is no sample/population distinction to honour.
    sxx = sum((p[0] - cx) ** 2 for p in unique) / n
    syy = sum((p[1] - cy) ** 2 for p in unique) / n
    sxy = sum((p[0] - cx) * (p[1] - cy) for p in unique) / n

    # Closed-form eigen-decomposition of the symmetric 2x2 matrix
    # [[sxx, sxy], [sxy, syy]].
    trace = sxx + syy
    det = sxx * syy - sxy * sxy
    disc = math.sqrt(max(trace * trace / 4 - det, 0.0))
    lambda1 = trace / 2 + disc
    lambda2 = trace / 2 - disc

    if sxy == 0.0 and abs(sxx - syy) < 1e-12:
        # Isotropic (a circle) or a single repeated point after dedup —
        # axis-aligned basis is as good as any.
        angle = 0.0
    elif abs(sxy) < 1e-12 and sxx >= syy:
        angle = 0.0
    elif abs(sxy) < 1e-12:
        angle = math.pi / 2
    else:
        angle = math.atan2(lambda1 - sxx, sxy)

    cos_a, sin_a = math.cos(angle), math.sin(angle)
    # Guard against a perfectly degenerate axis (all points collinear along
    # one eigenvector): a zero eigenvalue would divide by zero when scaling.
    axis1 = math.sqrt(max(lambda1, 1e-12))
    axis2 = math.sqrt(max(lambda2, 1e-12))

    # Scale factor: the farthest point in the (rotated, whitened) eigenbasis
    # sets how far the unit ellipse must stretch to still enclose it.
    max_radius = 0.0
    for x, y in unique:
        dx, dy = x - cx, y - cy
        u = (dx * cos_a + dy * sin_a) / axis1
        v = (-dx * sin_a + dy * cos_a) / axis2
        max_radius = max(max_radius, math.hypot(u, v))
    if max_radius == 0.0:
        if min_semi_axis > 0.0:
            return _circle((cx, cy), min_semi_axis, samples)
        return unique[:1]

    semi_major = max(axis1 * max_radius * pad, min_semi_axis)
    semi_minor = max(axis2 * max_radius * pad, min_semi_axis)

    boundary: list[Point] = []
    for i in range(samples):
        t = 2 * math.pi * i / samples
        ex, ey = semi_major * math.cos(t), semi_minor * math.sin(t)
        px = cx + ex * cos_a - ey * sin_a
        py = cy + ex * sin_a + ey * cos_a
        boundary.append((px, py))
    return boundary
