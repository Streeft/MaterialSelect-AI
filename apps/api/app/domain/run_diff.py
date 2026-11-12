"""What changed between two runs of the same study (D-210).

Pure and deterministic: two lists of ``(record_id, name, rank)`` in, one row
per record out, saying whether it entered, left, climbed, dropped or stayed.
The screen only lays the rows out — the positions moved are counted here, so
the wizard, a report and a test read the same answer (principle 2).

A record without a rank in either run (a run with no ranking, or a candidate
the ranking excluded for missing data) is compared by presence only: its
change is ``unranked`` while it stays in the candidate list, never a move of
"zero positions", which would claim a comparison that was not made.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.domain.errors import ValidationError

Change = Literal["up", "down", "same", "entered", "left", "unranked"]


@dataclass(frozen=True)
class RunEntry:
    record_id: int
    name: str
    rank: int | None


@dataclass(frozen=True)
class RunDiffRow:
    record_id: int
    name: str
    rank_before: int | None
    rank_after: int | None
    change: Change
    #: Positions climbed (positive) or dropped (negative); ``None`` when either
    #: run has no rank for the record.
    positions: int | None


@dataclass(frozen=True)
class RunDiff:
    rows: list[RunDiffRow]
    entered: int
    left: int
    moved: int
    unchanged: int
    winners_before: list[str]
    winners_after: list[str]
    winner_changed: bool


def _index(entries: list[RunEntry], which: str) -> dict[int, RunEntry]:
    by_id: dict[int, RunEntry] = {}
    for entry in entries:
        if entry.record_id in by_id:
            raise ValidationError(
                f"A execução {which} repete o registro {entry.record_id}; "
                "cada candidato aparece uma vez."
            )
        if entry.rank is not None and entry.rank < 1:
            raise ValidationError(f"Posição inválida na execução {which}: {entry.rank}.")
        by_id[entry.record_id] = entry
    return by_id


def _winners(entries: list[RunEntry]) -> list[str]:
    return sorted(e.name for e in entries if e.rank == 1)


def _change(before: RunEntry | None, after: RunEntry | None) -> tuple[Change, int | None]:
    if before is None:
        return "entered", None
    if after is None:
        return "left", None
    if before.rank is None or after.rank is None:
        return "unranked", None
    positions = before.rank - after.rank
    if positions > 0:
        return "up", positions
    if positions < 0:
        return "down", positions
    return "same", 0


def diff_runs(before: list[RunEntry], after: list[RunEntry]) -> RunDiff:
    """Compare two runs record by record.

    Rows follow the newer run's order (by rank, unranked after, then name),
    and the records that left come last, in the order they held before.
    """
    old = _index(before, "anterior")
    new = _index(after, "atual")

    def after_key(entry: RunEntry) -> tuple[bool, int, str]:
        return (entry.rank is None, entry.rank or 0, entry.name)

    rows: list[RunDiffRow] = []
    for entry in sorted(new.values(), key=after_key):
        previous = old.get(entry.record_id)
        change, positions = _change(previous, entry)
        rows.append(
            RunDiffRow(
                record_id=entry.record_id,
                name=entry.name,
                rank_before=previous.rank if previous else None,
                rank_after=entry.rank,
                change=change,
                positions=positions,
            )
        )
    for entry in sorted(old.values(), key=after_key):
        if entry.record_id in new:
            continue
        rows.append(
            RunDiffRow(
                record_id=entry.record_id,
                name=entry.name,
                rank_before=entry.rank,
                rank_after=None,
                change="left",
                positions=None,
            )
        )

    winners_before = _winners(before)
    winners_after = _winners(after)
    return RunDiff(
        rows=rows,
        entered=sum(1 for r in rows if r.change == "entered"),
        left=sum(1 for r in rows if r.change == "left"),
        moved=sum(1 for r in rows if r.change in ("up", "down")),
        unchanged=sum(1 for r in rows if r.change in ("same", "unranked")),
        winners_before=winners_before,
        winners_after=winners_after,
        winner_changed=winners_before != winners_after,
    )
