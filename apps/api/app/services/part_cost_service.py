"""Part Cost Estimator: the catalogue side of ``app.calculations.part_cost`` (P3).

This is where the two universes meet. The **material** answers "how much does a
kilogram cost"; the **process** answers "what does the tooling cost and how fast
does it run"; and the candidate set is the ``material_process`` join the P0-2
built — which is why this item waited for that one.

Reading material through ``ChartRepository`` keeps the P1-4 visibility filter in
the single place that already applies it, exactly as ``SimilarityService`` and
``SolverService`` do.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.calculations.part_cost import (
    CAPITAL_COST,
    MATERIAL_COST_SLUG,
    OVERHEAD_RATE,
    PRODUCTION_RATE,
    REQUIRED_PROCESS_ATTRIBUTES,
    SCRAP_FRACTION,
    TOOLING_COST,
    PartCostError,
    ShopAssumptions,
    cost_terms,
)
from app.domain.errors import NotFoundError, ValidationError
from app.models.process import Process
from app.repositories.chart_repository import ChartRepository
from app.repositories.process_repository import ProcessRepository
from app.schemas.part_cost import (
    CostedProcessOut,
    CostRequest,
    CostResultOut,
    CostTermsOut,
    UncostedProcessOut,
)


class PartCostService:
    """Prices one part, across every process that can make it."""

    def __init__(self, db: Session, viewer_id: int | None = None) -> None:
        self.viewer_id = viewer_id
        self.repo = ChartRepository(db, viewer_id)
        self.process_repo = ProcessRepository(db)

    def estimate(self, request: CostRequest) -> CostResultOut:
        materials = {material.id: material for material in self.repo.list_materials()}
        material = materials.get(request.material_id)
        if material is None:
            # The same 404 a hidden record gets, for the same reason as
            # everywhere else: a different answer would say whether it exists.
            raise NotFoundError(f"Material não encontrado: {request.material_id}")

        cost_per_mass = self._material_cost(material)
        if cost_per_mass is None:
            raise ValidationError(
                f"{material.name} não tem custo por massa cadastrado, e o termo de "
                "material é o piso da estimativa — sem ele não há estimativa, só "
                "uma parte dela."
            )

        try:
            assumptions = ShopAssumptions(
                write_off_years=request.write_off_years,
                load_factor=request.load_factor,
            )
        except PartCostError as exc:
            raise ValidationError(str(exc)) from exc

        labels = {
            attribute.slug: attribute.name for attribute in self.process_repo.list_attributes()
        }
        costed: list[CostedProcessOut] = []
        uncosted: list[UncostedProcessOut] = []

        for process in self.process_repo.processes_for_material_with_values(material.id):
            values = self._scalars(process)
            missing = sorted(slug for slug in REQUIRED_PROCESS_ATTRIBUTES if slug not in values)
            if missing:
                uncosted.append(
                    UncostedProcessOut(
                        process_id=process.id,
                        process_slug=process.slug,
                        process_name=process.name,
                        missing_slugs=missing,
                        missing_labels=[labels.get(slug, slug) for slug in missing],
                        reason="Sem dado econômico: "
                        + ", ".join(labels.get(s, s) for s in missing),
                    )
                )
                continue
            try:
                terms = cost_terms(
                    part_mass=request.part_mass,
                    material_cost_per_mass=cost_per_mass,
                    tooling_cost=values[TOOLING_COST],
                    production_rate=values[PRODUCTION_RATE],
                    capital_cost=values[CAPITAL_COST],
                    overhead_rate=values[OVERHEAD_RATE],
                    scrap_fraction=values[SCRAP_FRACTION],
                    batch_size=request.batch_size,
                    assumptions=assumptions,
                )
            except PartCostError as exc:
                # A catalogued value the equation cannot use — a rate of zero, a
                # scrap fraction of 1 — is this process's problem, not the
                # brief's: report it beside the others rather than failing the
                # whole answer, the way PROMETHEE degrades instead of raising.
                uncosted.append(
                    UncostedProcessOut(
                        process_id=process.id,
                        process_slug=process.slug,
                        process_name=process.name,
                        missing_slugs=[],
                        missing_labels=[],
                        reason=str(exc),
                    )
                )
                continue
            costed.append(
                CostedProcessOut(
                    process_id=process.id,
                    process_slug=process.slug,
                    process_name=process.name,
                    class_name=process.process_class.name,
                    rank=0,
                    terms=CostTermsOut(
                        material=terms.material,
                        tooling=terms.tooling,
                        overhead=terms.overhead,
                        capital=terms.capital,
                        total=terms.total,
                        batch_sensitive=terms.batch_sensitive,
                    ),
                )
            )

        costed.sort(key=lambda item: (item.terms.total, item.process_name))
        ranked = [
            item.model_copy(update={"rank": position})
            for position, item in enumerate(costed, start=1)
        ]
        uncosted.sort(key=lambda item: item.process_name)

        return CostResultOut(
            material_id=material.id,
            material_name=material.name,
            part_mass=request.part_mass,
            batch_size=request.batch_size,
            write_off_years=request.write_off_years,
            load_factor=request.load_factor,
            material_cost_per_mass=cost_per_mass,
            costed=ranked,
            uncosted=uncosted,
        )

    @staticmethod
    def _material_cost(material) -> float | None:
        """The catalogued cost per mass, or ``None`` when nobody recorded one."""
        for value in material.property_values:
            if value.property_definition.slug != MATERIAL_COST_SLUG:
                continue
            if value.is_missing or value.normalized_value is None:
                return None
            return float(value.normalized_value)
        return None

    @staticmethod
    def _scalars(process: Process) -> dict[str, float]:
        """The process's usable scalar attribute values, keyed by slug.

        A row that says ``is_missing`` and a slug with no row at all are both
        simply absent here — the same answer to the one question this service
        asks, which is whether the equation can be evaluated (principle 3).
        """
        values: dict[str, float] = {}
        for value in process.attribute_values:
            if value.is_missing or value.normalized_value is None:
                continue
            values[value.attribute.slug] = float(value.normalized_value)
        return values
