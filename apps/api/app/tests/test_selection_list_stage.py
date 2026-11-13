"""The list stage: "the universe is restricted to these materials" (D-232).

The Map's lasso, the sizing shortcut and the catalogue's cross-page selection
each end with a *set of materials*, and the pipeline had no stage that says so —
the three could only reach Compare. This stage is that sentence: the records
whose ids the reader names, nothing else. It composes with the other stages
like any of them (the pipeline is an intersection), and it never invents a
record: an id that names nothing is refused instead of quietly selecting none.
"""

from __future__ import annotations

import pytest

from app.domain.filters import (
    MaterialSnapshot,
    ProcessSnapshot,
    SelectionStageNode,
    apply_stage,
)
from app.models.material import Material


def _ids(db_session, *names: str) -> list[int]:
    rows = db_session.query(Material).filter(Material.name.in_(names)).all()
    by_name = {m.name: m.id for m in rows}
    assert set(by_name) == set(names), by_name
    return [by_name[n] for n in names]


def _list_stage(ids: list[int], **over):
    stage = {"kind": "list", "material_ids": ids}
    stage.update(over)
    return stage


def _names(body) -> set[str]:
    return {c["name"] for c in body["candidates"]}


# --- Pure engine -------------------------------------------------------------


def _snap(record_id: int) -> MaterialSnapshot:
    return MaterialSnapshot(id=record_id, name=f"m{record_id}", class_name="c", class_slug="c")


def test_the_engine_keeps_exactly_the_listed_records():
    from app.domain.filters import IdSelection

    stage = SelectionStageNode(
        kind="list", label=None, enabled=True, ids=IdSelection(record_ids=[2, 4])
    )
    kept = apply_stage([_snap(1), _snap(2), _snap(3), _snap(4)], stage)
    assert [r.id for r in kept] == [2, 4]


def test_the_engine_refuses_a_list_stage_over_processes():
    """Same posture as the material stage: a wiring bug is loud, never an
    empty result that reads as a legitimate "nothing matched"."""
    from app.domain.filters import IdSelection

    stage = SelectionStageNode(
        kind="list", label=None, enabled=True, ids=IdSelection(record_ids=[1])
    )
    process = ProcessSnapshot(id=1, name="p", class_name="c", class_slug="c")
    with pytest.raises(TypeError):
        apply_stage([process], stage)


# --- Through the API ---------------------------------------------------------


