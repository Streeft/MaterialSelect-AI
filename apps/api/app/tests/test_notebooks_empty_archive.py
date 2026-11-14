"""Cadernos, D-236: "Esvaziar o arquivo" — ``DELETE /api/notebooks/archived?expected=N``.

It deletes for good the caller's archived notebooks, all or none, and never reaches
a notebook that is active or somebody else's.
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
    assert resp.json() == {"deleted": 2}
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

    assert _empty(client, 1).json() == {"deleted": 1}

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

    def _fail_on_second(self, notebook):
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("falha no meio")
        real(self, notebook)

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
    assert resp.json() == {"deleted": 0}
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
