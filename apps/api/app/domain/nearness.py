"""Find Similar: which records sit nearest to a reference, and on what basis (P2).

Pure domain logic, like ``ranking.py`` — and it borrows that module's contract
deliberately rather than inventing a second one: a record that lacks a value the
question needs is **excluded and reported**, never quietly compared on less.

Three decisions carry the whole module, and each is a methodology choice rather
than an implementation detail.

**The basis is all-or-nothing.** When a reader asks "what is similar to this, in
these five respects", a record missing one of the five cannot answer in that
respect. Ranking it beside a record that has all five would be comparing two
different questions and presenting the answers in one list. So a candidate must
carry every property of the basis; the rest come back in ``excluded`` with the
slugs they lack, which is what lets a screen say "3 materials left out: no
modulus" instead of showing a shorter list for no visible reason.

**Distance is measured in log space where the property allows it.** Material
properties span orders of magnitude — density runs from ~10 to ~20000, modulus
from ~1e6 to ~1e12 — and on a linear axis the widest-ranging property would
decide every comparison on its own. That is the same reason an Ashby map is
drawn log-log, and ``PropertyDefinition.allows_log_scale`` is the same flag the
charts already read, so a figure and a similarity cannot disagree about which
space a property lives in. A non-positive value has no logarithm, so the
property falls back to linear for **every** record in that run (never per
record, which would put two coordinates on one axis) and the fallback is
reported.

**Each property is scaled by the spread of the pool, then averaged — not
summed.** Dividing by ``max - min`` over the candidates makes the coordinate
dimensionless, so "500 kg/m³ apart" and "10 GPa apart" become comparable; and
averaging the squared differences rather than summing them keeps a distance on
three properties on the same footing as one on six. A property whose pool has no
spread at all carries no information: it contributes zero and is named in
``degenerate``, because silently dropping it would make the basis in the
document larger than the basis that ran.

**Nearness settings: weight and one-sided criterion (D-120).** Each property of
the basis may carry a weight (a positive factor, 1 by default) and a criterion:
``both`` (the default — any difference counts), ``at_most`` ("100% if equal or
lower": a candidate below the reference is not penalised) or ``at_least`` ("100%
if equal or higher"). The criterion is applied to the *scaled* difference, after
the axis was chosen; log is monotonic, so "lower" means the same on either axis.
The distance becomes the **weighted** mean of the squared differences — still a
mean, so the default weights reproduce the unweighted distance exactly. A weight
never touches a missing value: absence still excludes the record before any
weighting, so no criterion can turn a missing value into a "100%".

**Percent tolerance: "100% if within ±x%" (D-155).** One optional percentage
``x`` (``0 < x <= MAX_TOLERANCE_PCT``) draws, for each basis property, the band
``reference ± x% of the reference`` on the **canonical** value, bounds included.
A candidate inside the band counts as identical there — that property
contributes zero, as the D-120 criterion does on its accepted side — and is
named in ``within_tolerance``. Outside the band the difference counts in full,
never reduced by the band's width. A percentage only means something on a ratio
scale (``units.is_ratio_scale``), so a property on a scale without a true zero
gets no band and is named in ``tolerance_not_applicable``. Absence still comes
first: a record without the value was excluded before any band was read, so it
can never be "inside" one. Without ``x`` nothing changes.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Literal

from app.domain.errors import ValidationError

#: One candidate's raw values: (id, name, {property slug: canonical value | None}).
RecordValues = tuple[int, str, dict[str, float | None]]

#: How a difference on one property counts (D-120).
Criterion = Literal["both", "at_most", "at_least"]
CRITERIA: tuple[Criterion, ...] = ("both", "at_most", "at_least")

#: Upper bound on a weight. Not a physical limit: a property weighted 1000×
#: would make the basis one property wide while still listing all of them,
#: which is the silent narrowing ``degenerate`` exists to prevent.
MAX_WEIGHT = 10.0

#: Upper bound on the tolerance, in percent. ±100% already spans from zero to
#: twice the reference; a wider band would call nearly everything "identical"
#: and empty the ranking of meaning while still showing one.
MAX_TOLERANCE_PCT = 100.0

#: Relative slack on the band edge, so that a value exactly on ``ref ± x%`` is
#: not pushed outside by the last bit of a float product (inclusive bounds).
_EDGE_REL_TOL = 1e-12


@dataclass
class Neighbour:
    """One record, with how far it sits from the reference and why."""

    record_id: int
    name: str
    #: Dimensionless. 0 means identical on every property of the basis; there is
    #: no upper bound, and the number is only comparable **within one answer**,
    #: because the scaling comes from this pool's own spread.
    distance: float
    rank: int
    #: Per-property scaled difference, squared and un-averaged — what makes a
    #: neighbour's position explainable instead of an oracle's verdict.
    contributions: dict[str, float] = field(default_factory=dict)
    #: Properties where a one-sided criterion absorbed a real difference: the
    #: candidate is on the accepted side, so it counts as "100%" there. Only
    #: ever lists properties the candidate *has* — a missing value is excluded
    #: before any criterion is read.
    satisfied: list[str] = field(default_factory=list)
    #: Basis properties whose value falls inside ``reference ± x%`` (D-155),
    #: in basis order. Empty when no tolerance was asked.
    within_tolerance: list[str] = field(default_factory=list)


@dataclass
class ToleranceBand:
    """The band one basis property ran with, in canonical units, bounds included."""

    low: float
    high: float


@dataclass
class ExcludedRecord:
    """A record that could not be placed on this basis, and what it lacked.

    The same shape ``ranking.ExcludedMaterial`` uses, for the same reason: a
    caller that already renders one exclusion list should not need a second
    reader for this one.
    """

    record_id: int
    name: str
    missing_keys: list[str]


@dataclass
class NearnessResult:
    reference_id: int
    #: The properties the distance actually ran on, in the order asked.
    basis: list[str]
    neighbours: list[Neighbour]
    excluded: list[ExcludedRecord]
    #: Properties of the basis whose pool had no spread: they contributed
    #: nothing, and the reader has to know the basis was effectively smaller.
    degenerate: list[str] = field(default_factory=list)
    #: Properties that asked for log space and were measured linearly anyway,
    #: because some record in the pool had a non-positive value.
    linear_fallback: list[str] = field(default_factory=list)
    #: The weight and criterion each basis property actually ran with, defaults
    #: included — the settings are part of the basis, so they come back with it.
    weights: dict[str, float] = field(default_factory=dict)
    criteria: dict[str, Criterion] = field(default_factory=dict)
    #: The tolerance that ran (D-155), or ``None`` when none was asked.
    tolerance_pct: float | None = None
    #: Per-property band around the reference, for every basis property where a
    #: percentage means something.
    tolerance_bands: dict[str, ToleranceBand] = field(default_factory=dict)
    #: Basis properties on a scale without a true zero: no band was drawn.
    tolerance_not_applicable: list[str] = field(default_factory=list)


def validate_tolerance(tolerance_pct: float | None) -> float | None:
    """The tolerance as a float, or ``None``; anything else is refused (D-155)."""
    if tolerance_pct is None:
        return None
    value = float(tolerance_pct)
    if not math.isfinite(value) or value <= 0 or value > MAX_TOLERANCE_PCT:
        raise ValidationError(
            f"A tolerância precisa ser maior que 0% e no máximo {MAX_TOLERANCE_PCT:g}%."
        )
    return value


def tolerance_band(reference: float, tolerance_pct: float) -> ToleranceBand:
    """``reference ± tolerance_pct%`` of the reference, ordered low to high."""
    half_width = abs(reference) * tolerance_pct / 100.0
    return ToleranceBand(low=reference - half_width, high=reference + half_width)


def is_within(value: float, band: ToleranceBand) -> bool:
    """Whether ``value`` lies in ``band``, both bounds included."""
    if band.low <= value <= band.high:
        return True
    return math.isclose(value, band.low, rel_tol=_EDGE_REL_TOL) or math.isclose(
        value, band.high, rel_tol=_EDGE_REL_TOL
    )


def resolve_settings(
    basis: list[str],
    weights: dict[str, float] | None,
    criteria: dict[str, str] | None,
) -> tuple[dict[str, float], dict[str, Criterion]]:
    """Every basis property's weight and criterion, defaults written out.

    A setting for a property outside the basis is refused rather than ignored:
    it means the reader believes the question includes that property, and the
    answer would silently disagree.
    """
    weights = weights or {}
    criteria = criteria or {}
    stray = sorted((set(weights) | set(criteria)) - set(basis))
    if stray:
        raise ValidationError("Peso ou critério para propriedade fora da base: " + ", ".join(stray))
    resolved_weights: dict[str, float] = {}
    resolved_criteria: dict[str, Criterion] = {}
    for slug in basis:
        weight = float(weights.get(slug, 1.0))
        if not math.isfinite(weight) or weight <= 0 or weight > MAX_WEIGHT:
            raise ValidationError(
                f"Peso de {slug} precisa ser maior que 0 e no máximo {MAX_WEIGHT:g}."
            )
        criterion = criteria.get(slug, "both")
        if criterion not in CRITERIA:
            raise ValidationError(f"Critério desconhecido para {slug}: {criterion}")
        resolved_weights[slug] = weight
        resolved_criteria[slug] = criterion  # type: ignore[assignment]
    return resolved_weights, resolved_criteria


def one_sided_difference(difference: float, criterion: Criterion) -> float:
    """The part of ``candidate - reference`` that the criterion penalises.

    ``at_most`` accepts anything equal or lower; ``at_least`` anything equal or
    higher. The other side keeps its full difference — never a softened one.
    """
    if criterion == "at_most" and difference <= 0:
        return 0.0
    if criterion == "at_least" and difference >= 0:
        return 0.0
    return difference


def _coordinates(values: list[float], use_log: bool) -> tuple[list[float], bool]:
    """The axis a property is measured on, and whether log space survived.

    The decision is taken **once per property per run**, never per record: two
    records measured on different axes are not on one axis at all, and the
    distance between them would be a number with no meaning.
    """
    if use_log and all(v > 0 for v in values):
        return [math.log10(v) for v in values], True
    return list(values), False


def find_similar(
    reference_id: int,
    records: list[RecordValues],
    basis: list[str],
    *,
    log_scale: dict[str, bool] | None = None,
    limit: int = 10,
    weights: dict[str, float] | None = None,
    criteria: dict[str, str] | None = None,
    tolerance_pct: float | None = None,
    ratio_scale: dict[str, bool] | None = None,
) -> NearnessResult:
    """Rank ``records`` by distance from ``reference_id`` over ``basis``.

    Args:
        reference_id: the record everything is measured against. It must be
            present in ``records`` and must itself carry every property of the
            basis — a reference that cannot be placed makes the whole question
            unanswerable, so that is an error rather than an empty result.
        records: the candidate pool, reference included.
        basis: property slugs, in the order the caller asked for them.
        log_scale: per-slug permission to measure in log space. A slug absent
            from the map is measured linearly, which is the conservative
            reading of "nobody said".
        limit: how many neighbours to return. The reference is never one of
            them: distance zero from itself is not an answer to "what else is
            like this".
        weights: per-slug positive factor (default 1), D-120.
        criteria: per-slug ``both`` / ``at_most`` / ``at_least`` (default
            ``both``), D-120.
        tolerance_pct: optional ``x`` of "100% if within ±x%" (D-155).
        ratio_scale: per-slug answer of ``units.is_ratio_scale`` for the
            canonical unit. A slug absent from the map gets no band — the
            conservative reading, which never invents a percentage.

    Raises:
        ValidationError: empty basis, unknown reference, or a reference that
            lacks a basis property.
    """
    if not basis:
        raise ValidationError("Informe ao menos uma propriedade para comparar.")
    if limit < 1:
        raise ValidationError("O número de semelhantes precisa ser ao menos 1.")
    resolved_weights, resolved_criteria = resolve_settings(basis, weights, criteria)
    tolerance = validate_tolerance(tolerance_pct)

    by_id = {record_id: (name, values) for record_id, name, values in records}
    if reference_id not in by_id:
        raise ValidationError(f"Registro de referência não encontrado: {reference_id}")

    reference_name, reference_values = by_id[reference_id]
    reference_missing = [slug for slug in basis if reference_values.get(slug) is None]
    if reference_missing:
        raise ValidationError(
            "O registro de referência não tem valor para: " + ", ".join(reference_missing)
        )

    # The bands depend only on the reference, so they are drawn before the pool
    # is split: the answer states them even when nobody could be compared.
    bands: dict[str, ToleranceBand] = {}
    not_applicable: list[str] = []
    if tolerance is not None:
        ratio = ratio_scale or {}
        for slug in basis:
            if ratio.get(slug, False):
                bands[slug] = tolerance_band(float(reference_values[slug]), tolerance)  # type: ignore[arg-type]
            else:
                not_applicable.append(slug)

    # Split the pool before measuring anything: a candidate missing any basis
    # property is not a distant neighbour, it is an unanswerable comparison.
    comparable: list[RecordValues] = []
    excluded: list[ExcludedRecord] = []
    for record_id, name, values in records:
        if record_id == reference_id:
            continue
        missing = [slug for slug in basis if values.get(slug) is None]
        if missing:
            excluded.append(ExcludedRecord(record_id=record_id, name=name, missing_keys=missing))
        else:
            comparable.append((record_id, name, values))

    if not comparable:
        return NearnessResult(
            reference_id=reference_id,
            basis=list(basis),
            neighbours=[],
            excluded=excluded,
            weights=resolved_weights,
            criteria=resolved_criteria,
            tolerance_pct=tolerance,
            tolerance_bands=bands,
            tolerance_not_applicable=not_applicable,
        )

    permissions = log_scale or {}
    pool_ids = [reference_id] + [record_id for record_id, _, _ in comparable]
    scaled: dict[str, dict[int, float]] = {}
    degenerate: list[str] = []
    linear_fallback: list[str] = []

    for slug in basis:
        raw = [float(by_id[record_id][1][slug]) for record_id in pool_ids]  # type: ignore[arg-type]
        coords, logged = _coordinates(raw, permissions.get(slug, False))
        if permissions.get(slug, False) and not logged:
            linear_fallback.append(slug)

        spread = max(coords) - min(coords)
        if spread == 0:
            # Every record identical on this property: it separates nobody. Zero
            # is the honest contribution, and the name has to reach the reader
            # or the documented basis would be wider than the one that ran.
            degenerate.append(slug)
            scaled[slug] = dict.fromkeys(pool_ids, 0.0)
            continue
        scaled[slug] = {
            record_id: coord / spread for record_id, coord in zip(pool_ids, coords, strict=True)
        }

    total_weight = sum(resolved_weights.values())
    neighbours: list[Neighbour] = []
    for record_id, name, values in comparable:
        contributions: dict[str, float] = {}
        satisfied: list[str] = []
        within: list[str] = []
        for slug in basis:
            raw_difference = scaled[slug][record_id] - scaled[slug][reference_id]
            difference = one_sided_difference(raw_difference, resolved_criteria[slug])
            if raw_difference != 0 and difference == 0:
                satisfied.append(slug)
            band = bands.get(slug)
            if band is not None and is_within(float(values[slug]), band):  # type: ignore[arg-type]
                # "100% if within ±x%": the band absorbs the difference on this
                # property, measured on the canonical value, not the scaled one.
                within.append(slug)
                difference = 0.0
            contributions[slug] = resolved_weights[slug] * difference**2
        # The (weighted) mean and not the sum: a distance over three properties
        # has to be readable beside one over six, and a sum would make the wider
        # basis look further away for having answered more.
        distance = math.sqrt(sum(contributions.values()) / total_weight)
        neighbours.append(
            Neighbour(
                record_id=record_id,
                name=name,
                distance=distance,
                rank=0,
                contributions=contributions,
                satisfied=satisfied,
                within_tolerance=within,
            )
        )

    # Name breaks the tie, so the same catalogue always returns the same order —
    # the determinism the whole methodology rests on.
    neighbours.sort(key=lambda n: (n.distance, n.name))
    for position, neighbour in enumerate(neighbours[:limit], start=1):
        neighbour.rank = position

    return NearnessResult(
        reference_id=reference_id,
        basis=list(basis),
        neighbours=neighbours[:limit],
        excluded=excluded,
        degenerate=degenerate,
        linear_fallback=linear_fallback,
        weights=resolved_weights,
        criteria=resolved_criteria,
        tolerance_pct=tolerance,
        tolerance_bands=bands,
        tolerance_not_applicable=not_applicable,
    )
