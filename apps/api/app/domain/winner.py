"""Who won a selection run, read off numbers the run already produced (D-85).

Nothing here scores anything. A ranked run names its rank-1 rows (a tie is a
tie), an index-only run names the best *defined* index value in the direction
the index declares, and a run with neither names nobody and says why. Picking
the largest of numbers the engine produced is a comparison, not a computation,
but it still belongs in the backend (ADR 0004): the screen, an exported report
and a saved study must name the same winner.

Pure function: no I/O, no ORM.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

NoWinnerReason = Literal["no_candidates", "no_objective", "no_defined_index"]


@dataclass(frozen=True)
class Winner:
    kind: Literal["ranked", "index", "none"]
    names: list[str] = field(default_factory=list)
    reason: NoWinnerReason | None = None
    # kind == "ranked"
    score: float | None = None
    method: str | None = None
    contributions: list[Any] = field(default_factory=list)
    index_value: float | None = None
    # kind == "index"
    value: float | None = None
    maximize: bool | None = None


def pick_winner(
    *,
    candidate_count: int,
    ranked: Sequence[Mapping[str, Any]],
    method: str | None,
    index_goal: str | None,
    index_values: Sequence[tuple[int, float | None]],
    names: Mapping[int, str] | None = None,
) -> Winner:
    """Name the winner of a run.

    ``ranked`` holds the ranking rows as mappings (``record_id``, ``name``,
    ``score``, ``rank``, ``contributions``); ``index_values`` the
    ``(record_id, value)`` of the candidates, ``None`` meaning undefined;
    ``names`` maps a record to its name for the index-only case.
    """
    if candidate_count == 0:
        return Winner(kind="none", reason="no_candidates")

    top = [row for row in ranked if row["rank"] == 1]
    if top:
        first = top[0]
        value_by_id = dict(index_values)
        return Winner(
            kind="ranked",
            names=[row["name"] for row in top],
            score=first["score"],
            method=method,
            contributions=list(first["contributions"]),
            index_value=value_by_id.get(first["record_id"]),
        )

    if index_goal is not None:
        defined = [(rid, v) for rid, v in index_values if v is not None]
        if not defined:
            return Winner(kind="none", reason="no_defined_index")
        minimize = index_goal == "minimize"
        best = min(v for _, v in defined) if minimize else max(v for _, v in defined)
        lookup = names or {}
        return Winner(
            kind="index",
            names=[lookup.get(rid, str(rid)) for rid, v in defined if v == best],
            value=best,
            maximize=not minimize,
        )

    return Winner(kind="none", reason="no_objective")
