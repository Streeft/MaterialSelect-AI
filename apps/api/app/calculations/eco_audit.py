"""Eco Audit: where the energy and the CO₂ of a part actually go.

An eco audit adds up the energy and the carbon of one part over five phases —
**material, manufatura, transporte, uso e fim de vida** — and its answer is not
the total. The answer is **which phase dominates**, because that is the phase
where design effort changes anything. A car door is decided in the use phase; a
plastic bag, in the material phase. Getting the total right and the dominance
wrong would be an audit that reads well and misleads.

Four things carry this module, and none of them is arithmetic.

**1. The use phase has two models, and they are not variants of one.** A fridge
spends energy because it runs (``estatico``: power × time, and the part's mass
does not appear *at all*); a car panel spends energy because something carries
it around (``movel``: mass × distance × intensity). Choose wrong and the audit
inverts: lightweighting saves a great deal in one model and **exactly nothing**
in the other. So the model is a declared choice carrying its own inputs, the
inputs of the other model are **refused rather than ignored** (the rule D-56 set
for selection stages), and the result says which one ran.

**2. The material phase is charged on the mass bought, not the mass in the
part.** A process that scraps a fifth of its feedstock makes the foundry smelt a
fifth more, and that energy was spent whether or not it left in the product. So
``massa comprada = massa / (1 − f)``, the same factorisation D-65 used for the
material term of the part cost — which is also why an eco audit here needs a
process: an audit of a part is an audit of *making* the part.

**3. Recycling appears twice and never cancels.** It is energy **spent** at the
end of this life (the ``reciclagem`` route) and energy **saved** at the start of
the next one (the recycled content of whoever buys the material). Netting a
recycling credit against this part's total is a methodological choice that
standards make differently, so this module does not make it: it reports the
route's own energy and leaves the credit where it belongs, in the next audit's
material phase.

**4. An incomplete audit cannot be summarised, only listed.** If any phase is
missing a datum, the dominant phase is **refused with the reason written**,
because the phase nobody could compute might be the one that dominates. This is
principle 3 applied to a summary statistic rather than to a cell, and it is the
one refusal in this module that a reader will meet often — an end-of-life
route whose factor the material does not carry is unavailable, and an audit
routed to it gets its phases and no podium. That is the intended behaviour: a
podium built on four of five numbers is worse than no podium.

**A product is a list of components and a list of legs (D-121).** Material,
manufatura and fim de vida are computed per component and summed; transport is
the whole product's mass along every leg; use is the product's. A phase absent
in *any* component or leg is absent for the product, with the component named,
so the refusal above applies unchanged. ``audit`` is ``audit_product`` with a
list of one — the two entry points cannot disagree.

**Energy is audited by Pint; carbon is audited by declaration.** Megajoules per
kilogram is a dimension the unit system knows, so every energy figure here is
derived the way D-64 derives a mass. A CO₂ footprint is kilograms of one
substance per kilogram of another, and Pint has no notion of substance — so it
reduces to dimensionless, exactly as ``custo_massa`` does for money, and for the
same kind of reason. The catalogue therefore treats it the same way (D-65) and
every surface says "kg de CO₂" in words rather than pretending the unit system
said it.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, field

from app.calculations.part_cost import HOURS_PER_YEAR
from app.calculations.units import to_canonical

#: Material properties the audit reads, by slug.
EMBODIED_ENERGY = "energia_incorporada"
CO2_FOOTPRINT = "pegada_co2"
RECYCLE_ENERGY = "energia_reciclagem"
RECYCLE_CO2 = "co2_reciclagem"

#: Process attributes the audit reads, by slug.
PROCESS_ENERGY = "energia-processo"
PROCESS_CO2 = "co2-processo"
#: Shared with the part cost estimator: the same fraction, read for a different
#: reason — there it decides what the foundry bills, here what it smelted.
SCRAP_FRACTION = "fracao-refugo"

#: Absences that are not a catalogue slug: the transport mode's two intensities
#: and the brief's own carbon-per-energy. Named all the same, because "why is
#: this cell empty" has to have an answer whatever the answer's shape (D-24).
TRANSPORT_ENERGY_KEY = "intensidade-energia-do-modal"
TRANSPORT_CARBON_KEY = "intensidade-carbono-do-modal"
CARBON_PER_ENERGY_KEY = "carbono-por-energia-em-servico"

#: The five phases, in the order a part lives them. The order is the reading
#: order of the answer and never sorted by magnitude: a reader compares phases
#: against a life they already know, not against a ranking.
MATERIAL = "material"
MANUFATURA = "manufatura"
TRANSPORTE = "transporte"
USO = "uso"
FIM_DE_VIDA = "fim-de-vida"
PHASES = (MATERIAL, MANUFATURA, TRANSPORTE, USO, FIM_DE_VIDA)

PHASE_LABELS = {
    MATERIAL: "Material",
    MANUFATURA: "Manufatura",
    TRANSPORTE: "Transporte",
    USO: "Uso",
    FIM_DE_VIDA: "Fim de vida",
}

#: The two use-phase models. See the module docstring: they are not variants.
USE_STATIC = "estatico"
USE_MOBILE = "movel"
USE_MODELS = (USE_STATIC, USE_MOBILE)

#: End-of-life routes (D-121). Seven, in the order a designer weighs them from
#: "throw away" to "keep using" — the vocabulary of the textbook method, which
#: is a list of *names*: the route says what happens, never what it costs. What
#: it costs is a **material property read from the catalogue** by the slug the
#: route names, exactly as ``reciclagem`` has always read ``energia_reciclagem``.
#: No factor lives in this file. A route whose property the material does not
#: carry is **unavailable with the reason written** and never free: a landfill
#: that costs zero would make burying a part look like the cheapest thing a
#: designer can do with it.
EOL_LANDFILL = "aterro"
EOL_INCINERATION = "incineracao"
EOL_DOWNCYCLE = "subciclagem"
EOL_RECYCLE = "reciclagem"
EOL_REMANUFACTURE = "remanufatura"
EOL_REUSE = "reuso"
EOL_NONE = "nenhum"
EOL_ROUTES = (
    EOL_LANDFILL,
    EOL_INCINERATION,
    EOL_DOWNCYCLE,
    EOL_RECYCLE,
    EOL_REMANUFACTURE,
    EOL_REUSE,
    EOL_NONE,
)


@dataclass(frozen=True)
class EndOfLifeRoute:
    """One route: its name, and the two catalogue slugs that would price it.

    ``energy_slug``/``carbon_slug`` are ``None`` only for ``nenhum``, the route
    that by definition has nothing to read.
    """

    slug: str
    label: str
    energy_slug: str | None
    carbon_slug: str | None
    description: str


EOL_ROUTE_TABLE: dict[str, EndOfLifeRoute] = {
    EOL_LANDFILL: EndOfLifeRoute(
        EOL_LANDFILL,
        "Aterro",
        "energia_aterro",
        "co2_aterro",
        "A peça é enterrada; o custo é o de coletar e dispor.",
    ),
    EOL_INCINERATION: EndOfLifeRoute(
        EOL_INCINERATION,
        "Combustão (incineração)",
        "energia_combustao",
        "co2_combustao",
        "A peça é queimada. O crédito de energia recuperada não é abatido.",
    ),
    EOL_DOWNCYCLE: EndOfLifeRoute(
        EOL_DOWNCYCLE,
        "Subciclagem",
        "energia_subciclagem",
        "co2_subciclagem",
        "O material volta como matéria-prima de qualidade inferior.",
    ),
    EOL_RECYCLE: EndOfLifeRoute(
        EOL_RECYCLE,
        "Reciclagem",
        RECYCLE_ENERGY,
        RECYCLE_CO2,
        "O material volta como matéria-prima equivalente.",
    ),
    EOL_REMANUFACTURE: EndOfLifeRoute(
        EOL_REMANUFACTURE,
        "Remanufatura",
        "energia_remanufatura",
        "co2_remanufatura",
        "A peça é recondicionada e volta a servir na mesma função.",
    ),
    EOL_REUSE: EndOfLifeRoute(
        EOL_REUSE,
        "Reuso",
        "energia_reuso",
        "co2_reuso",
        "A peça é usada de novo como está.",
    ),
    EOL_NONE: EndOfLifeRoute(
        EOL_NONE,
        "Nenhuma rota declarada",
        None,
        None,
        "O destino não foi declarado.",
    ),
}

EOL_LABELS = {slug: route.label for slug, route in EOL_ROUTE_TABLE.items()}

#: Why ``nenhum`` never contributes a number. Leaving the phase out of the sum
#: would be choosing zero for it — the very thing principle 3 forbids.
EOL_NONE_REASON = (
    "Nenhuma rota de fim de vida declarada. A fase não foi tratada como zero: "
    "deixá-la fora da soma seria escolher zero para ela."
)
#: What a carbon answer is denominated in. Money is not in any unit system
#: (D-65); a ratio between masses of two different substances is in one, and the
#: unit system flattens it to "dimensionless" because it cannot tell the two
#: substances apart. Different reason, same duty: say it in words.
CARBON_UNIT = "kg de CO₂"
ENERGY_UNIT = "MJ"

#: Said once, carried in the result, because a reader who sees a carbon column
#: derived from a dimensionless property is owed the reason.
CARBON_UNIT_NOTE = (
    "O carbono sai em kg de CO₂ por declaração, não por análise dimensional: a "
    "pegada é uma razão entre massas de substâncias diferentes, e o sistema de "
    "unidades não distingue substância — ele a reduz a adimensional, como faz "
    "com o custo por massa. A energia, essa sim, é derivada em MJ."
)

#: Why recycling is not netted against this part's total.
RECYCLING_CREDIT_NOTE = (
    "A reciclagem aparece duas vezes no modelo e nunca se cancela: como energia "
    "gasta no fim desta vida e como energia poupada no início da próxima, pelo "
    "teor reciclado de quem usar o material. Este documento não abate crédito de "
    "reciclagem do total — abater é escolha de método, e normas diferentes a "
    "fazem diferente."
)


class EcoAuditError(ValueError):
    """The brief itself cannot be audited — bad inputs, not missing data."""


@dataclass(frozen=True)
class UseAssumptions:
    """How the part spends energy while it is in service.

    One of two models, and the fields of the other are refused rather than
    ignored — a ``power_watts`` quietly dropped from a mobile brief would leave
    the reader believing a number that never entered the sum.
    """

    model: str
    #: ``estatico``: power drawn in service, W, and the fraction of the year the
    #: part actually draws it.
    power_watts: float | None = None
    duty_cycle: float | None = None
    #: ``movel``: distance carried over the whole service life, km, and the
    #: energy it takes to carry a kilogram one kilometre, MJ/(kg·km).
    distance_km: float | None = None
    mobile_intensity: float | None = None
    #: Both models: service life in years. ``estatico`` turns it into running
    #: time; ``movel`` uses it only to say what the distance refers to.
    life_years: float | None = None
    #: Carbon per unit of energy delivered in service, kg CO₂/MJ — the grid for
    #: a static product, the fuel for a mobile one. Absent means the use phase
    #: has an energy and no carbon, which is a state, not a zero.
    carbon_per_energy: float | None = None

    def __post_init__(self) -> None:
        if self.model not in USE_MODELS:
            raise EcoAuditError(f"Modelo de uso desconhecido: {self.model}.")
        if self.model == USE_STATIC:
            self._require("potência", self.power_watts)
            self._require("vida em serviço", self.life_years)
            if self.duty_cycle is None or not 0 < self.duty_cycle <= 1:
                raise EcoAuditError("O ciclo de trabalho fica entre 0 (exclusivo) e 1.")
            self._refuse(
                {
                    "distância percorrida": self.distance_km,
                    "intensidade de uso": self.mobile_intensity,
                }
            )
        else:
            self._require("distância percorrida", self.distance_km)
            self._require("intensidade de uso", self.mobile_intensity)
            self._refuse({"potência": self.power_watts, "ciclo de trabalho": self.duty_cycle})
        if self.carbon_per_energy is not None and self.carbon_per_energy < 0:
            raise EcoAuditError("Carbono por energia negativo não existe.")

    @staticmethod
    def _require(label: str, value: float | None) -> None:
        if value is None or not value > 0:
            raise EcoAuditError(f"O modelo escolhido precisa de {label} maior que zero.")

    @staticmethod
    def _refuse(fields: dict[str, float | None]) -> None:
        """Reject a field belonging to the model that did not run.

        Ignoring it silently is the failure this guards against: the reader
        typed a number, the answer does not contain it, and nothing on screen
        says so.
        """
        named = sorted(label for label, value in fields.items() if value is not None)
        if named:
            raise EcoAuditError(
                "Estes campos são do outro modelo de uso e não entram nesta conta: "
                + ", ".join(named)
                + "."
            )


@dataclass(frozen=True)
class PhaseResult:
    """One phase of the life, with energy and carbon answered independently.

    The two quantities read different data — the carbon of a process is a
    different catalogued number from its energy — so a phase can be known in
    megajoules and unknown in kilograms of CO₂. Each therefore carries its own
    absence and its own written reason (D-24): one blank cell explained by the
    other column's reason would be a guess dressed as an answer.
    """

    phase: str
    label: str
    #: MJ, and kg CO₂. ``None`` means the phase could not be computed for that
    #: quantity — never zero, never an estimate (principle 3).
    energy: float | None
    carbon: float | None
    #: How this phase was computed, in words, so the number can be redone by
    #: hand from what the screen shows.
    detail: str
    energy_missing: tuple[str, ...] = ()
    carbon_missing: tuple[str, ...] = ()
    energy_reason: str | None = None
    carbon_reason: str | None = None


@dataclass(frozen=True)
class Dominance:
    """Which phase dominates one of the two quantities, or why nobody knows."""

    phase: str | None
    label: str | None
    share: float | None
    refusal: str | None


@dataclass(frozen=True)
class EcoAuditResult:
    """One part's five phases, the two totals, and the two podiums."""

    mass_in_part: float
    mass_bought: float
    scrap_fraction: float
    use_model: str
    end_of_life: str
    phases: tuple[PhaseResult, ...]
    total_energy: float | None
    total_carbon: float | None
    energy_dominance: Dominance
    carbon_dominance: Dominance
    energy_unit: str = ENERGY_UNIT
    carbon_unit: str = CARBON_UNIT
    carbon_unit_note: str = CARBON_UNIT_NOTE
    recycling_credit_note: str = RECYCLING_CREDIT_NOTE


