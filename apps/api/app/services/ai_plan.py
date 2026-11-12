"""The project assistant's server half (D-224): check the plan, then run it.

``AIService.plan`` asks a provider (or the local rules) for a plan and hands the
raw dict here. This module does the two things the methodology reserves for the
server:

1. **Judges every limit by its origin.** ``usuario`` passes the grounding
   guardrail of ``/ai/interpret`` unchanged; ``cenario:<id>`` is expanded from
   the curated table, never from the model; ``sugestao_ia`` must have a unit
   that converts and a value inside what the catalogue holds, and even then is
   only *shown* — it never runs until the person confirms it. Whatever fails is
   reported in ``rejected`` with the reason.
2. **Runs the deterministic selection** for each component through
   ``SelectionService.run`` — the same pipeline the Selection page uses, with
   no arithmetic of its own — and keeps the first materials with the reason
   read from the run.

A component always leaves here with a way to rank: the index the plan named,
its criteria, the better direction of the properties it limits or, last, the
nearest ready-made formulation. That is what makes the answer never empty.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass, field

from app.ai.guardrails import (
    Catalogue,
    check_constraint,
    check_index,
    check_level,
    check_scenario,
    check_suggested_range,
    numbers_in,
    ungrounded_numbers,
    units_compatible,
)
from app.ai.provider import IndexFacts, PropertyFacts
from app.calculations.units import UnitError, pretty_unit, to_canonical
from app.domain.errors import NotFoundError, ValidationError
from app.domain.study_templates import STUDY_TEMPLATES, nearest_template
from app.domain.use_scenarios import (
    NUMERIC_SCENARIO_OPERATORS,
    SCENARIO_IDS,
    ScenarioConstraint,
    UseScenario,
    scenario_by_id,
)
from app.schemas.ai import (
    PlanComponentOut,
    PlanComponentRunIn,
    PlanConstraintIn,
    PlanConstraintOut,
    PlanCriterionOut,
    PlanFunnelStepOut,
    PlanIndexOut,
    PlanMaterialOut,
    PlanRunOut,
    PlanScenarioOut,
)
from app.schemas.selection import (
    ConstraintGroupIn,
    ConstraintIn,
    CriterionIn,
    IndexIn,
    RankingIn,
    RunRequest,
    StageIn,
    StudyIn,
)
from app.services.selection_service import INDEX_KEY, SelectionService

#: How many materials a component shows.
TOP_MATERIALS = 5
#: Below this many survivors the run says so.
FEW_MATERIALS = 3

AI_SUGGESTION_SOURCE = "Sugestão da IA, revise"
AI_CONFIRMED_SOURCE = "Sugestão da IA, confirmada por você"
USER_SOURCE = "Seu pedido"
DERIVED_SOURCE = "A ordenação lê esta propriedade: só entra quem tem o dado."

_NUMERIC_OPS = {"gt", "gte", "lt", "lte", "between"}
_SYMBOL = {"gt": ">", "gte": "≥", "lt": "<", "lte": "≤"}
_SUPERSCRIPT = str.maketrans("-0123456789", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹")
#: Origin precedence (D-224): the person's text, then the table, then the model.
_RANK = {"usuario": 0, "cenario": 1, "indice": 2, "sugestao_ia": 3}


@dataclass(frozen=True)
class PlanCatalogue:
    """The catalogue a plan is checked against: what exists, and its scales."""

    properties: dict[str, PropertyFacts]
    ordinals: dict[str, tuple[str, tuple[str, ...]]]  # slug -> (name, scale)
    indices: dict[str, IndexFacts]
    guard: Catalogue

    @property
    def scales(self) -> dict[str, tuple[str, ...]]:
        return {slug: scale for slug, (_, scale) in self.ordinals.items()}

    def name_of(self, slug: str) -> str:
        if slug in self.properties:
            return self.properties[slug].name
        if slug in self.ordinals:
            return self.ordinals[slug][0]
        return slug


@dataclass
class _Draft:
    """A component on its way out: checked, not yet run."""

    key: str
    name: str
    role: str = ""
    function_text: str = ""
    objective_text: str = ""
    index: PlanIndexOut | None = None
    criteria: list[PlanCriterionOut] = field(default_factory=list)
    constraints: list[PlanConstraintOut] = field(default_factory=list)
    scenarios: list[str] = field(default_factory=list)
    rejected: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


class PlanBuilder:
    """Validates plan components by origin and runs the deterministic selection."""

    def __init__(
        self,
        db,
        user,
        catalogue: PlanCatalogue,
        observed: Callable[[], dict[str, tuple[float, float]]],
    ) -> None:
        self.db = db
        self.user = user
        self.catalogue = catalogue
        self._observed_reader = observed
        self._observed: dict[str, tuple[float, float]] | None = None

    def observed(self) -> dict[str, tuple[float, float]]:
        if self._observed is None:
            self._observed = self._observed_reader()
        return self._observed

    # --- from a provider's plan --------------------------------------------

    def from_plan(self, raw: dict, position: int, statement: str) -> _Draft:
        """One raw component of a provider's plan, judged by origin."""
        allowed = numbers_in(statement)
        draft = _Draft(
            key=f"c{position + 1}",
            name=_prose(raw.get("name"), allowed) or f"Componente {position + 1}",
            role=_prose(raw.get("role"), allowed),
            function_text=_prose(raw.get("function_text"), allowed),
            objective_text=_prose(raw.get("objective_text"), allowed),
        )
        self._index(draft, raw.get("index_slug"))
        for item in raw.get("criteria") or []:
            self._criterion(draft, item.get("property_slug") or "", item.get("direction"), "ia")

        for item in raw.get("constraints") or []:
            self._model_constraint(draft, item, statement)
        for scenario_id in raw.get("scenario_ids") or []:
            self._scenario(draft, scenario_id)
        self._finish(draft, statement)
        return draft

    def _model_constraint(self, draft: _Draft, item: dict, statement: str) -> None:
        origin = item.get("origin") or ""
        slug = item.get("property_slug") or ""
        operator = item.get("operator") or ""
        if origin not in ("usuario", "sugestao_ia"):
            draft.rejected.append(
                f"Limite sobre '{slug}' com origem não reconhecida ('{origin}'): só valem "
                "o seu pedido, um cenário de uso da tabela ou uma sugestão marcada."
            )
            return
        if origin == "usuario" and operator in _NUMERIC_OPS:
            try:
                constraint = ConstraintIn(
                    operator=operator,
                    property_slug=slug,
                    value=item.get("value"),
                    value_min=item.get("value_min"),
                    value_max=item.get("value_max"),
                    unit=item.get("unit"),
                )
            except Exception as exc:  # malformed provider output
                draft.rejected.append(f"Limite descartado por formato inválido: {exc}")
                return
            reason = check_constraint(constraint, statement, self.catalogue.guard)
            if reason:
                draft.rejected.append(reason)
                return
            evidence = (item.get("evidence") or "").strip()
            draft.constraints.append(
                self._out(
                    slug,
                    operator,
                    origin="usuario",
                    source=f"{USER_SOURCE}: “{evidence}”" if evidence else USER_SOURCE,
                    note=_prose(item.get("note"), numbers_in(statement)),
                    value=constraint.value,
                    value_min=constraint.value_min,
                    value_max=constraint.value_max,
                    unit=constraint.unit,
                    applied=True,
                )
            )
            return
        # Everything else the model proposes — a level, an existence, a range the
        # text does not hold — is a suggestion, whatever origin it claimed.
        self._suggestion(draft, item, confirmed=False, statement=statement)

    def _suggestion(
        self, draft: _Draft, item: dict, *, confirmed: bool, statement: str = ""
    ) -> None:
        slug = item.get("property_slug") or item.get("property") or ""
        operator = item.get("operator") or ""
        values: list[float | None]
        if operator == "between":
            values = [item.get("value_min"), item.get("value_max")]
        else:
            values = [item.get("value")]
        if operator == "level_at_least":
            reason = check_level(slug, item.get("level"), self.catalogue.scales)
        elif operator == "exists":
            reason = self._exists_reason(slug)
        elif operator in _NUMERIC_OPS:
            reason = check_suggested_range(
                slug, values, item.get("unit"), self.catalogue.guard, self.observed()
            )
        else:
            reason = f"Operador não reconhecido: '{operator}'."
        if reason:
            draft.rejected.append(reason)
            return
        own = {float(v) for v in values if v is not None}
        draft.constraints.append(
            self._out(
                slug,
                operator,
                origin="sugestao_ia",
                source=AI_CONFIRMED_SOURCE if confirmed else AI_SUGGESTION_SOURCE,
                note=_prose(item.get("note"), numbers_in(statement) | own),
                value=item.get("value") if operator in _SYMBOL else None,
                value_min=item.get("value_min") if operator == "between" else None,
                value_max=item.get("value_max") if operator == "between" else None,
                unit=item.get("unit") if operator in _NUMERIC_OPS else None,
                level=item.get("level") if operator == "level_at_least" else None,
                applied=confirmed,
                needs_confirmation=not confirmed,
            )
        )

    # --- from the person's choices ------------------------------------------

    def from_run_in(self, item: PlanComponentRunIn, position: int) -> _Draft:
        """One component as the person left it, to run again (``/ai/plan/run``)."""
        draft = _Draft(
            key=item.key or f"c{position + 1}",
            name=item.name,
            role=item.role,
            function_text=item.function_text,
            objective_text=item.objective_text,
        )
        self._index(draft, item.index_slug)
        for criterion in item.criteria:
            self._criterion(draft, criterion.property, criterion.direction, "ia")
        for constraint in item.constraints:
            self._chosen_constraint(draft, constraint)
        self._finish(draft, "")
        return draft

    def _chosen_constraint(self, draft: _Draft, item: PlanConstraintIn) -> None:
        origin = item.origin
        if origin.startswith("cenario:"):
            self._scenario_limit(draft, origin.split(":", 1)[1], item)
            return
        if origin == "sugestao_ia":
            self._suggestion(draft, item.model_dump(), confirmed=item.confirmed)
            return
        if origin == "indice":
            reason = self._exists_reason(item.property)
            if reason:
                draft.rejected.append(reason)
                return
            draft.constraints.append(
                self._out(
                    item.property, "exists", origin="indice", source=DERIVED_SOURCE, applied=True
                )
            )
            return
        # usuario: the person's own choice in the form. Checked for shape — the
        # property exists, the unit converts — never for grounding: there is no
        # model between the person and this number.
        reason = self._shape_reason(item)
        if reason:
            draft.rejected.append(reason)
            return
        draft.constraints.append(
            self._out(
                item.property,
                item.operator,
                origin="usuario",
                source="Escolha sua",
                note=item.note,
                value=item.value,
                value_min=item.value_min,
                value_max=item.value_max,
                unit=item.unit,
                level=item.level,
                applied=True,
            )
        )

    def _shape_reason(self, item: PlanConstraintIn) -> str | None:
        if item.operator == "level_at_least":
            return check_level(item.property, item.level, self.catalogue.scales)
        if item.operator == "exists":
            return self._exists_reason(item.property)
        canonical = self.catalogue.guard.properties.get(item.property)
        if canonical is None:
            return f"Propriedade do limite não existe no catálogo: '{item.property}'."
        values = [item.value_min, item.value_max] if item.operator == "between" else [item.value]
        if any(v is None for v in values):
            return f"Limite sobre '{item.property}' sem valor."
        unit = item.unit or canonical
        if not units_compatible(unit, canonical):
            return (
                f"Unidade '{unit}' é incompatível com a propriedade '{item.property}' "
                f"(canônica: '{canonical}')."
            )
        return None

    def _scenario_limit(self, draft: _Draft, scenario_id: str, item: PlanConstraintIn) -> None:
        """A scenario limit sent back: its numbers are re-read from the table."""
        reason = check_scenario(scenario_id, set(SCENARIO_IDS))
        if reason:
            draft.rejected.append(reason)
            return
        scenario = scenario_by_id(scenario_id)
        assert scenario is not None
        limit = next(
            (
                c
                for c in scenario.constraints
                if c.property_slug == item.property and c.operator == item.operator
            ),
            None,
        )
        if limit is None:
            draft.rejected.append(
                f"O cenário “{scenario.name}” não tem limite '{item.operator}' sobre "
                f"'{item.property}'; mude a origem para a sua escolha se quiser mantê-lo."
            )
            return
        self._scenario_constraint(draft, scenario, limit)
        if scenario.id not in draft.scenarios:
            draft.scenarios.append(scenario.id)

    # --- shared pieces ------------------------------------------------------

    def _index(self, draft: _Draft, slug: str | None) -> None:
        if not slug:
            return
        reason = check_index(slug, self.catalogue.guard)
        if reason:
            draft.rejected.append(reason)
            return
        facts = self.catalogue.indices[slug]
        goal = "minimize" if facts.goal == "minimize" else "maximize"
        draft.index = PlanIndexOut(
            slug=facts.slug, name=facts.name, expression=facts.expression, goal=goal
        )

    def _criterion(self, draft: _Draft, slug: str, direction: str | None, origin: str) -> None:
        if slug not in self.catalogue.properties:
            if slug in self.catalogue.ordinals:
                draft.rejected.append(
                    f"'{self.catalogue.name_of(slug)}' é ordinal (níveis, sem magnitude) e "
                    "não serve para ordenar; use um limite de nível mínimo."
                )
            else:
                draft.rejected.append(f"Critério sugerido não existe no catálogo: '{slug}'.")
            return
        if any(c.property == slug for c in draft.criteria):
            return
        draft.criteria.append(
            PlanCriterionOut(
                property=slug,
                property_name=self.catalogue.name_of(slug),
                direction="min" if direction == "min" else "max",
                origin=origin,
            )
        )

    def _scenario(self, draft: _Draft, scenario_id: str) -> None:
        reason = check_scenario(scenario_id, set(SCENARIO_IDS))
        if reason:
            draft.rejected.append(reason)
            return
        scenario = scenario_by_id(scenario_id)
        assert scenario is not None
        if scenario.id in draft.scenarios:
            return
        draft.scenarios.append(scenario.id)
        for limit in scenario.constraints:
            self._scenario_constraint(draft, scenario, limit)
        for criterion in scenario.criteria:
            self._criterion(
                draft, criterion.property_slug, criterion.direction, f"cenario:{scenario.id}"
            )

    def _scenario_constraint(
        self, draft: _Draft, scenario: UseScenario, limit: ScenarioConstraint
    ) -> None:
        slug = limit.property_slug
        prefix = f"Cenário “{scenario.name}”"
        if limit.operator == "level_at_least":
            reason = check_level(slug, limit.level, self.catalogue.scales)
        elif limit.operator == "exists":
            reason = self._exists_reason(slug)
        elif slug not in self.catalogue.guard.properties:
            reason = f"a propriedade '{slug}' não existe no catálogo atual"
        elif not units_compatible(limit.unit or "", self.catalogue.guard.properties[slug]):
            reason = f"a unidade '{limit.unit}' não converte para a de '{slug}'"
        else:
            reason = None
        if reason:
            draft.rejected.append(f"{prefix}: {reason.rstrip('.')}; o limite ficou de fora.")
            return
        draft.constraints.append(
            self._out(
                slug,
                limit.operator,
                origin=f"cenario:{scenario.id}",
                source=scenario.source,
                note=limit.note,
                value=limit.value if limit.operator in NUMERIC_SCENARIO_OPERATORS else None,
                unit=limit.unit,
                level=limit.level,
                applied=True,
            )
        )

    def _exists_reason(self, slug: str) -> str | None:
        if slug in self.catalogue.properties or slug in self.catalogue.ordinals:
            return None
        return f"Propriedade do limite não existe no catálogo: '{slug}'."

    def _out(
        self,
        slug: str,
        operator: str,
        *,
        origin: str,
        source: str,
        applied: bool,
        note: str = "",
        value: float | None = None,
        value_min: float | None = None,
        value_max: float | None = None,
        unit: str | None = None,
        level: str | None = None,
        needs_confirmation: bool = False,
    ) -> PlanConstraintOut:
        name = self.catalogue.name_of(slug)
        label = _label(name, operator, value, value_min, value_max, unit, level)
        if operator == "level_at_least":
            constraint = ConstraintIn(
                operator="level_at_least", property_slug=slug, labels=[level or ""]
            )
        elif operator == "exists":
            constraint = ConstraintIn(operator="exists", property_slug=slug)
        else:
            constraint = ConstraintIn(
                operator=operator,  # type: ignore[arg-type]
                property_slug=slug,
                value=value,
                value_min=value_min,
                value_max=value_max,
                unit=unit,
            )
        constraint.label = label[:200]
        return PlanConstraintOut(
            property=slug,
            property_name=name,
            operator=operator,  # type: ignore[arg-type]
            value=value,
            value_min=value_min,
            value_max=value_max,
            unit=unit,
            level=level,
            origin=origin,
            source=source,
            note=note or "",
            label=label,
            applied=applied,
            needs_confirmation=needs_confirmation,
            constraint=constraint,
        )

    def _finish(self, draft: _Draft, statement: str) -> None:
        """Precedence between origins, derived existence, and a way to rank."""
        self._resolve_precedence(draft)
        self._ensure_ranking(draft, statement)
        self._derive_existence(draft)

    def _resolve_precedence(self, draft: _Draft) -> None:
        """One limit per property and side; the stronger origin, then the stricter value."""
        kept: dict[tuple[str, str], PlanConstraintOut] = {}
        order: list[tuple[str, str]] = []
        for constraint in draft.constraints:
            for side in _sides(constraint.operator):
                key = (constraint.property, side)
                current = kept.get(key)
                if current is None:
                    kept[key] = constraint
                    order.append(key)
                    continue
                if current is constraint:
                    continue
                winner, loser = self._stronger(current, constraint, side)
                kept[key] = winner
                if loser is not None:
                    draft.rejected.append(_superseded(loser, winner))
        # A ``between`` occupies two sides; keep each object once, in order.
        survivors: list[PlanConstraintOut] = []
        for key in order:
            constraint = kept[key]
            if all(constraint is not s for s in survivors):
                survivors.append(constraint)
        # Drop a range whose other side lost (its single object must win both).
        final = []
        for constraint in survivors:
            sides = _sides(constraint.operator)
            if all(kept[(constraint.property, side)] is constraint for side in sides):
                final.append(constraint)
        draft.constraints = final

    def _stronger(
        self, a: PlanConstraintOut, b: PlanConstraintOut, side: str
    ) -> tuple[PlanConstraintOut, PlanConstraintOut | None]:
        """The limit that stays on one side of a property, and the one that goes.

        A stronger origin wins outright; between equals, the stricter value (or
        the higher level). Two existence limits are one limit: the second goes
        without a word.
        """
        rank_a, rank_b = _origin_rank(a.origin), _origin_rank(b.origin)
        if rank_a != rank_b:
            return (a, b) if rank_a < rank_b else (b, a)
        if side == "exists":
            return a, None
        if side == "level":
            scale = self.catalogue.scales.get(a.property, ())
            position = {label: i for i, label in enumerate(scale)}
            higher = position.get(a.level or "", -1) >= position.get(b.level or "", -1)
            return (a, b) if higher else (b, a)
        canonical = self.catalogue.guard.properties.get(a.property, "")
        va, vb = _bound(a, side, canonical), _bound(b, side, canonical)
        if va is None or vb is None:
            return a, b
        a_wins = va >= vb if side == "lower" else va <= vb
        return (a, b) if a_wins else (b, a)

    def _ensure_ranking(self, draft: _Draft, statement: str) -> None:
        """Never leave a component without a way to order the survivors."""
        if draft.index is not None or draft.criteria:
            return
        for constraint in draft.constraints:
            facts = self.catalogue.properties.get(constraint.property)
            if facts is None or not constraint.applied or constraint.operator not in _NUMERIC_OPS:
                continue
            better = facts.better_direction.upper()
            if better in ("HIGHER", "LOWER"):
                self._criterion(
                    draft, facts.slug, "max" if better == "HIGHER" else "min", "servidor"
                )
        if draft.criteria:
            return
        text = " ".join(
            [statement, draft.name, draft.function_text, draft.objective_text, draft.role]
        )
        template = nearest_template(text)
        candidates = ([template] if template else []) + list(STUDY_TEMPLATES)
        for candidate in candidates:
            if candidate.index_slug and candidate.index_slug in self.catalogue.indices:
                self._index(draft, candidate.index_slug)
                draft.notes.append(
                    f"“{draft.name}”: sem índice nem critério na proposta; a ordenação "
                    f"usa o modelo pronto “{candidate.name}” como ponto de partida."
                )
                return

    def _derive_existence(self, draft: _Draft) -> None:
        """What the ranking reads must exist: an ``exists`` limit, origin ``indice``."""
        read: list[str] = []
        if draft.index is not None:
            expression = draft.index.expression
            read.extend(slug for slug in self.catalogue.properties if _names(expression, slug))
        read.extend(c.property for c in draft.criteria)
        limited = {c.property for c in draft.constraints if c.applied}
        for slug in dict.fromkeys(read):
            if slug in limited:
                continue
            draft.constraints.append(
                self._out(slug, "exists", origin="indice", source=DERIVED_SOURCE, applied=True)
            )
            limited.add(slug)

    # --- running ------------------------------------------------------------

    def run(self, drafts: list[_Draft], statement: str = "") -> list[PlanComponentOut]:
        """Run each component through the deterministic selection, once loaded."""
        selection = SelectionService(self.db, 0, self.user)
        return [self._run_one(selection, draft, statement) for draft in drafts]

    def _run_one(
        self, selection: SelectionService, draft: _Draft, statement: str
    ) -> PlanComponentOut:
        applied = [c for c in draft.constraints if c.applied]
        stages = (
            [
                StageIn(
                    kind="limit",
                    root_group=ConstraintGroupIn(
                        operator="AND", constraints=[c.constraint for c in applied]
                    ),
                )
            ]
            if applied
            else None
        )
        index_in = (
            IndexIn(name=draft.index.name, expression=draft.index.expression, goal=draft.index.goal)
            if draft.index
            else None
        )
        criteria = []
        if index_in is not None:
            criteria.append(CriterionIn(key=INDEX_KEY, weight=2 if draft.criteria else 1))
        criteria.extend(
            CriterionIn(key=c.property, direction=c.direction, weight=1) for c in draft.criteria
        )
        ranking = RankingIn(criteria=criteria, run_sensitivity=False) if criteria else None

        try:
            result = selection.run(RunRequest(stages=stages, index=index_in, ranking=ranking))
            run_out = _run_out(result, len(applied), draft)
        except (ValidationError, NotFoundError) as exc:
            run_out = PlanRunOut(error=str(exc))

        study = StudyIn(
            name=draft.name[:200],
            description=(
                f"Proposta do assistente de projeto para: {statement}"[:1000]
                if statement
                else "Proposta do assistente de projeto."
            ),
            function_text=draft.function_text[:1000] or None,
            objective_text=draft.objective_text[:1000] or None,
            free_variables=[],
            stages=stages,
            index=index_in,
            criteria=criteria,
            notes=_study_notes(draft),
        )
        return PlanComponentOut(
            key=draft.key,
            name=draft.name,
            role=draft.role,
            function_text=draft.function_text,
            objective_text=draft.objective_text,
            index=draft.index,
            criteria=draft.criteria,
            constraints=draft.constraints,
            scenarios=draft.scenarios,
            rejected=draft.rejected,
            result=run_out,
            study=study,
        )


