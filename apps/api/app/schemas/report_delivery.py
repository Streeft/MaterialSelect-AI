"""Contracts for e-mailing an issued laudo (D-242).

The request is permissive on purpose: the rules a person can break — a bad
address, too many recipients, a subject with a line break — are checked by
``app.domain.email_address`` and answered in Portuguese with the offending value,
which Pydantic's own 422 would not do. What the schema does cap is size, so a
hostile body cannot make the server read megabytes before the rules run.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class LaudoSendRequest(BaseModel):
    recipients: list[str] = Field(default_factory=list, max_length=50)
    #: "Cópia" — optional, same address rules.
    cc: list[str] = Field(default_factory=list, max_length=50)
    #: Blank or absent: the default subject (study and version).
    subject: str | None = Field(default=None, max_length=2000)
    message: str | None = Field(default=None, max_length=20000)
    #: D-249: the client's reply goes to the e-mail of the account that sends (the engineer), via
    #: ``Reply-To``. ``False`` leaves it to the server's ``EMAIL_REPLY_TO``, or to the sender.
    reply_to_engineer: bool = True


class LaudoEmailPreviewOut(BaseModel):
    """The message as it would be sent, for the dialog's preview."""

    subject: str
    html: str
    text: str
    attachment_name: str
    #: ``True`` when the attachment is the signed PDF (D-243) rather than the frozen ``.html``.
    signed_pdf: bool = False
    #: Until when the link would work if sent now (``REPORT_LINK_TTL_DAYS``).
    link_expires_at: datetime | None = None
    #: ``mock`` or ``smtp``: the preview says whether anything would really leave.
    provider: str
    email_configured: bool
    #: Where a reply would go (the sending account's e-mail), or ``None`` when it is switched off.
    reply_to: str | None = None


class ReportDeliveryOut(BaseModel):
    id: int
    issued_report_id: int
    recipients: list[str]
    cc: list[str]
    subject: str
    message: str | None = None
    #: ``enviado``, ``simulado`` (the mock provider: nothing left) or ``falhou``.
    status: Literal["enviado", "simulado", "falhou"]
    provider: str
    error: str | None = None
    created_at: datetime
    #: The account's e-mail that pressed "Enviar", when the account still exists.
    sent_by: str | None = None
    #: The link's life (D-243): when it stops opening the laudo (the configured days after
    #: the send), and its state in one word. ``sem_link`` is a failed send: no link left.
    expires_at: datetime | None = None
    link_state: Literal["ativo", "vencido", "revogado", "sem_link"] = "ativo"
    revoked_at: datetime | None = None
    #: How many times the link opened the laudo, and the first and last time. No address.
    open_count: int = 0
    first_opened_at: datetime | None = None
    last_opened_at: datetime | None = None
    #: SHA-256 of the signed PDF that went attached, when the message carried one.
    attached_pdf_sha256: str | None = None
