"""Cadernos, D-236, D-249: "Esvaziar o arquivo" — ``DELETE /api/notebooks/archived?expected=N``.

It deletes for good the caller's archived notebooks and never reaches a notebook that is active or
somebody else's. Since D-249 one request deletes a **bounded batch** (all or nothing per batch,
oldest first) and answers how many are left; the screen repeats it with that number as the count it
expects, so thousands of archived notebooks never become one long request.
"""

from __future__ import annotations

from app.models.notebook import (
    Notebook,
    NotebookChunk,
    NotebookMessage,
    NotebookNote,
    NotebookSource,
    StudioArtifact,
)

TEXT = "O aço carbono tem densidade de 7850 kg/m³. O alumínio 6061 tem 2700 kg/m³."


def _notebook(client, title, with_chat=False) -> int:
    notebook = client.post("/api/notebooks", json={"title": title}).json()
    resp = client.post(
        f"/api/notebooks/{notebook['id']}/sources/text", json={"title": "Aula", "text": TEXT}
    )
    assert resp.status_code == 201, resp.text
    if with_chat:
        client.post(f"/api/notebooks/{notebook['id']}/chat", json={"question": "densidade do aço"})
    return notebook["id"]


def _archive(client, *ids):
    resp = client.post("/api/notebooks/batch-archive", json={"ids": list(ids), "archived": True})
    assert resp.status_code == 200, resp.text


def _empty(client, expected):
    return client.delete("/api/notebooks/archived", params={"expected": expected})


def test_it_deletes_every_archived_notebook_and_everything_inside(client, db_session):
    a = _notebook(client, "A", with_chat=True)
    b = _notebook(client, "B")
    keep = _notebook(client, "Ativo")
    note = client.post(f"/api/notebooks/{a}/notes", json={"title": "n", "body": "corpo"})
    assert note.status_code == 201, note.text
    assert db_session.query(NotebookMessage).filter(NotebookMessage.notebook_id == a).count() == 2
    _archive(client, a, b)

    resp = _empty(client, 2)

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": 2, "remaining": 0}
    db_session.expire_all()
    for gone in (a, b):
        assert db_session.get(Notebook, gone) is None
        for model in (NotebookSource, NotebookMessage, NotebookNote, StudioArtifact):
            assert db_session.query(model).filter(model.notebook_id == gone).count() == 0
    assert (
        db_session.query(NotebookChunk)
        .join(NotebookSource, NotebookSource.id == NotebookChunk.source_id)
        .filter(NotebookSource.notebook_id.in_([a, b]))
        .count()
        == 0
    )
    # The active notebook, with its source, is still there.
    assert [n["id"] for n in client.get("/api/notebooks").json()] == [keep]
    assert len(client.get(f"/api/notebooks/{keep}").json()["sources"]) == 1
    assert client.get("/api/notebooks", params={"archived": "true"}).json() == []


def test_it_never_touches_another_users_notebooks(client, login_as, other_user, db_session):
    mine = _notebook(client, "Meu arquivado")
    _archive(client, mine)
    with login_as(other_user):
        theirs_archived = _notebook(client, "Arquivado do Bruno")
        theirs_active = _notebook(client, "Ativo do Bruno")
        _archive(client, theirs_archived)

    assert _empty(client, 1).json() == {"deleted": 1, "remaining": 0}

    db_session.expire_all()
    assert db_session.get(Notebook, mine) is None
    # Neither the stranger's archived notebook nor the active one was reached.
    assert db_session.get(Notebook, theirs_archived) is not None
    assert db_session.get(Notebook, theirs_active) is not None
    assert (
        db_session.query(NotebookSource)
        .filter(NotebookSource.notebook_id == theirs_archived)
        .count()
        == 1
    )
    with login_as(other_user):
        assert [
            n["id"] for n in client.get("/api/notebooks", params={"archived": "true"}).json()
        ] == [theirs_archived]


