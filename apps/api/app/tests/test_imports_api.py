"""Integration tests for the import wizard API (upload → validate → commit → rollback)."""

from __future__ import annotations

import pytest

from app.config import settings


@pytest.fixture(autouse=True)
def _uploads_in_tmp(tmp_path, monkeypatch):
    """Keep uploaded files inside pytest's tmp dir."""
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))


CSV_CONTENT = """nome;classe;densidade [g/cm3];modulo_young [GPa];limite_escoamento [MPa];temp_max [degC];palavras_chave
Liga Import A;Metais;2,70;70 GPa;240 - 300;150;leve;importado
Polimero Import B;Polímeros;1.05;2.5;40-60 MPa;N/A;isolante
Linha Invalida C;ClasseInexistente;abc;10;;;
Liga Import A;Metais;2,70;70;;;
Aço Demo B;Metais;7.85;210;;;
=FormulaPerigosa;Metais;1.0;10;;;
""".encode()

MAPPING = {
    "name_column": "nome",
    "class_column": "classe",
    "keywords_column": "palavras_chave",
    "source_label": "Planilha de teste",
    "columns": [
        {"column": "densidade [g/cm3]", "property_slug": "densidade", "unit": "g/cm**3"},
        {"column": "modulo_young [GPa]", "property_slug": "modulo_young", "unit": "GPa"},
        {"column": "limite_escoamento [MPa]", "property_slug": "limite_escoamento", "unit": "MPa"},
        {"column": "temp_max [degC]", "property_slug": "temp_max_servico", "unit": "degC"},
    ],
}


def _upload(client, content: bytes = CSV_CONTENT, filename: str = "materiais.csv"):
    return client.post(
        "/api/imports/upload",
        files={"file": (filename, content, "text/csv")},
    )


def test_upload_returns_headers_sample_and_suggestions(client):
    resp = _upload(client)
    assert resp.status_code == 200
    body = resp.json()
    assert body["file_format"] == "csv"
    assert "nome" in body["headers"]
    assert body["row_count"] == 6
    assert len(body["sample_rows"]) == 6

    by_column = {s["column"]: s for s in body["suggestions"]}
    assert by_column["nome"]["suggested_target"] == "name"
    assert by_column["classe"]["suggested_target"] == "class"
    dens = by_column["densidade [g/cm3]"]
    assert dens["suggested_target"] == "property"
    assert dens["suggested_property_slug"] == "densidade"
    assert dens["suggested_unit"] == "g/cm**3"


def test_upload_rejects_wrong_extension(client):
    resp = _upload(client, filename="materiais.exe")
    assert resp.status_code == 400


def test_upload_rejects_oversized_file(client, monkeypatch):
    monkeypatch.setattr(settings, "max_upload_bytes", 10)
    resp = _upload(client)
    assert resp.status_code == 400


def test_validate_reports_row_status(client):
    job_id = _upload(client).json()["job_id"]
    resp = client.post(f"/api/imports/{job_id}/validate", json={"mapping": MAPPING})
    assert resp.status_code == 200
    report = resp.json()

    assert report["row_count"] == 6
    assert report["valid_count"] == 3  # A, B and the sanitized formula row
    assert report["error_count"] == 1  # unknown class + unparsable density
    assert report["duplicate_count"] == 2  # repeat in file + existing "Aço Demo B"

    by_row = {r["row_number"]: r for r in report["rows"]}
    assert by_row[1]["status"] == "ok"
    assert by_row[3]["status"] == "error"
    messages = " ".join(i["message"] for i in by_row[3]["issues"])
    assert "ClasseInexistente" in messages
    assert by_row[4]["status"] == "duplicate"
    assert by_row[5]["status"] == "duplicate"
    assert by_row[6]["status"] == "ok"
    assert by_row[6]["warnings"]  # formula sanitisation warning


def test_validate_unknown_column_fails(client):
    job_id = _upload(client).json()["job_id"]
    bad = dict(MAPPING, name_column="coluna_inexistente")
    resp = client.post(f"/api/imports/{job_id}/validate", json={"mapping": bad})
    assert resp.status_code == 400


