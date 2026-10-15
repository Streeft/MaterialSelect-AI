"""D-127: perfis de profundidade L1/L2/L3 são visão, nunca filtro de dado."""

from __future__ import annotations

import inspect

import pytest

from app.domain import depth_profile as depth
from app.domain.depth_profile import (
    DEFAULT_LEVEL,
    DepthLevel,
    DepthLevelError,
    parse_level,
    property_min_level,
    split_by_level,
)
from app.schemas.selection import RunRequest


def test_default_level_shows_everything():
    # O padrão do app continua o comportamento de antes: todos os níveis.
    assert DEFAULT_LEVEL is DepthLevel.L3
    assert parse_level(None) is DepthLevel.L3
    assert parse_level("") is DepthLevel.L3


def test_undeclared_property_is_visible_at_every_level():
    # Padrão seguro: uma grandeza sem nível declarado nunca some.
    assert property_min_level("grandeza_que_ninguem_classificou") is DepthLevel.L1
    for level in DepthLevel:
        assert depth.is_visible("grandeza_que_ninguem_classificou", level)


def test_declared_levels_are_valid_and_never_level_one():
    # O mapa só lista o que NÃO é do Nível 1; declarar 1 seria ruído.
    for slug, level in depth.PROPERTY_MIN_LEVEL.items():
        assert isinstance(level, DepthLevel)
        assert level > DepthLevel.L1, slug
    for route, level in depth.TOOL_MIN_LEVEL.items():
        assert route.startswith("/app/")
        assert isinstance(level, DepthLevel)


def test_split_keeps_what_is_out_of_level_instead_of_dropping_it():
    slugs = ["densidade", "coef_poisson", "co2_reciclagem", "nova"]
    view = split_by_level(slugs, DepthLevel.L1)
    assert view.shown == ("densidade", "nova")
    assert view.hidden == ("coef_poisson", "co2_reciclagem")
    assert view.total == len(slugs)
    assert split_by_level(slugs, DepthLevel.L2).hidden == ("co2_reciclagem",)
    assert split_by_level(slugs, DepthLevel.L3).hidden == ()


@pytest.mark.parametrize("raw", ["0", "4", "L1", "abc", 7])
def test_invalid_level_is_refused(raw):
    with pytest.raises(DepthLevelError):
        parse_level(raw)


@pytest.mark.parametrize("raw,expected", [("1", 1), (2, 2), ("3", 3)])
def test_valid_level_parses(raw, expected):
    assert parse_level(raw) == expected


def test_property_definitions_carry_min_level(client):
    resp = client.get("/api/properties")
    assert resp.status_code == 200
    by_slug = {p["slug"]: p for p in resp.json()}
    for slug, p in by_slug.items():
        assert p["min_level"] == int(property_min_level(slug))
    assert by_slug["densidade"]["min_level"] == 1


def test_depth_profiles_endpoint(client):
    resp = client.get("/api/properties/niveis")
    assert resp.status_code == 200
    body = resp.json()
    assert body["default_level"] == 3
    assert body["undeclared_min_level"] == 1
    assert [lvl["level"] for lvl in body["levels"]] == [1, 2, 3]
    assert all(lvl["label"].startswith("Nível ") for lvl in body["levels"])
    assert body["property_min_level"]["co2_reciclagem"] == 3
    assert body["tool_min_level"]["/app/baterias"] == 3


def test_material_sheet_keeps_every_property_and_tags_its_level(client):
    # A ficha não recorta nada no servidor: o nível é escolha de leitura.
    materials = client.get("/api/materials").json()
    detail = client.get(f"/api/materials/{materials[0]['id']}").json()
    rows = [p for g in detail["property_groups"] for p in g["properties"]]
    assert rows
    for row in rows:
        assert row["min_level"] == int(property_min_level(row["property_slug"]))
    # Fora do nível não é ausência: o estado ausente continua sendo só is_missing.
    assert all(isinstance(row["is_missing"], bool) for row in rows)


def test_selection_contracts_do_not_know_about_level():
    # Nenhum contrato de cálculo recebe o nível: se um dia receber, é uma
    # mudança de método que precisa de aviso escrito (D-127).
    assert "nivel" not in RunRequest.model_fields
    assert "level" not in RunRequest.model_fields
    from app.services.selection_service import SelectionService

    for name, fn in inspect.getmembers(SelectionService, inspect.isfunction):
        params = inspect.signature(fn).parameters
        assert "nivel" not in params and "level" not in params, name


def test_canary_level_does_not_change_ranking(client):
    # O canário: a mesma seleção, pedida "no Nível 1", dá a mesma resposta —
    # inclusive com critério sobre uma grandeza que o Nível 1 não mostra.
    payload = {
        "ranking": {
            "criteria": [
                {"key": "densidade", "weight": 1.0, "direction": "min"},
                {"key": "coef_poisson", "weight": 1.0, "direction": "max"},
            ],
            "run_sensitivity": False,
        }
    }
    assert property_min_level("coef_poisson") > DepthLevel.L1
    base = client.post("/api/selection/run", json=payload)
    at_l1 = client.post("/api/selection/run?nivel=1", json=payload)
    assert base.status_code == at_l1.status_code == 200
    assert base.json() == at_l1.json()