def test_a_different_count_than_the_confirmed_one_deletes_nothing(client, db_session):
    a = _notebook(client, "A")
    b = _notebook(client, "B")
    _archive(client, a, b)

    for wrong in (1, 3, 0):
        resp = _empty(client, wrong)
        assert resp.status_code == 409
        assert "Recarregue" in resp.json()["detail"]

    db_session.expire_all()
    assert db_session.get(Notebook, a) is not None and db_session.get(Notebook, b) is not None


def test_it_is_all_or_nothing_when_a_deletion_fails(client, db_session, monkeypatch):
    from app.services import notebook_service

    a = _notebook(client, "A")
    b = _notebook(client, "B")
    _archive(client, a, b)
    calls = {"n": 0}
    real = notebook_service.NotebookService._discard

    def _fail_on_second(self, notebook, running=None):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("falha no meio")
        real(self, notebook, running)

    monkeypatch.setattr(notebook_service.NotebookService, "_discard", _fail_on_second)
    try:
        client.delete("/api/notebooks/archived", params={"expected": 2})
    except RuntimeError:
        pass
    db_session.rollback()
    db_session.expire_all()
    assert db_session.get(Notebook, a) is not None and db_session.get(Notebook, b) is not None


def test_an_empty_archive_with_zero_expected_is_a_no_op(client):
    keep = _notebook(client, "Ativo")
    resp = _empty(client, 0)
    assert resp.status_code == 200
    assert resp.json() == {"deleted": 0, "remaining": 0}
    assert [n["id"] for n in client.get("/api/notebooks").json()] == [keep]


def test_the_count_is_required_and_not_negative(client):
    assert client.delete("/api/notebooks/archived").status_code == 422
    assert client.delete("/api/notebooks/archived", params={"expected": -1}).status_code == 422


def test_the_route_does_not_shadow_deleting_one_notebook(client):
    a = _notebook(client, "A")
    assert client.delete(f"/api/notebooks/{a}").status_code == 204
    assert client.delete("/api/notebooks/999999").status_code == 404


def test_it_needs_login(anon_client):
    assert anon_client.delete("/api/notebooks/archived", params={"expected": 0}).status_code == 401


# --- in batches (D-249) ---------------------------------------------------------


def _many(client, count, title="Arquivado"):
    ids = []
    for n in range(count):
        ids.append(client.post("/api/notebooks", json={"title": f"{title} {n}"}).json()["id"])
    for start in range(0, len(ids), 100):  # batch-archive takes at most 100 at a time
        _archive(client, *ids[start : start + 100])
    return ids


def test_one_request_deletes_one_batch_oldest_first_and_says_how_many_are_left(client, db_session):
    ids = _many(client, 5)
    resp = client.delete("/api/notebooks/archived", params={"expected": 5, "limit": 2})
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"deleted": 2, "remaining": 3}
    db_session.expire_all()
    assert [db_session.get(Notebook, i) is None for i in ids] == [True, True, False, False, False]
    left = client.get("/api/notebooks", params={"archived": "true"}).json()
    assert sorted(n["id"] for n in left) == ids[2:]


def test_repeating_with_the_remaining_count_empties_the_archive(client, db_session):
    ids = _many(client, 7)
    expected, deleted_total, calls = 7, 0, 0
    while expected:
        body = client.delete(
            "/api/notebooks/archived", params={"expected": expected, "limit": 3}
        ).json()
        deleted_total += body["deleted"]
        expected = body["remaining"]
        calls += 1
        assert calls < 10
    assert (deleted_total, calls) == (7, 3)
    db_session.expire_all()
    assert all(db_session.get(Notebook, i) is None for i in ids)


def test_the_default_batch_is_bounded_and_an_archive_over_it_needs_more_than_one_request(
    client, monkeypatch
):
    from app.services import notebook_service

    monkeypatch.setattr(notebook_service.NotebookService, "EMPTY_ARCHIVE_BATCH", 3)
    _many(client, 5)
    first = _empty(client, 5).json()
    assert first == {"deleted": 3, "remaining": 2}
    assert _empty(client, 2).json() == {"deleted": 2, "remaining": 0}


def test_an_archive_within_the_batch_is_still_one_request_as_before(client):
    _many(client, 4)
    assert _empty(client, 4).json() == {"deleted": 4, "remaining": 0}


