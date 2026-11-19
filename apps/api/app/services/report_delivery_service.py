"""E-mailing an issued laudo to a client, and the record of having done so (D-242).

The service decides nothing about the laudo: it reads the frozen version (never
re-renders it), writes the message around it and hands it to the provider. What it
does own is the rule about *who may*: only the owner of the issued version — the
laudo is looked up in the caller's own project, and anyone else's id is the same
404 as one that does not exist. A draft cannot be sent because a draft has no
issued id to send; asking for one that is not an issued laudo says so.

Every attempt leaves a ``ReportDelivery`` row, **including the failed ones** and
the ones the ``mock`` provider only simulated (status ``simulado``, never
``enviado``), and an audit entry beside it, in the same transaction. The public
link in the message carries a token that is stored only as its SHA-256.

D-243 gave that link a life of its own. It **expires** (each send stores its own
``expires_at``, ``REPORT_LINK_TTL_DAYS`` after the send), the owner can **revoke** it, and
every opening is **counted** — three numbers and no visitor data. An expired or revoked
link answers 410 with a friendly page and none of the laudo. And when the engineer has
uploaded the signed PDF, the message carries **that PDF in place of the ``.html``**.

D-252 added the **queue**. A send that fails for a *passing* reason (the mail server down, a
timeout, a ``4xx``) is not lost and not final: its row says ``na_fila`` with the time of the
next attempt, and the API process tries again with growing waits (``EMAIL_RETRY_BASE_SECONDS``
× 3ⁿ, six hours at most) until ``EMAIL_RETRY_MAX_ATTEMPTS`` attempts in all. Then the row
says ``falhou`` and how many attempts it took. A permanent failure (credentials, refused
address) is final at once. The quota (``RATE_LIMIT_EMAIL_PER_HOUR``) is spent **once, when the
engineer presses Enviar**; the retries are the same message, not new ones, and are bounded by
the attempts. A queued send has no link yet: its token is made on the attempt that succeeds
(nothing was delivered before, so no link can be in anyone's hands).
"""

from __future__ import annotations

import hashlib
import logging
import re
import secrets
import unicodedata
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.domain.email_address import (
    MAX_CC,
    MAX_RECIPIENTS,
    clean_addresses,
    clean_message,
    clean_subject,
    is_valid_address,
)
from app.domain.errors import (
    NotFoundError,
    ServerBusyError,
    ServiceUnavailableError,
    ValidationError,
)
from app.exporters.laudo import recommended_name, short_code
from app.exporters.laudo_email import LaudoEmail, default_subject, render_html, render_text
from app.exporters.xml_text import xml_legal
from app.models.enums import AuditAction, AuditEntityType
from app.models.issued_report import IssuedReport
from app.models.report_delivery import (
    DELIVERY_FAILED,
    DELIVERY_QUEUED,
    DELIVERY_SENT,
    DELIVERY_SIMULATED,
    ReportDelivery,
)
from app.models.user import User
from app.repositories.audit_repository import AuditRepository
from app.repositories.issued_report_pdf_repository import IssuedReportPdfRepository
from app.repositories.issued_report_repository import IssuedReportRepository
from app.repositories.report_delivery_repository import ReportDeliveryRepository
from app.schemas.report_delivery import (
    LaudoEmailPreviewOut,
    LaudoSendRequest,
    ReportDeliveryOut,
)
from app.services.audit_service import record_change
from app.services.email_service import (
    EmailAttachment,
    EmailSendError,
    OutgoingEmail,
    TransientEmailSendError,
    get_email_sender,
)
from app.services.laudo_service import verify_url
from app.services.rate_limit_service import check_email_quota

logger = logging.getLogger(__name__)

