"""Trajectory curves (D-118, TM4-c): a hysteresis loop is stored, drawn and refused honestly.

A ``path`` curve keeps the points in the order the source wrote them and lets x
repeat or turn back. Everything that needs one y per x — the value at a
declared x (D-110), the plastic CAE table (D-119), E read from a modulus curve —
refuses a path with the reason written, and nothing is interpolated or chosen.
Every number here is invented for the test.
"""

from __future__ import annotations

import csv
import dataclasses
import io
import logging
from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from alembic import command
from app.config import settings
from app.domain.curve_quantities import PATH_KINDS
from app.domain.curves import (
    PATH_AMBIGUOUS,
    CurveError,
    PointData,
    PointInput,
    SeriesData,
    SeriesInput,
    build_curve,
    draw_curve,
    read_at_declared_x,
)
from app.domain.release_diff import ChangeKind
from app.models.enums import CurveKind
from app.models.material_curve import MaterialCurve
from app.repositories.curve_repository import curve_rows
from app.tests.test_cae_export_api import _own_full_record
from app.tests.test_cae_plastic_api import _get as _cae_get
from app.tests.test_cae_plastic_api import _modulus, _source
from app.tests.test_material_curve_edit import _material_id
from app.tests.test_release_diff_universes import changes_of, curve, point, rec

#: An invented loop in % and MPa: load, unload, reverse, reload. x turns back.
LOOP = [(0.0, 0.0), (0.4, 300.0), (0.2, 0.0), (-0.2, -300.0), (0.0, 0.0), (0.4, 300.0)]


def _series(points=LOOP) -> list[SeriesInput]:
    return [SeriesInput(points=[PointInput(x, y) for x, y in points])]


def _build(path_kind: str = "path", points=LOOP, **kw):
    return build_curve(
        CurveKind.TENSAO_DEFORMACAO,
        x_quantity="deformacao",
        x_unit="%",
        y_quantity="tensao",
        y_unit="MPa",
        series=_series(points),
        path_kind=path_kind,
        **kw,
    )


class TestBuilder:
    def test_a_path_keeps_the_written_order_and_lets_x_turn_back(self) -> None:
        built = _build()
        assert built.path_kind == "path"
        (series,) = built.series
        assert [p.x_value for p in series.points] == [x for x, _ in LOOP]
        assert [p.position for p in series.points] == list(range(len(LOOP)))

    def test_a_function_still_refuses_x_that_turns_back(self) -> None:
        with pytest.raises(CurveError, match="x tem de crescer"):
            _build("function")

    def test_function_is_the_default(self) -> None:
        built = _build("function", points=[(0, 0), (1, 100)])
        assert built.path_kind == "function"
        assert (
            build_curve(
                CurveKind.TENSAO_DEFORMACAO,
                x_quantity="deformacao",
                x_unit="%",
                y_quantity="tensao",
                y_unit="MPa",
                series=_series([(0, 0), (1, 100)]),
            ).path_kind
            == "function"
        )

    def test_a_path_refuses_a_band(self) -> None:
        with pytest.raises(CurveError, match="trajetória não admite faixa"):
            build_curve(
                CurveKind.TENSAO_DEFORMACAO,
                x_quantity="deformacao",
                x_unit="%",
                y_quantity="tensao",
                y_unit="MPa",
                series=[SeriesInput(points=[PointInput(0, 0), PointInput(1, 100, 90, 110)])],
                path_kind="path",
            )

    def test_an_unknown_path_kind_is_refused_naming_the_admitted(self) -> None:
        with pytest.raises(CurveError, match="function, path"):
            _build("loop")

    def test_a_path_still_needs_two_finite_points(self) -> None:
        with pytest.raises(CurveError, match="ao menos 2"):
            _build(points=[(0, 0)])

    def test_the_vocabulary_has_both_kinds_labelled_in_portuguese(self) -> None:
        assert set(PATH_KINDS) == {"function", "path"}
        assert "Trajetória" in PATH_KINDS["path"]


def _data(points=LOOP) -> SeriesData:
    return SeriesData(
        id=1,
        label=None,
        conditions=None,
        parameter=None,
        parameter_original=None,
        parameter_original_unit=None,
        points=tuple(PointData(x / 100, y * 1e6, None, None, x, y, None, None) for x, y in points),
    )


