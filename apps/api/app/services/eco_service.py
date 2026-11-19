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
    CARBON_UNIT,
    ENERGY_UNIT,
    EOL_ROUTE_TABLE,
    EOL_ROUTES,
    SCRAP_FRACTION,
    ComponentBrief,
    EcoAuditError,
    TransportLeg,
    UseAssumptions,
    audit_part,
    audit_product,
    build_difference_waterfall,
    build_waterfall,
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
    EcoExtraAlternativeOut,
    EndOfLifeRouteOut,
    PartFootprintOut,
    PhaseDeltaOut,
    PhaseOut,
    TransportLegOut,
    TransportModeOut,
    WaterfallOut,
    WaterfallStepOut,
)


def _difference(a: float | None, b: float | None) -> float | None:
    """B minus A, or ``None`` when either is unknown (an absence is not a zero)."""
    return None if a is None or b is None else b - a


def _percent(base: float | None, delta: float | None) -> float | None:
    """``delta`` as a percentage of ``base``; ``None`` when either is unknown."""
    if base is None or delta is None:
        return None
    return round(delta / base * 100.0, 2) if base > 0 else 0.0


def _lowest(labels: list[str], totals: list[float | None]) -> list[str] | None:
    """Labels holding the lowest total (ties within 1e-4), or ``None`` with any gap."""
    if any(total is None for total in totals):
        return None
    known = [total for total in totals if total is not None]
    best = min(known)
    return [label for label, total in zip(labels, known, strict=True) if total - best < 1e-4]


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
        # Only the factors the routes name (D-231): the count reads nothing else,
        # and loading every value of every material cost ~170 MB per call.
        factor_slugs = sorted(
            {
                slug
                for route in EOL_ROUTE_TABLE.values()
                for slug in (route.energy_slug, route.carbon_slug)
                if slug is not None
            }
        )
        for material in self.repo.list_materials(property_slugs=factor_slugs):
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
        components_in = request.resolved_components()
        # Only the materials of this product (D-231), not the whole catalogue
        # with every value; a hidden or inactive one is absent and 404s below.
        wanted = sorted({item.material_id for item in components_in})
        materials = {
            material.id: material for material in self.repo.list_materials(material_ids=wanted)
        }

        resolved: list[tuple[EcoComponentIn, object, Process]] = []
        briefs: list[ComponentBrief] = []
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
            energy_waterfall=self._waterfall_out(
                build_waterfall(result.phases, "energy", result.energy_unit, result.total_energy)
            ),
            carbon_waterfall=self._waterfall_out(
                build_waterfall(result.phases, "carbon", result.carbon_unit, result.total_carbon)
            ),
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

    def part_footprint(
        self,
        material_id: int,
        part_mass: float,
        *,
        process_id: int | None = None,
        process_choice: str | None = None,
    ) -> PartFootprintOut:
        """Material, manufatura and fim de vida of one part (D-241).

        ``process_id`` is the process the caller already chose (the laudo passes
        the cheapest one at the batch); when it is absent or cannot be used, the
        first compatible process, by name, with a scrap fraction is taken, and
        ``process_choice`` says which rule decided. End of life is recycling, the
        audit's own default. Never raises for missing data: the reason is written.
        """
        materials = self.repo.list_materials(material_ids=[material_id])
        if not materials:
            return PartFootprintOut(
                material_id=material_id, part_mass=part_mass, reason="Material não encontrado."
            )
        material = materials[0]
        compatible = self.process_repo.processes_for_material_with_values(material.id)
        usable = [p for p in compatible if SCRAP_FRACTION in self._scalars(p)]
        chosen = next((p for p in usable if p.id == process_id), None)
        if chosen is None and usable:
            chosen = usable[0]
            process_choice = (
                "primeiro processo compatível, em ordem alfabética, com fração de refugo cadastrada"
            )
        if chosen is None:
            reason = (
                "Nenhum processo compatível com este material tem fração de refugo cadastrada."
                if compatible
                else "Nenhum processo compatível com este material está cadastrado."
            )
            return PartFootprintOut(
                material_id=material.id,
                material_name=material.name,
                part_mass=part_mass,
                reason=reason,
            )
        attributes = self._scalars(chosen)
        brief = ComponentBrief(
            name=material.name,
            unit_mass=part_mass,
            quantity=1,
            recycled_fraction=0.0,
            scrap_fraction=attributes[SCRAP_FRACTION],
            end_of_life=EcoComponentIn.model_fields["end_of_life"].default,
            material=self._material_values(material),
            process=attributes,
        )
        try:
            component, total_energy, total_carbon = audit_part(brief)
        except EcoAuditError as exc:
            return PartFootprintOut(
                material_id=material.id,
                material_name=material.name,
                process_id=chosen.id,
                process_name=chosen.name,
                part_mass=part_mass,
                reason=str(exc),
            )
        return PartFootprintOut(
            material_id=material.id,
            material_name=material.name,
            process_id=chosen.id,
            process_name=chosen.name,
            process_choice=process_choice,
            part_mass=part_mass,
            end_of_life=component.end_of_life,
            end_of_life_label=component.end_of_life_label,
            phases=[self._phase_out(phase) for phase in component.phases],
            total_energy=total_energy,
            total_carbon=total_carbon,
            energy_waterfall=self._waterfall_out(
                build_waterfall(component.phases, "energy", ENERGY_UNIT, total_energy)
            ),
            carbon_waterfall=self._waterfall_out(
                build_waterfall(component.phases, "carbon", CARBON_UNIT, total_carbon)
            ),
        )

    @staticmethod
    def _waterfall_out(waterfall) -> WaterfallOut:
        def step(item) -> WaterfallStepOut:
            return WaterfallStepOut(
                phase=item.phase,
                label=item.label,
                value=item.value,
                start=item.start,
                end=item.end,
                reason=item.reason,
            )

        return WaterfallOut(
            quantity=waterfall.quantity,
            unit=waterfall.unit,
            steps=[step(item) for item in waterfall.steps],
            total=step(waterfall.total),
            domain=waterfall.domain,
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

    @staticmethod
    def _audit_request(side, request: EcoComparisonRequest) -> EcoAuditRequest:
        """One alternative of a comparison as an audit; transport and use are shared."""
        return EcoAuditRequest(
            material_id=side.material_id,
            process_id=side.process_id,
            part_mass=side.part_mass,
            recycled_fraction=side.recycled_fraction,
            transport_mode=request.transport_mode,
            transport_distance_km=request.transport_distance_km,
            use=request.use,
            end_of_life=side.end_of_life,
        )

    def _extra_alternative(
        self, label: str, audit: EcoAuditResultOut, base: EcoAuditResultOut
    ) -> EcoExtraAlternativeOut:
        """``audit`` against ``base`` (A): differences and the two cascades (D-251)."""
        delta_energy = _difference(base.total_energy, audit.total_energy)
        delta_carbon = _difference(base.total_carbon, audit.total_carbon)
        return EcoExtraAlternativeOut(
            label=label,
            audit=audit,
            delta_energy=None if delta_energy is None else round(delta_energy, 4),
            delta_energy_percent=_percent(base.total_energy, delta_energy),
            delta_carbon=None if delta_carbon is None else round(delta_carbon, 4),
            delta_carbon_percent=_percent(base.total_carbon, delta_carbon),
            energy_difference_waterfall=self._waterfall_out(
                build_difference_waterfall(
                    base.phases,
                    audit.phases,
                    "energy",
                    base.energy_unit,
                    base.total_energy,
                    audit.total_energy,
                    label_b=label,
                )
            ),
            carbon_difference_waterfall=self._waterfall_out(
                build_difference_waterfall(
                    base.phases,
                    audit.phases,
                    "carbon",
                    base.carbon_unit,
                    base.total_carbon,
                    audit.total_carbon,
                    label_b=label,
                )
            ),
        )

    def compare(self, request: EcoComparisonRequest) -> EcoComparisonResultOut:
        req_a = self._audit_request(request.material_a, request)
        req_b = self._audit_request(request.material_b, request)
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

        # B minus A per phase, here and not in the browser (ADR 0004). A phase
        # either side could not compute has no difference — never a zero.
        phase_deltas = [
            PhaseDeltaOut(
                phase=pa.phase,
                label=pa.label,
                delta_energy=_difference(pa.energy, pb.energy),
                delta_carbon=_difference(pa.carbon, pb.carbon),
            )
            for pa, pb in zip(res_a.phases, res_b.phases, strict=True)
        ]

        # Alternatives beyond B (D-251): each is measured against A, and the lowest
        # total is named over all of them — only when every total exists.
        extra_results = [
            self.run(self._audit_request(side, request)) for side in request.extra_materials
        ]
        labels = ["A", "B", *("CD"[index] for index in range(len(extra_results)))]
        audits = [res_a, res_b, *extra_results]
        extras = [
            self._extra_alternative(label, audit, res_a)
            for label, audit in zip(labels[2:], extra_results, strict=True)
        ]

        return EcoComparisonResultOut(
            material_a=res_a,
            material_b=res_b,
            delta_energy=delta_energy,
            delta_energy_percent=delta_energy_pct,
            delta_carbon=delta_carbon,
            delta_carbon_percent=delta_carbon_pct,
            winner_energy=winner_energy,
            winner_carbon=winner_carbon,
            phase_deltas=phase_deltas,
            energy_difference_waterfall=self._waterfall_out(
                build_difference_waterfall(
                    res_a.phases,
                    res_b.phases,
                    "energy",
                    res_a.energy_unit,
                    res_a.total_energy,
                    res_b.total_energy,
                )
            ),
            carbon_difference_waterfall=self._waterfall_out(
                build_difference_waterfall(
                    res_a.phases,
                    res_b.phases,
                    "carbon",
                    res_a.carbon_unit,
                    res_a.total_carbon,
                    res_b.total_carbon,
                )
            ),
            extras=extras,
            lowest_energy=(
                _lowest(labels, [audit.total_energy for audit in audits]) if extras else None
            ),
            lowest_carbon=(
                _lowest(labels, [audit.total_carbon for audit in audits]) if extras else None
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
