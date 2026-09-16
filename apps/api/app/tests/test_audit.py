"""Integration tests for the audit trail (M2): who changed what, and when."""

from __future__ import annotations

import pytest

from app.config import settings


def _metais_class_id(client) -> int:
    classes = client.get("/api/classes").json()
    return next(c for c in classes if c["slug"] == "metais")["id"]


def _new_material_payload(client, **overrides) -> dict:
    payload = {
        "name": "Material Auditado Demo",
        "class_id": _metais_class_id(client),
        "subclass": "Teste",
        "description": "Criado em teste de auditoria.",
        "keywords": ["auditoria"],
        "values": [
            {"property_slug": "densidade", "kind": "scalar", "value": 2.5, "unit": "g/cm**3"},
        ],
    }
    payload.update(overrides)
    return payload


def _audit_events(client, **params) -> list[dict]:
    resp = client.get("/api/audit", params=params)
    assert resp.status_code == 200
    return resp.json()


# --- access -----------------------------------------------------------------


def test_audit_requires_login(anon_client):
    resp = anon_client.get("/api/audit")
    assert resp.status_code == 401


# --- materials ---------------------------------------------------------------


def test_create_material_records_event(client):
    created = client.post("/api/materials", json=_new_material_payload(client)).json()

    events = _audit_events(client, entity_type="material", entity_id=created["id"])
    assert len(events) == 1
    event = events[0]
    assert event["action"] == "CRIADO"
    assert event["entity_label"] == "Material Auditado Demo"
    assert event["user_email"] == "pesquisador@example.com"  # test_user fixture
    assert event["changes"] is None


def test_update_material_records_field_diff(client):
    created = client.post("/api/materials", json=_new_material_payload(client)).json()
    client.patch(f"/api/materials/{created['id']}", json={"name": "Nome Alterado Demo"})

    events = _audit_events(client, entity_type="material", entity_id=created["id"])
    updated = next(e for e in events if e["action"] == "ATUALIZADO")
    assert updated["changes"]["name"] == {
        "before": "Material Auditado Demo",
        "after": "Nome Alterado Demo",
    }
    assert "class_id" not in updated["changes"]  # unchanged fields are not reported
    assert updated["entity_label"] == "Nome Alterado Demo"  # label reflects the new name


def test_update_material_with_no_actual_change_records_nothing(client):
    created = client.post("/api/materials", json=_new_material_payload(client)).json()
    client.patch(f"/api/materials/{created['id']}", json={"name": created["name"]})

    events = _audit_events(client, entity_type="material", entity_id=created["id"])
    assert [e["action"] for e in events] == ["CRIADO"]  # no spurious ATUALIZADO


def test_deactivate_material_records_excluido_once(client):
    created = client.post("/api/materials", json=_new_material_payload(client)).json()
    client.delete(f"/api/materials/{created['id']}")
    client.delete(f"/api/materials/{created['id']}")  # idempotent: second call is a no-op

    events = _audit_events(client, entity_type="material", entity_id=created["id"])
    assert [e["action"] for e in events].count("EXCLUIDO") == 1


def test_replace_property_values_records_diff_by_slug(client):
    created = client.post("/api/materials", json=_new_material_payload(client)).json()
    client.put(
        f"/api/materials/{created['id']}/values",
        json=[
            {"property_slug": "densidade", "kind": "scalar", "value": 3.0, "unit": "g/cm**3"},
            {"property_slug": "modulo_young", "kind": "scalar", "value": 70.0, "unit": "GPa"},
        ],
    )

    events = _audit_events(client, entity_type="material", entity_id=created["id"])
    updated = next(e for e in events if e["action"] == "ATUALIZADO")
    assert updated["changes"]["densidade"] == {"before": "2.5 g/cm**3", "after": "3 g/cm**3"}
    assert updated["changes"]["modulo_young"] == {"before": None, "after": "70 GPa"}


# --- classes ------------------------------------------------------------------


def test_class_crud_records_events(client):
    created = client.post("/api/classes", json={"name": "Classe Auditada Demo"}).json()
    client.put(
        f"/api/classes/{created['id']}",
        json={"name": "Classe Auditada Demo", "description": "Agora com descrição."},
    )
    client.delete(f"/api/classes/{created['id']}")

    events = _audit_events(client, entity_type="material_class", entity_id=created["id"])
    actions = [e["action"] for e in events]
    assert actions == ["EXCLUIDO", "ATUALIZADO", "CRIADO"]  # most recent first
    updated = next(e for e in events if e["action"] == "ATUALIZADO")
    assert updated["changes"] == {"description": {"before": None, "after": "Agora com descrição."}}


