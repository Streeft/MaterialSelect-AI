"""A taxonomy folder read as a **record** rather than a label (P1-4).

A folder used to be a name, a slug and a parent. The browse step of the method
asks two things a label cannot answer — "what *is* this family, and where is it
used?" and "where am I in the tree?" — and this is the endpoint that answers
both, in each of the two universes.

Every test here is about one of three ways the answer can be wrong: prose that
is silently dropped between the payload and the database, a breadcrumb that
includes the page you are already on or loses a level, and a count that makes a
branch look empty when its contents are one level down.
"""

from __future__ import annotations

import pytest

from app.models.material import Material
from app.models.material_class import MaterialClass
from app.models.process import Process, ProcessClass

NS = "familia"


@pytest.fixture()
def tree(db_session) -> None:
    """A three-level material taxonomy with materials at two depths.

        familia-metais ── familia-ferrosos ── familia-acos → "Aço de família"
                       └─ "Metal solto de família"

    ``familia-ferrosos`` is a **pure branch**: nothing is filed directly in it,
    and everything it holds is one level further down. It is the case that tells
    a direct count from a subtree total, so it is the case the tree needs.
    """
    metais = MaterialClass(
        name="Metais de família",
        slug=f"{NS}-metais",
        description="Raiz de teste.",
        applications="Estruturas e componentes de máquina.",
        characteristics="Condutores, dúcteis, módulo alto.",
    )
    db_session.add(metais)
    db_session.flush()

    ferrosos = MaterialClass(name="Ferrosos de família", slug=f"{NS}-ferrosos", parent_id=metais.id)
    db_session.add(ferrosos)
    db_session.flush()

    acos = MaterialClass(name="Aços de família", slug=f"{NS}-acos", parent_id=ferrosos.id)
    db_session.add(acos)
    db_session.flush()

    db_session.add_all(
        [
            Material(name="Aço de família", class_id=acos.id, is_demo=True),
            Material(name="Metal solto de família", class_id=metais.id, is_demo=True),
        ]
    )
    db_session.flush()


@pytest.fixture()
def process_tree(db_session) -> None:
    """The same shape in the other universe, so both are asserted on equally."""
    conformacao = ProcessClass(
        name="Conformação de família",
        slug=f"{NS}-conformacao",
        applications="Peças em série a partir de matéria-prima bruta.",
        characteristics="Dá a forma; não remove material.",
    )
    db_session.add(conformacao)
    db_session.flush()

    liquido = ProcessClass(
        name="Estado líquido de família", slug=f"{NS}-liquido", parent_id=conformacao.id
    )
    db_session.add(liquido)
    db_session.flush()

    db_session.add_all(
        [
            Process(name="Fundição de família", slug=f"{NS}-fundicao", class_id=liquido.id),
            # Withdrawn: it must not be offered in the folder, for the same
            # reason a stage refuses it.
            Process(
                name="Processo retirado de família",
                slug=f"{NS}-retirado",
                class_id=liquido.id,
                is_active=False,
            ),
        ]
    )
    db_session.flush()


# --- the record -------------------------------------------------------------


def test_a_family_carries_its_own_prose(client, tree) -> None:
    """The whole point of the record: a folder that says what it is."""
    resp = client.get(f"/api/classes/{NS}-metais")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["applications"] == "Estruturas e componentes de máquina."
    assert body["characteristics"] == "Condutores, dúcteis, módulo alto."


def test_a_family_nobody_wrote_about_says_nothing_rather_than_empty_strings(client, tree) -> None:
    """NULL means "ninguém escreveu", and it has to survive as NULL all the way
    out — an empty string would let the interface render a blank panel that
    reads as "this family has no applications", which is a different claim."""
    body = client.get(f"/api/classes/{NS}-ferrosos").json()

    assert body["applications"] is None
    assert body["characteristics"] is None


def test_the_list_does_not_carry_the_prose(client, tree) -> None:
    """The list draws a picker and a tree. Attaching two paragraphs per class to
    it would send the editorial text of the whole taxonomy to render a
    dropdown — the same reason ProcessDetailOut is separate from ProcessOut."""
    row = next(c for c in client.get("/api/classes").json() if c["slug"] == f"{NS}-metais")

    assert "applications" not in row
    assert "characteristics" not in row


def test_the_prose_round_trips_through_the_editor(client) -> None:
    """Sent, stored, read back. A field the payload accepts and the service drops
    is the exact shape of a "why did my edit not save" bug."""
    created = client.post(
        "/api/classes",
        json={
            "name": "Família editável",
            "applications": "Onde se usa.",
            "characteristics": "O que caracteriza.",
        },
    )
    assert created.status_code == 201, created.text
    class_id = created.json()["id"]
    slug = created.json()["slug"]

    assert client.get(f"/api/classes/{slug}").json()["applications"] == "Onde se usa."

    updated = client.put(
        f"/api/classes/{class_id}",
        json={"name": "Família editável", "applications": "Outro uso.", "characteristics": None},
    )
    assert updated.status_code == 200, updated.text

    body = client.get(f"/api/classes/{slug}").json()
    assert body["applications"] == "Outro uso."
    # Cleared, not left behind: None means the editor emptied the field.
    assert body["characteristics"] is None


def test_editing_the_prose_reaches_the_audit_trail(client) -> None:
    """Family text is part of the record, so M2 has to be able to answer for a
    change to it — a field outside the snapshot changes with no trace."""
    created = client.post("/api/classes", json={"name": "Família auditada"})
    class_id = created.json()["id"]
    client.put(
        f"/api/classes/{class_id}",
        json={"name": "Família auditada", "applications": "Uso novo."},
    )

    events = client.get("/api/audit").json()
    changed = [e for e in events if e["entity_id"] == class_id and e["action"] == "ATUALIZADO"]
    assert changed, events
    assert any("applications" in (e.get("changes") or {}) for e in changed)


