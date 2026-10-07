"""Official catalogue bundle validation and transactional import."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.catalog.bundle import BundleValidationError, verify_bundle
from app.catalog.importer import (
    OfficialCatalogImporter,
    OfficialCatalogImportError,
    validate_semantics,
)
from app.db.clear_demo import clear_demo_data
from app.models.catalog import (
    CatalogDataset,
    CatalogDatasetValue,
    CatalogRecordRef,
    CatalogSupplementalValue,
)
from app.models.material import Material
from app.models.process import MaterialProcess, Process
from app.models.transport_mode import TransportMode
from app.models.user import User


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def _write_bundle(tmp_path: Path) -> Path:
    files: dict[str, list[dict]] = {
        "material_classes.ndjson": [
            {
                "external_id": "mc-metals",
                "name": "Metais",
                "slug": "metais",
                "parent_external_id": None,
            }
        ],
        "property_definitions.ndjson": [
            {
                "slug": "densidade",
                "name": "Densidade",
                "symbol": "ρ",
                "category": "FISICA",
                "physical_dimension": "[mass] / [length] ** 3",
                "canonical_unit": "kg/m**3",
                "accepted_units": ["kg/m**3", "g/cm**3", "lb/ft**3"],
                "display_unit": "g/cm**3",
                "is_interval": False,
                "better_direction": "LOWER",
            }
        ],
        "materials.ndjson": [
            {
                "external_id": "mat-001",
                "external_table": "MaterialUniverse",
                "gruid": "M001",
                "raw_sha256": _hash("mat-001"),
                "name": "Material oficial de teste",
                "class_external_id": "mc-metals",
                "keywords": ["oficial"],
            }
        ],
        "material_values.ndjson": [
            {
                "material_external_id": "mat-001",
                "property_slug": "densidade",
                "value_kind": "scalar",
                "value": 7850.0,
                "original_unit": "kg/m**3",
            }
        ],
        "process_classes.ndjson": [
            {
                "external_id": "pc-primary",
                "name": "Conformação oficial",
                "slug": "conformacao-oficial",
                "parent_external_id": None,
            }
        ],
        "process_attribute_definitions.ndjson": [
            {
                "slug": "massa-oficial",
                "name": "Massa de peça",
                "kind": "ESCALAR",
                "physical_dimension": "[mass]",
                "canonical_unit": "kg",
                "accepted_units": ["kg"],
                "better_direction": "NEUTRAL",
            }
        ],
        "processes.ndjson": [
            {
                "external_id": "proc-001",
                "external_table": "ProcessUniverse",
                "gruid": "P001",
                "raw_sha256": _hash("proc-001"),
                "name": "Processo oficial de teste",
                "slug": "processo-oficial-teste",
                "class_external_id": "pc-primary",
            }
        ],
        "process_attribute_values.ndjson": [
            {
                "process_external_id": "proc-001",
                "attribute_slug": "massa-oficial",
                "value_kind": "scalar",
                "value": 10.0,
                "original_unit": "kg",
            }
        ],
        "material_process_links.ndjson": [
            {
                "material_external_id": "mat-001",
                "process_external_id": "proc-001",
            }
        ],
        "transport_modes.ndjson": [
            {
                "external_id": "transport-001",
                "external_table": "ProductConfig/Transportation",
                "raw_sha256": _hash("transport-001"),
                "slug": "trem-oficial-teste",
                "name": "Trem oficial de teste",
                "energy_intensity": 0.6355,
                "carbon_intensity": 0.0468,
                "display_order": 10,
            }
        ],
        "supplemental_values.ndjson": [
            {
                "target_type": "transport",
                "target_external_id": "transport-001",
                "external_table": "ProductConfig/Transportation",
                "external_record_id": "transport-001",
                "external_attribute_id": "T1",
                "attribute_name": "Fator T1",
                "value_kind": "scalar",
                "payload": 1.0,
                "raw_sha256": _hash("transport-001:T1"),
            }
        ],
        "dataset_values.ndjson": [
            {
                "namespace": "ProductConfig/Countries",
                "key": "Brazil",
                "value_kind": "object",
                "payload": {
                    "LaborCost": 8.2,
                    "EmbodiedEnergy": 2.09,
                    "CO2footprint": 0.0687,
                },
                "raw_sha256": _hash("country:brazil"),
            }
        ],
    }

    encoded: dict[str, bytes] = {}
    file_specs: dict[str, dict[str, object]] = {}
    for name, rows in files.items():
        raw = "".join(
            json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows
        ).encode()
        encoded[name] = raw
        file_specs[name] = {
            "sha256": hashlib.sha256(raw).hexdigest(),
            "count": len(rows),
        }

    manifest = {
        "schema_version": 1,
        "dataset": {
            "slug": "official-test-r1",
            "name": "Official Test Catalogue",
            "release": "R1",
            "source_sha256": _hash("source-database"),
            "license_label": "Uso autorizado em teste",
            "provenance": "Fixture sintética para testar o importador.",
        },
        "files": file_specs,
    }
    path = tmp_path / "official.zip"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "manifest.json",
            json.dumps(manifest, ensure_ascii=False, sort_keys=True),
        )
        for name, raw in encoded.items():
            archive.writestr(name, raw)
    return path


def test_bundle_validation_and_full_import(tmp_path: Path, db_session: Session) -> None:
    path = _write_bundle(tmp_path)
    bundle = verify_bundle(path)
    counts = validate_semantics(bundle)
    assert counts["materials.ndjson"] == 1
    assert counts["transport_modes.ndjson"] == 1

    clear_demo_data(db_session)
    reviewer = User(
        google_sub="official-catalog-reviewer",
        email="reviewer@example.com",
        name="Revisor oficial",
        avatar_url=None,
    )
    db_session.add(reviewer)
    db_session.flush()

    result = OfficialCatalogImporter(db_session, bundle, reviewer_email=reviewer.email).run()
    assert result["counts"]["materials_created"] == 1
    assert result["counts"]["processes_created"] == 1
    assert result["counts"]["transport_modes_created"] == 1

    material = (
        db_session.execute(select(Material).where(Material.name == "Material oficial de teste"))
        .scalars()
        .one()
    )
    process = (
        db_session.execute(select(Process).where(Process.slug == "processo-oficial-teste"))
        .scalars()
        .one()
    )
    transport = (
        db_session.execute(select(TransportMode).where(TransportMode.slug == "trem-oficial-teste"))
        .scalars()
        .one()
    )
    assert material.is_demo is False
    assert process.is_demo is False
    assert transport.is_demo is False

    link_row = db_session.get(
        MaterialProcess,
        {"material_id": material.id, "process_id": process.id},
    )
    assert link_row is not None

    dataset = (
        db_session.execute(select(CatalogDataset).where(CatalogDataset.slug == "official-test-r1"))
        .scalars()
        .one()
    )
    refs = (
        db_session.execute(
            select(CatalogRecordRef).where(CatalogRecordRef.dataset_id == dataset.id)
        )
        .scalars()
        .all()
    )
    assert len(refs) == 3
    assert (
        db_session.execute(
            select(CatalogSupplementalValue).where(
                CatalogSupplementalValue.dataset_id == dataset.id
            )
        )
        .scalars()
        .one()
        .payload
        == 1.0
    )
    country = (
        db_session.execute(
            select(CatalogDatasetValue).where(
                CatalogDatasetValue.dataset_id == dataset.id,
                CatalogDatasetValue.namespace == "ProductConfig/Countries",
                CatalogDatasetValue.key == "Brazil",
            )
        )
        .scalars()
        .one()
    )
    assert country.payload["LaborCost"] == 8.2

    density = material.property_values[0].property_definition
    assert "lb/ft**3" in density.accepted_units


def test_bundle_rejects_duplicate_member_names(tmp_path: Path) -> None:
    path = _write_bundle(tmp_path)
    with pytest.warns(UserWarning, match="Duplicate name"):
        with zipfile.ZipFile(path, "a", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("materials.ndjson", b"{}\n")

    with pytest.raises(BundleValidationError, match="duplicados"):
        verify_bundle(path)


def test_bundle_rejects_malformed_dataset_source_hash(tmp_path: Path) -> None:
    source = _write_bundle(tmp_path)
    target = tmp_path / "bad-hash.zip"

    with zipfile.ZipFile(source, "r") as original:
        members = {info.filename: original.read(info.filename) for info in original.infolist()}

    manifest = json.loads(members["manifest.json"])
    manifest["dataset"]["source_sha256"] = "X" * 64
    members["manifest.json"] = json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode()

    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, content in members.items():
            archive.writestr(name, content)

    with pytest.raises(BundleValidationError, match="source_sha256"):
        verify_bundle(target)


def test_same_release_rejects_changed_canonical_manifest(
    tmp_path: Path, db_session: Session
) -> None:
    original_path = _write_bundle(tmp_path)
    original = verify_bundle(original_path)
    validate_semantics(original)

    clear_demo_data(db_session)
    reviewer = User(
        google_sub="official-catalog-reviewer-immutable",
        email="reviewer-immutable@example.com",
        name="Revisor imutabilidade",
        avatar_url=None,
    )
    db_session.add(reviewer)
    db_session.flush()
    OfficialCatalogImporter(db_session, original, reviewer_email=reviewer.email).run()

    changed_path = tmp_path / "official-changed.zip"
    with zipfile.ZipFile(original_path, "r") as source:
        members = {info.filename: source.read(info.filename) for info in source.infolist()}

    dataset_rows = [
        json.loads(line)
        for line in members["dataset_values.ndjson"].decode().splitlines()
        if line.strip()
    ]
    dataset_rows[0]["payload"]["LaborCost"] = 999.0
    changed_dataset_values = (
        "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in dataset_rows)
    ).encode()
    members["dataset_values.ndjson"] = changed_dataset_values

    manifest = json.loads(members["manifest.json"])
    manifest["files"]["dataset_values.ndjson"]["sha256"] = hashlib.sha256(
        changed_dataset_values
    ).hexdigest()
    members["manifest.json"] = json.dumps(manifest, ensure_ascii=False, sort_keys=True).encode()

    with zipfile.ZipFile(changed_path, "w", zipfile.ZIP_DEFLATED) as target:
        for name, content in members.items():
            target.writestr(name, content)

    changed = verify_bundle(changed_path)
    validate_semantics(changed)
    with pytest.raises(OfficialCatalogImportError, match="manifest_sha256"):
        OfficialCatalogImporter(db_session, changed, reviewer_email=reviewer.email).run()
