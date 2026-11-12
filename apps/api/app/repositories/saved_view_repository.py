"""Data access for saved views (D-209)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.saved_view import SavedView


class SavedViewRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_for(self, user_id: int, scope: str) -> list[SavedView]:
        stmt = (
            select(SavedView)
            .where(SavedView.user_id == user_id, SavedView.scope == scope)
            .order_by(SavedView.position, SavedView.id)
        )
        return list(self.db.execute(stmt).scalars().all())

    def count_for(self, user_id: int, scope: str) -> int:
        stmt = select(func.count(SavedView.id)).where(
            SavedView.user_id == user_id, SavedView.scope == scope
        )
        return int(self.db.execute(stmt).scalar_one())

    def get(self, view_id: int, user_id: int) -> SavedView | None:
        stmt = select(SavedView).where(SavedView.id == view_id, SavedView.user_id == user_id)
        return self.db.execute(stmt).scalars().one_or_none()

    def add(self, view: SavedView) -> None:
        self.db.add(view)

    def delete(self, view: SavedView) -> None:
        self.db.delete(view)

    def commit(self) -> None:
        self.db.commit()

    def refresh(self, view: SavedView) -> None:
        self.db.refresh(view)
