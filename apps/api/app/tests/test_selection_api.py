"""Integration tests for the deterministic selection API."""

from __future__ import annotations


def _names(candidates):
    return {c["name"] for c in candidates}


def test_list_seeded_performance_indices(client):
    resp = client.get("/api/performance-indices")
    assert resp.status_code == 200
    indices = resp.json()
    by_slug = {i["slug"]: i for i in indices}
    assert "rigidez-especifica" in by_slug
    rigidez = by_slug["rigidez-especifica"]
    assert rigidez["expression"] == "modulo_young / densidade"
    assert rigidez["goal"] == "maximize"
    assert rigidez["dimension"]  # dimensional analysis succeeded


def test_filter_funnel_with_unit_conversion(client):
    payload = {
        "combinator": "AND",
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 2800, "unit": "kg/m**3"},
            {"operator": "gte", "property_slug": "modulo_young", "value": 60, "unit": "GPa"},
        ],
    }
    resp = client.post("/api/selection/filter", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["initial_count"] == 5
    assert [s["remaining"] for s in body["steps"]] == [3, 2]
    assert _names(body["candidates"]) == {"Liga Alumínio Demo A", "Compósito Demo E"}


def test_filter_threshold_in_non_canonical_unit(client):
    # 2.8 g/cm3 == 2800 kg/m3 -> same result as the canonical form.
    payload = {
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 2.8, "unit": "g/cm**3"},
        ]
    }
    resp = client.post("/api/selection/filter", json=payload)
    assert resp.status_code == 200
    assert _names(resp.json()["candidates"]) == {
        "Liga Alumínio Demo A", "Polímero Demo C", "Compósito Demo E"
    }


def test_filter_incompatible_unit_rejected(client):
    payload = {
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 5, "unit": "meter"},
        ]
    }
    resp = client.post("/api/selection/filter", json=payload)
    assert resp.status_code == 400


def test_filter_inverted_range_rejected(client):
    payload = {
        "constraints": [
            {"operator": "between", "property_slug": "densidade", "value_min": 3000, "value_max": 1000, "unit": "kg/m**3"},
        ]
    }
    resp = client.post("/api/selection/filter", json=payload)
    assert resp.status_code == 400


def test_index_evaluation_and_ordering(client):
    resp = client.post(
        "/api/selection/index",
        json={"expression": "modulo_young / densidade", "goal": "maximize"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["defined_count"] == 5
    assert body["undefined_count"] == 0
    # Highest E/rho among the demo set is the ceramic.
    assert body["values"][0]["name"] == "Cerâmica Demo D"
    assert "[length]" in body["dimension"]


def test_index_partially_undefined_reports_missing(client):
    # limite_escoamento exists only for the aluminium and the polymer.
    resp = client.post(
        "/api/selection/index",
        json={"expression": "limite_escoamento / densidade", "goal": "maximize"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["defined_count"] == 2
    assert body["undefined_count"] == 3
    undefined = [v for v in body["values"] if v["value"] is None]
    assert all(v["undefined_reason"] for v in undefined)


def test_index_unknown_variable_rejected(client):
    resp = client.post("/api/selection/index", json={"expression": "foo / bar"})
    assert resp.status_code == 400


def test_index_dangerous_expression_rejected(client):
    resp = client.post(
        "/api/selection/index", json={"expression": "__import__('os').getcwd()"}
    )
    assert resp.status_code == 400


def test_run_full_pipeline(client):
    payload = {
        "combinator": "AND",
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 5, "unit": "g/cm**3"},
        ],
        "index": {"name": "Rigidez específica", "expression": "modulo_young / densidade", "goal": "maximize"},
        "ranking": {
            "normalization": "minmax",
            "criteria": [
                {"key": "__index__", "weight": 2.0},
                {"key": "densidade", "weight": 1.0},
            ],
            "run_sensitivity": True,
        },
    }
    resp = client.post("/api/selection/run", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["final_count"] == 4  # everything except the dense steel
    assert body["index"]["defined_count"] == 4
    ranked = body["ranking"]["ranked"]
    assert len(ranked) == 4
    assert ranked[0]["rank"] == 1
    # candidates are returned in rank order and carry index/score
    assert body["candidates"][0]["rank"] == 1
    assert body["candidates"][0]["index_value"] is not None
    assert len(body["ranking"]["sensitivity"]) >= 1


def test_run_ranking_excludes_missing_data(client):
    payload = {
        "ranking": {
            "criteria": [{"key": "limite_escoamento", "weight": 1.0, "direction": "max"}],
            "run_sensitivity": False,
        }
    }
    resp = client.post("/api/selection/run", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    # Only 2 materials have limite_escoamento; the other 3 are excluded, not zero-filled.
    assert len(body["ranking"]["ranked"]) == 2
    assert len(body["ranking"]["excluded"]) == 3


def test_ranking_criterion_zero_weight_rejected_by_schema(client):
    payload = {"ranking": {"criteria": [{"key": "densidade", "weight": 0}]}}
    resp = client.post("/api/selection/run", json=payload)
    assert resp.status_code == 422  # weight must be > 0


def test_study_crud_and_run(client):
    study_payload = {
        "name": "Haste leve e rígida",
        "description": "Estudo de demonstração",
        "function_text": "Haste sob tração",
        "objective_text": "Minimizar massa",
        "free_variables": ["área da seção"],
        "combinator": "AND",
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 5, "unit": "g/cm**3"},
        ],
        "index": {"name": "Rigidez específica", "expression": "modulo_young / densidade", "goal": "maximize"},
        "normalization": "minmax",
        "criteria": [{"key": "__index__", "weight": 1.0}],
    }
    created = client.post("/api/selection/studies", json=study_payload)
    assert created.status_code == 201
    study_id = created.json()["id"]

    # duplicate name -> conflict
    assert client.post("/api/selection/studies", json=study_payload).status_code == 409

    listing = client.get("/api/selection/studies").json()
    assert any(s["id"] == study_id for s in listing)

    fetched = client.get(f"/api/selection/studies/{study_id}").json()
    assert fetched["name"] == "Haste leve e rígida"
    assert fetched["index"]["expression"] == "modulo_young / densidade"
    assert len(fetched["constraints"]) == 1

    run = client.post(f"/api/selection/studies/{study_id}/run")
    assert run.status_code == 200
    assert run.json()["final_count"] == 4

    assert client.delete(f"/api/selection/studies/{study_id}").status_code == 204
    assert client.get(f"/api/selection/studies/{study_id}").status_code == 404


def test_run_no_criteria_has_no_ranking(client):
    resp = client.post("/api/selection/run", json={"constraints": []})
    assert resp.status_code == 200
    body = resp.json()
    assert body["ranking"] is None
    assert body["final_count"] == 5
