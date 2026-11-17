"""The signed PDF, the client link's life and the editable Word/PowerPoint laudo (D-243).

* **PDF**: only the owner, only real PDFs (magic bytes), bounded, hashed; a replacement
  keeps the previous upload in the history; the frozen HTML and its code never move.
* **E-mail**: the signed PDF goes attached in place of the ``.html`` (``smtplib`` replaced
  by a fake — no socket).
* **Link**: each send expires (``REPORT_LINK_TTL_DAYS``), the owner can revoke it, and a
  dead link answers 410 with a Portuguese page and none of the laudo; openings are counted
  without keeping anything about the visitor.
* **DOCX / PPTX**: they open with python-docx / python-pptx, carry the sections and the
  charts as pictures.
"""

# ruff: noqa: F811  (fixtures imported from test_laudo_email are used by name)

from __future__ import annotations

import hashlib
import io
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.exporters.laudo import short_code
from app.models.issued_report import IssuedReport
from app.models.issued_report_pdf import IssuedReportPdf
from app.models.report_delivery import ReportDelivery
from app.services import report_delivery_service
from app.tests.test_laudo import _study
from app.tests.test_laudo_email import (  # noqa: F401 - fixtures used by name
    FakeSMTP,  # noqa: F401
    _issue,
    _send,
    fake_smtp,
    fixed_token,
    smtp_settings,
)

PDF = b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"
PDF_B = b"%PDF-1.4\n% segunda versao, assinada com certificado\n%%EOF\n"
JSON = {"content-type": "application/pdf"}


def _upload(client, issued_id: int, data: bytes = PDF, name: str | None = "assinado.pdf"):
    params = {"nome": name} if name else {}
    return client.post(
        f"/api/exports/laudos/{issued_id}/pdf", content=data, headers=JSON, params=params
    )


def _link(client, token: str, suffix: str = "", **kwargs):
    return client.get(f"/api/laudos/enviados/{token}{suffix}", **kwargs)


# --- the signed PDF -----------------------------------------------------------


