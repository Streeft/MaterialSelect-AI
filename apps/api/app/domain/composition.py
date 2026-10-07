"""Chemical composition: how a row is built, and how a search condition reads it (D-105).

A composition is a list of elements, each with what the source said about its
mass fraction: a range ``[mín., máx.]``, only a maximum ("C ≤ 0,08"), only a
minimum ("Cu ≥ 99,9"), a nominal value, or one of two states that carry no
number at all — **balance** ("Fe: resto") and **declared absent**.

Three rules the rest of the system relies on, all enforced here:

1. **Balance is declared, never computed.** ``100 − Σ`` would be a number the
   source never wrote, inheriting every rounding and every element it did not
   list. A balance row has no numeric field, by construction and by ``CHECK``.
2. **Absence is absence (D-24, principle 3).** A material with no composition
   row is not "0 % of everything", and an element a composition does not list
   is not 0 % either: standards list the elements they control. A search over
   such a material is *undetermined* — it does not pass, under ``NOT`` neither —
   and the response counts it.
3. **A range is read by reach.** See ``admitted_interval`` and ``evaluate``.

Everything here is pure: no session, no SQL. The repository asks this module
for a verdict per material and compiles only the answer.
"""

from __future__ import annotations

import enum
import math
import re
from collections.abc import Iterable
from dataclasses import dataclass

from app.calculations.units import UnitError, to_canonical
from app.domain.elements import Element, element_for

#: Composition is stored as mass percent. "percent" is Pint's name for 1/100.
CANONICAL_UNIT = "percent"

#: The units a composition may be written in, as a source writes them, mapped to
#: the Pint unit the conversion uses. The basis is **mass**; atomic percent is
#: not accepted, because turning it into mass percent needs every other
#: element's fraction and atomic mass — a calculation over the whole row, not a
#: unit conversion (D-105, out of scope).
UNIT_ALIASES: dict[str, str] = {
    "%": "percent",
    "percent": "percent",
    "wt%": "percent",
    "wt.%": "percent",
    "% massa": "percent",
    "% (massa)": "percent",
    "%m": "percent",
    "ppm": "ppm",
    "ppm (massa)": "ppm",
    "fração mássica": "dimensionless",
    "dimensionless": "dimensionless",
}


class CompositionError(ValueError):
    """A composition row or condition that cannot be used. Message in Portuguese."""


def resolve_element(raw: str) -> Element:
    element = element_for(raw)
    if element is None:
        raise CompositionError(f"'{raw.strip()}' não é símbolo de elemento químico.")
    return element


@dataclass(frozen=True)
class NormalizedComposition:
    """One row, ready to be written: original values kept, canonical ones added.

    ``value_*`` are what the source wrote, in ``original_unit``;
    ``normalized_*`` are mass percent. Every numeric field is ``None`` for a
    balance or a declared-absent row — never 0.
    """

    element: str
    is_balance: bool = False
    is_missing: bool = False
    value_min: float | None = None
    value_max: float | None = None
    value_nominal: float | None = None
    original_unit: str | None = None
    normalized_min: float | None = None
    normalized_max: float | None = None
    normalized_nominal: float | None = None
    canonical_unit: str | None = None
    conversion_method: str | None = None


def _convert(value: float, unit: str) -> tuple[float, str]:
    pint_unit = UNIT_ALIASES.get(unit.strip().casefold())
    if pint_unit is None:
        accepted = ", ".join(sorted(UNIT_ALIASES))
        raise CompositionError(
            f"Unidade de composição não aceita: '{unit}'. Use uma de: {accepted} (base mássica)."
        )
    try:
        return to_canonical(value, pint_unit, CANONICAL_UNIT)
    except UnitError as exc:  # pragma: no cover - the aliases are all convertible
        raise CompositionError(str(exc)) from exc