def test_a_run_that_finds_the_archive_changed_stops_where_it_is(client, db_session):
    ids = _many(client, 5)
    assert client.delete("/api/notebooks/archived", params={"expected": 5, "limit": 2}).json() == {
        "deleted": 2,
        "remaining": 3,
    }
    # Another tab brings one back between the batches: the next one expected 3 and finds 2.
    client.post("/api/notebooks/batch-archive", json={"ids": [ids[4]], "archived": False})
    resp = client.delete("/api/notebooks/archived", params={"expected": 3, "limit": 2})
    assert resp.status_code == 409 and "O arquivo mudou" in resp.json()["detail"]
    db_session.expire_all()
    # Nothing more was deleted, and the one brought back is untouched.
    assert db_session.get(Notebook, ids[2]) is not None
    assert db_session.get(Notebook, ids[4]) is not None


def test_a_failure_in_a_batch_undoes_that_batch_and_keeps_the_ones_before(
    client, db_session, monkeypatch
):
    from app.services import notebook_service

    ids = _many(client, 4)
    assert client.delete("/api/notebooks/archived", params={"expected": 4, "limit": 2}).json() == {
        "deleted": 2,
        "remaining": 2,
    }

    real = notebook_service.NotebookService._discard
    calls = {"n": 0}

    def _fail_on_second(self, notebook, running=None):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("falha no meio")
        real(self, notebook, running)

    monkeypatch.setattr(notebook_service.NotebookService, "_discard", _fail_on_second)
    try:
        client.delete("/api/notebooks/archived", params={"expected": 2, "limit": 2})
    except RuntimeError:
        pass
    db_session.rollback()
    db_session.expire_all()
    assert db_session.get(Notebook, ids[0]) is None and db_session.get(Notebook, ids[1]) is None
    assert db_session.get(Notebook, ids[2]) is not None
    assert db_session.get(Notebook, ids[3]) is not None


def test_the_batch_size_is_validated(client):
    _many(client, 1)
    assert (
        client.delete("/api/notebooks/archived", params={"expected": 1, "limit": 0}).status_code
        == 422
    )
    assert (
        client.delete("/api/notebooks/archived", params={"expected": 1, "limit": 201}).status_code
        == 422
    )
    assert client.delete(
        "/api/notebooks/archived", params={"expected": 1, "limit": 200}
    ).json() == {
        "deleted": 1,
        "remaining": 0,
    }


def test_a_batch_never_reaches_anothers_archived_notebooks(
    client, login_as, other_user, db_session
):
    mine = _many(client, 3)
    with login_as(other_user):
        theirs = _many(client, 3, title="Dele")
    assert client.delete("/api/notebooks/archived", params={"expected": 3, "limit": 2}).json() == {
        "deleted": 2,
        "remaining": 1,
    }
    db_session.expire_all()
    assert all(db_session.get(Notebook, i) is not None for i in theirs)
    assert db_session.get(Notebook, mine[2]) is not None


def test_a_running_generation_hands_its_unit_back_once_per_notebook_in_a_batch(
    client, db_session, monkeypatch
):
    """The owner's running generations are read once per batch, not once per notebook."""
    from app.repositories import notebook_repository

    _many(client, 4)
    reads = {"n": 0}
    real = notebook_repository.NotebookRepository.running

    def counting(self):
        reads["n"] += 1
        return real(self)

    monkeypatch.setattr(notebook_repository.NotebookRepository, "running", counting)
    assert _empty(client, 4).json() == {"deleted": 4, "remaining": 0}
    assert reads["n"] == 1


def test_a_long_archive_takes_several_requests_of_the_default_size(client, db_session):
    ids = _many(client, 120)
    expected, sizes = 120, []
    while expected:
        body = _empty(client, expected).json()
        sizes.append(body["deleted"])
        expected = body["remaining"]
    assert sizes == [50, 50, 20]
    db_session.expire_all()
    assert db_session.query(Notebook).filter(Notebook.id.in_(ids)).count() == 0
