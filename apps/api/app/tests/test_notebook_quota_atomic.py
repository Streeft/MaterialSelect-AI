"""The daily quotas of the Cadernos are taken atomically (pendência da fase 3).

The three counters — AI requests (D-92), Studio generations (D-94) and outside
fetches (D-97) — were checked in one step and counted in another, the count a
read-then-write in Python. A burst from one student passed the check whole
before the first count was committed, and two concurrent increments could lose
one. Each unit is now *reserved* by one ``UPDATE … WHERE counter < limit``
whose row count says whether it was taken, and handed back when the operation
ends up not charging it.

Two kinds of proof here. The in-memory SQLite of the suite runs every session
on one connection, so a true race cannot happen there: the service tests
replay the race in order (both requests pass the early check, then both try
to spend). The repository test runs a real one — threads released together
against a database file, each on its own connection —, with ``BEGIN
IMMEDIATE`` so that SQLite's writers queue the way PostgreSQL's row lock makes
them queue (a deferred SQLite transaction would instead fail the loser with
"database is locked", which says nothing about the statement under test).
"""

from __future__ import annotations

import threading
from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from app.config import settings
from app.domain.errors import QuotaExceededError
from app.models.notebook import AIUsage, Notebook, StudioArtifact
from app.repositories.notebook_repository import NotebookRepository
from app.services.notebook_service import NotebookService, _today
from app.services.studio_service import StudioService

TEXT = (
    "O aço carbono tem densidade de 7850 kg/m³ e módulo de elasticidade de 210 GPa. "
    "É o material estrutural mais usado na construção civil."
)


# --- the repository statement ------------------------------------------------------------


def test_reserve_takes_units_only_under_the_limit(db_session, test_user):
    repo = NotebookRepository(db_session, test_user.id)
    day = _today()
    assert [repo.reserve(day, "fetches", 2) for _ in range(3)] == [True, True, False]
    assert repo.usage(day).fetches == 2
    repo.release(day, "fetches")
    assert repo.usage(day).fetches == 1
    assert repo.reserve(day, "fetches", 2) is True


def test_two_consumes_at_limit_minus_one_give_exactly_one_success(db_session, test_user):
    repo = NotebookRepository(db_session, test_user.id)
    day = _today()
    spend = {
        "requests": repo.count_request,
        "artifacts": repo.count_artifact,
        "fetches": repo.count_fetch,
    }
    for counter, count in spend.items():
        for _ in range(4):
            count(day)
        limit = 5  # limit − 1 already spent
        results = [repo.reserve(day, counter, limit), repo.reserve(day, counter, limit)]
        assert results == [True, False], counter
        assert getattr(repo.usage(day), counter) == limit


def test_release_never_goes_below_zero(db_session, test_user):
    repo = NotebookRepository(db_session, test_user.id)
    day = _today()
    repo.release(day, "artifacts")  # no row yet: nothing to hand back
    assert repo.usage(day) is None
    repo.reserve(day, "artifacts", 5)
    repo.release(day, "artifacts")
    repo.release(day, "artifacts")
    assert repo.usage(day).artifacts == 0


def test_slack_is_what_the_counter_holds_but_does_not_charge(db_session, test_user):
    repo = NotebookRepository(db_session, test_user.id)
    day = _today()
    assert repo.reserve(day, "artifacts", 1) is True
    assert repo.reserve(day, "artifacts", 1) is False
    assert repo.reserve(day, "artifacts", 1, slack=1) is True  # one of them is stuck
    assert repo.usage(day).artifacts == 2


def test_a_session_that_read_the_row_sees_the_new_count(db_session, test_user):
    """The counters move by ``UPDATE`` statements that bypass the identity map:
    a row loaded before must not keep its old numbers."""
    repo = NotebookRepository(db_session, test_user.id)
    day = _today()
    repo.count_fetch(day)
    loaded = repo.usage(day)
    assert loaded.fetches == 1
    repo.reserve(day, "fetches", 10)
    assert repo.usage(day).fetches == 2