PUBLIC_PATH = "/api/laudos/enviados/"
NOT_ISSUED = (
    "Laudo emitido não encontrado. Só um laudo emitido pode ser enviado: "
    "emita uma versão antes de enviá-la ao cliente."
)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def public_url(token: str) -> str:
    """The read-only copy a client opens: same host the verification link uses."""
    return f"{settings.backend_base_url.rstrip('/')}{PUBLIC_PATH}{token}"


def attachment_filename(study_name: str, version: int, *, signed_pdf: bool = False) -> str:
    """``laudo-<study>-v2.html`` (or ``…-v2-assinado.pdf``), ASCII, so every client shows it alike."""
    folded = unicodedata.normalize("NFKD", study_name).encode("ascii", "ignore").decode()
    stem = re.sub(r"[^A-Za-z0-9]+", "-", folded).strip("-").lower()[:60] or "estudo"
    return (
        f"laudo-{stem}-v{version}-assinado.pdf" if signed_pdf else f"laudo-{stem}-v{version}.html"
    )


# --- The retry queue (D-252) ---------------------------------------------------

#: The longest the queue waits between two attempts, however many have failed.
RETRY_MAX_DELAY = timedelta(hours=6)
#: How long an attempt in progress keeps the row to itself (``claim_due``); if the process dies
#: in the middle of it, the queue picks the message up again when this runs out.
RETRY_LEASE = timedelta(minutes=10)
#: What an attempt waits when the send gate is full: the server is busy, not the message wrong,
#: so it is not counted as an attempt.
BUSY_DELAY = timedelta(seconds=60)
CANCELLED = "Envio cancelado antes de a fila tentar de novo."
REPORT_GONE = "A versão do laudo deste envio não existe mais."


def retry_delay(attempts_done: int) -> timedelta:
    """The wait before the next attempt, after ``attempts_done`` failed ones: base × 3ⁿ⁻¹.

    300 s by default: 5 min, 15 min, 45 min, 2 h 15 min, then 6 h at most.
    """
    base = timedelta(seconds=settings.email_retry_base_seconds)
    exponent = max(attempts_done - 1, 0)
    # Cap the exponent first: 3**n grows fast and a timedelta that large is an OverflowError.
    if exponent >= 12:
        return RETRY_MAX_DELAY
    return min(base * (3**exponent), RETRY_MAX_DELAY)


# --- The life of the link (D-243) --------------------------------------------

LINK_ACTIVE = "ativo"
LINK_EXPIRED = "vencido"
LINK_REVOKED = "revogado"
LINK_NONE = "sem_link"


def _aware(moment: datetime | None) -> datetime | None:
    """A stored time as UTC-aware (SQLite hands back naive ones; they were written as UTC)."""
    if moment is None:
        return None
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


def link_ttl() -> timedelta:
    return timedelta(days=settings.report_link_ttl_days)


def effective_expiry(delivery: ReportDelivery) -> datetime | None:
    """When the link stops: its own stored date, else the send time plus today's validity.

    Only a row written before D-243 has no stored date; counting it from its send keeps an
    old link from being immortal, and moving ``REPORT_LINK_TTL_DAYS`` moves only those.
    """
    stored = _aware(delivery.expires_at)
    if stored is not None:
        return stored
    created = _aware(delivery.created_at)
    return created + link_ttl() if created is not None else None


def link_state(delivery: ReportDelivery, now: datetime | None = None) -> str:
    """``ativo`` | ``vencido`` | ``revogado``, or ``sem_link`` for a send that failed or still waits.

    Revoked wins over expired: the owner's decision is the more informative fact.
    """
    if delivery.status in (DELIVERY_FAILED, DELIVERY_QUEUED):
        return LINK_NONE
    if delivery.revoked_at is not None:
        return LINK_REVOKED
    expiry = effective_expiry(delivery)
    moment = now or datetime.now(UTC)
    if expiry is not None and moment >= expiry:
        return LINK_EXPIRED
    return LINK_ACTIVE


