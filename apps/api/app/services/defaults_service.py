"""The calculators' starting numbers, assembled from the constants that own them.

No database and no arithmetic: each value is read from the module that
validates or uses it (``schemas.part_cost``, ``calculations.eco_audit``,
``calculations.battery``, ``schemas.solver``), so the endpoint cannot disagree
with the request it prefills. The only job here is to put them in one answer.
"""

from __future__ import annotations

from app.calculations import eco_audit
from app.calculations.battery import (
    APPLICATION_ARCHETYPES,
    DEFAULT_ARCHETYPE_SLUG,
    DEFAULT_COST_PACKING_FACTOR,
    DEFAULT_MASS_PACKING_FACTOR,
    DEFAULT_VOLUME_PACKING_FACTOR,
)
from app.calculations.load_cases import MASS_OBJECTIVE
from app.schemas.defaults import (
    BatteryDefaultsOut,
    CostDefaultsOut,
    DefaultsOut,
    EcoDefaultsOut,
    EcoMobileUseDefaultsOut,
    EcoStaticUseDefaultsOut,
    SolverDefaultsOut,
)
from app.schemas.part_cost import DEFAULT_BATCH_SIZE, DEFAULT_LOAD_FACTOR, DEFAULT_WRITE_OFF_YEARS
from app.schemas.solver import DEFAULT_RESULT_LIMIT

COST_NOTE = (
    "Premissas iniciais do estimador: lote, anos de amortização e fator de carga são "
    "entradas que você altera, não fatos sobre nenhum processo."
)
ECO_NOTE = (
    "Premissas iniciais da auditoria: valores redondos de faixa média para a primeira "
    "conta fazer sentido. São entradas editáveis, não dados de nenhum material."
)
BATTERY_NOTE = (
    "Os três fatores de empacotamento (fração da massa, do volume e do custo do pack que "
    "é célula) são premissa de oficina, editável; o requisito inicial vem do arquétipo "
    "indicado."
)


class DefaultsService:
    """Read-only; it needs nothing from the session."""

    def get(self) -> DefaultsOut:
        archetype = APPLICATION_ARCHETYPES[DEFAULT_ARCHETYPE_SLUG]
        return DefaultsOut(
            custo=CostDefaultsOut(
                batch_size=DEFAULT_BATCH_SIZE,
                write_off_years=DEFAULT_WRITE_OFF_YEARS,
                load_factor=DEFAULT_LOAD_FACTOR,
                note=COST_NOTE,
            ),
            eco=EcoDefaultsOut(
                use_model=eco_audit.DEFAULT_USE_MODEL,
                recycled_fraction=eco_audit.DEFAULT_RECYCLED_FRACTION,
                end_of_life=eco_audit.EOL_RECYCLE,
                transport_distance_km=eco_audit.DEFAULT_TRANSPORT_DISTANCE_KM,
                static=EcoStaticUseDefaultsOut(
                    power_watts=eco_audit.DEFAULT_STATIC_POWER_WATTS,
                    duty_cycle=eco_audit.DEFAULT_STATIC_DUTY_CYCLE,
                    life_years=eco_audit.DEFAULT_LIFE_YEARS,
                    carbon_per_energy=eco_audit.DEFAULT_CARBON_PER_ENERGY,
                ),
                mobile=EcoMobileUseDefaultsOut(
                    distance_km=eco_audit.DEFAULT_MOBILE_DISTANCE_KM,
                    mobile_intensity=eco_audit.DEFAULT_MOBILE_INTENSITY,
                    life_years=eco_audit.DEFAULT_LIFE_YEARS,
                    carbon_per_energy=eco_audit.DEFAULT_CARBON_PER_ENERGY,
                ),
                note=ECO_NOTE,
            ),
            baterias=BatteryDefaultsOut(
                archetype_slug=archetype.slug,
                chemistry_slug=archetype.recommended_chemistries[0],
                voltage_v=archetype.target_voltage,
                energy_kwh=archetype.target_energy_kwh,
                power_kw=archetype.target_power_kw,
                dod=archetype.target_dod,
                cell_capacity_ah=None,
                mass_packing_factor=DEFAULT_MASS_PACKING_FACTOR,
                volume_packing_factor=DEFAULT_VOLUME_PACKING_FACTOR,
                cost_packing_factor=DEFAULT_COST_PACKING_FACTOR,
                note=BATTERY_NOTE,
            ),
            dimensionar=SolverDefaultsOut(objective=MASS_OBJECTIVE, limit=DEFAULT_RESULT_LIMIT),
        )
