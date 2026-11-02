"""Descriptive statistics for the catalogue panel.

Pure and deterministic: no session, no ORM, no I/O. Every number the panel draws
as a box, a whisker or a share comes from here, because ADR 0004 puts chart
geometry in the backend — quartiles computed in the browser would be a second,
unreviewed implementation of the same statistic, and the figure in the report
and the figure on the screen could then disagree.

Two rules from the methodology show up as return types rather than as comments:
a summary of nothing is ``None`` and not a row of zeros, and a share of nothing
is ``None`` and not ``0%``. Both are the third principle of the project (§1.3):
absence never becomes a number.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class FiveNumber:
    """The five-number summary backing one box on the panel.

    ``count`` travels with the box on purpose: a box drawn from three materials
    and a box drawn from three hundred look identical, and the reader deciding
    whether a class really is stiffer than another needs to know which one they
    are looking at.
    """

    count: int
    minimum: float
    q1: float
    median: float
    q3: float
    maximum: float


def quantile(sorted_values: Sequence[float], q: float) -> float:
    """The ``q``-quantile of an already-sorted, non-empty sequence.

    Linear interpolation between order statistics — the "type 7" definition,
    which is what R, numpy and pandas return by default. The method is named
    here rather than chosen by accident because there are nine of them in common
    use and they disagree on small samples, which is exactly the size most
    classes in this catalogue have.

    Raises:
        ValueError: if the sequence is empty or ``q`` falls outside [0, 1].
    """
    if not sorted_values:
        raise ValueError("Quantil de uma sequência vazia não existe")
    if not 0.0 <= q <= 1.0:
        raise ValueError(f"Quantil fora de [0, 1]: {q}")

    n = len(sorted_values)
    if n == 1:
        return float(sorted_values[0])

    position = (n - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return float(sorted_values[lower])
    weight = position - lower
    return float(sorted_values[lower]) + weight * (
        float(sorted_values[upper]) - float(sorted_values[lower])
    )


def five_number_summary(values: Sequence[float]) -> FiveNumber | None:
    """Summarise ``values``, or return ``None`` when there is nothing to summarise.

    ``None`` rather than a zeroed record: a class with no data for a property has
    no minimum, and writing ``0`` there would put it at the bottom of every axis
    as though it had been measured and found to be nothing.
    """
    if not values:
        return None
    ordered = sorted(float(v) for v in values)
    return FiveNumber(
        count=len(ordered),
        minimum=ordered[0],
        q1=quantile(ordered, 0.25),
        median=quantile(ordered, 0.5),
        q3=quantile(ordered, 0.75),
        maximum=ordered[-1],
    )


def share(part: int, whole: int) -> float | None:
    """``part`` as a percentage of ``whole``, or ``None`` when ``whole`` is zero.

    An empty catalogue has no coverage — not 0% coverage. The difference matters
    on the one screen whose job is to say how much of the catalogue is actually
    filled in: "0%" invites the reader to conclude the data is bad, when the
    truth is that there is no data to judge.

    Raises:
        ValueError: if ``part`` or ``whole`` is negative, or ``part`` exceeds
            ``whole`` — either means the caller counted the same row twice.
    """
    if part < 0 or whole < 0:
        raise ValueError(f"Contagem negativa: {part} de {whole}")
    if part > whole:
        raise ValueError(f"Parte maior que o todo: {part} de {whole}")
    if whole == 0:
        return None
    return round(100.0 * part / whole, 1)


# --- Histogram (D-193) ------------------------------------------------------

#: Bin count bounds for :func:`histogram`. Fewer than five bars stop being a
#: shape; more than forty on a half-width card stop being readable.
MIN_BINS = 5
MAX_BINS = 40


@dataclass(frozen=True)
class HistogramBin:
    """One bar: ``[lower, upper)`` — the last bin is closed on both ends."""

    lower: float
    upper: float
    count: int


@dataclass(frozen=True)
class Histogram:
    """The bars plus the scale they were cut on.

    ``log`` says whether the edges are equally spaced in ``log10``. The edges
    themselves always travel in the variable's own unit, so the figure never
    has to undo a transform to label an axis.
    """

    bins: tuple[HistogramBin, ...]
    log: bool


def bin_count(values: Sequence[float]) -> int:
    """How many bins: Freedman–Diaconis, falling back to Sturges.

    Freedman–Diaconis (width ``2·IQR·n^-1/3``) follows the data's spread and is
    not dragged by outliers, which this catalogue has plenty of (a foam and a
    tungsten alloy in the same density column). When the IQR is zero — more than
    half the values identical — it has no width to give, and Sturges'
    ``⌈log2 n⌉ + 1`` takes over. Clamped to [``MIN_BINS``, ``MAX_BINS``].
    """
    n = len(values)
    if n == 0:
        raise ValueError("Histograma de uma sequência vazia não existe")
    ordered = sorted(float(v) for v in values)
    span = ordered[-1] - ordered[0]
    iqr = quantile(ordered, 0.75) - quantile(ordered, 0.25)
    if span > 0 and iqr > 0:
        width = 2.0 * iqr / (n ** (1.0 / 3.0))
        raw = math.ceil(span / width)
    else:
        raw = math.ceil(math.log2(n)) + 1 if n > 1 else 1
    return max(MIN_BINS, min(MAX_BINS, raw))


def histogram(values: Sequence[float], *, log: bool = False) -> Histogram | None:
    """Equal-width bins over ``values``; ``None`` when there is nothing to count.

    With ``log=True`` the bins are equal in ``log10`` — the honest axis for a
    property spanning decades — but only if every value is positive; otherwise
    the request falls back to linear and says so through ``Histogram.log``. A
    column with a single distinct value gets one bin, never a fake spread.
    """
    if not values:
        return None
    data = [float(v) for v in values]
    use_log = log and all(v > 0 for v in data)
    points = [math.log10(v) for v in data] if use_log else data
    low, high = min(points), max(points)

    def back(x: float) -> float:
        return 10.0**x if use_log else x

    if high == low:
        return Histogram(bins=(HistogramBin(back(low), back(high), len(points)),), log=use_log)

    count = bin_count(points)
    width = (high - low) / count
    tallies = [0] * count
    for p in points:
        index = min(int((p - low) / width), count - 1)
        tallies[index] += 1
    bins = tuple(
        HistogramBin(
            lower=back(low + i * width),
            upper=back(high if i == count - 1 else low + (i + 1) * width),
            count=tallies[i],
        )
        for i in range(count)
    )
    return Histogram(bins=bins, log=use_log)


def mean(values: Sequence[float]) -> float | None:
    """Arithmetic mean, or ``None`` for nothing — never ``0``."""
    if not values:
        return None
    return math.fsum(float(v) for v in values) / len(values)


# --- Rank correlation (D-193) ----------------------------------------------

#: Below this many materials carrying both properties a correlation is noise;
#: the cell says "dados insuficientes" instead of printing a coefficient.
MIN_PAIRS = 5


def average_ranks(values: Sequence[float]) -> list[float]:
    """1-based ranks, ties sharing the average of the ranks they span."""
    order = sorted(range(len(values)), key=lambda i: values[i])
    ranks = [0.0] * len(values)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and values[order[j + 1]] == values[order[i]]:
            j += 1
        shared = (i + j) / 2.0 + 1.0
        for k in range(i, j + 1):
            ranks[order[k]] = shared
        i = j + 1
    return ranks


def pearson(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    """Pearson's r, or ``None`` when either side has no variance."""
    n = len(xs)
    if n != len(ys):
        raise ValueError("Sequências de tamanhos diferentes")
    if n < 2:
        return None
    mx = math.fsum(xs) / n
    my = math.fsum(ys) / n
    sxy = math.fsum((x - mx) * (y - my) for x, y in zip(xs, ys, strict=True))
    sxx = math.fsum((x - mx) ** 2 for x in xs)
    syy = math.fsum((y - my) ** 2 for y in ys)
    if sxx <= 0 or syy <= 0:
        return None
    r = sxy / math.sqrt(sxx * syy)
    return max(-1.0, min(1.0, r))


def spearman(xs: Sequence[float], ys: Sequence[float]) -> float | None:
    """Spearman's ρ: Pearson over average ranks.

    Rank correlation and not Pearson on the raw values, because the panel pairs
    properties that span decades: on a linear scale three tungsten alloys would
    decide the density–stiffness coefficient alone. Ranks are also indifferent
    to the reading unit, so the number cannot change when the reader switches
    MPa for psi. ``None`` below :data:`MIN_PAIRS` or without variance — an
    undefined coefficient is never written as 0.
    """
    if len(xs) != len(ys):
        raise ValueError("Sequências de tamanhos diferentes")
    if len(xs) < MIN_PAIRS:
        return None
    return pearson(average_ranks(xs), average_ranks(ys))
