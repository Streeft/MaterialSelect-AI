"""Deterministic selection pipeline: filter → performance index → ranking.

This service is the reproducible-without-AI core of the product. It builds
in-memory snapshots of active materials, converts constraint thresholds to
canonical units, evaluates constraints, computes safe index expressions, and
ranks candidates — delegating the arithmetic to the pure ``domain`` /
``calculations`` layers.
"""

from __future__ import annotations

from dataclasses import asdict

from app.calculations.expressions import (
    ExpressionError,
    result_dimension,
    safe_variable,
    validate_names,
)
from app.calculations.performance import evaluate_index
from app.calculations.units import UnitError, to_canonical
from app.domain.errors import ConflictError, DomainError, NotFoundError, ValidationError
from app.domain.filters import (
    ChartAxis,
    ChartSelection,
    Constraint,
    ConstraintGroupNode,
    MaterialSnapshot,
    Operator,
    ProcessReach,
    ProcessSelection,
    ProcessSnapshot,
    RecordSnapshot,
    SelectionStageNode,
    TreeSelection,
    apply_constraint_tree,
    apply_stage,
)
from app.domain.ranking import (
    PROMETHEE_TOO_FEW_CANDIDATES,
    Criterion,
    Direction,
    Normalization,
    degrade_promethee_for_few_candidates,
    rank,
    rank_promethee,
    rank_topsis,
)
from app.domain.slug import slugify
from app.domain.taxonomy import lineages
from app.domain.weights import WeightEntry, weight_budget

# The one number formatter in the codebase, and the same one the report and the
# laudo print with — `describe_pipeline` and the chart-stage sentence below feed
# those documents, so a second rounding rule here would make the prose and the
# table disagree about the same bound. `export_service` reaches for the same one.
from app.exporters.cells import format_number
from app.models.enums import (
    AuditAction,
    AuditEntityType,
    BetterDirection,
    ProcessAttributeKind,
)
from app.models.performance_index import PerformanceIndex
from app.models.selection import (
    ConstraintGroup,
    RankingCriterion,
    SelectionConstraint,
    SelectionStage,
    SelectionStudy,
)
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.selection_repository import SelectionRepository
from app.schemas.selection import (
    CandidateOut,
    ChartAxisIn,
    ChartStageIn,
    ConstraintGroupIn,
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
    PreviewCandidateOut,
    RankedMaterialOut,
    RankingIn,
    RankingResultOut,
    RunRequest,
    RunResultOut,
    SensitivityScenarioOut,
    StageIn,
    StageOut,
    StageResultOut,
    StudyIn,
    StudyOut,
    StudySummaryOut,
    WeightBudgetOut,
    WeightsPreviewOut,
    WeightsPreviewRequest,
)
from app.services.audit_service import record_change

INDEX_KEY = "__index__"
_NUMERIC_OPS = {
    Operator.GT,
    Operator.GTE,
    Operator.LT,
    Operator.LTE,
    Operator.BETWEEN,
    Operator.OUTSIDE,
}

#: Set-membership operators over a discrete attribute's closed vocabulary (P0-4).
_LABEL_OPS = {Operator.HAS_ANY_LABEL, Operator.HAS_NO_LABEL}


#: How an unnamed stage is described in the funnel and in the documents. A
#: table and not an if-chain so a fourth kind cannot be added to the engine and
#: forgotten here — it would read as its own raw slug, which is visible.
_STAGE_KIND_LABELS = {
    "limit": "limites",
    "tree": "classes",
    "process": "processos",
    "material": "materiais",
    "chart": "gráfico",
}

#: The operator a single-question stage reports on its funnel line. `in_tree`
#: predates P0-2 and is kept verbatim so a pre-existing study's funnel reads
#: unchanged; `in_process` is the new one, and it exists because a funnel that
#: called both `in_tree` would say the selection filtered by material class when
#: it filtered by process.
_STAGE_FUNNEL_OPERATORS = {
    "tree": "in_tree",
    "process": "in_process",
    "material": "in_material",
    # P1-2, for the same reason `in_process` exists: a funnel line that said
    # `in_tree` for a chart stage would tell the reader the selection filtered by
    # class when it filtered by a region of a plane.
    "chart": "in_chart",
}