def build_composition_entry(
    element: str,
    *,
    value_min: float | None = None,
    value_max: float | None = None,
    value_nominal: float | None = None,
    unit: str | None = None,
    is_balance: bool = False,
    is_missing: bool = False,
) -> NormalizedComposition:
    """Validate one row and convert its numbers to mass percent.

    Raises ``CompositionError`` for an unknown element, a balance or absent row
    that carries a number, a numeric row with no number, an inverted range, a
    nominal outside its range, or a value outside 0–100 %.
    """
    symbol = resolve_element(element).symbol
    numbers = (value_min, value_max, value_nominal)
    if is_balance and is_missing:
        raise CompositionError(
            f"{symbol}: um elemento não pode ser resto e ausente ao mesmo tempo."
        )
    if is_balance or is_missing:
        if any(n is not None for n in numbers):
            state = "resto" if is_balance else "ausente"
            raise CompositionError(
                f"{symbol}: um elemento declarado {state} não carrega número — "
                "o resto nunca é calculado e a ausência nunca vira zero."
            )
        return NormalizedComposition(element=symbol, is_balance=is_balance, is_missing=is_missing)

    if all(n is None for n in numbers):
        raise CompositionError(
            f"{symbol}: informe mínimo, máximo ou valor nominal — ou declare o elemento "
            "como resto ou ausente."
        )
    if unit is None or not unit.strip():
        raise CompositionError(f"{symbol}: falta a unidade da composição.")
    for n in numbers:
        if n is not None and not math.isfinite(n):
            raise CompositionError(f"{symbol}: valor não finito não é permitido.")

    converted: dict[str, float | None] = {}
    method: str | None = None
    for name, value in (("min", value_min), ("max", value_max), ("nominal", value_nominal)):
        if value is None:
            converted[name] = None
            continue
        converted[name], method = _convert(value, unit)

    low, high, nominal = converted["min"], converted["max"], converted["nominal"]
    for value in (low, high, nominal):
        if value is not None and not (0.0 <= value <= 100.0):
            raise CompositionError(f"{symbol}: teor fora de 0–100 % em massa.")
    if low is not None and high is not None and low > high:
        raise CompositionError(f"{symbol}: faixa invertida (mínimo maior que máximo).")
    if nominal is not None and (
        (low is not None and nominal < low) or (high is not None and nominal > high)
    ):
        raise CompositionError(f"{symbol}: valor nominal fora da faixa declarada.")

    return NormalizedComposition(
        element=symbol,
        value_min=value_min,
        value_max=value_max,
        value_nominal=value_nominal,
        original_unit=unit,
        normalized_min=low,
        normalized_max=high,
        normalized_nominal=nominal,
        canonical_unit=CANONICAL_UNIT,
        conversion_method=method,
    )


def validate_composition(entries: Iterable[NormalizedComposition]) -> None:
    """Rules over a material's whole composition, not over one row.

    One row per element (two would make a search depend on row order), at most
    one balance (two "the rest" are a contradiction), and the declared minima
    cannot add up past 100 % — a specification no heat could meet. The last is
    a consistency check on what was written, not a balance computation: nothing
    is stored from it.
    """
    seen: set[str] = set()
    balances = 0
    minima = 0.0
    for entry in entries:
        if entry.element in seen:
            raise CompositionError(f"{entry.element} aparece mais de uma vez na composição.")
        seen.add(entry.element)
        balances += int(entry.is_balance)
        if entry.normalized_min is not None:
            minima += entry.normalized_min
    if balances > 1:
        raise CompositionError("Só um elemento pode ser declarado como resto.")
    if minima > 100.0 + 1e-9:
        raise CompositionError("Os teores mínimos declarados somam mais de 100 %.")


# --- search -------------------------------------------------------------------


class Comparison(str, enum.Enum):
    """What a ``comp:`` condition asks of an element's declared content."""

    CONTAINS = "contains"
    GE = ">="
    GT = ">"
    LE = "<="
    LT = "<"
    EQ = "="
    BETWEEN = "between"


