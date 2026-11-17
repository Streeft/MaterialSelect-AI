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

Insert and read only (the service never updates a row after it is written):
the history is a record, not a state.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

#: The three ways a delivery can end. ``simulado`` is the ``mock`` provider:
#: nothing left the server, and the screen says so instead of "enviado".
DELIVERY_SENT = "enviado"
DELIVERY_SIMULATED = "simulado"
DELIVERY_FAILED = "falhou"


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
    #: ``enviado`` | ``simulado`` | ``falhou``.
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
