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
one refusal in this module that a reader will meet often — landfill and
incineration are not quantified in v1, and an audit routed to either of them
gets its phases and no podium. That is the intended behaviour: a podium built on
four of five numbers is worse than no podium.

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

from dataclasses import dataclass

from app.calculations.part_cost import HOURS_PER_YEAR

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

#: End-of-life routes. Only ``reciclagem`` has a catalogued energy in v1; the
#: other two are declared unquantified rather than assumed free, because a
#: landfill that costs zero would make burying a part look like the cheapest
#: thing a designer can do with it.
EOL_RECYCLE = "reciclagem"
EOL_LANDFILL = "aterro"
EOL_INCINERATION = "incineracao"
EOL_ROUTES = (EOL_RECYCLE, EOL_LANDFILL, EOL_INCINERATION)

EOL_LABELS = {
    EOL_RECYCLE: "Reciclagem",
    EOL_LANDFILL: "Aterro",
    EOL_INCINERATION: "Incineração",
}

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

_UNQUANTIFIED_EOL = {
    EOL_LANDFILL: (
        "Aterro não tem energia catalogada nesta versão. Não foi tratado como "
        "zero: enterrar uma peça pareceria a coisa mais barata a fazer com ela."
    ),
    EOL_INCINERATION: (
        "Incineração não tem energia catalogada nesta versão. Não foi tratada "
        "como zero, e o crédito de energia recuperada tampouco foi inventado."
    ),
}


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


def _transport_phase(
    *,
    mass_in_part: float,
    distance_km: float,
    energy_intensity: float | None,
    carbon_intensity: float | None,
) -> PhaseResult:
    """What it costs to move the finished part, in MJ and kg CO₂.

    The distance is a fact about the supply chain, not about the material, so it
    is an input with a visible value — the treatment D-64 gave the support
    condition and D-65 gave the write-off horizon.
    """
    tonnes = mass_in_part / 1000.0
    return _phase(
        TRANSPORTE,
        detail="massa da peça (t) × distância (km) × intensidade do modal",
        energy=None if energy_intensity is None else tonnes * distance_km * energy_intensity,
        carbon=None if carbon_intensity is None else tonnes * distance_km * carbon_intensity,
        energy_missing=[TRANSPORT_ENERGY_KEY] if energy_intensity is None else [],
        carbon_missing=[TRANSPORT_CARBON_KEY] if carbon_intensity is None else [],
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
        # W·h → MJ: 3600 J per W·h, 1e6 J per MJ.
        energy = use.power_watts * hours * 3600.0 / 1.0e6
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
    *,
    mass_in_part: float,
    route: str,
    recycle_energy: float | None,
    recycle_carbon: float | None,
) -> PhaseResult:
    """What this life's end costs, with no credit netted against it.

    The mass here is the mass **in the part**, not the mass bought: the scrap
    never became a product and never reached an end of life as one.
    """
    if route != EOL_RECYCLE:
        unquantified = _UNQUANTIFIED_EOL[route]
        return PhaseResult(
            phase=FIM_DE_VIDA,
            label=PHASE_LABELS[FIM_DE_VIDA],
            energy=None,
            carbon=None,
            detail=f"Rota: {EOL_LABELS[route]}",
            energy_reason=unquantified,
            carbon_reason=unquantified,
        )
    return _phase(
        FIM_DE_VIDA,
        detail="massa da peça × energia de reciclagem por kg",
        energy=None if recycle_energy is None else mass_in_part * recycle_energy,
        carbon=None if recycle_carbon is None else mass_in_part * recycle_carbon,
        energy_missing=[RECYCLE_ENERGY] if recycle_energy is None else [],
        carbon_missing=[RECYCLE_CO2] if recycle_carbon is None else [],
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
) -> EcoAuditResult:
    """Audit one part over its five phases.

    Args:
        mass_in_part: finished mass, kg — from the Solver, or measured.
        recycled_fraction: recycled content of the feedstock, 0 ≤ x ≤ 1.
        scrap_fraction: the chosen process's ``fracao-refugo``, 0 ≤ f < 1. It is
            what turns the mass in the part into the mass bought.
        embodied_energy: ``energia_incorporada``, MJ/kg of primary material.
        carbon_footprint: ``pegada_co2``, kg CO₂/kg of primary material.
        recycle_energy: ``energia_reciclagem``, MJ/kg. Read only when
            ``recycled_fraction`` or the recycling route needs it.
        recycle_carbon: ``co2_reciclagem``, kg CO₂/kg.
        process_energy: ``energia-processo``, MJ/kg.
        process_carbon: ``co2-processo``, kg CO₂/kg.
        transport_distance_km: distance the finished part travels, km.
        transport_energy_intensity: the mode's MJ per tonne-km.
        transport_carbon_intensity: the mode's kg CO₂ per tonne-km.
        use: the declared service model and its own inputs.
        end_of_life: one of ``EOL_ROUTES``.

    Raises:
        EcoAuditError: on a brief that cannot be audited at all.
    """
    if not mass_in_part > 0:
        raise EcoAuditError("A massa da peça precisa ser maior que zero.")
    if not 0 <= recycled_fraction <= 1:
        raise EcoAuditError("O teor reciclado fica entre 0 e 1.")
    if not 0 <= scrap_fraction < 1:
        raise EcoAuditError("A fração de refugo fica entre 0 e 1 (exclusivo).")
    if not transport_distance_km >= 0:
        raise EcoAuditError("A distância de transporte não pode ser negativa.")
    if end_of_life not in EOL_ROUTES:
        raise EcoAuditError(f"Rota de fim de vida desconhecida: {end_of_life}.")

    mass_bought = mass_in_part / (1.0 - scrap_fraction)

    phases = (
        _material_phase(
            mass_bought=mass_bought,
            recycled_fraction=recycled_fraction,
            primary_energy=embodied_energy,
            primary_carbon=carbon_footprint,
            recycle_energy=recycle_energy,
            recycle_carbon=recycle_carbon,
        ),
        _manufacture_phase(
            mass_bought=mass_bought,
            process_energy=process_energy,
            process_carbon=process_carbon,
        ),
        _transport_phase(
            mass_in_part=mass_in_part,
            distance_km=transport_distance_km,
            energy_intensity=transport_energy_intensity,
            carbon_intensity=transport_carbon_intensity,
        ),
        _use_phase(mass_in_part=mass_in_part, use=use),
        _end_of_life_phase(
            mass_in_part=mass_in_part,
            route=end_of_life,
            recycle_energy=recycle_energy,
            recycle_carbon=recycle_carbon,
        ),
    )

    def total(attribute: str) -> float | None:
        values = [getattr(phase, attribute) for phase in phases]
        # A total over four of five phases is not a total; it is a subtotal that
        # reads like one, which is the mistake this returns None to avoid.
        return None if any(value is None for value in values) else sum(values)

    return EcoAuditResult(
        mass_in_part=mass_in_part,
        mass_bought=mass_bought,
        scrap_fraction=scrap_fraction,
        use_model=use.model,
        end_of_life=end_of_life,
        phases=phases,
        total_energy=total("energy"),
        total_carbon=total("carbon"),
        energy_dominance=_dominance(phases, "energy", "energia"),
        carbon_dominance=_dominance(phases, "carbon", "carbono"),
    )
