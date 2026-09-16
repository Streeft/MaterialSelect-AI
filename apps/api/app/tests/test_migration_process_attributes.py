"""The P0-4 migration, run against a database that already holds processes.

Same reason as its three predecessors: the shared test database is built from
``Base.metadata.create_all`` and never from the migrations, so it never starts in
the pre-P0-4 state these tables are added against.

What this one has to prove is different from the last three, and it is worth
saying why. P0-1, P0-2 and P0-3 each added a NOT NULL column to a populated
table, so the interesting question was whether the **backfill** wrote the honest
value. This migration adds two empty tables and alters nothing, so there is no
backfill to get wrong — and the tests below are about the two guarantees that
replace it: that the unit-by-kind check constraint really reaches the database,
and that one value per (process, attribute) is enforced there rather than only in
the service.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

#: The revision immediately before the one under test — P0-3's selection universe.
PRE_ATTRIBUTES_REVISION = "c9f3a17b6e42"


@pytest.fixture()
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    """A database at the pre-P0-4 revision, holding a process family and two processes."""
    url = f"sqlite:///{tmp_path / 'attribute_migration.db'}"
    # `alembic/env.py` overwrites `sqlalchemy.url` with the application settings
    # on every run, so steering the settings object is the only way to point a
    # migration at the temporary database — and it is what makes this test safe.
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(_config(url), PRE_ATTRIBUTES_REVISION)

    engine = sa.create_engine(url)
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                "INSERT INTO process_class (id, name, slug) VALUES (1, 'Conformação', 'conformacao')"
            )
        )
        conn.execute(
            sa.text(
                "INSERT INTO process (id, name, slug, class_id, is_active, is_demo, created_at)"
                " VALUES (1, 'Fundição', 'fundicao', 1, 1, 1, '2026-01-01'),"
                " (2, 'Forjamento', 'forjamento', 1, 1, 1, '2026-01-01')"
            )
        )
    engine.dispose()

    yield url


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def _columns(url: str, table: str) -> set[str]:
    engine = sa.create_engine(url)
    try:
        return {c["name"] for c in sa.inspect(engine).get_columns(table)}
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


_ENVELOPE_ATTRIBUTE = (
    "INSERT INTO process_attribute_definition"
    " (id, name, slug, kind, physical_dimension, canonical_unit, accepted_units,"
    " allowed_labels, better_direction)"
    " VALUES (1, 'Faixa de massa', 'faixa-massa', 'ENVELOPE', '[mass]', 'kg',"
    " '[\"kg\", \"g\"]', '[]', 'NEUTRAL')"
)

_DISCRETE_ATTRIBUTE = (
    "INSERT INTO process_attribute_definition"
    " (id, name, slug, kind, physical_dimension, canonical_unit, accepted_units,"
    " allowed_labels, better_direction)"
    " VALUES (2, 'Forma', 'forma', 'DISCRETO', '', NULL, '[]',"
    " '[\"Maciço 3D\", \"Chapa conformada\"]', 'NEUTRAL')"
)


def test_both_tables_carry_the_whole_provenance_trail(migrated_url: str) -> None:
    """The point of the table is the trail, so the trail is what is asserted."""
    command.upgrade(_config(migrated_url), "head")

    assert _columns(migrated_url, "process_attribute_definition") == {
        "id",
        "name",
        "slug",
        "symbol",
        "description",
        "kind",
        "physical_dimension",
        "canonical_unit",
        "accepted_units",
        "allowed_labels",
        "better_direction",
    }
    assert _columns(migrated_url, "process_attribute_value") == {
        "id",
        "process_id",
        "attribute_id",
        "value_scalar",
        "value_min",
        "value_max",
        "value_typical",
        "labels",
        "original_unit",
        "normalized_value",
        "normalized_min",
        "normalized_max",
        "canonical_unit",
        "conversion_method",
        "uncertainty",
        "measurement_condition",
        "notes",
        "source_id",
        "data_quality",
        "is_missing",
        "created_at",
    }


def test_an_envelope_value_is_writable_with_its_bounds_in_canonical_units(
    migrated_url: str,
) -> None:
    """``normalized_min``/``normalized_max`` are what a threshold is compared
    against, so they must survive a write and come back unchanged."""
    command.upgrade(_config(migrated_url), "head")
    _execute(migrated_url, _ENVELOPE_ATTRIBUTE)
    _execute(
        migrated_url,
        "INSERT INTO process_attribute_value"
        " (id, process_id, attribute_id, value_min, value_max, value_typical, labels,"
        " original_unit, normalized_value, normalized_min, normalized_max, canonical_unit,"
        " conversion_method, data_quality, is_missing, created_at)"
        " VALUES (1, 1, 1, 100.0, 10000.0, 5050.0, '[]', 'g', 5.05, 0.1, 10.0, 'kg',"
        " 'pint:g->kg', 'ESTIMADO', 0, '2026-01-02')",
    )

    row = _rows(
        migrated_url,
        "SELECT normalized_min, normalized_max, canonical_unit, conversion_method"
        " FROM process_attribute_value WHERE id = 1",
    )[0]
    assert (row.normalized_min, row.normalized_max) == (0.1, 10.0)
    assert (row.canonical_unit, row.conversion_method) == ("kg", "pint:g->kg")


def test_a_discrete_value_stores_labels_and_no_number(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), "head")
    _execute(migrated_url, _DISCRETE_ATTRIBUTE)
    _execute(
        migrated_url,
        "INSERT INTO process_attribute_value"
        " (id, process_id, attribute_id, labels, data_quality, is_missing, created_at)"
        " VALUES (1, 1, 2, '[\"Maciço 3D\"]', 'ESTIMADO', 0, '2026-01-02')",
    )

    row = _rows(
        migrated_url,
        "SELECT labels, value_scalar, normalized_value FROM process_attribute_value WHERE id = 1",
    )[0]
    assert row.labels == '["Maciço 3D"]'
    assert row.value_scalar is None
    assert row.normalized_value is None


def test_a_numeric_attribute_cannot_exist_without_a_canonical_unit(migrated_url: str) -> None:
    """The check constraint reaches the database, not just the service.

    A numeric attribute with no unit would make every value under it
    incomparable — the unit trail is the whole reason this table exists.
    """
    command.upgrade(_config(migrated_url), "head")

    with pytest.raises(sa.exc.IntegrityError):
        _execute(
            migrated_url,
            _ENVELOPE_ATTRIBUTE.replace("'kg'", "NULL"),
        )


def test_a_discrete_attribute_cannot_carry_a_canonical_unit(migrated_url: str) -> None:
    """The other half of the same constraint: a label has no unit, and an
    attribute claiming both shapes at once would leave the engine guessing."""
    command.upgrade(_config(migrated_url), "head")

    with pytest.raises(sa.exc.IntegrityError):
        _execute(migrated_url, _DISCRETE_ATTRIBUTE.replace("'', NULL", "'', 'kg'"))


def test_one_value_per_process_and_attribute(migrated_url: str) -> None:
    """Two rows for the same pair would make the number that reaches a filter
    depend on the order the SELECT happened to return."""
    command.upgrade(_config(migrated_url), "head")
    _execute(migrated_url, _ENVELOPE_ATTRIBUTE)
    _execute(
        migrated_url,
        "INSERT INTO process_attribute_value"
        " (id, process_id, attribute_id, labels, data_quality, is_missing, created_at)"
        " VALUES (1, 1, 1, '[]', 'ESTIMADO', 1, '2026-01-02')",
    )

    with pytest.raises(sa.exc.IntegrityError):
        _execute(
            migrated_url,
            "INSERT INTO process_attribute_value"
            " (id, process_id, attribute_id, labels, data_quality, is_missing, created_at)"
            " VALUES (2, 1, 1, '[]', 'ESTIMADO', 1, '2026-01-03')",
        )

    # The same attribute on a *different* process is a different pair, and must
    # be accepted — otherwise the constraint would be preventing the ordinary
    # case instead of the ambiguous one.
    _execute(
        migrated_url,
        "INSERT INTO process_attribute_value"
        " (id, process_id, attribute_id, labels, data_quality, is_missing, created_at)"
        " VALUES (3, 2, 1, '[]', 'ESTIMADO', 1, '2026-01-03')",
    )


def test_downgrade_removes_both_tables_and_keeps_the_processes(migrated_url: str) -> None:
    config = _config(migrated_url)
    command.upgrade(config, "head")
    _execute(migrated_url, _ENVELOPE_ATTRIBUTE)
    command.downgrade(config, PRE_ATTRIBUTES_REVISION)

    engine = sa.create_engine(migrated_url)
    try:
        tables = set(sa.inspect(engine).get_table_names())
    finally:
        engine.dispose()
    assert "process_attribute_definition" not in tables
    assert "process_attribute_value" not in tables

    rows = _rows(migrated_url, "SELECT id, slug FROM process ORDER BY id")
    assert [(r.id, r.slug) for r in rows] == [(1, "fundicao"), (2, "forjamento")]
