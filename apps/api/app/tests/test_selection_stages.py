"""The stage pipeline, end to end through the service and the database (P0-1).

``test_filters.py`` proves the pure evaluation; this proves the wiring: stage
rows read back from the database, class ancestry read from the taxonomy, and
the two funnels (per stage and flat) the interface and the exports consume.

Stages are built directly as rows here because no API accepts them yet — that
is a later task. What the service does with them is already the whole point.
"""

from __future__ import annotations

import pytest

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.selection import ConstraintGroup, SelectionConstraint, SelectionStage


@pytest.fixture()
def study_id(client) -> int:
    """A saved study with no constraints — a blank canvas for stage rows."""
    payload = {
        "name": "Estudo multiestágio",
        "free_variables": [],
        "constraints": [],
        "criteria": [],
    }
    resp = client.post("/api/selection/studies", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _stage(db_session, study_id: int, *, position: int, kind: str, **kwargs) -> SelectionStage:
    stage = SelectionStage(
        study_id=study_id,
        position=position,
        kind=kind,
        label=kwargs.pop("label", None),
        enabled=kwargs.pop("enabled", True),
        class_slugs=kwargs.pop("class_slugs", []),
        include_descendants=kwargs.pop("include_descendants", True),
    )
    db_session.add(stage)
    db_session.flush()
    return stage


def _limit(db_session, study_id: int, stage: SelectionStage, **constraint) -> None:
    group = ConstraintGroup(
        study_id=study_id,
        parent_group_id=None,
        stage_id=stage.id,
        operator="AND",
        position=0,
    )
    db_session.add(group)
    db_session.flush()
    db_session.add(
        SelectionConstraint(
            study_id=study_id,
            group_id=group.id,
            position=0,
            class_slugs=[],
            **constraint,
        )
    )
    db_session.flush()


def _drop_backfilled_stage(db_session, study_id: int) -> None:
    """Remove the single stage `create_study` makes, so a test can describe the
    pipeline itself. Its own group goes with it (it has none: the study was
    saved with no constraints)."""
    for stage in db_session.query(SelectionStage).filter(SelectionStage.study_id == study_id).all():
        db_session.query(ConstraintGroup).filter(ConstraintGroup.stage_id == stage.id).delete()
        db_session.delete(stage)
    db_session.flush()


def _move_steel_into_a_subclass_of_metals(db_session) -> None:
    """Give the seeded taxonomy a real level: "Aço Demo B" moves out of Metais
    and into a child class of it. The seed is flat, so without this no test can
    tell a descendant walk from exact membership.

    The assignment is to `class_id` — the mapped column. Setting the plausible
    `material_class_id` instead does nothing and raises nothing: SQLAlchemy
    accepts any attribute on an instance, so the material would quietly stay in
    Metais and both tests below would pass while proving nothing.
    """
    metais = db_session.query(MaterialClass).filter(MaterialClass.slug == "metais").one()
    acos = MaterialClass(name="Aços carbono", slug="acos-carbono", parent_id=metais.id)
    db_session.add(acos)
    db_session.flush()
    steel = db_session.query(Material).filter(Material.name == "Aço Demo B").one()
    steel.class_id = acos.id
    db_session.flush()
    assert steel.material_class.slug == "acos-carbono"


def test_two_stages_intersect_and_are_reported_separately(client, db_session, study_id):
    _drop_backfilled_stage(db_session, study_id)
    _stage(db_session, study_id, position=0, kind="tree", class_slugs=["metais"])
    limite = _stage(db_session, study_id, position=1, kind="limit", label="Leves")
    _limit(
        db_session,
        study_id,
        limite,
        operator="lte",
        property_slug="densidade",
        value=2800.0,
        unit="kg/m**3",
    )
    result = client.post(f"/api/selection/studies/{study_id}/run").json()

    assert [s["kind"] for s in result["stages"]] == ["tree", "limit"]
    assert [s["label"] for s in result["stages"]] == [None, "Leves"]
    # Two metals are seeded; only one of them is under 2800 kg/m³.
    assert result["stages"][0]["remaining"] == 2
    assert result["stages"][1]["remaining"] == 1
    assert {c["name"] for c in result["candidates"]} == {"Liga Alumínio Demo A"}


def test_a_disabled_stage_stops_narrowing_but_still_reports_what_it_would_do(
    client, db_session, study_id
):
    _drop_backfilled_stage(db_session, study_id)
    _stage(db_session, study_id, position=0, kind="tree", class_slugs=["metais"])
    limite = _stage(db_session, study_id, position=1, kind="limit", enabled=False)
    _limit(
        db_session,
        study_id,
        limite,
        operator="lte",
        property_slug="densidade",
        value=2800.0,
        unit="kg/m**3",
    )

    result = client.post(f"/api/selection/studies/{study_id}/run").json()

    disabled = result["stages"][1]
    assert disabled["enabled"] is False
    # It did not narrow: the running count is what the tree stage left.
    assert disabled["remaining"] == 2
    # But it still says what it admits on its own, over the whole catalogue —
    # which is exactly why someone switches a stage off.
    assert disabled["passed"] == 3
    assert {c["name"] for c in result["candidates"]} == {"Liga Alumínio Demo A", "Aço Demo B"}


def test_the_flat_funnel_names_the_stage_when_there_is_more_than_one(client, db_session, study_id):
    _drop_backfilled_stage(db_session, study_id)
    _stage(db_session, study_id, position=0, kind="tree", class_slugs=["metais"], label="Só metais")
    limite = _stage(db_session, study_id, position=1, kind="limit", label="Leves")
    _limit(
        db_session,
        study_id,
        limite,
        operator="lte",
        property_slug="densidade",
        value=2800.0,
        unit="kg/m**3",
    )

    funnel = client.post(f"/api/selection/studies/{study_id}/run").json()["funnel"]

    assert funnel[0]["label"] == "Só metais"
    assert funnel[0]["operator"] == "in_tree"
    assert funnel[1]["label"].startswith("Leves · ")


def test_a_single_stage_study_reports_the_funnel_exactly_as_before(client, db_session):
    """The compatibility guarantee: a study saved through the flat payload has
    one stage, and its funnel carries no stage prefix at all."""
    payload = {
        "name": "Estudo de um estágio",
        "free_variables": [],
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 2800, "unit": "kg/m**3"}
        ],
        "criteria": [],
    }
    study_id = client.post("/api/selection/studies", json=payload).json()["id"]

    result = client.post(f"/api/selection/studies/{study_id}/run").json()

    assert len(result["stages"]) == 1
    assert result["combinator"] == "AND"
    assert len(result["funnel"]) == 1
    assert " · " not in result["funnel"][0]["label"]
    assert result["funnel"][0]["operator"] == "lte"