def test_commit_imports_only_valid_rows(client):
    job_id = _upload(client).json()["job_id"]
    client.post(f"/api/imports/{job_id}/validate", json={"mapping": MAPPING})
    resp = client.post(f"/api/imports/{job_id}/commit")
    assert resp.status_code == 200
    result = resp.json()
    assert result["status"] == "IMPORTADO"
    assert result["imported_count"] == 3

    listing = client.get("/api/materials").json()
    names = {m["name"] for m in listing}
    assert "Liga Import A" in names
    assert "Polimero Import B" in names
    assert "Linha Invalida C" not in names
    assert "FormulaPerigosa" in names  # formula prefix stripped, material kept

    # Full trail on an imported value: decimal comma + in-cell unit override.
    liga = next(m for m in listing if m["name"] == "Liga Import A")
    detail = client.get(f"/api/materials/{liga['id']}").json()
    props = {p["property_slug"]: p for g in detail["property_groups"] for p in g["properties"]}

    dens = props["densidade"]
    assert dens["value_scalar"] == 2.70
    assert abs(dens["normalized_value"] - 2700.0) < 1e-6
    assert dens["data_quality"] == "IMPORTADO"
    assert dens["source_label"] == "Planilha de teste"

    esc = props["limite_escoamento"]  # "240 - 300" range cell
    assert (esc["value_min"], esc["value_max"]) == (240.0, 300.0)

    temp = props["temp_max_servico"]  # degC -> K conversion
    assert abs(temp["normalized_value"] - 423.15) < 1e-6


def test_commit_requires_validated_job(client):
    job_id = _upload(client).json()["job_id"]
    resp = client.post(f"/api/imports/{job_id}/commit")
    assert resp.status_code == 409


def test_missing_cell_becomes_missing_value_not_zero(client):
    job_id = _upload(client).json()["job_id"]
    client.post(f"/api/imports/{job_id}/validate", json={"mapping": MAPPING})
    client.post(f"/api/imports/{job_id}/commit")

    listing = client.get("/api/materials").json()
    polimero = next(m for m in listing if m["name"] == "Polimero Import B")
    detail = client.get(f"/api/materials/{polimero['id']}").json()
    props = {p["property_slug"]: p for g in detail["property_groups"] for p in g["properties"]}
    temp = props["temp_max_servico"]  # cell contains "N/A"
    assert temp["is_missing"] is True
    assert temp["normalized_value"] is None


def test_rollback_removes_imported_materials(client):
    job_id = _upload(client).json()["job_id"]
    client.post(f"/api/imports/{job_id}/validate", json={"mapping": MAPPING})
    client.post(f"/api/imports/{job_id}/commit")

    resp = client.post(f"/api/imports/{job_id}/rollback")
    assert resp.status_code == 200
    assert resp.json()["status"] == "REVERTIDO"

    names = {m["name"] for m in client.get("/api/materials").json()}
    assert "Liga Import A" not in names
    assert "Aço Demo B" in names  # pre-existing material untouched


def test_history_and_report_endpoints(client):
    job_id = _upload(client).json()["job_id"]
    client.post(f"/api/imports/{job_id}/validate", json={"mapping": MAPPING})

    history = client.get("/api/imports").json()
    assert any(j["id"] == job_id and j["status"] == "VALIDADO" for j in history)

    report = client.get(f"/api/imports/{job_id}/report")
    assert report.status_code == 200
    assert report.json()["row_count"] == 6


def test_cancel_pending_job(client):
    job_id = _upload(client).json()["job_id"]
    resp = client.post(f"/api/imports/{job_id}/cancel")
    assert resp.status_code == 200
    assert resp.json()["status"] == "CANCELADO"
    # No further validation allowed.
    resp2 = client.post(f"/api/imports/{job_id}/validate", json={"mapping": MAPPING})
    assert resp2.status_code == 409


def test_mapping_templates_roundtrip(client):
    create = client.post(
        "/api/import-templates",
        json={"name": "Planilha padrão do professor", "mapping": MAPPING},
    )
    assert create.status_code == 201

    dup = client.post(
        "/api/import-templates",
        json={"name": "Planilha padrão do professor", "mapping": MAPPING},
    )
    assert dup.status_code == 409

    listing = client.get("/api/import-templates").json()
    assert any(t["name"] == "Planilha padrão do professor" for t in listing)
    stored = next(t for t in listing if t["name"] == "Planilha padrão do professor")
    assert stored["mapping"]["name_column"] == "nome"
