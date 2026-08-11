"""Charts for the printable report, rendered as SVG on the server.

A report that claims to be auditable cannot ship its figures as an image the
reader has to take on faith, and it cannot ship them as a script that redraws
them either — the document must still open, unchanged, from an email attachment
years from now, on a machine with no network. SVG written into the page is the
only form that satisfies both: it is text, it is inspectable, and it prints at
the printer's resolution instead of the screen's.

Four properties are structural here, not stylistic:

* **This module draws; it does not compute.** Slopes, convex hulls, iso-index
  endpoints and normalised scores all arrive already computed by
  ``domain``/``calculations`` (`ADR 0004`). What happens below is the mapping
  from data coordinates to pixels, and nothing else. If you find yourself
  wanting a ``math`` import for anything but ``log10``, the geometry belongs
  upstream.
* **Deterministic output.** No clock, no randomness, and every coordinate is
  rounded before it is written. The report re-runs the pipeline, so the same
  catalogue has to produce the same bytes — a figure that jitters in the last
  decimal would break that for no audit value.
* **Presentation attributes, never CSS.** The document is served under
  ``default-src 'none'``, and a figure a reader saves as a standalone ``.svg``
  loses whatever stylesheet was around it. ``fill="…"`` survives both; a class
  name survives neither.
* **Absence is drawn as absence.** A material with no value for an axis is not
  on the map, and a bar with no value is not a bar of length zero — it is a
  track with the word "ausente" written in it. This is the same rule the tables
  follow, and the one place a chart is most tempted to break it.

The palette is local to this module on purpose. The interface and its figures
share one set of tokens (`D-28`), but those tokens are CSS custom properties
that exist only inside the web application; a printed report has no ``:root`` to
read them from, which is why ``html.py`` has always carried its own hexes. These
are the print counterparts of the same roles, chosen for ink on white.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from html import escape
from math import floor, isfinite, log10
from typing import Literal

from app.exporters.cells import format_number

Scale = Literal["linear", "log"]

# --- Geometry of the frame -------------------------------------------------
# One canvas size for every figure in the report. A document whose figures are
# each a different width reads as a scrapbook, and `viewBox` means the single
# size still scales to whatever column the page gives it.
WIDTH = 720
HEIGHT = 440
MARGIN_LEFT = 78
MARGIN_RIGHT = 168  # the legend lives here
MARGIN_TOP = 34
MARGIN_BOTTOM = 62

PLOT_LEFT = MARGIN_LEFT
PLOT_RIGHT = WIDTH - MARGIN_RIGHT
PLOT_TOP = MARGIN_TOP
PLOT_BOTTOM = HEIGHT - MARGIN_BOTTOM

# Coordinates are rounded to this many decimals before being written, so the
# same study always renders the same bytes.
COORD_DIGITS = 2

# --- Palette ---------------------------------------------------------------
INK = "#0f172a"
INK_MUTED = "#475569"
INK_SUBTLE = "#64748b"
GRID = "#e2e8f0"
AXIS = "#94a3b8"
SURFACE = "#ffffff"
HIGHLIGHT = "#b45309"
INDEX_LINE = "#0f766e"

# Ordinal, and deliberately not a rainbow: six hues that stay distinguishable
# in greyscale (a printed monograph is often photocopied) and avoid putting the
# two most common classes on the red/green axis.
GROUP_COLOURS = (
    "#1d4ed8",
    "#b45309",
    "#0f766e",
    "#7c3aed",
    "#be123c",
    "#4d7c0f",
)
GROUP_FALLBACK = "#475569"


# --- The drawing vocabulary -------------------------------------------------
# Deliberately not the API schemas. These describe a *figure*, so this module
# can be exercised with four points and no database, and so the services layer
# stays the only place that knows how a `PropertyMapOut` is shaped.


@dataclass(frozen=True)
class Axis:
    """One axis: what it is called, how it is scaled, and where it starts."""

    label: str
    scale: Scale = "linear"
    min_value: float = 0.0
    max_value: float = 1.0


@dataclass(frozen=True)
class Point:
    x: float
    y: float
    label: str
    #: Legend grouping — the material's class, in practice.
    group: str = ""
    highlighted: bool = False


@dataclass(frozen=True)
class Polygon:
    """A class envelope. Vertices arrive in data coordinates, already hulled."""

    label: str
    vertices: list[tuple[float, float]]


@dataclass(frozen=True)
class Line:
    """An iso-index line. Endpoints arrive already solved by the backend."""

    label: str
    points: list[tuple[float, float]]


@dataclass(frozen=True)
class ScatterFigure:
    """An Ashby-style property map."""

    title: str
    x: Axis
    y: Axis
    points: list[Point] = field(default_factory=list)
    polygons: list[Polygon] = field(default_factory=list)
    lines: list[Line] = field(default_factory=list)
    #: Read under the figure. States what was left out, and why.
    caption: str = ""
    #: The accessible description. Never the only place a fact appears.
    description: str = ""


@dataclass(frozen=True)
class Bar:
    """One bar. ``value=None`` means absent, and is never drawn as zero."""

    label: str
    value: float | None
    highlighted: bool = False


@dataclass(frozen=True)
class BarFigure:
    title: str
    value_label: str
    bars: list[Bar] = field(default_factory=list)
    caption: str = ""
    description: str = ""


# --- Scales ----------------------------------------------------------------


class _Mapping:
    """Data coordinate to pixel, for one axis.

    A log axis maps ``log10(value)`` linearly, which is why non-positive values
    have no place on one — they are dropped by the caller, counted, and named in
    the caption rather than being clamped to some arbitrary floor.
    """

    def __init__(self, axis: Axis, pixel_low: float, pixel_high: float) -> None:
        self.scale = axis.scale
        low, high = _sane_range(axis)
        self.low = _project(low, axis.scale)
        self.high = _project(high, axis.scale)
        if self.high <= self.low:
            # A single-valued axis still has to draw. Give it a unit of width so
            # the point lands in the middle instead of dividing by zero.
            self.low -= 0.5
            self.high += 0.5
        self.pixel_low = pixel_low
        self.pixel_high = pixel_high

    def maps(self, value: float) -> bool:
        return isfinite(value) and (self.scale != "log" or value > 0)

    def to_pixel(self, value: float) -> float:
        position = (_project(value, self.scale) - self.low) / (self.high - self.low)
        return self.pixel_low + position * (self.pixel_high - self.pixel_low)


def _project(value: float, scale: Scale) -> float:
    return log10(value) if scale == "log" else value


def _sane_range(axis: Axis) -> tuple[float, float]:
    """The axis bounds, padded, and never inverted or degenerate."""
    low, high = axis.min_value, axis.max_value
    if not isfinite(low) or not isfinite(high):
        return (0.0, 1.0)
    if axis.scale == "log":
        # Below the first positive decade there is nothing to show.
        low = max(low, 1e-12)
        high = max(high, low * 10)
        return (low, high)
    if high == low:
        span = abs(high) or 1.0
        return (low - span * 0.5, high + span * 0.5)
    pad = (high - low) * 0.05
    return (low - pad, high + pad)


def _linear_ticks(low: float, high: float) -> list[float]:
    """Around five ticks, on a 1/2/2.5/5 × 10^k step."""
    span = high - low
    if span <= 0 or not isfinite(span):
        return [low]
    rough = span / 5
    magnitude = 10 ** floor(log10(rough))
    for factor in (1, 2, 2.5, 5, 10):
        step = factor * magnitude
        if step >= rough:
            break
    first = floor(low / step) * step
    ticks: list[float] = []
    value = first
    # Bounded so a pathological range cannot spin here.
    for _ in range(40):
        if value > high:
            break
        if value >= low:
            ticks.append(value)
        value += step
    return ticks or [low, high]


def _log_ticks(low: float, high: float) -> list[float]:
    """One tick per decade, thinned when the span is wide."""
    first, last = floor(log10(low)), floor(log10(high)) + 1
    decades = list(range(first, last + 1))
    stride = 1 if len(decades) <= 8 else (len(decades) // 8) + 1
    return [10.0**exponent for exponent in decades[::stride]]


def _ticks(axis: Axis) -> list[float]:
    low, high = _sane_range(axis)
    return _log_ticks(low, high) if axis.scale == "log" else _linear_ticks(low, high)


def _tick_label(value: float, scale: Scale) -> str:
    """Decade labels get powers of ten; everything else gets the plain number."""
    if scale == "log" and value > 0:
        exponent = log10(value)
        rounded = round(exponent)
        if abs(exponent - rounded) < 1e-9:
            return f"10{_superscript(rounded)}"
    return format_number(value)


_SUPERSCRIPTS = str.maketrans("-0123456789", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹")


def _superscript(exponent: int) -> str:
    return str(exponent).translate(_SUPERSCRIPTS)


# --- Emitting ---------------------------------------------------------------


def _n(value: float) -> str:
    """A coordinate, rounded so the output is byte-stable."""
    rounded = round(value, COORD_DIGITS)
    # `-0.0` and `0.0` are the same point and must print the same way.
    return f"{rounded + 0.0:g}"


def _t(text: object) -> str:
    """Every string that reaches the document, escaped for both body and attribute."""
    return escape(str(text), quote=True)


def _colour_for(group: str, order: list[str]) -> str:
    if group not in order:
        return GROUP_FALLBACK
    return GROUP_COLOURS[order.index(group) % len(GROUP_COLOURS)]


def _group_order(points: list[Point], polygons: list[Polygon]) -> list[str]:
    """Legend order: first appearance, so the same study always legends alike."""
    order: list[str] = []
    for group in [p.group for p in points] + [q.label for q in polygons]:
        if group and group not in order:
            order.append(group)
    return order


def _frame(title: str, description: str, body: str) -> str:
    """The shared wrapper: sized box, accessible name, white ground."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" '
        f'width="100%" role="img" aria-label="{_t(title)}" '
        f'font-family="ui-sans-serif, system-ui, Segoe UI, Roboto, Arial, sans-serif">'
        f"<title>{_t(title)}</title>"
        f"<desc>{_t(description)}</desc>"
        f'<rect x="0" y="0" width="{WIDTH}" height="{HEIGHT}" fill="{SURFACE}"/>'
        f'<text x="{MARGIN_LEFT}" y="20" font-size="13" font-weight="600" fill="{INK}">'
        f"{_t(title)}</text>"
        f"{body}"
        "</svg>"
    )


