"""Cadernos, D-235 (F7): ready-made notebooks and notes in the student's order."""

from __future__ import annotations

from app.domain.notebook_templates import NOTEBOOK_TEMPLATES


def test_the_gallery_lists_every_template_with_its_notes_titles(client):
    listing = client.get("/api/notebooks/templates").json()
    assert [t["id"] for t in listing] == [t.id for t in NOTEBOOK_TEMPLATES]
    tcc = next(t for t in listing if t["id"] == "tcc")
    assert tcc["note_titles"] == ["Pergunta de pesquisa", "Revisão da literatura", "Método"]


def test_a_template_names_the_notebook_sets_the_chat_and_writes_only_structure(client):
    created = client.post("/api/notebooks", json={"template": "prova"})
    assert created.status_code == 201, created.text
    notebook = created.json()
    assert notebook["title"] == "Revisão para prova"
    assert notebook["emoji"] == "📝"
    assert notebook["chat_goal"] == "personalizado"
    assert "revisão para prova" in notebook["chat_instructions"]
    assert [n["title"] for n in notebook["notes"]] == [
        "O que cai na prova",
        "Definições e fórmulas",
    ]
    # No source, no passage: the notebook still answers only from what the student adds.
    assert notebook["sources"] == []
    for note in notebook["notes"]:
        assert not any(ch.isdigit() for ch in note["body"])


def test_a_title_sent_with_the_template_wins(client):
    notebook = client.post(
        "/api/notebooks", json={"template": "disciplina", "title": "Materiais I — 2026"}
    ).json()
    assert notebook["title"] == "Materiais I — 2026"
    assert notebook["emoji"] == "🧱"


def test_an_unknown_template_is_refused(client):
    assert client.post("/api/notebooks", json={"template": "inventado"}).status_code == 422


def test_notes_keep_the_order_the_student_gives_them(client):
    notebook = client.post("/api/notebooks", json={"template": "tcc"}).json()
    nid = notebook["id"]
    ids = [n["id"] for n in notebook["notes"]]
    added = client.post(f"/api/notebooks/{nid}/notes", json={"title": "Cronograma"}).json()
    # A new note goes at the end.
    after_add = client.get(f"/api/notebooks/{nid}").json()["notes"]
    assert [n["id"] for n in after_add] == [*ids, added["id"]]

    new_order = [added["id"], ids[2], ids[0], ids[1]]
    response = client.put(f"/api/notebooks/{nid}/notes/order", json={"ids": new_order})
    assert response.status_code == 200, response.text
    assert [n["id"] for n in response.json()] == new_order
    assert [n["id"] for n in client.get(f"/api/notebooks/{nid}").json()["notes"]] == new_order

    # The copy keeps the order too.
    copy = client.post(f"/api/notebooks/{nid}/duplicate").json()
    assert [n["title"] for n in copy["notes"]] == [
        "Cronograma",
        "Método",
        "Pergunta de pesquisa",
        "Revisão da literatura",
    ]


def test_an_order_that_misses_or_repeats_a_note_is_refused(client):
    notebook = client.post("/api/notebooks", json={"template": "tcc"}).json()
    nid = notebook["id"]
    ids = [n["id"] for n in notebook["notes"]]
    assert client.put(f"/api/notebooks/{nid}/notes/order", json={"ids": ids[:2]}).status_code == 400
    assert (
        client.put(
            f"/api/notebooks/{nid}/notes/order", json={"ids": [ids[0], ids[0], ids[1]]}
        ).status_code
        == 400
    )
    assert (
        client.put(f"/api/notebooks/{nid}/notes/order", json={"ids": [*ids, 999999]}).status_code
        == 400
    )
