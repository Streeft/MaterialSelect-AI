"""Data access for the account's appearance (D-249)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.user_appearance import UserAppearance


class UserAppearanceRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, user_id: int) -> UserAppearance | None:
        return self.db.get(UserAppearance, user_id)

    def add(self, row: UserAppearance) -> None:
        self.db.add(row)

    def commit(self) -> None:
        self.db.commit()

    def refresh(self, row: UserAppearance) -> None:
        self.db.refresh(row)
