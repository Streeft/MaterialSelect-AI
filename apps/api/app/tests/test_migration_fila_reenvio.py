"""The D-252 migration: the queue's three columns on ``report_delivery``, up, down and up again.

A delivery written before the revision keeps its row and counts as one attempt (``attempts``
defaults to 1); the queue columns are empty for it, so no old message is ever picked up.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

PRE_REVISION = "e62aba5c6884"
REVISION = "a7c3e19d5b42"


def _config(url: str) -> Config:
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    config.set_main_option("script_location", str(Path(__file__).resolve().parents[2] / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def _columns(url: str) -> dict[str, dict]:
    engine = sa.create_engine(url)
    try:
        return {c["name"]: c for c in sa.inspect(engine).get_columns("report_delivery")}
    finally:
        engine.dispose()


def test_the_columns_come_and_go_and_an_old_delivery_counts_as_one_attempt(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    url = f"sqlite:///{tmp_path / 'fila.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _config(url)
    command.upgrade(config, PRE_REVISION)
    assert not {"attempts", "next_attempt_at", "reply_to"} & set(_columns(url))

    engine = sa.create_engine(url)
    try:
        with engine.begin() as conn:
            conn.execute(
                sa.text(
                    "INSERT INTO report_delivery (id, issued_report_id, project_id, recipients, cc,"
                    " subject, status, provider, token_hash, created_at, open_count) VALUES "
                    "(1, 1, 1, '[]', '[]', 'Laudo', 'enviado', 'smtp', :hash, :now, 0)"
                ),
                {"hash": "h" * 64, "now": datetime.now(UTC)},
            )
    finally:
        engine.dispose()

    command.upgrade(config, REVISION)
    columns = _columns(url)
    assert {"attempts", "next_attempt_at", "reply_to"} <= set(columns)
    assert columns["attempts"]["nullable"] is False
    engine = sa.create_engine(url)
    try:
        with engine.connect() as conn:
            row = conn.execute(
                sa.text("SELECT attempts, next_attempt_at, reply_to FROM report_delivery")
            ).one()
        assert tuple(row) == (1, None, None)
        assert any(
            index["column_names"] == ["next_attempt_at"]
            for index in sa.inspect(engine).get_indexes("report_delivery")
        )
    finally:
        engine.dispose()

    command.downgrade(config, PRE_REVISION)
    assert not {"attempts", "next_attempt_at", "reply_to"} & set(_columns(url))
    command.upgrade(config, REVISION)
    assert {"attempts", "next_attempt_at", "reply_to"} <= set(_columns(url))
