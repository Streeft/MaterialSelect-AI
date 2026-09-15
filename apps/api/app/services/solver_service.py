"""Engineering Solver and Performance Index Finder: the catalogue side (P2).

The Finder is ``list_cases``: it hands back the load-case catalogue with each
case's function, constraint and objective, and the index that falls out of the
derivation — **joined to the catalogued index at read time**, so the expression
a reader sees is the one the solver will run. Nothing here authors a formula.

The Solver is ``solve``: same catalogue, one case, plus the design numbers.

Both read materials through ``ChartRepository``, like ``SimilarityService``, so
the P1-4 visibility filter is applied in the one place that already applies it.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.calculations.expressions import ExpressionError, variables_in
from app.calculations.load_cases import LOAD_CASES, LoadCase, by_key
from app.calculations.solver import RecordValues, SolverError, solve
from app.domain.errors import NotFoundError, ValidationError
from app.models.material import Material
from app.models.performance_index import PerformanceIndex
from app.repositories.chart_repository import ChartRepository
from app.repositories.selection_repository import SelectionRepository
from app.schemas.solver import (
    DesignVariableOut,
    LoadCaseOut,
    SolvedRecordOut,
    SolveRequest,
    SolveResultOut,
    SolverExcludedOut,
    SupportConditionOut,
)


class SolverService:
    """Turns a design brief into masses, and a facet into an index."""

    def __init__(self, db: Session, viewer_id: int | None = None) -> None:
        self.viewer_id = viewer_id
        self.repo = ChartRepository(db, viewer_id)
        self.selection_repo = SelectionRepository(db, viewer_id)

    # --- Performance Index Finder -----------------------------------------

    def list_cases(self) -> list[LoadCaseOut]:
        """Every case, with the catalogued index it yields."""
        indices = {index.slug: index for index in self.selection_repo.list_indices()}
        return [self._case_out(case, indices.get(case.index_slug)) for case in LOAD_CASES]

    def get_case(self, key: str) -> LoadCaseOut:
        case = by_key(key)
        if case is None:
            raise NotFoundError(f"Caso de carga não encontrado: {key}")
        indices = {index.slug: index for index in self.selection_repo.list_indices()}
        return self._case_out(case, indices.get(case.index_slug))

    # --- Engineering Solver -----------------------------------------------

    def solve(self, request: SolveRequest) -> SolveResultOut:
        case = by_key(request.case_key)
        if case is None:
            raise NotFoundError(f"Caso de carga não encontrado: {request.case_key}")

        index = next(
            (
                candidate
                for candidate in self.selection_repo.list_indices()
                if candidate.slug == case.index_slug
            ),
            None,
        )
        if index is None:
            # The load-case catalogue is code and the index catalogue is data;
            # a database the seed never reached can have one without the other.
            raise NotFoundError(
                f"O índice {case.index_slug}, que este caso produz, não está no catálogo."
            )

        definitions = {p.slug: p for p in self.repo.list_properties()}
        try:
            needed = variables_in(index.expression) | variables_in(case.free_material)
        except ExpressionError as exc:
            raise ValidationError(f"Expressão inválida no catálogo: {exc}") from exc
        unknown = sorted(needed - set(definitions))
        if unknown:
            raise ValidationError(
                "O índice deste caso usa propriedades que não estão no catálogo: "
                + ", ".join(unknown)
            )

        materials = self.repo.list_materials()
        by_id = {material.id: material for material in materials}
        basis = sorted(needed)
        records: list[RecordValues] = [
            (material.id, material.name, self._values(material, basis)) for material in materials
        ]
        property_units = {slug: definitions[slug].canonical_unit for slug in basis}

        try:
            result = solve(
                case,
                index_expression=index.expression,
                index_goal=index.goal,
                index_variables=variables_in(index.expression),
                inputs=dict(request.inputs),
                records=records,
                property_units=property_units,
                limit=request.limit,
            )
        except SolverError as exc:
            raise ValidationError(str(exc)) from exc

        def label(slug: str) -> str:
            """The property as a reader knows it — never the slug on screen."""
            definition = definitions.get(slug)
            return definition.name if definition else slug

        return SolveResultOut(
            case=self._case_out(case, index),
            inputs=dict(request.inputs),
            structural_factor=result.structural_factor,
            free_structural_factor=result.free_structural_factor,
            objective_unit=result.objective_unit,
            free_unit=result.free_unit,
            objective_dimension=result.objective_dimension,
            free_dimension=result.free_dimension,
            solved=[
                SolvedRecordOut(
                    record_id=record.record_id,
                    name=record.name,
                    class_name=by_id[record.record_id].material_class.name,
                    class_slug=by_id[record.record_id].material_class.slug,
                    is_demo=by_id[record.record_id].is_demo,
                    is_own_record=by_id[record.record_id].owner_id is not None,
                    rank=record.rank,
                    index_value=record.index_value,
                    objective_value=record.objective_value,
                    free_value=record.free_value,
                )
                for record in result.solved
            ],
            excluded=[
                SolverExcludedOut(
                    record_id=item.record_id,
                    name=item.name,
                    missing_slugs=item.missing_keys,
                    missing_labels=[label(slug) for slug in item.missing_keys],
                    reason=item.reason,
                )
                for item in result.excluded
            ],
        )

    # --- shaping ----------------------------------------------------------

    @staticmethod
    def _case_out(case: LoadCase, index: PerformanceIndex | None) -> LoadCaseOut:
        return LoadCaseOut(
            key=case.key,
            label=case.label,
            summary=case.summary,
            # The function is the case's own label; the manual's flow reads
            # função → restrição → objetivo, and these three are the facets.
            function_label=case.label,
            constraint_label=case.constraint_label,
            objective_label=case.objective_label,
            free_variable_label=case.free_variable_label,
            fixed_labels=list(case.fixed_labels),
            derivation=list(case.derivation),
            reference=case.reference,
            index_slug=case.index_slug,
            index_name=index.name if index else None,
            index_expression=index.expression if index else None,
            index_goal=index.goal if index else None,
            objective_unit=case.objective_unit,
            free_unit=case.free_unit,
            variables=[
                DesignVariableOut(
                    key=variable.key,
                    label=variable.label,
                    unit=variable.unit,
                    help_text=variable.help_text,
                )
                for variable in case.variables
            ],
            supports=[
                SupportConditionOut(
                    key=support.key,
                    label=support.label,
                    variable_key=support.variable_key,
                    value=support.value,
                    note=support.note,
                )
                for support in case.supports
            ],
        )

    @staticmethod
    def _values(material: Material, basis: list[str]) -> dict[str, float | None]:
        """One material's canonical values over the properties this case needs.

        ``None`` for a property the material declares missing, holds no
        normalised value for, or has no row for at all — three data states with
        one answer to this question: it cannot be dimensioned (principle 3).
        """
        by_slug = {v.property_definition.slug: v for v in material.property_values}
        values: dict[str, float | None] = {}
        for slug in basis:
            value = by_slug.get(slug)
            if value is None or value.is_missing or value.normalized_value is None:
                values[slug] = None
            else:
                values[slug] = float(value.normalized_value)
        return values