class TestSignedPdfUpload:
    def test_a_pdf_is_stored_with_its_hash_who_and_when(self, client, db_session: Session) -> None:
        issued = _issue(client)
        response = _upload(client, issued["id"])
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["sha256"] == hashlib.sha256(PDF).hexdigest()
        assert body["short_sha256"] == short_code(body["sha256"])
        assert body["size_bytes"] == len(PDF) and body["filename"] == "assinado.pdf"
        assert body["current"] is True and body["uploaded_by"] and body["uploaded_at"]
        stored = db_session.execute(select(IssuedReportPdf)).scalar_one()
        assert stored.content == PDF and stored.uploaded_by_id is not None

    def test_the_download_is_the_same_bytes(self, client) -> None:
        issued = _issue(client)
        _upload(client, issued["id"])
        response = client.get(f"/api/exports/laudos/{issued['id']}/pdf")
        assert response.status_code == 200 and response.content == PDF
        assert response.headers["content-type"] == "application/pdf"
        assert response.headers["content-disposition"].startswith("attachment;")
        assert response.headers["content-disposition"].endswith('-v1-assinado.pdf"')
        assert response.headers["content-security-policy"] == "default-src 'none'"

    @pytest.mark.parametrize(
        ("data", "fragment"),
        [
            (b"", "vazio"),
            (b"<html>nao sou pdf</html>", "não é um PDF"),
            (b"PK\x03\x04 um zip com nome .pdf", "não é um PDF"),
            (b" %PDF-1.4 com espaco antes", "não é um PDF"),
        ],
    )
    def test_what_is_not_a_pdf_is_refused_by_its_bytes(self, client, data, fragment) -> None:
        issued = _issue(client)
        response = _upload(client, issued["id"], data, name="laudo.pdf")
        assert response.status_code == 400, response.text
        assert fragment in response.json()["detail"]
        assert client.get(f"/api/exports/laudos/{issued['id']}/pdf").status_code == 404

    def test_the_name_proves_nothing(self, client) -> None:
        issued = _issue(client)
        assert (
            _upload(client, issued["id"], b"MZ\x90 executavel", name="laudo.pdf").status_code == 400
        )
        # A real PDF with a hostile or foreign name is stored under a clean label.
        body = _upload(client, issued["id"], PDF, name="..\\..\\etc/passwd").json()
        assert body["filename"] == "passwd.pdf"

    def test_a_file_over_the_limit_is_413_and_not_stored(
        self, client, monkeypatch, db_session: Session
    ) -> None:
        monkeypatch.setattr(settings, "signed_pdf_max_bytes", 1024)
        issued = _issue(client)
        big = b"%PDF-1.4\n" + b"x" * 2048
        response = _upload(client, issued["id"], big)
        assert response.status_code == 413, response.text
        assert "limite de" in response.json()["detail"] and "MB" in response.json()["detail"]
        assert db_session.execute(select(IssuedReportPdf)).first() is None
        # exactly at the limit still passes
        ok = b"%PDF-1.4\n" + b"y" * (1024 - 9)
        assert _upload(client, issued["id"], ok).status_code == 201

    def test_ten_megabytes_is_the_default_limit(self) -> None:
        assert settings.signed_pdf_max_bytes == 10 * 1024 * 1024

    def test_only_the_owner_uploads_lists_or_downloads(self, client, other_user, login_as) -> None:
        issued = _issue(client)
        _upload(client, issued["id"])
        with login_as(other_user):
            assert _upload(client, issued["id"], PDF_B).status_code == 404
            assert client.get(f"/api/exports/laudos/{issued['id']}/pdf").status_code == 404
            assert client.get(f"/api/exports/laudos/{issued['id']}/pdf/versoes").status_code == 404
            assert client.get(f"/api/exports/laudos/{issued['id']}/pdf/1").status_code == 404

    def test_an_id_that_is_not_an_issued_laudo_is_404(self, client) -> None:
        assert _upload(client, 987654).status_code == 404

    def test_a_replacement_keeps_the_previous_pdf_in_the_history(
        self, client, db_session: Session
    ) -> None:
        issued = _issue(client)
        first = _upload(client, issued["id"], PDF, name="a.pdf").json()
        second = _upload(client, issued["id"], PDF_B, name="b.pdf").json()
        assert first["id"] != second["id"]
        history = client.get(f"/api/exports/laudos/{issued['id']}/pdf/versoes").json()
        assert [h["filename"] for h in history] == ["b.pdf", "a.pdf"]
        assert [h["current"] for h in history] == [True, False]
        # current is the new one; the old one is still downloadable, byte for byte
        assert client.get(f"/api/exports/laudos/{issued['id']}/pdf").content == PDF_B
        old = client.get(f"/api/exports/laudos/{issued['id']}/pdf/{first['id']}")
        assert old.status_code == 200 and old.content == PDF
        assert db_session.execute(select(IssuedReportPdf)).scalars().all().__len__() == 2

    def test_the_frozen_laudo_and_its_code_never_change(self, client, db_session: Session) -> None:
        issued = _issue(client)
        before = db_session.execute(select(IssuedReport)).scalar_one()
        html, digest = before.html, before.content_sha256
        _upload(client, issued["id"])
        _upload(client, issued["id"], PDF_B)
        db_session.expire_all()
        after = db_session.execute(select(IssuedReport)).scalar_one()
        assert after.html == html and after.content_sha256 == digest
        stored = client.get(f"/api/exports/estudos/{issued['study_id']}/laudo/versoes/1.html").text
        assert stored == html

    def test_the_version_list_says_which_pdf_is_current(self, client) -> None:
        issued = _issue(client)
        assert (
            client.get(f"/api/exports/estudos/{issued['study_id']}/laudo/versoes").json()[0][
                "signed_pdf"
            ]
            is None
        )
        _upload(client, issued["id"])
        _upload(client, issued["id"], PDF_B)
        row = client.get(f"/api/exports/estudos/{issued['study_id']}/laudo/versoes").json()[0]
        assert row["signed_pdf"]["sha256"] == hashlib.sha256(PDF_B).hexdigest()
        assert row["signed_pdf_count"] == 2

    def test_the_upload_is_audited_without_the_file(self, client) -> None:
        issued = _issue(client)
        _upload(client, issued["id"])
        events = client.get("/api/audit").json()
        text = str(events)
        assert "pdf_assinado" in text and "%PDF" not in text


