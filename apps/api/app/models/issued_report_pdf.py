"""IssuedReportPdf: the PDF an engineer signed, attached to an issued version (D-243).

The issued laudo is frozen HTML with a code; the engineer prints it to PDF and signs
that PDF (by hand, gov.br or a certificate). This table keeps the signed file **beside**
the version, never inside it: the frozen HTML and the ``content_sha256`` that identifies
it are not touched, and the verification page only says that a signed PDF exists and
shows *its* SHA-256.

Insert and read only. A replacement is a new row; the current PDF of a version is its
newest row and every earlier one stays in the history, so a PDF that was e-mailed to a
client can always be found again. No service method deletes a row; they go away only
with the version they belong to (``CASCADE``).
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class IssuedReportPdf(Base):
    __tablename__ = "issued_report_pdf"

    id: Mapped[int] = mapped_column(primary_key=True)
    issued_report_id: Mapped[int] = mapped_column(
        ForeignKey("issued_report.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: The owner's project, copied so the file is scoped like the laudo itself.
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: The account that uploaded it, and its e-mail as it was then.
    uploaded_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True
    )
    uploaded_by_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    #: The name the engineer's file had, cleaned (never used as a path).
    filename: Mapped[str] = mapped_column(String(200), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    #: SHA-256 of the file's bytes (hex): what the verification page shows.
    sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
