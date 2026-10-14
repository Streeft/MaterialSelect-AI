"""Duplicating one of the reader's own records as an editable copy (D-122).

What matters is what the copy *keeps* (every stored column, so the unit trail
and the absence survive), what it *marks* (where it came from) and what it
*refuses* (anything that is not the reader's own).
"""

from __future__ import annotations

import pytest
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.enums import DesignationSystem
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_designation import MaterialDesignation
from app.models.material_property_value import MaterialPropertyValue
from app.models.source import Source
from app.models.user import User


def _class_id(db: Session) -> int:
    return (
        db.execute(select(MaterialClass).where(MaterialClass.slug == "metais")).scalars().one().id
    )


def _own_record(client, db: Session, name: str = "Liga do Bruno") -> dict:
    response = client.post(
        "/api/materials",
        json={
            "name": name,
            "class_id": _class_id(db),
            "description": "Minha liga",
            "keywords": ["liga", "teste"],
            "is_own_record": True,
            "is_demo": False,
            "values": [
                {
                    "property_slug": "densidade",
                    "kind": "scalar",
                    "value": 7.8,
                    "unit": "g/cm**3",
                    "source_label": "Ensaio próprio",
                    "data_quality": "MEDIDO",
                    "notes": "medido em bancada",
                },
                {"property_slug": "modulo_young", "kind": "missing"},
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _add_identity(db: Session, material_id: int) -> None:
    source = db.execute(select(Source)).scalars().first()
    db.add(
        MaterialDesignation(
            material_id=material_id,
            system=DesignationSystem.UNS,
            code="S30400",
            source_id=source.id,
        )
    )
    db.flush()
    db.execute(
        text(
            "INSERT INTO material_composition (material_id, element, position, is_balance, "
            "is_missing, normalized_max, source_id, data_quality, is_demo, created_at) "
            "VALUES (:m, 'Cr', 0, 0, 0, 20.0, :s, 'IMPORTADO', 0, '2026-10-07')"
        ),
        {"m": material_id, "s": source.id},
    )


def _values(db: Session, material_id: int) -> dict[str, MaterialPropertyValue]:
    rows = (
        db.execute(
            select(MaterialPropertyValue).where(MaterialPropertyValue.material_id == material_id)
        )
        .scalars()
        .all()
    )
    return {r.property_definition.slug: r for r in rows}


def test_the_copy_keeps_every_stored_column_and_marks_its_origin(client, db_session):
    original = _own_record(client, db_session)
    _add_identity(db_session, original["id"])

    response = client.post(f"/api/materials/{original['id']}/duplicar")
    assert response.status_code == 201, response.text
    copy = response.json()

    assert copy["id"] != original["id"]
    assert copy["name"] == "Liga do Bruno (cópia)"
    assert copy["is_own_record"] is True
    assert copy["copied_from"] == {"id": original["id"], "name": "Liga do Bruno"}
    assert copy["description"] == "Minha liga"
    assert copy["keywords"] == ["liga", "teste"]
    assert [d["code"] for d in copy["designations"]] == ["S30400"]
    assert [e["element"] for e in copy["composition"]] == ["Cr"]

    before = _values(db_session, original["id"])
    after = _values(db_session, copy["id"])
    assert set(before) == set(after) == {"densidade", "modulo_young"}
    d0, d1 = before["densidade"], after["densidade"]
    for column in (
        "value_scalar",
        "original_unit",
        "normalized_value",
        "canonical_unit",
        "conversion_method",
        "data_quality",
        "source_id",
        "notes",
    ):
        assert getattr(d1, column) == getattr(d0, column), column
    assert d1.original_unit == "g/cm**3" and d1.value_scalar == 7.8
    # absence stays absence: no zero, no number of any kind
    missing = after["modulo_young"]
    assert missing.is_missing is True
    assert missing.value_scalar is None and missing.normalized_value is None


def test_the_original_is_untouched_and_the_copy_is_editable(client, db_session):
    original = _own_record(client, db_session)
    copy = client.post(f"/api/materials/{original['id']}/duplicar").json()

    patched = client.patch(f"/api/materials/{copy['id']}", json={"description": "Alterada"})
    assert patched.status_code == 200
    assert patched.json()["description"] == "Alterada"
    assert client.get(f"/api/materials/{original['id']}").json()["description"] == "Minha liga"
    assert client.get(f"/api/materials/{original['id']}").json()["copied_from"] is None


def test_copies_of_copies_get_distinct_names(client, db_session):
    original = _own_record(client, db_session)
    first = client.post(f"/api/materials/{original['id']}/duplicar").json()
    second = client.post(f"/api/materials/{original['id']}/duplicar").json()
    third = client.post(f"/api/materials/{first['id']}/duplicar").json()
    assert [first["name"], second["name"], third["name"]] == [
        "Liga do Bruno (cópia)",
        "Liga do Bruno (cópia 2)",
        "Liga do Bruno (cópia) (cópia)",
    ]
    assert third["copied_from"]["id"] == first["id"]


def test_the_shared_catalogue_is_not_duplicable(client, db_session):
    shared = (
        db_session.execute(select(Material).where(Material.owner_id.is_(None))).scalars().first()
    )
    response = client.post(f"/api/materials/{shared.id}/duplicar")
    assert response.status_code == 400
    assert "registro próprio" in response.json()["detail"]
    assert (
        db_session.execute(select(Material).where(Material.copied_from_id.is_not(None))).first()
        is None
    )


def test_nobody_duplicates_another_users_record(client, db_session, other_user: User, login_as):
    original = _own_record(client, db_session)
    with login_as(other_user):
        assert client.post(f"/api/materials/{original['id']}/duplicar").status_code == 404
    assert (
        db_session.execute(select(Material).where(Material.copied_from_id.is_not(None))).first()
        is None
    )


def test_a_withdrawn_record_is_not_duplicable(client, db_session):
    original = _own_record(client, db_session)
    client.delete(f"/api/materials/{original['id']}")
    assert client.post(f"/api/materials/{original['id']}/duplicar").status_code == 404


def test_the_copy_is_invisible_to_other_users(client, db_session, other_user: User, login_as):
    original = _own_record(client, db_session)
    copy = client.post(f"/api/materials/{original['id']}/duplicar").json()
    with login_as(other_user):
        assert client.get(f"/api/materials/{copy['id']}").status_code == 404
        names = [m["name"] for m in client.get("/api/materials").json()]
    assert "Liga do Bruno (cópia)" not in names


def test_a_synthesised_record_is_refused(client, db_session, test_user: User):
    material = Material(
        name="Compósito sintetizado",
        class_id=_class_id(db_session),
        keywords=[],
        is_demo=False,
        owner_id=test_user.id,
        is_synthesized=True,
    )
    db_session.add(material)
    db_session.flush()
    response = client.post(f"/api/materials/{material.id}/duplicar")
    assert response.status_code == 400
    assert "Sintetizador" in response.json()["detail"]


@pytest.mark.parametrize("path", ["/api/materials/1/duplicar"])
def test_duplicating_requires_login(anon_client, path):
    assert anon_client.post(path).status_code == 401


def test_the_copy_does_not_need_catalogue_edit_rights(client_without_subscription):
    # No subscription -> the gate refuses before the route runs.
    assert client_without_subscription.post("/api/materials/1/duplicar").status_code in (401, 403)


def test_an_official_record_is_not_duplicated_by_this_route(client, db_session):
    from datetime import UTC, datetime

    from app.models.catalog import CatalogDataset, CatalogRecordRef

    shared = (
        db_session.execute(select(Material).where(Material.owner_id.is_(None))).scalars().first()
    )
    dataset = CatalogDataset(
        slug="oficial-duplicar",
        name="Oficial",
        source_sha256="0" * 64,
        license_label="Licença de teste",
        created_at=datetime.now(UTC),
    )
    db_session.add(dataset)
    db_session.flush()
    db_session.add(
        CatalogRecordRef(
            dataset_id=dataset.id,
            external_table="t",
            external_record_id="1",
            raw_record_sha256="0" * 64,
            material_id=shared.id,
        )
    )
    db_session.commit()
    response = client.post(f"/api/materials/{shared.id}/duplicar")
    assert response.status_code == 400
    assert (
        db_session.execute(select(Material).where(Material.copied_from_id.is_not(None))).first()
        is None
    )
