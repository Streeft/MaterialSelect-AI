"""The P0-1 migration's backfill, run against a database that already holds a study.

Why this file exists at all: the shared test database is built from
``Base.metadata.create_all`` and never from the migrations, so it never starts
in the pre-P0-1 state the backfill runs against — which is why the M6 note in
``test_selection_api.py`` says its own backfill was "verified by hand". Hand
verification does not survive a refactor. This runs the real migration, on a
real (temporary, file-backed) database, in both directions.

It is slower than the rest of the suite (a few seconds, replaying every
revision) and deliberately isolated: it builds its own engine and never touches
the session-scoped fixtures.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

#: The revision immediately before the one under test — M6's constraint_group.
PRE_STAGE_REVISION = "6845a9523f17"


@pytest.fixture()
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A database advanced to the pre-P0-1 revision, holding one saved study.

    The study has M6's full shape — a root group with a nested child group and
    a constraint — because the backfill has to repoint *every* group of the
    study at the new stage, not only the root.
    """
    url = f"sqlite:///{tmp_path / 'stage_migration.db'}"
    # `alembic/env.py` overwrites `sqlalchemy.url` with the application
    # settings on every run — on purpose, so the URL is never hard-coded in a
    # config file. Pointing the settings object at the temporary database is
    # therefore the only way to steer a migration, and it is what makes this
    # test safe: it can never touch the developer's own database.
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(_config(url), PRE_STAGE_REVISION)

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
                " VALUES (1, 'estudo anterior ao P0-1', 1, '[]', 'AND', 'minmax',"
                " 'weighted_sum', '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO selection_constraint_group"
                " (id, study_id, parent_group_id, operator, position)"
                " VALUES (1, 1, NULL, 'AND', 0), (2, 1, 1, 'OR', 0)"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO selection_constraint"
                " (id, study_id, group_id, position, operator, property_slug, value, class_slugs)"
                " VALUES (1, 1, 1, 0, 'gte', 'densidade', 1000.0, '[]')"
            )
        )
    engine.dispose()

    yield url


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def test_backfill_gives_the_existing_study_one_enabled_limit_stage(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), "head")

    engine = sa.create_engine(migrated_url)
    with engine.begin() as conn:
        rows = conn.execute(
            sa.text(
                "SELECT study_id, position, kind, label, enabled, include_descendants"
                " FROM selection_stage"
            )
        ).all()
    engine.dispose()

    assert len(rows) == 1
    stage = rows[0]
    assert stage.study_id == 1
    assert stage.position == 0
    assert stage.kind == "limit"
    # Not named: the migration does not invent a label the user never wrote.
    assert stage.label is None
    assert bool(stage.enabled) is True
    assert bool(stage.include_descendants) is True


def test_backfill_repoints_every_group_of_the_study_not_only_the_root(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), "head")

    engine = sa.create_engine(migrated_url)
    with engine.begin() as conn:
        stage_id = conn.execute(sa.text("SELECT id FROM selection_stage")).scalar_one()
        groups = conn.execute(
            sa.text(
                "SELECT id, parent_group_id, stage_id FROM selection_constraint_group ORDER BY id"
            )
        ).all()
    engine.dispose()

    assert [g.stage_id for g in groups] == [stage_id, stage_id]
    # The nesting itself is untouched: the child still points at its parent.
    assert [g.parent_group_id for g in groups] == [None, 1]


def test_the_study_still_evaluates_the_same_after_the_migration(migrated_url: str) -> None:
    """The constraint keeps its group, its operator and its threshold — the
    migration adds a container, it does not rewrite what is inside."""
    command.upgrade(_config(migrated_url), "head")

    engine = sa.create_engine(migrated_url)
    with engine.begin() as conn:
        row = conn.execute(
            sa.text("SELECT group_id, operator, property_slug, value FROM selection_constraint")
        ).one()
        combinator = conn.execute(sa.text("SELECT combinator FROM selection_study")).scalar_one()
    engine.dispose()

    assert (row.group_id, row.operator, row.property_slug, row.value) == (
        1,
        "gte",
        "densidade",
        1000.0,
    )
    assert combinator == "AND"


def test_stage_id_is_not_null_after_the_backfill(migrated_url: str) -> None:
    """The column is added nullable and locked afterwards; if the lock step were
    dropped, nothing else in the suite would notice."""
    command.upgrade(_config(migrated_url), "head")

    engine = sa.create_engine(migrated_url)
    with engine.begin() as conn:
        columns = conn.execute(sa.text("PRAGMA table_info(selection_constraint_group)")).all()
    engine.dispose()

    stage_id = next(c for c in columns if c[1] == "stage_id")
    assert stage_id[3] == 1  # notnull


def test_downgrade_removes_the_table_and_the_column(migrated_url: str) -> None:
    config = _config(migrated_url)
    command.upgrade(config, "head")
    command.downgrade(config, PRE_STAGE_REVISION)

    engine = sa.create_engine(migrated_url)
    with engine.begin() as conn:
        tables = {
            r[0] for r in conn.execute(sa.text("SELECT name FROM sqlite_master WHERE type='table'"))
        }
        columns = {
            c[1] for c in conn.execute(sa.text("PRAGMA table_info(selection_constraint_group)"))
        }
    engine.dispose()

    assert "selection_stage" not in tables
    assert "stage_id" not in columns
