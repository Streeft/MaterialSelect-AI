"""Contracts for the engineering report (laudo) and its issued versions (D-241).

Everything the engineer types is **declared text, never validated against
anything** (the D-41 rule for the responsible engineer, kept): a registration
number is not checked with a council, an ART is not looked up. What the system
guarantees is narrower and checkable — that the issued document is the one that
was frozen, byte for byte, and that its code verifies.

The two numbers here (part mass and batch) are inputs to the backend's own cost
and environmental calculations, bounded the way ``/api/custo`` bounds them.
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


def _clean(value: str | None) -> str | None:
    """Trim; blank is ``None`` so an empty field never prints as a value."""
    if value is None:
        return None
    text = " ".join(value.split())
    return text or None


class LaudoInputs(BaseModel):
    """What the engineer declares about one laudo (preview and issue alike)."""

    engineer_name: str | None = Field(default=None, max_length=160)
    engineer_title: str | None = Field(default=None, max_length=120)
    engineer_registration: str | None = Field(default=None, max_length=60)
    art_number: str | None = Field(default=None, max_length=60)
    city: str | None = Field(default=None, max_length=80)
    issue_date: date | None = None
    client_name: str | None = Field(default=None, max_length=160)
    client_project: str | None = Field(default=None, max_length=160)
    #: Finished part mass, kg — turns cost and eco on. Absent: both are "não avaliado".
    part_mass_kg: float | None = Field(default=None, gt=0, le=1e6, allow_inf_nan=False)
    #: Batch, pieces — the point read off the cost curve.
    batch_size: float | None = Field(default=None, ge=1, le=1e9, allow_inf_nan=False)

    @field_validator(
        "engineer_name",
        "engineer_title",
        "engineer_registration",
        "art_number",
        "city",
        "client_name",
        "client_project",
    )
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        return _clean(value)


#: The fields an issued laudo cannot go without: who signs, under which
#: registration, where and when. The ART stays optional — not every service
#: carries one — and the document says "não informada" when it is absent.
REQUIRED_TO_ISSUE: dict[str, str] = {
    "engineer_name": "nome do engenheiro",
    "engineer_title": "título profissional",
    "engineer_registration": "CREA ou registro profissional",
    "city": "cidade de emissão",
    "issue_date": "data de emissão",
}


class SignedPdfOut(BaseModel):
    """One upload of the PDF the engineer signed (D-243): the file itself is a download."""

    id: int
    issued_report_id: int
    #: The name the engineer's file had.
    filename: str
    size_bytes: int
    #: SHA-256 of the file's bytes, and the short form shown beside the code.
    sha256: str
    short_sha256: str
    uploaded_at: datetime
    uploaded_by: str | None = None
    #: ``True`` for the newest upload of the version; the others are history.
    current: bool = False


class SignedPdfPublicOut(BaseModel):
    """What the public verification says about the signed PDF: that it exists, and its hash."""

    sha256: str
    short_sha256: str
    size_bytes: int
    uploaded_at: datetime


class IssuedReportOut(BaseModel):
    """One issued version, as its author sees it in the list."""

    id: int
    study_id: int | None
    study_name: str
    version: int
    engineer_name: str
    engineer_title: str | None = None
    engineer_registration: str | None = None
    art_number: str | None = None
    city: str | None = None
    issue_date: date | None = None
    client_name: str | None = None
    client_project: str | None = None
    #: The full SHA-256 of the frozen content, and the short form printed on it.
    content_sha256: str
    short_code: str
    verify_url: str
    issued_at: datetime
    #: The current signed PDF of this version (D-243), or ``None``; how many uploads it has had.
    signed_pdf: SignedPdfOut | None = None
    signed_pdf_count: int = 0


class IssuedReportVerificationOut(BaseModel):
    """What anyone holding the code may read: no client, no content, no inputs."""

    valid: bool = True
    study_name: str
    version: int
    issue_date: date | None = None
    issued_at: datetime
    engineer_name: str
    engineer_title: str | None = None
    engineer_registration: str | None = None
    content_sha256: str
    short_code: str
    #: Whether a signed PDF is registered for this version, and its hash (D-243). Never the file.
    signed_pdf: SignedPdfPublicOut | None = None
