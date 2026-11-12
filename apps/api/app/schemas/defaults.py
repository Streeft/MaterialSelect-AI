"""Contract of ``GET /api/padroes`` — the starting numbers of the calculators (D-216).

Every screen that opens with numbers already in its fields (cost, eco, battery,
solver) used to carry its own copy of them. Two copies drift: the battery
screen shipped 0,65 / 0,50 / 0,70 packing factors while the schema validated
with 0,70 / 0,60 / 0,75. The numbers now live once, as constants next to the
calculation each belongs to, and this contract is how the front reads them.

**These are premises, not facts.** Each block says so in ``note``: a default is
the value the screen starts from and the reader may change, never a property of
any material (principle 1).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class CostDefaultsOut(BaseModel):
    batch_size: float
    write_off_years: float
    load_factor: float
    note: str


class EcoStaticUseDefaultsOut(BaseModel):
    power_watts: float
    duty_cycle: float
    life_years: float
    carbon_per_energy: float


class EcoMobileUseDefaultsOut(BaseModel):
    distance_km: float
    mobile_intensity: float
    life_years: float
    carbon_per_energy: float


class EcoDefaultsOut(BaseModel):
    use_model: Literal["estatico", "movel"]
    recycled_fraction: float
    end_of_life: str
    transport_distance_km: float
    static: EcoStaticUseDefaultsOut
    mobile: EcoMobileUseDefaultsOut
    note: str


class BatteryDefaultsOut(BaseModel):
    archetype_slug: str
    chemistry_slug: str
    voltage_v: float
    energy_kwh: float
    power_kw: float
    dod: float
    #: ``None``: the pack is sized with the chemistry's own cell until the reader
    #: names a capacity. An absence, not a zero.
    cell_capacity_ah: float | None = None
    mass_packing_factor: float
    volume_packing_factor: float
    cost_packing_factor: float
    note: str


class SolverDefaultsOut(BaseModel):
    objective: Literal["massa", "custo"]
    limit: int


class DefaultsOut(BaseModel):
    custo: CostDefaultsOut
    eco: EcoDefaultsOut
    baterias: BatteryDefaultsOut
    dimensionar: SolverDefaultsOut
