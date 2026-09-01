"""Integration tests for the deterministic selection API."""

from __future__ import annotations

import pytest

from app.models.selection import ConstraintGroup, SelectionConstraint


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
        "Liga Alumínio Demo A",
        "Polímero Demo C",
        "Compósito Demo E",
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
            {
                "operator": "between",
                "property_slug": "densidade",
                "value_min": 3000,
                "value_max": 1000,
                "unit": "kg/m**3",
            },
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
    resp = client.post("/api/selection/index", json={"expression": "__import__('os').getcwd()"})
    assert resp.status_code == 400


def test_run_full_pipeline(client):
    payload = {
        "combinator": "AND",
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 5, "unit": "g/cm**3"},
        ],
        "index": {
            "name": "Rigidez específica",
            "expression": "modulo_young / densidade",
            "goal": "maximize",
        },
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
    # The key stays for callers that match on it; the label is what a reader sees.
    assert body["ranking"]["excluded"][0]["missing_keys"] == ["limite_escoamento"]
    assert body["ranking"]["excluded"][0]["missing_labels"] == ["Limite de escoamento"]


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
        "index": {
            "name": "Rigidez específica",
            "expression": "modulo_young / densidade",
            "goal": "maximize",
        },
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


def test_study_persists_and_reruns_with_its_method(client):
    payload = {
        "name": "Estudo TOPSIS",
        "combinator": "AND",
        "constraints": [],
        "index": {
            "name": "Rigidez específica",
            "expression": "modulo_young / densidade",
            "goal": "maximize",
        },
        "normalization": "minmax",
        "method": "topsis",
        "criteria": [{"key": "__index__", "weight": 1.0}],
    }
    created = client.post("/api/selection/studies", json=payload)
    assert created.status_code == 201
    assert created.json()["method"] == "topsis"
    study_id = created.json()["id"]

    fetched = client.get(f"/api/selection/studies/{study_id}").json()
    assert fetched["method"] == "topsis"

    run = client.post(f"/api/selection/studies/{study_id}/run").json()
    assert run["ranking"]["method"] == "topsis"


def _viga_leve_payload(criteria: list[dict], name: str = "Viga leve") -> dict:
    return {
        "name": name,
        "combinator": "AND",
        "constraints": [],
        "index": {
            "name": "Viga leve",
            "expression": "modulo_young / densidade",
            "goal": "maximize",
        },
        "normalization": "minmax",
        "criteria": criteria,
    }


def test_saved_study_reports_the_derived_label_not_the_raw_key(client):
    """A criterion saved without a label must not print its own key.

    Saving used to default the label to the key, and that fabricated value then
    outranked the real name on every re-run: the report read "__index__" in the
    contributions table and "Ênfase em __index__" in the sensitivity section.
    """
    payload = _viga_leve_payload(
        [{"key": "__index__", "weight": 2.0}, {"key": "densidade", "weight": 1.0}]
    )
    study_id = client.post("/api/selection/studies", json=payload).json()["id"]

    stored = client.get(f"/api/selection/studies/{study_id}").json()
    assert stored["criteria"][0]["label"] is None  # absent stayed absent

    body = client.post(f"/api/selection/studies/{study_id}/run").json()
    labels = {c["label"] for r in body["ranking"]["ranked"] for c in r["contributions"]}
    assert labels == {"Viga leve", "Densidade"}

    descriptions = [s["description"] for s in body["ranking"]["sensitivity"]]
    assert any("Ênfase em Viga leve" in d for d in descriptions)
    assert not any("__index__" in d for d in descriptions)


def test_saved_study_keeps_a_label_the_user_actually_wrote(client):
    payload = _viga_leve_payload([{"key": "densidade", "label": "Peso próprio", "weight": 1.0}])
    study_id = client.post("/api/selection/studies", json=payload).json()["id"]

    body = client.post(f"/api/selection/studies/{study_id}/run").json()
    labels = {c["label"] for r in body["ranking"]["ranked"] for c in r["contributions"]}
    assert labels == {"Peso próprio"}