class TestDrawingAndReading:
    def test_the_path_is_drawn_in_the_declared_order_with_a_note(self) -> None:
        drawn = draw_curve(
            CurveKind.TENSAO_DEFORMACAO, "deformacao", "tensao", None, [_data()], path_kind="path"
        )
        (series,) = drawn.series
        assert [round(x, 9) for x, _ in series.path] == [x for x, _ in LOOP]
        assert any("Trajetória" in note for note in drawn.notes)

    def test_a_function_has_no_trajectory_note(self) -> None:
        drawn = draw_curve(
            CurveKind.TENSAO_DEFORMACAO,
            "deformacao",
            "tensao",
            None,
            [_data([(0, 0), (1, 100)])],
        )
        assert not any("Trajetória" in note for note in drawn.notes)

    def test_reading_a_value_on_a_path_is_refused_never_chosen(self) -> None:
        with pytest.raises(CurveError, match="ambíguo"):
            read_at_declared_x(
                "deformacao", "tensao", None, [_data()], at=0.4, at_unit="%", path_kind="path"
            )


def _path_body(**overrides) -> dict:
    body = {
        "kind": "TENSAO_DEFORMACAO",
        "title": "Laço de histerese (fictício)",
        "x_quantity": "deformacao",
        "x_unit": "%",
        "y_quantity": "tensao",
        "y_unit": "MPa",
        "source_label": "Ensaio cíclico fictício",
        "path_kind": "path",
        "series": [{"points": [{"x": x, "y": y} for x, y in LOOP]}],
    }
    body.update(overrides)
    return body


class TestApi:
    def _create(self, client: TestClient, db_session: Session, **overrides) -> tuple[int, int]:
        mid = _material_id(db_session)
        response = client.post(f"/api/materials/{mid}/curvas", json=_path_body(**overrides))
        assert response.status_code == 201, response.text
        return mid, response.json()["id"]

    def test_a_loop_is_stored_and_drawn_in_order(self, client, db_session) -> None:
        mid, cid = self._create(client, db_session)
        body = client.get(f"/api/materials/{mid}/curvas/{cid}").json()
        assert body["path_kind"] == "path"
        assert body["path_kind_label"].startswith("Trajetória")
        (series,) = body["series"]
        assert [p["x_original"] for p in series["points"]] == [x for x, _ in LOOP]
        assert any("Trajetória" in note for note in body["notes"])

    def test_the_same_loop_as_a_function_is_400_in_portuguese(self, client, db_session) -> None:
        mid = _material_id(db_session)
        response = client.post(
            f"/api/materials/{mid}/curvas", json=_path_body(path_kind="function")
        )
        assert response.status_code == 400
        assert "x tem de crescer" in response.json()["detail"]

    def test_an_unknown_path_kind_is_rejected(self, client, db_session) -> None:
        mid = _material_id(db_session)
        response = client.post(f"/api/materials/{mid}/curvas", json=_path_body(path_kind="laço"))
        assert response.status_code == 422

    def test_an_existing_curve_reads_as_a_function(self, client, db_session) -> None:
        mid = _material_id(db_session)
        listed = client.get(f"/api/materials/{mid}/curvas").json()
        first = listed["curves"][0]["id"]
        body = client.get(f"/api/materials/{mid}/curvas/{first}").json()
        assert body["path_kind"] == "function"

    def test_the_value_at_x_of_a_loop_is_422_with_the_reason(self, client, db_session) -> None:
        mid, cid = self._create(client, db_session)
        response = client.get(f"/api/materials/{mid}/curvas/{cid}/valor?em=0.4&unidade_em=%25")
        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "trajetória" in detail and "nada é interpolado" in detail
        assert PATH_AMBIGUOUS in detail

    def test_the_points_file_says_trajectory_and_keeps_the_order(self, client, db_session) -> None:
        mid, cid = self._create(client, db_session)
        response = client.get(f"/api/exports/materiais/{mid}/curvas/{cid}.csv")
        assert response.status_code == 200, response.text
        text = response.text.lstrip("\ufeff")
        assert "Traçado" in text and "Trajetória" in text
        rows = list(csv.reader(io.StringIO(text)))
        ordinals = [r[2] for r in rows if len(r) > 3 and r[0] == "Série 1"]
        assert ordinals == [str(i) for i in range(1, len(LOOP) + 1)]


class TestCae:
    def _loop_curve(self, db: Session, material_id: int, source) -> MaterialCurve:
        row = curve_rows(
            _build(
                strain_measure="engineering",
            ),
            material_id=material_id,
            title="Laço fictício",
            source_id=source.id,
            is_demo=True,
        )
        db.add(row)
        db.flush()
        return row

    def test_a_plastic_card_from_a_loop_is_422(self, client, db_session) -> None:
        material_id = _own_full_record(client, db_session)
        source = _source(db_session)
        loop = self._loop_curve(db_session, material_id, source)
        _modulus(db_session, material_id, source)
        db_session.commit()
        response = _cae_get(client, material_id, "abaqus-plastic", curva=loop.id)
        assert response.status_code == 422
        assert "trajetória" in response.json()["detail"]


class TestDiff:
    def test_function_to_path_is_a_text_change(self) -> None:
        before = curve([point(0, 0), point(1, 100)])
        after = dataclasses.replace(before, path_kind="path")
        diff = changes_of(rec(curves={"c1": before}), rec(curves={"c1": after}))
        (change,) = diff.changes
        assert change.field == "curva:c1:tracado" and change.kind is ChangeKind.TEXT


class TestModelCheck:
    def test_the_database_refuses_an_unknown_path_kind(self, db_session: Session) -> None:
        mid = _material_id(db_session)
        existing = (
            db_session.execute(sa.select(MaterialCurve.id).where(MaterialCurve.material_id == mid))
            .scalars()
            .first()
        )
        assert existing is not None
        with pytest.raises(sa.exc.IntegrityError):
            with db_session.begin_nested():
                db_session.execute(
                    sa.update(MaterialCurve)
                    .where(MaterialCurve.id == existing)
                    .values(path_kind="loop")
                )


# --- the migration (8bc0982d66b8) on SQLite ------------------------------------

PRE_REVISION = "703bbf25ce90"
REVISION = "8bc0982d66b8"


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    # alembic.ini says script_location = alembic, which resolves against
    # the working directory; anchor it to this file so pytest runs anywhere.
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.fixture()
def _keep_logging() -> Iterator[None]:
    loggers = [logging.getLogger(name) for name in list(logging.root.manager.loggerDict)]
    state = [(lg, lg.disabled, lg.level) for lg in loggers]
    root_level = logging.root.level
    root_handlers = list(logging.root.handlers)
    yield
    for logger, disabled, level in state:
        logger.disabled = disabled
        logger.setLevel(level)
    logging.root.setLevel(root_level)
    logging.root.handlers[:] = root_handlers


@pytest.fixture()
def migrated_url(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, _keep_logging: None
) -> Iterator[str]:
    url = f"sqlite:///{tmp_path / 'path_kind_migration.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(_config(url), PRE_REVISION)
    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.execute(
            sa.text("INSERT INTO material_class (id, name, slug) VALUES (1, 'Metais', 'metais')")
        )
        conn.execute(
            sa.text(
                "INSERT INTO material (id, name, class_id, keywords, is_active, is_demo,"
                " is_synthesized, created_at) VALUES"
                " (1, 'Liga fictícia', 1, '[]', 1, 1, 0, '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO source (id, label, is_demo, contains_third_party_data)"
                " VALUES (1, 'Fonte fictícia', 1, 0)"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO material_curve (id, material_id, kind, title, x_quantity,"
                " y_quantity, x_original_unit, y_original_unit, x_canonical_unit,"
                " y_canonical_unit, x_conversion_method, y_conversion_method, source_id,"
                " data_quality, is_demo, created_at) VALUES (1, 1, 'TENSAO_DEFORMACAO',"
                " 'Curva', 'deformacao', 'tensao', '%', 'MPa', 'dimensionless', 'Pa',"
                " 'pint:%->dimensionless', 'pint:MPa->Pa', 1, 'ESTIMADO', 1, '2026-10-13')"
            )
        )
    engine.dispose()
    yield url


def _scalar(url: str, statement: str) -> object:
    engine = sa.create_engine(url)
    try:
        with engine.connect() as conn:
            return conn.execute(sa.text(statement)).scalar_one()
    finally:
        engine.dispose()


def _run(url: str, statement: str) -> None:
    engine = sa.create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(sa.text(statement))
    finally:
        engine.dispose()


def test_the_migration_marks_existing_curves_as_functions(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)
    assert _scalar(migrated_url, "SELECT path_kind FROM material_curve") == "function"


def test_the_migration_check_reaches_the_database(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)
    _run(migrated_url, "UPDATE material_curve SET path_kind = 'path' WHERE id = 1")
    with pytest.raises(sa.exc.IntegrityError):
        _run(migrated_url, "UPDATE material_curve SET path_kind = 'loop' WHERE id = 1")


def test_the_migration_comes_back_down(migrated_url: str) -> None:
    config = _config(migrated_url)
    command.upgrade(config, REVISION)
    command.downgrade(config, PRE_REVISION)
    engine = sa.create_engine(migrated_url)
    try:
        columns = {c["name"] for c in sa.inspect(engine).get_columns("material_curve")}
    finally:
        engine.dispose()
    assert "path_kind" not in columns
    command.upgrade(config, REVISION)
