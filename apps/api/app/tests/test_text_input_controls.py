"""D-245: control characters are dropped from a name or description on the way in."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.domain.text_input import strip_controls
from app.schemas.material import MaterialCreate, MaterialUpdate
from app.schemas.selection import StudyIn


def test_controls_go_but_line_breaks_and_tabs_stay() -> None:
    assert strip_controls("Aço\x0b1020\x00") == "Aço1020"
    assert strip_controls("linha 1\nlinha 2\tfim\r\n") == "linha 1\nlinha 2\tfim\r\n"
    assert strip_controls("a\x7fb\ud800c") == "abc"
    assert strip_controls(None) is None and strip_controls(5) == 5


def test_material_create_and_update_are_cleaned() -> None:
    created = MaterialCreate(name="Liga\x0b1", class_id=1, description="a\x00b\nc")
    assert (created.name, created.description) == ("Liga1", "ab\nc")
    updated = MaterialUpdate(name="Nova\x1f", description=None)
    assert (updated.name, updated.description) == ("Nova", None)


def test_a_study_name_is_cleaned() -> None:
    study = StudyIn(name="Estudo\x00 A", description="d\x0b")
    assert (study.name, study.description) == ("Estudo A", "d")


def test_a_name_of_only_controls_is_refused_not_stored_blank() -> None:
    with pytest.raises(ValidationError):
        MaterialCreate(name="\x00\x01", class_id=1)


def test_the_api_stores_the_cleaned_name(client) -> None:
    response = client.post(
        "/api/materials",
        json={
            "name": "Liga\u000b suja",
            "class_id": 1,
            "is_own_record": True,
            "description": "ok\u0000",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Liga suja"
    assert body["description"] == "ok"
