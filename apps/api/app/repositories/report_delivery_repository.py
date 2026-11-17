"""Data access for laudo deliveries (D-242, D-243).

A delivery is written once. The only updates are the state of its link: a revocation and
the opening counters (D-243), each by one statement that cannot lose a concurrent opening.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select, update
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

    def get_owned(self, project_id: int, delivery_id: int) -> ReportDelivery | None:
        stmt = select(ReportDelivery).where(
            ReportDelivery.project_id == project_id, ReportDelivery.id == delivery_id
        )
        return self.db.execute(stmt).scalars().one_or_none()

    def find_by_token_hash(self, token_hash: str) -> ReportDelivery | None:
        """The delivery a public link belongs to (a failed delivery has no link)."""
        stmt = select(ReportDelivery).where(
            ReportDelivery.token_hash == token_hash, ReportDelivery.status != DELIVERY_FAILED
        )
        return self.db.execute(stmt).scalars().one_or_none()

    def report_of(self, delivery: ReportDelivery) -> IssuedReport | None:
        return self.db.get(IssuedReport, delivery.issued_report_id)

    def record_open(self, delivery_id: int, when: datetime) -> None:
        """One more opening: count and last time up, first time set once, in one statement."""
        self.db.execute(
            update(ReportDelivery)
            .where(ReportDelivery.id == delivery_id)
            .values(
                open_count=ReportDelivery.open_count + 1,
                last_opened_at=when,
                first_opened_at=func.coalesce(ReportDelivery.first_opened_at, when),
            )
        )
