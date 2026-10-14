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

from typing import Literal

from sqlalchemy.orm import Session

from app.calculations.eco_audit import (
    EOL_ROUTE_TABLE,
    EOL_ROUTES,
    SCRAP_FRACTION,
    ComponentBrief,
    EcoAuditError,
    TransportLeg,
    UseAssumptions,
    audit_product,
)
from app.domain.errors import NotFoundError, ValidationError
from app.models.process import Process
from app.repositories.chart_repository import ChartRepository
from app.repositories.process_repository import ProcessRepository
from app.repositories.transport_repository import TransportRepository
from app.schemas.eco import (
    ComponentOut,
    DominanceOut,
    EcoAuditRequest,
    EcoAuditResultOut,
    EcoComparisonRequest,
    EcoComparisonResultOut,
    EcoComponentIn,
    EndOfLifeRouteOut,
    PhaseOut,
    TransportLegOut,
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

    def list_end_of_life_routes(self) -> list[EndOfLifeRouteOut]:
        """The seven routes, each with how many visible materials can price it."""
        priced: dict[str, int] = {}
        for material in self.repo.list_materials():
            values = self._material_values(material)
            for slug, route in EOL_ROUTE_TABLE.items():
                if (
                    route.energy_slug is not None
                    and route.carbon_slug is not None
                    and route.energy_slug in values
                    and route.carbon_slug in values
                ):
                    priced[slug] = priced.get(slug, 0) + 1
        return [
            EndOfLifeRouteOut(
                slug=route.slug,
                label=route.label,
                description=route.description,
                energy_property=route.energy_slug,
                carbon_property=route.carbon_slug,
                materials_with_factor=priced.get(route.slug, 0),
            )
            for route in (EOL_ROUTE_TABLE[slug] for slug in EOL_ROUTES)
        ]

    # --- the audit ---------------------------------------------------------

    def run(self, request: EcoAuditRequest) -> EcoAuditResultOut:
        materials = {material.id: material for material in self.repo.list_materials()}

        resolved: list[tuple[EcoComponentIn, object, Process]] = []
        briefs: list[ComponentBrief] = []
        components_in = request.resolved_components()
        for position, item in enumerate(components_in, start=1):
            material = materials.get(item.material_id)
            if material is None:
                # The same 404 a hidden record gets, for the same reason as
                # everywhere else: a different answer would say whether it exists.
                raise NotFoundError(f"Material não encontrado: {item.material_id}")
            candidates = {
                process.id: process
                for process in self.process_repo.processes_for_material_with_values(material.id)
            }
            process = candidates.get(item.process_id)
            if process is None:
                raise NotFoundError(
                    f"O processo {item.process_id} não está entre os que fazem " f"{material.name}."
                )
            attributes = self._scalars(process)
            scrap = attributes.get(SCRAP_FRACTION)
            if scrap is None:
                # The scrap fraction is what turns the mass in the part into the
                # mass bought. Guessing it would be a zero wearing a disguise.
                raise ValidationError(
                    f"{process.name} não tem fração de refugo cadastrada, e é ela que "
                    "diz quanto material foi preciso comprar para fazer esta peça."
                )
            name = (item.name or "").strip()
            if not name:
                name = (
                    material.name
                    if len(components_in) == 1
                    else (f"Componente {position} ({material.name})")
                )
            resolved.append((item, material, process))
            briefs.append(
                ComponentBrief(
                    name=name,
                    unit_mass=item.unit_mass,
                    quantity=item.quantity,
                    recycled_fraction=item.recycled_fraction,
                    scrap_fraction=scrap,
                    end_of_life=item.end_of_life,
                    material=self._material_values(material),
                    process=attributes,
                )
            )

        modes = []
        for leg in request.resolved_legs():
            mode = self.transport_repo.get_active_by_slug(leg.mode)
            if mode is None:
                raise NotFoundError(f"Modal de transporte não encontrado: {leg.mode}")
            modes.append((mode, leg.distance_km))

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
            result = audit_product(
                components=briefs,
                legs=[
                    TransportLeg(
                        label=mode.name,
                        distance_km=distance,
                        energy_intensity=mode.energy_intensity,
                        carbon_intensity=mode.carbon_intensity,
                    )
                    for mode, distance in modes
                ],
                use=use,
            )
        except EcoAuditError as exc:
            raise ValidationError(str(exc)) from exc

        components_out = [
            ComponentOut(
                name=component.name,
                material_id=material.id,
                material_name=material.name,
                process_id=process.id,
                process_name=process.name,
                quantity=component.quantity,
                unit_mass=component.unit_mass,
                mass_in_part=component.mass_in_part,
                mass_bought=component.mass_bought,
                scrap_fraction=component.scrap_fraction,
                recycled_fraction=component.recycled_fraction,
                end_of_life=component.end_of_life,
                end_of_life_label=component.end_of_life_label,
                phases=[self._phase_out(phase) for phase in component.phases],
            )
            for component, (_, material, process) in zip(result.components, resolved, strict=True)
        ]
        legs_out = [
            TransportLegOut(
                mode=self._mode_out(mode),
                distance_km=leg.distance_km,
                energy=leg.energy,
                carbon=leg.carbon,
                energy_missing=list(leg.energy_missing),
                carbon_missing=list(leg.carbon_missing),
                energy_reason=leg.energy_reason,
                carbon_reason=leg.carbon_reason,
            )
            for leg, (mode, _) in zip(result.legs, modes, strict=True)
        ]
        only = components_out[0] if len(components_out) == 1 else None
        only_leg = legs_out[0] if len(legs_out) == 1 else None
        return EcoAuditResultOut(
            components=components_out,
            transport_legs=legs_out,
            material_id=only.material_id if only else None,
            material_name=only.material_name if only else None,
            process_id=only.process_id if only else None,
            process_name=only.process_name if only else None,
            transport_mode=only_leg.mode if only_leg else None,
            transport_distance_km=sum(leg.distance_km for leg in legs_out),
            mass_in_part=result.mass_in_product,
            mass_bought=result.mass_bought,
            scrap_fraction=only.scrap_fraction if only else None,
            recycled_fraction=only.recycled_fraction if only else None,
            use_model=result.use_model,
            end_of_life=only.end_of_life if only else None,
            phases=[self._phase_out(phase) for phase in result.phases],
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

    @staticmethod
    def _phase_out(phase) -> PhaseOut:
        return PhaseOut(
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

    # --- comparison -------------------------------------------------------

    def compare(self, request: EcoComparisonRequest) -> EcoComparisonResultOut:
        req_a = EcoAuditRequest(
            material_id=request.material_a.material_id,
            process_id=request.material_a.process_id,
            part_mass=request.material_a.part_mass,
            recycled_fraction=request.material_a.recycled_fraction,
            transport_mode=request.transport_mode,
            transport_distance_km=request.transport_distance_km,
            use=request.use,
            end_of_life=request.material_a.end_of_life,
        )
        req_b = EcoAuditRequest(
            material_id=request.material_b.material_id,
            process_id=request.material_b.process_id,
            part_mass=request.material_b.part_mass,
            recycled_fraction=request.material_b.recycled_fraction,
            transport_mode=request.transport_mode,
            transport_distance_km=request.transport_distance_km,
            use=request.use,
            end_of_life=request.material_b.end_of_life,
        )
        res_a = self.run(req_a)
        res_b = self.run(req_b)

        delta_energy: float | None = None
        delta_energy_pct: float | None = None
        winner_energy: Literal["material_a", "material_b", "tie"] | None = None
        if res_a.total_energy is not None and res_b.total_energy is not None:
            delta_energy = round(res_b.total_energy - res_a.total_energy, 4)
            if res_a.total_energy > 0:
                delta_energy_pct = round(
                    ((res_b.total_energy - res_a.total_energy) / res_a.total_energy) * 100.0, 2
                )
            else:
                delta_energy_pct = 0.0
            if abs(delta_energy) < 1e-4:
                winner_energy = "tie"
            elif res_a.total_energy < res_b.total_energy:
                winner_energy = "material_a"
            else:
                winner_energy = "material_b"

        delta_carbon: float | None = None
        delta_carbon_pct: float | None = None
        winner_carbon: Literal["material_a", "material_b", "tie"] | None = None
        if res_a.total_carbon is not None and res_b.total_carbon is not None:
            delta_carbon = round(res_b.total_carbon - res_a.total_carbon, 4)
            if res_a.total_carbon > 0:
                delta_carbon_pct = round(
                    ((res_b.total_carbon - res_a.total_carbon) / res_a.total_carbon) * 100.0, 2
                )
            else:
                delta_carbon_pct = 0.0
            if abs(delta_carbon) < 1e-4:
                winner_carbon = "tie"
            elif res_a.total_carbon < res_b.total_carbon:
                winner_carbon = "material_a"
            else:
                winner_carbon = "material_b"

        return EcoComparisonResultOut(
            material_a=res_a,
            material_b=res_b,
            delta_energy=delta_energy,
            delta_energy_percent=delta_energy_pct,
            delta_carbon=delta_carbon,
            delta_carbon_percent=delta_carbon_pct,
            winner_energy=winner_energy,
            winner_carbon=winner_carbon,
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
