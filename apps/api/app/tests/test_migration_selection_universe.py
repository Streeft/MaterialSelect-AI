"""The P0-3 migration, run against a database that already holds a study.

Same reason as its two predecessors: the shared test database is built from
``Base.metadata.create_all`` and never from the migrations, so it never starts
in the pre-P0-3 state these NOT NULL columns are added against.

What this one has to prove is narrower and sharper than "the column exists":
the backfill's value must be the **honest** one. A study saved before P0-3
returns materials, so ``universe`` must come out ``"material"`` — not because
that is a convenient default, but because it is what the study does.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

#: The revision immediately before the one under test — P0-2's process universe.
PRE_UNIVERSE_REVISION = "b7e2d9c4a105"


@pytest.fixture()
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A database at the pre-P0-3 revision, holding two studies and three stages."""
    url = f"sqlite:///{tmp_path / 'universe_migration.db'}"
    # `alembic/env.py` overwrites `sqlalchemy.url` with the application settings
    # on every run, so steering the settings object is the only way to point a
    # migration at the temporary database — and it is what makes this test safe.
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(_config(url), PRE_UNIVERSE_REVISION)

    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO project (id, name, owner_id, created_at)"
                " VALUES (1, 'Projeto', 1, '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO selection_study (id, name, project_id, free_variables, combinator,"
                " normalization, method, created_at) VALUES"
                " (1, 'estudo A', 1, '[]', 'AND', 'minmax', 'weighted_sum', '2026-01-01'),"
                " (2, 'estudo B', 1, '[]', 'OR', 'minmax', 'topsis', '2026-01-02')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO selection_stage"
                " (id, study_id, position, kind, label, enabled, class_slugs, process_slugs,"
                " process_class_slugs, include_descendants) VALUES"
                " (1, 1, 0, 'limit', NULL, 1, '[]', '[]', '[]', 1),"
                " (2, 1, 1, 'tree', 'Só metais', 1, '[\"metais\"]', '[]', '[]', 1),"
                " (3, 2, 0, 'process', 'Soldável', 1, '[]', '[\"solda-mig\"]', '[]', 1)"
            )
        )
    engine.dispose()

    yield url


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def _rows(url: str, statement: str) -> list[sa.Row]:
    engine = sa.create_engine(url)
    try:
        with engine.connect() as conn:
            return list(conn.execute(sa.text(statement)).all())
    finally:
        engine.dispose()


def test_every_existing_study_returns_materials(migrated_url: str) -> None:
    """The honest value, not a convenient one: these studies do return materials."""
    command.upgrade(_config(migrated_url), "head")

    rows = _rows(migrated_url, "SELECT id, universe FROM selection_study ORDER BY id")
    assert [(r.id, r.universe) for r in rows] == [(1, "material"), (2, "material")]


def test_every_existing_stage_gets_an_empty_material_folder_list(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), "head")

    rows = _rows(
        migrated_url,
        "SELECT id, kind, material_class_slugs FROM selection_stage ORDER BY id",
    )
    assert [(r.id, r.kind) for r in rows] == [(1, "limit"), (2, "tree"), (3, "process")]
    for row in rows:
        assert row.material_class_slugs == "[]"


def test_the_pre_existing_payloads_are_untouched(migrated_url: str) -> None:
    """P0-1's and P0-2's own columns still say exactly what they said."""
    command.upgrade(_config(migrated_url), "head")

    rows = _rows(
        migrated_url,
        "SELECT class_slugs, process_slugs, process_class_slugs FROM selection_stage"
        " WHERE id IN (2, 3) ORDER BY id",
    )
    assert rows[0].class_slugs == '["metais"]'
    assert rows[1].process_slugs == '["solda-mig"]'
    assert rows[1].process_class_slugs == "[]"


def test_a_process_study_can_be_written_once_the_column_exists(migrated_url: str) -> None:
    """The column is usable, not merely present."""
    command.upgrade(_config(migrated_url), "head")

    engine = sa.create_engine(migrated_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                sa.text(
                    "INSERT INTO selection_study (id, name, project_id, free_variables,"
                    " universe, combinator, normalization, method, created_at)"
                    " VALUES (3, 'estudo de processos', 1, '[]', 'process', 'AND', 'minmax',"
                    " 'weighted_sum', '2026-01-03')"
                )
            )
            conn.execute(
                sa.text(
                    "INSERT INTO selection_stage (id, study_id, position, kind, enabled,"
                    " class_slugs, process_slugs, process_class_slugs, material_class_slugs,"
                    " include_descendants)"
                    " VALUES (4, 3, 0, 'material', 1, '[]', '[]', '[]', '[\"polimeros\"]', 1)"
                )
            )
    finally:
        engine.dispose()

    rows = _rows(
        migrated_url,
        "SELECT s.universe, st.kind, st.material_class_slugs FROM selection_study s"
        " JOIN selection_stage st ON st.study_id = s.id WHERE s.id = 3",
    )
    assert [(r.universe, r.kind, r.material_class_slugs) for r in rows] == [
        ("process", "material", '["polimeros"]')
    ]


def test_downgrade_removes_both_columns_and_keeps_the_studies(migrated_url: str) -> None:
    config = _config(migrated_url)
    command.upgrade(config, "head")
    command.downgrade(config, PRE_UNIVERSE_REVISION)

    engine = sa.create_engine(migrated_url)
    try:
        inspector = sa.inspect(engine)
        study_columns = {c["name"] for c in inspector.get_columns("selection_study")}
        stage_columns = {c["name"] for c in inspector.get_columns("selection_stage")}
    finally:
        engine.dispose()
    assert "universe" not in study_columns
    assert "material_class_slugs" not in stage_columns

    rows = _rows(migrated_url, "SELECT id, name FROM selection_study ORDER BY id")
    assert [(r.id, r.name) for r in rows] == [(1, "estudo A"), (2, "estudo B")]
