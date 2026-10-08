"""The D-119 migration (``81adb0b92f72``) run up and down on SQLite.

The shared test database is built by ``create_all``, so the migration itself is
proved here: two nullable columns, no backfill, the ``CHECK``s in the database,
and the way back down. Named ``test_migration_*`` like the other migration
tests, and the logging configuration that ``alembic/env.py`` rewrites
(``fileConfig`` disables existing loggers) is restored after each test, so a
later ``caplog`` test still sees its records.
"""

from __future__ import annotations

import logging
from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

PRE_REVISION = "73a9b5da72b2"
REVISION = "81adb0b92f72"


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.fixture(autouse=True)
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
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    url = f"sqlite:///{tmp_path / 'measure_migration.db'}"
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
        conn.execute(sa.text(_CURVE.format(id=1, kind="TENSAO_DEFORMACAO", y="tensao")))
    engine.dispose()
    yield url


_CURVE = (
    "INSERT INTO material_curve (id, material_id, kind, title, x_quantity, y_quantity,"
    " x_original_unit, y_original_unit, x_canonical_unit, y_canonical_unit,"
    " x_conversion_method, y_conversion_method, source_id, data_quality, is_demo, created_at)"
    " VALUES ({id}, 1, '{kind}', 'Curva', 'deformacao', '{y}', '%', 'MPa', 'dimensionless',"
    " 'Pa', 'pint:%->dimensionless', 'pint:MPa->Pa', 1, 'ESTIMADO', 1, '2026-10-08')"
)


def _run(url: str, statement: str) -> None:
    engine = sa.create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(sa.text(statement))
    finally:
        engine.dispose()


def _columns(url: str) -> set[str]:
    engine = sa.create_engine(url)
    try:
        return {c["name"] for c in sa.inspect(engine).get_columns("material_curve")}
    finally:
        engine.dispose()


def test_the_migration_adds_nullable_columns_without_backfill(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)
    assert {"strain_measure", "modulus_kind"} <= _columns(migrated_url)
    engine = sa.create_engine(migrated_url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                sa.text("SELECT strain_measure, modulus_kind FROM material_curve")
            ).one()
    finally:
        engine.dispose()
    assert tuple(row) == (None, None)


def test_the_migration_checks_reach_the_database(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)
    _run(migrated_url, "UPDATE material_curve SET strain_measure = 'engineering' WHERE id = 1")
    for bad in (
        "UPDATE material_curve SET strain_measure = 'nominal' WHERE id = 1",
        "UPDATE material_curve SET modulus_kind = 'young' WHERE id = 1",
    ):
        with pytest.raises(sa.exc.IntegrityError):
            _run(migrated_url, bad)


def test_the_migration_comes_back_down(migrated_url: str) -> None:
    config = _config(migrated_url)
    command.upgrade(config, REVISION)
    command.downgrade(config, PRE_REVISION)
    assert not {"strain_measure", "modulus_kind"} & _columns(migrated_url)
    command.upgrade(config, REVISION)
    assert {"strain_measure", "modulus_kind"} <= _columns(migrated_url)
