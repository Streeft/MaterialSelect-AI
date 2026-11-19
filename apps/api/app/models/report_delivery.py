"""ReportDelivery: one e-mailing of an issued laudo to a client (D-242).

Every time an engineer sends a laudo, one row says **what** went (the issued
version), **to whom**, **when**, **by whom** and **how it ended** — including the
attempts that failed and the ones the ``mock`` provider only simulated, because
"I sent it" is a claim the engineer may need to back up later.

``token_hash`` is the SHA-256 of the unguessable token in the link the e-mail
carries to the read-only copy of the frozen laudo. The token itself is never
stored: the link lives in the e-mail the client received, and a leaked database
must not hand out the laudos. One token per delivery, so each link is traceable
to the message that carried it.

The row is a record first: what was sent, to whom and how it ended is written once
and never edited. D-243 added the *state of the link* to it — its validity
(``expires_at``), its revocation (``revoked_at``/``revoked_by_id``) and how many times
it was opened (``first_opened_at``, ``last_opened_at``, ``open_count``) — and those
columns are the only ones that ever change. The opening counters hold no address of
the visitor and nothing that identifies them: a count and two times.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

#: The ways a delivery can stand. ``simulado`` is the ``mock`` provider: nothing left the
#: server, and the screen says so instead of "enviado". ``na_fila`` (D-252) is a send that
#: failed for a passing reason and is waiting for its next attempt; it ends as one of the
#: other three.
DELIVERY_SENT = "enviado"
DELIVERY_SIMULATED = "simulado"
DELIVERY_FAILED = "falhou"
DELIVERY_QUEUED = "na_fila"


def _utcnow() -> datetime:
    return datetime.now(UTC)


class ReportDelivery(Base):
    __tablename__ = "report_delivery"

    id: Mapped[int] = mapped_column(primary_key=True)
    issued_report_id: Mapped[int] = mapped_column(
        ForeignKey("issued_report.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: The owner's project, copied so the history is scoped like the laudo itself.
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: The account that pressed "Enviar" (the row outlives the account).
    sent_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: The same account's e-mail as it was then, so "por quem" survives a deleted account.
    sent_by_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    recipients: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    cc: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: ``enviado`` | ``simulado`` | ``falhou`` | ``na_fila``.
    status: Mapped[str] = mapped_column(String(12), nullable=False)
    #: The provider that handled it (``mock`` or ``smtp``).
    provider: Mapped[str] = mapped_column(String(12), nullable=False)
    #: A short Portuguese reason when it failed; never a driver message.
    error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    #: SHA-256 of the public-link token (hex). Unique: it is the lookup key.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
    #: When the public link stops opening the laudo. ``NULL`` only on a row written
    #: before D-243: it then counts as ``created_at`` plus the configured days.
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    #: Set when the owner revokes the link; the link answers 410 from then on.
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: First and last time the link opened the laudo, and how many times (never an
    #: address, never a user agent: D-243's privacy choice).
    first_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    open_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    #: SHA-256 of the signed PDF that went attached in this message, when there was
    #: one (the e-mail then carried the PDF instead of the ``.html``).
    attached_pdf_sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    #: How many times the server tried to hand this message to the mail server (D-252): 1 for a
    #: send that went or failed at once, up to ``EMAIL_RETRY_MAX_ATTEMPTS`` for one that waited
    #: in the queue.
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    #: When the queue tries this message next. ``NULL`` unless ``status`` is ``na_fila``.
    next_attempt_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True
    )
    #: The ``Reply-To`` this message was asked to carry (the sending account's address, or
    #: ``NULL``), kept so a retry writes the same header the first attempt would have.
    reply_to: Mapped[str | None] = mapped_column(String(320), nullable=True)
