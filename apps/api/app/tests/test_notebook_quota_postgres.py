"""Concurrency stress tests for notebook daily quotas against PostgreSQL.

Exercises the atomic conditional UPDATE reservation pattern under real
database concurrency (multiple concurrent threads and connections), validating
PostgreSQL's READ COMMITTED row-locking semantics (EvalPlanQual).
"""

from __future__ import annotations

import os
import threading
from datetime import date

import pytest
from sqlalchemy import create_engine, delete, select, text
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.notebook import AIUsage
from app.models.project import Project
from app.models.user import User
from app.repositories.notebook_repository import NotebookRepository

POSTGRES_TEST_URL = os.getenv(
    "POSTGRES_TEST_URL",
    (
        os.getenv("DATABASE_URL")
        if (os.getenv("DATABASE_URL") or "").startswith("postgresql")
        else None
    ),
)


def _is_postgres_available() -> bool:
    if not POSTGRES_TEST_URL:
        return False
    try:
        engine = create_engine(POSTGRES_TEST_URL)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        engine.dispose()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _is_postgres_available(),
    reason="PostgreSQL não disponível; configure POSTGRES_TEST_URL para executar",
)


@pytest.fixture(scope="module")
def pg_engine():
    assert POSTGRES_TEST_URL is not None
    engine = create_engine(POSTGRES_TEST_URL, pool_size=30, max_overflow=20)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture(scope="module")
def pg_user_id(pg_engine) -> int:
    with Session(pg_engine) as db:
        user = (
            db.execute(select(User).where(User.google_sub == "test:postgres-quota-concurrency"))
            .scalars()
            .one_or_none()
        )
        if user is None:
            user = User(
                google_sub="test:postgres-quota-concurrency",
                email="quota-concurrency@example.com",
                name="Quota Concurrency Tester",
            )
            db.add(user)
            db.flush()
            db.add(Project(name="Quota Test Project", owner_id=user.id))
            db.commit()
        return user.id


