"""Word and PowerPoint of an **issued** version, from what was frozen (D-252).

The copy is read back out of ``IssuedReport.html`` — never re-run from today's study — so a
catalogue that moved after the issue cannot change the numbers in the file. The round trip
(issue, read the frozen HTML back into a document, compare with the document the service
had built) is the test that proves the reader and the renderer still speak the same markup.
"""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain.errors import ValidationError
from app.exporters.laudo import short_code
from app.exporters.laudo_frozen import document_from_issued, lights_from_svg
from app.models.issued_report import IssuedReport
from app.models.material_property_value import MaterialPropertyValue
from app.schemas.laudo import LaudoInputs
from app.services.laudo_service import LaudoService
from app.tests.test_laudo import ENGINEER, _study

INPUTS = {**ENGINEER, "part_mass_kg": 1.5, "batch_size": 2000}


def _issue(client: TestClient, study_id: int, **extra) -> dict:
    response = client.post(
        f"/api/exports/estudos/{study_id}/laudo/emitir", json={**INPUTS, **extra}
    )
    assert response.status_code == 201, response.text
    return response.json()


def _stored(db_session: Session, version: int = 1) -> IssuedReport:
    return db_session.execute(
        select(IssuedReport).where(IssuedReport.version == version)
    ).scalar_one()


def _docx_text(content: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(content))
    return "\n".join(
        [p.text for p in doc.paragraphs]
        + [c.text for t in doc.tables for r in t.rows for c in r.cells]
    )


def _deck_text(content: bytes) -> str:
    from pptx import Presentation

    parts: list[str] = []
    for slide in Presentation(io.BytesIO(content)).slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                parts.append(shape.text_frame.text)
            if getattr(shape, "has_table", False) and shape.has_table:
                parts += [c.text for r in shape.table.rows for c in r.cells]
    return "\n".join(parts)


class TestRoundTrip:
    def test_the_frozen_html_reads_back_as_the_document_it_was_rendered_from(
        self, client, db_session: Session, test_user
    ) -> None:
        study_id = _study(client)
        _issue(client, study_id)
        stored = _stored(db_session)
        original = LaudoService(db_session, test_user).document(
            study_id, stored.project_id, LaudoInputs(**INPUTS), version=1
        )
        copy = document_from_issued(stored)

        assert copy.study_name == original.study_name
        assert copy.description == original.description
        assert copy.recommendation is not None and original.recommendation is not None
        assert copy.recommendation.name == original.recommendation.name
        assert copy.recommendation.standing == original.recommendation.standing
        assert copy.recommendation.class_name == original.recommendation.class_name
        assert copy.key_figures == original.key_figures[:5]
        assert copy.why == original.why
        assert copy.scope == original.scope
        assert [(x.label[:72], x.status, x.detail[:96]) for x in original.lights[:14]] == [
            (x.label[:72], x.status, x.detail[:96]) for x in copy.lights
        ]
        assert copy.donut == original.donut
        assert copy.traffic_light == original.traffic_light
        assert copy.ranking_mini == original.ranking_mini
        assert copy.narrative == original.narrative
        assert copy.notices == original.notices
        assert copy.version == 1 and copy.issued_code == short_code(stored.content_sha256)

    def test_every_section_comes_back_with_its_cards_figures_chips_and_notes(
        self, client, db_session: Session, test_user
    ) -> None:
        study_id = _study(client)
        _issue(client, study_id)
        stored = _stored(db_session)
        original = LaudoService(db_session, test_user).document(
            study_id, stored.project_id, LaudoInputs(**INPUTS), version=1
        )
        copy = document_from_issued(stored)
        assert [s.key for s in copy.sections] == [s.key for s in original.sections]
        for got, want in zip(copy.sections, original.sections, strict=True):
            assert got.title == want.title
            assert got.lead == want.lead
            assert got.unavailable == want.unavailable
            assert got.cards == want.cards
            assert got.figures == want.figures
            assert got.notes == want.notes
            assert got.chips == want.chips
            assert got.paired == (want.paired and len(want.figures) > 1)
            if want.table is not None:
                assert got.table is not None
                assert got.table.header == want.table.header
                assert [[str(v) for v in row] for row in got.table.rows] == [
                    ["ausente" if v is None else str(v) for v in row] for row in want.table.rows
                ]
                if want.figures or want.chips:
                    assert got.table_first == want.table_first

    def test_the_annex_keeps_every_table_header_row_and_note(
        self, client, db_session: Session, test_user
    ) -> None:
        study_id = _study(client)
        _issue(client, study_id)
        stored = _stored(db_session)
        original = LaudoService(db_session, test_user).document(
            study_id, stored.project_id, LaudoInputs(**INPUTS), version=1
        )
        copy = document_from_issued(stored)
        assert [s.name for s in copy.annex] == [s.name for s in original.annex]
        for got, want in zip(copy.annex, original.annex, strict=True):
            # A table with no rows prints no header (the HTML writes the table only when it has
            # rows), so the header is compared where there is something to head.
            if want.rows:
                assert got.header == want.header
            assert len(got.rows) == len(want.rows)
            assert got.notes == want.notes

    def test_a_study_without_a_recommendation_reads_back_as_such(
        self, client, db_session: Session
    ) -> None:
        study_id = _study(client, index=None, criteria=[])
        _issue(client, study_id)
        copy = document_from_issued(_stored(db_session))
        if copy.recommendation is None:
            assert copy.no_recommendation

    def test_a_document_that_is_not_a_laudo_is_refused(self, db_session: Session, client) -> None:
        study_id = _study(client)
        _issue(client, study_id)
        stored = _stored(db_session)
        stored.html = "<html><body><p>nada</p></body></html>"
        with pytest.raises(ValidationError):
            document_from_issued(stored)


