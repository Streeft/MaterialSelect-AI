"""Orchestration of the optional AI layer.

The shape of this service is the methodological argument made executable:

    catalogue → provider → schema validation → guardrails → proposal

The provider sits in the middle with no database and no evaluator, and whatever
it returns is filtered before anyone sees it. Anything rejected is reported in
``rejected`` rather than quietly dropped, so the user can see where the
interpretation was refused — that visibility is the point.

Explanations are written about a study the service re-runs itself through the
deterministic pipeline, so the numbers in the prose are the pipeline's numbers.
"""

from __future__ import annotations

from app.ai.factory import disclaimer_for, get_provider
from app.ai.guardrails import (
    Catalogue,
    check_chart,
    check_constraint,
    check_index,
    check_property,
    numbers_in,
    ungrounded_numbers,
)
from app.ai.provider import (
    AIProvider,
    AIUnavailableError,
    ClassFacts,
    IndexFacts,
    ProblemContext,
    PropertyFacts,
    ResultContext,
)
from app.config import Settings
from app.config import settings as default_settings
from app.domain.errors import NotFoundError, ValidationError
from app.repositories.chart_repository import ChartRepository
from app.repositories.selection_repository import SelectionRepository
from app.schemas.ai import (
    AIStatusOut,
    ExplanationOut,
    InterpretationOut,
    InterpretRequest,
    SuggestedChart,
    SuggestedConstraint,
    SuggestedIndex,
    SuggestedProperty,
)
from app.schemas.selection import ConstraintIn
from app.services.selection_service import SelectionService


