"""Promoting a release of the official catalogue (D-114, TM7-a + TM4-g), end to end.

Two **fictitious** releases of one fictitious lineage go through the real
importer of the D-102. Between them: a material that reappears, one that leaves
and one that arrives; a process that reappears **with the same slug** and a new
value, one that leaves and one that arrives; a modal that reappears with a new
intensity and one that leaves; a curve repeated byte for byte, one that leaves
and one that arrives. What must hold:

* nothing duplicates — one active row per external identity, one process row
  per slug, one active curve per curve identity;
* nothing is deleted — every row release 1 wrote is still there;
* the diff of the D-108 still compares the two releases;
* a failure in the middle rolls everything back, release 1 untouched;
* the dry-run says what would be retired and writes nothing.

None of it is real material data.
"""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.catalog import importer as importer_module
from app.catalog.bundle import verify_bundle
from app.catalog.importer import (
    OfficialCatalogImporter,
    OfficialCatalogImportError,
    plan_promotion,
    validate_semantics,
)
from app.db.clear_demo import clear_demo_data
from app.domain.release_promotion import PreviousRecord, plan_universe
from app.models.catalog import (
    CatalogDataset,
    CatalogDatasetValue,
    CatalogImportRun,
    CatalogRecordRef,
    CatalogSupplementalValue,
)
from app.models.material import Material
from app.models.material_curve import MaterialCurve, MaterialCurvePoint, MaterialCurveSeries
from app.models.material_property_value import MaterialPropertyValue
from app.models.process import MaterialProcess, Process, ProcessClass
from app.models.process_attribute import ProcessAttributeValue
from app.models.transport_mode import TransportMode
from app.models.user import User
from app.repositories.material_repository import MaterialRepository
from app.repositories.process_repository import ProcessRepository

LINEAGE = "catalogo-ficticio-promocao"


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


COMMON: dict[str, list[dict]] = {
    "material_classes.ndjson": [
        {"external_id": "mc-metais", "name": "Metais", "slug": "metais", "parent_external_id": None}
    ],
    "property_definitions.ndjson": [
        {
            "slug": "densidade",
            "name": "Densidade",
            "symbol": "ρ",
            "category": "FISICA",
            "physical_dimension": "[mass] / [length] ** 3",
            "canonical_unit": "kg/m**3",
            "accepted_units": ["kg/m**3", "g/cm**3"],
            "display_unit": "g/cm**3",
            "is_interval": False,
            "better_direction": "LOWER",
        }
    ],
    "process_classes.ndjson": [
        {
            "external_id": "pc-promo",
            "name": "Conformação fictícia da promoção",
            "slug": "conformacao-ficticia-promocao",
            "parent_external_id": None,
        }
    ],
    "process_attribute_definitions.ndjson": [
        {
            "slug": "massa-ficticia-promocao",
            "name": "Massa de peça fictícia",
            "kind": "ESCALAR",
            "physical_dimension": "[mass]",
            "canonical_unit": "kg",
            "accepted_units": ["kg"],
            "better_direction": "NEUTRAL",
        }
    ],
}


def _material(external_id: str, name: str) -> dict:
    return {
        "external_id": external_id,
        "external_table": "MaterialUniverse",
        "raw_sha256": _hash(f"{external_id}:{name}"),
        "name": name,
        "class_external_id": "mc-metais",
    }


def _density(material: str, value: float) -> dict:
    return {
        "material_external_id": material,
        "property_slug": "densidade",
        "value_kind": "scalar",
        "value": value,
        "original_unit": "kg/m**3",
    }


def _process(external_id: str, slug: str, name: str) -> dict:
    return {
        "external_id": external_id,
        "external_table": "ProcessUniverse",
        "raw_sha256": _hash(f"{external_id}:{name}"),
        "name": name,
        "slug": slug,
        "class_external_id": "pc-promo",
    }