class SelectionService:
    """Orchestrates the deterministic selection endpoints.

    ``project_id`` scopes every saved-study method (list/get/create/delete/run
    by id) to one Project — the catalogue-only methods (filter, index, run,
    performance-index catalogue) ignore it, since the catalogue is shared
    across every logged-in user, not owned by a project.
    """

    def __init__(self, db, project_id: int, user: User | None) -> None:
        """``user`` has **no default**, and that is load-bearing (P1-4).

        It used to be optional because only the audit trail read it, so the
        call sites that never wrote left it out. Once the viewer also decides
        *which materials exist* for this run, that omission stopped being
        harmless: the safe-by-default `None` narrowed every read to the shared
        catalogue, and a person's own record vanished from their own study —
        silently, and looking exactly like data loss. A required argument turns
        that mistake from a wrong answer into a TypeError.

        ``None`` remains expressible, for a caller that genuinely has no
        viewer, but it now has to be written down.
        """
        self.viewer_id = user.id if user is not None else None
        self.repo = SelectionRepository(db, self.viewer_id)
        self.audit_repo = AuditRepository(db)
        self.user = user
        self.project_id = project_id
        self._snapshots: list[MaterialSnapshot] | None = None
        self._process_snapshots: list[ProcessSnapshot] | None = None
        self._props: dict = {}
        #: Which catalogue ``_props`` currently holds — "material" or "process".
        #: Set by `_load` / `_load_catalogue`, read where a message has to name
        #: the right thing ("Atributo" vs "Propriedade") and where a discrete
        #: attribute has to be refused.
        self._universe: str = "material"

    # --- snapshot ---------------------------------------------------------

    def _load(self) -> list[MaterialSnapshot]:
        # `_universe` is written wherever `_props` is, so the catalogue in force
        # and the noun used to talk about it can never disagree.
        self._universe = "material"
        if self._snapshots is None:
            self._props = {p.slug: p for p in self.repo.list_properties()}
            # Read once per load, not per material: a Tree stage asks about
            # ancestry, and the taxonomy is dozens of rows against hundreds of
            # materials.
            lineage_by_slug = lineages(self.repo.class_parents())
            reach_by_material = self._load_process_reach()
            self._snapshots = [
                self._to_snapshot(m, lineage_by_slug, reach_by_material)
                for m in self.repo.list_active_materials_with_values()
            ]
        return self._snapshots

    def _load_process_reach(self) -> dict[int, list[ProcessReach]]:
        """The process side of the join, ready for the snapshot (P0-2).

        Two statements for the whole catalogue — the links and the process
        taxonomy — and the folder lineage is resolved here, once per process
        class, so ``matches_processes`` stays a local question about a snapshot.
        """
        process_lineages = lineages(self.repo.process_class_parents())
        reach: dict[int, list[ProcessReach]] = {}
        for material_id, pairs in self.repo.process_reach_by_material().items():
            reach[material_id] = [
                ProcessReach(
                    process_slug=process_slug,
                    class_path=process_lineages.get(class_slug, (class_slug,)),
                )
                for process_slug, class_slug in pairs
            ]
        return reach

    def _load_processes(self) -> list[ProcessSnapshot]:
        """The process universe as selectable records (P0-3, attributes in P0-4).

        Until P0-4 every one of these had an empty ``values``, because a process
        had no attribute with provenance — and a snapshot that invented one would
        break principle 1 at the only place the whole tool is meant to be
        trustworthy. Now the attributes exist, so the three maps are populated
        from them by ``_attribute_maps``.
        """
        if self._process_snapshots is None:
            lineage_by_slug = lineages(self.repo.process_class_parents())
            material_lineages = lineages(self.repo.class_parents())
            reach = self.repo.material_reach_by_process()
            self._process_snapshots = []
            for process in self.repo.list_active_processes_with_class():
                values, envelopes, labels = self._attribute_maps(process)
                self._process_snapshots.append(
                    ProcessSnapshot(
                        id=process.id,
                        name=process.name,
                        class_name=process.process_class.name,
                        class_slug=process.process_class.slug,
                        class_path=list(lineage_by_slug.get(process.process_class.slug, ())),
                        values=values,
                        envelopes=envelopes,
                        labels=labels,
                        material_paths=[
                            material_lineages.get(class_slug, (class_slug,))
                            for class_slug in reach.get(process.id, ())
                        ],
                    )
                )
        return self._process_snapshots

    @staticmethod
    def _attribute_maps(
        process,
    ) -> tuple[dict[str, float], dict[str, tuple[float, float]], dict[str, tuple[str, ...]]]:
        """One process's attribute values, split by the shape the engine reads.

        A missing value contributes to none of the three maps — absence is
        absence here exactly as it is for a material property, and it is what
        makes a constraint over it not satisfied rather than satisfied by zero.

        An **envelope lands in two maps on purpose**: its bounds in
        ``envelopes``, which is what a threshold is compared against, and its
        stored representative point in ``values``, which is the number a ranking
        or an index expression reads. They are not two truths — the
        representative point is exactly what ``normalized_value`` has always
        meant — and the engine prefers the envelope for filtering, which
        ``evaluate_constraint`` does by checking ``envelopes`` first. Leaving the
        representative point out instead would make every attribute that has a
        range unrankable, which is not a property of the datum but of the map it
        happened to be filed in.
        """
        values: dict[str, float] = {}
        envelopes: dict[str, tuple[float, float]] = {}
        labels: dict[str, tuple[str, ...]] = {}
        for value in process.attribute_values:
            if value.is_missing:
                continue
            slug = value.attribute.slug
            if value.attribute.kind is ProcessAttributeKind.DISCRETO:
                if value.labels:
                    labels[slug] = tuple(value.labels)
                continue
            if value.attribute.kind is ProcessAttributeKind.ENVELOPE:
                if value.normalized_min is not None and value.normalized_max is not None:
                    envelopes[slug] = (value.normalized_min, value.normalized_max)
            if value.normalized_value is not None:
                values[slug] = value.normalized_value
        return values, envelopes, labels

    def _load_catalogue(self, universe: str) -> None:
        """Populate ``self._props`` with the attribute catalogue of ``universe``.

        The constraints of a limit stage name attributes by slug, and which table
        those slugs live in follows from the universe — the same rule P0-3
        established for ``class_slugs``. Reading the *material* catalogue in a
        process study was a real defect and not a theoretical one: the slugs
        resolved, the thresholds converted, and the stage then admitted nobody,
        because the snapshot it was compared against had no values at all.
        """
        if universe == "process":
            self._props = {a.slug: a for a in self.repo.list_process_attributes()}
            self._universe = "process"
            return
        self._load()

    def _records(self, universe: str) -> list[RecordSnapshot]:
        """The catalogue the pipeline runs over, for the universe asked for."""
        if universe == "process":
            return list(self._load_processes())
        return list(self._load())

    @staticmethod
    def _to_snapshot(
        material,
        lineage_by_slug: dict[str, tuple[str, ...]],
        reach_by_material: dict[int, list[ProcessReach]] | None = None,
    ) -> MaterialSnapshot:
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
            class_path=list(lineage_by_slug.get(material.material_class.slug, ())),
            processes=list((reach_by_material or {}).get(material.id, ())),
        )

    # --- constraints ------------------------------------------------------

    def _convert_threshold(self, value: float, unit: str, canonical: str) -> float:
        try:
            converted, _ = to_canonical(value, unit, canonical)
        except UnitError as exc:
            raise ValidationError(str(exc)) from exc
        return converted

    def _build_constraint(self, payload: ConstraintIn, universe: str = "material") -> Constraint:
        op = Operator(payload.operator)
        label = payload.label or self._default_label(payload)

        if op in _LABEL_OPS:
            return self._build_label_constraint(payload, op, label)

        if op in _NUMERIC_OPS:
            prop = self._props.get(payload.property_slug)
            if prop is None:
                raise NotFoundError(self._not_found(payload.property_slug))
            if getattr(prop, "kind", None) is ProcessAttributeKind.DISCRETO:
                raise ValidationError(
                    f"'{prop.name}' é um atributo discreto e não se compara por número; "
                    "use pertinência de rótulo."
                )
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
                raise NotFoundError(self._not_found(payload.property_slug))
            return Constraint(operator=op, label=label, property_slug=payload.property_slug)

        if op in (Operator.IN_CLASS, Operator.NOT_IN_CLASS):
            if not payload.class_slugs:
                raise ValidationError("Selecione ao menos uma classe.")
            # Which taxonomy names these classes follows from the universe, for
            # the reason P0-3 gives about a tree stage: the engine compares the
            # record's own class slug, and in a process study that slug is a
            # process class. Validating against the material taxonomy here would
            # 404 a legitimate process family.
            if universe == "process":
                existing = self.repo.existing_process_class_slugs(payload.class_slugs)
            else:
                existing = self.repo.existing_class_slugs(payload.class_slugs)
            unknown = sorted(set(payload.class_slugs) - existing)
            if unknown:
                raise NotFoundError(f"Classes desconhecidas: {', '.join(unknown)}")
            return Constraint(operator=op, label=label, class_slugs=payload.class_slugs)

        # TEXT_CONTAINS
        if not payload.text or not payload.text.strip():
            raise ValidationError("Informe o texto a pesquisar.")
        return Constraint(operator=op, label=label, text=payload.text)

    def _build_label_constraint(
        self, payload: ConstraintIn, op: Operator, label: str
    ) -> Constraint:
        """A discrete criterion: set membership over a closed vocabulary (P0-4).

        Two refusals rather than a quiet empty result. An attribute that is not
        discrete has no labels to be a member of, and a label outside the
        definition's vocabulary is a typo — matching nothing would look exactly
        like "no process has this capability", which is the wrong answer to show
        for a misspelling.
        """
        attribute = self._props.get(payload.property_slug)
        if attribute is None:
            raise NotFoundError(self._not_found(payload.property_slug))
        if getattr(attribute, "kind", None) is not ProcessAttributeKind.DISCRETO:
            raise ValidationError(
                f"'{attribute.name}' não é um atributo discreto, então não tem rótulos; "
                "use um operador numérico."
            )
        if not payload.labels:
            raise ValidationError("Selecione ao menos um rótulo.")
        allowed = set(attribute.allowed_labels or ())
        unknown = sorted(set(payload.labels) - allowed)
        if unknown:
            raise NotFoundError(
                f"Rótulos desconhecidos em '{attribute.name}': {', '.join(unknown)}"
            )
        return Constraint(
            operator=op,
            label=label,
            property_slug=payload.property_slug,
            labels=list(payload.labels),
        )

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
            # An envelope is compared by reach, not by its representative point,
            # and that difference has to be visible wherever the constraint is —
            # the funnel row, the report and the laudo all render this label. A
            # semantic difference the reader cannot see is the one thing this
            # engine is built not to produce.
            rule = (
                " (alcance do envelope)"
                if getattr(prop, "kind", None) is ProcessAttributeKind.ENVELOPE
                else ""
            )
            unit = payload.unit or (prop.canonical_unit if prop else "")
            if payload.operator in ("between", "outside"):
                return (
                    f"{prop_name} {symbols[payload.operator]} "
                    f"[{payload.value_min}, {payload.value_max}] {unit}{rule}"
                )
            return f"{prop_name} {symbols[payload.operator]} {payload.value} {unit}{rule}"
        labels = {
            "exists": f"{prop_name} definido",
            "not_exists": f"{prop_name} ausente",
            "in_class": f"Classe ∈ {', '.join(payload.class_slugs)}",
            "not_in_class": f"Classe ∉ {', '.join(payload.class_slugs)}",
            "text_contains": f"Texto contém '{payload.text}'",
            "has_any_label": f"{prop_name} ∈ {{{', '.join(payload.labels)}}}",
            "has_no_label": f"{prop_name} ∉ {{{', '.join(payload.labels)}}}",
        }
        return labels.get(payload.operator, payload.operator)

    # --- constraint groups (M6) --------------------------------------------
    #
    # A nested AND/OR tree generalizes the old flat constraints+combinator
    # pair. Every entry point below funnels through _apply_group, which walks
    # a ConstraintGroupNode (Task 7's domain dataclass) via apply_constraint_tree
    # instead of the old apply_constraints. _apply_group is written to be
    # byte-for-byte identical to the old apply_constraints funnel/candidate
    # output whenever the tree is flat (no child groups) — the shape every
    # pre-M6 study's migration backfill, and every study saved without
    # root_group, still has. See its docstring for the equivalence argument.

    def _check_root_group_conflict(
        self, constraints_in: list[ConstraintIn], root_group_in: ConstraintGroupIn | None
    ) -> None:
        if root_group_in is not None and constraints_in:
            raise ValidationError(
                "Envie restrições no formato plano (constraints/combinator) ou em "
                "root_group — não os dois ao mesmo tempo."
            )

    @staticmethod
    def _check_stage_conflict(
        constraints_in: list[ConstraintIn],
        root_group_in: ConstraintGroupIn | None,
        stages_in: list[StageIn] | None,
    ) -> None:
        """A payload describes the filter once. Two descriptions, one of them
        silently ignored, is how a user ends up staring at a selection that does
        not narrow."""
        if stages_in is None:
            return
        if constraints_in or root_group_in is not None:
            raise ValidationError(
                "Envie os estágios ou as restrições no nível do estudo, não os dois."
            )
        if not stages_in:
            raise ValidationError("Informe ao menos um estágio.")

    #: Which stage kinds each universe accepts (P0-3). `tree` always means
    #: folders of the study's own universe; the cross stage is the one that
    #: names the other, and each universe has exactly one of them. `chart` is in
    #: both because a plane is a plane: a process has had magnitudes since P0-4,
    #: so a region of one is as selectable there as it is over materials.
    _KINDS_BY_UNIVERSE = {
        "material": {"limit", "tree", "process", "chart"},
        "process": {"limit", "tree", "material", "chart"},
    }

    def _check_stage_universe(self, stage_in: StageIn, universe: str) -> None:
        """A stage that belongs to the other universe is refused, not ignored.

        The two wrong combinations are the ones a reader would most plausibly
        write: a process stage in a process study (they meant the *tree* stage),
        and a material stage in a material study (same). Saying so beats
        evaluating something they did not ask for."""
        allowed = self._KINDS_BY_UNIVERSE[universe]
        if stage_in.kind in allowed:
            return
        if universe == "process" and stage_in.kind == "process":
            raise ValidationError(
                "Num estudo de processos, use um estágio de árvore para escolher famílias "
                "de processo; o estágio de processos serve a um estudo de materiais."
            )
        if universe == "material" and stage_in.kind == "material":
            raise ValidationError(
                "Num estudo de materiais, use um estágio de classes para escolher classes "
                "de material; o estágio de materiais serve a um estudo de processos."
            )
        raise ValidationError(f"Tipo de estágio desconhecido: {stage_in.kind}")

    def _check_ranking_inputs(self, universe: str, index, ranking) -> None:
        """Refuse, at save time, an index or a ranking the universe cannot compute.

        This is what remains of P0-3's blanket refusal ([D-58]): a process study
        used to be denied ranking and indices outright, because a process had no
        attribute and returning an empty ranking would have read as "no process
        scored well" rather than "this cannot be computed". P0-4 gave processes
        attributes, so the ban is gone and what is refused is narrower and
        truer: an attribute that does not exist, and a **discrete** one, which
        has labels instead of a magnitude and therefore no order to rank by.

        Scoped to the process universe on purpose. A material study has always
        stored its index raw and validated it at run time — so that a study whose
        property was later renamed still opens instead of becoming unreadable —
        and widening save-time validation to it is a separate decision, not a
        side effect of this one.
        """
        if universe != "process":
            return
        if index is None and ranking is None:
            return
        self._load_catalogue(universe)
        if index is not None:
            self._validate_expression(index.expression)
        if ranking is not None:
            self._build_criteria(ranking, index)

    def _check_stage_shape(self, stage_in: StageIn, universe: str = "material") -> None:
        """Reject a stage that mixes the two kinds, and an unknown class slug.

        Shape only — thresholds, units and property existence are *not* checked
        here. That is deliberate and matches what saving already did before
        P0-1: a constraint is stored raw and validated when the study runs (see
        `_persist_group_tree`), so a study whose property was later renamed
        still opens instead of becoming unreadable. What this does catch is a
        payload that could never work as written, whatever the catalogue holds.
        """
        has_constraints = bool(stage_in.constraints) or stage_in.root_group is not None
        has_processes = bool(stage_in.process_slugs) or bool(stage_in.process_class_slugs)
        if stage_in.kind != "material" and stage_in.material_class_slugs:
            raise ValidationError(
                "Só um estágio de materiais leva classes de material nesse campo."
            )
        if stage_in.kind != "chart" and stage_in.chart is not None:
            raise ValidationError("Só um estágio de gráfico leva um plano nesse campo.")

        if stage_in.kind == "chart":
            if has_constraints:
                raise ValidationError(
                    "Um estágio de gráfico não leva restrições; use um estágio de limites."
                )
            if has_processes:
                raise ValidationError(
                    "Um estágio de gráfico não leva processos; use um estágio de processos."
                )
            if stage_in.class_slugs:
                raise ValidationError(
                    "Um estágio de gráfico não leva classes; use um estágio de classes."
                )
            if stage_in.chart is None:
                raise ValidationError("Um estágio de gráfico precisa de um plano.")
            self._check_chart_shape(stage_in.chart)
            return

        if stage_in.kind == "tree":
            if has_constraints:
                raise ValidationError(
                    "Um estágio de classes não leva restrições; use um estágio de limites."
                )
            if has_processes:
                raise ValidationError(
                    "Um estágio de classes não leva processos; use um estágio de processos."
                )
            # A tree stage names folders of the study's **own** universe, so
            # which taxonomy validates them follows from the universe — not
            # from the field's name, which is the same in both.
            if universe == "process":
                self._check_process_selection([], stage_in.class_slugs)
            else:
                self._check_class_slugs(stage_in.class_slugs)
            return

        if stage_in.kind == "material":
            if has_constraints:
                raise ValidationError(
                    "Um estágio de materiais não leva restrições; use um estágio de limites."
                )
            if has_processes:
                raise ValidationError(
                    "Um estágio de materiais não leva processos; use um estágio de árvore."
                )
            self._check_class_slugs(stage_in.material_class_slugs)
            return

        if stage_in.kind == "process":
            if has_constraints:
                raise ValidationError(
                    "Um estágio de processos não leva restrições; use um estágio de limites."
                )
            if stage_in.class_slugs:
                raise ValidationError(
                    "Um estágio de processos não leva classes de material; "
                    "use um estágio de classes."
                )
            self._check_process_selection(stage_in.process_slugs, stage_in.process_class_slugs)
            return

        if stage_in.class_slugs:
            raise ValidationError(
                "Um estágio de limites não leva classes; use um estágio de classes."
            )
        if has_processes:
            raise ValidationError(
                "Um estágio de limites não leva processos; use um estágio de processos."
            )
        self._check_root_group_conflict(stage_in.constraints, stage_in.root_group)

    #: Which axis is which, for an error message that names the one at fault.
    _CHART_AXES = (("x", "X"), ("y", "Y"))

    def _check_chart_shape(self, chart: ChartStageIn) -> None:
        """Shape of the plane, checked at save time — the same posture as every
        other stage: what could never work as written, whatever the catalogue
        holds. Whether the slug exists and whether the expression evaluates is
        settled when the study runs (`_chart_axis`), so a study whose property
        was later renamed still opens instead of becoming unreadable.
        """
        for field, name in self._CHART_AXES:
            axis: ChartAxisIn = getattr(chart, field)
            named = (axis.property_slug is not None) + (axis.expression is not None)
            if named != 1:
                raise ValidationError(
                    f"O eixo {name} é uma propriedade ou uma expressão de índice, "
                    "nunca as duas e nunca nenhuma."
                )
            if (
                axis.min_value is not None
                and axis.max_value is not None
                and axis.min_value > axis.max_value
            ):
                # An inverted box admits nobody, and does it silently — which is
                # exactly the "why does my selection return nothing" bug the
                # stage checks exist to prevent.
                raise ValidationError(f"O limite inferior do eixo {name} é maior que o superior.")

        # A level with no index has nothing to be a level of, and an index with
        # no level is a line with no position: the map would draw it and the
        # stage would select on nothing. Both are the reader having stopped
        # halfway, so both are refused instead of half-applied.
        if (chart.index_expression is None) != (chart.index_level is None):
            raise ValidationError(
                "A linha de índice precisa da expressão e do nível; sem os dois ela não "
                "tem onde ficar."
            )

    def _stage_in_to_node(
        self, stage_in: StageIn, universe: str = "material"
    ) -> SelectionStageNode:
        """One stage payload as a domain node, ready to run.

        Builds the constraints, so it needs the catalogue loaded — this is the
        run path. Saving goes through `_check_stage_shape` instead.
        """
        self._check_stage_universe(stage_in, universe)
        self._check_stage_shape(stage_in, universe)
        if stage_in.kind == "tree":
            return SelectionStageNode(
                kind="tree",
                label=stage_in.label,
                enabled=stage_in.enabled,
                tree=TreeSelection(
                    class_slugs=list(stage_in.class_slugs),
                    include_descendants=stage_in.include_descendants,
                ),
            )

        if stage_in.kind == "material":
            return SelectionStageNode(
                kind="material",
                label=stage_in.label,
                enabled=stage_in.enabled,
                materials=TreeSelection(
                    class_slugs=list(stage_in.material_class_slugs),
                    include_descendants=stage_in.include_descendants,
                ),
            )

        if stage_in.kind == "process":
            return SelectionStageNode(
                kind="process",
                label=stage_in.label,
                enabled=stage_in.enabled,
                processes=ProcessSelection(
                    process_slugs=list(stage_in.process_slugs),
                    process_class_slugs=list(stage_in.process_class_slugs),
                    include_descendants=stage_in.include_descendants,
                ),
            )

        if stage_in.kind == "chart":
            return SelectionStageNode(
                kind="chart",
                label=stage_in.label,
                enabled=stage_in.enabled,
                # `_check_stage_shape` above has already refused a chart stage
                # with no plane, so this cannot be None here.
                chart=self._chart_selection(stage_in.chart),  # type: ignore[arg-type]
            )

        return SelectionStageNode(
            kind="limit",
            label=stage_in.label,
            enabled=stage_in.enabled,
            root=self._request_root_node(
                stage_in.combinator, stage_in.constraints, stage_in.root_group, universe
            ),
        )

    def _check_class_slugs(self, slugs: list[str]) -> None:
        """Same check `_build_constraint` makes for in_class: an unknown slug is
        a 404 naming it, never a stage that quietly admits nothing."""
        if not slugs:
            return
        unknown = sorted(set(slugs) - self.repo.existing_class_slugs(slugs))
        if unknown:
            raise NotFoundError(f"Classes desconhecidas: {', '.join(unknown)}")

    def _check_process_selection(
        self, process_slugs: list[str], process_class_slugs: list[str]
    ) -> None:
        """Same posture as `_check_class_slugs`: an unknown slug is a 404 naming
        it, never a stage that quietly admits nothing (P0-2)."""
        if process_slugs:
            unknown = sorted(set(process_slugs) - self.repo.existing_process_slugs(process_slugs))
            if unknown:
                raise NotFoundError(f"Processos desconhecidos: {', '.join(unknown)}")
        if process_class_slugs:
            unknown = sorted(
                set(process_class_slugs)
                - self.repo.existing_process_class_slugs(process_class_slugs)
            )
            if unknown:
                raise NotFoundError(f"Classes de processo desconhecidas: {', '.join(unknown)}")

    # --- chart stage ------------------------------------------------------

    def _chart_selection(self, chart: ChartStageIn) -> ChartSelection:
        """One chart payload as a domain selection, with every key resolved.

        The run path, so unlike `_check_chart_shape` this one does touch the
        catalogue: a slug that names nothing is a 404 naming it, and an
        expression that does not evaluate is a 400 saying why — never a stage
        that quietly admits nobody because the coordinate it asked for is
        missing from every record.
        """
        index_key = None
        index_label = ""
        if chart.index_expression is not None:
            index_key, index_label = self._chart_quantity(None, chart.index_expression)
        return ChartSelection(
            x=self._chart_axis(chart.x),
            y=self._chart_axis(chart.y),
            index_key=index_key,
            index_level=chart.index_level,
            index_goal=chart.index_goal,
            index_label=index_label,
        )

    def _chart_axis(self, axis: ChartAxisIn) -> ChartAxis:
        key, label = self._chart_quantity(axis.property_slug, axis.expression)
        return ChartAxis(key=key, label=label, min_value=axis.min_value, max_value=axis.max_value)

    def _chart_quantity(self, slug: str | None, expression: str | None) -> tuple[str, str]:
        """Resolve one plotted quantity to (snapshot key, reader-facing label).

        An expression is filed under its own text, which is also what the reader
        sees — there is no name to give it, because a chart stage names an
        expression and not a catalogued index (D-35 is about the *model* not
        choosing an expression; a reader typing one is not that).
        """
        if expression is not None:
            self._validate_expression(expression)
            return expression, expression

        definition = self._props.get(slug or "")
        if definition is None:
            raise NotFoundError(self._not_found(slug))
        # A discrete attribute has labels and no magnitude, so it has no axis to
        # be plotted on. Refusing it by name beats the alternative: every record
        # would come back unplottable and the stage would read as "nothing is in
        # this region" rather than "this cannot be an axis".
        if getattr(definition, "kind", None) is ProcessAttributeKind.DISCRETO:
            raise ValidationError(
                f"Atributo discreto não pode ser eixo de um gráfico, porque não tem "
                f"magnitude: {definition.name}."
            )
        return definition.slug, definition.name

    def _fill_derived(
        self, records: list[MaterialSnapshot], stages: list[SelectionStageNode]
    ) -> None:
        """Compute every derived quantity the pipeline's chart stages name, once.

        Called from `_apply_stages`, which is the single door every run path goes
        through — putting it at each caller instead would make "forgot to fill
        `derived`" a silent wrong answer rather than an impossible one.

        **An expression that cannot be computed for a record leaves no key**, and
        never a zero: `matches_chart` then reads the record as unplottable, which
        is what it is. That is principle 3 again, one layer up — the reason
        `evaluate_index` returns a reason instead of a number.

        A key already in the catalogue is skipped: it is a property slug, its
        value is in `values`, and `quantity` prefers that one anyway.
        """
        keys: set[str] = set()
        for stage in stages:
            chart = stage.chart
            if chart is None:
                continue
            for key in (chart.x.key, chart.y.key, chart.index_key):
                if key is not None and key not in self._props:
                    keys.add(key)
        if not keys:
            return

        variables_by_id = {
            record.id: {safe_variable(slug): value for slug, value in record.values.items()}
            for record in records
        }
        for expression in sorted(keys):
            used, _, _ = self._validate_expression(expression)
            for record in records:
                evaluation = evaluate_index(expression, used, variables_by_id[record.id])
                if evaluation.value is not None:
                    record.derived[expression] = evaluation.value

    def _request_stages(
        self,
        combinator: str,
        constraints_in: list[ConstraintIn],
        root_group_in: ConstraintGroupIn | None,
        stages_in: list[StageIn] | None,
        universe: str = "material",
    ) -> list[SelectionStageNode]:
        """The pipeline a request describes — an explicit list of stages, or the
        single limit stage the flat/`root_group` payload has always meant."""
        if stages_in is not None:
            return [self._stage_in_to_node(s, universe) for s in stages_in]
        return [
            SelectionStageNode(
                kind="limit",
                label=None,
                enabled=True,
                root=self._request_root_node(combinator, constraints_in, root_group_in, universe),
            )
        ]

    def _group_in_to_node(
        self, group_in: ConstraintGroupIn, universe: str = "material"
    ) -> ConstraintGroupNode:
        return ConstraintGroupNode(
            operator=group_in.operator,
            constraints=[self._build_constraint(c, universe) for c in group_in.constraints],
            children=[self._group_in_to_node(g, universe) for g in group_in.groups],
        )

    def _persist_group_tree(
        self,
        study: SelectionStudy,
        group_in: ConstraintGroupIn,
        parent_group_id: int | None,
        position: int,
        stage_id: int,
    ) -> ConstraintGroup:
        """Recursively persist a ConstraintGroupIn tree as real ConstraintGroup
        rows (root first, then children depth-first), each SelectionConstraint
        pointing at its own owning group's id. Constraints are stored raw,
        exactly like the flat path below does — validation (unit conversion,
        property existence) happens at run time, not at save time.
        """
        group = ConstraintGroup(
            study_id=study.id,
            parent_group_id=parent_group_id,
            stage_id=stage_id,
            operator=group_in.operator,
            position=position,
        )
        self.repo.add(group)
        self.repo.flush()  # assigns group.id, needed by its own children/constraints

        for c_position, c in enumerate(group_in.constraints):
            study.constraints.append(
                SelectionConstraint(
                    group_id=group.id,
                    position=c_position,
                    operator=c.operator,
                    property_slug=c.property_slug,
                    value=c.value,
                    value_min=c.value_min,
                    value_max=c.value_max,
                    unit=c.unit,
                    class_slugs=c.class_slugs,
                    text=c.text,
                    label=c.label,
                    labels=c.labels,
                )
            )
        for g_position, child_in in enumerate(group_in.groups):
            self._persist_group_tree(study, child_in, group.id, g_position, stage_id)
        return group

    def _request_root_node(
        self,
        combinator: str,
        constraints_in: list[ConstraintIn],
        root_group_in: ConstraintGroupIn | None,
        universe: str = "material",
    ) -> ConstraintGroupNode:
        if root_group_in is not None:
            return self._group_in_to_node(root_group_in, universe)
        return ConstraintGroupNode(
            operator=combinator.upper(),
            constraints=[self._build_constraint(c, universe) for c in constraints_in],
            children=[],
        )

    @staticmethod
    def _item_node(item: Constraint | ConstraintGroupNode) -> ConstraintGroupNode:
        if isinstance(item, ConstraintGroupNode):
            return item
        return ConstraintGroupNode(operator="AND", constraints=[item], children=[])

    def _apply_stages(
        self, records: list[MaterialSnapshot], stages: list[SelectionStageNode]
    ) -> tuple[list[StageResultOut], list[FunnelStepOut], list[MaterialSnapshot]]:
        """Walk every stage in order, reporting per-stage candidates and the funnel.

        Principles 1, 2 and 3 stay whole here:
        - Each stage's answer comes from ``apply_stage`` (domain).
        - Candidates narrow deterministically from stage 0 through stage N-1.
        - The funnel preserves the single-table audit trail: each step records
          its kind, label and remaining count, and the document exporters read
          this list unmodified.
        """
        self._fill_derived(records, stages)
        stage_outs: list[StageResultOut] = []
        funnel: list[FunnelStepOut] = []
        candidates = list(records)
        cumulative_stage_funnel: list[FunnelStepOut] = []

        funnel.append(
            FunnelStepOut(
                step_number=0,
                stage_position=None,
                operator="início",
                label="Universo ativo",
                remaining_count=len(records),
            )
        )

        for position, stage in enumerate(stages):
            if not stage.enabled:
                stage_outs.append(
                    StageResultOut(
                        position=position,
                        kind=stage.kind,
                        label=stage.label,
                        enabled=False,
                        candidate_count=len(candidates),
                        candidates=[self._candidate_out(c) for c in candidates],
                        funnel=[],
                    )
                )
                continue

            stage_candidates, step_steps = apply_stage(candidates, stage)
            candidates = stage_candidates

            stage_funnel: list[FunnelStepOut] = []
            for step in step_steps:
                funnel_step = FunnelStepOut(
                    step_number=len(funnel),
                    stage_position=position,
                    operator=step.operator,
                    label=step.label,
                    remaining_count=step.remaining_count,
                )
                funnel.append(funnel_step)
                stage_funnel.append(funnel_step)
                cumulative_stage_funnel.append(funnel_step)

            # An empty limit stage has no constraints, so `apply_stage` emits no
            # steps for it. Leaving `funnel` empty would make the stage report
            # zero steps while narrowing nobody — which reads as broken. One
            # pass-through row makes the non-effect explicit.
            if not stage_funnel and stage.kind == "limit":
                placeholder = FunnelStepOut(
                    step_number=len(funnel),
                    stage_position=position,
                    operator="limit",
                    label=stage.label or "Sem restrições (passam todos)",
                    remaining_count=len(candidates),
                )
                funnel.append(placeholder)
                stage_funnel.append(placeholder)

            stage_outs.append(
                StageResultOut(
                    position=position,
                    kind=stage.kind,
                    label=stage.label,
                    enabled=True,
                    candidate_count=len(candidates),
                    candidates=[self._candidate_out(c) for c in candidates],
                    funnel=stage_funnel,
                )
            )

        return stage_outs, funnel, candidates

    def _run_with_stages(
        self,
        stages: list[SelectionStageNode],
        index_in: IndexIn | None,
        ranking_in: RankingIn | None,
        universe: str = "material",
    ) -> RunResultOut:
        snapshots = self._records(universe)
        stage_outs, funnel, candidates = self._apply_stages(snapshots, stages)

        index_results: list[IndexResultOut] = []
        if index_in is not None:
            self._load_catalogue(universe)
            index_results = self._compute_index(candidates, index_in)

        ranking_results: RankingResultOut | None = None
        if ranking_in is not None and ranking_in.criteria:
            self._load_catalogue(universe)
            ranking_results = self._rank(candidates, ranking_in, index_in)

        return RunResultOut(
            total_materials=len(snapshots),
            filtered_materials=len(candidates),
            combinator=self._pipeline_combinator(stages),
            funnel=funnel,
            stages=stage_outs,
            candidates=[self._candidate_out(c) for c in candidates],
            index_results=index_results,
            ranking=ranking_results,
        )

    # --- filter pipeline --------------------------------------------------

    def filter(self, request: FilterRequest) -> FilterResultOut:
        self._load_catalogue(request.universe)
        self._check_stage_conflict(request.constraints, request.root_group, request.stages)
        self._check_root_group_conflict(request.constraints, request.root_group)
        stages = self._request_stages(
            request.combinator,
            request.constraints,
            request.root_group,
            request.stages,
            request.universe,
        )
        snapshots = self._records(request.universe)
        stage_outs, funnel, candidates = self._apply_stages(snapshots, stages)

        return FilterResultOut(
            total_materials=len(snapshots),
            surviving_materials=len(candidates),
            combinator=self._pipeline_combinator(stages),
            funnel=funnel,
            stages=stage_outs,
            candidates=[self._candidate_out(c) for c in candidates],
            excluded=[
                ExcludedMaterialOut(
                    id=m.id,
                    name=m.name,
                    class_name=m.class_name,
                    failed_at_step=0,
                    reason="Excluído pelo pipeline de estágios",
                )
                for m in snapshots
                if m not in candidates
            ],
        )

    # --- index pipeline ---------------------------------------------------

    def compute_index(self, request: IndexRequest) -> list[IndexResultOut]:
        self._load_catalogue(request.universe)
        stages = self._request_stages(
            request.combinator,
            request.constraints,
            request.root_group,
            request.stages,
            request.universe,
        )
        snapshots = self._records(request.universe)
        _, _, candidates = self._apply_stages(snapshots, stages)
        return self._compute_index(candidates, request.index)

    def _compute_index(
        self, candidates: list[MaterialSnapshot], index: IndexIn
    ) -> list[IndexResultOut]:
        used_props, ast_repr, dimension = self._validate_expression(index.expression)

        results: list[IndexResultOut] = []
        for mat in candidates:
            # Map canonical names to snapshot values
            var_values = {safe_variable(p): mat.values[p] for p in used_props if p in mat.values}
            ev = evaluate_index(index.expression, used_props, var_values)
            results.append(
                IndexResultOut(
                    material_id=mat.id,
                    material_name=mat.name,
                    class_name=mat.class_name,
                    value=ev.value,
                    status=ev.status,
                    exclusion_reason=ev.reason,
                    missing_properties=ev.missing_properties,
                )
            )

        # Sort: valid first by value (desc or asc depending on goal)
        reverse = index.goal == "maximize"
        valid = [r for r in results if r.value is not None]
        invalid = [r for r in results if r.value is None]
        valid.sort(key=lambda r: r.value or 0.0, reverse=reverse)
        return valid + invalid

    def _validate_expression(self, expr: str) -> tuple[set[str], str, str]:
        try:
            used_slugs, ast_repr = validate_names(expr, set(self._props.keys()))
        except ExpressionError as exc:
            raise ValidationError(str(exc)) from exc

        # Unknown properties?
        unknown = used_slugs - set(self._props.keys())
        if unknown:
            raise NotFoundError(f"Propriedades desconhecidas na expressão: {', '.join(unknown)}")

        # Discrete attributes have no magnitude: (D-59) refuses them in an
        # index expression with the attribute's name, not a cryptic type error.
        discrete = sorted(
            slug
            for slug in used_slugs
            if getattr(self._props[slug], "kind", None) is ProcessAttributeKind.DISCRETO
        )
        if discrete:
            names = ", ".join(f"'{self._props[s].name}'" for s in discrete)
            raise ValidationError(
                f"Atributo discreto não entra em expressão de índice: {names}."
            )

        # Compute dimension
        dims = {p: self._props[p].dimension for p in used_slugs}
        try:
            dim = result_dimension(expr, dims)
        except ExpressionError as exc:
            raise ValidationError(str(exc)) from exc

        return used_slugs, ast_repr, dim

    # --- ranking pipeline -------------------------------------------------

    def run(self, request: RunRequest) -> RunResultOut:
        self._load_catalogue(request.universe)
        self._check_stage_conflict(request.constraints, request.root_group, request.stages)
        self._check_root_group_conflict(request.constraints, request.root_group)
        stages = self._request_stages(
            request.combinator,
            request.constraints,
            request.root_group,
            request.stages,
            request.universe,
        )
        return self._run_with_stages(stages, request.index, request.ranking, request.universe)

    def _rank(
        self,
        candidates: list[MaterialSnapshot],
        ranking_in: RankingIn,
        index_in: IndexIn | None,
    ) -> RankingResultOut:
        criteria = self._build_criteria(ranking_in, index_in)
        matrix = self._build_matrix(candidates, criteria, index_in)

        # Filter out candidates with missing values
        surviving_candidates: list[MaterialSnapshot] = []
        complete_rows: list[list[float]] = []
        for mat in candidates:
            row = matrix.get(mat.id)
            if row is not None and all(v is not None for v in row):
                surviving_candidates.append(mat)
                complete_rows.append([float(v) for v in row])  # type: ignore[arg-type]

        if not complete_rows:
            return RankingResultOut(
                method=ranking_in.method,
                normalization=ranking_in.normalization,
                candidates_evaluated=len(candidates),
                candidates_ranked=0,
                ranked=[],
                criteria=criteria,
            )

        norm = Normalization(ranking_in.normalization)
        promethee_degraded = False
        if ranking_in.method == "topsis":
            result = rank_topsis(complete_rows, criteria, norm)
        elif ranking_in.method == "promethee":
            promethee_degraded = len(complete_rows) < PROMETHEE_TOO_FEW_CANDIDATES
            result = rank_promethee(complete_rows, criteria)
        else:
            result = rank(complete_rows, criteria, norm)

        ranked_out: list[RankedMaterialOut] = []
        for r in result.ranked:
            mat = surviving_candidates[r.original_index]
            contribs = [
                ContributionOut(
                    criterion_key=c.key,
                    criterion_label=c.label,
                    raw_value=r.raw_values[i],
                    normalized_value=r.normalized_values[i],
                    weighted_value=r.weighted_values[i],
                )
                for i, c in enumerate(criteria)
            ]
            ranked_out.append(
                RankedMaterialOut(
                    rank=r.rank,
                    material_id=mat.id,
                    material_name=mat.name,
                    class_name=mat.class_name,
                    score=r.score,
                    contributions=contribs,
                )
            )

        scenarios_out: list[SensitivityScenarioOut] = []
        if ranking_in.run_sensitivity and result.sensitivity_scenarios:
            for sc in result.sensitivity_scenarios:
                sc_ranked = [
                    RankedMaterialOut(
                        rank=sr.rank,
                        material_id=surviving_candidates[sr.original_index].id,
                        material_name=surviving_candidates[sr.original_index].name,
                        class_name=surviving_candidates[sr.original_index].class_name,
                        score=sr.score,
                        contributions=[],
                    )
                    for sr in sc.ranked
                ]
                scenarios_out.append(
                    SensitivityScenarioOut(
                        perturbed_criterion=sc.perturbed_criterion,
                        weight_multiplier=sc.weight_multiplier,
                        ranked=sc_ranked,
                    )
                )

        explanation = result.explanation
        if promethee_degraded:
            explanation = (
                f"{explanation} {degrade_promethee_for_few_candidates(len(complete_rows))}"
            )

        return RankingResultOut(
            method=ranking_in.method,
            normalization=ranking_in.normalization,
            candidates_evaluated=len(candidates),
            candidates_ranked=len(ranked_out),
            ranked=ranked_out,
            criteria=criteria,
            sensitivity_scenarios=scenarios_out,
            explanation=explanation,
        )

    def _build_criteria(
        self, ranking_in: RankingIn, index_in: IndexIn | None
    ) -> list[Criterion]:
        criteria: list[Criterion] = []
        for cr in ranking_in.criteria:
            if cr.key == INDEX_KEY:
                if index_in is None:
                    raise ValidationError("Critério de índice fornecido, mas nenhum índice ativo.")
                label = f"Índice: {index_in.name}"
                direction = (
                    Direction.MAXIMIZE if index_in.goal == "maximize" else Direction.MINIMIZE
                )
            else:
                prop = self._props.get(cr.key)
                if prop is None:
                    raise NotFoundError(self._not_found(cr.key))
                # A discrete attribute has no order to optimize over (D-59).
                if getattr(prop, "kind", None) is ProcessAttributeKind.DISCRETO:
                    raise ValidationError(
                        f"Atributo discreto não entra em ranking: '{prop.name}'."
                    )
                label = cr.label or prop.name
                direction = (
                    Direction.MAXIMIZE
                    if cr.direction == BetterDirection.MAXIMIZE
                    else Direction.MINIMIZE
                )

            criteria.append(
                Criterion(
                    key=cr.key,
                    label=label,
                    direction=direction,
                    weight=cr.weight,
                )
            )
        return criteria

    def _build_matrix(
        self,
        candidates: list[MaterialSnapshot],
        criteria: list[Criterion],
        index_in: IndexIn | None,
    ) -> dict[int, list[float | None]]:
        # Precompute index if used
        index_map: dict[int, float | None] = {}
        if any(c.key == INDEX_KEY for c in criteria) and index_in is not None:
            for r in self._compute_index(candidates, index_in):
                index_map[r.material_id] = r.value

        matrix: dict[int, list[float | None]] = {}
        for mat in candidates:
            row: list[float | None] = []
            for c in criteria:
                if c.key == INDEX_KEY:
                    row.append(index_map.get(mat.id))
                else:
                    row.append(mat.values.get(c.key))
            matrix[mat.id] = row
        return matrix

    # --- weights preview (P0-1) -------------------------------------------

    def _rankable_keys(self) -> set[str]:
        """What may be a criterion in the catalogue in force: every material
        property, every process attribute except the discrete ones (D-59)."""
        return {
            slug
            for slug, prop in self._props.items()
            if getattr(prop, "kind", None) is not ProcessAttributeKind.DISCRETO
        }

    @staticmethod
    def _stage_constrains(stage: SelectionStageNode) -> bool:
        """Whether an enabled stage narrows anything — a limit stage with no
        constraint in its tree admits everyone and does not count."""
        if not stage.enabled:
            return False
        if stage.kind != "limit":
            return True

        def has_items(group: ConstraintGroupNode | None) -> bool:
            if group is None:
                return False
            return bool(group.constraints) or any(has_items(c) for c in group.children)

        return has_items(stage.root)

    def weights_preview(self, request: WeightsPreviewRequest) -> WeightsPreviewOut:
        """The weight budget of the criteria as typed, and the top-N they rank.

        The budget is computed first and never fails because of the selection:
        whatever goes wrong in the pipeline (a constraint half-typed, an
        expression that does not parse) becomes ``unavailable_reason`` with the
        backend's own message, and the budget still reaches the screen.

        The ranking runs over the rows that are already sound, with sensitivity
        off (this answers on every pause in the typing), and with the weights
        renormalized when they do not close — exactly what ``/run`` would do.
        """
        self._load_catalogue(request.universe)
        budget = weight_budget(
            [WeightEntry(key=c.key, weight=c.weight) for c in request.criteria],
            self._rankable_keys(),
            index_available=request.index is not None,
        )
        out = WeightsPreviewOut(
            budget=WeightBudgetOut.model_validate(asdict(budget)),
            method=request.method,
            renormalized=budget.status not in ("empty", "complete"),
        )

        sound = [
            CriterionIn(key=c.key, label=c.label, direction=c.direction, weight=c.weight)
            for c, row in zip(request.criteria, budget.rows, strict=True)
            if row.issue is None and c.weight is not None and c.weight > 0
        ]
        if not sound:
            out.unavailable_reason = "no_criteria"
            out.unavailable_message = (
                "Escolha um critério e dê um peso a ele para ver a prévia do ranking."
            )
            return out

        try:
            stages = self._request_stages("AND", [], None, request.stages or None, request.universe)
            snapshots = self._records(request.universe)
            _, _, candidates = self._apply_stages(snapshots, stages)
            out.initial_count = len(snapshots)
            out.candidate_count = len(candidates)
            out.constraints_applied = any(self._stage_constrains(s) for s in stages)
            if not candidates:
                out.unavailable_reason = "no_candidates"
                out.unavailable_message = (
                    "Nenhum registro passa pelas restrições atuais: não há o que ordenar."
                )
                return out
            ranking = self._rank(
                candidates,
                RankingIn(
                    normalization=request.normalization,
                    method=request.method,
                    criteria=sound,
                    run_sensitivity=False,
                ),
                request.index,
            )
        except (DomainError, UnitError) as exc:
            out.unavailable_reason = "pipeline_error"
            out.unavailable_message = str(exc)
            return out

        out.ranked_count = len(ranking.ranked)
        if not ranking.ranked:
            out.unavailable_reason = "all_excluded"
            out.unavailable_message = (
                "Nenhum candidato tem valor em todos os critérios escolhidos: "
                "não há o que ordenar."
            )
            return out
        class_by_id = {c.id: c.class_name for c in candidates}
        out.top = [
            PreviewCandidateOut(
                rank=r.rank,
                record_id=r.record_id,
                name=r.name,
                class_name=class_by_id.get(r.record_id),
                score=r.score,
            )
            for r in ranking.ranked[: request.top_n]
        ]
        return out

    @staticmethod
    def _pipeline_combinator(stages: list[SelectionStageNode]) -> str:
        """What `RunResultOut.combinator` reports — see the field's own note.

        One limit stage: its root group's own operator, exactly as before P0-1.
        Anything else: "AND", because that is how stages combine, and reporting
        a stage's internal "OR" would describe the pipeline as something it is
        not.
        """
        if len(stages) == 1 and stages[0].kind == "limit" and stages[0].root is not None:
            return stages[0].root.operator
        return "AND"

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
        self.repo.flush()
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.PERFORMANCE_INDEX,
            entity_id=index.id,
            entity_label=index.name,
            action=AuditAction.CRIADO,
        )
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
                stage_count=len(s.stages),
                criterion_count=len(s.criteria),
                universe=s.universe,
            )
            for s in self.repo.list_studies(self.project_id)
        ]

    def get_study(self, study_id: int) -> StudyOut:
        study = self.repo.get_study(study_id, self.project_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")
        return self._study_to_out(study)

    def create_study(self, payload: StudyIn) -> StudyOut:
        self._check_stage_conflict(payload.constraints, payload.root_group, payload.stages)
        self._check_root_group_conflict(payload.constraints, payload.root_group)
        if self.repo.study_name_exists(payload.name, self.project_id):
            raise ConflictError(f"Já existe um estudo com o nome: {payload.name}")
        self._check_unique_criteria(payload.criteria)
        # Refused at save time, not only at run time: a study that cannot be run
        # is not a study worth storing, and finding out later is worse.
        self._check_ranking_inputs(
            payload.universe,
            payload.index,
            RankingIn(criteria=payload.criteria) if payload.criteria else None,
        )
        # A study's own `combinator` column always mirrors its root
        # ConstraintGroup's operator (Task 6's invariant) — when the caller
        # supplies a real tree via root_group, that is the root's operator,
        # not the (possibly stale, since unused) flat `payload.combinator`.
        combinator = (
            payload.root_group.operator if payload.root_group is not None else payload.combinator
        )
        if payload.stages is not None:
            # With an explicit pipeline the study's own `combinator` column
            # mirrors the first limit stage's root operator — the field a
            # pre-P0-1 reader will use, kept as close to true as one value can
            # be. `stages` is the structure.
            first_limit = next((s for s in payload.stages if s.kind == "limit"), None)
            if first_limit is not None:
                combinator = (
                    first_limit.root_group.operator
                    if first_limit.root_group is not None
                    else first_limit.combinator
                )
        study = SelectionStudy(
            name=payload.name.strip(),
            project_id=self.project_id,
            description=payload.description,
            function_text=payload.function_text,
            objective_text=payload.objective_text,
            free_variables=payload.free_variables,
            combinator=combinator,
            index_name=payload.index.name if payload.index else None,
            index_expression=payload.index.expression if payload.index else None,
            index_goal=payload.index.goal if payload.index else None,
            normalization=payload.normalization,
            method=payload.method,
            universe=payload.universe,
        )
        self.repo.add(study)
        self.repo.flush()  # assigns study.id, needed by the root group below

        if payload.stages is not None:
            # P0-1: an explicit pipeline. Validated first — one bad stage must
            # not leave half a pipeline behind — then persisted in order.
            for stage_in in payload.stages:
                self._check_stage_universe(stage_in, payload.universe)
                self._check_stage_shape(stage_in, payload.universe)
            for position, stage_in in enumerate(payload.stages):
                self._persist_stage(study, stage_in, position)
            self._persist_criteria(study, payload)
            return self._finish_study_creation(study)

        # P0-1: every study owns at least one stage, and every ConstraintGroup
        # belongs to one. A study saved through the flat/root_group payload is
        # a single enabled limit stage — the same shape the migration's
        # backfill gives every pre-P0-1 study.
        stage = SelectionStage(
            study_id=study.id,
            position=0,
            kind="limit",
            label=None,
            enabled=True,
            class_slugs=[],
            include_descendants=True,
        )
        self.repo.add(stage)
        self.repo.flush()  # assigns stage.id, needed by every group below

        if payload.root_group is not None:
            # M6: an explicit nested tree — persist it for real, root first
            # then children depth-first, each SelectionConstraint pointing at
            # its own owning group.
            self._persist_group_tree(
                study, payload.root_group, parent_group_id=None, position=0, stage_id=stage.id
            )
        else:
            # M6: every study gets exactly one root ConstraintGroup, mirroring
            # the study's own combinator — this keeps a flat-payload study
            # consistent with the shape the migration's backfill gives every
            # pre-existing one: a flat list of constraints combined by a
            # single AND/OR root.
            root_group = ConstraintGroup(
                study_id=study.id,
                parent_group_id=None,
                stage_id=stage.id,
                operator=payload.combinator,
                position=0,
            )
            self.repo.add(root_group)
            self.repo.flush()  # assigns root_group.id, needed by each constraint

            for position, c in enumerate(payload.constraints):
                study.constraints.append(
                    SelectionConstraint(
                        group_id=root_group.id,
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
        self._persist_criteria(study, payload)
        return self._finish_study_creation(study)

    def _persist_stage(self, study: SelectionStudy, stage_in: StageIn, position: int) -> None:
        """One stage row, plus its own constraint tree when it is a limit stage."""
        chart = stage_in.chart
        stage = SelectionStage(
            study_id=study.id,
            position=position,
            kind=stage_in.kind,
            label=stage_in.label,
            enabled=stage_in.enabled,
            class_slugs=list(stage_in.class_slugs),
            process_slugs=list(stage_in.process_slugs),
            process_class_slugs=list(stage_in.process_class_slugs),
            material_class_slugs=list(stage_in.material_class_slugs),
            include_descendants=stage_in.include_descendants,
            # NULL when there is no chart, and NULL for each bound the reader did
            # not draw — the columns are nullable precisely so an absent limit
            # and a limit of zero stay different things.
            chart_x_slug=chart.x.property_slug if chart else None,
            chart_x_expression=chart.x.expression if chart else None,
            chart_y_slug=chart.y.property_slug if chart else None,
            chart_y_expression=chart.y.expression if chart else None,
            chart_x_min=chart.x.min_value if chart else None,
            chart_x_max=chart.x.max_value if chart else None,
            chart_y_min=chart.y.min_value if chart else None,
            chart_y_max=chart.y.max_value if chart else None,
            chart_index_expression=chart.index_expression if chart else None,
            chart_index_goal=chart.index_goal if chart else None,
            chart_index_level=chart.index_level if chart else None,
        )
        self.repo.add(stage)
        self.repo.flush()  # assigns stage.id, needed by the groups below
        if stage_in.kind != "limit":
            return

        root_in = stage_in.root_group or ConstraintGroupIn(
            operator=stage_in.combinator, constraints=list(stage_in.constraints), groups=[]
        )
        self._persist_group_tree(
            study, root_in, parent_group_id=None, position=0, stage_id=stage.id
        )

    def _persist_criteria(self, study: SelectionStudy, payload: StudyIn) -> None:
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

    def _finish_study_creation(self, study: SelectionStudy) -> StudyOut:
        self.repo.flush()
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.SELECTION_STUDY,
            entity_id=study.id,
            entity_label=study.name,
            action=AuditAction.CRIADO,
            project_id=self.project_id,
        )
        self.repo.commit()
        return self._study_to_out(study)

    def delete_study(self, study_id: int) -> None:
        study = self.repo.get_study(study_id, self.project_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")
        record_change(
            self.audit_repo,
            self.user,
            entity_type=AuditEntityType.SELECTION_STUDY,
            entity_id=study.id,
            entity_label=study.name,
            action=AuditAction.EXCLUIDO,
            project_id=self.project_id,
        )
        self.repo.delete(study)
        self.repo.commit()

    def run_study(self, study_id: int) -> RunResultOut:
        study = self.repo.get_study(study_id, self.project_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")
        self._load_catalogue(study.universe)  # the catalogue the stages resolve against
        stages = self._load_stages(study)
        index, ranking = self._study_index_and_ranking(study)
        return self._run_with_stages(stages, index, ranking, universe=study.universe)

    def _study_to_out(self, study: SelectionStudy) -> StudyOut:
        index = None
        if study.index_expression:
            index = IndexIn(
                name=study.index_name,
                expression=study.index_expression,
                goal=study.index_goal or "maximize",
            )
        stages_out = self._stages_to_out(study)
        root_group_out = None
        first_limit = next((s for s in stages_out if s.kind == "limit"), None)
        if first_limit is not None and first_limit.root_group is not None:
            root_group_out = first_limit.root_group
        elif study.constraint_groups:
            constraints_by_group: dict[int, list[SelectionConstraint]] = {}
            for c in study.constraints:
                constraints_by_group.setdefault(c.group_id, []).append(c)
            root_group_out = self._group_rows_to_in(
                list(study.constraint_groups), constraints_by_group
            )
        return StudyOut(
            id=study.id,
            name=study.name,
            universe=study.universe,
            description=study.description,
            function_text=study.function_text,
            objective_text=study.objective_text,
            free_variables=list(study.free_variables or []),
            combinator=study.combinator,
            constraints=[self._constraint_to_in(c) for c in study.constraints],
            root_group=root_group_out,
            stages=stages_out,
            index=index,
            normalization=study.normalization,
            method=study.method,
            criteria=[self._criterion_to_in(c) for c in study.criteria],
            created_at=study.created_at,
        )

    @staticmethod
    def _stage_row_to_chart_in(stage: SelectionStage) -> ChartStageIn:
        """A persisted chart stage's eleven columns as the payload they came from.

        One place, read by both sides — `_load_stages` to run the stage and
        `_stages_to_out` to hand it back to the editor — so a study cannot
        re-open as one plane and run as another.
        """
        return ChartStageIn(
            x=ChartAxisIn(
                property_slug=stage.chart_x_slug,
                expression=stage.chart_x_expression,
                min_value=stage.chart_x_min,
                max_value=stage.chart_x_max,
            ),
            y=ChartAxisIn(
                property_slug=stage.chart_y_slug,
                expression=stage.chart_y_expression,
                min_value=stage.chart_y_min,
                max_value=stage.chart_y_max,
            ),
            index_expression=stage.chart_index_expression,
            index_goal=stage.chart_index_goal or "maximize",
            index_level=stage.chart_index_level,
        )

    def _stages_to_out(self, study: SelectionStudy) -> list[StageOut]:
        """A study's pipeline, read back whole.

        A limit stage's `root_group` carries its real tree, nesting included —
        which is also what closes the gap M6 left on the read side: a saved
        nested study used to come back as a flat constraint list, so reopening
        it silently dropped the parentheses.
        """
        groups_by_stage: dict[int | None, list[ConstraintGroup]] = {}
        for group in study.constraint_groups:
            groups_by_stage.setdefault(group.stage_id, []).append(group)

        constraints_by_group: dict[int, list[SelectionConstraint]] = {}
        for c in study.constraints:
            constraints_by_group.setdefault(c.group_id, []).append(c)

        if not study.stages:
            root_group = self._group_rows_to_in(list(study.constraint_groups), constraints_by_group)
            return [
                StageOut(
                    position=0,
                    kind="limit",
                    label=None,
                    enabled=True,
                    root_group=root_group,
                    class_slugs=[],
                    process_slugs=[],
                    process_class_slugs=[],
                    material_class_slugs=[],
                    chart=None,
                    include_descendants=True,
                )
            ]

        outs: list[StageOut] = []
        for stage in study.stages:
            root_group = None
            if stage.kind == "limit":
                stage_groups = groups_by_stage.get(stage.id, [])
                if not stage_groups and len(study.stages) == 1 and None in groups_by_stage:
                    stage_groups = groups_by_stage[None]
                root_group = self._group_rows_to_in(stage_groups, constraints_by_group)
            outs.append(
                StageOut(
                    position=stage.position,
                    kind=stage.kind,
                    label=stage.label,
                    enabled=stage.enabled,
                    root_group=root_group,
                    class_slugs=list(stage.class_slugs or []),
                    process_slugs=list(stage.process_slugs or []),
                    process_class_slugs=list(stage.process_class_slugs or []),
                    material_class_slugs=list(stage.material_class_slugs or []),
                    chart=self._stage_row_to_chart_in(stage) if stage.kind == "chart" else None,
                    include_descendants=stage.include_descendants,
                )
            )
        return outs

    def _group_rows_to_in(
        self,
        groups: list[ConstraintGroup],
        constraints_by_group: dict[int, list[SelectionConstraint]],
    ) -> ConstraintGroupIn | None:
        """Rebuild a ConstraintGroupIn tree from one stage's group rows.

        The read-side mirror of `_persist_group_tree`. Returns None for a stage
        with no group at all rather than an empty AND group, so a caller can
        tell "no tree stored" from "a tree that restricts nothing".
        """
        children_by_parent: dict[int | None, list[ConstraintGroup]] = {}
        for g in groups:
            children_by_parent.setdefault(g.parent_group_id, []).append(g)

        roots = children_by_parent.get(None, [])
        if not roots:
            return None

        roots.sort(key=lambda x: x.position if x.position is not None else 0)

        def build(g: ConstraintGroup) -> ConstraintGroupIn:
            raw_constraints = list(constraints_by_group.get(g.id, []))
            raw_constraints.sort(key=lambda x: x.position if x.position is not None else 0)
            child_groups = list(children_by_parent.get(g.id, []))
            child_groups.sort(key=lambda x: x.position if x.position is not None else 0)
            return ConstraintGroupIn(
                operator=g.operator,
                constraints=[self._constraint_to_in(c) for c in raw_constraints],
                groups=[build(child) for child in child_groups],
            )

        return build(roots[0])

    def _study_index_and_ranking(
        self, study: SelectionStudy
    ) -> tuple[IndexIn | None, RankingIn | None]:
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
                method=study.method,
                criteria=[self._criterion_to_in(c) for c in study.criteria],
            )
        return index, ranking

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
            labels=list(c.labels or []),
        )

    @staticmethod
    def _criterion_to_in(c: RankingCriterion) -> CriterionIn:
        return CriterionIn(key=c.key, label=c.label, direction=c.direction, weight=c.weight)