def scenarios_out(drafts: list[_Draft]) -> list[PlanScenarioOut]:
    """Every scenario the plan used, once, in the order it first appeared."""
    seen: list[str] = []
    for draft in drafts:
        for scenario_id in draft.scenarios:
            if scenario_id not in seen:
                seen.append(scenario_id)
    out = []
    for scenario_id in seen:
        scenario = scenario_by_id(scenario_id)
        if scenario is not None:
            out.append(PlanScenarioOut(id=scenario.id, name=scenario.name, source=scenario.source))
    return out


def grounded_prose(text: object, allowed: set[float]) -> str:
    """The text when it introduces no number the request did not hold, else ''."""
    return _prose(text, allowed)


# --- helpers -------------------------------------------------------------------


def _prose(text: object, allowed: set[float]) -> str:
    value = str(text).strip() if text is not None else ""
    if not value:
        return ""
    return "" if ungrounded_numbers(value, allowed) else value


def _names(expression: str, slug: str) -> bool:
    """True when ``expression`` reads the property ``slug`` (as a whole name)."""
    return re.search(rf"(?<![A-Za-z0-9_]){re.escape(slug)}(?![A-Za-z0-9_])", expression) is not None


def _sides(operator: str) -> tuple[str, ...]:
    if operator in ("gt", "gte"):
        return ("lower",)
    if operator in ("lt", "lte"):
        return ("upper",)
    if operator == "between":
        return ("lower", "upper")
    if operator == "level_at_least":
        return ("level",)
    return ("exists",)


