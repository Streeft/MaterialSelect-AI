"""SQLAlchemy engine, session factory and declarative base.

The engine is created from ``settings.database_url``. For SQLite we enable the
``check_same_thread=False`` connect arg so the dev server can share the
connection across FastAPI's threadpool; this flag is ignored for other backends.
"""

from __future__ import annotations

import json
from collections.abc import Generator
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
