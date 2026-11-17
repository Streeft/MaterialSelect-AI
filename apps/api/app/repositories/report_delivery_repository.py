"""Data access for laudo deliveries (D-242). Insert and read only."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.issued_report import IssuedReport
from app.models.report_delivery import DELIVERY_FAILED, ReportDelivery


class ReportDeliveryRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def add(self, delivery: ReportDelivery) -> None:
        self.db.add(delivery)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()

    def list_for_report(self, project_id: int, issued_report_id: int) -> list[ReportDelivery]:
        stmt = (
            select(ReportDelivery)
            .where(
                ReportDelivery.project_id == project_id,
                ReportDelivery.issued_report_id == issued_report_id,
            )
            .order_by(ReportDelivery.created_at.desc(), ReportDelivery.id.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def find_report_by_token_hash(self, token_hash: str) -> IssuedReport | None:
        """The frozen laudo a public link points to (a failed delivery opens nothing)."""
        stmt = (
            select(IssuedReport)
            .join(ReportDelivery, ReportDelivery.issued_report_id == IssuedReport.id)
            .where(
                ReportDelivery.token_hash == token_hash, ReportDelivery.status != DELIVERY_FAILED
            )
        )
        return self.db.execute(stmt).scalars().one_or_none()