def test_concurrent_reservations_from_scratch_postgres(pg_engine, pg_user_id) -> None:
    """Concurrent threads race to reserve quota when no row exists yet for the day.

    Exercises both ``_ensure_row`` (concurrent INSERT ... ON CONFLICT DO NOTHING)
    and atomic ``reserve`` (UPDATE ... WHERE counter < limit).
    With limit=5 and 20 racers, exactly 5 must succeed and 15 must be rejected.
    The final database counter must be exactly 5.
    """
    day = date(2026, 9, 28)
    with Session(pg_engine) as db:
        db.execute(delete(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day))
        db.commit()

    limit = 5
    racers = 20
    gate = threading.Barrier(racers)
    outcomes: list[bool] = []
    errors: list[BaseException] = []
    lock = threading.Lock()

    def race() -> None:
        try:
            with Session(pg_engine) as db:
                gate.wait(timeout=10)
                taken = NotebookRepository(db, pg_user_id).reserve(day, "fetches", limit)
                db.commit()
            with lock:
                outcomes.append(taken)
        except BaseException as exc:  # noqa: BLE001
            with lock:
                errors.append(exc)

    threads = [threading.Thread(target=race) for _ in range(racers)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert errors == []
    assert len(outcomes) == racers
    assert outcomes.count(True) == limit
    assert outcomes.count(False) == racers - limit

    with Session(pg_engine) as db:
        usage = db.execute(
            select(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day)
        ).scalar_one()
        assert usage.fetches == limit

    with Session(pg_engine) as db:
        db.execute(delete(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day))
        db.commit()


def test_concurrent_reservations_at_limit_minus_one_postgres(pg_engine, pg_user_id) -> None:
    """Contention at boundary: exactly 1 unit remains before the limit.

    Multiple concurrent threads race for the single remaining unit under
    PostgreSQL's default READ COMMITTED isolation.
    The row lock serializes the updates, and the WHERE condition re-evaluates
    against the newly committed row state (EvalPlanQual), ensuring exactly 1 winner.
    """
    day = date(2026, 9, 27)
    limit = 5
    already = 4
    with Session(pg_engine) as db:
        db.execute(delete(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day))
        db.add(AIUsage(user_id=pg_user_id, day=day, requests=0, artifacts=0, fetches=already))
        db.commit()

    racers = 20
    gate = threading.Barrier(racers)
    outcomes: list[bool] = []
    errors: list[BaseException] = []
    lock = threading.Lock()

    def race() -> None:
        try:
            with Session(pg_engine) as db:
                gate.wait(timeout=10)
                taken = NotebookRepository(db, pg_user_id).reserve(day, "fetches", limit)
                db.commit()
            with lock:
                outcomes.append(taken)
        except BaseException as exc:  # noqa: BLE001
            with lock:
                errors.append(exc)

    threads = [threading.Thread(target=race) for _ in range(racers)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert errors == []
    assert len(outcomes) == racers
    assert outcomes.count(True) == 1
    assert outcomes.count(False) == racers - 1

    with Session(pg_engine) as db:
        usage = db.execute(
            select(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day)
        ).scalar_one()
        assert usage.fetches == limit

    with Session(pg_engine) as db:
        db.execute(delete(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day))
        db.commit()


def test_concurrent_reserve_and_release_postgres(pg_engine, pg_user_id) -> None:
    """Interleaved concurrent reserves and releases under PostgreSQL.

    Starts with quota fully exhausted (limit=5, already=5).
    5 threads release 1 unit each while 15 threads attempt to reserve 1 unit.
    The database counter must stay within [0, limit], never exceed limit, and
    at most 5 reserves can succeed.
    """
    day = date(2026, 9, 26)
    limit = 5
    with Session(pg_engine) as db:
        db.execute(delete(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day))
        db.add(AIUsage(user_id=pg_user_id, day=day, requests=0, artifacts=0, fetches=limit))
        db.commit()

    num_releasers = 5
    num_reservers = 15
    total_threads = num_releasers + num_reservers
    gate = threading.Barrier(total_threads)

    reserve_outcomes: list[bool] = []
    errors: list[BaseException] = []
    lock = threading.Lock()

    def do_release() -> None:
        try:
            with Session(pg_engine) as db:
                gate.wait(timeout=10)
                NotebookRepository(db, pg_user_id).release(day, "fetches")
                db.commit()
        except BaseException as exc:  # noqa: BLE001
            with lock:
                errors.append(exc)

    def do_reserve() -> None:
        try:
            with Session(pg_engine) as db:
                gate.wait(timeout=10)
                taken = NotebookRepository(db, pg_user_id).reserve(day, "fetches", limit)
                db.commit()
            with lock:
                reserve_outcomes.append(taken)
        except BaseException as exc:  # noqa: BLE001
            with lock:
                errors.append(exc)

    threads = [threading.Thread(target=do_release) for _ in range(num_releasers)] + [
        threading.Thread(target=do_reserve) for _ in range(num_reservers)
    ]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert errors == []
    assert len(reserve_outcomes) == num_reservers
    assert reserve_outcomes.count(True) <= num_releasers

    with Session(pg_engine) as db:
        usage = db.execute(
            select(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day)
        ).scalar_one()
        assert 0 <= usage.fetches <= limit

    with Session(pg_engine) as db:
        db.execute(delete(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day))
        db.commit()


def test_concurrent_reservations_with_slack_postgres(pg_engine, pg_user_id) -> None:
    """Concurrent reservations with slack under PostgreSQL.

    With already=5, limit=5, but slack=2 (e.g. stalled in-flight Studio jobs),
    the effective limit is 7. 10 racing threads must yield exactly 2 successes.
    """
    day = date(2026, 9, 25)
    limit = 5
    slack = 2
    already = 5
    with Session(pg_engine) as db:
        db.execute(delete(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day))
        db.add(AIUsage(user_id=pg_user_id, day=day, requests=0, artifacts=0, fetches=already))
        db.commit()

    racers = 10
    gate = threading.Barrier(racers)
    outcomes: list[bool] = []
    errors: list[BaseException] = []
    lock = threading.Lock()

    def race() -> None:
        try:
            with Session(pg_engine) as db:
                gate.wait(timeout=10)
                taken = NotebookRepository(db, pg_user_id).reserve(
                    day, "fetches", limit, slack=slack
                )
                db.commit()
            with lock:
                outcomes.append(taken)
        except BaseException as exc:  # noqa: BLE001
            with lock:
                errors.append(exc)

    threads = [threading.Thread(target=race) for _ in range(racers)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert errors == []
    assert len(outcomes) == racers
    assert outcomes.count(True) == slack
    assert outcomes.count(False) == racers - slack

    with Session(pg_engine) as db:
        usage = db.execute(
            select(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day)
        ).scalar_one()
        assert usage.fetches == limit + slack

    with Session(pg_engine) as db:
        db.execute(delete(AIUsage).where(AIUsage.user_id == pg_user_id, AIUsage.day == day))
        db.commit()
