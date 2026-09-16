"""Pydantic schemas for the Battery Designer (Module S / P4)."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class BatteryChemistryOut(BaseModel):
    slug: str
    name: str
    formula: str
    nominal_voltage: float
    specific_energy: float
    energy_density: float
    specific_power: float
    cycle_efficiency: float
    cycle_life: int
    cell_cost_per_kwh: float
    thermal_safety: str
    thermal_runaway_temp_c: float
    operating_temp_min_c: float
    operating_temp_max_c: float
    max_continuous_c_rate: float
    peak_c_rate: float
    description: str
    advantages: list[str]
    limitations: list[str]
    typical_applications: list[str]
    reference: str


class ApplicationArchetypeOut(BaseModel):
    slug: str
    name: str
    description: str
    target_voltage: float
    target_energy_kwh: float
    target_power_kw: float
    target_dod: float
    recommended_chemistries: list[str]
    default_cell_capacity_ah: float


class PackDesignRequest(BaseModel):
    chemistry_slug: str = Field(min_length=1, max_length=50)
    target_voltage_v: float = Field(ge=1.0, le=2000.0)
    target_energy_kwh: float = Field(ge=0.001, le=100000.0)
    target_power_kw: float = Field(ge=0.001, le=100000.0)
    dod: float = Field(default=0.85, ge=0.10, le=1.0)
    cell_capacity_ah: float | None = Field(default=None, gt=0.0, le=1000.0)
    mass_packing_factor: float = Field(default=0.70, ge=0.20, le=0.95)
    volume_packing_factor: float = Field(default=0.60, ge=0.20, le=0.95)
    cost_packing_factor: float = Field(default=0.75, ge=0.20, le=0.99)

    @field_validator(
        "target_voltage_v",
        "target_energy_kwh",
        "target_power_kw",
        "dod",
        "mass_packing_factor",
        "volume_packing_factor",
        "cost_packing_factor",
    )
    @classmethod
    def _check_finite(cls, value: float) -> float:
        if value != value or value in (float("inf"), float("-inf")):
            raise ValueError("Valores numéricos devem ser finitos.")
        return value


class PackDesignResultOut(BaseModel):
    chemistry: BatteryChemistryOut
    series_cells_ns: int
    parallel_strings_np: int
    total_cells: int
    cell_capacity_ah: float
    cell_energy_wh: float
    cell_mass_kg: float
    cell_volume_l: float
    cell_peak_power_w: float
    nominal_voltage_v: float
    pack_capacity_ah: float
    gross_energy_kwh: float
    usable_energy_kwh: float
    peak_power_kw: float
    max_continuous_discharge_c_rate: float
    dod: float
    cells_mass_kg: float
    pack_mass_kg: float
    mass_overhead_kg: float
    mass_packing_factor: float
    cells_volume_l: float
    pack_volume_l: float
    volume_overhead_l: float
    volume_packing_factor: float
    pack_specific_energy_wh_kg: float
    pack_energy_density_wh_l: float
    cell_cost_total_usd: float
    pack_cost_total_usd: float
    cost_overhead_usd: float
    cost_packing_factor: float
    cycle_life_at_dod: int
    levelized_cost_per_kwh_cycle: float
    thermal_safety: str
    thermal_guidelines: list[str]


class BatteryComparisonRequest(BaseModel):
    target_voltage_v: float = Field(ge=1.0, le=2000.0)
    target_energy_kwh: float = Field(ge=0.001, le=100000.0)
    target_power_kw: float = Field(ge=0.001, le=100000.0)
    dod: float = Field(default=0.85, ge=0.10, le=1.0)
    cell_capacity_ah: float | None = Field(default=None, gt=0.0, le=1000.0)
    mass_packing_factor: float = Field(default=0.70, ge=0.20, le=0.95)
    volume_packing_factor: float = Field(default=0.60, ge=0.20, le=0.95)
    cost_packing_factor: float = Field(default=0.75, ge=0.20, le=0.99)

    @field_validator(
        "target_voltage_v",
        "target_energy_kwh",
        "target_power_kw",
        "dod",
        "mass_packing_factor",
        "volume_packing_factor",
        "cost_packing_factor",
    )
    @classmethod
    def _check_finite(cls, value: float) -> float:
        if value != value or value in (float("inf"), float("-inf")):
            raise ValueError("Valores numéricos devem ser finitos.")
        return value


class ChemistryComparisonItemOut(BaseModel):
    chemistry_slug: str
    chemistry_name: str
    pack_mass_kg: float
    pack_volume_l: float
    pack_cost_usd: float
    cycle_life: int
    levelized_cost_per_kwh_cycle: float
    pack_specific_energy_wh_kg: float
    pack_energy_density_wh_l: float
    thermal_safety: str
    series_cells_ns: int
    parallel_strings_np: int
    total_cells: int
    usable_energy_kwh: float


class BatteryComparisonResultOut(BaseModel):
    target_voltage: float
    target_energy_kwh: float
    target_power_kw: float
    dod: float
    items: list[ChemistryComparisonItemOut]
    lightest_slug: str
    most_compact_slug: str
    lowest_upfront_cost_slug: str
    most_durable_slug: str
    lowest_levelized_cost_slug: str
    safest_slug: str
    technical_summary: str
