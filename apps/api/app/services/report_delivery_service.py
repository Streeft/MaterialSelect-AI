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
"""

from __future__ import annotations

import hashlib
import re
import secrets
import unicodedata
from datetime import UTC, datetime

from sqlalchemy.orm import Session

from app.config import settings
from app.domain.email_address import (
    MAX_CC,
    MAX_RECIPIENTS,
    clean_addresses,
    clean_message,
    clean_subject,
)
from app.domain.errors import NotFoundError, ServiceUnavailableError
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


def attachment_filename(study_name: str, version: int) -> str:
    """``laudo-<study>-v2.html``, ASCII, so every mail client shows it the same."""
    folded = unicodedata.normalize("NFKD", study_name).encode("ascii", "ignore").decode()
    stem = re.sub(r"[^A-Za-z0-9]+", "-", folded).strip("-").lower()[:60] or "estudo"
    return f"laudo-{stem}-v{version}.html"


class ReportDeliveryService:
    def __init__(self, db: Session, user: User) -> None:
        self.db = db
        self.user = user
        self.issued = IssuedReportRepository(db)
        self.deliveries = ReportDeliveryRepository(db)
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
    def out(delivery: ReportDelivery) -> ReportDeliveryOut:
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
            created_at=delivery.created_at,
            sent_by=delivery.sent_by_email,
        )

    # --- the message ---------------------------------------------------------

    @staticmethod
    def _email(report: IssuedReport, message: str | None, link: str | None) -> LaudoEmail:
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
            attachment_name=attachment_filename(report.study_name, report.version),
        )

    def preview(
        self, project_id: int, issued_id: int, payload: LaudoSendRequest
    ) -> LaudoEmailPreviewOut:
        """What would go out, without a token, a row or a send."""
        report = self._owned(project_id, issued_id)
        mail = self._email(report, clean_message(payload.message), None)
        subject = clean_subject(payload.subject) or default_subject(
            report.study_name, report.version
        )
        return LaudoEmailPreviewOut(
            subject=subject,
            html=render_html(mail),
            text=render_text(mail),
            attachment_name=mail.attachment_name,
            provider=settings.email_provider_name,
            email_configured=settings.email_configured,
        )

    # --- sending -------------------------------------------------------------

    def send(self, project_id: int, issued_id: int, payload: LaudoSendRequest) -> ReportDeliveryOut:
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
        mail = self._email(report, message, public_url(token))
        outgoing = OutgoingEmail(
            to=tuple(to),
            cc=tuple(cc),
            subject=subject,
            text=render_text(mail),
            html=render_html(mail),
            attachments=(
                EmailAttachment(filename=mail.attachment_name, content=report.html.encode("utf-8")),
            ),
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
            created_at=datetime.now(UTC),
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
            },
            project_id=project_id,
        )
        self.deliveries.commit()
        if status == DELIVERY_FAILED:
            raise ServiceUnavailableError(error or "Não foi possível enviar o e-mail.")
        return self.out(delivery)


def public_report(db: Session, token: str) -> IssuedReport:
    """The frozen laudo a link opens. Unknown, malformed or failed-delivery: the same 404."""
    report = (
        ReportDeliveryRepository(db).find_report_by_token_hash(token_hash(token))
        if 20 <= len(token) <= 80
        else None
    )
    if report is None:
        raise NotFoundError("Este link não existe ou não está mais disponível.")
    return report
