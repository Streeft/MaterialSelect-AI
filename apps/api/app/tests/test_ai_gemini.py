"""The free Google AI (Gemini via ``openai-compat``) in every AI function (D-228).

Simulated answers in the shape Gemini's OpenAI-compatible endpoint really sends:
the success envelope (with ``model`` and ``usage``), the error object wrapped
in a list, ``RESOURCE_EXHAUSTED`` with ``RetryInfo`` and ``QuotaFailure``. Three
promises are pinned down:

* every call the app makes — interpret, plan, explain, answer, digest, studio,
  suggest and the diagnosis probe — goes out as ``json_schema`` strict and is
  read back from a Gemini envelope;
* when Gemini refuses a feature of the strict schema (a 400 about the schema,
  not a generation that missed it), the provider steps down to
  ``AI_JSON_MODE=object`` once and remembers it — the reading and the
  guardrails do not change;
* a 429 from Google reads "a cota gratuita do Google acabou por agora; tente
  em X", with X from the server's own ``retryDelay`` or "amanhã" for the
  daily quota.
"""

from __future__ import annotations

import io
import json
import urllib.error

import pytest

from app.ai import openai_compat
from app.ai.mock import _mock_report
from app.ai.notebook import NotebookDigestContext, NotebookQuestion, Passage
from app.ai.openai_compat import OpenAICompatProvider
from app.ai.provider import (
    AIUnavailableError,
    ClassFacts,
    IndexFacts,
    PlanContext,
    ProblemContext,
    PropertyFacts,
    ResultContext,
)
from app.ai.rule_plan import rule_plan
from app.ai.studio import StudioRequest
from app.ai.suggest import Allowed, SuggestContext
from app.config import Settings

GEMINI = "https://generativelanguage.googleapis.com/v1beta/openai"
MODEL = "gemini-flash-lite-latest"


class _Response:
    def __init__(self, body: str) -> None:
        self._body = body.encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self) -> _Response:
        return self

    def __exit__(self, *_exc: object) -> bool:
        return False


class _Gemini:
    """Answers each request with the next scripted reply; records the bodies."""

    def __init__(self, *replies: object) -> None:
        self.replies = list(replies)
        self.bodies: list[dict] = []

    def __call__(self, request, timeout=None):  # noqa: ANN001
        self.bodies.append(json.loads(request.data.decode("utf-8")))
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        if isinstance(reply, Exception):
            raise reply
        return _Response(reply)


def _envelope(content: object) -> str:
    """What Gemini's ``/chat/completions`` sends back on success."""
    return json.dumps(
        {
            "choices": [
                {
                    "finish_reason": "stop",
                    "index": 0,
                    "message": {
                        "content": content if isinstance(content, str) else json.dumps(content),
                        "role": "assistant",
                    },
                }
            ],
            "created": 1762981200,
            "id": "abc",
            "model": MODEL,
            "object": "chat.completion",
            "usage": {"completion_tokens": 20, "prompt_tokens": 300, "total_tokens": 320},
        }
    )


def _google_error(code: int, status: str, message: str, details: list | None = None):
    body = json.dumps(
        [{"error": {"code": code, "message": message, "status": status, "details": details or []}}]
    )
    return urllib.error.HTTPError(
        f"{GEMINI}/chat/completions", code, status, {}, io.BytesIO(body.encode("utf-8"))
    )


def _provider(server: _Gemini, **overrides: object) -> OpenAICompatProvider:
    options: dict[str, object] = {
        "ai_provider": "openai-compat",
        "ai_base_url": GEMINI,
        "ai_api_key": "chave",
        "ai_model": MODEL,
    }
    options.update(overrides)
    return OpenAICompatProvider(
        settings=Settings(**options), opener=server, sleep=lambda _s: None  # type: ignore[arg-type]
    )


@pytest.fixture(autouse=True)
def _fresh_json_memory():
    openai_compat.reset_json_mode_memory()
    yield
    openai_compat.reset_json_mode_memory()


# --- contexts -------------------------------------------------------------------

