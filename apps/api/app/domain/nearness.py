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
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from app.domain.errors import ValidationError

#: One candidate's raw values: (id, name, {property slug: canonical value | None}).
RecordValues = tuple[int, str, dict[str, float | None]]


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

    Raises:
        ValidationError: empty basis, unknown reference, or a reference that
            lacks a basis property.
    """
    if not basis:
        raise ValidationError("Informe ao menos uma propriedade para comparar.")
    if limit < 1:
        raise ValidationError("O número de semelhantes precisa ser ao menos 1.")

    by_id = {record_id: (name, values) for record_id, name, values in records}
    if reference_id not in by_id:
        raise ValidationError(f"Registro de referência não encontrado: {reference_id}")

    reference_name, reference_values = by_id[reference_id]
    reference_missing = [slug for slug in basis if reference_values.get(slug) is None]
    if reference_missing:
        raise ValidationError(
            "O registro de referência não tem valor para: " + ", ".join(reference_missing)
        )

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
            reference_id=reference_id, basis=list(basis), neighbours=[], excluded=excluded
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

    neighbours: list[Neighbour] = []
    for record_id, name, _ in comparable:
        contributions = {
            slug: (scaled[slug][record_id] - scaled[slug][reference_id]) ** 2 for slug in basis
        }
        # The mean and not the sum: a distance over three properties has to be
        # readable beside one over six, and a sum would make the wider basis
        # look further away for having answered more.
        distance = math.sqrt(sum(contributions.values()) / len(basis))
        neighbours.append(
            Neighbour(
                record_id=record_id,
                name=name,
                distance=distance,
                rank=0,
                contributions=contributions,
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
    )
