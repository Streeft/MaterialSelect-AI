"""The D-243 migration: the signed-PDF table and the link-state columns, up, down and up again."""

from __future__ import annotations

from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.config import Config

from alembic import command
from app.config import settings

PRE_REVISION = "41cab28c3e17"
REVISION = "5e2405bef18d"

NEW_COLUMNS = {
    "expires_at",
    "revoked_at",
    "revoked_by_id",
    "first_opened_at",
    "last_opened_at",
    "open_count",
    "attached_pdf_sha256",
}


def _config(url: str) -> Config:
    root = Path(__file__).resolve().parents[2]
    config = Config(str(root / "alembic.ini"))
    config.set_main_option("script_location", str(root / "alembic"))
    config.set_main_option("sqlalchemy.url", url)
    return config


def _inspect(url: str):
    engine = sa.create_engine(url)
    try:
        inspector = sa.inspect(engine)
        return {
            "tables": set(inspector.get_table_names()),
            "delivery": {c["name"] for c in inspector.get_columns("report_delivery")},
            "pdf": (
                {c["name"] for c in inspector.get_columns("issued_report_pdf")}
                if "issued_report_pdf" in inspector.get_table_names()
                else set()
            ),
        }
    finally:
        engine.dispose()


def test_the_pdf_table_and_the_link_columns_come_and_go(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    url = f"sqlite:///{tmp_path / 'pdf.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _config(url)

    command.upgrade(config, PRE_REVISION)
    before = _inspect(url)
    assert "issued_report_pdf" not in before["tables"]
    assert not NEW_COLUMNS & before["delivery"]

    command.upgrade(config, REVISION)
    after = _inspect(url)
    assert "issued_report_pdf" in after["tables"]
    assert NEW_COLUMNS <= after["delivery"]
    assert {"issued_report_id", "project_id", "sha256", "size_bytes", "content"} <= after["pdf"]

    command.downgrade(config, PRE_REVISION)
    down = _inspect(url)
    assert "issued_report_pdf" not in down["tables"]
    assert not NEW_COLUMNS & down["delivery"]
    # what D-241 and D-242 made is untouched
    assert {"issued_report", "report_delivery"} <= down["tables"]

    command.upgrade(config, REVISION)
    again = _inspect(url)
    assert "issued_report_pdf" in again["tables"] and NEW_COLUMNS <= again["delivery"]


def test_a_delivery_written_before_the_migration_survives_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Existing rows keep their data; the new counters start at zero and the dates at NULL."""
    url = f"sqlite:///{tmp_path / 'old.db'}"
    monkeypatch.setattr(settings, "database_url", url)
    config = _config(url)
    command.upgrade(config, PRE_REVISION)
    engine = sa.create_engine(url)
    try:
        with engine.begin() as connection:
            connection.execute(
                sa.text(
                    'INSERT INTO "user" (id, google_sub, email, name, created_at) '
                    "VALUES (1, 'g', 'a@b.com', 'A', '2026-11-16 12:00:00')"
                )
            )
            connection.execute(
                sa.text(
                    "INSERT INTO project (id, name, owner_id, created_at) "
                    "VALUES (1, 'p', 1, '2026-11-16 12:00:00')"
                )
            )
            connection.execute(
                sa.text(
                    "INSERT INTO issued_report (id, project_id, study_name, version, engineer_name,"
                    " inputs, html, content_sha256, issued_at) VALUES (1, 1, 'e', 1, 'a', '{}',"
                    " '<html></html>', :sha, '2026-11-16 12:00:00')"
                ),
                {"sha": "a" * 64},
            )
            connection.execute(
                sa.text(
                    "INSERT INTO report_delivery (id, issued_report_id, project_id, recipients, cc,"
                    " subject, status, provider, token_hash, created_at) VALUES (1, 1, 1, '[]',"
                    " '[]', 's', 'enviado', 'smtp', :h, '2026-11-16 12:00:00')"
                ),
                {"h": "b" * 64},
            )
    finally:
        engine.dispose()
    command.upgrade(config, REVISION)
    engine = sa.create_engine(url)
    try:
        with engine.connect() as connection:
            row = connection.execute(
                sa.text(
                    "SELECT status, open_count, expires_at, revoked_at, first_opened_at "
                    "FROM report_delivery"
                )
            ).one()
    finally:
        engine.dispose()
    assert tuple(row) == ("enviado", 0, None, None, None)
