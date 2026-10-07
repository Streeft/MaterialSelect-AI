"""The official bundle can carry designations and composition (D-105, D-102 contract).

``material_designations.ndjson`` and ``material_compositions.ndjson`` go through
the same domain builder the seed uses, so a bundle cannot write a balance with
a number, an absent content as 0, or an element outside the fixed list — and
the dry-run says so before anything is written.
"""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog.bundle import verify_bundle
from app.catalog.importer import (
    OfficialCatalogImporter,
    OfficialCatalogImportError,
    validate_semantics,
)
from app.db.clear_demo import clear_demo_data
from app.models.material import Material
from app.models.user import User


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


BASE: dict[str, list[dict]] = {
    "material_classes.ndjson": [
        {"external_id": "mc-metals", "name": "Metais", "slug": "metais", "parent_external_id": None}
    ],
    "materials.ndjson": [
        {
            "external_id": "mat-ss",
            "raw_sha256": _hash("mat-ss"),
            "name": "Inoxidável oficial de teste",
            "class_external_id": "mc-metals",
        }
    ],
    "material_designations.ndjson": [
        {"material_external_id": "mat-ss", "system": "UNS", "code": "S30400"},
        {
            "material_external_id": "mat-ss",
            "system": "EN",
            "code": "1.4301",
            "region": "Europa",
            "citation": "Tabela 1",
        },
    ],
    "material_compositions.ndjson": [
        {
            "material_external_id": "mat-ss",
            "element": "Cr",
            "state": "range",
            "min": 18,
            "max": 20,
            "unit": "%",
        },
        {
            "material_external_id": "mat-ss",
            "element": "C",
            "state": "range",
            "max": 0.08,
            "unit": "%",
        },
        {"material_external_id": "mat-ss", "element": "Mo", "state": "missing"},
        {"material_external_id": "mat-ss", "element": "Fe", "state": "balance"},
    ],
}


def _bundle(tmp_path: Path, files: dict[str, list[dict]]) -> Path:
    encoded = {
        name: "".join(
            json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows
        ).encode()
        for name, rows in files.items()
    }
    manifest = {
        "schema_version": 1,
        "dataset": {
            "slug": "official-identity-r1",
            "name": "Official Identity Test",
            "release": "R1",
            "source_sha256": _hash("identity-source"),
            "license_label": "Uso autorizado em teste",
        },
        "files": {
            name: {"sha256": hashlib.sha256(raw).hexdigest(), "count": len(files[name])}
            for name, raw in encoded.items()
        },
    }
    path = tmp_path / "identity.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest, sort_keys=True))
        for name, raw in encoded.items():
            archive.writestr(name, raw)
    return path


def test_the_bundle_fills_designations_and_composition(tmp_path: Path, db_session: Session) -> None:
    bundle = verify_bundle(_bundle(tmp_path, BASE))
    counts = validate_semantics(bundle)
    assert counts["material_compositions.ndjson"] == 4

    clear_demo_data(db_session)
    reviewer = User(google_sub="identity-reviewer", email="rev-id@example.com", name="Revisor")
    db_session.add(reviewer)
    db_session.flush()
    result = OfficialCatalogImporter(db_session, bundle, reviewer_email=reviewer.email).run()
    assert result["counts"]["designations_created"] == 2
    assert result["counts"]["composition_entries_created"] == 4

    material = db_session.execute(
        select(Material).where(Material.name == "Inoxidável oficial de teste")
    ).scalar_one()
    assert {d.code_key for d in material.designations} == {"S30400", "1.4301"}
    assert all(not d.is_demo and not d.source.is_demo for d in material.designations)
    by_element = {e.element: e for e in material.composition}
    assert by_element["Fe"].is_balance and by_element["Fe"].normalized_max is None
    assert by_element["Mo"].is_missing and by_element["Mo"].normalized_max is None
    assert by_element["C"].normalized_min is None and by_element["C"].normalized_max == 0.08
    assert [e.element for e in material.composition] == ["Cr", "C", "Mo", "Fe"]


@pytest.mark.parametrize(
    ("file_name", "row", "message"),
    [
        (
            "material_compositions.ndjson",
            {"material_external_id": "mat-ss", "element": "Ni", "state": "balance", "max": 70},
            "não carrega número",
        ),
        (
            "material_compositions.ndjson",
            {"material_external_id": "mat-ss", "element": "Qq", "state": "missing"},
            "não é símbolo",
        ),
        (
            "material_compositions.ndjson",
            {"material_external_id": "mat-ss", "element": "Cr", "state": "missing"},
            "mais de uma vez",
        ),
        (
            "material_compositions.ndjson",
            {"material_external_id": "nope", "element": "Ni", "state": "missing"},
            "material inexistente",
        ),
        (
            "material_designations.ndjson",
            {"material_external_id": "mat-ss", "system": "XYZ", "code": "1"},
            "Sistema de designação inválido",
        ),
        (
            "material_designations.ndjson",
            {"material_external_id": "mat-ss", "system": "UNS", "code": "s30400"},
            "Designação duplicada",
        ),
    ],
)
def test_the_dry_run_refuses_what_the_domain_refuses(
    tmp_path: Path, file_name: str, row: dict, message: str
) -> None:
    files = {name: list(rows) for name, rows in BASE.items()}
    files[file_name].append(row)
    bundle = verify_bundle(_bundle(tmp_path, files))
    with pytest.raises(OfficialCatalogImportError, match=message):
        validate_semantics(bundle)
