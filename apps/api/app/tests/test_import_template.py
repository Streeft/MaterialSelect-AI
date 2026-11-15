"""The CSV template of the import wizard (D-239).

It must be readable by the importer without a single manual mapping — that is
the point of downloading it — and its example row, whose numbers are
placeholders, must never become a material.
"""

from __future__ import annotations

import pytest

from app.config import settings
from app.importers.template import TEMPLATE_COLUMNS, TEMPLATE_EXAMPLE_NAME, template_csv


@pytest.fixture(autouse=True)
def _uploads_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))


def _upload(client, content: bytes):
    return client.post(
        "/api/imports/upload", files={"file": ("modelo.csv", content, "text/csv")}
    ).json()


def _mapping_from_suggestions(suggestions: list[dict]) -> dict:
    """The mapping the wizard pre-fills from the suggestions, with a source."""
    mapping: dict = {
        "source_label": "Modelo de teste",
        "source_license_label": "Uso interno autorizado",
        "columns": [],
    }
    for s in suggestions:
        target = s["suggested_target"]
        if target == "name":
            mapping["name_column"] = s["column"]
        elif target == "class":
            mapping["class_column"] = s["column"]
        elif target == "description":
            mapping["description_column"] = s["column"]
        elif target == "property":
            mapping["columns"].append(
                {
                    "column": s["column"],
                    "property_slug": s["suggested_property_slug"],
                    "unit": s["suggested_unit"],
                    "role": s["suggested_role"],
                }
            )
    return mapping


def test_the_template_downloads_as_a_semicolon_csv_with_a_bom(client):
    resp = client.get("/api/imports/modelo.csv")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert 'filename="modelo-importacao-materiais.csv"' in resp.headers["content-disposition"]
    assert resp.content.startswith(b"\xef\xbb\xbf")
    lines = resp.content.decode("utf-8-sig").splitlines()
    assert len(lines) == 2
    assert lines[0].split(";") == [header for header, _ in TEMPLATE_COLUMNS]
    assert lines[1].startswith(TEMPLATE_EXAMPLE_NAME + ";")


def test_every_column_is_recognised_without_a_click(client):
    body = _upload(client, template_csv())
    assert body["row_count"] == 1
    by_column = {s["column"]: s for s in body["suggestions"]}
    assert all(s["suggested_target"] for s in body["suggestions"]), body["suggestions"]
    assert by_column["densidade [kg/m3]"]["suggested_unit"] == "kg/m**3"
    assert by_column["limite_escoamento_min [MPa]"]["suggested_role"] == "min"
    assert by_column["limite_escoamento_max [MPa]"]["suggested_role"] == "max"


def test_the_example_row_is_refused_and_says_why(client):
    body = _upload(client, template_csv())
    mapping = _mapping_from_suggestions(body["suggestions"])
    report = client.post(
        f"/api/imports/{body['job_id']}/validate", json={"mapping": mapping}
    ).json()
    assert report["valid_count"] == 0
    assert report["error_count"] == 1
    row = report["rows"][0]
    assert row["status"] == "error"
    assert "Linha de exemplo do modelo" in row["issues"][0]["message"]


def test_the_format_it_shows_imports_once_the_row_is_a_real_material(client):
    # The same cells under another name: the decimal comma, the unit in the
    # header and the min/max pair all go through, so the example teaches a
    # format the importer really reads.
    content = template_csv().decode("utf-8-sig").replace(TEMPLATE_EXAMPLE_NAME, "Liga do Modelo")
    body = _upload(client, content.encode("utf-8-sig"))
    mapping = _mapping_from_suggestions(body["suggestions"])
    report = client.post(
        f"/api/imports/{body['job_id']}/validate", json={"mapping": mapping}
    ).json()
    assert report["valid_count"] == 1, report["rows"]
    assert report["rows"][0]["issues"] == []
