"""The official bundle can carry material curves (D-106, D-102 contract).

``material_curves.ndjson`` goes through the same domain builder the seed uses,
so a bundle cannot write a non-finite point, an unknown unit, a series whose x
goes backwards or a band that does not contain its line — and the dry-run says
so before anything is written. A release is immutable: the same bundle again
changes nothing, and the same curve identity with other bytes is refused.
"""

from __future__ import annotations

import copy
import hashlib
import json
import zipfile
from pathlib import Path

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.catalog.bundle import verify_bundle
from app.catalog.importer import (
    OfficialCatalogImporter,
    OfficialCatalogImportError,
    validate_semantics,
)
from app.db.clear_demo import clear_demo_data
from app.models.catalog import CatalogDataset
from app.models.material_curve import MaterialCurve, MaterialCurvePoint
from app.models.user import User


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


CURVE = {
    "external_id": "curve-ss-1",
    "raw_sha256": _hash("curve-ss-1"),
    "material_external_id": "mat-ss",
    "kind": "TENSAO_DEFORMACAO",
    "title": "Tração a duas temperaturas",
    "x": {"quantity": "deformacao", "unit": "%", "label": "Deformação de engenharia"},
    "y": {"quantity": "tensao", "unit": "MPa"},
    "parameter": {"quantity": "temperatura", "unit": "degC"},
    "series": [
        {"parameter": 20, "points": [[0, 0], [0.1, 200], [5, 400]]},
        {
            "parameter": 300,
            "conditions": "Forno",
            "points": [{"x": 0, "y": 0}, {"x": 0.1, "y": 180, "y_min": 170, "y_max": 190}],
        },
    ],
    "citation": "Figura 3",
}

BASE: dict[str, list[dict]] = {
    "material_classes.ndjson": [
        {"external_id": "mc-metals", "name": "Metais", "slug": "metais", "parent_external_id": None}
    ],
    "materials.ndjson": [
        {
            "external_id": "mat-ss",
            "raw_sha256": _hash("mat-ss"),
            "name": "Inoxidável oficial com curva",
            "class_external_id": "mc-metals",
        }
    ],
    "material_curves.ndjson": [CURVE],
}


def _bundle(tmp_path: Path, files: dict[str, list[dict]], name: str = "curves.zip") -> Path:
    encoded = {
        file: "".join(
            json.dumps(r, ensure_ascii=False, sort_keys=True) + "\n" for r in rows
        ).encode()
        for file, rows in files.items()
    }
    manifest = {
        "schema_version": 1,
        "dataset": {
            "slug": "official-curves-r1",
            "name": "Official Curves Test",
            "release": "R1",
            "source_sha256": _hash("curves-source"),
            "license_label": "Uso autorizado em teste",
        },
        "files": {
            file: {"sha256": hashlib.sha256(raw).hexdigest(), "count": len(files[file])}
            for file, raw in encoded.items()
        },
    }
    path = tmp_path / name
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest, sort_keys=True))
        for file, raw in encoded.items():
            archive.writestr(file, raw)
    return path


@pytest.fixture()
def reviewer(db_session: Session) -> User:
    clear_demo_data(db_session)
    user = User(google_sub="curves-reviewer", email="rev-curves@example.com", name="Revisor")
    db_session.add(user)
    db_session.flush()
    return user


def test_the_bundle_writes_typed_curves(tmp_path: Path, db_session: Session, reviewer) -> None:
    bundle = verify_bundle(_bundle(tmp_path, BASE))
    assert validate_semantics(bundle)["material_curves.ndjson"] == 1

    result = OfficialCatalogImporter(db_session, bundle, reviewer_email=reviewer.email).run()
    assert result["counts"]["curves_created"] == 1
    assert result["counts"]["curve_points_created"] == 5

    curve = db_session.execute(select(MaterialCurve)).scalar_one()
    assert curve.external_id == "curve-ss-1" and curve.dataset_id is not None
    assert not curve.is_demo and not curve.source.is_demo
    assert curve.x_label == "Deformação de engenharia" and curve.y_label is None
    assert curve.citation == "Figura 3"
    assert [s.parameter_value for s in curve.series] == [20, 300]
    banded = curve.series[1].points[1]
    assert (banded.y_min_value, banded.y_max_value) == (170, 190)
    assert banded.y_max_normalized == pytest.approx(190e6)


