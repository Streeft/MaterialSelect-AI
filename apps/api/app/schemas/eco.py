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

from pydantic import BaseModel, Field, field_validator

from app.calculations.eco_audit import (
    CARBON_UNIT,
    CARBON_UNIT_NOTE,
    ENERGY_UNIT,
    EOL_INCINERATION,
    EOL_LANDFILL,
    EOL_RECYCLE,
    RECYCLING_CREDIT_NOTE,
    USE_MOBILE,
    USE_STATIC,
)


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


class EcoAuditRequest(BaseModel):
    material_id: int
    #: The process that makes the part. Required, because an eco audit of a part
    #: is an audit of *making* it: without a process there is no manufacturing
    #: phase and no scrap fraction, and the material phase is charged on the
    #: mass bought rather than the mass in the part.
    process_id: int
    part_mass: float = Field(gt=0, le=1.0e6)
    recycled_fraction: float = Field(default=0.0, ge=0.0, le=1.0)
    transport_mode: str = Field(min_length=1, max_length=80)
    transport_distance_km: float = Field(default=0.0, ge=0.0, le=1.0e6)
    use: UseIn
    end_of_life: Literal[EOL_RECYCLE, EOL_LANDFILL, EOL_INCINERATION] = EOL_RECYCLE


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


class EcoAuditResultOut(BaseModel):
    """One part's five phases, the two totals and the two podiums."""

    material_id: int
    material_name: str
    process_id: int
    process_name: str
    transport_mode: TransportModeOut
    transport_distance_km: float
    #: What the part weighs, and what had to be bought to make it. Both are on
    #: the answer because the difference between them is the scrap, and the
    #: scrap is why the material phase is larger than a reader might expect.
    mass_in_part: float
    mass_bought: float
    scrap_fraction: float
    recycled_fraction: float
    use_model: str
    end_of_life: str
    phases: list[PhaseOut]
    total_energy: float | None = None
    total_carbon: float | None = None
    energy_dominance: DominanceOut
    carbon_dominance: DominanceOut
    energy_unit: str = ENERGY_UNIT
    carbon_unit: str = CARBON_UNIT
    carbon_unit_note: str = CARBON_UNIT_NOTE
    recycling_credit_note: str = RECYCLING_CREDIT_NOTE
