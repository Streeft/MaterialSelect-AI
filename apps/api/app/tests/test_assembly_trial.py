"""The trial of a project (D-260): the counting, and the engine's verdicts over the catalogue."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculations.assembly_trial import (
    FAIL,
    MATERIAL_GONE,
    NO_DATA,
    NO_MATERIAL,
    NO_REQUIREMENTS,
    NO_STUDY,
    PASS,
    Requirement,
    try_assembly,
    try_part,
)
from app.models.material import Material


def _tried(*verdicts: str):
    return try_part(
        "Perna",
        has_material=True,
        material_readable=True,
        has_study=True,
        requirements=[Requirement(f"r{i}", v) for i, v in enumerate(verdicts)],
    )


# --- the counting -----------------------------------------------------------------


def test_a_part_passes_only_when_every_requirement_passes():
    assert _tried(PASS, PASS).status == PASS
    assert _tried(PASS, NO_DATA).status == NO_DATA
    # A known failure outranks an absence.
    assert _tried(NO_DATA, FAIL, PASS).status == FAIL


def test_a_part_that_cannot_be_tried_says_which_thing_is_missing():
    base = {"has_material": True, "material_readable": True, "has_study": True}
    assert try_part("x", **{**base, "has_material": False}, requirements=None).status == NO_MATERIAL
    assert (
        try_part("x", **{**base, "material_readable": False}, requirements=None).status
        == MATERIAL_GONE
    )
    assert try_part("x", **{**base, "has_study": False}, requirements=None).status == NO_STUDY
    assert try_part("x", **base, requirements=[]).status == NO_REQUIREMENTS


def test_an_unknown_verdict_is_refused():
    with pytest.raises(ValueError):
        _tried("talvez")


def test_a_project_is_solved_only_when_every_part_passes():
    assert try_assembly([_tried(PASS), _tried(PASS)]).solved is True
    mixed = try_assembly([_tried(PASS), _tried(NO_DATA), _tried(FAIL)])
    assert (mixed.solved, mixed.passed, mixed.failed, mixed.pending) == (False, 1, 1, 1)
    # Nothing to try against is not approval, and an empty project solves nothing.
    untried = try_part(
        "x", has_material=True, material_readable=True, has_study=False, requirements=None
    )
    assert try_assembly([_tried(PASS), untried]).solved is False
    assert try_assembly([]).solved is False


# --- over the API and the real catalogue -------------------------------------------


def _material(db: Session, like: str) -> Material:
    return db.execute(select(Material).where(Material.name.like(like))).scalars().first()


def _study(client, name: str, constraints: list[dict], **extra) -> int:
    resp = client.post(
        "/api/selection/studies", json={"name": name, "constraints": constraints, **extra}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _project(client, name: str = "Mesa") -> int:
    resp = client.post("/api/assemblies", json={"name": name})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _part(client, project: int, **body) -> dict:
    resp = client.post(f"/api/assemblies/{project}/parts", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _trial(client, project: int) -> dict:
    resp = client.get(f"/api/assemblies/{project}/trial")
    assert resp.status_code == 200, resp.text
    return resp.json()


LIGHT = {"operator": "lte", "property_slug": "densidade", "value": 5, "unit": "g/cm**3"}
STIFF = {"operator": "gte", "property_slug": "modulo_young", "value": 1, "unit": "GPa"}


def test_a_part_is_tried_against_each_limit_of_its_study(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    steel = _material(db_session, "Aço%")
    study = _study(client, "Leve e rígido", [LIGHT, STIFF])
    project = _project(client)
    _part(client, project, name="Tampo", material_id=aluminium.id, study_id=study)
    _part(client, project, name="Perna", material_id=steel.id, study_id=study)

    body = _trial(client, project)
    top, leg = body["parts"]
    assert top["status"] == "passa"
    assert [r["verdict"] for r in top["requirements"]] == ["passa", "passa"]
    assert top["material_name"] == aluminium.name
    assert top["study"]["name"] == "Leve e rígido"
    assert top["reason"] is None
    # The steel is stiff enough and too dense: one line each, in the study's order.
    assert leg["status"] == "falha"
    assert [(r["verdict"], r["verdict_label"]) for r in leg["requirements"]] == [
        ("falha", "Não passa"),
        ("passa", "Passa"),
    ]
    assert "ensidade" in leg["requirements"][0]["label"]
    assert body["solved"] is False
    assert (body["passed_count"], body["failed_count"], body["pending_count"]) == (1, 1, 0)
    assert body["verdict_label"] == "Ainda não solucionado"
    assert body["summary"] == "De 2: 1 peça passa, 1 não passa."
    assert "Dado ausente não aprova" in body["method_note"]


def test_the_trial_agrees_with_a_run_of_the_same_study(client, db_session):
    """Whoever the study's own run keeps is exactly who passes the trial."""
    study = _study(client, "Leve", [LIGHT])
    run = client.post(f"/api/selection/studies/{study}/run")
    assert run.status_code == 200, run.text
    kept = {c["record_id"] for c in run.json()["candidates"]}
    project = _project(client)
    materials = db_session.execute(select(Material)).scalars().all()[:12]
    for index, material in enumerate(materials):
        _part(client, project, name=f"Peça {index}", material_id=material.id, study_id=study)
    for material, part in zip(materials, _trial(client, project)["parts"], strict=True):
        assert (part["status"] == "passa") == (material.id in kept), material.name