def _absence(missing: list[str]) -> tuple[tuple[str, ...], str]:
    ordered = tuple(sorted(missing))
    return ordered, "Dados ausentes: " + ", ".join(ordered)


def _phase(
    phase: str,
    *,
    detail: str,
    energy: float | None,
    carbon: float | None,
    energy_missing: list[str] | None = None,
    carbon_missing: list[str] | None = None,
) -> PhaseResult:
    """Assemble one phase, giving each absent quantity its own written reason."""
    energy_keys, energy_reason = _absence(energy_missing or [])
    carbon_keys, carbon_reason = _absence(carbon_missing or [])
    return PhaseResult(
        phase=phase,
        label=PHASE_LABELS[phase],
        energy=energy,
        carbon=carbon,
        detail=detail,
        energy_missing=energy_keys,
        energy_reason=energy_reason if energy_keys else None,
        carbon_missing=carbon_keys,
        carbon_reason=carbon_reason if carbon_keys else None,
    )


def _mix(fraction: float, primary: float, recycled: float | None) -> float:
    """The intensity of a feedstock with recycled content ``fraction``.

    At ``fraction == 0`` the recycled figure is never read, which is why a
    material that lacks it is still audited: what the brief needs depends on the
    brief, and demanding a number the sum does not contain would exclude a
    material over nothing.
    """
    if fraction <= 0:
        return primary
    assert recycled is not None
    return (1.0 - fraction) * primary + fraction * recycled


