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

The palette comes from ``app.exporters.laudo_theme`` (D-241): the light-theme
values of the interface's own tokens (`D-28`), copied as hexes because a printed
report has no ``:root`` to read CSS custom properties from. ``html.py`` reads the
same module, so a figure and the page around it cannot disagree.

The laudo's summary charts (radar, horizontal bars, donut, waterfall, cost
curves and traffic light, D-241) follow the same four rules. The radar and the
donut need ``cos``/``sin`` — that is the polar version of mapping a value to a
pixel, not a computation of the data: every value, share and domain they draw
still arrives computed from ``domain``/``calculations``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from html import escape
from math import cos, floor, isfinite, log10, pi, sin
from typing import Literal

from app.exporters.cells import format_number
from app.exporters.laudo_theme import (
    FONT_SANS,
    STATUS,
    format_br,
    series_colour,
    series_dash,
    token,
)

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

#: The clip that keeps an iso-index line inside the plot rectangle.
PLOT_CLIP_ID = "plot-area"

# Coordinates are rounded to this many decimals before being written, so the
# same study always renders the same bytes.
COORD_DIGITS = 2

# --- Palette ---------------------------------------------------------------
# Every colour is a token of the interface's light theme (laudo_theme, D-241).
INK = token("ink")
INK_MUTED = token("ink-muted")
INK_SUBTLE = token("ink-subtle")
GRID = token("edge-subtle")
AXIS = token("edge-strong")
SURFACE = token("surface-raised")
#: The recommended material: the brand's deepest usable step, everywhere in the
#: laudo, so "this one" reads the same in the map, the bars and the radar.
HIGHLIGHT = token("brand-700")
#: The bars of the other finalists: a quiet step of the same hue.
BAR_MUTED = token("brand-300")
INDEX_LINE = token("info-fg")
#: The box a Chart stage drew. Deliberately the ink colour and **not** a data
#: hue: every one of the group colours is already spoken for by a class. A
#: seventh hue would read as a seventh class. The region is an annotation over
#: the data, not another series in it, so it is drawn in the same near-black the
#: axes and the title use — which also survives the photocopier the group
#: palette is chosen for.
REGION = INK

# Okabe–Ito (laudo_theme.SERIES): distinguishable under the common colour-vision
# deficiencies, and every legend entry is written out in words, so colour is
# never the only cue.
GROUP_COLOURS = tuple(series_colour(i) for i in range(6))
GROUP_FALLBACK = INK_MUTED


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
class Region:
    """The box a Chart stage drew, in data coordinates (P1-2).

    A bound of ``None`` is **open on that side**, and is drawn running to the
    edge of the plot rather than to an invented number — the same distinction
    the stored column makes, carried all the way to the ink. Closing an open
    box at some arbitrary value would draw a limit the reader never set.

    Which is also why the open side is resolved *here* and not by the caller:
    where the plot rectangle ends is a fact about the drawing, and the service
    that hands the box over does not know it.
    """

    label: str
    x_min: float | None = None
    x_max: float | None = None
    y_min: float | None = None
    y_max: float | None = None


@dataclass(frozen=True)
class ScatterFigure:
    """An Ashby-style property map."""

    title: str
    x: Axis
    y: Axis
    points: list[Point] = field(default_factory=list)
    polygons: list[Polygon] = field(default_factory=list)
    lines: list[Line] = field(default_factory=list)
    regions: list[Region] = field(default_factory=list)
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


def _frame(
    title: str,
    description: str,
    body: str,
    *,
    width: float = WIDTH,
    height: float = HEIGHT,
    title_x: float = MARGIN_LEFT,
) -> str:
    """The shared wrapper: sized box, accessible name, white ground."""
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {_n(width)} {_n(height)}" '
        f'width="100%" role="img" aria-label="{_t(title)}" '
        f'font-family="{_t(FONT_SANS)}">'
        f"<title>{_t(title)}</title>"
        f"<desc>{_t(description)}</desc>"
        f'<rect x="0" y="0" width="{_n(width)}" height="{_n(height)}" fill="{SURFACE}"/>'
        f'<text x="{_n(title_x)}" y="20" font-size="13" font-weight="600" fill="{INK}">'
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


