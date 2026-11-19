"""Editing an ordinal scale by hand: ``GET|PUT /api/properties/ordinais/{slug}/escala`` (D-251, ORD-c).

What is under test is the *refusal* as much as the edit: a scale is an order that
materials (by level id), saved studies and the project's scenarios (both by label)
all point into, so a change that would leave any of them pointing at a level that
is gone, silently renamed or moved is refused with the reason — and a change that
is accepted is one audit row with the scale before and after.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.dependencies import can_edit_shared_catalog
from app.domain.use_scenarios import USE_SCENARIOS
from app.main import app
from app.models.audit import AuditEvent
from app.models.enums import AuditEntityType
from app.models.material import Material
from app.models.ordinal_property import MaterialOrdinalValue, OrdinalPropertyDefinition
from app.tests.test_ordinal_properties import SCALE, SLUG, _definition, _level

URL = f"/api/properties/ordinais/{SLUG}/escala"


@pytest.fixture()
def ordinal(db_session):
    """The five-level scale, held by three materials (Excelente, Aceitável, Pobre) and one absence."""
    definition = _definition(db_session)
    materials = list(
        db_session.execute(
            select(Material).where(Material.is_active.is_(True)).order_by(Material.id).limit(4)
        ).scalars()
    )
    by_label = {level.label: level for level in definition.levels}
    for material, label in zip(materials[:3], ["Excelente", "Aceitável", "Pobre"], strict=True):
        db_session.add(
            MaterialOrdinalValue(
                material_id=material.id,
                definition_id=definition.id,
                level_id=by_label[label].id,
            )
        )
    db_session.add(
        MaterialOrdinalValue(
            material_id=materials[3].id, definition_id=definition.id, is_missing=True
        )
    )
    db_session.flush()
    return definition


def _scale(client) -> list[dict]:
    return client.get(URL).json()["levels"]


def _put(client, levels: list[dict], **extra):
    return client.put(URL, json={"levels": levels, **extra})


def _same(levels: list[dict]) -> list[dict]:
    return [{"id": level["id"], "label": level["label"]} for level in levels]


def _events(db_session) -> list[AuditEvent]:
    return list(
        db_session.execute(
            select(AuditEvent).where(AuditEvent.entity_type == AuditEntityType.ORDINAL_PROPERTY)
        ).scalars()
    )


def test_the_curator_reads_the_scale_with_what_depends_on_each_level(client, ordinal) -> None:
    levels = _scale(client)
    assert [level["label"] for level in levels] == list(SCALE)
    assert [level["rank"] for level in levels] == [0, 1, 2, 3, 4]
    held = {level["label"]: level["value_count"] for level in levels}
    # One material holds each of Excelente, Aceitável and Pobre; a recorded absence holds none.
    assert held == {
        "Muito pobre": 0,
        "Pobre": 1,
        "Aceitável": 1,
        "Bom": 0,
        "Excelente": 1,
    }
    assert all(level["study_count"] == 0 and level["scenario_count"] == 0 for level in levels)


def test_a_level_added_in_the_middle_keeps_every_held_level_and_is_audited(
    client, ordinal, db_session
) -> None:
    before = _scale(client)
    new = [
        *_same(before[:2]),
        {"label": "Regular"},
        *_same(before[2:]),
    ]
    response = _put(client, new)
    assert response.status_code == 200, response.text
    after = response.json()["levels"]
    assert [level["label"] for level in after] == [
        "Muito pobre",
        "Pobre",
        "Regular",
        "Aceitável",
        "Bom",
        "Excelente",
    ]
    assert [level["rank"] for level in after] == [0, 1, 2, 3, 4, 5]
    # The levels that existed are the same rows: the materials still hold them.
    old_ids = {level["label"]: level["id"] for level in before}
    assert {level["label"]: level["id"] for level in after if level["label"] in old_ids} == old_ids
    assert {level["label"]: level["value_count"] for level in after}["Aceitável"] == 1

    [event] = _events(db_session)
    assert event.changes is not None
    assert event.changes["escala"]["before"] == list(SCALE)
    assert event.changes["escala"]["after"][2] == "Regular"
    assert event.action.value == "ATUALIZADO"


def test_an_unchanged_scale_writes_nothing_and_no_audit_row(client, ordinal, db_session) -> None:
    response = _put(client, _same(_scale(client)))
    assert response.status_code == 200, response.text
    assert _events(db_session) == []


def test_a_level_nobody_uses_is_renamed_and_two_levels_can_swap_names(client, ordinal) -> None:
    levels = _scale(client)
    renamed = _same(levels)
    renamed[0]["label"] = "Péssimo"
    assert _put(client, renamed).status_code == 200
    swapped = _same(_scale(client))
    swapped[3]["label"], swapped[4]["label"] = swapped[4]["label"], swapped[3]["label"]
    response = _put(client, swapped)
    assert response.status_code == 200, response.text
    assert [level["label"] for level in response.json()["levels"]][3:] == ["Excelente", "Bom"]


def test_a_level_a_material_holds_is_never_removed(client, ordinal) -> None:
    levels = _scale(client)
    without_pobre = _same([level for level in levels if level["label"] != "Pobre"])
    response = _put(client, without_pobre)
    assert response.status_code == 409
    assert "Pobre" in response.json()["detail"] and "1 material" in response.json()["detail"]
    assert [level["label"] for level in _scale(client)] == list(SCALE)


def test_an_unused_level_is_removed(client, ordinal) -> None:
    levels = _scale(client)
    response = _put(client, _same([level for level in levels if level["label"] != "Bom"]))
    assert response.status_code == 200, response.text
    assert [level["label"] for level in response.json()["levels"]] == [
        "Muito pobre",
        "Pobre",
        "Aceitável",
        "Excelente",
    ]


def _study_asking_for(client, label: str) -> None:
    created = client.post(
        "/api/selection/studies",
        json={
            "name": "Pede um nível",
            "stages": [{"kind": "limit", "constraints": [_level(label)]}],
        },
    )
    assert created.status_code == 201, created.text


def test_a_level_a_saved_study_asks_for_cannot_be_renamed_removed_or_reordered(
    client, ordinal
) -> None:
    _study_asking_for(client, "Bom")
    levels = _scale(client)
    assert {level["label"]: level["study_count"] for level in levels}["Bom"] == 1

    rename = _same(levels)
    rename[3]["label"] = "Muito bom"
    refused = _put(client, rename)
    assert refused.status_code == 409 and "1 estudo salvo" in refused.json()["detail"]

    remove = _put(client, _same([level for level in levels if level["label"] != "Bom"]))
    assert remove.status_code == 409 and "1 estudo salvo" in remove.json()["detail"]

    # Even the order of two *other* levels is frozen: "pelo menos Bom" would change meaning.
    reorder = _same(levels)
    reorder[0], reorder[1] = reorder[1], reorder[0]
    moved = _put(client, reorder)
    assert moved.status_code == 409 and "ordem" in moved.json()["detail"]

    # What does not touch the order or the asked-for label is still allowed.
    assert _put(client, [*_same(levels), {"label": "Excepcional"}]).status_code == 200
    assert [level["label"] for level in _scale(client)][-1] == "Excepcional"


def test_without_a_study_the_existing_levels_can_be_reordered(client, ordinal) -> None:
    levels = _same(_scale(client))
    levels[0], levels[1] = levels[1], levels[0]
    response = _put(client, levels)
    assert response.status_code == 200, response.text
    assert [level["label"] for level in response.json()["levels"]][:2] == ["Pobre", "Muito pobre"]


def test_a_scenario_that_asks_for_a_label_freezes_it() -> None:
    """The project's table is code: its labels are counted like a saved study's."""
    from app.services.ordinal_scale_service import _scenario_counts

    limit = next(c for s in USE_SCENARIOS for c in s.constraints if c.operator == "level_at_least")
    counts = _scenario_counts(limit.property_slug)
    assert counts[limit.level] >= 1
    assert _scenario_counts("propriedade-que-nenhum-cenario-pede") == {}


def test_the_scale_is_validated(client, ordinal) -> None:
    levels = _same(_scale(client))
    # Two spellings of one level.
    duplicate = [*levels, {"label": "  bom "}]
    assert _put(client, duplicate).status_code == 400
    # A level twice, a level of nobody, and a scale that is not an order.
    assert _put(client, [levels[0], levels[0], levels[1]]).status_code == 400
    assert _put(client, [{"id": 999999, "label": "X"}, levels[0]]).status_code == 400
    assert _put(client, [levels[0]]).status_code == 422
    assert _put(client, [levels[0], {"label": "   "}]).status_code == 422
    assert _put(client, [{"label": str(i)} for i in range(13)]).status_code == 422
    assert [level["label"] for level in _scale(client)] == list(SCALE)


def test_name_and_description_are_edited_and_null_clears_the_text(client, ordinal) -> None:
    levels = _same(_scale(client))
    response = _put(client, levels, name="Durabilidade em água doce", description="Texto.")
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Durabilidade em água doce"
    assert response.json()["description"] == "Texto."
    cleared = _put(client, levels, description=None)
    assert cleared.json()["description"] is None
    assert _put(client, levels, name="  ").status_code == 400


def test_a_name_already_used_by_another_ordinal_property_is_a_conflict(
    client, ordinal, db_session
) -> None:
    _definition(db_session, slug="outra-escala", name="Biocompatibilidade de teste")
    db_session.flush()
    response = _put(client, _same(_scale(client)), name="biocompatibilidade de teste")
    assert response.status_code == 409


def test_an_unknown_property_is_a_404(client) -> None:
    assert client.get("/api/properties/ordinais/nao-existe/escala").status_code == 404
    assert (
        client.put(
            "/api/properties/ordinais/nao-existe/escala",
            json={"levels": [{"label": "A"}, {"label": "B"}]},
        ).status_code
        == 404
    )


@pytest.fixture()
def _read_only():
    app.dependency_overrides[can_edit_shared_catalog] = lambda: False
    yield
    app.dependency_overrides.pop(can_edit_shared_catalog, None)


def test_without_curator_rights_neither_read_nor_edit_is_open(client, ordinal, _read_only) -> None:
    assert client.get(URL).status_code == 403
    assert _put(client, [{"label": "A"}, {"label": "B"}]).status_code == 403


def test_the_definition_is_still_a_closed_scale_for_the_selection(client, ordinal) -> None:
    """After an edit the filter reads the new order: a new level between two is real."""
    levels = _scale(client)
    _put(client, [*_same(levels[:3]), {"label": "Regular"}, *_same(levels[3:])])
    refreshed = client.get("/api/properties/ordinais").json()
    scale = next(p for p in refreshed if p["slug"] == SLUG)
    assert scale["levels"] == [
        "Muito pobre",
        "Pobre",
        "Aceitável",
        "Regular",
        "Bom",
        "Excelente",
    ]
    assert OrdinalPropertyDefinition.__tablename__ == "ordinal_property_definition"
