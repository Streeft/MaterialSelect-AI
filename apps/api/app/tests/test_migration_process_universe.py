"""The P0-2 migration, run against a database that already holds a saved stage.

Same reason ``test_migration_selection_stage.py`` exists: the shared test
database is built from ``Base.metadata.create_all`` and never from the
migrations, so it never starts in the pre-P0-2 state the two new
``selection_stage`` columns are added against. A NOT NULL column added to a
table that already has rows is exactly the failure that only shows up in
production, and the only way to catch it is to replay the real migration
against real rows.

Isolated and slower than the rest of the suite (a few seconds, replaying every
revision) on purpose: it builds its own engine and never touches the
session-scoped fixtures.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

#: The revision immediately before the one under test — P0-1's selection_stage.
PRE_PROCESS_REVISION = "a1c4f2e8b7d3"


@pytest.fixture()
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A database at the pre-P0-2 revision, holding a study with two stages.

    Two, and of both kinds that existed then, because the backfill has to fill
    the new columns on *every* stage row — a limit stage included, which will
    never carry a process selection but still needs the column to be non-NULL.
    """
    url = f"sqlite:///{tmp_path / 'process_migration.db'}"
    # `alembic/env.py` overwrites `sqlalchemy.url` with the application settings
    # on every run — on purpose, so the URL is never hard-coded in a config
    # file. Pointing the settings object at the temporary database is therefore
    # the only way to steer a migration, and it is what makes this test safe: it
    # can never touch the developer's own database.
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(_config(url), PRE_PROCESS_REVISION)

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
                " normalization, method, created_at)"
                " VALUES (1, 'estudo anterior ao P0-2', 1, '[]', 'AND', 'minmax',"
                " 'weighted_sum', '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO selection_stage"
                " (id, study_id, position, kind, label, enabled, class_slugs,"
                " include_descendants)"
                " VALUES (1, 1, 0, 'limit', NULL, 1, '[]', 1),"
                " (2, 1, 1, 'tree', 'Só metais', 1, '[\"metais\"]', 1)"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO selection_constraint_group"
                " (id, study_id, parent_group_id, stage_id, operator, position)"
                " VALUES (1, 1, NULL, 1, 'AND', 0)"
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


def test_existing_stages_get_empty_process_selections(migrated_url: str) -> None:
    """The backfill's whole job: no NULL left behind, and nothing invented.

    An empty list is the honest value here — a stage saved before P0-2 selects
    no process, and that is different from "we do not know", which is why the
    column ends up NOT NULL rather than nullable.
    """
    command.upgrade(_config(migrated_url), "head")

    rows = _rows(
        migrated_url,
        "SELECT id, kind, process_slugs, process_class_slugs FROM selection_stage ORDER BY id",
    )
    assert [(r.id, r.kind) for r in rows] == [(1, "limit"), (2, "tree")]
    for row in rows:
        assert row.process_slugs == "[]"
        assert row.process_class_slugs == "[]"


def test_pre_existing_stage_payload_is_untouched(migrated_url: str) -> None:
    """A tree stage still selects exactly the folder it selected before."""
    command.upgrade(_config(migrated_url), "head")

    rows = _rows(
        migrated_url,
        "SELECT label, class_slugs, include_descendants FROM selection_stage WHERE id = 2",
    )
    assert rows[0].label == "Só metais"
    assert rows[0].class_slugs == '["metais"]'
    assert rows[0].include_descendants == 1


def test_process_tables_exist_and_are_empty(migrated_url: str) -> None:
    """The migration describes the schema; the demo universe comes from the seed."""
    command.upgrade(_config(migrated_url), "head")

    for table in ("process_class", "process", "material_process"):
        assert _rows(migrated_url, f"SELECT COUNT(*) AS n FROM {table}")[0].n == 0


def test_a_link_survives_a_round_trip_through_the_new_tables(migrated_url: str) -> None:
    """The join is usable, and the composite key really is the pair.

    Inserting the same pair twice must fail: without the composite primary key
    a material could be linked to one process any number of times, and every
    reader would then have to deduplicate.
    """
    command.upgrade(_config(migrated_url), "head")

    engine = sa.create_engine(migrated_url)
    try:
        with engine.begin() as conn:
            conn.execute(
                sa.text(
                    "INSERT INTO material_class (id, name, slug) VALUES (1, 'Metais', 'metais')"
                )
            )
            conn.execute(
                sa.text(
                    "INSERT INTO material (id, name, class_id, keywords, is_active, is_demo,"
                    " created_at) VALUES (1, 'Aço 1020', 1, '[]', 1, 1, '2026-01-01')"
                )
            )
            conn.execute(
                sa.text("INSERT INTO process_class (id, name, slug) VALUES (1, 'União', 'uniao')")
            )
            conn.execute(
                sa.text(
                    "INSERT INTO process (id, name, slug, class_id, is_active, is_demo,"
                    " created_at) VALUES (1, 'Solda MIG', 'solda-mig', 1, 1, 1, '2026-01-01')"
                )
            )
            conn.execute(
                sa.text("INSERT INTO material_process (material_id, process_id) VALUES (1, 1)")
            )

        with engine.connect() as conn:
            joined = conn.execute(
                sa.text(
                    "SELECT m.name AS material, p.name AS process FROM material_process mp"
                    " JOIN material m ON m.id = mp.material_id"
                    " JOIN process p ON p.id = mp.process_id"
                )
            ).all()
        assert [(r.material, r.process) for r in joined] == [("Aço 1020", "Solda MIG")]

        with pytest.raises(sa.exc.IntegrityError):
            with engine.begin() as conn:
                conn.execute(
                    sa.text("INSERT INTO material_process (material_id, process_id) VALUES (1, 1)")
                )
    finally:
        engine.dispose()


def test_downgrade_removes_the_universe_and_keeps_the_stages(migrated_url: str) -> None:
    """Reversible, and the study it did not create survives the reversal."""
    config = _config(migrated_url)
    command.upgrade(config, "head")
    command.downgrade(config, PRE_PROCESS_REVISION)

    engine = sa.create_engine(migrated_url)
    try:
        names = set(sa.inspect(engine).get_table_names())
    finally:
        engine.dispose()
    assert "process" not in names
    assert "process_class" not in names
    assert "material_process" not in names

    rows = _rows(migrated_url, "SELECT id, kind, class_slugs FROM selection_stage ORDER BY id")
    assert [(r.id, r.kind, r.class_slugs) for r in rows] == [
        (1, "limit", "[]"),
        (2, "tree", '["metais"]'),
    ]
