"""Atomic percent derived from a declared mass-percent composition (D-117, TM2-c).

The atomic fraction of element *i* is ``(wᵢ/Aᵢ) / Σⱼ (wⱼ/Aⱼ)``, with ``w`` the
mass percent and ``A`` the standard atomic weight. It is a calculation over the
**whole** composition — every constituent's mass and atomic weight enters the
denominator — which is why D-105 kept it out of the unit layer, and why it is
only defined when the whole is known. Pure and deterministic: no session, no
rounding, no I/O.

When the whole is *not* known, the answer is an absence with its reason, never
an estimate (principle 3):

* an element **declared as the balance** — its content was never computed
  (D-105), so neither is anything that depends on it;
* an element **declared absent** — the source gave no number;
* an element with **no standard atomic weight** (``app.domain.atomic_weights``);
* a declaration that **does not close at 100 %**: the smallest total the
  declared contents admit stays below 100 %, so the difference may be elements
  the source did not list — whose atomic weight nobody knows — or it rises
  above 100 %, which no material can be.

**Closure is strict, and that is a correction of the delegated rule** (D-117).
A composition closes when the minima it admits (``admitted_interval``: the
minimum, the nominal of a nominal-only row, 0 for "≤ máx.") already add up to
100 %, within ``SUM_TOLERANCE`` of rounding. Reading "the maxima can reach
100 %" as closure would assume every unlisted element is 0 %, which D-105 and
principle 3 forbid ("an element the composition does not list is unknown"). The
condition is ``closes`` — one place, if the author decides otherwise.

**Ranges convert by reach, never by a chosen point.** Each row admits an
interval; the derived atomic percent of an element is the interval of values
it takes over every composition that conforms to all rows *and* sums to the
closed total. Its ends are exact (the problem is linear-fractional, so the
optimum sits on a vertex, found greedily below) and no midpoint is invented.
With strict closure the slack is at most the rounding tolerance, so most
derived ranges are narrow; a nominal-only composition gives a point.
"""

from __future__ import annotations

import enum
from collections.abc import Sequence
from dataclasses import dataclass

from app.domain.atomic_weights import TABLE_VERSION, atomic_weight
from app.domain.composition import EntryFacts, admitted_interval

#: How far from 100 % a declared total may sit and still be read as closed:
#: rounding of the source (five elements written to 0.01 % stray by 0.025 %).
#: Within it, the formula's denominator — the definition of an atomic
#: fraction, not a rescaling of the mass — absorbs the difference.
SUM_TOLERANCE = 0.05

#: The label every derived number carries, on the wire and on the sheet.
DERIVED_LABEL = "derivada"


class AtomicAbsentReason(str, enum.Enum):
    """Why the atomic percent of a composition cannot be derived."""

    SEM_COMPOSICAO = "sem_composicao"
    RESTO_DECLARADO = "resto_declarado"
    DECLARADO_AUSENTE = "declarado_ausente"
    SEM_MASSA_ATOMICA = "sem_massa_atomica"
    SOMA_INCOMPLETA = "soma_incompleta"
    SOMA_ACIMA_DE_100 = "soma_acima_de_100"


@dataclass(frozen=True)
class AtomicRow:
    """One element's derived atomic percent, as the interval its mass range reaches."""

    element: str
    atomic_min: float
    atomic_max: float


@dataclass(frozen=True)
class AtomicComposition:
    """The derived atomic percent of one composition, or why there is none.

    ``rows`` is empty exactly when ``reason`` is set: a composition is derived
    whole or not at all, because one unknown constituent changes every
    element's fraction.
    """

    rows: tuple[AtomicRow, ...] = ()
    reason: AtomicAbsentReason | None = None
    #: The reason as a sentence in Portuguese, naming the element or the sum.
    message: str | None = None
    #: Which atomic-weight table produced the numbers.
    basis: str = TABLE_VERSION

    @property
    def is_derived(self) -> bool:
        return self.reason is None


def _pt(value: float) -> str:
    return f"{value:.6g}".replace(".", ",")


def _absent(reason: AtomicAbsentReason, message: str) -> AtomicComposition:
    return AtomicComposition(reason=reason, message=message)


def closes(sum_low: float) -> bool:
    """Does the declaration account for the whole material? (strict, see module doc)."""
    return abs(sum_low - 100.0) <= SUM_TOLERANCE


def _moles(masses: dict[str, float], weights: dict[str, float]) -> float:
    return sum(masses[symbol] / weights[symbol] for symbol in masses)