def _mass(process: str, value: float) -> dict:
    return {
        "process_external_id": process,
        "attribute_slug": "massa-ficticia-promocao",
        "value_kind": "scalar",
        "value": value,
        "original_unit": "kg",
    }


def _transport(external_id: str, slug: str, energy: float) -> dict:
    return {
        "external_id": external_id,
        "external_table": "ProductConfig/Transportation",
        "raw_sha256": _hash(f"{external_id}:{energy}"),
        "slug": slug,
        "name": f"Modal fictício {external_id}",
        "energy_intensity": energy,
        "display_order": 10,
    }


def _curve(external_id: str, material: str, top: float) -> dict:
    return {
        "external_id": external_id,
        "raw_sha256": _hash(f"{external_id}:{top}"),
        "material_external_id": material,
        "kind": "TENSAO_DEFORMACAO",
        "title": f"Curva fictícia {external_id}",
        "x": {"quantity": "deformacao", "unit": "%"},
        "y": {"quantity": "tensao", "unit": "MPa"},
        "series": [{"points": [[0, 0], [0.1, top / 2], [5, top]]}],
    }


RELEASE_1: dict[str, list[dict]] = {
    "materials.ndjson": [
        _material("mat-a", "Liga Fictícia Promo A"),
        _material("mat-b", "Liga Fictícia Promo B"),
    ],
    "material_values.ndjson": [_density("mat-a", 7850.0), _density("mat-b", 4500.0)],
    "processes.ndjson": [
        _process("proc-1", "fundicao-ficticia-promocao", "Fundição fictícia"),
        _process("proc-2", "forjamento-ficticio-promocao", "Forjamento fictício"),
    ],
    "process_attribute_values.ndjson": [_mass("proc-1", 10.0), _mass("proc-2", 5.0)],
    "material_process_links.ndjson": [
        {"material_external_id": "mat-a", "process_external_id": "proc-1"},
        {"material_external_id": "mat-b", "process_external_id": "proc-2"},
    ],
    "transport_modes.ndjson": [
        _transport("tr-1", "trem-ficticio-promocao", 0.6),
        _transport("tr-2", "navio-ficticio-promocao", 0.1),
    ],
    "material_curves.ndjson": [
        _curve("curve-1", "mat-a", 400.0),
        _curve("curve-2", "mat-b", 300.0),
    ],
    "supplemental_values.ndjson": [
        {
            "target_type": "process",
            "target_external_id": "proc-1",
            "external_table": "ProcessUniverse",
            "external_attribute_id": "A1",
            "attribute_name": "Atributo fictício",
            "value_kind": "text",
            "payload": "R1",
            "raw_sha256": _hash("proc-1:A1:R1"),
        }
    ],
    "dataset_values.ndjson": [
        {
            "namespace": "Ficticio",
            "key": "fator",
            "value_kind": "scalar",
            "payload": 1.0,
            "raw_sha256": _hash("fator:1"),
        }
    ],
}

RELEASE_2: dict[str, list[dict]] = {
    "materials.ndjson": [
        _material("mat-a", "Liga Fictícia Promo A"),
        _material("mat-c", "Liga Fictícia Promo C"),
    ],
    "material_values.ndjson": [_density("mat-a", 7850.0), _density("mat-c", 2700.0)],
    "processes.ndjson": [
        # Same identity and same slug as in release 1: reused, never a collision.
        _process("proc-1", "fundicao-ficticia-promocao", "Fundição fictícia"),
        _process("proc-3", "usinagem-ficticia-promocao", "Usinagem fictícia"),
    ],
    "process_attribute_values.ndjson": [_mass("proc-1", 12.0), _mass("proc-3", 1.0)],
    "material_process_links.ndjson": [
        {"material_external_id": "mat-a", "process_external_id": "proc-1"},
        {"material_external_id": "mat-c", "process_external_id": "proc-3"},
    ],
    "transport_modes.ndjson": [_transport("tr-1", "trem-ficticio-promocao", 0.7)],
    "material_curves.ndjson": [
        # Repeated byte for byte: the curve of release 2 replaces release 1's.
        _curve("curve-1", "mat-a", 400.0),
        _curve("curve-3", "mat-c", 250.0),
    ],
    "supplemental_values.ndjson": [
        {
            "target_type": "process",
            "target_external_id": "proc-1",
            "external_table": "ProcessUniverse",
            "external_attribute_id": "A1",
            "attribute_name": "Atributo fictício",
            "value_kind": "text",
            "payload": "R2",
            "raw_sha256": _hash("proc-1:A1:R2"),
        }
    ],
    "dataset_values.ndjson": [
        {
            "namespace": "Ficticio",
            "key": "fator",
            "value_kind": "scalar",
            "payload": 2.0,
            "raw_sha256": _hash("fator:2"),
        }
    ],
}