def _axes(x: Axis, y: Axis, mx: _Mapping, my: _Mapping) -> str:
    """Grid, ticks, tick labels and the two axis titles."""
    parts: list[str] = []

    for value in _ticks(x):
        if not mx.maps(value):
            continue
        px = mx.to_pixel(value)
        if px < PLOT_LEFT - 0.5 or px > PLOT_RIGHT + 0.5:
            continue
        parts.append(
            f'<line x1="{_n(px)}" y1="{PLOT_TOP}" x2="{_n(px)}" y2="{PLOT_BOTTOM}" '
            f'stroke="{GRID}" stroke-width="1"/>'
        )
        parts.append(
            f'<text x="{_n(px)}" y="{PLOT_BOTTOM + 16}" font-size="10" fill="{INK_MUTED}" '
            f'text-anchor="middle">{_t(_tick_label(value, x.scale))}</text>'
        )

    for value in _ticks(y):
        if not my.maps(value):
            continue
        py = my.to_pixel(value)
        if py < PLOT_TOP - 0.5 or py > PLOT_BOTTOM + 0.5:
            continue
        parts.append(
            f'<line x1="{PLOT_LEFT}" y1="{_n(py)}" x2="{PLOT_RIGHT}" y2="{_n(py)}" '
            f'stroke="{GRID}" stroke-width="1"/>'
        )
        parts.append(
            f'<text x="{PLOT_LEFT - 6}" y="{_n(py + 3)}" font-size="10" fill="{INK_MUTED}" '
            f'text-anchor="end">{_t(_tick_label(value, y.scale))}</text>'
        )

    parts.append(
        f'<line x1="{PLOT_LEFT}" y1="{PLOT_BOTTOM}" x2="{PLOT_RIGHT}" y2="{PLOT_BOTTOM}" '
        f'stroke="{AXIS}" stroke-width="1.5"/>'
    )
    parts.append(
        f'<line x1="{PLOT_LEFT}" y1="{PLOT_TOP}" x2="{PLOT_LEFT}" y2="{PLOT_BOTTOM}" '
        f'stroke="{AXIS}" stroke-width="1.5"/>'
    )
    parts.append(
        f'<text x="{(PLOT_LEFT + PLOT_RIGHT) / 2}" y="{HEIGHT - 22}" font-size="11" '
        f'fill="{INK}" text-anchor="middle">{_t(x.label)}</text>'
    )
    # Rotated rather than stacked: a vertical axis title set one letter per line
    # is unreadable at print size.
    parts.append(
        f'<text x="16" y="{(PLOT_TOP + PLOT_BOTTOM) / 2}" font-size="11" fill="{INK}" '
        f'text-anchor="middle" transform="rotate(-90 16 {(PLOT_TOP + PLOT_BOTTOM) / 2})">'
        f"{_t(y.label)}</text>"
    )
    return "".join(parts)


