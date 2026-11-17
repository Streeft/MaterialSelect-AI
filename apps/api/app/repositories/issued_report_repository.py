"""Data access for issued laudos (D-241). Insert and read only — never update."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.issued_report import IssuedReport


class IssuedReportRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def next_version(self, project_id: int, study_id: int) -> int:
        stmt = select(func.max(IssuedReport.version)).where(
            IssuedReport.project_id == project_id, IssuedReport.study_id == study_id
        )
        current = self.db.execute(stmt).scalar_one_or_none()
        return int(current or 0) + 1

    def list_for_study(self, project_id: int, study_id: int) -> list[IssuedReport]:
        stmt = (
            select(IssuedReport)
            .where(IssuedReport.project_id == project_id, IssuedReport.study_id == study_id)
            .order_by(IssuedReport.version.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_version(self, project_id: int, study_id: int, version: int) -> IssuedReport | None:
        stmt = select(IssuedReport).where(
            IssuedReport.project_id == project_id,
            IssuedReport.study_id == study_id,
            IssuedReport.version == version,
        )
        return self.db.execute(stmt).scalars().one_or_none()

    def get_owned(self, project_id: int, issued_id: int) -> IssuedReport | None:
        """One issued version of the caller's project, by its own id (D-242)."""
        stmt = select(IssuedReport).where(
            IssuedReport.project_id == project_id, IssuedReport.id == issued_id
        )
        return self.db.execute(stmt).scalars().one_or_none()

    def find_by_code(self, code: str) -> list[IssuedReport]:
        """Rows whose digest starts with ``code`` (lower-case hex, 12 to 64 digits)."""
        stmt = (
            select(IssuedReport)
            .where(IssuedReport.content_sha256.startswith(code, autoescape=True))
            .limit(2)
        )
        return list(self.db.execute(stmt).scalars().all())

    def add(self, report: IssuedReport) -> None:
        self.db.add(report)

    def commit(self) -> None:
        self.db.commit()
