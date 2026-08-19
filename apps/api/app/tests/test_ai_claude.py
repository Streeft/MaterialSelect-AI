"""The real Claude providers: what they send, and what they refuse to trust.

No test here reaches the network. Two of them would be pointless if it did —
what is under test is that a *model's* answer is treated exactly like the
simulated one, and the only way to pin that down is to script the answer.

The sharpest test in the file is ``test_quoting_the_data_block_verbatim_is_safe``:
it hands the explanation prompt straight back as prose. If anything the model is
shown cannot be quoted, the guardrail discards the whole response — so a figure
the prompt prints but the pipeline never produced is a defect that would only
show up in front of a user.
"""

from __future__ import annotations

import json
import sys

import pytest
from fastapi.testclient import TestClient

from app.ai import claude_cli, factory
from app.ai.claude_api import ClaudeAPIProvider
from app.ai.claude_cli import ClaudeCLIProvider, _read_payload
from app.ai.model_base import ModelProviderBase, parse_json_object
from app.ai.prompts import EXPLAIN_SCHEMA, explain_user, format_decimal, interpret_schema
from app.ai.provider import (
    AIUnavailableError,
    ClassFacts,
    IndexFacts,
    ProblemContext,
    PropertyFacts,
    ResultContext,
)
from app.config import Settings
from app.services import ai_service

STATEMENT = (
    "Viga leve e rígida. A temperatura de serviço deve ser no mínimo 300 °C "
    "e a densidade no máximo 3 g/cm3."
)


def _context(statement: str = STATEMENT) -> ProblemContext:
    return ProblemContext(
        statement=statement,
        properties=[
            PropertyFacts(
                slug="densidade",
                name="Densidade",
                symbol="ρ",
                category="fisica",
                canonical_unit="kg/m**3",
                accepted_units=["kg/m**3", "g/cm**3"],
                better_direction="min",
            ),
            PropertyFacts(
                slug="modulo_young",
                name="Módulo de Young",
                symbol="E",
                category="mecanica",
                canonical_unit="Pa",
                accepted_units=["Pa", "GPa"],
                better_direction="max",
            ),
        ],
        indices=[
            IndexFacts(
                slug="viga-leve-rigidez",
                name="Viga leve limitada por rigidez",
                expression="sqrt(modulo_young) / densidade",
                goal="maximize",
                description="Índice E^(1/2)/ρ.",
                assumptions=None,
            )
        ],
        classes=[ClassFacts(slug="metais", name="Metais")],
    )


class _ScriptedClaude(ModelProviderBase):
    """A Claude provider whose answer is written in advance."""

    name = "claude-roteirizado"

    def __init__(self, answer: dict) -> None:
        self.answer = answer
        self.requests: list[dict] = []

    def _complete(self, system: str, user: str, schema: dict) -> dict:
        self.requests.append({"system": system, "user": user, "schema": schema})
        return self.answer


class TestFactory:
    def test_both_real_providers_are_registered(self) -> None:
        for name, expected in (
            ("claude-api", ClaudeAPIProvider),
            ("claude-cli", ClaudeCLIProvider),
        ):
            provider = factory.get_provider(Settings(ai_provider=name))
            assert isinstance(provider, expected)
            assert provider.simulated is False

    def test_a_real_provider_announces_that_it_may_vary(self) -> None:
        # Losing the "simulated" note is not the same as being told the reading
        # is not reproducible; the reader has to be told.
        disclaimer = factory.disclaimer_for(ClaudeCLIProvider())
        assert "pode variar" in disclaimer
        assert "cálculo não varia" in disclaimer

    def test_settings_reach_the_provider(self) -> None:
        provider = factory.get_provider(
            Settings(ai_provider="claude-cli", ai_model="claude-opus-5")
        )
        assert isinstance(provider, ClaudeCLIProvider)
        assert provider.settings.ai_model == "claude-opus-5"

    def test_an_unknown_name_still_fails_loudly(self) -> None:
        with pytest.raises(AIUnavailableError) as raised:
            factory.get_provider(Settings(ai_provider="claude-imaginario"))
        assert "claude-api" in str(raised.value)


