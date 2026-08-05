"""Deterministic selection pipeline: filter → performance index → ranking.

This service is the reproducible-without-AI core of the product. It builds
in-memory snapshots of active materials, converts constraint thresholds to
canonical units, evaluates constraints, computes safe index expressions, and
ranks candidates — delegating the arithmetic to the pure ``domain`` /
``calculations`` layers.
"""

from __future__ import annotations

from app.calculations.expressions import (
    ExpressionError,
    result_dimension,
    safe_variable,
    validate_names,
)
from app.calculations.performance import evaluate_index
from app.calculations.units import UnitError, to_canonical
from app.domain.errors import ConflictError, NotFoundError, ValidationError
from app.domain.filters import (
    Constraint,
    MaterialSnapshot,
    Operator,
    apply_constraints,
)
from app.domain.ranking import Criterion, Direction, Normalization, rank
from app.domain.slug import slugify
from app.models.enums import BetterDirection
from app.models.performance_index import PerformanceIndex
from app.models.selection import RankingCriterion, SelectionConstraint, SelectionStudy
from app.repositories.selection_repository import SelectionRepository
from app.schemas.selection import (
    CandidateOut,
    ConstraintIn,
    ContributionOut,
    CriterionIn,
    ExcludedMaterialOut,
    FilterRequest,
    FilterResultOut,
    FunnelStepOut,
    IndexIn,
    IndexRequest,
    IndexResultOut,
    IndexValueOut,
    PerformanceIndexOut,
    RankedMaterialOut,
    RankingIn,
    RankingResultOut,
    RunRequest,
    RunResultOut,
    SensitivityScenarioOut,
    StudyIn,
    StudyOut,
    StudySummaryOut,
)

INDEX_KEY = "__index__"
_NUMERIC_OPS = {
    Operator.GT,
    Operator.GTE,
    Operator.LT,
    Operator.LTE,
    Operator.BETWEEN,
    Operator.OUTSIDE,
}


