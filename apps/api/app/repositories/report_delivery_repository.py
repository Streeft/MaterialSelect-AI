"""Data access for laudo deliveries (D-242, D-243, D-252).

A delivery is written once. The only updates are the state of its link — a revocation and
the opening counters (D-243), each by one statement that cannot lose a concurrent opening —
and, for a send that failed for a passing reason, the queue's own bookkeeping (D-252): the
attempts, the next attempt and how it ended. ``claim_due`` is the one statement that decides
which worker owns an attempt.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.models.issued_report import IssuedReport
from app.models.report_delivery import DELIVERY_FAILED, DELIVERY_QUEUED, ReportDelivery


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
            ReportDelivery.token_hash == token_hash,
            ReportDelivery.status.notin_((DELIVERY_FAILED, DELIVERY_QUEUED)),
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

    # --- The retry queue (D-252) ---------------------------------------------

    def due_ids(self, now: datetime, limit: int) -> list[int]:
        """The queued deliveries whose next attempt is due, the longest-waiting first."""
        stmt = (
            select(ReportDelivery.id)
            .where(
                ReportDelivery.status == DELIVERY_QUEUED,
                ReportDelivery.next_attempt_at.is_not(None),
                ReportDelivery.next_attempt_at <= now,
            )
            .order_by(ReportDelivery.next_attempt_at, ReportDelivery.id)
            .limit(limit)
        )
        return list(self.db.execute(stmt).scalars().all())

    def claim_due(self, delivery_id: int, now: datetime, lease_until: datetime) -> bool:
        """Take one due attempt: push its next attempt forward and say whether it is ours.

        One conditional ``UPDATE``: a second worker (or a second tick) that reads the row after
        this one finds it no longer due and gets ``False``. The pushed-forward time is a lease:
        if the process dies in the middle of the attempt, the queue tries it again when the
        lease ends instead of losing it.
        """
        result = self.db.execute(
            update(ReportDelivery)
            .where(
                ReportDelivery.id == delivery_id,
                ReportDelivery.status == DELIVERY_QUEUED,
                ReportDelivery.next_attempt_at.is_not(None),
                ReportDelivery.next_attempt_at <= now,
            )
            .values(next_attempt_at=lease_until)
            # No evaluation in Python: SQLite hands back naive times and a bulk update's
            # in-session matching would compare them with these aware ones. The row is
            # re-read after the commit instead.
            .execution_options(synchronize_session=False)
        )
        self.db.commit()
        self.db.expire_all()
        return (result.rowcount or 0) == 1

    def get(self, delivery_id: int) -> ReportDelivery | None:
        return self.db.get(ReportDelivery, delivery_id)
