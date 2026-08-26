"""End-to-end tests for the optional AI layer.

Two things are under test: that the simulated provider is useful and repeatable,
and — more important — that a *misbehaving* provider cannot get anything past
the service. The second kind is exercised by substituting a provider that lies.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.ai.provider import AIProvider
from app.services import ai_service

STATEMENT = (
    "Preciso de uma viga leve e rígida para uma estrutura aeroespacial. "
    "A temperatura de serviço deve ser no mínimo 300 °C e a densidade no máximo "
    "3 g/cm3."
)


def _interpret(client: TestClient, statement: str = STATEMENT):
    response = client.post("/api/ai/interpret", json={"statement": statement})
    assert response.status_code == 200, response.text
    return response.json()


class TestStatus:
    def test_reports_the_simulated_provider(self, client: TestClient) -> None:
        body = client.get("/api/ai/status").json()
        assert body["enabled"] is True
        assert body["provider"] == "mock"
        assert body["simulated"] is True
        assert "determinístic" in body["disclaimer"]

    def test_status_answers_even_when_the_layer_is_disabled(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(ai_service.default_settings, "ai_provider", "")
        body = client.get("/api/ai/status").json()
        assert body["enabled"] is False
        assert "desativada" in body["disclaimer"]

    def test_interpret_is_a_400_when_the_layer_is_disabled(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(ai_service.default_settings, "ai_provider", "")
        response = client.post("/api/ai/interpret", json={"statement": STATEMENT})
        assert response.status_code == 400
        assert "desativada" in response.json()["detail"]

    def test_unknown_provider_fails_loudly(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # A silent fallback to the simulated provider would let a deployment
        # believe it was talking to a model.
        monkeypatch.setattr(ai_service.default_settings, "ai_provider", "gpt-imaginario")
        assert client.get("/api/ai/status").json()["enabled"] is False


class TestInterpretation:
    def test_reads_function_and_objective(self, client: TestClient) -> None:
        body = _interpret(client)
        assert body["function_text"] == "Viga em flexão"
        assert body["objective_text"] == "Minimizar massa"

    def test_is_deterministic(self, client: TestClient) -> None:
        assert _interpret(client) == _interpret(client)

    def test_echoes_the_statement_for_auditability(self, client: TestClient) -> None:
        assert _interpret(client)["statement"] == STATEMENT

    def test_suggests_catalogued_indices_only(self, client: TestClient) -> None:
        body = _interpret(client)
        catalogue = {i["slug"] for i in client.get("/api/performance-indices").json()}
        assert body["indices"]
        assert all(i["slug"] in catalogue for i in body["indices"])

    def test_leading_index_is_the_light_stiff_beam(self, client: TestClient) -> None:
        assert _interpret(client)["indices"][0]["slug"] == "viga-leve-rigidez"

    def test_each_rationale_claims_only_what_that_index_matched(self, client: TestClient) -> None:
        # The statement describes a beam; the plate index may share the
        # "minimise mass" objective, but it must not claim the function too.
        by_slug = {i["slug"]: i["rationale"] for i in _interpret(client)["indices"]}
        assert "função" in by_slug["viga-leve-rigidez"]
        plate = by_slug.get("placa-leve-rigidez")
        if plate is not None:
            assert "função" not in plate
            assert "objetivo" in plate

    def test_suggests_the_map_where_that_index_is_a_straight_line(self, client: TestClient) -> None:
        chart = _interpret(client)["chart"]
        assert chart["x"] == "densidade"  # the denominator goes on x
        assert chart["y"] == "modulo_young"
        assert chart["scale"] == "log"

    def test_extracts_grounded_constraints(self, client: TestClient) -> None:
        constraints = _interpret(client)["constraints"]
        by_slug = {c["constraint"]["property_slug"]: c for c in constraints}

        temperature = by_slug["temp_max_servico"]["constraint"]
        assert temperature["operator"] == "gte"
        assert temperature["value"] == 300.0  # exactly as written, not converted
        assert temperature["unit"] == "degC"

        density = by_slug["densidade"]["constraint"]
        assert density["operator"] == "lte"
        assert density["value"] == 3.0
        assert density["unit"] == "g/cm**3"

    def test_every_constraint_quotes_its_evidence(self, client: TestClient) -> None:
        for suggestion in _interpret(client)["constraints"]:
            assert suggestion["evidence"]
            assert suggestion["evidence"] in STATEMENT

    def test_the_suggested_constraints_actually_run(self, client: TestClient) -> None:
        # The proposal is only useful if the deterministic pipeline accepts it.
        constraints = [c["constraint"] for c in _interpret(client)["constraints"]]
        response = client.post(
            "/api/selection/run",
            json={"combinator": "AND", "constraints": constraints},
        )
        assert response.status_code == 200, response.text
        assert response.json()["final_count"] >= 0

    def test_unreadable_unit_becomes_a_question_not_a_constraint(self, client: TestClient) -> None:
        # "300" with no unit must not silently become 300 K. The clause is
        # reported instead of proposed.
        body = _interpret(client, "Viga leve. A temperatura de serviço deve ser no mínimo 300.")
        slugs = {c["constraint"]["property_slug"] for c in body["constraints"]}
        assert "temp_max_servico" not in slugs
        assert any("não foi possível identificar a unidade" in q for q in body["open_questions"])

    def test_temperature_written_in_words_is_understood(self, client: TestClient) -> None:
        body = _interpret(
            client, "Viga leve. A temperatura de serviço deve ser no mínimo 300 graus C."
        )
        temperature = next(
            c["constraint"]
            for c in body["constraints"]
            if c["constraint"]["property_slug"] == "temp_max_servico"
        )
        assert temperature["value"] == 300.0
        assert temperature["unit"] == "degC"

    def test_reports_what_it_could_not_read(self, client: TestClient) -> None:
        body = _interpret(client, "Preciso de um material bom.")
        assert body["open_questions"]
        assert body["constraints"] == []

    def test_carries_the_disclaimer(self, client: TestClient) -> None:
        body = _interpret(client)
        assert body["simulated"] is True
        assert "revisão" in body["disclaimer"]

    def test_empty_statement_is_rejected_by_the_schema(self, client: TestClient) -> None:
        assert client.post("/api/ai/interpret", json={"statement": ""}).status_code == 422

    def test_oversized_statement_is_rejected(self, client: TestClient) -> None:
        response = client.post("/api/ai/interpret", json={"statement": "a" * 5000})
        assert response.status_code == 422


class _LyingProvider(AIProvider):
    """A provider that invents entities and numbers, to prove the filter works."""

    name = "mentiroso"
    simulated = True

    def interpret(self, context) -> dict:
        return {
            "function_text": "Viga",
            "objective_text": "Minimizar massa",
            "free_variables": [],
            "constraints": [
                {
                    # Number never written by the user.
                    "constraint": {
                        "operator": "gte",
                        "property_slug": "modulo_young",
                        "value": 999.0,
                        "unit": "GPa",
                    },
                    "evidence": "inventado",
                    "rationale": "inventado",
                },
                {
                    # Property that does not exist.
                    "constraint": {
                        "operator": "gt",
                        "property_slug": "tenacidade_fratura",
                        "value": 300.0,
                        "unit": "Pa",
                    },
                    "evidence": "inventado",
                    "rationale": "inventado",
                },
            ],
            "properties": [{"slug": "resistencia_magica", "name": "Mágica", "rationale": "x"}],
            "indices": [
                {
                    "slug": "indice-inventado",
                    "name": "Inventado",
                    "expression": "modulo_young / densidade",
                    "goal": "maximize",
                    "rationale": "x",
                }
            ],
            "chart": {"x": "densidade", "y": "inexistente", "scale": "log", "rationale": "x"},
            "open_questions": [],
        }

    def explain(self, context) -> dict:
        return {
            "summary": "O módulo do vencedor é 210,5 GPa.",
            "paragraphs": ["Um valor que ninguém calculou."],
            "caveats": [],
        }


@pytest.fixture()
def lying_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai_service, "get_provider", lambda *_args, **_kwargs: _LyingProvider())


class TestGuardrailsAtTheBoundary:
    def test_everything_invented_is_dropped_and_reported(
        self, client: TestClient, lying_provider: None
    ) -> None:
        body = _interpret(client)
        assert body["constraints"] == []
        assert body["properties"] == []
        assert body["indices"] == []
        assert body["chart"] is None
        # Four rejections, each explained rather than silently swallowed.
        assert len(body["rejected"]) == 5
        joined = " ".join(body["rejected"])
        assert "não aparece no enunciado" in joined
        assert "não existe no catálogo" in joined

    def test_the_readable_parts_survive(self, client: TestClient, lying_provider: None) -> None:
        body = _interpret(client)
        assert body["function_text"] == "Viga"
        assert body["objective_text"] == "Minimizar massa"


class TestExplanation:
    def _study_id(self, client: TestClient) -> int:
        created = client.post(
            "/api/selection/studies",
            json={
                "name": "Estudo para explicação",
                "function_text": "Viga em flexão",
                "objective_text": "Minimizar massa",
                "free_variables": ["espessura"],
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

    def test_describes_a_computed_study(self, client: TestClient) -> None:
        study_id = self._study_id(client)
        response = client.post("/api/ai/explain", json={"study_id": study_id})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["study_id"] == study_id
        assert body["summary"]
        assert body["paragraphs"]

    def test_always_states_the_tool_does_not_replace_validation(self, client: TestClient) -> None:
        body = client.post("/api/ai/explain", json={"study_id": self._study_id(client)}).json()
        assert any("validação experimental" in caveat for caveat in body["caveats"])

    def test_is_deterministic(self, client: TestClient) -> None:
        study_id = self._study_id(client)
        first = client.post("/api/ai/explain", json={"study_id": study_id}).json()
        second = client.post("/api/ai/explain", json={"study_id": study_id}).json()
        assert first == second

    def test_unknown_study_is_404(self, client: TestClient) -> None:
        assert client.post("/api/ai/explain", json={"study_id": 999999}).status_code == 404

    def test_prose_inventing_a_figure_is_discarded(
        self, client: TestClient, lying_provider: None
    ) -> None:
        study_id = self._study_id(client)
        response = client.post("/api/ai/explain", json={"study_id": study_id})
        assert response.status_code == 400
        assert "não produziu" in response.json()["detail"]


class _RecordingProvider(AIProvider):
    """Não simulado: prova que o AIService chama a busca antes de invocá-lo."""

    name = "gravador"
    simulated = False

    def __init__(self) -> None:
        self.received_context: object | None = None

    def interpret(self, context) -> dict:
        self.received_context = context
        return {
            "function_text": None,
            "objective_text": None,
            "free_variables": [],
            "constraints": [],
            "properties": [],
            "indices": [],
            "chart": None,
            "open_questions": [],
        }

    def explain(self, context) -> dict:
        self.received_context = context
        return {"summary": "ok", "paragraphs": [], "caveats": []}


class TestRetrievalGating:
    def test_mock_never_triggers_retrieval(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        called = []
        monkeypatch.setattr(
            "app.services.ai_service.knowledge_search",
            lambda *a, **k: called.append(1) or [],
        )
        _interpret(client)
        assert called == []

    def test_real_provider_triggers_retrieval(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        provider = _RecordingProvider()
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        called = []
        monkeypatch.setattr(
            "app.services.ai_service.knowledge_search",
            lambda *a, **k: called.append(1) or [],
        )
        _interpret(client)
        assert called == [1]
        assert provider.received_context.retrieved == ()

    def test_context_defaults_have_empty_retrieved(self) -> None:
        from app.ai.provider import ProblemContext

        context = ProblemContext(statement="x", properties=[], indices=[], classes=[])
        assert context.retrieved == ()