def test_saved_study_does_not_flip_a_lower_is_better_criterion(client):
    """Saving a study must not change what it computes.

    An omitted direction used to be persisted as "max", which silently reversed
    a criterion whose property is better when lower — density here. The saved
    study then ranked the heaviest material first while the same criteria run
    directly ranked the lightest first.
    """
    criteria = [{"key": "densidade", "weight": 1.0}]
    direct = client.post(
        "/api/selection/run",
        json={"ranking": {"criteria": criteria, "run_sensitivity": False}},
    ).json()

    study_id = client.post(
        "/api/selection/studies", json=_viga_leve_payload(criteria, name="Só densidade")
    ).json()["id"]

    stored = client.get(f"/api/selection/studies/{study_id}").json()
    assert stored["criteria"][0]["direction"] is None

    saved = client.post(f"/api/selection/studies/{study_id}/run").json()
    assert [r["name"] for r in saved["ranking"]["ranked"]] == [
        r["name"] for r in direct["ranking"]["ranked"]
    ]


def test_run_no_criteria_has_no_ranking(client):
    resp = client.post("/api/selection/run", json={"constraints": []})
    assert resp.status_code == 200
    body = resp.json()
    assert body["ranking"] is None
    assert body["final_count"] == 5


def test_run_study_with_topsis_method(client):
    payload = {
        "combinator": "AND",
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 5, "unit": "g/cm**3"},
        ],
        "index": {
            "name": "Rigidez específica",
            "expression": "modulo_young / densidade",
            "goal": "maximize",
        },
        "ranking": {
            "normalization": "minmax",
            "method": "topsis",
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
    assert body["ranking"]["method"] == "topsis"
    assert len(body["ranking"]["ranked"]) == 4


def test_run_study_with_promethee_method(client):
    payload = {
        "ranking": {
            "method": "promethee",
            "criteria": [{"key": "densidade", "weight": 1.0}],
            "run_sensitivity": False,
        }
    }
    resp = client.post("/api/selection/run", json=payload)
    assert resp.status_code == 200
    assert resp.json()["ranking"]["method"] == "promethee"


def test_ahp_weights_endpoint_returns_weights(client):
    payload = {
        "criteria": ["rigidez", "densidade"],
        "matrix": [[1.0, 3.0], [1 / 3, 1.0]],
    }
    response = client.post("/api/selection/ahp-weights", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert sum(body["weights"].values()) == pytest.approx(1.0, abs=1e-6)
    assert set(body["weights"]) == {"rigidez", "densidade"}


def test_ahp_weights_endpoint_rejects_inconsistent_matrix(client):
    # A cyclical set of extreme judgments (A >> B >> C >> A) is the textbook
    # inconsistent case: it must be rejected outright, never averaged into
    # numerically-valid-but-meaningless weights.
    payload = {
        "criteria": ["A", "B", "C"],
        "matrix": [[1.0, 9.0, 1 / 9], [1 / 9, 1.0, 9.0], [9.0, 1 / 9, 1.0]],
    }
    response = client.post("/api/selection/ahp-weights", json=payload)
    # A domain ValidationError maps to HTTP 400 app-wide (see the docstring
    # on app.domain.errors.ValidationError and app.main's exception
    # handler) — not 422, which this app reserves for Pydantic's own
    # request-schema validation (e.g. a malformed matrix shape).
    assert response.status_code == 400
    assert "inconsistentes" in response.json()["detail"]


def test_ahp_weights_endpoint_rejects_malformed_matrix_shape(client):
    payload = {"criteria": ["A", "B"], "matrix": [[1.0]]}
    response = client.post("/api/selection/ahp-weights", json=payload)
    assert response.status_code == 400


def test_ahp_weights_endpoint_requires_login(anon_client):
    payload = {
        "criteria": ["rigidez", "densidade"],
        "matrix": [[1.0, 3.0], [1 / 3, 1.0]],
    }
    assert anon_client.post("/api/selection/ahp-weights", json=payload).status_code == 401


def test_studies_endpoints_require_login(anon_client):
    assert anon_client.get("/api/selection/studies").status_code == 401
    assert anon_client.post("/api/selection/filter", json={"constraints": []}).status_code == 401


def test_user_cannot_see_or_delete_another_users_study(client, other_user, login_as):
    study_id = client.post(
        "/api/selection/studies", json=_viga_leve_payload([], "Estudo A5")
    ).json()["id"]

    with login_as(other_user):
        assert client.get(f"/api/selection/studies/{study_id}").status_code == 404
        assert client.delete(f"/api/selection/studies/{study_id}").status_code == 404
        assert client.get("/api/selection/studies").json() == []

    # The owner's session still sees it after the impersonated block ends.
    assert client.get(f"/api/selection/studies/{study_id}").status_code == 200


def test_two_projects_can_reuse_the_same_study_name(client, other_user, login_as):
    payload = _viga_leve_payload([], "Estudo repetido")
    assert client.post("/api/selection/studies", json=payload).status_code == 201

    with login_as(other_user):
        # Same name, different project: not a conflict.
        assert client.post("/api/selection/studies", json=payload).status_code == 201


# --- M6: ConstraintGroup (model-level; the API schema does not expose group_id
# yet — that is Task 8's wiring) --------------------------------------------
#
# No precedent exists in this codebase for testing a migration's data effects
# directly (checked alembic/ and app/tests/): the shared test database is built
# from `Base.metadata.create_all`, never from the migrations, so it never
# starts in the pre-M6 state the migration's backfill runs against. The
# migration's actual backfill SQL was instead verified by hand: applying it
# with `alembic upgrade head` against a scratch SQLite copy of the dev
# database seeded with pre-existing studies (some with constraints, one with
# none, one AND and one OR) and inspecting the result directly. These tests
# cover the equivalent, forward-looking guarantee — that `create_study`
# (SelectionService) gives every *new* study the same one-root-group shape the
# migration gives every *old* one, and that it is cleaned up correctly.


def test_create_study_gets_one_root_constraint_group_matching_combinator(client, db_session):
    """A new study's root ConstraintGroup mirrors its own combinator — the
    exact shape the migration's backfill gives every pre-M6 study."""
    payload = _viga_leve_payload([], "Estudo com grupo raiz")
    payload["combinator"] = "OR"
    payload["constraints"] = [
        {"operator": "lte", "property_slug": "densidade", "value": 2800, "unit": "kg/m**3"},
        {"operator": "gte", "property_slug": "modulo_young", "value": 60, "unit": "GPa"},
    ]
    study_id = client.post("/api/selection/studies", json=payload).json()["id"]

    groups = db_session.query(ConstraintGroup).filter(ConstraintGroup.study_id == study_id).all()
    assert len(groups) == 1
    root = groups[0]
    assert root.parent_group_id is None
    assert root.operator == "OR"
    assert root.position == 0

    constraints = (
        db_session.query(SelectionConstraint).filter(SelectionConstraint.study_id == study_id).all()
    )
    assert len(constraints) == 2
    assert all(c.group_id == root.id for c in constraints)


def test_study_with_no_constraints_still_gets_a_root_group(client, db_session):
    """Backward compatibility holds even for the empty case: a study with zero
    constraints still ends up with exactly one root group, same as the
    migration's backfill gives every existing study regardless of how many
    constraints it had."""
    payload = _viga_leve_payload([], "Estudo sem restricoes")
    study_id = client.post("/api/selection/studies", json=payload).json()["id"]

    groups = db_session.query(ConstraintGroup).filter(ConstraintGroup.study_id == study_id).all()
    assert len(groups) == 1
    assert groups[0].parent_group_id is None
    assert groups[0].operator == "AND"  # _viga_leve_payload's combinator


def test_deleting_study_cascades_its_constraint_group(client, db_session):
    """Deleting a study must not orphan its ConstraintGroup row: SQLite here
    runs without PRAGMA foreign_keys=ON, so `ondelete=CASCADE` alone would not
    clean it up — this is the ORM-level cascade doing the work instead."""
    payload = _viga_leve_payload([], "Estudo a apagar")
    payload["constraints"] = [
        {"operator": "lte", "property_slug": "densidade", "value": 2800, "unit": "kg/m**3"},
    ]
    study_id = client.post("/api/selection/studies", json=payload).json()["id"]
    assert (
        db_session.query(ConstraintGroup).filter(ConstraintGroup.study_id == study_id).count() == 1
    )

    assert client.delete(f"/api/selection/studies/{study_id}").status_code == 204

    assert (
        db_session.query(ConstraintGroup).filter(ConstraintGroup.study_id == study_id).count() == 0
    )
    assert (
        db_session.query(SelectionConstraint)
        .filter(SelectionConstraint.study_id == study_id)
        .count()
        == 0
    )
