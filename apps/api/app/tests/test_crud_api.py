"""Integration tests for the Phase 2 CRUD endpoints (materials, classes, properties)."""

from __future__ import annotations


def _metais_class_id(client) -> int:
    classes = client.get("/api/classes").json()
    return next(c for c in classes if c["slug"] == "metais")["id"]


# --- Classes --------------------------------------------------------------

def test_list_classes_has_counts(client):
    resp = client.get("/api/classes")
    assert resp.status_code == 200
    classes = resp.json()
    metais = next(c for c in classes if c["slug"] == "metais")
    # Two demo metals (Alumínio, Aço) reference the "Metais" class.
    assert metais["material_count"] == 2


def test_create_class_derives_slug(client):
    resp = client.post("/api/classes", json={"name": "Vidros Demo"})
    assert resp.status_code == 201
    body = resp.json()
    assert body["slug"] == "vidros-demo"
    assert body["material_count"] == 0


def test_create_class_duplicate_slug_conflicts(client):
    resp = client.post("/api/classes", json={"name": "Metais"})
    assert resp.status_code == 409


def test_delete_class_in_use_conflicts(client):
    class_id = _metais_class_id(client)
    resp = client.delete(f"/api/classes/{class_id}")
    assert resp.status_code == 409


def test_delete_unused_class_succeeds(client):
    created = client.post("/api/classes", json={"name": "Temporária Demo"}).json()
    resp = client.delete(f"/api/classes/{created['id']}")
    assert resp.status_code == 204
    remaining = [c["id"] for c in client.get("/api/classes").json()]
    assert created["id"] not in remaining


def test_class_cycle_is_rejected(client):
    a = client.post("/api/classes", json={"name": "Classe A Demo"}).json()
    b = client.post(
        "/api/classes", json={"name": "Classe B Demo", "parent_id": a["id"]}
    ).json()
    # Making A a child of B would create a cycle (B is already a child of A).
    resp = client.put(
        f"/api/classes/{a['id']}", json={"name": "Classe A Demo", "parent_id": b["id"]}
    )
    assert resp.status_code == 400


def test_class_cannot_be_its_own_parent(client):
    a = client.post("/api/classes", json={"name": "Classe Solo Demo"}).json()
    resp = client.put(
        f"/api/classes/{a['id']}", json={"name": "Classe Solo Demo", "parent_id": a["id"]}
    )
    assert resp.status_code == 400


# --- Properties -----------------------------------------------------------

def test_list_properties_has_counts(client):
    resp = client.get("/api/properties")
    assert resp.status_code == 200
    props = resp.json()
    densidade = next(p for p in props if p["slug"] == "densidade")
    # All five demo materials have a density value.
    assert densidade["value_count"] == 5


def test_create_property_validates_dimension(client):
    # canonical_unit "meter" does not match a pressure dimension -> 400
    resp = client.post(
        "/api/properties",
        json={
            "name": "Propriedade Inválida Demo",
            "category": "MECANICA",
            "physical_dimension": "[mass] / [length] / [time] ** 2",
            "canonical_unit": "meter",
        },
    )
    assert resp.status_code == 400


