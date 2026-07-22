"""Pytest fixtures: in-memory database and API test client.

Each test module gets a fresh in-memory SQLite schema, seeded with the demo
data, and a FastAPI ``TestClient`` whose ``get_db`` dependency is overridden to
use that database.
"""

from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base, get_db, json_serializer
from app.db.seed import seed
from app.main import app

# A single in-memory database shared across the connection pool for the test
# session; StaticPool keeps the same connection so the schema persists. The JSON
# serializer matches production so keyword search behaves identically.
_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    json_serializer=json_serializer,
)
_TestingSession = sessionmaker(bind=_engine, autoflush=False, autocommit=False, expire_on_commit=False)


@pytest.fixture(scope="session", autouse=True)
def _create_schema() -> Generator[None, None, None]:
    Base.metadata.create_all(bind=_engine)
    with _TestingSession() as db:
        seed(db)
    yield
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    db = _TestingSession()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    def _override_get_db() -> Generator[Session, None, None]:
        db = _TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
