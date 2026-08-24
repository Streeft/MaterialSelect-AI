"""Pytest fixtures: in-memory database with per-test transactional isolation.

The schema is created and seeded ONCE per session. Each test then runs inside a
transaction bound to a single shared connection, which is rolled back afterwards
— so writes made by CRUD tests never leak into other tests (e.g. the "exactly 5
materials" assertions remain stable regardless of test order).
"""

from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection, create_engine, event
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db.base import Base, get_db, json_serializer
from app.db.seed import seed
from app.dependencies import get_current_user, require_active_subscription
from app.main import app
from app.models.project import Project
from app.models.user import User

# A single in-memory database shared across the pool for the whole test session;
# StaticPool keeps the same underlying connection so the schema/seed persist.
_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    json_serializer=json_serializer,
)


# pysqlite drives transactions itself by default: it emits BEGIN implicitly
# before DML and never before anything else — including SAVEPOINT. A session
# joining the per-test transaction with ``create_savepoint`` would then emit its
# SAVEPOINT outside any transaction, where it is inert, and the following
# RELEASE would commit for real. The effect was subtle and order-dependent: a
# test whose FIRST database statement was a write escaped the rollback below and
# leaked into every later test, while the same write preceded by a read did not.
#
# The fix is SQLAlchemy's documented pysqlite recipe: take BEGIN away from the
# driver and emit it ourselves, so savepoints nest inside a real transaction.
@event.listens_for(_engine, "connect")
def _sqlite_disable_implicit_begin(dbapi_connection, _record) -> None:
    dbapi_connection.isolation_level = None


@event.listens_for(_engine, "begin")
def _sqlite_emit_begin(conn) -> None:
    conn.exec_driver_sql("BEGIN")


@pytest.fixture(scope="session", autouse=True)
def _create_and_seed_schema() -> Generator[None, None, None]:
    Base.metadata.create_all(bind=_engine)
    with Session(bind=_engine) as db:
        seed(db)  # committed once; becomes the baseline every test starts from
    yield
    Base.metadata.drop_all(bind=_engine)


@pytest.fixture()
def _connection() -> Generator[Connection, None, None]:
    """Open a connection and wrap each test in a transaction that is rolled back.

    Relies on the BEGIN handling installed above; without it the rollback does
    not hold for tests that open with a write.
    """
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


def _create_user(connection: Connection, *, google_sub: str, email: str, name: str) -> User:
    """Write a User + its default Project directly, bypassing AuthService/Google.

    Mirrors the invariant AuthService maintains on first login (one Project per
    User) without a real OAuth round-trip.
    """
    session = _session_for(connection)
    try:
        user = User(google_sub=google_sub, email=email, name=name, avatar_url=None)
        session.add(user)
        session.flush()
        session.add(Project(name="Meu projeto", owner_id=user.id))
        session.commit()
    finally:
        session.close()
    return user


@pytest.fixture()
def test_user(_connection: Connection) -> User:
    """The default logged-in user for every test using the ``client`` fixture."""
    return _create_user(
        _connection,
        google_sub="test:fixture-user",
        email="pesquisador@example.com",
        name="Usuário de teste",
    )


@pytest.fixture()
def other_user(_connection: Connection) -> User:
    """A second user with their own Project, for cross-project isolation tests."""
    return _create_user(
        _connection,
        google_sub="test:fixture-other-user",
        email="outro@example.com",
        name="Outro usuário",
    )


@pytest.fixture()
def client(_connection: Connection, test_user: User) -> Generator[TestClient, None, None]:
    def _override_get_db() -> Generator[Session, None, None]:
        session = _session_for(_connection)
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: test_user
    app.dependency_overrides[require_active_subscription] = lambda: None
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def client_without_subscription(
    _connection: Connection, test_user: User
) -> Generator[TestClient, None, None]:
    """Like `client`, but leaves `require_active_subscription` un-stubbed — for
    testing the 403 (or the 200 once a subscription exists) that a logged-in
    user without an active plan actually gets."""

    def _override_get_db() -> Generator[Session, None, None]:
        session = _session_for(_connection)
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_current_user] = lambda: test_user
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture()
def anon_client(_connection: Connection) -> Generator[TestClient, None, None]:
    """A client with no auth override — real cookie-based ``get_current_user``
    runs, so requests without a session cookie see the actual 401 a logged-out
    browser would get. Only ``get_db`` is swapped, same as ``client``.
    """

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


@pytest.fixture()
def login_as():
    """Context manager to temporarily authenticate ``client`` as another user.

    Swaps only the ``get_current_user`` override, so the surrounding test keeps
    the same ``client``/``db_session`` connection and transaction — only "who is
    logged in" changes for the duration of the ``with`` block.
    """

    @contextmanager
    def _login_as(user: User) -> Generator[None, None, None]:
        previous = app.dependency_overrides.get(get_current_user)
        app.dependency_overrides[get_current_user] = lambda: user
        try:
            yield
        finally:
            if previous is not None:
                app.dependency_overrides[get_current_user] = previous
            else:
                app.dependency_overrides.pop(get_current_user, None)

    return _login_as
