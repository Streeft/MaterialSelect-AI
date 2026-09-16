"""Battery Designer service layer (Module S / P4).

Orchestrates the electrochemical catalog, application archetypes, and deterministic
pack sizing calculations, mapping domain dataclasses to Pydantic API response models.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.calculations.battery import (
    APPLICATION_ARCHETYPES,
    CHEMISTRIES,
    BatteryDesignError,
    compare_chemistries,
    design_pack,
)
from app.domain.errors import NotFoundError, ValidationError
from app.schemas.battery import (
    ApplicationArchetypeOut,
    BatteryChemistryOut,
    BatteryComparisonRequest,
    BatteryComparisonResultOut,
    ChemistryComparisonItemOut,
    PackDesignRequest,
    PackDesignResultOut,
)


class BatteryService:
    """Service providing battery chemistry exploration and pack sizing."""

    def __init__(self, db: Session | None = None, viewer_id: int | None = None) -> None:
        self.db = db
        self.viewer_id = viewer_id

    def list_chemistries(self) -> list[BatteryChemistryOut]:
        """List all catalogued battery chemistries with physical and safety data."""
        return [
            BatteryChemistryOut(
                slug=chem.slug,
                name=chem.name,
                formula=chem.formula,
                nominal_voltage=chem.nominal_voltage,
                specific_energy=chem.specific_energy,
                energy_density=chem.energy_density,
                specific_power=chem.specific_power,
                cycle_efficiency=chem.cycle_efficiency,
                cycle_life=chem.cycle_life,
                cell_cost_per_kwh=chem.cell_cost_per_kwh,
                thermal_safety=chem.thermal_safety,
                thermal_runaway_temp_c=chem.thermal_runaway_temp_c,
                operating_temp_min_c=chem.operating_temp_min_c,
                operating_temp_max_c=chem.operating_temp_max_c,
                max_continuous_c_rate=chem.max_continuous_c_rate,
                peak_c_rate=chem.peak_c_rate,
                description=chem.description,
                advantages=chem.advantages,
                limitations=chem.limitations,
                typical_applications=chem.typical_applications,
                reference=chem.reference,
            )
            for chem in CHEMISTRIES.values()
        ]

    def get_chemistry(self, slug: str) -> BatteryChemistryOut:
        """Fetch details for a specific battery chemistry."""
        chem = CHEMISTRIES.get(slug)
        if chem is None:
            raise NotFoundError(f"Química de bateria não encontrada: {slug}")
        return BatteryChemistryOut(
            slug=chem.slug,
            name=chem.name,
            formula=chem.formula,
            nominal_voltage=chem.nominal_voltage,
            specific_energy=chem.specific_energy,
            energy_density=chem.energy_density,
            specific_power=chem.specific_power,
            cycle_efficiency=chem.cycle_efficiency,
            cycle_life=chem.cycle_life,
            cell_cost_per_kwh=chem.cell_cost_per_kwh,
            thermal_safety=chem.thermal_safety,
            thermal_runaway_temp_c=chem.thermal_runaway_temp_c,
            operating_temp_min_c=chem.operating_temp_min_c,
            operating_temp_max_c=chem.operating_temp_max_c,
            max_continuous_c_rate=chem.max_continuous_c_rate,
            peak_c_rate=chem.peak_c_rate,
            description=chem.description,
            advantages=chem.advantages,
            limitations=chem.limitations,
            typical_applications=chem.typical_applications,
            reference=chem.reference,
        )

    def list_archetypes(self) -> list[ApplicationArchetypeOut]:
        """List standard application presets (EV, Drone, Power Tools, BESS)."""
        return [
            ApplicationArchetypeOut(
                slug=arch.slug,
                name=arch.name,
                description=arch.description,
                target_voltage=arch.target_voltage,
                target_energy_kwh=arch.target_energy_kwh,
                target_power_kw=arch.target_power_kw,
                target_dod=arch.target_dod,
                recommended_chemistries=arch.recommended_chemistries,
                default_cell_capacity_ah=arch.default_cell_capacity_ah,
            )
            for arch in APPLICATION_ARCHETYPES.values()
        ]

    def design(self, request: PackDesignRequest) -> PackDesignResultOut:
        """Size a battery pack for given target parameters."""
        try:
            res = design_pack(
                chemistry_slug=request.chemistry_slug,
                target_voltage_v=request.target_voltage_v,
                target_energy_kwh=request.target_energy_kwh,
                target_power_kw=request.target_power_kw,
                dod=request.dod,
                cell_capacity_ah=request.cell_capacity_ah,
                mass_packing_factor=request.mass_packing_factor,
                volume_packing_factor=request.volume_packing_factor,
                cost_packing_factor=request.cost_packing_factor,
            )
        except BatteryDesignError as exc:
            raise ValidationError(str(exc)) from exc

        chem = res.chemistry
        return PackDesignResultOut(
            chemistry=BatteryChemistryOut(
                slug=chem.slug,
                name=chem.name,
                formula=chem.formula,
                nominal_voltage=chem.nominal_voltage,
                specific_energy=chem.specific_energy,
                energy_density=chem.energy_density,
                specific_power=chem.specific_power,
                cycle_efficiency=chem.cycle_efficiency,
                cycle_life=chem.cycle_life,
                cell_cost_per_kwh=chem.cell_cost_per_kwh,
                thermal_safety=chem.thermal_safety,
                thermal_runaway_temp_c=chem.thermal_runaway_temp_c,
                operating_temp_min_c=chem.operating_temp_min_c,
                operating_temp_max_c=chem.operating_temp_max_c,
                max_continuous_c_rate=chem.max_continuous_c_rate,
                peak_c_rate=chem.peak_c_rate,
                description=chem.description,
                advantages=chem.advantages,
                limitations=chem.limitations,
                typical_applications=chem.typical_applications,
                reference=chem.reference,
            ),
            series_cells_ns=res.series_cells_ns,
            parallel_strings_np=res.parallel_strings_np,
            total_cells=res.total_cells,
            cell_capacity_ah=res.cell_capacity_ah,
            cell_energy_wh=res.cell_energy_wh,
            cell_mass_kg=res.cell_mass_kg,
            cell_volume_l=res.cell_volume_l,
            cell_peak_power_w=res.cell_peak_power_w,
            nominal_voltage_v=res.nominal_voltage_v,
            pack_capacity_ah=res.pack_capacity_ah,
            gross_energy_kwh=res.gross_energy_kwh,
            usable_energy_kwh=res.usable_energy_kwh,
            peak_power_kw=res.peak_power_kw,
            max_continuous_discharge_c_rate=res.max_continuous_discharge_c_rate,
            dod=res.dod,
            cells_mass_kg=res.cells_mass_kg,
            pack_mass_kg=res.pack_mass_kg,
            mass_overhead_kg=res.mass_overhead_kg,
            mass_packing_factor=res.mass_packing_factor,
            cells_volume_l=res.cells_volume_l,
            pack_volume_l=res.pack_volume_l,
            volume_overhead_l=res.volume_overhead_l,
            volume_packing_factor=res.volume_packing_factor,
            pack_specific_energy_wh_kg=res.pack_specific_energy_wh_kg,
            pack_energy_density_wh_l=res.pack_energy_density_wh_l,
            cell_cost_total_usd=res.cell_cost_total_usd,
            pack_cost_total_usd=res.pack_cost_total_usd,
            cost_overhead_usd=res.cost_overhead_usd,
            cost_packing_factor=res.cost_packing_factor,
            cycle_life_at_dod=res.cycle_life_at_dod,
            levelized_cost_per_kwh_cycle=res.levelized_cost_per_kwh_cycle,
            thermal_safety=res.thermal_safety,
            thermal_guidelines=res.thermal_guidelines,
        )

    def compare(self, request: BatteryComparisonRequest) -> BatteryComparisonResultOut:
        """Size and compare all battery chemistries under identical requirements."""
        try:
            res = compare_chemistries(
                target_voltage_v=request.target_voltage_v,
                target_energy_kwh=request.target_energy_kwh,
                target_power_kw=request.target_power_kw,
                dod=request.dod,
                cell_capacity_ah=request.cell_capacity_ah,
                mass_packing_factor=request.mass_packing_factor,
                volume_packing_factor=request.volume_packing_factor,
                cost_packing_factor=request.cost_packing_factor,
            )
        except BatteryDesignError as exc:
            raise ValidationError(str(exc)) from exc

        return BatteryComparisonResultOut(
            target_voltage=res.target_voltage,
            target_energy_kwh=res.target_energy_kwh,
            target_power_kw=res.target_power_kw,
            dod=res.dod,
            items=[
                ChemistryComparisonItemOut(
                    chemistry_slug=it.chemistry_slug,
                    chemistry_name=it.chemistry_name,
                    pack_mass_kg=it.pack_mass_kg,
                    pack_volume_l=it.pack_volume_l,
                    pack_cost_usd=it.pack_cost_usd,
                    cycle_life=it.cycle_life,
                    levelized_cost_per_kwh_cycle=it.levelized_cost_per_kwh_cycle,
                    pack_specific_energy_wh_kg=it.pack_specific_energy_wh_kg,
                    pack_energy_density_wh_l=it.pack_energy_density_wh_l,
                    thermal_safety=it.thermal_safety,
                    series_cells_ns=it.series_cells_ns,
                    parallel_strings_np=it.parallel_strings_np,
                    total_cells=it.total_cells,
                    usable_energy_kwh=it.usable_energy_kwh,
                )
                for it in res.items
            ],
            lightest_slug=res.lightest_slug,
            most_compact_slug=res.most_compact_slug,
            lowest_upfront_cost_slug=res.lowest_upfront_cost_slug,
            most_durable_slug=res.most_durable_slug,
            lowest_levelized_cost_slug=res.lowest_levelized_cost_slug,
            safest_slug=res.safest_slug,
            technical_summary=res.technical_summary,
        )
