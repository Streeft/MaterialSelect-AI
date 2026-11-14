"""The project plan by local rules (D-224): the mock's answer and the fallback.

Two callers, one function. The simulated provider answers ``plan`` with it, so
the tests and the E2E run the whole assistant deterministically and offline.
And when a real model fails — timeout, quota, a JSON that does not parse — the
service answers with it instead of an error, saying plainly that the proposal
came from local rules.

The rules are deliberately small and honest:

* **Trigger words → curated scenarios** (``app/domain/use_scenarios.py``). The
  numbers stay in that table; this module only names scenarios by id.
* **A few archetypes** split a product into parts — a cold-weather garment into
  outer shell, insulation and lining; a building into structure, envelope and
  insulation. Anything else is one component.
* **The person's own numbers** are read by the same lexical rules
  ``/ai/interpret`` uses (``MockAIProvider._read_constraints``), copied
  verbatim, so they pass the grounding guardrail by construction.
* **An index or criteria, always.** The nearest ready-made formulation
  (``app/domain/study_templates.py``) when the text names a beam, a panel, a
  spring…; otherwise the properties the scenarios constrain, each in its
  better direction.

It returns the same plain dict ``app/ai/plan.read_plan`` produces from a model,
so the service validates both the same way.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.ai.mock import MockAIProvider
from app.ai.provider import PlanContext
from app.domain.study_templates import nearest_template
from app.domain.text_fold import fold_accents, word_pattern
from app.domain.use_scenarios import UseScenario, match_scenarios, scenario_by_id


@dataclass(frozen=True)
class _Part:
    name: str
    role: str
    function_text: str
    objective_text: str
    #: Scenarios this part always carries, whatever the text says.
    scenario_ids: tuple[str, ...] = ()
    criteria: tuple[tuple[str, str], ...] = ()
    index_slug: str | None = None
    #: On the outside of the product: sun, rain and chemicals reach it.
    exposed: bool = False
    #: Only included when one of these scenarios was triggered by the text.
    only_with: tuple[str, ...] = ()


@dataclass(frozen=True)
class _Archetype:
    id: str
    triggers: tuple[str, ...]
    subject: str
    assumptions: tuple[str, ...]
    open_questions: tuple[str, ...]
    parts: tuple[_Part, ...]


_GARMENT = _Archetype(
    id="vestuario",
    triggers=(
        "roupa*",
        "jaqueta*",
        "casaco*",
        "macacao",
        "vestimenta*",
        "agasalh*",
        "uniforme*",
        "esqui",
        "snowboard",
    ),
    subject="uma peça de vestuário",
    assumptions=(
        "Peça usada no corpo, que precisa dobrar e acompanhar o movimento.",
        "Partes separadas por camada: a de fora protege, a do meio isola e a de "
        "dentro encosta na pele.",
    ),
    open_questions=(
        "Em que clima e por quanto tempo a peça vai ser usada?",
        "Ela precisa ser lavável à máquina?",
        "O peso ou o preço pesa mais na escolha?",
    ),
    parts=(
        _Part(
            name="Camada externa",
            role="Protege do vento, da neve e da água.",
            function_text="Casca externa flexível e impermeável",
            objective_text="Maximizar a resistência ao rasgo com pouco peso",
            scenario_ids=("flexivel", "impermeavel"),
            criteria=(("resistencia_tracao", "max"), ("densidade", "min")),
            exposed=True,
        ),
        _Part(
            name="Camada isolante",
            role="Segura o calor do corpo.",
            function_text="Enchimento isolante térmico",
            objective_text="Minimizar a perda de calor com pouco peso",
            scenario_ids=("isolamento-termico",),
            criteria=(("condutividade_termica", "min"), ("densidade", "min")),
            only_with=("frio-extremo",),
        ),
        _Part(
            name="Forro",
            role="Encosta na pele: precisa ser confortável e seguro.",
            function_text="Forro interno em contato com a pele",
            objective_text="Maximizar o conforto (elasticidade) com pouco peso",
            scenario_ids=("contato-pele", "flexivel"),
            criteria=(("alongamento", "max"), ("densidade", "min")),
        ),
    ),
)

_BUILDING = _Archetype(
    id="construcao",
    triggers=(
        "predio*",
        "edificio*",
        "edificacao",
        "casa",
        "casas",
        "construcao",
        "construir",
        "galpao",
        "abrigo",
        "moradia",
        "cabana",
        "quiosque",
        "escola",
    ),
    subject="uma construção",
    assumptions=(
        "Construção de pequeno porte, de poucos andares.",
        "Números do pedido que não são limite de material (como a quantidade "
        "de pessoas) dimensionam a obra; não filtram materiais.",
        "Partes separadas por função: a estrutura sustenta, a vedação fecha e o "
        "isolamento mantém a temperatura dentro.",
    ),
    open_questions=(
        "Quantos andares e qual o vão entre os pilares?",
        "Em que clima fica a obra (frio, calor, litoral)?",
        "O orçamento pesa mais que o peso da estrutura?",
    ),
    parts=(
        _Part(
            name="Estrutura (vigas e pilares)",
            role="Sustenta o peso da construção e de quem está dentro.",
            function_text="Viga em flexão",
            objective_text="Minimizar o custo para a rigidez pedida",
            scenario_ids=("estrutural",),
            index_slug="viga-leve-rigidez-custo",
        ),
        _Part(
            name="Vedação e fachada",
            role="Fecha a construção e enfrenta sol e chuva.",
            function_text="Painel de vedação em flexão",
            objective_text="Minimizar o custo para a rigidez pedida",
            scenario_ids=("externo-uv", "agua-doce"),
            index_slug="placa-leve-rigidez-custo",
            exposed=True,
        ),
        _Part(
            name="Isolamento térmico",
            role="Mantém a temperatura de dentro estável.",
            function_text="Camada isolante na parede e na cobertura",
            objective_text="Minimizar a passagem de calor e o custo",
            scenario_ids=("isolamento-termico",),
            criteria=(("condutividade_termica", "min"), ("custo_massa", "min")),
        ),
    ),
)

_ARCHETYPES = (_GARMENT, _BUILDING)


def rule_plan(context: PlanContext) -> dict:
    """The plan the local rules give for ``context`` — always one component or more."""
    statement = context.statement
    folded = fold_accents(statement).lower()
    triggered = match_scenarios(statement)
    user_limits = _user_constraints(context)
    known_scenarios = {s.id for s in context.scenarios} or None

    archetype = None
    if context.mode == "project":
        archetype = next(
            (a for a in _ARCHETYPES if any(word_pattern(t).search(folded) for t in a.triggers)),
            None,
        )

    if archetype is not None:
        components = [
            _component_from_part(part, triggered, user_limits, known_scenarios)
            for part in archetype.parts
            if not part.only_with or any(s.id in part.only_with for s in triggered)
        ]
        summary = (
            f"Proposta para {archetype.subject}, dividida em {len(components)} partes: "
            "cada parte tem os limites do seu uso e os materiais do catálogo que passam neles."
        )
        assumptions = list(archetype.assumptions)
        questions = list(archetype.open_questions)
    else:
        components = [_generic_component(context, triggered, user_limits, known_scenarios)]
        summary = (
            "Proposta com um componente: os limites do uso que o pedido descreve e "
            "os materiais do catálogo que passam neles."
        )
        assumptions = []
        questions = [
            "O que a peça precisa aguentar no uso (peso, calor, frio, água, sol)?",
            "O que pesa mais na escolha: peso, preço ou durabilidade?",
        ]

    if triggered:
        names = ", ".join(s.name.lower() for s in triggered)
        assumptions.append(f"Situações de uso reconhecidas no pedido: {names}.")
    else:
        assumptions.append(
            "O pedido não descreve o ambiente de uso; nenhuma situação de uso foi aplicada."
        )
    if user_limits:
        assumptions.append(
            "Os limites que você escreveu valem para todas as partes; ajuste se algum "
            "for só de uma delas."
        )
    return {
        "summary": summary,
        "assumptions": assumptions,
        "open_questions": questions,
        "components": components,
    }


def _component_from_part(
    part: _Part,
    triggered: list[UseScenario],
    user_limits: list[dict],
    known: set[str] | None,
) -> dict:
    scenario_ids = list(part.scenario_ids)
    for scenario in triggered:
        reaches = scenario.scope == "todas" or (scenario.scope == "expostas" and part.exposed)
        if reaches and scenario.id not in scenario_ids:
            scenario_ids.append(scenario.id)
    return {
        "name": part.name,
        "role": part.role,
        "function_text": part.function_text,
        "objective_text": part.objective_text,
        "index_slug": part.index_slug,
        "criteria": [{"property_slug": slug, "direction": d} for slug, d in part.criteria],
        "scenario_ids": _known(scenario_ids, known),
        "constraints": [dict(limit) for limit in user_limits],
    }


def _generic_component(
    context: PlanContext,
    triggered: list[UseScenario],
    user_limits: list[dict],
    known: set[str] | None,
) -> dict:
    reading = MockAIProvider().interpret(context)
    index_slugs = {i.slug for i in context.indices}
    index_slug = next((i["slug"] for i in reading["indices"] if i["slug"] in index_slugs), None)
    template = nearest_template(context.statement)
    if index_slug is None and template is not None and template.index_slug in index_slugs:
        index_slug = template.index_slug

    criteria: list[dict] = []
    for scenario in triggered:
        for criterion in scenario.criteria:
            criteria.append(
                {"property_slug": criterion.property_slug, "direction": criterion.direction}
            )
    function_text = reading.get("function_text") or (template.function_text if template else "")
    objective_text = reading.get("objective_text") or (template.objective_text if template else "")
    return {
        "name": "Componente principal",
        "role": "A peça que o pedido descreve.",
        "function_text": function_text or "",
        "objective_text": objective_text or "",
        "index_slug": index_slug,
        "criteria": criteria,
        "scenario_ids": _known([s.id for s in triggered], known),
        "constraints": [dict(limit) for limit in user_limits],
    }


def _user_constraints(context: PlanContext) -> list[dict]:
    """The person's own numeric limits, copied verbatim by the lexical rules."""
    proposals, _unreadable = MockAIProvider()._read_constraints(context, context.statement)
    limits = []
    for proposal in proposals:
        constraint = proposal["constraint"]
        limits.append(
            {
                "origin": "usuario",
                "property_slug": constraint.get("property_slug") or "",
                "operator": constraint.get("operator") or "",
                "value": constraint.get("value"),
                "value_min": constraint.get("value_min"),
                "value_max": constraint.get("value_max"),
                "unit": constraint.get("unit"),
                "level": None,
                "evidence": proposal.get("evidence", ""),
                "note": "Limite escrito no seu pedido.",
            }
        )
    return limits


def _known(ids: list[str], known: set[str] | None) -> list[str]:
    if known is None:
        return [i for i in ids if scenario_by_id(i) is not None]
    return [i for i in ids if i in known]
