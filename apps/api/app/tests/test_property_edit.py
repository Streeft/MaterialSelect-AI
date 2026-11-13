"""Editing a property from the Admin: ``PATCH /api/properties/{id}`` (D-233).

Three fields only — name, description and reading unit — because they are the
ones that can change without touching a stored number. The slug is what URLs and
saved studies name the property by, and the physical dimension is what every
conversion is checked against; neither is in this payload, so a client cannot
change them by accident (the ``PUT`` still exists for the curator who means to).
"""

from __future__ import annotations

import pytest

from app.dependencies import can_edit_shared_catalog
from app.main import app


def _density(client):
    return next(p for p in client.get("/api/properties").json() if p["slug"] == "densidade")


def _patch(client, prop, **body):
    return client.patch(f"/api/properties/{prop['id']}", json=body)


def test_name_description_and_reading_unit_change_and_nothing_else(client):
    before = _density(client)
    assert "g/cm**3" in before["accepted_units"]

    resp = _patch(
        client,
        before,
        name="Densidade (massa específica)",
        description="Massa por volume.",
        display_unit="g/cm**3",
    )

    assert resp.status_code == 200, resp.text
    after = resp.json()
    assert after["name"] == "Densidade (massa específica)"
    assert after["description"] == "Massa por volume."
    assert after["display_unit"] == "g/cm**3"
    # Identity and what the numbers rest on are untouched.
    for field in (
        "slug",
        "physical_dimension",
        "canonical_unit",
        "accepted_units",
        "category",
        "is_interval",
        "better_direction",
        "allows_log_scale",
        "value_count",
    ):
        assert after[field] == before[field], field


def test_a_field_left_out_is_left_alone_and_null_clears_what_may_be_cleared(client):
    prop = _density(client)
    _patch(client, prop, description="Texto", display_unit="g/cm**3")

    # Only the name: description and reading unit stay.
    only_name = _patch(client, prop, name="Densidade ρ").json()
    assert only_name["description"] == "Texto"
    assert only_name["display_unit"] == "g/cm**3"

    # null clears them (reading "as stored" is a legitimate answer).
    cleared = _patch(client, prop, description=None, display_unit=None).json()
    assert cleared["description"] is None
    assert cleared["display_unit"] is None
    assert cleared["name"] == "Densidade ρ"


def test_the_slug_and_the_dimension_cannot_be_changed_through_this_route(client):
    prop = _density(client)
    resp = _patch(client, prop, slug="outra-coisa", physical_dimension="[length]", name="Densidade")
    assert resp.status_code == 200
    after = _density(client)
    assert after["slug"] == "densidade"
    assert after["physical_dimension"] == prop["physical_dimension"]


def test_the_reading_unit_must_be_compatible_and_among_the_accepted_ones(client):
    prop = _density(client)
    # Another dimension altogether.
    assert _patch(client, prop, display_unit="meter").status_code == 400
    # Compatible but not offered to the reader.
    resp = _patch(client, prop, display_unit="lb/ft**3")
    assert resp.status_code == 400
    assert "aceitas" in resp.json()["detail"]
    assert _density(client)["display_unit"] == prop["display_unit"]


def test_a_blank_name_and_a_null_name_are_refused(client):
    prop = _density(client)
    assert _patch(client, prop, name="   ").status_code == 400
    assert _patch(client, prop, name=None).status_code == 400
    assert _density(client)["name"] == prop["name"]


def test_a_name_another_property_already_uses_is_a_conflict(client):
    props = client.get("/api/properties").json()
    density = next(p for p in props if p["slug"] == "densidade")
    other = next(p for p in props if p["slug"] != "densidade")
    resp = _patch(client, density, name=other["name"].upper())
    assert resp.status_code == 409


def test_keeping_its_own_name_is_not_a_conflict(client):
    prop = _density(client)
    assert _patch(client, prop, name=prop["name"], description="Igual").status_code == 200


def test_unknown_property_is_404(client):
    assert client.patch("/api/properties/999999", json={"name": "X"}).status_code == 404


def test_the_edit_is_in_the_audit_trail_with_only_what_changed(client):
    prop = _density(client)
    _patch(client, prop, description="Nova descrição")
    events = client.get(
        "/api/audit", params={"entity_type": "property_definition", "entity_id": prop["id"]}
    ).json()
    updated = next(e for e in events if e["action"] == "ATUALIZADO")
    assert updated["changes"] == {
        "description": {"before": prop["description"], "after": "Nova descrição"}
    }


@pytest.fixture()
def _read_only():
    app.dependency_overrides[can_edit_shared_catalog] = lambda: False
    yield
    app.dependency_overrides.pop(can_edit_shared_catalog, None)


def test_without_curator_rights_the_edit_is_refused(client, _read_only):
    prop = _density(client)
    assert _patch(client, prop, name="Outro").status_code == 403
