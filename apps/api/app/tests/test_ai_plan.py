"""The project assistant (D-224): ``POST /api/ai/plan`` and ``/api/ai/plan/run``.

What is under test, in the order the decision states it:

* **a plan is never empty** — a request without one number still comes back
  with components that can rank, and a model that fails (bad JSON, timeout,
  quota) is replaced by the local rules instead of an HTTP error;
* **every number says where it came from** — ``usuario`` is grounded in the
  text exactly as ``/ai/interpret`` is, ``cenario:<id>`` is expanded from the
  curated table and not from the model, ``sugestao_ia`` must have a unit that
  converts and a value inside the catalogue's own range, and is never run
  until the person confirms it;
* **the materials come from the deterministic selection**, and are real rows
  of the catalogue;
* **the same request does not pay the quota twice**;
* **the prompt's catalogue is read lightly** — never through ``list_materials``
  — and **the Cérebro's embedding has a time budget**.
"""

from __future__ import annotations

import copy
import io
import json
import logging
import time
import urllib.error
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.ai.guardrails import Catalogue, check_level, check_scenario, check_suggested_range
from app.ai.model_base import ModelProviderBase
from app.ai.openai_compat import OpenAICompatProvider
from app.ai.provider import AIProvider, AIUnavailableError, PlanContext
from app.config import Settings
from app.db.seed import DEMO_SOURCE_LABEL
from app.db.seed_demo_extended_props import seed_demo_extended_properties
from app.models.material import Material
from app.models.source import Source
from app.models.user import User
from app.repositories.chart_repository import ChartRepository
from app.repositories.notebook_repository import NotebookRepository
from app.services import ai_service
from app.services.ai_service import AIService

SKI = "Quero fazer uma roupa de esqui"
BUILDING = "Quero construir um prédio que caiba 50 pessoas"
BEAM = "Uma viga rígida com temperatura de serviço no mínimo 300 °C."


# --- helpers -------------------------------------------------------------------


@pytest.fixture()
def extended(db_session: Session) -> None:
    """The demo materials with the extended catalogue and the ordinal scales
    (D-188) — what production's demo holds, here for the seeded five."""
    demo = db_session.execute(select(Source).where(Source.label == DEMO_SOURCE_LABEL)).scalar_one()
    seed_demo_extended_properties(db_session, demo)
    db_session.commit()


def _plan(client: TestClient, text: str = SKI, mode: str = "project") -> dict:
    response = client.post("/api/ai/plan", json={"text": text, "mode": mode})
    assert response.status_code == 200, response.text
    return response.json()


def _limit(origin: str, slug: str, operator: str, **fields) -> dict:
    return {
        "origin": origin,
        "property_slug": slug,
        "operator": operator,
        "value": fields.get("value"),
        "value_min": fields.get("value_min"),
        "value_max": fields.get("value_max"),
        "unit": fields.get("unit"),
        "level": fields.get("level"),
        "evidence": fields.get("evidence", ""),
        "note": fields.get("note", ""),
    }


def _raw(*limits: dict, scenario_ids=(), index_slug="viga-leve-rigidez", criteria=(), **top):
    return {
        "summary": top.get("summary", "Uma proposta."),
        "assumptions": list(top.get("assumptions", [])),
        "open_questions": list(top.get("open_questions", [])),
        "components": [
            {
                "name": "Peça",
                "role": "Sustenta a carga.",
                "function_text": "Viga em flexão",
                "objective_text": "Minimizar massa",
                "index_slug": index_slug,
                "criteria": [dict(c) for c in criteria],
                "scenario_ids": list(scenario_ids),
                "constraints": list(limits),
            }
        ],
    }