def test_every_part_passing_solves_the_project(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    study = _study(client, "Leve", [LIGHT])
    project = _project(client)
    _part(client, project, name="Tampo", material_id=aluminium.id, study_id=study)
    body = _trial(client, project)
    assert body["solved"] is True
    assert body["verdict_label"] == "Solucionado"
    assert body["summary"] == "A peça passa em todos os requisitos."


def test_absence_is_never_a_pass(client, db_session):
    """A limit on a property the material does not carry reads "sem dado"."""
    aluminium = _material(db_session, "%Alumínio%")
    carried = {v.property_definition.slug for v in aluminium.property_values if not v.is_missing}
    # The demo aluminium has no fatigue strength recorded.
    assert "resistencia_fadiga" not in carried
    study = _study(
        client,
        "Com dado ausente",
        [
            LIGHT,
            {"operator": "gte", "property_slug": "resistencia_fadiga", "value": 1, "unit": "MPa"},
        ],
    )
    project = _project(client)
    _part(client, project, name="Tampo", material_id=aluminium.id, study_id=study)
    body = _trial(client, project)
    part = body["parts"][0]
    assert [r["verdict"] for r in part["requirements"]] == ["passa", "sem_dado"]
    assert (part["status"], part["status_label"]) == ("sem_dado", "Falta dado para ensaiar")
    assert body["solved"] is False
    assert body["summary"] == "De 1: 1 não pôde ser aprovada."


def test_parts_that_cannot_be_tried_say_why_and_block_the_stamp(client, db_session):
    aluminium = _material(db_session, "%Alumínio%")
    study = _study(client, "Leve", [LIGHT])
    empty = _study(client, "Sem limites", [])
    project = _project(client)
    _part(client, project, name="Tampo", material_id=aluminium.id, study_id=study)
    _part(client, project, name="Perna", study_id=study)
    _part(client, project, name="Prego", material_id=aluminium.id)
    _part(client, project, name="Verniz", material_id=aluminium.id, study_id=empty)
    body = _trial(client, project)
    assert [p["status"] for p in body["parts"]] == [
        "passa",
        "sem_material",
        "sem_estudo",
        "sem_requisitos",
    ]
    assert body["parts"][1]["reason"] == "Escolha um material para a peça."
    assert "não há requisito" in body["parts"][2]["reason"]
    assert all(p["requirements"] == [] for p in body["parts"][1:])
    assert body["solved"] is False
    assert body["summary"] == "De 4: 1 peça passa, 3 não puderam ser aprovadas."


def test_an_alternative_is_one_requirement(client, db_session):
    """Under OU, meeting either limit is enough, and the line names both."""
    steel = _material(db_session, "Aço%")
    study = _study(client, "Leve ou rígido", [LIGHT, STIFF], combinator="OR")
    project = _project(client)
    _part(client, project, name="Perna", material_id=steel.id, study_id=study)
    part = _trial(client, project)["parts"][0]
    assert len(part["requirements"]) == 1
    assert " ou " in part["requirements"][0]["label"]
    assert part["status"] == "passa"


def test_an_empty_project_and_another_readers_project(client):
    project = _project(client)
    body = _trial(client, project)
    assert (body["solved"], body["parts"], body["summary"]) == (
        False,
        [],
        "O projeto ainda não tem peças.",
    )
    assert client.get("/api/assemblies/999999/trial").status_code == 404
