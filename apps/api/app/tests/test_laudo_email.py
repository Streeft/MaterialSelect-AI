"""E-mailing an issued laudo to the client (D-242).

Covers the address and text rules, the message itself, the provider (``mock`` and
``smtp`` with ``smtplib`` replaced by a fake — nothing here opens a socket), the
record of each send, the per-hour quota, the read-only public copy and the health
report. The laudo is the one of ``test_laudo`` (D-241): only an issued version
can be sent.
"""

from __future__ import annotations

import logging
import re
import smtplib
import ssl
from email import message_from_bytes, policy

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.domain.email_address import (
    clean_addresses,
    clean_message,
    clean_subject,
    is_valid_address,
)
from app.domain.errors import ServerBusyError, ValidationError
from app.exporters.laudo import recommended_name
from app.exporters.laudo_email import LaudoEmail, default_subject, render_html, render_text
from app.models.report_delivery import ReportDelivery
from app.services import email_service, report_delivery_service
from app.services.email_service import (
    EmailAttachment,
    OutgoingEmail,
    build_message,
    explain_smtp_failure,
)
from app.services.heavy_request_gate import HeavyRequestGate
from app.tests.test_laudo import ENGINEER, _study

SECRET = "s3nh4-super-secreta-do-smtp"
TOKEN = "T" * 43


def _issue(client: TestClient, **study) -> dict:
    study_id = _study(client, **study)
    response = client.post(f"/api/exports/estudos/{study_id}/laudo/emitir", json=ENGINEER)
    assert response.status_code == 201, response.text
    return response.json()


def _send(client: TestClient, issued_id: int, **body):
    payload = {"recipients": ["cliente@empresa.com.br"], **body}
    return client.post(f"/api/exports/laudos/{issued_id}/enviar", json=payload)


@pytest.fixture()
def smtp_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "email_provider", "smtp")
    monkeypatch.setattr(settings, "smtp_host", "smtp.exemplo.com")
    monkeypatch.setattr(settings, "smtp_port", 587)
    monkeypatch.setattr(settings, "smtp_username", "envio@exemplo.com")
    monkeypatch.setattr(settings, "smtp_password", SECRET)
    monkeypatch.setattr(settings, "smtp_starttls", True)
    monkeypatch.setattr(settings, "email_from", "laudos@exemplo.com")
    monkeypatch.setattr(settings, "email_from_name", "MaterialSelect AI")
    monkeypatch.setattr(settings, "email_reply_to", "")