class _PlanProvider(AIProvider):
    """Answers ``plan`` with a fixed raw plan; simulated, so it spends no quota."""

    name = "plano-de-teste"
    simulated = True

    def __init__(self, raw: dict | None = None, error: Exception | None = None) -> None:
        self.raw = raw or {}
        self.error = error
        self.calls = 0
        self.context: PlanContext | None = None

    def interpret(self, context):  # pragma: no cover - not used here
        return {}

    def explain(self, context):  # pragma: no cover - not used here
        return {}

    def plan(self, context: PlanContext) -> dict:
        self.calls += 1
        self.context = context
        if self.error is not None:
            raise self.error
        return copy.deepcopy(self.raw)


@pytest.fixture()
def use_provider(monkeypatch: pytest.MonkeyPatch):
    def _use(provider: AIProvider) -> AIProvider:
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        return provider

    return _use


def _component(body: dict) -> dict:
    assert len(body["components"]) >= 1
    return body["components"][0]


def _by_origin(component: dict, origin: str) -> list[dict]:
    return [c for c in component["constraints"] if c["origin"] == origin]


# --- the simulated provider: never empty, deterministic -------------------------


class TestRuleBasedPlan:
    def test_a_ski_suit_is_three_layers(self, client: TestClient, extended) -> None:
        body = _plan(client, SKI)
        names = [c["name"] for c in body["components"]]
        assert names == ["Camada externa", "Camada isolante", "Forro"]
        assert body["degraded"] is False and body["simulated"] is True
        assert {"frio-extremo", "contato-pele"} <= {s["id"] for s in body["scenarios_used"]}

    def test_a_building_is_structure_envelope_and_insulation(
        self, client: TestClient, extended
    ) -> None:
        body = _plan(client, BUILDING)
        names = [c["name"] for c in body["components"]]
        assert names[0].startswith("Estrutura")
        assert any("Vedação" in n for n in names) and any("Isolamento" in n for n in names)
        # "50 pessoas" sizes the building; it is never a material limit.
        assert all(not _by_origin(c, "usuario") for c in body["components"])

    def test_text_without_a_number_still_gives_a_plan_that_ranks(
        self, client: TestClient, extended
    ) -> None:
        body = _plan(client, SKI)
        for component in body["components"]:
            assert component["index"] or component["criteria"], component["name"]
            assert component["constraints"], component["name"]
            assert not _by_origin(component, "usuario")
            # Qualitative limits from the table: a level, no number.
            assert all(c["origin"] != "sugestao_ia" for c in component["constraints"])
        levels = [
            c for comp in body["components"] for c in comp["constraints"] if c["level"] is not None
        ]
        assert levels and all(c["value"] is None for c in levels)

    def test_a_request_the_rules_do_not_know_still_gets_one_component(
        self, client: TestClient
    ) -> None:
        body = _plan(client, "algo legal para a minha mesa")
        component = _component(body)
        assert component["index"] is not None or component["criteria"]
        assert body["summary"]

    def test_single_mode_is_exactly_one_component(self, client: TestClient, extended) -> None:
        body = _plan(client, SKI, mode="single")
        assert len(body["components"]) == 1
        ids = set(body["components"][0]["scenarios"])
        assert {"frio-extremo", "contato-pele"} <= ids

    def test_is_deterministic(self, client: TestClient, extended) -> None:
        first = _plan(client, BUILDING)
        ai_service.reset_ai_caches()
        second = _plan(client, BUILDING)
        first.pop("cached"), second.pop("cached")
        assert first == second

    def test_scenario_limits_carry_their_source_and_table_numbers(
        self, client: TestClient, extended
    ) -> None:
        body = _plan(client, SKI)
        cold = next(
            c
            for comp in body["components"]
            for c in comp["constraints"]
            if c["origin"] == "cenario:frio-extremo"
        )
        assert cold["property"] == "temp_min_servico"
        assert (cold["operator"], cold["value"], cold["unit"]) == ("lte", -30.0, "degC")
        assert cold["source"].startswith("Referência didática do projeto")
        assert cold["applied"] is True and cold["needs_confirmation"] is False
        assert cold["constraint"]["operator"] == "lte"
        assert "−30" in cold["label"]


# --- execution: real materials from the deterministic selection -----------------


