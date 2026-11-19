"""Projects with parts over the real catalogue (D-257)."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations.assembly import MATERIAL_GONE, NO_MASS, NO_MATERIAL
from app.models.material import Material
from app.services.assembly_service import MAX_ASSEMBLIES, MAX_PARTS

STUDY = {
    "name": "Tampo leve e rígido",
    "constraints": [
        {"operator": "lte", "property_slug": "densidade", "value": 5, "unit": "g/cm**3"}
    ],
}


def _material(db: Session, like: str) -> Material:
    return db.execute(select(Material).where(Material.name.like(like))).scalars().first()


def _assembly(client, name: str = "Mesa de jantar") -> dict:
    resp = client.post("/api/assemblies", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()


def _part(client, assembly_id: int, **body) -> dict:
    payload = {"name": "Tampo"}
    payload.update(body)
    resp = client.post(f"/api/assemblies/{assembly_id}/parts", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_a_new_project_has_no_parts_and_no_totals(client):
    body = _assembly(client)
    assert body["parts"] == []
    assert (body["part_count"], body["chosen_count"]) == (0, 0)
    for total in body["totals"].values():
        assert total["value"] is None
        assert total["missing_parts"] == []
    assert body["totals"]["mass"]["unit"] == "kg"
    assert body["totals"]["carbon"]["unit"] == "kg de CO₂"
    assert "fase de material" in body["scope_note"]
    assert "sem declarar moeda" in body["monetary_unit_note"]


def test_a_part_is_summed_from_the_catalogue(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    project = _assembly(client)
    body = _part(
        client,
        project["id"],
        name="Perna",
        role="estrutural",
        quantity=4,
        unit_mass=1.5,
        material_id=aluminium.id,
    )
    part = body["parts"][0]
    assert part["material"] == {
        "id": aluminium.id,
        "name": aluminium.name,
        "class_name": aluminium.material_class.name,
    }
    assert part["material_unavailable"] is False
    # 4 × 1.5 kg = 6 kg; the demo aluminium carries 3.5 / kg, 210 MJ/kg and 12.5 kg CO₂/kg.
    assert part["mass"]["value"] == pytest.approx(6.0)
    assert part["material_cost"]["value"] == pytest.approx(21.0)
    assert part["embodied_energy"]["value"] == pytest.approx(1260.0)
    assert part["carbon"]["value"] == pytest.approx(75.0)
    assert part["embodied_energy"]["quality"] in {"MEDIDO", "IMPORTADO", "ESTIMADO"}
    assert body["totals"]["embodied_energy"]["value"] == pytest.approx(1260.0)
    assert (body["part_count"], body["chosen_count"]) == (1, 1)


def test_absence_is_a_reason_and_the_total_is_refused(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    steel = _material(db_session, "Aço%")
    project = _assembly(client)
    _part(client, project["id"], name="Tampo", unit_mass=10.0, material_id=aluminium.id)
    _part(
        client,
        project["id"],
        name="Prego",
        role="fixacao",
        quantity=40,
        unit_mass=0.005,
        material_id=steel.id,
    )
    _part(client, project["id"], name="Verniz", role="acabamento", unit_mass=0.3)
    body = _part(client, project["id"], name="Travessa", material_id=aluminium.id)

    by_name = {part["name"]: part for part in body["parts"]}
    # The demo steel has no cost per mass: the figure is absent, with the material named.
    assert by_name["Prego"]["material_cost"]["value"] is None
    assert steel.name in by_name["Prego"]["material_cost"]["reason"]
    assert by_name["Prego"]["embodied_energy"]["value"] == pytest.approx(0.2 * 32.0)
    assert by_name["Verniz"]["mass"]["value"] == pytest.approx(0.3)
    assert by_name["Verniz"]["carbon"] == {"value": None, "reason": NO_MATERIAL, "quality": None}
    assert by_name["Travessa"]["mass"] == {"value": None, "reason": NO_MASS, "quality": None}

    totals = body["totals"]
    assert totals["mass"]["value"] is None
    assert totals["mass"]["missing_parts"] == ["Travessa"]
    assert totals["mass"]["known_sum"] == pytest.approx(10.0 + 0.2 + 0.3)
    assert totals["material_cost"]["missing_parts"] == ["Prego", "Verniz", "Travessa"]
    assert totals["material_cost"]["known_sum"] == pytest.approx(35.0)
    assert totals["material_cost"]["known_parts"] == 1
    assert (body["part_count"], body["chosen_count"]) == (4, 3)


def test_patch_changes_only_what_is_sent_and_null_clears(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    project = _assembly(client)
    part = _part(client, project["id"], unit_mass=2.0, material_id=aluminium.id, notes="  lixar ")[
        "parts"
    ][0]
    assert part["notes"] == "lixar"
    url = f"/api/assemblies/{project['id']}/parts/{part['id']}"

    renamed = client.patch(url, json={"name": "Tampo de 2 m", "quantity": 2}).json()["parts"][0]
    assert (renamed["name"], renamed["quantity"]) == ("Tampo de 2 m", 2)
    assert renamed["material"]["id"] == aluminium.id
    assert renamed["mass"]["value"] == pytest.approx(4.0)

    cleared = client.patch(url, json={"material_id": None, "unit_mass": None}).json()["parts"][0]
    assert cleared["material"] is None
    assert cleared["material_unavailable"] is False
    assert cleared["unit_mass"] is None
    assert cleared["mass"]["reason"] == NO_MASS

    assert client.patch(url, json={"name": None}).status_code == 400
    assert client.patch(url, json={"quantity": 0}).status_code == 422
    assert client.patch(url, json={"unit_mass": -1}).status_code == 422
    assert client.patch(url, json={"massa": 3}).status_code == 422


def test_a_part_links_to_a_study_of_the_reader(client):
    study = client.post("/api/selection/studies", json=STUDY).json()
    project = _assembly(client)
    body = _part(client, project["id"], study_id=study["id"])
    assert body["parts"][0]["study"] == {"id": study["id"], "name": STUDY["name"]}

    assert (
        client.post(
            f"/api/assemblies/{project['id']}/parts", json={"name": "Perna", "study_id": 999_999}
        ).status_code
        == 404
    )


def test_a_material_that_does_not_exist_is_refused(client):
    project = _assembly(client)
    resp = client.post(
        f"/api/assemblies/{project['id']}/parts", json={"name": "Tampo", "material_id": 999_999}
    )
    assert resp.status_code == 404


def test_a_material_removed_after_the_choice_is_said_in_words(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    project = _assembly(client)
    _part(client, project["id"], unit_mass=2.0, material_id=aluminium.id)
    aluminium.is_active = False
    db_session.commit()

    part = client.get(f"/api/assemblies/{project['id']}").json()["parts"][0]
    assert part["material"] is None
    assert part["material_unavailable"] is True
    assert part["mass"]["value"] == pytest.approx(2.0)
    assert part["material_cost"]["reason"] == MATERIAL_GONE


def test_rename_describe_list_and_delete(client):
    first = _assembly(client, "Mesa")
    _assembly(client, "Cadeira")
    _part(client, first["id"], name="Tampo")

    assert client.post("/api/assemblies", json={"name": " mesa "}).status_code == 409
    assert client.post("/api/assemblies", json={"name": "   "}).status_code == 422

    patched = client.patch(
        f"/api/assemblies/{first['id']}", json={"name": "Mesa de centro", "description": " baixa "}
    ).json()
    assert (patched["name"], patched["description"]) == ("Mesa de centro", "baixa")
    assert (
        client.patch(f"/api/assemblies/{first['id']}", json={"name": "Cadeira"}).status_code == 409
    )
    assert (
        client.patch(f"/api/assemblies/{first['id']}", json={"description": None}).json()[
            "description"
        ]
        is None
    )

    listing = client.get("/api/assemblies").json()
    # Most recently changed first, with how far along each one is.
    assert [item["name"] for item in listing] == ["Mesa de centro", "Cadeira"]
    assert (listing[0]["part_count"], listing[0]["chosen_count"]) == (1, 0)

    assert client.delete(f"/api/assemblies/{first['id']}").status_code == 204
    assert client.get(f"/api/assemblies/{first['id']}").status_code == 404
    assert [item["name"] for item in client.get("/api/assemblies").json()] == ["Cadeira"]


def test_deleting_a_part_redoes_the_sums(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    project = _assembly(client)
    _part(client, project["id"], name="Tampo", unit_mass=10.0, material_id=aluminium.id)
    body = _part(client, project["id"], name="Perna", quantity=4)
    assert body["totals"]["mass"]["value"] is None
    leg = next(part for part in body["parts"] if part["name"] == "Perna")

    after = client.delete(f"/api/assemblies/{project['id']}/parts/{leg['id']}")
    assert after.status_code == 200
    assert [part["name"] for part in after.json()["parts"]] == ["Tampo"]
    assert after.json()["totals"]["mass"]["value"] == pytest.approx(10.0)
    assert client.delete(f"/api/assemblies/{project['id']}/parts/{leg['id']}").status_code == 404


def test_another_reader_cannot_see_or_touch_a_project(client, other_user, login_as):
    study = client.post("/api/selection/studies", json=STUDY).json()
    project = _assembly(client)
    part = _part(client, project["id"])["parts"][0]
    with login_as(other_user):
        assert client.get("/api/assemblies").json() == []
        assert client.get(f"/api/assemblies/{project['id']}").status_code == 404
        assert (
            client.patch(f"/api/assemblies/{project['id']}", json={"name": "x"}).status_code == 404
        )
        assert client.delete(f"/api/assemblies/{project['id']}").status_code == 404
        assert (
            client.post(f"/api/assemblies/{project['id']}/parts", json={"name": "x"}).status_code
            == 404
        )
        assert (
            client.patch(
                f"/api/assemblies/{project['id']}/parts/{part['id']}", json={"name": "x"}
            ).status_code
            == 404
        )
        # Their own project cannot point at this reader's study either.
        theirs = _assembly(client, "Estante")
        assert (
            client.post(
                f"/api/assemblies/{theirs['id']}/parts",
                json={"name": "Prateleira", "study_id": study["id"]},
            ).status_code
            == 404
        )
        # The same name is free in another account.
        assert client.post("/api/assemblies", json={"name": "Mesa de jantar"}).status_code == 201
    assert client.get(f"/api/assemblies/{project['id']}").status_code == 200


def test_the_caps_are_refused_in_words(client, monkeypatch):
    monkeypatch.setattr("app.services.assembly_service.MAX_PARTS", 2)
    monkeypatch.setattr("app.services.assembly_service.MAX_ASSEMBLIES", 2)
    assert (MAX_PARTS, MAX_ASSEMBLIES) == (60, 50)
    project = _assembly(client, "Um")
    _part(client, project["id"], name="A")
    _part(client, project["id"], name="B")
    full = client.post(f"/api/assemblies/{project['id']}/parts", json={"name": "C"})
    assert full.status_code == 409
    assert "Limite de 2 peças" in full.json()["detail"]

    _assembly(client, "Dois")
    assert client.post("/api/assemblies", json={"name": "Três"}).status_code == 409


def test_parts_keep_the_order_they_were_added_in_and_can_be_moved(client):
    project = _assembly(client)
    _part(client, project["id"], name="Tampo")
    _part(client, project["id"], name="Perna")
    body = _part(client, project["id"], name="Prego")
    assert [part["name"] for part in body["parts"]] == ["Tampo", "Perna", "Prego"]

    nail = body["parts"][2]
    moved = client.patch(
        f"/api/assemblies/{project['id']}/parts/{nail['id']}", json={"position": 0}
    ).json()
    # Ties on position fall back to creation order: the top was first at 0.
    assert [part["name"] for part in moved["parts"]] == ["Tampo", "Prego", "Perna"]


def test_a_process_study_cannot_decide_a_part(client):
    study = client.post(
        "/api/selection/studies", json={"name": "Como fabricar", "universe": "process"}
    )
    assert study.status_code == 201, study.text
    project = _assembly(client)
    resp = client.post(
        f"/api/assemblies/{project['id']}/parts",
        json={"name": "Tampo", "study_id": study.json()["id"]},
    )
    assert resp.status_code == 400
    assert "estudo de materiais" in resp.json()["detail"]
