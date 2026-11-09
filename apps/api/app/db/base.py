"""SQLAlchemy engine, session factory and declarative base.

The engine is created from ``settings.database_url``. For SQLite we enable the
``check_same_thread=False`` connect arg so the dev server can share the
connection across FastAPI's threadpool; this flag is ignored for other backends.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Generator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    """Declarative base shared by all ORM models."""


def json_serializer(obj: Any) -> str:
    """Serialize JSON columns preserving non-ASCII characters.

    Default serialization escapes accented characters (e.g. "á" -> "\\u00e1"),
    which breaks case-insensitive LIKE searches over keyword lists. Keeping the
    text human-readable also helps debugging.
    """
    return json.dumps(obj, ensure_ascii=False)


def engine_kwargs(url: str) -> dict:
    """Return engine keyword arguments (backend-specific + JSON serializer).

    ``hide_parameters`` keeps bound values out of every error SQLAlchemy
    raises: without it, a refused ``INSERT`` prints its parameters — passages
    of the licensed books in the knowledge base, a student's notes, an OAuth
    e-mail — into the API's log or a public Actions log (D-101). The SQL
    itself still shows, which is enough to diagnose; the values are not.
    """
    kwargs: dict = {"json_serializer": json_serializer, "hide_parameters": True}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        return kwargs
    # A pooled server (Neon in production, D-195). Neon's free tier suspends an
    # idle database after about five minutes and drops its connections; without
    # a ping the next request picked a dead one from the pool and failed — the
    # login's "Internal Server Error". `pool_pre_ping` tests each connection on
    # checkout and replaces a dead one; `pool_recycle` retires them before
    # Neon's suspend window. The pool stays small (5 + 5) because the free
    # tier caps connections, and a checkout waits at most 10 s instead of 30 s
    # before failing with a clear error.
    kwargs.update(
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=5,
        pool_timeout=10,
    )
    return kwargs


engine = create_engine(settings.database_url, **engine_kwargs(settings.database_url))

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session and closes it afterwards."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_session_factory() -> Callable[[], Session]:
    """FastAPI dependency: how a background job opens a session of its own.

    A job that runs after the response (the Studio's generations, D-94) cannot
    use the request's session — it is closed by then. It asks for this factory
    instead, which the tests replace with one bound to their rolled-back
    connection, so a job's writes stay inside the test like any request's.
    """
    return SessionLocal
