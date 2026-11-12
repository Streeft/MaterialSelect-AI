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

import hashlib
import logging
import threading
import time
import unicodedata
from collections import OrderedDict
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, replace
from datetime import UTC, date, datetime

from app.ai.factory import disclaimer_for, get_provider
from app.ai.guardrails import (
    Catalogue,
    check_chart,
    check_citations,
    check_constraint,
    check_index,
    check_property,
    numbers_in,
    ungrounded_numbers,
)
from app.ai.prompts import UNPAGINATED_KINDS
from app.ai.provider import (
    AIProvider,
    AIUnavailableError,
    ClassFacts,
    IndexFacts,
    OrdinalFacts,
    PlanContext,
    ProblemContext,
    PropertyFacts,
    ResultContext,
    ScenarioFacts,
)
from app.ai.rule_plan import rule_plan
from app.config import Settings
from app.config import settings as default_settings
from app.domain.errors import NotFoundError, QuotaExceededError, ValidationError
from app.domain.use_scenarios import USE_SCENARIOS
from app.knowledge.retrieval import search as knowledge_search
from app.models.user import User
from app.repositories.chart_repository import ChartRepository
from app.repositories.notebook_repository import NotebookRepository
from app.repositories.ordinal_repository import OrdinalRepository
from app.repositories.selection_repository import SelectionRepository
from app.schemas.ai import (
    AIStatusOut,
    CitedSourceOut,
    ExplanationOut,
    InterpretationOut,
    InterpretRequest,
    PlanRequest,
    PlanRunRequest,
    PlanRunResponse,
    ProjectPlanOut,
    SuggestedChart,
    SuggestedConstraint,
    SuggestedIndex,
    SuggestedProperty,
)
from app.schemas.selection import ConstraintIn
from app.services.ai_plan import PlanBuilder, PlanCatalogue, grounded_prose, scenarios_out
from app.services.selection_service import SelectionService

logger = logging.getLogger(__name__)


class _TTLCache:
    """A small time-bounded, size-bounded, thread-safe memo (D-224).

    Process-local on purpose: one API machine, and what it holds is either
    cheap to read again (the catalogue summary) or a model answer whose only
    cost is the quota. A restart empties it and nothing is lost.
    """

    def __init__(self, max_entries: int) -> None:
        self._max = max_entries
        self._items: OrderedDict[object, tuple[float, object]] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: object) -> object | None:
        with self._lock:
            item = self._items.get(key)
            if item is None:
                return None
            expires, value = item
            if expires < time.monotonic():
                del self._items[key]
                return None
            self._items.move_to_end(key)
            return value

    def put(self, key: object, value: object, ttl: float) -> None:
        if ttl <= 0:
            return
        with self._lock:
            self._items[key] = (time.monotonic() + ttl, value)
            self._items.move_to_end(key)
            while len(self._items) > self._max:
                self._items.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._items.clear()


#: viewer id → the catalogue summary the prompts carry.
_CONTEXT_CACHE = _TTLCache(max_entries=256)
#: viewer id → lowest/highest value per property (the sugestao_ia yardstick).
_RANGE_CACHE = _TTLCache(max_entries=256)
#: hash of (provider, model, mode, normalised text) → the provider's raw plan.
_PLAN_CACHE = _TTLCache(max_entries=512)


def reset_ai_caches() -> None:
    """Forget every cached summary and plan (tests; a catalogue reload)."""
    _CONTEXT_CACHE.clear()
    _RANGE_CACHE.clear()
    _PLAN_CACHE.clear()


@dataclass(frozen=True)
class _CatalogueFacts:
    properties: tuple[PropertyFacts, ...]
    indices: tuple[IndexFacts, ...]
    classes: tuple[ClassFacts, ...]
    ordinals: tuple[OrdinalFacts, ...]


_SCENARIO_FACTS = tuple(
    ScenarioFacts(id=s.id, name=s.name, summary=s.summary) for s in USE_SCENARIOS
)


