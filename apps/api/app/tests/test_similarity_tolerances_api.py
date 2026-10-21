"""Per-property tolerance in Find Similar, through the API (D-158)."""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.material import Material

BASIS = ["densidade", "modulo_young"]


def _first_material_id(db_session: Session) -> int:
    return db_session.execute(select(Material.id).order_by(Material.id)).scalars().first()


def _post(client: TestClient, material_id: int, **overrides: object):
    payload: dict[str, object] = {"property_slugs": BASIS}
    payload.update(overrides)
    return client.post(f"/api/materials/{material_id}/similares", json=payload)


def _messages(response) -> str:
    return " ".join(entry["msg"] for entry in response.json()["detail"])


def test_without_either_tolerance_the_answer_is_identical(
    client: TestClient, db_session: Session
) -> None:
    """An empty map asks the same question as no map at all."""
    material_id = _first_material_id(db_session)
    before = _post(client, material_id).json()
    with_empty = _post(client, material_id, tolerances={}).json()
    assert with_empty == before
    assert before["tolerance_bands"] == []
    assert "tolerances" not in before


def test_per_property_tolerance_overrides_the_global_one(
    client: TestClient, db_session: Session
) -> None:
    body = _post(
        client,
        _first_material_id(db_session),
        tolerance_pct=10,
        tolerances={"modulo_young": 40},
    ).json()

    assert body["tolerance_pct"] == 10
    bands = {band["slug"]: band for band in body["tolerance_bands"]}
    assert [band["slug"] for band in body["tolerance_bands"]] == BASIS
    assert bands["densidade"]["tolerance_pct"] == 10
    assert bands["modulo_young"]["tolerance_pct"] == 40
    for neighbour in body["neighbours"]:
        assert neighbour["tolerance_matches"] == len(neighbour["within_tolerance"])
        for slug in neighbour["within_tolerance"]:
            assert neighbour["contributions"][slug] == 0.0


def test_per_property_alone_bands_only_that_property(
    client: TestClient, db_session: Session
) -> None:
    body = _post(client, _first_material_id(db_session), tolerances={"densidade": 25}).json()

    # No global tolerance was asked, so none comes back.
    assert body["tolerance_pct"] is None
    assert [band["slug"] for band in body["tolerance_bands"]] == ["densidade"]
    assert body["tolerance_bands"][0]["tolerance_pct"] == 25
    for neighbour in body["neighbours"]:
        assert set(neighbour["within_tolerance"]) <= {"densidade"}
        assert neighbour["tolerance_matches"] is not None


def test_per_property_band_is_printed_in_the_reading_unit(
    client: TestClient, db_session: Session
) -> None:
    material_id = _first_material_id(db_session)
    path = f"/api/materials/{material_id}/similares"
    payload = {"property_slugs": ["densidade"], "tolerances": {"densidade": 10}}
    in_kg = client.post(f"{path}?unidades=densidade:kg/m**3", json=payload).json()
    in_g = client.post(f"{path}?unidades=densidade:g/cm**3", json=payload).json()

    kg_band = in_kg["tolerance_bands"][0]
    g_band = in_g["tolerance_bands"][0]
    assert abs(g_band["low"] * 1000 - kg_band["low"]) < 1e-6 * kg_band["low"]
    assert g_band["unit"] != kg_band["unit"]
    assert [n["within_tolerance"] for n in in_kg["neighbours"]] == [
        n["within_tolerance"] for n in in_g["neighbours"]
    ]


def test_a_slug_outside_the_basis_is_refused_in_plain_portuguese(
    client: TestClient, db_session: Session
) -> None:
    response = _post(client, _first_material_id(db_session), tolerances={"resistividade": 10})
    assert response.status_code == 422
    assert "Tolerância para propriedade fora da busca: resistividade" in _messages(response)


def test_an_invalid_value_is_refused_in_plain_portuguese(
    client: TestClient, db_session: Session
) -> None:
    material_id = _first_material_id(db_session)
    for value in (0, -3, 100.5, "muito", True, None):
        response = _post(client, material_id, tolerances={"densidade": value})
        assert response.status_code == 422, value
        assert "A tolerância de densidade precisa ser um número" in _messages(response)
    ok = _post(client, material_id, tolerances={"densidade": 100})
    assert ok.status_code == 200


def test_a_non_map_is_refused_in_plain_portuguese(client: TestClient, db_session: Session) -> None:
    response = _post(client, _first_material_id(db_session), tolerances=[10, 20])
    assert response.status_code == 422
    assert "propriedade: percentual" in _messages(response)
