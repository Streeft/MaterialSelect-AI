"""Integration tests for the material catalogue API."""

from __future__ import annotations


def test_health(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["app_name"]


def test_list_returns_five_demo_materials(client):
    resp = client.get("/api/materials")
    assert resp.status_code == 200
    materials = resp.json()
    assert len(materials) == 5
    assert all(m["is_demo"] is True for m in materials)
    names = {m["name"] for m in materials}
    assert "Aço Demo B" in names


def test_search_filters_by_name(client):
    resp = client.get("/api/materials", params={"search": "polímero"})
    assert resp.status_code == 200
    materials = resp.json()
    assert len(materials) == 1
    assert materials[0]["name"] == "Polímero Demo C"


def test_search_filters_by_keyword(client):
    resp = client.get("/api/materials", params={"search": "refratário"})
    assert resp.status_code == 200
    materials = resp.json()
    assert len(materials) == 1
    assert materials[0]["name"] == "Cerâmica Demo D"


def test_detail_groups_properties_by_category(client):
    listing = client.get("/api/materials").json()
    aluminio = next(m for m in listing if m["name"] == "Liga Alumínio Demo A")

    resp = client.get(f"/api/materials/{aluminio['id']}")
    assert resp.status_code == 200
    detail = resp.json()

    categories = [g["category"] for g in detail["property_groups"]]
    assert "FISICA" in categories
    assert "MECANICA" in categories

    # Density is stored in g/cm**3 but normalised to kg/m**3.
    fisica = next(g for g in detail["property_groups"] if g["category"] == "FISICA")
    densidade = next(p for p in fisica["properties"] if p["property_slug"] == "densidade")
    assert densidade["original_unit"] == "g/cm**3"
    assert densidade["canonical_unit"] == "kg/m**3"
    assert abs(densidade["normalized_value"] - 2700.0) < 1e-6


def test_missing_value_is_reported_as_missing_not_zero(client):
    listing = client.get("/api/materials").json()
    ceramica = next(m for m in listing if m["name"] == "Cerâmica Demo D")

    detail = client.get(f"/api/materials/{ceramica['id']}").json()
    all_props = [p for g in detail["property_groups"] for p in g["properties"]]
    cond = next(p for p in all_props if p["property_slug"] == "condutividade_termica")

    assert cond["is_missing"] is True
    assert cond["value_scalar"] is None
    assert cond["normalized_value"] is None  # never coerced to 0


def test_interval_property_exposes_min_max(client):
    listing = client.get("/api/materials").json()
    polimero = next(m for m in listing if m["name"] == "Polímero Demo C")

    detail = client.get(f"/api/materials/{polimero['id']}").json()
    all_props = [p for g in detail["property_groups"] for p in g["properties"]]
    esc = next(p for p in all_props if p["property_slug"] == "limite_escoamento")

    assert esc["is_interval"] is True
    assert esc["value_min"] == 40.0
    assert esc["value_max"] == 60.0
    assert esc["value_typical"] == 48.0


def test_detail_404_for_unknown_id(client):
    resp = client.get("/api/materials/999999")
    assert resp.status_code == 404


def test_chart_returns_points_for_two_properties(client):
    resp = client.get(
        "/api/materials/chart",
        params={"x": "densidade", "y": "modulo_young"},
    )
    assert resp.status_code == 200
    chart = resp.json()
    assert chart["x_unit"] == "kg/m**3"
    assert chart["y_unit"] == "Pa"
    # All five demo materials have both density and Young's modulus.
    assert len(chart["points"]) == 5
    for point in chart["points"]:
        assert point["x"] > 0
        assert point["y"] > 0


def test_chart_404_for_unknown_property(client):
    resp = client.get(
        "/api/materials/chart",
        params={"x": "densidade", "y": "nao_existe"},
    )
    assert resp.status_code == 404
