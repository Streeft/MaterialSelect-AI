"""Pytest fixtures: in-memory database with per-test transactional isolation.

The schema is created and seeded ONCE per session. Each test then runs inside a
transaction bound to a single shared connection, which is rolled back afterwards
— so writes made by CRUD tests never leak into other tests (e.g. the "exactly 5
materials" assertions remain stable regardless of test order).
"""

from __future__ import annotations

from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection, create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base, get_db, json_serializer
from app.db.seed import seed
from app.main import app

# A single in-memory database shared across the pool for the whole test session;
# StaticPool keeps the same underlying connection so the schema/seed persist.
_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    json_serializer=json_serializer,
)


@pytest.fixture(scope="session", autouse=True)
def _create_and_seed_schema() -> Generator[None, None, None]:
    Base.metadata.create_all(bind=_engine)
    with Session(bind=_engine) as db:
        seed(db)  # committed once; becomes the baseline every test starts from
    yield
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture()
def _connection() -> Generator[Connection, None, None]:
    """Open a connection and wrap each test in a transaction that is rolled back."""
    conn = _engine.connect()
    transaction = conn.begin()
    try:
        yield conn
    finally:
        transaction.rollback()
        conn.close()


def _session_for(conn: Connection) -> Session:
    # create_savepoint: app-level commits land on a savepoint inside the outer
    # per-test transaction, which is rolled back at the end of the test.
    # expire_on_commit=False mirrors the production SessionLocal — a mismatch
    # here once masked a stale-response bug that only manifested in production
    # sessions (identity-map collection not refreshed after commit).
    return Session(
        bind=conn,
        join_transaction_mode="create_savepoint",
        expire_on_commit=False,
    )


@pytest.fixture()
def db_session(_connection: Connection) -> Generator[Session, None, None]:
    session = _session_for(_connection)
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(_connection: Connection) -> Generator[TestClient, None, None]:
    def _override_get_db() -> Generator[Session, None, None]:
        session = _session_for(_connection)
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
