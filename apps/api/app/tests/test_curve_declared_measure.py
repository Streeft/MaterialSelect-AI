"""Declared measure of a curve (D-119, TM5-b): builder, database, import, API.

``strain_measure`` (engineering | true) on a stress–strain curve and
``modulus_kind`` (young | shear | bulk) on a ``modulo`` y axis are what the
source declares; NULL is "not declared" and is never filled in.
"""

from __future__ import annotations

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.catalog.importer import OfficialCatalogImportError, _curve_from_record
from app.domain.curves import CurveError, PointInput, SeriesInput, build_curve
from app.models.enums import CurveKind
from app.models.material import Material
from app.models.material_curve import MaterialCurve

_STRESS = {
    "x_quantity": "deformacao",
    "x_unit": "%",
    "y_quantity": "tensao",
    "y_unit": "MPa",
    "series": [SeriesInput(points=[PointInput(0, 0), PointInput(1, 300)])],
}
_MODULUS = {
    "x_quantity": "temperatura",
    "x_unit": "degC",
    "y_quantity": "modulo",
    "y_unit": "GPa",
    "series": [SeriesInput(points=[PointInput(20, 200), PointInput(300, 180)])],
}


# --- builder ------------------------------------------------------------------


@pytest.mark.parametrize("measure", ["engineering", "true", None])
def test_a_stress_strain_curve_carries_its_declared_measure(measure) -> None:
    curve = build_curve(CurveKind.TENSAO_DEFORMACAO, strain_measure=measure, **_STRESS)
    assert curve.strain_measure == measure
    assert curve.modulus_kind is None


def test_the_measure_is_refused_outside_the_list_or_the_kind() -> None:
    with pytest.raises(CurveError, match="desconhecida"):
        build_curve(CurveKind.TENSAO_DEFORMACAO, strain_measure="nominal", **_STRESS)
    with pytest.raises(CurveError, match="só se declara numa curva tensão"):
        build_curve(CurveKind.TEMPERATURA, strain_measure="true", **_MODULUS)


def test_the_modulus_kind_is_declared_only_on_a_modulus_axis() -> None:
    assert build_curve(CurveKind.TEMPERATURA, modulus_kind="young", **_MODULUS).modulus_kind == (
        "young"
    )
    with pytest.raises(CurveError, match="desconhecido"):
        build_curve(CurveKind.TEMPERATURA, modulus_kind="elastic", **_MODULUS)
    with pytest.raises(CurveError, match="eixo y é um módulo"):
        build_curve(CurveKind.TENSAO_DEFORMACAO, modulus_kind="young", **_STRESS)


# --- database -----------------------------------------------------------------


def _demo_curve(db: Session, kind: CurveKind) -> MaterialCurve:
    return db.execute(select(MaterialCurve).where(MaterialCurve.kind == kind)).scalars().first()


@pytest.mark.parametrize(
    ("kind", "columns"),
    [
        (CurveKind.TENSAO_DEFORMACAO, {"strain_measure": "nominal"}),
        (CurveKind.TENSAO_DEFORMACAO, {"modulus_kind": "young"}),
        (CurveKind.FADIGA, {"strain_measure": "true"}),
    ],
)
def test_the_database_refuses_a_measure_out_of_place(
    db_session: Session, kind: CurveKind, columns: dict
) -> None:
    curve = _demo_curve(db_session, kind)
    assert curve is not None
    statement = text(
        "UPDATE material_curve SET "
        + ", ".join(f"{k} = :{k}" for k in columns)
        + f" WHERE id = {curve.id}"
    )
    with pytest.raises(IntegrityError), db_session.begin_nested():
        db_session.execute(statement, columns)


def test_existing_curves_are_left_undeclared(db_session: Session) -> None:
    measures = db_session.execute(select(MaterialCurve.strain_measure)).scalars().all()
    assert measures and set(measures) == {None}


# --- importer -------------------------------------------------------------------


def _record(**extra) -> dict:
    return {
        "external_id": "curve-x",
        "material_external_id": "material-x",
        "raw_sha256": "0" * 64,
        "title": "Curva fictícia",
        "kind": "TENSAO_DEFORMACAO",
        "x": {"quantity": "deformacao", "unit": "%"},
        "y": {"quantity": "tensao", "unit": "MPa"},
        "series": [{"points": [{"x": 0, "y": 0}, {"x": 1, "y": 300}]}],
        **extra,
    }


def test_the_bundle_declares_the_measure_or_leaves_it_undeclared() -> None:
    assert _curve_from_record(_record(strain_measure="true")).strain_measure == "true"
    assert _curve_from_record(_record()).strain_measure is None
    with pytest.raises(OfficialCatalogImportError, match="desconhecida"):
        _curve_from_record(_record(strain_measure="nominal"))


# --- API ------------------------------------------------------------------------


def test_the_curve_api_says_when_the_measure_is_not_declared(client, db_session: Session) -> None:
    curve = _demo_curve(db_session, CurveKind.TENSAO_DEFORMACAO)
    body = client.get(f"/api/materials/{curve.material_id}/curvas/{curve.id}").json()
    assert body["strain_measure"] is None
    assert body["strain_measure_label"] == "não declarada pela fonte"
    assert body["modulus_kind_label"] is None  # not a modulus axis: does not apply
    csv = client.get(f"/api/exports/materiais/{curve.material_id}/curvas/{curve.id}.csv").text
    assert "Medida (engenharia ou verdadeira)" in csv and "não declarada pela fonte" in csv


def test_the_curve_api_names_a_declared_measure(client, db_session: Session) -> None:
    curve = _demo_curve(db_session, CurveKind.TENSAO_DEFORMACAO)
    curve.strain_measure = "true"
    db_session.commit()
    material = db_session.get(Material, curve.material_id)
    assert material is not None
    body = client.get(f"/api/materials/{material.id}/curvas/{curve.id}").json()
    assert body["strain_measure"] == "true"
    assert body["strain_measure_label"].startswith("Verdadeira")
