"""Cadernos, D-233: the exact place of a cited passage, "Duplicar com conversa" and
archiving several notebooks at once.

Three independent changes, one file because they share a fixture (a notebook with
a source, an answer and an artifact) and the same reader's question: *what carries
over, and what never points at somebody else's rows*.
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

TEXT = (
    "O aço carbono tem densidade de 7850 kg/m³ e módulo de elasticidade de 210 GPa. "
    "É o material estrutural mais usado na construção civil.\n\n"
    "O alumínio 6061 tem densidade de 2700 kg/m³, cerca de um terço da do aço. "
    "Por isso aparece em estruturas leves, como quadros de bicicleta."
)


def _notebook(client, title="Materiais estruturais", text=TEXT) -> int:
    notebook = client.post("/api/notebooks", json={"title": title}).json()
    response = client.post(
        f"/api/notebooks/{notebook['id']}/sources/text", json={"title": "Aula 1", "text": text}
    )
    assert response.status_code == 201, response.text
    return notebook["id"]


def _ask(client, notebook_id, question="densidade do aço") -> dict:
    response = client.post(f"/api/notebooks/{notebook_id}/chat", json={"question": question})
    assert response.status_code == 200, response.text
    return response.json()["answer"]["answer"]


def _words(text: str) -> list[str]:
    return text.split()


# --- The exact place of the passage ----------------------------------------------


def test_a_citation_carries_the_interval_of_its_passage_in_the_source(client):
    notebook_id = _notebook(client)
    source_id = client.get(f"/api/notebooks/{notebook_id}").json()["sources"][0]["id"]
    content = client.get(f"/api/notebooks/{notebook_id}/sources/{source_id}").json()["content"]

    answer = _ask(client, notebook_id)

    assert answer["citations"]
    for citation in answer["citations"]:
        start, end = citation["char_start"], citation["char_end"]
        assert isinstance(start, int) and isinstance(end, int)
        assert 0 <= start < end <= len(content)
        # The marked stretch is the passage's own text, read where the source wrote it.
        assert (
            _words(content[start:end])
            == _words(citation["excerpt"])[-len(_words(content[start:end])) :]
        )


def test_the_interval_survives_a_reload_it_is_stored_not_searched(client, db_session):
    notebook_id = _notebook(client)
    chunks = (
        db_session.query(NotebookChunk)
        .join(NotebookSource, NotebookSource.id == NotebookChunk.source_id)
        .filter(NotebookSource.notebook_id == notebook_id)
        .order_by(NotebookChunk.ordinal)
        .all()
    )
    assert chunks and all(c.char_start is not None and c.char_end is not None for c in chunks)
    assert chunks[0].char_start == 0
    assert chunks[-1].char_end == len(TEXT.strip())


def test_a_citation_stored_without_a_position_reads_as_none_not_zero(client, db_session):
    notebook_id = _notebook(client)
    db_session.add(
        NotebookMessage(
            notebook_id=notebook_id,
            role="assistant",
            content={
                "paragraphs": [{"text": "Resposta antiga.", "citations": [1]}],
                "citations": [
                    {
                        "number": 1,
                        "chunk_id": 1,
                        "source_id": 1,
                        "source_title": "Aula 1",
                        "excerpt": "trecho antigo",
                    }
                ],
            },
        )
    )
    db_session.commit()

    messages = client.get(f"/api/notebooks/{notebook_id}/messages").json()
    citation = messages[-1]["answer"]["citations"][0]
    assert citation["char_start"] is None and citation["char_end"] is None


def test_a_passage_stored_before_the_positions_has_none_and_the_citation_says_none(
    client, db_session
):
    notebook_id = _notebook(client)
    db_session.query(NotebookChunk).update({"char_start": None, "char_end": None})
    db_session.commit()

    for citation in _ask(client, notebook_id)["citations"]:
        assert citation["char_start"] is None and citation["char_end"] is None


# --- Duplicar com conversa -----------------------------------------------------------


def _ready_artifact(client, notebook_id: int) -> dict:
    response = client.post(f"/api/notebooks/{notebook_id}/studio", json={"tool": "report"})
    assert response.status_code == 202, response.text
    return client.get(f"/api/notebooks/{notebook_id}/studio/{response.json()['id']}").json()


def _copy_with_chat(client, notebook_id: int) -> dict:
    response = client.post(
        f"/api/notebooks/{notebook_id}/duplicate", params={"with_conversation": "true"}
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_duplicate_with_conversation_carries_the_chat_and_points_it_at_the_copy(client, db_session):
    notebook_id = _notebook(client)
    original_source = client.get(f"/api/notebooks/{notebook_id}").json()["sources"][0]["id"]
    original_chunk_ids = {
        c.id
        for c in db_session.query(NotebookChunk).filter(NotebookChunk.source_id == original_source)
    }
    answer = _ask(client, notebook_id)
    assert answer["citations"]

    copy = _copy_with_chat(client, notebook_id)

    copy_source = copy["sources"][0]["id"]
    assert copy_source != original_source
    messages = client.get(f"/api/notebooks/{copy['id']}/messages").json()
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["text"] == "densidade do aço"
    cited = messages[1]["answer"]["citations"]
    assert [c["excerpt"] for c in cited] == [c["excerpt"] for c in answer["citations"]]
    copy_chunk_ids = {
        c.id for c in db_session.query(NotebookChunk).filter(NotebookChunk.source_id == copy_source)
    }
    for citation in cited:
        # Never the original's rows: deleting the original must not orphan the copy.
        assert citation["source_id"] == copy_source
        assert citation["chunk_id"] in copy_chunk_ids
        assert citation["chunk_id"] not in original_chunk_ids
    # The paragraphs still point at the same numbers.
    assert messages[1]["answer"]["paragraphs"] == [
        {"text": p["text"], "citations": p["citations"]} for p in answer["paragraphs"]
    ]


def test_the_cited_positions_travel_with_the_copied_passages(client):
    notebook_id = _notebook(client)
    answer = _ask(client, notebook_id)
    copy = _copy_with_chat(client, notebook_id)

    cited = client.get(f"/api/notebooks/{copy['id']}/messages").json()[1]["answer"]["citations"]
    assert [(c["char_start"], c["char_end"]) for c in cited] == [
        (c["char_start"], c["char_end"]) for c in answer["citations"]
    ]
    assert all(c["char_start"] is not None for c in cited)


def test_duplicate_with_conversation_carries_the_studio_without_spending_a_generation(client):
    notebook_id = _notebook(client)
    artifact = _ready_artifact(client, notebook_id)
    assert artifact["status"] == "pronto", artifact["error"]
    used = client.get(f"/api/notebooks/{notebook_id}/studio").json()["usage"]["used"]

    copy = _copy_with_chat(client, notebook_id)

    listing = client.get(f"/api/notebooks/{copy['id']}/studio").json()
    assert [a["title"] for a in listing["artifacts"]] == [artifact["title"]]
    # The copy is a copy: no generation was spent, in either notebook.
    assert listing["usage"]["used"] == used
    copied = client.get(
        f"/api/notebooks/{copy['id']}/studio/{listing['artifacts'][0]['id']}"
    ).json()
    assert copied["status"] == "pronto"
    assert copied["id"] != artifact["id"]
    copy_source = copy["sources"][0]["id"]
    assert {c["source_id"] for c in copied["citations"]} == {copy_source}
    assert [c["excerpt"] for c in copied["citations"]] == [
        c["excerpt"] for c in artifact["citations"]
    ]
    assert copied["content"] == artifact["content"]


def test_only_finished_artifacts_are_copied(client, db_session):
    notebook_id = _notebook(client)
    for status in ("gerando", "falhou"):
        db_session.add(
            StudioArtifact(
                notebook_id=notebook_id,
                tool="report",
                title=f"Em estado {status}",
                status=status,
            )
        )
    db_session.commit()
    done = _ready_artifact(client, notebook_id)

    copy = _copy_with_chat(client, notebook_id)

    titles = [
        a["title"] for a in client.get(f"/api/notebooks/{copy['id']}/studio").json()["artifacts"]
    ]
    assert titles == [done["title"]]


def test_notes_keep_their_citations_in_the_copy_with_conversation(client, db_session):
    notebook_id = _notebook(client)
    answer = _ask(client, notebook_id)
    db_session.add(
        NotebookNote(
            notebook_id=notebook_id,
            title="Resposta salva",
            body="texto",
            origin="chat",
            citations=answer["citations"],
        )
    )
    db_session.commit()

    plain = client.post(f"/api/notebooks/{notebook_id}/duplicate").json()
    with_chat = _copy_with_chat(client, notebook_id)

    assert plain["notes"][0]["citations"] is None
    note = with_chat["notes"][0]
    assert note["citations"] and note["citations"][0]["source_id"] == with_chat["sources"][0]["id"]


def test_a_citation_whose_source_left_the_notebook_does_not_borrow_another_row(client, db_session):
    notebook_id = _notebook(client)
    first_source = client.get(f"/api/notebooks/{notebook_id}").json()["sources"][0]["id"]
    _ask(client, notebook_id)
    other = client.post(
        f"/api/notebooks/{notebook_id}/sources/text",
        json={"title": "Aula 2", "text": "Texto novo sobre cobre e sua condutividade elétrica."},
    ).json()
    client.delete(f"/api/notebooks/{notebook_id}/sources/{first_source}")

    copy = _copy_with_chat(client, notebook_id)

    citations = client.get(f"/api/notebooks/{copy['id']}/messages").json()[1]["answer"]["citations"]
    live = {s["id"] for s in copy["sources"]}
    assert other["id"] not in live  # a new row, not the original's
    for citation in citations:
        # Dangling stays dangling (the screen says the source is gone); it is never
        # re-pointed at a row that merely has the same id in the copy.
        assert citation["source_id"] not in live
        assert citation["source_id"] == 0
        assert citation["chunk_id"] == 0


def test_the_copy_is_independent_of_the_original(client):
    notebook_id = _notebook(client)
    _ask(client, notebook_id)
    copy = _copy_with_chat(client, notebook_id)

    client.delete(f"/api/notebooks/{notebook_id}")

    assert len(client.get(f"/api/notebooks/{copy['id']}/messages").json()) == 2
    detail = client.get(f"/api/notebooks/{copy['id']}").json()
    assert detail["sources"] and detail["title"].startswith("Cópia de")


def test_without_the_option_the_copy_is_what_it_was_in_d218(client):
    notebook_id = _notebook(client)
    _ask(client, notebook_id)
    _ready_artifact(client, notebook_id)

    copy = client.post(f"/api/notebooks/{notebook_id}/duplicate").json()

    assert client.get(f"/api/notebooks/{copy['id']}/messages").json() == []
    assert client.get(f"/api/notebooks/{copy['id']}/studio").json()["artifacts"] == []


def test_duplicate_with_conversation_of_a_stranger_is_404(client, login_as, other_user):
    with login_as(other_user):
        theirs = _notebook(client, "Do Bruno")
    response = client.post(
        f"/api/notebooks/{theirs}/duplicate", params={"with_conversation": "true"}
    )
    assert response.status_code == 404


def test_the_duplicate_is_the_owners_and_leaves_no_rows_in_other_notebooks(client, db_session):
    notebook_id = _notebook(client)
    _ask(client, notebook_id)
    before = db_session.query(NotebookMessage).count()
    copy = _copy_with_chat(client, notebook_id)
    assert db_session.query(NotebookMessage).count() == before + 2
    owner = db_session.get(Notebook, copy["id"]).owner_id
    assert owner == db_session.get(Notebook, notebook_id).owner_id
    assert (
        db_session.query(NotebookNote).filter(NotebookNote.notebook_id == copy["id"]).count() == 0
    )


# --- Arquivar em lote ------------------------------------------------------------------


def _batch(client, ids, archived=True):
    return client.post("/api/notebooks/batch-archive", json={"ids": ids, "archived": archived})


def test_several_notebooks_are_archived_in_one_call_and_brought_back_in_another(client):
    a = _notebook(client, "A")
    b = _notebook(client, "B")
    c = _notebook(client, "C")

    response = _batch(client, [a, b])

    assert response.status_code == 200, response.text
    assert sorted(n["id"] for n in response.json()) == sorted([a, b])
    assert all(n["archived"] for n in response.json())
    assert [n["id"] for n in client.get("/api/notebooks").json()] == [c]
    archived = client.get("/api/notebooks", params={"archived": "true"}).json()
    assert {n["id"] for n in archived} == {a, b}

    back = _batch(client, [a, b], archived=False)
    assert back.status_code == 200
    assert not any(n["archived"] for n in back.json())
    assert {n["id"] for n in client.get("/api/notebooks").json()} == {a, b, c}


def test_archiving_in_batch_is_all_or_nothing(client, login_as, other_user):
    mine = _notebook(client, "Meu")
    with login_as(other_user):
        theirs = _notebook(client, "Do Bruno")

    response = _batch(client, [mine, theirs])

    assert response.status_code == 404
    # The 404 does not say whether the stranger's notebook exists, and mine did not move.
    assert client.get(f"/api/notebooks/{mine}").json()["archived"] is False
    with login_as(other_user):
        assert client.get(f"/api/notebooks/{theirs}").json()["archived"] is False


def test_a_missing_notebook_refuses_the_whole_batch(client):
    mine = _notebook(client, "Meu")
    assert _batch(client, [mine, 999_999]).status_code == 404
    assert client.get(f"/api/notebooks/{mine}").json()["archived"] is False


def test_archiving_in_batch_is_idempotent_and_keeps_the_first_archive_time(client, db_session):
    a = _notebook(client, "A")
    _batch(client, [a])
    first = db_session.get(Notebook, a).archived_at
    db_session.expire_all()

    again = _batch(client, [a])

    assert again.status_code == 200
    db_session.expire_all()
    assert db_session.get(Notebook, a).archived_at == first


def test_the_batch_needs_between_one_and_a_hundred_distinct_ids(client):
    assert _batch(client, []).status_code == 422
    assert _batch(client, list(range(1, 102))).status_code == 422
    # Repeated ids count once.
    a = _notebook(client, "A")
    assert _batch(client, [a, a, a]).status_code == 200


def test_the_batch_changes_nothing_but_the_archive_flag(client):
    a = _notebook(client, "Aços")
    _ask(client, a)
    _batch(client, [a])
    detail = client.get(f"/api/notebooks/{a}").json()
    assert detail["title"] == "Aços" and len(detail["sources"]) == 1
    assert len(client.get(f"/api/notebooks/{a}/messages").json()) == 2


def test_the_batch_route_does_not_shadow_a_notebook_called_batch_archive(client):
    # `/batch-archive` is a literal path next to `/{notebook_id}`; a GET of it is not a notebook.
    assert client.get("/api/notebooks/batch-archive").status_code in (404, 405, 422)


def test_the_batch_needs_login(anon_client):
    assert (
        anon_client.post("/api/notebooks/batch-archive", json={"ids": [1], "archived": True})
    ).status_code == 401
