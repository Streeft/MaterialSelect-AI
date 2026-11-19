"""The queue that sends a laudo e-mail again when it failed for a passing reason (D-252).

``smtplib`` is the fake of ``test_laudo_email`` (no socket), and the clock is a parameter of
the attempt, so a retry that waits five minutes takes no time. What is proved here:

* a *transient* failure (server down, timeout, 4xx) queues the send with its next attempt; a
  *permanent* one (credentials, refused address) is final at once;
* the waits grow (5 min, 15 min, 45 min, 2 h 15 min) and, out of attempts, the row says
  ``falhou`` and how many it took;
* the message that finally goes carries a fresh link, and the queued one never had one;
* the hourly quota is spent once, by the person pressing Enviar, and a retry does not need it;
* two workers never take the same attempt, and a busy mail gate is not an attempt.
"""

# ruff: noqa: F811  (fixtures imported from test_laudo_email are used by name)

from __future__ import annotations

import re
import smtplib
import ssl
import threading
import time
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.domain.errors import ServerBusyError
from app.models.audit import AuditEvent
from app.models.report_delivery import ReportDelivery
from app.repositories.report_delivery_repository import ReportDeliveryRepository
from app.services import delivery_retry_worker, email_service
from app.services.delivery_retry_worker import DeliveryRetryWorker, start_delivery_retry_worker
from app.services.email_service import is_transient_smtp_failure
from app.services.report_delivery_service import (
    attempt_queued_delivery,
    process_due_deliveries,
    retry_delay,
)
from app.tests.conftest import _session_for
from app.tests.test_laudo_email import (  # noqa: F401
    FakeSMTP,
    _issue,
    _send,
    fake_smtp,
    smtp_settings,
)

DOWN = smtplib.SMTPServerDisconnected()
BAD_PASSWORD = smtplib.SMTPAuthenticationError(535, b"recusado")


def _row(db_session: Session) -> ReportDelivery:
    db_session.expire_all()
    return db_session.execute(select(ReportDelivery)).scalars().one()


def _queued(client, fake_smtp, db_session: Session) -> tuple[dict, ReportDelivery]:
    """A laudo whose first send failed because the mail server was down."""
    issued = _issue(client)
    fake_smtp.fail_at = {"connect": DOWN}
    response = _send(client, issued["id"])
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "na_fila"
    return issued, _row(db_session)


def _later(row: ReportDelivery, **delta) -> datetime:
    when = row.next_attempt_at
    assert when is not None
    return (when if when.tzinfo else when.replace(tzinfo=UTC)) + timedelta(**delta)


class TestWhatIsQueued:
    def test_a_passing_failure_waits_in_the_queue_with_its_next_attempt(
        self, client, fake_smtp, db_session: Session
    ) -> None:
        issued, row = _queued(client, fake_smtp, db_session)
        assert row.status == "na_fila" and row.attempts == 1
        assert row.error and "encerrou a conexão" in row.error
        assert row.reply_to == "pesquisador@example.com"
        wait = (_later(row) - row.created_at.replace(tzinfo=UTC)).total_seconds()
        assert wait == pytest.approx(300, abs=2)

        listed = client.get(f"/api/exports/laudos/{issued['id']}/envios").json()[0]
        assert listed["status"] == "na_fila" and listed["attempts"] == 1
        assert listed["max_attempts"] == settings.email_retry_max_attempts
        assert listed["next_attempt_at"] is not None
        # A message that has not gone has no link: nothing to open, nothing to expire.
        assert listed["link_state"] == "sem_link" and listed["expires_at"] is None

    def test_a_permanent_failure_is_final_at_once(
        self, client, fake_smtp, db_session: Session
    ) -> None:
        issued = _issue(client)
        fake_smtp.fail_at = {"login": BAD_PASSWORD}
        assert _send(client, issued["id"]).status_code == 503
        row = _row(db_session)
        assert row.status == "falhou" and row.attempts == 1 and row.next_attempt_at is None

    def test_with_the_queue_off_the_first_failure_is_final_as_before(
        self, client, fake_smtp, db_session: Session, monkeypatch
    ) -> None:
        monkeypatch.setattr(settings, "email_retry_max_attempts", 1)
        issued = _issue(client)
        fake_smtp.fail_at = {"connect": DOWN}
        assert _send(client, issued["id"]).status_code == 503
        assert _row(db_session).status == "falhou"

    def test_the_classification_of_what_is_passing_and_what_is_not(self) -> None:
        passing = [
            smtplib.SMTPServerDisconnected(),
            smtplib.SMTPConnectError(421, "x"),
            smtplib.SMTPDataError(451, b"try later"),
            TimeoutError(),
            ConnectionRefusedError(),
            ssl.SSLError("x"),
        ]
        permanent = [
            BAD_PASSWORD,
            smtplib.SMTPRecipientsRefused({"a@x.com": (550, b"no")}),
            smtplib.SMTPSenderRefused(553, b"no", "a@x.com"),
            smtplib.SMTPNotSupportedError("no tls"),
            smtplib.SMTPDataError(554, b"spam"),
            smtplib.SMTPException("something else"),
        ]
        assert all(is_transient_smtp_failure(e) for e in passing)
        assert not any(is_transient_smtp_failure(e) for e in permanent)

    def test_the_wait_grows_threefold_up_to_six_hours(self) -> None:
        minutes = [retry_delay(n).total_seconds() / 60 for n in (1, 2, 3, 4)]
        assert minutes == [5, 15, 45, 135]
        assert retry_delay(5) == timedelta(hours=6)
        assert retry_delay(500) == timedelta(hours=6)


