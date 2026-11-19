"""The D-249 migration: ``user_appearance`` up, down and up again, leaving the users alone."""

from __future__ import annotations

from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

PRE_REVISION = "dc672e36c7d8"
REVISION = "13dda33de502"


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def _tables(url: str) -> set[str]:
    engine = sa.create_engine(url)
    try:
        return set(sa.inspect(engine).get_table_names())
    finally:
        engine.dispose()


def test_the_table_comes_and_goes_and_leaves_the_users_alone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    url = f"sqlite:///{tmp_path / 'aparencia.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _config(url)
    command.upgrade(config, PRE_REVISION)
    assert "user_appearance" not in _tables(url)

    command.upgrade(config, REVISION)
    assert {"user_appearance", "user"} <= _tables(url)
    engine = sa.create_engine(url)
    try:
        inspector = sa.inspect(engine)
        columns = {c["name"]: c for c in inspector.get_columns("user_appearance")}
        key = inspector.get_pk_constraint("user_appearance")["constrained_columns"]
        foreign = inspector.get_foreign_keys("user_appearance")
    finally:
        engine.dispose()
    assert set(columns) == {"user_id", "color", "contrast", "motion", "rail", "updated_at"}
    assert not any(columns[name]["nullable"] for name in columns)
    assert key == ["user_id"]
    assert [fk["referred_table"] for fk in foreign] == ["user"]
    assert foreign[0]["options"].get("ondelete") == "CASCADE"

    command.downgrade(config, PRE_REVISION)
    assert "user_appearance" not in _tables(url)
    assert "user" in _tables(url)
    command.upgrade(config, REVISION)
    assert "user_appearance" in _tables(url)
