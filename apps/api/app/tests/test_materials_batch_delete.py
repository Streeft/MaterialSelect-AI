"""Deleting several own records at once from "Meus registros" (D-233).

``DELETE /api/materials/{id}`` already withdraws one record (soft delete). The
screen now lets a person tick several of their *own* records and delete them
together, so there is one call that is **all or nothing**: a batch that half-ran
would leave the reader unsure which of the ticked records are still there. What
may be in it is narrower than for the single delete — own records only: a
shared-catalogue record is never withdrawn from this screen, even by someone who
could edit it elsewhere.
"""

from __future__ import annotations

from app.tests.test_crud_api import _new_material_payload


def _own(client, name, **extra) -> dict:
    resp = client.post(
        "/api/materials",
        json=_new_material_payload(client, name=name, is_own_record=True, **extra),
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _delete(client, ids):
    return client.post("/api/materials/batch-delete", json={"ids": ids})


def _catalogue_ids(client) -> set[int]:
    return {m["id"] for m in client.get("/api/materials").json()}


def test_own_records_are_deleted_together(client):
    a = _own(client, "Liga Própria Lote A")
    b = _own(client, "Liga Própria Lote B")
    keep = _own(client, "Liga Própria Lote C")

    resp = _delete(client, [a["id"], b["id"]])

    assert resp.status_code == 200, resp.text
    assert sorted(resp.json()["deleted"]) == sorted([a["id"], b["id"]])
    remaining = _catalogue_ids(client)
    assert a["id"] not in remaining and b["id"] not in remaining
    assert keep["id"] in remaining
    # Withdrawn, like the single delete: the sheet is gone from the catalogue.
    assert client.get(f"/api/materials/{a['id']}").status_code in (200, 404)


def test_every_deletion_is_in_the_audit_trail(client):
    a = _own(client, "Liga Auditada Lote A")
    b = _own(client, "Liga Auditada Lote B")
    _delete(client, [a["id"], b["id"]])
    for record in (a, b):
        events = client.get(
            "/api/audit", params={"entity_type": "material", "entity_id": record["id"]}
        ).json()
        assert "EXCLUIDO" in [e["action"] for e in events]


def test_a_record_of_the_shared_catalogue_refuses_the_whole_batch(client):
    own = _own(client, "Liga Própria Mista")
    shared = client.post("/api/materials", json=_new_material_payload(client)).json()

    resp = _delete(client, [own["id"], shared["id"]])

    assert resp.status_code == 400
    assert "próprio" in resp.json()["detail"]
    # Nothing was deleted, not even the own record listed first.
    assert {own["id"], shared["id"]} <= _catalogue_ids(client)


def test_somebody_elses_record_is_a_404_for_the_whole_batch(client, other_user, login_as):
    mine = _own(client, "Liga Minha Lote")
    with login_as(other_user):
        theirs = _own(client, "Liga Do Bruno Lote")

    resp = _delete(client, [mine["id"], theirs["id"]])

    assert resp.status_code == 404
    assert mine["id"] in _catalogue_ids(client)
    with login_as(other_user):
        assert theirs["id"] in _catalogue_ids(client)


def test_a_missing_id_is_a_404_and_nothing_is_deleted(client):
    mine = _own(client, "Liga Minha Lote 2")
    assert _delete(client, [mine["id"], 999_999]).status_code == 404
    assert mine["id"] in _catalogue_ids(client)


def test_a_record_already_withdrawn_is_a_404_not_a_silent_success(client):
    mine = _own(client, "Liga Já Excluída")
    client.delete(f"/api/materials/{mine['id']}")
    assert _delete(client, [mine["id"]]).status_code == 404


def test_between_one_and_a_hundred_distinct_ids(client):
    assert _delete(client, []).status_code == 422
    assert _delete(client, list(range(1, 102))).status_code == 422
    mine = _own(client, "Liga Repetida")
    resp = _delete(client, [mine["id"], mine["id"]])
    assert resp.status_code == 200
    assert resp.json()["deleted"] == [mine["id"]]


def test_the_batch_leaves_other_records_values_alone(client):
    a = _own(client, "Liga Lote Valores A")
    other = _own(client, "Liga Lote Valores B")
    _delete(client, [a["id"]])
    sheet = client.get(f"/api/materials/{other['id']}").json()
    values = [p for g in sheet["property_groups"] for p in g["properties"] if not p["is_missing"]]
    assert values


def test_the_batch_needs_login(anon_client):
    assert anon_client.post("/api/materials/batch-delete", json={"ids": [1]}).status_code == 401


def test_the_batch_route_is_not_taken_for_a_material_id(client):
    # A literal path next to `/{material_id}`: neither verb collides with the other.
    assert client.get("/api/materials/batch-delete").status_code in (404, 405, 422)