class TestExecution:
    def test_the_materials_are_real_catalogue_rows(
        self, client: TestClient, db_session: Session
    ) -> None:
        component = _component(_plan(client, BEAM, mode="single"))
        result = component["result"]
        assert result["error"] is None
        assert 1 <= len(result["materials"]) <= 5
        for material in result["materials"]:
            row = db_session.get(Material, material["record_id"])
            assert row is not None and row.name == material["name"]
            assert material["reason"].startswith("Passou")
        # The user's own limit ran, grounded in the text.
        user = _by_origin(component, "usuario")
        assert user and user[0]["applied"] is True
        assert user[0]["value"] == 300 and user[0]["unit"] == "degC"

    def test_the_ranking_matches_the_selection_endpoint(self, client: TestClient) -> None:
        component = _component(_plan(client, BEAM, mode="single"))
        study = component["study"]
        run = client.post(
            "/api/selection/run",
            json={
                "stages": study["stages"],
                "index": study["index"],
                "ranking": {"criteria": study["criteria"], "run_sensitivity": False},
            },
        )
        assert run.status_code == 200, run.text
        expected = [c["name"] for c in run.json()["candidates"]][:5]
        assert [m["name"] for m in component["result"]["materials"]] == expected

    def test_the_ready_study_saves_in_the_selection(self, client: TestClient, extended) -> None:
        for component in _plan(client, SKI)["components"]:
            created = client.post("/api/selection/studies", json=component["study"])
            assert created.status_code == 201, created.text

    def test_an_empty_funnel_says_where_it_zeroed(self, client: TestClient, use_provider) -> None:
        use_provider(
            _PlanProvider(
                _raw(
                    _limit("usuario", "densidade", "lte", value=1, unit="kg/m**3", evidence="1"),
                )
            )
        )
        body = _plan(client, "densidade no máximo 1 kg/m3")
        result = _component(body)["result"]
        assert result["final_count"] == 0 and result["materials"] == []
        assert "zerou" in result["message"]


# --- origins and guardrails -------------------------------------------------------