class AIService:
    """Builds the context, runs the provider, and enforces the limits."""

    def __init__(self, db, settings: Settings = default_settings, user: User | None = None) -> None:
        self.db = db
        self.settings = settings
        self.user = user
        self.viewer_id = user.id if user is not None else None
        self.repo = ChartRepository(db, self.viewer_id)
        self.selection_repo = SelectionRepository(db, self.viewer_id)

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

    # --- daily quota (D-179) ----------------------------------------------

    @contextmanager
    def _spending(self, provider: AIProvider) -> Iterator[None]:
        """One unit of the caller's daily AI budget held around a model call.

        The same ``AIUsage.requests`` counter the Cadernos spend — one key, one
        budget per student per day — reserved atomically before the call and
        handed back only if the provider itself fails. The simulated provider
        calls no model and is never counted. Every route that reaches here is
        behind ``get_current_user`` (even in open mode, D-83), so there is always
        a person to count; a service built without one (no request) has no
        key-spending caller to stop and is left alone.
        """
        if provider.simulated or self.user is None:
            yield
            return
        repo = NotebookRepository(self.db, self.user.id)
        day = _today()
        limit = self.settings.ai_daily_requests
        if not repo.reserve(day, "requests", limit):
            self.db.rollback()
            raise QuotaExceededError(
                f"Você usou as {limit} consultas à IA de hoje. O limite volta amanhã; "
                "o restante do app continua disponível."
            )
        self.db.commit()
        try:
            yield
        except BaseException:
            self.db.rollback()
            repo.release(day, "requests")
            self.db.commit()
            raise

    # --- interpretation ---------------------------------------------------

    def _catalogue_facts(self) -> _CatalogueFacts:
        """What the prompts say about the catalogue — read lightly, kept briefly.

        Four small queries (properties, indices, the classes visible materials
        are in, ordinal scales), never the materials themselves: the classes
        used to be read through ``list_materials``, every material with every
        value, on every call (D-224). Kept per viewer for
        ``AI_CONTEXT_CACHE_SECONDS``, because a person's own records may add a
        class nobody else sees.
        """
        key = self.viewer_id
        cached = _CONTEXT_CACHE.get(key)
        if isinstance(cached, _CatalogueFacts):
            return cached
        facts = _CatalogueFacts(
            properties=tuple(
                PropertyFacts(
                    slug=p.slug,
                    name=p.name,
                    symbol=p.symbol,
                    category=p.category.value,
                    canonical_unit=p.canonical_unit,
                    accepted_units=list(p.accepted_units or []),
                    better_direction=p.better_direction.value,
                )
                for p in self.repo.list_properties()
            ),
            indices=tuple(
                IndexFacts(
                    slug=i.slug,
                    name=i.name,
                    expression=i.expression,
                    goal=i.goal,
                    description=i.description,
                    assumptions=i.assumptions,
                )
                for i in self.selection_repo.list_indices()
            ),
            classes=tuple(
                ClassFacts(slug=slug, name=name) for slug, name in self.repo.visible_class_names()
            ),
            ordinals=tuple(
                OrdinalFacts(
                    slug=d.slug,
                    name=d.name,
                    levels=tuple(level.label for level in d.levels),
                )
                for d in OrdinalRepository(self.db, self.viewer_id).list_definitions()
            ),
        )
        _CONTEXT_CACHE.put(key, facts, self.settings.ai_context_cache_seconds)
        return facts

    def _observed_ranges(self) -> dict[str, tuple[float, float]]:
        key = self.viewer_id
        cached = _RANGE_CACHE.get(key)
        if isinstance(cached, dict):
            return cached
        ranges = self.repo.observed_ranges()
        _RANGE_CACHE.put(key, ranges, self.settings.ai_context_cache_seconds)
        return ranges

    def _context(self, statement: str, provider: AIProvider) -> ProblemContext:
        facts = self._catalogue_facts()
        retrieved = self._retrieve(statement, provider)
        return ProblemContext(
            statement=statement,
            properties=list(facts.properties),
            indices=list(facts.indices),
            classes=list(facts.classes),
            retrieved=tuple(retrieved),
        )

    def _retrieve(self, query: str, provider: AIProvider) -> list:
        """Trechos do Cérebro para dar contexto ao provedor — nunca ao mock.

        O mock é descrito como determinístico e sem rede; ligar retrieval nele
        quebraria essa garantia, e todo teste que usa AI_PROVIDER=mock (a
        maioria da suíte) ficaria mais lento sem nenhum ganho.
        """
        if provider.simulated:
            return []
        started = time.monotonic()
        chunks = knowledge_search(
            self.db,
            query,
            top_k=self.settings.knowledge_retrieval_top_k,
            settings=self.settings,
            embed_budget=self.settings.knowledge_retrieval_budget_seconds,
        )
        elapsed = time.monotonic() - started
        if elapsed > self.settings.knowledge_retrieval_budget_seconds:
            logger.warning(
                "Busca no Cérebro levou %.1fs (orçamento de %.1fs).",
                elapsed,
                self.settings.knowledge_retrieval_budget_seconds,
            )
        return chunks

    def interpret(self, request: InterpretRequest) -> InterpretationOut:
        provider = self._provider()
        statement = request.statement.strip()
        if not statement:
            raise ValidationError("Informe o enunciado do problema.")

        context = self._context(statement, provider)
        catalogue = context.catalogue()
        with self._spending(provider):
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

    # --- project assistant (D-224) -----------------------------------------

    def _plan_catalogue(self, facts: _CatalogueFacts) -> PlanCatalogue:
        return PlanCatalogue(
            properties={p.slug: p for p in facts.properties},
            ordinals={o.slug: (o.name, o.levels) for o in facts.ordinals},
            indices={i.slug: i for i in facts.indices},
            guard=ProblemContext(
                statement="",
                properties=list(facts.properties),
                indices=list(facts.indices),
                classes=list(facts.classes),
            ).catalogue(),
        )

    def plan(self, request: PlanRequest) -> ProjectPlanOut:
        """A plain-language request → a checked, executed project proposal.

        Never empty and never an error when something useful can be said: a
        model that times out, runs out of quota or answers malformed JSON is
        replaced by the local rules (``app/ai/rule_plan.py``), and the answer
        says so in ``notice``. The same request within
        ``AI_PLAN_CACHE_SECONDS`` reuses the model's last plan and spends no
        quota. Only the layer being off is still a 400.
        """
        provider = self._provider()
        text = request.text.strip()
        if not text:
            raise ValidationError("Descreva o que você quer fazer.")
        facts = self._catalogue_facts()
        context = PlanContext(
            statement=text,
            properties=list(facts.properties),
            indices=list(facts.indices),
            classes=list(facts.classes),
            mode=request.mode,
            ordinals=facts.ordinals,
            scenarios=_SCENARIO_FACTS,
        )
        key = _plan_key(provider, self.settings, request.mode, text)
        raw = _PLAN_CACHE.get(key)
        cached = isinstance(raw, dict)
        notice: str | None = None
        degraded = False
        if not cached:
            try:
                context = replace(context, retrieved=tuple(self._retrieve(text, provider)))
                with self._spending(provider):
                    raw = provider.plan(context)
                if not isinstance(raw, dict) or not raw.get("components"):
                    raise AIUnavailableError("a resposta não trouxe nenhuma parte do projeto")
                _PLAN_CACHE.put(key, raw, self.settings.ai_plan_cache_seconds)
            except QuotaExceededError as exc:
                raw, degraded = rule_plan(context), True
                notice = (
                    f"{exc} Esta proposta foi montada pelas regras locais do app, "
                    "sem consultar a IA."
                )
            except AIUnavailableError as exc:
                raw, degraded = rule_plan(context), True
                notice = (
                    "A IA não respondeu como esperado, e esta proposta foi montada pelas "
                    f"regras locais do app. Motivo: {str(exc).rstrip('.')}."
                )
            except Exception:  # never an empty answer for a provider's defect
                logger.exception("Falha inesperada do provedor ao montar a proposta.")
                raw, degraded = rule_plan(context), True
                notice = (
                    "A IA falhou ao montar a proposta, e esta foi montada pelas regras "
                    "locais do app."
                )
        assert isinstance(raw, dict)
        return self._build_plan(raw, text, request.mode, provider, facts, notice, degraded, cached)

    def _build_plan(
        self,
        raw: dict,
        text: str,
        mode: str,
        provider: AIProvider,
        facts: _CatalogueFacts,
        notice: str | None,
        degraded: bool,
        cached: bool,
    ) -> ProjectPlanOut:
        builder = PlanBuilder(
            self.db, self.user, self._plan_catalogue(facts), self._observed_ranges
        )
        allowed = numbers_in(text)
        rejected: list[str] = []
        components_raw = [c for c in raw.get("components") or [] if isinstance(c, dict)]
        if mode == "single" and len(components_raw) > 1:
            rejected.append(
                "O modo de um componente usa só a primeira parte proposta; "
                f"as outras {len(components_raw) - 1} ficaram de fora."
            )
            components_raw = components_raw[:1]
        drafts = [builder.from_plan(c, i, text) for i, c in enumerate(components_raw)]

        summary = grounded_prose(raw.get("summary"), allowed)
        if raw.get("summary") and not summary:
            rejected.append("O resumo citava números que não estão no seu pedido e foi descartado.")
        assumptions, questions = [], []
        for source, target in (
            (raw.get("assumptions"), assumptions),
            (raw.get("open_questions"), questions),
        ):
            for item in source or []:
                if not str(item or "").strip():
                    continue
                kept = grounded_prose(item, allowed)
                if kept:
                    target.append(kept)
                else:
                    rejected.append(
                        "Uma frase da proposta citava números que não estão no seu pedido e "
                        "foi descartada."
                    )
        for draft in drafts:
            assumptions.extend(draft.notes)
        components = builder.run(drafts, text)
        return ProjectPlanOut(
            text=text,
            mode=mode,  # type: ignore[arg-type]
            summary=summary
            or f"Proposta com {len(components)} {'parte' if len(components) == 1 else 'partes'}.",
            assumptions=assumptions,
            open_questions=questions,
            scenarios_used=scenarios_out(drafts),
            components=components,
            rejected=rejected,
            degraded=degraded,
            cached=cached,
            notice=notice,
            provider=provider.name,
            simulated=provider.simulated,
            disclaimer=disclaimer_for(provider),
        )

    def run_plan(self, request: PlanRunRequest) -> PlanRunResponse:
        """Run a plan again with the person's choices — no model, no quota.

        Scenario limits are re-read from the table (the numbers a client sends
        for them are ignored); an AI suggestion runs only when ``confirmed``
        and after passing its plausibility check again.
        """
        facts = self._catalogue_facts()
        builder = PlanBuilder(
            self.db, self.user, self._plan_catalogue(facts), self._observed_ranges
        )
        drafts = [builder.from_run_in(c, i) for i, c in enumerate(request.components)]
        return PlanRunResponse(components=builder.run(drafts))

    # --- explanation ------------------------------------------------------

    def explain(self, study_id: int, project_id: int) -> ExplanationOut:
        provider = self._provider()
        study = self.selection_repo.get_study(study_id, project_id)
        if study is None:
            raise NotFoundError(f"Estudo não encontrado: {study_id}")

        # The prose is written about numbers this call just produced, not about
        # numbers the caller supplied.
        result = SelectionService(self.db, project_id, self.user).run_study(study_id)
        retrieved = self._retrieve(study.function_text or study.name, provider)
        context = _result_context(study, result, retrieved)

        with self._spending(provider):
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

        # Citations follow the same discipline: an index the provider made up
        # about its own answer is dropped, not trusted — check_citations is
        # the guardrail, this only translates what survives into something a
        # reader can act on.
        raw_sources = [
            i for i in raw.get("sources", []) if isinstance(i, int) and not isinstance(i, bool)
        ]
        valid_indices = check_citations(raw_sources, context.retrieved)
        sources = []
        for i in valid_indices:
            chunk = context.retrieved[i - 1]
            unpaginated = getattr(chunk, "document_kind", None) in UNPAGINATED_KINDS
            sources.append(
                CitedSourceOut(
                    document_title=chunk.document_title,
                    page_start=None if unpaginated else chunk.page_start,
                    page_end=None if unpaginated else chunk.page_end,
                )
            )

        return ExplanationOut(
            study_id=study_id,
            study_name=study.name,
            summary=summary,
            paragraphs=paragraphs,
            caveats=caveats,
            sources=sources,
            provider=provider.name,
            simulated=provider.simulated,
            disclaimer=disclaimer_for(provider),
        )


