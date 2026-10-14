"""Contracts for the Eco Audit (P3).

Two shapes carry the design decisions and neither is incidental.

``UseIn`` is **one model with the other model's fields present but empty**, and
the refusal of a wrong field lives in ``app.calculations.eco_audit``, not here.
That is deliberate: the rule is a statement about the *method* — a number the
reader typed and the sum never contained — and a Pydantic validator would make
it a statement about the wire format, duplicated in a second place.

``PhaseOut`` carries **two absences and two reasons**, one per quantity. A phase
can be known in megajoules and unknown in kilograms of CO₂ because they read
different catalogued data, and a single "reason" field would force one of them
to explain the other (D-24).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.calculations.eco_audit import (
    CARBON_UNIT,
    CARBON_UNIT_NOTE,
    ENERGY_UNIT,
    EOL_DOWNCYCLE,
    EOL_INCINERATION,
    EOL_LANDFILL,
    EOL_NONE,
    EOL_RECYCLE,
    EOL_REMANUFACTURE,
    EOL_REUSE,
    MAX_COMPONENTS,
    MAX_LEGS,
    RECYCLING_CREDIT_NOTE,
    USE_MOBILE,
    USE_STATIC,
)

#: The seven routes on the wire. The vocabulary is closed; what each costs is
#: read from the catalogue per material (D-120).
EndOfLife = Literal[
    EOL_LANDFILL,
    EOL_INCINERATION,
    EOL_DOWNCYCLE,
    EOL_RECYCLE,
    EOL_REMANUFACTURE,
    EOL_REUSE,
    EOL_NONE,
]


class TransportModeOut(BaseModel):
    """One mode of the catalogue, with what it is and is not known to cost."""

    slug: str
    name: str
    description: str | None = None
    #: MJ and kg CO₂ per tonne-kilometre. ``None`` means nobody catalogued it —
    #: a state, never a zero, and the audit says so in the transport phase.
    energy_intensity: float | None = None
    carbon_intensity: float | None = None
    is_demo: bool = False


class UseIn(BaseModel):
    """The service phase: which model, and that model's own numbers."""

    model: Literal[USE_STATIC, USE_MOBILE]
    power_watts: float | None = None
    duty_cycle: float | None = None
    distance_km: float | None = None
    mobile_intensity: float | None = None
    life_years: float | None = None
    carbon_per_energy: float | None = None

    @field_validator(
        "power_watts",
        "duty_cycle",
        "distance_km",
        "mobile_intensity",
        "life_years",
        "carbon_per_energy",
    )
    @classmethod
    def _finite(cls, value: float | None) -> float | None:
        # NaN and infinity survive JSON in most clients and would produce an
        # audit that is neither a number nor an error.
        if value is not None and (value != value or value in (float("inf"), float("-inf"))):
            raise ValueError("Valor inválido.")
        return value


class EndOfLifeRouteOut(BaseModel):
    """One end-of-life route and the catalogue slugs that would price it."""

    slug: str
    label: str
    description: str
    energy_property: str | None = None
    carbon_property: str | None = None
    #: How many visible materials carry both factors of this route. Zero means
    #: the route is unavailable for every material today — said, not hidden.
    materials_with_factor: int = 0


class EcoComponentIn(BaseModel):
    """One line of the bill of materials."""

    #: Free label ("tampa", "parafuso"); the material name stands in when empty.
    name: str | None = Field(default=None, max_length=120)
    material_id: int = Field(gt=0)
    process_id: int = Field(gt=0)
    #: Mass of ONE unit, kg; ``quantity`` multiplies it.
    unit_mass: float = Field(gt=0, le=1.0e6)
    quantity: int = Field(default=1, ge=1, le=100_000)
    recycled_fraction: float = Field(default=0.0, ge=0.0, le=1.0)
    end_of_life: EndOfLife = EOL_RECYCLE


class TransportLegIn(BaseModel):
    """One leg of the product's journey."""

    mode: str = Field(min_length=1, max_length=80)
    distance_km: float = Field(default=0.0, ge=0.0, le=1.0e6)


class EcoAuditRequest(BaseModel):
    """A product brief — or, in the original shape, a single part.

    **Two shapes, never mixed.** The product shape carries ``components`` and
    ``transport_legs``; the single-part shape (``material_id``, ``process_id``,
    ``part_mass``… and ``transport_mode``) is the same audit with a list of one
    and stays because deep links and the comparison build it. A brief that
    mixes them is refused: a ``material_id`` sent next to a component list would
    be a number the reader typed and the sum never held (the D-56 rule).
    """

    components: list[EcoComponentIn] | None = Field(
        default=None, min_length=1, max_length=MAX_COMPONENTS
    )
    transport_legs: list[TransportLegIn] | None = Field(
        default=None, min_length=1, max_length=MAX_LEGS
    )

    #: Single-part shape. An eco audit of a part is an audit of *making* it:
    #: without a process there is no manufacturing phase and no scrap fraction.
    material_id: int | None = None
    process_id: int | None = None
    part_mass: float | None = Field(default=None, gt=0, le=1.0e6)
    recycled_fraction: float | None = Field(default=None, ge=0.0, le=1.0)
    end_of_life: EndOfLife | None = None
    transport_mode: str | None = Field(default=None, min_length=1, max_length=80)
    transport_distance_km: float | None = Field(default=None, ge=0.0, le=1.0e6)

    use: UseIn

    @model_validator(mode="after")
    def _one_shape(self) -> EcoAuditRequest:
        single = {
            "material_id": self.material_id,
            "process_id": self.process_id,
            "part_mass": self.part_mass,
            "recycled_fraction": self.recycled_fraction,
            "end_of_life": self.end_of_life,
        }
        if self.components is not None:
            stray = sorted(name for name, value in single.items() if value is not None)
            if stray:
                raise ValueError(
                    "Com lista de componentes, estes campos de peça única não entram na "
                    "conta: " + ", ".join(stray) + "."
                )
        elif self.material_id is None or self.process_id is None or self.part_mass is None:
            raise ValueError(
                "Informe a lista de componentes, ou material, processo e massa da peça."
            )
        if self.transport_legs is not None:
            if self.transport_mode is not None or self.transport_distance_km is not None:
                raise ValueError(
                    "Com lista de trechos, o modal e a distância de trecho único não "
                    "entram na conta."
                )
        elif self.transport_mode is None:
            raise ValueError("Informe os trechos de transporte, ou o modal do trecho único.")
        return self

    def resolved_components(self) -> list[EcoComponentIn]:
        if self.components is not None:
            return self.components
        assert self.material_id is not None and self.process_id is not None
        assert self.part_mass is not None
        return [
            EcoComponentIn(
                material_id=self.material_id,
                process_id=self.process_id,
                unit_mass=self.part_mass,
                quantity=1,
                recycled_fraction=self.recycled_fraction or 0.0,
                end_of_life=self.end_of_life or EOL_RECYCLE,
            )
        ]

    def resolved_legs(self) -> list[TransportLegIn]:
        if self.transport_legs is not None:
            return self.transport_legs
        assert self.transport_mode is not None
        return [
            TransportLegIn(mode=self.transport_mode, distance_km=self.transport_distance_km or 0.0)
        ]


