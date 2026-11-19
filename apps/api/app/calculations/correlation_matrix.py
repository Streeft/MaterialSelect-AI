"""Pairwise-complete Spearman matrix over columns of values (D-193, D-250).

Pure arithmetic, no database: the panel's whole-catalogue matrix and its
per-class small multiples (D-250) are the same computation over different
columns, so they live here once and cannot drift apart.

A column is ``{material id: normalised value}`` and holds only the materials
that **carry** a number — a missing value is absent from the dict, never a 0
(principle 3). Each pair then reads the materials present in both columns
(pairwise deletion), and a pair below :data:`MIN_PAIRS` materials, or without
variance, gets ``rho = None``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from app.calculations.statistics import MIN_PAIRS, average_ranks, pearson, spearman

#: Coefficients are rounded here so the same rows give the same bytes on any
#: machine (a float's last digit can differ between summation orders).
RHO_DECIMALS = 4


@dataclass(frozen=True)
class CorrelationCell:
    x: str
    y: str
    rho: float | None
    pairs: int


def correlation_cells(
    columns: Mapping[str, Mapping[int, float]], slugs: Sequence[str]
) -> list[CorrelationCell]:
    """Every ordered pair of ``slugs``: ρ of Spearman and how many pairs it read.

    Deterministic: the result depends only on the columns' contents, never on
    the order a query returned the rows (each pair is sorted by material id
    before ranking). The diagonal is 1 when the column alone has
    :data:`MIN_PAIRS` values, otherwise ``None``. Both (x, y) and (y, x) are
    emitted, so a client draws the square without mirroring anything.
    """
    rank_cache: dict[str, list[float]] = {}

    def ranks(slug: str) -> list[float]:
        if slug not in rank_cache:
            column = columns[slug]
            ordered = sorted(column)
            rank_cache[slug] = average_ranks([column[m] for m in ordered])
        return rank_cache[slug]

    cells: list[CorrelationCell] = []
    for i, x in enumerate(slugs):
        cx = columns[x]
        for y in slugs[i:]:
            cy = columns[y]
            if x == y:
                n = len(cx)
                rho = 1.0 if n >= MIN_PAIRS else None
            else:
                common = cx.keys() & cy.keys()
                n = len(common)
                if n == len(cx) == len(cy) and n >= MIN_PAIRS:
                    # Both columns complete on the same materials: the ranks
                    # computed once per column are the pair's ranks.
                    rho = pearson(ranks(x), ranks(y))
                else:
                    ordered = sorted(common)
                    rho = spearman([cx[m] for m in ordered], [cy[m] for m in ordered])
            rho = None if rho is None else round(rho, RHO_DECIMALS)
            cells.append(CorrelationCell(x=x, y=y, rho=rho, pairs=n))
            if x != y:
                cells.append(CorrelationCell(x=y, y=x, rho=rho, pairs=n))
    return cells