def _material_phase(
    *,
    mass_bought: float,
    recycled_fraction: float,
    primary_energy: float | None,
    primary_carbon: float | None,
    recycle_energy: float | None,
    recycle_carbon: float | None,
) -> PhaseResult:
    """Energy and carbon of producing the mass this part consumed."""
    needs_recycled = recycled_fraction > 0
    detail = (
        f"massa comprada × [(1 − {recycled_fraction:g}) × primária "
        f"+ {recycled_fraction:g} × reciclada]"
    )

    energy_missing = [EMBODIED_ENERGY] if primary_energy is None else []
    if needs_recycled and recycle_energy is None:
        energy_missing.append(RECYCLE_ENERGY)
    carbon_missing = [CO2_FOOTPRINT] if primary_carbon is None else []
    if needs_recycled and recycle_carbon is None:
        carbon_missing.append(RECYCLE_CO2)

    energy = (
        None
        if energy_missing
        else mass_bought * _mix(recycled_fraction, primary_energy, recycle_energy)  # type: ignore[arg-type]
    )
    carbon = (
        None
        if carbon_missing
        else mass_bought * _mix(recycled_fraction, primary_carbon, recycle_carbon)  # type: ignore[arg-type]
    )
    return _phase(
        MATERIAL,
        detail=detail,
        energy=energy,
        carbon=carbon,
        energy_missing=energy_missing,
        carbon_missing=carbon_missing,
    )