def test_create_property_succeeds(client):
    resp = client.post(
        "/api/properties",
        json={
            "name": "Resistência à Compressão Demo",
            "category": "MECANICA",
            "physical_dimension": "[mass] / [length] / [time] ** 2",
            "canonical_unit": "Pa",
            "accepted_units": ["Pa", "MPa"],
            "better_direction": "HIGHER",
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["slug"] == "resistencia-a-compressao-demo"
    assert body["value_count"] == 0


def test_delete_property_in_use_conflicts(client):
    props = client.get("/api/properties").json()
    densidade = next(p for p in props if p["slug"] == "densidade")
    resp = client.delete(f"/api/properties/{densidade['id']}")
    assert resp.status_code == 409


# --- Materials (create / update / values / deactivate) --------------------

def _new_material_payload(client, **overrides):
    payload = {
        "name": "Material Novo Demo",
        "class_id": _metais_class_id(client),
        "subclass": "Teste",
        "description": "Criado em teste.",
        "keywords": ["teste", "novo"],
        "values": [
            {"property_slug": "densidade", "kind": "scalar", "value": 2.5, "unit": "g/cm**3"},
            {"property_slug": "modulo_young", "kind": "scalar", "value": 70.0, "unit": "GPa"},
        ],
    }
    payload.update(overrides)
    return payload


def test_create_material_converts_units(client):
    resp = client.post("/api/materials", json=_new_material_payload(client))
    assert resp.status_code == 201
    detail = resp.json()
    assert detail["is_demo"] is False
    fisica = next(g for g in detail["property_groups"] if g["category"] == "FISICA")
    densidade = next(p for p in fisica["properties"] if p["property_slug"] == "densidade")
    assert densidade["original_unit"] == "g/cm**3"
    assert densidade["canonical_unit"] == "kg/m**3"
    assert abs(densidade["normalized_value"] - 2500.0) < 1e-6


def test_create_material_missing_value_stays_missing(client):
    payload = _new_material_payload(
        client,
        values=[{"property_slug": "condutividade_termica", "kind": "missing"}],
    )
    detail = client.post("/api/materials", json=payload).json()
    all_props = [p for g in detail["property_groups"] for p in g["properties"]]
    cond = next(p for p in all_props if p["property_slug"] == "condutividade_termica")
    assert cond["is_missing"] is True
    assert cond["value_scalar"] is None
    assert cond["normalized_value"] is None


def test_create_material_invalid_unit_rejected(client):
    payload = _new_material_payload(
        client,
        values=[{"property_slug": "densidade", "kind": "scalar", "value": 1.0, "unit": "meter"}],
    )
    resp = client.post("/api/materials", json=payload)
    assert resp.status_code == 400


def test_create_material_inverted_interval_rejected(client):
    payload = _new_material_payload(
        client,
        values=[
            {
                "property_slug": "limite_escoamento",
                "kind": "interval",
                "value_min": 60.0,
                "value_max": 40.0,
                "unit": "MPa",
            }
        ],
    )
    resp = client.post("/api/materials", json=payload)
    assert resp.status_code == 400


def test_create_material_unknown_class_404(client):
    payload = _new_material_payload(client, class_id=999999)
    resp = client.post("/api/materials", json=payload)
    assert resp.status_code == 404


def test_create_material_duplicate_name_conflicts(client):
    payload = _new_material_payload(client, name="Aço Demo B", values=[])
    resp = client.post("/api/materials", json=payload)
    assert resp.status_code == 409


def test_create_material_is_atomic_on_invalid_value(client):
    before = len(client.get("/api/materials").json())
    payload = _new_material_payload(
        client,
        name="Material Atômico Demo",
        values=[
            {"property_slug": "densidade", "kind": "scalar", "value": 1.0, "unit": "meter"}
        ],
    )
    assert client.post("/api/materials", json=payload).status_code == 400
    after = len(client.get("/api/materials").json())
    assert after == before  # the material was not partially created


def test_update_material_patches_fields(client):
    created = client.post("/api/materials", json=_new_material_payload(client)).json()
    resp = client.patch(
        f"/api/materials/{created['id']}",
        json={"name": "Material Renomeado Demo", "keywords": ["editado"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Material Renomeado Demo"
    assert body["keywords"] == ["editado"]


def test_replace_values(client):
    created = client.post("/api/materials", json=_new_material_payload(client)).json()
    resp = client.put(
        f"/api/materials/{created['id']}/values",
        json=[{"property_slug": "dureza", "kind": "scalar", "value": 300.0, "unit": "dimensionless"}],
    )
    assert resp.status_code == 200
    all_props = [p for g in resp.json()["property_groups"] for p in g["properties"]]
    slugs = {p["property_slug"] for p in all_props}
    assert slugs == {"dureza"}  # previous values replaced


def test_deactivate_removes_from_catalogue(client):
    created = client.post("/api/materials", json=_new_material_payload(client)).json()
    assert client.delete(f"/api/materials/{created['id']}").status_code == 204
    listed = [m["id"] for m in client.get("/api/materials").json()]
    assert created["id"] not in listed
    # But the detail is still reachable (soft delete) and marked inactive.
    detail = client.get(f"/api/materials/{created['id']}")
    assert detail.status_code == 200
    assert detail.json()["is_active"] is False


# --- Regressions from the Phase 2 adversarial review -----------------------

def test_replace_values_response_reflects_new_values(client):
    """PUT /values must return the NEW values, not a stale cached collection.

    Regression: with production sessions (expire_on_commit=False) the response
    used to echo the pre-replacement values because the identity-map collection
    was never refreshed (fixed via populate_existing on get_material).
    """
    created = client.post("/api/materials", json=_new_material_payload(client)).json()
    resp = client.put(
        f"/api/materials/{created['id']}/values",
        json=[{"property_slug": "modulo_young", "kind": "scalar", "value": 999.0, "unit": "GPa"}],
    )
    assert resp.status_code == 200
    all_props = [p for g in resp.json()["property_groups"] for p in g["properties"]]
    modulo = next(p for p in all_props if p["property_slug"] == "modulo_young")
    assert modulo["value_scalar"] == 999.0          # new, not the old 70.0
    assert abs(modulo["normalized_value"] - 999e9) < 1e-3


def test_class_duplicate_name_with_distinct_slug_conflicts(client):
    resp = client.post("/api/classes", json={"name": "Metais", "slug": "metais-v2"})
    assert resp.status_code == 409  # was HTTP 500 (unhandled IntegrityError)


def test_class_rename_to_existing_name_conflicts(client):
    created = client.post("/api/classes", json={"name": "Classe Renome Demo"}).json()
    resp = client.put(
        f"/api/classes/{created['id']}",
        json={"name": "Metais", "slug": created["slug"]},
    )
    assert resp.status_code == 409


def test_chart_excludes_deactivated_material(client):
    listing = client.get("/api/materials").json()
    aco = next(m for m in listing if m["name"] == "Aço Demo B")
    assert client.delete(f"/api/materials/{aco['id']}").status_code == 204

    chart = client.get(
        "/api/materials/chart", params={"x": "densidade", "y": "modulo_young"}
    ).json()
    plotted_ids = {p["material_id"] for p in chart["points"]}
    assert aco["id"] not in plotted_ids
    assert aco["id"] not in chart["excluded_material_ids"]


def test_update_property_unit_change_with_values_conflicts(client):
    props = client.get("/api/properties").json()
    densidade = next(p for p in props if p["slug"] == "densidade")
    payload = {
        "name": densidade["name"],
        "slug": densidade["slug"],
        "category": densidade["category"],
        "physical_dimension": densidade["physical_dimension"],
        "canonical_unit": "g/cm**3",  # change while values exist -> conflict
        "accepted_units": densidade["accepted_units"],
        "is_interval": densidade["is_interval"],
        "better_direction": densidade["better_direction"],
        "allows_log_scale": densidade["allows_log_scale"],
    }
    resp = client.put(f"/api/properties/{densidade['id']}", json=payload)
    assert resp.status_code == 409


def test_update_property_name_only_with_values_succeeds(client):
    props = client.get("/api/properties").json()
    densidade = next(p for p in props if p["slug"] == "densidade")
    payload = {
        "name": "Densidade (massa específica)",
        "slug": densidade["slug"],
        "category": densidade["category"],
        "physical_dimension": densidade["physical_dimension"],
        "canonical_unit": densidade["canonical_unit"],   # unchanged
        "accepted_units": densidade["accepted_units"],
        "is_interval": densidade["is_interval"],
        "better_direction": densidade["better_direction"],
        "allows_log_scale": densidade["allows_log_scale"],
    }
    resp = client.put(f"/api/properties/{densidade['id']}", json=payload)
    assert resp.status_code == 200
    assert resp.json()["name"] == "Densidade (massa específica)"


def test_duplicate_property_slugs_in_payload_rejected(client):
    payload = _new_material_payload(
        client,
        name="Material Slug Duplicado Demo",
        values=[
            {"property_slug": "densidade", "kind": "scalar", "value": 1.0, "unit": "g/cm**3"},
            {"property_slug": "densidade", "kind": "scalar", "value": 2.0, "unit": "g/cm**3"},
        ],
    )
    resp = client.post("/api/materials", json=payload)
    assert resp.status_code == 400


def test_interval_typical_out_of_range_rejected(client):
    payload = _new_material_payload(
        client,
        name="Material Typical Fora Demo",
        values=[
            {
                "property_slug": "limite_escoamento",
                "kind": "interval",
                "value_min": 100.0,
                "value_max": 200.0,
                "value_typical": 5000.0,
                "unit": "MPa",
            }
        ],
    )
    resp = client.post("/api/materials", json=payload)
    assert resp.status_code == 400


def test_nonfinite_value_rejected_at_schema_boundary(client):
    # httpx refuses to serialise inf client-side, so send raw JSON with the
    # non-standard "Infinity" token — which Python's json.loads (used by the
    # server) happily accepts. Pydantic must then reject it (allow_inf_nan=False).
    import json

    payload = _new_material_payload(
        client,
        name="Material Infinito Demo",
        values=[
            {"property_slug": "densidade", "kind": "scalar", "value": "__INF__", "unit": "g/cm**3"}
        ],
    )
    raw = json.dumps(payload).replace('"__INF__"', "Infinity")
    resp = client.post(
        "/api/materials", content=raw, headers={"Content-Type": "application/json"}
    )
    assert resp.status_code == 422  # rejected by Pydantic (allow_inf_nan=False)


def test_search_wildcards_are_matched_literally(client):
    # "_" must not act as a single-char wildcard ("a_o" would match "aço").
    resp = client.get("/api/materials", params={"search": "a_o"})
    assert resp.status_code == 200
    assert resp.json() == []
