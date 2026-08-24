"""The half of a real provider that has nothing to do with transport.

Prompt, JSON contract and the translation from what a model answers into the
dict :class:`~app.services.ai_service.AIService` expects all live here, so no two
providers can disagree about any of them. A subclass answers one question: given
a system prompt, a user message and a JSON schema, what did the model reply?

Nothing in this module is specific to one vendor, and that is the point. The
guarantees below are the *layer's*, not Claude's: the Anthropic API, the local
Claude Code CLI and any OpenAI-compatible endpoint all reach the service through
this same reading, so swapping the model cannot quietly swap the rules.

Nothing here trusts that reply. Two habits are deliberate:

* **Unknown slugs pass through unchanged.** It would be easy to filter them here
  and hand the service a tidy proposal, and that is exactly the wrong move — the
  guardrail rejects them *and says why*, and the user seeing what was refused is
  how the layer earns being believed about what was not.
* **The catalogue overwrites the model.** An index arrives as a slug and nothing
  else; its name, expression and goal are read from the catalogue afterwards. A
  model literally cannot author an expression through this path.
"""

from __future__ import annotations

import json
import math
from abc import abstractmethod

from app.ai.caveats import standard_caveats
from app.ai.prompts import (
    EXPLAIN_SCHEMA,
    EXPLAIN_SYSTEM,
    INTERPRET_SYSTEM,
    explain_user,
    interpret_schema,
    interpret_user,
)
from app.ai.provider import (
    AIProvider,
    AIUnavailableError,
    IndexFacts,
    ProblemContext,
    ResultContext,
)

# Longest free-text field the schemas accept (``SuggestedConstraint.evidence``
# and every ``rationale``). Clipping beats letting one verbose sentence turn an
# otherwise valid suggestion into a format rejection.
_MAX_TEXT = 300


class ModelProviderBase(AIProvider):
    """Everything a real provider does except the network call itself."""

    name = "model"
    #: Not simulated: the disclaimer shown to the user changes because of this.
    simulated = False

    @abstractmethod
    def _complete(self, system: str, user: str, schema: dict) -> dict:
        """Send one request and return the JSON object Claude answered with.

        Raises:
            AIUnavailableError: for anything that stops an answer arriving —
                missing credentials, timeout, refusal, unparseable output. The
                service turns it into an HTTP 400, because a provider that
                cannot answer is a configuration state, not a server fault.
        """

    def system_for(self, system: str, schema: dict) -> str:
        """The system prompt, for a transport that cannot enforce the schema.

        Servers differ in whether they constrain output to a JSON Schema. Where
        one cannot, the contract has to travel in words instead — so it belongs
        here, next to the schema it restates, and not in whichever transport
        happens to need it. The reading below does not get more trusting when
        the schema was only *asked for*: every field is still coerced, and the
        guardrails still run.
        """
        return (
            f"{system}\n\n"
            "Responda **exclusivamente** com um objeto JSON válido, sem texto "
            "antes ou depois e sem cercas de código, obedecendo a este JSON "
            f"Schema:\n\n{json.dumps(schema, ensure_ascii=False, indent=2)}"
        )

    def interpret(self, context: ProblemContext) -> dict:
        raw = self._complete(
            INTERPRET_SYSTEM,
            interpret_user(context),
            interpret_schema(context),
        )
        return read_interpretation(raw, context)

    def explain(self, context: ResultContext) -> dict:
        raw = self._complete(EXPLAIN_SYSTEM, explain_user(context), EXPLAIN_SCHEMA)
        return {
            "summary": _text(raw.get("summary")) or "",
            "paragraphs": [
                text for text in (_text(p) for p in _as_list(raw.get("paragraphs"))) if text
            ],
            # Not the model's to write, and not the model's to leave out.
            "caveats": standard_caveats(context),
        }