def _manufacture_phase(
    *, mass_bought: float, process_energy: float | None, process_carbon: float | None
) -> PhaseResult:
    return _phase(
        MANUFATURA,
        detail="massa comprada × energia do processo por kg",
        energy=None if process_energy is None else mass_bought * process_energy,
        carbon=None if process_carbon is None else mass_bought * process_carbon,
        energy_missing=[PROCESS_ENERGY] if process_energy is None else [],
        carbon_missing=[PROCESS_CO2] if process_carbon is None else [],
    )


def _tonnes(mass_kg: float) -> float:
    return to_canonical(mass_kg, "kg", "t")[0]


def _transport_leg(*, mass: float, leg: TransportLeg) -> LegResult:
    """What moving the whole product along one leg costs, in MJ and kg CO₂.

    The distance is a fact about the supply chain, not about the material, so it
    is an input with a visible value — the treatment D-64 gave the support
    condition and D-65 gave the write-off horizon.
    """
    tonnes = _tonnes(mass)
    energy_missing = [TRANSPORT_ENERGY_KEY] if leg.energy_intensity is None else []
    carbon_missing = [TRANSPORT_CARBON_KEY] if leg.carbon_intensity is None else []
    energy_keys, energy_reason = _absence(energy_missing)
    carbon_keys, carbon_reason = _absence(carbon_missing)
    return LegResult(
        label=leg.label,
        distance_km=leg.distance_km,
        energy=(
            None
            if leg.energy_intensity is None
            else tonnes * leg.distance_km * leg.energy_intensity
        ),
        carbon=(
            None
            if leg.carbon_intensity is None
            else tonnes * leg.distance_km * leg.carbon_intensity
        ),
        energy_missing=energy_keys,
        carbon_missing=carbon_keys,
        energy_reason=energy_reason if energy_keys else None,
        carbon_reason=carbon_reason if carbon_keys else None,
    )