@dataclass(frozen=True)
class CompositionCondition:
    """One ``comp:`` atom of a query, already validated.

    ``low``/``high`` hold the number(s) the reader typed, in mass percent:
    ``low`` for ``>=``/``>``/``=``, ``high`` for ``<=``/``<``, both for a range.
    """

    element: str
    comparison: Comparison
    low: float | None = None
    high: float | None = None

    def label(self) -> str:
        """The condition in words, as the response and the screen state it."""
        symbol = self.element
        if self.comparison is Comparison.CONTAINS:
            return f"contém {symbol}"
        if self.comparison is Comparison.BETWEEN:
            return f"{symbol} entre {_pt(self.low)} e {_pt(self.high)} %"
        sign = {
            Comparison.GE: "≥",
            Comparison.GT: ">",
            Comparison.LE: "≤",
            Comparison.LT: "<",
            Comparison.EQ: "=",
        }[self.comparison]
        number = self.high if self.comparison in (Comparison.LE, Comparison.LT) else self.low
        return f"{symbol} {sign} {_pt(number)} %"


def _pt(value: float | None) -> str:
    if value is None:  # pragma: no cover - a validated condition always has its numbers
        return "?"
    text = f"{value:.6g}"
    return text.replace(".", ",")


_NUMBER = r"\d+(?:[.,]\d+)?"
_CONDITION = re.compile(
    rf"""^(?P<element>[A-Za-z]{{1,3}})
        (?:
            (?P<op>>=|<=|≥|≤|>|<|=)(?P<value>{_NUMBER})%?
          | :(?P<low>{_NUMBER})%?\s*[-–]\s*(?P<high>{_NUMBER})%?
        )?$""",
    re.VERBOSE,
)

_OPERATORS = {
    ">=": Comparison.GE,
    "≥": Comparison.GE,
    ">": Comparison.GT,
    "<=": Comparison.LE,
    "≤": Comparison.LE,
    "<": Comparison.LT,
    "=": Comparison.EQ,
}


def _number(text: str) -> float:
    return float(text.replace(",", "."))


def parse_condition(text: str) -> CompositionCondition:
    """Parse what follows ``comp:`` — ``Cr``, ``Cr>=12``, ``C<=0,08``, ``Ni:8-10``.

    The number is mass percent; a trailing ``%`` is accepted and changes
    nothing. A decimal comma is accepted, as everywhere a reader types a number
    in this application (D-30).
    """
    raw = text.strip()
    if not raw:
        raise CompositionError("'comp:' precisa de um elemento — por exemplo, comp:Cr>=12.")
    match = _CONDITION.match(raw)
    if match is None:
        raise CompositionError(
            f"Não entendi a condição de composição '{raw}'. Use comp:Cr (contém), "
            "comp:Cr>=12, comp:C<=0,08 ou comp:Ni:8-10 (faixa), sem espaços."
        )
    symbol = resolve_element(match.group("element")).symbol
    if match.group("op"):
        value = _number(match.group("value"))
        _check_percent(value)
        comparison = _OPERATORS[match.group("op")]
        if comparison in (Comparison.LE, Comparison.LT):
            return CompositionCondition(symbol, comparison, high=value)
        return CompositionCondition(symbol, comparison, low=value)
    if match.group("low"):
        low, high = _number(match.group("low")), _number(match.group("high"))
        _check_percent(low)
        _check_percent(high)
        if low > high:
            raise CompositionError(
                f"Faixa invertida em '{raw}': o primeiro número tem de ser o menor."
            )
        return CompositionCondition(symbol, Comparison.BETWEEN, low=low, high=high)
    return CompositionCondition(symbol, Comparison.CONTAINS)


def _check_percent(value: float) -> None:
    if not 0.0 <= value <= 100.0:
        raise CompositionError("Um teor em massa vai de 0 a 100 %.")


class UndeterminedReason(str, enum.Enum):
    """Why a condition could not be decided for a material — each one a sentence."""

    SEM_COMPOSICAO = "sem_composicao"
    ELEMENTO_NAO_DECLARADO = "elemento_nao_declarado"
    DECLARADO_AUSENTE = "declarado_ausente"
    RESTO_SEM_NUMERO = "resto_sem_numero"


@dataclass(frozen=True)
class EntryFacts:
    """What the evaluator reads from one stored row — canonical numbers only."""

    is_balance: bool
    is_missing: bool
    normalized_min: float | None
    normalized_max: float | None
    normalized_nominal: float | None


