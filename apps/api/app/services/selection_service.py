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
    ConstraintGroupNode,
    MaterialSnapshot,
    Operator,
    ProcessReach,
    ProcessSelection,
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
from app.models.enums import AuditAction, AuditEntityType, BetterDirection
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


#: How an unnamed stage is described in the funnel and in the documents. A
#: table and not an if-chain so a fourth kind cannot be added to the engine and
#: forgotten here — it would read as its own raw slug, which is visible.
_STAGE_KIND_LABELS = {"limit": "limites", "tree": "classes", "process": "processos"}


class SelectionService:
    """Orchestrates the deterministic selection endpoints.

    ``project_id`` scopes every saved-study method (list/get/create/delete/run
    by id) to one Project — the catalogue-only methods (filter, index, run,
    performance-index catalogue) ignore it, since the catalogue is shared
    across every logged-in user, not owned by a project.
    """

    def __init__(self, db, project_id: int, user: User | None = None) -> None:
        self.repo = SelectionRepository(db)
        self.audit_repo = AuditRepository(db)
        self.user = user
        self.project_id = project_id
        self._snapshots: list[MaterialSnapshot] | None = None
        self._props: dict = {}

    # --- snapshot ---------------------------------------------------------

    def _load(self) -> list[MaterialSnapshot]:
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

    def _check_stage_shape(self, stage_in: StageIn) -> None:
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

        if stage_in.kind == "tree":
            if has_constraints:
                raise ValidationError(
                    "Um estágio de classes não leva restrições; use um estágio de limites."
                )
            if has_processes:
                raise ValidationError(
                    "Um estágio de classes não leva processos; use um estágio de processos."
                )
            self._check_class_slugs(stage_in.class_slugs)
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

    def _stage_in_to_node(self, stage_in: StageIn) -> SelectionStageNode:
        """One stage payload as a domain node, ready to run.

        Builds the constraints, so it needs the catalogue loaded — this is the
        run path. Saving goes through `_check_stage_shape` instead.
        """
        self._check_stage_shape(stage_in)
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

        return SelectionStageNode(
            kind="limit",
            label=stage_in.label,
            enabled=stage_in.enabled,
            root=self._request_root_node(
                stage_in.combinator, stage_in.constraints, stage_in.root_group
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

    def _request_stages(
        self,
        combinator: str,
        constraints_in: list[ConstraintIn],
        root_group_in: ConstraintGroupIn | None,
        stages_in: list[StageIn] | None,
    ) -> list[SelectionStageNode]:
        """The pipeline a request describes — an explicit list of stages, or the
        single limit stage the flat/`root_group` payload has always meant."""
        if stages_in is not None:
            return [self._stage_in_to_node(s) for s in stages_in]
        return [
            SelectionStageNode(
                kind="limit",
                label=None,
                enabled=True,
                root=self._request_root_node(combinator, constraints_in, root_group_in),
            )
        ]

    def _group_in_to_node(self, group_in: ConstraintGroupIn) -> ConstraintGroupNode:
        return ConstraintGroupNode(
            operator=group_in.operator,
            constraints=[self._build_constraint(c) for c in group_in.constraints],
            children=[self._group_in_to_node(g) for g in group_in.groups],
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
    ) -> ConstraintGroupNode:
        if root_group_in is not None:
            return self._group_in_to_node(root_group_in)
        return ConstraintGroupNode(
            operator=combinator.upper(),
            constraints=[self._build_constraint(c) for c in constraints_in],
            children=[],
        )

    @staticmethod
    def _item_node(item: Constraint | ConstraintGroupNode) -> ConstraintGroupNode:
        if isinstance(item, ConstraintGroupNode):
            return item
        return ConstraintGroupNode(operator="AND", constraints=[item], children=[])

    @staticmethod
    def _item_label(item: Constraint | ConstraintGroupNode) -> str:
        if isinstance(item, ConstraintGroupNode):
            connective = "E" if item.operator == "AND" else "OU"
            return f"Subgrupo ({connective})"
        return item.label

    @staticmethod
    def _item_operator_code(item: Constraint | ConstraintGroupNode) -> str:
        if isinstance(item, ConstraintGroupNode):
            return item.operator
        return item.operator.value

    def _apply_group(
        self, materials: list[MaterialSnapshot], group: ConstraintGroupNode
    ) -> tuple[list[FunnelStepOut], list[MaterialSnapshot]]:
        """Build the elimination funnel for one group's direct items — each
        item is either a constraint or a nested child group, combined by
        ``group.operator`` — and return the surviving materials.

        Each item's own pass/fail is delegated to ``apply_constraint_tree``
        (a single constraint is wrapped as a one-item AND group to reuse the
        same evaluator), so a child group's own nested structure is still
        fully honored even though the funnel reports it as one step.

        When ``group`` has no child groups this reduces to exactly the old
        ``apply_constraints`` algorithm: the AND branch narrows a running
        list preserving order, the OR branch unions into a dict and returns
        candidates sorted by id, and an item-less group returns every
        material with no funnel steps — all matching apply_constraints's
        behavior for a flat constraint list.
        """
        items: list[Constraint | ConstraintGroupNode] = [*group.constraints, *group.children]
        if not items:
            return [], list(materials)

        steps: list[FunnelStepOut] = []

        if group.operator == "OR":
            passing: dict[int, MaterialSnapshot] = {}
            for item in items:
                admitted = apply_constraint_tree(materials, self._item_node(item))
                for m in admitted:
                    passing[m.id] = m
                steps.append(
                    FunnelStepOut(
                        label=self._item_label(item),
                        operator=self._item_operator_code(item),
                        passed=len(admitted),
                        remaining=len(passing),
                    )
                )
            by_id = {m.id: m for m in materials}
            return steps, [by_id[i] for i in sorted(passing)]

        # AND
        remaining = list(materials)
        for item in items:
            node = self._item_node(item)
            standalone = len(apply_constraint_tree(materials, node))
            remaining = apply_constraint_tree(remaining, node)
            steps.append(
                FunnelStepOut(
                    label=self._item_label(item),
                    operator=self._item_operator_code(item),
                    passed=standalone,
                    remaining=len(remaining),
                )
            )
        return steps, remaining

    @staticmethod
    def _stage_display(stage: SelectionStageNode, position: int) -> str:
        """The stage's name in the funnel: the user's own label when they wrote
        one, otherwise what the stage is. Never a stored default — see the
        model's note on `label`."""
        if stage.label:
            return stage.label
        kind = _STAGE_KIND_LABELS.get(stage.kind, stage.kind)
        return f"Estágio {position + 1} ({kind})"

    def _apply_stages(
        self, materials: list[MaterialSnapshot], stages: list[SelectionStageNode]
    ) -> tuple[list[StageResultOut], list[FunnelStepOut], list[MaterialSnapshot]]:
        """Run the pipeline and build both reports: one entry per stage, and the
        flat funnel the interface and the exports already read.

        With exactly one stage the flat funnel is byte-identical to what
        `_apply_group` produced before P0-1 — no stage prefix, no extra line —
        which is what keeps every pre-P0-1 study, export and test reading the
        same. With more than one stage each line is prefixed by its stage, or a
        step from stage 1 and a step from stage 3 would be indistinguishable.
        """
        single = len(stages) == 1
        stage_outs: list[StageResultOut] = []
        flat: list[FunnelStepOut] = []
        remaining = list(materials)

        for position, stage in enumerate(stages):
            display = self._stage_display(stage, position)
            # Standalone over the whole catalogue, disabled stages included:
            # "what would this stage admit by itself" is the question that
            # switching it off asks. A tree stage with nothing ticked lands on
            # the whole catalogue here, which is what it admits.
            standalone = len(apply_stage(materials, stage))

            if stage.kind == "limit" and stage.root is not None:
                # A limit stage's inner funnel is one line per constraint or
                # nested sub-group — exactly `_apply_group`, unchanged.
                inner, narrowed = self._apply_group(remaining, stage.root)
            else:
                # A tree stage is a single question, so a single line. Nothing
                # ticked narrows nothing, and a line saying so is more honest
                # than a silent absence.
                narrowed = apply_stage(remaining, stage)
                inner = [
                    FunnelStepOut(
                        label=display,
                        operator="in_tree",
                        passed=standalone,
                        remaining=len(narrowed),
                    )
                ]

            if stage.enabled:
                remaining = narrowed
                flat.extend(
                    inner
                    if single
                    else [
                        FunnelStepOut(
                            label=f"{display} · {step.label}" if step.label != display else display,
                            operator=step.operator,
                            passed=step.passed,
                            remaining=step.remaining,
                        )
                        for step in inner
                    ]
                )

            stage_outs.append(
                StageResultOut(
                    position=position,
                    kind=stage.kind,
                    label=stage.label,
                    enabled=stage.enabled,
                    passed=standalone,
                    remaining=len(remaining),
                    # A disabled stage still reports its inner steps: they
                    # describe what it *would* do, which is what the reader
                    # switched it off to find out. `enabled=False` above is
                    # what marks them hypothetical.
                    steps=inner if stage.kind == "limit" else [],
                )
            )

        return stage_outs, flat, remaining

    def _load_stages(self, study: SelectionStudy) -> list[SelectionStageNode]:
        """Assemble the stage pipeline from a persisted study (P0-1).

        A pre-P0-1 study is exactly one enabled limit stage — the migration's
        backfill — so this returns a one-element list for it, and
        `_apply_stages` then reports the flat funnel unchanged.

        A study whose rows somehow describe no stage at all degrades to one
        limit stage over its whole constraint tree, rather than to an empty
        pipeline that would silently admit the entire catalogue.
        """
        stages = list(study.stages)
        if not stages:
            return [
                SelectionStageNode(
                    kind="limit", label=None, enabled=True, root=self._load_group_tree(study)
                )
            ]

        nodes: list[SelectionStageNode] = []
        for stage in stages:
            if stage.kind == "tree":
                nodes.append(
                    SelectionStageNode(
                        kind="tree",
                        label=stage.label,
                        enabled=stage.enabled,
                        tree=TreeSelection(
                            class_slugs=list(stage.class_slugs or []),
                            include_descendants=stage.include_descendants,
                        ),
                    )
                )
                continue
            if stage.kind == "process":
                nodes.append(
                    SelectionStageNode(
                        kind="process",
                        label=stage.label,
                        enabled=stage.enabled,
                        processes=ProcessSelection(
                            process_slugs=list(stage.process_slugs or []),
                            process_class_slugs=list(stage.process_class_slugs or []),
                            include_descendants=stage.include_descendants,
                        ),
                    )
                )
                continue
            nodes.append(
                SelectionStageNode(
                    kind="limit",
                    label=stage.label,
                    enabled=stage.enabled,
                    root=self._load_group_tree(study, stage_id=stage.id),
                )
            )
        return nodes

    def _load_group_tree(
        self, study: SelectionStudy, stage_id: int | None = None
    ) -> ConstraintGroupNode:
        """Assemble a ConstraintGroupNode tree from a persisted study's
        ConstraintGroup + SelectionConstraint rows (M6). Runs for every
        study, old and new: a pre-M6 study's migration backfill (and every
        study saved via the flat combinator/constraints path) is exactly one
        root group with no children, which _apply_group evaluates identically
        to the pre-M6 apply_constraints call.

        ``stage_id`` narrows to one limit stage's own tree (P0-1). Omitting it
        reads every group of the study, which is the whole tree only while the
        study has a single stage — every caller that predates P0-1 is in that
        case, and `_load_stages` passes the id for the rest.
        """
        groups: list[ConstraintGroup] = [
            g for g in study.constraint_groups if stage_id is None or g.stage_id == stage_id
        ]
        children_by_parent: dict[int | None, list[ConstraintGroup]] = {}
        for g in groups:
            children_by_parent.setdefault(g.parent_group_id, []).append(g)

        constraints_by_group: dict[int, list[SelectionConstraint]] = {}
        for c in study.constraints:
            constraints_by_group.setdefault(c.group_id, []).append(c)

        def build(g: ConstraintGroup) -> ConstraintGroupNode:
            return ConstraintGroupNode(
                operator=g.operator,
                constraints=[
                    self._build_constraint(self._constraint_to_in(c))
                    for c in constraints_by_group.get(g.id, [])
                ],
                children=[build(child) for child in children_by_parent.get(g.id, [])],
            )

        roots = children_by_parent.get(None, [])
        if not roots:
            if stage_id is not None:
                # A stage with no group of its own restricts nothing. Falling
                # back to the study's whole constraint list here — as the
                # study-wide branch below does — would pull in *other stages'*
                # constraints and silently narrow more than the stage says.
                return ConstraintGroupNode(operator="AND", constraints=[], children=[])
            # Should never happen — M6 guarantees exactly one root group per
            # study — but degrade to the flat legacy shape instead of crashing
            # on a study that somehow has none.
            return ConstraintGroupNode(
                operator=study.combinator,
                constraints=[
                    self._build_constraint(self._constraint_to_in(c)) for c in study.constraints
                ],
                children=[],
            )
        return build(roots[0])

    def describe_pipeline(self, study: SelectionStudy) -> str:
        """Render a study's real selection logic as one compact, readable
        expression — for the export/laudo's "Problema" sheet (D-41).

        Two things it exists to avoid saying, both of which would be false:

        * ``study.combinator`` alone (the first root group's operator)
          misdescribes a nested study — e.g. ``E( restrição1, OU( restrição2,
          restrição3 ) )`` — and the funnel collapses a subgroup into one opaque
          "Subgrupo" row with nothing showing what is inside it. This is the one
          place in the document that spells the structure out.
        * With P0-1 a study can have several stages, and describing only the
          first one's tree would quietly drop the rest. A single-stage study —
          every study saved before P0-1 — still renders exactly as it did, with
          no stage wrapper at all.
        """
        self._load()  # populates self._props, needed by the stage trees
        stages = self._load_stages(study)

        if len(stages) == 1 and stages[0].kind == "limit":
            return self._describe_limit(stages[0])

        return "; ".join(
            self._describe_stage(stage, position) for position, stage in enumerate(stages)
        )

    def _describe_limit(self, stage: SelectionStageNode) -> str:
        root = stage.root
        if root is None or (not root.constraints and not root.children):
            return "Nenhuma restrição definida."
        return self._render_group_tree(root)

    def _describe_stage(self, stage: SelectionStageNode, position: int) -> str:
        name = self._stage_display(stage, position)
        state = "" if stage.enabled else " [desabilitado]"
        if stage.kind == "limit":
            return f"{name}{state}: {self._describe_limit(stage)}"

        if stage.kind == "process":
            return f"{name}{state}: {self._describe_processes(stage)}"

        selection = stage.tree or TreeSelection()
        if not selection.class_slugs:
            return f"{name}{state}: nenhuma classe selecionada"
        names = self.repo.class_names()
        picked = ", ".join(names.get(slug, slug) for slug in selection.class_slugs)
        scope = "com descendentes" if selection.include_descendants else "sem descendentes"
        return f"{name}{state}: classes {picked} ({scope})"

    def _describe_processes(self, stage: SelectionStageNode) -> str:
        """A process stage in words, for the report and the laudo (P0-2).

        Names the folders and the processes separately, because they are
        different namespaces, and says "algum" out loud: a reader who assumes
        every selected process must apply would misread the candidate list.
        """
        selection = stage.processes or ProcessSelection()
        parts: list[str] = []
        if selection.process_class_slugs:
            folder_names = self.repo.process_class_names()
            picked = ", ".join(
                folder_names.get(slug, slug) for slug in selection.process_class_slugs
            )
            scope = "com descendentes" if selection.include_descendants else "sem descendentes"
            parts.append(f"famílias de processo {picked} ({scope})")
        if selection.process_slugs:
            process_names = self.repo.process_names()
            picked = ", ".join(process_names.get(slug, slug) for slug in selection.process_slugs)
            parts.append(f"processos {picked}")
        if not parts:
            return "nenhum processo selecionado"
        return "algum de " + "; ".join(parts)

    @classmethod
    def _render_group_tree(cls, group: ConstraintGroupNode) -> str:
        connective = "E" if group.operator == "AND" else "OU"
        items = [c.label for c in group.constraints] + [
            cls._render_group_tree(child) for child in group.children
        ]
        return f"{connective}({', '.join(items)})"

    # --- filter -----------------------------------------------------------

    def filter(self, request: FilterRequest) -> FilterResultOut:
        self._check_stage_conflict(request.constraints, request.root_group, request.stages)
        self._check_root_group_conflict(request.constraints, request.root_group)
        snapshots = self._load()
        stages = self._request_stages(
            request.combinator, request.constraints, request.root_group, request.stages
        )
        stage_outs, steps, candidate_snaps = self._apply_stages(snapshots, stages)
        candidates = [
            CandidateOut(material_id=m.id, name=m.name, class_name=m.class_name)
            for m in candidate_snaps
        ]
        return FilterResultOut(
            initial_count=len(snapshots),
            combinator=self._pipeline_combinator(stages),
            final_count=len(candidate_snaps),
            steps=steps,
            candidates=candidates,
            stages=stage_outs,
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

        if ranking.method == "topsis":
            result = rank_topsis(material_values, criteria, ranking.run_sensitivity)
        elif ranking.method == "promethee":
            # PROMETHEE compares materials pairwise, so it genuinely cannot
            # score fewer than two complete candidates — a nested M6
            # constraint tree can easily narrow a run to 0-1 candidates, and
            # unlike weighted_sum/TOPSIS (which handle that case gracefully),
            # rank_promethee raises. Letting that ValidationError propagate
            # here would turn it into an HTTP error that discards the whole
            # run response (funnel, candidates, everything) instead of the
            # normal empty/near-empty ranking the frontend already has an
            # empty-state for. Only the specific "too few candidates" error
            # is degraded this way — any other ValidationError from this call
            # (e.g. a zero total weight) still propagates as a real error.
            try:
                result = rank_promethee(material_values, criteria, ranking.run_sensitivity)
            except ValidationError as exc:
                if str(exc) != PROMETHEE_TOO_FEW_CANDIDATES:
                    raise
                result = degrade_promethee_for_few_candidates(material_values, criteria)
        else:
            result = rank(
                material_values,
                criteria,
                Normalization(ranking.normalization),
                ranking.run_sensitivity,
            )
        return RankingResultOut(
            normalization=result.normalization,
            method=ranking.method,
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
        self._check_stage_conflict(request.constraints, request.root_group, request.stages)
        self._check_root_group_conflict(request.constraints, request.root_group)
        self._load()
        stages = self._request_stages(
            request.combinator, request.constraints, request.root_group, request.stages
        )
        return self._run_with_stages(stages, request.index, request.ranking)

    def _run_with_root_node(
        self, root_node: ConstraintGroupNode, index: IndexIn | None, ranking: RankingIn | None
    ) -> RunResultOut:
        """One constraint tree, run as a one-stage pipeline.

        The single-stage path through `_run_with_stages`, which reports the flat
        funnel exactly as it did before P0-1 — this is what keeps the flat and
        `root_group` payloads, and every study saved through them, unchanged.
        """
        return self._run_with_stages(
            [SelectionStageNode(kind="limit", label=None, enabled=True, root=root_node)],
            index,
            ranking,
        )

    def _run_with_stages(
        self,
        stages: list[SelectionStageNode],
        index: IndexIn | None,
        ranking: RankingIn | None,
    ) -> RunResultOut:
        snapshots = self._load()
        stage_outs, steps, candidate_snaps = self._apply_stages(snapshots, stages)

        index_out = None
        index_value_by_id: dict[int, float | None] = {}
        if index is not None:
            index_out = self._index_result(
                index.expression, index.goal, index.name, candidate_snaps
            )
            index_value_by_id = {v.material_id: v.value for v in index_out.values}

        ranking_out = None
        rank_by_id: dict[int, int] = {}
        score_by_id: dict[int, float] = {}
        if ranking is not None and ranking.criteria:
            ranking_out = self._rank(candidate_snaps, ranking, index)
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
            reverse = index.goal == "maximize"  # type: ignore[union-attr]
            candidates.sort(
                key=lambda c: (
                    c.index_value is None,
                    -(c.index_value or 0) if reverse else (c.index_value or 0),
                )
            )
        else:
            candidates.sort(key=lambda c: c.name)

        return RunResultOut(
            initial_count=len(snapshots),
            combinator=self._pipeline_combinator(stages),
            final_count=len(candidate_snaps),
            funnel=steps,
            candidates=candidates,
            stages=stage_outs,
            index=index_out,
            ranking=ranking_out,
        )

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
        )
        self.repo.add(study)
        self.repo.flush()  # assigns study.id, needed by the root group below

        if payload.stages is not None:
            # P0-1: an explicit pipeline. Validated first — one bad stage must
            # not leave half a pipeline behind — then persisted in order.
            for stage_in in payload.stages:
                self._check_stage_shape(stage_in)
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
        stage = SelectionStage(
            study_id=study.id,
            position=position,
            kind=stage_in.kind,
            label=stage_in.label,
            enabled=stage_in.enabled,
            class_slugs=list(stage_in.class_slugs),
            process_slugs=list(stage_in.process_slugs),
            process_class_slugs=list(stage_in.process_class_slugs),
            include_descendants=stage_in.include_descendants,
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
        self._load()  # populate self._props before the stages build constraints
        stages = self._load_stages(study)
        index, ranking = self._study_index_and_ranking(study)
        return self._run_with_stages(stages, index, ranking)

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
            stages=self._stages_to_out(study),
            index=index,
            normalization=study.normalization,
            method=study.method,
            criteria=[self._criterion_to_in(c) for c in study.criteria],
            created_at=study.created_at,
        )

    def _stages_to_out(self, study: SelectionStudy) -> list[StageOut]:
        """A study's pipeline, read back whole.

        A limit stage's `root_group` carries its real tree, nesting included —
        which is also what closes the gap M6 left on the read side: a saved
        nested study used to come back as a flat constraint list, so reopening
        it silently dropped the parentheses.
        """
        groups_by_stage: dict[int, list[ConstraintGroup]] = {}
        for group in study.constraint_groups:
            groups_by_stage.setdefault(group.stage_id, []).append(group)

        constraints_by_group: dict[int, list[SelectionConstraint]] = {}
        for c in study.constraints:
            constraints_by_group.setdefault(c.group_id, []).append(c)

        outs: list[StageOut] = []
        for stage in study.stages:
            root_group = None
            if stage.kind == "limit":
                root_group = self._group_rows_to_in(
                    groups_by_stage.get(stage.id, []), constraints_by_group
                )
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

        def build(g: ConstraintGroup) -> ConstraintGroupIn:
            return ConstraintGroupIn(
                operator=g.operator,
                constraints=[self._constraint_to_in(c) for c in constraints_by_group.get(g.id, [])],
                groups=[build(child) for child in children_by_parent.get(g.id, [])],
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
        )

    @staticmethod
    def _criterion_to_in(c: RankingCriterion) -> CriterionIn:
        return CriterionIn(key=c.key, label=c.label, direction=c.direction, weight=c.weight)