def _use_phase(*, mass_in_part: float, use: UseAssumptions) -> PhaseResult:
    """Service energy under the model the brief declared.

    The two branches differ in the one way that matters: ``mass_in_part`` is a
    factor of the mobile branch and appears nowhere in the static one. That is
    the whole reason the choice exists, and it is why the detail line says so.
    """
    if use.model == USE_STATIC:
        assert use.power_watts is not None and use.life_years is not None
        assert use.duty_cycle is not None
        hours = HOURS_PER_YEAR * use.life_years * use.duty_cycle
        energy = to_canonical(use.power_watts * hours, "W*h", ENERGY_UNIT)[0]
        detail = (
            "potência × horas em serviço (a massa não entra: aliviar a peça não " "muda esta fase)"
        )
    else:
        assert use.distance_km is not None and use.mobile_intensity is not None
        energy = mass_in_part * use.distance_km * use.mobile_intensity
        detail = "massa da peça × distância percorrida × intensidade de uso"
    return _phase(
        USO,
        detail=detail,
        energy=energy,
        carbon=None if use.carbon_per_energy is None else energy * use.carbon_per_energy,
        carbon_missing=[CARBON_PER_ENERGY_KEY] if use.carbon_per_energy is None else [],
    )


def _end_of_life_phase(
    *, mass_in_part: float, route: str, material: Mapping[str, float]
) -> PhaseResult:
    """What this life's end costs, with no credit netted against it.

    The mass here is the mass **in the part**, not the mass bought: the scrap
    never became a product and never reached an end of life as one. The factor
    is the material's own catalogued value for the route; when the material
    does not carry it, the phase is absent and the slug is named.
    """
    spec = EOL_ROUTE_TABLE[route]
    if spec.energy_slug is None or spec.carbon_slug is None:
        return PhaseResult(
            phase=FIM_DE_VIDA,
            label=PHASE_LABELS[FIM_DE_VIDA],
            energy=None,
            carbon=None,
            detail=f"Rota: {spec.label}",
            energy_reason=EOL_NONE_REASON,
            carbon_reason=EOL_NONE_REASON,
        )
    energy_factor = material.get(spec.energy_slug)
    carbon_factor = material.get(spec.carbon_slug)
    phase = _phase(
        FIM_DE_VIDA,
        detail=f"Rota: {spec.label} — massa da peça × {spec.energy_slug} por kg",
        energy=None if energy_factor is None else mass_in_part * energy_factor,
        carbon=None if carbon_factor is None else mass_in_part * carbon_factor,
        energy_missing=[spec.energy_slug] if energy_factor is None else [],
        carbon_missing=[spec.carbon_slug] if carbon_factor is None else [],
    )
    if phase.energy is not None and phase.carbon is not None:
        return phase
    # The generic "Dados ausentes" reason is true but does not say what the
    # absence would have become if it were filled in silently: say it.
    suffix = (
        f" A rota {spec.label} fica indisponível para este material e não foi " "tratada como zero."
    )
    return PhaseResult(
        phase=phase.phase,
        label=phase.label,
        energy=phase.energy,
        carbon=phase.carbon,
        detail=phase.detail,
        energy_missing=phase.energy_missing,
        carbon_missing=phase.carbon_missing,
        energy_reason=(phase.energy_reason + "." + suffix) if phase.energy_reason else None,
        carbon_reason=(phase.carbon_reason + "." + suffix) if phase.carbon_reason else None,
    )


def _dominance(phases: tuple[PhaseResult, ...], attribute: str, quantity: str) -> Dominance:
    """The heaviest phase, or the reason nobody can name one.

    A single absent phase forfeits the podium, because the phase nobody could
    compute might be the one that dominates — and an eco audit whose headline is
    wrong is worse than one with no headline.
    """
    values = [(phase, getattr(phase, attribute)) for phase in phases]
    absent = sorted(phase.label for phase, value in values if value is None)
    if absent:
        return Dominance(
            phase=None,
            label=None,
            share=None,
            refusal=(
                f"Sem fase dominante em {quantity}: "
                + ", ".join(absent)
                + " não pôde ser calculada, e a fase que ninguém calculou pode ser "
                "justamente a que domina."
            ),
        )
    total = sum(value for _, value in values)
    if not total > 0:
        return Dominance(
            phase=None,
            label=None,
            share=None,
            refusal=(
                f"Sem fase dominante em {quantity}: o total é zero, e não há " "fração de zero."
            ),
        )
    winner = max(values, key=lambda item: item[1])[0]
    return Dominance(
        phase=winner.phase,
        label=winner.label,
        share=getattr(winner, attribute) / total,
        refusal=None,
    )


# --- the product: several components, several legs (D-121) -------------------


@dataclass(frozen=True)
class ComponentBrief:
    """One line of the bill of materials, with the catalogue data it reads.

    ``material`` and ``process`` are the usable catalogued values keyed by slug
    — a slug that is not a key is absent, and absence is decided here, by the
    phase that needs it, never by the caller filling a default.
    """

    name: str
    unit_mass: float
    quantity: int
    recycled_fraction: float
    scrap_fraction: float
    end_of_life: str
    material: Mapping[str, float] = field(default_factory=dict)
    process: Mapping[str, float] = field(default_factory=dict)


