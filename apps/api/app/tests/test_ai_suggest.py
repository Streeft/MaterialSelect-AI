"""The suggestion engine of every tool (D-228): ``POST /api/ai/suggest``.

What is pinned down here is the contract the screens of IA-2a/IA-2b rely on:

* every tool answers with at least one suggestion under the simulated provider,
  and each action names something that exists;
* the context a screen sends is *validated and enriched on the server* — ids
  that do not exist are refused, the numbers the prose may cite are the ones
  the backend read or computed;
* a provider that lies (an unknown slug, an invented number, an action of
  another screen) is filtered, with the reason in ``rejected``;
* the same context within the cache window spends no quota;
* a provider that fails never leaves the screen empty (``degraded``).
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.ai.model_base import ModelProviderBase
from app.ai.provider import AIUnavailableError
from app.models.user import User
from app.repositories.notebook_repository import NotebookRepository
from app.services import ai_service

STATIC_ROUTES_PREFIX = "/app"


def _suggest(client: TestClient, tool: str, context: dict | None = None):
    return client.post("/api/ai/suggest", json={"tool": tool, "context": context or {}})


def _ok(client: TestClient, tool: str, context: dict | None = None) -> dict:
    response = _suggest(client, tool, context)
    assert response.status_code == 200, response.text
    return response.json()


def _class_id(client: TestClient, material_id: int = 1) -> int:
    return client.get(f"/api/materials/{material_id}").json()["class_id"]


def _contexts(client: TestClient) -> dict[str, dict]:
    processes = client.get("/api/processes").json()
    process = processes[0]
    casting = next(p for p in processes if p["slug"] == "fundicao-areia")
    case = client.get("/api/solver/casos").json()[0]
    inputs = {v["key"]: v["example"] for v in case["variables"] if v["example"] is not None}
    for support in case["supports"][:1]:
        inputs[support["variable_key"]] = support["value"]
    battery = client.get("/api/padroes").json()["baterias"]
    return {
        "mapas": {"x": "densidade", "y": "modulo_young"},
        "comparar": {"material_ids": [1, 2, 3]},
        "catalogo": {},
        "ficha": {"material_id": 1},
        "processos": {"slug": process["slug"]},
        "glossario": {"q": "densidade"},
        "sintetizar": {
            "request": {
                "kind": "espuma",
                "name": "Espuma de teste",
                "class_id": _class_id(client),
                "parent_a_id": 1,
                "relative_density": 0.1,
            }
        },
        "painel": {},
        "registros": {},
        "importar": {"columns": ["Nome", "Densidade", "Módulo de Young", "coluna-sem-par"]},
        "dimensionar": {"request": {"case_key": case["key"], "inputs": inputs}},
        "custo": {
            "request": {
                "material_id": 1,
                "part_mass": 2.0,
                "batch_size": 1000.0,
                "write_off_years": 5.0,
                "load_factor": 0.5,
            }
        },
        "eco": {
            "request": {
                "material_id": 1,
                "process_id": casting["id"],
                "part_mass": 2.0,
                "recycled_fraction": 0.0,
                "transport_mode": "rodoviario",
                "transport_distance_km": 1500.0,
                "end_of_life": "reciclagem",
                "use": {
                    "model": "estatico",
                    "power_watts": 60.0,
                    "duty_cycle": 0.25,
                    "life_years": 10.0,
                    "carbon_per_energy": 0.05,
                },
            }
        },
        "baterias": {
            "request": {
                "chemistry_slug": battery["chemistry_slug"],
                "target_voltage_v": battery["voltage_v"],
                "target_energy_kwh": battery["energy_kwh"],
                "target_power_kw": battery["power_kw"],
                "dod": battery["dod"],
                "mass_packing_factor": battery["mass_packing_factor"],
                "volume_packing_factor": battery["volume_packing_factor"],
                "cost_packing_factor": battery["cost_packing_factor"],
            }
        },
        "admin_classes": {"name": "Ligas de titânio"},
        "admin_propriedades": {
            "name": "Resistividade elétrica",
            "symbol": "ρe",
            "canonical_unit": "ohm*m",
        },
    }


ALL_TOOLS = (
    "mapas",
    "comparar",
    "catalogo",
    "ficha",
    "processos",
    "glossario",
    "sintetizar",
    "painel",
    "registros",
    "importar",
    "dimensionar",
    "custo",
    "eco",
    "baterias",
    "admin_classes",
    "admin_propriedades",
)


def _today():
    return datetime.now(UTC).date()


def _used(db: Session, user: User) -> int:
    usage = NotebookRepository(db, user.id).usage(_today())
    return usage.requests if usage is not None else 0


# --- every tool, with the simulated provider ---------------------------------


@pytest.mark.parametrize("tool", ALL_TOOLS)
def test_every_tool_gets_a_valid_suggestion_from_the_mock(client: TestClient, tool: str) -> None:
    # Favourites make the "Meus registros" context non-trivial.
    client.put("/api/my-records/favorites/material/1")
    client.put("/api/my-records/favorites/material/2")
    body = _ok(client, tool, _contexts(client)[tool])

    assert body["tool"] == tool
    assert body["provider"] == "mock"
    assert body["simulated"] is True
    assert body["degraded"] is False
    # The local rules pass their own guardrails: nothing of theirs is refused.
    assert body["rejected"] == [], body["rejected"]
    assert body["summary"]
    assert body["suggestions"], body
    actions = [a for s in body["suggestions"] for a in s["actions"]]
    assert actions, body
    for suggestion in body["suggestions"]:
        assert suggestion["title"] and suggestion["body"]
        assert len(suggestion["actions"]) <= 3
    for action in actions:
        assert action["label"]
        if action["type"] == "open_route":
            assert action["path"].startswith(STATIC_ROUTES_PREFIX)


def test_the_mock_is_deterministic(client: TestClient) -> None:
    context = {"material_ids": [1, 2, 3]}
    first = _ok(client, "comparar", context)
    ai_service.reset_ai_caches()
    assert _ok(client, "comparar", context) == first


def test_mapas_actions_name_catalogued_axes_and_presets(client: TestClient) -> None:
    body = _ok(client, "mapas", {})
    properties = {p["slug"] for p in client.get("/api/properties").json()}
    presets = {p["slug"] for p in client.get("/api/charts/presets").json()}
    actions = [a for s in body["suggestions"] for a in s["actions"]]
    assert {a["type"] for a in actions} & {"set_axes", "apply_preset", "set_index"}
    for action in actions:
        if action["type"] == "set_axes":
            assert {action["x"], action["y"]} <= properties
        if action["type"] == "apply_preset":
            assert action["id"] in presets


def test_comparar_prose_cites_only_the_server_table(client: TestClient) -> None:
    """The client sends ids only; the values in the prose come from the server."""
    body = _ok(client, "comparar", {"material_ids": [1, 2, 3]})
    compare = [a for s in body["suggestions"] for a in s["actions"] if a["type"] == "compare"]
    for action in compare:
        assert set(action["ids"]) <= {1, 2, 3}


def test_importar_maps_columns_to_catalogued_properties(client: TestClient) -> None:
    body = _ok(client, "importar", {"columns": ["Nome", "Densidade", "Módulo de Young"]})
    mapped = {
        a["col"]: a["prop"]
        for s in body["suggestions"]
        for a in s["actions"]
        if a["type"] == "map_column"
    }
    assert mapped.get("Densidade") == "densidade"
    assert mapped.get("Módulo de Young") == "modulo_young"


def test_custo_is_recomputed_on_the_server(client: TestClient) -> None:
    """A number the client puts in the context as a 'result' is never trusted."""
    context = _contexts(client)["custo"]
    context["result"] = {"total": 123456.789}
    body = _ok(client, "custo", context)
    text = " ".join(s["title"] + " " + s["body"] for s in body["suggestions"])
    assert "123456" not in text and "123.456" not in text
    for action in (a for s in body["suggestions"] for a in s["actions"]):
        if action["type"] == "set_param":
            assert action["name"] in {"part_mass", "batch_size", "write_off_years", "load_factor"}


# --- the context is validated -------------------------------------------------


def test_unknown_tool_is_a_422(client: TestClient) -> None:
    assert _suggest(client, "planilha", {}).status_code == 422


def test_unknown_material_is_refused(client: TestClient) -> None:
    response = _suggest(client, "ficha", {"material_id": 999999})
    assert response.status_code == 404


def test_malformed_calculator_request_is_a_400(client: TestClient) -> None:
    response = _suggest(client, "custo", {"request": {"material_id": 1}})
    assert response.status_code == 400
    assert "custo" in response.json()["detail"].lower()


def test_oversized_context_is_refused(client: TestClient) -> None:
    response = _suggest(client, "importar", {"columns": ["x" * 50] * 2000})
    assert response.status_code == 422


# --- guardrails against a provider that lies ----------------------------------


class _LyingProvider(ModelProviderBase):
    """Not simulated; answers whatever it was told to."""

    name = "modelo-mentiroso"

    def __init__(self, answer: dict | None = None, error: Exception | None = None) -> None:
        self.answer = answer or {}
        self.error = error
        self.calls = 0

    def _complete(self, system: str, user: str, schema: dict) -> dict:
        self.calls += 1
        if self.error is not None:
            raise self.error
        return self.answer


def _action(type_: str, target: str = "", value: str = "", ids: list[str] | None = None):
    return {"type": type_, "target": target, "value": value, "ids": ids or []}


LIES = {
    "summary": "Três ideias para o mapa.",
    "suggestions": [
        {
            "title": "Eixo inventado",
            "body": "Use a propriedade que não existe.",
            "actions": [_action("set_axes", "densidade", "propriedade_fantasma")],
        },
        {
            "title": "Número inventado",
            "body": "O alumínio tem módulo de 71,3 GPa e densidade 2,71.",
            "actions": [_action("set_axes", "densidade", "modulo_young")],
        },
        {
            "title": "Ação de outra tela",
            "body": "Mapeie a coluna.",
            "actions": [
                _action("map_column", "Densidade", "densidade"),
                _action("open_route", "/app/../admin"),
                _action("apply_preset", "modulo-densidade"),
            ],
        },
    ],
}


@pytest.fixture()
def liar(monkeypatch: pytest.MonkeyPatch) -> _LyingProvider:
    provider = _LyingProvider(LIES)
    monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
    return provider


def test_guardrails_filter_entities_numbers_and_foreign_actions(
    client: TestClient, liar: _LyingProvider
) -> None:
    body = _ok(client, "mapas", {})
    titles = [s["title"] for s in body["suggestions"]]
    assert "Número inventado" not in titles
    rejected = " ".join(body["rejected"])
    assert "propriedade_fantasma" in rejected
    assert "71,3" in rejected or "71.3" in rejected
    assert "map_column" in rejected
    assert "/app/../admin" in rejected
    kept = next(s for s in body["suggestions"] if s["title"] == "Ação de outra tela")
    assert [a["type"] for a in kept["actions"]] == ["apply_preset"]
    assert body["degraded"] is False
    assert body["provider"] == "modelo-mentiroso"


def test_nothing_valid_falls_back_to_the_rules(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    provider = _LyingProvider(
        {
            "summary": "x",
            "suggestions": [
                {"title": "Só mentira", "body": "Densidade de 9,87654 g/cm3.", "actions": []}
            ],
        }
    )
    monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
    body = _ok(client, "mapas", {})
    assert body["degraded"] is True
    assert body["suggestions"]
    assert body["notice"]
    assert body["rejected"]


# --- degradation: never empty -------------------------------------------------


def test_a_provider_failure_degrades_to_local_rules(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    provider = _LyingProvider(error=AIUnavailableError("A cota gratuita do Google acabou."))
    monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
    body = _ok(client, "catalogo", {})
    assert body["degraded"] is True
    assert body["suggestions"]
    assert "cota gratuita" in body["notice"]


def test_an_unexpected_provider_crash_also_degrades(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    provider = _LyingProvider(error=RuntimeError("boom"))
    monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
    body = _ok(client, "ficha", {"material_id": 1})
    assert body["degraded"] is True and body["suggestions"]


def test_layer_off_still_answers_with_the_rules(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai_service.default_settings, "ai_provider", "")
    body = _ok(client, "mapas", {})
    assert body["degraded"] is True
    assert body["suggestions"]
    assert "desativada" in body["notice"]


# --- cache and quota ----------------------------------------------------------


def test_the_same_context_is_cached_and_spends_no_quota(
    client: TestClient,
    db_session: Session,
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    good = {
        "summary": "Um mapa clássico.",
        "suggestions": [
            {
                "title": "Mapa módulo × densidade",
                "body": "Compare rigidez e peso.",
                "actions": [_action("apply_preset", "modulo-densidade")],
            }
        ],
    }
    provider = _LyingProvider(good)
    monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
    monkeypatch.setattr(ai_service.default_settings, "ai_daily_requests", 5)

    first = _ok(client, "mapas", {"x": "densidade"})
    second = _ok(client, "mapas", {"x": "densidade"})
    assert first["cached"] is False and second["cached"] is True
    assert provider.calls == 1
    assert _used(db_session, test_user) == 1
    assert second["suggestions"] == first["suggestions"]

    # Another context is another question.
    _ok(client, "mapas", {"x": "modulo_young"})
    assert provider.calls == 2


def test_the_daily_quota_degrades_instead_of_failing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    provider = _LyingProvider(LIES)
    monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: provider)
    monkeypatch.setattr(ai_service.default_settings, "ai_daily_requests", 0)
    body = _ok(client, "mapas", {})
    assert provider.calls == 0
    assert body["degraded"] is True
    assert "consultas" in body["notice"]


def test_the_suggest_route_counts_in_the_ai_bucket(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.config import settings
    from app.services.rate_limit_service import reset_rate_limits

    monkeypatch.setattr(settings, "rate_limit_enabled", True)
    monkeypatch.setattr(settings, "rate_limit_ai_per_minute", 2)
    reset_rate_limits()
    try:
        assert _suggest(client, "catalogo").status_code == 200
        assert _suggest(client, "catalogo").status_code == 200
        assert _suggest(client, "catalogo").status_code == 429
    finally:
        reset_rate_limits()


# --- the reading of a model answer --------------------------------------------


def test_the_prompt_is_short_and_lists_the_allowed_actions(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    seen: dict[str, object] = {}

    class _Recorder(_LyingProvider):
        def _complete_limited(self, system, user, schema, limits):  # type: ignore[override]
            seen.update(system=system, user=user, schema=schema, limits=limits)
            return LIES

    monkeypatch.setattr(ai_service, "get_provider", lambda *_a, **_k: _Recorder())
    _ok(client, "mapas", {"x": "densidade", "y": "modulo_young"})
    prompt = f"{seen['system']}\n{seen['user']}"
    assert len(prompt) < 6000
    assert "set_axes" in prompt and "map_column" not in prompt
    enum = seen["schema"]["properties"]["suggestions"]["items"]["properties"]["actions"]["items"][
        "properties"
    ]["type"]["enum"]
    assert "map_column" not in enum and "set_axes" in enum
    assert seen["limits"].max_output_tokens <= 2000