# --- properties -----------------------------------------------------------------


def test_property_crud_records_events(client):
    created = client.post(
        "/api/properties",
        json={
            "name": "Propriedade Auditada Demo",
            "category": "FISICA",
            "physical_dimension": "[length]",
            "canonical_unit": "m",
            "accepted_units": ["m", "cm"],
        },
    ).json()
    client.put(
        f"/api/properties/{created['id']}",
        json={
            "name": "Propriedade Auditada Demo",
            "category": "FISICA",
            "physical_dimension": "[length]",
            "canonical_unit": "m",
            "accepted_units": ["m", "cm", "mm"],
        },
    )
    client.delete(f"/api/properties/{created['id']}")

    events = _audit_events(client, entity_type="property_definition", entity_id=created["id"])
    actions = [e["action"] for e in events]
    assert actions == ["EXCLUIDO", "ATUALIZADO", "CRIADO"]


# --- performance indices ---------------------------------------------------------


def test_create_performance_index_records_event(client):
    created = client.post(
        "/api/performance-indices",
        json={
            "name": "Índice Auditado Demo",
            "expression": "modulo_young / densidade",
            "goal": "maximize",
        },
    ).json()

    events = _audit_events(client, entity_type="performance_index", entity_id=created["id"])
    assert [e["action"] for e in events] == ["CRIADO"]


# --- selection studies: creation, deletion, and privacy -------------------------


def _study_payload(name: str = "Estudo Auditado Demo") -> dict:
    return {
        "name": name,
        "combinator": "AND",
        "constraints": [],
        "normalization": "minmax",
        "criteria": [],
    }


def test_study_crud_records_events(client):
    created = client.post("/api/selection/studies", json=_study_payload()).json()
    client.delete(f"/api/selection/studies/{created['id']}")

    events = _audit_events(client, entity_type="selection_study", entity_id=created["id"])
    assert [e["action"] for e in events] == ["EXCLUIDO", "CRIADO"]
    assert events[0]["entity_label"] == "Estudo Auditado Demo"


def test_other_users_study_events_are_not_visible(client, other_user, login_as):
    with login_as(other_user):
        other_study = client.post(
            "/api/selection/studies", json=_study_payload("Estudo do Outro Usuário")
        ).json()

    # Back to test_user (the default `client` identity): the other project's
    # study events must not leak through the generic feed, by id or in a
    # mixed (unfiltered-by-id) listing.
    scoped = _audit_events(client, entity_type="selection_study", entity_id=other_study["id"])
    assert scoped == []

    mixed = _audit_events(client, entity_type="selection_study")
    assert other_study["id"] not in {e["entity_id"] for e in mixed}


def test_own_study_events_stay_visible_after_deletion(client):
    created = client.post("/api/selection/studies", json=_study_payload()).json()
    client.delete(f"/api/selection/studies/{created['id']}")

    # The study row is gone, but its own owner can still see its history —
    # the audit row keeps a project_id snapshot precisely so deletion (the
    # event that matters most) does not also erase visibility of itself.
    events = _audit_events(client, entity_type="selection_study", entity_id=created["id"])
    assert [e["action"] for e in events] == ["EXCLUIDO", "CRIADO"]


# --- bulk import bypasses per-material audit (documented limitation) ------------


@pytest.fixture(autouse=True)
def _uploads_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))


def test_import_commit_does_not_record_material_events(client):
    """ImportService builds Material rows directly, bypassing MaterialService's
    public mutation methods (and therefore this audit trail) — see the note
    on AuditEntityType.MATERIAL. This test documents that as current
    behaviour, not as an oversight.
    """
    csv_content = b"nome;classe;densidade [g/cm3]\nMaterial Importado Demo;Metais;2,70\n"
    job_id = client.post(
        "/api/imports/upload",
        files={"file": ("materiais.csv", csv_content, "text/csv")},
    ).json()["job_id"]
    mapping = {
        "name_column": "nome",
        "class_column": "classe",
        "columns": [
            {"column": "densidade [g/cm3]", "property_slug": "densidade", "unit": "g/cm**3"},
        ],
    }
    client.post(f"/api/imports/{job_id}/validate", json={"mapping": mapping})
    commit = client.post(f"/api/imports/{job_id}/commit").json()
    assert commit["imported_count"] == 1

    events = _audit_events(client, entity_type="material")
    assert events == []