@dataclass(frozen=True)
class TransportLeg:
    """One leg of the journey: a mode's two intensities and a distance."""

    label: str
    distance_km: float
    energy_intensity: float | None
    carbon_intensity: float | None


@dataclass(frozen=True)
class LegResult:
    label: str
    distance_km: float
    energy: float | None
    carbon: float | None
    energy_missing: tuple[str, ...] = ()
    carbon_missing: tuple[str, ...] = ()
    energy_reason: str | None = None
    carbon_reason: str | None = None


@dataclass(frozen=True)
class ComponentResult:
    """The three phases a component owns on its own: material, manufatura, fim de vida.

    Transport and use belong to the product — the truck carries all of it, and
    a car carries the whole door — so they are not split per component: a split
    would need an allocation rule, and an allocation rule is a method choice
    this module does not make silently.
    """

    name: str
    quantity: int
    unit_mass: float
    mass_in_part: float
    mass_bought: float
    scrap_fraction: float
    recycled_fraction: float
    end_of_life: str
    end_of_life_label: str
    phases: tuple[PhaseResult, ...]


@dataclass(frozen=True)
class EcoProductResult:
    """A product's five phases summed over its components and legs."""

    components: tuple[ComponentResult, ...]
    legs: tuple[LegResult, ...]
    mass_in_product: float
    mass_bought: float
    use_model: str
    phases: tuple[PhaseResult, ...]
    total_energy: float | None
    total_carbon: float | None
    energy_dominance: Dominance
    carbon_dominance: Dominance
    energy_unit: str = ENERGY_UNIT
    carbon_unit: str = CARBON_UNIT
    carbon_unit_note: str = CARBON_UNIT_NOTE
    recycling_credit_note: str = RECYCLING_CREDIT_NOTE


#: The most components and legs one brief may carry. A bound, not a model
#: limit: it keeps one request from becoming a denial of service.
MAX_COMPONENTS = 50
MAX_LEGS = 20


def _validate_component(component: ComponentBrief) -> None:
    prefix = f"{component.name}: "
    if not component.unit_mass > 0:
        raise EcoAuditError(prefix + "a massa da peça precisa ser maior que zero.")
    if component.quantity < 1:
        raise EcoAuditError(prefix + "a quantidade precisa ser pelo menos 1.")
    if not 0 <= component.recycled_fraction <= 1:
        raise EcoAuditError(prefix + "o teor reciclado fica entre 0 e 1.")
    if not 0 <= component.scrap_fraction < 1:
        raise EcoAuditError(prefix + "a fração de refugo fica entre 0 e 1 (exclusivo).")
    if component.end_of_life not in EOL_ROUTES:
        raise EcoAuditError(f"Rota de fim de vida desconhecida: {component.end_of_life}.")


def _audit_component(component: ComponentBrief) -> ComponentResult:
    mass_in_part = component.unit_mass * component.quantity
    mass_bought = mass_in_part / (1.0 - component.scrap_fraction)
    material = component.material
    phases = (
        _material_phase(
            mass_bought=mass_bought,
            recycled_fraction=component.recycled_fraction,
            primary_energy=material.get(EMBODIED_ENERGY),
            primary_carbon=material.get(CO2_FOOTPRINT),
            recycle_energy=material.get(RECYCLE_ENERGY),
            recycle_carbon=material.get(RECYCLE_CO2),
        ),
        _manufacture_phase(
            mass_bought=mass_bought,
            process_energy=component.process.get(PROCESS_ENERGY),
            process_carbon=component.process.get(PROCESS_CO2),
        ),
        _end_of_life_phase(
            mass_in_part=mass_in_part, route=component.end_of_life, material=material
        ),
    )
    return ComponentResult(
        name=component.name,
        quantity=component.quantity,
        unit_mass=component.unit_mass,
        mass_in_part=mass_in_part,
        mass_bought=mass_bought,
        scrap_fraction=component.scrap_fraction,
        recycled_fraction=component.recycled_fraction,
        end_of_life=component.end_of_life,
        end_of_life_label=EOL_LABELS[component.end_of_life],
        phases=phases,
    )


def _sum_quantity(
    parts: list[tuple[str, float | None, tuple[str, ...], str | None]],
) -> tuple[float | None, list[str], str | None]:
    """Sum one quantity over parts, or say which part made it impossible.

    A sum over some of the components is a subtotal that reads like a total —
    the error principle 3 exists to stop — so one absent part makes the whole
    phase absent, and the reason names every part that was missing and why.
    """
    absent = [(name, keys, reason) for name, value, keys, reason in parts if value is None]
    if not absent:
        return sum(value for _, value, _, _ in parts), [], None  # type: ignore[misc]
    keys = sorted({key for _, part_keys, _ in absent for key in part_keys})
    reason = "; ".join(f"{name}: {reason or 'não calculada'}" for name, _, reason in absent)
    return None, keys, reason