class TestTheSchemaOffered:
    def test_only_catalogued_slugs_are_offered(self) -> None:
        schema = interpret_schema(_context())
        properties = schema["properties"]
        assert properties["indices"]["items"]["properties"]["slug"]["enum"] == ["viga-leve-rigidez"]
        assert properties["charts"]["items"]["properties"]["x"]["enum"] == [
            "densidade",
            "modulo_young",
        ]

    def test_an_empty_catalogue_does_not_produce_an_empty_enum(self) -> None:
        # An `enum: []` is not a valid schema; a free string plus the guardrail is.
        empty = ProblemContext(statement="x", properties=[], indices=[], classes=[])
        slug = interpret_schema(empty)["properties"]["indices"]["items"]["properties"]["slug"]
        assert slug == {"type": "string"}

    def test_the_schema_travels_as_json(self) -> None:
        assert json.loads(json.dumps(interpret_schema(_context())))["type"] == "object"


class TestReadingTheAnswer:
    def _interpret(self, answer: dict) -> dict:
        return _ScriptedClaude(answer).interpret(_context())

    def test_the_catalogue_writes_the_index_not_the_model(self) -> None:
        # The model picks a slug. Everything else about that index — including
        # the expression, which the safe parser has already validated — is read
        # from the catalogue, so this path cannot author one.
        read = self._interpret(
            {
                "indices": [
                    {
                        "slug": "viga-leve-rigidez",
                        "name": "Nome inventado",
                        "expression": "densidade ** 99",
                        "goal": "minimize",
                        "rationale": "x",
                    }
                ]
            }
        )
        assert read["indices"][0]["name"] == "Viga leve limitada por rigidez"
        assert read["indices"][0]["expression"] == "sqrt(modulo_young) / densidade"
        assert read["indices"][0]["goal"] == "maximize"

    def test_an_invented_index_survives_to_be_rejected_out_loud(self) -> None:
        # Filtering it here would be tidier and worse: the user would never see
        # that something was refused.
        read = self._interpret({"indices": [{"slug": "indice-inventado", "rationale": "x"}]})
        assert read["indices"][0]["slug"] == "indice-inventado"

    def test_an_empty_unit_becomes_absent_rather_than_a_unit(self) -> None:
        read = self._interpret(
            {
                "constraints": [
                    {
                        "constraint": {
                            "operator": "gte",
                            "property_slug": "modulo_young",
                            "value": 70.0,
                            "unit": "",
                        },
                        "evidence": "e",
                        "rationale": "r",
                    }
                ]
            }
        )
        assert read["constraints"][0]["constraint"]["unit"] is None

    def test_a_non_finite_number_becomes_absent(self) -> None:
        read = self._interpret(
            {
                "constraints": [
                    {
                        "constraint": {
                            "operator": "gte",
                            "property_slug": "densidade",
                            "value": float("inf"),
                            "unit": "g/cm**3",
                        }
                    }
                ]
            }
        )
        assert read["constraints"][0]["constraint"]["value"] is None

    def test_at_most_one_chart_is_taken_and_none_is_allowed(self) -> None:
        assert self._interpret({"charts": []})["chart"] is None
        chart = self._interpret(
            {"charts": [{"x": "densidade", "y": "modulo_young", "scale": "log", "rationale": "r"}]}
        )["chart"]
        assert chart == {
            "x": "densidade",
            "y": "modulo_young",
            "scale": "log",
            "rationale": "r",
        }

    def test_an_overlong_rationale_is_clipped_instead_of_losing_the_suggestion(self) -> None:
        read = self._interpret(
            {"properties": [{"slug": "densidade", "rationale": "a" * 900}]},
        )
        assert len(read["properties"][0]["rationale"]) == 300
        assert read["properties"][0]["name"] == "Densidade"

    def test_a_missing_field_is_simply_absent(self) -> None:
        read = self._interpret({})
        assert read["constraints"] == []
        assert read["chart"] is None
        assert read["function_text"] is None