def read_interpretation(raw: dict, context: ProblemContext) -> dict:
    """Turn one model answer into the shape the service validates."""
    indices = {facts.slug: facts for facts in context.indices}
    property_names = {facts.slug: facts.name for facts in context.properties}

    charts = [
        chart for chart in (_read_chart(item) for item in _as_list(raw.get("charts"))) if chart
    ]

    return {
        "function_text": _text(raw.get("function_text")),
        "objective_text": _text(raw.get("objective_text")),
        "free_variables": [
            text for text in (_text(v) for v in _as_list(raw.get("free_variables"))) if text
        ],
        "constraints": [
            _read_constraint(item)
            for item in _as_list(raw.get("constraints"))
            if isinstance(item, dict)
        ],
        "properties": [
            _read_property(item, property_names)
            for item in _as_list(raw.get("properties"))
            if isinstance(item, dict)
        ],
        "indices": [
            _read_index(item, indices)
            for item in _as_list(raw.get("indices"))
            if isinstance(item, dict)
        ],
        # The contract carries at most one map; the schema uses a list because a
        # nullable object is the kind of shape models get wrong.
        "chart": charts[0] if charts else None,
        "open_questions": [
            text for text in (_text(q) for q in _as_list(raw.get("open_questions"))) if text
        ],
    }


def parse_json_object(text: str) -> dict:
    """Read a JSON object out of a model's answer, or fail loudly."""
    try:
        payload = json.loads(text)
    except (TypeError, ValueError) as exc:
        raise AIUnavailableError(
            "A resposta do modelo não veio em JSON válido e foi descartada."
        ) from exc
    if not isinstance(payload, dict):
        raise AIUnavailableError("A resposta do modelo não veio como um objeto JSON.")
    return payload


# --- reading one item ------------------------------------------------------


def _read_constraint(item: dict) -> dict:
    proposed = item.get("constraint")
    if not isinstance(proposed, dict):
        proposed = {}
    return {
        "constraint": {
            "operator": _text(proposed.get("operator")) or "",
            # Empty string means "no property" in the schema, because a class
            # constraint has none; the service's schema wants None for that.
            "property_slug": _text(proposed.get("property_slug")),
            "value": _number(proposed.get("value")),
            "value_min": _number(proposed.get("value_min")),
            "value_max": _number(proposed.get("value_max")),
            "unit": _text(proposed.get("unit")),
            "class_slugs": [
                slug for slug in (_text(s) for s in _as_list(proposed.get("class_slugs"))) if slug
            ],
        },
        "evidence": _clip(item.get("evidence")),
        "rationale": _clip(item.get("rationale")),
    }


def _read_property(item: dict, names: dict[str, str]) -> dict:
    slug = _text(item.get("slug")) or ""
    return {
        "slug": slug,
        # The catalogue names the property; the model only picked it.
        "name": names.get(slug, slug),
        "rationale": _clip(item.get("rationale")),
    }


def _read_index(item: dict, indices: dict[str, IndexFacts]) -> dict:
    slug = _text(item.get("slug")) or ""
    facts = indices.get(slug)
    return {
        "slug": slug,
        # Name, expression and goal are the catalogue's, never the model's. An
        # unknown slug keeps these placeholders and is rejected downstream —
        # with a reason the user reads.
        "name": facts.name if facts else slug,
        "expression": facts.expression if facts else "",
        "goal": facts.goal if facts else "maximize",
        "rationale": _clip(item.get("rationale")),
    }


def _read_chart(item: object) -> dict | None:
    if not isinstance(item, dict):
        return None
    x = _text(item.get("x"))
    y = _text(item.get("y"))
    if not x or not y:
        return None
    scale = (_text(item.get("scale")) or "log").lower()
    return {
        "x": x,
        "y": y,
        "scale": scale if scale in {"linear", "log"} else "log",
        "rationale": _clip(item.get("rationale")),
    }


# --- coercions -------------------------------------------------------------


def _as_list(value: object) -> list:
    return value if isinstance(value, list) else []


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _clip(value: object) -> str:
    return (_text(value) or "")[:_MAX_TEXT]


def _number(value: object) -> float | None:
    """A finite float, or None.

    A non-finite value becomes None on purpose: the guardrail then reports the
    honest "operator without a value" instead of a Pydantic type error.
    """
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if math.isfinite(number) else None
