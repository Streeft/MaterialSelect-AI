"""A project's bill of parts: what the chosen materials add up to (D-257).

A table is a top, four legs and a box of nails; each part is its own selection
problem with its own answer. This module adds the parts up, and it is strict
about what it is adding.

**It sums the material phase and nothing else.** For each part it reports the
mass in the finished parts (``massa unitária × quantidade``), and from that mass
the material's catalogued cost, embodied energy and CO₂ footprint of primary
production. It does not know the process, so it does not know the scrap, the
tooling, the transport, the use or the end of life: those are the part-cost
estimator and the Eco Audit (D-65, D-121), which need a process per part. A
total here is therefore "material only, by the mass in the part", and every
surface that prints it says so.

**A missing datum is never a zero (principle 3).** A part with no material, no
mass, or a material that does not carry the property gets ``None`` and the
reason in words. A total that misses any part is **refused**: the part nobody
could compute might be the heaviest one. What is offered instead is the sum of
the parts that do have the datum, named as a partial sum, with the parts left
out listed. This is the Eco Audit's rule for an incomplete audit, applied to a
bill of parts.

Every figure is ``mass [kg] × catalogued value per kg``, with the catalogue's
canonical value (MJ/kg for energy; cost and CO₂ per mass are dimensionless in
the unit system, D-65, and are named in words by the caller).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from app.calculations.eco_audit import CO2_FOOTPRINT, EMBODIED_ENERGY
from app.calculations.part_cost import MATERIAL_COST_SLUG

#: The quantities a part is summed over, in the order they are reported.
MASS = "mass"
MATERIAL_COST = "material_cost"
ENERGY = "embodied_energy"
CARBON = "carbon"
QUANTITIES: tuple[str, ...] = (MASS, MATERIAL_COST, ENERGY, CARBON)

#: The material property each per-mass quantity reads, and its name in a reason.
PROPERTY_OF: dict[str, tuple[str, str]] = {
    MATERIAL_COST: (MATERIAL_COST_SLUG, "custo por massa"),
    ENERGY: (EMBODIED_ENERGY, "energia incorporada"),
    CARBON: (CO2_FOOTPRINT, "pegada de CO₂"),
}

NO_MASS = "Sem massa unitária informada."
NO_MATERIAL = "Sem material escolhido."
MATERIAL_GONE = "O material escolhido não está mais disponível no catálogo."


@dataclass(frozen=True)
class MaterialValue:
    """One catalogued value of the chosen material, with where it came from."""

    value: float
    quality: str


@dataclass(frozen=True)
class PartInput:
    """One part as the reader declared it.

    ``material_name`` is ``None`` when no material was chosen. ``values`` is
    ``None`` when a material *was* chosen but can no longer be read (removed,
    or hidden from this reader) — a different state, with a different reason.
    """

    name: str
    quantity: int
    unit_mass: float | None
    material_name: str | None = None
    values: Mapping[str, MaterialValue] | None = None


@dataclass(frozen=True)
class Figure:
    """A number, or the reason there is none. Never both, never neither."""

    value: float | None = None
    reason: str | None = None
    #: Data quality of the catalogued value used; ``None`` for the declared mass.
    quality: str | None = None


@dataclass(frozen=True)
class PartSummary:
    name: str
    figures: dict[str, Figure]


@dataclass(frozen=True)
class Total:
    """The sum over every part, or its refusal.

    ``value`` is set only when every part has the datum. ``known_sum`` adds the
    parts that do; with ``missing_parts`` empty the two are the same number.
    """

    value: float | None
    known_sum: float
    known_parts: int
    missing_parts: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class AssemblySummary:
    parts: list[PartSummary]
    totals: dict[str, Total]


def _mass(part: PartInput) -> Figure:
    if part.unit_mass is None:
        return Figure(reason=NO_MASS)
    return Figure(value=part.unit_mass * part.quantity)


def _per_mass(part: PartInput, mass: Figure, quantity: str) -> Figure:
    slug, label = PROPERTY_OF[quantity]
    if part.material_name is None:
        return Figure(reason=NO_MATERIAL)
    if part.values is None:
        return Figure(reason=MATERIAL_GONE)
    if mass.value is None:
        return Figure(reason=NO_MASS)
    catalogued = part.values.get(slug)
    if catalogued is None:
        return Figure(reason=f"{part.material_name} não tem {label} cadastrada.")
    return Figure(value=mass.value * catalogued.value, quality=catalogued.quality)


def summarise_part(part: PartInput) -> PartSummary:
    mass = _mass(part)
    figures = {MASS: mass}
    for quantity in (MATERIAL_COST, ENERGY, CARBON):
        figures[quantity] = _per_mass(part, mass, quantity)
    return PartSummary(name=part.name, figures=figures)


def summarise(parts: Sequence[PartInput]) -> AssemblySummary:
    """Each part's figures and the totals over all of them.

    An assembly with no parts has no totals to refuse and none to give: every
    total is ``None`` with nothing missing, and the caller says "sem peças".
    """
    summaries = [summarise_part(part) for part in parts]
    totals: dict[str, Total] = {}
    for quantity in QUANTITIES:
        known = [
            s.figures[quantity].value for s in summaries if s.figures[quantity].value is not None
        ]
        missing = [s.name for s in summaries if s.figures[quantity].value is None]
        known_sum = float(sum(known))
        complete = bool(summaries) and not missing
        totals[quantity] = Total(
            value=known_sum if complete else None,
            known_sum=known_sum,
            known_parts=len(known),
            missing_parts=missing,
        )
    return AssemblySummary(parts=summaries, totals=totals)