#: About what one caption line holds at 9 px across the frame.
CAPTION_LINE = 128


def _caption(text: str) -> str:
    """The caption under the frame; a long one wraps to a second line at a word.

    Past two lines it is shortened with "…" — and the full text stays in the
    element's ``<title>``, so nothing is lost to a reader who hovers or to a
    screen reader.
    """
    if not text:
        return ""
    if len(text) <= CAPTION_LINE:
        return (
            f'<text x="{MARGIN_LEFT}" y="{HEIGHT - 6}" font-size="9" fill="{INK_SUBTLE}">'
            f"{_t(text)}</text>"
        )
    cut = text.rfind(" ", 0, CAPTION_LINE)
    cut = cut if cut > 0 else CAPTION_LINE
    first, second = text[:cut], text[cut:].strip()
    return (
        f'<text x="{MARGIN_LEFT}" y="{HEIGHT - 14}" font-size="9" fill="{INK_SUBTLE}">'
        f"<title>{_t(text)}</title>"
        f'<tspan x="{MARGIN_LEFT}">{_t(first)}</tspan>'
        f'<tspan x="{MARGIN_LEFT}" dy="10">{_t(_clip(second, CAPTION_LINE))}</tspan></text>'
    )


# --- Figures ----------------------------------------------------------------


def _region_rect(
    region: Region, mx: _Mapping, my: _Mapping
) -> tuple[float, float, float, float] | None:
    """A region as ``(left, top, width, height)`` in pixels, clipped to the plot.

    An absent bound runs to the frame, which is what "no bound" looks like when
    it is drawn. A bound the scale cannot represent — a non-positive number on a
    log axis — is treated the same way rather than being clamped to some floor:
    both are "the box does not close on this side *here*", and the caption is
    where the difference between them belongs.

    Returns None when nothing of the box falls inside the plot, so an offscreen
    region is omitted instead of being drawn as a sliver on the edge.
    """

    def edge(value: float | None, mapping: _Mapping, fallback: float) -> float:
        if value is None or not mapping.maps(value):
            return fallback
        return mapping.to_pixel(value)

    left = max(PLOT_LEFT, min(edge(region.x_min, mx, PLOT_LEFT), PLOT_RIGHT))
    right = max(PLOT_LEFT, min(edge(region.x_max, mx, PLOT_RIGHT), PLOT_RIGHT))
    # The y pixel axis grows downwards, so the *maximum* value is the top edge.
    top = max(PLOT_TOP, min(edge(region.y_max, my, PLOT_TOP), PLOT_BOTTOM))
    bottom = max(PLOT_TOP, min(edge(region.y_min, my, PLOT_BOTTOM), PLOT_BOTTOM))
    if right <= left or bottom <= top:
        return None
    return left, top, right - left, bottom - top


