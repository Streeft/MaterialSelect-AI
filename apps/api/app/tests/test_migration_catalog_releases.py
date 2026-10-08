"""The D-108 migration, run up and down against a database that already has a release.

The shared test database is built by ``create_all`` and never by the
migrations, so the migration itself is proved here: the two columns arrive,
the existing release is **not** given a lineage (no backfill — inventing one
from the name would be matching by name) and stays real (``is_demo`` false),
the empty-lineage ``CHECK`` reaches the database, and the revision comes back
down and up again.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

PRE_REVISION = "0925e0787863"
REVISION = "73a9b5da72b2"

DATASET = (
    "INSERT INTO catalog_dataset (id, slug, name, release, source_sha256, license_label,"
    " is_active, created_at{extra_columns}) VALUES ({id}, '{slug}', 'Catálogo', 'R1', '{sha}',"
    " 'Licença', 1, '2026-10-08'{extra_values})"
)


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def _run(url: str, statement: str) -> list[tuple]:
    engine = sa.create_engine(url)
    try:
        with engine.begin() as conn:
            result = conn.execute(sa.text(statement))
            return [tuple(row) for row in result] if result.returns_rows else []
    finally:
        engine.dispose()


def _columns(url: str) -> set[str]:
    engine = sa.create_engine(url)
    try:
        return {column["name"] for column in sa.inspect(engine).get_columns("catalog_dataset")}
    finally:
        engine.dispose()


@pytest.fixture()
def migrated_url(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[str]:
    url = f"sqlite:///{tmp_path / 'releases_migration.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    command.upgrade(_config(url), PRE_REVISION)
    _run(
        url, DATASET.format(id=1, slug="antes-r1", sha="a" * 64, extra_columns="", extra_values="")
    )
    yield url


def test_upgrade_adds_the_columns_without_backfill(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)
    assert {"lineage", "is_demo"} <= _columns(migrated_url)
    assert _run(migrated_url, "SELECT slug, lineage, is_demo FROM catalog_dataset") == [
        ("antes-r1", None, 0)
    ]


def test_the_empty_lineage_check_reaches_the_database(migrated_url: str) -> None:
    command.upgrade(_config(migrated_url), REVISION)
    with pytest.raises(sa.exc.IntegrityError):
        _run(
            migrated_url,
            DATASET.format(
                id=2, slug="vazia", sha="b" * 64, extra_columns=", lineage", extra_values=", ''"
            ),
        )
    _run(
        migrated_url,
        DATASET.format(
            id=3,
            slug="com-linha",
            sha="c" * 64,
            extra_columns=", lineage",
            extra_values=", 'catalogo-x'",
        ),
    )


def test_downgrade_removes_the_columns_and_upgrade_returns(migrated_url: str) -> None:
    config = _config(migrated_url)
    command.upgrade(config, REVISION)
    command.downgrade(config, PRE_REVISION)
    assert not {"lineage", "is_demo"} & _columns(migrated_url)
    assert _run(migrated_url, "SELECT slug FROM catalog_dataset") == [("antes-r1",)]
    command.upgrade(config, REVISION)
    assert {"lineage", "is_demo"} <= _columns(migrated_url)
