"""Moving a class in the tree: ``PATCH /api/classes/{id}`` with ``parent_id`` only (D-233).

The tree in the Admin is edited by moving a folder, and the existing ``PUT``
cannot do that safely: it replaces the whole record, so a client that sends only
``name`` and ``parent_id`` wipes ``applications`` and ``characteristics`` — the
family's editorial text. The move is its own operation, and it touches nothing
but the parent.
"""

from __future__ import annotations

import pytest

from app.dependencies import can_edit_shared_catalog
from app.main import app


def _make(client, name, parent_id=None, **extra):
    resp = client.post("/api/classes", json={"name": name, "parent_id": parent_id, **extra})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _move(client, class_id, parent_id):
    return client.patch(f"/api/classes/{class_id}", json={"parent_id": parent_id})


def _parent_of(client, class_id):
    return next(c for c in client.get("/api/classes").json() if c["id"] == class_id)["parent_id"]


def test_a_class_moves_under_another_and_nothing_else_changes(client):
    a = _make(client, "Pasta A Mover")
    b = _make(client, "Pasta B Mover")
    child = _make(
        client,
        "Filha Mover",
        parent_id=a["id"],
        description="Descrição",
        applications="Usos da família",
        characteristics="Características da família",
    )

    resp = _move(client, child["id"], b["id"])

    assert resp.status_code == 200, resp.text
    assert resp.json()["parent_id"] == b["id"]
    assert _parent_of(client, child["id"]) == b["id"]
    # The prose a PUT would have wiped is still there.
    record = client.get(f"/api/classes/{child['slug']}").json()
    assert record["applications"] == "Usos da família"
    assert record["characteristics"] == "Características da família"
    assert record["description"] == "Descrição"
    assert record["name"] == "Filha Mover"
    assert record["slug"] == child["slug"]


def test_a_class_moves_to_the_root_with_a_null_parent(client):
    a = _make(client, "Pasta Raiz Mover")
    child = _make(client, "Filha Raiz Mover", parent_id=a["id"])

    assert _move(client, child["id"], None).status_code == 200
    assert _parent_of(client, child["id"]) is None


def test_the_subtree_travels_with_the_moved_class(client):
    a = _make(client, "Avó Mover")
    b = _make(client, "Mãe Mover", parent_id=a["id"])
    c = _make(client, "Neta Mover", parent_id=b["id"])
    destination = _make(client, "Destino Mover")

    assert _move(client, b["id"], destination["id"]).status_code == 200

    assert _parent_of(client, c["id"]) == b["id"]
    ancestors = client.get(f"/api/classes/{c['slug']}").json()["ancestors"]
    assert [x["slug"] for x in ancestors] == [destination["slug"], b["slug"]]


def test_a_class_cannot_move_into_itself(client):
    a = _make(client, "Solo Mover")
    resp = _move(client, a["id"], a["id"])
    assert resp.status_code == 400
    assert _parent_of(client, a["id"]) is None


def test_a_class_cannot_move_into_a_descendant(client):
    a = _make(client, "Topo Ciclo")
    b = _make(client, "Meio Ciclo", parent_id=a["id"])
    c = _make(client, "Fundo Ciclo", parent_id=b["id"])

    for descendant in (b, c):
        resp = _move(client, a["id"], descendant["id"])
        assert resp.status_code == 400, resp.text
    # Nothing moved.
    assert _parent_of(client, a["id"]) is None
    assert _parent_of(client, b["id"]) == a["id"]


def test_an_unknown_parent_is_a_404_and_an_unknown_class_too(client):
    a = _make(client, "Existe Mover")
    assert _move(client, a["id"], 999_999).status_code == 404
    assert _move(client, 999_999, None).status_code == 404


def test_the_body_must_say_where_to_move_it(client):
    a = _make(client, "Sem Corpo Mover")
    assert client.patch(f"/api/classes/{a['id']}", json={}).status_code == 422
    # Only the parent is accepted: a name here would be a second way to rename.
    resp = client.patch(f"/api/classes/{a['id']}", json={"parent_id": None, "name": "Outro"})
    assert resp.status_code == 200
    assert client.get(f"/api/classes/{a['slug']}").json()["name"] == "Sem Corpo Mover"


def test_moving_to_where_it_already_is_changes_nothing_and_writes_no_event(client):
    a = _make(client, "Parada Mover")
    before = len(client.get("/api/audit", params={"entity_type": "material_class"}).json())

    assert _move(client, a["id"], None).status_code == 200

    after = len(client.get("/api/audit", params={"entity_type": "material_class"}).json())
    assert after == before


def test_the_move_is_in_the_audit_trail(client):
    a = _make(client, "Pai Auditado")
    child = _make(client, "Filha Auditada")
    _move(client, child["id"], a["id"])

    events = client.get(
        "/api/audit", params={"entity_type": "material_class", "entity_id": child["id"]}
    ).json()
    updated = next(e for e in events if e["action"] == "ATUALIZADO")
    assert updated["changes"] == {"parent_id": {"before": None, "after": a["id"]}}


@pytest.fixture()
def read_only_catalog():
    app.dependency_overrides[can_edit_shared_catalog] = lambda: False
    yield
    app.dependency_overrides.pop(can_edit_shared_catalog, None)


def test_a_reader_without_curator_rights_cannot_move(client):
    a = _make(client, "Só Curador Mover")
    b = _make(client, "Destino Curador")
    app.dependency_overrides[can_edit_shared_catalog] = lambda: False
    try:
        resp = _move(client, a["id"], b["id"])
    finally:
        app.dependency_overrides.pop(can_edit_shared_catalog, None)
    assert resp.status_code == 403
    assert _parent_of(client, a["id"]) is None