def _bundle(
    tmp_path: Path, slug: str, files: dict[str, list[dict]], *, lineage: str | None = LINEAGE
) -> Path:
    contents = {**COMMON, **files}
    encoded = {
        name: "".join(
            json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows
        ).encode()
        for name, rows in contents.items()
    }
    dataset = {
        "slug": slug,
        "name": "Catálogo Fictício da Promoção",
        "release": slug,
        "source_sha256": _hash(f"source:{slug}"),
        "license_label": "Fixture fictícia de teste",
        "provenance": "Dados inventados para testar a promoção de release.",
    }
    if lineage is not None:
        dataset["lineage"] = lineage
    manifest = {
        "schema_version": 1,
        "dataset": dataset,
        "files": {
            name: {"sha256": hashlib.sha256(raw).hexdigest(), "count": len(contents[name])}
            for name, raw in encoded.items()
        },
    }
    path = tmp_path / f"{slug}.zip"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, sort_keys=True))
        for name, raw in encoded.items():
            archive.writestr(name, raw)
    return path


def _import(db: Session, path: Path, reviewer: User) -> dict:
    bundle = verify_bundle(path)
    validate_semantics(bundle)
    return OfficialCatalogImporter(db, bundle, reviewer_email=reviewer.email).run()


@pytest.fixture()
def reviewer(db_session: Session) -> User:
    clear_demo_data(db_session)
    user = User(google_sub="promo-reviewer", email="promo-reviewer@example.com", name="Revisor")
    db_session.add(user)
    db_session.commit()
    return user


def _dataset(db: Session, slug: str) -> CatalogDataset | None:
    return db.execute(
        select(CatalogDataset).where(CatalogDataset.slug == slug)
    ).scalar_one_or_none()


def _material_of(db: Session, slug: str, external_id: str) -> Material:
    return db.execute(
        select(Material)
        .join(CatalogRecordRef, CatalogRecordRef.material_id == Material.id)
        .join(CatalogDataset, CatalogDataset.id == CatalogRecordRef.dataset_id)
        .where(CatalogDataset.slug == slug, CatalogRecordRef.external_record_id == external_id)
    ).scalar_one()


def _process(db: Session, slug: str) -> Process:
    return db.execute(select(Process).where(Process.slug == slug)).scalar_one()


MODELS = (
    CatalogDataset,
    CatalogImportRun,
    CatalogRecordRef,
    CatalogSupplementalValue,
    CatalogDatasetValue,
    Material,
    MaterialPropertyValue,
    MaterialProcess,
    MaterialCurve,
    MaterialCurveSeries,
    MaterialCurvePoint,
    Process,
    ProcessClass,
    ProcessAttributeValue,
    TransportMode,
)