def _origin_rank(origin: str) -> int:
    return _RANK.get(origin.split(":", 1)[0], 9)


def _bound(constraint: PlanConstraintOut, side: str, canonical: str) -> float | None:
    """The limit's value on ``side`` ("lower" or "upper"), in the canonical unit."""
    if constraint.operator == "between":
        value = constraint.value_min if side == "lower" else constraint.value_max
    else:
        value = constraint.value
    if value is None:
        return None
    try:
        return to_canonical(float(value), constraint.unit or canonical, canonical)[0]
    except UnitError:
        return None


def _superseded(loser: PlanConstraintOut, winner: PlanConstraintOut) -> str:
    if _origin_rank(winner.origin) < _origin_rank(loser.origin):
        why = {
            0: "o limite do seu pedido vale primeiro",
            1: "o cenário de uso da tabela vale antes de uma sugestão",
        }.get(_origin_rank(winner.origin), "outra origem vale primeiro")
    else:
        why = "ficou o mais exigente"
    return f"“{loser.label}” não foi usado: {why} (“{winner.label}”)."


def _fmt(value: float) -> str:
    text = f"{value:g}"
    if "e" in text:
        mantissa, exponent = text.split("e")
        power = f"10{str(int(exponent)).translate(_SUPERSCRIPT)}"
        text = power if mantissa in ("1", "1.0") else f"{mantissa} × {power}"
    return text.replace(".", ",").replace("-", "−")