class ReportDeliveryService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.issued = IssuedReportRepository(db)
        self.deliveries = ReportDeliveryRepository(db)
        self.pdfs = IssuedReportPdfRepository(db)
        self.audit = AuditRepository(db)

    # --- reading -------------------------------------------------------------

    def _owned(self, project_id: int, issued_id: int) -> IssuedReport:
        report = self.issued.get_owned(project_id, issued_id)
        if report is None:
            raise NotFoundError(NOT_ISSUED)
        return report

    def history(self, project_id: int, issued_id: int) -> list[ReportDeliveryOut]:
        report = self._owned(project_id, issued_id)
        return [self.out(d) for d in self.deliveries.list_for_report(project_id, report.id)]

    @staticmethod
    def out(delivery: ReportDelivery, now: datetime | None = None) -> ReportDeliveryOut:
        state = link_state(delivery, now)
        return ReportDeliveryOut(
            id=delivery.id,
            issued_report_id=delivery.issued_report_id,
            recipients=list(delivery.recipients),
            cc=list(delivery.cc),
            subject=delivery.subject,
            message=delivery.message,
            status=delivery.status,  # type: ignore[arg-type]
            provider=delivery.provider,
            error=delivery.error,
            created_at=_aware(delivery.created_at),  # type: ignore[arg-type]
            sent_by=delivery.sent_by_email,
            # A failed send never made a link: nothing to expire, nothing to open.
            expires_at=None if state == LINK_NONE else effective_expiry(delivery),
            link_state=state,  # type: ignore[arg-type]
            revoked_at=_aware(delivery.revoked_at),
            open_count=delivery.open_count or 0,
            first_opened_at=_aware(delivery.first_opened_at),
            last_opened_at=_aware(delivery.last_opened_at),
            attached_pdf_sha256=delivery.attached_pdf_sha256,
            attempts=delivery.attempts or 1,
            max_attempts=max(settings.email_retry_max_attempts, delivery.attempts or 1),
            next_attempt_at=(
                _aware(delivery.next_attempt_at) if delivery.status == DELIVERY_QUEUED else None
            ),
        )

    # --- the message ---------------------------------------------------------

    def _reply_to(self, payload: LaudoSendRequest) -> str | None:
        """The engineer's address for ``Reply-To`` (D-249): the account that sends.

        The account is the engineer who issued the laudo, so a client's "Responder" reaches the
        person who signed it, not the shared sender of the deployment. An account address that
        does not read as a plain address is left out rather than written into a header.
        """
        address = (self.user.email or "").strip()
        if payload.reply_to_engineer and is_valid_address(address):
            return address
        return None

    @staticmethod
    def _email(
        report: IssuedReport,
        message: str | None,
        link: str | None,
        *,
        signed_pdf: bool,
        valid_until: date | None,
    ) -> LaudoEmail:
        return LaudoEmail(
            study_name=report.study_name,
            version=report.version,
            engineer_name=report.engineer_name,
            engineer_title=report.engineer_title,
            material=recommended_name(report.html),
            short_code=short_code(report.content_sha256),
            public_url=link,
            verify_url=verify_url(report.content_sha256),
            message=message,
            attachment_name=attachment_filename(
                report.study_name, report.version, signed_pdf=signed_pdf
            ),
            signed_pdf=signed_pdf,
            valid_until=valid_until,
        )

    @classmethod
    def compose(
        cls,
        report: IssuedReport,
        pdf,
        *,
        to: list[str],
        cc: list[str],
        subject: str,
        message: str | None,
        reply_to: str | None,
        token: str,
        expires_at: datetime,
    ) -> OutgoingEmail:
        """The message that goes out: the first attempt and every retry build it here.

        The signed PDF, when the engineer uploaded one, goes in place of the ``.html``: it is
        the document that was signed, and sending both would leave the client wondering which
        one counts (the HTML stays one click away, in the link).
        """
        mail = cls._email(
            report,
            message,
            public_url(token),
            signed_pdf=pdf is not None,
            valid_until=expires_at.date(),
        )
        attachment = (
            EmailAttachment(
                filename=mail.attachment_name,
                content=pdf.content,
                maintype="application",
                subtype="pdf",
            )
            if pdf is not None
            else EmailAttachment(filename=mail.attachment_name, content=report.html.encode("utf-8"))
        )
        return OutgoingEmail(
            to=tuple(to),
            cc=tuple(cc),
            subject=subject,
            text=render_text(mail),
            html=render_html(mail),
            attachments=(attachment,),
            reply_to=reply_to,
        )

    def preview(
        self, project_id: int, issued_id: int, payload: LaudoSendRequest
    ) -> LaudoEmailPreviewOut:
        """What would go out, without a token, a row or a send."""
        report = self._owned(project_id, issued_id)
        expires = datetime.now(UTC) + link_ttl()
        has_pdf = self.pdfs.latest_meta(report.id) is not None
        mail = self._email(
            report,
            clean_message(payload.message),
            None,
            signed_pdf=has_pdf,
            valid_until=expires.date(),
        )
        subject = clean_subject(payload.subject) or default_subject(
            report.study_name, report.version
        )
        return LaudoEmailPreviewOut(
            subject=subject,
            html=render_html(mail),
            text=render_text(mail),
            attachment_name=mail.attachment_name,
            signed_pdf=has_pdf,
            link_expires_at=expires,
            provider=settings.email_provider_name,
            email_configured=settings.email_configured,
            reply_to=self._reply_to(payload),
        )

    # --- sending -------------------------------------------------------------

    def send(
        self,
        project_id: int,
        issued_id: int,
        payload: LaudoSendRequest,
        *,
        resend_of: int | None = None,
    ) -> ReportDeliveryOut:
        report = self._owned(project_id, issued_id)
        to = clean_addresses(
            payload.recipients, label="Destinatários", minimum=1, maximum=MAX_RECIPIENTS
        )
        cc = clean_addresses(
            payload.cc,
            label="Cópia",
            minimum=0,
            maximum=MAX_CC,
            exclude=frozenset(a.lower() for a in to),
        )
        subject = clean_subject(payload.subject) or default_subject(
            report.study_name, report.version
        )
        message = clean_message(payload.message)
        sender = get_email_sender()  # a gap in the configuration is a 503 that says which
        check_email_quota(self.user.id)

        token = secrets.token_urlsafe(32)
        now = datetime.now(UTC)
        expires_at = now + link_ttl()
        pdf = self.pdfs.latest(report.id)
        reply_to = self._reply_to(payload)
        outgoing = self.compose(
            report,
            pdf,
            to=to,
            cc=cc,
            subject=subject,
            message=message,
            reply_to=reply_to,
            token=token,
            expires_at=expires_at,
        )

        status, error, next_attempt = DELIVERY_SENT, None, None
        try:
            sender.send(outgoing)
            if sender.provider == "mock":
                status = DELIVERY_SIMULATED
        except TransientEmailSendError as exc:
            # A passing reason: the message waits in the queue (D-252) unless the queue is off.
            error = str(exc)[:300]
            if settings.email_retry_max_attempts > 1:
                status, next_attempt = DELIVERY_QUEUED, now + retry_delay(1)
            else:
                status = DELIVERY_FAILED
        except EmailSendError as exc:
            status, error = DELIVERY_FAILED, str(exc)[:300]

        delivery = ReportDelivery(
            issued_report_id=report.id,
            project_id=project_id,
            sent_by_id=self.user.id,
            sent_by_email=self.user.email,
            recipients=to,
            cc=cc,
            subject=subject,
            message=message,
            status=status,
            provider=sender.provider,
            error=error,
            token_hash=token_hash(token),
            created_at=now,
            expires_at=expires_at,
            attached_pdf_sha256=pdf.sha256 if pdf is not None else None,
            attempts=1,
            next_attempt_at=next_attempt,
            reply_to=reply_to,
        )
        self.deliveries.add(delivery)
        self.deliveries.flush()
        # Counts, never addresses: the trail is read by more people than the history is.
        record_change(
            self.audit,
            self.user,
            entity_type=AuditEntityType.REPORT_DELIVERY,
            entity_id=delivery.id,
            entity_label=xml_legal(f"Laudo «{report.study_name}» v{report.version}")[:200],
            action=AuditAction.CRIADO,
            changes={
                "status": {"before": None, "after": status},
                "destinatarios": {"before": None, "after": len(to) + len(cc)},
                "anexo": {"before": None, "after": "pdf assinado" if pdf is not None else "html"},
                **(
                    {"reenvio_do_envio": {"before": None, "after": resend_of}}
                    if resend_of is not None
                    else {}
                ),
            },
            project_id=project_id,
        )
        self.deliveries.commit()
        if status == DELIVERY_FAILED:
            raise ServiceUnavailableError(error or "Não foi possível enviar o e-mail.")
        return self.out(delivery)

    # --- sending again -------------------------------------------------------

    def resend(self, project_id: int, delivery_id: int) -> ReportDeliveryOut:
        """Send an earlier message again, with one click (D-249): same people, subject and text.

        It is a **new** send, not a revival: it gets its own row, its own link and its own
        validity, counts against ``RATE_LIMIT_EMAIL_PER_HOUR`` like any other, and leaves the
        old link as it was (the owner revokes it separately if it should stop). The attachment
        is whatever the version carries *now* — if the signed PDF arrived after the first send,
        the new message carries it. A failed send can be sent again the same way.
        """
        delivery = self.deliveries.get_owned(project_id, delivery_id)
        if delivery is None:
            raise NotFoundError("Envio não encontrado.")
        if delivery.status == DELIVERY_QUEUED:
            raise ValidationError(
                "Este envio ainda está na fila e será tentado de novo sozinho. "
                "Cancele-o antes, se quiser mandar outro agora."
            )
        payload = LaudoSendRequest(
            recipients=list(delivery.recipients),
            cc=list(delivery.cc),
            subject=delivery.subject,
            message=delivery.message,
        )
        return self.send(project_id, delivery.issued_report_id, payload, resend_of=delivery.id)

    # --- revoking ------------------------------------------------------------

    def _cancel_queued(self, delivery: ReportDelivery) -> ReportDeliveryOut:
        """Take a message out of the queue (D-252): it never had a link, so there is none to end."""
        delivery.status = DELIVERY_FAILED
        delivery.next_attempt_at = None
        delivery.error = CANCELLED
        report = self.deliveries.report_of(delivery)
        label = f"Laudo «{report.study_name}» v{report.version}" if report else "Laudo"
        record_change(
            self.audit,
            self.user,
            entity_type=AuditEntityType.REPORT_DELIVERY,
            entity_id=delivery.id,
            entity_label=xml_legal(label)[:200],
            action=AuditAction.ATUALIZADO,
            changes={"status": {"before": DELIVERY_QUEUED, "after": "cancelado"}},
            project_id=delivery.project_id,
        )
        self.deliveries.commit()
        return self.out(delivery)

    def revoke(self, project_id: int, delivery_id: int) -> ReportDeliveryOut:
        """End a client link at the owner's request. Idempotent: a second revoke changes nothing.

        On a message still in the queue (D-252) it **cancels** the send instead: there is no
        link yet, and "revogar" would be the wrong word for stopping an e-mail from leaving.
        """
        delivery = self.deliveries.get_owned(project_id, delivery_id)
        if delivery is None:
            raise NotFoundError("Envio não encontrado.")
        if delivery.status == DELIVERY_QUEUED:
            return self._cancel_queued(delivery)
        if delivery.status == DELIVERY_FAILED:
            raise ValidationError("Este envio falhou e não gerou link: não há o que revogar.")
        if delivery.revoked_at is None:
            delivery.revoked_at = datetime.now(UTC)
            delivery.revoked_by_id = self.user.id
            report = self.deliveries.report_of(delivery)
            label = f"Laudo «{report.study_name}» v{report.version}" if report else "Laudo"
            record_change(
                self.audit,
                self.user,
                entity_type=AuditEntityType.REPORT_DELIVERY,
                entity_id=delivery.id,
                entity_label=xml_legal(label)[:200],
                action=AuditAction.ATUALIZADO,
                changes={"link": {"before": LINK_ACTIVE, "after": LINK_REVOKED}},
                project_id=project_id,
            )
            self.deliveries.commit()
        return self.out(delivery)


