"""Ordered label scales of ordinal material properties (D-126). Pure logic.

An ordinal datum is a level on a declared scale, worst first: *Muito pobre <
Pobre < Aceitável < Bom < Excelente*. The only arithmetic it admits is
comparing positions, and that comparison lives here so the selection engine,
the seed and the importer cannot disagree about what "at least Aceitável" is.

What this module refuses on purpose:

* **no magnitude** — a level is not a number, so nothing here returns one for
  ranking or an index expression;
* **no default level** — an absent datum has no rank, and ``meets_minimum``
  answers ``False`` for it. It is never read as the worst level: "sem dado" and
  "Muito pobre" are different statements.
"""

from __future__ import annotations

from collections.abc import Sequence

#: A scale needs at least two levels to have an order to compare by.
MIN_LEVELS = 2
#: Bounded like every list input; a durability scale has five.
MAX_LEVELS = 12
MAX_LABEL_LENGTH = 80


class OrdinalScaleError(ValueError):
    """A scale or a level that cannot be read as written."""


def validate_scale(labels: Sequence[str]) -> tuple[str, ...]:
    """Return the scale as stored: trimmed labels, worst first.

    Refuses blanks, duplicates (also ignoring case — "Bom" and "bom" would be
    two spellings of one level), and a scale too short to order anything.
    """
    cleaned = tuple(str(label).strip() for label in labels)
    if len(cleaned) < MIN_LEVELS:
        raise OrdinalScaleError(f"Uma escala ordinal precisa de ao menos {MIN_LEVELS} níveis.")
    if len(cleaned) > MAX_LEVELS:
        raise OrdinalScaleError(f"Uma escala ordinal tem no máximo {MAX_LEVELS} níveis.")
    if any(not label for label in cleaned):
        raise OrdinalScaleError("Nível de escala em branco.")
    if any(len(label) > MAX_LABEL_LENGTH for label in cleaned):
        raise OrdinalScaleError(f"Rótulo de nível com mais de {MAX_LABEL_LENGTH} caracteres.")
    folded = [label.casefold() for label in cleaned]
    if len(set(folded)) != len(folded):
        raise OrdinalScaleError("Nível repetido na escala: cada nível é escrito uma vez.")
    return cleaned


def level_rank(scale: Sequence[str], label: str) -> int:
    """The position of ``label`` on ``scale`` (0 = worst); refuses an unknown one.

    Exact match on the stored spelling: the vocabulary is closed, and a label
    outside it is a typo to report, never a level to guess.
    """
    try:
        return list(scale).index(label)
    except ValueError:
        raise OrdinalScaleError(
            f"Nível desconhecido: '{label}'. A escala é {describe_scale(scale)}."
        ) from None


def meets_minimum(rank: int | None, minimum_rank: int) -> bool:
    """True when a held level is at least the minimum accepted one.

    ``rank`` is ``None`` when the record holds no level (absent, or recorded as
    missing). That is **never** a pass, and it is not a fail *by being the
    worst level* either — it fails because nothing can be compared.
    """
    if rank is None:
        return False
    return rank >= minimum_rank


def describe_scale(scale: Sequence[str]) -> str:
    """The scale as the reader sees it: ``Muito pobre < Pobre < … < Excelente``."""
    return " < ".join(scale)
