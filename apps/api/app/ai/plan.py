"""The project assistant's contract with a model (D-224).

A person who is not an engineer writes "quero fazer uma roupa de esqui" or
"um prédio que caiba 50 pessoas". This module holds what a real model is told
about that request, the JSON shape it must answer in, and the reading of that
answer into the plain dict ``AIService.plan`` validates. The rule-based provider
(``app/ai/rule_plan.py``) answers in the same dict, so the service cannot tell
— and does not need to know — which one wrote it.

What the model may do here, and what it may not:

* It **picks**: components, a catalogue index by slug, ranking criteria by
  slug, curated scenarios by id, qualitative limits (an ordinal level, a
  property that must exist).
* It **copies** a number only when the number is in the person's text
  (``origin: "usuario"``) — the grounding guardrail still applies.
* It may **suggest** a range (``origin: "sugestao_ia"``) only when no scenario
  covers the case. The suggestion is checked for unit and plausibility against
  the catalogue, shown as "Sugestão da IA, revise" and never applied without the
  person confirming it.
* It never sees, writes or copies a scenario's numbers — it names the scenario
  and the server expands it from ``app/domain/use_scenarios.py``.
* It never names a material. The materials come from the deterministic
  selection the server runs afterwards.
"""

from __future__ import annotations

import math

from app.ai.prompts import _classes_block, _indices_block, _reference_block
from app.ai.provider import PlanContext

#: Ceilings on what one answer may carry. A product is a handful of parts; a
#: part a handful of limits.
MAX_COMPONENTS = 6
MAX_CONSTRAINTS = 12
MAX_CRITERIA = 4
MAX_ITEMS = 8
MAX_TEXT = 300

#: Origins a model may write. ``cenario`` is not among them: a scenario enters
#: by id in ``scenario_ids`` and its limits are the server's to write.
MODEL_ORIGINS = ("usuario", "sugestao_ia")
PLAN_OPERATORS = ["gt", "gte", "lt", "lte", "between", "exists", "level_at_least"]

PLAN_SYSTEM = """\
Você ajuda pessoas comuns e estudantes — não engenheiros — a começar um projeto \
e a escolher materiais. Elas escrevem pedidos simples ("quero fazer uma roupa \
de esqui", "um prédio para algumas pessoas"), com ou sem números. Responda em \
português do Brasil, com frases curtas e sem jargão.

Seu trabalho é transformar o pedido numa proposta de projeto **estruturada** \
com o que existe no catálogo apresentado. Entenda o pedido mesmo quando o \
assunto não aparecer nos trechos de referência: use o bom senso de engenharia \
para dizer de que partes o produto é feito e o que cada parte precisa aguentar.

Regras, em ordem de importância:

1. Nunca devolva proposta vazia. Sempre há pelo menos um componente, com um \
índice do catálogo (index_slug) ou critérios de ordenação (criteria).
2. Modo "project": de duas a cinco partes do produto, cada uma com sua função. \
Modo "single": exatamente um componente.
3. Não cite nem recomende material. Quem escolhe os materiais é o servidor, \
pela seleção determinística sobre o catálogo.
4. Números têm três origens, nesta ordem:
   a. "usuario": o número está escrito no pedido. Copie-o exatamente, com a \
unidade escrita (notação Pint: degC, GPa, g/cm**3). Nunca converta.
   b. Cenários de uso: escolha pelo id em scenario_ids os cenários que \
descrevem o uso de cada parte (frio, sol, água, contato com a pele…). Você \
**não** escreve os números dos cenários: o servidor os conhece e os aplica.
   c. "sugestao_ia": só quando nenhum cenário cobre o caso e o pedido não traz \
o número. Proponha uma faixa típica de uso, com unidade, e explique em note. \
Ela será mostrada como "Sugestão da IA, revise" e não é aplicada sem a \
confirmação do usuário.
5. Prefira limite qualitativo a número inventado: level_at_least com um nível \
da escala de uma propriedade ordinal, ou exists (a propriedade precisa ter \
dado). Esses também levam origin "sugestao_ia".
6. Propriedades, índices e escalas só do catálogo. Não invente slug.
7. Os "Trechos de referência", quando houver, são só vocabulário. Nenhum \
número deles vira limite.
8. summary, assumptions, open_questions, role e note não trazem números além \
dos que o usuário escreveu.

Em assumptions, diga o que você supôs (ex.: "uso em montanha, no inverno"). Em \
open_questions, o que vale perguntar para melhorar a proposta.\
"""