def _state(db: Session) -> dict:
    """Every row count, every ``is_active`` and every process value — the whole picture."""
    db.expire_all()
    return {
        "counts": {
            model.__name__: db.scalar(select(func.count()).select_from(model)) for model in MODELS
        },
        "datasets": sorted(db.execute(select(CatalogDataset.slug, CatalogDataset.is_active)).all()),
        "materials": sorted(db.execute(select(Material.id, Material.is_active)).all()),
        "processes": sorted(db.execute(select(Process.slug, Process.is_active)).all()),
        "transports": sorted(
            db.execute(
                select(TransportMode.slug, TransportMode.is_active, TransportMode.energy_intensity)
            ).all()
        ),
        "process_values": sorted(
            db.execute(
                select(
                    ProcessAttributeValue.id,
                    ProcessAttributeValue.value_scalar,
                    ProcessAttributeValue.source_id,
                )
            ).all()
        ),
    }


@pytest.fixture()
def release_1(tmp_path: Path, db_session: Session, reviewer: User) -> dict:
    return _import(db_session, _bundle(tmp_path, "promo-r1", RELEASE_1), reviewer)


# -- the pure rule ----------------------------------------------------------------


def _record(external_id: str, internal_id: int, *, active: bool = True) -> PreviousRecord:
    return PreviousRecord("T", external_id, internal_id, "r1", active)


def test_a_material_is_superseded_by_a_new_row_and_a_process_keeps_its_row() -> None:
    previous = [_record("b", 2), _record("a", 1), _record("z", 3, active=False)]
    incoming = {("T", "a"), ("T", "new")}

    materials = plan_universe(previous, incoming, reuses_rows=False)
    assert [r.external_record_id for r in materials.superseded] == ["a"]
    assert [r.external_record_id for r in materials.retired] == ["b", "z"]
    # Already inactive (3) is not written again; the superseded row (1) goes too.
    assert materials.to_deactivate == (1, 2)

    processes = plan_universe(previous, incoming, reuses_rows=True)
    assert processes.to_deactivate == (2,)
    # A row the new release points at is never retired, whatever identity it had.
    assert plan_universe(previous, incoming, reuses_rows=True, kept_ids={2}).to_deactivate == ()
    report = processes.report()
    assert report["superseded"] == 1 and report["deactivated"] == 1
    assert report["retired"][0] == {
        "external_table": "T",
        "external_record_id": "b",
        "release": "r1",
    }
    # Deterministic: the order of the input does not matter.
    assert plan_universe(reversed(previous), incoming, reuses_rows=False) == materials


# -- the promotion ----------------------------------------------------------------