class TestTheAttempts:
    def test_nothing_happens_before_the_time(
        self, client, fake_smtp, db_session: Session, _connection
    ) -> None:
        _, row = _queued(client, fake_smtp, db_session)
        before = len(fake_smtp.instances)
        made = process_due_deliveries(lambda: _session_for(_connection), _later(row, seconds=-60))
        assert made == 0 and len(fake_smtp.instances) == before

    def test_when_the_server_is_back_the_message_goes_with_a_fresh_link(
        self, client, anon_client, fake_smtp, db_session: Session, _connection
    ) -> None:
        issued, row = _queued(client, fake_smtp, db_session)
        old_hash = row.token_hash
        fake_smtp.fail_at = {}
        made = process_due_deliveries(lambda: _session_for(_connection), _later(row))
        assert made == 1

        row = _row(db_session)
        assert row.status == "enviado" and row.attempts == 2
        assert row.error is None and row.next_attempt_at is None
        assert row.token_hash != old_hash and row.expires_at is not None
        message, _from, envelope = fake_smtp.instances[-1].sent
        assert envelope == ["cliente@empresa.com.br"]
        assert message["Reply-To"] == "pesquisador@example.com"
        html = message.get_body(("html",)).get_content()
        token = re.search(r"/api/laudos/enviados/([A-Za-z0-9_-]+)", html).group(1)
        # The link that went out opens the frozen laudo; it is the only one there is.
        assert anon_client.get(f"/api/laudos/enviados/{token}").status_code == 200
        listed = client.get(f"/api/exports/laudos/{issued['id']}/envios").json()[0]
        assert listed["status"] == "enviado" and listed["attempts"] == 2
        assert listed["link_state"] == "ativo" and listed["next_attempt_at"] is None

    def test_a_queued_message_has_no_working_link(self, client, anon_client, fake_smtp, db_session):
        _queued(client, fake_smtp, db_session)
        sent_before = [i.sent for i in fake_smtp.instances if i.sent]
        assert sent_before == []
        assert anon_client.get("/api/laudos/enviados/" + "x" * 43).status_code == 404

    def test_it_keeps_trying_with_growing_waits_and_then_says_how_many_it_took(
        self, client, fake_smtp, db_session: Session, _connection
    ) -> None:
        issued, row = _queued(client, fake_smtp, db_session)
        waits = []
        clock = _later(row)
        for expected_attempts in (2, 3, 4):
            assert (
                process_due_deliveries(lambda: _session_for(_connection), clock) == 1
            ), expected_attempts
            row = _row(db_session)
            assert row.status == "na_fila" and row.attempts == expected_attempts
            waits.append((_later(row) - clock).total_seconds() / 60)
            clock = _later(row)
        assert waits == [15, 45, 135]

        assert process_due_deliveries(lambda: _session_for(_connection), clock) == 1
        row = _row(db_session)
        assert row.status == "falhou" and row.attempts == 5
        assert row.next_attempt_at is None and "encerrou a conexão" in row.error
        listed = client.get(f"/api/exports/laudos/{issued['id']}/envios").json()[0]
        assert listed["status"] == "falhou" and listed["attempts"] == 5
        # Done: the queue never picks it up again, and the engineer may send a new one.
        assert process_due_deliveries(lambda: _session_for(_connection), clock) == 0
        fake_smtp.fail_at = {}
        assert client.post(f"/api/exports/envios/{row.id}/reenviar").status_code == 201

    def test_a_permanent_failure_on_a_retry_ends_it_there(
        self, client, fake_smtp, db_session: Session, _connection
    ) -> None:
        _, row = _queued(client, fake_smtp, db_session)
        fake_smtp.fail_at = {"login": BAD_PASSWORD}
        assert process_due_deliveries(lambda: _session_for(_connection), _later(row)) == 1
        row = _row(db_session)
        assert row.status == "falhou" and row.attempts == 2 and row.next_attempt_at is None
        assert "recusou o usuário ou a senha" in row.error

    def test_a_busy_mail_gate_is_not_an_attempt(
        self, client, fake_smtp, db_session: Session, _connection, monkeypatch
    ) -> None:
        _, row = _queued(client, fake_smtp, db_session)

        def busy(_self, _email):
            raise ServerBusyError("ocupado", 5)

        monkeypatch.setattr(email_service.SmtpEmailSender, "send", busy)
        moment = _later(row)
        with _session_for(_connection) as db:
            assert attempt_queued_delivery(db, row.id, moment) == "ocupado"
        row = _row(db_session)
        assert row.status == "na_fila" and row.attempts == 1
        assert (_later(row) - moment).total_seconds() == pytest.approx(60, abs=1)

    def test_an_attempt_that_is_already_taken_is_not_taken_twice(
        self, client, fake_smtp, db_session: Session, _connection
    ) -> None:
        _, row = _queued(client, fake_smtp, db_session)
        repo = ReportDeliveryRepository(db_session)
        moment = _later(row)
        assert repo.claim_due(row.id, moment, moment + timedelta(minutes=10)) is True
        # The second worker finds it leased: no attempt, no second message.
        assert repo.claim_due(row.id, moment, moment + timedelta(minutes=10)) is False
        before = len(fake_smtp.instances)
        fake_smtp.fail_at = {}
        with _session_for(_connection) as db:
            assert attempt_queued_delivery(db, row.id, moment) == "nao_devido"
        assert len(fake_smtp.instances) == before

    def test_a_crash_in_the_middle_leaves_the_message_due_again_after_the_lease(
        self, client, fake_smtp, db_session: Session, _connection
    ) -> None:
        _, row = _queued(client, fake_smtp, db_session)
        moment = _later(row)
        ReportDeliveryRepository(db_session).claim_due(
            row.id, moment, moment + timedelta(minutes=10)
        )
        fake_smtp.fail_at = {}
        later = moment + timedelta(minutes=11)
        assert process_due_deliveries(lambda: _session_for(_connection), later) == 1
        assert _row(db_session).status == "enviado"

    def test_a_version_that_vanished_ends_the_queued_send(
        self, client, fake_smtp, db_session: Session, _connection
    ) -> None:
        issued, row = _queued(client, fake_smtp, db_session)
        db_session.execute(ReportDelivery.__table__.update().values(issued_report_id=99999999))
        db_session.commit()
        assert process_due_deliveries(lambda: _session_for(_connection), _later(row)) == 1
        row = _row(db_session)
        assert row.status == "falhou" and "não existe mais" in row.error