def _legend(entries: list[tuple[str, str]]) -> str:
    """Swatch and label, one per row, in the right-hand gutter."""
    parts: list[str] = []
    y = PLOT_TOP + 6
    for colour, label in entries[:14]:
        parts.append(
            f'<rect x="{PLOT_RIGHT + 14}" y="{_n(y - 7)}" width="10" height="10" rx="3" '
            f'fill="{colour}"/>'
        )
        # Truncated by character count rather than by measuring text: the exact
        # width depends on a font the print target may substitute.
        shown = label if len(label) <= 20 else f"{label[:19]}…"
        parts.append(
            f'<text x="{PLOT_RIGHT + 30}" y="{_n(y + 2)}" font-size="10" fill="{INK_MUTED}">'
            f"{_t(shown)}</text>"
        )
        y += 18
    return "".join(parts)


def _caption(text: str) -> str:
    if not text:
        return ""
    return (
        f'<text x="{MARGIN_LEFT}" y="{HEIGHT - 6}" font-size="9" fill="{INK_SUBTLE}">'
        f"{_t(text)}</text>"
    )


# --- Figures ----------------------------------------------------------------


def render_scatter(figure: ScatterFigure) -> str:
    """An Ashby map: envelopes underneath, index lines over them, points on top."""
    mx = _Mapping(figure.x, PLOT_LEFT, PLOT_RIGHT)
    my = _Mapping(figure.y, PLOT_BOTTOM, PLOT_TOP)
    order = _group_order(figure.points, figure.polygons)

    body = [_axes(figure.x, figure.y, mx, my)]

    for polygon in figure.polygons:
        vertices = [(x, y) for x, y in polygon.vertices if mx.maps(x) and my.maps(y)]
        if len(vertices) < 3:
            # Two points are a segment and one is a dot; neither is an envelope,
            # and drawing them as one would claim an area the class never had.
            continue
        colour = _colour_for(polygon.label, order)
        path = " ".join(f"{_n(mx.to_pixel(x))},{_n(my.to_pixel(y))}" for x, y in vertices)
        body.append(
            f'<polygon points="{path}" fill="{colour}" fill-opacity="0.08" '
            f'stroke="{colour}" stroke-opacity="0.45" stroke-width="1"/>'
        )

    for line in figure.lines:
        drawable = [(x, y) for x, y in line.points if mx.maps(x) and my.maps(y)]
        if len(drawable) < 2:
            continue
        path = " ".join(f"{_n(mx.to_pixel(x))},{_n(my.to_pixel(y))}" for x, y in drawable)
        body.append(
            f'<polyline points="{path}" fill="none" stroke="{INDEX_LINE}" '
            f'stroke-width="1.75" stroke-dasharray="6 4"/>'
        )

    for point in figure.points:
        if not (mx.maps(point.x) and my.maps(point.y)):
            continue
        px, py = mx.to_pixel(point.x), my.to_pixel(point.y)
        colour = _colour_for(point.group, order)
        if point.highlighted:
            # A ring rather than a bigger dot: size on a property map reads as a
            # third variable, and there isn't one.
            body.append(
                f'<circle cx="{_n(px)}" cy="{_n(py)}" r="8" fill="none" '
                f'stroke="{HIGHLIGHT}" stroke-width="2"/>'
            )
        body.append(
            f'<circle cx="{_n(px)}" cy="{_n(py)}" r="4" fill="{colour}" '
            f'stroke="{SURFACE}" stroke-width="1"><title>{_t(point.label)}</title></circle>'
        )

    entries = [(_colour_for(group, order), group) for group in order]
    if figure.lines:
        entries.append((INDEX_LINE, figure.lines[0].label))
    body.append(_legend(entries))
    body.append(_caption(figure.caption))

    return _frame(figure.title, figure.description, "".join(body))


