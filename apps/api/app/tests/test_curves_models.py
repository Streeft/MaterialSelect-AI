"""Curve rows in the database (D-106): what the schema refuses, and the demo lifecycle.

The builder refuses all of this first; these tests prove the database refuses
it too, with raw SQL so no ORM validator is what stops the row — the seed, the
official importer and a future migration write these tables directly.
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.clear_demo import clear_demo_curves, clear_demo_data
from app.db.seed import DEMO_CURVES, _seed_demo_curves
from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.material_curve import MaterialCurve, MaterialCurvePoint, MaterialCurveSeries
from app.models.source import Source

BIG = 1e309  # parses as float('inf') in Python, sent as a bound parameter


@pytest.fixture()
def series_id(db_session: Session) -> int:
    klass = db_session.execute(select(MaterialClass)).scalars().first()
    source = db_session.execute(select(Source).where(Source.is_demo.is_(False))).scalars().first()
    material = Material(name="Aço real de teste", class_id=klass.id, keywords=[], is_demo=False)
    db_session.add(material)
    db_session.flush()
    _insert(
        db_session,
        "material_curve",
        {
            "id": 9001,
            "material_id": material.id,
            "kind": "TENSAO_DEFORMACAO",
            "title": "Curva",
            "x_quantity": "deformacao",
            "y_quantity": "tensao",
            "x_original_unit": "%",
            "y_original_unit": "MPa",
            "x_canonical_unit": "dimensionless",
            "y_canonical_unit": "Pa",
            "x_conversion_method": "pint:%->dimensionless",
            "y_conversion_method": "pint:MPa->Pa",
            "source_id": source.id,
            "data_quality": "IMPORTADO",
            "is_demo": False,
            "created_at": "2026-10-07",
        },
    )
    _insert(db_session, "material_curve_series", {"id": 9101, "curve_id": 9001, "position": 0})
    return 9101


def _insert(db: Session, table: str, row: dict) -> None:
    names = ", ".join(row)
    params = ", ".join(f":{k}" for k in row)
    with db.begin_nested():
        db.execute(text(f"INSERT INTO {table} ({names}) VALUES ({params})"), row)


def _point(series: int, **columns) -> dict:
    return {
        "series_id": series,
        "position": 0,
        "x_value": 1.0,
        "y_value": 300.0,
        "x_normalized": 0.01,
        "y_normalized": 300e6,
        **columns,
    }


class TestPointConstraints:
    def test_a_valid_point_is_accepted(self, db_session: Session, series_id: int) -> None:
        _insert(db_session, "material_curve_point", _point(series_id))

    @pytest.mark.parametrize(
        "columns",
        [
            {"x_normalized": BIG},
            {"y_value": -BIG},
            {"y_normalized": None},
            {"position": -1},
            # a band on one side only
            {"y_min_value": 280.0, "y_min_normalized": 280e6},
            # a band that does not contain the line
            {
                "y_min_value": 310.0,
                "y_max_value": 320.0,
                "y_min_normalized": 310e6,
                "y_max_normalized": 320e6,
            },
        ],
    )
    def test_the_database_refuses(self, db_session: Session, series_id: int, columns) -> None:
        with pytest.raises(IntegrityError):
            _insert(db_session, "material_curve_point", _point(series_id, **columns))

    def test_positions_are_unique_per_series(self, db_session: Session, series_id: int) -> None:
        _insert(db_session, "material_curve_point", _point(series_id))
        with pytest.raises(IntegrityError):
            _insert(db_session, "material_curve_point", _point(series_id, x_value=2.0))


class TestCurveAndSeriesConstraints:
    def test_a_partial_parameter_trail_is_refused(
        self, db_session: Session, series_id: int
    ) -> None:
        with pytest.raises(IntegrityError):
            _insert(
                db_session,
                "material_curve_series",
                {"curve_id": 9001, "position": 1, "parameter_value": 20.0},
            )

    @pytest.mark.parametrize(
        "columns",
        [
            {"x_quantity": "velocidade"},
            {"title": ""},
            # half an external identity
            {"external_id": "abc"},
        ],
    )
    def test_curve_rows_refused(self, db_session: Session, series_id: int, columns) -> None:
        statement = text(
            "UPDATE material_curve SET "
            + ", ".join(f"{k} = :{k}" for k in columns)
            + " WHERE id = 9001"
        )
        with pytest.raises(IntegrityError), db_session.begin_nested():
            db_session.execute(statement, columns)


class TestDemo:
    def test_the_seed_created_the_demo_curves(self, db_session: Session) -> None:
        curves = db_session.execute(select(MaterialCurve)).scalars().all()
        assert len(curves) == len(DEMO_CURVES)
        assert all(curve.is_demo for curve in curves)
        assert all(curve.material.is_demo for curve in curves)
        assert {curve.kind.value for curve in curves} == {"TENSAO_DEFORMACAO", "FADIGA"}

    def test_the_seed_is_idempotent(self, db_session: Session) -> None:
        source = db_session.execute(select(Source).where(Source.is_demo.is_(True))).scalars().one()
        before = db_session.scalar(select(func.count(MaterialCurvePoint.id)))
        assert _seed_demo_curves(db_session, source) == 0
        assert db_session.scalar(select(func.count(MaterialCurvePoint.id))) == before

    def test_the_seed_refills_a_demo_material_that_lost_its_curves(
        self, db_session: Session
    ) -> None:
        source = db_session.execute(select(Source).where(Source.is_demo.is_(True))).scalars().one()
        assert clear_demo_curves(db_session) == len(DEMO_CURVES)
        assert _seed_demo_curves(db_session, source) == len(DEMO_CURVES)

    def test_a_demo_curve_on_a_real_material_is_cleared_too(
        self, db_session: Session, series_id: int
    ) -> None:
        db_session.execute(text("UPDATE material_curve SET is_demo = 1 WHERE id = 9001"))
        _insert(db_session, "material_curve_point", _point(series_id))
        clear_demo_data(db_session)
        db_session.flush()
        assert db_session.get(MaterialCurve, 9001) is None
        assert db_session.scalar(select(func.count(MaterialCurveSeries.id))) == 0
        assert db_session.scalar(select(func.count(MaterialCurvePoint.id))) == 0
        assert db_session.execute(
            select(Material).where(Material.name == "Aço real de teste")
        ).scalar_one()

    def test_a_real_curve_citing_a_demo_source_blocks_the_cleanup(
        self, db_session: Session, series_id: int
    ) -> None:
        demo = db_session.execute(select(Source).where(Source.is_demo.is_(True))).scalars().one()
        db_session.execute(
            text("UPDATE material_curve SET source_id = :s WHERE id = 9001"), {"s": demo.id}
        )
        with pytest.raises(RuntimeError, match="preservar proveniência"):
            clear_demo_data(db_session)