class PhaseOut(BaseModel):
    """One phase, with energy and carbon answered independently."""

    phase: str
    label: str
    energy: float | None = None
    carbon: float | None = None
    detail: str
    energy_missing: list[str] = Field(default_factory=list)
    carbon_missing: list[str] = Field(default_factory=list)
    energy_reason: str | None = None
    carbon_reason: str | None = None


class DominanceOut(BaseModel):
    """The heaviest phase of one quantity, or the reason nobody can name one."""

    phase: str | None = None
    label: str | None = None
    share: float | None = None
    refusal: str | None = None


class ComponentOut(BaseModel):
    """One component: its own material, manufatura and fim-de-vida phases."""

    name: str
    material_id: int
    material_name: str
    process_id: int
    process_name: str
    quantity: int
    unit_mass: float
    mass_in_part: float
    mass_bought: float
    scrap_fraction: float
    recycled_fraction: float
    end_of_life: str
    end_of_life_label: str
    phases: list[PhaseOut]


class TransportLegOut(BaseModel):
    """One leg, with the whole product's mass moved along it."""

    mode: TransportModeOut
    distance_km: float
    energy: float | None = None
    carbon: float | None = None
    energy_missing: list[str] = Field(default_factory=list)
    carbon_missing: list[str] = Field(default_factory=list)
    energy_reason: str | None = None
    carbon_reason: str | None = None


class EcoAuditResultOut(BaseModel):
    """A product's five phases, the two totals and the two podiums.

    ``components`` and ``transport_legs`` always come back. The single-part
    fields (``material_id``, ``process_name``, ``transport_mode``…) are filled
    only when the product has exactly one component / one leg, and are ``None``
    otherwise — never the first item standing in for all of them.
    """

    components: list[ComponentOut]
    transport_legs: list[TransportLegOut]
    material_id: int | None = None
    material_name: str | None = None
    process_id: int | None = None
    process_name: str | None = None
    transport_mode: TransportModeOut | None = None
    #: Sum over the legs.
    transport_distance_km: float
    #: What the product weighs, and what had to be bought to make it. Both are on
    #: the answer because the difference between them is the scrap, and the
    #: scrap is why the material phase is larger than a reader might expect.
    mass_in_part: float
    mass_bought: float
    scrap_fraction: float | None = None
    recycled_fraction: float | None = None
    use_model: str
    end_of_life: str | None = None
    phases: list[PhaseOut]
    total_energy: float | None = None
    total_carbon: float | None = None
    energy_dominance: DominanceOut
    carbon_dominance: DominanceOut
    energy_unit: str = ENERGY_UNIT
    carbon_unit: str = CARBON_UNIT
    carbon_unit_note: str = CARBON_UNIT_NOTE
    recycling_credit_note: str = RECYCLING_CREDIT_NOTE


class EcoMaterialInput(BaseModel):
    """Configuration of one material alternative for side-by-side comparison."""

    material_id: int = Field(gt=0, description="Identificador do material")
    process_id: int = Field(gt=0, description="Processo de fabricação da peça")
    part_mass: float = Field(gt=0, le=1.0e6, description="Massa da peça em kg")
    recycled_fraction: float = Field(
        default=0.0, ge=0.0, le=1.0, description="Fração reciclada (0 a 1)"
    )
    end_of_life: EndOfLife = Field(default=EOL_RECYCLE, description="Destino de fim de vida")


class EcoComparisonRequest(BaseModel):
    """Side-by-side comparison brief for two material candidates."""

    material_a: EcoMaterialInput
    material_b: EcoMaterialInput
    transport_mode: str = Field(min_length=1, max_length=80)
    transport_distance_km: float = Field(default=0.0, ge=0.0, le=1.0e6)
    use: UseIn


class EcoComparisonResultOut(BaseModel):
    """Side-by-side comparison result with phase audits and calculated deltas."""

    material_a: EcoAuditResultOut
    material_b: EcoAuditResultOut
    delta_energy: float | None = None
    delta_energy_percent: float | None = None
    delta_carbon: float | None = None
    delta_carbon_percent: float | None = None
    winner_energy: Literal["material_a", "material_b", "tie"] | None = None
    winner_carbon: Literal["material_a", "material_b", "tie"] | None = None
