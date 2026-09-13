"""The P1-2 migration, run against a database that already holds stages.

Same reason as its four predecessors: the shared test database is built from
``Base.metadata.create_all`` and never from the migrations, so it never starts
in the pre-chart state these columns are added against.

What this one has to prove is different from P0-1, P0-2 and P0-3, and closer to
P0-4. Those three added a NOT NULL column to a populated table, so the question
was whether the **backfill** wrote the honest value. Here there is no backfill at
all — every column is born nullable and *stays* nullable — so the two things to
prove are the two that replace it:

* that an absent bound stays absent. NULL means "no bound" and 0 is a bound, so
  a migration that filled these in would be inventing a limit on stages that
  never had one;
* that the axes check constraint reaches the database — and that it constrains
  the chart stage **only**, because the other four kinds leave these columns
  NULL and a check that read them would refuse every stage already saved.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

#: The revision immediately before the one under test — P0-4's constraint labels.
PRE_CHART_REVISION = "e6c3f45a91d8"

#: The eleven columns of the chart payload, in the order the migration adds them.
CHART_COLUMNS = (
    "chart_x_slug",
    "chart_x_expression",
    "chart_y_slug",
    "chart_y_expression",
    "chart_x_min",
    "chart_x_max",
    "chart_y_min",
    "chart_y_max",
    "chart_index_expression",
    "chart_index_goal",
    "chart_index_level",
)


@pytest.fixture()
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A database at the pre-P1-2 revision, holding a study and two stages."""
    url = f"sqlite:///{tmp_path / 'chart_migration.db'}"
    # `alembic/env.py` overwrites `sqlalchemy.url` with the application settings
    # on every run, so steering the settings object is the only way to point a
    # migration at the temporary database — and it is what makes this test safe.
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(_config(url), PRE_CHART_REVISION)

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
                "INSERT INTO selection_study (id, name, project_id, free_variables, universe,"
                " combinator, normalization, method, created_at)"
                " VALUES (1, 'estudo', 1, '[]', 'material', 'AND', 'minmax', 'weighted_sum',"
                " '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO selection_stage"
                " (id, study_id, position, kind, label, enabled, class_slugs, process_slugs,"
                " process_class_slugs, material_class_slugs, include_descendants) VALUES"
                " (1, 1, 0, 'limit', NULL, 1, '[]', '[]', '[]', '[]', 1),"
                " (2, 1, 1, 'tree', 'Só metais', 1, '[\"metais\"]', '[]', '[]', '[]', 1)"
            )
        )
    engine.dispose()

    yield url


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def _columns(url: str, table: str) -> dict[str, sa.engine.interfaces.ReflectedColumn]:
    engine = sa.create_engine(url)
    try:
        return {c["name"]: c for c in sa.inspect(engine).get_columns(table)}
    finally:
        engine.dispose()


def _execute(url: str, statement: str) -> None:
    engine = sa.create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(sa.text(statement))
    finally:
        engine.dispose()


def _rows(url: str, statement: str) -> list[sa.Row]:
    engine = sa.create_engine(url)
    try:
        with engine.connect() as conn:
            return list(conn.execute(sa.text(statement)).all())
    finally:
        engine.dispose()


def _chart_stage(**overrides: object) -> str:
    """An INSERT for one chart stage, with every column the table requires.

    Written as a builder rather than as a pile of near-identical SQL strings so
    that each test below can name the *one* thing it is about — a missing axis, a
    doubled one — and nothing else.
    """
    values: dict[str, object] = {
        "id": 3,
        "study_id": 1,
        "position": 2,
        "kind": "'chart'",
        "enabled": 1,
        "class_slugs": "'[]'",
        "process_slugs": "'[]'",
        "process_class_slugs": "'[]'",
        "material_class_slugs": "'[]'",
        "include_descendants": 1,
        "chart_x_slug": "'densidade'",
        "chart_y_slug": "'modulo-elastico'",
    }
    values.update(overrides)
    columns = ", ".join(values)
    literals = ", ".join(str(v) for v in values.values())
    return f"INSERT INTO selection_stage ({columns}) VALUES ({literals})"


def test_the_eleven_chart_columns_arrive_and_every_one_of_them_is_nullable(
    migrated_url: str,
) -> None:
    """Nullable is the point, not an oversight: NULL is "sem limite", and a NOT
    NULL column here would force every stage to invent a bound it never had."""
    command.upgrade(_config(migrated_url), "head")

    columns = _columns(migrated_url, "selection_stage")
    assert set(CHART_COLUMNS) <= set(columns)
    for name in CHART_COLUMNS:
        assert columns[name]["nullable"] is True, name


def test_the_stages_already_saved_come_out_with_no_bounds_at_all(migrated_url: str) -> None:
    """There is no backfill, and this is what that means in the data.

    A stage saved before P1-2 draws no box, so every bound has to read NULL. A
    zero here would be a limit — one the reader never set — and it would filter.
    """
    command.upgrade(_config(migrated_url), "head")

    rows = _rows(
        migrated_url,
        f"SELECT id, kind, {', '.join(CHART_COLUMNS)} FROM selection_stage ORDER BY id",
    )
    assert [(r.id, r.kind) for r in rows] == [(1, "limit"), (2, "tree")]
    for row in rows:
        for name in CHART_COLUMNS:
            assert getattr(row, name) is None, (row.id, name)