PROPS = [
    PropertyFacts(
        slug="densidade",
        name="Densidade",
        symbol="ρ",
        category="fisica",
        canonical_unit="kg/m**3",
        accepted_units=["kg/m**3", "g/cm**3"],
        better_direction="min",
    )
]
INDICES = [
    IndexFacts("viga-leve", "Viga leve", "modulo_young**0.5/densidade", "maximize", None, None)
]
CLASSES = [ClassFacts("metal", "Metais")]
PASSAGES = (Passage(1, "Aula", "Aços", None, None, "Aços são ligas de ferro e carbono."),)


def _calls():
    plan_context = PlanContext(
        statement="Uma viga leve.", properties=PROPS, indices=INDICES, classes=CLASSES
    )
    studio = StudioRequest(
        tool="report", notebook_title="Caderno", source_titles=("Aula",), passages=PASSAGES
    )
    suggest = SuggestContext(
        tool="mapas",
        facts="Eixos atuais: nenhum.",
        numbers=frozenset(),
        allowed=Allowed(properties={"densidade": "Densidade", "modulo_young": "Módulo"}),
        rules=(),
        rule_summary="",
    )
    return {
        "interpret": (
            lambda p: p.interpret(ProblemContext("Viga leve.", PROPS, INDICES, CLASSES)),
            {"function_text": "Viga", "constraints": [], "indices": [{"slug": "viga-leve"}]},
        ),
        "plan": (lambda p: p.plan(plan_context), rule_plan(plan_context)),
        "explain": (
            lambda p: p.explain(
                ResultContext(
                    study_name="Estudo",
                    universe="material",
                    function_text=None,
                    objective_text=None,
                    constraint_labels=[],
                    index_name=None,
                    index_expression=None,
                    index_dimension=None,
                    initial_count=5,
                    final_count=5,
                    funnel=[],
                    ranked=[],
                    excluded_for_missing=[],
                    sensitivity_changed=False,
                )
            ),
            {"summary": "Resumo.", "paragraphs": ["Um parágrafo."], "sources": []},
        ),
        "answer": (
            lambda p: p.answer(NotebookQuestion(question="O que é aço?", passages=PASSAGES)),
            {
                "paragraphs": [{"text": "Liga de ferro e carbono.", "citations": [1]}],
                "not_found": False,
            },
        ),
        "digest": (
            lambda p: p.digest(NotebookDigestContext("Caderno", ("Aula",), PASSAGES)),
            {
                "paragraphs": [{"text": "Sobre aços.", "citations": [1]}],
                "questions": ["O que é aço?"],
            },
        ),
        "studio": (
            lambda p: p.studio(studio),
            {**_mock_report(studio, PASSAGES), "title": "Relatório"},
        ),
        "suggest": (
            lambda p: p.suggest(suggest),
            {"summary": "s", "suggestions": []},
        ),
        "probe": (lambda p: p.probe(), {"ok": True, "palavra": "material"}),
    }


@pytest.mark.parametrize("call", list(_calls()))
def test_every_ai_function_goes_out_as_strict_schema_and_reads_gemini(call: str) -> None:
    run, answer = _calls()[call]
    server = _Gemini(_envelope(answer))
    result = run(_provider(server))
    assert isinstance(result, dict)
    sent = server.bodies[0]
    assert sent["model"] == MODEL
    assert sent["response_format"]["type"] == "json_schema"
    assert sent["response_format"]["json_schema"]["strict"] is True
    assert sent["response_format"]["json_schema"]["schema"]["type"] == "object"


# --- a schema feature Gemini refuses ---------------------------------------------

SCHEMA_REFUSAL = (
    'Invalid JSON payload received. Unknown name "additionalProperties" at '
    "'generation_config.response_schema': Cannot find field."
)


def test_a_refused_schema_steps_down_to_object_mode_and_remembers() -> None:
    answer = {"ok": True, "palavra": "material"}
    server = _Gemini(
        _google_error(400, "INVALID_ARGUMENT", SCHEMA_REFUSAL),
        _envelope(answer),
    )
    provider = _provider(server)
    assert provider.probe()["ok"] is True
    assert server.bodies[0]["response_format"]["type"] == "json_schema"
    assert server.bodies[1]["response_format"] == {"type": "json_object"}
    # The contract now travels in words, and is still read and checked.
    assert "JSON Schema" in server.bodies[1]["messages"][0]["content"]
    assert provider.effective_json_mode() == "object"

    # The next call does not pay for the refusal again.
    again = _Gemini(_envelope(answer))
    _provider(again).probe()
    assert len(again.bodies) == 1
    assert again.bodies[0]["response_format"] == {"type": "json_object"}


