"""IssuedReport: one frozen version of a study's engineering report (D-241).

Issuing a laudo turns a preview — which re-runs the study against today's
catalogue — into a document that **never changes again**: the rendered HTML and
the inputs it was rendered from are stored here, and every later read returns
those bytes, whatever happens to the catalogue, the study or the code that drew
it. That is what lets an engineer sign the PDF and a client verify, months
later, that the paper in hand is the one that was issued (``content_sha256``).

There is no update path, on purpose: no service method writes an existing row.
A correction is a new version, with the next number.

The row outlives its study (``study_id`` is ``SET NULL``): a client holding a
signed document must still be able to verify it after the author tidies up
their saved studies. ``study_name`` is copied for that reason.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _utcnow() -> datetime:
    return datetime.now(UTC)


class IssuedReport(Base):
    __tablename__ = "issued_report"
    __table_args__ = (
        UniqueConstraint("project_id", "study_id", "version", name="uq_issued_report_version"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(
        ForeignKey("project.id", ondelete="CASCADE"), nullable=False, index=True
    )
    study_id: Mapped[int | None] = mapped_column(
        ForeignKey("selection_study.id", ondelete="SET NULL"), nullable=True, index=True
    )
    #: Who pressed "Emitir" — the account, not the engineer named on the page.
    issued_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True
    )
    study_name: Mapped[str] = mapped_column(String(200), nullable=False)
    #: 1, 2, 3… per study, in issue order.
    version: Mapped[int] = mapped_column(Integer, nullable=False)

    engineer_name: Mapped[str] = mapped_column(String(160), nullable=False)
    engineer_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    engineer_registration: Mapped[str | None] = mapped_column(String(60), nullable=True)
    art_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    city: Mapped[str | None] = mapped_column(String(80), nullable=True)
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    client_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    client_project: Mapped[str | None] = mapped_column(String(160), nullable=True)

    #: Every input the document was rendered from (``LaudoInputs``), as sent.
    inputs: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    #: The frozen document, seal included.
    html: Mapped[str] = mapped_column(Text, nullable=False)
    #: SHA-256 of the document with its seal slots emptied (``laudo_digest``).
    content_sha256: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )
