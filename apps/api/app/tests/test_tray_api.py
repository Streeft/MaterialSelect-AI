"""The tray (D-258): what a reader is carrying, over the real catalogue."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.tray_tools import TRAY_TOOLS
from app.models.material import Material
from app.models.process import Process
from app.models.tray import TrayItem
from app.services.tray_service import MAX_TRAY_ITEMS


def _material(db: Session, like: str) -> Material:
    return db.execute(select(Material).where(Material.name.like(like))).scalars().first()


def _process(db: Session) -> Process:
    return db.execute(select(Process).where(Process.is_active.is_(True))).scalars().first()


def _put(client, *items: dict):
    return client.put("/api/tray/items", json={"items": list(items)})


def test_an_empty_tray_still_lists_the_tools_that_can_be_carried(client):
    body = client.get("/api/tray").json()
    assert body["items"] == []
    assert [tool["slug"] for tool in body["tools"]] == [tool.slug for tool in TRAY_TOOLS]
    assert body["tools"][0] == {
        "slug": "dimensionar",
        "label": "Dimensionar",
        "route": "/app/dimensionar",
    }
    assert body["max_items"] == MAX_TRAY_ITEMS


def test_a_material_a_process_and_a_tool_each_go_to_their_compartment(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    process = _process(db_session)
    resp = _put(
        client,
        {"material_id": aluminium.id},
        {"process_id": process.id},
        {"tool": "custo"},
    )
    assert resp.status_code == 200, resp.text
    by_kind = {item["kind"]: item for item in resp.json()["items"]}

    assert by_kind["material"] == {
        "id": by_kind["material"]["id"],
        "kind": "material",
        "compartment": "material",
        "position": 0,
        "record_id": aluminium.id,
        "tool": None,
        "name": aluminium.name,
        "detail": aluminium.material_class.name,
        "href": f"/app/materiais/{aluminium.id}",
        "unavailable": False,
    }
    assert by_kind["process"]["compartment"] == "ferramenta"
    assert by_kind["process"]["name"] == process.name
    assert by_kind["process"]["href"] == f"/app/processos/{process.slug}"
    assert by_kind["tool"]["compartment"] == "ferramenta"
    assert (by_kind["tool"]["name"], by_kind["tool"]["href"]) == ("Custo", "/app/custo")
    assert by_kind["tool"]["record_id"] is None
    # Each compartment counts its own places.
    assert (by_kind["process"]["position"], by_kind["tool"]["position"]) == (0, 1)


def test_the_same_steel_can_be_carried_as_a_fixing(client, db_session):
    steel = _material(db_session, "Aço%")
    item = _put(client, {"material_id": steel.id, "compartment": "fixacao"}).json()["items"][0]
    assert item["compartment"] == "fixacao"

    moved = client.patch(f"/api/tray/items/{item['id']}", json={"compartment": "material"})
    assert moved.json()["items"][0]["compartment"] == "material"


def test_putting_something_twice_changes_nothing(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    first = _put(client, {"material_id": aluminium.id}, {"tool": "eco"}).json()
    again = _put(
        client,
        {"material_id": aluminium.id, "compartment": "fixacao"},
        {"tool": "eco"},
        {"tool": "eco"},
    ).json()
    assert again["items"] == first["items"]


def test_a_thing_in_the_wrong_compartment_is_refused_in_words(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    process = _process(db_session)
    wrong = _put(client, {"material_id": aluminium.id, "compartment": "ferramenta"})
    assert wrong.status_code == 400
    assert (
        wrong.json()["detail"]
        == "Um material não vai em Ferramentas: vai em Materiais ou Fixações."
    )
    assert _put(client, {"process_id": process.id, "compartment": "material"}).status_code == 400
    assert _put(client, {"tool": "custo", "compartment": "fixacao"}).status_code == 400

    item = _put(client, {"tool": "custo"}).json()["items"][0]
    assert (
        client.patch(f"/api/tray/items/{item['id']}", json={"compartment": "material"}).status_code
        == 400
    )


def test_what_does_not_exist_is_refused_and_nothing_is_written(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    assert _put(client, {"material_id": aluminium.id}, {"material_id": 999_999}).status_code == 404
    assert _put(client, {"process_id": 999_999}).status_code == 404
    assert _put(client, {"tool": "martelo"}).status_code == 400
    # The valid item of the refused request did not go in.
    assert client.get("/api/tray").json()["items"] == []


def test_the_contract_wants_exactly_one_target(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    assert _put(client, {}).status_code == 422
    assert _put(client, {"material_id": aluminium.id, "tool": "custo"}).status_code == 422
    assert _put(client, {"material_id": aluminium.id, "nota": "x"}).status_code == 422
    assert client.put("/api/tray/items", json={"items": []}).status_code == 422


def test_the_database_itself_refuses_a_row_with_no_target_or_two(db_session, test_user):
    for row in (
        TrayItem(user_id=test_user.id, compartment="ferramenta"),
        TrayItem(user_id=test_user.id, compartment="ferramenta", tool="custo", process_id=1),
    ):
        db_session.add(row)
        with pytest.raises(IntegrityError):
            db_session.flush()
        db_session.rollback()


def test_a_material_that_left_the_catalogue_stays_and_is_named_as_unavailable(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    _put(client, {"material_id": aluminium.id})
    aluminium.is_active = False
    db_session.commit()

    item = client.get("/api/tray").json()["items"][0]
    assert item["unavailable"] is True
    assert item["name"] == "Material indisponível"
    assert item["href"] is None and item["detail"] is None
    # And it can still be taken out.
    assert client.delete(f"/api/tray/items/{item['id']}").json()["items"] == []


def test_remove_reorder_and_clear(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    steel = _material(db_session, "Aço%")
    items = _put(
        client, {"material_id": aluminium.id}, {"material_id": steel.id}, {"tool": "eco"}
    ).json()["items"]
    first, second = (item for item in items if item["kind"] == "material")
    assert (first["position"], second["position"]) == (0, 1)

    moved = client.patch(f"/api/tray/items/{second['id']}", json={"position": 0}).json()["items"]
    # A tie on position falls back to the order they went in.
    assert [item["name"] for item in moved if item["kind"] == "material"] == [
        aluminium.name,
        steel.name,
    ]

    left = client.delete(f"/api/tray/items/{first['id']}").json()["items"]
    assert [item["name"] for item in left] == ["Eco", steel.name]
    assert client.delete(f"/api/tray/items/{first['id']}").status_code == 404
    assert client.delete("/api/tray").json()["items"] == []


def test_moving_to_another_compartment_goes_to_its_end(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    steel = _material(db_session, "Aço%")
    items = _put(
        client,
        {"material_id": aluminium.id, "compartment": "fixacao"},
        {"material_id": steel.id},
    ).json()["items"]
    steel_item = next(item for item in items if item["record_id"] == steel.id)
    moved = client.patch(f"/api/tray/items/{steel_item['id']}", json={"compartment": "fixacao"})
    fixings = [item for item in moved.json()["items"] if item["compartment"] == "fixacao"]
    assert [item["name"] for item in fixings] == [aluminium.name, steel.name]
    assert [item["position"] for item in fixings] == [0, 1]


def test_another_reader_has_their_own_tray(client, db_session, other_user, login_as):
    aluminium = _material(db_session, "%Alumínio%")
    item = _put(client, {"material_id": aluminium.id}).json()["items"][0]
    with login_as(other_user):
        assert client.get("/api/tray").json()["items"] == []
        assert (
            client.patch(f"/api/tray/items/{item['id']}", json={"position": 3}).status_code == 404
        )
        assert client.delete(f"/api/tray/items/{item['id']}").status_code == 404
        # The same material fits in their tray too, and clearing theirs leaves this one alone.
        assert len(_put(client, {"material_id": aluminium.id}).json()["items"]) == 1
        client.delete("/api/tray")
    assert [i["id"] for i in client.get("/api/tray").json()["items"]] == [item["id"]]


def test_the_cap_is_refused_in_words_and_counts_only_what_is_new(client, db_session, monkeypatch):
    monkeypatch.setattr("app.services.tray_service.MAX_TRAY_ITEMS", 2)
    aluminium = _material(db_session, "%Alumínio%")
    _put(client, {"material_id": aluminium.id}, {"tool": "eco"})
    # Something already there does not count against the cap.
    assert _put(client, {"tool": "eco"}).status_code == 200
    full = _put(client, {"tool": "custo"})
    assert full.status_code == 409
    assert full.json()["detail"] == "A bandeja leva até 2 itens. Tire algum antes de pôr mais."
