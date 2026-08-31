"""Data access for saved charts (chart configurations)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.saved_chart import SavedChart


class SavedChartRepository:
    """Queries backing saved chart persistence."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list_charts(self, project_id: int) -> list[SavedChart]:
        stmt = (
            select(SavedChart)
            .where(SavedChart.project_id == project_id)
            .order_by(SavedChart.created_at.desc(), SavedChart.id.desc())
        )
        return list(self.db.execute(stmt).scalars().all())

    def get_chart(self, chart_id: int, project_id: int) -> SavedChart | None:
        stmt = select(SavedChart).where(
            SavedChart.id == chart_id, SavedChart.project_id == project_id
        )
        return self.db.execute(stmt).scalars().one_or_none()

    def add(self, obj: object) -> None:
        self.db.add(obj)

    def delete(self, obj: object) -> None:
        self.db.delete(obj)

    def flush(self) -> None:
        self.db.flush()

    def commit(self) -> None:
        self.db.commit()
