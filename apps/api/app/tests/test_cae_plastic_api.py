"""``GET /api/exports/materiais/{id}/cae?formato=*-plastic&curva=&serie=`` (D-119).

The conversion is proved in ``test_plasticity_domain.py`` and the renderers in
``test_cae_plastic.py``; this file proves what only the service and the route
can get wrong: which curve and series are read (never chosen), where E at the
series' temperature comes from, visibility, and the status of each refusal.

Every curve here is **fictitious**, written into a fictitious own record
inside the test transaction, under a source marked fictitious — the seed is
never touched.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.curves import PointInput, SeriesInput, build_curve
from app.models.enums import CurveKind, DataQuality
from app.models.material_curve import MaterialCurve
from app.models.source import Source
from app.models.user import User
from app.repositories.curve_repository import curve_rows
from app.tests.test_cae_export_api import _own_full_record

URL = "/api/exports/materiais/{id}/cae?formato={fmt}&unidades=mm-t-s"

#: Invented engineering series in % and MPa: origin, elastic limit, hardening.
_POINTS_20 = [(0.0, 0.0), (0.125, 250.0), (1.0, 300.0), (5.0, 380.0), (12.0, 420.0)]
_POINTS_300 = [(0.0, 0.0), (0.1, 180.0), (1.0, 220.0), (5.0, 280.0)]


def _source(db: Session) -> Source:
    source = Source(label="Fonte fictícia de teste plástico", is_demo=True)
    db.add(source)
    db.flush()
    return source


def _stress_strain(
    db: Session,
    material_id: int,
    source: Source,
    *,
    measure: str | None = "engineering",
    temperatures: tuple[float, ...] = (20.0, 300.0),
    family: str | None = "temperatura",
) -> MaterialCurve:
    tables = {20.0: _POINTS_20, 300.0: _POINTS_300, 150.0: _POINTS_300}
    series = [
        SeriesInput(
            points=[PointInput(x, y) for x, y in tables[t]],
            parameter=t if family else None,
            parameter_unit="degC" if family else None,
            conditions=f"Tração, {t:g} °C (fictício).",
        )
        for t in (temperatures if family else temperatures[:1])
    ]
    row = curve_rows(
        build_curve(
            CurveKind.TENSAO_DEFORMACAO,
            x_quantity="deformacao",
            x_unit="%",
            y_quantity="tensao",
            y_unit="MPa",
            parameter_quantity=family,
            series=series,
            strain_measure=measure,
        ),
        material_id=material_id,
        title="Tração fictícia de teste plástico",
        source_id=source.id,
        data_quality=DataQuality.ESTIMADO,
        is_demo=True,
    )
    db.add(row)
    db.flush()
    return row


def _modulus(
    db: Session, material_id: int, source: Source, *, kind: str | None = "young"
) -> MaterialCurve:
    row = curve_rows(
        build_curve(
            CurveKind.TEMPERATURA,
            x_quantity="temperatura",
            x_unit="degC",
            y_quantity="modulo",
            y_unit="GPa",
            series=[SeriesInput(points=[PointInput(20, 200), PointInput(300, 180)])],
            modulus_kind=kind,
        ),
        material_id=material_id,
        title="Módulo × temperatura fictício",
        source_id=source.id,
        data_quality=DataQuality.ESTIMADO,
        is_demo=True,
    )
    db.add(row)
    db.flush()
    return row


def _setup(client: TestClient, db: Session, **curve_options) -> tuple[int, MaterialCurve]:
    material_id = _own_full_record(client, db)
    source = _source(db)
    curve = _stress_strain(db, material_id, source, **curve_options)
    _modulus(db, material_id, source)
    db.commit()
    return material_id, curve


def _get(client: TestClient, material_id: int, fmt: str, **params) -> object:
    query = "".join(f"&{k}={v}" for k, v in params.items())
    return client.get(URL.format(id=material_id, fmt=fmt) + query)


def test_each_plastic_format_downloads_with_e_at_the_series_temperature(
    client: TestClient, db_session: Session
) -> None:
    material_id, curve = _setup(client, db_session)
    for fmt, suffix, marker in (
        ("abaqus-plastic", "-abaqus-plastico.inp", "*PLASTIC"),
        ("mapdl-plastic", "-mapdl-plastico.inp", "TB,PLAS,MATID,1,"),
        ("nastran-plastic", "-nastran-plastico.bdf", "MATS1*"),
        ("lsdyna-plastic", "-lsdyna-plastico.k", "*MAT_PIECEWISE_LINEAR_PLASTICITY_TITLE"),
    ):
        response = _get(client, material_id, fmt, curva=curve.id, serie=1)
        assert response.status_code == 200, (fmt, response.text)
        assert suffix in response.headers["content-disposition"]
        assert response.headers["content-disposition"].startswith("attachment;")
        assert marker in response.text
        # 300 °C: E = 180 GPa from the modulus curve, not the catalogue's 210 GPa.
        assert "180000." in response.text, fmt
        assert "573.15 K" in response.text
        assert "Esta ferramenta destina-se a apoio didatico" in response.text
        assert "FICTICI" in response.text


def test_a_curve_with_several_series_needs_the_series_named(
    client: TestClient, db_session: Session
) -> None:
    material_id, curve = _setup(client, db_session)
    response = _get(client, material_id, "abaqus-plastic", curva=curve.id)
    assert response.status_code == 400
    detail = response.json()["detail"]
    assert "'serie'" in detail and "0 (20 degC)" in detail and "1 (300 degC)" in detail
    missing = _get(client, material_id, "abaqus-plastic", curva=curve.id, serie=7)
    assert missing.status_code == 400 and "posição 7" in missing.json()["detail"]


def test_a_plastic_format_needs_a_curve_and_the_others_refuse_one(
    client: TestClient, db_session: Session
) -> None:
    material_id, curve = _setup(client, db_session)
    no_curve = _get(client, material_id, "nastran-plastic")
    assert no_curve.status_code == 400 and "'curva'" in no_curve.json()["detail"]
    elastic = _get(client, material_id, "abaqus", curva=curve.id)
    assert elastic.status_code == 400 and "abaqus-plastic" in elastic.json()["detail"]
    unknown = _get(client, material_id, "step")
    assert unknown.status_code == 400 and "lsdyna-plastic" in unknown.json()["detail"]


def test_an_undeclared_measure_is_refused_with_422(client: TestClient, db_session: Session) -> None:
    material_id, curve = _setup(client, db_session, measure=None)
    response = _get(client, material_id, "abaqus-plastic", curva=curve.id, serie=0)
    assert response.status_code == 422
    assert "engenharia ou verdadeira" in response.json()["detail"]


def test_a_series_without_temperature_is_refused_with_422(
    client: TestClient, db_session: Session
) -> None:
    material_id, curve = _setup(client, db_session, family=None)
    response = _get(client, material_id, "abaqus-plastic", curva=curve.id)
    assert response.status_code == 422
    assert "não declara a temperatura" in response.json()["detail"]


def test_a_temperature_without_an_exact_modulus_point_is_refused_with_422(
    client: TestClient, db_session: Session
) -> None:
    material_id, curve = _setup(client, db_session, temperatures=(150.0,))
    response = _get(client, material_id, "mapdl-plastic", curva=curve.id)
    assert response.status_code == 422
    assert "não é interpolado" in response.json()["detail"]


def test_e_is_read_only_from_a_curve_declared_young(
    client: TestClient, db_session: Session
) -> None:
    material_id = _own_full_record(client, db_session)
    source = _source(db_session)
    curve = _stress_strain(db_session, material_id, source)
    _modulus(db_session, material_id, source, kind=None)
    _modulus(db_session, material_id, source, kind="shear")
    db_session.commit()
    response = _get(client, material_id, "abaqus-plastic", curva=curve.id, serie=0)
    assert response.status_code == 422
    assert "módulo de Young × temperatura" in response.json()["detail"]


def test_two_young_curves_at_the_same_temperature_are_not_chosen_between(
    client: TestClient, db_session: Session
) -> None:
    material_id, curve = _setup(client, db_session)
    other = _modulus(db_session, material_id, _source_two(db_session))
    other.series[0].points[0].y_normalized = 1.95e11
    db_session.commit()
    response = _get(client, material_id, "abaqus-plastic", curva=curve.id, serie=0)
    assert response.status_code == 422
    assert "não escolhe" in response.json()["detail"]


def _source_two(db: Session) -> Source:
    source = Source(label="Segunda fonte fictícia de teste plástico", is_demo=True)
    db.add(source)
    db.flush()
    return source


def test_a_curve_of_another_kind_is_a_400_and_of_another_material_a_404(
    client: TestClient, db_session: Session
) -> None:
    material_id, curve = _setup(client, db_session)
    modulus = (
        db_session.query(MaterialCurve)
        .filter(MaterialCurve.material_id == material_id, MaterialCurve.kind == "TEMPERATURA")
        .one()
    )
    wrong_kind = _get(client, material_id, "abaqus-plastic", curva=modulus.id)
    assert wrong_kind.status_code == 400 and "tensão–deformação" in wrong_kind.json()["detail"]
    other = db_session.query(MaterialCurve).filter(MaterialCurve.material_id != material_id).first()
    assert other is not None  # a seeded demo curve of another material
    assert _get(client, material_id, "abaqus-plastic", curva=other.id).status_code == 404


def test_another_persons_curve_is_not_found(
    client: TestClient, db_session: Session, login_as, other_user: User
) -> None:
    with login_as(other_user):
        material_id, curve = _setup(client, db_session)
        assert (
            _get(client, material_id, "abaqus-plastic", curva=curve.id, serie=0).status_code == 200
        )
    response = _get(client, material_id, "abaqus-plastic", curva=curve.id, serie=0)
    assert response.status_code == 404