@dataclass(frozen=True)
class PublicLink:
    """What a token resolves to: the delivery, its frozen laudo and the state of the link."""

    delivery: ReportDelivery
    report: IssuedReport
    state: str


def resolve_public_link(db: Session, token: str, now: datetime | None = None) -> PublicLink:
    """The laudo a link opens, and whether the link still may. Unknown, malformed or
    failed-delivery tokens are the same 404; a known token that is revoked or expired is
    returned with that state, so the route can answer 410 without any of the content."""
    repo = ReportDeliveryRepository(db)
    delivery = repo.find_by_token_hash(token_hash(token)) if 20 <= len(token) <= 80 else None
    report = repo.report_of(delivery) if delivery is not None else None
    if delivery is None or report is None:
        raise NotFoundError("Este link não existe ou não está mais disponível.")
    return PublicLink(delivery=delivery, report=report, state=link_state(delivery, now))


def record_link_open(db: Session, delivery: ReportDelivery) -> None:
    """Count one opening of the link: times and a number, nothing about the visitor."""
    ReportDeliveryRepository(db).record_open(delivery.id, datetime.now(UTC))
    db.commit()


# --- The queue's attempts (D-252) ----------------------------------------------


def attempt_queued_delivery(db: Session, delivery_id: int, now: datetime | None = None) -> str:
    """One attempt at a queued message, by the queue and not by a request.

    Answers what happened, in a word, for the log and the tests: ``nao_devido`` (another worker
    got it, or it is not due), ``ocupado`` (the send gate was full: tried again in a minute, no
    attempt counted), ``enviado``, ``simulado``, ``na_fila`` (failed again, waits for the next
    one) or ``falhou`` (out of attempts, or a permanent failure).

    The message is rebuilt from the row exactly as the first attempt built it, with **one new
    token**: the first attempt never delivered anything, so its token reached nobody, and the
    link that goes out now is the only one that exists.
    """
    moment = now or datetime.now(UTC)
    repo = ReportDeliveryRepository(db)
    if not repo.claim_due(delivery_id, moment, moment + RETRY_LEASE):
        return "nao_devido"
    delivery = repo.get(delivery_id)
    if delivery is None:
        return "nao_devido"
    report = repo.report_of(delivery)
    if report is None:
        return _finish_failed(db, delivery, REPORT_GONE, label="Laudo")

    label = f"Laudo «{report.study_name}» v{report.version}"
    token = secrets.token_urlsafe(32)
    expires_at = moment + link_ttl()
    pdf = IssuedReportPdfRepository(db).latest(report.id)
    outcome: str
    error: str | None = None
    try:
        sender = get_email_sender()
        outgoing = ReportDeliveryService.compose(
            report,
            pdf,
            to=list(delivery.recipients),
            cc=list(delivery.cc),
            subject=delivery.subject,
            message=delivery.message,
            reply_to=delivery.reply_to,
            token=token,
            expires_at=expires_at,
        )
        sender.send(outgoing)
        outcome = DELIVERY_SIMULATED if sender.provider == "mock" else DELIVERY_SENT
    except ServerBusyError:
        delivery.next_attempt_at = moment + BUSY_DELAY
        db.commit()
        return "ocupado"
    except (TransientEmailSendError, ServiceUnavailableError) as exc:
        # A gap in the configuration is as passing as a server down: someone may be fixing it.
        outcome, error = DELIVERY_QUEUED, str(exc)[:300]
    except EmailSendError as exc:
        outcome, error = DELIVERY_FAILED, str(exc)[:300]

    before_attempts = delivery.attempts or 1
    delivery.attempts = before_attempts + 1
    if outcome in (DELIVERY_SENT, DELIVERY_SIMULATED):
        delivery.status = outcome
        delivery.error = None
        delivery.next_attempt_at = None
        delivery.token_hash = token_hash(token)
        delivery.expires_at = expires_at
        delivery.attached_pdf_sha256 = pdf.sha256 if pdf is not None else None
        delivery.provider = sender.provider
    elif outcome == DELIVERY_QUEUED and delivery.attempts < settings.email_retry_max_attempts:
        delivery.status = DELIVERY_QUEUED
        delivery.error = error
        delivery.next_attempt_at = moment + retry_delay(delivery.attempts)
    else:
        delivery.status = DELIVERY_FAILED
        delivery.error = error
        delivery.next_attempt_at = None
        outcome = DELIVERY_FAILED
    _audit_attempt(db, delivery, label, before_attempts)
    db.commit()
    return outcome