class AIService:
    """Builds the context, runs the provider, and enforces the limits."""

    def __init__(self, db, settings: Settings = default_settings) -> None:
        self.db = db
        self.settings = settings
        self.repo = ChartRepository(db)
        self.selection_repo = SelectionRepository(db)

    # --- status -----------------------------------------------------------

    def status(self) -> AIStatusOut:
        """Report availability without raising — the UI asks this on every load."""
        try:
            provider = get_provider(self.settings)
        except AIUnavailableError as exc:
            return AIStatusOut(enabled=False, provider="", simulated=True, disclaimer=str(exc))
        return AIStatusOut(
            enabled=True,
            provider=provider.name,
            simulated=provider.simulated,
            disclaimer=disclaimer_for(provider),
        )

    def _provider(self) -> AIProvider:
        try:
            return get_provider(self.settings)
        except AIUnavailableError as exc:
            # 400 rather than 500: the layer being off is a configuration state,
            # not a failure.
            raise ValidationError(str(exc)) from exc

    # --- interpretation ---------------------------------------------------

    def _context(self, statement: str) -> ProblemContext:
        properties = self.repo.list_properties()
        indices = self.selection_repo.list_indices()
        classes = {m.material_class.slug: m.material_class.name for m in self.repo.list_materials()}
        return ProblemContext(
            statement=statement,
            properties=[
                PropertyFacts(
                    slug=p.slug,
                    name=p.name,
                    symbol=p.symbol,
                    category=p.category.value,
                    canonical_unit=p.canonical_unit,
                    accepted_units=list(p.accepted_units or []),
                    better_direction=p.better_direction.value,
                )
                for p in properties
            ],
            indices=[
                IndexFacts(
                    slug=i.slug,
                    name=i.name,
                    expression=i.expression,
                    goal=i.goal,
                    description=i.description,
                    assumptions=i.assumptions,
                )
                for i in indices
            ],
            classes=[ClassFacts(slug=slug, name=name) for slug, name in sorted(classes.items())],
        )

    def interpret(self, request: InterpretRequest) -> InterpretationOut:
        provider = self._provider()
        statement = request.statement.strip()
        if not statement:
            raise ValidationError("Informe o enunciado do problema.")

        context = self._context(statement)
        catalogue = context.catalogue()
        raw = provider.interpret(context)
        rejected: list[str] = []

        return InterpretationOut(
            statement=statement,
            function_text=_text_or_none(raw.get("function_text")),
            objective_text=_text_or_none(raw.get("objective_text")),
            free_variables=[str(v) for v in raw.get("free_variables", [])][:10],
            constraints=self._accept_constraints(raw, statement, catalogue, rejected),
            properties=self._accept_properties(raw, catalogue, rejected),
            indices=self._accept_indices(raw, catalogue, rejected),
            chart=self._accept_chart(raw, catalogue, rejected),
            open_questions=[str(q) for q in raw.get("open_questions", [])],
            rejected=rejected,
            provider=provider.name,
            simulated=provider.simulated,
            disclaimer=disclaimer_for(provider),
        )

    @staticmethod
    def _accept_constraints(
        raw: dict, statement: str, catalogue: Catalogue, rejected: list[str]
    ) -> list[SuggestedConstraint]:
        accepted: list[SuggestedConstraint] = []
        for item in raw.get("constraints", []):
            try:
                suggestion = SuggestedConstraint(
                    constraint=ConstraintIn(**item["constraint"]),
                    evidence=item.get("evidence", ""),
                    rationale=item.get("rationale", ""),
                )
            except Exception as exc:  # malformed provider output
                rejected.append(f"Restrição descartada por formato inválido: {exc}")
                continue
            reason = check_constraint(suggestion.constraint, statement, catalogue)
            if reason:
                rejected.append(reason)
                continue
            accepted.append(suggestion)
        return accepted

    @staticmethod
    def _accept_properties(
        raw: dict, catalogue: Catalogue, rejected: list[str]
    ) -> list[SuggestedProperty]:
        accepted: list[SuggestedProperty] = []
        for item in raw.get("properties", []):
            slug = str(item.get("slug", ""))
            reason = check_property(slug, catalogue)
            if reason:
                rejected.append(reason)
                continue
            accepted.append(
                SuggestedProperty(
                    slug=slug,
                    name=str(item.get("name", slug)),
                    rationale=str(item.get("rationale", "")),
                )
            )
        return accepted

    @staticmethod
    def _accept_indices(
        raw: dict, catalogue: Catalogue, rejected: list[str]
    ) -> list[SuggestedIndex]:
        accepted: list[SuggestedIndex] = []
        for item in raw.get("indices", []):
            slug = str(item.get("slug", ""))
            reason = check_index(slug, catalogue)
            if reason:
                rejected.append(reason)
                continue
            try:
                accepted.append(SuggestedIndex(**item))
            except Exception as exc:
                rejected.append(f"Índice descartado por formato inválido: {exc}")
        return accepted

    @staticmethod
    def _accept_chart(
        raw: dict, catalogue: Catalogue, rejected: list[str]
    ) -> SuggestedChart | None:
        item = raw.get("chart")
        if not item:
            return None
        reason = check_chart(str(item.get("x", "")), str(item.get("y", "")), catalogue)
        if reason:
            rejected.append(reason)
            return None
        try:
            return SuggestedChart(**item)
        except Exception as exc:
            rejected.append(f"Gráfico descartado por formato inválido: {exc}")
            return None

    # --- explanation ------------------------------------------------------

    def explain(self, study_id: int, project_id: int) -> ExplanationOut:
        provider = self._provider()
        study = self.selection_repo.get_study(study_id, project_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")

        # The prose is written about numbers this call just produced, not about
        # numbers the caller supplied.
        result = SelectionService(self.db, project_id).run_study(study_id)
        context = _result_context(study, result)

        raw = provider.explain(context)
        summary = str(raw.get("summary", ""))
        paragraphs = [str(p) for p in raw.get("paragraphs", [])]
        caveats = [str(c) for c in raw.get("caveats", [])]

        # Last line of defence: prose may not introduce figures the pipeline
        # never computed.
        invented: list[float] = []
        for text in [summary, *paragraphs]:
            invented.extend(ungrounded_numbers(text, context.numbers))
        if invented:
            values = ", ".join(f"{value:g}" for value in sorted(set(invented)))
            raise ValidationError(
                "A explicação gerada citou números que o cálculo não produziu "
                f"({values}); a resposta foi descartada."
            )

        return ExplanationOut(
            study_id=study_id,
            study_name=study.name,
            summary=summary,
            paragraphs=paragraphs,
            caveats=caveats,
            provider=provider.name,
            simulated=provider.simulated,
            disclaimer=disclaimer_for(provider),
        )


def _result_context(study, result) -> ResultContext:
    """Flatten a computed run into the read-only view a provider may see."""
    ranked = [(r.name, r.rank, r.score) for r in (result.ranking.ranked if result.ranking else [])]
    excluded = [
        # Labels, not keys: whatever a provider quotes from here ends up in
        # prose a person reads.
        (e.name, list(e.missing_labels))
        for e in (result.ranking.excluded if result.ranking else [])
    ]
    funnel = [(step.label, step.remaining) for step in result.funnel]

    # Every figure the prose is allowed to mention: the counts and scores this
    # run produced, plus the numbers already embedded in the backend's own
    # strings — an index dimension of "[length] ** 2.5" or a constraint label
    # reading "≥ 300 degC" is pipeline output, so quoting it is not an
    # invention.
    numbers: set[float] = {float(result.initial_count), float(result.final_count)}
    numbers.update(float(remaining) for _, remaining in funnel)
    for _, rank, score in ranked:
        numbers.update({float(rank), float(score), round(float(score), 3)})
    for candidate in result.candidates:
        if candidate.index_value is not None:
            numbers.add(float(candidate.index_value))
    for text in [
        study.name,
        study.function_text or "",
        study.objective_text or "",
        study.index_expression or "",
        result.index.dimension if result.index else "",
        *[c.label or "" for c in study.constraints],
        # Material names are pipeline output as much as any label is: writing
        # "Aço AISI 1020 lidera" quotes the catalogue, it does not invent 1020.
        # Without this, naming the winner would be enough to have a whole
        # explanation discarded the moment the catalogue holds a real alloy
        # designation.
        *[name for name, _, _ in ranked],
        *[name for name, _ in excluded],
        *[label for _, labels in excluded for label in labels],
    ]:
        numbers.update(numbers_in(text))

    return ResultContext(
        study_name=study.name,
        function_text=study.function_text,
        objective_text=study.objective_text,
        constraint_labels=[c.label or c.operator for c in study.constraints],
        index_name=study.index_name,
        index_expression=study.index_expression,
        index_dimension=result.index.dimension if result.index else None,
        initial_count=result.initial_count,
        final_count=result.final_count,
        funnel=funnel,
        ranked=ranked,
        excluded_for_missing=excluded,
        sensitivity_changed=any(
            scenario.changed for scenario in (result.ranking.sensitivity if result.ranking else [])
        ),
        numbers=numbers,
    )


def _text_or_none(value) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None
