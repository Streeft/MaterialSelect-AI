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
