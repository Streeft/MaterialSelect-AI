"""The D-241 migration: ``issued_report`` up, down and up again."""

from __future__ import annotations

from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

PRE_REVISION = "e575ea7c3f24"
REVISION = "71dbd3ec108d"


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


def test_the_table_comes_and_goes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    url = f"sqlite:///{tmp_path / 'laudo.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _config(url)
    command.upgrade(config, PRE_REVISION)
    assert "issued_report" not in _tables(url)

    command.upgrade(config, REVISION)
    assert "issued_report" in _tables(url)
    engine = sa.create_engine(url)
    try:
        columns = {c["name"] for c in sa.inspect(engine).get_columns("issued_report")}
        uniques = sa.inspect(engine).get_unique_constraints("issued_report")
    finally:
        engine.dispose()
    assert {"html", "inputs", "content_sha256", "version", "issued_at", "study_id"} <= columns
    assert any(u["column_names"] == ["content_sha256"] for u in uniques)

    command.downgrade(config, PRE_REVISION)
    assert "issued_report" not in _tables(url)
    command.upgrade(config, REVISION)
    assert "issued_report" in _tables(url)
