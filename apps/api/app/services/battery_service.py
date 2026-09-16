"""Battery Designer service layer (Module S / P4).

Orchestrates the electrochemical catalog, application archetypes, and deterministic
pack sizing calculations, mapping domain dataclasses to Pydantic API response models.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations.battery import (
    APPLICATION_ARCHETYPES,
    BatteryDesignError,
    CellSpec,
    compare_chemistries,
    design_pack,
)
from app.domain.errors import NotFoundError, ValidationError
from app.models.battery_chemistry import BatteryChemistry
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
    """Dimensiona packs contra o catálogo de químicas.

    **A sessão de banco é obrigatória**, e isso é a decisão do item: as químicas
    são dado catalogado, não literal de código (princípio 1), então não existe
    modo de operação em que este serviço responda sem ler o catálogo. Um `db`
    opcional convidaria exatamente o atalho que o P4 veio desfazer.
    """

    def __init__(self, db: Session, viewer_id: int | None = None) -> None:
        self.db = db
        self.viewer_id = viewer_id

    # --- o catálogo ---------------------------------------------------------

    def _rows(self) -> list[BatteryChemistry]:
        return list(
            self.db.execute(
                select(BatteryChemistry)
                .where(BatteryChemistry.is_active.is_(True))
                .order_by(BatteryChemistry.display_order, BatteryChemistry.id)
            )
            .scalars()
            .all()
        )

    def _row(self, slug: str) -> BatteryChemistry:
        row = (
            self.db.execute(select(BatteryChemistry).where(BatteryChemistry.slug == slug))
            .scalars()
            .one_or_none()
        )
        if row is None:
            raise NotFoundError(f"Química de bateria não encontrada: {slug}")
        return row

    @staticmethod
    def _spec(row: BatteryChemistry) -> CellSpec:
        """A forma pura que a álgebra lê. O domínio nunca vê uma linha do ORM."""
        return CellSpec(
            slug=row.slug,
            name=row.name,
            formula=row.formula or "",
            nominal_voltage=row.nominal_voltage,
            specific_energy=row.specific_energy,
            energy_density=row.energy_density,
            specific_power=row.specific_power,
            cycle_efficiency=row.cycle_efficiency,
            cycle_life=row.cycle_life,
            cell_cost_per_kwh=row.cell_cost_per_kwh,
            thermal_safety=row.thermal_safety,
            thermal_runaway_temp_c=row.thermal_runaway_temp_c,
            operating_temp_min_c=row.operating_temp_min_c,
            operating_temp_max_c=row.operating_temp_max_c,
            max_continuous_c_rate=row.max_continuous_c_rate,
            peak_c_rate=row.peak_c_rate,
            description=row.description or "",
            advantages=list(row.advantages),
            limitations=list(row.limitations),
            typical_applications=list(row.typical_applications),
        )

    @staticmethod
    def _out(row: BatteryChemistry) -> BatteryChemistryOut:
        return BatteryChemistryOut(
            slug=row.slug,
            name=row.name,
            formula=row.formula or "",
            nominal_voltage=row.nominal_voltage,
            specific_energy=row.specific_energy,
            energy_density=row.energy_density,
            specific_power=row.specific_power,
            cycle_efficiency=row.cycle_efficiency,
            cycle_life=row.cycle_life,
            cell_cost_per_kwh=row.cell_cost_per_kwh,
            thermal_safety=row.thermal_safety,
            thermal_runaway_temp_c=row.thermal_runaway_temp_c,
            operating_temp_min_c=row.operating_temp_min_c,
            operating_temp_max_c=row.operating_temp_max_c,
            max_continuous_c_rate=row.max_continuous_c_rate,
            peak_c_rate=row.peak_c_rate,
            description=row.description or "",
            advantages=list(row.advantages),
            limitations=list(row.limitations),
            typical_applications=list(row.typical_applications),
            citation=row.citation,
            source=row.source.label if row.source else None,
        )

    def list_chemistries(self) -> list[BatteryChemistryOut]:
        """As químicas catalogadas, na ordem de leitura do catálogo."""
        return [self._out(row) for row in self._rows()]

    def get_chemistry(self, slug: str) -> BatteryChemistryOut:
        """Uma química pelo slug, ou 404 com o slug escrito."""
        return self._out(self._row(slug))

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
        """Dimensiona um pack para a química pedida.

        A linha do catálogo é lida **antes** do `try`: um slug inexistente é
        404 (não encontrado), e não 400 — a receita está bem formada, o que não
        existe é a química. Enfiar as duas no mesmo `except` diria ao cliente
        que ele escreveu algo inválido quando não escreveu.
        """
        row = self._row(request.chemistry_slug)
        try:
            res = design_pack(
                cell=self._spec(row),
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

        return PackDesignResultOut(
            chemistry=self._out(row),
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
                cells=[self._spec(row) for row in self._rows()],
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