def _finish_failed(db: Session, delivery: ReportDelivery, reason: str, *, label: str) -> str:
    delivery.status = DELIVERY_FAILED
    delivery.error = reason
    delivery.next_attempt_at = None
    _audit_attempt(db, delivery, label, delivery.attempts or 1)
    db.commit()
    return DELIVERY_FAILED


def _audit_attempt(db: Session, delivery: ReportDelivery, label: str, before_attempts: int) -> None:
    """One audit entry when the queue changes how a message stands, for the account that sent it.

    Only a change of status is worth an entry (a message that fails once more and waits again is
    the same fact as before); counts, never addresses.
    """
    if delivery.status == DELIVERY_QUEUED:
        return
    user = db.get(User, delivery.sent_by_id) if delivery.sent_by_id is not None else None
    record_change(
        AuditRepository(db),
        user,
        entity_type=AuditEntityType.REPORT_DELIVERY,
        entity_id=delivery.id,
        entity_label=xml_legal(label)[:200],
        action=AuditAction.ATUALIZADO,
        changes={
            "status": {"before": DELIVERY_QUEUED, "after": delivery.status},
            "tentativas": {"before": before_attempts, "after": delivery.attempts},
        },
        project_id=delivery.project_id,
    )


def process_due_deliveries(
    session_factory: Callable[[], Session], now: datetime | None = None, limit: int = 3
) -> int:
    """Run the attempts that are due, a few at a time, each in a session of its own.

    ``limit`` bounds one tick (a message carries its attachment in memory); what is left is
    picked up by the next one. Returns how many attempts were made. A message that raises
    something unexpected is logged and does not stop the others: its lease runs out and the
    queue tries it again.
    """
    moment = now or datetime.now(UTC)
    with _session(session_factory) as db:
        due = ReportDeliveryRepository(db).due_ids(moment, limit)
    made = 0
    for delivery_id in due:
        with _session(session_factory) as db:
            try:
                result = attempt_queued_delivery(db, delivery_id, moment)
            except Exception:  # noqa: BLE001 - one bad message must not stop the queue
                logger.exception("Fila de e-mail: falha inesperada no envio %s", delivery_id)
                db.rollback()
                continue
        if result != "nao_devido":
            made += 1
            logger.info("Fila de e-mail: envio %s, resultado %s", delivery_id, result)
    return made


@contextmanager
def _session(session_factory: Callable[[], Session]) -> Iterator[Session]:
    db = session_factory()
    try:
        yield db
    finally:
        db.close()
