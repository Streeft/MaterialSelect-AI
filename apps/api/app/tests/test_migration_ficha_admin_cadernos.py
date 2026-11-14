"""The D-233 migration, run against a database that already holds the old shapes.

The shared test database is built from ``Base.metadata.create_all`` and never
from the migrations, so none of the tests elsewhere starts in the state this
revision moves data out of. Three things to prove:

* **the list stage's ids move.** D-232 kept them as integers in
  ``selection_stage.material_class_slugs``; upgrading copies them to
  ``material_ids`` and empties the old column for that kind, and downgrading
  puts them back — in the same order, untouched. A stage of another kind keeps
  its folder slugs on both sides, because the migration must never rewrite a
  column it was not asked about;
* **no invented data.** Every bibliographic column of ``source`` and the two
  position columns of ``notebook_chunk`` come out NULL for rows that already
  exist: a citation or a marked passage is built from what somebody recorded,
  never from a fill-in;
* **the way back works.** Down and up again leaves the same data.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

#: The revision immediately before the one under test — D-218's archived notebooks.
PRE_REVISION = "d218a5c0a1b2"
REVISION = "d461fbef4da2"

SOURCE_COLUMNS = ("authors", "title", "publisher", "year", "url", "accessed_on")


@pytest.fixture()
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A database at the pre-D-233 revision, holding stages, a source and a passage."""
    url = f"sqlite:///{tmp_path / 'ficha_admin_cadernos.db'}"
    # `alembic/env.py` overwrites `sqlalchemy.url` with the application settings
    # on every run, so steering the settings object is the only way to point a
    # migration at the temporary database.
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(_config(url), PRE_REVISION)

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
                " (1, 1, 0, 'list', NULL, 1, '[]', '[]', '[]', '[7, 3, 12]', 1),"
                " (2, 1, 1, 'tree', 'Só metais', 1, '[\"metais\"]', '[]', '[]', '[]', 1),"
                " (3, 1, 2, 'process', NULL, 1, '[]', '[]', '[]', '[\"metais\"]', 1)"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO source (id, label, is_demo, contains_third_party_data)"
                " VALUES (1, 'Fonte antiga', 0, 0)"
            )
        )
    engine.dispose()

    yield url


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def _columns(url: str, table: str) -> dict[str, sa.engine.interfaces.ReflectedColumn]:
    engine = sa.create_engine(url)
    try:
        return {c["name"]: c for c in sa.inspect(engine).get_columns(table)}
    finally:
        engine.dispose()


def _rows(url: str, statement: str) -> list[sa.Row]:
    engine = sa.create_engine(url)
    try:
        with engine.connect() as conn:
            return list(conn.execute(sa.text(statement)).all())
    finally:
        engine.dispose()


def _stages(url: str) -> dict[int, tuple[list, list]]:
    """Stage id → (material_class_slugs, material_ids), JSON decoded."""
    import json

    out: dict[int, tuple[list, list]] = {}
    for stage_id, slugs, ids in _rows(
        url, "SELECT id, material_class_slugs, material_ids FROM selection_stage ORDER BY id"
    ):
        out[stage_id] = (json.loads(slugs), json.loads(ids))
    return out


def test_upgrade_moves_the_list_ids_to_their_own_column(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)

    stages = _stages(migrated_url)
    # The list stage: ids moved, in the order the reader gave them, old column emptied.
    assert stages[1] == ([], [7, 3, 12])
    # Other kinds keep their folder slugs and get an empty list of ids.
    assert stages[2] == ([], [])
    assert stages[3] == (["metais"], [])


def test_the_new_column_is_not_null_and_defaults_to_an_empty_list(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)

    column = _columns(migrated_url, "selection_stage")["material_ids"]
    assert column["nullable"] is False
    # A stage written without the field (an old client) still reads as `[]`.
    engine = sa.create_engine(migrated_url)
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO selection_stage"
                " (id, study_id, position, kind, enabled, class_slugs, process_slugs,"
                " process_class_slugs, material_class_slugs, include_descendants) VALUES"
                " (9, 1, 9, 'limit', 1, '[]', '[]', '[]', '[]', 1)"
            )
        )
    engine.dispose()
    assert _stages(migrated_url)[9] == ([], [])


def test_downgrade_puts_the_ids_back_where_d232_kept_them(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)
    command.downgrade(_config(migrated_url), PRE_REVISION)

    import json

    rows = {
        stage_id: json.loads(slugs)
        for stage_id, slugs in _rows(
            migrated_url, "SELECT id, material_class_slugs FROM selection_stage ORDER BY id"
        )
    }
    assert rows == {1: [7, 3, 12], 2: [], 3: ["metais"]}
    assert "material_ids" not in _columns(migrated_url, "selection_stage")


def test_up_down_up_leaves_the_same_data(migrated_url: str) -> None:
    config = _config(migrated_url)
    command.upgrade(config, REVISION)
    first = _stages(migrated_url)
    command.downgrade(config, PRE_REVISION)
    command.upgrade(config, REVISION)
    assert _stages(migrated_url) == first


def test_existing_sources_and_passages_get_no_invented_fields(migrated_url: str) -> None:
    engine = sa.create_engine(migrated_url)
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO user (id, google_sub, email, name, created_at)"
                " VALUES (1, 'sub', 'a@exemplo.br', 'Ana', '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO notebook (id, owner_id, title, emoji, chat_goal, response_length, created_at, updated_at)"
                " VALUES (1, 1, 'Caderno', 'x', 'padrao', 'padrao', '2026-01-01', '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO notebook_source (id, notebook_id, kind, title, status, checksum,"
                " char_count, selected, truncated, content, created_at) VALUES"
                " (1, 1, 'texto', 'Texto', 'pronto', 'abc', 5, 1, 0, 'Texto', '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO notebook_chunk (id, source_id, ordinal, text, search_text)"
                " VALUES (1, 1, 0, 'Texto', 'texto')"
            )
        )
    engine.dispose()

    command.upgrade(_config(migrated_url), REVISION)

    columns = _columns(migrated_url, "source")
    for name in SOURCE_COLUMNS:
        assert columns[name]["nullable"] is True
    row = _rows(migrated_url, f"SELECT {', '.join(SOURCE_COLUMNS)} FROM source WHERE id = 1")[0]
    assert all(value is None for value in row)

    chunk = _rows(migrated_url, "SELECT char_start, char_end FROM notebook_chunk WHERE id = 1")[0]
    assert tuple(chunk) == (None, None)