class TestVerificationShowsThePdf:
    def test_it_says_there_is_none_then_shows_the_hash(self, client, anon_client) -> None:
        issued = _issue(client)
        url = f"/api/laudos/verificar/{issued['content_sha256']}"
        assert anon_client.get(url).json()["signed_pdf"] is None
        _upload(client, issued["id"])
        body = anon_client.get(url).json()
        assert body["signed_pdf"]["sha256"] == hashlib.sha256(PDF).hexdigest()
        assert "filename" not in body["signed_pdf"] and "content" not in body["signed_pdf"]

    def test_the_page_names_the_hash_and_leaves_the_signature_to_the_reader(
        self, client, anon_client
    ) -> None:
        issued = _issue(client)
        page = lambda: anon_client.get(  # noqa: E731
            f"/api/laudos/verificar/{issued['content_sha256']}", headers={"accept": "text/html"}
        ).text
        assert "nenhum PDF assinado foi registrado" in page()
        _upload(client, issued["id"])
        text = page()
        assert hashlib.sha256(PDF).hexdigest() in text
        assert "A assinatura em si é verificada no leitor de PDF" in text


# --- e-mail with the PDF ------------------------------------------------------


class TestEmailCarriesThePdf:
    def test_the_signed_pdf_goes_in_place_of_the_html(self, client, fake_smtp) -> None:
        issued = _issue(client)
        _upload(client, issued["id"])
        response = _send(client, issued["id"])
        assert response.status_code == 201, response.text
        assert response.json()["attached_pdf_sha256"] == hashlib.sha256(PDF).hexdigest()
        message = fake_smtp.instances[0].sent[0]
        attachments = list(message.iter_attachments())
        assert len(attachments) == 1  # in place of the .html, not beside it
        attachment = attachments[0]
        assert attachment.get_content_type() == "application/pdf"
        assert attachment.get_filename() == "laudo-estudo-do-laudo-v1-assinado.pdf"
        assert attachment.get_content() == PDF
        text = message.get_body(("plain",)).get_content()
        assert "assinado" in text and "em PDF" in text and ".html" not in text

    def test_without_a_pdf_it_is_still_the_html(self, client, fake_smtp) -> None:
        issued = _issue(client)
        body = _send(client, issued["id"]).json()
        assert body["attached_pdf_sha256"] is None
        (attachment,) = fake_smtp.instances[0].sent[0].iter_attachments()
        assert attachment.get_filename().endswith(".html")

    def test_the_newest_pdf_is_the_one_attached(self, client, fake_smtp) -> None:
        issued = _issue(client)
        _upload(client, issued["id"], PDF)
        _upload(client, issued["id"], PDF_B)
        _send(client, issued["id"])
        (attachment,) = fake_smtp.instances[0].sent[0].iter_attachments()
        assert attachment.get_content() == PDF_B

    def test_the_preview_says_which_attachment_and_until_when(self, client) -> None:
        issued = _issue(client)
        path = f"/api/exports/laudos/{issued['id']}/enviar/previa"
        before = client.post(path, json={"recipients": []}).json()
        assert before["signed_pdf"] is False and before["attachment_name"].endswith(".html")
        _upload(client, issued["id"])
        after = client.post(path, json={"recipients": []}).json()
        assert after["signed_pdf"] is True and after["attachment_name"].endswith(".pdf")
        assert "O link vale até" in after["text"] and "O link vale até" in after["html"]
        assert after["link_expires_at"]


# --- the link's life ----------------------------------------------------------


def _delivery(db_session: Session) -> ReportDelivery:
    db_session.expire_all()
    return db_session.execute(select(ReportDelivery)).scalars().one()