@pytest.fixture()
def fixed_token(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(report_delivery_service.secrets, "token_urlsafe", lambda _n: TOKEN)
    return TOKEN


class FakeSMTP:
    """Stands in for ``smtplib.SMTP`` / ``SMTP_SSL``: records the conversation."""

    instances: list[FakeSMTP] = []
    #: Set by a test: an exception to raise at one step.
    fail_at: dict[str, BaseException] = {}

    def __init__(self, host, port, **kwargs) -> None:
        type(self).instances.append(self)
        self.host, self.port, self.kwargs = host, port, kwargs
        self.steps: list[str] = []
        self.sent = None
        self.login_args = None
        self._maybe("connect")

    def _maybe(self, step: str) -> None:
        self.steps.append(step)
        error = type(self).fail_at.get(step)
        if error is not None:
            raise error

    def __enter__(self):
        return self

    def __exit__(self, *_exc) -> None:
        self.steps.append("quit")

    def starttls(self, context=None) -> None:
        self._maybe("starttls")

    def login(self, user, password) -> None:
        self.login_args = (user, password)
        self._maybe("login")

    def send_message(self, message, from_addr=None, to_addrs=None) -> None:
        self._maybe("send")
        self.sent = (message, from_addr, list(to_addrs or []))


@pytest.fixture()
def fake_smtp(monkeypatch: pytest.MonkeyPatch, smtp_settings) -> type[FakeSMTP]:
    FakeSMTP.instances = []
    FakeSMTP.fail_at = {}
    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(email_service.smtplib, "SMTP_SSL", FakeSMTP)
    return FakeSMTP


# --- the rules on addresses and text ----------------------------------------


class TestAddressRules:
    @pytest.mark.parametrize(
        "value", ["ana@empresa.com.br", "a.b+c@sub.dominio.org", "x_y@a-b.co", "ANA@EMPRESA.COM"]
    )
    def test_a_plain_address_is_valid(self, value: str) -> None:
        assert is_valid_address(value)

    @pytest.mark.parametrize(
        "value",
        [
            "",
            "sem-arroba.com",
            "a@b",
            "a@@b.com",
            "a b@c.com",
            "a@b.c",
            "a@-b.com",
            "a..b@c.com",
            ".a@c.com",
            "a@c.com\nBcc: x@y.com",
            "a@c.com,b@c.com",
            "<a@c.com>",
            "Ana <a@c.com>",
            "ç@c.com",
            "a@" + "x" * 250 + ".com",
        ],
    )
    def test_a_malformed_address_is_refused(self, value: str) -> None:
        assert not is_valid_address(value)

    def test_the_list_is_trimmed_deduplicated_and_counted(self) -> None:
        cleaned = clean_addresses(
            [" A@x.com ", "a@X.com", "", "b@x.com"], label="Destinatários", minimum=1, maximum=5
        )
        assert cleaned == ["A@x.com", "b@x.com"]

    def test_copy_skips_whoever_is_already_a_recipient(self) -> None:
        cleaned = clean_addresses(
            ["a@x.com", "c@x.com"],
            label="Cópia",
            minimum=0,
            maximum=5,
            exclude=frozenset({"a@x.com"}),
        )
        assert cleaned == ["c@x.com"]

    def test_one_to_five_recipients(self) -> None:
        with pytest.raises(ValidationError, match="ao menos 1"):
            clean_addresses([" "], label="Destinatários", minimum=1, maximum=5)
        with pytest.raises(ValidationError, match="no máximo 5"):
            clean_addresses(
                [f"p{n}@x.com" for n in range(6)], label="Destinatários", minimum=1, maximum=5
            )

    def test_the_error_names_the_bad_address(self) -> None:
        with pytest.raises(ValidationError, match='"oops" não é um endereço'):
            clean_addresses(["oops"], label="Destinatários", minimum=1, maximum=5)

    def test_a_subject_is_one_line(self) -> None:
        assert clean_subject("  Laudo   do   estudo ") == "Laudo do estudo"
        assert clean_subject("   ") is None
        with pytest.raises(ValidationError, match="uma linha só"):
            clean_subject("Oi\r\nBcc: x@y.com")
        with pytest.raises(ValidationError, match="no máximo 200"):
            clean_subject("a" * 201)

    def test_a_message_keeps_its_lines_and_drops_control_characters(self) -> None:
        assert clean_message("Oi\r\n\r\nTudo bem?\x00") == "Oi\n\nTudo bem?"
        assert clean_message("  ") is None
        with pytest.raises(ValidationError, match="no máximo 1000"):
            clean_message("a" * 1001)


# --- the message ------------------------------------------------------------


def _mail(**overrides) -> LaudoEmail:
    base = dict(
        study_name="Suporte leve",
        version=2,
        engineer_name="Ana Souza",
        engineer_title="Engenheira mecânica",
        material="Liga de alumínio 6061",
        short_code="ABCD-EF01-2345",
        public_url="https://app.exemplo.com/api/laudos/enviados/tok",
        verify_url="https://app.exemplo.com/api/laudos/verificar/abc",
        message=None,
        attachment_name="laudo-suporte-leve-v2.html",
    )
    base.update(overrides)
    return LaudoEmail(**base)


class TestRenderedMessage:
    def test_the_html_has_greeting_three_lines_button_and_verification(self) -> None:
        html = render_html(_mail())
        assert "Olá," in html
        assert "Material recomendado" in html and "Liga de alumínio 6061" in html
        assert "Suporte leve (versão 2)" in html
        assert "Ana Souza — Engenheira mecânica" in html
        assert 'href="https://app.exemplo.com/api/laudos/enviados/tok"' in html
        assert "Abrir o laudo" in html
        assert "ABCD-EF01-2345" in html and "laudos/verificar/abc" in html
        assert "laudo-suporte-leve-v2.html" in html

    def test_nothing_comes_from_a_stylesheet_or_a_variable(self) -> None:
        html = render_html(_mail())
        assert "<style" not in html and "var(--" not in html and "<script" not in html

    def test_what_a_person_typed_is_escaped(self) -> None:
        html = render_html(
            _mail(
                study_name='<img src=x onerror="alert(1)">',
                material="<b>Aço</b>",
                engineer_name="Ana & <i>Filhos</i>",
                message="Linha 1\n<script>alert(2)</script>",
            )
        )
        assert "<img" not in html and "<b>Aço" not in html and "<i>" not in html
        assert "<script>" not in html and "&lt;script&gt;" in html
        assert "Linha 1<br>&lt;script" in html

    def test_without_a_recommendation_the_line_says_so(self) -> None:
        html = render_html(_mail(material=None))
        assert "nenhum material recomendado neste estudo" in html
        assert "None" not in html

    def test_the_preview_has_no_link_to_a_token_yet(self) -> None:
        assert 'href="#"' in render_html(_mail(public_url=None))
        assert "Abrir o laudo (somente leitura)" not in render_text(_mail(public_url=None))

    def test_the_plain_text_alternative_carries_the_same_facts(self) -> None:
        text = render_text(_mail(message="Segue, conforme combinado."))
        for part in (
            "Olá,",
            "Segue, conforme combinado.",
            "Material recomendado: Liga de alumínio 6061",
            "Estudo: Suporte leve (versão 2)",
            "Engenheiro responsável: Ana Souza — Engenheira mecânica",
            "https://app.exemplo.com/api/laudos/enviados/tok",
            "ABCD-EF01-2345",
        ):
            assert part in text

    def test_the_default_subject_names_study_and_version(self) -> None:
        assert default_subject("Suporte", 3) == "Laudo de engenharia — Suporte (versão 3)"

    def test_the_recommended_name_is_read_back_from_a_real_laudo(self, client) -> None:
        issued = _issue(client)
        html = client.get(f"/api/exports/estudos/{issued['study_id']}/laudo/versoes/1.html").text
        name = recommended_name(html)
        assert name and "<" not in name
        assert recommended_name("<html>nada</html>") is None

    def test_mime_has_both_alternatives_and_the_attachment(self) -> None:
        email = OutgoingEmail(
            to=("a@x.com", "b@x.com"),
            cc=("c@x.com",),
            subject="Laudo — Suporte (versão 1)",
            text="texto",
            html="<p>html</p>",
            attachments=(EmailAttachment("laudo.html", "<html>é</html>".encode()),),
        )
        message = build_message(
            email, sender="laudos@exemplo.com", sender_name="MaterialSelect AI", reply_to="r@x.com"
        )
        parsed = message_from_bytes(message.as_bytes(), policy=policy.default)
        assert parsed["To"] == "a@x.com, b@x.com" and parsed["Cc"] == "c@x.com"
        assert parsed["Reply-To"] == "r@x.com"
        assert "laudos@exemplo.com" in parsed["From"] and "MaterialSelect AI" in parsed["From"]
        assert parsed["Subject"] == "Laudo — Suporte (versão 1)"
        kinds = [part.get_content_type() for part in parsed.walk()]
        assert "text/plain" in kinds and "text/html" in kinds
        attachment = next(parsed.iter_attachments())
        assert attachment.get_filename() == "laudo.html"
        assert attachment.get_content().strip() == "<html>é</html>"

    def test_a_header_with_a_line_break_never_gets_built(self) -> None:
        email = OutgoingEmail(to=("a@x.com",), subject="Oi\r\nBcc: x@y.com", text="t", html="h")
        with pytest.raises(ValueError):
            build_message(email, sender="l@x.com", sender_name="Nome")


# --- sending with the mock provider -----------------------------------------


class TestMockProvider:
    def test_the_mock_records_a_simulated_delivery(self, client, db_session: Session) -> None:
        issued = _issue(client)
        response = _send(
            client, issued["id"], cc=["copia@empresa.com.br"], message="Segue o laudo."
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["status"] == "simulado" and body["provider"] == "mock"
        assert body["recipients"] == ["cliente@empresa.com.br"]
        assert body["cc"] == ["copia@empresa.com.br"]
        assert (
            body["subject"] == f"Laudo de engenharia — Estudo do laudo (versão {issued['version']})"
        )
        assert body["message"] == "Segue o laudo."
        assert body["error"] is None and body["sent_by"] == "pesquisador@example.com"

        row = db_session.execute(select(ReportDelivery)).scalars().one()
        assert row.issued_report_id == issued["id"] and row.status == "simulado"
        assert len(row.token_hash) == 64

    def test_the_mock_logs_counts_and_never_an_address(self, client, caplog) -> None:
        issued = _issue(client)
        with caplog.at_level(logging.INFO, logger="app.services.email_service"):
            assert _send(client, issued["id"]).status_code == 201
        assert "E-mail simulado" in caplog.text
        assert "cliente@empresa.com.br" not in caplog.text

    def test_the_history_lists_newest_first(self, client) -> None:
        issued = _issue(client)
        _send(client, issued["id"], recipients=["um@empresa.com.br"])
        _send(client, issued["id"], recipients=["dois@empresa.com.br"])
        history = client.get(f"/api/exports/laudos/{issued['id']}/envios")
        assert history.status_code == 200
        assert [h["recipients"] for h in history.json()] == [
            ["dois@empresa.com.br"],
            ["um@empresa.com.br"],
        ]

    def test_a_send_is_audited_without_the_addresses(self, client) -> None:
        issued = _issue(client)
        _send(client, issued["id"], cc=["copia@empresa.com.br"])
        events = client.get("/api/audit", params={"entity_type": "report_delivery"}).json()
        assert len(events) == 1
        event = events[0]
        assert event["action"] == "CRIADO"
        assert event["changes"]["status"]["after"] == "simulado"
        assert event["changes"]["destinatarios"]["after"] == 2
        assert "empresa.com.br" not in str(event)

    def test_the_audit_of_a_send_is_not_shown_to_another_project(
        self, client, other_user, login_as
    ) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        with login_as(other_user):
            events = client.get("/api/audit", params={"entity_type": "report_delivery"}).json()
        assert events == []

    def test_the_preview_writes_nothing_and_sends_nothing(
        self, client, db_session: Session
    ) -> None:
        issued = _issue(client)
        response = client.post(
            f"/api/exports/laudos/{issued['id']}/enviar/previa",
            json={"recipients": [], "message": "Oi <b>você</b>"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["subject"].startswith("Laudo de engenharia — Estudo do laudo")
        assert "Ana Souza" in body["html"] and "Oi &lt;b&gt;você&lt;/b&gt;" in body["html"]
        assert body["attachment_name"] == "laudo-estudo-do-laudo-v1.html"
        assert body["provider"] == "mock" and body["email_configured"] is False
        assert db_session.execute(select(ReportDelivery)).first() is None


class TestWhoMaySend:
    def test_only_an_issued_laudo_can_be_sent(self, client) -> None:
        study_id = _study(client)  # a study with a preview only: nothing issued
        for path in (
            f"/api/exports/laudos/{study_id}/enviar",
            f"/api/exports/laudos/{study_id}/enviar/previa",
        ):
            response = client.post(path, json={"recipients": ["a@empresa.com.br"]})
            assert response.status_code == 404
            assert "Só um laudo emitido pode ser enviado" in response.json()["detail"]

    def test_only_the_owner_sends_reads_or_previews(self, client, other_user, login_as) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        with login_as(other_user):
            assert _send(client, issued["id"]).status_code == 404
            assert client.get(f"/api/exports/laudos/{issued['id']}/envios").status_code == 404
            assert (
                client.post(
                    f"/api/exports/laudos/{issued['id']}/enviar/previa", json={"recipients": []}
                ).status_code
                == 404
            )

    def test_nothing_is_recorded_for_a_refused_send(
        self, client, other_user, login_as, db_session
    ) -> None:
        issued = _issue(client)
        with login_as(other_user):
            _send(client, issued["id"])
        assert db_session.execute(select(ReportDelivery)).first() is None

    @pytest.mark.parametrize(
        ("body", "fragment"),
        [
            ({"recipients": []}, "ao menos 1"),
            ({"recipients": ["nao-e-email"]}, "não é um endereço de e-mail válido"),
            ({"recipients": [f"p{n}@empresa.com.br" for n in range(6)]}, "no máximo 5"),
            (
                {"recipients": ["a@empresa.com.br"], "cc": ["ruim"]},
                "Cópia",
            ),
            (
                {"recipients": ["a@empresa.com.br"], "subject": "Oi\nBcc: x@y.com"},
                "uma linha só",
            ),
            ({"recipients": ["a@empresa.com.br"], "message": "a" * 1001}, "no máximo 1000"),
        ],
    )
    def test_a_bad_request_is_a_400_in_portuguese(self, client, body, fragment) -> None:
        issued = _issue(client)
        response = client.post(f"/api/exports/laudos/{issued['id']}/enviar", json=body)
        assert response.status_code == 400, response.text
        assert fragment in response.json()["detail"]

    def test_a_person_copied_and_addressed_is_in_to_only(self, client) -> None:
        issued = _issue(client)
        body = _send(
            client, issued["id"], cc=["CLIENTE@empresa.com.br", "outro@empresa.com.br"]
        ).json()
        assert body["cc"] == ["outro@empresa.com.br"]


# --- sending with SMTP ------------------------------------------------------


class TestSmtpProvider:
    def test_a_successful_send_hands_the_whole_message_to_the_server(
        self, client, fake_smtp, db_session: Session
    ) -> None:
        issued = _issue(client)
        response = _send(
            client,
            issued["id"],
            recipients=["um@empresa.com.br", "dois@empresa.com.br"],
            cc=["copia@empresa.com.br"],
            subject="Laudo do suporte",
        )
        assert response.status_code == 201, response.text
        assert response.json()["status"] == "enviado" and response.json()["provider"] == "smtp"

        (conn,) = fake_smtp.instances
        assert (conn.host, conn.port) == ("smtp.exemplo.com", 587)
        assert conn.steps == ["connect", "starttls", "login", "send", "quit"]
        assert conn.login_args == ("envio@exemplo.com", SECRET)
        assert conn.kwargs["timeout"] == pytest.approx(10.0)
        message, from_addr, envelope = conn.sent
        assert from_addr == "laudos@exemplo.com"
        assert envelope == ["um@empresa.com.br", "dois@empresa.com.br", "copia@empresa.com.br"]
        assert message["Subject"] == "Laudo do suporte"

        attachment = next(message.iter_attachments())
        stored = client.get(f"/api/exports/estudos/{issued['study_id']}/laudo/versoes/1.html").text
        assert attachment.get_content() == stored
        assert attachment.get_filename() == "laudo-estudo-do-laudo-v1.html"
        html = message.get_body(("html",)).get_content()
        assert "/api/laudos/enviados/" in html and issued["short_code"] in html

    def test_port_465_uses_implicit_tls_and_skips_starttls(
        self, client, fake_smtp, monkeypatch
    ) -> None:
        monkeypatch.setattr(settings, "smtp_port", 465)
        issued = _issue(client)
        assert _send(client, issued["id"]).status_code == 201
        assert fake_smtp.instances[0].steps == ["connect", "login", "send", "quit"]

    def test_the_reply_to_goes_out_when_configured(self, client, fake_smtp, monkeypatch) -> None:
        # The deployment-wide address is what a send falls back to when the engineer's own is
        # switched off (D-249).
        monkeypatch.setattr(settings, "email_reply_to", "engenharia@exemplo.com")
        issued = _issue(client)
        _send(client, issued["id"], reply_to_engineer=False)
        assert fake_smtp.instances[0].sent[0]["Reply-To"] == "engenharia@exemplo.com"

    def test_the_reply_goes_to_the_engineer_by_default(
        self, client, fake_smtp, monkeypatch
    ) -> None:
        # D-249: the account that sends is the engineer; its address wins over EMAIL_REPLY_TO.
        monkeypatch.setattr(settings, "email_reply_to", "engenharia@exemplo.com")
        issued = _issue(client)
        _send(client, issued["id"])
        assert fake_smtp.instances[0].sent[0]["Reply-To"] == "pesquisador@example.com"

    def test_without_either_there_is_no_reply_to_header(self, client, fake_smtp) -> None:
        issued = _issue(client)
        _send(client, issued["id"], reply_to_engineer=False)
        assert fake_smtp.instances[0].sent[0]["Reply-To"] is None

    def test_the_preview_says_where_a_reply_would_go(self, client) -> None:
        issued = _issue(client)
        path = f"/api/exports/laudos/{issued['id']}/enviar/previa"
        on = client.post(path, json={"recipients": []}).json()
        off = client.post(path, json={"recipients": [], "reply_to_engineer": False}).json()
        assert on["reply_to"] == "pesquisador@example.com"
        assert off["reply_to"] is None

    def test_a_wrong_password_is_recorded_and_answered_without_the_secret(
        self, client, fake_smtp, db_session: Session, caplog
    ) -> None:
        fake_smtp.fail_at["login"] = smtplib.SMTPAuthenticationError(
            535, f"5.7.8 Username and Password not accepted for {SECRET}".encode()
        )
        issued = _issue(client)
        with caplog.at_level(logging.DEBUG):
            response = _send(client, issued["id"])
        assert response.status_code == 503
        assert "recusou o usuário ou a senha" in response.json()["detail"]
        for text in (response.text, caplog.text):
            assert SECRET not in text and "envio@exemplo.com" not in text
        row = db_session.execute(select(ReportDelivery)).scalars().one()
        assert row.status == "falhou" and row.provider == "smtp"
        assert "recusou o usuário ou a senha" in row.error and SECRET not in row.error
        history = client.get(f"/api/exports/laudos/{issued['id']}/envios").json()
        assert history[0]["status"] == "falhou" and SECRET not in str(history)

    def test_a_timeout_says_how_long_it_waited(self, client, fake_smtp, monkeypatch) -> None:
        monkeypatch.setattr(settings, "smtp_timeout_seconds", 4.0)
        fake_smtp.fail_at["connect"] = TimeoutError("timed out")
        issued = _issue(client)
        response = _send(client, issued["id"])
        # A timeout is a passing reason (D-252): the send waits in the queue and says why.
        assert response.status_code == 201
        assert response.json()["status"] == "na_fila"
        assert "não respondeu em 4 s" in response.json()["error"]
        assert fake_smtp.instances[0].kwargs["timeout"] == pytest.approx(4.0)

    def test_refused_recipients_and_other_failures_have_their_own_sentence(self) -> None:
        refused = smtplib.SMTPRecipientsRefused({"a@x.com": (550, b"no such user")})
        assert "recusou um ou mais destinatários" in explain_smtp_failure(refused, 10)
        sender = smtplib.SMTPSenderRefused(553, b"not owned", "l@x.com")
        assert "recusou o remetente" in explain_smtp_failure(sender, 10)
        assert "código 554" in explain_smtp_failure(smtplib.SMTPDataError(554, b"spam"), 10)
        assert "encerrou a conexão" in explain_smtp_failure(smtplib.SMTPServerDisconnected(), 10)
        assert "conexão segura (TLS)" in explain_smtp_failure(ssl.SSLError("x"), 10)
        assert "não resolve" in explain_smtp_failure(__import__("socket").gaierror("nome"), 10)
        assert "conectar" in explain_smtp_failure(ConnectionRefusedError(), 10)

    def test_a_connection_failure_never_echoes_the_exception_text(self, client, fake_smtp) -> None:
        fake_smtp.fail_at["connect"] = ConnectionRefusedError(
            111, f"refused by smtp.exemplo.com using {SECRET}"
        )
        issued = _issue(client)
        response = _send(client, issued["id"])
        assert response.status_code == 201 and response.json()["status"] == "na_fila"
        assert SECRET not in response.text and "smtp.exemplo.com" not in response.text

    def test_credentials_do_not_cross_the_network_in_the_clear(
        self, client, fake_smtp, monkeypatch
    ) -> None:
        monkeypatch.setattr(settings, "smtp_starttls", False)
        issued = _issue(client)
        response = _send(client, issued["id"])
        assert response.status_code == 503
        assert "sem TLS" in response.json()["detail"]
        assert fake_smtp.instances == []  # refused before connecting

    def test_a_local_test_server_may_skip_tls(self, client, fake_smtp, monkeypatch) -> None:
        monkeypatch.setattr(settings, "smtp_starttls", False)
        monkeypatch.setattr(settings, "smtp_host", "localhost")
        issued = _issue(client)
        assert _send(client, issued["id"]).status_code == 201

    def test_smtp_without_a_host_or_sender_is_a_503_that_names_the_gap(
        self, client, smtp_settings, monkeypatch, db_session: Session
    ) -> None:
        monkeypatch.setattr(settings, "smtp_host", "")
        monkeypatch.setattr(settings, "email_from", "")
        issued = _issue(client)
        response = _send(client, issued["id"])
        assert response.status_code == 503
        assert "SMTP_HOST e EMAIL_FROM" in response.json()["detail"]
        assert db_session.execute(select(ReportDelivery)).first() is None  # nothing was tried

    def test_an_unknown_provider_is_refused(self, client, monkeypatch) -> None:
        monkeypatch.setattr(settings, "email_provider", "ses")
        issued = _issue(client)
        response = _send(client, issued["id"])
        assert response.status_code == 503
        assert "EMAIL_PROVIDER desconhecido" in response.json()["detail"]

    def test_the_send_gate_refuses_instead_of_waiting_forever(self) -> None:
        gate = HeavyRequestGate(1, 0.01, busy_message="ocupado com e-mails")
        with gate.slot():
            with pytest.raises(ServerBusyError, match="ocupado com e-mails"):
                with gate.slot():
                    pass
        assert email_service.get_email_gate().busy_message


# --- the quota --------------------------------------------------------------


class TestQuota:
    def test_the_hourly_limit_is_per_account_and_answers_429(
        self, client, monkeypatch, other_user, login_as
    ) -> None:
        monkeypatch.setattr(settings, "rate_limit_enabled", True)
        monkeypatch.setattr(settings, "rate_limit_exports_per_minute", 1000)
        monkeypatch.setattr(settings, "rate_limit_email_per_hour", 2)
        issued = _issue(client)
        assert _send(client, issued["id"]).status_code == 201
        assert _send(client, issued["id"]).status_code == 201
        third = _send(client, issued["id"])
        assert third.status_code == 429
        assert "2 e-mail(s) de laudo na última hora" in third.json()["detail"]
        assert int(third.headers["retry-after"]) > 60
        # Somebody else's quota is their own: the refused account is not the other one.
        with login_as(other_user):
            assert _send(client, issued["id"]).status_code == 404

    def test_a_bad_request_does_not_spend_the_quota(self, client, monkeypatch) -> None:
        monkeypatch.setattr(settings, "rate_limit_enabled", True)
        monkeypatch.setattr(settings, "rate_limit_exports_per_minute", 1000)
        monkeypatch.setattr(settings, "rate_limit_email_per_hour", 1)
        issued = _issue(client)
        assert _send(client, issued["id"], recipients=["ruim"]).status_code == 400
        assert _send(client, issued["id"]).status_code == 201

    def test_zero_means_no_limit(self, client, monkeypatch) -> None:
        monkeypatch.setattr(settings, "rate_limit_enabled", True)
        monkeypatch.setattr(settings, "rate_limit_exports_per_minute", 1000)
        monkeypatch.setattr(settings, "rate_limit_email_per_hour", 0)
        issued = _issue(client)
        assert all(_send(client, issued["id"]).status_code == 201 for _ in range(4))


# --- sending again with one click (D-249) -----------------------------------


def _resend(client: TestClient, delivery_id: int):
    return client.post(f"/api/exports/envios/{delivery_id}/reenviar")


class TestResend:
    def test_it_sends_the_same_message_again_as_a_new_delivery(
        self, client, db_session: Session
    ) -> None:
        issued = _issue(client)
        first = _send(
            client,
            issued["id"],
            recipients=["um@empresa.com.br"],
            cc=["copia@empresa.com.br"],
            subject="Laudo do suporte",
            message="Segue.",
        ).json()
        response = _resend(client, first["id"])
        assert response.status_code == 201, response.text
        again = response.json()
        assert again["id"] != first["id"]
        assert again["recipients"] == ["um@empresa.com.br"]
        assert again["cc"] == ["copia@empresa.com.br"]
        assert again["subject"] == "Laudo do suporte" and again["message"] == "Segue."
        assert again["status"] == "simulado" and again["link_state"] == "ativo"
        rows = db_session.execute(select(ReportDelivery)).scalars().all()
        assert len(rows) == 2
        # Its own link: the two tokens are different hashes.
        assert len({row.token_hash for row in rows}) == 2

    def test_the_old_link_is_left_as_it_was(self, client) -> None:
        issued = _issue(client)
        first = _send(client, issued["id"]).json()
        _resend(client, first["id"])
        history = client.get(f"/api/exports/laudos/{issued['id']}/envios").json()
        assert [row["link_state"] for row in history] == ["ativo", "ativo"]

    def test_a_failed_send_can_be_sent_again(self, client, fake_smtp) -> None:
        issued = _issue(client)
        fake_smtp.fail_at = {
            "login": smtplib.SMTPAuthenticationError(535, b"recusado")
        }  # permanent: no queue
        assert _send(client, issued["id"]).status_code == 503
        failed = client.get(f"/api/exports/laudos/{issued['id']}/envios").json()[0]
        assert failed["status"] == "falhou"
        fake_smtp.fail_at = {}
        response = _resend(client, failed["id"])
        assert response.status_code == 201, response.text
        assert response.json()["status"] == "enviado"

    def test_the_resend_is_audited_with_the_delivery_it_repeats(self, client) -> None:
        issued = _issue(client)
        first = _send(client, issued["id"]).json()
        _resend(client, first["id"])
        events = client.get("/api/audit", params={"entity_type": "report_delivery"}).json()
        assert len(events) == 2
        assert any(
            event["changes"].get("reenvio_do_envio", {}).get("after") == first["id"]
            for event in events
        )
        assert "empresa.com.br" not in str(events)

    def test_it_counts_against_the_hourly_quota(self, client, monkeypatch) -> None:
        monkeypatch.setattr(settings, "rate_limit_enabled", True)
        monkeypatch.setattr(settings, "rate_limit_exports_per_minute", 1000)
        monkeypatch.setattr(settings, "rate_limit_email_per_hour", 2)
        issued = _issue(client)
        first = _send(client, issued["id"]).json()
        assert _resend(client, first["id"]).status_code == 201
        third = _resend(client, first["id"])
        assert third.status_code == 429
        assert "2 e-mail(s) de laudo na última hora" in third.json()["detail"]

    def test_the_reply_goes_to_whoever_resends(self, client, fake_smtp) -> None:
        issued = _issue(client)
        first = _send(client, issued["id"]).json()
        _resend(client, first["id"])
        assert fake_smtp.instances[1].sent[0]["Reply-To"] == "pesquisador@example.com"

    def test_only_the_owner_can_resend(self, client, other_user, login_as) -> None:
        issued = _issue(client)
        first = _send(client, issued["id"]).json()
        with login_as(other_user):
            assert _resend(client, first["id"]).status_code == 404
        assert _resend(client, 999999).status_code == 404

    def test_a_resend_carries_the_signed_pdf_that_arrived_after_the_first_send(
        self, client, fake_smtp
    ) -> None:
        issued = _issue(client)
        first = _send(client, issued["id"]).json()
        assert first["attached_pdf_sha256"] is None
        upload = client.post(
            f"/api/exports/laudos/{issued['id']}/pdf",
            content=b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n",
            headers={"content-type": "application/pdf"},
        )
        assert upload.status_code == 201, upload.text
        again = _resend(client, first["id"]).json()
        assert again["attached_pdf_sha256"] is not None


# --- the public, read-only copy ---------------------------------------------


class TestPublicCopy:
    def test_the_link_in_the_message_opens_the_frozen_laudo_without_a_login(
        self, client, anon_client, fixed_token, monkeypatch
    ) -> None:
        sent: list[OutgoingEmail] = []
        monkeypatch.setattr(email_service.MockEmailSender, "send", lambda _s, e: sent.append(e))
        issued = _issue(client)
        assert _send(client, issued["id"]).status_code == 201
        link = re.search(r'href="([^"]*/api/laudos/enviados/[^"]+)"', sent[0].html)
        assert link and link.group(1).endswith(f"/api/laudos/enviados/{fixed_token}")

        response = anon_client.get(f"/api/laudos/enviados/{fixed_token}")
        assert response.status_code == 200
        stored = client.get(f"/api/exports/estudos/{issued['study_id']}/laudo/versoes/1.html").text
        assert response.text == stored
        assert response.headers["content-type"].startswith("text/html")
        assert response.headers["content-security-policy"].startswith("default-src 'none'")
        assert "noindex" in response.headers["x-robots-tag"]
        assert response.headers["referrer-policy"] == "no-referrer"
        assert response.headers["cache-control"] == "private, no-store"
        assert response.headers["x-content-type-options"] == "nosniff"

    def test_it_is_read_only(self, client, anon_client, fixed_token) -> None:
        issued = _issue(client)
        _send(client, issued["id"])
        url = f"/api/laudos/enviados/{fixed_token}"
        for method in ("post", "put", "patch", "delete"):
            assert getattr(anon_client, method)(url).status_code in (404, 405)

    def test_the_token_is_stored_only_as_a_hash(
        self, client, fixed_token, db_session: Session
    ) -> None:
        issued = _issue(client)
        response = _send(client, issued["id"])
        row = db_session.execute(select(ReportDelivery)).scalars().one()
        assert row.token_hash == report_delivery_service.token_hash(fixed_token)
        assert fixed_token not in response.text
        assert fixed_token not in str(
            client.get(f"/api/exports/laudos/{issued['id']}/envios").json()
        )

    def test_an_unknown_or_malformed_token_is_a_plain_404(self, anon_client) -> None:
        assert anon_client.get("/api/laudos/enviados/" + "x" * 43).status_code == 404
        assert anon_client.get("/api/laudos/enviados/curto").status_code == 404
        assert anon_client.get("/api/laudos/enviados/" + "x" * 500).status_code == 404

    def test_a_link_that_never_reached_anyone_opens_nothing(
        self, client, anon_client, fake_smtp, fixed_token
    ) -> None:
        fake_smtp.fail_at["login"] = smtplib.SMTPAuthenticationError(535, b"no")
        issued = _issue(client)
        assert _send(client, issued["id"]).status_code == 503
        assert anon_client.get(f"/api/laudos/enviados/{fixed_token}").status_code == 404

    def test_each_send_has_its_own_link(self, client, monkeypatch) -> None:
        sent: list[OutgoingEmail] = []
        monkeypatch.setattr(email_service.MockEmailSender, "send", lambda _s, e: sent.append(e))
        issued = _issue(client)
        _send(client, issued["id"])
        _send(client, issued["id"])
        links = [re.search(r"/api/laudos/enviados/([\w-]+)", m.html).group(1) for m in sent]
        assert links[0] != links[1] and all(len(token) >= 40 for token in links)


# --- health -----------------------------------------------------------------


class TestHealth:
    def test_by_default_the_email_is_not_configured(self, client) -> None:
        body = client.get("/api/health").json()
        assert body["email_provider"] == "mock" and body["email_configured"] is False

    def test_smtp_with_host_and_sender_is_configured_and_exposes_no_secret(
        self, client, smtp_settings
    ) -> None:
        response = client.get("/api/health")
        body = response.json()
        assert body["email_provider"] == "smtp" and body["email_configured"] is True
        for secret in (SECRET, "smtp.exemplo.com", "envio@exemplo.com", "laudos@exemplo.com"):
            assert secret not in response.text

    def test_smtp_without_a_sender_is_not_configured(
        self, client, smtp_settings, monkeypatch
    ) -> None:
        monkeypatch.setattr(settings, "email_from", "")
        assert client.get("/api/health").json()["email_configured"] is False
