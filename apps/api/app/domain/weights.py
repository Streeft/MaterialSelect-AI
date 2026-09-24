"""The weight budget of a ranking: how much of the limit the criteria use (D-87).

A ranking's weights are entered on a scale whose total is **1**. This module is
what the screen reads while the reader types: the running total, what is left
or exceeded, each criterion's share of the weighted average, what is wrong with
each row, and — when the total does not close — one suggestion that closes it
exactly.

Two things here are deliberate:

* **Decimal, not float.** ``0.1 + 0.2 + 0.7`` is ``0.9999999999999999`` in
  binary floating point, and a screen that says "faltam 0,0000000000000001"
  after the reader typed three weights that sum to 1 would be lying. Each
  weight enters as ``Decimal(repr(w))`` — the shortest decimal that round-trips
  the float, which is what the reader typed.
* **A tolerance of 0.001.** The AHP panel writes its weights rounded to four
  places, so its sums land on 0.9999 or 1.0001. A total within the tolerance is
  complete; the ranking renormalizes anyway (``domain.ranking``), so the
  residue changes nothing downstream.

Nothing here decides whether a study *may run* on the server: ``/run`` keeps
renormalizing whatever it is given, because the laudo and "Executar" in "Meus
estudos" re-run studies saved before this rule existed (weights 1, 1, 1). The
"total must close at 1" rule applies at entry, on the screen.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_FLOOR, Decimal
from typing import Literal

#: The total the weights must reach. A constant, not a parameter: the screen
#: states it ("limite 1") and every suggestion closes on it.
WEIGHT_LIMIT = Decimal("1")

#: How far from the limit a total may be and still count as closed — the AHP
#: panel's four-place rounding. See the module docstring.
WEIGHT_TOLERANCE = Decimal("0.001")

#: Same cap the AHP matrix has: past a dozen criteria a weighted average stops
#: meaning anything a reader can check.
MAX_WEIGHT_CRITERIA = 12

#: The ranking's pseudo-key for "the performance index" (mirrors
#: ``app.domain.ranking``'s use in the service).
INDEX_KEY = "__index__"

WeightIssue = Literal[
    "missing_key",
    "missing_weight",
    "zero",
    "negative",
    "duplicate_key",
    "unknown_key",
    "index_missing",
]
BudgetStatus = Literal["empty", "incomplete", "complete", "exceeds"]
SuggestionKind = Literal["fill_blanks", "spread_remaining", "split_equally", "scale_to_limit"]


@dataclass(frozen=True)
class WeightEntry:
    """One row as the reader has it: a criterion key (maybe not chosen yet) and
    a weight (maybe still blank)."""

    key: str | None
    weight: float | None


@dataclass(frozen=True)
class WeightRow:
    position: int
    key: str | None
    weight: float | None
    #: Fraction of the weighted average this row carries (its weight over the
    #: total of valid weights) — what ``/run`` would use after renormalizing.
    #: ``None`` for a row with no usable weight: blank is not zero (D-24).
    share: float | None
    share_percent: float | None
    issue: WeightIssue | None


@dataclass(frozen=True)
class WeightSuggestion:
    kind: SuggestionKind
    #: One weight per row, in row order, summing to exactly 1.
    weights: list[float]


@dataclass(frozen=True)
class WeightBudget:
    limit: float
    tolerance: float
    total: float
    remaining: float
    excess: float
    status: BudgetStatus
    rows: list[WeightRow]
    suggestion: WeightSuggestion | None
    can_run: bool


def _as_decimal(weight: float) -> Decimal:
    return Decimal(repr(weight))


def _usable(weight: float | None) -> bool:
    return weight is not None and weight > 0


def _places(weights: list[float]) -> int:
    """Decimal places for a suggestion: two, or up to four when the reader
    already typed finer weights (an AHP result), so their own digits survive."""
    places = 2
    for weight in weights:
        exponent = _as_decimal(weight).normalize().as_tuple().exponent
        if isinstance(exponent, int) and exponent < 0:
            places = max(places, -exponent)
    return min(places, 4)


def split_exactly(targets: list[Decimal], places: int) -> list[Decimal]:
    """Round ``targets`` to ``places`` decimals so they sum to exactly 1.

    Largest remainder: floor each target to the quantum, then hand the quanta
    still missing to the rows with the largest fractional remainder. A tie goes
    to the **later** row — 1/3 each reads 0,33 · 0,33 · 0,34, the last row
    absorbing the rounding, which is where a reader looks for it.

    A target that is already a multiple of the quantum has no remainder and is
    returned untouched, which is what keeps the weights the reader typed
    exactly as typed in a "fill the blanks" suggestion.
    """
    quantum = Decimal(1).scaleb(-places)
    floors = [t.quantize(quantum, rounding=ROUND_FLOOR) for t in targets]
    missing = int(((WEIGHT_LIMIT - sum(floors, Decimal(0))) / quantum).to_integral_value())
    order = sorted(
        range(len(targets)),
        key=lambda i: (targets[i] - floors[i], i),
        reverse=True,
    )
    result = list(floors)
    for i in order[: max(missing, 0)]:
        result[i] += quantum
    return result


def _suggest(entries: list[WeightEntry], total: Decimal) -> WeightSuggestion | None:
    """The one move that closes the total at 1, chosen by what is wrong.

    * blanks and room left → **fill_blanks**: the typed weights stay, the blanks
      share what is left;
    * no blanks, room left → **spread_remaining**: what is left is shared
      equally by every row ("Distribuir o restante igualmente");
    * blanks but no room → **split_equally**: there is nothing left to share,
      so every row gets the same;
    * no blanks, over the limit → **scale_to_limit**: every weight keeps its
      proportion — the one-click conversion of a study saved as 1, 1, 1.
    """
    n = len(entries)
    typed = [e.weight for e in entries if _usable(e.weight)]
    places = _places([w for w in typed if w is not None])
    unset = [i for i, e in enumerate(entries) if not _usable(e.weight)]
    remaining = WEIGHT_LIMIT - total

    if unset and remaining > WEIGHT_TOLERANCE:
        share = remaining / len(unset)
        targets = [
            share if i in unset else _as_decimal(entries[i].weight)  # type: ignore[arg-type]
            for i in range(n)
        ]
        kind: SuggestionKind = "fill_blanks"
    elif not unset and remaining > WEIGHT_TOLERANCE:
        share = remaining / n
        targets = [_as_decimal(e.weight) + share for e in entries]  # type: ignore[arg-type]
        kind = "spread_remaining"
    elif unset:
        targets = [WEIGHT_LIMIT / n] * n
        kind = "split_equally"
    elif remaining < -WEIGHT_TOLERANCE:
        targets = [_as_decimal(e.weight) / total for e in entries]  # type: ignore[arg-type]
        kind = "scale_to_limit"
    else:
        return None
    return WeightSuggestion(kind=kind, weights=[float(w) for w in split_exactly(targets, places)])


def weight_budget(
    entries: list[WeightEntry],
    known_keys: set[str],
    index_available: bool,
) -> WeightBudget:
    """Read a list of criteria as a budget against the limit of 1.

    ``known_keys`` is what may be ranked in the study's universe (numeric
    properties, or non-discrete process attributes); ``index_available`` says
    whether the study defines an index, without which the ``__index__`` row has
    nothing to rank by.

    Only positive weights count toward the total: a blank is "not typed yet",
    and zero or a negative number is a weight the ranking refuses — none of
    them is a contribution to the average.
    """
    total = sum((_as_decimal(e.weight) for e in entries if _usable(e.weight)), Decimal(0))

    seen: set[str] = set()
    rows: list[WeightRow] = []
    for position, entry in enumerate(entries):
        issue: WeightIssue | None = None
        key = (entry.key or "").strip() or None
        if key is None:
            issue = "missing_key"
        elif key in seen:
            issue = "duplicate_key"
        elif key == INDEX_KEY:
            if not index_available:
                issue = "index_missing"
        elif key not in known_keys:
            issue = "unknown_key"
        if key is not None:
            seen.add(key)

        if issue is None:
            if entry.weight is None:
                issue = "missing_weight"
            elif entry.weight == 0:
                issue = "zero"
            elif entry.weight < 0:
                issue = "negative"

        share: float | None = None
        if _usable(entry.weight) and total > 0:
            share = float(_as_decimal(entry.weight) / total)  # type: ignore[arg-type]
        rows.append(
            WeightRow(
                position=position,
                key=key,
                weight=entry.weight,
                share=share,
                share_percent=None if share is None else share * 100,
                issue=issue,
            )
        )

    if not entries:
        status: BudgetStatus = "empty"
    elif total > WEIGHT_LIMIT + WEIGHT_TOLERANCE:
        status = "exceeds"
    elif abs(total - WEIGHT_LIMIT) <= WEIGHT_TOLERANCE and all(_usable(e.weight) for e in entries):
        status = "complete"
    else:
        status = "incomplete"

    return WeightBudget(
        limit=float(WEIGHT_LIMIT),
        tolerance=float(WEIGHT_TOLERANCE),
        total=float(total),
        remaining=float(max(WEIGHT_LIMIT - total, Decimal(0))),
        excess=float(max(total - WEIGHT_LIMIT, Decimal(0))),
        status=status,
        rows=rows,
        suggestion=None if status in ("empty", "complete") else _suggest(entries, total),
        # No criteria is a run without a ranking, which is allowed; anything
        # else runs only when the total closes and every row is sound.
        can_run=status == "empty" or (status == "complete" and all(r.issue is None for r in rows)),
    )


__all__ = [
    "INDEX_KEY",
    "MAX_WEIGHT_CRITERIA",
    "WEIGHT_LIMIT",
    "WEIGHT_TOLERANCE",
    "WeightBudget",
    "WeightEntry",
    "WeightRow",
    "WeightSuggestion",
    "split_exactly",
    "weight_budget",
]
