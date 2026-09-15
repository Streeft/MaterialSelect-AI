"""Eco Audit: the catalogue side of ``app.calculations.eco_audit`` (P3).

Three catalogues meet here and each answers a different question. The
**material** says what a kilogram of it cost the planet to produce and to
recycle; the **process** says what conforming a kilogram costs and how much it
scraps; the **transport mode** says what moving a tonne a kilometre costs. The
candidate process comes from the ``material_process`` join P0-2 built, so an
audit cannot be run against a process that does not make this material.

Materials are read through ``ChartRepository`` so the P1-4 visibility filter
stays in the single place that already applies it — as ``SimilarityService``,
``SolverService`` and ``PartCostService`` all do.

**Nothing here decides anything about the method.** Which data a brief needs,
what a missing datum costs the answer, and when a podium is refused all live in
the calculation module; this file finds numbers and names them.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.calculations.eco_audit import (
    CO2_FOOTPRINT,
    EMBODIED_ENERGY,
    PROCESS_CO2,
    PROCESS_ENERGY,
    RECYCLE_CO2,
    RECYCLE_ENERGY,
    SCRAP_FRACTION,
    EcoAuditError,
    UseAssumptions,
    audit,
)
from app.domain.errors import NotFoundError, ValidationError
from app.models.process import Process
from app.repositories.chart_repository import ChartRepository
from app.repositories.process_repository import ProcessRepository
from app.repositories.transport_repository import TransportRepository
from app.schemas.eco import (
    DominanceOut,
    EcoAuditRequest,
    EcoAuditResultOut,
    PhaseOut,
    TransportModeOut,
)


class EcoService:
    """Audits one part over its five phases, reading three catalogues."""

    def __init__(self, db: Session, viewer_id: int | None = None) -> None:
        self.viewer_id = viewer_id
        self.repo = ChartRepository(db, viewer_id)
        self.process_repo = ProcessRepository(db)
        self.transport_repo = TransportRepository(db)

    # --- the transport catalogue ------------------------------------------

    def list_transport_modes(self) -> list[TransportModeOut]:
        return [self._mode_out(mode) for mode in self.transport_repo.list_active()]

    # --- the audit ---------------------------------------------------------

    def run(self, request: EcoAuditRequest) -> EcoAuditResultOut:
        materials = {material.id: material for material in self.repo.list_materials()}
        material = materials.get(request.material_id)
        if material is None:
            # The same 404 a hidden record gets, for the same reason as
            # everywhere else: a different answer would say whether it exists.
            raise NotFoundError(f"Material não encontrado: {request.material_id}")

        candidates = {
            process.id: process
            for process in self.process_repo.processes_for_material_with_values(material.id)
        }
        process = candidates.get(request.process_id)
        if process is None:
            raise NotFoundError(
                f"O processo {request.process_id} não está entre os que fazem " f"{material.name}."
            )

        mode = self.transport_repo.get_active_by_slug(request.transport_mode)
        if mode is None:
            raise NotFoundError(f"Modal de transporte não encontrado: {request.transport_mode}")

        attributes = self._scalars(process)
        scrap = attributes.get(SCRAP_FRACTION)
        if scrap is None:
            # The scrap fraction is what turns the mass in the part into the
            # mass bought, and every phase but use and transport is charged on
            # one of the two. Guessing it would be a zero wearing a disguise.
            raise ValidationError(
                f"{process.name} não tem fração de refugo cadastrada, e é ela que "
                "diz quanto material foi preciso comprar para fazer esta peça."
            )

        values = self._material_values(material)
        try:
            use = UseAssumptions(
                model=request.use.model,
                power_watts=request.use.power_watts,
                duty_cycle=request.use.duty_cycle,
                distance_km=request.use.distance_km,
                mobile_intensity=request.use.mobile_intensity,
                life_years=request.use.life_years,
                carbon_per_energy=request.use.carbon_per_energy,
            )
            result = audit(
                mass_in_part=request.part_mass,
                recycled_fraction=request.recycled_fraction,
                scrap_fraction=scrap,
                embodied_energy=values.get(EMBODIED_ENERGY),
                carbon_footprint=values.get(CO2_FOOTPRINT),
                recycle_energy=values.get(RECYCLE_ENERGY),
                recycle_carbon=values.get(RECYCLE_CO2),
                process_energy=attributes.get(PROCESS_ENERGY),
                process_carbon=attributes.get(PROCESS_CO2),
                transport_distance_km=request.transport_distance_km,
                transport_energy_intensity=mode.energy_intensity,
                transport_carbon_intensity=mode.carbon_intensity,
                use=use,
                end_of_life=request.end_of_life,
            )
        except EcoAuditError as exc:
            raise ValidationError(str(exc)) from exc

        return EcoAuditResultOut(
            material_id=material.id,
            material_name=material.name,
            process_id=process.id,
            process_name=process.name,
            transport_mode=self._mode_out(mode),
            transport_distance_km=request.transport_distance_km,
            mass_in_part=result.mass_in_part,
            mass_bought=result.mass_bought,
            scrap_fraction=result.scrap_fraction,
            recycled_fraction=request.recycled_fraction,
            use_model=result.use_model,
            end_of_life=result.end_of_life,
            phases=[
                PhaseOut(
                    phase=phase.phase,
                    label=phase.label,
                    energy=phase.energy,
                    carbon=phase.carbon,
                    detail=phase.detail,
                    energy_missing=list(phase.energy_missing),
                    carbon_missing=list(phase.carbon_missing),
                    energy_reason=phase.energy_reason,
                    carbon_reason=phase.carbon_reason,
                )
                for phase in result.phases
            ],
            total_energy=result.total_energy,
            total_carbon=result.total_carbon,
            energy_dominance=DominanceOut(
                phase=result.energy_dominance.phase,
                label=result.energy_dominance.label,
                share=result.energy_dominance.share,
                refusal=result.energy_dominance.refusal,
            ),
            carbon_dominance=DominanceOut(
                phase=result.carbon_dominance.phase,
                label=result.carbon_dominance.label,
                share=result.carbon_dominance.share,
                refusal=result.carbon_dominance.refusal,
            ),
        )

    # --- shaping ----------------------------------------------------------

    @staticmethod
    def _mode_out(mode) -> TransportModeOut:
        return TransportModeOut(
            slug=mode.slug,
            name=mode.name,
            description=mode.description,
            energy_intensity=mode.energy_intensity,
            carbon_intensity=mode.carbon_intensity,
            is_demo=mode.is_demo,
        )

    @staticmethod
    def _material_values(material) -> dict[str, float]:
        """The material's usable environmental values, keyed by slug.

        A row flagged missing, a row with no normalised value and a slug with no
        row at all are three data states with one answer to the only question
        asked here: the phase that needs it cannot be computed (principle 3).
        """
        values: dict[str, float] = {}
        for value in material.property_values:
            if value.is_missing or value.normalized_value is None:
                continue
            values[value.property_definition.slug] = float(value.normalized_value)
        return values

    @staticmethod
    def _scalars(process: Process) -> dict[str, float]:
        """The process's usable scalar attribute values, keyed by slug."""
        values: dict[str, float] = {}
        for value in process.attribute_values:
            if value.is_missing or value.normalized_value is None:
                continue
            values[value.attribute.slug] = float(value.normalized_value)
        return values