class TestQuotaAndAudit:
    def test_the_quota_is_spent_once_by_the_person_and_not_again_by_the_retry(
        self, client, fake_smtp, db_session: Session, _connection, monkeypatch
    ) -> None:
        monkeypatch.setattr(settings, "rate_limit_enabled", True)
        monkeypatch.setattr(settings, "rate_limit_exports_per_minute", 1000)
        monkeypatch.setattr(settings, "rate_limit_email_per_hour", 1)
        issued, row = _queued(client, fake_smtp, db_session)
        fake_smtp.fail_at = {}
        # The retry goes although the hour's only e-mail was already spent on this message…
        assert process_due_deliveries(lambda: _session_for(_connection), _later(row)) == 1
        assert _row(db_session).status == "enviado"
        # …and a new send by the same person is what the quota refuses.
        assert _send(client, issued["id"]).status_code == 429

    def test_queued_and_final_changes_are_audited_without_addresses(
        self, client, fake_smtp, db_session: Session, _connection
    ) -> None:
        _, row = _queued(client, fake_smtp, db_session)
        fake_smtp.fail_at = {}
        process_due_deliveries(lambda: _session_for(_connection), _later(row))
        events = db_session.execute(select(AuditEvent)).scalars().all()
        changes = [e.changes for e in events if e.entity_type.value == "report_delivery"]
        assert any(c["status"]["after"] == "na_fila" for c in changes if "status" in c)
        assert any(
            c.get("status", {}).get("before") == "na_fila"
            and c["status"]["after"] == "enviado"
            and c["tentativas"]["after"] == 2
            for c in changes
        )
        assert "empresa.com.br" not in str(changes)


