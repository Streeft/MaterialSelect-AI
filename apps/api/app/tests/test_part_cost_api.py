"""The Part Cost Estimator over the real catalogue, through the API (P3)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import MaterialProcess, Process
from app.models.property_definition import PropertyDefinition
from app.models.user import User


def _aluminium_id(db_session: Session) -> int:
    """A seeded material that carries cost per mass and shaping processes."""
    return (
        db_session.execute(select(Material.id).where(Material.name.like("%Alumínio%")))
        .scalars()
        .first()
    )


def _estimate(client: TestClient, material_id: int, **overrides):
    payload = {
        "material_id": material_id,
        "part_mass": 2.0,
        "batch_size": 1000.0,
        "write_off_years": 5.0,
        "load_factor": 0.5,
        **overrides,
    }
    return client.post("/api/custo/estimar", json=payload)


def test_cost_estimator_returns_200_for_seeded_aluminium(
    client: TestClient, db_session: Session
) -> None:
    material_id = _aluminium_id(db_session)
    assert material_id is not None, "Seed data missing aluminium with cost and processes"

    response = _estimate(client, material_id)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["material_id"] == material_id
    assert body["costed"], "Aluminium has shaping processes; at least one should be costed"
    first = body["costed"][0]
    assert first["rank"] == 1
    terms = first["terms"]
    assert terms["total"] == pytest.approx(
        terms["material"] + terms["tooling"] + terms["overhead"] + terms["capital"]
    )
    # The note naming the currency absence must be returned verbatim.
    assert "unidade monetária não especificada" in body["monetary_unit_note"]


def test_cost_estimator_ranks_cheapest_process_first(
    client: TestClient, db_session: Session
) -> None:
    material_id = _aluminium_id(db_session)
    response = _estimate(client, material_id)
    assert response.status_code == 200

    costed = response.json()["costed"]
    totals = [item["terms"]["total"] for item in costed]
    assert totals == sorted(totals), "Processes must arrive sorted by ascending total cost"
    assert [item["rank"] for item in costed] == list(range(1, len(costed) + 1))


def test_a_bigger_batch_never_raises_any_total(client: TestClient, db_session: Session) -> None:
    """Only the tooling term moves, and it moves down. Nothing else may drift."""
    material_id = _aluminium_id(db_session)
    small = {
        i["process_slug"]: i["terms"]
        for i in _estimate(client, material_id, batch_size=10).json()["costed"]
    }
    large = {
        i["process_slug"]: i["terms"]
        for i in _estimate(client, material_id, batch_size=100_000).json()["costed"]
    }

    assert small and small.keys() == large.keys()
    for slug, terms in small.items():
        assert large[slug]["total"] <= terms["total"]
        assert large[slug]["material"] == terms["material"]
        assert large[slug]["overhead"] == terms["overhead"]
        assert large[slug]["capital"] == terms["capital"]


def test_the_batch_can_reorder_the_answer(client: TestClient, db_session: Session) -> None:
    """The crossover is what the estimator — and its curve — exist to show.

    A tooling-heavy, fast process loses at ten parts and wins at a hundred
    thousand. If the ranking never changed with the batch, the curve the D-96
    chart draws would have nothing to show.
    """
    material_id = _aluminium_id(db_session)
    few = [i["process_slug"] for i in _estimate(client, material_id, batch_size=1).json()["costed"]]
    many = [
        i["process_slug"]
        for i in _estimate(client, material_id, batch_size=1_000_000).json()["costed"]
    ]

    assert few != many, "nenhum cruzamento: o lote não reordenou nada"


def test_cost_estimator_excludes_processes_with_missing_attributes(
    client: TestClient, db_session: Session
) -> None:
    material_id = _aluminium_id(db_session)
    response = _estimate(client, material_id)
    assert response.status_code == 200

    uncosted = response.json()["uncosted"]
    for item in uncosted:
        assert item["reason"], "Every uncosted process must carry a written reason (D-24)"
        # The reason names the missing attributes in pt-BR.
        assert "Sem dado econômico" in item["reason"] or item["missing_labels"]


def test_cost_estimator_refuses_material_without_cost_per_mass(
    client: TestClient, db_session: Session
) -> None:
    """Find or make a material that has no custo_massa, and check it 400s."""
    cost_definition = (
        db_session.execute(
            select(PropertyDefinition.id).where(PropertyDefinition.slug == "custo_massa")
        )
        .scalars()
        .first()
    )
    materials_with_cost = select(MaterialPropertyValue.material_id).where(
        MaterialPropertyValue.property_id == cost_definition,
        MaterialPropertyValue.is_missing.is_(False),
        MaterialPropertyValue.normalized_value.is_not(None),
    )
    material_without_cost = (
        db_session.execute(
            select(Material.id).where(Material.id.not_in(materials_with_cost)).limit(1)
        )
        .scalars()
        .first()
    )
    if material_without_cost is None:
        pytest.skip("Every seeded material has cost per mass")

    response = _estimate(client, material_without_cost)

    assert response.status_code == 400
    assert "custo por massa" in response.text


def test_cost_estimator_validates_batch_size_and_mass(
    client: TestClient, db_session: Session
) -> None:
    material_id = _aluminium_id(db_session)

    assert _estimate(client, material_id, part_mass=0).status_code == 422
    assert _estimate(client, material_id, part_mass=-1).status_code == 422
    assert _estimate(client, material_id, batch_size=0).status_code == 422
    assert _estimate(client, material_id, write_off_years=0).status_code == 422
    assert _estimate(client, material_id, load_factor=0).status_code == 422
    assert _estimate(client, material_id, load_factor=1.5).status_code == 422


def test_an_unknown_material_is_a_404(client: TestClient) -> None:
    assert _estimate(client, 999_999).status_code == 404


def _own_material(db_session: Session, user: User, name: str) -> Material:
    metal_class = db_session.execute(select(MaterialClass).limit(1)).scalars().one()
    material = Material(
        name=name,
        class_id=metal_class.id,
        owner_id=user.id,
        is_active=True,
    )
    db_session.add(material)
    db_session.flush()

    definition = (
        db_session.execute(
            select(PropertyDefinition).where(PropertyDefinition.slug == "custo_massa")
        )
        .scalars()
        .one()
    )
    db_session.add(
        MaterialPropertyValue(
            material_id=material.id,
            property_id=definition.id,
            value_scalar=10.0,
            original_unit="dimensionless",
            normalized_value=10.0,
            canonical_unit="dimensionless",
            is_missing=False,
        )
    )
    process = db_session.execute(select(Process).limit(1)).scalars().one()
    db_session.add(MaterialProcess(material_id=material.id, process_id=process.id))
    db_session.flush()
    return material


def test_my_own_record_can_be_costed_by_me(
    client: TestClient, db_session: Session, test_user: User
) -> None:
    """The positive control D-62 taught us not to omit."""
    material = _own_material(db_session, test_user, "Liga propria de custo")

    response = _estimate(client, material.id)

    assert response.status_code == 200, response.text
    assert response.json()["material_name"] == material.name


def test_someone_elses_record_is_a_404_not_an_estimate(
    client: TestClient, db_session: Session, other_user: User
) -> None:
    material = _own_material(db_session, other_user, "Superliga alheia de custo")

    response = _estimate(client, material.id)

    assert response.status_code == 404
    assert material.name not in response.text


def test_part_cost_returns_curve_points_for_costed_processes(
    client: TestClient, db_session: Session
) -> None:
    material_id = _aluminium_id(db_session)
    response = _estimate(client, material_id, batch_size=1000.0)
    assert response.status_code == 200, response.text
    costed = response.json()["costed"]
    assert len(costed) > 0
    first = costed[0]
    assert "curve" in first
    assert len(first["curve"]) > 5
    # The curve contains the requested batch size point
    points_at_batch = [p for p in first["curve"] if p["batch_size"] == 1000.0]
    assert len(points_at_batch) == 1
    assert points_at_batch[0]["cost"] == pytest.approx(first["terms"]["total"])
    # Batch size starts at 1
    assert first["curve"][0]["batch_size"] == 1.0
    # Cost is monotonically non-increasing
    for i in range(len(first["curve"]) - 1):
        assert first["curve"][i]["cost"] >= first["curve"][i + 1]["cost"]