class TestOrigins:
    def test_a_user_number_in_the_text_is_applied(self, client: TestClient, use_provider) -> None:
        use_provider(
            _PlanProvider(
                _raw(
                    _limit(
                        "usuario", "densidade", "lte", value=3, unit="g/cm**3", evidence="3 g/cm3"
                    )
                )
            )
        )
        component = _component(_plan(client, "densidade no máximo 3 g/cm3"))
        user = _by_origin(component, "usuario")
        assert len(user) == 1 and user[0]["applied"] is True
        assert "3 g/cm3" in user[0]["source"]

    def test_a_user_number_not_in_the_text_is_refused(
        self, client: TestClient, use_provider
    ) -> None:
        use_provider(
            _PlanProvider(_raw(_limit("usuario", "densidade", "lte", value=3, unit="g/cm**3")))
        )
        component = _component(_plan(client, "uma viga leve"))
        assert not _by_origin(component, "usuario")
        assert any("não aparece no enunciado" in r for r in component["rejected"])

    def test_a_suggestion_in_range_is_shown_but_not_run(
        self, client: TestClient, use_provider
    ) -> None:
        use_provider(
            _PlanProvider(
                _raw(
                    _limit(
                        "sugestao_ia",
                        "temp_max_servico",
                        "gte",
                        value=400,
                        unit="degC",
                        note="Um forno passa de 400 °C.",
                    )
                )
            )
        )
        component = _component(_plan(client, "uma peça de forno"))
        suggestion = _by_origin(component, "sugestao_ia")
        assert len(suggestion) == 1
        assert suggestion[0]["applied"] is False and suggestion[0]["needs_confirmation"] is True
        assert suggestion[0]["source"] == "Sugestão da IA, revise"
        # Out of the automatic run and out of the ready study.
        stage_slugs = [
            c["property_slug"]
            for stage in component["study"]["stages"] or []
            for c in stage["root_group"]["constraints"]
        ]
        assert "temp_max_servico" not in stage_slugs
        assert all("temp_max_servico" not in s["label"] for s in component["result"]["funnel"])

    def test_a_suggestion_outside_the_catalogue_range_is_refused(
        self, client: TestClient, use_provider
    ) -> None:
        use_provider(
            _PlanProvider(
                _raw(_limit("sugestao_ia", "densidade", "lte", value=500, unit="g/cm**3"))
            )
        )
        component = _component(_plan(client, "algo bem leve"))
        assert not _by_origin(component, "sugestao_ia")
        assert any("fora da faixa que o catálogo tem" in r for r in component["rejected"])

    def test_a_suggestion_with_an_incompatible_unit_is_refused(
        self, client: TestClient, use_provider
    ) -> None:
        use_provider(
            _PlanProvider(_raw(_limit("sugestao_ia", "densidade", "lte", value=3, unit="GPa")))
        )
        component = _component(_plan(client, "algo bem leve"))
        assert not _by_origin(component, "sugestao_ia")
        assert any("incompatível" in r for r in component["rejected"])

    def test_a_scenario_is_expanded_from_the_table_not_from_the_model(
        self, client: TestClient, use_provider
    ) -> None:
        provider = use_provider(_PlanProvider(_raw(scenario_ids=["estrutural", "nao-existe"])))
        component = _component(_plan(client, "uma prateleira"))
        scenario = _by_origin(component, "cenario:estrutural")
        assert [(c["property"], c["operator"], c["value"], c["unit"]) for c in scenario] == [
            ("modulo_young", "gte", 10.0, "GPa")
        ]
        assert any("não existe na tabela curada" in r for r in component["rejected"])
        # The model was told the scenarios without a single number.
        assert provider.context is not None
        assert all(not any(ch.isdigit() for ch in s.summary) for s in provider.context.scenarios)

    def test_a_model_cannot_claim_the_scenario_origin(
        self, client: TestClient, use_provider
    ) -> None:
        use_provider(
            _PlanProvider(
                _raw(_limit("cenario:estrutural", "modulo_young", "gte", value=99, unit="GPa"))
            )
        )
        component = _component(_plan(client, "uma prateleira"))
        assert all(c["value"] != 99 for c in component["constraints"])
        assert any("origem não reconhecida" in r for r in component["rejected"])

    def test_the_users_number_wins_over_a_scenario_on_the_same_side(
        self, client: TestClient, use_provider
    ) -> None:
        use_provider(
            _PlanProvider(
                _raw(
                    _limit(
                        "usuario", "modulo_young", "gte", value=50, unit="GPa", evidence="50 GPa"
                    ),
                    scenario_ids=["estrutural"],
                )
            )
        )
        component = _component(_plan(client, "módulo de Young no mínimo 50 GPa"))
        limits = [c for c in component["constraints"] if c["property"] == "modulo_young"]
        assert [c["origin"] for c in limits] == ["usuario"]
        assert any("vale primeiro" in r for r in component["rejected"])

    def test_prose_with_an_invented_number_is_dropped(
        self, client: TestClient, use_provider
    ) -> None:
        use_provider(
            _PlanProvider(
                _raw(
                    summary="A estrutura aguenta 437,5 MPa.",
                    assumptions=["Uso em 2735 metros de altitude.", "Uso interno."],
                )
            )
        )
        body = _plan(client, "uma prateleira")
        assert "437" not in body["summary"]
        assert body["assumptions"][0] == "Uso interno."
        assert len([r for r in body["rejected"] if "números" in r]) == 2

    def test_an_unknown_index_is_refused_and_the_component_still_ranks(
        self, client: TestClient, use_provider
    ) -> None:
        use_provider(_PlanProvider(_raw(index_slug="indice-inventado")))
        component = _component(_plan(client, "uma prateleira"))
        assert any("Índice sugerido não existe" in r for r in component["rejected"])
        assert component["index"] is not None or component["criteria"]
        assert component["result"]["materials"]


