"""The D-105 migration, run up and down against a database that already has a catalogue.

The shared test database is built by ``create_all`` and never by the
migrations, so this is where the migration itself is proved: that it creates
the two tables with their ``CHECK``s (not just the columns), that it touches no
existing row — there is no backfill, because a material with no composition row
is "none registered" and not 0 % — and that it comes back down cleanly.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

PRE_REVISION = "a2f7c91d0e64"
REVISION = "0d3c39eb2f81"


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.fixture()
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    url = f"sqlite:///{tmp_path / 'composition_migration.db'}"
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


def test_upgrade_creates_both_tables_and_touches_no_material(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)

    assert {"material_composition", "material_designation"} <= _tables(migrated_url)
    engine = sa.create_engine(migrated_url)
    try:
        with engine.connect() as conn:
            assert conn.execute(sa.text("SELECT count(*) FROM material_composition")).scalar() == 0
            assert conn.execute(sa.text("SELECT name FROM material")).scalar() == "Aço 1020"
    finally:
        engine.dispose()


def test_the_checks_reach_the_database(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)
    columns = (
        "material_id, element, position, is_balance, is_missing, source_id, data_quality,"
        " is_demo, created_at"
    )
    _run(
        migrated_url,
        f"INSERT INTO material_composition ({columns}, normalized_max)"
        " VALUES (1, 'Cr', 0, 0, 0, 1, 'IMPORTADO', 0, '2026-10-07', 1.0)",
    )
    for bad in (
        # balance with a number
        f"INSERT INTO material_composition ({columns}, normalized_max)"
        " VALUES (1, 'Fe', 0, 1, 0, 1, 'IMPORTADO', 0, '2026-10-07', 70.0)",
        # unknown element
        f"INSERT INTO material_composition ({columns}, normalized_max)"
        " VALUES (1, 'Xx', 0, 0, 0, 1, 'IMPORTADO', 0, '2026-10-07', 1.0)",
        # inverted range
        f"INSERT INTO material_composition ({columns}, normalized_min, normalized_max)"
        " VALUES (1, 'Ni', 0, 0, 0, 1, 'IMPORTADO', 0, '2026-10-07', 9.0, 8.0)",
    ):
        with pytest.raises(sa.exc.IntegrityError):
            _run(migrated_url, bad)


def test_downgrade_removes_both_tables_and_upgrade_returns(migrated_url: str) -> None:
    config = _config(migrated_url)
    command.upgrade(config, REVISION)
    command.downgrade(config, PRE_REVISION)
    assert not {"material_composition", "material_designation"} & _tables(migrated_url)
    command.upgrade(config, REVISION)
    assert {"material_composition", "material_designation"} <= _tables(migrated_url)