def _aggregate_phase(
    phase: str,
    detail: str,
    parts_energy: list[tuple[str, float | None, tuple[str, ...], str | None]],
    parts_carbon: list[tuple[str, float | None, tuple[str, ...], str | None]],
) -> PhaseResult:
    energy, energy_keys, energy_reason = _sum_quantity(parts_energy)
    carbon, carbon_keys, carbon_reason = _sum_quantity(parts_carbon)
    return PhaseResult(
        phase=phase,
        label=PHASE_LABELS[phase],
        energy=energy,
        carbon=carbon,
        detail=detail,
        energy_missing=tuple(energy_keys),
        carbon_missing=tuple(carbon_keys),
        energy_reason=energy_reason,
        carbon_reason=carbon_reason,
    )


def audit_product(
    *,
    components: list[ComponentBrief],
    legs: list[TransportLeg],
    use: UseAssumptions,
) -> EcoProductResult:
    """Audit a product made of several components, moved along several legs.

    Material, manufatura and fim de vida are computed **per component** (each
    with its own material, process, scrap, recycled content and route) and
    summed. Transport is the whole product's mass along every leg; use is the
    product's, under the declared model. A phase absent in **any** component or
    leg is absent for the product, with the component named — and the podium
    and the total are refused, as they always were for a single part (D-66).

    Raises:
        EcoAuditError: on a brief that cannot be audited at all.
    """
    if not components:
        raise EcoAuditError("O produto precisa de pelo menos um componente.")
    if len(components) > MAX_COMPONENTS:
        raise EcoAuditError(f"No máximo {MAX_COMPONENTS} componentes por auditoria.")
    if not legs:
        raise EcoAuditError("Declare pelo menos um trecho de transporte (a distância pode ser 0).")
    if len(legs) > MAX_LEGS:
        raise EcoAuditError(f"No máximo {MAX_LEGS} trechos de transporte por auditoria.")
    for component in components:
        _validate_component(component)
    for leg in legs:
        if not leg.distance_km >= 0:
            raise EcoAuditError("A distância de transporte não pode ser negativa.")

    audited = tuple(_audit_component(component) for component in components)
    mass_in_product = sum(component.mass_in_part for component in audited)
    mass_bought = sum(component.mass_bought for component in audited)
    leg_results = tuple(_transport_leg(mass=mass_in_product, leg=leg) for leg in legs)

    def by_component(index: int, attribute: str):
        phase_attr, keys_attr, reason_attr = (
            ("energy", "energy_missing", "energy_reason")
            if attribute == "energy"
            else ("carbon", "carbon_missing", "carbon_reason")
        )
        return [
            (
                component.name,
                getattr(component.phases[index], phase_attr),
                getattr(component.phases[index], keys_attr),
                getattr(component.phases[index], reason_attr),
            )
            for component in audited
        ]

    def by_leg(attribute: str):
        return [
            (
                f"Trecho {position} ({leg.label})",
                getattr(leg, attribute),
                getattr(leg, f"{attribute}_missing"),
                getattr(leg, f"{attribute}_reason"),
            )
            for position, leg in enumerate(leg_results, start=1)
        ]

    single = len(audited) == 1
    phases = (
        _aggregate_phase(
            MATERIAL,
            (
                audited[0].phases[0].detail
                if single
                else "soma por componente de massa comprada × intensidade do material"
            ),
            by_component(0, "energy"),
            by_component(0, "carbon"),
        ),
        _aggregate_phase(
            MANUFATURA,
            (
                audited[0].phases[1].detail
                if single
                else "soma por componente de massa comprada × energia do processo por kg"
            ),
            by_component(1, "energy"),
            by_component(1, "carbon"),
        ),
        _aggregate_phase(
            TRANSPORTE,
            "massa do produto (t) × Σ distância do trecho (km) × intensidade do modal",
            by_leg("energy"),
            by_leg("carbon"),
        ),
        _use_phase(mass_in_part=mass_in_product, use=use),
        _aggregate_phase(
            FIM_DE_VIDA,
            (
                audited[0].phases[2].detail
                if single
                else "soma por componente de massa da peça × fator da rota escolhida"
            ),
            by_component(2, "energy"),
            by_component(2, "carbon"),
        ),
    )
    if single:
        # One component: its reason is the product's, without a name prefix
        # that would only repeat what the reader just typed.
        phases = tuple(
            _strip_single_prefix(phase, audited[0].name) if phase.phase != USO else phase
            for phase in phases
        )

    def total(attribute: str) -> float | None:
        values = [getattr(phase, attribute) for phase in phases]
        # A total over four of five phases is not a total; it is a subtotal that
        # reads like one, which is the mistake this returns None to avoid.
        return None if any(value is None for value in values) else sum(values)

    return EcoProductResult(
        components=audited,
        legs=leg_results,
        mass_in_product=mass_in_product,
        mass_bought=mass_bought,
        use_model=use.model,
        phases=phases,
        total_energy=total("energy"),
        total_carbon=total("carbon"),
        energy_dominance=_dominance(phases, "energy", "energia"),
        carbon_dominance=_dominance(phases, "carbon", "carbono"),
    )


