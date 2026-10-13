"""The official-record guard (TM7-b, D-116): every material write route refuses it.

``test_every_material_write_route_is_covered`` enumerates the write routes the
application mounts under ``/api/materials/{material_id}`` and fails when one is
missing from ``PROBES``: a new write route has to be added here, and the probe
proves it answers 409 for a record of the licensed official catalogue. Same idea
as the isolation canary: the rule is protected from the next route, not just from
the routes that exist today.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import select

from app.main import app
from app.models.catalog import CatalogDataset, CatalogRecordRef
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.services.record_permissions import OFFICIAL_READ_ONLY

PREFIX = "/api/materials/{material_id}"
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

CURVE = {
    "kind": "TENSAO_DEFORMACAO",
    "title": "Curva de teste",
    "x_quantity": "deformacao",
    "x_unit": "%",
    "y_quantity": "tensao",
    "y_unit": "MPa",
    "source_label": "Folha X",
    "series": [{"points": [{"x": 0, "y": 0}, {"x": 1, "y": 100}]}],
}

# (method, path template) -> JSON body. Routes that cannot change a material are
# EXEMPT with the reason; everything else must answer 409 for an official record.
PROBES: dict[tuple[str, str], object] = {
    ("PATCH", PREFIX): {"description": "ajuste"},
    ("PUT", PREFIX + "/values"): [],
    ("PUT", PREFIX + "/composicao"): {"entries": []},
    ("PUT", PREFIX + "/designacoes"): {"designations": []},
    ("DELETE", PREFIX): None,
    ("POST", PREFIX + "/curvas"): CURVE,
    ("PUT", PREFIX + "/curvas/{curve_id}"): CURVE,
    ("DELETE", PREFIX + "/curvas/{curve_id}"): None,
}
EXEMPT = {
    ("POST", PREFIX + "/similares"): "ranking read; the POST carries the basis, writes nothing",
}


def _write_routes() -> set[tuple[str, str]]:
    """Method and path of every write operation the app documents under a material."""
    found: set[tuple[str, str]] = set()
    for path, operations in app.openapi()["paths"].items():
        if not path.startswith(PREFIX):
            continue
        for method in operations:
            if method.upper() in WRITE_METHODS:
                found.add((method.upper(), path))
    return found


def _official(db_session) -> int:
    mid = db_session.execute(select(Material.id).where(Material.name == "Aço Demo B")).scalar_one()
    dataset = CatalogDataset(
        slug="oficial-guarda",
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
            material_id=mid,
        )
    )
    db_session.commit()
    return mid


def test_every_material_write_route_is_covered() -> None:
    found = _write_routes()
    known = set(PROBES) | set(EXEMPT)
    assert found - known == set(), (
        "Rota de escrita de material sem teste da guarda do catálogo oficial: "
        f"{sorted(found - known)}. Passe-a por ensure_identity_writable e inclua em PROBES."
    )
    assert known - found == set(), f"PROBES/EXEMPT obsoletos: {sorted(known - found)}"


@pytest.mark.parametrize(("method", "template"), sorted(PROBES))
def test_official_material_refuses_the_write(client, db_session, method, template) -> None:
    mid = _official(db_session)
    path = template.format(material_id=mid, curve_id=1)
    body = PROBES[(method, template)]
    response = (
        client.request(method, path, json=body)
        if body is not None
        else client.request(method, path)
    )
    assert response.status_code == 409, response.text
    assert response.json()["detail"] == OFFICIAL_READ_ONLY
    assert "cópia própria" in OFFICIAL_READ_ONLY


def test_refused_write_leaves_the_record_untouched(client, db_session) -> None:
    mid = _official(db_session)
    before = client.get(f"/api/materials/{mid}").json()
    client.patch(f"/api/materials/{mid}", json={"name": "Adulterado"})
    client.put(f"/api/materials/{mid}/values", json=[])
    client.delete(f"/api/materials/{mid}")
    after = client.get(f"/api/materials/{mid}").json()
    assert after == before
    assert after["is_active"] is True


def test_own_copy_is_writable_and_not_official(client, db_session) -> None:
    mid = _official(db_session)
    class_id = db_session.execute(
        select(MaterialClass.id).where(MaterialClass.slug == "metais")
    ).scalar_one()
    copy = client.post(
        "/api/materials",
        json={
            "name": "Aço Demo B (cópia)",
            "class_id": class_id,
            "values": [],
            "is_own_record": True,
        },
    )
    assert copy.status_code == 201, copy.text
    cid = copy.json()["id"]
    assert cid != mid
    assert copy.json()["is_official"] is False
    assert (
        db_session.execute(
            select(CatalogRecordRef.id).where(CatalogRecordRef.material_id == cid)
        ).first()
        is None
    )
    assert (
        client.patch(f"/api/materials/{cid}", json={"description": "ajustada"}).status_code == 200
    )
    assert client.put(f"/api/materials/{cid}/values", json=[]).status_code == 200