class TestGuardrailsPure:
    CATALOGUE = Catalogue(
        properties={"densidade": "kg/m**3", "temp_max_servico": "kelvin"},
        class_slugs=set(),
        index_slugs=set(),
    )
    OBSERVED = {"densidade": (1000.0, 8000.0), "temp_max_servico": (300.0, 2000.0)}

    def test_inside_the_range_passes(self) -> None:
        assert (
            check_suggested_range("densidade", [2.5], "g/cm**3", self.CATALOGUE, self.OBSERVED)
            is None
        )
        assert (
            check_suggested_range("temp_max_servico", [100], "degC", self.CATALOGUE, self.OBSERVED)
            is None
        )

    def test_outside_the_range_is_refused_with_the_range(self) -> None:
        reason = check_suggested_range("densidade", [9], "g/cm**3", self.CATALOGUE, self.OBSERVED)
        assert reason and "fora da faixa" in reason and "1000" in reason

    def test_no_unit_no_data_unknown_property_are_refused(self) -> None:
        assert "sem unidade" in check_suggested_range(
            "densidade", [2], None, self.CATALOGUE, self.OBSERVED
        )
        assert "não tem valor" in check_suggested_range(
            "densidade", [2], "g/cm**3", self.CATALOGUE, {}
        )
        assert "não existe" in check_suggested_range(
            "inventada", [2], "m", self.CATALOGUE, self.OBSERVED
        )
        assert "sem valor" in check_suggested_range(
            "densidade", [None], "g/cm**3", self.CATALOGUE, self.OBSERVED
        )

    def test_levels_and_scenarios(self) -> None:
        scales = {"resistencia-agua-doce": ("Pobre", "Bom")}
        assert check_level("resistencia-agua-doce", "Bom", scales) is None
        assert "não está na escala" in check_level("resistencia-agua-doce", "Ótimo", scales)
        assert "não existe" in check_level("inventada", "Bom", scales)
        assert check_scenario("frio-extremo", {"frio-extremo"}) is None
        assert check_scenario("lua", {"frio-extremo"})


# --- running again with the person's choices -------------------------------------


class TestRunAgain:
    def _component_in(self, constraints: list[dict]) -> dict:
        return {
            "name": "Peça",
            "index_slug": "viga-leve-rigidez",
            "criteria": [],
            "constraints": constraints,
        }

    def test_a_confirmed_suggestion_runs_and_an_unconfirmed_one_does_not(
        self, client: TestClient
    ) -> None:
        suggestion = {
            "property": "temp_max_servico",
            "operator": "gte",
            "value": 500,
            "unit": "degC",
            "origin": "sugestao_ia",
        }
        off = client.post(
            "/api/ai/plan/run", json={"components": [self._component_in([suggestion])]}
        )
        on = client.post(
            "/api/ai/plan/run",
            json={"components": [self._component_in([{**suggestion, "confirmed": True}])]},
        )
        assert off.status_code == on.status_code == 200, (off.text, on.text)
        off_c, on_c = off.json()["components"][0], on.json()["components"][0]
        assert off_c["constraints"][0]["applied"] is False
        assert on_c["constraints"][0]["applied"] is True
        assert on_c["constraints"][0]["source"] == "Sugestão da IA, confirmada por você"
        assert on_c["result"]["final_count"] < off_c["result"]["final_count"]

    def test_scenario_numbers_are_reread_from_the_table(self, client: TestClient) -> None:
        tampered = {
            "property": "modulo_young",
            "operator": "gte",
            "value": 0.001,
            "unit": "GPa",
            "origin": "cenario:estrutural",
        }
        response = client.post(
            "/api/ai/plan/run", json={"components": [self._component_in([tampered])]}
        )
        assert response.status_code == 200, response.text
        limit = response.json()["components"][0]["constraints"][0]
        assert (limit["value"], limit["unit"]) == (10.0, "GPa")

    def test_the_users_own_choice_runs_as_given(self, client: TestClient) -> None:
        mine = {
            "property": "densidade",
            "operator": "lte",
            "value": 3,
            "unit": "g/cm**3",
            "origin": "usuario",
        }
        response = client.post(
            "/api/ai/plan/run", json={"components": [self._component_in([mine])]}
        )
        component = response.json()["components"][0]
        assert component["constraints"][0]["applied"] is True
        assert component["result"]["materials"]

    def test_run_again_spends_no_quota(
        self, client: TestClient, db_session: Session, test_user: User, monkeypatch
    ) -> None:
        provider = _CountingModel()
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        response = client.post("/api/ai/plan/run", json={"components": [self._component_in([])]})
        assert response.status_code == 200
        assert provider.calls == 0 and _used(db_session, test_user) == 0


