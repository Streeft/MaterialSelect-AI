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


class LaudoEmailPreviewOut(BaseModel):
    """The message as it would be sent, for the dialog's preview."""

    subject: str
    html: str
    text: str
    attachment_name: str
    #: ``mock`` or ``smtp``: the preview says whether anything would really leave.
    provider: str
    email_configured: bool


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
