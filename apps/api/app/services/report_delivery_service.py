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
"""

from __future__ import annotations

import hashlib
import re
import secrets
import unicodedata
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
from app.domain.errors import NotFoundError, ServiceUnavailableError, ValidationError
from app.exporters.laudo import recommended_name, short_code
from app.exporters.laudo_email import LaudoEmail, default_subject, render_html, render_text
from app.exporters.xml_text import xml_legal
from app.models.enums import AuditAction, AuditEntityType
from app.models.issued_report import IssuedReport
from app.models.report_delivery import (
    DELIVERY_FAILED,
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
    get_email_sender,
)
from app.services.laudo_service import verify_url
from app.services.rate_limit_service import check_email_quota

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
    """``ativo`` | ``vencido`` | ``revogado``, or ``sem_link`` for a send that failed.

    Revoked wins over expired: the owner's decision is the more informative fact.
    """
    if delivery.status == DELIVERY_FAILED:
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
        # The signed PDF, when the engineer uploaded one, goes in place of the ``.html``: it is
        # the document that was signed, and sending both would leave the client wondering
        # which one counts (the HTML stays one click away, in the link).
        pdf = self.pdfs.latest(report.id)
        mail = self._email(
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
        outgoing = OutgoingEmail(
            to=tuple(to),
            cc=tuple(cc),
            subject=subject,
            text=render_text(mail),
            html=render_html(mail),
            attachments=(attachment,),
            reply_to=self._reply_to(payload),
        )

        status, error = DELIVERY_SENT, None
        try:
            sender.send(outgoing)
            if sender.provider == "mock":
                status = DELIVERY_SIMULATED
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
        payload = LaudoSendRequest(
            recipients=list(delivery.recipients),
            cc=list(delivery.cc),
            subject=delivery.subject,
            message=delivery.message,
        )
        return self.send(project_id, delivery.issued_report_id, payload, resend_of=delivery.id)

    # --- revoking ------------------------------------------------------------

    def revoke(self, project_id: int, delivery_id: int) -> ReportDeliveryOut:
        """End a client link at the owner's request. Idempotent: a second revoke changes nothing."""
        delivery = self.deliveries.get_owned(project_id, delivery_id)
        if delivery is None:
            raise NotFoundError("Envio não encontrado.")
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
