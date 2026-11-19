"""The catalogue's history, one point per release (D-250). Pure rules.

Each release keeps what it brought (``CatalogReleaseCount``); this module turns
those rows into the panel's series: the counts as stored, the share of value
rows that carry a number, and the change from the **previous release of the
same lineage** (D-108). A release with no lineage, or the first of its
lineage, has no previous one and so no change — never a change "from zero",
which would read as if the catalogue had been empty before it.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, fields

from app.calculations.statistics import share


@dataclass(frozen=True)
class ReleaseTally:
    """What one release brought, as integers counted from its rows."""

    materials: int
    classes: int
    properties: int
    values_filled: int
    values_declared_missing: int
    processes: int

    def minus(self, other: ReleaseTally) -> ReleaseTally:
        return ReleaseTally(
            **{f.name: getattr(self, f.name) - getattr(other, f.name) for f in fields(self)}
        )


@dataclass(frozen=True)
class ReleaseEntry:
    """A release as the history reads it, in the order it was imported."""

    key: str
    lineage: str | None
    tally: ReleaseTally


@dataclass(frozen=True)
class HistoryPoint:
    key: str
    tally: ReleaseTally
    #: Of the value rows the release wrote, the share carrying a number (0–100);
    #: ``None`` when it wrote none — an empty release has no share, not 0 %.
    filled_share_pct: float | None
    #: The release this one is compared with: the previous of its lineage.
    previous_key: str | None
    #: ``tally - previous.tally``; ``None`` without a previous release.
    change: ReleaseTally | None


def build_history(entries: Sequence[ReleaseEntry]) -> list[HistoryPoint]:
    """The series, in the order given (the caller sorts by import time).

    Deterministic: the result depends only on the entries and their order.
    """
    last_of_lineage: dict[str, ReleaseEntry] = {}
    points: list[HistoryPoint] = []
    for entry in entries:
        previous = last_of_lineage.get(entry.lineage) if entry.lineage else None
        tally = entry.tally
        points.append(
            HistoryPoint(
                key=entry.key,
                tally=tally,
                filled_share_pct=share(
                    tally.values_filled, tally.values_filled + tally.values_declared_missing
                ),
                previous_key=previous.key if previous else None,
                change=tally.minus(previous.tally) if previous else None,
            )
        )
        if entry.lineage:
            last_of_lineage[entry.lineage] = entry
    return points
