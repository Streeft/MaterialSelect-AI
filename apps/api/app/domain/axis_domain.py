"""Axis extents of the figures, computed once on the server (ADR 0004).

The box plot, the cost curve and the Ashby selection box each need a number
that is not a datum: "how far past the data does the axis reach". That is
geometry, and a constant typed into a React component has no test and no
provenance. These pure functions are the single implementation; the services
attach the result to the response of the endpoint that already feeds the
figure, and the component only draws it.

Pure functions: no I/O, no ORM.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass

Interval = tuple[float, float]

#: Air left past the extreme whiskers so they do not sit on the frame.
BOX_PAD_FRACTION = 0.05
#: A log axis never pads by less than this many decades.
MIN_LOG_PAD_DECADES = 0.05


def padded_domain(
    low: float,
    high: float,
    *,
    log: bool,
    pad_fraction: float = BOX_PAD_FRACTION,
) -> Interval:
    """The extent ``[low, high]`` widened by ``pad_fraction`` in the drawn space.

    On a log axis the padding is added to the base-10 exponents (so the air is
    the same number of decades on both sides); on a linear axis to the values.
    A non-finite extent is the neutral ``(0, 1)``; a linear extent that
    collapsed to one value gets 10 % of its magnitude (or 1 for zero).
    """
    if not (math.isfinite(low) and math.isfinite(high)):
        return (0.0, 1.0)
    if log:
        a, b = math.log10(low), math.log10(high)
        pad = max((b - a) * pad_fraction, MIN_LOG_PAD_DECADES)
        return (10 ** (a - pad), 10 ** (b + pad))
    if low == high:
        pad = abs(low) * 0.1 or 1.0
        return (low - pad, high + pad)
    pad = (high - low) * pad_fraction
    return (low - pad, high + pad)


@dataclass(frozen=True)
class BoxDomains:
    """The two axis extents a box plot can be drawn on.

    ``log`` is ``None`` when the smallest value is not positive: a log axis
    cannot show it, and the figure falls back to ``linear`` instead of dropping
    a class in silence.
    """

    linear: Interval
    log: Interval | None


def box_domains(minimums: Sequence[float], maximums: Sequence[float]) -> BoxDomains | None:
    """Domains for a box plot whose boxes span ``minimums``..``maximums``."""
    if not minimums or not maximums:
        return None
    low, high = min(minimums), max(maximums)
    log = padded_domain(low, high, log=True) if low > 0 else None
    return BoxDomains(linear=padded_domain(low, high, log=False), log=log)


@dataclass(frozen=True)
class OpenBounds:
    """Where an open side of the selection rectangle is drawn to."""

    x: Interval
    y: Interval


#: Used when there is nothing plotted to measure against.
_EMPTY_SPAN: Interval = (1.0, 1000.0)


def _open_interval(values: Sequence[float], log: bool) -> Interval:
    low, high = min(values), max(values)
    if log:
        return (max(1e-12, low * 0.01), high * 100.0)
    span = high - low
    return (low - span * 0.5, high + span * 0.5)


def open_selection_bounds(
    xs: Sequence[float], ys: Sequence[float], *, log: bool
) -> OpenBounds:
    """Extent used for a side of the map selection the reader left open.

    A box limited only on the right still has to be drawn as a rectangle: its
    free sides reach two decades past the data on a log axis, half the data
    span on a linear one. With no points the default is a 1..1000 square.
    """
    if not xs or not ys:
        return OpenBounds(x=_EMPTY_SPAN, y=_EMPTY_SPAN)
    return OpenBounds(x=_open_interval(xs, log), y=_open_interval(ys, log))