# --- the breadcrumb ---------------------------------------------------------


def test_the_breadcrumb_is_root_to_parent_and_excludes_the_folder_itself(client, tree) -> None:
    """The page the reader is on is not a link back to itself."""
    body = client.get(f"/api/classes/{NS}-acos").json()

    assert [a["slug"] for a in body["ancestors"]] == [f"{NS}-metais", f"{NS}-ferrosos"]
    assert [a["name"] for a in body["ancestors"]] == [
        "Metais de família",
        "Ferrosos de família",
    ]


def test_a_root_folder_has_an_empty_breadcrumb(client, tree) -> None:
    assert client.get(f"/api/classes/{NS}-metais").json()["ancestors"] == []


def test_the_children_are_the_direct_subfolders_only(client, tree) -> None:
    """Grandchildren belong to the child's own page — listing them here would
    flatten the tree the browse step exists to let the reader walk."""
    body = client.get(f"/api/classes/{NS}-metais").json()

    assert [c["slug"] for c in body["children"]] == [f"{NS}-ferrosos"]


# --- the counts -------------------------------------------------------------


def test_a_pure_branch_is_told_apart_from_an_empty_one(client, tree) -> None:
    """``familia-ferrosos`` holds nothing directly and one material below it.

    The direct count is what says "this folder is empty"; without the subtree
    total a reader could not tell that from "there is nothing under here at
    all", and would have no reason to open it.
    """
    body = client.get(f"/api/classes/{NS}-ferrosos").json()

    assert body["material_count"] == 0
    assert body["descendant_material_count"] == 1


def test_the_subtree_total_counts_the_folder_itself_too(client, tree) -> None:
    """One material directly in `metais`, one two levels below it."""
    body = client.get(f"/api/classes/{NS}-metais").json()

    assert body["material_count"] == 1
    assert body["descendant_material_count"] == 2


def test_an_unknown_slug_is_a_404_naming_it(client, tree) -> None:
    resp = client.get("/api/classes/nao-existe")

    assert resp.status_code == 404, resp.text
    assert "nao-existe" in resp.json()["detail"]


# --- the other universe -----------------------------------------------------


def test_a_process_family_is_a_record_too(client, process_tree) -> None:
    """D-57's symmetry: a process family that could not be browsed while a
    material class could would be exactly what that decision avoided."""
    body = client.get(f"/api/processes/classes/{NS}-conformacao").json()

    assert body["applications"] == "Peças em série a partir de matéria-prima bruta."
    assert body["characteristics"] == "Dá a forma; não remove material."
    assert [c["slug"] for c in body["children"]] == [f"{NS}-liquido"]
    assert body["process_count"] == 0
    assert body["descendant_process_count"] == 1


def test_a_withdrawn_process_is_counted_by_nobody(client, process_tree) -> None:
    """The count and the list have to agree, and they did not before P1-4.

    ``familia-liquido`` holds one live process and one withdrawn one. The folder
    count used to include the withdrawn one while every list excluded it, so this
    folder would have reported two processes and handed back one — invisible
    while nothing put both on the same screen, which the family record does.
    It was wrong for the stage picker too: a folder whose only process is
    withdrawn admits nobody, which is what "is this folder empty" asks.
    """
    body = client.get(f"/api/processes/classes/{NS}-liquido").json()

    assert body["process_count"] == 1
    assert len(body["processes"]) == 1

    listed = next(
        c for c in client.get("/api/processes/classes").json() if c["slug"] == f"{NS}-liquido"
    )
    assert listed["process_count"] == 1


def test_an_empty_folder_survives_the_active_filter(client, process_tree) -> None:
    """The filter is in the ON clause, not a WHERE: moved to WHERE it would turn
    the outer join into an inner one and drop every empty folder from the
    taxonomy — including every pure branch the tree is built from."""
    slugs = {c["slug"] for c in client.get("/api/processes/classes").json()}

    # `familia-conformacao` holds no process directly and must still be listed.
    assert f"{NS}-conformacao" in slugs


def test_a_process_family_carries_its_own_processes(client, process_tree) -> None:
    """Unlike the material side, nothing else lists the processes of one folder,
    so the record carries them — and a withdrawn process is not among them."""
    body = client.get(f"/api/processes/classes/{NS}-liquido").json()

    names = [p["name"] for p in body["processes"]]
    assert names == ["Fundição de família"]
    assert "Processo retirado de família" not in names


def test_the_process_breadcrumb_walks_the_process_taxonomy(client, process_tree) -> None:
    body = client.get(f"/api/processes/classes/{NS}-liquido").json()

    assert [a["slug"] for a in body["ancestors"]] == [f"{NS}-conformacao"]


def test_an_unknown_process_family_is_a_404_naming_it(client, process_tree) -> None:
    resp = client.get("/api/processes/classes/nao-existe")

    assert resp.status_code == 404, resp.text
    assert "nao-existe" in resp.json()["detail"]


def test_the_folder_route_is_not_read_as_a_process_slug(client, process_tree) -> None:
    """`/processes/classes/x` and `/processes/x` are different namespaces, and
    the path segment is what separates them — declaration order in the router is
    what keeps that true."""
    resp = client.get(f"/api/processes/classes/{NS}-conformacao")

    assert resp.status_code == 200, resp.text
    # A folder, not a process: a process payload has no `children`.
    assert "children" in resp.json()