# --- degradation, quota and cache ------------------------------------------------


class _CountingModel(ModelProviderBase):
    """A real-looking (not simulated) model that answers a fixed plan."""

    name = "modelo-de-teste"

    def __init__(self, answer: dict | None = None) -> None:
        self.calls = 0
        self.answer = answer if answer is not None else _raw()

    def _complete(self, system: str, user: str, schema: dict) -> dict:
        self.calls += 1
        return copy.deepcopy(self.answer)


def _used(db: Session, user: User) -> int:
    usage = NotebookRepository(db, user.id).usage(datetime.now(UTC).date())
    return usage.requests if usage is not None else 0


class TestDegradation:
    def test_a_model_that_fails_gives_the_rule_plan_not_an_error(
        self, client: TestClient, db_session: Session, test_user: User, use_provider
    ) -> None:
        use_provider(_PlanProvider(error=AIUnavailableError("A resposta não veio em JSON válido.")))
        body = _plan(client, SKI)
        assert body["degraded"] is True
        assert "regras locais" in body["notice"] and "JSON" in body["notice"]
        assert [c["name"] for c in body["components"]][0] == "Camada externa"

    def test_a_model_answer_without_components_degrades(
        self, client: TestClient, monkeypatch
    ) -> None:
        provider = _CountingModel(answer={"resumo": "não segui o formato"})
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        body = _plan(client, BUILDING)
        assert body["degraded"] is True and body["components"]

    def test_a_failed_call_gives_the_quota_back(
        self, client: TestClient, db_session: Session, test_user: User, monkeypatch
    ) -> None:
        provider = _CountingModel(answer={})
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        monkeypatch.setattr(ai_service.default_settings, "ai_daily_requests", 5)
        assert _plan(client, SKI)["degraded"] is True
        # The provider answered nothing usable — but it did answer, so the
        # call was spent; a provider *error* hands it back (next test).
        assert _used(db_session, test_user) == 1

    def test_a_provider_error_hands_the_quota_back(
        self, client: TestClient, db_session: Session, test_user: User, monkeypatch
    ) -> None:
        class _Failing(_CountingModel):
            def _complete(self, system, user, schema):
                self.calls += 1
                raise AIUnavailableError("O servidor não respondeu em 30s.")

        provider = _Failing()
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        monkeypatch.setattr(ai_service.default_settings, "ai_daily_requests", 5)
        body = _plan(client, SKI)
        assert body["degraded"] is True and "30s" in body["notice"]
        assert provider.calls == 1 and _used(db_session, test_user) == 0

    def test_over_the_daily_quota_the_rules_answer_and_the_model_is_not_called(
        self, client: TestClient, monkeypatch
    ) -> None:
        provider = _CountingModel()
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        monkeypatch.setattr(ai_service.default_settings, "ai_daily_requests", 1)
        assert _plan(client, "uma prateleira")["degraded"] is False
        body = _plan(client, "um quadro de bicicleta")
        assert body["degraded"] is True and "consultas à IA de hoje" in body["notice"]
        assert provider.calls == 1

    def test_the_layer_off_is_still_a_400(self, client: TestClient, monkeypatch) -> None:
        monkeypatch.setattr(ai_service.default_settings, "ai_provider", "")
        response = client.post("/api/ai/plan", json={"text": SKI})
        assert response.status_code == 400