class TestLinkValidity:
    def test_each_send_stores_its_expiry_from_the_configured_days(
        self, client, db_session: Session, monkeypatch
    ) -> None:
        assert settings.report_link_ttl_days == 90
        monkeypatch.setattr(settings, "report_link_ttl_days", 30)
        issued = _issue(client)
        body = _send(client, issued["id"]).json()
        row = _delivery(db_session)
        created = row.created_at.replace(tzinfo=UTC)
        assert row.expires_at.replace(tzinfo=UTC) - created == timedelta(days=30)
        assert body["link_state"] == "ativo" and body["expires_at"]

    def test_a_later_change_of_the_setting_does_not_move_links_already_sent(
        self, client, db_session: Session, monkeypatch
    ) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        monkeypatch.setattr(settings, "report_link_ttl_days", 1)
        listed = client.get(f"/api/exports/laudos/{issued['id']}/envios").json()[0]
        assert listed["link_state"] == "ativo"

    @pytest.mark.parametrize("days", [0, -3, 4000])
    def test_the_setting_is_bounded(self, days) -> None:
        from pydantic import ValidationError

        from app.config import Settings

        with pytest.raises(ValidationError):
            Settings(report_link_ttl_days=days)

    def test_an_expired_link_is_410_with_a_friendly_page_and_none_of_the_laudo(
        self, client, anon_client, fixed_token, db_session: Session
    ) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        assert _link(anon_client, fixed_token).status_code == 200
        row = _delivery(db_session)
        row.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db_session.commit()

        response = _link(anon_client, fixed_token)
        assert response.status_code == 410
        assert response.headers["content-type"].startswith("text/html")
        assert "O prazo deste link terminou" in response.text
        assert "peça um novo envio" in response.text
        assert "Laudo de engenharia —" not in response.text  # none of the laudo
        assert issued["short_code"] not in response.text
        assert "noindex" in response.headers["x-robots-tag"]
        assert response.headers["cache-control"] == "private, no-store"
        assert _link(anon_client, fixed_token, "/pdf").status_code == 410
        listed = client.get(f"/api/exports/laudos/{issued['id']}/envios").json()[0]
        assert listed["link_state"] == "vencido"

    def test_a_row_from_before_the_feature_expires_from_its_send_time(
        self, client, anon_client, fixed_token, db_session: Session
    ) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        row = _delivery(db_session)
        row.expires_at = None
        row.created_at = datetime.now(UTC) - timedelta(days=91)
        db_session.commit()
        assert _link(anon_client, fixed_token).status_code == 410
        row.created_at = datetime.now(UTC) - timedelta(days=89)
        db_session.commit()
        assert _link(anon_client, fixed_token).status_code == 200

    def test_the_email_tells_the_date(self, client, fake_smtp) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        text = fake_smtp.instances[0].sent[0].get_body(("plain",)).get_content()
        last_day = (datetime.now(UTC) + timedelta(days=90)).strftime("%d/%m/%Y")
        assert f"O link vale até {last_day}." in text