def test_a_tree_stage_admits_a_material_in_a_descendant_class(client, db_session, study_id):
    """The capability `in_class` cannot express: ticking a branch of the
    taxonomy admits everything under it."""
    _move_steel_into_a_subclass_of_metals(db_session)

    _drop_backfilled_stage(db_session, study_id)
    _stage(db_session, study_id, position=0, kind="tree", class_slugs=["metais"])

    result = client.post(f"/api/selection/studies/{study_id}/run").json()

    # The steel now sits one level down and is still admitted by "metais".
    assert {c["name"] for c in result["candidates"]} == {"Liga Alumínio Demo A", "Aço Demo B"}


def test_without_descendants_a_branch_admits_nothing(client, db_session, study_id):
    _move_steel_into_a_subclass_of_metals(db_session)

    _drop_backfilled_stage(db_session, study_id)
    _stage(
        db_session,
        study_id,
        position=0,
        kind="tree",
        class_slugs=["metais"],
        include_descendants=False,
    )

    result = client.post(f"/api/selection/studies/{study_id}/run").json()

    # Exact membership: the steel moved out of "metais", so only the aluminium
    # (still directly in it) survives. This is the old `in_class` behaviour,
    # available on purpose for someone who wants precisely it.
    assert {c["name"] for c in result["candidates"]} == {"Liga Alumínio Demo A"}


def test_a_study_whose_rows_describe_no_stage_still_runs_its_constraints(
    client, db_session, study_id
):
    """Degradation, not an empty pipeline: a study with no stage row must not
    silently admit the whole catalogue."""
    payload = {
        "name": "Estudo sem estágio",
        "free_variables": [],
        "constraints": [
            {"operator": "lte", "property_slug": "densidade", "value": 2800, "unit": "kg/m**3"}
        ],
        "criteria": [],
    }
    other_id = client.post("/api/selection/studies", json=payload).json()["id"]
    # Delete only the stage row, leaving the group and the constraint behind —
    # the shape a partial restore or a hand-edited database could produce.
    db_session.query(SelectionStage).filter(SelectionStage.study_id == other_id).delete()
    db_session.flush()

    result = client.post(f"/api/selection/studies/{other_id}/run").json()

    assert result["final_count"] == 3
    assert len(result["stages"]) == 1