def test_a_second_release_retires_the_first_and_duplicates_nothing(
    tmp_path: Path, db_session: Session, reviewer: User, release_1
) -> None:
    r1_rows = {
        model.__name__: db_session.scalar(select(func.count()).select_from(model))
        for model in MODELS
    }
    old_process_1 = _process(db_session, "fundicao-ficticia-promocao").id

    result = _import(db_session, _bundle(tmp_path, "promo-r2", RELEASE_2), reviewer)
    counts = result["counts"]
    assert counts["processes_reused"] == 1 and counts["processes_created"] == 1
    assert counts["process_values_updated"] == 1 and counts["transport_modes_reused"] == 1
    assert counts["curves_created"] == 2

    # The releases: the new one vigora, the old one is inactive — not gone.
    assert _dataset(db_session, "promo-r1").is_active is False
    assert _dataset(db_session, "promo-r2").is_active is True

    # Nothing deleted: every table has at least what release 1 left.
    after = {
        model.__name__: db_session.scalar(select(func.count()).select_from(model))
        for model in MODELS
    }
    assert all(after[name] >= r1_rows[name] for name in r1_rows)

    # Materials: one row per release, the old ones inactive, one active per identity.
    for external_id in ("mat-a", "mat-b"):
        assert _material_of(db_session, "promo-r1", external_id).is_active is False
    for external_id in ("mat-a", "mat-c"):
        assert _material_of(db_session, "promo-r2", external_id).is_active is True
    names = [m.name for m in MaterialRepository(db_session).list_materials("Promo")]
    assert sorted(names) == ["Liga Fictícia Promo A", "Liga Fictícia Promo C"]
    assert (
        db_session.scalar(  # release 1's values are still there, for the diff
            select(func.count())
            .select_from(MaterialPropertyValue)
            .where(
                MaterialPropertyValue.material_id
                == _material_of(db_session, "promo-r1", "mat-b").id
            )
        )
        == 1
    )

    # Processes: the same slug is one row, reused and updated; the one that left
    # is inactive; the new one is active. Two refs, one per release, same row.
    process_1 = _process(db_session, "fundicao-ficticia-promocao")
    assert process_1.id == old_process_1 and process_1.is_active is True
    assert (
        db_session.scalar(
            select(func.count())
            .select_from(Process)
            .where(Process.slug == "fundicao-ficticia-promocao")
        )
        == 1
    )
    refs = (
        db_session.execute(
            select(CatalogRecordRef.process_id).where(
                CatalogRecordRef.external_record_id == "proc-1"
            )
        )
        .scalars()
        .all()
    )
    assert refs == [old_process_1, old_process_1]
    value = db_session.execute(
        select(ProcessAttributeValue).where(ProcessAttributeValue.process_id == old_process_1)
    ).scalar_one()
    assert value.value_scalar == 12.0 and "promo-r2" in value.source.label
    assert _process(db_session, "forjamento-ficticio-promocao").is_active is False
    assert _process(db_session, "usinagem-ficticia-promocao").is_active is True
    # The process counts only active materials: the retired release's link is not a second.
    assert ProcessRepository(db_session).material_counts_by_process()[old_process_1] == 1

    # Modals: reused with the new release's intensity; the one that left is inactive.
    train = db_session.execute(
        select(TransportMode).where(TransportMode.slug == "trem-ficticio-promocao")
    ).scalar_one()
    assert train.is_active is True and train.energy_intensity == pytest.approx(0.7)
    assert "promo-r2" in train.source.label
    ship = db_session.execute(
        select(TransportMode).where(TransportMode.slug == "navio-ficticio-promocao")
    ).scalar_one()
    assert ship.is_active is False

    # Curves (TM4-g): one active curve per identity; release 1's stays, with its points.
    curves = db_session.execute(
        select(MaterialCurve.external_id, Material.is_active, CatalogDataset.slug)
        .join(Material, Material.id == MaterialCurve.material_id)
        .join(CatalogDataset, CatalogDataset.id == MaterialCurve.dataset_id)
    ).all()
    active = sorted(row[0] for row in curves if row[1])
    assert active == ["curve-1", "curve-3"]
    assert sorted((row[0], row[2]) for row in curves if not row[1]) == [
        ("curve-1", "promo-r1"),
        ("curve-2", "promo-r1"),
    ]
    new_a = _material_of(db_session, "promo-r2", "mat-a")
    assert [c.external_id for c in new_a.curves] == ["curve-1"]

    # The report says what happened, by identity.
    promotion = result["promotion"]
    assert promotion["previous_releases"] == ["promo-r1"]
    assert promotion["materials"]["superseded"] == 1
    assert [r["external_record_id"] for r in promotion["materials"]["retired"]] == ["mat-b"]
    assert promotion["materials"]["deactivated"] == 2
    assert [r["external_record_id"] for r in promotion["processes"]["retired"]] == ["proc-2"]
    assert [r["external_record_id"] for r in promotion["transport_modes"]["retired"]] == ["tr-2"]
    assert promotion["curves"]["superseded"] == 1
    assert [r["external_record_id"] for r in promotion["curves"]["retired"]] == ["curve-2"]
    run = db_session.execute(
        select(CatalogImportRun)
        .join(CatalogDataset, CatalogDataset.id == CatalogImportRun.dataset_id)
        .where(CatalogDataset.slug == "promo-r2")
    ).scalar_one()
    assert run.report["promotion"] == promotion