class TestRevoking:
    def test_the_owner_revokes_and_the_link_answers_410(
        self, client, anon_client, fixed_token
    ) -> None:
        issued = _issue(client)
        delivery = _send(client, issued["id"]).json()
        assert _link(anon_client, fixed_token).status_code == 200

        response = client.post(f"/api/exports/envios/{delivery['id']}/revogar")
        assert response.status_code == 200, response.text
        assert response.json()["link_state"] == "revogado" and response.json()["revoked_at"]

        gone = _link(anon_client, fixed_token)
        assert gone.status_code == 410
        assert "Este link foi cancelado" in gone.text and "Laudo de engenharia —" not in gone.text
        assert _link(anon_client, fixed_token, "/pdf").status_code == 410
        # the laudo itself is untouched and still verifiable
        assert (
            anon_client.get(f"/api/laudos/verificar/{issued['content_sha256']}").status_code == 200
        )

    def test_revoking_twice_changes_nothing(self, client, db_session: Session) -> None:
        issued = _issue(client)
        delivery = _send(client, issued["id"]).json()
        first = client.post(f"/api/exports/envios/{delivery['id']}/revogar").json()
        second = client.post(f"/api/exports/envios/{delivery['id']}/revogar")
        assert second.status_code == 200 and second.json()["revoked_at"] == first["revoked_at"]

    def test_only_the_owner_revokes(
        self, client, anon_client, other_user, login_as, fixed_token
    ) -> None:
        issued = _issue(client)
        delivery = _send(client, issued["id"]).json()
        with login_as(other_user):
            assert client.post(f"/api/exports/envios/{delivery['id']}/revogar").status_code == 404
        assert _link(anon_client, fixed_token).status_code == 200
        assert client.post("/api/exports/envios/99999/revogar").status_code == 404

    def test_a_failed_send_has_no_link_to_revoke(self, client, fake_smtp) -> None:
        import smtplib

        fake_smtp.fail_at = {"connect": smtplib.SMTPConnectError(421, "x")}
        issued = _issue(client)
        assert _send(client, issued["id"]).status_code == 503
        failed = client.get(f"/api/exports/laudos/{issued['id']}/envios").json()[0]
        assert failed["link_state"] == "sem_link" and failed["expires_at"] is None
        response = client.post(f"/api/exports/envios/{failed['id']}/revogar")
        assert response.status_code == 400 and "não há o que revogar" in response.json()["detail"]

    def test_the_revocation_is_audited_as_a_state_change(self, client) -> None:
        issued = _issue(client)
        delivery = _send(client, issued["id"]).json()
        client.post(f"/api/exports/envios/{delivery['id']}/revogar")
        events = str(client.get("/api/audit").json())
        assert "revogado" in events and "cliente@empresa.com.br" not in events


# --- openings -----------------------------------------------------------------


class TestOpenings:
    def test_each_opening_is_counted_with_first_and_last_time(
        self, client, anon_client, fixed_token, db_session: Session
    ) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        row = _delivery(db_session)
        assert row.open_count == 0 and row.first_opened_at is None
        for _ in range(3):
            assert _link(anon_client, fixed_token).status_code == 200
        row = _delivery(db_session)
        assert row.open_count == 3
        assert row.first_opened_at is not None and row.last_opened_at >= row.first_opened_at
        listed = client.get(f"/api/exports/laudos/{issued['id']}/envios").json()[0]
        assert listed["open_count"] == 3 and listed["first_opened_at"] and listed["last_opened_at"]

    def test_the_first_opening_time_is_kept(
        self, client, anon_client, fixed_token, db_session: Session
    ) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        _link(anon_client, fixed_token)
        first = _delivery(db_session).first_opened_at
        _link(anon_client, fixed_token)
        assert _delivery(db_session).first_opened_at == first

    @pytest.mark.parametrize(
        "headers",
        [
            {"user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"},
            {"user-agent": "Microsoft Office/16 SafeLinks Protection"},
            {"user-agent": "Slackbot-LinkExpanding 1.0"},
            {"user-agent": "curl/8.4"},
            {"user-agent": "Mozilla/5.0 Chrome/120", "sec-purpose": "prefetch"},
            {"user-agent": "Mozilla/5.0 Chrome/120", "purpose": "prefetch"},
        ],
    )
    def test_robots_and_prefetch_do_not_count(
        self, client, anon_client, fixed_token, db_session: Session, headers
    ) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        assert _link(anon_client, fixed_token, headers=headers).status_code == 200
        assert _delivery(db_session).open_count == 0
        _link(anon_client, fixed_token, headers={"user-agent": "Mozilla/5.0 Firefox/121"})
        assert _delivery(db_session).open_count == 1

    def test_a_dead_link_does_not_count_and_the_pdf_download_is_not_an_opening(
        self, client, anon_client, fixed_token, db_session: Session
    ) -> None:
        issued = _issue(client)
        delivery = _send(client, issued["id"]).json()
        _upload(client, issued["id"])
        assert _link(anon_client, fixed_token, "/pdf").status_code == 200
        assert _delivery(db_session).open_count == 0
        client.post(f"/api/exports/envios/{delivery['id']}/revogar")
        _link(anon_client, fixed_token)
        assert _delivery(db_session).open_count == 0

    def test_nothing_about_the_visitor_is_kept(self) -> None:
        columns = {c.name for c in ReportDelivery.__table__.columns}
        assert not {c for c in columns if "ip" in c.split("_") or "agent" in c or "ua" == c}
        assert {"open_count", "first_opened_at", "last_opened_at"} <= columns

    def test_the_message_has_no_tracking_pixel(self, client, fake_smtp) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        html = fake_smtp.instances[0].sent[0].get_body(("html",)).get_content()
        assert "<img" not in html.lower() and "background:url" not in html.replace(" ", "")


