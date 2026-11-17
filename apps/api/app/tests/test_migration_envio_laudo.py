"""The D-242 migration: ``report_delivery`` up, down and up again."""

from __future__ import annotations

from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

PRE_REVISION = "71dbd3ec108d"
REVISION = "41cab28c3e17"


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


def test_the_table_comes_and_goes_and_leaves_the_laudo_alone(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    url = f"sqlite:///{tmp_path / 'envio.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _config(url)
    command.upgrade(config, PRE_REVISION)
    assert "report_delivery" not in _tables(url)

    command.upgrade(config, REVISION)
    assert {"report_delivery", "issued_report"} <= _tables(url)
    engine = sa.create_engine(url)
    try:
        inspector = sa.inspect(engine)
        columns = {c["name"] for c in inspector.get_columns("report_delivery")}
        uniques = inspector.get_unique_constraints("report_delivery")
        foreign = {fk["referred_table"] for fk in inspector.get_foreign_keys("report_delivery")}
    finally:
        engine.dispose()
    assert {
        "issued_report_id",
        "project_id",
        "recipients",
        "cc",
        "status",
        "provider",
        "error",
        "token_hash",
        "created_at",
    } <= columns
    assert any(u["column_names"] == ["token_hash"] for u in uniques)
    assert foreign == {"issued_report", "project", "user"}

    command.downgrade(config, PRE_REVISION)
    assert "report_delivery" not in _tables(url)
    assert "issued_report" in _tables(url)
    command.upgrade(config, REVISION)
    assert "report_delivery" in _tables(url)
