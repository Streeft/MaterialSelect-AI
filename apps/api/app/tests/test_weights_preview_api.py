"""``POST /api/selection/weights-preview`` (D-87): the budget always, the top-N
when there is something to rank, and a reason — never an error — when there is
not. Plus the duplicate-criterion rule at the doors a ranking enters by."""

from __future__ import annotations

from sqlalchemy import select

from app.models.selection import RankingCriterion, SelectionStudy
from app.tests.test_process_attributes import FORMA, LOTE, attributes  # noqa: F401 — fixture

PREVIEW = "/api/selection/weights-preview"

TWO_CRITERIA = [
    {"key": "densidade", "weight": 0.5},
    {"key": "modulo_young", "weight": 0.5},
]


def _limit(constraints):
    return {
        "kind": "limit",
        "root_group": {"operator": "AND", "constraints": constraints, "groups": []},
    }


def test_top_five_is_the_head_of_the_real_run(client):
    preview = client.post(PREVIEW, json={"criteria": TWO_CRITERIA})
    assert preview.status_code == 200, preview.text
    body = preview.json()
    assert body["budget"]["status"] == "complete"
    assert body["budget"]["can_run"] is True
    assert body["renormalized"] is False
    assert body["unavailable_reason"] is None

    run = client.post("/api/selection/run", json={"ranking": {"criteria": TWO_CRITERIA}})
    assert run.status_code == 200, run.text
    ranked = run.json()["ranking"]["ranked"]
    assert [t["record_id"] for t in body["top"]] == [r["record_id"] for r in ranked[:5]]
    assert [t["score"] for t in body["top"]] == [r["score"] for r in ranked[:5]]
    assert all(t["class_name"] for t in body["top"])


def test_top_n_is_honoured(client):
    body = client.post(PREVIEW, json={"criteria": TWO_CRITERIA, "top_n": 2}).json()
    assert len(body["top"]) == 2


def test_says_whether_constraints_narrowed_the_list(client):
    whole = client.post(PREVIEW, json={"criteria": TWO_CRITERIA}).json()
    assert whole["constraints_applied"] is False
    assert whole["candidate_count"] == whole["initial_count"]

    # A limit stage with nothing in it admits everyone and is not a constraint.
    empty_stage = client.post(
        PREVIEW, json={"criteria": TWO_CRITERIA, "stages": [_limit([])]}
    ).json()
    assert empty_stage["constraints_applied"] is False

    narrowed = client.post(
        PREVIEW,
        json={
            "criteria": TWO_CRITERIA,
            "stages": [
                _limit(
                    [
                        {
                            "operator": "gte",
                            "property_slug": "modulo_young",
                            "value": 100,
                            "unit": "GPa",
                        }
                    ]
                )
            ],
        },
    ).json()
    assert narrowed["constraints_applied"] is True
    assert narrowed["candidate_count"] < narrowed["initial_count"]


def test_a_budget_that_does_not_close_still_previews_renormalized(client):
    body = client.post(
        PREVIEW,
        json={
            "criteria": [{"key": "densidade", "weight": 1}, {"key": "modulo_young", "weight": 1}]
        },
    ).json()
    assert body["budget"]["status"] == "exceeds"
    assert body["budget"]["can_run"] is False
    assert body["budget"]["suggestion"] == {"kind": "scale_to_limit", "weights": [0.5, 0.5]}
    assert body["renormalized"] is True
    assert body["top"]  # same order as 0.5/0.5 — renormalizing is what /run does


def test_blank_weights_are_accepted_while_typing(client):
    body = client.post(
        PREVIEW,
        json={"criteria": [{"key": "densidade", "weight": 0.4}, {"key": "", "weight": None}]},
    )
    assert body.status_code == 200, body.text
    rows = body.json()["budget"]["rows"]
    assert [r["issue"] for r in rows] == [None, "missing_key"]
    assert rows[1]["share"] is None