def test_object_refused_too_steps_down_to_prompt() -> None:
    answer = {"ok": True, "palavra": "material"}
    server = _Gemini(
        _google_error(400, "INVALID_ARGUMENT", SCHEMA_REFUSAL),
        _google_error(400, "INVALID_ARGUMENT", "response_format json_object is not supported"),
        _envelope(answer),
    )
    provider = _provider(server)
    assert provider.probe()["ok"] is True
    assert "response_format" not in server.bodies[2]
    assert provider.effective_json_mode() == "prompt"


def test_a_plain_400_is_not_a_schema_refusal() -> None:
    server = _Gemini(
        _google_error(400, "INVALID_ARGUMENT", "Request contains an invalid argument.")
    )
    with pytest.raises(AIUnavailableError):
        _provider(server).probe()
    assert len(server.bodies) == 1
    assert _provider(_Gemini(_envelope({}))).effective_json_mode() == "schema"


def test_the_guardrails_still_run_after_stepping_down() -> None:
    """Degrading the transport never trusts the answer more: an invented slug
    is still reported by the reading, not hidden."""
    server = _Gemini(
        _google_error(400, "INVALID_ARGUMENT", SCHEMA_REFUSAL),
        _envelope({"indices": [{"slug": "indice-inventado"}], "constraints": []}),
    )
    raw = _provider(server).interpret(ProblemContext("Viga leve.", PROPS, INDICES, CLASSES))
    assert raw["indices"][0]["slug"] == "indice-inventado"
    assert raw["indices"][0]["expression"] == ""


# --- 429: the free quota ----------------------------------------------------------

PER_MINUTE = [
    {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        "violations": [
            {
                "quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_requests",
                "quotaId": "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
            }
        ],
    },
    {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "37s"},
]
PER_DAY = [
    {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        "violations": [
            {
                "quotaMetric": "generativelanguage.googleapis.com/generate_content_free_tier_requests",
                "quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
            }
        ],
    },
]


def test_429_per_minute_says_when_to_try_again() -> None:
    server = _Gemini(
        _google_error(
            429,
            "RESOURCE_EXHAUSTED",
            "You exceeded your current quota. Please retry in 37.4s.",
            PER_MINUTE,
        )
    )
    with pytest.raises(AIUnavailableError) as raised:
        _provider(server).probe()
    message = str(raised.value)
    assert "cota gratuita do Google acabou por agora" in message
    assert "37 s" in message
    assert len(server.bodies) == 1  # a quota is not retried inside the request


def test_429_per_day_says_tomorrow() -> None:
    server = _Gemini(
        _google_error(429, "RESOURCE_EXHAUSTED", "You exceeded your current quota.", PER_DAY)
    )
    with pytest.raises(AIUnavailableError) as raised:
        _provider(server).answer(NotebookQuestion(question="?", passages=PASSAGES))
    assert "cota gratuita do Google acabou" in str(raised.value)
    assert "amanhã" in str(raised.value)


def test_429_from_another_host_keeps_the_generic_message() -> None:
    server = _Gemini(_google_error(429, "RESOURCE_EXHAUSTED", "rate limited"))
    with pytest.raises(AIUnavailableError) as raised:
        _provider(server, ai_base_url="https://api.groq.com/openai/v1").probe()
    assert "Google" not in str(raised.value)
    assert "429" in str(raised.value)


def test_the_quota_message_reaches_the_plan_notice(
    client, monkeypatch: pytest.MonkeyPatch  # noqa: ANN001
) -> None:
    """The project assistant degrades to its rules and says why, in PT-BR."""
    from app.services import ai_service

    server = _Gemini(_google_error(429, "RESOURCE_EXHAUSTED", "quota", PER_MINUTE))
    provider = _provider(server)
    monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
    body = client.post("/api/ai/plan", json={"text": "uma viga leve", "mode": "single"}).json()
    assert body["degraded"] is True
    assert "cota gratuita do Google acabou por agora" in body["notice"]