def plan_user(context: PlanContext) -> str:
    """The catalogue the model may choose from, the scenarios by id, then the request."""
    blocks = [
        f'# Modo: "{context.mode}"',
        "",
        "# Propriedades numéricas (slug: nome | unidade canônica | melhor quando)",
        _numeric_block(context) or "(vazio)",
        "",
        "# Propriedades ordinais (slug: nome | escala, do pior ao melhor)",
        _ordinal_block(context) or "(vazio)",
        "",
        "# Índices de desempenho cadastrados (slug: nome | expressão | objetivo)",
        _indices_block(context) or "(vazio)",
        "",
        "# Classes de materiais (slug: nome)",
        _classes_block(context) or "(vazio)",
        "",
        "# Cenários de uso (id: nome | o que exige — os números ficam no servidor)",
        _scenario_block(context) or "(vazio)",
    ]
    reference = _reference_block(context.retrieved)
    if reference:
        blocks += ["", reference]
    blocks += ["", "# Pedido do usuário (a única fonte legítima de números)", context.statement]
    return "\n".join(blocks)


def plan_schema(context: PlanContext) -> dict:
    """The JSON contract, narrowed to this catalogue.

    No field forces a number: ``value``/``unit`` are nullable, because a limit
    may be an ordinal level or plain existence, and a schema that demanded a
    number on every limit was how the old interpretation came back empty for a
    request without one.
    """
    numeric = [p.slug for p in context.properties]
    ordinal = [o.slug for o in context.ordinals]
    index_slugs = [i.slug for i in context.indices]
    scenario_ids = [s.id for s in context.scenarios]
    nullable_number = {"type": ["number", "null"]}

    constraint = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "origin",
            "property_slug",
            "operator",
            "value",
            "value_min",
            "value_max",
            "unit",
            "level",
            "evidence",
            "note",
        ],
        "properties": {
            "origin": {"type": "string", "enum": list(MODEL_ORIGINS)},
            "property_slug": _enum(numeric + ordinal),
            "operator": {
                "type": "string",
                "enum": PLAN_OPERATORS,
                "description": (
                    "gt/gte/lt/lte usam value e unit; between usa value_min e value_max; "
                    "level_at_least usa level (rótulo da escala); exists não usa número."
                ),
            },
            "value": nullable_number,
            "value_min": nullable_number,
            "value_max": nullable_number,
            "unit": {"type": "string", "description": "Notação Pint; vazio sem número."},
            "level": {
                "type": "string",
                "description": "Rótulo da escala; vazio fora de level_at_least.",
            },
            "evidence": {
                "type": "string",
                "description": "Para origin usuario: trecho copiado do pedido. Senão, vazio.",
            },
            "note": {"type": "string", "description": "Por que este limite, em uma frase."},
        },
    }
    component = {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "name",
            "role",
            "function_text",
            "objective_text",
            "index_slug",
            "criteria",
            "scenario_ids",
            "constraints",
        ],
        "properties": {
            "name": {"type": "string", "description": "Nome curto da parte (ex.: 'Forro')."},
            "role": {"type": "string", "description": "O que esta parte faz no produto."},
            "function_text": {"type": "string"},
            "objective_text": {"type": "string"},
            "index_slug": _enum([*index_slugs, ""]),
            "criteria": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["property_slug", "direction"],
                    "properties": {
                        "property_slug": _enum(numeric),
                        "direction": {"type": "string", "enum": ["max", "min"]},
                    },
                },
            },
            "scenario_ids": {"type": "array", "items": _enum(scenario_ids)},
            "constraints": {"type": "array", "items": constraint},
        },
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["summary", "assumptions", "open_questions", "components"],
        "properties": {
            "summary": {"type": "string", "description": "Uma ou duas frases."},
            "assumptions": {"type": "array", "items": {"type": "string"}},
            "open_questions": {"type": "array", "items": {"type": "string"}},
            "components": {"type": "array", "items": component},
        },
    }