def _result_context(study, result, retrieved: list) -> ResultContext:
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

    # Constraint values and bounds
    for c in study.constraints:
        if c.value is not None:
            numbers.add(float(c.value))
        if c.value_min is not None:
            numbers.add(float(c.value_min))
        if c.value_max is not None:
            numbers.add(float(c.value_max))

    # Stage chart bounds and index levels
    for stage in getattr(study, "stages", []) or []:
        for attr in (
            "chart_x_min",
            "chart_x_max",
            "chart_y_min",
            "chart_y_max",
            "chart_index_level",
        ):
            val = getattr(stage, attr, None)
            if val is not None:
                try:
                    numbers.add(float(val))
                except (ValueError, TypeError):
                    pass

    # Ranking contribution raw values and weights
    if result.ranking:
        for r in result.ranking.ranked:
            for contrib in getattr(r, "contributions", []) or []:
                if getattr(contrib, "raw", None) is not None:
                    try:
                        numbers.add(float(contrib.raw))
                    except (ValueError, TypeError):
                        pass
                if getattr(contrib, "weight", None) is not None:
                    try:
                        numbers.add(float(contrib.weight))
                    except (ValueError, TypeError):
                        pass

    # Numbers from retrieved reference passages (citations, page numbers, text)
    if retrieved:
        from app.ai.prompts import _reference_block

        numbers.update(numbers_in(_reference_block(tuple(retrieved))))

    for text in [
        study.name,
        getattr(study, "description", "") or "",
        study.function_text or "",
        study.objective_text or "",
        study.index_expression or "",
        ", ".join(getattr(study, "free_variables", []) or []),
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
        universe=result.universe,
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
        retrieved=tuple(retrieved),
    )


def _plan_key(provider: AIProvider, settings: Settings, mode: str, text: str) -> str:
    """The cache key of a plan: same words, same mode, same model → same plan.

    Normalised so a trailing space or a capital letter does not pay the quota
    twice; numbers and accents are kept, because they change the request.
    """
    normalised = " ".join(unicodedata.normalize("NFC", text).casefold().split())
    model = "" if provider.simulated else settings.ai_model
    material = f"{provider.name}\n{model}\n{mode}\n{normalised}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _today() -> date:
    return datetime.now(UTC).date()


def _text_or_none(value) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None
