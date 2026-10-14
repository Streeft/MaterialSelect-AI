"""The product-shaped Eco Audit over the real catalogue (D-121)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import PropertyCategory
from app.models.material import Material
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import Process
from app.models.property_definition import PropertyDefinition

MOBILE_USE = {
    "model": "movel",
    "distance_km": 200000.0,
    "mobile_intensity": 0.0025,
    "life_years": 12.0,
    "carbon_per_energy": 0.07,
}


def _material_id(db: Session, like: str) -> int:
    return (db.execute(select(Material).where(Material.name.like(like))).scalars().first()).id


def _process_id(db: Session, slug: str) -> int:
    return (db.execute(select(Process).where(Process.slug == slug)).scalars().one()).id


def _component(db: Session, **overrides):
    payload = {
        "material_id": _material_id(db, "%Alumínio%"),
        "process_id": _process_id(db, "fundicao-areia"),
        "unit_mass": 2.0,
        "quantity": 1,
        "recycled_fraction": 0.0,
        "end_of_life": "reciclagem",
    }
    payload.update(overrides)
    return payload


def _product(db: Session, components=None, legs=None):
    return {
        "components": components or [_component(db)],
        "transport_legs": legs or [{"mode": "rodoviario", "distance_km": 1500.0}],
        "use": MOBILE_USE,
    }


def _phase(body, name):
    return next(phase for phase in body["phases"] if phase["phase"] == name)


def _single(db: Session):
    return {
        "material_id": _material_id(db, "%Alumínio%"),
        "process_id": _process_id(db, "fundicao-areia"),
        "part_mass": 2.0,
        "transport_mode": "rodoviario",
        "transport_distance_km": 1500.0,
        "use": MOBILE_USE,
    }


def test_a_product_of_one_component_matches_the_single_part_shape(
    client: TestClient, db_session: Session
) -> None:
    product = client.post("/api/eco/auditar", json=_product(db_session)).json()
    single = client.post("/api/eco/auditar", json=_single(db_session)).json()
    assert product["total_energy"] == pytest.approx(single["total_energy"])
    assert product["material_name"] == single["material_name"]
    assert len(single["components"]) == 1 and len(single["transport_legs"]) == 1


def test_two_components_and_two_legs_sum_and_name_nothing_singular(
    client: TestClient, db_session: Session
) -> None:
    body = _product(
        db_session,
        components=[
            _component(db_session, name="Carcaça"),
            _component(db_session, name="Parafusos", unit_mass=0.01, quantity=8),
        ],
        legs=[
            {"mode": "maritimo", "distance_km": 8000.0},
            {"mode": "rodoviario", "distance_km": 300.0},
        ],
    )
    response = client.post("/api/eco/auditar", json=body)
    assert response.status_code == 200, response.text
    out = response.json()

    assert [c["name"] for c in out["components"]] == ["Carcaça", "Parafusos"]
    assert out["mass_in_part"] == pytest.approx(2.08)
    assert out["transport_distance_km"] == pytest.approx(8300.0)
    # Never the first item standing in for the whole product.
    assert out["material_id"] is None and out["transport_mode"] is None
    assert out["end_of_life"] is None
    material = _phase(out, "material")
    assert material["energy"] == pytest.approx(
        sum(c["phases"][0]["energy"] for c in out["components"])
    )
    transport = _phase(out, "transporte")
    assert transport["energy"] == pytest.approx(sum(leg["energy"] for leg in out["transport_legs"]))


def test_one_component_without_data_refuses_the_product_podium(
    client: TestClient, db_session: Session
) -> None:
    """The seeded ceramic has no recycling figure; on that route it blocks the podium."""
    ceramic = _component(
        db_session,
        name="Isolador",
        material_id=_material_id(db_session, "%Cerâmica%"),
        process_id=_process_id(db_session, "prensagem-sinterizacao"),
    )
    body = _product(db_session, components=[_component(db_session, name="Carcaça"), ceramic])
    out = client.post("/api/eco/auditar", json=body).json()

    end = _phase(out, "fim-de-vida")
    assert end["energy"] is None
    assert "Isolador" in end["energy_reason"]
    assert out["total_energy"] is None
    assert out["energy_dominance"]["phase"] is None
    assert out["energy_dominance"]["refusal"]


def test_a_new_route_is_unavailable_without_a_catalogued_factor(
    client: TestClient, db_session: Session
) -> None:
    body = _product(db_session, components=[_component(db_session, end_of_life="reuso")])
    out = client.post("/api/eco/auditar", json=body).json()
    end = _phase(out, "fim-de-vida")
    assert end["energy"] is None
    assert "energia_reuso" in end["energy_missing"]
    assert "indisponível" in end["energy_reason"]


def test_a_new_route_is_priced_once_the_catalogue_carries_the_factor(
    client: TestClient, db_session: Session
) -> None:
    """A curator or importer that registers ``energia_aterro`` opens the route."""
    material_id = _material_id(db_session, "%Alumínio%")
    for slug, value in (("energia_aterro", 0.2), ("co2_aterro", 0.01)):
        definition = PropertyDefinition(
            name=slug,
            slug=slug,
            category=PropertyCategory.AMBIENTAL,
            canonical_unit="MJ/kg" if slug.startswith("energia") else "dimensionless",
        )
        db_session.add(definition)
        db_session.flush()
        db_session.add(
            MaterialPropertyValue(
                material_id=material_id,
                property_id=definition.id,
                value_scalar=value,
                original_unit=definition.canonical_unit,
                normalized_value=value,
                canonical_unit=definition.canonical_unit,
                is_missing=False,
            )
        )
    db_session.flush()

    body = _product(db_session, components=[_component(db_session, end_of_life="aterro")])
    out = client.post("/api/eco/auditar", json=body).json()
    end = _phase(out, "fim-de-vida")
    assert end["energy"] == pytest.approx(2.0 * 0.2)
    assert end["carbon"] == pytest.approx(2.0 * 0.01)

    routes = {r["slug"]: r for r in client.get("/api/eco/rotas-fim-de-vida").json()}
    assert routes["aterro"]["materials_with_factor"] >= 1


def test_the_route_catalogue_lists_seven_in_order(client: TestClient) -> None:
    response = client.get("/api/eco/rotas-fim-de-vida")
    assert response.status_code == 200, response.text
    routes = response.json()
    assert [r["slug"] for r in routes] == [
        "aterro",
        "incineracao",
        "subciclagem",
        "reciclagem",
        "remanufatura",
        "reuso",
        "nenhum",
    ]
    by_slug = {r["slug"]: r for r in routes}
    assert by_slug["reciclagem"]["materials_with_factor"] > 0
    assert by_slug["reuso"]["materials_with_factor"] == 0
    assert by_slug["nenhum"]["energy_property"] is None


def test_mixing_the_two_shapes_is_refused(client: TestClient, db_session: Session) -> None:
    """A material_id next to a list would be a number the sum never held."""
    body = {**_product(db_session), "material_id": _material_id(db_session, "%Alumínio%")}
    assert client.post("/api/eco/auditar", json=body).status_code == 422
    body = {**_product(db_session), "transport_mode": "rodoviario"}
    assert client.post("/api/eco/auditar", json=body).status_code == 422


def test_an_empty_component_list_is_refused(client: TestClient, db_session: Session) -> None:
    body = {**_product(db_session), "components": []}
    assert client.post("/api/eco/auditar", json=body).status_code == 422


def test_an_unknown_mode_on_any_leg_is_a_404(client: TestClient, db_session: Session) -> None:
    body = _product(
        db_session,
        legs=[
            {"mode": "rodoviario", "distance_km": 10.0},
            {"mode": "teletransporte", "distance_km": 10.0},
        ],
    )
    assert client.post("/api/eco/auditar", json=body).status_code == 404


def test_a_zero_quantity_is_refused_by_the_schema(client: TestClient, db_session: Session) -> None:
    body = _product(db_session, components=[_component(db_session, quantity=0)])
    assert client.post("/api/eco/auditar", json=body).status_code == 422