@dataclass(frozen=True)
class Verdict:
    """``True``/``False`` when the data decides; ``None`` (with the reason) when it cannot."""

    value: bool | None
    reason: UndeterminedReason | None = None


def admitted_interval(entry: EntryFacts) -> tuple[float, float]:
    """The contents a declared specification admits, in mass percent.

    A range admits ``[mín., máx.]``. "≤ máx." admits ``[0, máx.]`` — that is
    what a maximum in a standard *means*: any content up to it conforms,
    including none. "≥ mín." admits ``[mín., 100]``. A nominal value alone
    admits the point. When a range is given, the nominal does not narrow it:
    the range is what conformity is judged against, and the nominal is only its
    representative point (the D-59 split between envelope and point).

    Only for a numeric row; balance and absent rows have no interval.
    """
    low, high, nominal = entry.normalized_min, entry.normalized_max, entry.normalized_nominal
    if low is not None:
        lo = low
    elif high is not None:
        lo = 0.0
    else:
        assert nominal is not None
        lo = nominal
    if high is not None:
        hi = high
    elif low is not None:
        hi = 100.0
    else:
        assert nominal is not None
        hi = nominal
    return lo, hi


def evaluate(
    condition: CompositionCondition, entry: EntryFacts | None, *, has_composition: bool
) -> Verdict:
    """Does this material's declared composition satisfy the condition?

    **By reach**: a range satisfies ``≥ x`` when its maximum reaches ``x`` — some
    conforming heat has that much. The false side is therefore the strong one:
    ``NOT comp:Cr<12`` is "no conforming heat has less than 12 %", which is how
    a reader asks for a guarantee. ``comp:Fe`` (contains) is ``> 0`` by reach,
    and a balance row contains its element by definition.

    A balance row cannot be compared with a number (it has none), an absent row
    states that the source gave none, and an element the composition does not
    list is unknown, not zero: all three are *undetermined*, as is a material
    with no composition at all.
    """
    if entry is None:
        reason = (
            UndeterminedReason.ELEMENTO_NAO_DECLARADO
            if has_composition
            else UndeterminedReason.SEM_COMPOSICAO
        )
        return Verdict(None, reason)
    if entry.is_missing:
        return Verdict(None, UndeterminedReason.DECLARADO_AUSENTE)
    if entry.is_balance:
        if condition.comparison is Comparison.CONTAINS:
            return Verdict(True)
        return Verdict(None, UndeterminedReason.RESTO_SEM_NUMERO)

    lo, hi = admitted_interval(entry)
    match condition.comparison:
        case Comparison.CONTAINS:
            return Verdict(hi > 0.0)
        case Comparison.GE:
            assert condition.low is not None
            return Verdict(hi >= condition.low)
        case Comparison.GT:
            assert condition.low is not None
            return Verdict(hi > condition.low)
        case Comparison.LE:
            assert condition.high is not None
            return Verdict(lo <= condition.high)
        case Comparison.LT:
            assert condition.high is not None
            return Verdict(lo < condition.high)
        case Comparison.EQ:
            assert condition.low is not None
            return Verdict(lo <= condition.low <= hi)
        case Comparison.BETWEEN:
            assert condition.low is not None and condition.high is not None
            return Verdict(lo <= condition.high and hi >= condition.low)
    raise AssertionError(condition.comparison)  # pragma: no cover


#: The rule, in the words the response and the screen use. One string, so the
#: documents and the catalogue cannot describe two different rules.
RULE_TEXT = (
    "Composição por alcance da faixa: uma faixa atende 'Cr ≥ 12 %' quando o máximo "
    "declarado chega a 12 %. Faixa só com máximo começa em 0 %; só com mínimo vai até "
    "100 %. Para exigir que toda a faixa atenda, negue o complemento: NOT comp:Cr<12. "
    "Sem o dado — sem composição cadastrada, elemento não declarado, declarado ausente "
    "ou declarado como resto, que nunca é calculado — o material não passa, nem sob NOT."
)
