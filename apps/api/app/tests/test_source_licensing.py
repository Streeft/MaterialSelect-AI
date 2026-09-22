"""Integration tests for the source licensing gate (M1, docs/DECISIONS.md D-44).

Every new ``Source`` needs a registered license/procedência before an import
can incorporate it, and a source flagged as possibly containing third-party
data additionally needs an explicit human confirmation — both enforced before
any row is written (fail closed), and both a no-op for a source that already
exists (the decision was made once, at registration).
"""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.transport_mode import TransportMode

CSV_CONTENT = b"nome;classe;densidade [g/cm3]\nLiga Fonte Teste A;Metais;2,70\n"


@pytest.fixture(autouse=True)
def _uploads_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))


def _upload(client) -> int:
    resp = client.post(
        "/api/imports/upload",
        files={"file": ("materiais.csv", CSV_CONTENT, "text/csv")},
    )
    return resp.json()["job_id"]


def _mapping(**overrides) -> dict:
    mapping = {
        "name_column": "nome",
        "class_column": "classe",
        "source_label": "Fonte Nova de Teste",
        "columns": [
            {"column": "densidade [g/cm3]", "property_slug": "densidade", "unit": "g/cm**3"},
        ],
    }
    mapping.update(overrides)
    return mapping


def test_validate_rejects_new_source_without_license(client):
    job_id = _upload(client)
    resp = client.post(f"/api/imports/{job_id}/validate", json={"mapping": _mapping()})
    assert resp.status_code == 400
    assert "licença" in resp.json()["detail"].lower()


def test_validate_rejects_third_party_flag_without_confirmation(client):
    job_id = _upload(client)
    mapping = _mapping(
        source_license_label="CC-BY-4.0",
        source_contains_third_party_data=True,
        # source_review_confirmed intentionally omitted (defaults False)
    )
    resp = client.post(f"/api/imports/{job_id}/validate", json={"mapping": mapping})
    assert resp.status_code == 400
    assert "revisão" in resp.json()["detail"].lower()


def test_commit_succeeds_with_license_and_confirmation_and_stamps_reviewer(client):
    job_id = _upload(client)
    mapping = _mapping(
        source_license_label="CC-BY-4.0",
        source_license_url="https://creativecommons.org/licenses/by/4.0/",
        source_contains_third_party_data=True,
        source_review_confirmed=True,
    )
    validated = client.post(f"/api/imports/{job_id}/validate", json={"mapping": mapping})
    assert validated.status_code == 200
    committed = client.post(f"/api/imports/{job_id}/commit")
    assert committed.status_code == 200
    assert committed.json()["imported_count"] == 1

    sources = client.get("/api/sources").json()
    source = next(s for s in sources if s["label"] == "Fonte Nova de Teste")
    assert source["license_label"] == "CC-BY-4.0"
    assert source["license_url"] == "https://creativecommons.org/licenses/by/4.0/"
    assert source["contains_third_party_data"] is True
    assert source["reviewed_by_email"] == "pesquisador@example.com"  # test_user fixture
    assert source["reviewed_at"] is not None


def test_reusing_registered_source_does_not_require_reconfirmation(client):
    first_job = _upload(client)
    client.post(
        f"/api/imports/{first_job}/validate",
        json={"mapping": _mapping(source_license_label="Domínio público")},
    )
    first_commit = client.post(f"/api/imports/{first_job}/commit")
    assert first_commit.status_code == 200

    # Second import reuses the same source_label, with none of the licensing
    # fields set — must succeed, because the label already resolves to a
    # registered source.
    second_job = _upload(client)
    second_mapping = _mapping()  # no source_license_label this time
    validated = client.post(f"/api/imports/{second_job}/validate", json={"mapping": second_mapping})
    assert validated.status_code == 200
    committed = client.post(f"/api/imports/{second_job}/commit")
    assert committed.status_code == 200

    sources = client.get("/api/sources").json()
    matching = [s for s in sources if s["label"] == "Fonte Nova de Teste"]
    assert len(matching) == 1  # one Source row, reused, not duplicated
    assert matching[0]["license_label"] == "Domínio público"  # unchanged by the 2nd import


def test_import_without_source_label_is_unaffected(client):
    """No source_label at all: nothing gets registered, so the gate never fires."""
    job_id = _upload(client)
    mapping = _mapping()
    del mapping["source_label"]
    validated = client.post(f"/api/imports/{job_id}/validate", json={"mapping": mapping})
    assert validated.status_code == 200
    committed = client.post(f"/api/imports/{job_id}/commit")
    assert committed.status_code == 200


def test_list_sources_includes_seeded_demo_source(client):
    sources = client.get("/api/sources").json()
    demo = next(s for s in sources if s["label"] == "Dataset Demo MaterialSelect")
    assert demo["is_demo"] is True
    assert demo["license_label"] == "Dado fictício de demonstração — não é conteúdo de terceiro"
    assert demo["contains_third_party_data"] is False


def test_sources_requires_login(anon_client):
    resp = anon_client.get("/api/sources")
    assert resp.status_code == 401


def test_demo_material_values_cite_the_demo_source(client):
    """Regression: ``seed()`` used to overwrite ``demo_source`` on every
    iteration of the ``SOURCES`` loop, so after D-69 added a second source the
    variable ended up holding the *last* one (battery literature) instead of
    the demo source — and every one of the five core demo materials cited
    "Literatura de baterias (compilação)" for fictitious values.
    """
    materials = client.get("/api/materials", params={"search": "Liga Alumínio Demo A"}).json()
    material = next(m for m in materials if m["name"] == "Liga Alumínio Demo A")
    detail = client.get(f"/api/materials/{material['id']}").json()
    all_props = [p for g in detail["property_groups"] for p in g["properties"]]
    densidade = next(p for p in all_props if p["property_slug"] == "densidade")
    assert densidade["source_label"] == "Dataset Demo MaterialSelect"


def test_transport_modes_cite_the_demo_source(client, db_session: Session):
    """The four seeded transport modes are ``is_demo=True`` figures (D-66) and
    must cite the demo source too — same bug, same fix as the test above."""
    modes = db_session.execute(select(TransportMode)).scalars().all()
    assert len(modes) == 4
    for mode in modes:
        assert mode.source is not None
        assert mode.source.label == "Dataset Demo MaterialSelect"