@pytest.mark.parametrize(("already", "limit", "racers"), [(4, 5, 8), (0, 3, 8)])
def test_concurrent_reservations_on_a_real_database(tmp_path, already, limit, racers):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'cota.db'}", connect_args={"check_same_thread": False}
    )

    @event.listens_for(engine, "connect")
    def _no_driver_begin(dbapi_connection, _record) -> None:
        dbapi_connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def _begin_immediate(conn) -> None:
        conn.exec_driver_sql("BEGIN IMMEDIATE")

    AIUsage.__table__.create(engine)
    day = date(2026, 9, 29)
    with Session(engine) as db:
        db.add(AIUsage(user_id=7, day=day, requests=0, artifacts=0, fetches=already))
        db.commit()

    gate = threading.Barrier(racers)
    outcomes: list[bool] = []
    errors: list[BaseException] = []
    lock = threading.Lock()

    def race() -> None:
        try:
            with Session(engine) as db:
                gate.wait(timeout=10)
                taken = NotebookRepository(db, 7).reserve(day, "fetches", limit)
                db.commit()
            with lock:
                outcomes.append(taken)
        except BaseException as exc:  # noqa: BLE001 - reported below
            with lock:
                errors.append(exc)

    threads = [threading.Thread(target=race) for _ in range(racers)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert errors == []
    assert len(outcomes) == racers
    assert outcomes.count(True) == limit - already
    with Session(engine) as db:
        assert db.get(AIUsage, 1).fetches == limit
    engine.dispose()


# --- AI requests (the chat and the guide) -----------------------------------------------


def _notebook_service(db_session, user, **overrides) -> NotebookService:
    configured = settings.model_copy(update=overrides) if overrides else settings
    return NotebookService(db_session, user, configured)


def test_two_questions_racing_for_the_last_request_get_one(db_session, test_user):
    first = _notebook_service(db_session, test_user, notebook_daily_requests=2)
    second = _notebook_service(db_session, test_user, notebook_daily_requests=2)
    first.repo.count_request(_today())

    first.check_quota()
    second.check_quota()  # both see one left: the old window
    with first.reserved_request():
        pass
    with pytest.raises(QuotaExceededError, match="perguntas de hoje"):
        with second.reserved_request():
            pytest.fail("the second question must not reach the provider")
    assert first.usage().used == 2


def test_a_failed_question_hands_its_request_back(db_session, test_user):
    service = _notebook_service(db_session, test_user, notebook_daily_requests=1)
    with pytest.raises(RuntimeError):
        with service.reserved_request():
            assert service.usage().used == 1  # held while the call runs
            raise RuntimeError("provedor fora do ar")
    assert service.usage().used == 0
    with service.reserved_request():
        pass
    assert service.usage().remaining == 0


def test_the_chat_still_counts_one_question_once(client, monkeypatch):
    monkeypatch.setattr(settings, "notebook_daily_requests", 2)
    notebook = client.post("/api/notebooks", json={"title": "Q"}).json()
    client.post(
        f"/api/notebooks/{notebook['id']}/sources/text", json={"title": "Aula", "text": TEXT}
    )
    asked = client.post(f"/api/notebooks/{notebook['id']}/chat", json={"question": "aço"})
    assert asked.status_code == 200, asked.text
    assert asked.json()["usage"] == {"used": 1, "limit": 2, "remaining": 1}
    guided = client.post(f"/api/notebooks/{notebook['id']}/summary")
    assert guided.status_code == 200
    assert guided.json()["usage"] == {"used": 2, "limit": 2, "remaining": 0}
    refused = client.post(f"/api/notebooks/{notebook['id']}/chat", json={"question": "aço"})
    assert refused.status_code == 429


# --- Studio generations -------------------------------------------------------------------


def _studio_notebook(client) -> int:
    notebook = client.post("/api/notebooks", json={"title": "Estúdio"}).json()
    client.post(
        f"/api/notebooks/{notebook['id']}/sources/text", json={"title": "Aula", "text": TEXT}
    )
    return notebook["id"]


def test_a_generation_reserves_its_unit_when_it_is_created(client, db_session, monkeypatch):
    """The reservation is in the same transaction as the ``gerando`` row, so a
    running generation counts from the moment it exists."""
    monkeypatch.setattr(settings, "notebook_daily_artifacts", 1)
    monkeypatch.setattr(settings, "notebook_studio_in_flight", 5)
    notebook_id = _studio_notebook(client)
    # Replayed race: hold the job back so the first generation stays running.
    monkeypatch.setattr("app.routers.notebooks.run_job", lambda *a, **k: None)
    first = client.post(f"/api/notebooks/{notebook_id}/studio", json={"tool": "flashcards"})
    assert first.status_code == 202
    second = client.post(f"/api/notebooks/{notebook_id}/studio", json={"tool": "quiz"})
    assert second.status_code == 429
    assert "gerações de hoje" in second.json()["detail"]
    usage = client.get(f"/api/notebooks/{notebook_id}/studio").json()["usage"]
    assert usage["remaining"] == 0


def test_a_failed_generation_hands_its_unit_back(db_session, test_user, monkeypatch):
    service = StudioService(db_session, test_user, settings)
    notebook = Notebook(owner_id=test_user.id, title="Falha")
    db_session.add(notebook)
    db_session.flush()
    now = datetime.now(UTC)
    service.repo.reserve(now.date(), "artifacts", 10)
    artifact = StudioArtifact(
        notebook_id=notebook.id,
        tool="report",
        title="Relatório",
        status="gerando",
        source_ids=[],  # its sources are gone: the job fails
        created_at=now,
    )
    db_session.add(artifact)
    db_session.commit()
    assert service.usage().remaining == settings.notebook_daily_artifacts - 1

    service.run(artifact.id)
    db_session.refresh(artifact)
    assert artifact.status == "falhou"
    assert service.usage().model_dump() == {
        "used": 0,
        "limit": settings.notebook_daily_artifacts,
        "remaining": settings.notebook_daily_artifacts,
    }


def test_deleting_a_running_generation_hands_its_unit_back(client, monkeypatch):
    monkeypatch.setattr(settings, "notebook_daily_artifacts", 1)
    monkeypatch.setattr("app.routers.notebooks.run_job", lambda *a, **k: None)
    notebook_id = _studio_notebook(client)
    started = client.post(f"/api/notebooks/{notebook_id}/studio", json={"tool": "flashcards"})
    assert started.status_code == 202
    base = f"/api/notebooks/{notebook_id}/studio"
    assert client.get(base).json()["usage"]["remaining"] == 0
    assert client.delete(f"{base}/{started.json()['id']}").status_code == 204
    assert client.get(base).json()["usage"] == {"used": 0, "limit": 1, "remaining": 1}


def test_a_finished_generation_keeps_its_unit_after_being_deleted(client, monkeypatch):
    monkeypatch.setattr(settings, "notebook_daily_artifacts", 2)
    notebook_id = _studio_notebook(client)
    started = client.post(f"/api/notebooks/{notebook_id}/studio", json={"tool": "flashcards"})
    base = f"/api/notebooks/{notebook_id}/studio"
    assert client.get(f"{base}/{started.json()['id']}").json()["status"] == "pronto"
    assert client.get(base).json()["usage"] == {"used": 1, "limit": 2, "remaining": 1}
    assert client.delete(f"{base}/{started.json()['id']}").status_code == 204
    assert client.get(base).json()["usage"] == {"used": 1, "limit": 2, "remaining": 1}


def test_an_interrupted_generation_costs_nothing(client, db_session, test_user, monkeypatch):
    """A restart leaves the row ``gerando`` past its deadline; it reads as
    failed and its reserved unit is not charged — without the GET writing."""
    monkeypatch.setattr(settings, "notebook_daily_artifacts", 1)
    notebook_id = _studio_notebook(client)
    created = datetime.now(UTC) - timedelta(minutes=60)
    if created.date() != datetime.now(UTC).date():  # pragma: no cover - just after midnight
        pytest.skip("the stuck generation would belong to yesterday's counter")
    NotebookRepository(db_session, test_user.id).count_artifact(created.date())
    db_session.add(
        StudioArtifact(
            notebook_id=notebook_id,
            tool="report",
            title="Relatório",
            status="gerando",
            source_ids=[],
            created_at=created,
        )
    )
    db_session.flush()
    base = f"/api/notebooks/{notebook_id}/studio"
    assert client.get(base).json()["usage"] == {"used": 0, "limit": 1, "remaining": 1}
    assert client.post(base, json={"tool": "flashcards"}).status_code == 202