def test_re_running_the_new_release_changes_nothing(
    tmp_path: Path, db_session: Session, reviewer: User, release_1
) -> None:
    path = _bundle(tmp_path, "promo-r2", RELEASE_2)
    _import(db_session, path, reviewer)
    before = _state(db_session)

    again = _import(db_session, path, reviewer)
    assert again["counts"].get("materials_created", 0) == 0
    assert again["counts"]["processes_unchanged"] == 2
    assert again["counts"]["process_values_unchanged"] == 2
    assert again["counts"]["curves_unchanged"] == 2
    assert again["promotion"]["previous_releases"] == []
    after = _state(db_session)
    assert after["counts"].pop("CatalogImportRun") == before["counts"].pop("CatalogImportRun") + 1
    assert after == before


def test_the_diff_of_the_two_releases_still_works(
    client, tmp_path: Path, db_session: Session, reviewer: User, release_1
) -> None:
    _import(db_session, _bundle(tmp_path, "promo-r2", RELEASE_2), reviewer)
    response = client.get("/api/catalogo/releases/promo-r1/diff/promo-r2")
    assert response.status_code == 200, response.text
    body = response.json()
    assert {c["status"]: c["count"] for c in body["counts"]} == {
        "alterado": 0,
        "novo": 1,
        "desativado": 1,
        "inalterado": 1,
    }
    items = {item["external_record_id"]: item for item in body["items"]}
    # The superseded row is inactive, and that is not a change of the record.
    assert items["mat-a"]["status"] == "inalterado"
    assert items["mat-a"]["base"]["is_active"] is False
    assert items["mat-a"]["target"]["is_active"] is True
    releases = {r["slug"]: r for r in client.get("/api/catalogo/releases").json()}
    assert releases["promo-r1"]["is_active"] is False
    assert releases["promo-r2"]["is_active"] is True
    assert releases["promo-r2"]["previous_slug"] == "promo-r1"


# -- fail-closed ------------------------------------------------------------------


def test_a_failure_in_the_middle_rolls_everything_back(
    tmp_path: Path, db_session: Session, reviewer: User, release_1
) -> None:
    # A process outside the official catalogue already holds the new process's
    # slug: the importer refuses it after materials, values and curves were written.
    db_session.add(
        Process(
            name="Processo manual",
            slug="usinagem-ficticia-promocao",
            class_id=db_session.execute(select(ProcessClass.id)).scalars().first(),
            is_demo=False,
        )
    )
    db_session.commit()
    before = _state(db_session)

    with pytest.raises(OfficialCatalogImportError, match="usinagem-ficticia-promocao"):
        _import(db_session, _bundle(tmp_path, "promo-r2", RELEASE_2), reviewer)

    assert _state(db_session) == before
    assert _dataset(db_session, "promo-r2") is None
    assert _dataset(db_session, "promo-r1").is_active is True