def _strip_single_prefix(phase: PhaseResult, name: str) -> PhaseResult:
    def strip(reason: str | None) -> str | None:
        if reason is None:
            return None
        prefix = f"{name}: "
        return reason[len(prefix) :] if reason.startswith(prefix) else reason

    return PhaseResult(
        phase=phase.phase,
        label=phase.label,
        energy=phase.energy,
        carbon=phase.carbon,
        detail=phase.detail,
        energy_missing=phase.energy_missing,
        carbon_missing=phase.carbon_missing,
        energy_reason=strip(phase.energy_reason),
        carbon_reason=strip(phase.carbon_reason),
    )


def audit(
    *,
    mass_in_part: float,
    recycled_fraction: float,
    scrap_fraction: float,
    embodied_energy: float | None,
    carbon_footprint: float | None,
    recycle_energy: float | None,
    recycle_carbon: float | None,
    process_energy: float | None,
    process_carbon: float | None,
    transport_distance_km: float,
    transport_energy_intensity: float | None,
    transport_carbon_intensity: float | None,
    use: UseAssumptions,
    end_of_life: str,
    end_of_life_factors: Mapping[str, float] | None = None,
) -> EcoAuditResult:
    """Audit one part over its five phases — a product of one component, one leg.

    Kept as the single-part entry point; it is ``audit_product`` with a list of
    one, so the two can never disagree.

    Args:
        mass_in_part: finished mass, kg — from the Solver, or measured.
        recycled_fraction: recycled content of the feedstock, 0 ≤ x ≤ 1.
        scrap_fraction: the chosen process's ``fracao-refugo``, 0 ≤ f < 1.
        embodied_energy: ``energia_incorporada``, MJ/kg of primary material.
        carbon_footprint: ``pegada_co2``, kg CO₂/kg of primary material.
        recycle_energy: ``energia_reciclagem``, MJ/kg.
        recycle_carbon: ``co2_reciclagem``, kg CO₂/kg.
        process_energy: ``energia-processo``, MJ/kg.
        process_carbon: ``co2-processo``, kg CO₂/kg.
        transport_distance_km: distance the finished part travels, km.
        transport_energy_intensity: the mode's MJ per tonne-km.
        transport_carbon_intensity: the mode's kg CO₂ per tonne-km.
        use: the declared service model and its own inputs.
        end_of_life: one of ``EOL_ROUTES``.
        end_of_life_factors: the material's catalogued values for the other
            routes, keyed by slug (``energia_aterro``…).

    Raises:
        EcoAuditError: on a brief that cannot be audited at all.
    """
    if not mass_in_part > 0:
        raise EcoAuditError("A massa da peça precisa ser maior que zero.")
    if not 0 <= recycled_fraction <= 1:
        raise EcoAuditError("O teor reciclado fica entre 0 e 1.")
    if not 0 <= scrap_fraction < 1:
        raise EcoAuditError("A fração de refugo fica entre 0 e 1 (exclusivo).")
    material = {
        slug: value
        for slug, value in {
            EMBODIED_ENERGY: embodied_energy,
            CO2_FOOTPRINT: carbon_footprint,
            RECYCLE_ENERGY: recycle_energy,
            RECYCLE_CO2: recycle_carbon,
            **(end_of_life_factors or {}),
        }.items()
        if value is not None
    }
    process = {
        slug: value
        for slug, value in {PROCESS_ENERGY: process_energy, PROCESS_CO2: process_carbon}.items()
        if value is not None
    }
    product = audit_product(
        components=[
            ComponentBrief(
                name="Peça",
                unit_mass=mass_in_part,
                quantity=1,
                recycled_fraction=recycled_fraction,
                scrap_fraction=scrap_fraction,
                end_of_life=end_of_life,
                material=material,
                process=process,
            )
        ],
        legs=[
            TransportLeg(
                label="trecho",
                distance_km=transport_distance_km,
                energy_intensity=transport_energy_intensity,
                carbon_intensity=transport_carbon_intensity,
            )
        ],
        use=use,
    )
    return EcoAuditResult(
        mass_in_part=product.mass_in_product,
        mass_bought=product.mass_bought,
        scrap_fraction=scrap_fraction,
        use_model=product.use_model,
        end_of_life=end_of_life,
        phases=product.phases,
        total_energy=product.total_energy,
        total_carbon=product.total_carbon,
        energy_dominance=product.energy_dominance,
        carbon_dominance=product.carbon_dominance,
    )