def test_the_same_release_again_changes_nothing(
    tmp_path: Path, db_session: Session, reviewer
) -> None:
    path = _bundle(tmp_path, BASE)
    OfficialCatalogImporter(db_session, verify_bundle(path), reviewer_email=reviewer.email).run()
    points = db_session.scalar(select(func.count(MaterialCurvePoint.id)))

    again = OfficialCatalogImporter(
        db_session, verify_bundle(path), reviewer_email=reviewer.email
    ).run()
    assert again["counts"]["curves_unchanged"] == 1
    assert "curves_created" not in again["counts"]
    assert db_session.scalar(select(func.count(MaterialCurvePoint.id))) == points


def test_a_changed_curve_under_the_same_identity_is_refused(
    tmp_path: Path, db_session: Session, reviewer
) -> None:
    OfficialCatalogImporter(
        db_session, verify_bundle(_bundle(tmp_path, BASE)), reviewer_email=reviewer.email
    ).run()

    changed = copy.deepcopy(BASE)
    changed["material_curves.ndjson"][0]["raw_sha256"] = _hash("other bytes")
    importer = OfficialCatalogImporter(
        db_session,
        verify_bundle(_bundle(tmp_path, changed, "changed.zip")),
        reviewer_email=reviewer.email,
    )
    # The manifest differs, so the release guard already refuses; the curve's
    # own guard is proved below by bypassing it.
    with pytest.raises(OfficialCatalogImportError, match="outro manifest_sha256"):
        importer.run()

    stored = db_session.execute(select(MaterialCurve)).scalar_one()
    importer.dataset = db_session.get(CatalogDataset, stored.dataset_id)
    importer.source = stored.source
    with pytest.raises(OfficialCatalogImportError, match="Curva mudou"):
        importer._import_curves()


def _with_curve(**changes) -> dict[str, list[dict]]:
    files = copy.deepcopy(BASE)
    files["material_curves.ndjson"][0].update(changes)
    return files


@pytest.mark.parametrize(
    ("changes", "message"),
    [
        ({"kind": "HISTERESE"}, "tipo de curva inválido"),
        ({"material_external_id": "nope"}, "material inexistente"),
        ({"x": {"quantity": "deformacao"}}, "exige quantity e unit"),
        ({"y": {"quantity": "tensao", "unit": "megafoo"}}, "Unidade desconhecida"),
        ({"y": {"quantity": "tensao", "unit": "kg"}}, "incompatíveis"),
        ({"x": {"quantity": "temperatura", "unit": "K"}}, "não admitida"),
        ({"raw_sha256": "xyz"}, "raw_sha256"),
        (
            {"parameter": None},
            "sem grandeza de família",
        ),
        (
            {"series": [{"parameter": 20, "points": [[0, 0], [2, 1], [1, 2]]}]},
            "x tem de crescer",
        ),
        (
            {"series": [{"parameter": 20, "points": [[0, 0], [1, "NaN"]]}]},
            "não numérico",
        ),
        (
            {"series": [{"parameter": 20, "points": [[0, 0], [1, 300, 310, 320]]}]},
            "não contém",
        ),
        ({"series": [{"parameter": 20, "points": [[0, 0, 1]]}]}, "ponto deve ser"),
        ({"series": [{"parameter": 20, "points": [[0, 0]]}]}, "ao menos 2 pontos"),
    ],
)
def test_the_dry_run_refuses_a_bad_curve(tmp_path: Path, changes: dict, message: str) -> None:
    bundle = verify_bundle(_bundle(tmp_path, _with_curve(**changes)))
    with pytest.raises(OfficialCatalogImportError, match=message):
        validate_semantics(bundle)


def test_a_duplicate_curve_identity_is_refused(tmp_path: Path) -> None:
    files = copy.deepcopy(BASE)
    files["material_curves.ndjson"].append(copy.deepcopy(CURVE))
    with pytest.raises(OfficialCatalogImportError, match="duplicado"):
        validate_semantics(verify_bundle(_bundle(tmp_path, files)))


def test_non_finite_json_is_refused(tmp_path: Path) -> None:
    """``Infinity`` is not JSON, but Python's encoder writes it; the builder still refuses it."""
    files = _with_curve(series=[{"parameter": 20, "points": [[0, 0], [1, float("inf")]]}])
    with pytest.raises(OfficialCatalogImportError, match="não finito"):
        validate_semantics(verify_bundle(_bundle(tmp_path, files)))