def test_a_failure_after_the_promotion_rolls_the_promotion_back(
    tmp_path: Path,
    db_session: Session,
    reviewer: User,
    release_1,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = _state(db_session)
    real_promote = importer_module.promote

    def promote_then_fail(db: Session, dataset: CatalogDataset) -> dict:
        real_promote(db, dataset)
        assert _dataset(db, "promo-r1").is_active is False  # it did retire release 1
        raise RuntimeError("falha simulada depois da promoção")

    monkeypatch.setattr(importer_module, "promote", promote_then_fail)
    with pytest.raises(RuntimeError, match="falha simulada"):
        _import(db_session, _bundle(tmp_path, "promo-r2", RELEASE_2), reviewer)

    after = _state(db_session)
    assert after == before
    assert ("promo-r1", True) in after["datasets"]
    assert all(active for _, active in after["materials"])


def test_a_retired_or_older_release_is_refused(
    tmp_path: Path, db_session: Session, reviewer: User, release_1
) -> None:
    _import(db_session, _bundle(tmp_path, "promo-r2", RELEASE_2), reviewer)
    before = _state(db_session)
    with pytest.raises(OfficialCatalogImportError, match="substituída"):
        _import(db_session, _bundle(tmp_path, "promo-r1", RELEASE_1), reviewer)
    assert _state(db_session) == before

    # Two active releases (a state the importer no longer produces): the older
    # one is still not imported over the newer.
    _dataset(db_session, "promo-r1").is_active = True
    db_session.commit()
    with pytest.raises(OfficialCatalogImportError, match="mais recente"):
        _import(db_session, _bundle(tmp_path, "promo-r1", RELEASE_1), reviewer)


def test_another_lineage_or_no_lineage_retires_nothing(
    tmp_path: Path, db_session: Session, reviewer: User, release_1
) -> None:
    other = {
        "materials.ndjson": [_material("mat-x", "Liga Fictícia Outra Linha")],
        "material_values.ndjson": [_density("mat-x", 1000.0)],
    }
    result = _import(
        db_session, _bundle(tmp_path, "outra-r1", other, lineage="outra-linha-ficticia"), reviewer
    )
    assert result["promotion"]["previous_releases"] == []
    result = _import(db_session, _bundle(tmp_path, "sem-linha-r1", other, lineage=None), reviewer)
    assert result["promotion"]["lineage"] is None
    assert _dataset(db_session, "promo-r1").is_active is True
    assert _material_of(db_session, "promo-r1", "mat-a").is_active is True


# -- the dry-run ------------------------------------------------------------------


def test_the_dry_run_says_what_would_be_retired_and_writes_nothing(
    tmp_path: Path, db_session: Session, reviewer: User, release_1
) -> None:
    bundle = verify_bundle(_bundle(tmp_path, "promo-r2", RELEASE_2))
    before = _state(db_session)
    planned = plan_promotion(db_session, bundle)
    assert _state(db_session) == before

    assert planned["release"] == "promo-r2" and planned["lineage"] == LINEAGE
    assert planned["previous_releases"] == ["promo-r1"]
    assert planned["materials"]["superseded"] == 1
    assert planned["materials"]["deactivated"] == 2
    assert [r["external_record_id"] for r in planned["materials"]["retired"]] == ["mat-b"]
    assert [r["external_record_id"] for r in planned["processes"]["retired"]] == ["proc-2"]
    assert planned["processes"]["deactivated"] == 1
    assert [r["external_record_id"] for r in planned["transport_modes"]["retired"]] == ["tr-2"]
    assert [r["external_record_id"] for r in planned["curves"]["retired"]] == ["curve-2"]
    assert planned["process_slug_conflicts"] == []
    # Identities only: no material name in a log that may be public.
    assert "Liga" not in json.dumps(planned, ensure_ascii=False)

    # The commit does what the dry-run said.
    result = _import(db_session, _bundle(tmp_path, "promo-r2", RELEASE_2), reviewer)
    for universe in ("materials", "processes", "transport_modes", "curves"):
        assert result["promotion"][universe] == planned[universe]


def test_the_dry_run_reports_refusals_and_slug_conflicts(
    tmp_path: Path, db_session: Session, reviewer: User, release_1
) -> None:
    db_session.add(
        Process(
            name="Processo manual",
            slug="usinagem-ficticia-promocao",
            class_id=db_session.execute(select(ProcessClass.id)).scalars().first(),
            is_demo=False,
        )
    )
    db_session.commit()
    planned = plan_promotion(db_session, verify_bundle(_bundle(tmp_path, "promo-r2", RELEASE_2)))
    assert planned["process_slug_conflicts"] == [
        {"external_record_id": "proc-3", "slug": "usinagem-ficticia-promocao"}
    ]

    db_session.execute(Process.__table__.delete().where(Process.name == "Processo manual"))
    db_session.commit()
    _import(db_session, _bundle(tmp_path, "promo-r2", RELEASE_2), reviewer)
    refused = plan_promotion(db_session, verify_bundle(_bundle(tmp_path, "promo-r1", RELEASE_1)))
    assert "substituída" in refused["refused"]