class TestCancelAndResend:
    def test_the_engineer_can_cancel_a_queued_send(
        self, client, fake_smtp, db_session: Session, _connection
    ) -> None:
        _, row = _queued(client, fake_smtp, db_session)
        due = _later(row)
        response = client.post(f"/api/exports/envios/{row.id}/revogar")
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "falhou"
        assert "cancelado" in response.json()["error"]
        fake_smtp.fail_at = {}
        assert process_due_deliveries(lambda: _session_for(_connection), due) == 0
        assert _row(db_session).next_attempt_at is None

    def test_a_queued_send_cannot_be_sent_again_on_top_of_itself(
        self, client, fake_smtp, db_session: Session
    ) -> None:
        _, row = _queued(client, fake_smtp, db_session)
        response = client.post(f"/api/exports/envios/{row.id}/reenviar")
        assert response.status_code == 400 and "na fila" in response.json()["detail"]


class TestTheLoop:
    def test_it_is_off_without_smtp_and_without_retries(self, monkeypatch) -> None:
        assert start_delivery_retry_worker() is None  # EMAIL_PROVIDER=mock, as in every test
        monkeypatch.setattr(settings, "email_provider", "smtp")
        monkeypatch.setattr(settings, "email_retry_max_attempts", 1)
        assert start_delivery_retry_worker() is None

    def test_with_smtp_it_ticks_until_it_is_stopped(self, monkeypatch) -> None:
        monkeypatch.setattr(settings, "email_provider", "smtp")
        monkeypatch.setattr(settings, "email_retry_poll_seconds", 1)
        ticks = threading.Event()
        calls: list[int] = []

        def fake_process(_factory) -> int:
            calls.append(1)
            if len(calls) >= 2:
                ticks.set()
            return 0

        monkeypatch.setattr(delivery_retry_worker, "process_due_deliveries", fake_process)
        worker = DeliveryRetryWorker(lambda: None, 0.05)  # type: ignore[arg-type,return-value]
        worker.start()
        assert worker.running and ticks.wait(5)
        worker.stop()
        assert not worker.running
        settled = len(calls)
        time.sleep(0.2)
        assert len(calls) == settled

    def test_a_tick_that_raises_does_not_kill_the_loop(self, monkeypatch) -> None:
        def boom(_factory) -> int:
            raise RuntimeError("banco dormindo")

        monkeypatch.setattr(delivery_retry_worker, "process_due_deliveries", boom)
        worker = DeliveryRetryWorker(lambda: None, 0.05)  # type: ignore[arg-type,return-value]
        assert worker.run_once() == 0

    def test_the_app_starts_and_stops_with_the_worker_in_its_lifespan(self, monkeypatch) -> None:
        from fastapi.testclient import TestClient

        from app.main import app

        started: list[str] = []

        class Spy:
            def stop(self) -> None:
                started.append("stop")

        monkeypatch.setattr(
            delivery_retry_worker,
            "start_delivery_retry_worker",
            lambda *_a: started.append("start") or Spy(),
        )
        with TestClient(app):
            assert started == ["start"]
        assert started == ["start", "stop"]
