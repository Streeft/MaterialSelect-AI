"""D-227: a server database holds no idle connection by default (NullPool).

The API runs always-on; a pool of idle connections kept Neon's compute awake and
ran its quota out. These tests build engines from a PostgreSQL URL without
connecting (``create_engine`` is lazy), so they need no server.
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool, QueuePool

from app.db.base import engine_kwargs

PG = "postgresql+psycopg://u:p@host/db"


def test_default_mode_is_null():
    from app.config import settings

    assert settings.db_pool_mode == "null"


def test_postgres_kwargs_use_nullpool_by_default():
    kwargs = engine_kwargs(PG)
    assert kwargs["poolclass"] is NullPool
    assert kwargs["pool_pre_ping"] is True
    assert kwargs["hide_parameters"] is True
    for key in ("pool_size", "max_overflow", "pool_timeout", "pool_recycle"):
        assert key not in kwargs


def test_postgres_engine_uses_nullpool_by_default():
    pytest.importorskip("psycopg")
    engine = create_engine(PG, **engine_kwargs(PG))
    assert isinstance(engine.pool, NullPool)


def test_queue_mode_keeps_the_old_pool():
    pytest.importorskip("psycopg")
    engine = create_engine(PG, **engine_kwargs(PG, pool_mode="queue"))
    assert isinstance(engine.pool, QueuePool)
    assert engine.pool.size() == 5


def test_unknown_mode_is_refused():
    with pytest.raises(ValueError, match="DB_POOL_MODE"):
        engine_kwargs(PG, pool_mode="forever")


def test_sqlite_is_not_touched_by_the_mode():
    kwargs = engine_kwargs("sqlite://", pool_mode="null")
    assert "poolclass" not in kwargs
    assert kwargs["connect_args"] == {"check_same_thread": False}