class TestPublicSignedPdf:
    def test_the_page_offers_the_pdf_and_the_stored_laudo_is_untouched(
        self, client, anon_client, fixed_token, db_session: Session
    ) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        plain = _link(anon_client, fixed_token).text
        assert "Baixar PDF assinado" not in plain
        _upload(client, issued["id"])
        page = _link(anon_client, fixed_token)
        assert "Baixar PDF assinado" in page.text
        assert f'href="/api/laudos/enviados/{fixed_token}/pdf"' in page.text
        assert hashlib.sha256(PDF).hexdigest()[:4].upper() in page.text
        # Served with a strip; stored exactly as issued.
        stored = db_session.execute(select(IssuedReport)).scalar_one().html
        assert "Baixar PDF assinado" not in stored
        assert (
            page.text.replace(
                page.text[
                    page.text.index("<style>@media print") : page.text.index(
                        "Baixar PDF assinado</a></div>"
                    )
                    + len("Baixar PDF assinado</a></div>")
                ],
                "",
            )
            == stored
        )
        assert "@media print{.signed-pdf-bar{display:none" in page.text

    def test_the_pdf_download_serves_the_current_file(
        self, client, anon_client, fixed_token
    ) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        assert _link(anon_client, fixed_token, "/pdf").status_code == 404
        _upload(client, issued["id"])
        _upload(client, issued["id"], PDF_B)
        response = _link(anon_client, fixed_token, "/pdf")
        assert response.status_code == 200 and response.content == PDF_B
        assert response.headers["content-type"] == "application/pdf"
        assert response.headers["content-disposition"].startswith("attachment;")
        assert response.headers["content-security-policy"] == "default-src 'none'"
        assert "noindex" in response.headers["x-robots-tag"]

    def test_an_unknown_token_is_still_a_404(self, anon_client) -> None:
        assert _link(anon_client, "x" * 43, "/pdf").status_code == 404

    def test_the_link_service_distinguishes_unknown_from_gone(self, db_session: Session) -> None:
        with pytest.raises(Exception, match="não existe"):
            report_delivery_service.resolve_public_link(db_session, "z" * 43)


# --- Word and PowerPoint ------------------------------------------------------

QUERY = {
    "responsavel": "Ana Souza",
    "titulo": "Engenheira mecânica",
    "registro": "CREA-SP 5069999999",
    "cidade": "São Carlos",
    "data": "2026-11-16",
    "cliente": "Cliente Sigiloso Ltda.",
    "projeto": "Projeto X",
    "massa": 1.5,
    "lote": 2000,
}


def _docx(client, **params):
    study_id = _study(client)
    response = client.get(f"/api/exports/estudos/{study_id}/laudo.docx", params=params or QUERY)
    assert response.status_code == 200, response.text
    return response