def _label(
    name: str,
    operator: str,
    value: float | None,
    value_min: float | None,
    value_max: float | None,
    unit: str | None,
    level: str | None,
) -> str:
    shown = "" if not unit or unit == "dimensionless" else pretty_unit(unit)
    shown = "%" if shown == "percent" else shown
    suffix = f" {shown}" if shown else ""
    if operator == "level_at_least":
        return f"{name}: pelo menos “{level}”"
    if operator == "exists":
        return f"{name}: tem dado"
    if operator == "between" and value_min is not None and value_max is not None:
        return f"{name} entre {_fmt(value_min)} e {_fmt(value_max)}{suffix}"
    if value is not None and operator in _SYMBOL:
        return f"{name} {_SYMBOL[operator]} {_fmt(value)}{suffix}"
    return name


def _run_out(result, applied_count: int, draft: _Draft) -> PlanRunOut:
    excluded = {
        e.record_id: e.missing_labels for e in (result.ranking.excluded if result.ranking else [])
    }
    ranked = [c for c in result.candidates if c.rank is not None]
    unranked = [c for c in result.candidates if c.rank is None]
    chosen = (ranked + unranked)[:TOP_MATERIALS]
    by = _ranking_words(draft)
    passed = (
        "Passou no limite aplicado"
        if applied_count == 1
        else (
            f"Passou nos {applied_count} limites aplicados"
            if applied_count
            else "Sem limite aplicado"
        )
    )
    materials = []
    for candidate in chosen:
        if candidate.rank is not None:
            reason = f"{passed}; {candidate.rank}º {by}."
        elif candidate.record_id in excluded:
            missing = ", ".join(excluded[candidate.record_id])
            reason = f"{passed}, mas ficou fora da ordenação: falta {missing}."
        else:
            reason = f"{passed}."
        materials.append(
            PlanMaterialOut(
                record_id=candidate.record_id,
                name=candidate.name,
                class_name=candidate.class_name,
                rank=candidate.rank,
                index_value=candidate.index_value,
                score=candidate.score,
                reason=reason,
            )
        )
    funnel = [PlanFunnelStepOut(label=s.label, remaining=s.remaining) for s in result.funnel]
    message = None
    if result.final_count == 0:
        zeroed = next((s.label for s in result.funnel if s.remaining == 0), None)
        message = "Nenhum material do catálogo passou em todos os limites" + (
            f"; a lista zerou em “{zeroed}”. Afrouxe ou desmarque esse limite." if zeroed else "."
        )
    elif not ranked:
        message = (
            "Os materiais que passaram não têm os dados que a ordenação usa; "
            "a lista segue a ordem alfabética."
        )
    elif result.final_count < FEW_MATERIALS:
        message = "Poucos materiais do catálogo passaram em todos os limites."
    return PlanRunOut(
        initial_count=result.initial_count,
        final_count=result.final_count,
        funnel=funnel,
        materials=materials,
        message=message,
    )


def _ranking_words(draft: _Draft) -> str:
    if draft.index is not None and not draft.criteria:
        return f"pelo índice “{draft.index.name}”"
    labels = ([f"o índice “{draft.index.name}”"] if draft.index else []) + [
        f"{c.property_name} ({'maior' if c.direction == 'max' else 'menor'} é melhor)"
        for c in draft.criteria
    ]
    return "na ordenação por " + ", ".join(labels)


def _study_notes(draft: _Draft) -> str | None:
    lines = ["Proposta do assistente de projeto (D-224). Origem de cada limite:"]
    for constraint in draft.constraints:
        state = "aplicado" if constraint.applied else "não aplicado, aguarda sua confirmação"
        lines.append(f"- {constraint.label} — {constraint.source} ({state}).")
    text = "\n".join(lines)
    return text[:2000] if draft.constraints else None