def render_bars(figure: BarFigure) -> str:
    """Ranked bars. A missing value gets a track and a word, never a zero bar."""
    values = [bar.value for bar in figure.bars if bar.value is not None and isfinite(bar.value)]
    top = max(values) if values else 1.0
    # Bars grow from zero, so the axis has to start there even when every value
    # is far from it — a truncated bar chart exaggerates differences, and this
    # one exists to be compared.
    top = top if top > 0 else 1.0

    rows = figure.bars[:16]
    slot = (PLOT_BOTTOM - PLOT_TOP) / max(len(rows), 1)
    thickness = min(22.0, slot * 0.62)

    body: list[str] = [
        f'<line x1="{PLOT_LEFT}" y1="{PLOT_TOP}" x2="{PLOT_LEFT}" y2="{PLOT_BOTTOM}" '
        f'stroke="{AXIS}" stroke-width="1.5"/>',
        f'<text x="{(PLOT_LEFT + PLOT_RIGHT) / 2}" y="{HEIGHT - 22}" font-size="11" '
        f'fill="{INK}" text-anchor="middle">{_t(figure.value_label)}</text>',
    ]

    for position, bar in enumerate(rows):
        centre = PLOT_TOP + slot * (position + 0.5)
        y = centre - thickness / 2
        shown = bar.label if len(bar.label) <= 22 else f"{bar.label[:21]}…"
        body.append(
            f'<text x="{PLOT_LEFT - 6}" y="{_n(centre + 3)}" font-size="10" '
            f'fill="{INK_MUTED}" text-anchor="end">{_t(shown)}</text>'
        )

        if bar.value is None or not isfinite(bar.value):
            body.append(
                f'<rect x="{PLOT_LEFT}" y="{_n(y)}" width="{PLOT_RIGHT - PLOT_LEFT}" '
                f'height="{_n(thickness)}" rx="4" fill="{GRID}" fill-opacity="0.55"/>'
            )
            body.append(
                f'<text x="{PLOT_LEFT + 8}" y="{_n(centre + 3)}" font-size="10" '
                f'font-style="italic" fill="{INK_SUBTLE}">ausente</text>'
            )
            continue

        width = max(0.0, min(1.0, bar.value / top)) * (PLOT_RIGHT - PLOT_LEFT)
        colour = HIGHLIGHT if bar.highlighted else GROUP_COLOURS[0]
        body.append(
            f'<rect x="{PLOT_LEFT}" y="{_n(y)}" width="{_n(width)}" '
            f'height="{_n(thickness)}" rx="4" fill="{colour}" fill-opacity="0.85"/>'
        )
        body.append(
            f'<text x="{_n(PLOT_LEFT + width + 6)}" y="{_n(centre + 3)}" font-size="10" '
            f'fill="{INK_MUTED}">{_t(format_number(bar.value))}</text>'
        )

    body.append(_caption(figure.caption))
    return _frame(figure.title, figure.description, "".join(body))