def test_the_payloads_of_the_earlier_stage_types_survive_the_rebuild(migrated_url: str) -> None:
    """SQLite has no ALTER ADD CONSTRAINT, so ``batch_alter_table`` copies the
    table into a new one — and a copy is exactly where a payload gets lost."""
    command.upgrade(_config(migrated_url), "head")

    rows = _rows(
        migrated_url,
        "SELECT id, study_id, position, label, enabled, class_slugs, include_descendants"
        " FROM selection_stage ORDER BY id",
    )
    assert [(r.id, r.study_id, r.position) for r in rows] == [(1, 1, 0), (2, 1, 1)]
    assert (rows[1].label, rows[1].class_slugs) == ("Só metais", '["metais"]')
    assert rows[0].enabled == 1
    assert rows[1].include_descendants == 1


def test_a_chart_stage_is_writable_with_its_box_and_its_index_line(migrated_url: str) -> None:
    """The columns are usable, not merely present — and the level survives as the
    number it is, because that is what a saved study re-runs against."""
    command.upgrade(_config(migrated_url), "head")
    _execute(
        migrated_url,
        _chart_stage(
            chart_x_min=1000.0,
            chart_x_max=8000.0,
            chart_y_min=10.0,
            chart_index_expression="'modulo-elastico**0.5/densidade'",
            chart_index_goal="'maximize'",
            chart_index_level=0.003,
        ),
    )

    row = _rows(
        migrated_url,
        f"SELECT {', '.join(CHART_COLUMNS)} FROM selection_stage WHERE id = 3",
    )[0]
    assert (row.chart_x_slug, row.chart_y_slug) == ("densidade", "modulo-elastico")
    assert (row.chart_x_min, row.chart_x_max) == (1000.0, 8000.0)
    # The ceiling the reader did not draw stays undrawn.
    assert (row.chart_y_min, row.chart_y_max) == (10.0, None)
    assert row.chart_index_expression == "modulo-elastico**0.5/densidade"
    assert (row.chart_index_goal, row.chart_index_level) == ("maximize", 0.003)


def test_an_axis_that_names_both_a_property_and_an_expression_is_refused(
    migrated_url: str,
) -> None:
    """Two coordinates for one axis is not a stage the engine can read: it would
    have to pick one, and either pick is a silent answer to a real ambiguity."""
    command.upgrade(_config(migrated_url), "head")

    with pytest.raises(sa.exc.IntegrityError):
        _execute(migrated_url, _chart_stage(chart_x_expression="'densidade*2'"))


def test_an_axis_that_names_neither_is_refused_by_the_same_constraint(
    migrated_url: str,
) -> None:
    """The other half: a chart stage with no y coordinate has no plane to bound,
    and the record it would filter cannot be placed on a figure at all."""
    command.upgrade(_config(migrated_url), "head")

    with pytest.raises(sa.exc.IntegrityError):
        _execute(migrated_url, _chart_stage(chart_y_slug="NULL"))


def test_an_axis_may_be_an_expression_instead_of_a_property(migrated_url: str) -> None:
    """The constraint has to *admit* the derived axis, not merely refuse the
    ambiguous one — being able to bound `E^(1/2)/ρ` is what a limit stage, which
    names property slugs, cannot do at all."""
    command.upgrade(_config(migrated_url), "head")
    _execute(
        migrated_url,
        _chart_stage(
            chart_x_slug="NULL",
            chart_x_expression="'modulo-elastico**0.5/densidade'",
        ),
    )

    row = _rows(
        migrated_url,
        "SELECT chart_x_slug, chart_x_expression FROM selection_stage WHERE id = 3",
    )[0]
    assert row.chart_x_slug is None
    assert row.chart_x_expression == "modulo-elastico**0.5/densidade"


def test_the_other_stage_kinds_are_not_touched_by_the_axes_constraint(
    migrated_url: str,
) -> None:
    """``kind <> 'chart' OR (...)`` is load-bearing: without the guard the check
    would refuse every limit and tree stage in the database, which is to say all
    of them — both fixtures above are already proof it does not, and this writes
    a new one to show the refusal is not merely about rows written earlier."""
    command.upgrade(_config(migrated_url), "head")
    _execute(
        migrated_url,
        _chart_stage(id=4, kind="'limit'", chart_x_slug="NULL", chart_y_slug="NULL"),
    )

    rows = _rows(migrated_url, "SELECT id, kind FROM selection_stage WHERE id = 4")
    assert [(r.id, r.kind) for r in rows] == [(4, "limit")]


def test_downgrade_removes_the_columns_and_keeps_the_stages(migrated_url: str) -> None:
    config = _config(migrated_url)
    command.upgrade(config, "head")
    _execute(migrated_url, _chart_stage())
    command.downgrade(config, PRE_CHART_REVISION)

    assert not set(CHART_COLUMNS) & set(_columns(migrated_url, "selection_stage"))

    # The chart stage itself survives as a row — the downgrade drops what the
    # older schema cannot describe, and nothing else.
    rows = _rows(migrated_url, "SELECT id, kind, label FROM selection_stage ORDER BY id")
    assert [(r.id, r.kind) for r in rows] == [(1, "limit"), (2, "tree"), (3, "chart")]
    assert rows[1].label == "Só metais"