def render_scatter(figure: ScatterFigure) -> str:
    """An Ashby map, drawn bottom to top: class envelopes, the Chart stage's box
    over them, the index line over that, and the points on top of everything."""
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

    for region in figure.regions:
        rect = _region_rect(region, mx, my)
        if rect is None:
            continue
        left, top, width, height = rect
        body.append(
            f'<rect x="{_n(left)}" y="{_n(top)}" width="{_n(width)}" height="{_n(height)}" '
            f'fill="{REGION}" fill-opacity="0.06" stroke="{REGION}" stroke-width="1.5"/>'
        )

    # An iso-index line is solved over the axis range, not over the data, so an
    # endpoint can land outside the plot rectangle — legitimately, since the
    # line continues past the materials that happen to be catalogued. Clipping
    # keeps it from being drawn across the axis labels and the title. `maps()`
    # above cannot do this job: it asks whether a value is representable on the
    # scale, not whether it lands inside the frame.
    if figure.lines:
        body.append(
            f'<clipPath id="{PLOT_CLIP_ID}"><rect x="{_n(PLOT_LEFT)}" y="{_n(PLOT_TOP)}" '
            f'width="{_n(PLOT_RIGHT - PLOT_LEFT)}" height="{_n(PLOT_BOTTOM - PLOT_TOP)}"/>'
            f"</clipPath>"
        )

    for line in figure.lines:
        drawable = [(x, y) for x, y in line.points if mx.maps(x) and my.maps(y)]
        if len(drawable) < 2:
            continue
        path = " ".join(f"{_n(mx.to_pixel(x))},{_n(my.to_pixel(y))}" for x, y in drawable)
        body.append(
            f'<polyline points="{path}" fill="none" stroke="{INDEX_LINE}" '
            f'stroke-width="1.75" stroke-dasharray="6 4" clip-path="url(#{PLOT_CLIP_ID})"/>'
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
    if figure.regions:
        entries.append((REGION, figure.regions[0].label))
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
        colour = HIGHLIGHT if bar.highlighted else BAR_MUTED
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


# --- The laudo's summary charts (D-241) --------------------------------------
# Smaller, quieter figures than the map: they sit two to a row in the executive
# summary and have to read at a glance. Same rules as above — values arrive
# computed, absence is drawn as absence, every mark has words next to it.


def _clip(text: str, limit: int) -> str:
    """Shorten a label by character count (the print font may differ)."""
    return text if len(text) <= limit else f"{text[: limit - 1]}…"


@dataclass(frozen=True)
class HBar:
    """One horizontal bar. ``value=None`` is absent: a track and a word."""

    label: str
    value: float | None
    highlighted: bool = False
    #: Written after the value ("processo: Fundição"), never instead of it.
    note: str = ""


@dataclass(frozen=True)
class HBarFigure:
    title: str
    #: Written after each value and under the bars.
    unit: str
    bars: list[HBar] = field(default_factory=list)
    caption: str = ""
    description: str = ""
    width: float = 720


HBAR_LABEL_RIGHT = 196
HBAR_ROW = 23
HBAR_TOP = 32


def render_hbars(figure: HBarFigure) -> str:
    """Labelled horizontal bars from a zero baseline, value written at the tip.

    The frame always holds zero (a bar chart is read against its baseline), and
    a negative value — a recycling credit, a PROMETHEE net flow — grows left of
    it rather than being clipped.
    """
    rows = figure.bars[:12]
    values = [b.value for b in rows if b.value is not None and isfinite(b.value)]
    low = min([0.0, *values])
    high = max([0.0, *values])
    if not high > low:
        high = low + 1.0
    left = HBAR_LABEL_RIGHT + 8
    right = figure.width - 250
    height = HBAR_TOP + HBAR_ROW * max(len(rows), 1) + 30

    def x_of(value: float) -> float:
        return left + (value - low) / (high - low) * (right - left)

    zero = x_of(0.0)
    body = [
        f'<line x1="{_n(zero)}" y1="{HBAR_TOP - 4}" x2="{_n(zero)}" '
        f'y2="{_n(HBAR_TOP + HBAR_ROW * max(len(rows), 1))}" stroke="{AXIS}" stroke-width="1.25"/>'
    ]
    for position, bar in enumerate(rows):
        centre = HBAR_TOP + HBAR_ROW * (position + 0.5)
        weight = ' font-weight="600"' if bar.highlighted else ""
        body.append(
            f'<text x="{HBAR_LABEL_RIGHT}" y="{_n(centre + 3.5)}" font-size="10.5" '
            f'fill="{INK if bar.highlighted else INK_MUTED}" text-anchor="end"{weight}>'
            f"{_t(_clip(bar.label, 30))}</text>"
        )
        thickness = 14
        top = centre - thickness / 2
        if bar.value is None or not isfinite(bar.value):
            body.append(
                f'<rect x="{_n(left)}" y="{_n(top)}" width="{_n(right - left)}" '
                f'height="{thickness}" rx="3" fill="{GRID}" fill-opacity="0.6"/>'
            )
            body.append(
                f'<text x="{_n(left + 8)}" y="{_n(centre + 3.5)}" font-size="10" '
                f'font-style="italic" fill="{INK_SUBTLE}">ausente</text>'
            )
            continue
        start, end = sorted((zero, x_of(bar.value)))
        colour = HIGHLIGHT if bar.highlighted else BAR_MUTED
        body.append(
            f'<rect x="{_n(start)}" y="{_n(top)}" width="{_n(max(end - start, 1.0))}" '
            f'height="{thickness}" rx="3" fill="{colour}"/>'
        )
        text = f"{format_br(bar.value)} {figure.unit}".strip()
        if bar.note:
            text = f"{text} · {bar.note}"
        body.append(
            f'<text x="{_n(max(end, zero) + 6)}" y="{_n(centre + 3.5)}" font-size="10" '
            f'fill="{INK}"{weight}>{_t(_clip(text, 44))}</text>'
        )
    if figure.caption:
        body.append(
            f'<text x="{HBAR_LABEL_RIGHT - 180}" y="{_n(height - 10)}" font-size="9" '
            f'fill="{INK_SUBTLE}">{_t(figure.caption)}</text>'
        )
    return _frame(
        figure.title,
        figure.description,
        "".join(body),
        width=figure.width,
        height=height,
        title_x=16,
    )


@dataclass(frozen=True)
class RadarSeries:
    """One finalist on the radar; a ``None`` value is a vertex it does not have."""

    label: str
    values: list[float | None]
    highlighted: bool = False


@dataclass(frozen=True)
class RadarFigure:
    title: str
    #: One spoke per criterion, in the order of ``RadarSeries.values``.
    axes: list[str]
    series: list[RadarSeries] = field(default_factory=list)
    #: The value at the centre and at the rim, computed upstream.
    minimum: float = 0.0
    maximum: float = 1.0
    caption: str = ""
    description: str = ""


RADAR_CX = 280
RADAR_CY = 240
RADAR_R = 140


def _radar_point(index: int, count: int, fraction: float) -> tuple[float, float]:
    """Spoke ``index`` of ``count``, at ``fraction`` of the radius (12 o'clock first)."""
    angle = -pi / 2 + 2 * pi * index / count
    return RADAR_CX + RADAR_R * fraction * cos(angle), RADAR_CY + RADAR_R * fraction * sin(angle)


def render_radar(figure: RadarFigure) -> str:
    """Normalised scores of the finalists, one spoke per criterion.

    A series with a missing value is not closed into a polygon — the gap would
    have to be drawn somewhere, and anywhere is a number nobody measured — so
    only its defined vertices are marked, and the legend says so.
    """
    count = len(figure.axes)
    low, high = figure.minimum, figure.maximum
    if not (isfinite(low) and isfinite(high)) or not high > low:
        low, high = 0.0, 1.0

    def fraction(value: float) -> float:
        return max(0.0, min(1.0, (value - low) / (high - low)))

    body: list[str] = []
    if count < 3:
        body.append(
            f'<text x="{RADAR_CX}" y="{RADAR_CY}" font-size="11" fill="{INK_SUBTLE}" '
            f'text-anchor="middle">Radar precisa de pelo menos três critérios.</text>'
        )
        return _frame(figure.title, figure.description, "".join(body), title_x=16)

    for step in (0.25, 0.5, 0.75, 1.0):
        ring = " ".join(
            f"{_n(x)},{_n(y)}" for x, y in (_radar_point(i, count, step) for i in range(count))
        )
        body.append(f'<polygon points="{ring}" fill="none" stroke="{GRID}" stroke-width="1"/>')
        _, ry = _radar_point(0, count, step)
        body.append(
            f'<text x="{RADAR_CX + 4}" y="{_n(ry - 3)}" font-size="8.5" fill="{INK_SUBTLE}">'
            f"{_t(format_br(low + step * (high - low)))}</text>"
        )
    for index, label in enumerate(figure.axes):
        x, y = _radar_point(index, count, 1.0)
        body.append(
            f'<line x1="{RADAR_CX}" y1="{RADAR_CY}" x2="{_n(x)}" y2="{_n(y)}" '
            f'stroke="{GRID}" stroke-width="1"/>'
        )
        lx, ly = _radar_point(index, count, 1.14)
        anchor = "middle" if abs(lx - RADAR_CX) < 8 else ("start" if lx > RADAR_CX else "end")
        body.append(
            f'<text x="{_n(lx)}" y="{_n(ly + 3.5)}" font-size="10" fill="{INK}" '
            f'text-anchor="{anchor}">{_t(_clip(label, 26))}</text>'
        )

    legend: list[str] = []
    for position, series in enumerate(figure.series[:5]):
        colour = HIGHLIGHT if series.highlighted else series_colour(position)
        dash = series_dash(position)
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
        vertices = [
            (i, value)
            for i, value in enumerate(series.values[:count])
            if value is not None and isfinite(value)
        ]
        complete = len(vertices) == count
        if complete:
            path = " ".join(
                f"{_n(x)},{_n(y)}"
                for x, y in (_radar_point(i, count, fraction(v)) for i, v in vertices)
            )
            body.append(
                f'<polygon points="{path}" fill="{colour}" '
                f'fill-opacity="{0.2 if series.highlighted else 0.06}" stroke="{colour}" '
                f'stroke-width="{2.5 if series.highlighted else 1.5}"{dash_attr}/>'
            )
        for i, value in vertices:
            x, y = _radar_point(i, count, fraction(value))
            body.append(
                f'<circle cx="{_n(x)}" cy="{_n(y)}" r="3" fill="{colour}">'
                f"<title>{_t(series.label)}: {_t(format_br(value))}</title></circle>"
            )
        name = series.label if complete else f"{series.label} (dado ausente)"
        ly = 60 + 22 * position
        legend.append(
            f'<line x1="520" y1="{ly}" x2="546" y2="{ly}" stroke="{colour}" '
            f'stroke-width="{3 if series.highlighted else 2}"{dash_attr}/>'
        )
        weight = ' font-weight="600"' if series.highlighted else ""
        legend.append(
            f'<text x="554" y="{ly + 3.5}" font-size="10.5" fill="{INK}"{weight}>'
            f"{_t(_clip(name, 26))}</text>"
        )
    body.extend(legend)
    body.append(_caption(figure.caption))
    return _frame(figure.title, figure.description, "".join(body), title_x=16)


@dataclass(frozen=True)
class DonutSegment:
    """One slice: a count and the status (``laudo_theme.STATUS`` key) it is."""

    label: str
    value: float
    status: str = "ok"


@dataclass(frozen=True)
class DonutFigure:
    title: str
    segments: list[DonutSegment] = field(default_factory=list)
    #: The big text in the hole ("5 de 6") and the word under it.
    centre: str = ""
    centre_caption: str = ""
    description: str = ""


DONUT_W = 340
DONUT_H = 186
DONUT_CX = 92
DONUT_CY = 104
DONUT_R = 62
DONUT_STROKE = 22


def render_donut(figure: DonutFigure) -> str:
    """A ring of counts by status, with the count and the word in the legend.

    Drawn as dashed circles rather than arc paths: one circle per slice whose
    dash is the slice's share of the circumference. No angle is computed, and a
    slice that is the whole ring still draws (an arc path cannot close on
    itself).
    """
    circumference = 2 * pi * DONUT_R
    shown = [s for s in figure.segments if isfinite(s.value) and s.value > 0]
    total = sum(s.value for s in shown)
    body = [
        f'<circle cx="{DONUT_CX}" cy="{DONUT_CY}" r="{DONUT_R}" fill="none" '
        f'stroke="{GRID}" stroke-width="{DONUT_STROKE}"/>'
    ]
    offset = 0.0
    for segment in shown if total > 0 else []:
        length = circumference * segment.value / total
        colour = STATUS.get(segment.status, STATUS["na"]).colour
        body.append(
            f'<circle cx="{DONUT_CX}" cy="{DONUT_CY}" r="{DONUT_R}" fill="none" '
            f'stroke="{colour}" stroke-width="{DONUT_STROKE}" '
            f'stroke-dasharray="{_n(length)} {_n(circumference - length)}" '
            f'stroke-dashoffset="{_n(-offset)}" '
            f'transform="rotate(-90 {DONUT_CX} {DONUT_CY})"/>'
        )
        offset += length
    body.append(
        f'<text x="{DONUT_CX}" y="{DONUT_CY + 4}" font-size="20" font-weight="700" '
        f'fill="{INK}" text-anchor="middle">{_t(figure.centre)}</text>'
    )
    body.append(
        f'<text x="{DONUT_CX}" y="{DONUT_CY + 20}" font-size="9" fill="{INK_MUTED}" '
        f'text-anchor="middle">{_t(_clip(figure.centre_caption, 18))}</text>'
    )
    for row, segment in enumerate(figure.segments[:6]):
        status = STATUS.get(segment.status, STATUS["na"])
        y = 62 + 22 * row
        body.append(f'<circle cx="190" cy="{y}" r="7" fill="{status.colour}"/>')
        body.append(
            f'<text x="190" y="{y + 3.5}" font-size="9" font-weight="700" fill="{SURFACE}" '
            f'text-anchor="middle">{_t(status.glyph)}</text>'
        )
        body.append(
            f'<text x="204" y="{y + 3.5}" font-size="10.5" fill="{INK}">'
            f"{_t(_clip(segment.label, 16))}: {_t(format_br(segment.value))}</text>"
        )
    return _frame(
        figure.title,
        figure.description,
        "".join(body),
        width=DONUT_W,
        height=DONUT_H,
        title_x=16,
    )


@dataclass(frozen=True)
class WaterfallBar:
    """One step, in data coordinates from ``calculations.eco_audit.build_waterfall``."""

    label: str
    value: float | None
    start: float | None
    end: float | None
    reason: str | None = None
    is_total: bool = False


@dataclass(frozen=True)
class WaterfallFigure:
    title: str
    unit: str
    bars: list[WaterfallBar] = field(default_factory=list)
    #: (low, high) of the value axis, from the same calculation.
    domain: tuple[float, float] = (0.0, 1.0)
    caption: str = ""
    description: str = ""


WF_W = 720
WF_H = 252
WF_LEFT = 78
WF_RIGHT = 700
WF_TOP = 40
WF_BOTTOM = 200


def render_waterfall(figure: WaterfallFigure) -> str:
    """Contribution of each phase as a step, then the total bar.

    A step nobody could compute is an outlined slot with "não calculada" in it,
    at the running total and without moving it; the total bar is then empty
    with the reason — a sum of some phases is a subtotal that reads like one.
    """
    axis = Axis(label=figure.unit, min_value=figure.domain[0], max_value=figure.domain[1])
    my = _Mapping(axis, WF_BOTTOM, WF_TOP)
    body: list[str] = []
    for value in _ticks(axis):
        py = my.to_pixel(value)
        if py < WF_TOP - 0.5 or py > WF_BOTTOM + 0.5:
            continue
        body.append(
            f'<line x1="{WF_LEFT}" y1="{_n(py)}" x2="{WF_RIGHT}" y2="{_n(py)}" '
            f'stroke="{GRID}" stroke-width="1"/>'
        )
        body.append(
            f'<text x="{WF_LEFT - 6}" y="{_n(py + 3)}" font-size="9.5" fill="{INK_MUTED}" '
            f'text-anchor="end">{_t(format_br(value))}</text>'
        )
    zero = my.to_pixel(0.0)
    body.append(
        f'<line x1="{WF_LEFT}" y1="{_n(zero)}" x2="{WF_RIGHT}" y2="{_n(zero)}" '
        f'stroke="{AXIS}" stroke-width="1.5"/>'
    )
    body.append(
        f'<text x="16" y="{(WF_TOP + WF_BOTTOM) / 2}" font-size="10.5" fill="{INK}" '
        f'text-anchor="middle" transform="rotate(-90 16 {(WF_TOP + WF_BOTTOM) / 2})">'
        f"{_t(figure.unit)}</text>"
    )
    bars = figure.bars[:8]
    slot = (WF_RIGHT - WF_LEFT) / max(len(bars), 1)
    width = min(72.0, slot * 0.6)
    previous_end: float | None = None
    for position, bar in enumerate(bars):
        centre = WF_LEFT + slot * (position + 0.5)
        x = centre - width / 2
        weight = ' font-weight="600"' if bar.is_total else ""
        body.append(
            f'<text x="{_n(centre)}" y="{WF_BOTTOM + 18}" font-size="10" fill="{INK}" '
            f'text-anchor="middle"{weight}>{_t(_clip(bar.label, 16))}</text>'
        )
        if bar.value is None or bar.start is None or bar.end is None or not isfinite(bar.value):
            level = my.to_pixel(bar.start) if bar.start is not None else zero
            body.append(
                f'<rect x="{_n(x)}" y="{_n(level - 22)}" width="{_n(width)}" height="22" '
                f'fill="none" stroke="{INK_SUBTLE}" stroke-dasharray="3 3"/>'
            )
            body.append(
                f'<text x="{_n(centre)}" y="{_n(level - 8)}" font-size="8.5" '
                f'font-style="italic" fill="{INK_SUBTLE}" text-anchor="middle">'
                f"não calculada<title>{_t(bar.reason or '')}</title></text>"
            )
            continue
        top_px, bottom_px = sorted((my.to_pixel(bar.start), my.to_pixel(bar.end)))
        if bar.is_total:
            colour = HIGHLIGHT
        elif bar.value < 0:
            colour = token("success")
        else:
            colour = token("brand-500")
        if previous_end is not None and not bar.is_total:
            link = my.to_pixel(previous_end)
            body.append(
                f'<line x1="{_n(x - (slot - width))}" y1="{_n(link)}" x2="{_n(x)}" '
                f'y2="{_n(link)}" stroke="{INK_SUBTLE}" stroke-dasharray="2 2"/>'
            )
        body.append(
            f'<rect x="{_n(x)}" y="{_n(top_px)}" width="{_n(width)}" '
            f'height="{_n(max(bottom_px - top_px, 1.0))}" rx="2" fill="{colour}"/>'
        )
        sign = "+" if bar.value > 0 and not bar.is_total else ""
        body.append(
            f'<text x="{_n(centre)}" y="{_n(top_px - 5)}" font-size="9.5" fill="{INK}" '
            f'text-anchor="middle">{_t(sign + format_br(bar.value))}</text>'
        )
        previous_end = bar.end
    body.append(
        f'<text x="{WF_LEFT}" y="{WF_H - 10}" font-size="9" fill="{INK_SUBTLE}">'
        f"{_t(figure.caption)}</text>"
    )
    return _frame(
        figure.title, figure.description, "".join(body), width=WF_W, height=WF_H, title_x=16
    )


@dataclass(frozen=True)
class CurveSeries:
    """One material's cost × batch curve, with the marker at the batch asked."""

    label: str
    points: list[tuple[float, float]] = field(default_factory=list)
    current: tuple[float, float] | None = None
    highlighted: bool = False


@dataclass(frozen=True)
class CurveFigure:
    title: str
    x: Axis
    y: Axis
    series: list[CurveSeries] = field(default_factory=list)
    caption: str = ""
    description: str = ""


def render_curves(figure: CurveFigure) -> str:
    """Several curves on one log–log frame (the cost × batch figure, D-234).

    The frame (``Axis`` bounds) is the server's ``curve_domains``; this draws
    the polylines and the marker at the reader's batch, nothing more.
    """
    mx = _Mapping(figure.x, PLOT_LEFT, PLOT_RIGHT)
    my = _Mapping(figure.y, PLOT_BOTTOM, PLOT_TOP)
    body = [_axes(figure.x, figure.y, mx, my)]
    body.append(
        f'<clipPath id="curve-area"><rect x="{_n(PLOT_LEFT)}" y="{_n(PLOT_TOP)}" '
        f'width="{_n(PLOT_RIGHT - PLOT_LEFT)}" height="{_n(PLOT_BOTTOM - PLOT_TOP)}"/></clipPath>'
    )
    entries: list[tuple[str, str]] = []
    for position, series in enumerate(figure.series[:6]):
        colour = HIGHLIGHT if series.highlighted else series_colour(position)
        dash = series_dash(position)
        dash_attr = f' stroke-dasharray="{dash}"' if dash else ""
        drawable = [(x, y) for x, y in series.points if mx.maps(x) and my.maps(y)]
        if len(drawable) >= 2:
            path = " ".join(f"{_n(mx.to_pixel(x))},{_n(my.to_pixel(y))}" for x, y in drawable)
            body.append(
                f'<polyline points="{path}" fill="none" stroke="{colour}" '
                f'stroke-width="{2.5 if series.highlighted else 1.75}"{dash_attr} '
                f'clip-path="url(#curve-area)"/>'
            )
        if series.current is not None and mx.maps(series.current[0]) and my.maps(series.current[1]):
            cx, cy = mx.to_pixel(series.current[0]), my.to_pixel(series.current[1])
            body.append(
                f'<circle cx="{_n(cx)}" cy="{_n(cy)}" r="4.5" fill="{SURFACE}" '
                f'stroke="{colour}" stroke-width="2"><title>{_t(series.label)}: '
                f"{_t(format_br(series.current[1]))}</title></circle>"
            )
        entries.append((colour, series.label))
    body.append(_legend(entries))
    body.append(_caption(figure.caption))
    return _frame(figure.title, figure.description, "".join(body), title_x=16)


@dataclass(frozen=True)
class Light:
    """One requirement on the traffic light; ``status`` is a ``STATUS`` key."""

    label: str
    status: str
    detail: str = ""


@dataclass(frozen=True)
class TrafficLightFigure:
    title: str
    lights: list[Light] = field(default_factory=list)
    description: str = ""
    width: float = 720


TL_TOP = 30
TL_ROW = 31


def render_traffic_light(figure: TrafficLightFigure) -> str:
    """A checklist: lamp with glyph, the requirement, its detail and the word.

    The word ("Atende", "Atenção", "Não atende", "Não avaliado") is written on
    every row: the hue is a second cue, never the only one.
    """
    rows = figure.lights[:14]
    height = TL_TOP + TL_ROW * max(len(rows), 1) + 6
    body: list[str] = []
    for position, light in enumerate(rows):
        status = STATUS.get(light.status, STATUS["na"])
        y = TL_TOP + TL_ROW * position
        centre = y + TL_ROW / 2
        if position:
            body.append(
                f'<line x1="16" y1="{_n(y)}" x2="{_n(figure.width - 16)}" y2="{_n(y)}" '
                f'stroke="{GRID}" stroke-width="1"/>'
            )
        body.append(f'<circle cx="30" cy="{_n(centre)}" r="9" fill="{status.colour}"/>')
        body.append(
            f'<text x="30" y="{_n(centre + 4)}" font-size="12" font-weight="700" '
            f'fill="{SURFACE}" text-anchor="middle">{_t(status.glyph)}</text>'
        )
        label_y = centre - 2 if light.detail else centre + 4
        body.append(
            f'<text x="50" y="{_n(label_y)}" font-size="11" font-weight="600" fill="{INK}">'
            f"{_t(_clip(light.label, 72))}</text>"
        )
        if light.detail:
            body.append(
                f'<text x="50" y="{_n(centre + 10)}" font-size="9.5" fill="{INK_MUTED}">'
                f"{_t(_clip(light.detail, 96))}<title>{_t(light.detail)}</title></text>"
            )
        pill_w = 88
        pill_x = figure.width - 16 - pill_w
        body.append(
            f'<rect x="{_n(pill_x)}" y="{_n(centre - 10)}" width="{pill_w}" height="20" '
            f'rx="10" fill="{status.soft}" stroke="{status.colour}" stroke-width="1"/>'
        )
        body.append(
            f'<text x="{_n(pill_x + pill_w / 2)}" y="{_n(centre + 3.5)}" font-size="10" '
            f'font-weight="600" fill="{status.ink}" text-anchor="middle">'
            f"{_t(status.word)}</text>"
        )
    return _frame(
        figure.title,
        figure.description,
        "".join(body),
        width=figure.width,
        height=height,
        title_x=16,
    )
