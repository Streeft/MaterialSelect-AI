"""A document says when a number is not a catalogue number (P1-4).

An own record's values satisfy principle 1 — they were explicitly registered,
by the person who registered them — but they never went through the source and
licence review M1 imposes on the shared catalogue. A report where the two read
alike would be the single place in the product where that distinction is lost,
and it is the place it matters most: the file is what leaves the tool.

The shape of the answer is borrowed wholesale from how demonstration data is
already declared (a notice at the top, a column in the sheet), because a reader
who has learnt to look for one will find the other in the same place.
"""

from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.exporters.report import DEMO_DATA_NOTICE, OWN_RECORD_NOTICE
from app.models.material_class import MaterialClass


def _own_record(client: TestClient, db_session: Session, name: str = "Liga exportável") -> int:
    class_id = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
        .id
    )
    response = client.post(
        "/api/materials",
        json={
            "name": name,
            "class_id": class_id,
            "is_own_record": True,
            "values": [
                {
                    "property_slug": "densidade",
                    "kind": "scalar",
                    "value": 2700.0,
                    "unit": "kg/m**3",
                },
                {
                    "property_slug": "modulo_young",
                    "kind": "scalar",
                    "value": 70.0,
                    "unit": "GPa",
                },
            ],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_the_catalogue_export_declares_the_own_record_at_the_top(
    client: TestClient, db_session: Session
) -> None:
    _own_record(client, db_session)

    text = client.get("/api/exports/catalogo.csv").text

    assert OWN_RECORD_NOTICE in text


def test_a_catalogue_with_no_own_record_carries_no_such_notice(client: TestClient) -> None:
    """The notice is a fact about this document, not boilerplate. Printing it
    always would teach readers to skip it."""
    text = client.get("/api/exports/catalogo.csv").text

    assert OWN_RECORD_NOTICE not in text


def test_the_catalogue_export_marks_the_row_itself(client: TestClient, db_session: Session) -> None:
    """The notice says the document contains one; the column says which."""
    _own_record(client, db_session, name="Liga marcada")

    text = client.get("/api/exports/catalogo.csv").text

    assert "Registro próprio" in text
    row = next(line for line in text.splitlines() if line.startswith("Liga marcada"))
    # The spreadsheet renderer writes booleans in Portuguese, like every other
    # boolean column in the file — the mark has to read the same as the demo
    # one beside it, or a reader parses two conventions in one row.
    assert row.split(",")[3].strip() == "sim"


def test_a_shared_catalogue_row_is_not_marked(client: TestClient, db_session: Session) -> None:
    """The other half of the column: a mark that is always on marks nothing."""
    class_id = (
        db_session.execute(select(MaterialClass).where(MaterialClass.slug == "metais"))
        .scalars()
        .one()
        .id
    )
    client.post(
        "/api/materials",
        json={"name": "Liga partilhada", "class_id": class_id, "values": []},
    )

    text = client.get("/api/exports/catalogo.csv").text

    row = next(line for line in text.splitlines() if line.startswith("Liga partilhada"))
    assert row.split(",")[3].strip() == "não"


def test_the_demo_warning_still_comes_first(client: TestClient, db_session: Session) -> None:
    """Order is the argument: fictitious is worse than unreviewed, and a reader
    who stops after one line must stop on the worse one."""
    _own_record(client, db_session)

    text = client.get("/api/exports/catalogo.csv").text

    assert text.index(DEMO_DATA_NOTICE) < text.index(OWN_RECORD_NOTICE)


def _study_over_own_record(client: TestClient) -> int:
    response = client.post(
        "/api/selection/studies",
        json={
            "name": "Estudo com registro próprio",
            "free_variables": [],
            "combinator": "AND",
            "constraints": [
                {"operator": "gt", "property_slug": "modulo_young", "value": 1.0, "unit": "GPa"}
            ],
            "normalization": "minmax",
            "criteria": [{"key": "densidade", "weight": 1.0}],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_a_study_report_declares_an_own_record_among_its_candidates(
    client: TestClient, db_session: Session
) -> None:
    _own_record(client, db_session, name="Liga candidata")
    study_id = _study_over_own_record(client)

    text = client.get(f"/api/exports/estudos/{study_id}.csv").text

    assert "Liga candidata" in text, "o registro próprio precisa ser candidato para a prova valer"
    assert OWN_RECORD_NOTICE in text


def test_the_laudo_declares_it_too(client: TestClient, db_session: Session) -> None:
    """The laudo is the document meant to be attached on its own, so it is the
    last place the distinction may go missing."""
    _own_record(client, db_session, name="Liga do laudo")
    study_id = _study_over_own_record(client)

    text = client.get(f"/api/exports/estudos/{study_id}/laudo.html").text

    assert OWN_RECORD_NOTICE in text


def test_the_provenance_sheet_names_the_origin_of_every_number(
    client: TestClient, db_session: Session
) -> None:
    """Where an auditor checks one value at a time — so per row, not per
    document. Same obligation D-59 imposed for the shape of a value: the rule
    has to reach the reader.
    """
    _own_record(client, db_session, name="Liga rastreada")
    study_id = _study_over_own_record(client)

    text = client.get(f"/api/exports/estudos/{study_id}.csv").text
    provenance = text.split("Proveniência")[-1]

    assert "Registro" in provenance
    own_rows = [line for line in provenance.splitlines() if line.startswith("Liga rastreada")]
    assert own_rows, "o registro próprio precisa aparecer na folha de proveniência"
    assert all(line.rstrip().endswith("Próprio") for line in own_rows)


def test_a_catalogue_row_is_traced_as_catalogue(client: TestClient, db_session: Session) -> None:
    _own_record(client, db_session, name="Liga vizinha")
    study_id = _study_over_own_record(client)

    text = client.get(f"/api/exports/estudos/{study_id}.csv").text
    provenance = text.split("Proveniência")[-1]

    catalogue_rows = [
        line
        for line in provenance.splitlines()
        if line and not line.startswith("Liga vizinha") and line.rstrip().endswith("Catálogo")
    ]
    assert catalogue_rows, "o catálogo semeado precisa aparecer para o contraste existir"


def test_another_persons_own_record_never_reaches_the_document(
    client: TestClient, login_as, db_session: Session, other_user
) -> None:
    """The export runs with the viewer the route resolved, so it sees exactly
    what its reader sees — asserted here because a file is the one artefact
    that outlives the session that made it."""
    with login_as(other_user):
        _own_record(client, db_session, name="Liga alheia ao relatório")

    text = client.get("/api/exports/catalogo.csv").text

    assert "Liga alheia ao relatório" not in text
    assert OWN_RECORD_NOTICE not in text