def read_plan(raw: dict) -> dict:
    """Turn one model answer into the dict the service validates.

    Coercion only — every judgement (does the slug exist, is the number in the
    text, is the suggestion plausible) belongs to the service and its
    guardrails, which report what they refuse instead of quietly tidying it.
    """
    components = []
    for item in _as_list(raw.get("components"))[:MAX_COMPONENTS]:
        if not isinstance(item, dict):
            continue
        components.append(
            {
                "name": _clip(item.get("name")),
                "role": _clip(item.get("role")),
                "function_text": _clip(item.get("function_text")),
                "objective_text": _clip(item.get("objective_text")),
                "index_slug": _text(item.get("index_slug")),
                "criteria": [
                    {
                        "property_slug": _text(c.get("property_slug")) or "",
                        "direction": "min" if _text(c.get("direction")) == "min" else "max",
                    }
                    for c in _as_list(item.get("criteria"))[:MAX_CRITERIA]
                    if isinstance(c, dict)
                ],
                "scenario_ids": [
                    text for text in (_text(s) for s in _as_list(item.get("scenario_ids"))) if text
                ][:MAX_ITEMS],
                "constraints": [
                    read_constraint(c)
                    for c in _as_list(item.get("constraints"))[:MAX_CONSTRAINTS]
                    if isinstance(c, dict)
                ],
            }
        )
    return {
        "summary": _clip(raw.get("summary")),
        "assumptions": _texts(raw.get("assumptions")),
        "open_questions": _texts(raw.get("open_questions")),
        "components": components,
    }


def read_constraint(item: dict) -> dict:
    """One limit as the service expects it; unknown origins stay for it to refuse."""
    return {
        "origin": _text(item.get("origin")) or "",
        "property_slug": _text(item.get("property_slug")) or "",
        "operator": _text(item.get("operator")) or "",
        "value": _number(item.get("value")),
        "value_min": _number(item.get("value_min")),
        "value_max": _number(item.get("value_max")),
        "unit": _text(item.get("unit")),
        "level": _text(item.get("level")),
        "evidence": _clip(item.get("evidence")),
        "note": _clip(item.get("note")),
    }


# --- prompt blocks -------------------------------------------------------------


def _numeric_block(context: PlanContext) -> str:
    lines = []
    for facts in context.properties:
        if facts.better_direction.lower() in {"lower", "min", "minimize"}:
            better = "menor é melhor"
        elif facts.better_direction.lower() in {"higher", "max", "maximize"}:
            better = "maior é melhor"
        else:
            better = "neutra"
        lines.append(f"- {facts.slug}: {facts.name} | {facts.canonical_unit} | {better}")
    return "\n".join(lines)


def _ordinal_block(context: PlanContext) -> str:
    return "\n".join(
        f"- {facts.slug}: {facts.name} | {' < '.join(facts.levels)}" for facts in context.ordinals
    )


def _scenario_block(context: PlanContext) -> str:
    return "\n".join(f"- {s.id}: {s.name} | {s.summary}" for s in context.scenarios)


def _enum(values: list[str]) -> dict:
    return {"type": "string", "enum": values} if values else {"type": "string"}


# --- coercions -----------------------------------------------------------------


def _as_list(value: object) -> list:
    return value if isinstance(value, list) else []


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _clip(value: object) -> str:
    return (_text(value) or "")[:MAX_TEXT]


def _texts(value: object) -> list[str]:
    return [text[:MAX_TEXT] for text in (_text(v) for v in _as_list(value)) if text][:MAX_ITEMS]


def _number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None