class TestCaveatsAreNotTheModels:
    def _explain(self, answer: dict) -> dict:
        context = ResultContext(
            study_name="Estudo",
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
        return _ScriptedClaude(answer).explain(context)

    def test_the_mandatory_caveat_appears_even_when_the_model_writes_none(self) -> None:
        result = self._explain({"summary": "s", "paragraphs": ["p"]})
        assert any("validação experimental" in caveat for caveat in result["caveats"])

    def test_caveats_the_model_writes_are_ignored(self) -> None:
        # The reservations are the backend's, both to write and to keep.
        result = self._explain(
            {"summary": "s", "paragraphs": ["p"], "caveats": ["Este material é ótimo."]}
        )
        assert all("ótimo" not in caveat for caveat in result["caveats"])


class TestThroughTheService:
    """A scripted model held to the same rules as any other provider."""

    def _use(self, monkeypatch: pytest.MonkeyPatch, answer: dict) -> _ScriptedClaude:
        provider = _ScriptedClaude(answer)
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        return provider

    def test_a_correct_conversion_is_still_refused(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # 300 °C really is 573.15 K. The rule is not about arithmetic: only the
        # backend converts, because only the backend records the trail.
        self._use(
            monkeypatch,
            {
                "constraints": [
                    {
                        "constraint": {
                            "operator": "gte",
                            "property_slug": "temp_max_servico",
                            "value": 573.15,
                            "unit": "K",
                        },
                        "evidence": "no mínimo 300 °C",
                        "rationale": "convertido",
                    }
                ]
            },
        )
        body = client.post("/api/ai/interpret", json={"statement": STATEMENT}).json()
        assert body["constraints"] == []
        assert any("não aparece no enunciado" in reason for reason in body["rejected"])

    def test_a_grounded_reading_is_accepted_and_runs(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        self._use(
            monkeypatch,
            {
                "function_text": "Viga em flexão",
                "constraints": [
                    {
                        "constraint": {
                            "operator": "lte",
                            "property_slug": "densidade",
                            "value": 3.0,
                            "unit": "g/cm**3",
                        },
                        "evidence": "densidade no máximo 3 g/cm3",
                        "rationale": "limite lido",
                    }
                ],
            },
        )
        body = client.post("/api/ai/interpret", json={"statement": STATEMENT}).json()
        assert body["rejected"] == []
        assert body["simulated"] is False
        run = client.post(
            "/api/selection/run",
            json={
                "combinator": "AND",
                "constraints": [c["constraint"] for c in body["constraints"]],
            },
        )
        assert run.status_code == 200, run.text

    def test_the_model_never_sees_a_database_or_an_evaluator(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        provider = self._use(monkeypatch, {})
        client.post("/api/ai/interpret", json={"statement": STATEMENT})
        sent = provider.requests[0]["user"]
        assert STATEMENT in sent
        # The catalogue is metadata; not one property *value* is in the prompt.
        assert "densidade" in sent
        assert provider.requests[0]["schema"]["additionalProperties"] is False


class TestExplanationThroughTheService:
    def _study_id(self, client: TestClient) -> int:
        created = client.post(
            "/api/selection/studies",
            json={
                "name": "Estudo explicado por um modelo",
                "function_text": "Viga em flexão",
                "objective_text": "Minimizar massa",
                "combinator": "AND",
                "constraints": [
                    {"operator": "gt", "property_slug": "modulo_young", "value": 1.0, "unit": "GPa"}
                ],
                "index": {
                    "name": "Viga leve",
                    "expression": "sqrt(modulo_young) / densidade",
                    "goal": "maximize",
                },
                "normalization": "minmax",
                "criteria": [{"key": "__index__", "weight": 1.0}],
            },
        )
        assert created.status_code == 201, created.text
        return created.json()["id"]

    def test_quoting_the_data_block_verbatim_is_safe(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Everything the prompt shows must be quotable without being discarded.

        A figure printed in the prompt but absent from what the pipeline
        computed would make the number guardrail fire on prose that did exactly
        as it was told — a trap the user would meet and no test would.
        """

        class _Parrot(ModelProviderBase):
            name = "claude-papagaio"

            def _complete(self, system: str, user: str, schema: dict) -> dict:
                if schema is EXPLAIN_SCHEMA:
                    return {"summary": user.splitlines()[0], "paragraphs": user.splitlines()}
                return {}

        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: _Parrot())
        response = client.post("/api/ai/explain", json={"study_id": self._study_id(client)})
        assert response.status_code == 200, response.text
        assert response.json()["paragraphs"]

    def test_an_invented_figure_still_discards_the_whole_answer(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        provider = _ScriptedClaude(
            {"summary": "O módulo do vencedor é 210,5 GPa.", "paragraphs": []}
        )
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        response = client.post("/api/ai/explain", json={"study_id": self._study_id(client)})
        assert response.status_code == 400
        assert "não produziu" in response.json()["detail"]

    def test_a_material_name_carrying_digits_is_not_an_invention(self) -> None:
        # "Aço AISI 1020" is catalogue output; quoting it is not inventing 1020.
        context = ResultContext(
            study_name="e",
            function_text=None,
            objective_text=None,
            constraint_labels=[],
            index_name=None,
            index_expression=None,
            index_dimension=None,
            initial_count=2,
            final_count=1,
            funnel=[],
            ranked=[("Aço AISI 1020", 1, 0.5)],
            excluded_for_missing=[],
            sensitivity_changed=False,
            numbers={1.0, 2.0, 0.5},
        )
        from app.ai.guardrails import numbers_in, ungrounded_numbers

        allowed = context.numbers | numbers_in("Aço AISI 1020")
        assert ungrounded_numbers("Aço AISI 1020 lidera.", allowed) == []
        assert ungrounded_numbers("Aço AISI 1020 lidera.", context.numbers) == [1020.0]


class TestExplainPrompt:
    def test_scores_are_written_the_way_the_interface_writes_them(self) -> None:
        assert format_decimal(0.5) == "0,500"
        assert format_decimal(0.8425) == "0,843"

    @pytest.mark.parametrize("score", [0.0, 1.0, 0.8425, 0.0005, 0.9995, 1 / 3, 2 / 3, 0.1235])
    def test_a_printed_score_reads_back_as_the_rounding_the_guardrail_allows(
        self, score: float
    ) -> None:
        # ``AIService`` admits ``round(score, 3)`` as a legitimate quotation of a
        # score. If printing and rounding ever disagreed, the prompt would be
        # showing a figure that the prose is then punished for repeating.
        assert float(format_decimal(score).replace(",", ".")) == round(score, 3)

    def test_the_block_names_what_was_left_out_for_missing_data(self) -> None:
        context = ResultContext(
            study_name="Estudo",
            function_text=None,
            objective_text=None,
            constraint_labels=[],
            index_name=None,
            index_expression=None,
            index_dimension=None,
            initial_count=3,
            final_count=2,
            funnel=[("Densidade ≤ 3 g/cm**3", 2)],
            ranked=[("Liga A", 1, 1.0)],
            excluded_for_missing=[("Cerâmica D", ["Módulo de Young"])],
            sensitivity_changed=True,
        )
        block = explain_user(context)
        assert "Cerâmica D" in block
        assert "não são candidatos ruins" in block
        assert "o primeiro colocado muda" in block


class TestCLITransport:
    def test_the_statement_never_reaches_the_command_line(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # The CLI is not installed on the CI runner, and this test is about the
        # argv the provider builds, not about finding a binary.
        monkeypatch.setattr(claude_cli.shutil, "which", lambda _name: "/usr/bin/claude")
        provider = ClaudeCLIProvider(Settings())
        command = provider._command("sistema", {"type": "object"})
        assert STATEMENT not in " ".join(command)
        assert "--print" in command
        assert "--safe-mode" in command  # no CLAUDE.md, hook, plugin or MCP server
        assert command[command.index("--tools") + 1] == ""  # every tool disabled

    def test_a_missing_executable_says_so(self) -> None:
        provider = ClaudeCLIProvider(Settings(ai_cli_command="claude-que-nao-existe"))
        with pytest.raises(AIUnavailableError) as raised:
            provider._command("s", {})
        assert "PATH" in str(raised.value)

    def test_a_successful_envelope_yields_the_structured_object(self) -> None:
        payload = json.dumps(
            {"is_error": False, "subtype": "success", "structured_output": {"summary": "ok"}}
        )
        assert _read_payload(payload) == {"summary": "ok"}

    def test_an_envelope_without_structured_output_falls_back_to_the_text(self) -> None:
        payload = json.dumps(
            {"is_error": False, "subtype": "success", "result": '{"summary": "ok"}'}
        )
        assert _read_payload(payload) == {"summary": "ok"}

    def test_a_failed_run_is_unavailable_not_empty(self) -> None:
        payload = json.dumps({"is_error": True, "subtype": "error_during_execution"})
        with pytest.raises(AIUnavailableError):
            _read_payload(payload)

    def test_output_that_is_not_json_is_unavailable(self) -> None:
        with pytest.raises(AIUnavailableError):
            parse_json_object("não sou json")


class _Block:
    def __init__(self, type_: str, text: str = "") -> None:
        self.type = type_
        self.text = text


class _Response:
    def __init__(self, content: list[_Block], stop_reason: str = "end_turn") -> None:
        self.content = content
        self.stop_reason = stop_reason


class _Messages:
    def __init__(self, response: _Response) -> None:
        self.response = response
        self.calls: list[dict] = []

    def create(self, **kwargs: object) -> _Response:
        self.calls.append(kwargs)
        return self.response


class _Client:
    def __init__(self, response: _Response) -> None:
        self.messages = _Messages(response)


class TestAPITransport:
    def _provider(self, response: _Response, **overrides: object) -> ClaudeAPIProvider:
        settings = Settings(ai_model="claude-opus-5", **overrides)
        return ClaudeAPIProvider(settings, client=_Client(response))

    def test_the_request_carries_the_model_and_the_schema(self) -> None:
        provider = self._provider(_Response([_Block("text", '{"summary": "ok"}')]))
        assert provider._complete("s", "u", {"type": "object"}) == {"summary": "ok"}
        sent = provider._client.messages.calls[0]
        assert sent["model"] == "claude-opus-5"
        assert sent["system"] == "s"
        assert sent["output_config"]["format"]["type"] == "json_schema"
        # No temperature, no prefill: both are rejected by the current models.
        assert "temperature" not in sent

    def test_thinking_blocks_are_not_part_of_the_answer(self) -> None:
        provider = self._provider(
            _Response([_Block("thinking"), _Block("text", '{"summary": "ok"}')])
        )
        assert provider._complete("s", "u", {}) == {"summary": "ok"}

    def test_a_refusal_is_reported_rather_than_read(self) -> None:
        provider = self._provider(_Response([], stop_reason="refusal"))
        with pytest.raises(AIUnavailableError) as raised:
            provider._complete("s", "u", {})
        assert "recusou" in str(raised.value)

    def test_a_truncated_answer_says_which_knob_to_turn(self) -> None:
        provider = self._provider(_Response([_Block("text", '{"a": ')], stop_reason="max_tokens"))
        with pytest.raises(AIUnavailableError) as raised:
            provider._complete("s", "u", {})
        assert "AI_MAX_OUTPUT_TOKENS" in str(raised.value)


class TestAPITransportWithoutTheSDK:
    """``anthropic`` is an optional extra, so absence is a supported state.

    These tests run on a machine where the package *is* installed, which is
    precisely why they are here: without them the class above passes locally
    and fails on CI, which installs only the dev extra. ``None`` in
    ``sys.modules`` is what CPython treats as a missing module.
    """

    def _absent(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setitem(sys.modules, "anthropic", None)

    def test_an_injected_client_needs_no_sdk_at_all(self, monkeypatch: pytest.MonkeyPatch) -> None:
        self._absent(monkeypatch)
        provider = ClaudeAPIProvider(
            Settings(ai_model="claude-opus-5"),
            client=_Client(_Response([_Block("text", '{"summary": "ok"}')])),
        )
        assert provider._complete("s", "u", {}) == {"summary": "ok"}

    def test_without_a_client_the_error_names_the_extra_to_install(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        self._absent(monkeypatch)
        provider = ClaudeAPIProvider(Settings())
        with pytest.raises(AIUnavailableError) as raised:
            provider._complete("s", "u", {})
        assert '".[ai]"' in str(raised.value)

    def test_a_failure_from_the_client_is_not_dressed_up_as_an_api_error(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """With no SDK there are no SDK exceptions, so nothing is translated."""
        self._absent(monkeypatch)

        class _Broken:
            def create(self, **_kwargs: object) -> object:
                raise ValueError("chamada malformada")

        class _BrokenClient:
            messages = _Broken()

        provider = ClaudeAPIProvider(Settings(), client=_BrokenClient())
        with pytest.raises(ValueError, match="malformada"):
            provider._complete("s", "u", {})