class SelectionService:
    """Orchestrates the deterministic selection endpoints."""

    def __init__(self, db) -> None:
        self.repo = SelectionRepository(db)
        self._snapshots: list[MaterialSnapshot] | None = None
        self._props: dict = {}

    # --- snapshot ---------------------------------------------------------

    def _load(self) -> list[MaterialSnapshot]:
        if self._snapshots is None:
            self._props = {p.slug: p for p in self.repo.list_properties()}
            self._snapshots = [
                self._to_snapshot(m) for m in self.repo.list_active_materials_with_values()
            ]
        return self._snapshots

    @staticmethod
    def _to_snapshot(material) -> MaterialSnapshot:
        values: dict[str, float] = {}
        for value in material.property_values:
            if not value.is_missing and value.normalized_value is not None:
                values[value.property_definition.slug] = value.normalized_value
        return MaterialSnapshot(
            id=material.id,
            name=material.name,
            class_name=material.material_class.name,
            class_slug=material.material_class.slug,
            keywords=list(material.keywords or []),
            values=values,
        )

    # --- constraints ------------------------------------------------------

    def _convert_threshold(self, value: float, unit: str, canonical: str) -> float:
        try:
            converted, _ = to_canonical(value, unit, canonical)
        except UnitError as exc:
            raise ValidationError(str(exc)) from exc
        return converted

    def _build_constraint(self, payload: ConstraintIn) -> Constraint:
        op = Operator(payload.operator)
        label = payload.label or self._default_label(payload)

        if op in _NUMERIC_OPS:
            prop = self._props.get(payload.property_slug)
            if prop is None:
                raise NotFoundError(f"Propriedade não encontrada: {payload.property_slug}")
            unit = payload.unit or prop.canonical_unit
            value = (
                self._convert_threshold(payload.value, unit, prop.canonical_unit)
                if payload.value is not None
                else None
            )
            vmin = (
                self._convert_threshold(payload.value_min, unit, prop.canonical_unit)
                if payload.value_min is not None
                else None
            )
            vmax = (
                self._convert_threshold(payload.value_max, unit, prop.canonical_unit)
                if payload.value_max is not None
                else None
            )
            if op in (Operator.BETWEEN, Operator.OUTSIDE):
                if vmin is None or vmax is None:
                    raise ValidationError("Faixa requer valor mínimo e máximo.")
                if vmin > vmax:
                    raise ValidationError("Faixa inválida: mínimo maior que máximo.")
            elif value is None:
                raise ValidationError(f"O operador '{op.value}' requer um valor.")
            return Constraint(
                operator=op,
                label=label,
                property_slug=payload.property_slug,
                value=value,
                value_min=vmin,
                value_max=vmax,
            )

        if op in (Operator.EXISTS, Operator.NOT_EXISTS):
            if not payload.property_slug or payload.property_slug not in self._props:
                raise NotFoundError(f"Propriedade não encontrada: {payload.property_slug}")
            return Constraint(operator=op, label=label, property_slug=payload.property_slug)

        if op in (Operator.IN_CLASS, Operator.NOT_IN_CLASS):
            if not payload.class_slugs:
                raise ValidationError("Selecione ao menos uma classe.")
            existing = self.repo.existing_class_slugs(payload.class_slugs)
            unknown = sorted(set(payload.class_slugs) - existing)
            if unknown:
                raise NotFoundError(f"Classes desconhecidas: {', '.join(unknown)}")
            return Constraint(operator=op, label=label, class_slugs=payload.class_slugs)

        # TEXT_CONTAINS
        if not payload.text or not payload.text.strip():
            raise ValidationError("Informe o texto a pesquisar.")
        return Constraint(operator=op, label=label, text=payload.text)

    def _default_label(self, payload: ConstraintIn) -> str:
        prop = self._props.get(payload.property_slug) if payload.property_slug else None
        prop_name = prop.name if prop else (payload.property_slug or "")
        symbols = {
            "gt": ">",
            "gte": "≥",
            "lt": "<",
            "lte": "≤",
            "between": "∈",
            "outside": "∉",
        }
        if payload.operator in symbols:
            if payload.operator in ("between", "outside"):
                return f"{prop_name} {symbols[payload.operator]} [{payload.value_min}, {payload.value_max}] {payload.unit or (prop.canonical_unit if prop else '')}"
            return f"{prop_name} {symbols[payload.operator]} {payload.value} {payload.unit or (prop.canonical_unit if prop else '')}"
        labels = {
            "exists": f"{prop_name} definido",
            "not_exists": f"{prop_name} ausente",
            "in_class": f"Classe ∈ {', '.join(payload.class_slugs)}",
            "not_in_class": f"Classe ∉ {', '.join(payload.class_slugs)}",
            "text_contains": f"Texto contém '{payload.text}'",
        }
        return labels.get(payload.operator, payload.operator)

    # --- filter -----------------------------------------------------------

    def filter(self, request: FilterRequest) -> FilterResultOut:
        snapshots = self._load()
        constraints = [self._build_constraint(c) for c in request.constraints]
        result = apply_constraints(snapshots, constraints, request.combinator)
        by_id = {m.id: m for m in snapshots}
        candidates = [
            CandidateOut(material_id=i, name=by_id[i].name, class_name=by_id[i].class_name)
            for i in result.candidate_ids
        ]
        return FilterResultOut(
            initial_count=result.initial_count,
            combinator=result.combinator,
            final_count=result.final_count,
            steps=[
                FunnelStepOut(
                    label=s.label, operator=s.operator, passed=s.passed, remaining=s.remaining
                )
                for s in result.steps
            ],
            candidates=candidates,
        )

    # --- performance index ------------------------------------------------

    def _validate_expression(self, expression: str) -> tuple[set[str], dict[str, str], str]:
        """Return (used variable names, var->slug map, dimension); raise on error."""
        var_to_slug = {safe_variable(slug): slug for slug in self._props}
        try:
            used = validate_names(expression, set(var_to_slug))
            canonical_units = {var: self._props[var_to_slug[var]].canonical_unit for var in used}
            dimension = result_dimension(expression, canonical_units)
        except ExpressionError as exc:
            raise ValidationError(str(exc)) from exc
        return used, var_to_slug, dimension

    def _index_result(
        self, expression: str, goal: str, name: str | None, snapshots: list[MaterialSnapshot]
    ) -> IndexResultOut:
        used, _, dimension = self._validate_expression(expression)
        values: list[IndexValueOut] = []
        defined = 0
        for m in snapshots:
            variables = {safe_variable(slug): val for slug, val in m.values.items()}
            evaluation = evaluate_index(expression, used, variables)
            values.append(
                IndexValueOut(
                    material_id=m.id,
                    name=m.name,
                    class_name=m.class_name,
                    value=evaluation.value,
                    undefined_reason=evaluation.undefined_reason,
                )
            )
            if evaluation.is_defined:
                defined += 1
        # Sort: defined first, by goal; undefined last.
        reverse = goal == "maximize"
        values.sort(key=lambda v: (v.value is None, -(v.value or 0) if reverse else (v.value or 0)))
        return IndexResultOut(
            name=name,
            expression=expression,
            goal=goal,
            dimension=dimension,
            variables=sorted(used),
            values=values,
            defined_count=defined,
            undefined_count=len(snapshots) - defined,
        )

    def evaluate_index(self, request: IndexRequest) -> IndexResultOut:
        snapshots = self._load()
        return self._index_result(request.expression, request.goal, None, snapshots)

    # --- ranking ----------------------------------------------------------

    def _build_criteria(self, ranking: RankingIn, index: IndexIn | None) -> list[Criterion]:
        criteria: list[Criterion] = []
        for c in ranking.criteria:
            if c.key == INDEX_KEY:
                if index is None:
                    raise ValidationError("Critério de índice usado sem um índice definido.")
                direction = Direction.MAX if index.goal == "maximize" else Direction.MIN
                label = c.label or index.name or "Índice de desempenho"
            else:
                prop = self._props.get(c.key)
                if prop is None:
                    raise NotFoundError(f"Propriedade não encontrada: {c.key}")
                direction = self._direction_for(c, prop.better_direction)
                label = c.label or prop.name
            criteria.append(Criterion(key=c.key, label=label, direction=direction, weight=c.weight))
        return criteria

    @staticmethod
    def _direction_for(criterion: CriterionIn, better: BetterDirection) -> Direction:
        if criterion.direction:
            return Direction(criterion.direction)
        if better == BetterDirection.LOWER:
            return Direction.MIN
        return Direction.MAX  # HIGHER and NEUTRAL default to maximize

    def _rank(
        self, snapshots: list[MaterialSnapshot], ranking: RankingIn, index: IndexIn | None
    ) -> RankingResultOut:
        criteria = self._build_criteria(ranking, index)

        index_values: dict[int, float | None] = {}
        if any(c.key == INDEX_KEY for c in criteria) and index is not None:
            ires = self._index_result(index.expression, index.goal, index.name, snapshots)
            index_values = {v.material_id: v.value for v in ires.values}

        material_values = []
        for m in snapshots:
            vals: dict[str, float | None] = {}
            for c in criteria:
                vals[c.key] = index_values.get(m.id) if c.key == INDEX_KEY else m.values.get(c.key)
            material_values.append((m.id, m.name, vals))

        result = rank(
            material_values, criteria, Normalization(ranking.normalization), ranking.run_sensitivity
        )
        return RankingResultOut(
            normalization=result.normalization,
            criteria=result.criteria,
            ranked=[
                RankedMaterialOut(
                    material_id=r.material_id,
                    name=r.name,
                    score=r.score,
                    rank=r.rank,
                    contributions=[
                        ContributionOut(
                            key=c.key,
                            label=c.label,
                            raw=c.raw,
                            normalized=c.normalized,
                            weight=c.weight,
                            contribution=c.contribution,
                        )
                        for c in r.contributions
                    ],
                )
                for r in result.ranked
            ],
            excluded=[
                ExcludedMaterialOut(
                    material_id=e.material_id,
                    name=e.name,
                    missing_keys=e.missing_keys,
                    missing_labels=e.missing_labels,
                )
                for e in result.excluded
            ],
            sensitivity=[
                SensitivityScenarioOut(
                    description=s.description,
                    weights=s.weights,
                    top_material_id=s.top_material_id,
                    top_material_name=s.top_material_name,
                    changed=s.changed,
                )
                for s in result.sensitivity
            ],
        )

    # --- run (full pipeline) ---------------------------------------------

    def run(self, request: RunRequest) -> RunResultOut:
        snapshots = self._load()
        constraints = [self._build_constraint(c) for c in request.constraints]
        filtered = apply_constraints(snapshots, constraints, request.combinator)
        by_id = {m.id: m for m in snapshots}
        candidate_snaps = [by_id[i] for i in filtered.candidate_ids]

        index_out = None
        index_value_by_id: dict[int, float | None] = {}
        if request.index is not None:
            index_out = self._index_result(
                request.index.expression, request.index.goal, request.index.name, candidate_snaps
            )
            index_value_by_id = {v.material_id: v.value for v in index_out.values}

        ranking_out = None
        rank_by_id: dict[int, int] = {}
        score_by_id: dict[int, float] = {}
        if request.ranking is not None and request.ranking.criteria:
            ranking_out = self._rank(candidate_snaps, request.ranking, request.index)
            for r in ranking_out.ranked:
                rank_by_id[r.material_id] = r.rank
                score_by_id[r.material_id] = r.score

        candidates = [
            CandidateOut(
                material_id=m.id,
                name=m.name,
                class_name=m.class_name,
                index_value=index_value_by_id.get(m.id),
                rank=rank_by_id.get(m.id),
                score=score_by_id.get(m.id),
            )
            for m in candidate_snaps
        ]
        # Order candidates by rank, else by index value (goal-aware), else name.
        if rank_by_id:
            candidates.sort(key=lambda c: (c.rank is None, c.rank or 0, c.name))
        elif index_out is not None:
            reverse = request.index.goal == "maximize"  # type: ignore[union-attr]
            candidates.sort(
                key=lambda c: (
                    c.index_value is None,
                    -(c.index_value or 0) if reverse else (c.index_value or 0),
                )
            )
        else:
            candidates.sort(key=lambda c: c.name)

        return RunResultOut(
            initial_count=filtered.initial_count,
            combinator=filtered.combinator,
            final_count=filtered.final_count,
            funnel=[
                FunnelStepOut(
                    label=s.label, operator=s.operator, passed=s.passed, remaining=s.remaining
                )
                for s in filtered.steps
            ],
            candidates=candidates,
            index=index_out,
            ranking=ranking_out,
        )

    # --- performance-index catalogue -------------------------------------

    def list_indices(self) -> list[PerformanceIndexOut]:
        self._load()  # populate props for dimension computation
        return [self._index_to_out(i) for i in self.repo.list_indices()]

    def _index_to_out(self, index: PerformanceIndex) -> PerformanceIndexOut:
        try:
            _, _, dimension = self._validate_expression(index.expression)
        except ValidationError:
            dimension = None  # a seeded index referencing a since-deleted property
        return PerformanceIndexOut(
            id=index.id,
            name=index.name,
            slug=index.slug,
            expression=index.expression,
            goal=index.goal,
            description=index.description,
            assumptions=index.assumptions,
            dimension=dimension,
            is_demo=index.is_demo,
        )

    def create_index(self, payload) -> PerformanceIndexOut:
        self._load()
        self._validate_expression(payload.expression)  # reject unsafe/unknown up front
        slug = slugify(payload.name)
        if not slug or self.repo.index_slug_exists(slug):
            raise ValidationError("Nome de índice inválido ou já existente.")
        index = PerformanceIndex(
            name=payload.name.strip(),
            slug=slug,
            expression=payload.expression,
            goal=payload.goal,
            description=payload.description,
            assumptions=payload.assumptions,
            is_demo=False,
        )
        self.repo.add(index)
        self.repo.commit()
        return self._index_to_out(index)

    # --- saved studies ----------------------------------------------------

    def list_studies(self) -> list[StudySummaryOut]:
        return [
            StudySummaryOut(
                id=s.id,
                name=s.name,
                description=s.description,
                created_at=s.created_at,
                constraint_count=len(s.constraints),
                criterion_count=len(s.criteria),
            )
            for s in self.repo.list_studies()
        ]

    def get_study(self, study_id: int) -> StudyOut:
        study = self.repo.get_study(study_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")
        return self._study_to_out(study)

    def create_study(self, payload: StudyIn) -> StudyOut:
        if self.repo.study_name_exists(payload.name):
            raise ConflictError(f"Já existe um estudo com o nome: {payload.name}")
        study = SelectionStudy(
            name=payload.name.strip(),
            description=payload.description,
            function_text=payload.function_text,
            objective_text=payload.objective_text,
            free_variables=payload.free_variables,
            combinator=payload.combinator,
            index_name=payload.index.name if payload.index else None,
            index_expression=payload.index.expression if payload.index else None,
            index_goal=payload.index.goal if payload.index else None,
            normalization=payload.normalization,
        )
        for position, c in enumerate(payload.constraints):
            study.constraints.append(
                SelectionConstraint(
                    position=position,
                    operator=c.operator,
                    property_slug=c.property_slug,
                    value=c.value,
                    value_min=c.value_min,
                    value_max=c.value_max,
                    unit=c.unit,
                    class_slugs=c.class_slugs,
                    text=c.text,
                    label=c.label,
                )
            )
        for position, cr in enumerate(payload.criteria):
            study.criteria.append(
                RankingCriterion(
                    position=position,
                    key=cr.key,
                    # Stored exactly as given, including "not given". See the
                    # model: a default here would shadow the property or index
                    # it was supposed to stand in for.
                    label=cr.label,
                    direction=cr.direction,
                    weight=cr.weight,
                )
            )
        self.repo.add(study)
        self.repo.commit()
        return self._study_to_out(study)

    def delete_study(self, study_id: int) -> None:
        study = self.repo.get_study(study_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")
        self.repo.delete(study)
        self.repo.commit()

    def run_study(self, study_id: int) -> RunResultOut:
        study = self.repo.get_study(study_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")
        return self.run(self._study_to_run_request(study))

    def _study_to_out(self, study: SelectionStudy) -> StudyOut:
        index = None
        if study.index_expression:
            index = IndexIn(
                name=study.index_name,
                expression=study.index_expression,
                goal=study.index_goal or "maximize",
            )
        return StudyOut(
            id=study.id,
            name=study.name,
            description=study.description,
            function_text=study.function_text,
            objective_text=study.objective_text,
            free_variables=list(study.free_variables or []),
            combinator=study.combinator,
            constraints=[self._constraint_to_in(c) for c in study.constraints],
            index=index,
            normalization=study.normalization,
            criteria=[self._criterion_to_in(c) for c in study.criteria],
            created_at=study.created_at,
        )

    def _study_to_run_request(self, study: SelectionStudy) -> RunRequest:
        index = None
        if study.index_expression:
            index = IndexIn(
                name=study.index_name,
                expression=study.index_expression,
                goal=study.index_goal or "maximize",
            )
        ranking = None
        if study.criteria:
            ranking = RankingIn(
                normalization=study.normalization,
                criteria=[self._criterion_to_in(c) for c in study.criteria],
            )
        return RunRequest(
            combinator=study.combinator,
            constraints=[self._constraint_to_in(c) for c in study.constraints],
            index=index,
            ranking=ranking,
        )

    @staticmethod
    def _constraint_to_in(c: SelectionConstraint) -> ConstraintIn:
        return ConstraintIn(
            operator=c.operator,
            label=c.label,
            property_slug=c.property_slug,
            value=c.value,
            value_min=c.value_min,
            value_max=c.value_max,
            unit=c.unit,
            class_slugs=list(c.class_slugs or []),
            text=c.text,
        )

    @staticmethod
    def _criterion_to_in(c: RankingCriterion) -> CriterionIn:
        return CriterionIn(key=c.key, label=c.label, direction=c.direction, weight=c.weight)
