"""A saved study's run history (D-245).

Each kept run stores what the engine answered then — counts, winners, one entry
per candidate with its rank — and the study as it was. Comparing two kept runs
reads those entries with the same `diff_runs` the wizard uses; nothing re-runs.
"""

from __future__ import annotations

from app.models.material import Material
from app.schemas.selection import MAX_RUNS_PER_STUDY

STUDY = {
    "name": "Haste com histórico",
    "notes": "versão de partida",
    "constraints": [
        {"operator": "lte", "property_slug": "densidade", "value": 5, "unit": "g/cm**3"}
    ],
    "index": {"name": "Rigidez", "expression": "modulo_young / densidade", "goal": "maximize"},
    "criteria": [{"key": "__index__", "weight": 1.0}],
}


def _study(client) -> int:
    resp = client.post("/api/selection/studies", json=STUDY)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _keep(client, study_id: int, label: str | None = None) -> dict:
    resp = client.post(f"/api/selection/studies/{study_id}/runs", json={"label": label})
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_keeping_a_run_stores_what_the_engine_answered(client):
    study_id = _study(client)
    body = _keep(client, study_id, "  antes   da curadoria ")

    run, result = body["run"], body["result"]
    assert run["label"] == "antes da curadoria"
    assert run["final_count"] == result["final_count"]
    assert run["initial_count"] == result["initial_count"]
    assert run["winner_names"] == result["winner"]["names"]

    detail = client.get(f"/api/selection/studies/{study_id}/runs/{run['id']}").json()
    assert [e["record_id"] for e in detail["entries"]] == [
        c["record_id"] for c in result["candidates"]
    ]
    assert [e["rank"] for e in detail["entries"]] == [c["rank"] for c in result["candidates"]]
    assert detail["study"]["name"] == STUDY["name"]
    assert detail["study"]["notes"] == "versão de partida"


def test_the_history_lists_newest_first_and_a_blank_label_is_none(client):
    study_id = _study(client)
    first = _keep(client, study_id, "primeira")["run"]
    second = _keep(client, study_id, "   ")["run"]
    listed = client.get(f"/api/selection/studies/{study_id}/runs").json()
    assert [r["id"] for r in listed] == [second["id"], first["id"]]
    assert listed[0]["label"] is None


def test_two_kept_runs_compare_from_their_entries(client, db_session):
    study_id = _study(client)
    before = _keep(client, study_id, "antes")["run"]

    # The catalogue changes between the two: the lightest material gets heavy
    # enough to fail the limit, so it leaves the candidates.
    light = db_session.query(Material).filter(Material.name == "Liga Alumínio Demo A").one()
    for value in light.property_values:
        if value.property_definition.slug == "densidade":
            value.normalized_value = 9000.0  # kg/m3, past the 5 g/cm3 limit
    db_session.flush()

    after = _keep(client, study_id, "depois")["run"]
    diff = client.get(
        f"/api/selection/studies/{study_id}/runs/compare",
        params={"antes": before["id"], "depois": after["id"]},
    )
    assert diff.status_code == 200, diff.text
    body = diff.json()
    assert body["left"] == 1
    left = [r for r in body["rows"] if r["change"] == "left"]
    assert [r["name"] for r in left] == ["Liga Alumínio Demo A"]
    assert after["final_count"] == before["final_count"] - 1


def test_deleting_a_run_and_the_study_takes_its_history(client):
    study_id = _study(client)
    run = _keep(client, study_id)["run"]
    assert client.delete(f"/api/selection/studies/{study_id}/runs/{run['id']}").status_code == 204
    assert client.get(f"/api/selection/studies/{study_id}/runs").json() == []

    _keep(client, study_id)
    assert client.delete(f"/api/selection/studies/{study_id}").status_code == 204
    assert client.get(f"/api/selection/studies/{study_id}/runs").status_code == 404


def test_a_run_of_another_study_is_not_found_through_this_one(client):
    a = _study(client)
    b = client.post("/api/selection/studies", json={**STUDY, "name": "Outro"}).json()["id"]
    run = _keep(client, a)["run"]
    assert client.get(f"/api/selection/studies/{b}/runs/{run['id']}").status_code == 404
    assert (
        client.get(
            f"/api/selection/studies/{b}/runs/compare",
            params={"antes": run["id"], "depois": run["id"]},
        ).status_code
        == 404
    )


def test_the_history_has_a_ceiling(client, monkeypatch):
    import app.services.selection_service as service

    monkeypatch.setattr(service, "MAX_RUNS_PER_STUDY", 2)
    study_id = _study(client)
    _keep(client, study_id)
    _keep(client, study_id)
    resp = client.post(f"/api/selection/studies/{study_id}/runs", json={})
    assert resp.status_code == 409
    assert "Apague uma antiga" in resp.json()["detail"]
    assert MAX_RUNS_PER_STUDY == 50


def test_label_is_bounded(client):
    study_id = _study(client)
    resp = client.post(f"/api/selection/studies/{study_id}/runs", json={"label": "x" * 121})
    assert resp.status_code == 422
