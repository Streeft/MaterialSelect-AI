"""The P1-4 migration, run against a database that already holds a catalogue.

Same reason as its five predecessors: the shared test database is built from
``Base.metadata.create_all`` and never from the migrations, so it never starts
in the pre-My-Records state these columns are added against.

What this one has to prove is the opposite of P0-1's and P0-2's. Those added a
NOT NULL column to a populated table, so the question was whether the backfill
wrote the honest value. Here there is deliberately **no backfill**, and the
three things to prove replace it:

* that every material already in the catalogue comes out with ``owner_id``
  NULL. NULL *is* the shared catalogue — the thing the catalogue has been since
  D-42 — so filling this in would be handing somebody else's reference data to
  whichever user happened to be first;
* that the "exactly one universe" check reaches the database in both bookmark
  tables, because without it a row could name a material *and* a process, or
  neither, and the reader would have no way to say which one it meant;
* that the per-universe uniqueness does not accidentally constrain the other
  universe. The two constraints look redundant and are not: SQL treats NULLs as
  distinct, which is exactly what lets one of them ignore the rows the other
  one owns. Getting that backwards would silently cap a user at one favourite
  process, and no test that only starred materials would ever notice.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

#: The revision immediately before the one under test — P1-3's family record.
PRE_MY_RECORDS_REVISION = "a7d51c93e084"

BOOKMARK_TABLES = ("favorite", "recent_record")


@pytest.fixture()
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A database at the pre-P1-4 revision, holding two users and a catalogue."""
    url = f"sqlite:///{tmp_path / 'my_records_migration.db'}"
    # `alembic/env.py` overwrites `sqlalchemy.url` with the application settings
    # on every run, so steering the settings object is the only way to point a
    # migration at the temporary database — and it is what makes this test safe.
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(_config(url), PRE_MY_RECORDS_REVISION)

    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO user (id, google_sub, email, name, created_at) VALUES"
                " (1, 'sub-ana', 'ana@exemplo.br', 'Ana', '2026-01-01'),"
                " (2, 'sub-bruno', 'bruno@exemplo.br', 'Bruno', '2026-01-01')"
            )
        )
        conn.execute(
            sa.text("INSERT INTO material_class (id, name, slug) VALUES (1, 'Metais', 'metais')")
        )
        conn.execute(
            sa.text(
                "INSERT INTO material"
                " (id, name, class_id, keywords, is_active, is_demo, created_at) VALUES"
                " (1, 'Aço 1020', 1, '[]', 1, 1, '2026-01-01'),"
                " (2, 'Alumínio 6061', 1, '[]', 1, 1, '2026-01-01')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO process_class (id, name, slug) VALUES (1, 'Conformação', 'conformacao')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO process (id, name, slug, class_id, is_active, is_demo, created_at)"
                " VALUES (1, 'Forjamento', 'forjamento', 1, 1, 1, '2026-01-01'),"
                " (2, 'Laminação', 'laminacao', 1, 1, 1, '2026-01-01')"
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


def _bookmark(table: str, **overrides: object) -> str:
    """An INSERT for one bookmark row, so each test names the one thing it is about."""
    values: dict[str, object] = {"user_id": 1, "material_id": 1}
    values.update(overrides)
    if table == "favorite":
        values.setdefault("created_at", "'2026-01-01'")
    else:
        values.setdefault("viewed_at", "'2026-01-01'")
    columns = ", ".join(values)
    literals = ", ".join(str(v) for v in values.values())
    return f"INSERT INTO {table} ({columns}) VALUES ({literals})"


def test_owner_id_arrives_nullable(migrated_url: str) -> None:
    """Nullable is the design, not an oversight: NULL is the shared catalogue."""
    command.upgrade(_config(migrated_url), "head")

    columns = _columns(migrated_url, "material")
    assert "owner_id" in columns
    assert columns["owner_id"]["nullable"] is True


def test_every_material_already_in_the_catalogue_comes_out_unowned(migrated_url: str) -> None:
    """There is no backfill, and this is what that means in the data.

    A material catalogued before P1-4 belongs to nobody — it is shared reference
    data (D-42). Stamping an owner on it would hand the whole catalogue to
    whichever user the migration happened to pick, and hide it from everyone
    else on the very next request.
    """
    command.upgrade(_config(migrated_url), "head")

    rows = _rows(migrated_url, "SELECT id, name, owner_id FROM material ORDER BY id")
    assert [(r.id, r.name) for r in rows] == [(1, "Aço 1020"), (2, "Alumínio 6061")]
    assert [r.owner_id for r in rows] == [None, None]


def test_the_material_payload_survives_the_batch_rebuild(migrated_url: str) -> None:
    """SQLite has no ALTER ADD CONSTRAINT, so ``batch_alter_table`` copies the
    table into a new one — and a copy is exactly where a payload gets lost."""
    command.upgrade(_config(migrated_url), "head")

    rows = _rows(
        migrated_url,
        "SELECT id, name, class_id, keywords, is_active, is_demo FROM material ORDER BY id",
    )
    assert [(r.id, r.class_id, r.is_active, r.is_demo) for r in rows] == [
        (1, 1, 1, 1),
        (2, 1, 1, 1),
    ]
    assert rows[0].keywords == "[]"


@pytest.mark.parametrize("table", BOOKMARK_TABLES)
def test_a_bookmark_naming_neither_universe_is_refused(migrated_url: str, table: str) -> None:
    """A row that names no record is not a bookmark — there is nothing to come
    back to. The database says so, because the service is not the only writer."""
    command.upgrade(_config(migrated_url), "head")

    with pytest.raises(sa.exc.IntegrityError):
        _execute(migrated_url, _bookmark(table, material_id="NULL"))


@pytest.mark.parametrize("table", BOOKMARK_TABLES)
def test_a_bookmark_naming_both_universes_is_refused(migrated_url: str, table: str) -> None:
    """And a row naming both is worse than one naming neither: it reads as
    valid, and every consumer has to guess which half was meant."""
    command.upgrade(_config(migrated_url), "head")

    with pytest.raises(sa.exc.IntegrityError):
        _execute(migrated_url, _bookmark(table, material_id=1, process_id=1))


@pytest.mark.parametrize("table", BOOKMARK_TABLES)
def test_a_bookmark_naming_exactly_one_universe_is_written(migrated_url: str, table: str) -> None:
    command.upgrade(_config(migrated_url), "head")

    _execute(migrated_url, _bookmark(table, material_id=1))
    _execute(migrated_url, _bookmark(table, material_id="NULL", process_id=1))

    rows = _rows(migrated_url, f"SELECT material_id, process_id FROM {table} ORDER BY id")
    assert [(r.material_id, r.process_id) for r in rows] == [(1, None), (None, 1)]


@pytest.mark.parametrize("table", BOOKMARK_TABLES)
def test_the_same_record_cannot_be_bookmarked_twice_by_one_user(
    migrated_url: str, table: str
) -> None:
    """Which is what makes ``recent_record`` a set with an order and not a log:
    re-opening a record has to update the row that exists, and the database is
    what guarantees a second one cannot be written instead."""
    command.upgrade(_config(migrated_url), "head")

    _execute(migrated_url, _bookmark(table, material_id=1))
    with pytest.raises(sa.exc.IntegrityError):
        _execute(migrated_url, _bookmark(table, material_id=1))


@pytest.mark.parametrize("table", BOOKMARK_TABLES)
def test_one_user_may_bookmark_many_processes(migrated_url: str, table: str) -> None:
    """The constraint that covers materials must not reach the process rows.

    Every process bookmark has ``material_id`` NULL, and if SQL compared NULLs
    as equal, ``uq_*_user_material`` would cap a user at exactly one favourite
    process — a bug no test that only starred materials could ever see.
    """
    command.upgrade(_config(migrated_url), "head")

    _execute(migrated_url, _bookmark(table, material_id="NULL", process_id=1))
    _execute(migrated_url, _bookmark(table, material_id="NULL", process_id=2))

    rows = _rows(migrated_url, f"SELECT process_id FROM {table} ORDER BY process_id")
    assert [r.process_id for r in rows] == [1, 2]


@pytest.mark.parametrize("table", BOOKMARK_TABLES)
def test_two_users_may_bookmark_the_same_record(migrated_url: str, table: str) -> None:
    """The uniqueness is per user, not per record — a favourite is a statement
    about the reader, never about the material."""
    command.upgrade(_config(migrated_url), "head")

    _execute(migrated_url, _bookmark(table, user_id=1, material_id=1))
    _execute(migrated_url, _bookmark(table, user_id=2, material_id=1))

    rows = _rows(migrated_url, f"SELECT user_id FROM {table} ORDER BY user_id")
    assert [r.user_id for r in rows] == [1, 2]


def test_the_downgrade_takes_the_whole_feature_back_out(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), "head")
    _execute(migrated_url, _bookmark("favorite", material_id=1))

    command.downgrade(_config(migrated_url), PRE_MY_RECORDS_REVISION)

    engine = sa.create_engine(migrated_url)
    try:
        names = set(sa.inspect(engine).get_table_names())
    finally:
        engine.dispose()
    assert not (set(BOOKMARK_TABLES) & names)
    assert "owner_id" not in _columns(migrated_url, "material")
    # And the catalogue the columns were added around is still there.
    assert len(_rows(migrated_url, "SELECT id FROM material")) == 2