class TestCache:
    def test_the_same_request_is_answered_once_and_counted_once(
        self, client: TestClient, db_session: Session, test_user: User, monkeypatch
    ) -> None:
        provider = _CountingModel()
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        monkeypatch.setattr(ai_service.default_settings, "ai_daily_requests", 5)
        first = _plan(client, "Uma prateleira  leve")
        second = _plan(client, "uma prateleira leve ")
        assert first["cached"] is False and second["cached"] is True
        assert provider.calls == 1 and _used(db_session, test_user) == 1
        assert [c["result"] for c in first["components"]] == [
            c["result"] for c in second["components"]
        ]

    def test_another_mode_or_text_asks_again(self, client: TestClient, monkeypatch) -> None:
        provider = _CountingModel()
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        _plan(client, "uma prateleira")
        _plan(client, "uma prateleira", mode="single")
        _plan(client, "duas prateleiras")
        assert provider.calls == 3

    def test_a_degraded_answer_is_not_cached(self, client: TestClient, use_provider) -> None:
        provider = use_provider(_PlanProvider(error=AIUnavailableError("tempo esgotado")))
        _plan(client, SKI)
        _plan(client, SKI)
        assert provider.calls == 2

    def test_the_cache_can_be_turned_off(self, client: TestClient, monkeypatch) -> None:
        provider = _CountingModel()
        monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
        monkeypatch.setattr(ai_service.default_settings, "ai_plan_cache_seconds", 0)
        _plan(client, "uma prateleira")
        _plan(client, "uma prateleira")
        assert provider.calls == 2


# --- performance: a light context and a bounded retrieval -----------------------


class TestLightContext:
    def test_the_plan_never_loads_every_material(self, client: TestClient, monkeypatch) -> None:
        def _forbidden(*_a, **_k):
            raise AssertionError("o contexto da IA não pode carregar o catálogo inteiro")

        monkeypatch.setattr(ChartRepository, "list_materials", _forbidden)
        _plan(client, BEAM)

    def test_the_summary_is_a_handful_of_queries_then_none(self, db_session: Session) -> None:
        statements: list[str] = []
        engine = db_session.get_bind().engine

        def _count(_conn, _cursor, statement, *_args) -> None:
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", _count)
        try:
            service = AIService(db_session)
            facts = service._catalogue_facts()
            first = len(statements)
            again = service._catalogue_facts()
        finally:
            event.remove(engine, "before_cursor_execute", _count)
        assert facts is again
        assert first <= 5, statements
        assert len(statements) == first
        assert facts.classes and facts.properties and facts.indices
        assert all("material_property_value" not in s for s in statements[:first])


class TestRetrievalBudget:
    def test_a_slow_embedding_falls_back_to_lexical_within_the_budget(
        self, db_session: Session, tmp_path, monkeypatch, caplog
    ) -> None:
        from app.config import settings
        from app.knowledge.retrieval import search
        from app.knowledge.service import KnowledgeService
        from app.tests.test_knowledge_retrieval import _FakeEmbeddingClient, _write

        root = tmp_path / "cerebro"
        root.mkdir()
        monkeypatch.setattr(settings, "knowledge_dir", str(root))
        _write(root, "aula.pdf", ["Densidade e módulo de elasticidade dos metais."])
        configured = Settings(
            knowledge_dir=str(root),
            knowledge_embedding_base_url="https://fake/v1",
            knowledge_embedding_model="fake-embed",
        )
        fast = _FakeEmbeddingClient()
        service = KnowledgeService(db_session, configured)
        monkeypatch.setattr(service, "_embeddings_configured", lambda: True)
        monkeypatch.setattr(service, "_embedding_client", lambda: fast)
        service.ingest()

        class _Slow(_FakeEmbeddingClient):
            asked = False

            def embed(self, texts):
                self.asked = True
                time.sleep(1.5)
                return super().embed(texts)

        slow = _Slow()
        monkeypatch.setattr("app.knowledge.retrieval.EmbeddingClient", lambda _s: slow)
        started = time.monotonic()
        with caplog.at_level(logging.WARNING, logger="app.knowledge.retrieval"):
            results = search(
                db_session,
                "densidade modulo elasticidade metais",
                top_k=5,
                settings=configured,
                embed_budget=0.1,
            )
        elapsed = time.monotonic() - started
        assert results, "a busca léxica continua respondendo"
        assert elapsed < 1.0
        assert slow.asked, "o embedding foi pedido — e não foi esperado"
        assert any("orçamento" in r.getMessage() for r in caplog.records)

    def test_the_ai_layer_passes_its_budget_to_the_search(
        self, db_session: Session, monkeypatch
    ) -> None:
        seen: dict = {}

        def _search(db, query, *, top_k, settings, embed_budget=None):
            seen["budget"] = embed_budget
            return []

        monkeypatch.setattr(ai_service, "knowledge_search", _search)
        service = AIService(db_session, settings=Settings(knowledge_retrieval_budget_seconds=1.25))
        service._retrieve("qualquer coisa", _CountingModel())
        assert seen["budget"] == 1.25


