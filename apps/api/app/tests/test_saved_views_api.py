"""Saved views (D-209): a reader's tabs on a database screen, kept in the account."""

from __future__ import annotations

from app.services.saved_view_service import MAX_VIEWS_PER_SCOPE


def _view(**over):
    body = {
        "scope": "catalogo",
        "name": "Metais medidos",
        "kind": "table",
        "config": {
            "filters": {"classe": "metais", "qualidade": "MEDIDO"},
            "sort": {"field": "name", "direction": "asc"},
            "columns": ["name", "class"],
        },
    }
    body.update(over)
    return body


def test_create_list_and_order_by_position(client):
    first = client.post("/api/saved-views", json=_view()).json()
    second = client.post("/api/saved-views", json=_view(name="Galeria", kind="gallery")).json()
    assert (first["position"], second["position"]) == (0, 1)
    assert first["config"]["filters"] == {"classe": "metais", "qualidade": "MEDIDO"}

    listing = client.get("/api/saved-views", params={"scope": "catalogo"}).json()
    assert [v["name"] for v in listing] == ["Metais medidos", "Galeria"]
    # Another screen has its own tabs.
    assert client.get("/api/saved-views", params={"scope": "processos"}).json() == []


def test_patch_renames_without_resending_config_and_reorders(client):
    view = client.post("/api/saved-views", json=_view()).json()
    patched = client.patch(f"/api/saved-views/{view['id']}", json={"name": "Só metais"}).json()
    assert patched["name"] == "Só metais"
    assert patched["config"] == view["config"]

    moved = client.patch(f"/api/saved-views/{view['id']}", json={"position": 5}).json()
    assert moved["position"] == 5


def test_delete(client):
    view = client.post("/api/saved-views", json=_view()).json()
    assert client.delete(f"/api/saved-views/{view['id']}").status_code == 204
    assert client.get("/api/saved-views", params={"scope": "catalogo"}).json() == []


def test_another_reader_cannot_see_or_touch_a_view(client, other_user, login_as):
    view = client.post("/api/saved-views", json=_view()).json()
    with login_as(other_user):
        assert client.get("/api/saved-views", params={"scope": "catalogo"}).json() == []
        assert client.patch(f"/api/saved-views/{view['id']}", json={"name": "x"}).status_code == 404
        assert client.delete(f"/api/saved-views/{view['id']}").status_code == 404
    assert (
        client.get("/api/saved-views", params={"scope": "catalogo"}).json()[0]["id"] == view["id"]
    )


def test_rejects_unknown_scope_kind_and_config_shape(client):
    assert client.post("/api/saved-views", json=_view(scope="mapas")).status_code == 422
    assert client.post("/api/saved-views", json=_view(kind="kanban")).status_code == 422
    # A field the contract does not know is refused, not stored.
    assert (
        client.post("/api/saved-views", json=_view(config={"valores": [1, 2]})).status_code == 422
    )
    bad_key = _view(config={"filters": {"Classe Maiúscula": "x"}})
    assert client.post("/api/saved-views", json=bad_key).status_code == 422
    assert client.get("/api/saved-views", params={"scope": "mapas"}).status_code == 422


def test_caps_views_per_screen(client):
    for i in range(MAX_VIEWS_PER_SCOPE):
        assert client.post("/api/saved-views", json=_view(name=f"V{i}")).status_code == 201
    response = client.post("/api/saved-views", json=_view(name="Uma a mais"))
    assert response.status_code == 409
    assert "Limite" in response.json()["detail"]


def test_dashboard_layout_is_one_per_reader_and_only_on_the_dashboard(client):
    layout = {
        "scope": "painel",
        "name": "Layout",
        "kind": "layout",
        "config": {"blocks": ["kpis", "classes", "qualidade"], "hidden": ["qualidade"]},
    }
    created = client.post("/api/saved-views", json=layout)
    assert created.status_code == 201
    assert created.json()["config"]["hidden"] == ["qualidade"]
    assert client.post("/api/saved-views", json=layout).status_code == 409
    # Domain refusals are 400 here (``ValidationError``); 422 is the contract's shape.
    assert client.post("/api/saved-views", json={**layout, "scope": "catalogo"}).status_code == 400
    # A layout does not turn into a tab, nor a tab into a layout.
    view = client.post("/api/saved-views", json=_view()).json()
    assert (
        client.patch(f"/api/saved-views/{view['id']}", json={"kind": "layout"}).status_code == 400
    )


def test_home_keeps_one_layout_and_no_views(client):
    """D-232b (F6): the Início rearranges its blocks like the dashboard, and keeps
    nothing else — a table view there would be a promise no screen reads back."""
    layout = {
        "scope": "inicio",
        "name": "Layout",
        "kind": "layout",
        "config": {"blocks": ["estudos", "retomar", "recentes"], "hidden": ["novidades"]},
    }
    created = client.post("/api/saved-views", json=layout)
    assert created.status_code == 201
    assert created.json()["config"]["blocks"][0] == "estudos"
    assert client.post("/api/saved-views", json=layout).status_code == 409
    listing = client.get("/api/saved-views", params={"scope": "inicio"}).json()
    assert [v["kind"] for v in listing] == ["layout"]
    assert client.post("/api/saved-views", json=_view(scope="inicio")).status_code == 400
