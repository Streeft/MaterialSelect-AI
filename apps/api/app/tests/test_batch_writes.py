"""D-245: importing and duplicating write in batches, not cell by cell.

Before, every imported cell read its property definition (and, with a source,
the source), and duplicating a record flushed once per curve and once per
series to learn the new ids. The statement counters below grow with the number
of rows or curves if that comes back.
"""

from __future__ import annotations

from contextlib import contextmanager

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models.enums import CurveKind, DataQuality
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_curve import (
    MaterialCurve,
    MaterialCurvePoint,
    MaterialCurveSeries,
)
from app.models.source import Source


@contextmanager
def _statements(db_session):
    engine = db_session.get_bind().engine
    seen: list[str] = []

    def _before(conn, cursor, statement, parameters, context, executemany):
        seen.append(statement)

    event.listen(engine, "before_cursor_execute", _before)
    try:
        yield seen
    finally:
        event.remove(engine, "before_cursor_execute", _before)


def _selects(statements, table: str) -> int:
    return sum(
        1 for s in statements if s.lstrip().upper().startswith("SELECT") and f"FROM {table}" in s
    )


@pytest.fixture(autouse=True)
def _uploads_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))


MAPPING = {
    "name_column": "nome",
    "class_column": "classe",
    "source_label": "Planilha em lote",
    "source_license_label": "Uso interno autorizado",
    "columns": [
        {"column": "densidade", "property_slug": "densidade", "unit": "g/cm**3"},
        {"column": "modulo", "property_slug": "modulo_young", "unit": "GPa"},
    ],
}


def _csv(prefix: str, rows: int) -> bytes:
    lines = ["nome;classe;densidade;modulo"]
    lines += [
        f"{prefix} {i};Metais;{7 + i / 100:.2f};{200 + i}".replace(".", ",") for i in range(rows)
    ]
    return ("\n".join(lines) + "\n").encode()


def _run_import(client, db_session, prefix: str, rows: int) -> list[str]:
    up = client.post(
        "/api/imports/upload", files={"file": ("lote.csv", _csv(prefix, rows), "text/csv")}
    )
    assert up.status_code == 200, up.text
    job_id = up.json()["job_id"]
    with _statements(db_session) as seen:
        val = client.post(f"/api/imports/{job_id}/validate", json={"mapping": MAPPING})
        assert val.status_code == 200, val.text
        assert val.json()["valid_count"] == rows
        done = client.post(f"/api/imports/{job_id}/commit")
        assert done.status_code == 200, done.text
        assert done.json()["imported_count"] == rows
    return seen


def test_import_reads_definitions_and_the_source_once_whatever_the_rows(client, db_session):
    few = _run_import(client, db_session, "Few", 2)
    many = _run_import(client, db_session, "Many", 12)

    assert _selects(many, "property_definition") == _selects(few, "property_definition")
    assert _selects(many, "source") == _selects(few, "source")


def _own_with_curves(db_session, user, curves: int) -> Material:
    class_id = db_session.execute(select(MaterialClass.id).limit(1)).scalar_one()
    source = db_session.execute(select(Source)).scalars().first()
    material = Material(
        name=f"Com curvas {curves}",
        class_id=class_id,
        is_active=True,
        owner_id=user.id,
        is_demo=False,
    )
    db_session.add(material)
    db_session.flush()
    for c in range(curves):
        curve = MaterialCurve(
            material_id=material.id,
            kind=CurveKind.TENSAO_DEFORMACAO,
            title=f"Curva {c}",
            x_quantity="deformacao",
            y_quantity="tensao",
            x_original_unit="%",
            y_original_unit="MPa",
            x_canonical_unit="%",
            y_canonical_unit="Pa",
            x_conversion_method="identity",
            y_conversion_method="pint:MPa->Pa",
            source_id=source.id,
            data_quality=DataQuality.IMPORTADO,
            is_demo=False,
        )
        db_session.add(curve)
        db_session.flush()
        for s in range(2):
            series = MaterialCurveSeries(curve_id=curve.id, position=s, label=f"S{s}")
            db_session.add(series)
            db_session.flush()
            for p in range(3):
                db_session.add(
                    MaterialCurvePoint(
                        series_id=series.id,
                        position=p,
                        x_value=p,
                        y_value=p * 10.0,
                        x_normalized=p,
                        y_normalized=p * 1e7,
                    )
                )
    db_session.flush()
    return material


@contextmanager
def _flush_count():
    """Flushes that wrote something, over every session (the request has its own)."""
    seen: list[int] = []

    def _after(session, flush_context):
        seen.append(1)

    event.listen(Session, "after_flush", _after)
    try:
        yield seen
    finally:
        event.remove(Session, "after_flush", _after)


def test_duplicate_flushes_a_fixed_number_of_times_whatever_the_curves(
    client, db_session, test_user
):
    one = _own_with_curves(db_session, test_user, 1)
    four = _own_with_curves(db_session, test_user, 4)

    with _flush_count() as few:
        r1 = client.post(f"/api/materials/{one.id}/duplicar")
    with _flush_count() as many:
        r4 = client.post(f"/api/materials/{four.id}/duplicar")
    assert r1.status_code == r4.status_code == 201
    assert many == few

    copy = db_session.execute(
        select(Material).where(Material.copied_from_id == four.id)
    ).scalar_one()
    assert len(copy.curves) == 4
    assert all(len(c.series) == 2 for c in copy.curves)
    assert all(len(s.points) == 3 for c in copy.curves for s in c.series)