# --- the real transport: a tighter call for the plan -----------------------------


class _Response:
    def __init__(self, body: str) -> None:
        self._body = body.encode("utf-8")

    def read(self) -> bytes:
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_exc) -> bool:
        return False


class _Server:
    def __init__(self, *replies) -> None:
        self.replies = list(replies)
        self.calls = 0
        self.bodies: list[dict] = []
        self.timeouts: list[float | None] = []

    def __call__(self, request, timeout=None):
        self.bodies.append(json.loads(request.data.decode("utf-8")))
        self.timeouts.append(timeout)
        reply = self.replies[min(self.calls, len(self.replies) - 1)]
        self.calls += 1
        if isinstance(reply, Exception):
            raise reply
        return _Response(reply)


def _overloaded() -> urllib.error.HTTPError:
    body = json.dumps({"error": {"message": "high demand"}}).encode("utf-8")
    return urllib.error.HTTPError(
        "https://x/v1/chat/completions", 503, "erro", {}, io.BytesIO(body)
    )


def _envelope(content: dict) -> str:
    return json.dumps(
        {"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(content)}}]}
    )


def _context() -> PlanContext:
    return PlanContext(statement=SKI, properties=[], indices=[], classes=[], mode="project")


class TestPlanCallLimits:
    def _provider(self, server: _Server, waits: list) -> OpenAICompatProvider:
        return OpenAICompatProvider(
            settings=Settings(
                ai_provider="openai-compat",
                ai_base_url="https://x/v1",
                ai_timeout_seconds=90,
                ai_max_output_tokens=16000,
                ai_plan_timeout_seconds=30,
                ai_plan_max_output_tokens=6000,
            ),
            opener=server,
            sleep=waits.append,
        )

    def test_the_plan_asks_for_less_and_waits_less(self) -> None:
        server = _Server(_envelope(_raw()))
        plan = self._provider(server, []).plan(_context())
        assert plan["components"][0]["name"] == "Peça"
        assert server.bodies[0]["max_tokens"] == 6000
        assert server.timeouts == [30]

    def test_at_most_one_extra_attempt(self) -> None:
        waits: list[float] = []
        server = _Server(_overloaded(), _overloaded(), _overloaded(), _envelope(_raw()))
        with pytest.raises(AIUnavailableError):
            self._provider(server, waits).plan(_context())
        assert server.calls == 2
        assert len(waits) == 1

    def test_the_other_calls_keep_their_budget(self) -> None:
        from app.ai.notebook import NotebookQuestion

        server = _Server(_envelope({"paragraphs": [], "not_found": True}))
        self._provider(server, []).answer(NotebookQuestion(question="?", passages=()))
        assert server.bodies[0]["max_tokens"] == 16000
        assert server.timeouts == [90]
