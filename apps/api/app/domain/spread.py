"""How far apart the compared values of one property are (D-128).

The comparison highlights a property when its values differ by more than a
threshold the reader chose. "Differ by more than X %" needs a base, and the
base is a decision: here it is the **largest magnitude among the compared
values**, so ``spread = (max - min) / max(|max|, |min|) * 100``.

Why that base and not "the first material" or "the reference":

* it does not depend on the order of the rows, nor on a reference having been
  chosen — the same selection gives the same answer in every link;
* it is symmetric in the pair (A, B) and B, A, which "relative to the first"
  is not (a 2:1 ratio reads +100 % one way and -50 % the other);
* it is bounded by 100 % for values of one sign, so the threshold has a
  natural range.

Only on a ratio scale (a unit with a true zero): a percentage of a kelvin or a
degree Celsius value says nothing. Everything that is not a number comes back
as a named state, never a blank or a zero (D-24).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

SpreadState = Literal[
    "calculada",
    "escala_sem_zero",  # the unit has no true zero: a ratio means nothing
    "valores_insuficientes",  # fewer than two materials have a value
    "base_zero",  # every value is zero: no base to divide by
]

#: The threshold's accepted range, in percent. Above 1000 % no real selection
#: differs that much on a bounded spread, and a typo should not pass silently.
MIN_THRESHOLD_PCT = 0.0  # exclusive
MAX_THRESHOLD_PCT = 1000.0  # inclusive


def spread_pct(values: Sequence[float], *, ratio_scale: bool) -> tuple[float | None, SpreadState]:
    """The spread of ``values`` in percent of the largest magnitude, or why none."""
    if not ratio_scale:
        return None, "escala_sem_zero"
    if len(values) < 2:
        return None, "valores_insuficientes"
    base = max(abs(v) for v in values)
    if base == 0:
        return None, "base_zero"
    return (max(values) - min(values)) / base * 100.0, "calculada"


def exceeds(value_pct: float | None, threshold_pct: float | None) -> bool | None:
    """Whether ``value_pct`` is strictly above the threshold; ``None`` if either is absent.

    Strict, so a threshold of 10 % does not flag a property that differs by
    exactly 10 %: "more than 10 %" is what the reader asked.
    """
    if value_pct is None or threshold_pct is None:
        return None
    return abs(value_pct) > threshold_pct