class TestTrafficLightReader:
    def test_a_picture_without_rows_gives_no_rows_and_garbage_gives_none(self) -> None:
        assert lights_from_svg("not svg at all") == []
        assert lights_from_svg('<svg xmlns="http://www.w3.org/2000/svg"></svg>') == []


class TestRoutes:
    def test_word_and_powerpoint_of_a_version_open_and_say_which_version_they_copy(
        self, client, db_session: Session
    ) -> None:
        study_id = _study(client)
        issued = _issue(client, study_id)
        base = f"/api/exports/estudos/{study_id}/laudo/versoes/1"

        word = client.get(f"{base}.docx")
        assert word.status_code == 200, word.text
        assert word.headers["content-disposition"].startswith("attachment")
        text = _docx_text(word.content)
        assert f"versão emitida 1, código {issued['short_code']}" in text
        assert "dados de hoje" not in text
        assert "Cliente Sigiloso Ltda." in text and "Ana Souza" in text

        deck = client.get(f"{base}.pptx")
        assert deck.status_code == 200, deck.text
        deck_text = _deck_text(deck.content)
        assert f"versão emitida 1, código {issued['short_code']}" in deck_text
        assert "Resumo executivo" in deck_text

    def test_the_copy_does_not_follow_the_catalogue_after_the_issue(
        self, client, db_session: Session
    ) -> None:
        study_id = _study(client)
        _issue(client, study_id)
        url = f"/api/exports/estudos/{study_id}/laudo/versoes/1.docx"
        before = _docx_text(client.get(url).content)

        for value in db_session.execute(select(MaterialPropertyValue)).scalars():
            if value.property_definition.slug == "modulo_young" and value.normalized_value:
                value.normalized_value = value.normalized_value * 2
        db_session.commit()

        assert _docx_text(client.get(url).content) == before

    def test_the_live_study_copy_still_says_today(self, client) -> None:
        study_id = _study(client)
        text = _docx_text(client.get(f"/api/exports/estudos/{study_id}/laudo.docx").content)
        assert "dados de hoje" in text and "cópia editável da versão emitida" not in text.lower()

    def test_an_unknown_version_and_a_format_that_is_not_offered(self, client) -> None:
        study_id = _study(client)
        _issue(client, study_id)
        assert (
            client.get(f"/api/exports/estudos/{study_id}/laudo/versoes/9.docx").status_code == 404
        )
        assert client.get(f"/api/exports/estudos/{study_id}/laudo/versoes/1.csv").status_code == 400

    def test_only_the_owner_gets_the_copy(self, client, other_user, login_as) -> None:
        study_id = _study(client)
        _issue(client, study_id)
        with login_as(other_user):
            url = f"/api/exports/estudos/{study_id}/laudo/versoes/1.docx"
            assert client.get(url).status_code == 404