def _fill(
    start: dict[str, float],
    ceiling: dict[str, float],
    extra: float,
    order: list[str],
) -> dict[str, float]:
    """Add ``extra`` mass to ``start``, element by element in ``order``, up to each ceiling."""
    out = dict(start)
    for symbol in order:
        if extra <= 0.0:
            break
        room = ceiling[symbol] - out[symbol]
        take = min(room, extra)
        out[symbol] += take
        extra -= take
    return out


def _reach(
    symbol: str,
    bounds: dict[str, tuple[float, float]],
    weights: dict[str, float],
    total: float,
) -> tuple[float, float]:
    """The interval of atomic percent ``symbol`` takes over every conforming composition.

    The fraction grows with the element's own mass and shrinks with the moles of
    the others, so its maximum puts as much mass as the others' minima allow on
    the element and the rest on the *heaviest* others (fewest moles), and its
    minimum the reverse. Ties break on the symbol, so the answer is
    deterministic.
    """
    others = [s for s in bounds if s != symbol]
    low = {s: bounds[s][0] for s in others}
    high = {s: bounds[s][1] for s in others}
    lo_i, hi_i = bounds[symbol]
    heaviest_first = sorted(others, key=lambda s: (-weights[s], s))
    lightest_first = sorted(others, key=lambda s: (weights[s], s))

    def fraction(mass_i: float, masses: dict[str, float]) -> float:
        own = mass_i / weights[symbol]
        if own == 0.0:
            return 0.0
        return 100.0 * own / (own + _moles(masses, weights))

    sum_low_others = sum(low.values())
    sum_high_others = sum(high.values())

    w_max = max(lo_i, min(hi_i, total - sum_low_others))
    rest = _fill(low, high, total - w_max - sum_low_others, heaviest_first)
    top = fraction(w_max, rest)

    w_min = min(hi_i, max(lo_i, total - sum_high_others))
    rest = _fill(low, high, total - w_min - sum_low_others, lightest_first)
    bottom = fraction(w_min, rest)
    return min(bottom, top), max(bottom, top)


def derive_atomic_percent(entries: Sequence[tuple[str, EntryFacts]]) -> AtomicComposition:
    """The atomic percent of one composition (one material, one condition).

    ``entries`` are (element symbol, stored row) in the source's order; the
    output keeps that order. See the module docstring for when the answer is an
    absence instead.
    """
    if not entries:
        return _absent(AtomicAbsentReason.SEM_COMPOSICAO, "Sem composição cadastrada.")
    for symbol, facts in entries:
        if facts.is_balance:
            return _absent(
                AtomicAbsentReason.RESTO_DECLARADO,
                f"{symbol} é declarado como resto, e o resto nunca é calculado: sem o teor "
                "de cada constituinte, a fração atômica de nenhum deles é conhecida.",
            )
    for symbol, facts in entries:
        if facts.is_missing:
            return _absent(
                AtomicAbsentReason.DECLARADO_AUSENTE,
                f"O teor de {symbol} é declarado ausente pela fonte: sem ele, a fração "
                "atômica de nenhum elemento é conhecida.",
            )
    weights: dict[str, float] = {}
    for symbol, _facts in entries:
        weight = atomic_weight(symbol)
        if weight is None:
            return _absent(
                AtomicAbsentReason.SEM_MASSA_ATOMICA,
                f"{symbol} não tem peso atômico padrão na tabela da IUPAC: nenhum valor "
                "é estimado no lugar dele.",
            )
        weights[symbol] = weight

    bounds = {symbol: admitted_interval(facts) for symbol, facts in entries}
    sum_low = sum(lo for lo, _hi in bounds.values())
    sum_high = sum(hi for _lo, hi in bounds.values())
    if sum_low > 100.0 + SUM_TOLERANCE:
        return _absent(
            AtomicAbsentReason.SOMA_ACIMA_DE_100,
            f"Os teores declarados somam pelo menos {_pt(sum_low)} %, acima de 100 %.",
        )
    if not closes(sum_low):
        return _absent(
            AtomicAbsentReason.SOMA_INCOMPLETA,
            f"Os teores declarados somam no mínimo {_pt(sum_low)} %: o que falta para "
            "100 % pode ser de elementos que a fonte não listou, de massa atômica "
            "desconhecida. A soma não é completada nem renormalizada.",
        )
    # Closed. The total the conforming compositions add up to: 100 % when the
    # declaration admits it, else the nearest total it admits (within rounding).
    total = min(max(100.0, sum_low), sum_high)
    rows = []
    for symbol, _facts in entries:
        low, high = _reach(symbol, bounds, weights, total)
        rows.append(AtomicRow(element=symbol, atomic_min=low, atomic_max=high))
    return AtomicComposition(rows=tuple(rows))