def test_no_sound_criterion_is_a_reason_not_an_error(client):
    body = client.post(PREVIEW, json={"criteria": [{"key": "densidade"}]}).json()
    assert body["unavailable_reason"] == "no_criteria"
    assert body["top"] == []

    empty = client.post(PREVIEW, json={"criteria": []}).json()
    assert empty["budget"]["status"] == "empty"
    assert empty["budget"]["can_run"] is True
    assert empty["unavailable_reason"] == "no_criteria"


def test_a_pipeline_that_fails_answers_200_with_the_reason(client):
    body = client.post(
        PREVIEW,
        json={
            "criteria": [{"key": "__index__", "weight": 1}],
            "index": {"expression": "nao_existe / densidade", "goal": "maximize"},
        },
    )
    assert body.status_code == 200, body.text
    out = body.json()
    assert out["unavailable_reason"] == "pipeline_error"
    assert out["unavailable_message"]
    # The budget still reaches the screen.
    assert out["budget"]["status"] == "complete"


def test_no_candidates_is_named(client):
    body = client.post(
        PREVIEW,
        json={
            "criteria": TWO_CRITERIA,
            "stages": [
                _limit(
                    [
                        {
                            "operator": "gte",
                            "property_slug": "densidade",
                            "value": 1e9,
                            "unit": "kg/m**3",
                        }
                    ]
                )
            ],
        },
    ).json()
    assert body["unavailable_reason"] == "no_candidates"


def test_duplicate_criterion_blocks_the_budget_but_not_the_preview(client):
    body = client.post(
        PREVIEW,
        json={
            "criteria": [
                {"key": "densidade", "weight": 0.5},
                {"key": "densidade", "weight": 0.5},
            ]
        },
    ).json()
    assert [r["issue"] for r in body["budget"]["rows"]] == [None, "duplicate_key"]
    assert body["budget"]["can_run"] is False
    assert body["top"]


def test_a_process_study_previews_by_a_numeric_attribute(client, attributes):  # noqa: F811
    body = client.post(
        PREVIEW,
        json={"universe": "process", "criteria": [{"key": LOTE, "weight": 1}]},
    ).json()
    assert body["budget"]["rows"][0]["issue"] is None
    assert body["top"][0]["name"] == "Micro-usinagem de teste"


def test_a_discrete_attribute_is_not_a_criterion(client, attributes):  # noqa: F811
    # Labels have no order (D-59): the row is named, never ranked.
    body = client.post(
        PREVIEW,
        json={"universe": "process", "criteria": [{"key": FORMA, "weight": 1}]},
    ).json()
    assert body["budget"]["rows"][0]["issue"] == "unknown_key"
    assert body["budget"]["can_run"] is False
    assert body["unavailable_reason"] == "no_criteria"


def test_requires_login(anon_client):
    assert anon_client.post(PREVIEW, json={"criteria": []}).status_code == 401


# --- duplicates at the doors a ranking enters by -----------------------------

DUPLICATED = {
    "criteria": [
        {"key": "densidade", "weight": 0.5},
        {"key": "densidade", "weight": 0.5},
    ]
}


def test_run_refuses_a_repeated_criterion(client):
    resp = client.post("/api/selection/run", json={"ranking": DUPLICATED})
    assert resp.status_code == 400
    assert "Critério repetido: Densidade" in resp.json()["detail"]


def test_saving_refuses_a_repeated_criterion(client):
    resp = client.post("/api/selection/studies", json={"name": "Duplicado", **DUPLICATED})
    assert resp.status_code == 400
    assert "Critério repetido" in resp.json()["detail"]


def test_a_study_saved_before_the_rule_still_runs(client, db_session):
    created = client.post(
        "/api/selection/studies",
        json={"name": "Antigo", "criteria": [{"key": "densidade", "weight": 1}]},
    )
    assert created.status_code == 201, created.text
    study = db_session.execute(
        select(SelectionStudy).where(SelectionStudy.id == created.json()["id"])
    ).scalar_one()
    db_session.add(RankingCriterion(study_id=study.id, position=1, key="densidade", weight=1.0))
    db_session.commit()

    resp = client.post(f"/api/selection/studies/{study.id}/run")
    assert resp.status_code == 200, resp.text
