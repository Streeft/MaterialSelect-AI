"""Re-embedding notebook vectors of another identity (D-255): ``app.knowledge.notebook_reembed``.

Vectors stored before D-101 have 3072 dimensions; the question is embedded at
768, so those passages were searched by words only. The command counts them in
the simulation, swaps only the vector when applied (never the source, never
the passage), is idempotent, and reads quota refusals as the nightly embed
does — no network: the client, the clock and the sleep are fakes.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.knowledge.embeddings import EmbeddingHttpError, pack_vector, unpack_vector
from app.knowledge.notebook_reembed import run, stale_chunk_ids
from app.models.notebook import NotebookChunk, NotebookEmbedding, NotebookSource

MODEL = "gemini-embedding-001"
DIMS = 4
OLD_DIMS = 12

TEXT = "\n\n".join(
    f"Seção {n}. " + ("Aço e liga de alumínio, com resistência e custo. " * 25) for n in range(4)
)


class FakeClient:
    def __init__(self, script: list[BaseException | None] | None = None) -> None:
        self.script = list(script or [])
        self.model = MODEL
        self.dimensions = DIMS
        self.configured = True
        self.calls: list[list[str]] = []

    def embed(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        if self.script:
            item = self.script.pop(0)
            if item is not None:
                raise item
        return [[0.0, 1.0, 0.0, 0.0] for _ in texts]


class Clock:
    def __init__(self) -> None:
        self.now = 0.0
        self.sleeps: list[float] = []

    def __call__(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.now += seconds


def _http(status: int, *, retry_after: float | None = None, daily: bool = False):
    return EmbeddingHttpError(
        f"erro {status}", status=status, retry_after=retry_after, daily=daily, detail=""
    )


def _legacy_source(client: TestClient, db: Session) -> NotebookSource:
    """A notebook source whose every passage holds a vector of the old size."""
    notebook = client.post("/api/notebooks", json={"title": "Caderno"}).json()
    created = client.post(
        f"/api/notebooks/{notebook['id']}/sources/text", json={"title": "Antiga", "text": TEXT}
    )
    assert created.status_code == 201, created.text
    source = db.get(NotebookSource, created.json()["id"])
    assert source is not None
    for chunk in source.chunks:
        old = [1.0] + [0.0] * (OLD_DIMS - 1)
        if chunk.embedding is None:
            db.add(
                NotebookEmbedding(
                    chunk_id=chunk.id, model=MODEL, dimensions=OLD_DIMS, vector=pack_vector(old)
                )
            )
        else:
            chunk.embedding.dimensions = OLD_DIMS
            chunk.embedding.vector = pack_vector(old)
    db.flush()
    db.expire_all()
    return source


def _identities(db: Session, source_id: int) -> list[tuple[str, int]]:
    rows = db.execute(
        select(NotebookEmbedding.model, NotebookEmbedding.dimensions)
        .join(NotebookChunk, NotebookChunk.id == NotebookEmbedding.chunk_id)
        .where(NotebookChunk.source_id == source_id)
        .order_by(NotebookChunk.ordinal)
    ).all()
    return [(m, d) for m, d in rows]


def _quiet(_: str) -> None:
    pass


def test_the_simulation_counts_and_sends_nothing(client: TestClient, db_session: Session) -> None:
    source = _legacy_source(client, db_session)
    n = len(source.chunks)
    fake = FakeClient()
    lines: list[str] = []

    report = run(db_session, client=fake, batch=2, out=lines.append)

    assert report.applied is False and report.exit_code == 0
    assert report.stale_groups == {(MODEL, OLD_DIMS): n}
    assert (report.sources, report.notebooks, report.remaining) == (1, 1, n)
    assert fake.calls == []
    assert set(_identities(db_session, source.id)) == {(MODEL, OLD_DIMS)}
    printed = "\n".join(lines)
    assert "simulação" in printed and "Antiga" not in printed and "Aço" not in printed


def test_apply_swaps_only_the_vector_and_a_second_run_finds_nothing(
    client: TestClient, db_session: Session
) -> None:
    source = _legacy_source(client, db_session)
    texts_before = [chunk.text for chunk in source.chunks]
    chunk_ids = [chunk.id for chunk in source.chunks]
    sources_before = db_session.scalar(select(func.count(NotebookSource.id)))
    fake = FakeClient()

    report = run(db_session, apply=True, client=fake, batch=2, out=_quiet)

    assert report.exit_code == 0 and report.replaced == len(chunk_ids) and report.remaining == 0
    assert set(_identities(db_session, source.id)) == {(MODEL, DIMS)}
    db_session.expire_all()
    refreshed = db_session.get(NotebookSource, source.id)
    assert refreshed is not None
    assert [c.text for c in refreshed.chunks] == texts_before
    assert [c.id for c in refreshed.chunks] == chunk_ids
    assert db_session.scalar(select(func.count(NotebookSource.id))) == sources_before
    assert unpack_vector(refreshed.chunks[0].embedding.vector) == pytest.approx([0, 1, 0, 0])

    again = run(db_session, apply=True, client=FakeClient(), batch=2, out=_quiet)
    assert again.stale == 0 and again.requests == 0


def test_a_passage_without_vector_is_left_alone(client: TestClient, db_session: Session) -> None:
    source = _legacy_source(client, db_session)
    first = source.chunks[0]
    db_session.delete(first.embedding)
    db_session.flush()
    db_session.expire_all()

    assert first.id not in stale_chunk_ids(db_session, MODEL, DIMS)
    run(db_session, apply=True, client=FakeClient(), batch=5, out=_quiet)
    count = db_session.scalar(
        select(func.count(NotebookEmbedding.id)).where(NotebookEmbedding.chunk_id == first.id)
    )
    assert count == 0


def test_per_minute_429_waits_and_repeats(client: TestClient, db_session: Session) -> None:
    source = _legacy_source(client, db_session)
    clock = Clock()
    fake = FakeClient([_http(429, retry_after=7)])

    report = run(
        db_session,
        apply=True,
        client=fake,
        batch=50,
        sleep=clock.sleep,
        clock=clock,
        out=_quiet,
    )

    assert report.exit_code == 0 and report.remaining == 0
    assert clock.sleeps == [7]
    assert len(fake.calls) == 2 and fake.calls[0] == fake.calls[1]
    assert set(_identities(db_session, source.id)) == {(MODEL, DIMS)}


def test_daily_quota_stops_with_zero_and_keeps_what_was_stored(
    client: TestClient, db_session: Session
) -> None:
    source = _legacy_source(client, db_session)
    n = len(source.chunks)
    assert n >= 2
    fake = FakeClient([None, _http(429, daily=True)])
    lines: list[str] = []

    report = run(db_session, apply=True, client=fake, batch=1, out=lines.append)

    assert report.exit_code == 0 and report.replaced == 1 and report.remaining == n - 1
    assert any("cota diária" in line for line in lines)


def test_budget_ends_the_run_with_zero(client: TestClient, db_session: Session) -> None:
    source = _legacy_source(client, db_session)
    report = run(db_session, apply=True, client=FakeClient(), batch=1, max_requests=1, out=_quiet)
    assert report.exit_code == 0 and report.requests == 1
    assert report.remaining == len(source.chunks) - 1


def test_a_refused_batch_is_resent_one_by_one(client: TestClient, db_session: Session) -> None:
    source = _legacy_source(client, db_session)
    n = len(source.chunks)
    fake = FakeClient([_http(400)])

    report = run(db_session, apply=True, client=fake, batch=n, out=_quiet)

    assert report.exit_code == 0 and report.replaced == n and report.refused == 0
    assert len(fake.calls[0]) == n and all(len(call) == 1 for call in fake.calls[1:])


def test_a_credential_error_exits_one(client: TestClient, db_session: Session) -> None:
    _legacy_source(client, db_session)
    report = run(db_session, apply=True, client=FakeClient([_http(401)]), batch=50, out=_quiet)
    assert report.exit_code == 1 and report.replaced == 0


def test_unconfigured_exits_one_before_counting(db_session: Session) -> None:
    fake = FakeClient()
    fake.configured = False
    report = run(db_session, client=fake, out=_quiet)
    assert report.exit_code == 1 and fake.calls == []


def test_the_workflow_has_both_actions() -> None:
    workflow = Path(__file__).resolve().parents[4] / ".github" / "workflows" / "admin-banco.yml"
    text = workflow.read_text(encoding="utf-8")
    assert "- cadernos_reembedar_simular" in text and "- cadernos_reembedar\n" in text
    calls = [
        line.strip()
        for line in text.splitlines()
        if "python -m app.knowledge.notebook_reembed" in line
    ]
    assert len(calls) == 2
    assert sum("--apply" in call for call in calls) == 1
