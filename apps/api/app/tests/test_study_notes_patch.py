"""FL-c (D-240): a saved study's note is edited in place, and nothing else is."""

from __future__ import annotations

from app.models.audit import AuditEvent


def _study(client) -> dict:
    resp = client.post(
        "/api/selection/studies",
        json={
            "name": "Nota editável",
            "notes": "primeira versão",
            "constraints": [
                {"operator": "lte", "property_slug": "densidade", "value": 5, "unit": "g/cm**3"}
            ],
            "criteria": [],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_patch_changes_only_the_note(client):
    study = _study(client)
    resp = client.patch(f"/api/selection/studies/{study['id']}", json={"notes": "  revista  "})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["notes"] == "revista"
    # What the study computes is untouched.
    for key in ("name", "stages", "criteria", "combinator"):
        assert body[key] == study[key]
    assert client.get(f"/api/selection/studies/{study['id']}").json()["notes"] == "revista"


def test_blank_note_clears_it(client):
    study = _study(client)
    resp = client.patch(f"/api/selection/studies/{study['id']}", json={"notes": "   "})
    assert resp.status_code == 200
    assert resp.json()["notes"] is None


def test_other_fields_are_refused_or_ignored(client):
    study = _study(client)
    resp = client.patch(
        f"/api/selection/studies/{study['id']}", json={"notes": "x", "name": "Outro nome"}
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Nota editável"


def test_unknown_study_is_404(client):
    assert client.patch("/api/selection/studies/99999", json={"notes": "x"}).status_code == 404


def test_the_edit_is_audited_once(client, db_session):
    study = _study(client)
    client.patch(f"/api/selection/studies/{study['id']}", json={"notes": "nova"})
    client.patch(f"/api/selection/studies/{study['id']}", json={"notes": "nova"})
    events = (
        db_session.query(AuditEvent)
        .filter(AuditEvent.entity_id == study["id"], AuditEvent.action == "ATUALIZADO")
        .all()
    )
    assert len(events) == 1
    assert events[0].changes == {"notes": {"before": "primeira versão", "after": "nova"}}


def test_the_list_carries_the_note(client):
    study = _study(client)
    listed = {s["id"]: s for s in client.get("/api/selection/studies").json()}
    assert listed[study["id"]]["notes"] == "primeira versão"