def test_run_restricts_the_universe_to_the_listed_materials(client, db_session):
    (aluminio,) = _ids(db_session, "Liga Alumínio Demo A")
    resp = client.post("/api/selection/run", json={"stages": [_list_stage([aluminio])]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert _names(body) == {"Liga Alumínio Demo A"}
    assert body["stages"][0]["kind"] == "list"
    assert body["stages"][0]["passed"] == 1


def test_filter_reports_the_list_stage_in_the_funnel(client, db_session):
    aluminio, aco = _ids(db_session, "Liga Alumínio Demo A", "Aço Demo B")
    resp = client.post(
        "/api/selection/filter",
        json={"stages": [_list_stage([aluminio, aco], label="Do laço")]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["final_count"] == 2
    assert body["initial_count"] > 2
    step = body["steps"][0]
    assert step["operator"] == "in_list"
    assert step["label"] == "Do laço"
    assert (step["passed"], step["remaining"]) == (2, 2)


def test_a_list_stage_intersects_with_a_limit_stage(client, db_session):
    aluminio, aco = _ids(db_session, "Liga Alumínio Demo A", "Aço Demo B")
    leves = {
        "kind": "limit",
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 2800, "unit": "kg/m**3"}
        ],
    }
    resp = client.post("/api/selection/run", json={"stages": [_list_stage([aluminio, aco]), leves]})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # Both are listed; only the aluminium is light enough.
    assert _names(body) == {"Liga Alumínio Demo A"}
    assert [s["kind"] for s in body["stages"]] == ["list", "limit"]
    assert body["stages"][0]["remaining"] == 2
    assert body["stages"][1]["remaining"] == 1


def test_a_disabled_list_stage_does_not_narrow(client, db_session):
    (aluminio,) = _ids(db_session, "Liga Alumínio Demo A")
    resp = client.post(
        "/api/selection/filter", json={"stages": [_list_stage([aluminio], enabled=False)]}
    )
    body = resp.json()
    assert body["final_count"] == body["initial_count"]
    assert body["stages"][0]["passed"] == 1  # what it would admit on its own


def test_an_unknown_material_id_is_a_404_naming_it(client, db_session):
    (aluminio,) = _ids(db_session, "Liga Alumínio Demo A")
    resp = client.post("/api/selection/run", json={"stages": [_list_stage([aluminio, 987654])]})
    assert resp.status_code == 404
    assert "987654" in resp.json()["detail"]


def test_an_empty_list_is_rejected_instead_of_meaning_everything(client):
    resp = client.post("/api/selection/run", json={"stages": [_list_stage([])]})
    assert resp.status_code == 400
    assert "ao menos um material" in resp.json()["detail"]


def test_a_list_stage_is_capped(client):
    resp = client.post("/api/selection/run", json={"stages": [_list_stage(list(range(1, 202)))]})
    assert resp.status_code == 422


def test_repeated_ids_count_once(client, db_session):
    (aluminio,) = _ids(db_session, "Liga Alumínio Demo A")
    resp = client.post(
        "/api/selection/filter", json={"stages": [_list_stage([aluminio, aluminio])]}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["final_count"] == 1


@pytest.mark.parametrize(
    ("extra", "needle"),
    [
        ({"class_slugs": ["metais"]}, "não leva classes"),
        (
            {
                "constraints": [
                    {"operator": "lte", "property_slug": "densidade", "value": 1, "unit": "kg/m**3"}
                ]
            },
            "não leva restrições",
        ),
        ({"process_slugs": ["x"]}, "não leva processos"),
    ],
)
def test_a_list_stage_carrying_another_kinds_payload_is_rejected(client, db_session, extra, needle):
    (aluminio,) = _ids(db_session, "Liga Alumínio Demo A")
    resp = client.post("/api/selection/run", json={"stages": [_list_stage([aluminio], **extra)]})
    assert resp.status_code == 400
    assert needle in resp.json()["detail"]


def test_ids_on_another_kind_of_stage_are_rejected(client, db_session):
    (aluminio,) = _ids(db_session, "Liga Alumínio Demo A")
    resp = client.post(
        "/api/selection/run",
        json={"stages": [{"kind": "tree", "class_slugs": ["metais"], "material_ids": [aluminio]}]},
    )
    assert resp.status_code == 400
    assert "estágio de lista" in resp.json()["detail"]


def test_a_process_study_refuses_a_list_stage(client, db_session):
    (aluminio,) = _ids(db_session, "Liga Alumínio Demo A")
    resp = client.post(
        "/api/selection/run",
        json={"universe": "process", "stages": [_list_stage([aluminio])]},
    )
    assert resp.status_code == 400
    assert "materiais" in resp.json()["detail"]


# --- Saved studies and documents ----------------------------------------------


def _save(client, stages, name="Estudo com lista"):
    resp = client.post(
        "/api/selection/studies",
        json={"name": name, "free_variables": [], "criteria": [], "stages": stages},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def test_a_saved_list_stage_round_trips_and_runs(client, db_session):
    aluminio, aco = _ids(db_session, "Liga Alumínio Demo A", "Aço Demo B")
    study_id = _save(client, [_list_stage([aco, aluminio], label="Do mapa")])

    read = client.get(f"/api/selection/studies/{study_id}").json()
    (stage,) = read["stages"]
    assert stage["kind"] == "list"
    assert stage["label"] == "Do mapa"
    assert stage["material_ids"] == [aco, aluminio]
    # The other kinds' fields stay what they were: no ids leak into the folders.
    assert stage["material_class_slugs"] == []
    assert stage["class_slugs"] == []

    result = client.post(f"/api/selection/studies/{study_id}/run").json()
    assert _names(result) == {"Liga Alumínio Demo A", "Aço Demo B"}


def test_a_saved_list_whose_material_was_deleted_still_runs(client, db_session):
    """A saved study is stored raw and validated when it runs on a payload, the
    same posture as every other stage: a record that left the catalogue
    shrinks the list, it does not make the study unreadable."""
    aluminio, aco = _ids(db_session, "Liga Alumínio Demo A", "Aço Demo B")
    study_id = _save(client, [_list_stage([aluminio, aco])])
    db_session.query(Material).filter(Material.id == aco).delete()
    db_session.flush()

    resp = client.post(f"/api/selection/studies/{study_id}/run")
    assert resp.status_code == 200, resp.text
    assert _names(resp.json()) == {"Liga Alumínio Demo A"}


def test_the_report_names_the_listed_materials(client, db_session):
    aluminio, aco = _ids(db_session, "Liga Alumínio Demo A", "Aço Demo B")
    study_id = _save(client, [_list_stage([aluminio, aco])])
    text = client.get(f"/api/exports/estudos/{study_id}.html").text
    # Names, not ids: a document that says "ids 3, 7" is unreadable to whoever
    # was not in the session.
    assert "Liga Alumínio Demo A" in text
    assert "Aço Demo B" in text
    assert "lista de 2 materiais" in text


def test_a_study_with_a_list_stage_is_not_exported_as_a_file(client, db_session):
    """The study file carries no record ids (D-122): a material's id means
    something only in the catalogue that issued it, so a list would restrict an
    imported study to whichever records hold those numbers elsewhere."""
    (aluminio,) = _ids(db_session, "Liga Alumínio Demo A")
    study_id = _save(client, [_list_stage([aluminio])])
    resp = client.get(f"/api/selection/studies/{study_id}/export")
    assert resp.status_code == 400, resp.text
    assert "estágio de lista" in resp.json()["detail"]