class TestWordLaudo:
    def test_it_opens_and_has_the_laudo_structure_in_order(self, client) -> None:
        from docx import Document

        response = _docx(client)
        assert response.headers["content-type"].startswith(
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
        doc = Document(io.BytesIO(response.content))
        headings = [p.text for p in doc.paragraphs if p.style.name.startswith("Heading")]
        wanted = [
            "1. Resumo executivo",
            "2. Comparação dos finalistas",
            "3. Custo",
            "4. Impacto ambiental",
            "5. Fabricação",
            "6. Interpretação técnica (IA)",
            "7. Responsabilidade técnica e assinatura",
            "8. Anexo técnico",
        ]
        positions = [headings.index(h) for h in wanted]
        assert positions == sorted(positions)
        text = "\n".join(p.text for p in doc.paragraphs)
        assert "Laudo de engenharia — Estudo do laudo" in text or any(
            "Laudo de engenharia — Estudo do laudo" in c.text
            for t in doc.tables
            for r in t.rows
            for c in r.cells
        )

    def test_the_charts_are_png_pictures_with_alt_text(self, client) -> None:
        import zipfile

        from docx import Document

        response = _docx(client)
        doc = Document(io.BytesIO(response.content))
        assert len(doc.inline_shapes) >= 6  # donut, mini ranking, radar, map, cost, eco…
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            media = [n for n in archive.namelist() if n.startswith("word/media/")]
            assert media and all(n.endswith(".png") for n in media)
            assert all(archive.read(n).startswith(b"\x89PNG") for n in media)
            xml = archive.read("word/document.xml").decode()
        assert 'descr="' in xml and "Requisitos e verificações" in xml

    def test_cards_and_the_traffic_light_are_shaded_tables(self, client) -> None:
        import zipfile

        response = _docx(client)
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            xml = archive.read("word/document.xml").decode()
        for word in ("Atende", "Atenção", "Candidatos aprovados", "Escopo deste laudo"):
            assert word in xml
        assert 'w:fill="E6F4EA"' in xml  # the "ok" soft ground, from the shared token
        assert "w:shd" in xml and "w:tcBorders" in xml

    def test_it_says_it_is_not_the_issued_laudo_and_has_no_seal(self, client) -> None:
        from docx import Document

        doc = Document(io.BytesIO(_docx(client).content))
        text = "\n".join(
            [p.text for p in doc.paragraphs]
            + [c.text for t in doc.tables for r in t.rows for c in r.cells]
        )
        assert "Versão editável — não emitida" in text
        assert "Código de verificação" not in text

    def test_declared_fields_and_the_annex_tables_are_there(self, client) -> None:
        from docx import Document

        doc = Document(io.BytesIO(_docx(client).content))
        text = "\n".join(
            [p.text for p in doc.paragraphs]
            + [c.text for t in doc.tables for r in t.rows for c in r.cells]
        )
        for fragment in (
            "Ana Souza",
            "CREA-SP 5069999999",
            "Cliente Sigiloso Ltda.",
            "São Carlos",
            "A1. Problema",
            "Proveniência",
            "Moldagem",
        ):
            assert fragment in text

    def test_absent_data_is_a_word_never_a_zero(self, client) -> None:
        from docx import Document

        doc = Document(io.BytesIO(_docx(client, **{}).content))
        text = "\n".join(
            [p.text for p in doc.paragraphs]
            + [c.text for t in doc.tables for r in t.rows for c in r.cells]
        )
        assert "ausente" in text

    def test_a_chart_that_cannot_be_drawn_is_declared_not_hidden(self, client, monkeypatch) -> None:
        from docx import Document

        from app.exporters import laudo_docx
        from app.exporters.svg_png import FigureRasterError

        def broken(_svg):
            raise FigureRasterError("sem render")

        monkeypatch.setattr(laudo_docx, "svg_to_png", broken)
        doc = Document(io.BytesIO(_docx(client).content))
        text = "\n".join(
            [p.text for p in doc.paragraphs]
            + [c.text for t in doc.tables for r in t.rows for c in r.cells]
        )
        assert "Figura indisponível nesta cópia" in text and len(doc.inline_shapes) == 0

    def test_a_control_character_in_a_name_does_not_break_it(self, client) -> None:
        study_id = _study(client, name="Estudo\x0bcom controle", description="d\x01")
        response = client.get(f"/api/exports/estudos/{study_id}/laudo.docx", params=QUERY)
        assert response.status_code == 200

    def test_the_file_is_named_after_the_study(self, client) -> None:
        disposition = _docx(client).headers["content-disposition"]
        assert 'filename="laudo-de-engenharia-estudo-do-laudo.docx"' in disposition


class TestPowerPointLaudo:
    def _deck(self, client):
        from pptx import Presentation

        study_id = _study(client)
        response = client.get(f"/api/exports/estudos/{study_id}/laudo.pptx", params=QUERY)
        assert response.status_code == 200, response.text
        return Presentation(io.BytesIO(response.content))

    @staticmethod
    def _texts(slide) -> str:
        parts = []
        for shape in slide.shapes:
            if shape.has_text_frame and shape.text_frame.text:
                parts.append(shape.text_frame.text)
            if getattr(shape, "has_table", False) and shape.has_table:
                parts += [c.text for r in shape.table.rows for c in r.cells]
        return "\n".join(parts)

    def test_it_has_a_summary_slide_and_one_per_section_in_order(self, client) -> None:
        deck = self._deck(client)
        titles = [self._texts(s).split("\n")[0] for s in deck.slides]
        assert titles[0].startswith("LAUDO DE ENGENHARIA")
        assert "Resumo executivo" in titles
        order = [
            "Resumo executivo",
            "2. Comparação dos finalistas",
            "3. Custo",
            "4. Impacto ambiental",
            "5. Fabricação",
            "6. Interpretação técnica (IA)",
            "7. Responsabilidade técnica e assinatura",
            "Avisos",
        ]
        positions = [next(i for i, t in enumerate(titles) if t == o) for o in order]
        assert positions == sorted(positions)

    def test_the_charts_are_pictures_and_the_summary_has_the_traffic_light(self, client) -> None:
        from pptx.enum.shapes import MSO_SHAPE_TYPE

        deck = self._deck(client)
        pictures = [
            shape
            for slide in deck.slides
            for shape in slide.shapes
            if shape.shape_type == MSO_SHAPE_TYPE.PICTURE
        ]
        assert len(pictures) >= 5
        assert all(p.image.content_type == "image/png" for p in pictures)
        assert all(p._element.nvPicPr.cNvPr.get("descr") for p in pictures)
        summary = next(s for s in deck.slides if self._texts(s).startswith("Resumo executivo"))
        text = self._texts(summary)
        assert "Atende" in text and "Por que este material" in text
        assert "MATERIAL RECOMENDADO" in text

    def test_the_cover_says_it_is_not_the_issued_laudo(self, client) -> None:
        cover = self._texts(self._deck(client).slides[0])
        assert "Versão editável — não emitida" in cover and "Ana Souza" in cover


class TestUnsupported:
    def test_an_unknown_format_is_still_refused(self, client) -> None:
        study_id = _study(client)
        assert client.get(f"/api/exports/estudos/{study_id}/laudo.pdf").status_code == 400


# --- the PNG renderer ---------------------------------------------------------


class TestSvgToPng:
    def test_a_figure_becomes_a_png_of_the_declared_width(self) -> None:
        from app.exporters.figures import HBar, HBarFigure, render_hbars
        from app.exporters.svg_png import PNG_WIDTH, svg_to_png

        raster = svg_to_png(
            render_hbars(
                HBarFigure(title="Custo", unit="R$", bars=[HBar("Aço", 3.0), HBar("Al", None)])
            )
        )
        assert raster.png.startswith(b"\x89PNG") and raster.width == PNG_WIDTH
        assert 0 < raster.aspect < 1

    def test_text_is_drawn_with_the_shipped_font(self) -> None:
        from app.exporters.svg_png import FONT_DIR, FONT_FILES, svg_to_png

        assert all((FONT_DIR / name).is_file() for name in FONT_FILES)
        blank = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40"></svg>'
        text = blank.replace("</svg>", '<text x="4" y="28" font-size="22">Atenção ✓</text></svg>')
        # Text on the page changes the pixels: the font was found and used.
        assert svg_to_png(text).png != svg_to_png(blank).png

    @pytest.mark.parametrize("svg", ["", "<svg>", '<svg xmlns="http://www.w3.org/2000/svg"/>'])
    def test_bad_input_is_a_declared_error(self, svg) -> None:
        from app.exporters.svg_png import FigureRasterError, svg_to_png

        with pytest.raises(FigureRasterError):
            svg_to_png(svg)

    def test_the_library_is_not_imported_at_boot(self) -> None:
        import subprocess
        import sys

        code = "import sys, app.main; print('resvg_py' in sys.modules, 'docx' in sys.modules)"
        out = subprocess.run(
            [sys.executable, "-c", code], capture_output=True, text=True, check=True
        )
        assert out.stdout.split() == ["False", "False"]
