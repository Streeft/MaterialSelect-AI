"""Writing the position of passages saved before D-233 (D-251): ``app.knowledge.chunk_positions``.

A source saved before the chunker reported ``char_start``/``char_end`` has them NULL.
The backfill re-cuts the stored ``content`` and places a passage only when the re-cut
text is identical at the same ordinal — it places, it never guesses — and a second
run finds nothing left to do.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.knowledge.chunk_positions import backfill_chunk_positions, place_chunks
from app.models.notebook import NotebookChunk, NotebookSource

PARAGRAPHS = [
    f"Seção {n}. " + ("Aço e liga de alumínio, com resistência e custo. " * 25) for n in range(8)
]
TEXT = "\n\n".join(PARAGRAPHS)


def _source(client: TestClient, db: Session, title: str = "Fonte antiga") -> NotebookSource:
    notebook = client.post("/api/notebooks", json={"title": "Caderno"}).json()
    created = client.post(
        f"/api/notebooks/{notebook['id']}/sources/text", json={"title": title, "text": TEXT}
    )
    assert created.status_code == 201, created.text
    return db.get(NotebookSource, created.json()["id"])


def _make_legacy(db: Session, source: NotebookSource) -> None:
    """The state of a source saved before D-233: positions NULL, everything else as is."""
    db.execute(
        update(NotebookChunk)
        .where(NotebookChunk.source_id == source.id)
        .values(char_start=None, char_end=None)
    )
    db.flush()
    db.expire_all()


def _positions(db: Session, source_id: int) -> list[tuple[int | None, int | None]]:
    rows = db.execute(
        select(NotebookChunk.char_start, NotebookChunk.char_end)
        .where(NotebookChunk.source_id == source_id)
        .order_by(NotebookChunk.ordinal)
    ).all()
    return [(a, b) for a, b in rows]


def test_a_legacy_source_gets_back_exactly_the_positions_it_was_cut_with(
    client: TestClient, db_session: Session
) -> None:
    source = _source(client, db_session)
    expected = _positions(db_session, source.id)
    assert len(expected) > 2 and all(a is not None for a, _ in expected)
    _make_legacy(db_session, source)
    assert set(_positions(db_session, source.id)) == {(None, None)}

    report = backfill_chunk_positions(db_session, apply=True)

    assert report.sources_seen >= 1 and report.sources_updated >= 1
    assert report.chunks_filled == len(expected) and report.chunks_unplaced == 0
    assert _positions(db_session, source.id) == expected
    # Nothing but the position was written: the passage and its page range are as saved.
    chunks = list(
        db_session.execute(
            select(NotebookChunk)
            .where(NotebookChunk.source_id == source.id)
            .order_by(NotebookChunk.ordinal)
        ).scalars()
    )
    assert all(chunk.text and chunk.search_text for chunk in chunks)


def test_the_simulation_counts_and_writes_nothing_and_a_second_run_finds_nothing(
    client: TestClient, db_session: Session
) -> None:
    source = _source(client, db_session)
    expected = _positions(db_session, source.id)
    _make_legacy(db_session, source)

    simulated = backfill_chunk_positions(db_session)
    assert simulated.applied is False and simulated.chunks_filled == len(expected)
    assert set(_positions(db_session, source.id)) == {(None, None)}

    first = backfill_chunk_positions(db_session, apply=True)
    assert first.chunks_filled == len(expected)
    again = backfill_chunk_positions(db_session, apply=True)
    # Idempotent: every passage already has its position, so there is nothing to look at.
    assert (again.sources_seen, again.chunks_filled, again.chunks_unplaced) == (0, 0, 0)
    assert _positions(db_session, source.id) == expected


def test_a_passage_whose_text_the_chunker_no_longer_reproduces_stays_unplaced(
    client: TestClient, db_session: Session
) -> None:
    source = _source(client, db_session)
    _make_legacy(db_session, source)
    first = (
        db_session.execute(
            select(NotebookChunk)
            .where(NotebookChunk.source_id == source.id)
            .order_by(NotebookChunk.ordinal)
        )
        .scalars()
        .first()
    )
    assert first is not None
    first.text = first.text + " (texto de outra versão do cortador)"
    db_session.flush()

    report = backfill_chunk_positions(db_session, apply=True)

    assert report.chunks_unplaced == 1
    positions = _positions(db_session, source.id)
    # Never a guess: the passage that does not match keeps NULL, the others are placed.
    assert positions[0] == (None, None)
    assert all(a is not None and b is not None for a, b in positions[1:])


def test_a_source_without_stored_content_is_left_alone(
    client: TestClient, db_session: Session
) -> None:
    source = _source(client, db_session)
    _make_legacy(db_session, source)
    source.content = ""
    db_session.flush()
    filled, left = place_chunks(source)
    assert filled == 0 and left > 0


def test_one_notebook_can_be_asked_for_alone(client: TestClient, db_session: Session) -> None:
    mine = _source(client, db_session, "A")
    other = _source(client, db_session, "B")
    _make_legacy(db_session, mine)
    _make_legacy(db_session, other)

    report = backfill_chunk_positions(db_session, notebook_id=mine.notebook_id, apply=True)

    assert report.sources_updated == 1
    assert all(a is not None for a, _ in _positions(db_session, mine.id))
    assert set(_positions(db_session, other.id)) == {(None, None)}
