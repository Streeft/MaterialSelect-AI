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
    """Return engine keyword arguments (backend-specific + JSON serializer)."""
    kwargs: dict = {"json_serializer": json_serializer}
    if url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
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
