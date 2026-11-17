"""Data access for the signed PDFs of issued laudos (D-243). Insert and read only."""

from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.issued_report_pdf import IssuedReportPdf

#: Every column but ``content``: lists and badges never pull megabytes of bytes.
_META = (
    IssuedReportPdf.id,
    IssuedReportPdf.issued_report_id,
    IssuedReportPdf.project_id,
    IssuedReportPdf.uploaded_by_email,
    IssuedReportPdf.filename,
    IssuedReportPdf.size_bytes,
    IssuedReportPdf.sha256,
    IssuedReportPdf.created_at,
)


class IssuedReportPdfRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, pdf: IssuedReportPdf) -> None:
        self.db.add(pdf)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()

    def history(self, project_id: int, issued_report_id: int):
        """Metadata of every upload of one version, newest first (no file bytes)."""
        stmt = (
            select(*_META)
            .where(
                IssuedReportPdf.project_id == project_id,
                IssuedReportPdf.issued_report_id == issued_report_id,
            )
            .order_by(IssuedReportPdf.id.desc())
        )
        return list(self.db.execute(stmt).all())

    def history_for_many(self, project_id: int, issued_report_ids: Iterable[int]):
        """Metadata of the uploads of several versions at once, newest first."""
        ids = list(issued_report_ids)
        if not ids:
            return []
        stmt = (
            select(*_META)
            .where(
                IssuedReportPdf.project_id == project_id,
                IssuedReportPdf.issued_report_id.in_(ids),
            )
            .order_by(IssuedReportPdf.id.desc())
        )
        return list(self.db.execute(stmt).all())

    def latest_meta(self, issued_report_id: int):
        """The current PDF's metadata for any version (public reads: no project filter)."""
        stmt = (
            select(*_META)
            .where(IssuedReportPdf.issued_report_id == issued_report_id)
            .order_by(IssuedReportPdf.id.desc())
            .limit(1)
        )
        return self.db.execute(stmt).first()

    def latest(self, issued_report_id: int) -> IssuedReportPdf | None:
        """The current PDF with its bytes: the newest upload of the version."""
        stmt = (
            select(IssuedReportPdf)
            .where(IssuedReportPdf.issued_report_id == issued_report_id)
            .order_by(IssuedReportPdf.id.desc())
            .limit(1)
        )
        return self.db.execute(stmt).scalars().first()

    def get_owned(self, project_id: int, issued_report_id: int, pdf_id: int):
        stmt = select(IssuedReportPdf).where(
            IssuedReportPdf.project_id == project_id,
            IssuedReportPdf.issued_report_id == issued_report_id,
            IssuedReportPdf.id == pdf_id,
        )
        return self.db.execute(stmt).scalars().one_or_none()
