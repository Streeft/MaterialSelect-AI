"""The D-106 migration, run up and down against a database that already has a catalogue.

The shared test database is built by ``create_all`` and never by the
migrations, so this is where the migration itself is proved: that it creates
the three tables with their ``CHECK``s (not just the columns), that it touches
no existing row — there is no backfill, because a material with no curve row is
"no curve registered" and not an empty curve — and that it comes back down.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

PRE_REVISION = "0d3c39eb2f81"
REVISION = "0925e0787863"
TABLES = {"material_curve", "material_curve_series", "material_curve_point"}


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.fixture()
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    url = f"sqlite:///{tmp_path / 'curves_migration.db'}"
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
                " (1, 'Aço 1020', 1, '[]', 1, 0, 0, '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO source (id, label, is_demo, contains_third_party_data)"
                " VALUES (1, 'Fonte', 0, 0)"
            )
        )
    engine.dispose()
    yield url


def _tables(url: str) -> set[str]:
    engine = sa.create_engine(url)
    try:
        return set(sa.inspect(engine).get_table_names())
    finally:
        engine.dispose()


def _run(url: str, statement: str) -> None:
    engine = sa.create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(sa.text(statement))
    finally:
        engine.dispose()


CURVE = (
    "INSERT INTO material_curve (id, material_id, kind, title, x_quantity, y_quantity,"
    " x_original_unit, y_original_unit, x_canonical_unit, y_canonical_unit,"
    " x_conversion_method, y_conversion_method, source_id, data_quality, is_demo, created_at)"
    " VALUES (1, 1, 'FADIGA', 'S-N', 'ciclos', '{y}', 'dimensionless', 'MPa', 'dimensionless',"
    " 'Pa', 'identity:dimensionless', 'pint:MPa->Pa', 1, 'IMPORTADO', 0, '2026-10-07')"
)
POINT = (
    "INSERT INTO material_curve_point (series_id, position, x_value, y_value, x_normalized,"
    " y_normalized{extra_columns}) VALUES (1, {position}, 1000, 200, 1000, {y}{extra_values})"
)


def test_upgrade_creates_the_tables_and_touches_no_material(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)
    assert TABLES <= _tables(migrated_url)
    engine = sa.create_engine(migrated_url)
    try:
        with engine.connect() as conn:
            assert conn.execute(sa.text("SELECT count(*) FROM material_curve")).scalar() == 0
            assert conn.execute(sa.text("SELECT name FROM material")).scalar() == "Aço 1020"
    finally:
        engine.dispose()


def test_the_checks_reach_the_database(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)
    with pytest.raises(sa.exc.IntegrityError):
        _run(migrated_url, CURVE.format(y="velocidade"))
    _run(migrated_url, CURVE.format(y="tensao"))
    _run(
        migrated_url,
        "INSERT INTO material_curve_series (id, curve_id, position) VALUES (1, 1, 0)",
    )
    _run(migrated_url, POINT.format(position=0, y="200e6", extra_columns="", extra_values=""))
    for bad in (
        POINT.format(position=1, y="1e309", extra_columns="", extra_values=""),
        POINT.format(
            position=2, y="200e6", extra_columns=", y_min_normalized", extra_values=", 190e6"
        ),
        POINT.format(
            position=3,
            y="200e6",
            extra_columns=", y_min_value, y_max_value, y_min_normalized, y_max_normalized",
            extra_values=", 210, 220, 210e6, 220e6",
        ),
        POINT.format(position=0, y="201e6", extra_columns="", extra_values=""),
    ):
        with pytest.raises(sa.exc.IntegrityError):
            _run(migrated_url, bad)


def test_downgrade_removes_the_tables_and_upgrade_returns(migrated_url: str) -> None:
    config = _config(migrated_url)
    command.upgrade(config, REVISION)
    command.downgrade(config, PRE_REVISION)
    assert not TABLES & _tables(migrated_url)
    command.upgrade(config, REVISION)
    assert TABLES <= _tables(migrated_url)
